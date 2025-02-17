import { createWorker } from 'tesseract.js';
import type { Worker, WorkerOptions } from 'tesseract.js';

export class OCRService {
    private static instance: OCRService;
    private worker: Worker | null = null;

    private constructor() {}

    static getInstance(): OCRService {
        if (!OCRService.instance) {
            OCRService.instance = new OCRService();
        }
        return OCRService.instance;
    }

    async extractTextFromImage(imageBuffer: Buffer, language = 'por'): Promise<string> {
        try {
            if (!this.worker) {
                this.worker = await createWorker();
                await this.worker.loadLanguage(language);
                await this.worker.initialize(language);
            }

            const { data: { text } } = await this.worker.recognize(imageBuffer);
            return text;
        } catch (error) {
            console.error('Erro no OCR:', error);
            if (error instanceof Error) {
                throw new Error(`Erro ao extrair texto da imagem: ${error.message}`);
            }
            throw new Error('Erro desconhecido ao extrair texto da imagem');
        }
    }

    async terminate(): Promise<void> {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
} 