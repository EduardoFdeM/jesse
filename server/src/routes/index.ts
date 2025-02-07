import { Router } from 'express';
import authRoutes from './auth.routes.js';
import translationRoutes from './translation.routes.js';
import knowledgeRoutes from './knowledge.routes.js';
import promptRoutes from './prompt.routes.js';
import adminRoutes from './admin.routes.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';

const router = Router();

// Rotas públicas
router.use('/auth', authRoutes);

// Middleware de autenticação para todas as rotas protegidas
router.use(authenticate);

// Rotas protegidas
router.use('/translations', authorize(['SUPERUSER', 'TRANSLATOR']), translationRoutes);
router.use('/knowledge-bases', authorize(['SUPERUSER', 'TRANSLATOR']), knowledgeRoutes);
router.use('/prompts', authorize(['SUPERUSER', 'TRANSLATOR']), promptRoutes);
router.use('/admin', authorize(['SUPERUSER']), adminRoutes);

export default router;

export { default as promptRoutes } from './prompt.routes.js';
export { default as authRoutes } from './auth.routes.js';
export { default as translationRoutes } from './translation.routes.js';
export { default as knowledgeRoutes } from './knowledge.routes.js'; 