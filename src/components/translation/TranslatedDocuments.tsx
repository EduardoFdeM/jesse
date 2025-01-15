import { useState, useEffect, useCallback } from 'react';
import { Download, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Translation } from '../../types/index';
import { api } from '../../services/api';
import { FileUpload } from '../upload/FileUpload';
import { toast } from 'react-toastify';
import { useSocket } from '../../hooks/useSocket';

export function TranslatedDocuments() {
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [sourceLanguage, setSourceLanguage] = useState('');
    const [targetLanguage, setTargetLanguage] = useState('');
    const socket = useSocket();

    // Função para ordenar traduções
    const sortTranslations = (translations: Translation[]) => {
        return [...translations].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    };

    // Função para carregar traduções
    const loadTranslations = useCallback(async () => {
        try {
            const response = await api.get('/api/translations');
            setTranslations(sortTranslations(response.data.data));
            setError(null);
        } catch (err) {
            console.error('Erro ao carregar traduções:', err);
            setError('Erro ao carregar traduções');
        }
    }, []);

    // Efeito para carregar traduções inicialmente
    useEffect(() => {
        loadTranslations();
    }, [loadTranslations]);

    // Efeito para configurar eventos do Socket.IO
    useEffect(() => {
        if (!socket) return;

        // Quando uma nova tradução é iniciada
        socket.on('translation:started', async () => {
            await loadTranslations();
        });

        // Quando há progresso na tradução
        socket.on('translation:progress', ({ id, progress }) => {
            setTranslations(prev => 
                prev.map(t => 
                    t.id === id 
                        ? { ...t, status: `processing (${progress}%)` }
                        : t
                )
            );
        });

        // Quando uma tradução é concluída
        socket.on('translation:completed', async (translation) => {
            await loadTranslations(); // Recarrega a lista completa do backend
            toast.success(`Tradução de "${translation.originalName}" concluída!`);
        });

        // Quando ocorre um erro na tradução
        socket.on('translation:error', async ({ error }) => {
            await loadTranslations();
            toast.error(`Erro na tradução: ${error}`);
        });

        return () => {
            socket.off('translation:started');
            socket.off('translation:progress');
            socket.off('translation:completed');
            socket.off('translation:error');
        };
    }, [socket, loadTranslations]);

    const handleFileSelect = async (files: File[]) => {
        for (const file of files) {
            await uploadAndTranslateFile(file);
        }
    };

    const uploadAndTranslateFile = async (file: File): Promise<void> => {
        try {
            console.log('Iniciando upload do arquivo:', file.name);
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('originalname', file.name);
            formData.append('sourceLanguage', sourceLanguage || 'pt');
            formData.append('targetLanguage', targetLanguage || 'en');

            // Adicionar logs detalhados
            console.log('FormData criado:', {
                fileName: file.name,
                fileSize: file.size,
                sourceLanguage: sourceLanguage || 'pt',
                targetLanguage: targetLanguage || 'en'
            });

            const response = await api.post('/api/translations', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total!);
                    console.log(`Upload progress: ${percentCompleted}%`);
                }
            });

            console.log('Resposta do upload:', response.data);
            
            if (response.data.error) {
                throw new Error(response.data.error);
            }

            toast.success('Arquivo enviado com sucesso!');
            await loadTranslations();
        } catch (error: Error | unknown) {
            console.error('Erro ao fazer upload:', error);
            toast.error(error instanceof Error ? error.message : 'Erro ao fazer upload do arquivo');
        }
    };
    
    const handleDownload = async (fileId: string, fileName: string) => {
        try {
            const response = await api.get(`/api/translations/${fileId}/download`, {
                responseType: 'blob'
            });
    
            const fileURL = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = fileURL;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(fileURL);
        } catch (error) {
            console.error('Erro ao fazer download:', error);
            toast.error('Erro ao fazer download do arquivo. Por favor, tente novamente.');
        }
    };

    const getStatusIcon = (status: string) => {
        if (status.includes('processing')) {
            return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
        }
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-5 w-5 text-green-500" />;
            case 'error':
                return <XCircle className="h-5 w-5 text-red-500" />;
            default:
                return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium mb-4">Nova Tradução</h2>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label htmlFor="sourceLanguage" className="block text-sm font-medium text-gray-700">
                            Idioma de Origem
                        </label>
                        <select
                            id="sourceLanguage"
                            value={sourceLanguage}
                            onChange={(e) => setSourceLanguage(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            required
                        >
                             <option value="">Selecione...</option>
                             <option value="pt">Português</option>
                             <option value="en">Inglês</option>
                             <option value="es">Espanhol</option>
                             <option value="fr">Francês</option>
                             <option value="de">Alemão</option>
                             <option value="it">Italiano</option>
                             <option value="ja">Japonês</option>
                             <option value="zh">Chinês</option>
                             <option value="ru">Russo</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-700">
                            Idioma de Destino
                        </label>
                        <select
                            id="targetLanguage"
                            value={targetLanguage}
                            onChange={(e) => setTargetLanguage(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            required
                        >
                            <option value="">Selecione...</option>
                             <option value="pt">Português</option>
                             <option value="en">Inglês</option>
                             <option value="es">Espanhol</option>
                             <option value="fr">Francês</option>
                             <option value="de">Alemão</option>
                             <option value="it">Italiano</option>
                             <option value="ja">Japonês</option>
                             <option value="zh">Chinês</option>
                             <option value="ru">Russo</option>
                        </select>
                    </div>
                </div>

                <FileUpload 
                    onFileSelect={handleFileSelect}
                    sourceLanguage={sourceLanguage}
                    targetLanguage={targetLanguage}
                />
            </div>

            <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium mb-4">Documentos Traduzidos</h2>

                {error && (
                    <div className="p-3 text-red-600 bg-red-50 rounded-md mb-4">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    {translations.map((translation) => (
                        <div
                            key={translation.id}
                            className="p-4 bg-white rounded-lg border border-gray-200 space-y-3"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-medium">{translation.originalName || translation.fileName}</h3>
                                    <div className="text-sm text-gray-500">
                                        {translation.sourceLanguage} → {translation.targetLanguage}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {new Date(translation.createdAt).toLocaleString()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {getStatusIcon(translation.status)}
                                    {(translation.status === 'completed' || translation.status.includes('100%')) && (
                                        <button
                                            onClick={() => handleDownload(translation.id, translation.originalName || translation.fileName)}
                                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                                            title="Baixar tradução"
                                        >
                                            <Download className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="text-sm text-gray-500 space-y-1">
                                <div>
                                    Tamanho: {(translation.fileSize / 1024).toFixed(2)} KB
                                </div>
                                {translation.status.includes('processing') && (
                                    <div className="text-blue-600">
                                        Status: {translation.status}
                                    </div>
                                )}
                                {translation.knowledgeBase && (
                                    <div>
                                        Base de Conhecimento: {translation.knowledgeBase.name}
                                    </div>
                                )}
                                {translation.errorMessage && (
                                    <div className="text-red-600">
                                        Erro: {translation.errorMessage}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {translations.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            Nenhuma tradução encontrada
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}