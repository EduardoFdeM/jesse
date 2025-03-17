import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';
import prisma from '../config/database.js';
import openai from '../config/openai.js';

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
                { isPublic: true },
                { editableBy: { some: { id: req.user!.id } } }
            ]
        },
        include: {
            editableBy: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            },
            knowledgeBase: true
        },
        orderBy: { createdAt: 'desc' }
    });

    // Filtrar apenas os assistants que existem na OpenAI e estão ativos
    const assistants = dbAssistants.filter(assistant => 
        assistant.assistantId && 
        assistant.status === 'active' &&
        openaiAssistants.data.some(oa => oa.id === assistant.assistantId)
    ).map(assistant => ({
        ...assistant,
        assistantId: assistant.assistantId
    }));
    
    res.json({ 
        status: 'success', 
        data: assistants,
        message: 'Assistants carregados com sucesso'
    });
});

export const createAssistant = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    const { name, description, instructions, tags, model, temperature, isPublic, canEdit, editableBy, knowledgeBaseId } = req.body;
    
    // Buscar vectorStoreId se houver knowledgeBase
    let vectorStoreId: string | undefined;
    if (knowledgeBaseId) {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id: knowledgeBaseId }
        });
        vectorStoreId = knowledgeBase?.vectorStoreId || undefined;
    }

    // Criar assistant na OpenAI com configurações de vector store
    const openaiAssistant = await openai.assistant.create({
        name,
        instructions,
        model: model || 'gpt-4o-mini',
        temperature,
        tools: [{ 
            type: "file_search",
            file_search: {
                ranking_options: {
                    ranker: "default_2024_08_21",
                    score_threshold: 0.0
                }
            }
        }],
        ...(vectorStoreId && {
            tool_resources: {
                file_search: {
                    vector_store_ids: [vectorStoreId]
                }
            }
        })
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
            canEdit,
            userId: req.user!.id,
            assistantId: openaiAssistant.id,
            status: 'active',
            knowledgeBaseId,
            editableBy: canEdit && editableBy ? {
                connect: editableBy.map((id: string) => ({ id }))
            } : undefined
        },
        include: {
            editableBy: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            },
            knowledgeBase: true
        }
    });

    res.status(201).json({ status: 'success', data: assistant });
});

export const getAssistant = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    const assistant = await prisma.assistant.findFirst({
        where: { 
            id: req.params.id, 
            userId: req.user!.id 
        },
        include: {
            knowledgeBase: true
        }
    });
    
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }
    
    res.json({ status: 'success', data: assistant });
});

export const updateAssistant = asyncHandler(async (req: Request, res: Response) => {
    verifyUser(req.user?.id);
    
    const { name, description, instructions, tags, model, temperature, isPublic, canEdit, editableBy, knowledgeBaseId } = req.body;
    
    const assistant = await prisma.assistant.findFirst({ 
        where: { 
            id: req.params.id, 
            OR: [
                { userId: req.user!.id },
                { editableBy: { some: { id: req.user!.id } } }
            ]
        },
        include: {
            knowledgeBase: true
        }
    });
    
    if (!assistant) {
        throw new NotFoundError('Assistant não encontrado');
    }

    // Buscar vectorStoreId se houver knowledgeBase
    let vectorStoreId: string | undefined;
    if (knowledgeBaseId) {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id: knowledgeBaseId }
        });
        vectorStoreId = knowledgeBase?.vectorStoreId || undefined;
    } else if (assistant.knowledgeBase?.vectorStoreId) {
        vectorStoreId = assistant.knowledgeBase.vectorStoreId;
    }

    // Atualizar na OpenAI se existir assistantId
    if (assistant.assistantId) {
        const openaiUpdateParams = {
            name: name || assistant.name,
            instructions: instructions || assistant.instructions,
            model: model || assistant.model,
            temperature: temperature ?? assistant.temperature,
            tools: [{ 
                type: "file_search",
                file_search: {
                    ranking_options: {
                        ranker: "default_2024_08_21",
                        score_threshold: 0.0
                    }
                }
            }],
            tool_resources: vectorStoreId ? {
                file_search: {
                    vector_store_ids: [vectorStoreId]
                }
            } : undefined
        };

        await openai.assistant.modify(assistant.assistantId, openaiUpdateParams);
    }

    // Atualizar no banco
    const updatedAssistant = await prisma.assistant.update({
        where: { id: req.params.id },
        data: { 
            name, 
            description, 
            instructions, 
            tags, 
            model, 
            temperature,
            isPublic,
            canEdit,
            knowledgeBaseId,
            editableBy: {
                set: canEdit && editableBy ? editableBy.map((id: string) => ({ id })) : []
            }
        },
        include: {
            editableBy: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            },
            knowledgeBase: true
        }
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