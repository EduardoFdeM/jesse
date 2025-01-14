/*
import express from 'express';
import { createServer } from 'http';
import { initializeSocket } from './config/socket.js';
import routes from './routes';
import cors from 'cors';
import { errorHandler } from './middlewares/error.middleware.js';

console.log('🚀 Iniciando servidor...');

const app = express();
const httpServer = createServer(app);

console.log('✅ Servidor HTTP criado');

// Configuração do CORS
app.use(cors({
    origin: ['https://pdf-tradutor-of.vercel.app/', 'http://127.0.0.1:5173/'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

console.log('✅ CORS configurado');

// Middlewares
app.use(express.json());

// Middleware para logging
app.use((req, res, next) => {
    console.log('📝 ${req.method} ${req.url}');
    next();
});

// Rotas de teste
app.get('/', (req, res) => {
    console.log('GET / - Rota de teste');
    res.json({ status: 'ok', message: 'Servidor funcionando!' });
});

app.get('/socket.io/', (req, res) => {
    console.log('GET /socket.io/ - Rota de teste Socket.IO');
    res.json({ status: 'ok', message: 'Socket.IO endpoint disponível' });
});

// Rotas da API
app.use('/api', routes);

// Error handling
app.use(errorHandler);

// Inicializar Socket.IO
console.log('🔌 Inicializando Socket.IO...');
const io = initializeSocket(httpServer);
console.log('✅ Socket.IO inicializado');

const PORT = process.env.PORT || 4000;

try {
    httpServer.listen(PORT, () => {
        console.log('=================================');
        console.log('✨ Servidor rodando em http://localhost:${PORT}');
        console.log('Endpoints disponíveis:');
        console.log('- http://localhost:${PORT}/');
        console.log('- http://localhost:${PORT}/socket.io/');
        console.log('=================================');
    });
} catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
}
*/