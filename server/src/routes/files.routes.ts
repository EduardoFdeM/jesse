import { Router } from 'express';
import { upload } from '../middlewares/upload.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import openai from '../config/openai.js';
import { BadRequestError } from '../utils/errors.js';

const router = Router();

// Proteger todas as rotas para SUPERUSER
router.use(authorize(['SUPERUSER']));

// Listar arquivos OpenAI
router.get('/', async (req, res) => {
    try {
        const files = await openai.files.list();
        res.json({
            status: 'success',
            data: files.data
        });
    } catch (error) {
        console.error('Erro ao listar arquivos:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Erro ao listar arquivos' 
        });
    }
});

// Upload de arquivo OpenAI
router.post('/upload', upload.array('files'), async (req, res) => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            throw new BadRequestError('Nenhum arquivo enviado');
        }

        const results = await Promise.all(
            files.map(file => openai.files.upload(file.buffer, file.originalname))
        );

        res.json({
            status: 'success',
            data: results
        });
    } catch (error) {
        console.error('Erro ao fazer upload:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Erro ao fazer upload' 
        });
    }
});

// Deletar arquivo OpenAI
router.delete('/:fileId', async (req, res) => {
    try {
        await openai.files.delete(req.params.fileId);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Erro ao deletar arquivo:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Erro ao deletar arquivo' 
        });
    }
});

export default router; 