import fs from 'fs';
import path from 'path';
import prisma from '../config/database.js';
import { KnowledgeBase } from '@prisma/client';
import { uploadToS3, deleteFromS3 } from '../config/storage.js';
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

// Interfaces para Vector Store
interface VectorStore {
    id: string;
    name: string;
    created_at: number;
}

interface CreateKnowledgeBaseParams {
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
}

// Interface estendida do KnowledgeBase para incluir o vectorStoreId
interface KnowledgeBaseWithVectorStore extends KnowledgeBase {
    vectorStoreId: string | null;
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

        // Extrair texto do arquivo de acordo com o tipo
        let content = '';
        if (fileType === 'txt') {
            content = await fs.promises.readFile(filePath, 'utf-8');
        } else if (['xlsx', 'xls'].includes(fileType)) {
            content = await extractTextFromXLSX(filePath);
        } else if (fileType === 'csv') {
            content = await fs.promises.readFile(filePath, 'utf-8');
        }

        const chunks = splitIntoChunks(content);
        
        // Criar Vector Store para a base de conhecimento
        const vectorStore = await createVectorStore(`kb_${params.name}_${Date.now()}`);

        // Criar base de conhecimento com referência ao Vector Store
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
                vectorStoreId: vectorStore.id,
                chunks: {
                    createMany: {
                        data: chunks.map((chunk: string) => ({
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
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id: knowledgeBaseId }
        });

        if (!knowledgeBase) {
            throw new Error('Base de conhecimento não encontrada');
        }

        // TODO: Implementar busca no Vector Store
        // Por enquanto, retorna string vazia
        return '';
    } catch (error) {
        console.error('Erro ao buscar contexto relevante:', error);
        return '';
    }
};

// Função para extrair texto de arquivo XLSX
const extractTextFromXLSX = async (filePath: string): Promise<string> => {
    try {
        const XLSX = (await import('xlsx')).default;
        const workbook = XLSX.readFile(filePath);
        
        let fullText = '';
        
        // Concatena o texto de todas as planilhas
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const text = XLSX.utils.sheet_to_txt(sheet);
            // Limpa caracteres inválidos e garante UTF-8 válido
            const cleanText = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
                                .replace(/\u0000/g, ''); // Remove null bytes
            fullText += cleanText + '\n\n';
        });
        
        return fullText.trim();
    } catch (error) {
        console.error('Erro ao extrair texto do XLSX:', error);
        throw error;
    }
};

// Funções do Vector Store
export const createVectorStore = async (name: string): Promise<VectorStore> => {
    try {
        const response = await fetch('https://api.openai.com/v1/vector_stores', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({ name })
        });

        if (!response.ok) {
            throw new Error(`Erro ao criar Vector Store: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Erro ao criar Vector Store:', error);
        throw error;
    }
};

export const listVectorStores = async (): Promise<VectorStore[]> => {
    try {
        const response = await fetch('https://api.openai.com/v1/vector_stores', {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro ao listar Vector Stores: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Erro ao listar Vector Stores:', error);
        throw error;
    }
};

export const getVectorStore = async (vectorStoreId: string): Promise<VectorStore> => {
    try {
        const response = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro ao buscar Vector Store: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar Vector Store:', error);
        throw error;
    }
};

// Função principal para criar base de conhecimento
export const createKnowledgeBase = async (params: CreateKnowledgeBaseParams): Promise<KnowledgeBase> => {
    try {
        // Criar Vector Store
        const vectorStore = await createVectorStore(`kb_${params.name}_${Date.now()}`);

        // Criar base de conhecimento com Vector Store ID
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                sourceLanguage: params.sourceLanguage,
                targetLanguage: params.targetLanguage,
                userId: params.userId,
                fileName: 'vector_store.txt',
                filePath: 'vector_store',
                fileSize: 0,
                fileType: 'txt',
                vectorStoreId: vectorStore.id
            }
        });

        return knowledgeBase;
    } catch (error) {
        console.error('❌ Erro ao criar base de conhecimento:', error);
        throw error;
    }
};

// Função para deletar base de conhecimento
export const deleteKnowledgeBase = async (id: string) => {
    try {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id }
        });

        if (!knowledgeBase) {
            throw new ValidationError('Base de conhecimento não encontrada');
        }

        // Deletar Vector Store
        if (knowledgeBase.vectorStoreId) {
            try {
                const response = await fetch(`https://api.openai.com/v1/vector_stores/${knowledgeBase.vectorStoreId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                        'OpenAI-Beta': 'assistants=v2'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Erro ao deletar Vector Store: ${response.statusText}`);
                }
            } catch (error) {
                console.error('Erro ao deletar Vector Store:', error);
            }
        }

        // Deletar base de conhecimento
        await prisma.knowledgeBase.delete({
            where: { id }
        });

        return true;
    } catch (error) {
        console.error('Erro ao deletar base de conhecimento:', error);
        throw error;
    }
};