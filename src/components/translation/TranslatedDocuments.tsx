import { useState, useEffect, useCallback } from 'react';
import { Download, Clock, CheckCircle, XCircle, Edit, Trash2, Share2 } from 'lucide-react';
import { Translation, KnowledgeBase, Prompt, User, ViewStatus } from '../../types/index';
import api from '../../axiosConfig';
import { FileUpload } from '../upload/FileUpload';
import { toast } from 'react-toastify';
import { useSocket } from '../../hooks/useSocket';
import { LANGUAGES } from '../../constants/languages';
import { LanguageSelector } from './LanguageSelector';

// Constantes para os custos por token
const INPUT_TOKEN_RATE = 0.00000015;  // $0.150 / 1M tokens
const OUTPUT_TOKEN_RATE = 0.0000006;  // $0.600 / 1M tokens

interface TranslationMetadata {
    usedKnowledgeBase: boolean;
    usedAssistant: boolean;
    knowledgeBaseName?: string;
    assistantName?: string;
}

// Atualizar o enum ViewStatus
enum ViewStatus {
    ALL = "all",
    TO_EDIT = "to_edit",
    EDITED = "edited",
    APPROVED = "approved",
    REVIEW = "review",
    ARCHIVED = "archived"
}

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
    const [searchTerm, setSearchTerm] = useState('');
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string | null>(null);
    const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [selectedTranslationForShare, setSelectedTranslationForShare] = useState<Translation | null>(null);
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const userRole = localStorage.getItem('userRole');
    const [viewFilter, setViewFilter] = useState<ViewStatus>(ViewStatus.ALL);

    // Função para ordenar traduções
    const sortTranslations = (translations: Translation[]): Translation[] => {
        return translations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    // Função para carregar traduções
    const loadTranslations = useCallback(async () => {
        try {
            const endpoint = userRole === 'EDITOR' 
                ? '/api/translations/shared'  // Endpoint específico para editores
                : '/api/translations';        // Endpoint padrão
                
            const response = await api.get(endpoint);
            const translationsWithMetadata = response.data.data.map((translation: Translation) => {
                let metadata: TranslationMetadata = {
                    usedKnowledgeBase: false,
                    usedAssistant: false
                };
                try {
                    if (translation.translationMetadata) {
                        metadata = JSON.parse(translation.translationMetadata);
                    }
                } catch (e) {
                    console.error('Erro ao parsear metadata:', e);
                }
                    
                return {
                    ...translation,
                    usedKnowledgeBase: metadata.usedKnowledgeBase || false,
                    usedAssistant: metadata.usedAssistant || false,
                    knowledgeBaseName: metadata.knowledgeBaseName || translation.knowledgeBase?.name,
                    assistantName: metadata.assistantName || translation.assistant?.name
                };
            });
            
            setTranslations(sortTranslations(translationsWithMetadata));
        } catch (err) {
            console.error('Erro ao carregar traduções:', err);
            toast.error('Erro ao carregar traduções');
        }
    }, [userRole]);

    // Efeito para carregar traduções inicialmente
    useEffect(() => {
        loadTranslations();
    }, [loadTranslations]);

    // Efeito para carregar bases de conhecimento e prompts apenas para usuários não-editores
    useEffect(() => {
        const loadData = async () => {
            if (userRole !== 'EDITOR') {
                try {
                    const [kbResponse, assistantsResponse] = await Promise.all([
                        api.get('/api/knowledge-bases'),
                        api.get('/api/assistants')
                    ]);

                    setKnowledgeBases(kbResponse.data.data);
                    setPrompts(assistantsResponse.data.data);
                } catch (error) {
                    console.error('Erro ao carregar dados:', error);
                }
            }
        };

        loadData();
    }, [userRole]);

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
            setTranslations(prev => {
                const translationMetadata = translation.translationMetadata 
                    ? JSON.parse(translation.translationMetadata)
                    : {};
                    
                return sortTranslations(
                    prev.map(t => 
                        t.id === translation.id 
                            ? {
                                ...translation,
                                usedKnowledgeBase: translationMetadata.usedKnowledgeBase || false,
                                usedAssistant: translationMetadata.usedAssistant || false,
                                knowledgeBase: translation.knowledgeBase,
                                assistant: translation.assistant
                            }
                            : t
                    )
                );
            });
            toast.success(`Tradução de "${translation.originalName}" concluída!`);
        };

        const handleError = (message: string) => {
            toast.error(message);
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

    useEffect(() => {
        if (socket) {
            // Reconectar se desconectado
            socket.on('disconnect', () => {
                console.log('Reconectando socket...');
                socket.connect();
            });

            return () => {
                socket.off('disconnect');
            };
        }
    }, [socket]);

    const handleFileSelect = async (files: File[]) => {
        for (const file of files) {
            await uploadAndTranslateFile(file);
        }
    };

    const uploadAndTranslateFile = async (file: File): Promise<void> => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('originalname', file.name);
            formData.append('sourceLanguage', sourceLanguage || 'pt');
            formData.append('targetLanguage', targetLanguage || 'en');
            formData.append('useKnowledgeBase', selectedKnowledgeBase ? 'true' : 'false');
            formData.append('useCustomPrompt', selectedPrompt ? 'true' : 'false');

            if (selectedKnowledgeBase) {
                formData.append('knowledgeBaseId', selectedKnowledgeBase);
            }
            if (selectedPrompt) {
                formData.append('promptId', selectedPrompt);
            }

            const response = await api.post('/api/translations', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response.data.error) {
                throw new Error(response.data.error);
            }

            toast.success('Arquivo enviado com sucesso!');
            await loadTranslations();
        } catch (error: unknown) {
            handleUploadError(error);
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

    // Função para contar documentos por status
    const getStatusCounts = useCallback(() => {
        return translations.reduce((acc, translation) => {
            if (translation.viewStatus !== ViewStatus.ALL) {
                acc[translation.viewStatus as ViewStatus] = (acc[translation.viewStatus as ViewStatus] || 0) + 1;
            }
            return acc;
        }, {} as Record<ViewStatus, number>);
    }, [translations]);

    // Função para filtrar por data
    const getFilteredTranslations = useCallback(() => {
        return translations.filter(translation => {
            // Filtro por data
            if (dateFilter !== 'all') {
                const date = new Date(translation.createdAt);
                const now = new Date();
                
                if (dateFilter === 'today' && date.toDateString() !== now.toDateString()) {
                    return false;
                }
                
                if (dateFilter === 'week') {
                    const weekAgo = new Date(now.setDate(now.getDate() - 7));
                    if (date < weekAgo) return false;
                }
                
                if (dateFilter === 'month') {
                    const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
                    if (date < monthAgo) return false;
                }
            }

            // Filtro por nome
            if (searchTerm && !translation.fileName.toLowerCase().includes(searchTerm.toLowerCase())) {
                return false;
            }

            // Filtro por status de visualização
            if (viewFilter !== ViewStatus.ALL && viewFilter !== translation.viewStatus) {
                return false;
            }

            return true;
        });
    }, [translations, dateFilter, searchTerm, viewFilter]);

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

    const handleEdit = async (translationId: string) => {
        try {
            // Abrir em nova aba
            const editorUrl = `/editor/${translationId}`;
            window.open(editorUrl, '_blank');
        } catch (error) {
            console.error('Erro ao abrir editor:', error);
            toast.error('Erro ao abrir editor');
        }
    };

    // Função para formatar o custo
    const formatCost = (cost: string | null): string => {
        if (!cost) return 'N/A';
        try {
            // Tenta interpretar o valor como JSON
            const parsedCost = JSON.parse(cost);
            
            // Se tiver os tokens separados (prompt/completion), usa as taxas específicas
            if (parsedCost.promptTokens && parsedCost.completionTokens) {
                const inputCost = parsedCost.promptTokens * INPUT_TOKEN_RATE;
                const outputCost = parsedCost.completionTokens * OUTPUT_TOKEN_RATE;
                const totalCost = inputCost + outputCost;
                return `US$ ${totalCost.toFixed(4)}`;
            }
            
            // Se só tiver totalTokens, usa uma média das taxas (fallback)
            if (parsedCost.totalTokens) {
                const averageRate = (INPUT_TOKEN_RATE + OUTPUT_TOKEN_RATE) / 2;
                const computedCost = parsedCost.totalTokens * averageRate;
                return `US$ ${computedCost.toFixed(4)}`;
            }
            
            return 'N/A';
        } catch (error) {
            // Se não for JSON, tenta converter diretamente
            const numericCost = parseFloat(cost);
            if (isNaN(numericCost)) return 'N/A';
            return `US$ ${numericCost.toFixed(4)}`;
        }
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

    const handleReset = () => {
        setSourceLanguage('');
        setTargetLanguage('');
        setSelectedKnowledgeBase(null);
        setSelectedPrompt(null);
    };

    const handleUploadError = (error: unknown) => {
        if (error instanceof Error) {
            handleError(error.message);
        } else {
            handleError('Erro desconhecido ao fazer upload do arquivo');
        }
    };

    // Atualizar a exibição dos metadados
    const renderMetadata = (translation: Translation) => {
        const metadata = translation.translationMetadata ? JSON.parse(translation.translationMetadata) : {};
        return (
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                {translation.usedKnowledgeBase && (
                    <div className="flex items-center gap-1">
                        📚 Base de conhecimento: {translation.knowledgeBase?.name || 'Não especificada'}
                    </div>
                )}
                {translation.usedAssistant && (
                    <div className="flex items-center gap-1">
                        🤖 Assistant: {translation.assistant?.name || 'Padrão'}
                        {translation.assistant?.model && (
                            <span className="text-xs text-gray-400 ml-1">
                                ({translation.assistant.model})
                            </span>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Função para renderizar ações
    const renderActions = (translation: Translation) => {
        if (userRole === 'EDITOR') {
            return (
                <button
                    onClick={() => handleEdit(translation.id)}
                    className="p-1 hover:bg-gray-100 rounded"
                    title="Editar"
                >
                    <Edit className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
            );
        }

        return (
            <>
                {translation.status === 'completed' && (
                    <>
                        <button
                            onClick={() => handleDownload(translation.id, translation.fileName)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title="Download"
                        >
                            <Download className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                            onClick={() => handleShare(translation.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title="Compartilhar"
                        >
                            <Share2 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                            onClick={() => handleEdit(translation.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title="Editar"
                        >
                            <Edit className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </>
                )}
                {userRole !== 'EDITOR' && (
                    <button
                        onClick={() => handleDelete(translation.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Deletar"
                    >
                        <Trash2 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                )}
            </>
        );
    };

    // Carregar usuários disponíveis para compartilhamento
    const loadAvailableUsers = async () => {
        try {
            const response = await api.get('/api/admin/users/available');
            setAvailableUsers(response.data.users);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            toast.error('Erro ao carregar lista de usuários');
        }
    };

    // Atualizar handleShare para carregar usuários
    const handleShare = async (translationId: string) => {
        try {
            const translation = translations.find(t => t.id === translationId);
            setSelectedTranslationForShare(translation || null);
            await loadAvailableUsers(); // Carregar usuários antes de abrir o modal
            setShowShareModal(true);
        } catch (error) {
            toast.error('Erro ao preparar compartilhamento');
        }
    };

    // Atualizar handleSaveShare para implementar o compartilhamento
    const handleSaveShare = async () => {
        if (!selectedTranslationForShare || selectedUsers.length === 0) {
            toast.error('Selecione pelo menos um usuário para compartilhar');
            return;
        }
        
        try {
            await api.post(`/api/translations/${selectedTranslationForShare.id}/share`, {
                userIds: selectedUsers
            });
            
            toast.success('Documento compartilhado com sucesso');
            setShowShareModal(false);
            setSelectedUsers([]);
        } catch (error) {
            toast.error('Erro ao compartilhar documento');
        }
    };

    // Adicionar modal de compartilhamento
    const ShareModal = () => {
        const groupedUsers = availableUsers.reduce((groups, user) => {
            const group = groups[user.role] || [];
            group.push(user);
            groups[user.role] = group;
            return groups;
        }, {} as Record<string, typeof availableUsers>);

        const roleOrder = ['SUPERUSER', 'EDITOR', 'TRANSLATOR'];
        const roleLabels = {
            SUPERUSER: 'Administradores',
            EDITOR: 'Editores',
            TRANSLATOR: 'Tradutores'
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
                    <h3 className="text-lg font-medium mb-4">Compartilhar Documento</h3>
                    <div className="space-y-6">
                        {roleOrder.map(role => (
                            groupedUsers[role]?.length > 0 && (
                                <div key={role} className="space-y-2">
                                    <h4 className="font-medium text-gray-700">
                                        {roleLabels[role as keyof typeof roleLabels]}
                                    </h4>
                                    <div className="space-y-2">
                                        {groupedUsers[role].map(user => (
                                            <div key={user.id} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id={user.id}
                                                    checked={selectedUsers.includes(user.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedUsers([...selectedUsers, user.id]);
                                                        } else {
                                                            setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                                        }
                                                    }}
                                                    className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <label htmlFor={user.id} className="text-sm text-gray-700">
                                                    {user.name} ({user.email})
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button
                            onClick={() => {
                                setShowShareModal(false);
                                setSelectedUsers([]);
                            }}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveShare}
                            disabled={selectedUsers.length === 0}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Compartilhar
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Função para atualizar o status de visualização
    const handleViewStatusChange = async (translationId: string, newStatus: ViewStatus) => {
        try {
            await api.put(`/api/translations/${translationId}/view-status`, {
                viewStatus: newStatus
            });
            toast.success('Status de visualização atualizado');
            loadTranslations();
        } catch (error) {
            toast.error('Erro ao atualizar status de visualização');
        }
    };

    return (
        <div className="space-y-6">
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {userRole === 'EDITOR' ? 'Documentos Compartilhados' : 'Traduções'}
                    </h1>
                    {userRole === 'EDITOR' && (
                        <div className="mt-2 flex gap-4 text-sm text-gray-600">
                            <span title="Documentos aguardando edição" className="flex items-center gap-1">
                                ✏️ A editar: {getStatusCounts()[ViewStatus.TO_EDIT] || 0}
                            </span>
                            <span title="Documentos editados" className="flex items-center gap-1">
                                ✅ Editados: {getStatusCounts()[ViewStatus.EDITED] || 0}
                            </span>
                            <span title="Documentos aprovados" className="flex items-center gap-1">
                                🎯 Aprovados: {getStatusCounts()[ViewStatus.APPROVED] || 0}
                            </span>
                            <span title="Documentos em revisão" className="flex items-center gap-1">
                                🔍 Revisão: {getStatusCounts()[ViewStatus.REVIEW] || 0}
                            </span>
                            <span title="Documentos arquivados" className="flex items-center gap-1">
                                📦 Arquivados: {getStatusCounts()[ViewStatus.ARCHIVED] || 0}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Mostrar FileUpload apenas para SUPERUSER e TRANSLATOR */}
            {userRole !== 'EDITOR' && (
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <LanguageSelector
                            value={sourceLanguage}
                            onChange={setSourceLanguage}
                            label="Idioma de origem"
                        />
                        <LanguageSelector
                            value={targetLanguage}
                            onChange={setTargetLanguage}
                            label="Idioma de destino"
                        />
                    </div>
                    <FileUpload
                        sourceLanguage={sourceLanguage}
                        targetLanguage={targetLanguage}
                        onFileSelect={handleFileSelect}
                        knowledgeBases={knowledgeBases}
                        prompts={prompts}
                        onReset={handleReset}
                        selectedKnowledgeBase={selectedKnowledgeBase}
                        selectedPrompt={selectedPrompt}
                        onKnowledgeBaseSelect={setSelectedKnowledgeBase}
                        onPromptSelect={setSelectedPrompt}
                    />
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <div className="flex flex-col gap-4">
                    {/* Cabeçalho e Controles */}
                    <div className="flex flex-col sm:flex-row justify-between items-center">
                        <h2 className="text-xl font-medium text-gray-900 dark:text-white mb-4 sm:mb-0">
                            Documentos Traduzidos
                        </h2>

                        <button
                            onClick={() => {
                                setIsSelectionMode(!isSelectionMode);
                                setSelectedItems([]);
                                setLastSelectedId(null);
                            }}
                            className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700"
                        >
                            {isSelectionMode ? 'Cancelar Seleção' : 'Selecionar Documentos'}
                        </button>
                    </div>

                    {/* Barra de Ações em Massa */}
                    {isSelectionMode && (
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => handleBulkAction('download')}
                                disabled={selectedItems.length === 0}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                Baixar ({selectedItems.length})
                            </button>
                            <button
                                onClick={() => handleBulkAction('delete')}
                                disabled={selectedItems.length === 0}
                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                            >
                                Deletar ({selectedItems.length})
                            </button>
                        </div>
                    )}

                    {/* Barra de Filtros */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Pesquisa */}
                        <div className="relative col-span-1 sm:col-span-2">
                            <input
                                type="text"
                                placeholder="Pesquisar por nome..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        {/* Filtro de Status (apenas para editores) */}
                        {userRole === 'EDITOR' && (
                            <select
                                value={viewFilter}
                                onChange={(e) => setViewFilter(e.target.value as ViewStatus)}
                                className="border rounded-lg px-4 py-2 bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                title="Filtrar documentos por status"
                            >
                                <option value={ViewStatus.ALL}>👀 Mostrar Todos</option>
                                <option value={ViewStatus.TO_EDIT}>✏️ A editar</option>
                                <option value={ViewStatus.EDITED}>✅ Editados</option>
                                <option value={ViewStatus.APPROVED}>🎯 Aprovados</option>
                                <option value={ViewStatus.REVIEW}>🔍 Em Revisão</option>
                                <option value={ViewStatus.ARCHIVED}>📦 Arquivados</option>
                            </select>
                        )}

                        {/* Ordenação */}
                        <select
                            onChange={(e) => {
                                const value = e.target.value;
                                setTranslations(prev => {
                                    const sorted = [...prev];
                                    switch (value) {
                                        case 'date-desc':
                                            sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                                            break;
                                        case 'date-asc':
                                            sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                                            break;
                                        case 'name-asc':
                                            sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
                                            break;
                                        case 'name-desc':
                                            sorted.sort((a, b) => b.fileName.localeCompare(a.fileName));
                                            break;
                                    }
                                    return sorted;
                                });
                            }}
                            className="border rounded-lg px-4 py-2 bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            title="Ordenar documentos"
                            defaultValue="date-desc"
                        >
                            <option value="date-desc">Mais Recentes Primeiro</option>
                            <option value="date-asc">Mais Antigos Primeiro</option>
                            <option value="name-asc">Nome (A-Z)</option>
                            <option value="name-desc">Nome (Z-A)</option>
                        </select>
                    </div>
                </div>

                {/* Lista de Documentos */}
                <div className="mt-6 space-y-4">
                    {getFilteredTranslations().map((translation) => (
                        <div
                            key={translation.id}
                            className="p-4 border rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
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
                                                <div className="text-sm text-gray-900 dark:text-white">
                                                    {translation.fileName}
                                                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                                        ({translation.fileName.split('.').pop()?.toUpperCase()})
                                                    </span>
                                                </div>
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                            {translation.sourceLanguage} → {translation.targetLanguage}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(translation.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                    {renderActions(translation)}
                                </div>
                            </div>

                            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                                <div>
                                    Tamanho: {(translation.fileSize / 1024).toFixed(2)} KB
                                </div>
                                {translation.costData && (
                                    <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                        Custo: {formatCost(translation.costData)}
                                    </div>
                                )}
                                {translation.status.includes('processing') && (
                                    <div className="text-blue-600 dark:text-blue-400">
                                        Status: {translation.status}
                                    </div>
                                )}
                                {renderMetadata(translation)}
                                {translation.errorMessage && (
                                    <div className="text-red-600 dark:text-red-400">
                                        Erro: {translation.errorMessage}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 mt-2 text-sm text-gray-600">
                                <div className="flex items-center">
                                    <span className="mr-2">Base de Conhecimento:</span>
                                    {translation.usedKnowledgeBase && translation.knowledgeBase ? (
                                        <span className="text-green-600" title={translation.knowledgeBase.name}>✓</span>
                                    ) : (
                                        <span className="text-red-600">✗</span>
                                    )}
                                </div>
                                <div className="flex items-center">
                                    <span className="mr-2">Assistant Personalizado:</span>
                                    {translation.usedAssistant && translation.assistant ? (
                                        <span className="text-green-600" title={translation.assistant.name}>✓</span>
                                    ) : (
                                        <span className="text-red-600">✗</span>
                                    )}
                                </div>
                            </div>

                            {/* Status de visualização para editores */}
                            {userRole === 'EDITOR' && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className={`px-2 py-1 text-sm rounded-full ${
                                        translation.viewStatus === ViewStatus.TO_EDIT
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : translation.viewStatus === ViewStatus.EDITED
                                            ? 'bg-blue-100 text-blue-800'
                                            : translation.viewStatus === ViewStatus.APPROVED
                                            ? 'bg-green-100 text-green-800'
                                            : translation.viewStatus === ViewStatus.REVIEW
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {translation.viewStatus === ViewStatus.TO_EDIT
                                            ? '✏️ A editar'
                                            : translation.viewStatus === ViewStatus.EDITED
                                            ? '✅ Editado'
                                            : translation.viewStatus === ViewStatus.APPROVED
                                            ? '🎯 Aprovado'
                                            : translation.viewStatus === ViewStatus.REVIEW
                                            ? '🔍 Em Revisão'
                                            : '📦 Arquivado'}
                                    </span>
                                    {/* Adicionar informação de quem compartilhou */}
                                    {translation.shares && translation.shares.length > 0 && (
                                        <span className="text-sm text-gray-600">
                                            Compartilhado por: {translation.shares[0].sharedBy.name}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {translations.length === 0 && (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
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

            {showShareModal && <ShareModal />}
        </div>
    );
}