import { Router } from 'express';
import { upload } from '../middlewares/upload.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import openai from '../config/openai.js';
import { BadRequestError } from '../utils/errors.js';

const router = Router();

// Proteger todas as rotas para SUPERUSER
router.use(authorize(['SUPERUSER']));

// Listar arquivos
router.get('/', async (req, res) => {
    try {
        const response = await openai.files.list();
        res.json({ status: 'success', data: response.data });
    } catch (error) {
        console.error('Erro ao listar arquivos:', error);
        res.status(500).json({ status: 'error', message: 'Erro ao listar arquivos' });
    }
});

// Upload de arquivos
router.post('/upload', upload.array('files'), async (req, res) => {
    try {
        const uploadedFiles = req.files as Express.Multer.File[];
        
        if (!uploadedFiles || uploadedFiles.length === 0) {
            throw new BadRequestError('Nenhum arquivo enviado');
        }

        const results = await Promise.all(uploadedFiles.map(file => 
            openai.files.upload(file.buffer, file.originalname)
        ));

        res.json({ status: 'success', data: results });
    } catch (error) {
        console.error('Erro ao fazer upload de arquivos:', error);
        res.status(500).json({ status: 'error', message: 'Erro ao fazer upload de arquivos' });
    }
});

// Deletar arquivo
router.delete('/:id', async (req, res) => {
    try {
        await openai.files.delete(req.params.id);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Erro ao deletar arquivo:', error);
        res.status(500).json({ status: 'error', message: 'Erro ao deletar arquivo' });
    }
});

export default router; 