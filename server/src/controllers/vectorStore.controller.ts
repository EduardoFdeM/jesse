import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createVectorStore, deleteVectorStore, listVectorStores } from '../services/vectorStore.service.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/errors.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

// Criar Vector Store
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!req.user?.id) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    if (!name || !description) {
        throw new BadRequestError('Nome e descrição são obrigatórios');
    }

    if (!files || files.length === 0) {
        throw new BadRequestError('É necessário enviar pelo menos um arquivo');
    }

    // Verificar limite de arquivos (mantendo consistência com knowledge.controller)
    if (files.length > 20) {
        throw new BadRequestError('Limite máximo de 20 arquivos por Vector Store');
    }

    const vectorStore = await createVectorStore({
        name,
        description,
        files,
        userId: req.user.id
    });

    res.status(201).json(vectorStore);
});

// Listar Vector Stores
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    const vectorStores = await listVectorStores(req.user.id);
    res.json(vectorStores);
});

// Deletar Vector Store
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    await deleteVectorStore(req.params.id, req.user.id);
    res.status(204).send();
}); 