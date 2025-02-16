import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError } from '../utils/errors.js';
import prisma from '../config/database.js';
import openai, { OpenAIAssistant, assistantApi } from '../config/openai.js';

export const getAssistants = async (req: Request, res: Response) => {
    try {
        console.log('📥 Buscando assistants...');
        const assistants = await assistantApi.list();
        console.log('✅ Assistants encontrados:', assistants);
        
        res.json({
            status: 'success',
            data: assistants.data
        });
    } catch (error) {
        console.error('❌ Erro ao buscar assistants:', error);
        res.status(500).json({
            status: 'error',
            message: 'Erro ao buscar assistants'
        });
    }
};

export const createAssistant = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    const { name, description, instructions, tags, model, temperature, isPublic } = req.body;
    
    // Criar assistant na OpenAI
    const openaiAssistant = await openai.beta.assistants.create({
        name,
        instructions,
        model,
        temperature,
        tools: [{ type: "code_interpreter" }]
    });

    // Criar no banco
    const assistant = await prisma.prompt.create({
        data: {
            name,
            description,
            content: instructions,
            instructions,
            tags,
            model,
            temperature,
            isPublic,
            userId,
            assistantId: openaiAssistant.id,
            status: 'active'
        },
    });

    res.status(201).json({ status: 'success', data: assistant });
});

export const getAssistant = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    
    const assistant = await prisma.prompt.findFirst({
        where: { id, userId }
    });
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }
    res.json({ status: 'success', data: assistant });
});

export const updateAssistant = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, description, instructions, tags, model, temperature, isPublic } = req.body;
    
    const assistant = await prisma.prompt.findFirst({ where: { id, userId } });
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }

    // Atualizar na OpenAI se existir assistantId
    if (assistant.assistantId) {
        await openai.assistant.modify(assistant.assistantId, {
            name,
            instructions,
            model
        });
    }

    const updatedAssistant = await prisma.prompt.update({
        where: { id },
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
    const userId = req.user?.id;
    const { id } = req.params;
    
    const assistant = await prisma.prompt.findFirst({ where: { id, userId } });
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }

    // Deletar na OpenAI se existir assistantId
    if (assistant.assistantId) {
        await openai.assistant.delete(assistant.assistantId);
    }

    await prisma.prompt.delete({ where: { id } });
    res.json({ status: 'success', data: null });
}); 