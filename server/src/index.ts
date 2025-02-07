import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/auth.routes.js';
import translationRoutes from './routes/translation.routes.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
import healthRoutes from './routes/health.routes.js';
import path from 'path';
import { initializeSocket } from './config/socket.js';
import { configureSecurityMiddleware } from './config/security.js';
import cors from 'cors';
import corsOptions from './config/cors.js';
import promptRoutes from './routes/prompt.routes.js';
import { authenticate } from './middlewares/auth.middleware.js';
import adminRoutes from './routes/admin.routes.js';
// Carregar variáveis de ambiente
dotenv.config();

console.log('🚀 Iniciando servidor...');

const app = express();

// Mover estas linhas para antes de qualquer middleware ou rota
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Depois configurar os outros middlewares
configureSecurityMiddleware(app);

// Criar servidor HTTP depois das configurações de CORS
const httpServer = createServer(app);

// Configurar Socket.IO
console.log('🔌 Configurando Socket.IO...');
const io = initializeSocket(httpServer);
console.log('✅ Socket.IO configurado');

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, _res, next) => {
    console.log(`📝 ${req.method} ${req.path}`, {
        headers: req.headers,
        query: req.query,
        body: req.body
    });
    next();
});

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/translated_pdfs', express.static(path.join(process.cwd(), 'translated_pdfs')));

// Rota raiz
app.get('/', (_req, res) => {
    res.json({
        message: 'API do Tradutor de Documentos',
        version: '1.0.0',
        status: 'online',
        timestamp: new Date().toISOString(),
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
app.use('/api/health', healthRoutes);

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/translations', authenticate, translationRoutes);
app.use('/api/knowledge-bases', authenticate, knowledgeRoutes);
app.use('/api/prompts', authenticate, promptRoutes);
app.use('/api/admin', authenticate, adminRoutes);

// Adicionar log específico para debug de autenticação
app.use((req, res, next) => {
    console.log('🔒 Auth Debug:', {
        hasAuthHeader: !!req.headers.authorization,
        authHeader: req.headers.authorization,
        path: req.path,
        user: req.user
    });
    next();
});

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

// Middleware de Erro
interface ServerError extends Error {
    statusCode?: number;
    code?: string;
}

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
    next();
});

// Adicionar middleware para logging de CORS
app.use((req, res, next) => {
  console.log('🔒 CORS Headers:', {
    origin: req.headers.origin,
    method: req.method,
    path: req.path,
    responseHeaders: {
      'access-control-allow-origin': res.getHeader('access-control-allow-origin'),
      'access-control-allow-credentials': res.getHeader('access-control-allow-credentials'),
      'access-control-allow-methods': res.getHeader('access-control-allow-methods'),
      'access-control-allow-headers': res.getHeader('access-control-allow-headers')
    }
  });
  next();
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
