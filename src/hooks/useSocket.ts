import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'react-toastify';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

console.log('🔌 Tentando conectar ao Socket.IO em:', SOCKET_URL);

export const useSocket = () => {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (socketRef.current?.connected) {
            console.log('✅ Socket já está conectado');
            return;
        }

        // Criar conexão Socket.IO
        const socket = io(SOCKET_URL, {
            transports: ['polling', 'websocket'],
            path: '/socket.io',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            forceNew: true,
            timeout: 60000,
            withCredentials: true
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Conectado ao servidor via:', socket.io.engine.transport.name);
            toast.success('Conectado ao servidor');
        });

        socket.on('connect_error', (error) => {
            console.error('❌ Erro de conexão:', error.message);
            console.error('Tentando reconectar via:', socket.io.engine.transport.name);
            toast.error('Erro de conexão com o servidor');
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Desconectado:', reason);
            toast.warn('Conexão perdida');
        });

        socket.on('error', (error) => {
            console.error('❌ Erro no socket:', error);
            toast.error('Erro no socket');
        });

        return () => {
            if (socket) {
                socket.disconnect();
                socket.removeAllListeners();
                socketRef.current = null;
            }
        };
    }, []);

    return socketRef.current;
}; 