// socket.ts
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
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
        cors: {
            ...corsOptions,
            methods: ['GET', 'POST'],
            credentials: true
        },
        allowEIO3: true,
        pingTimeout: 120000,
        pingInterval: 30000,
        transports: ['websocket', 'polling'],
        connectTimeout: 45000
    });

    io.on('connection', (socket) => {
        console.log('👤 Cliente conectado:', socket.id);

        console.log('🤝 Handshake:', {
            headers: socket.handshake.headers,
            query: socket.handshake.query,
            auth: socket.handshake.auth
        });

        socket.on('disconnect', (reason) => {
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
