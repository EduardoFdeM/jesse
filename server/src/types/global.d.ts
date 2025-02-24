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
        usedAssistant: boolean;
        usedKnowledgeBase: boolean;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        knowledgeBaseId?: string;
        assistantId?: string;
        translationMetadata?: string;
        plainTextContent?: string;
        threadId?: string;
        runId?: string;
        shares?: TranslationShare[];
        user?: User;
    }

    interface TranslationShare {
        id: string;
        translationId: string;
        sharedById: string;
        sharedWithId: string;
        createdAt: Date;
        translation: Translation;
        sharedBy: User;
        sharedWith: User;
    }

    interface User {
        id: string;
        name: string;
        email: string;
        role: UserRole;
        createdAt: Date;
        updatedAt: Date;
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

    interface OpenAIAssistant {
        id: string;
        object: 'assistant';
        created_at: number;
        name: string | null;
        description: string | null;
        model: string;
        instructions: string | null;
        tools: Array<{
            type: string;
            file_search?: {
                ranking_options: {
                    ranker: string;
                    score_threshold: number;
                }
            }
        }>;
        top_p: number;
        temperature: number;
        reasoning_effort: string | null;
        tool_resources: {
            file_search?: {
                vector_store_ids: string[];
            };
            code_interpreter?: {
                file_ids: string[];
            };
        };
        metadata: Record<string, unknown>;
        response_format: 'auto' | { type: string };
    }

    interface OpenAIAssistantList {
        object: 'list';
        data: OpenAIAssistant[];
        first_id: string;
        last_id: string;
        has_more: boolean;
    }

    // Assistant Types
    interface Assistant {
        id: string;
        name: string;
        description: string;
        instructions: string;
        tags: string[];
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        isPublic: boolean;
        model: string;
        temperature: number;
        assistantId: string;
        status: 'pending' | 'active' | 'error';
    }

    interface ThreadResponse {
        id: string;
        object: string;
        created_at: number;
        metadata: Record<string, unknown>;
    }

    interface RunResponse {
        id: string;
        object: string;
        created_at: number;
        thread_id: string;
        assistant_id: string;
        status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'requires_action';
        required_action?: {
            type: string;
            submit_tool_outputs?: {
                tool_calls: Array<{
                    id: string;
                    type: string;
                    function: {
                        name: string;
                        arguments: string;
                    };
                }>;
            };
        };
        last_error?: {
            code: string;
            message: string;
        };
        expires_at: number;
        started_at: number | null;
        cancelled_at: number | null;
        failed_at: number | null;
        completed_at: number | null;
        model: string;
        instructions: string | null;
        tools: Array<{
            type: string;
        }>;
        file_ids: string[];
        metadata: Record<string, unknown>;
        usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
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

interface TranslationRequest {
    sourceLanguage: string;
    targetLanguage: string;
    useKnowledgeBase: boolean;
    useCustomAssistant: boolean;
    knowledgeBaseId?: string;
    assistantId?: string;
    file: Express.Multer.File;
}

interface AssistantResponse {
    id: string;
    name: string;
    description: string;
    instructions: string;
    model: string;
    temperature: number;
    assistantId: string;
    status: 'pending' | 'active' | 'error';
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface DocumentStructure {
    type: 'document';
    metadata: {
        title?: string;
        author?: string;
        creationDate?: string;
        pages: number;
    };
    pages: PageStructure[];
}

export interface PageStructure {
    type: 'page';
    pageIndex: number;
    elements: PageElement[];
    layout: {
        columns: number;
        margins: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
    };
}

export interface PageElement {
    type: 'title' | 'paragraph' | 'table' | 'image' | 'list';
    content: string;
    elementIndex: number;
    style: {
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        alignment?: 'left' | 'center' | 'right' | 'justify';
        color?: string;
        columnSpan?: number;
    };
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export {}; 