import { Readable } from 'stream';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { streamToBuffer } from '../utils/streamToBuffer';

interface ExtractedContent {
    text: string;
    metadata?: {
        pageCount: number;
        author?: string;
        title?: string;
    };
}

interface PDFParseResult {
    text: string;
    numpages: number;
    info: any;
    metadata: any;
    version: string;
    pages: {
        content: { str: string }[];
    }[];
}

export const extractTextFromPDF = async (fileBuffer: Buffer): Promise<ExtractedContent> => {
    try {
        const data = await pdf(fileBuffer);
        
        return {
            text: data.text
                .replace(/\r\n/g, '\n')
                .replace(/\s+/g, ' ')
                .trim(),
            metadata: {
                pageCount: data.numpages || 1,
                author: data.info?.Author,
                title: data.info?.Title
            }
        };
    } catch (error) {
        console.error('Erro ao extrair texto do PDF:', error);
        throw new Error(`Falha ao extrair texto do PDF: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
};

export const extractTextFromDOCX = async (fileBuffer: Buffer): Promise<ExtractedContent> => {
    try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        
        return {
            text: result.value
                .replace(/\r\n/g, '\n')
                .replace(/\s+/g, ' ')
                .trim(),
            metadata: {
                pageCount: Math.ceil(result.value.length / 3000) // Estimativa aproximada
            }
        };
    } catch (error) {
        console.error('Erro ao extrair texto do DOCX:', error);
        throw new Error(`Falha ao extrair texto do DOCX: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
}; 