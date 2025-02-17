import { FileParser, ParseResult, ParserOptions } from '../types';
import mammoth from 'mammoth';

export class DocxParser implements FileParser {
    async parse(buffer: Buffer, options?: ParserOptions): Promise<ParseResult> {
        try {
            const result = await mammoth.extractRawText({ buffer });
            
            return {
                content: result.value,
                metadata: {
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    fileSize: buffer.length,
                    hasImages: false // mammoth não fornece essa informação facilmente
                }
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Erro ao processar DOCX: ${error.message}`);
            }
            throw new Error('Erro desconhecido ao processar DOCX');
        }
    }

    supports(mimeType: string): boolean {
        return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
               mimeType === 'application/msword' ||
               mimeType === 'docx';
    }
} 