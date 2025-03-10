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
            let totalCharacters = 0;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                const pageText = textContent.items
                    .filter((item): item is PDFTextItem => 'str' in item)
                    .map(item => item.str)
                    .join(' ');

                if (pageText.trim()) {
                    if (content) content += `\n${MARKERS.PAGE_BREAK}\n`;
                    content += pageText;
                    totalCharacters += pageText.length;
                }
            }

            return {
                content: content.trim(),
                metadata: {
                    pageCount: pdf.numPages,
                    mimeType: 'application/pdf',
                    fileSize: buffer.length,
                    totalCharacters
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
        const columns = this.detectColumns(textContent);
        let text = '';

        // Processar cada coluna
        columns.forEach((column, columnIndex) => {
            // Ordenar itens por Y (de cima para baixo) e X
            const sortedItems = column.items.sort((a, b) => {
                const aY = a.transform ? -a.transform[5] : 0;
                const bY = b.transform ? -b.transform[5] : 0;
                const yDiff = aY - bY;
                
                if (Math.abs(yDiff) < 5) { // Tolerância para mesma linha
                    const aX = a.transform ? a.transform[4] : 0;
                    const bX = b.transform ? b.transform[4] : 0;
                    return aX - bX;
                }
                return yDiff;
            });

            // Processar itens da coluna
            let lastY: number | null = null;
            let lineText = '';

            sortedItems.forEach((item) => {
                const currentY = item.transform ? -item.transform[5] : 0;
                
                // Se mudou de linha
                if (lastY !== null && Math.abs(currentY - lastY) > 5) {
                    text += lineText.trim() + '\n';
                    lineText = '';
                }
                
                // Adicionar espaço se necessário
                if (lineText && !lineText.endsWith(' ')) {
                    lineText += ' ';
                }
                
                lineText += item.str;
                lastY = currentY;
            });

            // Adicionar última linha da coluna
            if (lineText) {
                text += lineText.trim() + '\n';
            }

            // Adicionar separador entre colunas
            if (columnIndex < columns.length - 1) {
                text += MARKERS.COLUMN_BREAK;
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

    private detectColumns(textContent: PDFTextContent): Array<{start: number; end: number; items: PDFTextItem[]}> {
        const items = textContent.items as PDFTextItem[];
        const xPositions = items.map(item => item.transform ? item.transform[4] : 0);
        
        // Agrupar posições X próximas
        const clusters = this.clusterXPositions(xPositions);
        
        // Se houver apenas um cluster, retornar uma única coluna
        if (clusters.length <= 1) {
            return [{
                start: Math.min(...xPositions),
                end: Math.max(...xPositions),
                items: items
            }];
        }

        // Calcular limites das colunas
        return clusters.map(cluster => {
            const start = Math.min(...cluster);
            const end = Math.max(...cluster);
            const columnItems = items.filter(item => {
                const x = item.transform ? item.transform[4] : 0;
                return x >= start && x <= end;
            });
            return { start, end, items: columnItems };
        });
    }

    private clusterXPositions(positions: number[]): number[][] {
        const tolerance = 10; // Tolerância para agrupar posições X próximas
        const uniquePositions = Array.from(new Set(positions)).sort((a, b) => a - b);
        
        const clusters: number[][] = [];
        let currentCluster: number[] = [uniquePositions[0]];
        
        for (let i = 1; i < uniquePositions.length; i++) {
            const current = uniquePositions[i];
            const last = currentCluster[currentCluster.length - 1];
            
            if (current - last <= tolerance) {
                currentCluster.push(current);
            } else {
                clusters.push(currentCluster);
                currentCluster = [current];
            }
        }
        
        if (currentCluster.length > 0) {
            clusters.push(currentCluster);
        }
        
        return clusters;
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