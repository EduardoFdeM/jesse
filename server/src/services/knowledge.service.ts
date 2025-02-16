import path from 'path';
import prisma from '../config/database.js';
import { ValidationError, BadRequestError, NotFoundError } from '../utils/errors.js';
import openai from '../config/openai.js';
import type { VectorStore, VectorStoreFileList } from '../config/openai.js';
import { files, vectorStore } from '../config/openai.js';
import { Prisma, KnowledgeBase } from '@prisma/client';

interface SearchResult {
    content: string;
    relevance: number;
    metadata?: Record<string, any>;
}

// Interface para parâmetros
interface ProcessKnowledgeBaseParams {
    name: string;
    description: string;
    userId: string;
    files: Express.Multer.File[];
    existingFileIds?: string[];
    id?: string;
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

interface CreateKnowledgeBaseParams {
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
}

interface ProcessedFile {
    fileName: string;
    filePath: string;
    fileSize: number;
    fileIds: string[];
}

interface KnowledgeBaseData {
    id: string;
    name: string;
    description: string;
    userId: string;
    vectorStoreId: string | null;
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    fileIds: string[];
    status: string;
}

interface CreateVectorStoreParams {
    name: string;
    description: string;
    files: string[];
    userId: string;
}

const SUPPORTED_EXTENSIONS = [
    '.txt', '.pdf', '.doc', '.docx', '.pptx',
    '.md', '.html', '.js', '.ts', '.py',
    '.java', '.json', '.c', '.cpp', '.cs',
    '.css', '.go', '.php', '.rb', '.sh',
    '.tex'
];

// Funções principais
export const processKnowledgeBaseFiles = async (params: ProcessKnowledgeBaseParams): Promise<KnowledgeBase> => {
    try {
        console.log('📝 Iniciando processamento da Base de Conhecimento:', params.name);
        
        // Validar limite de arquivos
        const totalFiles = (params.files?.length || 0) + (params.existingFileIds?.length || 0);
        if (totalFiles > 10) {
            throw new BadRequestError('Limite máximo de 10 arquivos por base de conhecimento');
        }

        // 1. Criar Vector Store
        const store = await openai.beta.vectorStores.create({
            name: `kb_${params.name}_${Date.now()}`
        });
        
        const uploadedFiles = [];
        let totalSize = 0;
        const fileTypes = new Set<string>();
        const fileNames: string[] = [];

        // 2. Processar arquivos existentes
        if (params.existingFileIds && params.existingFileIds.length > 0) {
            for (const fileId of params.existingFileIds) {
                const fileInfo = await openai.files.get(fileId);
                await openai.beta.vectorStores.files.create(store.id, {
                    file_id: fileId
                });
                
                uploadedFiles.push(fileId);
                totalSize += fileInfo.bytes;
                fileTypes.add(path.extname(fileInfo.filename).slice(1));
                fileNames.push(fileInfo.filename);
            }
        }

        // 3. Processar novos arquivos
        if (params.files?.length > 0) {
            for (const file of params.files) {
                const fileObject = new File([file.buffer], file.originalname, { 
                    type: file.mimetype,
                    lastModified: Date.now()
                });
                const fileData = await openai.files.create({
                    file: fileObject,
                    purpose: 'assistants'
                });
                
                await openai.beta.vectorStores.files.create(store.id, {
                    file_id: fileData.id
                });
                
                uploadedFiles.push(fileData.id);
                totalSize += file.size;
                fileTypes.add(path.extname(file.originalname).slice(1));
                fileNames.push(file.originalname);
            }
        }

        // 4. Criar registro no banco
        return await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                userId: params.userId,
                vectorStoreId: store.id,
                fileIds: uploadedFiles,
                status: 'active'
            }
        });
    } catch (error) {
        console.error('❌ Erro ao processar Base de Conhecimento:', error);
        throw error;
    }
};

// Função para deletar base de conhecimento
export const deleteKnowledgeBase = async (id: string, userId: string): Promise<void> => {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id }
    });

    if (!knowledgeBase) {
        throw new BadRequestError('Base de conhecimento não encontrada');
    }

    if (knowledgeBase.userId !== userId) {
        throw new BadRequestError('Sem permissão para deletar esta base de conhecimento');
    }

    try {
        // 1. Deletar arquivos da OpenAI
        for (const fileId of knowledgeBase.fileIds) {
            await openai.files.del(fileId);
        }

        // 2. Deletar Vector Store
        if (knowledgeBase.vectorStoreId) {
            await openai.beta.vectorStores.del(knowledgeBase.vectorStoreId);
        }

        // 3. Deletar do banco
        await prisma.knowledgeBase.delete({
            where: { id }
        });
    } catch (error) {
        console.error('Erro ao deletar base de conhecimento:', error);
        throw error;
    }
};

// Função para listar arquivos de uma base de conhecimento
export const listKnowledgeBaseFiles = async (id: string) => {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id }
    });

    if (!knowledgeBase?.vectorStoreId) {
        throw new BadRequestError('Base de conhecimento não encontrada');
    }

    const response = await fetch(`https://api.openai.com/v1/vector-stores/${knowledgeBase.vectorStoreId}/files`, {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
        }
    });

    if (!response.ok) {
        throw new Error('Erro ao listar arquivos da Vector Store');
    }

    return await response.json();
};

// Função para buscar conteúdo da base de conhecimento
export const getKnowledgeBaseContent = async (knowledgeBaseId: string): Promise<string> => {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId }
    });

    if (!knowledgeBase) {
        throw new Error('Base de conhecimento não encontrada');
    }

    // Buscar arquivos da Vector Store
    const vectorFiles = await openai.vectorStore.files.list(knowledgeBase.vectorStoreId!);
    return vectorFiles.data.map(file => file.id).join('\n\n');
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

        if (!knowledgeBase?.vectorStoreId) {
            throw new Error('Base de conhecimento não encontrada');
        }

        const response = await fetch(`https://api.openai.com/v1/vector-stores/${knowledgeBase.vectorStoreId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, limit })
        });
        const results = await response.json();
        return results.documents.join('\n\n');
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
export const createVectorStore = async (params: CreateVectorStoreParams): Promise<KnowledgeBase> => {
    try {
        // Criar Vector Store usando a API direta
        const response = await fetch('https://api.openai.com/v1/vector_stores', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({
                name: `kb_${params.name}_${Date.now()}`
            })
        });

        if (!response.ok) {
            throw new Error(`Erro ao criar Vector Store: ${response.statusText}`);
        }

        const store = await response.json();

        // Adicionar arquivos à Vector Store
        for (const fileId of params.files) {
            await fetch(`https://api.openai.com/v1/vector_stores/${store.id}/files`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                },
                body: JSON.stringify({ file_id: fileId })
            });
        }

        // Criar registro no banco
        return await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                vectorStoreId: store.id,
                fileIds: params.files,
                userId: params.userId,
                status: 'active'
            }
        });
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

export const getVectorStore = async (id: string) => {
    const store = await openai.beta.vectorStores.retrieve(id);
    return store;
};

export const searchKnowledgeBase = async (query: string, knowledgeBaseId: string): Promise<string> => {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId }
    });

    if (!knowledgeBase?.vectorStoreId) {
        throw new Error('Base de conhecimento não encontrada');
    }

    const response = await fetch(`https://api.openai.com/v1/vector-stores/${knowledgeBase.vectorStoreId}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    const results = await response.json();
    return results.documents.join('\n\n');
};