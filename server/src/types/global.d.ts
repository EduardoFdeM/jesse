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
        role: UserRole;
        createdAt: Date;
        updatedAt: Date;
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
    interface AssistantConfig {
        id: string;
        name: string;
        model: string;
        instructions: string;
        temperature: number;
    }

    interface CostData {
        totalCost: number;
        processingTime: number;
        tokensUsed: {
            prompt: number;
            completion: number;
            total: number;
        };
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
        totalTranslations: number;
        totalKnowledgeBases: number;
        totalPrompts: number;
        totalCost: number;
        translationStats: Record<TranslationStatus, number>;
        monthlyActivity: Record<string, number>;
        recentTranslations: Translation[];
        recentPrompts: Prompt[];
        recentActivity: UserActivity[];
        averageTranslationTime: number;
        successRate: number;
        costByMonth: Record<string, number>;
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