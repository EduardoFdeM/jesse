export interface VectorStoreSearchResult {
    id: string;
    score: number;
    content: string;
    metadata: {
        filename: string;
        fileType: string;
        fileSize: number;
        createdAt: Date;
    };
}

export interface SearchParams {
    vectorStoreId: string;
    query: string;
    maxResults?: number;
    threshold?: number;
    filters?: {
        fileType?: string[];
        minScore?: number;
        dateRange?: {
            start: Date;
            end: Date;
        };
    };
} 