// server/routes/knowledge.routes.ts
import { Router } from 'express';
import { upload } from '../middlewares/upload.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    createKnowledgeBase,
    getKnowledgeBases,
    getKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase
} from '../controllers/knowledge.controller.js';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para bases de conhecimento com logs
router.post('/', 
    (req, res, next) => {
        console.log('📥 Recebendo arquivo para base de conhecimento');
        next();
    },
    upload.single('file'),
    createKnowledgeBase
);

router.get('/', 
    (req, res, next) => {
        console.log('📋 Listando bases de conhecimento');
        next();
    },
    getKnowledgeBases
);

router.get('/:id', getKnowledgeBase);
router.put('/:id', upload.single('file'), updateKnowledgeBase);
router.delete('/:id', deleteKnowledgeBase);

export default router;
