import fs from 'fs';
import path from 'path';
import prisma from '../config/database.js';
import { KnowledgeBase } from '@prisma/client';
import { uploadToS3 } from '../config/storage.js';
import openai from '../config/openai.js';
import { ValidationError } from '../utils/errors.js';

// Definir tipos permitidos de arquivo
type FileType = 'txt' | 'csv' | 'xlsx' | 'xls';

// Interface para parâmetros
interface ProcessKnowledgeBaseParams {
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
    originalFileName?: string;
}

interface TextChunk {
    content: string;
    index: number;
    wordCount: number;
}

interface TranslationContext {
    previousChunk?: TextChunk;
    nextChunk?: TextChunk;
    knowledgeBase?: string;
    prompt?: string;
    sourceLanguage: string;
    targetLanguage: string;
}

// Funções principais
export const processKnowledgeBaseFile = async (filePath: string, params: ProcessKnowledgeBaseParams): Promise<KnowledgeBase> => {
    try {
        // Validar tipo de arquivo
        const fileExtension = path.extname(filePath).slice(1).toLowerCase();
        const allowedTypes: FileType[] = ['txt', 'csv', 'xlsx', 'xls'];
        
        if (!allowedTypes.includes(fileExtension as FileType)) {
            throw new ValidationError('Tipo de arquivo não suportado');
        }

        const fileType = fileExtension as FileType;

        // Ler conteúdo do arquivo
        const fileContent = await fs.promises.readFile(filePath);

        // Upload para S3
        const timestamp = Date.now();
        const s3Key = `knowledge-bases/${params.userId}/${timestamp}-${path.basename(filePath)}`;
        const spacesUrl = await uploadToS3(fileContent, s3Key);

        if (!spacesUrl) {
            throw new Error('Falha ao fazer upload do arquivo para S3');
        }

        // Ler conteúdo para processamento
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const chunks = splitIntoChunks(content);
        
        // Criar base de conhecimento com chunks
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                sourceLanguage: params.sourceLanguage,
                targetLanguage: params.targetLanguage,
                fileName: params.originalFileName || path.basename(filePath),
                filePath: spacesUrl,
                fileSize: fileContent.length,
                fileType: fileType,
                userId: params.userId,
                chunks: {
                    createMany: {
                        data: chunks.map(chunk => ({
                            content: chunk
                        }))
                    }
                }
            },
            include: {
                chunks: true
            }
        });

        // Limpar arquivo temporário
        await fs.promises.unlink(filePath);
        console.log('🧹 Arquivo temporário removido');

        return knowledgeBase;
    } catch (error) {
        console.error('❌ Erro ao processar arquivo da base de conhecimento:', error);
        
        // Limpar arquivo temporário em caso de erro
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                console.log('🧹 Arquivo temporário removido após erro');
            }
        } catch (cleanupError) {
            console.error('⚠️ Erro ao limpar arquivo temporário:', cleanupError);
        }
        
        throw error;
    }
};

// Função para buscar conteúdo da base de conhecimento
export const getKnowledgeBaseContent = async (knowledgeBaseId: string): Promise<string> => {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId },
        include: {
            chunks: {
                orderBy: {
                    id: 'asc'
                }
            }
        }
    });

    if (!knowledgeBase) {
        throw new Error('Base de conhecimento não encontrada');
    }

    return knowledgeBase.chunks.map(chunk => chunk.content).join('\n\n');
};

// Função para traduzir com contexto
export const translateWithContext = async (chunk: TextChunk, context: TranslationContext) => {
    try {
        let relevantContext = '';
        
        if (context.knowledgeBase) {
            try {
                relevantContext = await simpleSearchKnowledgeBaseContext(
                    chunk.content,
                    context.knowledgeBase,
                    3
                );
            } catch (error) {
                console.error('Erro ao buscar contexto relevante:', error);
            }
        }

        const prompt = `
            ${context.prompt || ''}
            
            ${relevantContext ? `Contexto Relevante da Base de Conhecimento:
            ${relevantContext}` : ''}
            
            Texto para traduzir:
            ${chunk.content}
            
            ${context.previousChunk?.content ? `Contexto anterior: ${context.previousChunk.content}` : ''}
            ${context.nextChunk?.content ? `Próximo contexto: ${context.nextChunk.content}` : ''}
            
            Traduza o texto de ${context.sourceLanguage} para ${context.targetLanguage}.
        `.trim();

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 4000
        });

        return response;
    } catch (error) {
        console.error('Erro na tradução:', error);
        throw error;
    }
};

// Função para dividir texto em chunks
const splitIntoChunks = (text: string, maxChunkSize: number = 1000): string[] => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += sentence;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
};

// Função para buscar contexto relevante de forma simplificada
export const simpleSearchKnowledgeBaseContext = async (
    query: string,
    knowledgeBaseId: string,
    limit: number = 3
): Promise<string> => {
    try {
        const chunks = await prisma.knowledgeBaseChunk.findMany({
            where: {
                knowledgeBaseId,
                content: {
                    contains: query,
                    mode: 'insensitive'
                }
            },
            take: limit,
            orderBy: {
                id: 'asc'
            }
        });
        
        return chunks.map(chunk => chunk.content).join('\n\n');
    } catch (error) {
        console.error('Erro ao buscar contexto relevante:', error);
        return '';
    }
};