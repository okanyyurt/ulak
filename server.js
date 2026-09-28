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
