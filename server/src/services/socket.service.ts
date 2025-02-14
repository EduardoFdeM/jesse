import { getIO } from '../config/socket.js';
import { Translation, EVENTS, TranslationStatus } from '../types/index.js';

export const emitTranslationStarted = (translation: Translation) => {
    try {
        const io = getIO();
        io.emit(EVENTS.STARTED, {
            id: translation.id,
            fileName: translation.fileName,
            originalName: translation.originalName,
            status: translation.status
        });
    } catch (error) {
        console.error('Erro ao emitir evento de início:', error);
    }
};

export const emitTranslationProgress = (translationId: string, progress: number) => {
    try {
        const io = getIO();
        io.emit(EVENTS.PROGRESS, {
            id: translationId,
            progress,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Erro ao emitir evento de progresso:', error);
    }
};

export const emitTranslationError = (translationId: string, error: string) => {
    try {
        const io = getIO();
        io.emit(EVENTS.ERROR, {
            id: translationId,
            error,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Erro ao emitir evento de erro:', error);
    }
};

export const emitTranslationCompleted = (translation: Translation) => {
    try {
        const io = getIO();
        io.emit(EVENTS.COMPLETED, {
            id: translation.id,
            fileName: translation.fileName,
            originalName: translation.originalName,
            status: translation.status as TranslationStatus,
            filePath: translation.filePath
        });
    } catch (error) {
        console.error('Erro ao emitir evento de conclusão:', error);
    }
};

export const emitProgress = (translationId: string, status: TranslationStatus, progress?: number) => {
    global.io?.emit('translation:progress', {
        translationId,
        status,
        progress,
        timestamp: new Date()
    });
};

export const emitDetailedProgress = (
    translationId: string, 
    status: TranslationStatus, 
    progress: number
): void => {
    const io = getIO();
    io.emit(EVENTS.PROGRESS, {
        translationId,
        status,
        progress,
        timestamp: new Date().toISOString()
    });
}; 