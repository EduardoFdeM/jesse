import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/auth.routes.js';
import translationRoutes from './routes/translation.routes.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';
import path from 'path';
import { initializeSocket } from './config/socket.js';

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
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:5173',
        'http://localhost:4000',
        'http://127.0.0.1:4000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
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

// Health Check
import healthRoutes from './routes/health.routes.js';
app.use('/api/health', healthRoutes);

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/translations', translationRoutes);
app.use('/api/knowledge-bases', knowledgeRoutes);

// Tratamento de erros 404
app.use((req, res) => {
    console.log('❌ Rota não encontrada:', {
        method: req.method,
        path: req.path,
        headers: req.headers
    });
    res.status(404).json({
        error: 'Rota não encontrada',
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        availableEndpoints: {
            root: '/',
            auth: '/api/auth',
            translations: '/api/translations',
            knowledgeBases: '/api/knowledge-bases'
        }
    });
});

// Substituir o tipo 'any' por um tipo específico
interface ServerError extends Error {
    statusCode?: number;
    code?: string;
}

// Atualizar o middleware de erro
app.use((err: ServerError, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ Erro não tratado:', {
        method: req.method,
        path: req.path,
        error: err,
        stack: err.stack
    });
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: err.message,
        timestamp: new Date().toISOString()
    });
    next(); // Adicionado para resolver o warning de variável não utilizada
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`✨ Servidor rodando em http://localhost:${PORT}`);
    console.log(`Endpoints disponíveis:`);
    console.log(`- http://localhost:${PORT}/`);
    console.log(`- http://localhost:${PORT}/socket.io/`);
    console.log(`=================================`);
});

export default app;
