import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { processKnowledgeBaseFile } from '../services/knowledge.service.js';
import { NotFoundError } from '../utils/errors.js';
import prisma from '../config/database.js';
import fs from 'fs';
import { KnowledgeBase } from '@prisma/client';
import { deleteFromS3 } from '../config/storage.js';

// Criar base de conhecimento
export const createKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
    const { name, description, sourceLanguage, targetLanguage } = req.body;
    const file = req.file;

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

    if (!file) {
        throw new Error('Nenhum arquivo enviado');
    }

    try {
        const knowledgeBase = await processKnowledgeBaseFile(file.path, {
            name,
            description,
            sourceLanguage,
            targetLanguage,
            userId: req.user!.id,
            originalFileName: file.originalname
        });

        res.status(201).json({
            status: 'success',
            data: knowledgeBase
        });
    } catch (error) {
        if (file && fs.existsSync(file.path)) {
            await fs.promises.unlink(file.path).catch(console.error);
        }
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
    const file = req.file;

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

        let updateData: any = {
            name,
            description,
            sourceLanguage,
            targetLanguage,
            updatedAt: new Date()
        };

        // Se tiver novo arquivo, processar
        if (file) {
            // Deletar arquivo antigo do S3 se existir
            if (existingBase.filePath) {
                try {
                    const s3Key = existingBase.filePath.split('.amazonaws.com/')[1];
                    if (s3Key) {
                        await deleteFromS3(s3Key);
                    }
                } catch (error) {
                    console.error('Erro ao deletar arquivo antigo:', error);
                }
            }

            const processedFile = await processKnowledgeBaseFile(file.path, {
                name,
                description,
                sourceLanguage,
                targetLanguage,
                userId: req.user!.id,
                originalFileName: file.originalname
            });

            updateData = {
                ...updateData,
                fileName: file.originalname,
                filePath: processedFile.filePath,
                fileType: processedFile.fileType,
                fileSize: processedFile.fileSize
            };
        }

        const updatedKnowledgeBase = await prisma.knowledgeBase.update({
            where: { id },
            data: updateData
        });

        res.json({
            status: 'success',
            data: updatedKnowledgeBase
        });
    } catch (error) {
        if (file && fs.existsSync(file.path)) {
            await fs.promises.unlink(file.path).catch(console.error);
        }
        throw error;
    }
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
