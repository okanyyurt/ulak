<?php
/**
 * Ulak — Ephemeral In-Memory / File-based API Backend
 * Compatible with all standard PHP / cPanel shared hosting (PHP 7.0 - 8.3+)
 * Zero configuration required: Just upload to public_html/chat/
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Storage folder for transient sessions
$storageDir = __DIR__ . '/data/';
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0755, true);
    // Security: Block direct HTTP browser access to session files
    @file_put_contents($storageDir . '.htaccess', "Deny from all\n");
}

// Automatic garbage collection / Self-destruct cleanup routine
function cleanupExpiredSessions($storageDir) {
    $files = @glob($storageDir . 'room_*.json');
    if (!$files) return;
    $now = time();

    foreach ($files as $file) {
        $content = @file_get_contents($file);
        if (!$content) continue;
        $data = @json_decode($content, true);
        if (!$data) continue;

        // Check TTL expiration
        if (!empty($data['expiresAt']) && $now >= $data['expiresAt']) {
            @unlink($file);
            continue;
        }

        // Check burn_read expiration after trigger
        if (!empty($data['burnTriggeredAt']) && !empty($data['burnExpiresAt']) && $now >= $data['burnExpiresAt']) {
            @unlink($file);
            continue;
        }

        // Hard safety: delete any orphaned session older than 24 hours
        if (!empty($data['createdAt']) && ($now - $data['createdAt']) > 86400) {
            @unlink($file);
        }
    }
}

// Run cleanup periodically
if (rand(1, 5) === 1) {
    cleanupExpiredSessions($storageDir);
}

// Helper: Generate short 4-char alphanumeric room ID (e.g. 1a23, 123a, a123)
function generateShortRoomId() {
    $chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    $res = '';
    for ($i = 0; $i < 4; $i++) {
        $res .= $chars[rand(0, strlen($chars) - 1)];
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
    $cleanId = preg_replace('/[^a-zA-Z0-9\-_]/', '', strtolower($roomId));
    return $storageDir . 'room_' . $cleanId . '.json';
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

// Parse input
$action = isset($_GET['action']) ? $_GET['action'] : '';
$rawBody = file_get_contents('php://input');
$input = $rawBody ? @json_decode($rawBody, true) : [];

// -------------------------------------------------------------
// ACTION: CREATE ROOM
// -------------------------------------------------------------
if ($action === 'create_room' || ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($input['action']) && $input['action'] === 'create_room')) {
    $customId = !empty($input['customId']) ? trim($input['customId']) : '';
    $ttlMode = !empty($input['ttlMode']) ? $input['ttlMode'] : '1h';

    $roomId = $customId ? preg_replace('/[^a-zA-Z0-9\-_]/', '', strtolower($customId)) : generateShortRoomId();
    if (!$roomId) $roomId = generateShortRoomId();

    $filePath = getRoomFilePath($storageDir, $roomId);
    
    // If auto-generated already exists, generate another
    if (!$customId && file_exists($filePath)) {
        $roomId = generateShortRoomId() . rand(1, 9);
        $filePath = getRoomFilePath($storageDir, $roomId);
    }

    $expiresAt = computeTtlSeconds($ttlMode);

    $roomData = [
        'id' => $roomId,
        'createdAt' => time(),
        'ttlMode' => $ttlMode,
        'expiresAt' => $expiresAt,
        'burnTriggeredAt' => null,
        'burnExpiresAt' => null,
        'items' => [],
        'livePad' => '',
        'livePadChunks' => [],
        'livePadUpdatedBy' => '',
        'livePadUpdatedAt' => 0,
        'devices' => [],
        'lastModified' => microtime(true)
    ];

    saveRoom($filePath, $roomData);

    echo json_encode([
        'success' => true,
        'roomId' => $roomId,
        'ttlMode' => $ttlMode,
        'expiresAt' => $expiresAt ? ($expiresAt * 1000) : null
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: GET ROOM (POLL & PRESENCE)
// -------------------------------------------------------------
if ($action === 'get_room') {
    $roomId = isset($_GET['id']) ? trim($_GET['id']) : '';
    $deviceId = isset($_GET['dev']) ? trim($_GET['dev']) : '';
    $deviceName = isset($_GET['dev_name']) ? trim($_GET['dev_name']) : 'Cihaz';

    if (!$roomId) {
        echo json_encode(['error' => 'Oda ID belirtilmedi.']);
        exit;
    }

    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);

    if (!$room) {
        http_response_code(404);
        echo json_encode(['error' => 'Oturum bulunamadı veya süresi dolup imha edilmiş.']);
        exit;
    }

    // Check if expired
    $now = time();
    if (!empty($room['expiresAt']) && $now >= $room['expiresAt']) {
        @unlink($filePath);
        http_response_code(404);
        echo json_encode(['error' => 'Oturum süresi doldu ve imha edildi.']);
        exit;
    }

    if (!empty($room['burnExpiresAt']) && $now >= $room['burnExpiresAt']) {
        @unlink($filePath);
        http_response_code(404);
        echo json_encode(['error' => 'Okunduktan sonra imha süresi doldu.']);
        exit;
    }

    // Track active devices (Presence heartbeats within last 12 seconds)
    if (!isset($room['devices']) || !is_array($room['devices'])) {
        $room['devices'] = [];
    }

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

    saveRoom($filePath, $room);

    echo json_encode([
        'roomId' => $room['id'],
        'ttlMode' => $room['ttlMode'],
        'expiresAt' => $room['expiresAt'] ? ($room['expiresAt'] * 1000) : null,
        'burnTriggeredAt' => $room['burnTriggeredAt'],
        'deviceCount' => max(1, $activeCount),
        'items' => $room['items'],
        'livePad' => $room['livePad'],
        'livePadChunks' => $room['livePadChunks'] ?? [],
        'livePadUpdatedBy' => $room['livePadUpdatedBy'] ?? '',
        'livePadUpdatedAt' => $room['livePadUpdatedAt'] ?? 0,
        'lastModified' => $room['lastModified']
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: ADD ITEM (TEXT OR IMAGE)
// -------------------------------------------------------------
if ($action === 'add_item') {
    $roomId = !empty($input['roomId']) ? trim($input['roomId']) : '';
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

    $newItem = [
        'id' => uniqid('item_', true),
        'type' => $input['type'] ?? 'text',
        'content' => $input['content'] ?? '',
        'fileName' => $input['fileName'] ?? null,
        'fileSize' => $input['fileSize'] ?? null,
        'fileType' => $input['fileType'] ?? null,
        'senderName' => $input['senderName'] ?? 'Cihaz',
        'senderDeviceId' => $input['senderDeviceId'] ?? '',
        'createdAt' => round(microtime(true) * 1000)
    ];

    if (!isset($room['items'])) $room['items'] = [];
    array_unshift($room['items'], $newItem);

    // Limit to 100 items
    if (count($room['items']) > 100) {
        array_pop($room['items']);
    }

    saveRoom($filePath, $room);

    echo json_encode(['success' => true, 'item' => $newItem]);
    exit;
}

// -------------------------------------------------------------
// ACTION: DELETE ITEM
// -------------------------------------------------------------
if ($action === 'delete_item') {
    $roomId = !empty($input['roomId']) ? trim($input['roomId']) : '';
    $itemId = !empty($input['itemId']) ? trim($input['itemId']) : '';

    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if ($room) {
        $room['items'] = array_values(array_filter($room['items'], function($i) use ($itemId) {
            return $i['id'] !== $itemId;
        }));
        saveRoom($filePath, $room);
    }

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// ACTION: CLEAR ALL ITEMS
// -------------------------------------------------------------
if ($action === 'clear_items') {
    $roomId = !empty($input['roomId']) ? trim($input['roomId']) : '';
    $filePath = getRoomFilePath($storageDir, $roomId);
    $room = readRoom($filePath);
    if ($room) {
        $room['items'] = [];
        saveRoom($filePath, $room);
    }
    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------
// ACTION: UPDATE LIVE PAD
// -------------------------------------------------------------
if ($action === 'update_live_pad') {
    $roomId = !empty($input['roomId']) ? trim($input['roomId']) : '';
    $text = isset($input['text']) ? $input['text'] : '';
    $chunks = isset($input['chunks']) && is_array($input['chunks']) ? $input['chunks'] : null;
    $senderName = $input['senderName'] ?? 'Cihaz';
    $senderDeviceId = $input['senderDeviceId'] ?? '';

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
    $roomId = !empty($input['roomId']) ? trim($input['roomId']) : '';
    $filePath = getRoomFilePath($storageDir, $roomId);
    if (file_exists($filePath)) {
        @unlink($filePath);
    }
    echo json_encode(['success' => true, 'message' => 'Oturum tamamen imha edildi.']);
    exit;
}

// =============================================================
// ADMIN CONTROLS & API ACTIONS (Protected)
// =============================================================
define('ADMIN_USER', 'admin');
define('ADMIN_PASS', 'admin');

function verifyAdminToken($storageDir) {
    $token = '';
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (!empty($headers['Authorization']) && preg_match('/Bearer\s+(\S+)/i', $headers['Authorization'], $m)) {
        $token = $m[1];
    } elseif (!empty($headers['authorization']) && preg_match('/Bearer\s+(\S+)/i', $headers['authorization'], $m)) {
        $token = $m[1];
    } elseif (!empty($headers['x-admin-token'])) {
        $token = $headers['x-admin-token'];
    } elseif (!empty($_GET['admin_token'])) {
        $token = $_GET['admin_token'];
    } elseif (!empty($_GET['token'])) {
        $token = $_GET['token'];
    } elseif (!empty($_POST['admin_token'])) {
        $token = $_POST['admin_token'];
    }

    if (!$token) return false;

    $tokensFile = $storageDir . 'admin_tokens.json';
    if (!file_exists($tokensFile)) return false;
    $tokens = @json_decode(file_get_contents($tokensFile), true);
    if (!is_array($tokens) || !isset($tokens[$token])) return false;

    if (time() > $tokens[$token]) {
        unset($tokens[$token]);
        @file_put_contents($tokensFile, json_encode($tokens), LOCK_EX);
        return false;
    }

    return true;
}

function formatBytesPhp($bytes) {
    if (!$bytes || $bytes <= 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB'];
    $pow = floor(log($bytes, 1024));
    return round($bytes / pow(1024, $pow), 1) . ' ' . $units[$pow];
}

// ACTION: ADMIN LOGIN
if ($action === 'admin_login') {
    $user = trim($input['username'] ?? ($_POST['username'] ?? ''));
    $pass = trim($input['password'] ?? ($_POST['password'] ?? ''));
    if ($user === ADMIN_USER && $pass === ADMIN_PASS) {
        $token = bin2hex(random_bytes(24));
        $tokensFile = $storageDir . 'admin_tokens.json';
        $tokens = file_exists($tokensFile) ? @json_decode(file_get_contents($tokensFile), true) : [];
        if (!is_array($tokens)) $tokens = [];
        $tokens[$token] = time() + 86400; // 24h
        @file_put_contents($tokensFile, json_encode($tokens), LOCK_EX);

        echo json_encode([
            'success' => true,
            'token' => $token,
            'username' => ADMIN_USER,
            'expiresAt' => (time() + 86400) * 1000
        ]);
        exit;
    }
    http_response_code(401);
    echo json_encode(['error' => 'Kullanıcı adı veya şifre hatalı.']);
    exit;
}

// ACTION: ADMIN LOGOUT
if ($action === 'admin_logout') {
    $token = $_GET['admin_token'] ?? '';
    if ($token) {
        $tokensFile = $storageDir . 'admin_tokens.json';
        if (file_exists($tokensFile)) {
            $tokens = @json_decode(file_get_contents($tokensFile), true);
            if (is_array($tokens)) {
                unset($tokens[$token]);
                @file_put_contents($tokensFile, json_encode($tokens), LOCK_EX);
            }
        }
    }
    echo json_encode(['success' => true]);
    exit;
}

// ACTION: ADMIN GET ROOMS & STATS
if ($action === 'admin_rooms') {
    if (!verifyAdminToken($storageDir)) {
        http_response_code(401);
        echo json_encode(['error' => 'Yetkisiz erişim. Lütfen admin girişi yapın.']);
        exit;
    }

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
    if (!verifyAdminToken($storageDir)) {
        http_response_code(401);
        echo json_encode(['error' => 'Yetkisiz erişim.']);
        exit;
    }

    $roomId = !empty($input['roomId']) ? trim($input['roomId']) : '';
    if (!$roomId) {
        echo json_encode(['error' => 'Oda ID gerekli']);
        exit;
    }

    $filePath = getRoomFilePath($storageDir, $roomId);
    if (file_exists($filePath)) {
        @unlink($filePath);
    }
    echo json_encode(['success' => true, 'message' => "Oda ($roomId) silindi."]);
    exit;
}

// ACTION: ADMIN DESTROY BATCH
if ($action === 'admin_destroy_batch') {
    if (!verifyAdminToken($storageDir)) {
        http_response_code(401);
        echo json_encode(['error' => 'Yetkisiz erişim.']);
        exit;
    }

    $roomIds = $input['roomIds'] ?? [];
    $deleted = 0;
    if (is_array($roomIds)) {
        foreach ($roomIds as $id) {
            $filePath = getRoomFilePath($storageDir, $id);
            if (file_exists($filePath)) {
                @unlink($filePath);
                $deleted++;
            }
        }
    }
    echo json_encode(['success' => true, 'count' => $deleted, 'message' => "$deleted adet oturum silindi."]);
    exit;
}

// ACTION: ADMIN DESTROY ALL
if ($action === 'admin_destroy_all') {
    if (!verifyAdminToken($storageDir)) {
        http_response_code(401);
        echo json_encode(['error' => 'Yetkisiz erişim.']);
        exit;
    }

    $files = @glob($storageDir . 'room_*.json');
    $count = 0;
    if ($files) {
        foreach ($files as $f) {
            @unlink($f);
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
