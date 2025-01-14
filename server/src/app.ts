import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes.js';
import translationRoutes from './routes/translation.routes.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
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

// Configuração do CORS
app.use(cors({
    origin: [
        'https://pdf-tradutor-of.vercel.app',
        'http://localhost:5173', // para desenvolvimento local
        'https://pdf-tradutor-production.up.railway.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Access-Control-Allow-Origin']
}));

// Middlewares básicos
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
            knowledgeBases: '/api/knowledge-bases'
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

export default app; 