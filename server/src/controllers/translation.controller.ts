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
import { Readable } from 'stream';
import PDFDocument from 'pdfkit';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import { DEFAULT_TRANSLATION_PROMPT } from '../constants/prompts.js';

// Interfaces para o PDF Parser
interface PDFTextR {
    T: string;
}

interface PDFText {
    R: PDFTextR[];
}

interface PDFPage {
    Texts: PDFText[];
}

interface PDFData {
    Pages: PDFPage[];
}

// Função para gerar arquivo atualizado
const generateUpdatedFile = async (content: string, fileType: string): Promise<string> => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const tempDir = path.join(process.cwd(), 'temp');
    
    // Garantir que o diretório temp existe
    if (!fs.existsSync(tempDir)) {
        await fs.promises.mkdir(tempDir, { recursive: true });
    }
    
    const ext = fileType.includes('pdf') ? '.pdf' : 
                fileType.includes('docx') ? '.docx' : '.txt';
    
    const filePath = path.join(tempDir, `updated_${timestamp}_${random}${ext}`);

    try {
        if (fileType.includes('pdf')) {
            const doc = new PDFDocument({
                margin: 50,
                size: 'A4'
            });
            
            return new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(filePath);
                doc.pipe(writeStream);
                
                // Preservar quebras de linha e formatação no PDF
                content.split('\n').forEach(line => {
                    doc.text(line, {
                        align: 'left',
                        continued: false
                    });
                });
                
                doc.end();
                writeStream.on('finish', () => resolve(filePath));
                writeStream.on('error', reject);
            });
        } else if (fileType.includes('docx')) {
            const paragraphs = content.split('\n').map(line => {
                // Preservar indentação e formatação
                const indentMatch = line.match(/^[\s\t]*/);
                const indent = (indentMatch ? indentMatch[0].length : 0) * 240; // 240 twips = 1/4 inch
                
                return new Paragraph({
                    children: [new TextRun(line.trimLeft())],
                    spacing: { before: 200, after: 200 },
                    indent: { left: indent }
                });
            });

            const doc = new Document({
                sections: [{
                    properties: {},
                    children: paragraphs
                }]
            });
            
            const buffer = await Packer.toBuffer(doc);
            await fs.promises.writeFile(filePath, buffer);
            return filePath;
        } else {
            // Para arquivos txt, mantém a formatação original
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return filePath;
        }
    } catch (error) {
        console.error('Erro ao gerar arquivo atualizado:', error);
        throw new Error('Falha ao gerar arquivo atualizado');
    }
};

// Criar tradução
export const createTranslation = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const file = req.file;
        const useKnowledgeBase = req.body.useKnowledgeBase === 'true';
        const useCustomPrompt = req.body.useCustomPrompt === 'true';
        const knowledgeBaseId = useKnowledgeBase ? req.body.knowledgeBaseId : null;
        const promptId = useCustomPrompt ? req.body.promptId : null;

        console.log('📝 Iniciando tradução:', {
            file: file?.originalname,
            useKnowledgeBase,
            useCustomPrompt,
            knowledgeBaseId,
            promptId
        });

        if (!file) {
            throw new BadRequestError('Nenhum arquivo foi enviado');
        }

        // Validações iniciais
        if (!req.body.sourceLanguage || !req.body.targetLanguage || !req.user?.id) {
            throw new ValidationError('Dados inválidos para tradução');
        }

        // Validar base de conhecimento se selecionada
        if (useKnowledgeBase && knowledgeBaseId) {
            const knowledgeBase = await prisma.knowledgeBase.findFirst({
                where: { 
                    id: knowledgeBaseId,
                    userId: req.user.id
                }
            });
            if (!knowledgeBase) {
                throw new ValidationError('Base de conhecimento não encontrada');
            }
        }

        // Validar prompt se selecionado
        if (useCustomPrompt && promptId) {
            const prompt = await prisma.prompt.findFirst({
                where: { 
                    id: promptId,
                    userId: req.user.id
                }
            });
            if (!prompt) {
                throw new ValidationError('Prompt não encontrado');
            }
        }

        // Criar o registro com os dados corretos
        const translation = await prisma.translation.create({
            data: {
                fileName: file.originalname,
                filePath: file.path,
                originalName: req.body.originalname || file.originalname,
                sourceLanguage: req.body.sourceLanguage,
                targetLanguage: req.body.targetLanguage,
                status: 'processing',
                userId: req.user.id,
                fileSize: file.size,
                fileType: file.mimetype,
                usedPrompt: useCustomPrompt,
                usedKnowledgeBase: useKnowledgeBase,
                promptId,
                knowledgeBaseId
            },
            include: {
                knowledgeBase: true,
                prompt: true
            }
        });

        // Emitir evento de início
        emitTranslationStarted(translation);
        
        // Iniciar tradução com os parâmetros corretos
        translateFile({
            filePath: file.path,
            sourceLanguage: req.body.sourceLanguage,
            targetLanguage: req.body.targetLanguage,
            userId: req.user.id,
            translationId: translation.id,
            outputFormat: file.mimetype,
            originalName: file.originalname,
            knowledgeBaseId: useKnowledgeBase ? knowledgeBaseId : undefined,
            promptId: useCustomPrompt ? promptId : undefined,
            useKnowledgeBase,
            useCustomPrompt
        });

        res.status(202).json({
            message: 'Tradução iniciada com sucesso',
            translation
        });

    } catch (error) {
        console.error('❌ Erro no processo de tradução:', error);
        // Limpar arquivo temporário se existir
        if (req.file?.path && fs.existsSync(req.file.path)) {
            await fs.promises.unlink(req.file.path);
        }
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
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        include: {
            knowledgeBase: true,
            prompt: true
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
    
    if (!content) {
        throw new ValidationError('Conteúdo não fornecido');
    }

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
        const fileBuffer = await fs.promises.readFile(newFilePath);
        const fileName = path.basename(newFilePath);
        const newUrl = await uploadToS3(fileBuffer, fileName);

        // Deletar arquivo antigo do S3
        const oldS3Key = translation.filePath.split('.amazonaws.com/')[1];
        if (oldS3Key) {
            try {
                await deleteFromS3(oldS3Key);
            } catch (deleteError) {
                console.error('Erro ao deletar arquivo antigo:', deleteError);
            }
        }

        // Atualizar registro no banco
        const updatedTranslation = await prisma.translation.update({
            where: { id },
            data: {
                filePath: newUrl,
                status: 'completed',
                fileSize: fileBuffer.length
            }
        });

        // Limpar arquivo temporário
        await fs.promises.unlink(newFilePath);

        res.json({ 
            success: true, 
            translation: updatedTranslation 
        });
    } catch (error) {
        console.error('Erro ao atualizar tradução:', error);
        throw error;
    }
});

// Rota para obter conteúdo da tradução
export const getTranslationContent = authenticatedHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
        const translation = await prisma.translation.findUnique({
            where: { id }
        });

        if (!translation) {
            throw new NotFoundError('Tradução não encontrada');
        }

        const s3Key = translation.filePath.split(`${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`)[1];
        
        if (!s3Key) {
            throw new Error('Caminho do arquivo inválido');
        }

        try {
            const command = new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET || '',
                Key: s3Key
            });

            const response = await s3Client.send(command);
            let content = '';

            if (translation.fileType === 'application/pdf') {
                content = await new Promise<string>((resolve, reject) => {
                    const chunks: Buffer[] = [];
                    
                    if (response.Body instanceof Readable) {
                        response.Body
                            .on('data', (chunk: Buffer) => chunks.push(chunk))
                            .on('end', async () => {
                                try {
                                    const buffer = Buffer.concat(chunks);
                                    const tempDir = path.join(process.cwd(), 'temp');
                                    
                                    // Garantir que o diretório temp existe
                                    if (!fs.existsSync(tempDir)) {
                                        await fs.promises.mkdir(tempDir, { recursive: true });
                                    }
                                    
                                    // Criar arquivo temporário
                                    const tempFile = path.join(tempDir, `temp_${Date.now()}.pdf`);
                                    await fs.promises.writeFile(tempFile, buffer);
                                    
                                    const pdfParser = new PDFParser();
                                    
                                    pdfParser.on('pdfParser_dataReady', (pdfData: PDFData) => {
                                        try {
                                            const text = pdfData.Pages
                                                .map((page: PDFPage) => 
                                                    page.Texts.map((text: PDFText) => 
                                                        text.R.map((r: PDFTextR) => r.T)
                                                            .join(' '))
                                                        .join('\n'))
                                                    .join('\n\n');
                                            
                                            // Limpar arquivo temporário
                                            fs.unlink(tempFile, (err) => {
                                                if (err) console.error('Erro ao deletar arquivo temporário:', err);
                                            });
                                            
                                            resolve(decodeURIComponent(text));
                                        } catch {
                                            reject(new Error('Erro ao processar PDF'));
                                        }
                                    });
                                    
                                    pdfParser.on('pdfParser_dataError', () => {
                                        // Limpar arquivo temporário em caso de erro
                                        fs.unlink(tempFile, (err) => {
                                            if (err) console.error('Erro ao deletar arquivo temporário:', err);
                                        });
                                        reject(new Error('Erro ao processar PDF'));
                                    });

                                    pdfParser.loadPDF(tempFile);
                                } catch (error) {
                                    reject(new Error('Erro ao processar buffer do PDF'));
                                }
                            })
                            .on('error', (error: Error) => {
                                reject(error);
                            });
                    } else {
                        reject(new Error('Formato de resposta inválido do S3'));
                    }
                });
            } else {
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
        throw error;
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
