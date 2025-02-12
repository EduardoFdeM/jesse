import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createKnowledgeBase, deleteKnowledgeBase, listKnowledgeBaseFiles } from '../services/knowledge.service.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/errors.js';
import prisma from '../config/database.js';
import openai from '../config/openai.js';

// Criar base de conhecimento
export const createKnowledgeBaseHandler = asyncHandler(async (req: Request, res: Response) => {
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[];
    let existingFileIds = [];
    
    try {
        existingFileIds = req.body.existingFileIds ? JSON.parse(req.body.existingFileIds) : [];
    } catch (err) {
        throw new BadRequestError('IDs de arquivos existentes inválidos');
    }

    const userId = req.user?.id;

    if (!userId) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    if (!name || !description) {
        throw new BadRequestError('Nome e descrição são obrigatórios');
    }

    if ((!files || files.length === 0) && (!existingFileIds || existingFileIds.length === 0)) {
        throw new BadRequestError('É necessário enviar pelo menos um arquivo ou selecionar arquivos existentes');
    }

    // Verificar limite de arquivos
    if ((files?.length || 0) + (existingFileIds?.length || 0) > 20) {
        throw new BadRequestError('Limite máximo de 20 arquivos por base de conhecimento');
    }

    try {
        const knowledgeBase = await createKnowledgeBase(userId, name, description, files || [], existingFileIds);

        res.status(201).json({
            status: 'success',
            data: knowledgeBase
        });
    } catch (err) {
        // Se o erro já foi tratado, apenas repasse
        if (err instanceof BadRequestError || err instanceof UnauthorizedError) {
            throw err;
        }

        // Caso contrário, trate como erro interno
        console.error('Erro ao criar base de conhecimento:', err);
        throw new Error(`Erro ao criar base de conhecimento. ${(err as Error).message}`);
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
    const { name, description } = req.body;

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
            updatedAt: new Date()
        }
    });

    res.json({
        status: 'success',
        data: updatedKnowledgeBase
    });
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

// Listar arquivos de uma base de conhecimento
export const getKnowledgeBaseFiles = asyncHandler(async (req: Request, res: Response) => {
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

    const files = await listKnowledgeBaseFiles(id);

    res.json({
        status: 'success',
        data: files
    });
});
