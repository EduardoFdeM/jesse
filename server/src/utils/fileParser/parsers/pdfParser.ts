import { FileParser, ParseResult, ParserOptions } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { OCRService } from '../services/ocrService';

interface TextItem {
    str: string;
}

interface TextMarkedContent {
    type: string;
    items: TextItem[];
}

export class PDFParser implements FileParser {
    private ocrService: OCRService;

    constructor() {
        this.ocrService = OCRService.getInstance();
    }

    async parse(buffer: Buffer, options?: ParserOptions): Promise<ParseResult> {
        try {
            const data = new Uint8Array(buffer);
            const loadingTask = pdfjsLib.getDocument({ data });
            const pdf = await loadingTask.promise;
            
            let content = '';
            let hasImages = false;
            let imageText: string[] = [];
            
            const metadata = {
                pageCount: pdf.numPages,
                hasImages: false,
                mimeType: 'application/pdf',
                fileSize: buffer.length
            };

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                content += textContent.items
                    .map((item) => {
                        if ('str' in item) {
                            return (item as TextItem).str;
                        }
                        return '';
                    })
                    .join(' ') + '\n';

                // Verificar imagens e executar OCR se necessário
                if (options?.extractImages || options?.useOCR) {
                    const operatorList = await page.getOperatorList();
                    const hasPageImages = operatorList.fnArray.includes(pdfjsLib.OPS.paintImageXObject);
                    
                    if (hasPageImages) {
                        hasImages = true;
                        if (options.useOCR) {
                            try {
                                // Extrair imagem da página
                                const viewport = page.getViewport({ scale: 1.0 });
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                if (!context) {
                                    throw new Error('Não foi possível criar contexto 2D');
                                }
                                canvas.height = viewport.height;
                                canvas.width = viewport.width;
                                
                                await page.render({
                                    canvasContext: context,
                                    viewport: viewport
                                }).promise;

                                // Converter canvas para buffer
                                const imageBuffer = Buffer.from(
                                    canvas.toDataURL('image/png').split(',')[1],
                                    'base64'
                                );

                                // Executar OCR
                                const extractedText = await this.ocrService.extractTextFromImage(
                                    imageBuffer,
                                    options.language
                                );
                                
                                if (extractedText.trim()) {
                                    imageText.push(extractedText);
                                }
                            } catch (ocrError) {
                                console.error('Erro ao processar OCR:', ocrError);
                            }
                        }
                    }
                }
            }

            metadata.hasImages = hasImages;
            
            return {
                content: content.trim(),
                metadata: {
                    ...metadata,
                    imageText: imageText.length > 0 ? imageText : undefined
                }
            };
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`Erro ao processar PDF: ${error.message}`);
            }
            throw new Error('Erro desconhecido ao processar PDF');
        }
    }

    supports(mimeType: string): boolean {
        return mimeType === 'application/pdf' || mimeType === 'pdf';
    }
} 