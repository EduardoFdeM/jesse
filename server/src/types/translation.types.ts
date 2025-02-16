export enum TranslationStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    RETRIEVING_CONTEXT = 'retrieving_context',
    TRANSLATING = 'translating',
    COMPLETED = 'completed',
    ERROR = 'error'
}

export interface TranslationResult {
    content: string;
    metadata: {
        completedAt: string;
        model: string;
        totalTokens: number;
        threadId?: string;
        assistantId?: string;
        status?: TranslationStatus;
    };
}

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

export interface TranslationMessage {
    content: string;
    sourceLanguage: string;
    targetLanguage: string;
}

export interface SaveTranslationResultParams {
    translationId: string;
    filePath: string;
    targetLanguage: string;
    totalTokens: number;
    content: string;
    threadId?: string;
    runId?: string;
    assistantId?: string;
}

export interface TranslationData {
    id: string;
    status: TranslationStatus;
    filePath: string;
    translatedFilePath: string;
    translatedContent: string;
    originalName: string;
    sourceLanguage: string;
    targetLanguage: string;
    cost: number;
    metadata: {
        inputTokens: number;
        outputTokens: number;
        model: string;
        threadId: string;
        runId: string;
        completedAt: string;
    };
}

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
    errorMessage?: string;
    translatedUrl?: string | null;
    createdAt: string;
    updatedAt: string;
    userId: string;
    knowledgeBaseId: string | null;
    promptId: string | null;
    translationMetadata: string;
    usedPrompt: boolean;
    usedKnowledgeBase: boolean;
    threadId?: string;
    runId?: string;
    assistantId?: string;
}

export const EVENTS = {
    STARTED: 'translation:started',
    PROGRESS: 'translation:progress',
    COMPLETED: 'translation:completed',
    ERROR: 'translation:error'
}; 