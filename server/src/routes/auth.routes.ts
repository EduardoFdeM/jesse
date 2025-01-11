// server/routes/auth.routes.ts
import { Router } from 'express';
import { login, register, verifyToken } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Rotas públicas
router.post('/login', login);
router.post('/register', register);

// Rota protegida
router.get('/verify', authenticate, verifyToken);

export default router;
