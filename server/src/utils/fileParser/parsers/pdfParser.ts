import { FileParser, ParseResult, ParserOptions, MARKERS, DocumentElement, ElementType, ElementStyle, DocumentStructure, PageStructure, PageElement, TextItem, TextMarkedContent } from '../types.js';
import * as pdfjsLib from 'pdfjs-dist';
import { OCRService } from '../services/ocrService.js';

// Usar os tipos do pdfjs-dist
type PDFTextContent = import('pdfjs-dist/types/src/display/api').TextContent;
type PDFTextItem = import('pdfjs-dist/types/src/display/api').TextItem;

interface ExtendedTextItem extends TextItem {
    level?: number;
}

export class PDFParser implements FileParser {
    private ocrService: OCRService;
    private documentStructure: DocumentStructure;

    constructor() {
        this.ocrService = OCRService.getInstance();
        this.documentStructure = {
            type: 'document',
            elements: [],
            pages: [],
            metadata: {
                pageCount: 0
            }
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
            
            // Inicializar estrutura do documento
            this.documentStructure = {
                type: 'document',
                elements: [],
                pages: [],
                metadata: {
                    pageCount: pdf.numPages,
                    title: await this.extractTitle(pdf),
                    author: await this.extractAuthor(pdf)
                }
            };

            console.log(`📄 Processando PDF com ${pdf.numPages} páginas...`);

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const viewport = page.getViewport({ scale: 1.0 });
                
                // Processar página e adicionar à estrutura do documento
                const pageElements = await this.processPageContent(textContent, page);
                
                // Adicionar página à estrutura do documento
                const pageStructure: PageStructure = {
                    pageIndex: i - 1,
                    elements: pageElements.map((element, index) => ({
                        ...element,
                        elementIndex: index
                    })) as PageElement[],
                    metadata: {
                        pageNumber: i,
                        hasColumns: this.detectMultipleColumns(textContent),
                        columnCount: this.detectColumns(textContent).length
                    }
                };
                
                this.documentStructure.pages.push(pageStructure);
                this.documentStructure.elements.push(...pageElements);

                // Processar texto da página
                const pageText = this.processPageText(textContent);
                
                // Adicionar texto à estrutura geral
                if (pageText.trim()) {
                    if (content) content += `\n${MARKERS.PAGE_BREAK}\n`;
                    content += pageText;
                    totalCharacters += pageText.length;
                }

                // Processar imagens se necessário
                if (options?.extractImages || options?.useOCR) {
                    const operatorList = await page.getOperatorList();
                    const hasPageImages = operatorList.fnArray.includes(pdfjsLib.OPS.paintImageXObject);
                    
                    if (hasPageImages) {
                        hasImages = true;
                        if (options.useOCR) {
                            try {
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                if (!context) throw new Error('Não foi possível criar contexto 2D');
                                
                                canvas.height = viewport.height;
                                canvas.width = viewport.width;
                                
                                await page.render({
                                    canvasContext: context,
                                    viewport: viewport
                                }).promise;

                                const imageBuffer = Buffer.from(
                                    canvas.toDataURL('image/png').split(',')[1],
                                    'base64'
                                );

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

            return {
                content: content.trim(),
                metadata: {
                    pageCount: pdf.numPages,
                    hasImages,
                    imageText: imageText.length > 0 ? imageText : undefined,
                    mimeType: 'application/pdf',
                    fileSize: buffer.length,
                    totalCharacters,
                    structure: this.documentStructure
                }
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Erro ao processar PDF: ${error.message}`);
            }
            throw new Error('Erro desconhecido ao processar PDF');
        }
    }

    private async processPageContent(textContent: PDFTextContent, page: pdfjsLib.PDFPageProxy): Promise<DocumentElement[]> {
        const elements: DocumentElement[] = [];
        const viewport = page.getViewport({ scale: 1.0 });

        // Melhorar detecção de colunas
        const columns = this.detectColumns(textContent);
        const hasMultipleColumns = columns.length > 1;

        // Classificar elementos
        const { titles, paragraphs, tables } = this.classifyElements(textContent);

        // Processar títulos primeiro
        for (const title of titles) {
            elements.push({
                type: this.getTitleLevel(title.fontSize || 0),
                content: title.str,
                style: {
                    fontSize: title.fontSize,
                    alignment: this.detectAlignment(title.x || 0, viewport.width)
                },
                position: {
                    x: title.x || 0,
                    y: title.y || 0,
                    width: title.width || 0,
                    height: title.height || 0
                }
            });
        }

        // Processar colunas ou parágrafos
        if (hasMultipleColumns) {
            columns.forEach((column, columnIndex) => {
                const columnElements = paragraphs
                    .filter(p => (p.x || 0) >= column.start && (p.x || 0) <= column.end)
                    .sort((a, b) => (b.y || 0) - (a.y || 0))
                    .map(p => ({
                        type: 'paragraph' as ElementType,
                        content: p.str,
                        style: {
                            fontSize: p.fontSize,
                            alignment: this.detectAlignment(p.x || 0, viewport.width)
                        },
                        position: {
                            x: p.x || 0,
                            y: p.y || 0,
                            width: column.end - column.start,
                            height: p.height || 0,
                            columnIndex
                        }
                    } as DocumentElement));

                if (columnElements.length > 0) {
                    elements.push({
                        type: 'column',
                        content: '',
                        children: columnElements,
                        position: {
                            x: column.start,
                            y: 0,
                            width: column.end - column.start,
                            height: viewport.height,
                            columnIndex
                        }
                    });
                }
            });
        } else {
            elements.push(...paragraphs.map(p => ({
                type: 'paragraph' as ElementType,
                content: p.str,
                style: {
                    fontSize: p.fontSize,
                    alignment: this.detectAlignment(p.x || 0, viewport.width)
                },
                position: {
                    x: p.x || 0,
                    y: p.y || 0,
                    width: p.width || 0,
                    height: p.height || 0
                }
            })));
        }

        // Adicionar tabelas
        elements.push(...tables);

        return elements;
    }

    private getTitleLevel(fontSize: number): ElementType {
        if (fontSize >= 20) return 'heading1';
        if (fontSize >= 16) return 'heading2';
        if (fontSize >= 14) return 'heading3';
        return 'paragraph';
    }

    private detectAlignment(x: number, pageWidth: number): ElementStyle['alignment'] {
        const threshold = pageWidth * 0.1;
        if (x <= threshold) return 'left';
        if (x >= pageWidth - threshold) return 'right';
        return 'center';
    }

    private processPageText(textContent: PDFTextContent): string {
        // Configurações de layout
        const MIN_COLUMN_WIDTH = 150;
        const TITLE_FONT_SIZE = 14;
        const Y_THRESHOLD = 5;
        const X_THRESHOLD = 50;

        // Filtrar itens válidos
        const validItems = textContent.items
            .filter((item): item is PDFTextItem => 
                'str' in item && 
                'transform' in item && 
                Array.isArray(item.transform) &&
                typeof item.str === 'string' && 
                item.str.trim().length > 0 // Ignorar strings vazias
            )
            .map(item => ({
                str: item.str.trim(),
                x: Math.round(item.transform[4]),
                y: Math.round(-item.transform[5]), // Invertido e arredondado
                fontSize: Math.round(Math.abs(item.transform[0])),
                width: item.width || 0
            }));

        // Detectar página vazia
        if (validItems.length === 0) {
            return '';
        }

        // Identificar número da página (geralmente no topo e centralizado)
        const pageNumberItem = validItems.find(item => {
            const isNumber = /^\d+$/.test(item.str);
            const isNearTop = item.y > -50; // Próximo ao topo
            const isCentered = item.x > 250 && item.x < 350; // Aproximadamente centralizado
            return isNumber && isNearTop && isCentered;
        });

        // Remover número da página dos itens válidos se encontrado
        const contentItems = pageNumberItem 
            ? validItems.filter(item => item !== pageNumberItem)
            : validItems;

        // Detectar colunas
        const xPositions = contentItems.map(item => item.x);
        const uniqueXPositions = Array.from(new Set(xPositions)).sort((a, b) => a - b);
        
        const columns = this.clusterXPositions(uniqueXPositions)
            .filter(cluster => cluster[cluster.length - 1] - cluster[0] >= MIN_COLUMN_WIDTH)
            .map(cluster => ({
                start: Math.min(...cluster),
                end: Math.max(...cluster),
                items: [] as typeof contentItems
            }));

        // Distribuir itens nas colunas
        contentItems.forEach(item => {
            const column = columns.find(col => 
                item.x >= col.start - X_THRESHOLD && 
                item.x <= col.end + X_THRESHOLD
            );
            if (column) {
                column.items.push(item);
            }
        });

        let text = '';

        // Adicionar número da página se existir
        if (pageNumberItem) {
            text += pageNumberItem.str + '\n\n';
        }

        // Processar títulos principais
        const maxFontSize = Math.max(...contentItems.map(item => item.fontSize));
        const mainTitles = contentItems.filter(item => 
            item.fontSize >= Math.max(TITLE_FONT_SIZE, maxFontSize * 0.8) &&
            item.y > -100 // Próximo ao topo
        );

        mainTitles.forEach(title => {
            text += title.str + '\n\n';
        });

        // Processar colunas
        columns.sort((a, b) => a.start - b.start).forEach((column, colIndex) => {
            let lastY: number | null = null;
            let lastFontSize: number | null = null;

            column.items
                .sort((a, b) => a.y - b.y)
                .forEach(item => {
                    // Pular se for um título principal
                    if (mainTitles.some(title => title.str === item.str)) {
                        return;
                    }

                    // Adicionar quebras de linha apropriadas
                    if (lastY !== null) {
                        const yDiff = Math.abs(item.y - lastY);
                        if (yDiff > Y_THRESHOLD) {
                            text += '\n';
                            // Adicionar linha extra se a diferença for maior
                            if (yDiff > Y_THRESHOLD * 3) {
                                text += '\n';
                            }
                        }
                    }

                    // Adicionar espaço se necessário
                    if (text.length > 0 && !text.endsWith('\n')) {
                        text += ' ';
                    }

                    // Adicionar o texto
                    text += item.str;

                    lastY = item.y;
                    lastFontSize = item.fontSize;
                });

            // Adicionar separador entre colunas
            if (colIndex < columns.length - 1) {
                text += `\n${MARKERS.COLUMN_BREAK}\n`;
            }
        });

        return text.trim();
    }

    supports(mimeType: string): boolean {
        return mimeType === 'application/pdf' || mimeType === 'pdf';
    }

    // Função auxiliar para detectar múltiplas colunas
    private detectMultipleColumns(textContent: PDFTextContent): boolean {
        const positions = textContent.items
            .filter((item): item is PDFTextItem => 'str' in item && 'transform' in item)
            .map(item => item.transform[4]);
        return new Set(positions).size > 1;
    }

    private detectColumns(textContent: PDFTextContent): Array<{start: number; end: number}> {
        // Filtrar apenas itens de texto válidos
        const validItems = textContent.items
            .filter((item): item is PDFTextItem => 
                'str' in item && 'transform' in item
            );
        
        const positions = validItems.map(item => item.transform[4]);
        const uniquePositions = new Set(positions);
        
        if (uniquePositions.size > 1) {
            const clusters = this.clusterXPositions(Array.from(uniquePositions));
            return clusters.map(cluster => ({
                start: Math.min(...cluster),
                end: Math.max(...cluster)
            }));
        }
        
        return [{ start: 0, end: 595.28 }]; // Assuming A4 width
    }

    private clusterXPositions(positions: number[]): number[][] {
        const threshold = 30; // Reduzido para melhor precisão
        const clusters: number[][] = [];
        
        positions.sort((a, b) => a - b);
        
        let currentCluster: number[] = [positions[0]];
        let lastPosition = positions[0];
        
        for (let i = 1; i < positions.length; i++) {
            const currentPosition = positions[i];
            if (currentPosition - lastPosition < threshold) {
                currentCluster.push(currentPosition);
            } else {
                if (currentCluster.length > 0) {
                    clusters.push(currentCluster);
                }
                currentCluster = [currentPosition];
            }
            lastPosition = currentPosition;
        }
        
        if (currentCluster.length > 0) {
            clusters.push(currentCluster);
        }

        // Filtrar clusters muito próximos
        return clusters.filter((cluster, index) => {
            if (index === 0) return true;
            const prevClusterEnd = Math.max(...clusters[index - 1]);
            const currentClusterStart = Math.min(...cluster);
            return currentClusterStart - prevClusterEnd >= threshold;
        });
    }

    private async extractTitle(pdf: pdfjsLib.PDFDocumentProxy): Promise<string | undefined> {
        try {
            const metadata = await pdf.getMetadata();
            return (metadata?.info as Record<string, string>)?.[`Title`] || undefined;
        } catch {
            return undefined;
        }
    }

    private async extractAuthor(pdf: pdfjsLib.PDFDocumentProxy): Promise<string | undefined> {
        try {
            const metadata = await pdf.getMetadata();
            return (metadata?.info as Record<string, string>)?.[`Author`] || undefined;
        } catch {
            return undefined;
        }
    }

    private classifyElements(textContent: PDFTextContent) {
        const titles: ExtendedTextItem[] = [];
        const paragraphs: TextItem[] = [];
        const tables: DocumentElement[] = [];

        // Filtrar itens válidos e mapear para incluir x, y e fontSize
        const validItems = textContent.items
            .filter((item): item is PDFTextItem => 
                'str' in item && 'transform' in item && Array.isArray(item.transform)
            )
            .map(item => ({
                str: item.str,
                transform: item.transform,
                width: item.width || 0,
                height: item.height || 0,
                x: item.transform[4],
                y: item.transform[5],
                fontSize: Math.abs(item.transform[0])
            } as ExtendedTextItem));

        // Detectar hierarquia de títulos
        const fontSizes = validItems.map(item => item.fontSize || 0);
        const uniqueFontSizes = Array.from(new Set(fontSizes)).sort((a, b) => b - a);
        const titleThresholds = {
            h1: uniqueFontSizes[0] || 20,
            h2: uniqueFontSizes[1] || 16,
            h3: uniqueFontSizes[2] || 14
        };

        // Classificar elementos
        validItems.forEach(item => {
            const extendedItem = item as ExtendedTextItem;
            if (item.fontSize && item.fontSize >= titleThresholds.h1) {
                extendedItem.level = 1;
                titles.push(extendedItem);
            } else if (item.fontSize && item.fontSize >= titleThresholds.h2) {
                extendedItem.level = 2;
                titles.push(extendedItem);
            } else if (item.fontSize && item.fontSize >= titleThresholds.h3) {
                extendedItem.level = 3;
                titles.push(extendedItem);
            } else {
                // Detectar possíveis células de tabela
                const isTableCell = this.detectTableCell(item, validItems);
                if (isTableCell) {
                    this.processTableCell(item, tables);
                } else {
                    paragraphs.push(item);
                }
            }
        });

        return { titles, paragraphs, tables };
    }

    private detectTableCell(item: TextItem, allItems: TextItem[]): boolean {
        const itemY = item.y || 0;
        
        const GRID_ALIGNMENT_THRESHOLD = 2;
        const neighbors = allItems.filter(other => 
            other !== item &&
            (other.y !== undefined) &&
            Math.abs((other.y || 0) - itemY) < GRID_ALIGNMENT_THRESHOLD
        );

        // Verificar alinhamento em grade
        if (neighbors.length >= 2) {
            const xPositions = neighbors
                .filter(n => n.x !== undefined)
                .map(n => n.x!)
                .sort((a, b) => a - b);
            
            const gaps = [];
            for (let i = 1; i < xPositions.length; i++) {
                gaps.push(xPositions[i] - xPositions[i-1]);
            }
            
            // Se os gaps são consistentes, provavelmente é uma tabela
            const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            const isConsistent = gaps.every(gap => Math.abs(gap - avgGap) < 10);
            
            return isConsistent;
        }

        return false;
    }

    private processTableCell(item: TextItem, tables: DocumentElement[]) {
        if (!item.x || !item.y || !item.fontSize) return;

        // Encontrar ou criar tabela
        let table = tables.find(t => this.isPartOfTable(item, t));
        if (!table) {
            table = {
                type: 'table',
                content: '',
                children: [],
                style: {
                    isHeader: false
                }
            } as DocumentElement;
            tables.push(table);
        }

        // Criar célula usando a estrutura PDFTableCell
        const cell: DocumentElement = {
            type: 'table-cell',
            content: item.str,
            style: {
                fontSize: item.fontSize,
                alignment: this.detectAlignment(item.x, item.width || 0),
                isHeader: this.isHeaderCell(item)
            },
            position: {
                x: item.x,
                y: item.y,
                width: item.width || 0,
                height: item.height || 0
            }
        };

        this.addCellToTable(cell, table);
    }

    private isHeaderCell(item: TextItem): boolean {
        // Detectar se é uma célula de cabeçalho baseado em características
        return item.fontSize ? item.fontSize > 12 : false;
    }

    private isPartOfTable(item: TextItem, table: DocumentElement): boolean {
        if (!table.children || !item.y) return false;
        
        // Verificar se o item está próximo a células existentes
        const existingCells = table.children.flatMap(row => 
            row.children || []
        );

        return existingCells.some(cell => 
            cell.position &&
            Math.abs(cell.position.y - (item.y || 0)) < 5
        );
    }

    private addCellToTable(cell: DocumentElement, table: DocumentElement) {
        if (!table.children) table.children = [];

        // Encontrar ou criar linha
        let row = table.children.find(r => 
            r.type === 'table-row' && 
            r.children?.[0]?.position?.y === cell.position?.y
        );

        if (!row) {
            row = {
                type: 'table-row',
                content: '',
                children: []
            };
            table.children.push(row);
        }

        if (!row.children) row.children = [];
        row.children.push(cell);

        // Ordenar células da esquerda para direita
        row.children.sort((a, b) => 
            (a.position?.x || 0) - (b.position?.x || 0)
        );
    }
} 