export interface ParseResult {
    content: string;
    metadata?: {
        pageCount?: number;
        hasImages?: boolean;
        imageText?: string[];
        mimeType: string;
        fileSize: number;
        totalCharacters?: number;
        charactersPerPage?: number[];
        structure?: DocumentStructure;
    }
}

export interface ParserOptions {
    extractImages?: boolean;
    useOCR?: boolean;
    language?: string;
}

export interface FileParser {
    parse(buffer: Buffer, options?: ParserOptions): Promise<ParseResult>;
    supports(mimeType: string): boolean;
}

// Adicionar constantes para marcadores
export const MARKERS = {
    PAGE_BREAK: '---PAGE_BREAK---',
    COLUMN_BREAK: '---COLUMN_BREAK---'
} as const;

export interface PageElement {
    type: ElementType;
    content: string;
    style?: ElementStyle;
    elementIndex: number;
    position?: ElementPosition;
}

export interface PageStructure {
    pageIndex: number;
    elements: PageElement[];
    metadata?: {
        pageNumber?: number;
        hasColumns?: boolean;
        columnCount?: number;
    };
}

export interface DocumentStructure {
    type: 'document';
    elements: DocumentElement[];
    pages: PageStructure[];
    metadata: {
        title?: string;
        author?: string;
        creationDate?: string;
        pageCount?: number;
    };
}

export type ElementType = 
    | 'title' 
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'paragraph'
    | 'table'
    | 'table-row'
    | 'table-cell'
    | 'list'
    | 'list-item'
    | 'image'
    | 'column';

export interface ElementStyle {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    alignment?: 'left' | 'center' | 'right' | 'justify';
    color?: string;
    columnSpan?: number;
    rowSpan?: number;
    isHeader?: boolean;
    listType?: 'ordered' | 'unordered';
    level?: number;
}

export interface ElementPosition {
    x: number;
    y: number;
    width: number;
    height: number;
    columnIndex?: number;
    rowIndex?: number;
}

export interface DocumentElement {
    type: ElementType;
    content: string;
    style?: ElementStyle;
    children?: DocumentElement[];
    position?: ElementPosition;
}

export interface TableOptions {
    headers?: boolean;
    width?: number;
    padding?: number;
}

export interface PDFTableCell {
    content: string;
    style?: ElementStyle;
}

export interface PDFTableRow {
    cells: PDFTableCell[];
    isHeader?: boolean;
}

export interface PDFTable {
    rows: PDFTableRow[];
    style?: ElementStyle;
}

export interface TextItem {
    str: string;
    transform: number[];
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    fontSize?: number;
    level?: number;
}

export interface TextMarkedContent {
    type: string;
    items: TextItem[];
}

export interface TextContent {
    items: (TextItem | TextMarkedContent)[];
    styles?: Record<string, string | number | boolean>;
} 