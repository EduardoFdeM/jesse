import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/auth.routes';
import translationRoutes from './routes/translation.routes';
import knowledgeRoutes from './routes/knowledge.routes';
import { errorHandler } from './middlewares/error.middleware';
import path from 'path';
import { initializeSocket } from './config/socket';

// Carregar variáveis de ambiente
dotenv.config();

console.log('🚀 Iniciando servidor...');

const app = express();
const httpServer = createServer(app);

// Configurar Socket.IO
console.log('🔌 Configurando Socket.IO...');
const io = initializeSocket(httpServer);
console.log('✅ Socket.IO configurado');

// Middlewares
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/translated_pdfs', express.static(path.join(process.cwd(), 'translated_pdfs')));

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        message: 'API do Tradutor de Documentos',
        version: '1.0.0',
        status: 'online',
        timestamp: new Date(),
        endpoints: {
            root: '/',
            auth: '/api/auth',
            translations: '/api/translations',
            knowledgeBases: '/api/knowledge-bases',
            socket: '/socket.io'
        }
    });
});

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/translations', translationRoutes);
app.use('/api/knowledge-bases', knowledgeRoutes);

// Middleware de erro
app.use(errorHandler);

// Iniciar servidor
const PORT = process.env.PORT || 4000;

try {
    httpServer.listen(PORT, () => {
        console.log('=================================');
        console.log(`✨ Servidor rodando em http://localhost:${PORT}`);
        console.log('Socket.IO configurado e pronto');
        console.log('=================================');
    });
} catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
}
