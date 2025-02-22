export interface ParseResult {
    content: string;
    metadata?: {
        pageCount?: number;
        hasImages?: boolean;
        imageText?: string[];
        mimeType: string;
        fileSize: number;
        totalCharacters?: number;
        charactersPerPage?: number[];
    }
}

export interface ParserOptions {
    extractImages?: boolean;
    useOCR?: boolean;
    language?: string;
}

export interface FileParser {
    parse(buffer: Buffer, options?: ParserOptions): Promise<ParseResult>;
    supports(mimeType: string): boolean;
} 