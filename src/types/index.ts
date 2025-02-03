export interface User {
  id: string;
  name: string;
  email: string;
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
  createdAt: string;
  updatedAt: string;
  userId: string;
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
  status: string;
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
  knowledgeBase?: {
    id: string;
    name: string;
  };
  prompt?: {
    id: string;
    name: string;
  };
  knowledgeBaseName?: string;
  promptName?: string;
  costData?: string;
}

export interface Prompt {
  id: string;
  name: string;
  description: string;
  content: string;
  version: string;
  tags: string[];
  userId: string;
}

export interface FileUploadProps {
  sourceLanguage: string;
  targetLanguage: string;
  onFileSelect: (files: File[]) => Promise<void>;
  knowledgeBases: KnowledgeBase[];
  prompts: Prompt[];
  onReset?: () => void;
}