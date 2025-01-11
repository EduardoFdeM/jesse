// server/routes/knowledge.routes.ts
import { Router } from 'express';
import { upload } from '../middlewares/upload.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import {
    createKnowledgeBase,
    listKnowledgeBases,
    getKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase
} from '../controllers/glossary.controller';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para bases de conhecimento
router.post('/', upload.single('file'), createKnowledgeBase);
router.get('/', listKnowledgeBases);
router.get('/:id', getKnowledgeBase);
router.put('/:id', upload.single('file'), updateKnowledgeBase);
router.delete('/:id', deleteKnowledgeBase);

export default router;
