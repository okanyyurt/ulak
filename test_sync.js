const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const BASE_PATH = '/chat';
const ROOM_ID = 'a123';

async function runSubpathTest() {
  console.log('--- 1. Testing Room Creation under /chat ---');
  const res = await fetch(`${SERVER_URL}${BASE_PATH}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customId: ROOM_ID, ttlMode: '1h' })
  });
  const roomData = await res.json();
  console.log('Room created successfully:', roomData);

  console.log('\n--- 2. Connecting Device 1 via /chat/socket.io ---');
  const client1 = io(SERVER_URL, {
    path: `${BASE_PATH}/socket.io`
  });
  
  await new Promise((resolve) => {
    client1.on('connect', () => {
      console.log('Device 1 connected via /chat/socket.io:', client1.id);
      client1.emit('join_room', { roomId: ROOM_ID, deviceName: 'Bilgisayar' });
      client1.on('room_joined', (data) => {
        console.log('Device 1 joined room:', data.roomId, 'count:', data.deviceCount);
        resolve();
      });
    });
  });

  console.log('\n--- 3. Connecting Device 2 (Phone) via /chat/socket.io ---');
  const client2 = io(SERVER_URL, {
    path: `${BASE_PATH}/socket.io`
  });
  await new Promise((resolve) => {
    client2.on('connect', () => {
      console.log('Device 2 connected via /chat/socket.io:', client2.id);
      client2.emit('join_room', { roomId: ROOM_ID, deviceName: 'Telefon' });
      client2.on('room_joined', (data) => {
        console.log('Device 2 joined room:', data.roomId, 'count:', data.deviceCount);
        resolve();
      });
    });
  });

  console.log('\n--- 4. Device 1 sends short clip ---');
  const receivePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout on Device 2')), 4000);
    client2.on('item_added', (item) => {
      console.log('Device 2 received clip:', item.content);
      clearTimeout(timeout);
      resolve(item);
    });
  });

  client1.emit('add_item', {
    type: 'text',
    content: 'Okan bey link: okanyesilyurt.com/chat/a123'
  });

  await receivePromise;

  client1.disconnect();
  client2.disconnect();

  console.log('\n✅ SUBPATH /chat & SHORT ROOM a123 TEST PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

runSubpathTest().catch((err) => {
  console.error('❌ Subpath test failed:', err);
  process.exit(1);
});
