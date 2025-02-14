import { TranslationStatus } from '../types';

export const calculateProgress = ({ status }: { status: TranslationStatus }): number => {
    const progressMap = {
        [TranslationStatus.PENDING]: 0,
        [TranslationStatus.PROCESSING]: 20,
        [TranslationStatus.RETRIEVING_CONTEXT]: 40,
        [TranslationStatus.TRANSLATING]: 60,
        [TranslationStatus.COMPLETED]: 100,
        [TranslationStatus.ERROR]: 0
    };
    
    return progressMap[status] || 0;
}; 