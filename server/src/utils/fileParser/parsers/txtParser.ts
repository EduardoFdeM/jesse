import { FileParser, ParseResult, ParserOptions } from '../types';

export class TxtParser implements FileParser {
    async parse(buffer: Buffer, options?: ParserOptions): Promise<ParseResult> {
        try {
            const content = buffer.toString('utf-8');
            
            return {
                content,
                metadata: {
                    mimeType: 'text/plain',
                    fileSize: buffer.length,
                    hasImages: false
                }
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Erro ao processar TXT: ${error.message}`);
            }
            throw new Error('Erro desconhecido ao processar TXT');
        }
    }

    supports(mimeType: string): boolean {
        return mimeType === 'text/plain' || 
               mimeType === 'txt' ||
               mimeType === 'text';
    }
} 