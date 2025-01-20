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
  knowledgeBaseId?: string | null;
  knowledgeBase?: KnowledgeBase | null;
  costData?: string;
}