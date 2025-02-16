export interface ProcessKnowledgeBaseParams {
    id?: string;
    name: string;
    description: string;
    userId: string;
    files: Express.Multer.File[];
    existingFileIds?: string[];
} 