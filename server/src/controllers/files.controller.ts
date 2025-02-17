import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/errors.js';
import openai from '../config/openai.js';

// Listar arquivos OpenAI
export const listOpenAIFiles = asyncHandler(async (req: Request, res: Response) => {
    const files = await openai.files.list();
    // Garantir que cada arquivo tenha o campo filename
    const filesWithNames = files.data.map(file => ({
        ...file,
        filename: file.filename || `file-${file.id}` // Fallback para um nome baseado no ID
    }));
    res.json({
        status: 'success',
        data: filesWithNames
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

// Adicionar este método
export const getOpenAIFile = asyncHandler(async (req: Request, res: Response) => {
    const { fileId } = req.params;
    const file = await openai.files.get(fileId);
    res.json({
        status: 'success',
        data: file
    });
}); 