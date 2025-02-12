import path from 'path';
import prisma from '../config/database.js';
import { KnowledgeBase } from '@prisma/client';
import { ValidationError, BadRequestError } from '../utils/errors.js';
import openai from '../config/openai.js';
import { VectorStore, VectorStoreFileList, files, vectorStore } from '../config/openai.js';

// Interface para parâmetros
interface ProcessKnowledgeBaseParams {
    name: string;
    description: string;
    userId: string;
    files: Express.Multer.File[];
    existingFileIds?: string[];
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
        console.log('📝 Criando Vector Store:', params.name);
        const store = await vectorStore.create(`kb_${params.name}_${Date.now()}`);
        console.log('✅ Vector Store criada:', store.id);

        const uploadedFiles = [];

        // Processar arquivos existentes
        if (params.existingFileIds && params.existingFileIds.length > 0) {
            console.log('📎 Vinculando arquivos existentes:', params.existingFileIds);
            for (const fileId of params.existingFileIds) {
                try {
                    await vectorStore.files.add(store.id, fileId);
                    const fileInfo = await files.get(fileId);
                    uploadedFiles.push({
                        fileName: fileInfo.filename,
                        fileSize: fileInfo.bytes,
                        fileType: fileInfo.filename.split('.').pop() || 'unknown',
                        fileId: fileInfo.id
                    });
                } catch (err) {
                    const error = err as Error;
                    console.error(`❌ Erro ao vincular arquivo ${fileId}:`, error.message);
                    throw new BadRequestError(`Erro ao vincular arquivo: ${error.message}`);
                }
            }
        }

        // Processar novos arquivos
        if (params.files && params.files.length > 0) {
            console.log('📤 Enviando novos arquivos para OpenAI');
            for (const file of params.files) {
                try {
                    console.log('📤 Enviando arquivo:', file.originalname);
                    const fileData = await files.upload(file.buffer, file.originalname);
                    console.log('✅ Arquivo enviado:', fileData.id);

                    console.log('🔗 Vinculando arquivo à Vector Store:', store.id);
                    await vectorStore.files.add(store.id, fileData.id);

                    uploadedFiles.push({
                        fileName: file.originalname,
                        fileSize: file.size,
                        fileType: file.originalname.split('.').pop() || 'unknown',
                        fileId: fileData.id
                    });
                } catch (err) {
                    const error = err as Error;
                    console.error('❌ Erro ao processar arquivo:', error.message);
                    throw new BadRequestError(`Erro ao processar arquivo: ${error.message}`);
                }
            }
        }

        // Criar base de conhecimento no banco
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                userId: params.userId,
                vectorStoreId: store.id,
                fileName: uploadedFiles.map(f => f.fileName).join(', '),
                filePath: 'vector_store',
                fileSize: uploadedFiles.reduce((acc, f) => acc + f.fileSize, 0),
                fileType: uploadedFiles.map(f => f.fileType).join(', '),
                fileIds: uploadedFiles.map(f => f.fileId)
            }
        });

        return knowledgeBase;
    } catch (err) {
        const error = err as Error;
        console.error('❌ Erro ao processar base de conhecimento:', error.message);
        throw new BadRequestError(`Falha ao processar base de conhecimento: ${error.message}`);
    }
};

// Função para deletar base de conhecimento
export const deleteKnowledgeBase = async (id: string): Promise<boolean> => {
    try {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id }
        });

        if (!knowledgeBase) {
            throw new BadRequestError('Base de conhecimento não encontrada');
        }

        // Deletar Vector Store
        if (knowledgeBase.vectorStoreId) {
            await vectorStore.delete(knowledgeBase.vectorStoreId);
        }

        // Deletar do banco
        await prisma.knowledgeBase.delete({
            where: { id }
        });

        return true;
    } catch (err) {
        const error = err as Error;
        console.error('❌ Erro ao deletar base de conhecimento:', error.message);
        throw new BadRequestError(`Erro ao deletar base de conhecimento: ${error.message}`);
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

    return vectorStore.files.list(knowledgeBase.vectorStoreId);
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

// Função para criar base de conhecimento
export const createKnowledgeBase = async (
    userId: string,
    name: string,
    description: string,
    files: Express.Multer.File[],
    existingFileIds?: string[]
): Promise<KnowledgeBase> => {
    try {
        const processedFiles: string[] = [];
        let totalSize = 0;
        const fileTypes = new Set<string>();
        const fileNames: string[] = [];
        
        // Processa os novos arquivos
        for (const file of files) {
            try {
                const openaiFile = await openai.files.upload(file.buffer, file.originalname);
                processedFiles.push(openaiFile.id);
                totalSize += file.size;
                fileTypes.add(path.extname(file.originalname).slice(1));
                fileNames.push(file.originalname);
            } catch (err) {
                console.error('Erro ao processar arquivo:', file.originalname, err);
                throw new Error(`Erro ao processar arquivo ${file.originalname}: ${(err as Error).message}`);
            }
        }
        
        // Processa os arquivos existentes
        if (existingFileIds && existingFileIds.length > 0) {
            for (const fileId of existingFileIds) {
                try {
                    const openaiFile = await openai.files.get(fileId);
                    processedFiles.push(fileId);
                    totalSize += openaiFile.bytes;
                    fileTypes.add(path.extname(openaiFile.filename).slice(1));
                    fileNames.push(openaiFile.filename);
                } catch (err) {
                    console.error('Erro ao processar arquivo existente:', fileId, err);
                    throw new Error(`Erro ao processar arquivo existente ${fileId}: ${(err as Error).message}`);
                }
            }
        }

        // Cria o Vector Store
        const vectorStore = await openai.vectorStore.create(`kb_${name}_${Date.now()}`);

        // Adiciona os arquivos ao Vector Store
        for (const fileId of processedFiles) {
            await openai.vectorStore.files.add(vectorStore.id, fileId);
        }

        // Cria o Knowledge Base no banco de dados
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                name,
                description,
                userId,
                vectorStoreId: vectorStore.id,
                fileName: fileNames.join(', '),
                filePath: 'vector_store',
                fileSize: totalSize,
                fileType: Array.from(fileTypes).join(', '),
                fileIds: processedFiles
            }
        });

        return knowledgeBase;
    } catch (err) {
        console.error('Erro ao criar knowledge base:', err);
        throw err;
    }
};