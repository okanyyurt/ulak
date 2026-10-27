const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Increase payload limit for base64 image transfers
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Intercept Socket.IO polling & websocket upgrades under /chat/socket.io BEFORE socket.io processes them
server.prependListener('request', (req, res) => {
  if (req.url && req.url.startsWith('/chat/socket.io')) {
    req.url = req.url.replace('/chat/socket.io', '/socket.io');
  }
});

server.prependListener('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/chat/socket.io')) {
    req.url = req.url.replace('/chat/socket.io', '/socket.io');
  }
});

app.disable('x-powered-by');
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.includes('/api/admin')) res.setHeader('Cache-Control', 'no-store');
  // Pages: only the site's own scripts may run (file downloads set their own sandbox policy)
  if (!req.path.includes('/api/')) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// In-Memory ephemeral storage (Zero disk footprint)
const rooms = new Map();

// Content limits
const MAX_TEXT_CHARS = 200000;
const MAX_IMAGE_CHARS = 8 * 1024 * 1024;
const MAX_LIVEPAD_CHARS = 500000;
const MAX_LIVEPAD_CHUNKS = 5000;
const MAX_NAME_CHARS = 40;
const ALLOWED_TTL_MODES = ['burn_read', '15m', '1h', '8h', '24h'];
const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function cleanText(value, maxLen) {
  return (typeof value === 'string' ? value : '').slice(0, maxLen);
}

function cleanDeviceId(value) {
  return (typeof value === 'string' ? value : '').replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64);
}

function sanitizeLivePadChunks(chunks) {
  if (!Array.isArray(chunks)) return [];
  return chunks.slice(0, MAX_LIVEPAD_CHUNKS)
    .filter(c => c && typeof c.t === 'string')
    .map(c => ({
      t: c.t,
      dev: cleanDeviceId(c.dev),
      name: cleanText(c.name || 'Cihaz', MAX_NAME_CHARS),
      // color ends up in a CSS class name on clients
      color: /^[a-z]{1,20}$/.test(c.color || '') ? c.color : 'cyan'
    }));
}

// Simple in-memory fixed-window rate limiter keyed by bucket + client IP
const rateLimits = new Map();

function isRateLimited(bucket, ip, max, windowMs) {
  const entry = rateLimits.get(`${bucket}:${ip}`);
  if (!entry || Date.now() - entry.start > windowMs) return false;
  return entry.count >= max;
}

function readRateLimit(bucket, ip, windowMs) {
  const entry = rateLimits.get(`${bucket}:${ip}`);
  if (!entry || Date.now() - entry.start > windowMs) return { start: Date.now(), count: 0, last: 0 };
  return entry;
}

function registerRateLimitHit(bucket, ip, windowMs, amount = 1) {
  const key = `${bucket}:${ip}`;
  let entry = rateLimits.get(key);
  if (!entry || Date.now() - entry.start > windowMs) {
    entry = { start: Date.now(), count: 0, last: 0 };
    rateLimits.set(key, entry);
  }
  entry.count += amount;
  entry.last = Date.now();
}

function clearRateLimit(bucket, ip) {
  rateLimits.delete(`${bucket}:${ip}`);
}

// =============================================================
// SHARED FILES (PDF, Office, archives) — kept in RAM next to the room
// =============================================================
const FILE_CHUNK_SIZE = 1024 * 1024;
const MAX_FILE_SIZE_MB_LIMIT = 500;
const UPLOAD_INIT_MAX = 120;
const UPLOAD_INIT_WINDOW_MS = 10 * 60 * 1000;
const APP_SETTINGS_FILE = path.join(__dirname, 'data', 'app_settings.json');
const pendingUploads = new Map(); // uploadId -> { roomId, fileName, ext, size, received, chunks, createdAt }

const FILE_TYPE_GROUPS = {
  pdf: 'PDF',
  word: 'Word / Metin Belgeleri',
  excel: 'Excel / Tablolar',
  powerpoint: 'PowerPoint / Sunumlar',
  archive: 'Arşivler (ZIP, RAR, 7Z)',
  text: 'Düz Metin (TXT)'
};

const MAGIC_ZIP = [Buffer.from('PK\x03\x04', 'binary'), Buffer.from('PK\x05\x06', 'binary')];
const MAGIC_OLE = [Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])];

// Extension whitelist: group, served MIME type and accepted leading bytes (empty = text, no NUL bytes)
const FILE_TYPE_CATALOG = {
  pdf: { group: 'pdf', mime: 'application/pdf', magic: [Buffer.from('%PDF-')] },
  doc: { group: 'word', mime: 'application/msword', magic: MAGIC_OLE },
  docx: { group: 'word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: MAGIC_ZIP },
  odt: { group: 'word', mime: 'application/vnd.oasis.opendocument.text', magic: MAGIC_ZIP },
  rtf: { group: 'word', mime: 'application/rtf', magic: [Buffer.from('{\\rtf')] },
  xls: { group: 'excel', mime: 'application/vnd.ms-excel', magic: MAGIC_OLE },
  xlsx: { group: 'excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: MAGIC_ZIP },
  ods: { group: 'excel', mime: 'application/vnd.oasis.opendocument.spreadsheet', magic: MAGIC_ZIP },
  csv: { group: 'excel', mime: 'text/csv', magic: [] },
  ppt: { group: 'powerpoint', mime: 'application/vnd.ms-powerpoint', magic: MAGIC_OLE },
  pptx: { group: 'powerpoint', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: MAGIC_ZIP },
  odp: { group: 'powerpoint', mime: 'application/vnd.oasis.opendocument.presentation', magic: MAGIC_ZIP },
  zip: { group: 'archive', mime: 'application/zip', magic: MAGIC_ZIP },
  rar: { group: 'archive', mime: 'application/vnd.rar', magic: [Buffer.from('Rar!\x1A\x07', 'binary')] },
  '7z': { group: 'archive', mime: 'application/x-7z-compressed', magic: [Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])] },
  txt: { group: 'text', mime: 'text/plain', magic: [] }
};

function fileMagicMatches(ext, firstBytes) {
  const info = FILE_TYPE_CATALOG[ext];
  if (!info) return false;
  if (info.magic.length === 0) return !firstBytes.includes(0);
  return info.magic.some(m => firstBytes.length >= m.length && firstBytes.subarray(0, m.length).equals(m));
}

// Archives (ZIP/RAR/7Z) are the most common malware carrier: off unless the admin enables them
const DEFAULT_GROUPS = Object.keys(FILE_TYPE_GROUPS).filter(g => g !== 'archive');

function normalizeAppSettings(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const int = (v, d, min, max) => {
    const n = parseInt(v, 10);
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : d));
  };
  const maxFileSizeMB = int(raw.maxFileSizeMB, 25, 1, MAX_FILE_SIZE_MB_LIMIT);
  const maxRoomStorageMB = Math.max(maxFileSizeMB, int(raw.maxRoomStorageMB, 100, 1, MAX_FILE_SIZE_MB_LIMIT * 4));
  const groups = Array.isArray(raw.allowedGroups) ? raw.allowedGroups : DEFAULT_GROUPS;
  return {
    maxFileSizeMB,
    maxRoomStorageMB,
    allowedGroups: Object.keys(FILE_TYPE_GROUPS).filter(g => groups.includes(g)),
    maxTotalStorageMB: Math.max(maxRoomStorageMB, int(raw.maxTotalStorageMB, 2048, 1, 102400)),
    maxUploadMBPerHour: int(raw.maxUploadMBPerHour, 500, 1, 10240),
    maxDownloadsPerFile: int(raw.maxDownloadsPerFile, 50, 0, 100000),
    auditLogDays: int(raw.auditLogDays, 90, 0, 730)
  };
}

function loadAppSettings() {
  try {
    return normalizeAppSettings(JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf8')));
  } catch (e) {
    return normalizeAppSettings(null);
  }
}

function allowedExtensions(settings) {
  return Object.keys(FILE_TYPE_CATALOG).filter(ext => settings.allowedGroups.includes(FILE_TYPE_CATALOG[ext].group));
}

function publicFileSettings(settings) {
  const exts = allowedExtensions(settings);
  return {
    enabled: exts.length > 0,
    maxFileSizeMB: settings.maxFileSizeMB,
    maxFileSizeBytes: settings.maxFileSizeMB * 1024 * 1024,
    maxRoomStorageMB: settings.maxRoomStorageMB,
    chunkSize: FILE_CHUNK_SIZE,
    allowedExtensions: exts,
    auditLogDays: settings.auditLogDays
  };
}

function sanitizeFileName(name) {
  let clean = path.basename(String(name || '').replace(/\\/g, '/'));
  clean = clean.replace(/[\x00-\x1F\x7F"<>:|?*/\\]/g, '').replace(/^[\s.]+|[\s.]+$/g, '');
  return (clean || 'dosya').slice(0, 150);
}

function roomFilesBytes(room) {
  let total = 0;
  for (const f of room.files.values()) total += f.data.length;
  return total;
}

// Drops the stored bytes when a file item leaves the room
function releaseItemFile(room, item) {
  if (item && item.type === 'file' && item.fileId) room.files.delete(item.fileId);
}

// =============================================================
// DAILY STATISTICS (simple, privacy-friendly analytics)
// One JSON file per day in data/stats/. Visitors are counted via a salted,
// day-scoped hash, so the same person cannot be followed across days.
// =============================================================
const STATS_TIMEZONE = 'Europe/Istanbul';
const STATS_RETENTION_DAYS = 400;
const STATS_DIR = path.join(__dirname, 'data', 'stats');
const statsDays = new Map(); // date -> day object (today stays cached)
let statsSaltValue = null;
let statsFlushTimer = null;

function statsDateParts(date = new Date()) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: STATS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parseInt(parts.hour, 10) % 24 };
}

function statsSalt() {
  if (statsSaltValue) return statsSaltValue;
  const saltFile = path.join(__dirname, 'data', 'stats_salt.json');
  try {
    statsSaltValue = JSON.parse(fs.readFileSync(saltFile, 'utf8')).salt;
  } catch (e) {
    statsSaltValue = crypto.randomBytes(16).toString('hex');
    try {
      fs.mkdirSync(path.dirname(saltFile), { recursive: true });
      fs.writeFileSync(saltFile, JSON.stringify({ salt: statsSaltValue }), { mode: 0o600 });
    } catch (err) {}
  }
  return statsSaltValue;
}

function emptyDayStats(date) {
  return {
    date,
    pageViews: 0,
    visitorCount: 0,
    activeRooms: 0,
    roomsCreated: 0,
    shares: { text: 0, image: 0, file: 0 },
    downloads: 0,
    bytesIn: 0,
    bytesOut: 0,
    platforms: { mobile: 0, desktop: 0 },
    hours: new Array(24).fill(0),
    visitors: [],
    rooms: []
  };
}

function loadDayStats(date) {
  if (statsDays.has(date)) return statsDays.get(date);
  let day = emptyDayStats(date);
  try {
    day = Object.assign(day, JSON.parse(fs.readFileSync(path.join(STATS_DIR, `${date}.json`), 'utf8')));
  } catch (e) {}
  return day;
}

function flushStats() {
  statsFlushTimer = null;
  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    for (const [date, day] of statsDays.entries()) {
      fs.writeFileSync(path.join(STATS_DIR, `${date}.json`), JSON.stringify({
        ...day, visitors: Array.from(day.visitorSet), rooms: Array.from(day.roomSet)
      }));
    }
  } catch (e) {}
}

function platformFromUa(ua) {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua || '') ? 'mobile' : 'desktop';
}

// event keys (all optional): pageView, visitor, platformUa, room, roomCreated, share, download, bytesIn, bytesOut
function recordStats(event) {
  const { date, hour } = statsDateParts();
  // A new day: write out and forget the previous one
  for (const key of statsDays.keys()) {
    if (key !== date) {
      flushStats();
      statsDays.delete(key);
    }
  }
  if (!statsDays.has(date)) {
    const day = loadDayStats(date);
    day.visitorSet = new Set(day.visitors || []);
    day.roomSet = new Set(day.rooms || []);
    statsDays.set(date, day);
  }
  const day = statsDays.get(date);

  if (event.pageView) {
    day.pageViews++;
    day.hours[hour]++;
  }
  if (event.visitor) {
    const hash = crypto.createHash('sha256').update(`${statsSalt()}|${date}|${event.visitor}`).digest('hex').slice(0, 16);
    if (!day.visitorSet.has(hash)) {
      // Capped so a flood of fake ids cannot grow memory/disk; past the cap counting continues without de-duplication
      if (day.visitorSet.size < STATS_MAX_HASHES) day.visitorSet.add(hash);
      else day.approximate = true;
      day.visitorCount++;
      day.platforms[platformFromUa(event.platformUa)]++;
    }
  }
  if (event.room) {
    const hash = crypto.createHash('sha256').update(`${statsSalt()}|room|${event.room}`).digest('hex').slice(0, 12);
    if (!day.roomSet.has(hash)) {
      if (day.roomSet.size < STATS_MAX_HASHES) day.roomSet.add(hash);
      day.activeRooms++;
    }
  }
  if (event.roomCreated) day.roomsCreated++;
  if (event.share && day.shares[event.share] !== undefined) day.shares[event.share]++;
  if (event.download) day.downloads++;
  day.bytesIn += event.bytesIn || 0;
  day.bytesOut += event.bytesOut || 0;

  if (!statsFlushTimer) statsFlushTimer = setTimeout(flushStats, 5000);
}

// Past days only need the counters: drop the per-visitor hashes and enforce retention
function compactStats() {
  let files = [];
  try { files = fs.readdirSync(STATS_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch (e) { return; }
  const today = statsDateParts().date;
  const oldest = statsDateParts(new Date(Date.now() - STATS_RETENTION_DAYS * 86400000)).date;
  for (const file of files) {
    const date = file.slice(0, 10);
    const full = path.join(STATS_DIR, file);
    try {
      if (date < oldest) { fs.unlinkSync(full); continue; }
      if (date === today) continue;
      const day = JSON.parse(fs.readFileSync(full, 'utf8'));
      if ((day.visitors && day.visitors.length) || (day.rooms && day.rooms.length)) {
        day.visitors = [];
        day.rooms = [];
        fs.writeFileSync(full, JSON.stringify(day));
      }
    } catch (e) {}
  }
}

function publicDayStats(date) {
  const cached = statsDays.get(date);
  const day = cached || loadDayStats(date);
  const { visitors, rooms, visitorSet, roomSet, ...counters } = day;
  return JSON.parse(JSON.stringify(counters));
}

// =============================================================
// STORAGE QUOTA, AUDIT LOG, ABUSE REPORTS
// =============================================================
const TRACK_MAX = 30;
const TRACK_WINDOW_MS = 10 * 60 * 1000;
const REPORT_MAX = 5;
const REPORT_WINDOW_MS = 60 * 60 * 1000;
const MAX_ROOM_BYTES = 40 * 1024 * 1024;
const STATS_MAX_HASHES = 20000;
const AUDIT_DIR = path.join(__dirname, 'data', 'audit');
const REPORTS_FILE = path.join(__dirname, 'data', 'reports.json');
const REPORT_REASONS = ['illegal', 'malware', 'harassment', 'copyright', 'other'];

function storageUsageBytes() {
  let bytes = 0;
  for (const room of rooms.values()) bytes += calculateRoomSize(room);
  for (const upload of pendingUploads.values()) bytes += upload.size; // promised space counts
  return bytes;
}

/** Returns an error message when the server-wide quota or this IP's hourly upload volume would be exceeded. */
function checkUploadCapacity(ip, settings, bytes) {
  if (storageUsageBytes() + bytes > settings.maxTotalStorageMB * 1024 * 1024) {
    return { status: 507, error: 'Sunucunun paylaşım alanı şu an dolu. Lütfen daha sonra tekrar deneyin.' };
  }
  if (readRateLimit('upbytes', ip, 3600 * 1000).count + bytes > settings.maxUploadMBPerHour * 1024 * 1024) {
    return { status: 429, error: `Saatlik yükleme sınırına (${settings.maxUploadMBPerHour} MB) ulaştınız. Lütfen biraz sonra tekrar deneyin.` };
  }
  registerRateLimitHit('upbytes', ip, 3600 * 1000, bytes);
  return null;
}

/** One JSON line per event in data/audit/YYYY-MM-DD.log; contents are never stored, only a SHA-256. */
function auditLog(event, ip, ua, fields, settings = loadAppSettings()) {
  if (settings.auditLogDays <= 0) return;
  const entry = { t: Math.floor(Date.now() / 1000), event, ip, ua: cleanText(ua || '', 200), ...fields };
  fs.mkdir(AUDIT_DIR, { recursive: true }, () => {
    fs.appendFile(path.join(AUDIT_DIR, `${statsDateParts().date}.log`), JSON.stringify(entry) + '\n', () => {});
  });
}

function pruneAudit() {
  const days = loadAppSettings().auditLogDays;
  const oldest = statsDateParts(new Date(Date.now() - days * 86400000)).date;
  let files = [];
  try { files = fs.readdirSync(AUDIT_DIR); } catch (e) { return; }
  for (const f of files) {
    if (days <= 0 || f.slice(0, 10) < oldest) fs.unlink(path.join(AUDIT_DIR, f), () => {});
  }
}

let reports = [];
try { reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8')); } catch (e) { reports = []; }

function saveReports() {
  const cutoff = Date.now() - 180 * 86400000;
  reports = reports.filter(r => r.createdAt > cutoff);
  fs.mkdir(path.dirname(REPORTS_FILE), { recursive: true }, () => {
    fs.writeFile(REPORTS_FILE, JSON.stringify(reports), () => {});
  });
}

const ROOM_SCAN_MAX_MISSES = 60;
const ROOM_SCAN_WINDOW_MS = 10 * 60 * 1000;
const ROOM_CREATE_MAX = 30;
const ROOM_CREATE_WINDOW_MS = 10 * 60 * 1000;

// =============================================================
// ADMIN CREDENTIALS
// Stored as a scrypt hash in data/admin_config.json (outside public/).
// Without a stored config: ADMIN_USER/ADMIN_PASS env vars are used if set,
// otherwise the legacy admin/admin default works only to set a new password.
// =============================================================
const ADMIN_DEFAULT_USER = 'admin';
const ADMIN_DEFAULT_PASS = 'admin';
const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCK_MS = 15 * 60 * 1000;
const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');
const adminTokens = new Map(); // sha256(token) -> expiresAt (timestamp)

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPasswordHash(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[3], 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(parts[2], 'hex'), expected.length, { N: Number(parts[1]), r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

function safeEqualStrings(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function loadAdminConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8'));
    if (cfg && cfg.username && cfg.passwordHash) return cfg;
  } catch (e) {
    // No stored config yet
  }
  if (process.env.ADMIN_PASS) {
    return { username: process.env.ADMIN_USER || ADMIN_DEFAULT_USER, envPassword: process.env.ADMIN_PASS, mustChangePassword: false };
  }
  return { username: ADMIN_DEFAULT_USER, passwordHash: null, mustChangePassword: true };
}

function saveAdminConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(cfg), { mode: 0o600 });
}

function verifyAdminCredentials(cfg, username, password) {
  const userOk = safeEqualStrings(cfg.username, username);
  let passOk;
  if (cfg.passwordHash) passOk = verifyPasswordHash(password, cfg.passwordHash);
  else if (cfg.envPassword) passOk = safeEqualStrings(cfg.envPassword, password);
  else passOk = safeEqualStrings(ADMIN_DEFAULT_PASS, password);
  return userOk && passOk;
}

// The admin picks their own password; only an empty one is rejected
function validateNewAdminPassword(newPassword) {
  return newPassword === '' ? 'Yeni şifre boş olamaz.' : '';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getAdminTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (match) return match[1].toLowerCase();
  const custom = String(req.headers['x-admin-token'] || '');
  return /^[a-f0-9]{64}$/i.test(custom) ? custom.toLowerCase() : '';
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function calculateRoomSize(room) {
  let bytes = 0;
  if (room.items && room.items.length) {
    for (const item of room.items) {
      if (item.content) {
        bytes += Buffer.byteLength(item.content, 'utf8');
      }
      bytes += 256;
    }
  }
  if (room.livePad) {
    bytes += Buffer.byteLength(room.livePad, 'utf8');
  }
  if (room.files) {
    bytes += roomFilesBytes(room);
  }
  if (room.livePadChunks && room.livePadChunks.length) {
    for (const c of room.livePadChunks) {
      if (c.t) bytes += Buffer.byteLength(c.t, 'utf8');
      bytes += 64;
    }
  }
  bytes += 512;
  return bytes;
}

function authenticateAdmin(req, res, allowPendingPasswordChange) {
  const token = getAdminTokenFromRequest(req);
  const tokenHash = token ? hashToken(token) : '';

  if (!tokenHash || !adminTokens.has(tokenHash)) {
    res.status(401).json({ error: 'Yetkisiz erişim. Lütfen admin girişi yapın.' });
    return null;
  }

  if (Date.now() > adminTokens.get(tokenHash)) {
    adminTokens.delete(tokenHash);
    res.status(401).json({ error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' });
    return null;
  }

  if (!allowPendingPasswordChange && loadAdminConfig().mustChangePassword) {
    res.status(403).json({ error: 'Devam etmeden önce yönetici şifresini değiştirmelisiniz.', mustChangePassword: true });
    return null;
  }

  return tokenHash;
}

function requireAdmin(req, res, next) {
  const tokenHash = authenticateAdmin(req, res, false);
  if (!tokenHash) return;
  req.adminTokenHash = tokenHash;
  next();
}

// Allowed while the default password is still active, so it can be replaced
function requireAdminPending(req, res, next) {
  const tokenHash = authenticateAdmin(req, res, true);
  if (!tokenHash) return;
  req.adminTokenHash = tokenHash;
  next();
}

// Helper: Get local network IPv4 address for seamless LAN QR scanning
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!name.toLowerCase().includes('vethernet') && !name.toLowerCase().includes('virtual')) {
          return net.address;
        }
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Generate super-short 4-char alphanumeric room ID (e.g. "1a23", "123a", "a123")
function generateShortRoomId() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let res = '';
  for (let i = 0; i < 4; i++) {
    res += chars[crypto.randomInt(chars.length)];
  }
  return res;
}

// Compute expiration timestamp based on TTL mode
function computeExpiration(ttlMode) {
  const now = Date.now();
  switch (ttlMode) {
    case 'burn_read':
      return null;
    case '15m':
      return now + 15 * 60 * 1000;
    case '1h':
      return now + 60 * 60 * 1000;
    case '8h':
      return now + 8 * 60 * 60 * 1000;
    case '24h':
      return now + 24 * 60 * 60 * 1000;
    default:
      return now + 60 * 60 * 1000;
  }
}

// Create a unified Router so the entire app can be mounted at BOTH '/' and '/chat'
const router = express.Router();

// Serve static assets from public/
router.use(express.static(path.join(__dirname, 'public')));

// API: System Info & Local IP for easy mobile discovery
router.get('/api/info', (req, res) => {
  const port = process.env.PORT || 3000;
  const lanIp = getLocalIpAddress();
  res.json({
    lanIp,
    port,
    lanUrl: `http://${lanIp}:${port}`
  });
});

// API: Create new session
router.post('/api/rooms', (req, res) => {
  if (isRateLimited('create', req.ip, ROOM_CREATE_MAX, ROOM_CREATE_WINDOW_MS)) {
    return res.status(429).json({ error: 'Çok fazla oda oluşturuldu. Lütfen biraz sonra tekrar deneyin.' });
  }
  const body = req.body || {};
  if (!body.acceptTerms) {
    return res.status(400).json({ error: 'Oda açmak için kullanım koşullarını kabul etmelisiniz.', termsRequired: true });
  }
  registerRateLimitHit('create', req.ip, ROOM_CREATE_WINDOW_MS);

  const customId = typeof body.customId === 'string' ? body.customId.slice(0, 32) : '';
  const ttlMode = ALLOWED_TTL_MODES.includes(body.ttlMode) ? body.ttlMode : '1h';
  let roomId = (customId || generateShortRoomId()).toLowerCase().trim();

  // Clean room ID
  roomId = roomId.replace(/[^a-z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!roomId) roomId = generateShortRoomId();

  if (rooms.has(roomId)) {
    // Never overwrite a live room: that would wipe someone else's session
    if (customId) {
      return res.status(409).json({ error: 'Bu oda kodu zaten kullanımda. Lütfen başka bir kod seçin.' });
    }
    let attempts = 0;
    do {
      roomId = generateShortRoomId() + (attempts > 5 ? crypto.randomInt(1, 10) : '');
      attempts++;
    } while (rooms.has(roomId) && attempts < 20);
  }

  const expiresAt = computeExpiration(ttlMode);
  // Only the creating device can destroy the room; the server keeps just a hash of its token
  const ownerToken = crypto.randomBytes(16).toString('hex');

  const room = {
    id: roomId,
    ownerHash: hashToken(ownerToken),
    createdAt: Date.now(),
    ttlMode,
    expiresAt,
    burnTriggeredAt: null,
    burnCountdownSeconds: ttlMode === 'burn_read' ? 60 : null,
    creatorSocketId: null,
    items: [],
    files: new Map(), // fileId -> { data: Buffer, mime, name }
    livePad: '',
    livePadChunks: [],
    connectedDevices: new Map(),
  };

  rooms.set(roomId, room);
  recordStats({ roomCreated: true });
  auditLog('room_create', req.ip, req.headers['user-agent'], { room: roomId, ttl: ttlMode });

  res.json({
    success: true,
    roomId,
    ownerToken,
    ttlMode,
    expiresAt
  });
});

// API: Check room status
router.get('/api/rooms/:id', (req, res) => {
  // Short room codes are guessable: throttle clients that probe many unknown codes
  if (isRateLimited('scan', req.ip, ROOM_SCAN_MAX_MISSES, ROOM_SCAN_WINDOW_MS)) {
    return res.status(429).json({ error: 'Çok fazla geçersiz oda denemesi. Lütfen birkaç dakika sonra tekrar deneyin.' });
  }

  const roomId = req.params.id.toLowerCase();
  const room = rooms.get(roomId);

  if (!room) {
    registerRateLimitHit('scan', req.ip, ROOM_SCAN_WINDOW_MS);
    return res.status(404).json({ error: 'Oturum bulunamadı veya süresi dolup imha edilmiş.' });
  }

  res.json({
    roomId: room.id,
    ttlMode: room.ttlMode,
    expiresAt: room.expiresAt,
    burnCountdownSeconds: room.burnCountdownSeconds,
    burnTriggeredAt: room.burnTriggeredAt,
    deviceCount: room.connectedDevices.size,
    itemCount: room.items.length
  });
});

// API: Generate QR Code image
router.get('/api/qr', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Text required');

  try {
    const qrBuffer = await qrcode.toBuffer(text, {
      type: 'png',
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('QR code generation failed');
  }
});

// API: Anonymous page view for daily statistics
router.post('/api/track', (req, res) => {
  // Over the cap the request still "succeeds" but is not counted
  if (isRateLimited('track', req.ip, TRACK_MAX, TRACK_WINDOW_MS)) return res.json({ success: true });
  registerRateLimitHit('track', req.ip, TRACK_WINDOW_MS);
  const body = req.body || {};
  recordStats({
    pageView: true,
    visitor: cleanDeviceId(body.visitorId) || `ip:${req.ip}|${req.headers['user-agent'] || ''}`,
    platformUa: req.headers['user-agent']
  });
  res.json({ success: true });
});

// API: Report abuse in a room
router.post('/api/report', (req, res) => {
  if (isRateLimited('report', req.ip, REPORT_MAX, REPORT_WINDOW_MS)) {
    return res.status(429).json({ error: 'Çok fazla bildirim gönderdiniz. Lütfen daha sonra tekrar deneyin.' });
  }
  const body = req.body || {};
  const room = rooms.get(String(body.roomId || '').toLowerCase().trim());
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı veya süresi dolmuş.' });
  registerRateLimitHit('report', req.ip, REPORT_WINDOW_MS);

  const settings = loadAppSettings();
  const report = {
    id: crypto.randomBytes(8).toString('hex'),
    roomId: room.id,
    reason: REPORT_REASONS.includes(body.reason) ? body.reason : 'other',
    details: cleanText(String(body.details || '').trim(), 500),
    createdAt: Date.now(),
    roomExpiresAt: room.expiresAt,
    itemCount: room.items.length,
    reporterIp: settings.auditLogDays > 0 ? req.ip : null,
    status: 'open'
  };
  reports.push(report);
  saveReports();
  auditLog('report', req.ip, req.headers['user-agent'], { room: room.id, reason: report.reason, report: report.id }, settings);
  res.json({ success: true, message: 'Bildiriminiz yöneticiye iletildi. Teşekkürler.' });
});

// API: Public settings (file limits shown to clients)
router.get('/api/settings', (req, res) => {
  res.json({ success: true, files: publicFileSettings(loadAppSettings()) });
});

// API: Chunked file upload: init -> chunk (xN) -> complete
router.post('/api/files/init', (req, res) => {
  if (isRateLimited('upload', req.ip, UPLOAD_INIT_MAX, UPLOAD_INIT_WINDOW_MS)) {
    return res.status(429).json({ error: 'Çok fazla dosya yüklemesi. Lütfen biraz sonra tekrar deneyin.' });
  }
  registerRateLimitHit('upload', req.ip, UPLOAD_INIT_WINDOW_MS);

  const body = req.body || {};
  const settings = loadAppSettings();
  const roomId = String(body.roomId || '').toLowerCase().trim();
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı veya süresi dolmuş.' });

  const fileName = sanitizeFileName(body.fileName);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const exts = allowedExtensions(settings);
  if (!exts.includes(ext)) {
    return res.status(415).json({ error: `Bu dosya türüne izin verilmiyor. İzin verilenler: ${exts.join(', ')}` });
  }

  const size = parseInt(body.fileSize, 10) || 0;
  if (size <= 0) return res.status(400).json({ error: 'Boş dosya gönderilemez.' });
  if (size > settings.maxFileSizeMB * 1024 * 1024) {
    return res.status(413).json({ error: `Dosya çok büyük. En fazla ${settings.maxFileSizeMB} MB yüklenebilir.` });
  }
  if (roomFilesBytes(room) + size > settings.maxRoomStorageMB * 1024 * 1024) {
    return res.status(413).json({ error: `Bu odanın dosya kotası (${settings.maxRoomStorageMB} MB) doldu. Eski dosyaları silip tekrar deneyin.` });
  }
  const capacity = checkUploadCapacity(req.ip, settings, size);
  if (capacity) return res.status(capacity.status).json({ error: capacity.error });

  const uploadId = crypto.randomBytes(16).toString('hex');
  pendingUploads.set(uploadId, { roomId, fileName, ext, size, received: 0, chunks: [], createdAt: Date.now() });
  res.json({ success: true, uploadId, chunkSize: FILE_CHUNK_SIZE });
});

router.post('/api/files/chunk', express.raw({ type: () => true, limit: FILE_CHUNK_SIZE + 1024 }), (req, res) => {
  const uploadId = String(req.query.uploadId || '');
  const upload = pendingUploads.get(uploadId);
  if (!upload) return res.status(404).json({ error: 'Yükleme bulunamadı veya süresi doldu.' });

  const chunk = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const offset = parseInt(req.query.offset, 10);
  if (chunk.length === 0 || chunk.length > FILE_CHUNK_SIZE) {
    return res.status(400).json({ error: 'Geçersiz parça boyutu.' });
  }
  if (offset !== upload.received) {
    return res.status(409).json({ error: 'Parça sırası hatalı.', received: upload.received });
  }
  if (upload.received + chunk.length > upload.size) {
    pendingUploads.delete(uploadId);
    return res.status(400).json({ error: 'Dosya bildirilen boyuttan büyük.' });
  }
  // Content must really be what the extension claims (blocks renamed executables, HTML, etc.)
  if (offset === 0 && !fileMagicMatches(upload.ext, chunk)) {
    pendingUploads.delete(uploadId);
    return res.status(415).json({ error: 'Dosya içeriği uzantısıyla uyuşmuyor.' });
  }

  upload.chunks.push(chunk);
  upload.received += chunk.length;
  res.json({ success: true, received: upload.received });
});

router.post('/api/files/complete', (req, res) => {
  const uploadId = String(req.query.uploadId || '');
  const upload = pendingUploads.get(uploadId);
  if (!upload) return res.status(404).json({ error: 'Yükleme bulunamadı veya süresi doldu.' });
  if (upload.received !== upload.size) return res.status(400).json({ error: 'Dosya eksik yüklendi.' });
  pendingUploads.delete(uploadId);

  const room = rooms.get(upload.roomId);
  const settings = loadAppSettings();
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı veya süresi dolmuş.' });
  if (roomFilesBytes(room) + upload.size > settings.maxRoomStorageMB * 1024 * 1024) {
    return res.status(413).json({ error: 'Bu odanın dosya kotası doldu.' });
  }

  const body = req.body || {};
  const fileId = crypto.randomBytes(16).toString('hex');
  const mime = FILE_TYPE_CATALOG[upload.ext].mime;
  const data = Buffer.concat(upload.chunks);
  room.files.set(fileId, { data, mime, name: upload.fileName, downloads: { date: '', count: 0 } });
  auditLog('file_upload', req.ip, req.headers['user-agent'], {
    room: room.id,
    name: upload.fileName,
    size: upload.size,
    sha256: crypto.createHash('sha256').update(data).digest('hex')
  }, settings);

  const item = {
    id: crypto.randomUUID(),
    type: 'file',
    content: '',
    fileId,
    fileName: upload.fileName,
    fileSize: upload.size,
    fileType: mime,
    fileExt: upload.ext,
    senderDeviceId: cleanDeviceId(body.senderDeviceId),
    senderName: cleanText(body.senderName, MAX_NAME_CHARS) || 'Cihaz',
    createdAt: Date.now()
  };

  room.items.unshift(item);
  while (room.items.length > 100) {
    releaseItemFile(room, room.items.pop());
  }
  io.to(upload.roomId).emit('item_added', item);
  recordStats({ share: 'file', bytesIn: upload.size });
  res.json({ success: true, item });
});

// API: Download a shared file
router.get('/api/files/:roomId/:fileId', (req, res) => {
  if (isRateLimited('scan', req.ip, ROOM_SCAN_MAX_MISSES, ROOM_SCAN_WINDOW_MS)) {
    return res.status(429).json({ error: 'Çok fazla geçersiz istek. Lütfen birkaç dakika sonra tekrar deneyin.' });
  }
  const room = rooms.get(String(req.params.roomId).toLowerCase());
  const file = room && room.files.get(req.params.fileId);
  if (!file) {
    registerRateLimitHit('scan', req.ip, ROOM_SCAN_WINDOW_MS);
    return res.status(404).json({ error: 'Dosya bulunamadı veya süresi dolmuş.' });
  }

  // A per-file daily cap keeps rooms from being used as a public file-distribution host
  const limit = loadAppSettings().maxDownloadsPerFile;
  if (limit > 0) {
    const today = statsDateParts().date;
    if (file.downloads.date !== today) file.downloads = { date: today, count: 0 };
    if (file.downloads.count >= limit) {
      return res.status(429).json({ error: `Bu dosya bugünkü indirme sınırına (${limit}) ulaştı.` });
    }
    file.downloads.count++;
  }

  const asciiName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', file.data.length);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  recordStats({ download: true, bytesOut: file.data.length });
  res.end(file.data);
});

// Direct room links: /s/:roomId or /:roomId (e.g. /a123 or /s/a123)
router.get('/s/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin Panel Web Route
router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// =============================================================
// ADMIN API ENDPOINTS (Protected)
// =============================================================

// 1. Admin Login
router.post('/api/admin/login', (req, res) => {
  if (isRateLimited('login', req.ip, ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCK_MS)) {
    return res.status(429).json({ error: 'Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.' });
  }
  // Across all IPs: after 10 failures every further attempt must wait longer (up to 60 s)
  const globalFails = readRateLimit('login_all', 'global', ADMIN_LOGIN_LOCK_MS);
  const gapMs = globalFails.count < 10 ? 0 : Math.min(60, (globalFails.count - 9) * 2) * 1000;
  const waitMs = gapMs - (Date.now() - globalFails.last);
  if (waitMs > 0) {
    return res.status(429).json({ error: `Çok fazla hatalı giriş denemesi yapıldı. Lütfen ${Math.ceil(waitMs / 1000)} saniye sonra tekrar deneyin.` });
  }

  const body = req.body || {};
  const username = cleanText(body.username, 64).trim();
  const password = cleanText(body.password, 256);
  const cfg = loadAdminConfig();

  if (!verifyAdminCredentials(cfg, username, password)) {
    registerRateLimitHit('login', req.ip, ADMIN_LOGIN_LOCK_MS);
    registerRateLimitHit('login_all', 'global', ADMIN_LOGIN_LOCK_MS);
    return setTimeout(() => {
      res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }, 250 + crypto.randomInt(350));
  }

  clearRateLimit('login', req.ip);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS;
  adminTokens.set(hashToken(token), expiresAt);
  return res.json({
    success: true,
    token,
    username: cfg.username,
    mustChangePassword: Boolean(cfg.mustChangePassword),
    expiresAt
  });
});

// 2. Admin Logout
router.post('/api/admin/logout', requireAdminPending, (req, res) => {
  adminTokens.delete(req.adminTokenHash);
  res.json({ success: true, message: 'Çıkış yapıldı.' });
});

// Admin session info
router.get('/api/admin/me', requireAdminPending, (req, res) => {
  const cfg = loadAdminConfig();
  res.json({
    success: true,
    username: cfg.username,
    mustChangePassword: Boolean(cfg.mustChangePassword),
    passwordUpdatedAt: cfg.updatedAt || null
  });
});

// Admin change password (and optionally username)
router.post('/api/admin/change_password', requireAdminPending, (req, res) => {
  if (isRateLimited('pwchange', req.ip, ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCK_MS)) {
    return res.status(429).json({ error: 'Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.' });
  }

  const body = req.body || {};
  const currentPassword = cleanText(body.currentPassword, 256);
  const newPassword = cleanText(body.newPassword, 256);
  const cfg = loadAdminConfig();
  const newUsername = cleanText(body.newUsername, 64).trim() || cfg.username;

  if (!verifyAdminCredentials(cfg, cfg.username, currentPassword)) {
    registerRateLimitHit('pwchange', req.ip, ADMIN_LOGIN_LOCK_MS);
    return res.status(403).json({ error: 'Mevcut şifre hatalı.' });
  }
  if (!/^[a-zA-Z0-9._@-]{1,64}$/.test(newUsername)) {
    return res.status(400).json({ error: 'Kullanıcı adı yalnızca harf, rakam ve . _ @ - içerebilir.' });
  }
  const policyError = validateNewAdminPassword(newPassword);
  if (policyError) {
    return res.status(400).json({ error: policyError });
  }

  try {
    saveAdminConfig({
      username: newUsername,
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: Date.now()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Ayar dosyası yazılamadı. data/ klasörünün yazma iznini kontrol edin.' });
  }

  clearRateLimit('pwchange', req.ip);

  // Revoke every other admin session; keep only the one that made the change
  const keepExpiry = Date.now() + ADMIN_TOKEN_TTL_MS;
  adminTokens.clear();
  adminTokens.set(req.adminTokenHash, keepExpiry);

  res.json({ success: true, username: newUsername, message: 'Şifre güncellendi. Diğer tüm yönetici oturumları kapatıldı.' });
});

// Admin file settings (GET = read, POST = save)
function sendAdminSettings(res, settings, message) {
  res.json({
    success: true,
    settings,
    groups: Object.entries(FILE_TYPE_GROUPS).map(([key, label]) => ({
      key,
      label,
      extensions: Object.keys(FILE_TYPE_CATALOG).filter(ext => FILE_TYPE_CATALOG[ext].group === key)
    })),
    limits: {
      maxFileSizeMB: MAX_FILE_SIZE_MB_LIMIT,
      maxRoomStorageMB: MAX_FILE_SIZE_MB_LIMIT * 4,
      diskFree: null,
      used: formatBytes(storageUsageBytes())
    },
    message
  });
}

router.get('/api/admin/settings', requireAdmin, (req, res) => {
  sendAdminSettings(res, loadAppSettings(), null);
});

// Admin daily statistics (?days=7..365): selected period + the period before it
router.get('/api/admin/stats', requireAdmin, (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
  const series = [];
  for (let i = 2 * days - 1; i >= 0; i--) {
    series.push(publicDayStats(statsDateParts(new Date(Date.now() - i * 86400000)).date));
  }
  const sumPeriod = list => list.reduce((t, d) => {
    ['pageViews', 'visitorCount', 'activeRooms', 'roomsCreated', 'downloads', 'bytesIn', 'bytesOut'].forEach(k => { t[k] += d[k] || 0; });
    t.shares += d.shares.text + d.shares.image + d.shares.file;
    return t;
  }, { pageViews: 0, visitorCount: 0, activeRooms: 0, roomsCreated: 0, shares: 0, downloads: 0, bytesIn: 0, bytesOut: 0 });

  const current = series.slice(days);
  res.json({
    success: true,
    timezone: STATS_TIMEZONE,
    days: current,
    totals: sumPeriod(current),
    previousTotals: sumPeriod(series.slice(0, days))
  });
});

router.post('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  const settings = normalizeAppSettings({
    maxFileSizeMB: body.maxFileSizeMB,
    maxRoomStorageMB: body.maxRoomStorageMB,
    allowedGroups: Array.isArray(body.allowedGroups) ? body.allowedGroups : [],
    maxTotalStorageMB: body.maxTotalStorageMB,
    maxUploadMBPerHour: body.maxUploadMBPerHour,
    maxDownloadsPerFile: body.maxDownloadsPerFile,
    auditLogDays: body.auditLogDays
  });
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings));
  } catch (err) {
    return res.status(500).json({ error: 'Ayar dosyası yazılamadı. data/ klasörünün yazma iznini kontrol edin.' });
  }
  sendAdminSettings(res, settings, 'Dosya ayarları kaydedildi.');
});

// Admin abuse reports (GET = list, POST = change status)
function sendReports(res) {
  const list = reports
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200)
    .map(r => ({ ...r, roomActive: rooms.has(r.roomId) }));
  res.json({ success: true, reports: list });
}

router.get('/api/admin/reports', requireAdmin, (req, res) => sendReports(res));

router.post('/api/admin/reports', requireAdmin, (req, res) => {
  const body = req.body || {};
  const report = reports.find(r => r.id === body.id);
  if (!report) return res.status(404).json({ error: 'Bildirim bulunamadı.' });
  report.status = body.status === 'open' ? 'open' : 'resolved';
  saveReports();
  sendReports(res);
});

// Admin audit log (?date=YYYY-MM-DD&q=filter)
router.get('/api/admin/audit', requireAdmin, (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : statsDateParts().date;
  const q = String(req.query.q || '').toLowerCase().trim().slice(0, 100);
  let lines = [];
  try { lines = fs.readFileSync(path.join(AUDIT_DIR, `${date}.log`), 'utf8').split('\n').filter(Boolean); } catch (e) {}
  const entries = [];
  for (const line of lines.reverse()) {
    if (q && !line.toLowerCase().includes(q)) continue;
    try {
      const e = JSON.parse(line);
      e.t *= 1000;
      entries.push(e);
    } catch (err) {}
    if (entries.length >= 500) break;
  }
  let dates = [];
  try { dates = fs.readdirSync(AUDIT_DIR).map(f => f.slice(0, 10)).sort().reverse(); } catch (e) {}
  res.json({ success: true, date, entries, dates, retentionDays: loadAppSettings().auditLogDays });
});

// 3. Admin Get All Rooms & Server Metrics
router.get('/api/admin/rooms', requireAdmin, (req, res) => {
  const roomList = [];
  let totalSizeBytes = 0;
  let totalItems = 0;
  let totalDevices = 0;

  for (const [id, room] of rooms.entries()) {
    const sizeBytes = calculateRoomSize(room);
    totalSizeBytes += sizeBytes;
    totalItems += (room.items || []).length;
    const deviceCount = room.connectedDevices ? room.connectedDevices.size : 0;
    totalDevices += deviceCount;

    const deviceNames = room.connectedDevices ? Array.from(room.connectedDevices.values()) : [];

    roomList.push({
      id: room.id,
      createdAt: room.createdAt,
      ttlMode: room.ttlMode,
      expiresAt: room.expiresAt,
      burnCountdownSeconds: room.burnCountdownSeconds,
      burnTriggeredAt: room.burnTriggeredAt,
      deviceCount,
      deviceNames,
      itemCount: (room.items || []).length,
      hasLivePad: Boolean(room.livePad && room.livePad.trim()),
      livePadLength: (room.livePad || '').length,
      sizeBytes,
      sizeFormatted: formatBytes(sizeBytes)
    });
  }

  roomList.sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    success: true,
    rooms: roomList,
    stats: {
      totalRooms: roomList.length,
      totalDevices,
      totalItems,
      totalSizeBytes,
      totalSizeFormatted: formatBytes(totalSizeBytes),
      memoryRss: formatBytes(process.memoryUsage().rss),
      uptimeSeconds: Math.floor(process.uptime())
    }
  });
});

// 4. Admin Destroy Single Room
router.post('/api/admin/destroy_room', requireAdmin, (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) return res.status(400).json({ error: 'Oda ID belirtilmedi.' });
  const cleanId = roomId.toLowerCase().trim();

  if (rooms.has(cleanId)) {
    io.to(cleanId).emit('room_destroyed', {
      reason: 'Bu oturum yönetici tarafından kapatıldı ve silindi.'
    });
    rooms.delete(cleanId);
    auditLog('room_destroy', req.ip, req.headers['user-agent'], { room: cleanId, by: 'admin' });
    return res.json({ success: true, message: `Oda (${cleanId}) başarıyla kapatıldı ve silindi.` });
  }
  return res.status(404).json({ error: 'Oda bulunamadı veya zaten silinmiş.' });
});

// 5. Admin Destroy Batch of Rooms
router.post('/api/admin/destroy_batch', requireAdmin, (req, res) => {
  const { roomIds } = req.body || {};
  if (!Array.isArray(roomIds)) return res.status(400).json({ error: 'roomIds dizisi gerekli.' });

  let deletedCount = 0;
  for (const id of roomIds) {
    const cleanId = (id || '').toLowerCase().trim();
    if (rooms.has(cleanId)) {
      io.to(cleanId).emit('room_destroyed', {
        reason: 'Bu oturum yönetici tarafından kapatıldı ve silindi.'
      });
      rooms.delete(cleanId);
      deletedCount++;
    }
  }
  res.json({ success: true, count: deletedCount, message: `${deletedCount} adet oturum başarıyla silindi.` });
});

// 6. Admin Destroy All Rooms
router.post('/api/admin/destroy_all', requireAdmin, (req, res) => {
  const count = rooms.size;
  for (const [id] of rooms.entries()) {
    io.to(id).emit('room_destroyed', {
      reason: 'Tüm oturumlar yönetici tarafından kapatıldı ve silindi.'
    });
  }
  rooms.clear();
  res.json({ success: true, count, message: `Tüm oturumlar (${count} adet) başarıyla temizlendi.` });
});

// Fallback for SPA (serves index.html for any other route like /a123 or /chat/a123)
router.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Mount router on '/', '/c', and '/chat'
app.use('/c', router);
app.use('/chat', router);
app.use('/', router);

// WebSockets (Real-time synchronization)
io.on('connection', (socket) => {
  let currentRoomId = null;

  const clientIp = socket.handshake.address;

  socket.on('join_room', ({ roomId, deviceName, deviceId } = {}) => {
    if (isRateLimited('scan', clientIp, ROOM_SCAN_MAX_MISSES, ROOM_SCAN_WINDOW_MS)) {
      socket.emit('room_error', { message: 'Çok fazla geçersiz oda denemesi. Lütfen birkaç dakika sonra tekrar deneyin.' });
      return;
    }

    roomId = (typeof roomId === 'string' ? roomId : '').toLowerCase().trim();
    const room = rooms.get(roomId);

    if (!room) {
      registerRateLimitHit('scan', clientIp, ROOM_SCAN_WINDOW_MS);
      socket.emit('room_error', { message: 'Oturum bulunamadı veya imha edilmiş.' });
      return;
    }

    currentRoomId = roomId;
    socket.join(roomId);

    const devName = cleanText(deviceName, MAX_NAME_CHARS) || `Cihaz ${room.connectedDevices.size + 1}`;
    recordStats({
      visitor: cleanDeviceId(deviceId) || socket.id,
      platformUa: socket.handshake.headers['user-agent'],
      room: roomId,
      bytesOut: room.items.reduce((sum, i) => sum + (i.content ? i.content.length : 0), 0)
    });
    room.connectedDevices.set(socket.id, devName);

    if (!room.creatorSocketId) {
      room.creatorSocketId = socket.id;
    }

    if (room.ttlMode === 'burn_read' && !room.burnTriggeredAt && room.connectedDevices.size >= 2) {
      room.burnTriggeredAt = Date.now();
      room.expiresAt = Date.now() + 60 * 1000;
      io.to(roomId).emit('burn_countdown_started', {
        expiresAt: room.expiresAt,
        secondsLeft: 60
      });
    }

    socket.emit('room_joined', {
      roomId: room.id,
      ttlMode: room.ttlMode,
      expiresAt: room.expiresAt,
      burnTriggeredAt: room.burnTriggeredAt,
      items: room.items,
      livePad: room.livePad,
      livePadChunks: room.livePadChunks || [],
      deviceCount: room.connectedDevices.size,
      yourId: socket.id,
      yourName: devName,
      ownerProtected: Boolean(room.ownerHash)
    });

    io.to(roomId).emit('device_count_updated', {
      count: room.connectedDevices.size,
      devices: Array.from(room.connectedDevices.values())
    });
  });

  socket.on('add_item', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    if (!data || typeof data.content !== 'string' || !data.content) return;
    const type = data.type === 'image' ? 'image' : 'text';
    if (type === 'image' && (data.content.length > MAX_IMAGE_CHARS || !SAFE_IMAGE_DATA_URL.test(data.content))) {
      socket.emit('item_error', { message: 'Geçersiz veya çok büyük görsel.' });
      return;
    }
    if (type === 'text' && data.content.length > MAX_TEXT_CHARS) {
      socket.emit('item_error', { message: 'Metin çok uzun.' });
      return;
    }
    if (calculateRoomSize(room) + data.content.length > MAX_ROOM_BYTES) {
      socket.emit('item_error', { message: 'Bu oda dolu. Eski öğeleri silip tekrar deneyin.' });
      return;
    }
    const settings = loadAppSettings();
    const capacity = checkUploadCapacity(clientIp, settings, data.content.length);
    if (capacity) {
      socket.emit('item_error', { message: capacity.error });
      return;
    }

    const item = {
      id: crypto.randomUUID(),
      type,
      content: data.content,
      fileName: data.fileName ? cleanText(String(data.fileName), 200) : null,
      fileSize: Number.isFinite(Number(data.fileSize)) ? Math.max(0, Math.floor(Number(data.fileSize))) : null,
      fileType: data.fileType ? cleanText(String(data.fileType), 60) : null,
      senderId: socket.id,
      senderDeviceId: cleanDeviceId(data.senderDeviceId) || socket.id,
      senderName: cleanText(data.senderName, MAX_NAME_CHARS) || room.connectedDevices.get(socket.id) || 'Cihaz',
      createdAt: Date.now()
    };

    room.items.unshift(item);
    // Keep the newest 100 items
    while (room.items.length > 100) {
      releaseItemFile(room, room.items.pop());
    }
    io.to(currentRoomId).emit('item_added', item);
    auditLog('item_add', clientIp, socket.handshake.headers['user-agent'], {
      room: room.id,
      type,
      size: item.content.length,
      sha256: crypto.createHash('sha256').update(item.content).digest('hex')
    }, settings);
    recordStats({
      share: type,
      bytesIn: item.content.length,
      bytesOut: item.content.length * Math.max(0, room.connectedDevices.size - 1)
    });
  });

  socket.on('delete_item', ({ itemId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const initialLength = room.items.length;
    releaseItemFile(room, room.items.find(i => i.id === itemId));
    room.items = room.items.filter(i => i.id !== itemId);

    if (room.items.length !== initialLength) {
      io.to(currentRoomId).emit('item_deleted', { itemId });
    }
  });

  socket.on('clear_items', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.items = [];
    room.files.clear();
    io.to(currentRoomId).emit('all_items_cleared');
  });

  socket.on('update_live_pad', ({ text, chunks, senderName } = {}) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.livePad = cleanText(text, MAX_LIVEPAD_CHARS);
    if (chunks !== undefined) {
      room.livePadChunks = sanitizeLivePadChunks(chunks);
    }
    socket.to(currentRoomId).emit('live_pad_synced', {
      text: room.livePad,
      chunks: room.livePadChunks,
      updatedBy: cleanText(senderName, MAX_NAME_CHARS) || room.connectedDevices.get(socket.id) || 'Cihaz'
    });
  });

  socket.on('update_device_name', ({ deviceName } = {}) => {
    deviceName = cleanText(deviceName, MAX_NAME_CHARS);
    if (!currentRoomId || !deviceName) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.connectedDevices.set(socket.id, deviceName);
    io.to(currentRoomId).emit('device_count_updated', {
      count: room.connectedDevices.size,
      devices: Array.from(room.connectedDevices.values())
    });
  });

  socket.on('destroy_room_now', ({ ownerToken } = {}) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (room.ownerHash && !safeEqualStrings(room.ownerHash, hashToken(String(ownerToken || '')))) {
      socket.emit('item_error', { message: 'Bu odayı yalnızca açan cihaz imha edebilir.' });
      return;
    }
    auditLog('room_destroy', clientIp, socket.handshake.headers['user-agent'], { room: room.id, by: 'owner' });

    io.to(currentRoomId).emit('room_destroyed', {
      reason: 'Oturum kullanıcı tarafından anında imha edildi.'
    });

    rooms.delete(currentRoomId);
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.connectedDevices.delete(socket.id);
      io.to(currentRoomId).emit('device_count_updated', {
        count: room.connectedDevices.size,
        devices: Array.from(room.connectedDevices.values())
      });

      if (room.connectedDevices.size === 0 && room.burnTriggeredAt) {
        rooms.delete(currentRoomId);
      }
    }
  });
});

// Periodic garbage collector / TTL checker (Runs every 5 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.expiresAt && now >= room.expiresAt) {
      io.to(roomId).emit('room_destroyed', {
        reason: room.ttlMode === 'burn_read'
          ? 'Okunduktan sonra imha süresi doldu.'
          : 'Seçilen imha süresi doldu. Tüm veriler hafızadan tamamen silindi.'
      });
      rooms.delete(roomId);
      continue;
    }

    if (room.ttlMode === 'burn_read' && !room.burnTriggeredAt && (now - room.createdAt > 2 * 60 * 60 * 1000)) {
      rooms.delete(roomId);
    }
  }

  for (const [hash, expiresAt] of adminTokens.entries()) {
    if (now > expiresAt) adminTokens.delete(hash);
  }
  for (const [uploadId, upload] of pendingUploads.entries()) {
    if (now - upload.createdAt > 60 * 60 * 1000 || !rooms.has(upload.roomId)) pendingUploads.delete(uploadId);
  }
  for (const [key, entry] of rateLimits.entries()) {
    if (now - entry.start > 60 * 60 * 1000) rateLimits.delete(key);
  }
}, 5000);

const PORT = process.env.PORT || 3000;
// Stats housekeeping: compact past days now and every 6 hours, flush on shutdown
compactStats();
pruneAudit();
setInterval(() => { compactStats(); pruneAudit(); }, 6 * 60 * 60 * 1000);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    flushStats();
    process.exit(0);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLocalIpAddress();
  console.log(`====================================================`);
  console.log(`🚀 Ulak Sunucusu Başlatıldı!`);
  console.log(`💻 Ana Dizin:          http://localhost:${PORT}`);
  console.log(`📁 /chat Alt Dizini:   http://localhost:${PORT}/chat`);
  console.log(`📱 Ağdaki Cihazlar:    http://${lanIp}:${PORT}/chat`);
  console.log(`🛡️  Örnek Kısa Link:   http://localhost:${PORT}/chat/a123`);
  console.log(`====================================================`);
});
