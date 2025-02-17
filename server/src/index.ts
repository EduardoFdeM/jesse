import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import corsOptions from './config/cors.js';
import { configureSecurityMiddleware } from './config/security.js';
import { initializeSocket } from './config/socket.js';
import apiRoutes from './routes/index.js';
import { UnauthorizedError } from './utils/errors.js';

// Carregar variáveis de ambiente
dotenv.config();

console.log('🚀 Iniciando servidor...');

// Inicialização do Express
const app = express();

// Configuração de proxy (DEVE vir antes de qualquer middleware)
app.set('trust proxy', 1);

// Configuração do __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuração dos diretórios
const uploadsPath = path.join(__dirname, '../uploads');
const translatedPath = path.join(__dirname, '../translated_pdfs');

// Garantir que os diretórios existam
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}
if (!fs.existsSync(translatedPath)) {
    fs.mkdirSync(translatedPath, { recursive: true });
}

console.log('📂 Diretórios de arquivos configurados:', {
    uploads: uploadsPath,
    translated: translatedPath
});

// Configurar CORS
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Configurar middlewares de segurança
configureSecurityMiddleware(app);

// Criar servidor HTTP
const httpServer = createServer(app);

// Configurar Socket.IO
console.log('🔌 Configurando Socket.IO...');
initializeSocket(httpServer);
console.log('✅ Socket.IO configurado');

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Servir arquivos estáticos
app.use('/uploads', express.static(uploadsPath));
app.use('/translated_pdfs', express.static(translatedPath));

// Rotas da API
app.use('/api', apiRoutes);

// Middleware para rotas não encontradas (404)
app.use((req, res) => {
    const error = {
        method: req.method,
        path: req.path,
        message: 'Rota não encontrada',
        availableRoutes: [
            '/api/auth',
            '/api/translations',
            '/api/knowledge-bases',
            '/api/assistants'
        ]
    };
    
    console.log('❌ Rota não encontrada:', error);
    
    res.status(404).json({
        error: 'Rota não encontrada',
        details: error,
        timestamp: new Date().toISOString()
    });
});

// Middleware de erro global
interface ServerError extends Error {
    statusCode?: number;
    code?: string;
}

app.use((err: ServerError, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('❌ Erro não tratado:', {
        method: req.method,
        path: req.path,
        error: err,
        stack: err.stack
    });

    // Tratar erros específicos
    if (err instanceof UnauthorizedError) {
        return res.status(401).json({
            error: 'Não autorizado',
            message: err.message,
            timestamp: new Date().toISOString()
        });
    }

    // Erro padrão
    res.status(err.statusCode || 500).json({
        error: 'Erro interno do servidor',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`✨ Servidor rodando em http://localhost:${PORT}`);
    console.log(`=================================`);
});
