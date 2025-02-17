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
    let io: Server | undefined;

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
}

declare module 'tesseract.js' {
    interface RecognizeResult {
        data: {
            text: string;
            confidence: number;
            lines: any[];
            words: any[];
        };
    }

    interface Worker {
        loadLanguage(language: string): Promise<void>;
        initialize(language: string): Promise<void>;
        recognize(image: Buffer | string): Promise<RecognizeResult>;
        terminate(): Promise<void>;
    }

    interface WorkerOptions {
        logger?: (message: any) => void;
        errorHandler?: (error: Error) => void;
    }

    export function createWorker(options?: WorkerOptions): Promise<Worker>;
}

export {}; 