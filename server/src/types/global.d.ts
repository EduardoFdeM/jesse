import { Server } from 'socket.io';

export enum UserRole {
    SUPERUSER = 'SUPERUSER',
    TRANSLATOR = 'TRANSLATOR',
    EDITOR = 'EDITOR'
}

export enum TranslationStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    ERROR = 'error'
}

declare global {
    // Socket.IO global instance
    var io: Server | undefined;

    // User Types
    interface User {
        id: string;
        name: string;
        email: string;
        password: string;
        role: string;
        createdAt: Date;
        updatedAt: Date;
        translations?: Translation[];
        knowledgeBases?: KnowledgeBase[];
        prompts?: Prompt[];
        _count?: {
            translations: number;
            knowledgeBases: number;
            prompts: number;
        };
    }

    // Translation Types
    interface Translation {
        id: string;
        fileName: string;
        originalName: string;
        filePath: string;
        fileSize: number;
        fileType: string;
        sourceLanguage: string;
        targetLanguage: string;
        status: TranslationStatus;
        errorMessage?: string;
        translatedUrl?: string;
        costData?: string;
        usedPrompt: boolean;
        usedKnowledgeBase: boolean;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        knowledgeBaseId?: string;
        promptId?: string;
        translationMetadata?: string;
        plainTextContent?: string;
        threadId?: string;
        runId?: string;
        assistantId?: string;
    }

    // Knowledge Base Types
    interface KnowledgeBase {
        id: string;
        name: string;
        description: string;
        fileName: string;
        filePath: string;
        fileSize: number;
        fileType: string;
        vectorStoreId?: string;
        fileIds: string[];
        fileMetadata?: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }

    interface KnowledgeBaseChunk {
        id: string;
        content: string;
        knowledgeBaseId: string;
        createdAt: Date;
        updatedAt: Date;
    }

    // Prompt/Assistant Types
    interface Prompt {
        id: string;
        name: string;
        description: string;
        content: string;
        tags: string[];
        version: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        isPublic: boolean;
        model: string;
        temperature: number;
    }

    interface PromptVersion {
        id: string;
        version: string;
        content: string;
        description?: string;
        tags: string[];
        createdAt: Date;
        promptId: string;
        userId: string;
    }

    // Socket Events
    interface SocketEvents {
        TRANSLATION_STARTED: 'translation:started';
        TRANSLATION_PROGRESS: 'translation:progress';
        TRANSLATION_COMPLETED: 'translation:completed';
        TRANSLATION_ERROR: 'translation:error';
    }

    // API Response
    interface ApiResponse<T> {
        status?: string;
        message?: string;
        data?: T;
        error?: string;
    }

    // OpenAI Types
    interface OpenAIClient {
        vectorStore: {
            create: (name: string) => Promise<VectorStore>;
            delete: (id: string) => Promise<void>;
            files: {
                add: (vectorStoreId: string, fileId: string) => Promise<VectorStoreFile>;
                list: (vectorStoreId: string) => Promise<VectorStoreFileList>;
            };
        };
        files: {
            upload: (buffer: Buffer, filename: string) => Promise<OpenAIFile>;
            list: () => Promise<{ data: OpenAIFile[] }>;
            get: (fileId: string) => Promise<OpenAIFile>;
            delete: (fileId: string) => Promise<void>;
        };
        assistant: {
            list: () => Promise<OpenAIAssistantList>;
            create: (params: AssistantCreateParams) => Promise<AssistantResponse>;
            modify: (assistantId: string, params: AssistantModifyParams) => Promise<AssistantResponse>;
            delete: (assistantId: string) => Promise<void>;
        };
        beta: {
            threads: {
                create: () => Promise<ThreadResponse>;
                messages: {
                    create: (threadId: string, params: MessageCreateParams) => Promise<MessageResponse>;
                    list: (threadId: string) => Promise<{ data: MessageResponse[] }>;
                };
                runs: {
                    create: (threadId: string, params: RunCreateParams) => Promise<RunResponse>;
                    retrieve: (threadId: string, runId: string) => Promise<RunResponse>;
                };
            };
        };
    }

    interface AssistantCreateParams {
        name: string;
        instructions: string;
        model: string;
        temperature?: number;
    }

    interface AssistantModifyParams {
        name?: string;
        instructions?: string;
        model?: string;
    }

    interface MessageCreateParams {
        role: string;
        content: string;
    }

    interface RunCreateParams {
        assistant_id: string;
        model: string;
    }

    // Translation Metadata
    interface TranslationMetadata {
        usedKnowledgeBase: boolean;
        usedPrompt: boolean;
        knowledgeBaseName: string | null;
        promptName: string | null;
    }

    // Stats Types
    interface UserStats {
        translations: Translation[];
        translationStats: Record<string, number>;
        costByMonth: Record<string, number>;
        successRate: number;
        averageTranslationTime: number;
        recentActivity: Array<{
            id: string;
            type: 'translation' | 'prompt';
            action: string;
            timestamp: string;
            details: Record<string, string | number | boolean | null>;
        }>;
    }

    interface UserActivity {
        id: string;
        type: 'translation' | 'prompt' | 'knowledge_base' | 'edit';
        action: string;
        timestamp: string;
        details: {
            fileName?: string;
            fileType?: string;
            status?: TranslationStatus;
            cost?: number;
            promptName?: string;
            knowledgeBaseName?: string;
        };
    }
}

export {};

// Não é necessário exportar nada em arquivos de declaração 