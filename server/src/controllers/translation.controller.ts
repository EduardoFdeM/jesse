import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import prisma from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { emitTranslationStarted, emitTranslationCompleted } from '../services/socket.service.js';
import { translateFile } from '../services/translation.service.js';
import { generateSignedUrl } from '../config/storage.js';

// Adicionar função generateFilePath no início do arquivo
const generateFilePath = (originalName: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${baseName}_${timestamp}_${random}${ext}`;
};

// Interface para requisições autenticadas
interface AuthenticatedRequest extends Request {
    user: {
        id: string;
        email: string;
        name: string;
    };
}

// Helper para tipar corretamente o asyncHandler
const authenticatedHandler = <T>(
    handler: (req: AuthenticatedRequest, res: Response) => Promise<T>
) => {
    return asyncHandler((req: Request, res: Response) => {
        return handler(req as AuthenticatedRequest, res);
    });
};

// Criar tradução
export const createTranslation = authenticatedHandler(async (req, res) => {
    try {
        const { sourceLanguage, targetLanguage } = req.body;
        const file = req.file;
        
        if (!file || !sourceLanguage || !targetLanguage || !req.user?.id) {
            throw new ValidationError('Dados inválidos para tradução');
        }

        const originalName = Array.isArray(req.body.originalname) 
            ? req.body.originalname[0] 
            : req.body.originalname || 'translated_document.pdf';

        // Criar o registro no banco com status 'pending'
        const translation = await prisma.translation.create({
            data: {
                fileName: path.basename(file.path),
                filePath: file.path,
                originalName,
                sourceLanguage,
                targetLanguage,
                userId: req.user.id,
                fileSize: file.size,
                fileType: file.mimetype,
                status: 'pending'
            }
        });

        // Emitir evento de início
        emitTranslationStarted(translation);

        // Responder imediatamente ao cliente
        res.status(202).json({
            message: 'Tradução iniciada',
            translationId: translation.id
        });

        // Iniciar processo de tradução em background
        translateFile({
            filePath: file.path,
            sourceLanguage,
            targetLanguage,
            userId: req.user.id,
            translationId: translation.id
        }).catch(error => {
            console.error('Erro na tradução em background:', error);
        });

    } catch (error) {
        console.error('Erro no controller:', error);
        throw error;
    }
});

// Rota de Download (não precisa de autenticação específica)
export const downloadTranslation = authenticatedHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
        const translation = await prisma.translation.findUnique({
            where: { id }
        });

        if (!translation) {
            throw new NotFoundError('Tradução não encontrada');
        }

        // Extrair a chave do S3 da URL completa
        const s3Key = translation.filePath.split('.amazonaws.com/')[1];
        
        // Gerar URL assinada
        const signedUrl = await generateSignedUrl(s3Key);
        
        // Retornar a URL assinada
        res.json({ url: signedUrl });
    } catch (error) {
        console.error('Erro ao gerar URL de download:', error);
        throw error;
    }
});

// Obter uma tradução específica
export const getTranslation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const translation = await prisma.translation.findUnique({ where: { id } });

    if (!translation) {
        throw new NotFoundError('Tradução não encontrada');
    }

    res.status(200).json({
        message: 'Tradução encontrada',
        data: translation,
    });
});

// Listar traduções do usuário
export const getTranslations = authenticatedHandler(async (req, res) => {
    const translations = await prisma.translation.findMany({
        where: { userId: req.user.id }
    });

    res.status(200).json({
        message: 'Traduções encontradas',
        data: translations,
    });
});

// Limpar histórico de traduções
export const clearTranslationHistory = authenticatedHandler(async (req, res) => {
    try {
        const translations = await prisma.translation.findMany({
            where: { userId: req.user.id },
            select: { filePath: true }
        });

        // Deletar os arquivos físicos
        for (const translation of translations) {
            try {
                if (translation.filePath && fs.existsSync(translation.filePath)) {
                    fs.unlinkSync(translation.filePath);
                }
            } catch (error) {
                console.error('Erro ao deletar arquivo:', error);
            }
        }

        // Deletar registros do banco
        await prisma.translation.deleteMany({
            where: { userId: req.user.id }
        });

        res.json({ message: 'Histórico de traduções limpo com sucesso' });
    } catch (error) {
        console.error('Erro ao limpar histórico:', error);
        res.status(500).json({ error: 'Erro ao limpar histórico de traduções' });
    }
});
