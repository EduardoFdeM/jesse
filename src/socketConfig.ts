import { io } from 'socket.io-client';

const SOCKET_URL = 'https://pdf-tradutor-production.up.railway.app';

const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  withCredentials: true
});

// Debug logging
if (import.meta.env.DEV) {
  socket.onAny((event, ...args) => {
    console.log(`[Socket.IO] ${event}:`, args);
  });
}

// Add error handling
socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

socket.on('connect', () => {
  console.log('Socket connected successfully');
});

export default socket;
