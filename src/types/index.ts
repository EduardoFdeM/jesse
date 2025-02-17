// Enums
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

export enum ViewStatus {
    ALL = "all",
    TO_EDIT = "to_edit",
    EDITED = "edited",
    APPROVED = "approved",
    REVIEW = "review",
    ARCHIVED = "archived"
}

// Tipos de usuário
export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    createdAt?: string;
    updatedAt?: string;
    _count?: {
        translations: number;
        knowledgeBases: number;
        prompts: number;
    };
}

// Tipos de base de conhecimento
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
    vectorStoreId: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
}

// Tipos de tradução
export interface TranslationShare {
    id: string;
    translationId: string;
    sharedWithId: string;
    sharedById: string;
    createdAt: string;
    updatedAt: string;
    sharedBy: User;
    sharedWith: User;
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
    viewStatus: ViewStatus;
    errorMessage?: string;
    translatedUrl?: string;
    costData?: string;
    usedPrompt: boolean;
    usedKnowledgeBase: boolean;
    createdAt: string;
    updatedAt: string;
    userId: string;
    user: User;
    knowledgeBaseId?: string;
    knowledgeBase?: KnowledgeBase;
    promptId?: string;
    prompt?: Prompt;
    translationMetadata?: string;
    plainTextContent?: string;
    threadId?: string;
    runId?: string;
    assistantId?: string;
    shares: TranslationShare[];
}

// Tipos de prompt/assistente
export interface Prompt {
    id: string;
    name: string;
    description: string;
    content: string;
    version: string;
    tags: string[];
    userId: string;
    isPublic?: boolean;
    model?: string;
    temperature?: number;
}

// Tipos de autenticação
export interface AuthState {
    user: {
        id: string;
        email: string;
        name?: string;
        role: UserRole;
    } | null;
    isAuthenticated: boolean;
}

// Tipos do assistente
export interface AssistantConfig {
    id: string;
    name: string;
    model: string;
    instructions: string;
    temperature: number;
}

// Tipos de estatísticas
export interface UserStats {
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

export interface UserActivity {
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

// Tipos de componentes
export interface FileUploadProps {
    sourceLanguage: string;
    targetLanguage: string;
    onFileSelect: (files: File[]) => Promise<void>;
    knowledgeBases: KnowledgeBase[];
    prompts: Prompt[];
    onReset?: () => void;
}

// Tipos de eventos do Socket
export interface SocketEvents {
    TRANSLATION_STARTED: 'translation:started';
    TRANSLATION_PROGRESS: 'translation:progress';
    TRANSLATION_COMPLETED: 'translation:completed';
    TRANSLATION_ERROR: 'translation:error';
}

// Tipos de resposta da API
export interface ApiResponse<T> {
    status?: string;
    message?: string;
    data?: T;
    error?: string;
}

// Tipos do OpenAI
export interface OpenAIFile {
    id: string;
    filename: string;
    bytes: number;
    created_at: number;
    purpose: string;
}