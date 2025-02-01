import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes.js';
import translationRoutes from './routes/translation.routes.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
import corsOptions from './config/cors.js';
import promptRoutes from './routes/prompt.routes.js';
import { authenticate } from './middlewares/auth.middleware.js';
import cookieParser from 'cookie-parser';

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

// Inicialização do Express
const app = express();

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração do CORS
app.use(cors(corsOptions));

// Adicionar middleware para preflight requests
app.options('*', cors(corsOptions));

app.use(cookieParser());

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
app.use('/uploads', express.static(uploadsPath));
app.use('/translated_pdfs', express.static(translatedPath));

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
            prompts: '/api/prompts',
            socket: '/socket.io'
        }
    });
});

// Health Check
import healthRoutes from './routes/health.routes.js';
app.use('/api/health', healthRoutes);

// Middleware de verificação de rotas
const routeLogger = (prefix: string) => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    console.log(`📝 ${req.method} ${prefix}${req.path}`, {
        headers: req.headers,
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined
    });
    next();
};

// Rotas públicas
app.use('/api/auth', routeLogger('/api/auth'), authRoutes);

// Middleware de autenticação
app.use('/api', authenticate);

// Rotas protegidas: registra autenticação apenas para a rota de prompts
app.use('/api/prompts', authenticate, routeLogger('/api/prompts'), promptRoutes);
app.use('/api/translations', routeLogger('/api/translations'), translationRoutes);
app.use('/api/knowledge-bases', routeLogger('/api/knowledge-bases'), knowledgeRoutes);

// Adicionar log para debug
app.use((req, res, next) => {
    console.log('🔍 Rota acessada:', {
        method: req.method,
        path: req.path,
        baseUrl: req.baseUrl,
        originalUrl: req.originalUrl,
        user: req.user?.id
    });
    next();
});

// Log após registro de rotas
console.log('✅ Rotas registradas:', {
    auth: '/api/auth',
    translations: '/api/translations',
    knowledgeBases: '/api/knowledge-bases',
    prompts: '/api/prompts'
});

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
            '/api/prompts'
        ]
    };
    
    console.log('❌ Rota não encontrada:', error);
    
    res.status(404).json({
        error: 'Rota não encontrada',
        details: error,
        timestamp: new Date().toISOString()
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

export default app; 