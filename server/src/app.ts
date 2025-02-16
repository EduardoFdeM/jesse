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
import { authenticate } from './middlewares/auth.middleware.js';
import cookieParser from 'cookie-parser';
import adminRoutes from './routes/admin.routes.js';
import assistantRoutes from './routes/assistant.routes.js';
import healthRoutes from './routes/health.routes.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import promptRoutes from './routes/prompt.routes.js';

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
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware de autenticação para rotas protegidas
app.use('/api', authenticate);

// Rotas da API
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/translations', translationRoutes);
app.use('/api/knowledge-bases', knowledgeRoutes);
app.use('/api/assistants', assistantRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/admin', adminRoutes);

// Middleware de erro 404 (deve ser o último)
app.use(notFoundHandler);

// Middleware de erro global
app.use(errorHandler);

export default app; 