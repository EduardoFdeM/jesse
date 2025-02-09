import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createKnowledgeBase, deleteKnowledgeBase } from '../services/knowledge.service.js';
import { NotFoundError } from '../utils/errors.js';
import prisma from '../config/database.js';

// Criar base de conhecimento
export const createKnowledgeBaseHandler = asyncHandler(async (req: Request, res: Response) => {
    console.log('📥 Recebendo requisição para criar base de conhecimento:', {
        body: req.body
    });

    const { name, description, sourceLanguage, targetLanguage } = req.body;

    try {
        // Verificar se já existe uma base com o mesmo nome
        const existingBase = await prisma.knowledgeBase.findFirst({
            where: {
                name,
                userId: req.user!.id
            }
        });

        if (existingBase) {
            throw new Error('Já existe uma base de conhecimento com este nome');
        }

        const knowledgeBase = await createKnowledgeBase({
            name,
            description,
            sourceLanguage,
            targetLanguage,
            userId: req.user!.id
        });

        res.status(201).json({
            status: 'success',
            data: knowledgeBase
        });
    } catch (error) {
        throw error;
    }
});

// Listar bases de conhecimento
export const getKnowledgeBases = asyncHandler(async (req: Request, res: Response) => {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
        where: { userId: req.user!.id }
    });

    res.json({
        status: 'success',
        data: knowledgeBases
    });
});

// Obter uma base de conhecimento específica
export const getKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    res.json({
        status: 'success',
        data: knowledgeBase
    });
});

// Atualizar base de conhecimento
export const updateKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, sourceLanguage, targetLanguage } = req.body;

    try {
        // Verificar se existe e pertence ao usuário
        const existingBase = await prisma.knowledgeBase.findFirst({
            where: {
                id,
                userId: req.user!.id
            }
        });

        if (!existingBase) {
            throw new NotFoundError('Base de conhecimento não encontrada');
        }

        // Verificar nome duplicado
        if (name !== existingBase.name) {
            const nameExists = await prisma.knowledgeBase.findFirst({
                where: {
                    name,
                    userId: req.user!.id,
                    id: { not: id }
                }
            });

            if (nameExists) {
                throw new Error('Já existe uma base de conhecimento com este nome');
            }
        }

        const updatedKnowledgeBase = await prisma.knowledgeBase.update({
            where: { id },
            data: {
                name,
                description,
                sourceLanguage,
                targetLanguage,
                updatedAt: new Date()
            }
        });

        res.json({
            status: 'success',
            data: updatedKnowledgeBase
        });
    } catch (error) {
        throw error;
    }
});

// Excluir base de conhecimento
export const deleteKnowledgeBaseHandler = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    await deleteKnowledgeBase(id);

    res.json({
        status: 'success',
        data: null
    });
});
