import { Router } from 'express';
import authRoutes from './auth.routes.js';
import translationRoutes from './translation.routes.js';
import knowledgeRoutes from './knowledge.routes.js';
import assistantRoutes from './assistant.routes.js';
import adminRoutes from './admin.routes.js';
import filesRoutes from './files.routes.js';
import healthRoutes from './health.routes.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';

const router = Router();

// Rotas públicas
router.use('/auth', authRoutes);
router.use('/health', healthRoutes);

// Middleware de autenticação para todas as rotas protegidas
router.use(authenticate);

// Rotas protegidas
router.use('/translations', authenticate, translationRoutes);
router.use('/knowledge-bases', authorize(['SUPERUSER', 'TRANSLATOR']), knowledgeRoutes);
router.use('/assistants', authorize(['SUPERUSER', 'TRANSLATOR']), assistantRoutes);
router.use('/admin', authorize(['SUPERUSER']), adminRoutes);
router.use('/files', authorize(['SUPERUSER', 'TRANSLATOR']), filesRoutes);

// Redirecionar /assistant para /assistants (compatibilidade)
router.use('/assistant', (req, res) => {
    res.redirect(307, req.url.replace('/assistant', '/assistants'));
});

export default router;

export { default as assistantRoutes } from './assistant.routes.js';
export { default as authRoutes } from './auth.routes.js';
export { default as translationRoutes } from './translation.routes.js';
export { default as knowledgeRoutes } from './knowledge.routes.js';
export { default as filesRoutes } from './files.routes.js';
export { default as healthRoutes } from './health.routes.js'; 