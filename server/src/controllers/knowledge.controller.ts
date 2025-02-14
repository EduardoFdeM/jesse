import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { 
    processKnowledgeBaseFiles,
    deleteKnowledgeBase, 
    listKnowledgeBaseFiles,
    searchKnowledgeBase
} from '../services/knowledge.service.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/errors.js';
import prisma from '../config/database.js';
import openai from '../config/openai.js';
import { getVectorStoreFiles } from '../services/vectorStore.service.js';
import { searchVectorStore } from '../services/vectorStore.service.js';

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
    if (!userId) throw new BadRequestError('Usuário não autenticado');

    const knowledgeBase = await processKnowledgeBaseFiles({
        name,
        description,
        files,
        existingFileIds,
        userId
    });

    res.status(201).json({ data: knowledgeBase });
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
    const userId = req.user?.id;
    
    if (!userId) throw new BadRequestError('Usuário não autenticado');
    
    await deleteKnowledgeBase(id, userId);
    res.status(204).send();
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

    if (!knowledgeBase.vectorStoreId) {
        throw new BadRequestError('Base de conhecimento não possui Vector Store associada');
    }

    const files = await getVectorStoreFiles(knowledgeBase.vectorStoreId);

    res.json({
        status: 'success',
        data: files.map((file: { filename?: string; bytes?: number; purpose?: string }) => ({
            ...file,
            filename: file.filename || 'Sem nome',
            bytes: file.bytes || 0,
            purpose: file.purpose || 'assistants'
        }))
    });
});

export const searchKnowledgeBaseHandler = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { query, maxResults, threshold, filters } = req.body;
    const userId = req.user?.id;

    if (!userId) throw new UnauthorizedError('Usuário não autenticado');

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: { 
            id,
            userId // Garante que usuário só acessa suas bases
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    const searchResults = await searchVectorStore({
        vectorStoreId: knowledgeBase.vectorStoreId,
        query,
        maxResults,
        threshold,
        filters
    });

    // Métricas de uso
    await prisma.searchMetrics.create({
        data: {
            userId,
            knowledgeBaseId: id,
            query,
            resultsCount: searchResults.length,
            timestamp: new Date()
        }
    });

    res.json({ 
        data: searchResults,
        metadata: {
            total: searchResults.length,
            threshold,
            maxResults
        }
    });
});

// Listar arquivos de uma base de conhecimento
export const listKnowledgeBaseFilesHandler = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) throw new UnauthorizedError('Usuário não autenticado');

    const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    if (!knowledgeBase.vectorStoreId) {
        throw new BadRequestError('Base de conhecimento não possui Vector Store associada');
    }

    const files = await getVectorStoreFiles(knowledgeBase.vectorStoreId);
    
    res.json({ 
        data: files.map(file => ({
            ...file,
            filename: file.filename || 'Sem nome',
            bytes: file.bytes || 0,
            purpose: file.purpose || 'assistants'
        }))
    });
});

// Atualizar base de conhecimento
export const updateKnowledgeBaseHandler = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[];
    let existingFileIds: string[] = [];
    
    try {
        existingFileIds = req.body.existingFileIds ? JSON.parse(req.body.existingFileIds) : [];
        if (!Array.isArray(existingFileIds)) {
            throw new BadRequestError('existingFileIds deve ser um array');
        }
    } catch (err) {
        throw new BadRequestError('IDs de arquivos existentes inválidos');
    }

    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Usuário não autenticado');

    const knowledgeBase = await processKnowledgeBaseFiles({
        id,
        name,
        description,
        files,
        existingFileIds,
        userId
    });

    res.json({ data: knowledgeBase });
});

export const listKnowledgeBasesHandler = asyncHandler(async (req: Request, res: Response) => {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
        where: { 
            userId: req.user!.id,
            status: 'active'
        }
    });
    res.json({ data: knowledgeBases });
});

export const getKnowledgeBaseHandler = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: { 
            id,
            userId: req.user!.id,
            status: 'active'
        }
    });
    
    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }
    
    res.json({ data: knowledgeBase });
});
