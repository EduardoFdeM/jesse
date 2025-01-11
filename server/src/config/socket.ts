// socket.ts
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initializeSocket = (httpServer: HttpServer) => {
    if (io) {
        console.log('Socket.IO já está inicializado');
        return io;
    }

    console.log('Inicializando Socket.IO...');
    
    io = new Server(httpServer, {
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            methods: ['GET', 'POST', 'OPTIONS'],
            credentials: true
        },
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000
    });

    io.on('connection', (socket) => {
        console.log('👤 Cliente conectado:', socket.id);

        socket.on('disconnect', () => {
            console.log('👋 Cliente desconectado:', socket.id);
        });

        socket.on('error', (error) => {
            console.error('❌ Erro no socket:', error);
        });
    });

    console.log('✅ Socket.IO inicializado com sucesso');
    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO não foi inicializado');
    }
    return io;
};
