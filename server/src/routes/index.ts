import { Router } from 'express';
import authRoutes from './auth.routes';
import translationRoutes from './translation.routes';
import knowledgeRoutes from './knowledge.routes';

const router = Router();

// Rotas de autenticação
router.use('/auth', authRoutes);

// Rotas de tradução
router.use('/translations', translationRoutes);

// Rotas de glossário
router.use('/knowledge-bases', knowledgeRoutes);

export default router; 