import { io } from 'socket.io-client';

const SOCKET_URL = 'https://pdf-tradutor-production.up.railway.app';

const socket = io(SOCKET_URL, {
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    withCredentials: true,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Melhorar logs de debug
socket.on('connect', () => {
    console.log('✅ Socket conectado com sucesso:', socket.id);
});

socket.on('connect_error', (error) => {
    console.error('❌ Erro na conexão Socket:', error.message);
});

socket.on('disconnect', (reason) => {
    console.log('🔌 Socket desconectado:', reason);
});

// Exportar função de conexão explícita
export const connectSocket = () => {
    if (!socket.connected) {
        socket.connect();
    }
};

export default socket;
