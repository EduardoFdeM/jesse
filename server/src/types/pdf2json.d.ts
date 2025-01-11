declare module 'pdf2json' {
    export interface PDFPage {
        Texts: PDFText[];
    }

    export interface PDFText {
        R: PDFTextR[];
    }

    export interface PDFTextR {
        T: string;
    }

    export interface PDFData {
        Pages: PDFPage[];
    }

    class PDFParser {
        on(event: 'pdfParser_dataReady', callback: (data: PDFData) => void): void;
        on(event: 'pdfParser_dataError', callback: (error: Error) => void): void;
        loadPDF(filePath: string): void;
    }

    export default PDFParser;
} 