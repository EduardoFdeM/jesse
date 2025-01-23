import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Save, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { KnowledgeBase } from '../../types';

export function GlossaryEditor() {
    const { id } = useParams<{ id: string }>();
    const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
    const [content, setContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadKnowledgeBase();
    }, [id]);

    const loadKnowledgeBase = async () => {
        try {
            const response = await api.get(`/api/knowledge-bases/${id}`);
            setKnowledgeBase(response.data.data);
            
            // Carregar o conteúdo do arquivo
            const contentResponse = await api.get(`/api/knowledge-bases/${id}/content`);
            setContent(contentResponse.data.data);
            setError(null);
        } catch (err) {
            console.error('Erro ao carregar base de conhecimento:', err);
            setError('Erro ao carregar base de conhecimento');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            await api.put(`/api/knowledge-bases/${id}/content`, { content });
            setError(null);
        } catch (err) {
            console.error('Erro ao salvar conteúdo:', err);
            setError('Erro ao salvar conteúdo');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isRTL = (language: string) => ['ar', 'fa'].includes(language);

    if (!knowledgeBase) {
        return (
            <div className="flex items-center justify-center p-4">
                <span className="text-sm text-gray-600">Carregando...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium">Editar Base de Conhecimento</h2>
                <div className="text-sm text-gray-500">
                    {knowledgeBase.fileName}
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 text-red-600 bg-red-50 rounded-md">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="content" className="block text-sm font-medium text-gray-700">
                        Conteúdo
                    </label>
                    <textarea
                        id="content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={20}
                        dir={isRTL(knowledgeBase.sourceLanguage) ? 'rtl' : 'ltr'}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono"
                    />
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {isSubmitting ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </form>
        </div>
    );
}
