export interface TranslationResult {
    content: string;
    metadata: {
        completedAt: string;
        model: string;
        totalTokens: number;
    };
}

export interface TranslationMessage {
    content: string;
    sourceLanguage: string;
    targetLanguage: string;
} 