// server/routes/translation.routes.ts
import { Router } from 'express';
import { createTranslation, downloadTranslation, getTranslation, getTranslations, clearTranslationHistory } from '../controllers/translation.controller';
import { upload, uploadLock, uploadUnlock } from '../middlewares/upload.middleware';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Rotas protegidas por autenticação
router.use(authenticate);

// Rota de upload com lock
router.post('/', 
    uploadLock,
    upload.single('file'),
    createTranslation,
    uploadUnlock
);

// Outras rotas
router.get('/', getTranslations);
router.get('/:id', getTranslation);
router.get('/:id/download', downloadTranslation);
router.delete('/clear-history', clearTranslationHistory);

export default router;
