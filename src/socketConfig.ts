import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL;

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 45000, // Match server's connectTimeout
  withCredentials: true,
  extraHeaders: {
    'Cache-Control': 'no-cache'
  }
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
