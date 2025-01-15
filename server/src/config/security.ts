import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';
import corsOptions from './cors.js';

export const configureSecurityMiddleware = (app: Express) => {
  // CORS configuration - única configuração de CORS
  app.use(cors(corsOptions));

  // Basic security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Desabilitar temporariamente para debug
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  app.use(helmet.hidePoweredBy());
};
