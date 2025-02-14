import { PrismaClient } from '@prisma/client';

// Status possíveis para uma tradução
export enum TranslationStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    RETRIEVING_CONTEXT = 'retrieving_context',
    TRANSLATING = 'translating',
    COMPLETED = 'completed',
    ERROR = 'error'
}

// Parâmetros para tradução de arquivo
export interface TranslateFileParams {
    filePath: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
    translationId: string;
    outputFormat: string;
    originalName: string;
    knowledgeBaseId?: string;
    promptId?: string;
    useKnowledgeBase: boolean;
    useCustomPrompt: boolean;
    fileSize: number;
}

// Interfaces base
export interface Translation {
    id: string;
    fileName: string;
    originalName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    sourceLanguage: string;
    targetLanguage: string;
    status: TranslationStatus;
    errorMessage?: string | null;
    translatedUrl?: string | null;
    createdAt: string;
    updatedAt: string;
    userId: string;
    knowledgeBaseId: string | null;
    promptId: string | null;
    translationMetadata: string;
    usedPrompt: boolean;
    usedKnowledgeBase: boolean;
    threadId?: string | null;
    runId?: string | null;
    assistantId?: string | null;
    costData?: string;
    knowledgeBase?: {
        id: string;
        name: string;
    };
    prompt?: {
        id: string;
        name: string;
    };
}

export interface KnowledgeBase {
    id: string;
    name: string;
}

export interface Prompt {
    id: string;
    name: string;
}
// Dados de retorno da tradução
export interface TranslationData extends Translation {
    knowledgeBase?: {
        id: string;
        name: string;
    };
    prompt?: {
        id: string;
        name: string;
    };
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

// Constantes para eventos do Socket
export const EVENTS = {
    STARTED: 'translation:started',
    PROGRESS: 'translation:progress',
    COMPLETED: 'translation:completed',
    ERROR: 'translation:error'
} as const;

// Eventos do Socket
export type SocketEventType = typeof EVENTS[keyof typeof EVENTS];

// Dados de progresso da tradução
export interface TranslationProgress {
    translationId: string;
    status: TranslationStatus;
    progress?: number;
    timestamp: Date;
}

// Interface para o socket
export interface SocketEmitter {
    emit: (event: string, data: any) => void;
}

// Interface para tracking de custos
export interface CostTracking {
    translationId: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
    cost: number;
}

export type FileType = 'translation' | 'knowledge_base';

interface ProcessKnowledgeBaseParams {
    id?: string;
    name: string;
    description: string;
    userId: string;
    files: Express.Multer.File[];
    existingFileIds?: string[];
} 