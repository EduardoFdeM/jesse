import { FileParser, ParseResult, ParserOptions } from '../types.js';
import * as pdfjsLib from 'pdfjs-dist';
import { OCRService } from '../services/ocrService.js';

interface TextItem {
    str: string;
}

interface TextMarkedContent {
    type: string;
    items: TextItem[];
}

interface DocumentStructure {
    type: 'document';
    metadata: {
        title?: string;
        author?: string;
        creationDate?: string;
        pages: number;
    };
    pages: PageStructure[];
}

interface PageStructure {
    type: 'page';
    elements: PageElement[];
    layout: {
        columns: number;
        margins: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
    };
}

interface PageElement {
    type: 'title' | 'paragraph' | 'table' | 'image' | 'list';
    content: string;
    style: {
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        alignment?: 'left' | 'center' | 'right' | 'justify';
        color?: string;
        columnSpan?: number;
    };
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    elementIndex?: number;
}

export class PDFParser implements FileParser {
    private ocrService: OCRService;
    private documentStructure: DocumentStructure;

    constructor() {
        this.ocrService = OCRService.getInstance();
        this.documentStructure = {
            type: 'document',
            metadata: { pages: 0 },
            pages: []
        };
    }

    async parse(buffer: Buffer, options?: ParserOptions): Promise<ParseResult> {
        try {
            const data = new Uint8Array(buffer);
            const loadingTask = pdfjsLib.getDocument({ data });
            const pdf = await loadingTask.promise;
            
            let content = '';
            let hasImages = false;
            const imageText: string[] = [];
            let totalCharacters = 0;
            
            const metadata = {
                pageCount: pdf.numPages,
                hasImages: false,
                mimeType: 'application/pdf',
                fileSize: buffer.length,
                charactersPerPage: [] as number[]
            };

            console.log(`📄 Processando PDF com ${pdf.numPages} páginas...`);

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = this.processPageText(textContent);
                
                // Log detalhado da página
                const pageCharCount = pageText.length;
                totalCharacters += pageCharCount;
                metadata.charactersPerPage.push(pageCharCount);
                
                console.log(`📝 Página ${i}:`, {
                    caracteres: pageCharCount,
                    amostra: pageText.substring(0, 100) + '...',
                    multiplasColunas: this.detectMultipleColumns(textContent)
                });
                
                content += pageText + '\n---PAGE_BREAK---\n';

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

            console.log('📊 Estatísticas do PDF:', {
                totalPaginas: pdf.numPages,
                totalCaracteres: totalCharacters,
                mediaCaracteresPorPagina: Math.round(totalCharacters / pdf.numPages),
                tamanhoArquivo: `${Math.round(buffer.length / 1024)}KB`
            });

            metadata.hasImages = hasImages;
            
            return {
                content: content.trim(),
                metadata: {
                    ...metadata,
                    totalCharacters,
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

    private processPageText(textContent: any): string {
        let lastY: number | null = null;
        let text = '';
        
        for (const item of textContent.items) {
            if ('str' in item) {
                // Adicionar quebra de linha se houver mudança significativa na posição Y
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                    text += '\n';
                }
                text += item.str + ' ';
                lastY = item.transform[5];
            }
        }
        
        return text.trim();
    }

    supports(mimeType: string): boolean {
        return mimeType === 'application/pdf' || mimeType === 'pdf';
    }

    // Função auxiliar para detectar múltiplas colunas
    private detectMultipleColumns(textContent: any): boolean {
        const positions = textContent.items.map((item: any) => item.transform[4]);
        return new Set(positions).size > 1;
    }

    private async extractPageStructure(page: any): Promise<PageStructure> {
        const textContent = await page.getTextContent();
        const elements: PageElement[] = [];
        
        // Detectar layout de colunas
        const columns = this.detectColumns(textContent);
        
        // Processar elementos
        for (const item of textContent.items) {
            const element = await this.processTextItem(item);
            if (element) {
                elements.push(element);
            }
        }

        // Organizar elementos em colunas se necessário
        if (columns > 1) {
            this.organizeColumns(elements, columns);
        }

        return {
            type: 'page',
            elements,
            layout: {
                columns,
                margins: this.detectMargins(textContent)
            }
        };
    }

    private detectColumns(textContent: { items: Array<{ transform: number[] }> }): number {
        // Análise mais sofisticada de colunas
        const positions = textContent.items.map(item => item.transform[4]);
        const uniquePositions = new Set(positions);
        
        // Se houver clusters claros de posições X, provavelmente são colunas
        if (uniquePositions.size > 1) {
            const clusters = this.clusterXPositions(Array.from(uniquePositions));
            return clusters.length > 1 ? clusters.length : 1;
        }
        
        return 1;
    }

    private clusterXPositions(positions: number[]): number[][] {
        const threshold = 50; // Ajuste conforme necessário
        const clusters: number[][] = [];
        
        positions.sort((a, b) => a - b);
        
        let currentCluster: number[] = [positions[0]];
        
        for (let i = 1; i < positions.length; i++) {
            if (positions[i] - positions[i-1] < threshold) {
                currentCluster.push(positions[i]);
            } else {
                clusters.push(currentCluster);
                currentCluster = [positions[i]];
            }
        }
        
        clusters.push(currentCluster);
        return clusters;
    }

    private async processTextItem(item: { 
        str: string; 
        transform: number[]; 
        width?: number; 
        height?: number; 
    }): Promise<PageElement | null> {
        const fontSize = Math.abs(item.transform[0]);
        const isTitle = fontSize > 14; // Ajuste conforme necessário
        
        return {
            type: isTitle ? 'title' : 'paragraph',
            content: item.str,
            elementIndex: 0, // Será atualizado ao processar a página
            style: {
                fontSize,
                alignment: this.detectAlignment(item),
                fontWeight: isTitle ? 'bold' : 'normal'
            },
            position: {
                x: item.transform[4],
                y: item.transform[5],
                width: item.width || 0,
                height: item.height || 0
            }
        };
    }

    private detectAlignment(item: { transform: number[]; width?: number }): 'left' | 'center' | 'right' | 'justify' {
        // Implementar lógica de detecção de alinhamento baseada na posição
        const x = item.transform[4];
        const width = item.width || 0;
        
        // Lógica simplificada de detecção de alinhamento
        if (x < 100) return 'left';
        if (x > 400) return 'right';
        return 'center';
    }

    private detectMargins(textContent: { items: Array<{ transform: number[] }> }): { 
        top: number; 
        right: number; 
        bottom: number; 
        left: number; 
    } {
        const positions = textContent.items.map(item => ({
            x: item.transform[4],
            y: item.transform[5]
        }));

        return {
            top: Math.min(...positions.map(p => p.y)) || 25,
            right: Math.max(...positions.map(p => p.x)) || 25,
            bottom: Math.max(...positions.map(p => p.y)) || 25,
            left: Math.min(...positions.map(p => p.x)) || 25
        };
    }

    private organizeColumns(elements: PageElement[], columnCount: number): void {
        // Organizar elementos em colunas
        const pageWidth = 595.28; // A4 width in points
        const columnWidth = pageWidth / columnCount;
        
        elements.forEach(element => {
            const columnIndex = Math.floor(element.position.x / columnWidth);
            element.style.columnSpan = 1;
        });
    }
} 