import { Request, Response } from 'express';
import prisma from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Listar todos os usuários
export const getUsers = asyncHandler(async (_req: Request, res: Response) => {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    translations: true,
                    knowledgeBases: true,
                    prompts: true
                }
            }
        }
    });

    res.json({ users });
});

// Obter detalhes de um usuário específico
export const getUserDetails = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
        where: { id },
        include: {
            translations: {
                orderBy: { createdAt: 'desc' },
                take: 10 // Últimas 10 traduções
            },
            knowledgeBases: true,
            prompts: true
        }
    });

    if (!user) {
        throw new NotFoundError('Usuário não encontrado');
    }

    res.json({ user });
});

// Interfaces para tipagem
interface TranslationCostData {
    totalCost: number;
    processingTime: number;
}

// Obter estatísticas de um usuário
export const getUserStats = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
        where: { id },
        include: {
            _count: {
                select: {
                    translations: true,
                    knowledgeBases: true,
                    prompts: true
                }
            },
            translations: {
                select: {
                    id: true,
                    fileName: true,
                    sourceLanguage: true,
                    targetLanguage: true,
                    status: true,
                    createdAt: true,
                    costData: true
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            },
            prompts: {
                select: {
                    id: true,
                    name: true,
                    description: true,
                    model: true,
                    temperature: true
                },
                orderBy: { createdAt: 'desc' },
                take: 5
            }
        }
    });

    if (!user) {
        throw new NotFoundError('Usuário não encontrado');
    }

    // Atualizar cálculo de custos totais
    const totalCost = user.translations?.reduce((acc: number, translation) => {
        if (translation.costData) {
            try {
                const costData = JSON.parse(translation.costData) as TranslationCostData;
                return acc + (costData.totalCost || 0);
            } catch {
                return acc;
            }
        }
        return acc;
    }, 0) || 0;

    // Atualizar estatísticas de traduções por status
    const translationStats = user.translations?.reduce((acc: Record<string, number>, translation) => {
        acc[translation.status] = (acc[translation.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>) || {};

    // Calcular taxa de sucesso
    const successRate = user.translations?.length ? 
        (user.translations.filter(t => t.status === 'completed').length / user.translations.length) * 100 : 0;

    // Atualizar cálculo do tempo médio
    const averageTranslationTime = user.translations?.reduce((acc: number, translation) => {
        if (translation.costData) {
            try {
                const costData = JSON.parse(translation.costData) as TranslationCostData;
                return acc + (costData.processingTime || 0);
            } catch {
                return acc;
            }
        }
        return acc;
    }, 0);

    const avgTime = user.translations?.length ? averageTranslationTime / user.translations.length : 0;

    // Atualizar custos por mês
    const costByMonth = user.translations?.reduce((acc: Record<string, number>, translation) => {
        if (translation.costData) {
            try {
                const month = new Date(translation.createdAt).toLocaleString('default', { month: 'long', year: 'numeric' });
                const costData = JSON.parse(translation.costData) as TranslationCostData;
                acc[month] = (acc[month] || 0) + (costData.totalCost || 0);
            } catch {
                // Ignorar erros de parsing
            }
        }
        return acc;
    }, {} as Record<string, number>) || {};

    // Gerar log de atividades
    const recentActivity = [
        ...(user.translations?.map(t => ({
            id: t.id,
            type: 'translation' as const,
            action: `Tradução ${t.status}`,
            timestamp: t.createdAt,
            details: {
                fileName: t.fileName,
                status: t.status,
                cost: t.costData ? JSON.parse(t.costData).totalCost : null
            }
        })) || []),
        ...(user.prompts?.map(p => ({
            id: p.id,
            type: 'prompt' as const,
            action: 'Prompt criado',
            timestamp: new Date(),
            details: {
                promptName: p.name
            }
        })) || [])
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

    res.json({
        totalTranslations: user._count?.translations || 0,
        totalKnowledgeBases: user._count?.knowledgeBases || 0,
        totalPrompts: user._count?.prompts || 0,
        totalCost,
        translationStats,
        successRate,
        averageTranslationTime: avgTime,
        costByMonth,
        recentTranslations: user.translations || [],
        recentPrompts: user.prompts || [],
        recentActivity
    });
});

// Atualizar role do usuário
export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!['SUPERUSER', 'TRANSLATOR', 'EDITOR'].includes(role)) {
        throw new ValidationError('Role inválido');
    }

    const user = await prisma.user.update({
        where: { id },
        data: { role }
    });

    res.json({ user });
});

// Obter configuração do assistente
export const getAssistantConfig = asyncHandler(async (_req: Request, res: Response) => {
    const assistantId = process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID;
    
    if (!assistantId) {
        throw new Error('ID do assistente não configurado');
    }

    try {
        // Buscar detalhes do assistente na OpenAI
        const assistant = await openai.beta.assistants.retrieve(assistantId);

        const config = {
            id: assistant.id,
            name: assistant.name,
            model: assistant.model,
            instructions: assistant.instructions,
            temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3')
        };

        res.json({ config });
    } catch (error) {
        console.error('Erro ao buscar assistente:', error);
        throw new Error('Erro ao buscar configuração do assistente');
    }
});

// Atualizar configuração do assistente
export const updateAssistantConfig = asyncHandler(async (req: Request, res: Response) => {
    const { model, instructions, temperature } = req.body;
    const assistantId = process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID;

    if (!assistantId) {
        throw new Error('ID do assistente não configurado');
    }

    try {
        // Atualizar o assistente na OpenAI
        const assistant = await openai.beta.assistants.update(
            assistantId,
            {
                model,
                instructions
            }
        );

        // Atualizar a temperatura no .env ou onde for apropriado
        // TODO: Implementar persistência da temperatura

        const config = {
            id: assistant.id,
            name: assistant.name,
            model: assistant.model,
            instructions: assistant.instructions,
            temperature
        };

        res.json({
            message: 'Configuração atualizada com sucesso',
            config
        });
    } catch (error) {
        console.error('Erro ao atualizar assistente:', error);
        throw new Error('Erro ao atualizar configuração do assistente');
    }
}); 