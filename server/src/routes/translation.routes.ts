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
    updateTranslationContent,
    shareTranslation,
    getSharedTranslations,
    updateViewStatus
} from '../controllers/translation.controller.js';
import { upload } from '../middlewares/upload.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Aplicar autenticação em todas as rotas
router.use(authenticate);

// Rotas de tradução
router.post('/', authorize(['SUPERUSER', 'TRANSLATOR']), upload.single('file'), createTranslation);
router.get('/shared', authorize(['EDITOR', 'TRANSLATOR', 'SUPERUSER']), getSharedTranslations);
router.get('/', authorize(['SUPERUSER', 'TRANSLATOR']), getTranslations);
router.get('/:id', authorize(['SUPERUSER', 'TRANSLATOR', 'EDITOR']), getTranslation);
router.get('/:id/download', authorize(['SUPERUSER', 'TRANSLATOR', 'EDITOR']), downloadTranslation);
router.delete('/clear-history', authorize(['SUPERUSER', 'TRANSLATOR']), clearTranslationHistory);

// Rotas para edição e deleção
router.get('/:id/content', authorize(['SUPERUSER', 'TRANSLATOR', 'EDITOR']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        await getTranslationContent(req, res, next);
    } catch (error) {
        next(error);
    }
});

router.put('/:id/content', authorize(['SUPERUSER', 'TRANSLATOR', 'EDITOR']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        await updateTranslationContent(req, res, next);
    } catch (error) {
        next(error);
    }
});

// Rota para atualizar status de visualização
router.put('/:id/view-status', authorize(['EDITOR']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        await updateViewStatus(req, res, next);
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', authorize(['SUPERUSER', 'TRANSLATOR']), deleteTranslation);

// Rota de compartilhamento
router.post('/:id/share', authorize(['SUPERUSER', 'TRANSLATOR']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        await shareTranslation(req, res, next);
    } catch (error) {
        next(error);
    }
});

export default router;
