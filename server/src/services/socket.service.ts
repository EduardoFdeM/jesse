import { getIO } from '../config/socket.js';
import { Translation } from '@prisma/client';

export const SocketEvents = {
    TRANSLATION_STARTED: 'translation:started',
    TRANSLATION_PROGRESS: 'translation:progress',
    TRANSLATION_COMPLETED: 'translation:completed',
    TRANSLATION_ERROR: 'translation:error'
} as const;

export const emitTranslationStarted = (translation: Translation) => {
    try {
        const io = getIO();
        io.emit(SocketEvents.TRANSLATION_STARTED, {
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
        io.emit(SocketEvents.TRANSLATION_PROGRESS, {
            id: translationId,
            progress
        });
    } catch (error) {
        console.error('Erro ao emitir evento de progresso:', error);
    }
};

export const emitTranslationCompleted = (translation: Translation) => {
    try {
        const io = getIO();
        io.emit(SocketEvents.TRANSLATION_COMPLETED, {
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

export const emitTranslationError = (translationId: string, error: string) => {
    try {
        const io = getIO();
        io.emit(SocketEvents.TRANSLATION_ERROR, {
            id: translationId,
            error
        });
    } catch (err) {
        console.error('Erro ao emitir evento de erro:', err);
    }
}; 