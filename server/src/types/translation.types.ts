import { TranslationStatus } from '@prisma/client';

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
    translationId: string;
    originalName: string;
    useCustomPrompt?: boolean;
    promptId?: string;
    useKnowledgeBase?: boolean;
    knowledgeBaseId?: string;
    assistantId?: string;
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