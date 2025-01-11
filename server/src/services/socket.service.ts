import { getIO } from '../config/socket';
import { Translation } from '@prisma/client';

export const SocketEvents = {
    TRANSLATION_STARTED: 'translation:started',
    TRANSLATION_PROGRESS: 'translation:progress',
    TRANSLATION_COMPLETED: 'translation:completed',
    TRANSLATION_ERROR: 'translation:error'
} as const;

export const emitTranslationStarted = (translation: Translation) => {
    const io = getIO();
    io.emit(SocketEvents.TRANSLATION_STARTED, {
        id: translation.id,
        fileName: translation.fileName,
        originalName: translation.originalName,
        status: translation.status
    });
};

export const emitTranslationProgress = (translationId: string, progress: number) => {
    const io = getIO();
    io.emit(SocketEvents.TRANSLATION_PROGRESS, {
        id: translationId,
        progress
    });
};

export const emitTranslationCompleted = (translation: Translation) => {
    const io = getIO();
    io.emit(SocketEvents.TRANSLATION_COMPLETED, {
        id: translation.id,
        fileName: translation.fileName,
        originalName: translation.originalName,
        status: translation.status,
        filePath: translation.filePath
    });
};

export const emitTranslationError = (translationId: string, error: string) => {
    const io = getIO();
    io.emit(SocketEvents.TRANSLATION_ERROR, {
        id: translationId,
        error
    });
}; 