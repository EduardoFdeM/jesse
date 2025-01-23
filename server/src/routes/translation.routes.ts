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

const router = Router();

// Aplicar autenticação em todas as rotas
router.use(authenticate);

// Rotas de tradução
router.post('/', upload.single('file'), createTranslation);
router.get('/', getTranslations);
router.get('/:id', getTranslation);
router.get('/:id/download', downloadTranslation);
router.delete('/clear-history', clearTranslationHistory);

// Novas rotas para edição e deleção
router.get('/:id/content', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const content = await getTranslationContent(id);
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar conteúdo' });
  }
});

router.put('/:id/content', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    await updateTranslationContent(id, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar conteúdo' });
  }
});

router.delete('/:id', authenticate, deleteTranslation);

export default router;
