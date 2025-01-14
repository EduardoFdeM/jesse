import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { processKnowledgeBaseFile } from '../services/knowledge.service.js';
import { NotFoundError } from '../utils/errors.js';
import prisma from '../config/database.js';
import fs from 'fs';
import { KnowledgeBase } from '@prisma/client';

// Criar base de conhecimento
export const createKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
    const { name, description, sourceLanguage, targetLanguage } = req.body;
    const file = req.file;

    if (!file) {
        throw new Error('Nenhum arquivo enviado');
    }

    const knowledgeBase = await processKnowledgeBaseFile(file.path, {
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

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    const updatedKnowledgeBase = await prisma.knowledgeBase.update({
        where: { id },
        data: { name, description }
    });

    res.json({
        status: 'success',
        data: updatedKnowledgeBase
    });
});

// Excluir base de conhecimento
export const deleteKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
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

    // Excluir o arquivo
    if (fs.existsSync(knowledgeBase.filePath)) {
        fs.unlinkSync(knowledgeBase.filePath);
    }

    await prisma.knowledgeBase.delete({
        where: { id }
    });

    res.json({
        status: 'success',
        data: null
    });
});

// Obter conteúdo da base de conhecimento
export const getKnowledgeBaseContent = asyncHandler(async (req: Request, res: Response) => {
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

    if (!fs.existsSync(knowledgeBase.filePath)) {
        throw new NotFoundError('Arquivo não encontrado');
    }

    const content = fs.readFileSync(knowledgeBase.filePath, 'utf-8');

    res.json({
        status: 'success',
        data: content
    });
});

// Atualizar conteúdo da base de conhecimento
export const updateKnowledgeBaseContent = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { content } = req.body;

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    fs.writeFileSync(knowledgeBase.filePath, content, 'utf-8');

    res.json({
        status: 'success',
        data: null
    });
});
