import { Request, Response } from 'express';
import prisma from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

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
                    costData: true,
                    createdAt: true,
                    status: true
                }
            }
        }
    });

    if (!user) {
        throw new NotFoundError('Usuário não encontrado');
    }

    // Calcular custos totais
    const totalCost = user.translations.reduce((acc, translation) => {
        if (translation.costData) {
            const costData = JSON.parse(translation.costData);
            return acc + (costData.totalCost || 0);
        }
        return acc;
    }, 0);

    // Estatísticas de traduções por status
    const translationStats = user.translations.reduce((acc: Record<string, number>, translation) => {
        acc[translation.status] = (acc[translation.status] || 0) + 1;
        return acc;
    }, {});

    // Atividade mensal (últimos 6 meses)
    const now = new Date();
    const sixMonthsAgo = new Date(now.setMonth(now.getMonth() - 6));
    
    const monthlyActivity = user.translations
        .filter(t => new Date(t.createdAt) >= sixMonthsAgo)
        .reduce((acc: Record<string, number>, translation) => {
            const month = new Date(translation.createdAt).toLocaleString('default', { month: 'long' });
            acc[month] = (acc[month] || 0) + 1;
            return acc;
        }, {});

    res.json({
        totalTranslations: user._count.translations,
        totalKnowledgeBases: user._count.knowledgeBases,
        totalPrompts: user._count.prompts,
        totalCost,
        translationStats,
        monthlyActivity
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
    const config = {
        assistantId: process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID,
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3')
    };

    res.json({ config });
});

// Atualizar configuração do assistente
export const updateAssistantConfig = asyncHandler(async (req: Request, res: Response) => {
    const { assistantId, model, temperature } = req.body;

    // Aqui você pode adicionar a lógica para atualizar as variáveis de ambiente
    // Por exemplo, salvando em um arquivo .env ou em um serviço de configuração

    // Por enquanto, apenas retornamos os valores recebidos
    res.json({
        message: 'Configuração atualizada com sucesso',
        config: { assistantId, model, temperature }
    });
}); 