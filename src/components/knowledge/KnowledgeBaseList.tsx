import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, FileText, Clock, ChevronDown, ChevronUp, Book, Files } from 'lucide-react';
import { KnowledgeBase } from '../../types/index';
import api from '../../axiosConfig';
import { Link } from 'react-router-dom';
import { LANGUAGES } from '../../constants/languages';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { OpenAIFiles } from './OpenAIFiles';

interface VectorStoreFile {
    id: string;
    object: 'vector_store.file';
    usage_bytes: number;
    created_at: number;
    vector_store_id: string;
    status: string;
    last_error: null | string;
    chunking_strategy: {
        type: string;
        static: {
            max_chunk_size_tokens: number;
            chunk_overlap_tokens: number;
        };
    };
    attributes: Record<string, unknown>;
    filename?: string;
}

interface VectorStoreFileList {
    object: 'list';
    data: VectorStoreFile[];
    first_id: string;
    last_id: string;
    has_more: boolean;
}

export function KnowledgeBaseList() {
    const [activeTab, setActiveTab] = useState<'bases' | 'files'>('bases');
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedBase, setExpandedBase] = useState<string | null>(null);
    const [filesLoading, setFilesLoading] = useState<Record<string, boolean>>({});
    const [baseFiles, setBaseFiles] = useState<Record<string, VectorStoreFileList>>({});
    const userRole = localStorage.getItem('userRole');

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const response = await api.get('/api/knowledge-bases');
            setKnowledgeBases(response.data.data);
            setError(null);
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error('Erro ao carregar bases de conhecimento:', error);
            setError('Erro ao carregar bases de conhecimento');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        fetchData();
        return () => controller.abort();
    }, []);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta base de conhecimento?')) {
            return;
        }

        try {
            await api.delete(`/api/knowledge-bases/${id}`);
            await fetchData();
            setError(null);
        } catch (error: unknown) {
            console.error('Erro ao excluir base de conhecimento:', error);
            setError('Erro ao excluir base de conhecimento');
        }
    };

    const formatDate = (date: string) => {
        return format(new Date(date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { 
            locale: ptBR 
        });
    };

    const loadFiles = async (baseId: string) => {
        if (baseFiles[baseId]) return;

        try {
            setFilesLoading(prev => ({ ...prev, [baseId]: true }));
            const response = await api.get(`/api/knowledge-bases/${baseId}/files`);
            const vectorStoreFiles = response.data.data;

            const filesWithDetails = await Promise.all(
                vectorStoreFiles.data.map(async (file) => {
                    try {
                        const fileDetails = await api.get(`/api/files/${file.id}`);
                        return {
                            ...file,
                            filename: fileDetails.data.data.filename
                        };
                    } catch (error) {
                        console.error(`Erro ao buscar detalhes do arquivo ${file.id}:`, error);
                        return file;
                    }
                })
            );

            setBaseFiles(prev => ({
                ...prev,
                [baseId]: {
                    ...response.data.data,
                    data: filesWithDetails
                }
            }));
        } catch (error) {
            console.error('Erro ao carregar arquivos:', error);
        } finally {
            setFilesLoading(prev => ({ ...prev, [baseId]: false }));
        }
    };

    const toggleExpand = async (baseId: string) => {
        if (expandedBase === baseId) {
            setExpandedBase(null);
        } else {
            setExpandedBase(baseId);
            await loadFiles(baseId);
        }
    };

    // Função para abreviar IDs
    const formatId = (id: string, maxLength: number = 20) => {
        if (id.length <= maxLength) return id;
        const start = id.slice(0, maxLength - 10);
        const end = id.slice(-7);
        return `${start}...${end}`;
    };

    // Função para formatar o ID do arquivo
    const formatFileId = (id: string) => {
        // Pega apenas os primeiros 8 caracteres do ID
        return id.slice(0, 8) + '...';
    };

    // Função para formatar o nome do arquivo
    const formatFileName = (filename: string, maxLength: number = 20) => {
        if (!filename) return '';
        if (filename.length <= maxLength) return filename;
        const extension = filename.split('.').pop() || '';
        const name = filename.slice(0, maxLength - 3 - extension.length);
        return `${name}...${extension}`;
    };

    const renderFileInfo = (file: VectorStoreFile) => {
        // Tentar obter o nome do arquivo de várias formas possíveis
        const getDisplayName = () => {
            // Se tivermos o nome do arquivo diretamente
            if (file.filename) return file.filename;
            
            // Se tivermos o nome em metadata
            if (file.metadata?.filename) return file.metadata.filename;
            
            // Se o ID começar com 'file-', remover esse prefixo
            if (file.id.startsWith('file-')) {
                return file.id.substring(5);
            }
            
            // Último caso, usar o ID
            return file.id;
        };

        const displayName = getDisplayName();
        
        return (
            <div key={file.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        <span className="font-medium" title={displayName}>
                            {formatFileName(displayName)}
                        </span>
                    </div>
                    <span className="text-xs text-gray-400" title={file.id}>
                        ID: {file.id.slice(0, 8)}...
                    </span>
                </div>
                <div className="text-xs text-gray-400 ml-5">
                    Criado em {format(new Date(file.created_at * 1000), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
            </div>
        );
    };

    const renderKnowledgeBase = (kb: KnowledgeBase) => (
        <div key={kb.id} className="p-4 bg-white rounded-lg border border-gray-200 space-y-3">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-medium">{kb.name}</h3>
                    <p className="text-sm text-gray-500">{kb.description}</p>
                </div>
                <div className="flex gap-2">
                    <Link
                        to={`/knowledge-bases/${kb.id}/edit`}
                        className="p-1 text-gray-400 hover:text-blue-500"
                        title="Editar"
                    >
                        <Edit className="h-4 w-4" />
                    </Link>
                    <button
                        onClick={() => handleDelete(kb.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="Excluir"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {kb.vectorStoreId && (
                <div className="mt-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="text-gray-500">ID da Vector Store:</div>
                        <div className="font-mono truncate" title={kb.vectorStoreId}>
                            {formatId(kb.vectorStoreId)}
                        </div>
                    </div>
                </div>
            )}

            <div className="text-sm text-gray-500">
                <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {kb.updatedAt 
                        ? `Atualizado em ${formatDate(kb.updatedAt)}`
                        : `Criado em ${formatDate(kb.createdAt)}`
                    }
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="border-b pb-4">
                <h2 className="text-lg font-medium">Bases de Conhecimento</h2>
            </div>

            <div className="flex justify-between items-center">
                <div className="flex space-x-4">
                    <button
                        onClick={() => setActiveTab('bases')}
                        className={`flex items-center px-4 py-2 rounded-lg ${
                            activeTab === 'bases'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        <Book className="w-5 h-5 mr-2" />
                        Bases de Conhecimento
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`flex items-center px-4 py-2 rounded-lg ${
                            activeTab === 'files'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        <Files className="w-5 h-5 mr-2" />
                        Arquivos OpenAI
                    </button>
                </div>
                {activeTab === 'bases' && (
                    <Link
                        to="/knowledge-bases/new"
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Nova Base
                    </Link>
                )}
            </div>

            {error && (
                <div className="p-3 text-red-600 bg-red-50 rounded-md">
                    {error}
                </div>
            )}

            {activeTab === 'files' && userRole === 'SUPERUSER' ? (
                <OpenAIFiles />
            ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {isLoading ? (
                        <div className="col-span-full text-center py-12 text-gray-500">
                            Carregando...
                        </div>
                    ) : knowledgeBases.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-gray-500">
                            Nenhuma base de conhecimento encontrada
                        </div>
                    ) : (
                        knowledgeBases.map(renderKnowledgeBase)
                    )}
                </div>
            )}
        </div>
    );
}