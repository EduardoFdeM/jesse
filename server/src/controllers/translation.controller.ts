import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ValidationError, NotFoundError, BadRequestError, UnauthorizedError } from '../utils/errors.js';
import prisma from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { emitTranslationStarted, emitTranslationError } from '../services/socket.service.js';
import { translateFile } from '../services/translation.service.js';
import { generateSignedUrl, uploadToS3, deleteFromS3 } from '../config/storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/storage.js';
import PDFDocument from 'pdfkit';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { authenticatedHandler } from '../utils/asyncHandler.js';
import { Readable } from 'stream';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import * as translationService from '../services/translation.service.js';

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
        const assistantId = useCustomPrompt ? req.body.assistantId : null;

        console.log('📝 Iniciando processo de tradução:', {
            fileName: file?.originalname,
            fileSize: file?.size,
            fileType: file?.mimetype,
            useKnowledgeBase,
            useCustomPrompt,
            knowledgeBaseId,
            assistantId,
            userId: req.user?.id
        });

        if (!file) {
            console.error('❌ Erro: Nenhum arquivo enviado');
            throw new BadRequestError('Nenhum arquivo foi enviado');
        }

        // Validações iniciais
        if (!req.body.sourceLanguage || !req.body.targetLanguage || !req.user?.id) {
            console.error('❌ Erro: Dados inválidos', {
                sourceLanguage: req.body.sourceLanguage,
                targetLanguage: req.body.targetLanguage,
                userId: req.user?.id
            });
            throw new ValidationError('Dados inválidos para tradução');
        }

        // Validar base de conhecimento se selecionada
        if (useKnowledgeBase && knowledgeBaseId) {
            console.log('🔍 Verificando base de conhecimento:', knowledgeBaseId);
            const knowledgeBase = await prisma.knowledgeBase.findFirst({
                where: { 
                    id: knowledgeBaseId,
                    userId: req.user.id
                }
            });
            if (!knowledgeBase) {
                console.error('❌ Erro: Base de conhecimento não encontrada');
                throw new ValidationError('Base de conhecimento não encontrada');
            }
            console.log('✅ Base de conhecimento validada');
        }

        console.log('📤 Fazendo upload do arquivo para S3...');
        // Fazer upload do arquivo para S3 usando o buffer
        const s3FilePath = await uploadToS3(file.buffer, file.originalname);
        console.log('✅ Upload concluído:', s3FilePath);

        console.log('💾 Criando registro da tradução...');
        // Criar o registro com os dados corretos
        const translation = await prisma.translation.create({
            data: {
                fileName: file.originalname,
                filePath: s3FilePath,
                originalName: req.body.originalname || file.originalname,
                sourceLanguage: req.body.sourceLanguage,
                targetLanguage: req.body.targetLanguage,
                status: 'processing',
                userId: req.user.id,
                fileSize: file.size,
                fileType: file.mimetype,
                usedPrompt: useCustomPrompt,
                usedKnowledgeBase: useKnowledgeBase,
                knowledgeBaseId,
                assistantId,
                translationMetadata: JSON.stringify({
                    usedKnowledgeBase: useKnowledgeBase,
                    usedAssistant: useCustomPrompt,
                    knowledgeBaseName: useKnowledgeBase ? await getKnowledgeBaseName(knowledgeBaseId) : null,
                    assistantName: useCustomPrompt ? await getAssistantName(assistantId) : null
                }),
                vectorStoreId: useKnowledgeBase ? await getVectorStoreId(knowledgeBaseId) : null
            },
            include: {
                knowledgeBase: true
            }
        });
        console.log('✅ Registro criado:', translation.id);

        // Emitir evento de início
        console.log('📡 Emitindo evento de início...');
        emitTranslationStarted(translation);
        
        console.log('🚀 Iniciando processo de tradução...');
        // Iniciar tradução com o buffer do arquivo
        translateFile({
            filePath: s3FilePath,
            sourceLanguage: req.body.sourceLanguage,
            targetLanguage: req.body.targetLanguage,
            userId: req.user.id,
            translationId: translation.id,
            outputFormat: file.mimetype.split('/')[1],
            originalName: file.originalname,
            knowledgeBaseId: useKnowledgeBase ? knowledgeBaseId : undefined,
            assistantId: useCustomPrompt ? assistantId : undefined,
            fileBuffer: file.buffer // Passar o buffer do arquivo
        });

        console.log('✅ Processo iniciado com sucesso');
        res.status(202).json({
            message: 'Tradução iniciada com sucesso',
            translation
        });

    } catch (error) {
        console.error('❌ Erro crítico no processo de tradução:', error);
        if (error instanceof Error) {
            emitTranslationError(req.params.id, error.message);
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
    const translation = await translationService.getTranslation(req.params.id);
    if (!translation) {
        throw new NotFoundError('Tradução não encontrada');
    }
    res.status(200).json({ message: 'Tradução encontrada', data: translation });
});

// Listar traduções do usuário
export const getTranslations = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    const translations = await translationService.getTranslations(req.user!.id);
    res.json({ message: 'Traduções encontradas', data: translations });
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

        let content = '';

        // Se o conteúdo em texto plano foi armazenado, utiliza-o para edição
        if (translation?.plainTextContent) {
            content = translation.plainTextContent;
        } else {
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

                if (translation.fileType === 'application/pdf') {
                    const chunks: Buffer[] = [];
                    
                    if (response.Body instanceof Readable) {
                        for await (const chunk of response.Body) {
                            chunks.push(Buffer.from(chunk));
                        }
                        const buffer = Buffer.concat(chunks);
                        // Importação dinâmica do pdf-parse
                        const pdfParse = (await import('pdf-parse')).default;
                        const data = await pdfParse(buffer);
                        content = data.text;
                    }
                } else {
                    content = await response.Body?.transformToString() || '';
                }
            } catch (s3Error) {
                console.error('Erro ao acessar arquivo no S3:', s3Error);
                throw new NotFoundError('Arquivo não encontrado no S3');
            }
        }

        res.json({ 
            content,
            translation
        });
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
        emitTranslationError(id, 'Translation deleted');

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

// Compartilhar tradução
export const shareTranslation = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ValidationError('Lista de usuários inválida');
    }

    try {
        // Verificar se a tradução existe e pertence ao usuário
        const translation = await prisma.translation.findFirst({
            where: {
                id,
                userId: req.user!.id
            }
        });

        if (!translation) {
            throw new NotFoundError('Tradução não encontrada ou sem permissão');
        }

        // Criar os compartilhamentos
        const shares = await prisma.$transaction(
            userIds.map(userId => 
                prisma.translationShare.create({
                    data: {
                        translationId: id,
                        sharedWithId: userId,
                        sharedById: req.user!.id
                    }
                })
            )
        );

        res.status(200).json({
            message: 'Tradução compartilhada com sucesso',
            data: shares
        });
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Erro ao compartilhar tradução: ${error.message}`);
        }
        throw new Error('Erro desconhecido ao compartilhar tradução');
    }
});

// Obter traduções compartilhadas com o usuário
export const getSharedTranslations = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    try {
        const translations = await prisma.translation.findMany({
            where: {
                shares: {
                    some: {
                        sharedWithId: req.user.id
                    }
                }
            },
            include: {
                knowledgeBase: true,
                prompt: true,
                user: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({ 
            message: 'Traduções compartilhadas encontradas', 
            data: translations 
        });
    } catch (error) {
        console.error('Erro ao buscar traduções compartilhadas:', error);
        throw error;
    }
});

// Atualizar status de visualização
export const updateViewStatus = authenticatedHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { viewStatus } = req.body;

    if (!['visible', 'hidden', 'archived'].includes(viewStatus)) {
        throw new ValidationError('Status de visualização inválido');
    }

    try {
        // Verificar se a tradução existe e se o usuário tem acesso a ela
        const translation = await prisma.translation.findFirst({
            where: {
                id,
                shares: {
                    some: {
                        sharedWithId: req.user!.id
                    }
                }
            }
        });

        if (!translation) {
            throw new NotFoundError('Tradução não encontrada ou sem permissão');
        }

        // Atualizar o status de visualização
        const updatedTranslation = await prisma.translation.update({
            where: { id },
            data: { viewStatus }
        });

        res.json({
            message: 'Status de visualização atualizado com sucesso',
            data: updatedTranslation
        });
    } catch (error) {
        console.error('Erro ao atualizar status de visualização:', error);
        throw error;
    }
});

// Adicionar funções auxiliares
async function getKnowledgeBaseName(id: string | null): Promise<string | null> {
    if (!id) return null;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    return kb?.name || null;
}

async function getAssistantName(id: string | null): Promise<string | null> {
    if (!id) return null;
    const prompt = await prisma.prompt.findUnique({ where: { id } });
    return prompt?.name || null;
}

async function getVectorStoreId(knowledgeBaseId: string | null): Promise<string | null> {
    if (!knowledgeBaseId) return null;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    return kb?.vectorStoreId || null;
}
