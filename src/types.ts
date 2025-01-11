export interface GlossaryEntry {
    id: string;
    sourceText: string;
    targetText: string;
    context?: string;
    category?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface KnowledgeBase {
    id: string;
    name: string;
    description: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    sourceLanguage: string;
    targetLanguage: string;
    entries: GlossaryEntry[];
    createdAt: Date;
    updatedAt: Date;
    _count?: {
        entries: number;
    };
}

export interface TranslationJob {
    id: string;
    fileName: string;
    originalName: string;
    sourceLanguage: string;
    targetLanguage: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    progress: number;
    error?: string;
    originalSize: number;
    translatedSize?: number;
    translatedUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface AuthState {
    user: {
        id: string;
        email: string;
        name?: string;
    } | null;
    isAuthenticated: boolean;
} 