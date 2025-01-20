import { useState, useEffect, useCallback } from 'react';
import { Download, Clock, CheckCircle, XCircle, Edit, Trash2 } from 'lucide-react';
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
    const [dateFilter, setDateFilter] = useState<string>('all'); // all, week, month
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedTranslation, setSelectedTranslation] = useState<Translation | null>(null);
    const [editedContent, setEditedContent] = useState('');
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

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
            // Não definir erro se for um erro de timeout ou autenticação
            // pois o interceptor já vai lidar com isso
            if (
                err.message !== 'timeout of 10000ms exceeded' &&
                err.message !== 'Network Error' &&
                err.response?.status !== 401
            ) {
                setError('Erro ao carregar traduções');
            }
        }
    }, []);

    // Efeito para carregar traduções inicialmente
    useEffect(() => {
        loadTranslations();
    }, [loadTranslations]);

    // Efeito para configurar eventos do Socket.IO
    useEffect(() => {
        if (!socket) return;

        const handleStarted = (data: Translation) => {
            setTranslations(prev => sortTranslations([...prev, data]));
        };

        const handleProgress = ({ id, progress }: { id: string; progress: number }) => {
            setTranslations(prev => 
                prev.map(t => 
                    t.id === id 
                        ? { ...t, status: `processing (${progress}%)` }
                        : t
                )
            );
        };

        const handleCompleted = (translation: Translation) => {
            setTranslations(prev => 
                sortTranslations(
                    prev.map(t => t.id === translation.id ? translation : t)
                )
            );
            toast.success(`Tradução de "${translation.originalName}" concluída!`);
        };

        const handleError = ({ id, error }: { id: string; error: string }) => {
            setTranslations(prev => 
                prev.map(t => 
                    t.id === id 
                        ? { ...t, status: 'error', errorMessage: error }
                        : t
                )
            );
            toast.error(`Erro na tradução: ${error}`);
        };

        socket.on('translation:started', handleStarted);
        socket.on('translation:progress', handleProgress);
        socket.on('translation:completed', handleCompleted);
        socket.on('translation:error', handleError);

        // Carregar traduções inicialmente e a cada 30 segundos
        loadTranslations();
        const interval = setInterval(loadTranslations, 30000);

        return () => {
            socket.off('translation:started', handleStarted);
            socket.off('translation:progress', handleProgress);
            socket.off('translation:completed', handleCompleted);
            socket.off('translation:error', handleError);
            clearInterval(interval);
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
            const response = await api.get(`/api/translations/${fileId}/download`);
            
            if (response.data.url) {
                const fileExtension = fileName.split('.').pop()?.toLowerCase();
                
                // Se for PDF, abre em nova guia
                if (fileExtension === 'pdf') {
                    window.open(response.data.url, '_blank');
                    return;
                }
                
                // Para DOCX e TXT, força o download
                const link = document.createElement('a');
                link.href = response.data.url;
                link.setAttribute('download', fileName); // Força o download com o nome original
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                throw new Error('URL de download não disponível');
            }
        } catch (error) {
            console.error('Erro ao fazer download:', error);
            toast.error('Erro ao fazer download do arquivo');
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

    // Função para filtrar por data
    const getFilteredTranslations = useCallback(() => {
        return translations.filter(translation => {
            if (dateFilter === 'all') return true;
            
            const date = new Date(translation.createdAt);
            const now = new Date();
            
            if (dateFilter === 'today') {
                return date.toDateString() === now.toDateString();
            }
            
            if (dateFilter === 'week') {
                const weekAgo = new Date(now.setDate(now.getDate() - 7));
                return date >= weekAgo;
            }
            
            if (dateFilter === 'month') {
                const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
                return date >= monthAgo;
            }
            
            return true;
        });
    }, [translations, dateFilter]);

    // Função para deletar tradução
    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja deletar esta tradução?')) return;
        
        try {
            await api.delete(`/api/translations/${id}`);
            toast.success('Tradução deletada com sucesso');
            loadTranslations();
        } catch (error) {
            toast.error('Erro ao deletar tradução');
        }
    };

    // Função para editar e salvar tradução
    const handleSaveEdit = async () => {
        if (!selectedTranslation) return;
        try {
            await api.put(`/api/translations/${selectedTranslation.id}/content`, {
                content: editedContent
            });
            toast.success('Tradução atualizada com sucesso');
            setShowEditModal(false);
            loadTranslations();
        } catch (error) {
            toast.error('Erro ao atualizar tradução');
        }
    };

    const handleEdit = async (translation: Translation) => {
        try {
            const response = await api.get(`/api/translations/${translation.id}/content`);
            if (response.data.content) {
                setEditedContent(response.data.content);
                setSelectedTranslation(translation);
                setShowEditModal(true);
            } else {
                toast.error('Conteúdo do arquivo não disponível');
            }
        } catch (error: any) {
            console.error('Erro ao carregar conteúdo:', error);
            const errorMessage = error.response?.data?.error || 'Erro ao carregar conteúdo do arquivo';
            toast.error(errorMessage);
        }
    };

    // Função para formatar o custo
    const formatCost = (cost: string | null) => {
        if (!cost) return 'N/A';
        return `US$ ${cost}`;
    };

    // Função para selecionar itens entre dois índices
    const selectItemsBetween = (translations: Translation[], startId: string, endId: string) => {
        const startIndex = translations.findIndex(t => t.id === startId);
        const endIndex = translations.findIndex(t => t.id === endId);
        
        if (startIndex === -1 || endIndex === -1) return [];
        
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        
        return translations.slice(start, end + 1).map(t => t.id);
    };

    // Função para manipular seleção de itens
    const handleSelectItem = (id: string, event: React.MouseEvent) => {
        if (!isSelectionMode) return;

        if (event.shiftKey && lastSelectedId) {
            const filteredTranslations = getFilteredTranslations();
            const itemsBetween = selectItemsBetween(filteredTranslations, lastSelectedId, id);
            
            setSelectedItems(prev => {
                const newSelection = new Set(prev);
                itemsBetween.forEach(itemId => newSelection.add(itemId));
                return Array.from(newSelection);
            });
        } else {
            setSelectedItems(prev => {
                if (prev.includes(id)) {
                    return prev.filter(item => item !== id);
                }
                return [...prev, id];
            });
        }
        
        setLastSelectedId(id);
    };

    // Função para ações em massa
    const handleBulkAction = async (action: 'download' | 'delete') => {
        if (selectedItems.length === 0) return;

        if (action === 'delete') {
            if (!window.confirm(`Tem certeza que deseja deletar ${selectedItems.length} traduções?`)) return;
            
            try {
                await Promise.all(selectedItems.map(id => api.delete(`/api/translations/${id}`)));
                toast.success('Traduções deletadas com sucesso');
                setSelectedItems([]);
                setIsSelectionMode(false);
                loadTranslations();
            } catch (error) {
                toast.error('Erro ao deletar traduções');
            }
        } else if (action === 'download') {
            try {
                const translations = getFilteredTranslations().filter(t => selectedItems.includes(t.id));
                for (const translation of translations) {
                    await handleDownload(translation.id, translation.originalName || translation.fileName);
                }
                toast.success('Downloads iniciados');
            } catch (error) {
                toast.error('Erro ao baixar arquivos');
            }
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

                <div className="mb-4 flex justify-between items-center">
                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="all">Todas as datas</option>
                        <option value="today">Hoje</option>
                        <option value="week">Última semana</option>
                        <option value="month">Último mês</option>
                    </select>

                    <div className="flex gap-2">
                        {isSelectionMode && (
                            <>
                                <button
                                    onClick={() => handleBulkAction('download')}
                                    disabled={selectedItems.length === 0}
                                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Baixar ({selectedItems.length})
                                </button>
                                <button
                                    onClick={() => handleBulkAction('delete')}
                                    disabled={selectedItems.length === 0}
                                    className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                                >
                                    Deletar ({selectedItems.length})
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => {
                                setIsSelectionMode(!isSelectionMode);
                                setSelectedItems([]);
                                setLastSelectedId(null);
                            }}
                            className="px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700"
                        >
                            {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                        </button>
                    </div>
                </div>

                <div className="space-y-4 select-none">
                    {getFilteredTranslations().map((translation) => (
                        <div
                            key={translation.id}
                            className={`p-4 bg-white rounded-lg border ${
                                isSelectionMode && selectedItems.includes(translation.id)
                                    ? 'border-blue-500'
                                    : 'border-gray-200'
                            } space-y-3`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    {isSelectionMode && (
                                        <div 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelectItem(translation.id, e);
                                            }}
                                            className="cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(translation.id)}
                                                onChange={() => {}}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            {getStatusIcon(translation.status)}
                                            <span className="font-medium">
                                                {translation.originalName || translation.fileName}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {translation.sourceLanguage} → {translation.targetLanguage}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {new Date(translation.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                    {!isSelectionMode && (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownload(translation.id, translation.fileName);
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded"
                                                title="Download"
                                            >
                                                <Download className="h-5 w-5 text-gray-600" />
                                            </button>
                                            {translation.status === 'completed' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEdit(translation);
                                                    }}
                                                    className="p-1 hover:bg-gray-100 rounded"
                                                    title="Editar"
                                                >
                                                    <Edit className="h-5 w-5 text-gray-600" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(translation.id);
                                                }}
                                                className="p-1 hover:bg-gray-100 rounded"
                                                title="Deletar"
                                            >
                                                <Trash2 className="h-5 w-5 text-gray-600" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="text-sm text-gray-500 space-y-1">
                                <div>
                                    Tamanho: {(translation.fileSize / 1024).toFixed(2)} KB
                                </div>
                                {translation.costData && (
                                    <div className="text-sm text-gray-600">
                                        Custo: {formatCost(translation.costData)}
                                    </div>
                                )}
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

            {/* Modal de edição */}
            {showEditModal && selectedTranslation && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg w-3/4 max-h-[80vh] overflow-y-auto">
                        <h3 className="text-lg font-medium mb-4">Editar Tradução</h3>
                        <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="w-full h-64 p-2 border rounded"
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}