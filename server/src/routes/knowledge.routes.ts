// server/routes/knowledge.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import { validateRequest } from '../middlewares/validateRequest.middleware.js';
import { KnowledgeController } from '../controllers/knowledge.controller.js';

const router = Router();
const controller = new KnowledgeController();

// Mover o middleware de log para o início
router.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`📋 ${req.method} ${req.path}`);
    next();
});

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
    controller.createKnowledgeBase
);

router.get('/', 
    (req, res, next) => {
        console.log('📋 Listando bases de conhecimento');
        next();
    },
    controller.getKnowledgeBases
);

router.get('/:id', controller.getKnowledgeBase);
router.get('/:id/files', controller.getKnowledgeBaseFiles);
router.put(
    '/:id',
    upload.array('files', 10),
    validateRequest({
        params: {
            id: { type: 'string', required: true }
        },
        body: {
            name: { type: 'string', required: true },
            description: { type: 'string', required: true },
            existingFileIds: { type: 'array', items: { type: 'string' }, required: false }
        }
    }),
    controller.updateKnowledgeBase
);
router.delete('/:id', controller.deleteKnowledgeBaseHandler);

// Vector Stores
router.get('/vector_stores', controller.listVectorStores);
router.post(
    '/vector_stores',
    upload.array('files', 10),
    validateRequest({
        body: {
            name: { type: 'string', required: true },
            description: { type: 'string', required: true },
            existingFileIds: { type: 'array', items: { type: 'string' }, required: false }
        }
    }),
    controller.createVectorStore
);
router.delete('/vector_stores/:id', controller.deleteVectorStore);

// Vector Store Files
router.post(
    '/vector_stores/:id/files',
    upload.single('file'),
    validateRequest({
        params: {
            id: { type: 'string', required: true }
        }
    }),
    controller.addFileToVectorStore
);
router.delete(
    '/vector_stores/:id/files/:fileId',
    validateRequest({
        params: {
            id: { type: 'string', required: true },
            fileId: { type: 'string', required: true }
        }
    }),
    controller.removeFileFromVectorStore
);

// OpenAI Files
router.get('/files', controller.listOpenAIFiles);
router.post('/files', upload.single('file'), controller.createOpenAIFile);
router.delete('/files/:fileId', controller.deleteOpenAIFile);

// OpenAI Vector Stores
router.get('/vector_stores/openai', controller.listVectorStores);

export default router;
