import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { Translation } from '../../types/index';
import api from '../../axiosConfig';

interface TranslationProgressProps {
    translationId: string;
    onComplete?: (translation: Translation) => void;
}

export function TranslationProgress({ translationId, onComplete }: TranslationProgressProps) {
    const [translation, setTranslation] = useState<Translation | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const response = await api.get(`/api/translations/${translationId}`);
                const translation = response.data.data;
                setTranslation(translation);

                if (translation.status === 'completed') {
                    onComplete?.(translation);
                } else if (translation.status === 'error') {
                    setError(translation.errorMessage || 'Erro ao processar tradução');
                } else {
                    // Continuar verificando se ainda está em andamento
                    setTimeout(checkStatus, 2000);
                }
            } catch (err) {
                console.error('Erro ao verificar status da tradução:', err);
                setError('Erro ao verificar status da tradução');
            }
        };

        checkStatus();
    }, [translationId, onComplete]);

    if (!translation) {
        return (
            <div className="flex items-center justify-center p-4">
                <Clock className="animate-spin h-5 w-5 text-blue-500 mr-2" />
                <span className="text-sm text-gray-600">Carregando...</span>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Status da Tradução</h3>
                {translation.status === 'completed' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                )}
                {translation.status === 'error' && (
                    <XCircle className="h-5 w-5 text-red-500" />
                )}
                {translation.status === 'pending' && (
                    <Clock className="animate-spin h-5 w-5 text-blue-500" />
                )}
            </div>

            <div className="space-y-2">
                <div className="text-sm text-gray-500">
                    <span className="font-medium">Arquivo: </span>
                    {translation.fileName}
                </div>
                <div className="text-sm text-gray-500">
                    <span className="font-medium">Tamanho: </span>
                    {(translation.fileSize / 1024).toFixed(2)} KB
                </div>
                <div className="text-sm text-gray-500">
                    <span className="font-medium">Idiomas: </span>
                    {translation.sourceLanguage} → {translation.targetLanguage}
                </div>
                {translation.knowledgeBase && (
                    <div className="text-sm text-gray-500">
                        <span className="font-medium">Base de Conhecimento: </span>
                        {translation.knowledgeBase.name}
                    </div>
                )}
            </div>

            {error && (
                <div className="p-3 text-red-600 bg-red-50 rounded-md">
                    {error}
                </div>
            )}

            {translation.status === 'completed' && translation.translatedUrl && (
                <div className="flex justify-end">
                    <a
                        href={`/api/translations/${translation.id}/download`}
                        download
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                    >
                        Baixar Tradução
                    </a>
                </div>
            )}
        </div>
    );
}
