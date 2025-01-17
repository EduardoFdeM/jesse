// server/routes/translation.routes.ts
import { Router } from 'express';
import { createTranslation, downloadTranslation, getTranslation, getTranslations, clearTranslationHistory } from '../controllers/translation.controller.js';
import { upload } from '../middlewares/upload.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Simplificando a rota de upload
router.post('/', upload.single('file'), createTranslation);

router.get('/', getTranslations);
router.get('/:id', getTranslation);
router.get('/:id/download', downloadTranslation);
router.delete('/clear-history', clearTranslationHistory);

export default router;
