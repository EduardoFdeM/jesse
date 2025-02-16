import { Server } from 'socket.io';
import { Translation, TranslationStatus } from '../types/index.js';

let io: Server | null = null;

export const initializeSocket = (server: any) => {
    io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173',
            methods: ['GET', 'POST']
        }
    });
    return io;
};

export const emitTranslationStarted = (translation: Translation) => {
    io?.emit('translation:started', translation);
};

export const emitTranslationProgress = (translationId: string, progress: number) => {
    io?.emit('translation:progress', {
        translationId,
        progress,
        timestamp: new Date()
    });
};

export const emitTranslationError = (translationId: string, error: string) => {
    io?.emit('translation:error', { translationId, error });
};

export const emitTranslationCompleted = (translation: Translation) => {
    io?.emit('translation:completed', translation);
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
    io?.emit('translation:progress', {
        translationId,
        status,
        progress,
        timestamp: new Date().toISOString()
    });
}; 