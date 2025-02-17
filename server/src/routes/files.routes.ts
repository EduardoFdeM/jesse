import { Router } from 'express';
import { upload } from '../middlewares/upload.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import openai from '../config/openai.js';
import { BadRequestError } from '../utils/errors.js';
import { listOpenAIFiles, uploadOpenAIFile, deleteOpenAIFile, getOpenAIFile } from '../controllers/files.controller.js';

const router = Router();

// Proteger todas as rotas para SUPERUSER
router.use(authorize(['SUPERUSER']));

// Listar arquivos OpenAI
router.get('/', listOpenAIFiles);

// Upload de arquivo OpenAI
router.post('/upload', upload.array('files'), uploadOpenAIFile);

// Deletar arquivo OpenAI
router.delete('/:fileId', deleteOpenAIFile);

// Obter detalhes do arquivo
router.get('/:fileId', getOpenAIFile);

export default router; 