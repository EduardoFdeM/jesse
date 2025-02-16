// server/routes/knowledge.routes.ts
import { Router } from 'express';
import { upload } from '../config/multer.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import {
    createKnowledgeBaseHandler,
    deleteKnowledgeBaseHandler,
    searchKnowledgeBaseHandler,
    listKnowledgeBasesHandler,
    getKnowledgeBaseHandler
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
    upload.array('files', 20),
    validateRequest({
        body: {
            name: { type: 'string', required: true },
            description: { type: 'string', required: true },
            existingFileIds: { type: 'array', items: { type: 'string' }, required: false }
        }
    }),
    createKnowledgeBaseHandler
);

router.get('/', listKnowledgeBasesHandler);

router.get('/:id', getKnowledgeBaseHandler);

router.get('/:id/search', searchKnowledgeBaseHandler);

router.delete('/:id', deleteKnowledgeBaseHandler);

export default router;
