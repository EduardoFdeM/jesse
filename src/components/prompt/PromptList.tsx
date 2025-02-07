import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Prompt } from '../../types';
import api from '../../axiosConfig';
import { toast } from 'react-hot-toast';

export function PromptList() {
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [allTags, setAllTags] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        loadPrompts();
    }, [selectedTags]);

    // Carregar todas as tags únicas
    useEffect(() => {
        const uniqueTags = Array.from(new Set(prompts.flatMap(p => p.tags)));
        setAllTags(uniqueTags);
    }, [prompts]);

    const loadPrompts = async () => {
        try {
            setIsLoading(true);
            setError(null);
            console.log('🔄 Carregando prompts...');
            const response = await api.get('/api/prompts');
            console.log('📥 Resposta:', response.data);
            setPrompts(response.data.data);
        } catch (err) {
            console.error('❌ Erro ao carregar prompts:', err);
            setError('Não foi possível carregar os prompts. Tente novamente mais tarde.');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) 
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este prompt?')) return;

        try {
            await api.delete(`/api/prompts/${id}`);
            toast.success('Prompt excluído com sucesso');
            loadPrompts();
        } catch (error) {
            console.error('Erro ao excluir prompt:', error);
            toast.error('Erro ao excluir prompt');
        }
    };

    if (isLoading) {
        return <div className="flex justify-center p-8">Carregando...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium">Biblioteca de Prompts</h2>
                <Link
                    to="/prompts/new"
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Prompt
                </Link>
            </div>

            {/* Filtro de tags */}
            <div className="flex flex-wrap gap-2 mb-4">
                {allTags.map(tag => (
                    <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1 rounded-full text-sm ${
                            selectedTags.includes(tag)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {tag}
                    </button>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {prompts.map(prompt => (
                    <div
                        key={prompt.id}
                        className="border rounded-lg p-4 space-y-2 hover:shadow-md transition-shadow"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-medium">{prompt.name}</h3>
                                <span className="text-xs text-gray-500">v{prompt.version}</span>
                            </div>
                            <div className="flex space-x-2">
                                <Link
                                    to={`/prompts/${prompt.id}/edit`}
                                    className="p-1 hover:bg-gray-100 rounded"
                                >
                                    <Edit className="h-4 w-4 text-gray-600" />
                                </Link>
                                <button
                                    onClick={() => handleDelete(prompt.id)}
                                    className="p-1 hover:bg-gray-100 rounded"
                                >
                                    <Trash2 className="h-4 w-4 text-gray-600" />
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600">{prompt.description}</p>
                        
                        {/* Tags */}
                        {prompt.tags && prompt.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {prompt.tags.map(tag => (
                                    <span 
                                        key={tag}
                                        className="inline-block px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {prompts.length === 0 && (
                    <div className="col-span-full text-center py-8 text-gray-500">
                        Nenhum prompt encontrado
                    </div>
                )}
            </div>
        </div>
    );
}