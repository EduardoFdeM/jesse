import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError } from '../utils/errors.js';
import prisma from '../config/database.js';

export const getPrompts = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    
    const prompts = await prisma.prompt.findMany({ 
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });

    console.log('Prompts encontrados:', prompts.length);
    
    res.json({ 
        status: 'success', 
        data: prompts,
        message: 'Prompts carregados com sucesso'
    });
});

export const createPrompt = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    const { name, description, content, tags, version } = req.body;
    
    const prompt = await prisma.prompt.create({
        data: {
            name,
            description,
            content,
            tags,
            version,
            userId
        },
    });
    res.status(201).json({ status: 'success', data: prompt });
});

export const getPrompt = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    
    const prompt = await prisma.prompt.findFirst({
        where: { id, userId }
    });
    if (!prompt) {
        throw new NotFoundError('Prompt não encontrado');
    }
    res.json({ status: 'success', data: prompt });
});

export const updatePrompt = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, description, content, tags, version } = req.body;
    
    const prompt = await prisma.prompt.findFirst({ where: { id, userId } });
    if (!prompt) {
        throw new NotFoundError('Prompt não encontrado');
    }
    const updatedPrompt = await prisma.prompt.update({
        where: { id },
        data: { name, description, content, tags, version },
    });
    res.json({ status: 'success', data: updatedPrompt });
});

export const deletePrompt = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    
    const prompt = await prisma.prompt.findFirst({ where: { id, userId } });
    if (!prompt) {
        throw new NotFoundError('Prompt não encontrado');
    }
    await prisma.prompt.delete({ where: { id } });
    res.json({ status: 'success', data: null });
}); 