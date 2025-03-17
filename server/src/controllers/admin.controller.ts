import { Request, Response } from 'express';
import prisma from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ValidationError, UnauthorizedError } from '../utils/errors.js';
import OpenAI from 'openai';
import bcrypt from 'bcrypt';

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
                    assistants: true
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
            assistants: true
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
                    assistants: true
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
            assistants: {
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
        ...(user.assistants?.map(p => ({
            id: p.id,
            type: 'assistant' as const,
            action: 'Assistant criado',
            timestamp: new Date(),
            details: {
                assistantName: p.name
            }
        })) || [])
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

    res.json({
        totalTranslations: user._count?.translations || 0,
        totalKnowledgeBases: user._count?.knowledgeBases || 0,
        totalAssistants: user._count?.assistants || 0,
        totalCost,
        translationStats,
        successRate,
        averageTranslationTime: avgTime,
        costByMonth,
        recentTranslations: user.translations || [],
        recentAssistants: user.assistants || [],
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

        // Buscar configuração de temperatura do banco
        const tempConfig = await prisma.systemConfig.findUnique({
            where: { key: 'default_assistant_temperature' }
        });

        const config = {
            id: assistant.id,
            name: assistant.name,
            model: assistant.model,
            instructions: assistant.instructions,
            temperature: tempConfig ? parseFloat(tempConfig.value) : 0.3,
            tools: assistant.tools || [],
            tool_resources: assistant.tools?.some(t => t.type === 'file_search') ? {
                file_search: {
                    vector_store_ids: []
                }
            } : undefined
        };

        res.json({ config });
    } catch (error) {
        console.error('Erro ao buscar assistente:', error);
        throw new Error('Erro ao buscar configuração do assistente');
    }
});

// Atualizar configuração do assistente
export const updateAssistantConfig = asyncHandler(async (req: Request, res: Response) => {
    const { model, instructions, temperature, knowledgeBaseId } = req.body;
    const assistantId = process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID;

    if (!assistantId) {
        throw new Error('ID do assistente não configurado');
    }

    try {
        // Buscar vectorStoreId se houver knowledgeBase
        let vectorStoreId: string | undefined;
        if (knowledgeBaseId) {
            const knowledgeBase = await prisma.knowledgeBase.findUnique({
                where: { id: knowledgeBaseId }
            });
            vectorStoreId = knowledgeBase?.vectorStoreId || undefined;
        }

        // Atualizar o assistente na OpenAI
        const assistant = await openai.beta.assistants.update(
            assistantId,
            {
                model,
                instructions,
                temperature: parseFloat(temperature.toString()),
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
            }
        );

        // Atualizar a temperatura no banco
        await prisma.systemConfig.upsert({
            where: { key: 'default_assistant_temperature' },
            update: { 
                value: temperature.toString(),
                updatedAt: new Date()
            },
            create: {
                key: 'default_assistant_temperature',
                value: temperature.toString(),
                description: 'Temperatura padrão do assistente de tradução'
            }
        });

        const config = {
            id: assistant.id,
            name: assistant.name,
            model: assistant.model,
            instructions: assistant.instructions,
            temperature,
            tools: assistant.tools || [],
            tool_resources: assistant.tools?.some(t => t.type === 'file_search') ? {
                file_search: {
                    vector_store_ids: vectorStoreId ? [vectorStoreId] : []
                }
            } : undefined
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

// Adicionar novo usuário
export const createUser = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
        throw new ValidationError('Todos os campos são obrigatórios');
    }

    if (!['SUPERUSER', 'TRANSLATOR', 'EDITOR'].includes(role)) {
        throw new ValidationError('Role inválido');
    }

    const existingUser = await prisma.user.findUnique({
        where: { email }
    });

    if (existingUser) {
        throw new ValidationError('Email já cadastrado');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true
        }
    });

    res.status(201).json({ user });
});

// Buscar usuários disponíveis para compartilhamento
export const getAvailableUsers = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.id) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    const users = await prisma.user.findMany({
        where: {
            id: { not: req.user.id }, // Excluir o usuário atual
            role: { in: ['SUPERUSER', 'EDITOR', 'TRANSLATOR'] }
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        },
        orderBy: [
            {
                role: 'asc'
            },
            {
                name: 'asc'
            }
        ]
    });

    // Reordenar manualmente para garantir a ordem SUPERUSER > EDITOR > TRANSLATOR
    const sortedUsers = users.sort((a, b) => {
        const roleOrder = { SUPERUSER: 1, EDITOR: 2, TRANSLATOR: 3 };
        return (roleOrder[a.role as keyof typeof roleOrder] || 0) - (roleOrder[b.role as keyof typeof roleOrder] || 0);
    });

    res.json({ users: sortedUsers });
});

// Obter configuração do Vision OCR
export const getVisionConfig = asyncHandler(async (_req: Request, res: Response) => {
    try {
        // Buscar configuração no banco de dados
        const configRecord = await prisma.systemConfig.findUnique({
            where: { key: 'vision_prompt' }
        });

        // Configuração padrão caso não exista
        const defaultVisionPrompt = `Extraia todo o texto deste documento.
        Preste atenção às seguintes estruturas complexas:
        1. Tabelas - extraia o conteúdo linha por linha, preservando as relações entre as colunas
        2. Múltiplas colunas - leia de cima para baixo, coluna por coluna, da esquerda para a direita
        3. Imagens com texto - extraia o texto visível nas imagens
        4. Gráficos e diagramas - descreva e extraia quaisquer textos
        
        Mantenha a estrutura do documento, incluindo parágrafos, tópicos e seções.
        Preserve números, fórmulas, referências e citações exatamente como aparecem.
        Indique quebras de página com [QUEBRA_PAGINA].
        Se houver texto em uma tabela, formate como: [INICIO_TABELA] conteúdo [FIM_TABELA].
        Retorne APENAS o texto extraído, sem explicações adicionais.`;

        const config = {
            prompt: configRecord?.value || defaultVisionPrompt,
            model: 'gpt-4o-mini'
        };

        res.json({ config });
    } catch (error) {
        console.error('Erro ao buscar configuração do Vision OCR:', error);
        throw new Error('Erro ao buscar configuração do Vision OCR');
    }
});

// Atualizar configuração do Vision OCR
export const updateVisionConfig = asyncHandler(async (req: Request, res: Response) => {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        throw new ValidationError('Prompt inválido');
    }

    try {
        // Atualizar ou criar configuração
        const config = await prisma.systemConfig.upsert({
            where: { key: 'vision_prompt' },
            update: { 
                value: prompt,
                updatedAt: new Date()
            },
            create: {
                key: 'vision_prompt',
                value: prompt,
                description: 'Prompt para OCR via Vision'
            }
        });

        res.json({ 
            message: 'Configuração atualizada com sucesso',
            config
        });
    } catch (error) {
        console.error('Erro ao atualizar configuração do Vision OCR:', error);
        throw new Error('Erro ao atualizar configuração do Vision OCR');
    }
});