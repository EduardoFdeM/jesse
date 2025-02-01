import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';
import corsOptions from './cors.js';

export const configureSecurityMiddleware = (app: Express) => {
  // Ajustar rate limit
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200, // Aumentar limite
    message: 'Muitas requisições, tente novamente mais tarde',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', limiter); // Aplicar apenas em rotas da API

  // Configurar CORS mais permissivo para desenvolvimento
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // Basic security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Desabilitar temporariamente para debug
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false
    })
  );

  app.use(helmet.hidePoweredBy());
};
