import { PDFParser } from './parsers/pdfParser';
import { DocxParser } from './parsers/docxParser';
import { TxtParser } from './parsers/txtParser';
import { ParseResult, ParserOptions } from './types';

const parsers = [
    new PDFParser(),
    new DocxParser(),
    new TxtParser()
];

export async function parseFile(
    buffer: Buffer,
    mimeType: string,
    options?: ParserOptions
): Promise<ParseResult> {
    const parser = parsers.find(p => p.supports(mimeType));
    
    if (!parser) {
        throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
    }

    return parser.parse(buffer, options);
}

export type { ParseResult, ParserOptions }; 