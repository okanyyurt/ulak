const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const cors = require('cors');
const path = require('path');
const os = require('os');
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// In-Memory ephemeral storage (Zero disk footprint)
const rooms = new Map();

// Admin credentials & session storage
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const adminTokens = new Map(); // token -> expiresAt (timestamp)

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
  if (room.livePadChunks && room.livePadChunks.length) {
    for (const c of room.livePadChunks) {
      if (c.t) bytes += Buffer.byteLength(c.t, 'utf8');
      bytes += 64;
    }
  }
  bytes += 512;
  return bytes;
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers['x-admin-token'] || req.query.admin_token || req.query.token);

  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Yetkisiz erişim. Lütfen admin girişi yapın.' });
  }

  const expiresAt = adminTokens.get(token);
  if (Date.now() > expiresAt) {
    adminTokens.delete(token);
    return res.status(401).json({ error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' });
  }

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
    res += chars[Math.floor(Math.random() * chars.length)];
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
  const { customId, ttlMode = '1h' } = req.body;
  let roomId = (customId || generateShortRoomId()).toLowerCase().trim();
  
  // Clean room ID
  roomId = roomId.replace(/[^a-z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!roomId) roomId = generateShortRoomId();

  // If room already exists and is active, generate short unique ID if user didn't request custom
  if (rooms.has(roomId) && !customId) {
    roomId = `${roomId}${Math.floor(1 + Math.random() * 9)}`;
  }

  const expiresAt = computeExpiration(ttlMode);

  const room = {
    id: roomId,
    createdAt: Date.now(),
    ttlMode,
    expiresAt,
    burnTriggeredAt: null,
    burnCountdownSeconds: ttlMode === 'burn_read' ? 60 : null,
    creatorSocketId: null,
    items: [],
    livePad: '',
    livePadChunks: [],
    connectedDevices: new Map(),
  };

  rooms.set(roomId, room);

  res.json({
    success: true,
    roomId,
    ttlMode,
    expiresAt
  });
});

// API: Check room status
router.get('/api/rooms/:id', (req, res) => {
  const roomId = req.params.id.toLowerCase();
  const room = rooms.get(roomId);

  if (!room) {
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
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    adminTokens.set(token, expiresAt);
    return res.json({
      success: true,
      token,
      username: ADMIN_USER,
      expiresAt
    });
  }
  return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
});

// 2. Admin Logout
router.post('/api/admin/logout', requireAdmin, (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers['x-admin-token'] || req.query.admin_token);
  if (token) adminTokens.delete(token);
  res.json({ success: true, message: 'Çıkış yapıldı.' });
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

  socket.on('join_room', ({ roomId, deviceName }) => {
    roomId = (roomId || '').toLowerCase().trim();
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('room_error', { message: 'Oturum bulunamadı veya imha edilmiş.' });
      return;
    }

    currentRoomId = roomId;
    socket.join(roomId);

    const devName = deviceName || `Cihaz ${room.connectedDevices.size + 1}`;
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
      yourName: devName
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

    if (!data.type || !data.content) return;
    
    if (room.items.length >= 100) {
      room.items.shift();
    }

    const item = {
      id: crypto.randomUUID(),
      type: data.type,
      content: data.content,
      fileName: data.fileName || null,
      fileSize: data.fileSize || null,
      fileType: data.fileType || null,
      senderId: socket.id,
      senderDeviceId: data.senderDeviceId || socket.id,
      senderName: data.senderName || room.connectedDevices.get(socket.id) || 'Cihaz',
      createdAt: Date.now()
    };

    room.items.unshift(item);
    io.to(currentRoomId).emit('item_added', item);
  });

  socket.on('delete_item', ({ itemId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const initialLength = room.items.length;
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
    io.to(currentRoomId).emit('all_items_cleared');
  });

  socket.on('update_live_pad', ({ text, chunks, senderName, senderDeviceId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.livePad = text || '';
    if (chunks !== undefined) {
      room.livePadChunks = chunks;
    }
    socket.to(currentRoomId).emit('live_pad_synced', {
      text: room.livePad,
      chunks: room.livePadChunks,
      updatedBy: senderName || room.connectedDevices.get(socket.id) || 'Cihaz'
    });
  });

  socket.on('update_device_name', ({ deviceName }) => {
    if (!currentRoomId || !deviceName) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.connectedDevices.set(socket.id, deviceName);
    io.to(currentRoomId).emit('device_count_updated', {
      count: room.connectedDevices.size,
      devices: Array.from(room.connectedDevices.values())
    });
  });

  socket.on('destroy_room_now', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

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
}, 5000);

const PORT = process.env.PORT || 3000;
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
