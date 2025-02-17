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
    created_at: number;
    vector_store_id: string;
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
            setBaseFiles(prev => ({ ...prev, [baseId]: response.data.data }));
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

    const renderFileInfo = (file: VectorStoreFile) => {
        return (
            <div key={file.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        <span className="font-medium">{file.id}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                        Vector Store: {file.vector_store_id}
                    </span>
                </div>
                <div className="text-xs text-gray-400 ml-5">
                    Criado em {format(new Date(file.created_at * 1000), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
            </div>
        );
    };

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
            </div>

            {activeTab === 'bases' && (
                <div className="flex justify-end border-b pb-4">
                    <Link
                        to="/knowledge-bases/new"
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Nova Base
                    </Link>
                </div>
            )}

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
                        knowledgeBases.map((kb) => (
                            <div
                                key={kb.id}
                                className="p-4 bg-white rounded-lg border border-gray-200 space-y-3"
                            >
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
                                            <div className="font-mono">{kb.vectorStoreId}</div>
                                            <div className="text-gray-500">Total de Arquivos:</div>
                                            <div>{kb.fileIds?.length || 0}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="text-sm text-gray-500 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        {kb.updatedAt 
                                            ? `Atualizado em ${formatDate(kb.updatedAt)}`
                                            : `Criado em ${formatDate(kb.createdAt)}`
                                        }
                                    </div>

                                    <button
                                        onClick={() => toggleExpand(kb.id)}
                                        className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
                                    >
                                        <FileText className="h-4 w-4" />
                                        Ver arquivos
                                        {expandedBase === kb.id ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </button>

                                    {expandedBase === kb.id && (
                                        <div className="mt-2 pl-4 border-l-2 border-gray-200">
                                            {filesLoading[kb.id] ? (
                                                <div className="text-sm text-gray-500">
                                                    Carregando arquivos...
                                                </div>
                                            ) : baseFiles[kb.id]?.data.length > 0 ? (
                                                <div className="space-y-2">
                                                    {baseFiles[kb.id].data.map(renderFileInfo)}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-gray-500">
                                                    Nenhum arquivo encontrado
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}