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
    userId: string;
    translationId: string;
    outputFormat: string;
    originalName: string;
    knowledgeBaseId?: string;
    promptId?: string;
    useKnowledgeBase?: boolean;
    useCustomPrompt?: boolean;
    useCustomAssistant?: boolean;
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
    translatedContent: string;
    translatedFilePath: string;
    cost: number;
    metadata: {
        completedAt: string;
        model: string;
        totalTokens: number;
        threadId?: string;
        runId?: string;
        assistantId?: string;
    };
} 