import { Translation } from '../types/translation.types.js';
import { EVENTS } from '../types/translation.types.js';
import { getIO } from '../config/socket.js';

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

export const emitTranslationProgress = (
    translationId: string,
    progress: number
) => {
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

export const emitTranslationCompleted = (translation: Translation) => {
    try {
        const io = getIO();
        io.emit(EVENTS.COMPLETED, {
            id: translation.id,
            fileName: translation.fileName,
            originalName: translation.originalName,
            status: translation.status,
            filePath: translation.filePath
        });
    } catch (error) {
        console.error('Erro ao emitir evento de conclusão:', error);
    }
};

export const emitTranslationError = (
    translationId: string,
    error: string
) => {
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