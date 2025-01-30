// server/routes/translation.routes.ts
import { Router } from 'express';
import { 
    createTranslation, 
    downloadTranslation, 
    getTranslation, 
    getTranslations, 
    clearTranslationHistory, 
    getTranslationContent, 
    deleteTranslation,
    updateTranslationContent 
} from '../controllers/translation.controller.js';
import { upload } from '../middlewares/upload.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Aplicar autenticação em todas as rotas
router.use(authenticate);

// Rotas de tradução
router.post('/', upload.single('file'), createTranslation);
router.get('/', getTranslations);
router.get('/:id', getTranslation);
router.get('/:id/download', downloadTranslation);
router.delete('/clear-history', clearTranslationHistory);

// Rotas para edição e deleção
router.get('/:id/content', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await getTranslationContent(req, res, next);
    } catch (error) {
        next(error);
    }
});

router.put('/:id/content', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await updateTranslationContent(req, res, next);
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', deleteTranslation);

export default router;
