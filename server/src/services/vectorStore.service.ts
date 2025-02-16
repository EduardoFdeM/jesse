import { OpenAI } from 'openai';
import prisma from '../config/database.js';
import openai from '../config/openai.js';
import { BadRequestError } from '../utils/errors.js';
import { 
    CreateVectorStoreParams, 
    VectorStoreResponse, 
    VectorStoreSearchResult, 
    SearchParams, 
    VectorStoreFile,
    VectorStoreFileList 
} from '../types/vectorStore.types.js';
import { KnowledgeBase } from '@prisma/client';
import path from 'path';
import redis from '../config/redis.js';

export const createVectorStore = async (params: {
    name: string;
    description: string;
    files: Express.Multer.File[];
    userId: string;
}): Promise<KnowledgeBase> => {
    try {
        const uploadedFiles = [];
        let totalSize = 0;
        const fileTypes = new Set<string>();
        const fileNames: string[] = [];

        // 1. Criar Vector Store
        const store = await openai.beta.vectorStores.create({
            name: `kb_${params.name}_${Date.now()}`
        });

        // 2. Processar arquivos
        for (const file of params.files) {
            const fileData = await openai.files.create({
                file: new File([file.buffer], file.originalname, { type: file.mimetype }),
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

        // 3. Criar registro no banco mantendo a estrutura existente
        return await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                vectorStoreId: store.id,
                fileIds: uploadedFiles,
                userId: params.userId,
                status: 'active'
            }
        });
    } catch (error) {
        console.error('Erro ao criar Vector Store:', error);
        throw new BadRequestError(`Erro ao criar Vector Store: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
};

// Listar Vector Stores
export const listVectorStores = async (userId: string): Promise<KnowledgeBase[]> => {
    return await prisma.knowledgeBase.findMany({
        where: {
            OR: [
                { userId },
                { isPublic: true }
            ],
            status: 'active'
        }
    });
};

// Deletar Vector Store
export const deleteVectorStore = async (id: string, userId: string): Promise<void> => {
    const vectorStore = await prisma.knowledgeBase.findUnique({
        where: { id }
    });

    if (!vectorStore) {
        throw new BadRequestError('Vector Store não encontrada');
    }

    if (vectorStore.userId !== userId) {
        throw new BadRequestError('Sem permissão para deletar esta Vector Store');
    }

    try {
        // Deletar arquivos da OpenAI
        for (const fileId of vectorStore.fileIds) {
            await openai.files.del(fileId);
        }

        // Deletar Vector Store
        if (vectorStore.vectorStoreId) {
            await openai.beta.vectorStores.del(vectorStore.vectorStoreId);
        }

        // Deletar do banco
        await prisma.knowledgeBase.delete({
            where: { id }
        });
    } catch (error) {
        console.error('Erro ao deletar Vector Store:', error);
        throw error;
    }
};

export const searchVectorStore = async (params: SearchParams): Promise<VectorStoreSearchResult[]> => {
    try {
        const { vectorStoreId, query, maxResults = 5, threshold = 0.7, filters } = params;
        
        // Cache key para resultados frequentes
        const cacheKey = `search:${vectorStoreId}:${query}:${maxResults}:${threshold}`;
        const cachedResults = await redis.get(cacheKey);
        
        if (cachedResults) {
            return JSON.parse(cachedResults);
        }

        // Busca na Vector Store
        const searchResponse = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({ query, maxResults, threshold })
        }).then(res => res.json());

        // Processa e filtra resultados
        const results = await Promise.all(
            searchResponse.matches
                .filter((match: { score: number; metadata: { fileType: string } }) => {
                    if (!filters) return true;
                    
                    // Aplica filtros
                    if (filters.minScore && match.score < filters.minScore) return false;
                    if (filters.fileType && !filters.fileType.includes(match.metadata.fileType)) return false;
                    
                    return true;
                })
                .map(async (match: { file: { id: string }; score: number; text: string }) => {
                    const fileInfo = await openai.files.get(match.file.id);
                    
                    return {
                        id: match.file.id,
                        score: match.score,
                        content: match.text,
                        metadata: {
                            filename: fileInfo.filename,
                            fileType: path.extname(fileInfo.filename).slice(1),
                            fileSize: fileInfo.bytes,
                            createdAt: new Date(fileInfo.created_at * 1000)
                        }
                    };
                })
        );

        // Cache dos resultados
        await redis.setex(cacheKey, 3600, JSON.stringify(results));

        return results;
    } catch (error) {
        console.error('Erro na busca contextual:', error);
        throw error;
    }
};

export const getFiles = async (vectorStoreId: string): Promise<VectorStoreFile[]> => {
    try {
        const response = await openai.beta.vectorStores.files.list(vectorStoreId);
        return response.data.map((file: { id: string; filename?: string; bytes?: number; purpose?: string; created_at: number }) => ({
            id: file.id,
            filename: file.filename || 'Sem nome',
            bytes: file.bytes || 0,
            purpose: file.purpose || 'assistants',
            created_at: file.created_at
        }));
    } catch (error) {
        console.error('Erro ao listar arquivos da Vector Store:', error);
        throw error;
    }
}; 