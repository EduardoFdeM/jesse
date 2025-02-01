import { Router } from 'express';
import authRoutes from './auth.routes.js';
import translationRoutes from './translation.routes.js';
import knowledgeRoutes from './knowledge.routes.js';

const router = Router();

// Rotas de autenticação
router.use('/auth', authRoutes);

// Rotas de tradução
router.use('/translations', translationRoutes);

// Rotas de glossário
router.use('/knowledge-bases', knowledgeRoutes);

export default router;

export { default as promptRoutes } from './prompt.routes.js';
export { default as authRoutes } from './auth.routes.js';
export { default as translationRoutes } from './translation.routes.js';
export { default as knowledgeRoutes } from './knowledge.routes.js'; 