<?php
/**
 * Ulak — Ephemeral In-Memory / File-based API Backend
 * Compatible with all standard PHP / cPanel shared hosting (PHP 7.0 - 8.3+)
 * Zero configuration required: Just upload to public_html/chat/
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$action = isset($_GET['action']) ? (string)$_GET['action'] : '';
$isAdminAction = strpos($action, 'admin_') === 0;

// Public room endpoints stay CORS-open; admin endpoints are same-origin only
if (!$isAdminAction) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Storage folder for transient sessions
$storageDir = __DIR__ . '/data/';
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0755, true);
}
// Security: Block direct HTTP browser access to session files (Apache 2.2 + 2.4 / LiteSpeed)
if (!file_exists($storageDir . '.htaccess')) {
    @file_put_contents($storageDir . '.htaccess', "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
}

// Content limits (protect disk and clients from oversized payloads)
define('MAX_TEXT_CHARS', 200000);
define('MAX_IMAGE_CHARS', 8 * 1024 * 1024);
define('MAX_LIVEPAD_CHARS', 500000);
define('MAX_LIVEPAD_CHUNKS', 5000);
define('MAX_NAME_CHARS', 40);
define('ALLOWED_TTL_MODES', 'burn_read,15m,1h,8h,24h');

// Abuse limits (per client IP)
define('ROOM_SCAN_MAX_MISSES', 60);      // unknown room lookups ...
define('ROOM_SCAN_WINDOW', 10 * 60);     // ... per 10 minutes
define('ROOM_CREATE_MAX', 30);
define('ROOM_CREATE_WINDOW', 10 * 60);
define('TRACK_MAX', 30);                     // counted page views per IP ...
define('TRACK_WINDOW', 10 * 60);             // ... per 10 minutes (extra ones are ignored)
define('REPORT_MAX', 5);                     // abuse reports per IP ...
define('REPORT_WINDOW', 60 * 60);            // ... per hour
define('MAX_ROOM_JSON_BYTES', 40 * 1024 * 1024); // texts + inline photos of one room

// =============================================================
// SECURITY HELPERS
// =============================================================

function jsonFail($status, $message, $extra = []) {
    http_response_code($status);
    echo json_encode(array_merge(['error' => $message], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function clientIp() {
    return isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : '0.0.0.0';
}

function cleanText($value, $maxLen) {
    $value = is_scalar($value) ? (string)$value : '';
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $maxLen, 'UTF-8');
    }
    return substr($value, 0, $maxLen);
}

function isSafeImageDataUrl($value) {
    return is_string($value) && preg_match('#^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$#', $value) === 1;
}

// Files holding secrets start with a PHP exit guard, so they never leak even if .htaccess is ignored
function secureFileRead($path) {
    if (!file_exists($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) return null;
    $raw = preg_replace('/^<\?php exit; \?>\n/', '', $raw);
    $data = @json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function secureFileWrite($path, $data) {
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, "<?php exit; ?>\n" . json_encode($data, JSON_UNESCAPED_UNICODE)) === false) {
        $GLOBALS['lastWriteError'] = (error_get_last()['message'] ?? 'bilinmeyen hata');
        return false;
    }
    if (!@rename($tmp, $path)) {
        // Some hosts refuse rename over an existing file
        @unlink($path);
        if (!@rename($tmp, $path)) {
            $GLOBALS['lastWriteError'] = (error_get_last()['message'] ?? 'yeniden adlandırılamadı');
            @unlink($tmp);
            return false;
        }
    }
    return true;
}

function lastWriteError() {
    $msg = isset($GLOBALS['lastWriteError']) ? (string)$GLOBALS['lastWriteError'] : '';
    // Never leak absolute server paths
    return preg_replace('#(/[^\s:]+)+/#', '', $msg);
}

// Keyed by a salted HMAC of the client IP (a plain hash of an IPv4 address is trivially reversible).
// $global = true uses one shared bucket for all clients.
function rateLimitPath($storageDir, $bucket, $global = false) {
    $key = $global ? 'global' : substr(hash_hmac('sha256', clientIp(), statsSalt($storageDir)), 0, 24);
    return $storageDir . 'rl_' . $bucket . '_' . $key . '.json';
}

function readRateLimit($storageDir, $bucket, $window, $global = false) {
    $data = @json_decode((string)@file_get_contents(rateLimitPath($storageDir, $bucket, $global)), true);
    if (!is_array($data) || (time() - $data['start']) > $window) {
        return ['start' => time(), 'count' => 0, 'last' => 0];
    }
    return $data + ['last' => 0];
}

function isRateLimited($storageDir, $bucket, $max, $window) {
    return readRateLimit($storageDir, $bucket, $window)['count'] >= $max;
}

function registerRateLimitHit($storageDir, $bucket, $window, $amount = 1, $global = false) {
    $data = readRateLimit($storageDir, $bucket, $window, $global);
    $data['count'] += $amount;
    $data['last'] = time();
    @file_put_contents(rateLimitPath($storageDir, $bucket, $global), json_encode($data), LOCK_EX);
}

function clearRateLimit($storageDir, $bucket) {
    @unlink(rateLimitPath($storageDir, $bucket));
}

// Automatic garbage collection / Self-destruct cleanup routine
function cleanupExpiredSessions($storageDir) {
    $files = @glob($storageDir . 'room_*.json') ?: [];
    $now = time();

    foreach ($files as $file) {
        $content = @file_get_contents($file);
        if (!$content) continue;
        $data = @json_decode($content, true);
        if (!$data) continue;

        // Check TTL expiration
        if (!empty($data['expiresAt']) && $now >= $data['expiresAt']) {
            removeRoomData($storageDir, $file);
            continue;
        }

        // Check burn_read expiration after trigger
        if (!empty($data['burnTriggeredAt']) && !empty($data['burnExpiresAt']) && $now >= $data['burnExpiresAt']) {
            removeRoomData($storageDir, $file);
            continue;
        }

        // Hard safety: delete any orphaned session older than 24 hours
        if (!empty($data['createdAt']) && ($now - $data['createdAt']) > 86400) {
            removeRoomData($storageDir, $file);
        }
    }

    // Shared files whose room no longer exists, and abandoned partial uploads
    $fileDirs = @glob($storageDir . 'files/*', GLOB_ONLYDIR);
    if ($fileDirs) {
        foreach ($fileDirs as $dir) {
            if (!file_exists($storageDir . 'room_' . basename($dir) . '.json')) {
                removeDirectory($dir);
            }
        }
    }
    $uploads = @glob($storageDir . 'uploads/*');
    if ($uploads) {
        foreach ($uploads as $file) {
            if (($now - (int)@filemtime($file)) > 3600) {
                @unlink($file);
            }
        }
    }

    compactStats($storageDir);
    pruneAuditAndReports($storageDir);

    // Stale rate-limit counters
    $rlFiles = @glob($storageDir . 'rl_*.json');
    if ($rlFiles) {
        foreach ($rlFiles as $file) {
            if (($now - (int)@filemtime($file)) > 86400) {
                @unlink($file);
            }
        }
    }
}

// Helper: Generate short 4-char alphanumeric room ID (e.g. 1a23, 123a, a123)
function generateShortRoomId() {
    $chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    $res = '';
    for ($i = 0; $i < 4; $i++) {
        $res .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $res;
}

// Helper: Compute expiration timestamp in seconds
function computeTtlSeconds($mode) {
    $now = time();
    switch ($mode) {
        case 'burn_read':
            return null; // Will start 60s countdown once 2nd device joins
        case '15m':
            return $now + 15 * 60;
        case '1h':
            return $now + 60 * 60;
        case '8h':
            return $now + 8 * 60 * 60;
        case '24h':
            return $now + 24 * 60 * 60;
        default:
            return $now + 60 * 60;
    }
}

function getRoomFilePath($storageDir, $roomId) {
    return $storageDir . 'room_' . cleanRoomId(is_scalar($roomId) ? $roomId : '') . '.json';
}

function readRoom($filePath) {
    if (!file_exists($filePath)) return null;
    $content = @file_get_contents($filePath);
    return $content ? @json_decode($content, true) : null;
}

function saveRoom($filePath, $data) {
    $data['lastModified'] = microtime(true);
    return @file_put_contents($filePath, json_encode($data, JSON_UNESCAPED_UNICODE));
}

function cleanRoomId($roomId) {
    return preg_replace('/[^a-zA-Z0-9\-_]/', '', strtolower((string)$roomId));
}

// Returns the room, or null when it does not exist / has expired (expired rooms are removed)
function loadActiveRoom($storageDir, $roomId) {
    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if (!$room) return null;
    $now = time();
    if ((!empty($room['expiresAt']) && $now >= $room['expiresAt']) || (!empty($room['burnExpiresAt']) && $now >= $room['burnExpiresAt'])) {
        removeRoomData($storageDir, $filePath);
        return null;
    }
    return $room;
}

// =============================================================
// SHARED FILES (PDF, Office, archives) — stored outside the room JSON
// =============================================================
define('FILE_CHUNK_SIZE', 1024 * 1024); // 1 MB chunks stay below any host's post_max_size
define('MAX_FILE_SIZE_MB_LIMIT', 500);
define('UPLOAD_INIT_MAX', 120);
define('UPLOAD_INIT_WINDOW', 10 * 60);

function fileTypeGroups() {
    return [
        'pdf' => 'PDF',
        'word' => 'Word / Metin Belgeleri',
        'excel' => 'Excel / Tablolar',
        'powerpoint' => 'PowerPoint / Sunumlar',
        'archive' => 'Arşivler (ZIP, RAR, 7Z)',
        'text' => 'Düz Metin (TXT)'
    ];
}

// Extension whitelist: group, served MIME type and accepted leading bytes (empty = text, no NUL bytes)
function fileTypeCatalog() {
    $zip = ["PK\x03\x04", "PK\x05\x06"];
    $ole = ["\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"];
    return [
        'pdf'  => ['group' => 'pdf', 'mime' => 'application/pdf', 'magic' => ['%PDF-']],
        'doc'  => ['group' => 'word', 'mime' => 'application/msword', 'magic' => $ole],
        'docx' => ['group' => 'word', 'mime' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'magic' => $zip],
        'odt'  => ['group' => 'word', 'mime' => 'application/vnd.oasis.opendocument.text', 'magic' => $zip],
        'rtf'  => ['group' => 'word', 'mime' => 'application/rtf', 'magic' => ['{\\rtf']],
        'xls'  => ['group' => 'excel', 'mime' => 'application/vnd.ms-excel', 'magic' => $ole],
        'xlsx' => ['group' => 'excel', 'mime' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'magic' => $zip],
        'ods'  => ['group' => 'excel', 'mime' => 'application/vnd.oasis.opendocument.spreadsheet', 'magic' => $zip],
        'csv'  => ['group' => 'excel', 'mime' => 'text/csv', 'magic' => []],
        'ppt'  => ['group' => 'powerpoint', 'mime' => 'application/vnd.ms-powerpoint', 'magic' => $ole],
        'pptx' => ['group' => 'powerpoint', 'mime' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'magic' => $zip],
        'odp'  => ['group' => 'powerpoint', 'mime' => 'application/vnd.oasis.opendocument.presentation', 'magic' => $zip],
        'zip'  => ['group' => 'archive', 'mime' => 'application/zip', 'magic' => $zip],
        'rar'  => ['group' => 'archive', 'mime' => 'application/vnd.rar', 'magic' => ["Rar!\x1A\x07"]],
        '7z'   => ['group' => 'archive', 'mime' => 'application/x-7z-compressed', 'magic' => ["7z\xBC\xAF\x27\x1C"]],
        'txt'  => ['group' => 'text', 'mime' => 'text/plain', 'magic' => []]
    ];
}

function fileMagicMatches($ext, $firstBytes) {
    $catalog = fileTypeCatalog();
    if (!isset($catalog[$ext])) return false;
    $magics = $catalog[$ext]['magic'];
    if (!$magics) {
        return strpos($firstBytes, "\0") === false;
    }
    foreach ($magics as $magic) {
        if (strncmp($firstBytes, $magic, strlen($magic)) === 0) return true;
    }
    return false;
}

function defaultAppSettings() {
    return [
        'maxFileSizeMB' => 25,
        'maxRoomStorageMB' => 100,
        // Archives (ZIP/RAR/7Z) are the most common malware carrier: off unless the admin enables them
        'allowedGroups' => array_values(array_diff(array_keys(fileTypeGroups()), ['archive'])),
        'maxTotalStorageMB' => 2048,
        'maxUploadMBPerHour' => 500,
        'maxDownloadsPerFile' => 50,
        'auditLogDays' => 90
    ];
}

function normalizeAppSettings($raw) {
    $defaults = defaultAppSettings();
    $raw = is_array($raw) ? $raw : [];
    $int = function ($key, $min, $max) use ($raw, $defaults) {
        $value = isset($raw[$key]) && is_numeric($raw[$key]) ? (int)$raw[$key] : $defaults[$key];
        return max($min, min($max, $value));
    };
    $maxFile = $int('maxFileSizeMB', 1, MAX_FILE_SIZE_MB_LIMIT);
    $maxRoom = max($maxFile, $int('maxRoomStorageMB', 1, MAX_FILE_SIZE_MB_LIMIT * 4));
    $groups = isset($raw['allowedGroups']) && is_array($raw['allowedGroups']) ? $raw['allowedGroups'] : $defaults['allowedGroups'];
    $groups = array_values(array_intersect(array_keys(fileTypeGroups()), $groups));
    return [
        'maxFileSizeMB' => $maxFile,
        'maxRoomStorageMB' => $maxRoom,
        'allowedGroups' => $groups,
        'maxTotalStorageMB' => max($maxRoom, $int('maxTotalStorageMB', 1, 102400)),
        'maxUploadMBPerHour' => $int('maxUploadMBPerHour', 1, 10240),
        'maxDownloadsPerFile' => $int('maxDownloadsPerFile', 0, 100000),
        'auditLogDays' => $int('auditLogDays', 0, 730)
    ];
}

function loadAppSettings($storageDir) {
    return normalizeAppSettings(secureFileRead($storageDir . 'app_settings.php'));
}

function allowedExtensions($settings) {
    $exts = [];
    foreach (fileTypeCatalog() as $ext => $info) {
        if (in_array($info['group'], $settings['allowedGroups'], true)) $exts[] = $ext;
    }
    return $exts;
}

function publicFileSettings($settings) {
    $exts = allowedExtensions($settings);
    return [
        'enabled' => count($exts) > 0,
        'maxFileSizeMB' => $settings['maxFileSizeMB'],
        'maxFileSizeBytes' => $settings['maxFileSizeMB'] * 1024 * 1024,
        'maxRoomStorageMB' => $settings['maxRoomStorageMB'],
        'chunkSize' => FILE_CHUNK_SIZE,
        'allowedExtensions' => $exts,
        'auditLogDays' => $settings['auditLogDays']
    ];
}

function sanitizeFileName($name) {
    $name = basename(str_replace('\\', '/', (string)$name));
    $name = preg_replace('/[\x00-\x1F\x7F"<>:|?*\/\\\\]/u', '', $name);
    $name = trim($name, " .");
    if ($name === '') $name = 'dosya';
    return cleanText($name, 150);
}

function roomFilesDir($storageDir, $roomId) {
    return $storageDir . 'files/' . cleanRoomId($roomId) . '/';
}

function roomFilesBytes($room) {
    $total = 0;
    foreach (($room['items'] ?? []) as $item) {
        if (($item['type'] ?? '') === 'file') $total += (int)($item['fileSize'] ?? 0);
    }
    return $total;
}

function removeDirectory($dir) {
    $entries = @glob(rtrim($dir, '/') . '/*');
    if ($entries) {
        foreach ($entries as $entry) {
            is_dir($entry) ? removeDirectory($entry) : @unlink($entry);
        }
    }
    @rmdir($dir);
}

function deleteItemFile($storageDir, $roomId, $item) {
    if (($item['type'] ?? '') === 'file' && !empty($item['fileId']) && preg_match('/^[a-f0-9]{32}$/', $item['fileId'])) {
        @unlink(roomFilesDir($storageDir, $roomId) . $item['fileId']);
    }
}

// Deletes a room JSON file together with every file shared in it
function removeRoomData($storageDir, $roomFilePath) {
    @unlink($roomFilePath);
    if (preg_match('/room_([a-z0-9\-_]+)\.json$/', $roomFilePath, $m)) {
        removeDirectory(roomFilesDir($storageDir, $m[1]));
    }
}

function uploadMetaPath($storageDir, $uploadId) {
    return $storageDir . 'uploads/' . $uploadId . '.json';
}

function uploadPartPath($storageDir, $uploadId) {
    return $storageDir . 'uploads/' . $uploadId . '.part';
}

function discardUpload($storageDir, $uploadId) {
    @unlink(uploadMetaPath($storageDir, $uploadId));
    @unlink(uploadPartPath($storageDir, $uploadId));
}

// =============================================================
// DAILY STATISTICS (simple, privacy-friendly analytics)
// One JSON file per day in data/stats/. Visitors are counted via a salted,
// day-scoped hash, so the same person cannot be followed across days.
// =============================================================
define('STATS_TIMEZONE', 'Europe/Istanbul');
define('STATS_RETENTION_DAYS', 400);
define('STATS_MAX_HASHES', 20000);    // per day, keeps the stats file under ~0.5 MB
define('STATS_FLUSH_INTERVAL', 60);   // seconds between per-room traffic flushes

function statsNow() {
    return new DateTime('now', new DateTimeZone(STATS_TIMEZONE));
}

function statsSalt($storageDir) {
    $path = $storageDir . 'stats_salt.php';
    $data = secureFileRead($path);
    if (!$data || empty($data['salt'])) {
        $data = ['salt' => bin2hex(random_bytes(16))];
        secureFileWrite($path, $data);
    }
    return $data['salt'];
}

function emptyDayStats($date) {
    return [
        'date' => $date,
        'pageViews' => 0,
        'visitorCount' => 0,
        'activeRooms' => 0,
        'roomsCreated' => 0,
        'shares' => ['text' => 0, 'image' => 0, 'file' => 0],
        'downloads' => 0,
        'bytesIn' => 0,
        'bytesOut' => 0,
        'platforms' => ['mobile' => 0, 'desktop' => 0],
        'hours' => array_fill(0, 24, 0),
        'visitors' => [],
        'rooms' => []
    ];
}

function requestPlatform() {
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string)$_SERVER['HTTP_USER_AGENT'] : '';
    return preg_match('/Mobi|Android|iPhone|iPad|iPod/i', $ua) ? 'mobile' : 'desktop';
}

// $event keys (all optional): pageView, visitor, room, roomCreated, share, download, bytesIn, bytesOut
function recordStats($storageDir, $event) {
    $now = statsNow();
    $date = $now->format('Y-m-d');
    $dir = $storageDir . 'stats/';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);

    $fp = @fopen($dir . $date . '.json', 'c+');
    if (!$fp) return;
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $day = $raw ? @json_decode($raw, true) : null;
    $day = array_replace(emptyDayStats($date), is_array($day) ? $day : []);

    if (!empty($event['pageView'])) {
        $day['pageViews']++;
        $day['hours'][(int)$now->format('G')]++;
    }
    // The hash sets are capped so the file (rewritten on every event) can never be inflated;
    // past the cap new visitors/rooms are still counted, just without de-duplication.
    if (!empty($event['visitor'])) {
        $hash = substr(hash('sha256', statsSalt($storageDir) . '|' . $date . '|' . $event['visitor']), 0, 16);
        if (!isset($day['visitors'][$hash])) {
            if (count($day['visitors']) < STATS_MAX_HASHES) {
                $day['visitors'][$hash] = 1;
            } else {
                $day['approximate'] = true;
            }
            $day['visitorCount']++;
            $day['platforms'][requestPlatform()]++;
        }
    }
    if (!empty($event['room'])) {
        $hash = substr(hash('sha256', statsSalt($storageDir) . '|room|' . $event['room']), 0, 12);
        if (!isset($day['rooms'][$hash])) {
            if (count($day['rooms']) < STATS_MAX_HASHES) $day['rooms'][$hash] = 1;
            $day['activeRooms']++;
        }
    }
    if (!empty($event['roomCreated'])) $day['roomsCreated']++;
    if (!empty($event['share']) && isset($day['shares'][$event['share']])) $day['shares'][$event['share']]++;
    if (!empty($event['download'])) $day['downloads']++;
    $day['bytesIn'] += (int)($event['bytesIn'] ?? 0);
    $day['bytesOut'] += (int)($event['bytesOut'] ?? 0);

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($day));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

// Past days only need the counters: drop the per-visitor hashes and enforce retention
function compactStats($storageDir) {
    $files = @glob($storageDir . 'stats/*.json');
    if (!$files) return;
    $today = statsNow()->format('Y-m-d');
    // Run at most once per day
    $marker = $storageDir . 'stats/.compacted';
    if (@file_get_contents($marker) === $today) return;
    @file_put_contents($marker, $today);
    $oldest = statsNow()->modify('-' . STATS_RETENTION_DAYS . ' days')->format('Y-m-d');
    foreach ($files as $file) {
        $date = basename($file, '.json');
        if ($date < $oldest) {
            @unlink($file);
            continue;
        }
        if ($date === $today) continue;
        $day = @json_decode((string)@file_get_contents($file), true);
        if (is_array($day) && (!empty($day['visitors']) || !empty($day['rooms']))) {
            $day['visitors'] = [];
            $day['rooms'] = [];
            @file_put_contents($file, json_encode($day), LOCK_EX);
        }
    }
}

// =============================================================
// STORAGE QUOTA (whole data/ footprint, incl. space promised to running uploads)
// =============================================================
function dirSizeBytes($dir) {
    $total = 0;
    if (!is_dir($dir)) return 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        if ($file->isFile()) $total += $file->getSize();
    }
    return $total;
}

function storageUsageBytes($storageDir) {
    $cacheFile = $storageDir . 'usage_cache.json';
    $cache = @json_decode((string)@file_get_contents($cacheFile), true);
    if (is_array($cache) && (time() - $cache['at']) < 60) return (int)$cache['bytes'];

    $bytes = 0;
    foreach ((@glob($storageDir . 'room_*.json') ?: []) as $f) $bytes += (int)@filesize($f);
    $bytes += dirSizeBytes($storageDir . 'files');
    foreach ((@glob($storageDir . 'uploads/*.json') ?: []) as $f) {
        $meta = @json_decode((string)@file_get_contents($f), true);
        // A started upload counts with its full declared size
        if (is_array($meta)) $bytes += (int)$meta['size'];
    }
    @file_put_contents($cacheFile, json_encode(['at' => time(), 'bytes' => $bytes]), LOCK_EX);
    return $bytes;
}

function addStorageUsage($storageDir, $bytes) {
    $cacheFile = $storageDir . 'usage_cache.json';
    $cache = @json_decode((string)@file_get_contents($cacheFile), true);
    if (!is_array($cache)) return;
    $cache['bytes'] = (int)$cache['bytes'] + $bytes;
    @file_put_contents($cacheFile, json_encode($cache), LOCK_EX);
}

// Exits with 507/429 when the server-wide quota or this client's hourly upload volume would be exceeded
function requireUploadCapacity($storageDir, $settings, $bytes) {
    if (storageUsageBytes($storageDir) + $bytes > $settings['maxTotalStorageMB'] * 1024 * 1024) {
        jsonFail(507, 'Sunucunun paylaşım alanı şu an dolu. Lütfen daha sonra tekrar deneyin.');
    }
    $limit = $settings['maxUploadMBPerHour'] * 1024 * 1024;
    if (readRateLimit($storageDir, 'upbytes', 3600)['count'] + $bytes > $limit) {
        jsonFail(429, 'Saatlik yükleme sınırına (' . $settings['maxUploadMBPerHour'] . ' MB) ulaştınız. Lütfen biraz sonra tekrar deneyin.');
    }
    registerRateLimitHit($storageDir, 'upbytes', 3600, $bytes);
    addStorageUsage($storageDir, $bytes);
}

// =============================================================
// AUDIT LOG (who created/uploaded what, for abuse handling and legal requests)
// One line per event in data/audit/YYYY-MM-DD.log; contents are never stored, only a SHA-256.
// =============================================================
function auditLog($storageDir, $event, $fields, $settings = null) {
    $settings = $settings ?: loadAppSettings($storageDir);
    if ($settings['auditLogDays'] <= 0) return;
    $dir = $storageDir . 'audit/';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $entry = array_merge([
        't' => time(),
        'event' => $event,
        'ip' => clientIp(),
        'ua' => cleanText($_SERVER['HTTP_USER_AGENT'] ?? '', 200)
    ], $fields);
    @file_put_contents($dir . statsNow()->format('Y-m-d') . '.log', json_encode($entry, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
}

function reportsDir($storageDir) {
    return $storageDir . 'reports/';
}

// Daily: drop audit logs past their retention, and reports older than 180 days
function pruneAuditAndReports($storageDir) {
    $marker = $storageDir . 'audit_pruned.txt';
    $today = statsNow()->format('Y-m-d');
    if (@file_get_contents($marker) === $today) return;
    @file_put_contents($marker, $today);

    $days = loadAppSettings($storageDir)['auditLogDays'];
    $oldest = statsNow()->modify('-' . max(0, $days) . ' days')->format('Y-m-d');
    foreach ((@glob($storageDir . 'audit/*.log') ?: []) as $file) {
        if ($days <= 0 || basename($file, '.log') < $oldest) @unlink($file);
    }
    foreach ((@glob(reportsDir($storageDir) . '*.json') ?: []) as $file) {
        if ((time() - (int)@filemtime($file)) > 180 * 86400) @unlink($file);
    }
}

function readUploadMeta($storageDir) {
    $uploadId = isset($_GET['uploadId']) ? (string)$_GET['uploadId'] : '';
    if (!preg_match('/^[a-f0-9]{32}$/', $uploadId)) {
        jsonFail(400, 'Geçersiz yükleme kimliği.');
    }
    $meta = @json_decode((string)@file_get_contents(uploadMetaPath($storageDir, $uploadId)), true);
    if (!is_array($meta)) {
        jsonFail(404, 'Yükleme bulunamadı veya süresi doldu.');
    }
    $meta['id'] = $uploadId;
    return $meta;
}

// Run cleanup periodically (must stay below every define() it relies on)
if (random_int(1, 5) === 1) {
    cleanupExpiredSessions($storageDir);
}

// Parse input
$rawBody = file_get_contents('php://input');
$input = $rawBody ? @json_decode($rawBody, true) : [];
if (!is_array($input)) $input = [];

// -------------------------------------------------------------
// ACTION: CREATE ROOM
// -------------------------------------------------------------
if ($action === 'create_room' || ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($input['action']) && $input['action'] === 'create_room')) {
    if (isRateLimited($storageDir, 'create', ROOM_CREATE_MAX, ROOM_CREATE_WINDOW)) {
        jsonFail(429, 'Çok fazla oda oluşturuldu. Lütfen biraz sonra tekrar deneyin.');
    }
    if (empty($input['acceptTerms'])) {
        jsonFail(400, 'Oda açmak için kullanım koşullarını kabul etmelisiniz.', ['termsRequired' => true]);
    }
    registerRateLimitHit($storageDir, 'create', ROOM_CREATE_WINDOW);

    $customId = !empty($input['customId']) ? substr(trim((string)$input['customId']), 0, 32) : '';
    $ttlMode = !empty($input['ttlMode']) ? (string)$input['ttlMode'] : '1h';
    if (!in_array($ttlMode, explode(',', ALLOWED_TTL_MODES), true)) $ttlMode = '1h';

    $roomId = $customId ? preg_replace('/[^a-zA-Z0-9\-_]/', '', strtolower($customId)) : generateShortRoomId();
    if (!$roomId) $roomId = generateShortRoomId();

    $filePath = getRoomFilePath($storageDir, $roomId);

    if (file_exists($filePath)) {
        // Never overwrite a live room: that would wipe someone else's session
        if ($customId) {
            jsonFail(409, 'Bu oda kodu zaten kullanımda. Lütfen başka bir kod seçin.');
        }
        $attempts = 0;
        do {
            $roomId = generateShortRoomId() . ($attempts > 5 ? random_int(1, 9) : '');
            $filePath = getRoomFilePath($storageDir, $roomId);
            $attempts++;
        } while (file_exists($filePath) && $attempts < 20);
    }

    $expiresAt = computeTtlSeconds($ttlMode);
    // Only the creating device can destroy the room; the server keeps just a hash of its token
    $ownerToken = bin2hex(random_bytes(16));

    $roomData = [
        'id' => $roomId,
        'ownerHash' => hash('sha256', $ownerToken),
        'createdAt' => time(),
        'ttlMode' => $ttlMode,
        'expiresAt' => $expiresAt,
        'burnTriggeredAt' => null,
        'burnExpiresAt' => null,
        'items' => [],
        'itemsModified' => microtime(true),
        'livePad' => '',
        'livePadChunks' => [],
        'livePadUpdatedBy' => '',
        'livePadUpdatedAt' => 0,
        'devices' => [],
        'lastModified' => microtime(true)
    ];

    saveRoom($filePath, $roomData);
    recordStats($storageDir, ['roomCreated' => true]);
    auditLog($storageDir, 'room_create', ['room' => $roomId, 'ttl' => $ttlMode]);

    echo json_encode([
        'success' => true,
        'roomId' => $roomId,
        'ownerToken' => $ownerToken,
        'ttlMode' => $ttlMode,
        'expiresAt' => $expiresAt ? ($expiresAt * 1000) : null
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: ROOM INFO (lightweight existence check for the mobile app:
// no items in the response and no presence, so burn-on-read is not triggered)
// -------------------------------------------------------------
if ($action === 'room_info') {
    if (isRateLimited($storageDir, 'scan', ROOM_SCAN_MAX_MISSES, ROOM_SCAN_WINDOW)) {
        jsonFail(429, 'Çok fazla geçersiz oda denemesi. Lütfen birkaç dakika sonra tekrar deneyin.');
    }
    $roomId = cleanRoomId(isset($_GET['id']) ? (string)$_GET['id'] : '');
    $room = $roomId ? loadActiveRoom($storageDir, $roomId) : null;
    if (!$room) {
        registerRateLimitHit($storageDir, 'scan', ROOM_SCAN_WINDOW);
        jsonFail(404, 'Kanal bulunamadı veya süresi dolmuş.', ['exists' => false]);
    }
    echo json_encode([
        'exists' => true,
        'roomId' => $room['id'],
        'ttlMode' => $room['ttlMode'],
        'expiresAt' => !empty($room['expiresAt']) ? $room['expiresAt'] * 1000 : null,
        'itemCount' => count($room['items'] ?? []),
        'files' => publicFileSettings(loadAppSettings($storageDir))
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------
// ACTION: GET ROOM (POLL & PRESENCE)
// -------------------------------------------------------------
if ($action === 'get_room') {
    $roomId = isset($_GET['id']) ? trim((string)$_GET['id']) : '';
    $deviceId = isset($_GET['dev']) ? substr(preg_replace('/[^a-zA-Z0-9\-_]/', '', (string)$_GET['dev']), 0, 64) : '';
    $deviceName = isset($_GET['dev_name']) ? cleanText(trim((string)$_GET['dev_name']), MAX_NAME_CHARS) : 'Cihaz';

    if (!$roomId) {
        echo json_encode(['error' => 'Oda ID belirtilmedi.']);
        exit;
    }

    // Short room codes are guessable: throttle clients that probe many unknown codes
    if (isRateLimited($storageDir, 'scan', ROOM_SCAN_MAX_MISSES, ROOM_SCAN_WINDOW)) {
        jsonFail(429, 'Çok fazla geçersiz oda denemesi. Lütfen birkaç dakika sonra tekrar deneyin.');
    }

    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);

    if (!$room) {
        registerRateLimitHit($storageDir, 'scan', ROOM_SCAN_WINDOW);
        http_response_code(404);
        echo json_encode(['error' => 'Oturum bulunamadı veya süresi dolup imha edilmiş.']);
        exit;
    }

    // Check if expired
    $now = time();
    if (!empty($room['expiresAt']) && $now >= $room['expiresAt']) {
        removeRoomData($storageDir, $filePath);
        http_response_code(404);
        echo json_encode(['error' => 'Oturum süresi doldu ve imha edildi.']);
        exit;
    }

    if (!empty($room['burnExpiresAt']) && $now >= $room['burnExpiresAt']) {
        removeRoomData($storageDir, $filePath);
        http_response_code(404);
        echo json_encode(['error' => 'Okunduktan sonra imha süresi doldu.']);
        exit;
    }

    // Track active devices (Presence heartbeats within last 12 seconds)
    if (!isset($room['devices']) || !is_array($room['devices'])) {
        $room['devices'] = [];
    }

    $isNewPresence = $deviceId && !isset($room['devices'][$deviceId]);
    if ($deviceId) {
        $room['devices'][$deviceId] = [
            'name' => $deviceName,
            'lastSeen' => $now
        ];
    }

    // Clean inactive devices
    $activeCount = 0;
    foreach ($room['devices'] as $dId => $devInfo) {
        if (($now - $devInfo['lastSeen']) <= 12) {
            $activeCount++;
        } else {
            unset($room['devices'][$dId]);
        }
    }

    // Handle "burn on read" mode: if 2nd device joins, trigger 60s self-destruct countdown
    if ($room['ttlMode'] === 'burn_read' && empty($room['burnTriggeredAt']) && $activeCount >= 2) {
        $room['burnTriggeredAt'] = $now;
        $room['burnExpiresAt'] = $now + 60;
        $room['expiresAt'] = $room['burnExpiresAt'];
    }

    $response = json_encode([
        'roomId' => $room['id'],
        'ttlMode' => $room['ttlMode'],
        'ownerProtected' => !empty($room['ownerHash']),
        'expiresAt' => $room['expiresAt'] ? ($room['expiresAt'] * 1000) : null,
        'burnTriggeredAt' => $room['burnTriggeredAt'],
        'deviceCount' => max(1, $activeCount),
        'items' => $room['items'],
        'itemsModified' => $room['itemsModified'] ?? 0,
        'livePad' => $room['livePad'],
        'livePadChunks' => $room['livePadChunks'] ?? [],
        'livePadUpdatedBy' => $room['livePadUpdatedBy'] ?? '',
        'livePadUpdatedAt' => $room['livePadUpdatedAt'] ?? 0,
        'lastModified' => $room['lastModified']
    ]);
    // Polls arrive every 1.5 s per device: write statistics only when a device appears
    // or once a minute per room, instead of on every poll
    $pendingOut = (int)($room['statsPendingOut'] ?? 0) + strlen($response);
    if ($isNewPresence || ($now - (int)($room['statsFlushedAt'] ?? 0)) >= STATS_FLUSH_INTERVAL) {
        recordStats($storageDir, ['visitor' => $isNewPresence ? $deviceId : '', 'room' => $room['id'], 'bytesOut' => $pendingOut]);
        $room['statsPendingOut'] = 0;
        $room['statsFlushedAt'] = $now;
    } else {
        $room['statsPendingOut'] = $pendingOut;
    }
    saveRoom($filePath, $room);

    echo $response;
    exit;
}

// -------------------------------------------------------------
// ACTION: ADD ITEM (TEXT OR IMAGE)
// -------------------------------------------------------------
if ($action === 'add_item') {
    $roomId = !empty($input['roomId']) ? trim((string)$input['roomId']) : '';
    if (!$roomId) {
        echo json_encode(['error' => 'Oda ID gerekli']);
        exit;
    }

    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if (!$room) {
        http_response_code(404);
        echo json_encode(['error' => 'Oda bulunamadı']);
        exit;
    }

    $type = ($input['type'] ?? 'text') === 'image' ? 'image' : 'text';
    $content = isset($input['content']) && is_string($input['content']) ? $input['content'] : '';

    if ($content === '') {
        jsonFail(400, 'İçerik boş olamaz.');
    }
    if ($type === 'image' && (strlen($content) > MAX_IMAGE_CHARS || !isSafeImageDataUrl($content))) {
        jsonFail(400, 'Geçersiz veya çok büyük görsel.');
    }
    if ($type === 'text' && strlen($content) > MAX_TEXT_CHARS) {
        jsonFail(400, 'Metin çok uzun.');
    }
    if ((int)@filesize($filePath) + strlen($content) > MAX_ROOM_JSON_BYTES) {
        jsonFail(413, 'Bu oda dolu. Eski öğeleri silip tekrar deneyin.');
    }
    $settings = loadAppSettings($storageDir);
    requireUploadCapacity($storageDir, $settings, strlen($content));

    $newItem = [
        'id' => 'item_' . bin2hex(random_bytes(12)),
        'type' => $type,
        'content' => $content,
        'fileName' => isset($input['fileName']) ? cleanText($input['fileName'], 200) : null,
        'fileSize' => isset($input['fileSize']) ? max(0, (int)$input['fileSize']) : null,
        'fileType' => isset($input['fileType']) ? cleanText($input['fileType'], 60) : null,
        'senderName' => cleanText($input['senderName'] ?? 'Cihaz', MAX_NAME_CHARS),
        'senderDeviceId' => substr(preg_replace('/[^a-zA-Z0-9\-_]/', '', (string)($input['senderDeviceId'] ?? '')), 0, 64),
        'createdAt' => round(microtime(true) * 1000)
    ];

    if (!isset($room['items'])) $room['items'] = [];
    array_unshift($room['items'], $newItem);

    // Limit to 100 items
    if (count($room['items']) > 100) {
        deleteItemFile($storageDir, $roomId, array_pop($room['items']));
    }

    $room['itemsModified'] = microtime(true);
    saveRoom($filePath, $room);
    recordStats($storageDir, ['share' => $type, 'bytesIn' => strlen($content)]);
    auditLog($storageDir, 'item_add', ['room' => $room['id'], 'type' => $type, 'size' => strlen($content), 'sha256' => hash('sha256', $content)], $settings);

    echo json_encode(['success' => true, 'item' => $newItem]);
    exit;
}

// -------------------------------------------------------------
// ACTION: DELETE ITEM
// -------------------------------------------------------------
if ($action === 'delete_item') {
    $roomId = !empty($input['roomId']) ? trim((string)$input['roomId']) : '';
    $itemId = !empty($input['itemId']) ? trim((string)$input['itemId']) : '';

    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if ($room) {
        foreach ($room['items'] as $i) {
            if ($i['id'] === $itemId) deleteItemFile($storageDir, $roomId, $i);
        }
        $room['items'] = array_values(array_filter($room['items'], function($i) use ($itemId) {
            return $i['id'] !== $itemId;
        }));
        $room['itemsModified'] = microtime(true);
        saveRoom($filePath, $room);
    }

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// ACTION: CLEAR ALL ITEMS
// -------------------------------------------------------------
if ($action === 'clear_items') {
    $roomId = !empty($input['roomId']) ? trim((string)$input['roomId']) : '';
    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if ($room) {
        $room['items'] = [];
        $room['itemsModified'] = microtime(true);
        removeDirectory(roomFilesDir($storageDir, $roomId));
        saveRoom($filePath, $room);
    }
    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// ACTION: UPDATE LIVE PAD
// -------------------------------------------------------------
if ($action === 'update_live_pad') {
    $roomId = !empty($input['roomId']) ? trim((string)$input['roomId']) : '';
    $text = isset($input['text']) && is_string($input['text']) ? $input['text'] : '';
    $chunks = isset($input['chunks']) && is_array($input['chunks']) ? $input['chunks'] : null;
    $senderName = cleanText($input['senderName'] ?? 'Cihaz', MAX_NAME_CHARS);

    if (strlen($text) > MAX_LIVEPAD_CHARS * 4) {
        jsonFail(400, 'Canlı not çok uzun.');
    }

    // Only keep the known chunk shape; color ends up in a CSS class name on clients
    if ($chunks !== null) {
        $chunks = array_slice($chunks, 0, MAX_LIVEPAD_CHUNKS);
        $cleanChunks = [];
        foreach ($chunks as $c) {
            if (!is_array($c) || !isset($c['t']) || !is_string($c['t'])) continue;
            $color = isset($c['color']) ? (string)$c['color'] : '';
            $cleanChunks[] = [
                't' => $c['t'],
                'dev' => substr(preg_replace('/[^a-zA-Z0-9\-_]/', '', (string)($c['dev'] ?? '')), 0, 64),
                'name' => cleanText($c['name'] ?? 'Cihaz', MAX_NAME_CHARS),
                'color' => preg_match('/^[a-z]{1,20}$/', $color) ? $color : 'cyan'
            ];
        }
        $chunks = $cleanChunks;
    }

    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if ($room) {
        $room['livePad'] = $text;
        if ($chunks !== null) {
            $room['livePadChunks'] = $chunks;
        }
        $room['livePadUpdatedBy'] = $senderName;
        $room['livePadUpdatedAt'] = microtime(true);
        saveRoom($filePath, $room);
    }

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// ACTION: DESTROY ROOM IMMEDIATELY
// -------------------------------------------------------------
if ($action === 'destroy_room') {
    requirePost();
    $roomId = !empty($input['roomId']) ? trim((string)$input['roomId']) : '';
    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if ($room) {
        $token = isset($input['ownerToken']) ? (string)$input['ownerToken'] : '';
        if (!empty($room['ownerHash']) && !hash_equals($room['ownerHash'], hash('sha256', $token))) {
            jsonFail(403, 'Bu odayı yalnızca açan cihaz imha edebilir.');
        }
        removeRoomData($storageDir, $filePath);
        auditLog($storageDir, 'room_destroy', ['room' => $room['id'], 'by' => 'owner']);
    }
    echo json_encode(['success' => true, 'message' => 'Oturum tamamen imha edildi.']);
    exit;
}

// -------------------------------------------------------------
// ACTION: REPORT ABUSE (anyone in a room can flag it for the admin)
// -------------------------------------------------------------
if ($action === 'report') {
    requirePost();
    if (isRateLimited($storageDir, 'report', REPORT_MAX, REPORT_WINDOW)) {
        jsonFail(429, 'Çok fazla bildirim gönderdiniz. Lütfen daha sonra tekrar deneyin.');
    }
    $reasons = ['illegal', 'malware', 'harassment', 'copyright', 'other'];
    $reason = in_array($input['reason'] ?? '', $reasons, true) ? $input['reason'] : 'other';
    $room = loadActiveRoom($storageDir, cleanRoomId(is_scalar($input['roomId'] ?? '') ? $input['roomId'] : ''));
    if (!$room) {
        jsonFail(404, 'Oda bulunamadı veya süresi dolmuş.');
    }
    registerRateLimitHit($storageDir, 'report', REPORT_WINDOW);

    $settings = loadAppSettings($storageDir);
    $id = bin2hex(random_bytes(8));
    $report = [
        'id' => $id,
        'roomId' => $room['id'],
        'reason' => $reason,
        'details' => cleanText(trim((string)($input['details'] ?? '')), 500),
        'createdAt' => time(),
        'roomExpiresAt' => $room['expiresAt'] ?? null,
        'itemCount' => count($room['items'] ?? []),
        'reporterIp' => $settings['auditLogDays'] > 0 ? clientIp() : null,
        'status' => 'open'
    ];
    if (!is_dir(reportsDir($storageDir))) @mkdir(reportsDir($storageDir), 0755, true);
    if (@file_put_contents(reportsDir($storageDir) . $id . '.json', json_encode($report, JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
        jsonFail(500, 'Bildirim kaydedilemedi.');
    }
    auditLog($storageDir, 'report', ['room' => $room['id'], 'reason' => $reason, 'report' => $id], $settings);

    echo json_encode(['success' => true, 'message' => 'Bildiriminiz yöneticiye iletildi. Teşekkürler.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------
// ACTION: TRACK PAGE VIEW (anonymous daily statistics)
// -------------------------------------------------------------
if ($action === 'track') {
    requirePost();
    // Over the cap the request still "succeeds" but is not counted
    if (isRateLimited($storageDir, 'track', TRACK_MAX, TRACK_WINDOW)) {
        echo json_encode(['success' => true]);
        exit;
    }
    registerRateLimitHit($storageDir, 'track', TRACK_WINDOW);
    $visitorId = substr(preg_replace('/[^a-zA-Z0-9\-_]/', '', (string)($input['visitorId'] ?? '')), 0, 64);
    if ($visitorId === '') {
        $visitorId = 'ip:' . clientIp() . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '');
    }
    recordStats($storageDir, ['pageView' => true, 'visitor' => $visitorId]);
    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// ACTION: PUBLIC SETTINGS (file limits shown to clients)
// -------------------------------------------------------------
if ($action === 'get_settings') {
    echo json_encode(['success' => true, 'files' => publicFileSettings(loadAppSettings($storageDir))], JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------
// FILE UPLOAD (chunked): upload_init -> upload_chunk (xN) -> upload_complete
// -------------------------------------------------------------
if ($action === 'upload_init') {
    requirePost();
    if (isRateLimited($storageDir, 'upload', UPLOAD_INIT_MAX, UPLOAD_INIT_WINDOW)) {
        jsonFail(429, 'Çok fazla dosya yüklemesi. Lütfen biraz sonra tekrar deneyin.');
    }
    registerRateLimitHit($storageDir, 'upload', UPLOAD_INIT_WINDOW);

    $settings = loadAppSettings($storageDir);
    $roomId = cleanRoomId(is_scalar($input['roomId'] ?? '') ? ($input['roomId'] ?? '') : '');
    $room = $roomId ? loadActiveRoom($storageDir, $roomId) : null;
    if (!$room) {
        jsonFail(404, 'Oda bulunamadı veya süresi dolmuş.');
    }

    $fileName = sanitizeFileName($input['fileName'] ?? '');
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    if (!in_array($ext, allowedExtensions($settings), true)) {
        jsonFail(415, 'Bu dosya türüne izin verilmiyor. İzin verilenler: ' . implode(', ', allowedExtensions($settings)));
    }

    $size = isset($input['fileSize']) ? (int)$input['fileSize'] : 0;
    $maxBytes = $settings['maxFileSizeMB'] * 1024 * 1024;
    if ($size <= 0) {
        jsonFail(400, 'Boş dosya gönderilemez.');
    }
    if ($size > $maxBytes) {
        jsonFail(413, 'Dosya çok büyük. En fazla ' . $settings['maxFileSizeMB'] . ' MB yüklenebilir.');
    }
    if (roomFilesBytes($room) + $size > $settings['maxRoomStorageMB'] * 1024 * 1024) {
        jsonFail(413, 'Bu odanın dosya kotası (' . $settings['maxRoomStorageMB'] . ' MB) doldu. Eski dosyaları silip tekrar deneyin.');
    }
    requireUploadCapacity($storageDir, $settings, $size);

    if (!is_dir($storageDir . 'uploads')) @mkdir($storageDir . 'uploads', 0755, true);
    $uploadId = bin2hex(random_bytes(16));
    $meta = [
        'roomId' => $roomId,
        'fileName' => $fileName,
        'ext' => $ext,
        'size' => $size,
        'received' => 0,
        'createdAt' => time()
    ];
    if (@file_put_contents(uploadMetaPath($storageDir, $uploadId), json_encode($meta, JSON_UNESCAPED_UNICODE), LOCK_EX) === false
        || @file_put_contents(uploadPartPath($storageDir, $uploadId), '') === false) {
        jsonFail(500, 'Sunucu dosyayı kaydedemedi. data/ klasörünün yazma iznini kontrol edin.');
    }

    echo json_encode(['success' => true, 'uploadId' => $uploadId, 'chunkSize' => FILE_CHUNK_SIZE]);
    exit;
}

if ($action === 'upload_chunk') {
    requirePost();
    $meta = readUploadMeta($storageDir);
    $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : -1;
    $len = strlen($rawBody);

    if ($len === 0 || $len > FILE_CHUNK_SIZE) {
        jsonFail(400, 'Geçersiz parça boyutu.');
    }
    if ($offset !== (int)$meta['received']) {
        jsonFail(409, 'Parça sırası hatalı.', ['received' => (int)$meta['received']]);
    }
    if ($meta['received'] + $len > $meta['size']) {
        discardUpload($storageDir, $meta['id']);
        jsonFail(400, 'Dosya bildirilen boyuttan büyük.');
    }
    // Content must really be what the extension claims (blocks renamed executables, HTML, etc.)
    if ($offset === 0 && !fileMagicMatches($meta['ext'], $rawBody)) {
        discardUpload($storageDir, $meta['id']);
        jsonFail(415, 'Dosya içeriği uzantısıyla uyuşmuyor.');
    }

    if (@file_put_contents(uploadPartPath($storageDir, $meta['id']), $rawBody, FILE_APPEND | LOCK_EX) === false) {
        jsonFail(500, 'Parça kaydedilemedi.');
    }
    $uploadId = $meta['id'];
    unset($meta['id']);
    $meta['received'] += $len;
    @file_put_contents(uploadMetaPath($storageDir, $uploadId), json_encode($meta, JSON_UNESCAPED_UNICODE), LOCK_EX);

    echo json_encode(['success' => true, 'received' => $meta['received']]);
    exit;
}

if ($action === 'upload_complete') {
    requirePost();
    $meta = readUploadMeta($storageDir);
    $uploadId = $meta['id'];
    $partPath = uploadPartPath($storageDir, $uploadId);

    if ((int)$meta['received'] !== (int)$meta['size'] || (int)@filesize($partPath) !== (int)$meta['size']) {
        jsonFail(400, 'Dosya eksik yüklendi.');
    }

    $roomId = $meta['roomId'];
    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = loadActiveRoom($storageDir, $roomId);
    $settings = loadAppSettings($storageDir);
    if (!$room) {
        discardUpload($storageDir, $uploadId);
        jsonFail(404, 'Oda bulunamadı veya süresi dolmuş.');
    }
    if (roomFilesBytes($room) + $meta['size'] > $settings['maxRoomStorageMB'] * 1024 * 1024) {
        discardUpload($storageDir, $uploadId);
        jsonFail(413, 'Bu odanın dosya kotası doldu.');
    }

    $dir = roomFilesDir($storageDir, $roomId);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $fileId = bin2hex(random_bytes(16));
    if (!@rename($partPath, $dir . $fileId)) {
        discardUpload($storageDir, $uploadId);
        jsonFail(500, 'Dosya kaydedilemedi.');
    }
    @unlink(uploadMetaPath($storageDir, $uploadId));

    $catalog = fileTypeCatalog();
    $newItem = [
        'id' => 'item_' . bin2hex(random_bytes(12)),
        'type' => 'file',
        'content' => '',
        'fileId' => $fileId,
        'fileName' => $meta['fileName'],
        'fileSize' => (int)$meta['size'],
        'fileType' => $catalog[$meta['ext']]['mime'],
        'fileExt' => $meta['ext'],
        'senderName' => cleanText($input['senderName'] ?? 'Cihaz', MAX_NAME_CHARS),
        'senderDeviceId' => substr(preg_replace('/[^a-zA-Z0-9\-_]/', '', (string)($input['senderDeviceId'] ?? '')), 0, 64),
        'createdAt' => round(microtime(true) * 1000)
    ];

    if (!isset($room['items'])) $room['items'] = [];
    array_unshift($room['items'], $newItem);
    if (count($room['items']) > 100) {
        deleteItemFile($storageDir, $roomId, array_pop($room['items']));
    }
    $room['itemsModified'] = microtime(true);
    saveRoom($filePath, $room);
    recordStats($storageDir, ['share' => 'file', 'bytesIn' => (int)$meta['size']]);
    auditLog($storageDir, 'file_upload', [
        'room' => $room['id'],
        'name' => $meta['fileName'],
        'size' => (int)$meta['size'],
        'sha256' => hash_file('sha256', $dir . $fileId)
    ], $settings);

    echo json_encode(['success' => true, 'item' => $newItem], JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------
// ACTION: DOWNLOAD SHARED FILE
// -------------------------------------------------------------
if ($action === 'get_file') {
    if (isRateLimited($storageDir, 'scan', ROOM_SCAN_MAX_MISSES, ROOM_SCAN_WINDOW)) {
        jsonFail(429, 'Çok fazla geçersiz istek. Lütfen birkaç dakika sonra tekrar deneyin.');
    }
    $roomId = cleanRoomId(isset($_GET['room']) ? (string)$_GET['room'] : '');
    $fileId = isset($_GET['id']) ? (string)$_GET['id'] : '';
    $room = ($roomId && preg_match('/^[a-f0-9]{32}$/', $fileId)) ? loadActiveRoom($storageDir, $roomId) : null;

    $item = null;
    $itemIndex = null;
    foreach (($room['items'] ?? []) as $i => $candidate) {
        if (($candidate['type'] ?? '') === 'file' && ($candidate['fileId'] ?? '') === $fileId) {
            $item = $candidate;
            $itemIndex = $i;
            break;
        }
    }
    $path = $item ? roomFilesDir($storageDir, $roomId) . $fileId : '';
    if (!$item || !is_file($path)) {
        registerRateLimitHit($storageDir, 'scan', ROOM_SCAN_WINDOW);
        jsonFail(404, 'Dosya bulunamadı veya süresi dolmuş.');
    }

    // A per-file daily cap keeps rooms from being used as a public file-distribution host
    $limit = loadAppSettings($storageDir)['maxDownloadsPerFile'];
    if ($limit > 0) {
        $today = statsNow()->format('Y-m-d');
        $downloads = $item['downloads'] ?? [];
        if (($downloads['date'] ?? '') !== $today) $downloads = ['date' => $today, 'count' => 0];
        if ($downloads['count'] >= $limit) {
            jsonFail(429, 'Bu dosya bugünkü indirme sınırına (' . $limit . ') ulaştı.');
        }
        $downloads['count']++;
        $room['items'][$itemIndex]['downloads'] = $downloads;
        saveRoom(getRoomFilePath($storageDir, $roomId), $room);
    }

    $catalog = fileTypeCatalog();
    $ext = $item['fileExt'] ?? '';
    $mime = isset($catalog[$ext]) ? $catalog[$ext]['mime'] : 'application/octet-stream';
    $name = $item['fileName'] ?? ('dosya.' . $ext);
    $asciiName = preg_replace('/[^A-Za-z0-9._\-]/', '_', $name);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . rawurlencode($name));
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Cache-Control: private, no-store');
    recordStats($storageDir, ['download' => true, 'bytesOut' => filesize($path)]);
    readfile($path);
    exit;
}

// =============================================================
// ADMIN CONTROLS & API ACTIONS (Protected)
// =============================================================
// Credentials live in data/admin_config.php as a password_hash() digest.
// Until the first password change the legacy default (admin/admin) is accepted,
// but every admin endpoint except change_password is locked until it is changed.
define('ADMIN_DEFAULT_USER', 'admin');
define('ADMIN_DEFAULT_PASS', 'admin');
define('ADMIN_TOKEN_TTL', 8 * 60 * 60);
define('ADMIN_LOGIN_MAX_ATTEMPTS', 5);
define('ADMIN_LOGIN_LOCK_WINDOW', 15 * 60);

function adminConfigPath($storageDir) {
    return $storageDir . 'admin_config.php';
}

function adminTokensPath($storageDir) {
    return $storageDir . 'admin_tokens.php';
}

function loadAdminConfig($storageDir) {
    $cfg = secureFileRead(adminConfigPath($storageDir));
    if (!$cfg || empty($cfg['username']) || empty($cfg['passwordHash'])) {
        return [
            'username' => ADMIN_DEFAULT_USER,
            'passwordHash' => null,
            'mustChangePassword' => true
        ];
    }
    return $cfg;
}

function verifyAdminCredentials($cfg, $username, $password) {
    $userOk = hash_equals((string)$cfg['username'], (string)$username);
    if (empty($cfg['passwordHash'])) {
        $passOk = hash_equals(ADMIN_DEFAULT_PASS, (string)$password);
    } else {
        $passOk = password_verify((string)$password, $cfg['passwordHash']);
    }
    return $userOk && $passOk;
}

// The admin picks their own password; only an empty one is rejected
function validateNewAdminPassword($newPassword) {
    return $newPassword === '' ? 'Yeni şifre boş olamaz.' : '';
}

// Tokens are stored as SHA-256 digests, so a leaked tokens file cannot be replayed
function loadAdminTokens($storageDir) {
    $tokens = secureFileRead(adminTokensPath($storageDir));
    if (!is_array($tokens)) return [];
    $now = time();
    $changed = false;
    foreach ($tokens as $hash => $expiresAt) {
        if ($now > (int)$expiresAt) {
            unset($tokens[$hash]);
            $changed = true;
        }
    }
    if ($changed) secureFileWrite(adminTokensPath($storageDir), $tokens);
    return $tokens;
}

function issueAdminToken($storageDir) {
    $token = bin2hex(random_bytes(32));
    $tokens = loadAdminTokens($storageDir);
    $tokens[hash('sha256', $token)] = time() + ADMIN_TOKEN_TTL;
    secureFileWrite(adminTokensPath($storageDir), $tokens);
    return $token;
}

function getAdminTokenFromRequest() {
    $candidates = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''
    ];
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') $candidates[] = $value;
        }
    }
    foreach ($candidates as $header) {
        if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim((string)$header), $m)) {
            return strtolower($m[1]);
        }
    }
    // Some shared hosts strip Authorization; a custom header always passes through
    $custom = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    if (preg_match('/^[a-f0-9]{64}$/i', (string)$custom)) {
        return strtolower($custom);
    }
    return '';
}

// Exits with 401/403 unless the request carries a valid admin token. Returns the token digest.
function requireAdminSession($storageDir, $allowPendingPasswordChange = false) {
    $token = getAdminTokenFromRequest();
    if (!$token) {
        jsonFail(401, 'Yetkisiz erişim. Lütfen admin girişi yapın.');
    }
    $hash = hash('sha256', $token);
    $tokens = loadAdminTokens($storageDir);
    if (!isset($tokens[$hash])) {
        jsonFail(401, 'Oturum süresi doldu. Lütfen tekrar giriş yapın.');
    }
    if (!$allowPendingPasswordChange) {
        $cfg = loadAdminConfig($storageDir);
        if (!empty($cfg['mustChangePassword'])) {
            jsonFail(403, 'Devam etmeden önce yönetici şifresini değiştirmelisiniz.', ['mustChangePassword' => true]);
        }
    }
    return $hash;
}

function requirePost() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonFail(405, 'Bu işlem yalnızca POST ile yapılabilir.');
    }
}

function formatBytesPhp($bytes) {
    if (!$bytes || $bytes <= 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB'];
    $pow = floor(log($bytes, 1024));
    return round($bytes / pow(1024, $pow), 1) . ' ' . $units[$pow];
}

// ACTION: ADMIN LOGIN
if ($action === 'admin_login') {
    requirePost();
    if (isRateLimited($storageDir, 'login', ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCK_WINDOW)) {
        jsonFail(429, 'Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.');
    }
    // Across all IPs: after 10 failures every further attempt must wait longer (up to 60 s),
    // which caps distributed guessing at roughly one try per minute
    $globalFails = readRateLimit($storageDir, 'login_all', ADMIN_LOGIN_LOCK_WINDOW, true);
    $gap = $globalFails['count'] < 10 ? 0 : min(60, ($globalFails['count'] - 9) * 2);
    $wait = $gap - (time() - $globalFails['last']);
    if ($wait > 0) {
        jsonFail(429, 'Çok fazla hatalı giriş denemesi yapıldı. Lütfen ' . $wait . ' saniye sonra tekrar deneyin.');
    }

    $user = trim(cleanText($input['username'] ?? '', 64));
    $pass = cleanText($input['password'] ?? '', 256);
    $cfg = loadAdminConfig($storageDir);

    if (!verifyAdminCredentials($cfg, $user, $pass)) {
        registerRateLimitHit($storageDir, 'login', ADMIN_LOGIN_LOCK_WINDOW);
        registerRateLimitHit($storageDir, 'login_all', ADMIN_LOGIN_LOCK_WINDOW, 1, true);
        usleep(random_int(250000, 600000));
        jsonFail(401, 'Kullanıcı adı veya şifre hatalı.');
    }

    clearRateLimit($storageDir, 'login');
    $token = issueAdminToken($storageDir);

    echo json_encode([
        'success' => true,
        'token' => $token,
        'username' => $cfg['username'],
        'mustChangePassword' => !empty($cfg['mustChangePassword']),
        'expiresAt' => (time() + ADMIN_TOKEN_TTL) * 1000
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ACTION: ADMIN LOGOUT
if ($action === 'admin_logout') {
    requirePost();
    $token = getAdminTokenFromRequest();
    if ($token) {
        $tokens = loadAdminTokens($storageDir);
        unset($tokens[hash('sha256', $token)]);
        secureFileWrite(adminTokensPath($storageDir), $tokens);
    }
    echo json_encode(['success' => true]);
    exit;
}

// ACTION: ADMIN SESSION INFO
if ($action === 'admin_me') {
    requireAdminSession($storageDir, true);
    $cfg = loadAdminConfig($storageDir);
    echo json_encode([
        'success' => true,
        'username' => $cfg['username'],
        'mustChangePassword' => !empty($cfg['mustChangePassword']),
        'passwordUpdatedAt' => isset($cfg['updatedAt']) ? $cfg['updatedAt'] * 1000 : null
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ACTION: ADMIN CHANGE PASSWORD (and optionally username)
if ($action === 'admin_change_password') {
    requirePost();
    $currentHash = requireAdminSession($storageDir, true);

    if (isRateLimited($storageDir, 'pwchange', ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCK_WINDOW)) {
        jsonFail(429, 'Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.');
    }

    $currentPassword = cleanText($input['currentPassword'] ?? '', 256);
    $newPassword = cleanText($input['newPassword'] ?? '', 256);
    $newUsername = trim(cleanText($input['newUsername'] ?? '', 64));
    $cfg = loadAdminConfig($storageDir);

    if (!verifyAdminCredentials($cfg, $cfg['username'], $currentPassword)) {
        registerRateLimitHit($storageDir, 'pwchange', ADMIN_LOGIN_LOCK_WINDOW);
        jsonFail(403, 'Mevcut şifre hatalı.');
    }

    if ($newUsername === '') $newUsername = $cfg['username'];
    if (!preg_match('/^[a-zA-Z0-9._@\-]{1,64}$/', $newUsername)) {
        jsonFail(400, 'Kullanıcı adı yalnızca harf, rakam ve . _ @ - içerebilir.');
    }

    $policyError = validateNewAdminPassword($newPassword);
    if ($policyError) {
        jsonFail(400, $policyError);
    }

    $saved = secureFileWrite(adminConfigPath($storageDir), [
        'username' => $newUsername,
        'passwordHash' => password_hash($newPassword, PASSWORD_DEFAULT),
        'mustChangePassword' => false,
        'updatedAt' => time()
    ]);
    if (!$saved) {
        jsonFail(500, 'Şifre kaydedilemedi: ' . lastWriteError() . ' (data/ klasörünün yazma iznini kontrol edin)');
    }

    clearRateLimit($storageDir, 'pwchange');

    // Revoke every other admin session; keep only the one that made the change
    secureFileWrite(adminTokensPath($storageDir), [$currentHash => time() + ADMIN_TOKEN_TTL]);

    echo json_encode([
        'success' => true,
        'username' => $newUsername,
        'message' => 'Şifre güncellendi. Diğer tüm yönetici oturumları kapatıldı.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ACTION: ADMIN DAILY STATISTICS (?days=7..365)
if ($action === 'admin_stats') {
    requireAdminSession($storageDir);
    $days = max(1, min(365, (int)($_GET['days'] ?? 30)));

    // Load the selected period plus the same-length period before it for comparison
    $cursor = statsNow()->modify('-' . (2 * $days - 1) . ' days');
    $series = [];
    for ($i = 0; $i < 2 * $days; $i++) {
        $date = $cursor->format('Y-m-d');
        $raw = @file_get_contents($storageDir . 'stats/' . $date . '.json');
        $day = $raw ? @json_decode($raw, true) : null;
        $day = array_replace(emptyDayStats($date), is_array($day) ? $day : []);
        unset($day['visitors'], $day['rooms']);
        $series[] = $day;
        $cursor->modify('+1 day');
    }

    $sumPeriod = function ($list) {
        $t = ['pageViews' => 0, 'visitorCount' => 0, 'activeRooms' => 0, 'roomsCreated' => 0, 'shares' => 0, 'downloads' => 0, 'bytesIn' => 0, 'bytesOut' => 0];
        foreach ($list as $d) {
            foreach (['pageViews', 'visitorCount', 'activeRooms', 'roomsCreated', 'downloads', 'bytesIn', 'bytesOut'] as $k) $t[$k] += (int)$d[$k];
            $t['shares'] += array_sum($d['shares']);
        }
        return $t;
    };

    $previous = array_slice($series, 0, $days);
    $current = array_slice($series, $days);
    echo json_encode([
        'success' => true,
        'timezone' => STATS_TIMEZONE,
        'days' => $current,
        'totals' => $sumPeriod($current),
        'previousTotals' => $sumPeriod($previous)
    ]);
    exit;
}

// ACTION: ADMIN FILE SETTINGS (GET = read, POST = save)
if ($action === 'admin_settings') {
    requireAdminSession($storageDir);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $settings = normalizeAppSettings([
            'maxFileSizeMB' => $input['maxFileSizeMB'] ?? null,
            'maxRoomStorageMB' => $input['maxRoomStorageMB'] ?? null,
            'allowedGroups' => $input['allowedGroups'] ?? [],
            'maxTotalStorageMB' => $input['maxTotalStorageMB'] ?? null,
            'maxUploadMBPerHour' => $input['maxUploadMBPerHour'] ?? null,
            'maxDownloadsPerFile' => $input['maxDownloadsPerFile'] ?? null,
            'auditLogDays' => $input['auditLogDays'] ?? null
        ]);
        if (!secureFileWrite($storageDir . 'app_settings.php', $settings)) {
            jsonFail(500, 'Ayar dosyası yazılamadı. data/ klasörünün yazma iznini kontrol edin.');
        }
    } else {
        $settings = loadAppSettings($storageDir);
    }

    $groups = [];
    foreach (fileTypeGroups() as $key => $label) {
        $exts = [];
        foreach (fileTypeCatalog() as $ext => $info) {
            if ($info['group'] === $key) $exts[] = $ext;
        }
        $groups[] = ['key' => $key, 'label' => $label, 'extensions' => $exts];
    }

    $freeBytes = @disk_free_space($storageDir);
    echo json_encode([
        'success' => true,
        'settings' => $settings,
        'groups' => $groups,
        'limits' => [
            'maxFileSizeMB' => MAX_FILE_SIZE_MB_LIMIT,
            'maxRoomStorageMB' => MAX_FILE_SIZE_MB_LIMIT * 4,
            'diskFree' => $freeBytes !== false ? formatBytesPhp($freeBytes) : null,
            'used' => formatBytesPhp(storageUsageBytes($storageDir))
        ],
        'message' => $_SERVER['REQUEST_METHOD'] === 'POST' ? 'Dosya ayarları kaydedildi.' : null
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ACTION: ADMIN ABUSE REPORTS (GET = list, POST = change status)
if ($action === 'admin_reports') {
    requireAdminSession($storageDir);
    $dir = reportsDir($storageDir);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = preg_replace('/[^a-f0-9]/', '', (string)($input['id'] ?? ''));
        $status = in_array($input['status'] ?? '', ['open', 'resolved'], true) ? $input['status'] : 'resolved';
        $path = $dir . $id . '.json';
        $report = $id ? @json_decode((string)@file_get_contents($path), true) : null;
        if (!is_array($report)) jsonFail(404, 'Bildirim bulunamadı.');
        $report['status'] = $status;
        @file_put_contents($path, json_encode($report, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }

    $reports = [];
    foreach ((@glob($dir . '*.json') ?: []) as $file) {
        $r = @json_decode((string)@file_get_contents($file), true);
        if (!is_array($r)) continue;
        $r['roomActive'] = loadActiveRoom($storageDir, $r['roomId']) !== null;
        $r['createdAt'] = $r['createdAt'] * 1000;
        $reports[] = $r;
    }
    usort($reports, function ($a, $b) { return $b['createdAt'] - $a['createdAt']; });
    echo json_encode(['success' => true, 'reports' => array_slice($reports, 0, 200)], JSON_UNESCAPED_UNICODE);
    exit;
}

// ACTION: ADMIN AUDIT LOG (?date=YYYY-MM-DD&q=filter)
if ($action === 'admin_audit') {
    requireAdminSession($storageDir);
    $date = isset($_GET['date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['date']) ? $_GET['date'] : statsNow()->format('Y-m-d');
    $q = strtolower(trim(cleanText($_GET['q'] ?? '', 100)));

    $entries = [];
    $lines = @file($storageDir . 'audit/' . $date . '.log', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach (array_reverse($lines) as $line) {
        if ($q !== '' && strpos(strtolower($line), $q) === false) continue;
        $e = @json_decode($line, true);
        if (!is_array($e)) continue;
        $e['t'] = $e['t'] * 1000;
        $entries[] = $e;
        if (count($entries) >= 500) break;
    }
    $dates = array_map(function ($f) { return basename($f, '.log'); }, @glob($storageDir . 'audit/*.log') ?: []);
    rsort($dates);
    echo json_encode([
        'success' => true,
        'date' => $date,
        'entries' => $entries,
        'dates' => $dates,
        'retentionDays' => loadAppSettings($storageDir)['auditLogDays']
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ACTION: ADMIN GET ROOMS & STATS
if ($action === 'admin_rooms') {
    requireAdminSession($storageDir);

    $files = @glob($storageDir . 'room_*.json');
    $roomList = [];
    $totalSizeBytes = 0;
    $totalItems = 0;
    $totalDevices = 0;

    if ($files) {
        foreach ($files as $file) {
            $size = @filesize($file) ?: 0;
            $content = @file_get_contents($file);
            $room = $content ? @json_decode($content, true) : null;
            if (!$room) continue;

            // Shared files live outside the room JSON
            $size += roomFilesBytes($room);
            $totalSizeBytes += $size;
            $itemsCount = !empty($room['items']) ? count($room['items']) : 0;
            $totalItems += $itemsCount;
            $devCount = !empty($room['devices']) ? count($room['devices']) : 1;
            $totalDevices += $devCount;

            $deviceNames = [];
            if (!empty($room['devices']) && is_array($room['devices'])) {
                foreach ($room['devices'] as $d) {
                    $deviceNames[] = $d['name'] ?? 'Cihaz';
                }
            }

            $roomList[] = [
                'id' => $room['id'] ?? basename($file, '.json'),
                'createdAt' => isset($room['createdAt']) ? $room['createdAt'] * 1000 : filemtime($file) * 1000,
                'ttlMode' => $room['ttlMode'] ?? '1h',
                'expiresAt' => isset($room['expiresAt']) ? $room['expiresAt'] * 1000 : null,
                'burnCountdownSeconds' => $room['burnCountdownSeconds'] ?? null,
                'burnTriggeredAt' => isset($room['burnTriggeredAt']) ? $room['burnTriggeredAt'] * 1000 : null,
                'deviceCount' => $devCount,
                'deviceNames' => $deviceNames,
                'itemCount' => $itemsCount,
                'hasLivePad' => !empty(trim($room['livePad'] ?? '')),
                'livePadLength' => strlen($room['livePad'] ?? ''),
                'sizeBytes' => $size,
                'sizeFormatted' => formatBytesPhp($size)
            ];
        }
    }

    usort($roomList, function($a, $b) {
        return ($b['createdAt'] ?? 0) - ($a['createdAt'] ?? 0);
    });

    echo json_encode([
        'success' => true,
        'rooms' => $roomList,
        'stats' => [
            'totalRooms' => count($roomList),
            'totalDevices' => $totalDevices,
            'totalItems' => $totalItems,
            'totalSizeBytes' => $totalSizeBytes,
            'totalSizeFormatted' => formatBytesPhp($totalSizeBytes),
            'phpVersion' => PHP_VERSION,
            'engine' => 'php'
        ]
    ]);
    exit;
}

// ACTION: ADMIN DESTROY SINGLE ROOM
if ($action === 'admin_destroy_room') {
    requirePost();
    requireAdminSession($storageDir);

    $roomId = !empty($input['roomId']) ? trim((string)$input['roomId']) : '';
    if (!$roomId) {
        echo json_encode(['error' => 'Oda ID gerekli']);
        exit;
    }

    $filePath = getRoomFilePath($storageDir, $roomId);
    if (file_exists($filePath)) {
        removeRoomData($storageDir, $filePath);
        auditLog($storageDir, 'room_destroy', ['room' => cleanRoomId($roomId), 'by' => 'admin']);
    }
    echo json_encode(['success' => true, 'message' => "Oda ($roomId) silindi."]);
    exit;
}

// ACTION: ADMIN DESTROY BATCH
if ($action === 'admin_destroy_batch') {
    requirePost();
    requireAdminSession($storageDir);

    $roomIds = $input['roomIds'] ?? [];
    $deleted = 0;
    if (is_array($roomIds)) {
        foreach ($roomIds as $id) {
            $filePath = getRoomFilePath($storageDir, $id);
            if (file_exists($filePath)) {
                removeRoomData($storageDir, $filePath);
                $deleted++;
            }
        }
    }
    echo json_encode(['success' => true, 'count' => $deleted, 'message' => "$deleted adet oturum silindi."]);
    exit;
}

// ACTION: ADMIN DESTROY ALL
if ($action === 'admin_destroy_all') {
    requirePost();
    requireAdminSession($storageDir);

    $files = @glob($storageDir . 'room_*.json');
    $count = 0;
    if ($files) {
        foreach ($files as $f) {
            removeRoomData($storageDir, $f);
            $count++;
        }
    }
    echo json_encode(['success' => true, 'count' => $count, 'message' => "Tüm oturumlar ($count adet) silindi."]);
    exit;
}

// Default response
echo json_encode([
    'status' => 'online',
    'app' => 'Ulak Ephemeral Clipboard API',
    'version' => '1.0'
]);
