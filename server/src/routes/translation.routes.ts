// server/routes/translation.routes.ts
import { Router } from 'express';
import { createTranslation, downloadTranslation, getTranslation, getTranslations, clearTranslationHistory } from '../controllers/translation.controller.js';
import { upload, uploadLock, uploadUnlock } from '../middlewares/upload.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Rotas protegidas por autenticação
router.use(authenticate);

// Rota de upload com lock e logs
router.post('/', 
    (req, res, next) => {
        console.log('🔒 [1/4] Iniciando lock de upload');
        uploadLock(req, res, next);
    },
    upload.single('file'),
    (req, res, next) => {
        console.log('📁 [2/4] Arquivo recebido:', req.file?.originalname);
        next();
    },
    createTranslation,
    (req, res, next) => {
        console.log('🔓 [4/4] Finalizando upload e liberando lock');
        uploadUnlock(req, res, next);
    }
);

// Outras rotas com logs
router.get('/', (req, res, next) => {
    console.log('📋 Listando traduções');
    getTranslations(req, res, next);
});

router.get('/:id', getTranslation);
router.get('/:id/download', downloadTranslation);
router.delete('/clear-history', clearTranslationHistory);

export default router;
