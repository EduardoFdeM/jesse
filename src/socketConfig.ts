import { io } from 'socket.io-client';
import api from './axiosConfig';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'https://pdf-tradutor-production.up.railway.app';

console.log('🔌 Configurando Socket.IO com URL:', SOCKET_URL);

const socket = io(SOCKET_URL, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 10000
});

// Melhorar tratamento de erros
socket.on('connect_error', (error) => {
    console.error('❌ Erro na conexão Socket:', {
        message: error.message,
        type: error.type,
        description: error.description
    });
});

export const connectSocket = () => {
    if (!socket.connected) {
        console.log('🔄 Tentando conectar socket...');
        socket.connect();
    }
    return socket;
};

export default socket;
