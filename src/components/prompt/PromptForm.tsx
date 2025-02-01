import { useState, useEffect } from 'react';
import { Save, ArrowLeft, Tag, Plus, X } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { LANGUAGES } from '../../constants/languages';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

interface PromptFormProps {
    initialData?: {
        id?: string;
        name: string;
        description: string;
        content: string;
        updatedAt?: string;
        createdAt?: string;
        tags: string[];
        version: string;
    };
}

interface PromptFormData {
    name: string;
    description: string;
    content: string;
    tags: string[];
    version: string;
}

interface PromptVersion {
    id: string;
    version: string;
    content: string;
    description: string;
    createdAt: string;
    tags: string[];
}

export function PromptForm({ initialData }: PromptFormProps) {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [isLoading, setIsLoading] = useState(true);
    const [formData, setFormData] = useState<PromptFormData>({
        name: initialData?.name || '',
        description: initialData?.description || '',
        content: initialData?.content || '',
        tags: initialData?.tags || [],
        version: initialData?.version || '1.0.0'
    });
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [newTag, setNewTag] = useState('');
    const [versions, setVersions] = useState<PromptVersion[]>([]);
    const [showVersionHistory, setShowVersionHistory] = useState(false);

    useEffect(() => {
        const loadPrompt = async () => {
            if (id) {
                try {
                    setIsLoading(true);
                    const response = await api.get(`/api/prompts/${id}`);
                    const data = response.data.data;
                    setFormData({
                        name: data.name,
                        description: data.description,
                        content: data.content,
                        tags: data.tags,
                        version: data.version
                    });
                    setLastUpdate(data.updatedAt || data.createdAt);
                } catch (err) {
                    console.error('Erro ao carregar prompt:', err);
                    setError('Erro ao carregar prompt');
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        };

        loadPrompt();
    }, [id]);

    useEffect(() => {
        if (id) {
            loadVersions();
        }
    }, [id]);

    const loadVersions = async () => {
        try {
            const response = await api.get(`/api/prompts/${id}/versions`);
            setVersions(response.data.data);
        } catch (error) {
            console.error('Erro ao carregar versões:', error);
        }
    };

    const validatePrompt = (content: string) => {
        if (content.length < 10) {
            throw new Error('O prompt deve ter pelo menos 10 caracteres');
        }
        
        const requiredVariables = ['{sourceLanguage}', '{targetLanguage}', '{text}'];
        const missingVariables = requiredVariables.filter(variable => 
            !content.includes(variable)
        );

        if (missingVariables.length > 0) {
            throw new Error(`O prompt deve conter as variáveis: ${missingVariables.join(', ')}`);
        }
    };

    const validateVersion = (version: string) => {
        const semverRegex = /^\d+\.\d+\.\d+$/;
        if (!semverRegex.test(version)) {
            throw new Error('A versão deve seguir o padrão semântico (ex: 1.0.0)');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            validatePrompt(formData.content);
            validateVersion(formData.version);
            const endpoint = id ? `/api/prompts/${id}` : '/api/prompts';
            const method = id ? 'put' : 'post';
            
            console.log(`📤 Enviando requisição ${method.toUpperCase()} para ${endpoint}`, {
                formData,
                headers: api.defaults.headers
            });
            
            const response = await api[method](endpoint, {
                name: formData.name.trim(),
                description: formData.description.trim(),
                content: formData.content.trim(),
                tags: formData.tags,
                version: formData.version
            });
            
            console.log('✅ Resposta do servidor:', response.data);
            
            if (response.data.status === 'success') {
                navigate('/prompts');
            } else {
                throw new Error(response.data.message || 'Erro ao salvar prompt');
            }
        } catch (err: any) {
            console.error('❌ Erro detalhado ao salvar prompt:', {
                error: err,
                response: err.response?.data,
                status: err.response?.status
            });
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddTag = () => {
        if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
            setFormData({
                ...formData,
                tags: [...formData.tags, newTag.trim()]
            });
            setNewTag('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setFormData({
            ...formData,
            tags: formData.tags.filter(tag => tag !== tagToRemove)
        });
    };

    const handleCreateVersion = async () => {
        try {
            // Incrementa a versão minor
            const [major, minor] = formData.version.split('.');
            const newVersion = `${major}.${parseInt(minor) + 1}`;
            
            setFormData(prev => ({
                ...prev,
                version: newVersion
            }));

            // Salva a versão atual como histórico
            await api.post(`/api/prompts/${id}/versions`, {
                version: formData.version,
                content: formData.content,
                description: formData.description,
                tags: formData.tags
            });

            loadVersions();
            toast.success('Nova versão criada com sucesso');
        } catch (error) {
            console.error('Erro ao criar versão:', error);
            toast.error('Erro ao criar versão');
        }
    };

    const handleRestoreVersion = (version: PromptVersion) => {
        if (window.confirm('Deseja restaurar esta versão? As alterações não salvas serão perdidas.')) {
            setFormData({
                ...formData,
                content: version.content,
                description: version.description || '',
                tags: version.tags,
                version: version.version
            });
            toast.success('Versão restaurada com sucesso');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <span className="text-sm text-gray-600">Carregando...</span>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        to="/prompts"
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Voltar"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h2 className="text-lg font-medium">
                        {id ? 'Editar Prompt' : 'Novo Prompt'}
                    </h2>
                </div>
                {lastUpdate && (
                    <div className="text-sm text-gray-500">
                        <p>
                            Última atualização: {format(new Date(lastUpdate), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-3 text-red-600 bg-red-50 rounded-md">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nome do Prompt <span className="text-red-500 font-bold">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Descrição
                        </label>
                        <input
                            type="text"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Conteúdo do Prompt
                            <span className="text-xs text-gray-500 ml-2">
                                (Use {'{sourceLanguage}'}, {'{targetLanguage}'} e {'{text}'} como variáveis)
                            </span>
                        </label>
                        <div className="mt-1 text-xs text-gray-500">
                            Estas variáveis serão substituídas automaticamente durante a tradução:
                            <ul className="list-disc list-inside mt-1">
                                <li>{'{sourceLanguage}'} - Idioma de origem selecionado na tradução</li>
                                <li>{'{targetLanguage}'} - Idioma de destino selecionado na tradução</li>
                                <li>{'{text}'} - Texto a ser traduzido</li>
                            </ul>
                        </div>
                        <textarea
                            name="content"
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            rows={10}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-4"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Versão
                        </label>
                        <input
                            type="text"
                            value={formData.version}
                            onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            placeholder="1.0.0"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tags
                        </label>
                        <div className="flex gap-2 mb-2 flex-wrap">
                            {formData.tags.map(tag => (
                                <span 
                                    key={tag} 
                                    className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-blue-100 text-blue-700"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(tag)}
                                        className="ml-1 hover:text-blue-900"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                className="block flex-1 rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Adicionar tag..."
                            />
                            <button
                                type="button"
                                onClick={handleAddTag}
                                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center border-t pt-4">
                    <p className="text-sm text-gray-500">
                        <span className="text-red-500 font-bold">*</span> Campos obrigatórios
                    </p>
                    <div className="flex gap-3">
                        <Link
                            to="/prompts"
                            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                            Cancelar
                        </Link>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </form>

            {id && (
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={() => setShowVersionHistory(!showVersionHistory)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                    >
                        {showVersionHistory ? 'Ocultar histórico' : 'Ver histórico de versões'}
                    </button>

                    {showVersionHistory && (
                        <div className="mt-2 space-y-2">
                            {versions.map(version => (
                                <div
                                    key={version.id}
                                    className="p-3 border rounded-md hover:bg-gray-50"
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <span className="font-medium">v{version.version}</span>
                                            <span className="ml-2 text-xs text-gray-500">
                                                {format(new Date(version.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRestoreVersion(version)}
                                            className="text-xs text-blue-600 hover:text-blue-800"
                                        >
                                            Restaurar versão
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">{version.description}</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {version.tags.map(tag => (
                                            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleCreateVersion}
                        className="mt-2 px-4 py-2 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
                    >
                        Criar nova versão
                    </button>
                </div>
            )}
        </div>
    );
} 