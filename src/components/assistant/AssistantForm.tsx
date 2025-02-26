import { useState, useEffect } from 'react';
import { Save, ArrowLeft, Plus, X } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../axiosConfig';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

interface AssistantFormData {
    name: string;
    description: string;
    instructions: string;
    tags: string[];
    model: string;
    temperature: number;
    isPublic: boolean;
    canEdit: boolean;
}

export function AssistantForm() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [isLoading, setIsLoading] = useState(true);
    const [formData, setFormData] = useState<AssistantFormData>({
        name: '',
        description: '',
        instructions: '',
        tags: [],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        isPublic: false,
        canEdit: false
    });
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [newTag, setNewTag] = useState('');
    const [selectedEditableUsers, setSelectedEditableUsers] = useState<string[]>([]);
    const [showEditableUsersModal, setShowEditableUsersModal] = useState(false);
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);

    const loadAvailableUsers = async () => {
        try {
            const response = await api.get('/api/admin/users/available');
            setAvailableUsers(response.data.users);
        } catch (err) {
            console.error('Erro ao carregar usuários:', err);
            toast.error('Erro ao carregar lista de usuários');
        }
    };

    useEffect(() => {
        const loadAssistant = async () => {
            if (id) {
                try {
                    setIsLoading(true);
                    const response = await api.get(`/api/assistants/${id}`);
                    const data = response.data.data;
                    setFormData({
                        name: data.name,
                        description: data.description,
                        instructions: data.instructions,
                        tags: data.tags,
                        model: data.model,
                        temperature: data.temperature,
                        isPublic: data.isPublic,
                        canEdit: data.canEdit
                    });
                    if (data.editableBy) {
                        setSelectedEditableUsers(data.editableBy.map((user: any) => user.id));
                    }
                    setLastUpdate(data.updatedAt || data.createdAt);
                } catch (err) {
                    console.error('Erro ao carregar assistant:', err);
                    setError('Erro ao carregar assistant');
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        };

        loadAssistant();
    }, [id]);

    const validateAssistant = (instructions: string) => {
        if (instructions.length < 10) {
            throw new Error('As instruções devem ter pelo menos 10 caracteres');
        }
        
        const requiredVariables = ['{sourceLanguage}', '{targetLanguage}', '{text}'];
        const missingVariables = requiredVariables.filter(variable => 
            !instructions.includes(variable)
        );

        if (missingVariables.length > 0) {
            throw new Error(`As instruções devem conter as variáveis: ${missingVariables.join(', ')}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            validateAssistant(formData.instructions);
            const endpoint = id ? `/api/assistants/${id}` : '/api/assistants';
            const method = id ? 'put' : 'post';
            
            const dataToSend = {
                ...formData,
                editableBy: formData.canEdit ? selectedEditableUsers : []
            };
            
            const response = await api[method](endpoint, dataToSend);
            
            if (response.data.status === 'success') {
                toast.success(`Assistant ${id ? 'atualizado' : 'criado'} com sucesso`);
                navigate('/assistants');
            } else {
                throw new Error(response.data.message || 'Erro ao salvar assistant');
            }
        } catch (error: unknown) {
            console.error('Erro ao salvar assistant:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar assistant';
            setError(errorMessage);
            toast.error(errorMessage);
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
                        to="/assistants"
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Voltar"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h2 className="text-lg font-medium">
                        {id ? 'Editar Assistant' : 'Novo Assistant'}
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
                            Nome do Assistant <span className="text-red-500 font-bold">*</span>
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
                            Instruções do Assistant
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
                            value={formData.instructions}
                            onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                            rows={10}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-4"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Modelo
                        </label>
                        <select
                            value={formData.model}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    model: e.target.value
                                })
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="gpt-4o-mini">GPT-4o-Mini</option>
                            <option value="gpt-3.5-turbo">GPT-3.5-Turbo</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Temperatura
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={formData.temperature}
                            onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={formData.isPublic}
                                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">Tornar público</span>
                            </label>

                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={formData.canEdit}
                                    onChange={(e) => {
                                        setFormData({ ...formData, canEdit: e.target.checked });
                                        if (e.target.checked) {
                                            loadAvailableUsers();
                                            setShowEditableUsersModal(true);
                                        }
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">Permitir edição compartilhada</span>
                            </label>

                            {formData.canEdit && selectedEditableUsers.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-sm text-gray-600 mb-1">Usuários com permissão de edição:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedEditableUsers.map(userId => {
                                            const user = availableUsers.find(u => u.id === userId);
                                            return user ? (
                                                <span
                                                    key={user.id}
                                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                                                >
                                                    {user.name}
                                                </span>
                                            ) : null;
                                        })}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                loadAvailableUsers();
                                                setShowEditableUsersModal(true);
                                            }}
                                            className="text-sm text-blue-600 hover:text-blue-800"
                                        >
                                            Editar permissões
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
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
                            to="/assistants"
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

            {showEditableUsersModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
                        <h3 className="text-lg font-medium mb-4">Selecionar Usuários para Edição</h3>
                        <div className="space-y-4">
                            {availableUsers.map(user => (
                                <label key={user.id} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedEditableUsers.includes(user.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedEditableUsers([...selectedEditableUsers, user.id]);
                                            } else {
                                                setSelectedEditableUsers(
                                                    selectedEditableUsers.filter(id => id !== user.id)
                                                );
                                            }
                                        }}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="ml-2 text-sm">{user.name} ({user.email})</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => setShowEditableUsersModal(false)}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 