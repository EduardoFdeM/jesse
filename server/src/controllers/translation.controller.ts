import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ValidationError, NotFoundError, BadRequestError, UnauthorizedError } from '../utils/errors.js';
import prisma from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { emitTranslationStarted } from '../services/socket.service.js';
import { translateFile } from '../services/translation.service.js';
import { generateSignedUrl, uploadToS3, deleteFromS3 } from '../config/storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/storage.js';
import PDFParser from 'pdf2json';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { authenticatedHandler } from '../utils/asyncHandler.js';

// Função para gerar arquivo atualizado
const generateUpdatedFile = async (content: string, fileType: string): Promise<string> => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = fileType === 'application/pdf' ? '.pdf' : 
                fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? '.docx' : '.txt';
    
    const filePath = path.join(process.cwd(), 'temp', `updated_${timestamp}_${random}${ext}`);
    await fs.promises.writeFile(filePath, content);
    return filePath;
};

// Criar tradução
export const createTranslation = authenticatedHandler(async (req, res) => {
    try {
        const { sourceLanguage, targetLanguage, outputFormat = 'pdf' } = req.body;
        const file = req.file;
        
        console.log('Arquivo recebido:', {
            nome: file?.originalname,
            tamanho: file?.size,
            tipo: file?.mimetype
        });

        if (!file) {
            throw new BadRequestError('Nenhum arquivo foi enviado');
        }

        // Validar formato de saída
        const validFormats = ['pdf', 'txt', 'docx'];
        if (!validFormats.includes(outputFormat)) {
            throw new BadRequestError('Formato de saída inválido');
        }

        if (!sourceLanguage || !targetLanguage || !req.user?.id) {
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
            translationId: translation.id,
            outputFormat,
            originalName
        }).catch(error => {
            console.error('Erro na tradução em background:', error);
        });

        // Verificar se o arquivo foi salvo corretamente
        const fileContent = await fs.promises.readFile(file.path, 'utf8');
        console.log('Conteúdo do arquivo recebido:', fileContent);

    } catch (error) {
        console.error('Erro detalhado no controller:', error);
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
    if (!req.user) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    const translations = await prisma.translation.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
            knowledgeBase: true
        }
    });

    res.json({
        message: 'Traduções encontradas',
        data: translations,
    });
});

// Limpar histórico de traduções
export const clearTranslationHistory = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

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
        throw error;
    }
});

// Adicionar nova rota para atualizar conteúdo
export const updateTranslationContent = authenticatedHandler(async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    
    try {
        const translation = await prisma.translation.findUnique({
            where: { id }
        });

        if (!translation) {
            throw new NotFoundError('Tradução não encontrada');
        }

        // Gerar novo arquivo com conteúdo atualizado
        const newFilePath = await generateUpdatedFile(content, translation.fileType);
        
        // Fazer upload do novo arquivo para S3
        const newUrl = await uploadToS3(
            fs.readFileSync(newFilePath),
            path.basename(newFilePath)
        );

        // Atualizar registro no banco
        await prisma.translation.update({
            where: { id },
            data: {
                filePath: newUrl,
                status: 'completed'
            }
        });

        // Limpar arquivo temporário
        await fs.promises.unlink(newFilePath);

        res.json({ success: true, url: newUrl });
    } catch (error) {
        console.error('Erro ao atualizar tradução:', error);
        throw error;
    }
});

// Rota para obter o conteúdo de uma tradução
export const getTranslationContent = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    
    try {
        const translation = await prisma.translation.findUnique({
            where: { id },
            include: {
                knowledgeBase: true
            }
        });

        if (!translation) {
            throw new NotFoundError('Tradução não encontrada');
        }

        // Verificar se filePath existe
        if (!translation.filePath) {
            throw new NotFoundError('Arquivo não encontrado');
        }

        try {
            // Extrair a chave do S3 da URL completa
            const s3Key = translation.filePath.includes('.amazonaws.com/') 
                ? translation.filePath.split('.amazonaws.com/')[1]
                : translation.filePath;

            // Buscar o arquivo do S3
            const command = new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET || '',
                Key: s3Key
            });

            const response = await s3Client.send(command);
            let content = '';

            if (translation.fileType === 'application/pdf') {
                // Se for PDF, extrair texto usando PDFParser
                const pdfParser = new PDFParser();
                const buffer = await response.Body?.transformToByteArray();
                
                if (buffer) {
                    content = await new Promise((resolve, reject) => {
                        pdfParser.on('pdfParser_dataReady', (pdfData) => {
                            try {
                                const text = pdfData.Pages
                                    .map(page => page.Texts
                                        .map(text => text.R
                                            .map(r => r.T)
                                            .join(' '))
                                        .join('\n'))
                                    .join('\n\n');
                                resolve(decodeURIComponent(text));
                            } catch (error) {
                                reject(new Error('Erro ao processar PDF'));
                            }
                        });
                        
                        pdfParser.on('pdfParser_dataError', reject);
                        (pdfParser as any).parseBuffer(Buffer.from(buffer));
                    });
                }
            } else {
                // Se não for PDF, retornar conteúdo como texto
                content = await response.Body?.transformToString() || '';
            }

            res.json({ 
                content,
                translation
            });
        } catch (s3Error) {
            console.error('Erro ao acessar arquivo no S3:', s3Error);
            throw new NotFoundError('Arquivo não encontrado no S3');
        }
    } catch (error) {
        console.error('Erro ao obter conteúdo:', error);
        if (error instanceof NotFoundError) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Erro interno ao obter conteúdo' });
        }
    }
});

// Rota para deletar uma tradução
export const deleteTranslation = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    const { id } = req.params;
    
    try {
        const translation = await prisma.translation.findUnique({
            where: { id },
            include: {
                knowledgeBase: true
            }
        });

        if (!translation) {
            throw new NotFoundError('Tradução não encontrada');
        }

        // Verificar permissão do usuário
        if (translation.userId !== req.user?.id) {
            throw new ValidationError('Sem permissão para deletar esta tradução');
        }

        // Extrair a chave do S3 da URL completa
        const s3Key = translation.filePath.split('.amazonaws.com/')[1];
        
        try {
            // Deletar arquivo do S3
            await deleteFromS3(s3Key);
        } catch (s3Error) {
            console.error('Erro ao deletar do S3:', s3Error);
            // Log do erro mas continua a execução
        }

        // Deletar registro do banco
        await prisma.translation.delete({
            where: { id }
        });

        // Emitir evento de deleção via Socket.IO
        global.io?.emit('translation:deleted', { id });

        res.json({ 
            success: true, 
            message: 'Tradução deletada com sucesso',
            deletedId: id
        });
    } catch (error) {
        console.error('Erro ao deletar tradução:', error);
        throw error;
    }
});
