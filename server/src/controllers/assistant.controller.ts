import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';
import prisma from '../config/database.js';
import openai, { OpenAIAssistant } from '../config/openai.js';

// Verificação de autenticação comum
const verifyUser = (userId: string | undefined): void => {
    if (!userId) {
        throw new UnauthorizedError('Não autenticado');
    }
};

export const getAssistants = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    // Buscar assistants da OpenAI
    const openaiAssistants = await openai.assistant.list();
    
    // Buscar assistants do banco
    const dbAssistants = await prisma.assistant.findMany({ 
        where: { 
            OR: [
                { userId: req.user!.id },
                { isPublic: true }
            ]
        },
        orderBy: { createdAt: 'desc' }
    });

    // Filtrar apenas os assistants que existem na OpenAI e remover o assistant padrão
    const assistants = dbAssistants.filter(assistant => 
        assistant.assistantId && 
        openaiAssistants.data.some(oa => 
            oa.id === assistant.assistantId && 
            oa.id !== process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID
        )
    );
    
    res.json({ 
        status: 'success', 
        data: assistants,
        message: 'Assistants carregados com sucesso'
    });
});

export const createAssistant = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    const { name, description, instructions, tags, model, temperature, isPublic } = req.body;
    
    // Criar assistant na OpenAI
    const openaiAssistant = await openai.assistant.create({
        name,
        instructions,
        model: model || 'gpt-4o-mini',
        temperature
    });

    // Criar no banco
    const assistant = await prisma.assistant.create({
        data: {
            name,
            description,
            instructions,
            tags,
            model: model || 'gpt-4o-mini',
            temperature: temperature || 0.3,
            isPublic,
            userId: req.user!.id,
            assistantId: openaiAssistant.id,
            status: 'active'
        },
    });

    res.status(201).json({ status: 'success', data: assistant });
});

export const getAssistant = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    const assistant = await prisma.assistant.findFirst({
        where: { 
            id: req.params.id, 
            userId: req.user!.id 
        }
    });
    
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }
    
    res.json({ status: 'success', data: assistant });
});

export const updateAssistant = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    const { name, description, instructions, tags, model, temperature, isPublic } = req.body;
    
    const assistant = await prisma.assistant.findFirst({ 
        where: { 
            id: req.params.id, 
            userId: req.user!.id 
        } 
    });
    
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }

    // Atualizar na OpenAI se existir assistantId
    if (assistant.assistantId) {
        await openai.assistant.modify(assistant.assistantId, {
            name,
            instructions,
            model,
        });
    }

    const updatedAssistant = await prisma.assistant.update({
        where: { id: req.params.id },
        data: { 
            name, 
            description, 
            instructions, 
            tags, 
            model, 
            temperature,
            isPublic 
        },
    });
    
    res.json({ status: 'success', data: updatedAssistant });
});

export const deleteAssistant = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    const assistant = await prisma.assistant.findFirst({ 
        where: { 
            id: req.params.id, 
            userId: req.user!.id 
        } 
    });
    
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }

    // Deletar na OpenAI se existir assistantId
    if (assistant.assistantId) {
        await openai.assistant.delete(assistant.assistantId);
    }

    await prisma.assistant.delete({ where: { id: req.params.id } });
    res.json({ status: 'success', data: null });
}); 