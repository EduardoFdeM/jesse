// server/routes/knowledge.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import {
    createKnowledgeBaseHandler,
    getKnowledgeBases,
    getKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBaseHandler,
    getKnowledgeBaseFiles
} from '../controllers/knowledge.controller.js';
import { validateRequest } from '../middlewares/validateRequest.middleware.js';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas protegidas por autenticação
router.use(authorize(['EDITOR', 'TRANSLATOR', 'SUPERUSER']));

// Rotas para bases de conhecimento com logs
router.post(
    '/',
    upload.array('files', 10),
    validateRequest({
        body: {
            name: { type: 'string', required: true },
            description: { type: 'string', required: true },
            existingFileIds: { type: 'array', items: { type: 'string' }, required: false }
        }
    }),
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
router.get('/:id/files', getKnowledgeBaseFiles);
router.put('/:id', updateKnowledgeBase);
router.delete('/:id', deleteKnowledgeBaseHandler);

export default router;
