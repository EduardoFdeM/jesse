import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import { KnowledgeBase } from '../../types';
import { api } from '../../services/api';
import { Link } from 'react-router-dom';
import { LANGUAGES } from '../../constants/languages';

export function KnowledgeBaseList() {
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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

    const getLanguageName = (code: string) => {
        const language = LANGUAGES.find(lang => lang.code === code);
        return language ? language.name : code;
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium">Bases de Conhecimento</h2>
                <Link
                    to="/knowledge-bases/new"
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    <Plus className="h-4 w-4" />
                    Nova Base
                </Link>
            </div>

            {error && (
                <div className="p-3 text-red-600 bg-red-50 rounded-md">
                    {error}
                </div>
            )}

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

                            <div className="text-sm text-gray-500 space-y-1">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    {kb.fileName}
                                </div>
                                <div>
                                    Idiomas: {getLanguageName(kb.sourceLanguage)} → {getLanguageName(kb.targetLanguage)}
                                </div>
                                <div>
                                    Tamanho: {(kb.fileSize / 1024).toFixed(2)} KB
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}