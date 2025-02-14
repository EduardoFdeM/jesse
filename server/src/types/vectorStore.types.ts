import { KnowledgeBase } from '@prisma/client';

export interface VectorStoreFile {
    id: string;
    object: 'vector_store.file';
    created_at: number;
    vector_store_id: string;
}

export interface VectorStoreFileList {
    object: 'list';
    data: VectorStoreFile[];
    has_more: boolean;
}

export interface ProcessKnowledgeBaseParams {
    name: string;
    description: string;
    files?: Express.Multer.File[];
    existingFileIds?: string[];
    userId: string;
}

export interface KnowledgeBaseResponse {
    id: string;
    name: string;
    description: string;
    vectorStoreId: string;
    fileIds: string[];
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    status: 'active' | 'deleted';
    createdAt: Date;
    updatedAt: Date;
}

export interface SearchKnowledgeBaseParams {
    knowledgeBaseId: string;
    query: string;
    maxResults?: number;
    minRelevance?: number;
}

export interface VectorStoreSearchResult {
    text: string;
    relevance: number;
    metadata?: Record<string, any>;
}

export interface VectorStoreSearchResponse {
    object: 'list';
    data: VectorStoreSearchResult[];
    has_more: boolean;
}

export interface CreateVectorStoreParams {
    name: string;
    description: string;
    files: Express.Multer.File[];
    userId: string;
}

export interface VectorStoreResponse {
    id: string;
    name: string;
    description: string;
    vectorStoreId: string;
    fileIds: string[];
    status: string;
    createdAt: Date;
    updatedAt: Date;
} 