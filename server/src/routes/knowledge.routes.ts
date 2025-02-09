// server/routes/knowledge.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    createKnowledgeBaseHandler,
    getKnowledgeBases,
    getKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBaseHandler
} from '../controllers/knowledge.controller.js';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para bases de conhecimento com logs
router.post('/', 
    (req, res, next) => {
        console.log('📥 Criando base de conhecimento');
        next();
    },
    createKnowledgeBaseHandler
);

router.get('/', 
    (req, res, next) => {
        console.log('📋 Listando bases de conhecimento');
        next();
    },
    getKnowledgeBases
);

router.get('/:id', getKnowledgeBase);
router.put('/:id', updateKnowledgeBase);
router.delete('/:id', deleteKnowledgeBaseHandler);

export default router;
