import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'react-hot-toast';

const SOCKET_URL = 'https://pdf-tradutor-production.up.railway.app';

export const useSocket = () => {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (socketRef.current?.connected) {
            return;
        }

        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            path: '/socket.io/',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
            timeout: 20000,
            withCredentials: true
        });

        socket.io.on("error", (error) => {
            console.error('❌ Erro no socket:', error);
        });

        socket.io.on("reconnect_attempt", (attempt) => {
            console.log(`🔄 Tentativa de reconexão ${attempt}`);
        });

        socketRef.current = socket;

        return () => {
            if (socket.connected) {
                socket.disconnect();
            }
            socketRef.current = null;
        };
    }, []);

    return socketRef.current;
};