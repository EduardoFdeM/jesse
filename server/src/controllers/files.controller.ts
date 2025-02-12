import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/errors.js';
import openai from '../config/openai.js';

// Listar arquivos OpenAI
export const listOpenAIFiles = asyncHandler(async (req: Request, res: Response) => {
    const files = await openai.files.list();
    res.json({
        status: 'success',
        data: files.data
    });
});

// Upload de arquivo OpenAI
export const uploadOpenAIFile = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        throw new BadRequestError('Nenhum arquivo enviado');
    }

    const result = await openai.files.upload(file.buffer, file.originalname);
    res.json({
        status: 'success',
        data: result
    });
});

// Deletar arquivo OpenAI
export const deleteOpenAIFile = asyncHandler(async (req: Request, res: Response) => {
    const { fileId } = req.params;
    await openai.files.delete(fileId);
    res.json({
        status: 'success',
        data: null
    });
}); 