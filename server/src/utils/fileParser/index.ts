import { PDFParser } from './parsers/pdfParser.js';
import { DocxParser } from './parsers/docxParser.js';
import { TxtParser } from './parsers/txtParser.js';
import { ParseResult, ParserOptions } from './types.js';

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