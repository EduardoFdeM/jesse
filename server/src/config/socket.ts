// socket.ts
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { Socket } from 'socket.io';
import corsOptions from '../config/cors.js';

let io: Server;

export const initializeSocket = (httpServer: HttpServer) => {
    if (io) {
        console.log('Socket.IO já está inicializado');
        return io;
    }

    console.log('Inicializando Socket.IO...');
    
    io = new Server(httpServer, {
        path: '/socket.io/',
        cors: corsOptions,
        allowEIO3: true,
        pingTimeout: 120000,
        pingInterval: 30000,
        transports: ['websocket', 'polling'],
        connectTimeout: 45000
    });

    io.on('connection', (socket: Socket) => {
        console.log('👤 Cliente conectado:', socket.id);

        socket.on('disconnect', (reason) => {
            // Ignorar desconexões normais durante navegação
            if (reason === 'client namespace disconnect' || 
                reason === 'transport close') {
                return;
            }
            console.log('👋 Cliente desconectado:', socket.id, 'Razão:', reason);
        });

        socket.on('error', (error) => {
            console.error('❌ Erro no socket:', error);
        });
    });

    io.engine.on('connection_error', (err) => {
        console.error('❌ Erro de conexão no Engine:', {
            code: err.code,
            message: err.message,
            context: err.context
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
