import { FileParser, ParseResult, ParserOptions, DocumentStructure, DocumentElement, ElementType, ElementStyle, PageStructure } from '../types.js';
import mammoth from 'mammoth';
import { MARKERS } from '../types.js';

export class DocxParser implements FileParser {
    async parse(buffer: Buffer, options?: ParserOptions): Promise<ParseResult> {
        try {
            // Extrair o HTML com todas as informações de estilo
            const result = await mammoth.convertToHtml({ buffer }, {
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "table => table:fresh",
                    "tr => tr:fresh",
                    "td => td:fresh",
                    "th => th:fresh",
                    "p => p:fresh"
                ]
            });

            // Extrair metadados
            const metadata = await this.extractMetadata(buffer);
            
            // Processar o HTML para nossa estrutura
            const structure = await this.processHtml(result.value);

            // Converter estrutura para texto mantendo formatação
            const content = this.structureToText(structure);

            // Processar imagens se necessário
            const hasImages = options?.extractImages 
                ? await this.checkForImages(buffer)
                : false;

            return {
                content,
                metadata: {
                    ...metadata,
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    fileSize: buffer.length,
                    hasImages,
                    structure,
                    totalCharacters: content.length,
                    pageCount: structure.pages.length
                }
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Erro ao processar DOCX: ${error.message}`);
            }
            throw new Error('Erro desconhecido ao processar DOCX');
        }
    }

    private async processHtml(html: string): Promise<DocumentStructure> {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const structure: DocumentStructure = {
            type: 'document',
            elements: [],
            pages: [],
            metadata: {
                pageCount: 0
            }
        };

        // Processar elementos em ordem
        const body = doc.body;
        let currentPage: PageStructure = {
            pageIndex: 0,
            elements: []
        };
        
        for (const node of body.children) {
            const element = this.processNode(node);
            if (element) {
                structure.elements.push(element);
                // Adicionar elemento à página atual
                currentPage.elements.push({
                    type: element.type,
                    content: element.content,
                    style: element.style,
                    elementIndex: currentPage.elements.length,
                    position: element.position
                });
                
                // Se encontrar um quebra de página ou for um elemento que tipicamente causa quebra
                if (this.shouldBreakPage(node, element)) {
                    structure.pages.push(currentPage);
                    currentPage = {
                        pageIndex: structure.pages.length,
                        elements: []
                    };
                }
            }
        }
        
        // Adicionar última página se tiver elementos
        if (currentPage.elements.length > 0) {
            structure.pages.push(currentPage);
        }
        
        // Atualizar contagem de páginas no metadata
        structure.metadata.pageCount = structure.pages.length;

        return structure;
    }

    private processNode(node: Element): DocumentElement | null {
        switch (node.tagName.toLowerCase()) {
            case 'h1':
            case 'h2':
            case 'h3':
                return {
                    type: `heading${node.tagName.charAt(1)}` as ElementType,
                    content: node.textContent || '',
                    style: {
                        level: parseInt(node.tagName.charAt(1))
                    }
                };

            case 'table':
                return this.processTable(node);

            case 'ul':
            case 'ol':
                return this.processList(node);

            case 'p':
                return {
                    type: 'paragraph',
                    content: node.textContent || '',
                    style: this.extractStyle(node)
                };

            default:
                return null;
        }
    }

    private processTable(table: Element): DocumentElement {
        const rows: DocumentElement[] = [];
        
        for (const row of table.getElementsByTagName('tr')) {
            const cells: DocumentElement[] = [];
            
            for (const cell of row.children) {
                cells.push({
                    type: 'table-cell',
                    content: cell.textContent || '',
                    style: {
                        isHeader: cell.tagName.toLowerCase() === 'th',
                        columnSpan: cell.getAttribute('colspan') ? parseInt(cell.getAttribute('colspan')!) : 1,
                        rowSpan: cell.getAttribute('rowspan') ? parseInt(cell.getAttribute('rowspan')!) : 1
                    }
                });
            }

            rows.push({
                type: 'table-row',
                content: '',
                children: cells
            });
        }

        return {
            type: 'table',
            content: '',
            children: rows
        };
    }

    private processList(list: Element): DocumentElement {
        const items: DocumentElement[] = [];
        
        for (const item of list.getElementsByTagName('li')) {
            items.push({
                type: 'list-item',
                content: item.textContent || ''
            });
        }

        return {
            type: 'list',
            content: '',
            style: {
                listType: list.tagName.toLowerCase() === 'ol' ? 'ordered' : 'unordered'
            },
            children: items
        };
    }

    private extractStyle(element: Element): ElementStyle {
        const style: ElementStyle = {};
        const computedStyle = window.getComputedStyle(element);

        if (computedStyle.fontFamily) style.fontFamily = computedStyle.fontFamily;
        if (computedStyle.fontSize) style.fontSize = parseInt(computedStyle.fontSize);
        if (computedStyle.fontWeight) style.fontWeight = computedStyle.fontWeight;
        if (computedStyle.textAlign) style.alignment = computedStyle.textAlign as ElementStyle['alignment'];

        return style;
    }

    private structureToText(structure: DocumentStructure): string {
        let text = '';
        
        structure.pages.forEach((page, pageIndex) => {
            if (pageIndex > 0) {
                text += `\n${MARKERS.PAGE_BREAK}\n`;
            }
            
            page.elements.forEach(element => {
                const elementText = this.elementToText(element);
                text += elementText;
            });
        });

        return text.trim();
    }

    private elementToText(element: DocumentElement, level: number = 0): string {
        let text = '';
        const indent = '  '.repeat(level);

        switch (element.type) {
            case 'heading1':
            case 'heading2':
            case 'heading3':
                text += `${indent}${element.content}\n\n`;
                break;

            case 'paragraph':
                text += `${indent}${element.content}\n`;
                break;

            case 'table':
                if (element.children) {
                    for (const row of element.children) {
                        if (row.children) {
                            text += row.children
                                .map(cell => cell.content)
                                .join(' | ');
                            text += '\n';
                        }
                    }
                }
                text += '\n';
                break;

            case 'list':
                if (element.children) {
                    element.children.forEach((item, index) => {
                        const marker = element.style?.listType === 'ordered' 
                            ? `${index + 1}.` 
                            : '•';
                        text += `${indent}${marker} ${item.content}\n`;
                    });
                }
                text += '\n';
                break;
        }

        return text;
    }

    private async extractMetadata(buffer: Buffer): Promise<{
        title?: string;
        author?: string;
        creationDate?: string;
    }> {
        if (!buffer) return {};
        
        try {
            // Implementação básica de extração de metadados
            // No futuro, podemos usar uma biblioteca específica
            const metadata: { [key: string]: string } = {};
            
            // Verificar os primeiros bytes do arquivo para identificar metadados
            const header = buffer.slice(0, 4096).toString('utf-8');
            
            // Extrair informações básicas do cabeçalho
            const titleMatch = header.match(/Title:\s*([^\n]+)/);
            const authorMatch = header.match(/Author:\s*([^\n]+)/);
            const dateMatch = header.match(/Creation-Date:\s*([^\n]+)/);
            
            if (titleMatch) metadata.title = titleMatch[1];
            if (authorMatch) metadata.author = authorMatch[1];
            if (dateMatch) metadata.creationDate = dateMatch[1];
            
            return metadata;
        } catch (error) {
            console.warn('Erro ao extrair metadados do DOCX:', error);
            return {};
        }
    }

    private async checkForImages(buffer: Buffer): Promise<boolean> {
        try {
            // Verificar a presença de marcadores de imagem no buffer
            const imageMarkers = [
                Buffer.from([0x89, 0x50, 0x4E, 0x47]), // PNG
                Buffer.from([0xFF, 0xD8, 0xFF]),       // JPEG
                Buffer.from('<?xml'),                  // SVG
            ];

            return imageMarkers.some(marker => 
                buffer.includes(marker)
            );
        } catch {
            return false;
        }
    }

    private shouldBreakPage(node: Element, element: DocumentElement): boolean {
        // Elementos que tipicamente causam quebra de página
        const tagName = (node.tagName || '').toLowerCase();
        const className = (node.className || '').toString();
        
        return Boolean(
            tagName === 'div' && 
            (className.includes('page-break') || 
             element.type === 'heading1' ||
             (element.type === 'table' && element.children && element.children.length > 10))
        );
    }

    supports(mimeType: string): boolean {
        return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
               mimeType === 'application/msword' ||
               mimeType === 'docx';
    }
} 