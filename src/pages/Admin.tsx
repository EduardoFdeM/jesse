import { useState, useEffect } from 'react';
import { Users, Settings } from 'lucide-react';
import api from '../axiosConfig';
import { toast } from 'react-hot-toast';
import type { User, AssistantConfig } from '../types/index';

const defaultConfig: AssistantConfig = {
    assistantId: '',
    model: 'gpt-4-turbo-preview',
    temperature: 0.3
};

export function Admin() {
    const [activeTab, setActiveTab] = useState<'users' | 'assistant'>('users');
    const [users, setUsers] = useState<User[]>([]);
    const [assistantConfig, setAssistantConfig] = useState<AssistantConfig>(defaultConfig);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const loadData = async () => {
        try {
            if (activeTab === 'users') {
                const response = await api.get('/api/admin/users');
                setUsers(response.data.users);
            } else {
                const response = await api.get('/api/admin/assistant/config');
                setAssistantConfig(response.data.config);
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            toast.error('Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    };

    const handleRoleUpdate = async (userId: string, newRole: string) => {
        try {
            await api.put(`/api/admin/users/${userId}/role`, { role: newRole });
            toast.success('Cargo atualizado com sucesso');
            loadData();
        } catch (error) {
            console.error('Erro ao atualizar cargo:', error);
            toast.error('Erro ao atualizar cargo');
        }
    };

    const handleAssistantConfigUpdate = async (config: AssistantConfig) => {
        try {
            await api.put('/api/admin/assistant/config', config);
            toast.success('Configuração atualizada com sucesso');
            setAssistantConfig(config);
        } catch (error) {
            console.error('Erro ao atualizar configuração:', error);
            toast.error('Erro ao atualizar configuração');
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8">Painel Administrativo</h1>

            <div className="flex space-x-4 mb-6">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`flex items-center px-4 py-2 rounded-lg ${
                        activeTab === 'users'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                    <Users className="w-5 h-5 mr-2" />
                    Usuários
                </button>
                <button
                    onClick={() => setActiveTab('assistant')}
                    className={`flex items-center px-4 py-2 rounded-lg ${
                        activeTab === 'assistant'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                    <Settings className="w-5 h-5 mr-2" />
                    Configuração do Assistente
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : activeTab === 'users' ? (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Nome
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Email
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Cargo
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Estatísticas
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Ações
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">{user.email}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <select
                                            value={user.role}
                                            onChange={(e) => handleRoleUpdate(user.id, e.target.value)}
                                            className="text-sm rounded-md border-gray-300"
                                        >
                                            <option value="EDITOR">Editor</option>
                                            <option value="TRANSLATOR">Tradutor</option>
                                            <option value="SUPERUSER">Superusuário</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div>Traduções: {user._count.translations}</div>
                                        <div>Bases de Conhecimento: {user._count.knowledgeBases}</div>
                                        <div>Prompts: {user._count.prompts}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button
                                            onClick={() => {/* Implementar visualização detalhada */}}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            Ver detalhes
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4">Configuração do Assistente Padrão</h2>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleAssistantConfigUpdate(assistantConfig);
                        }}
                        className="space-y-4"
                    >
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                ID do Assistente
                            </label>
                            <input
                                type="text"
                                value={assistantConfig.assistantId}
                                onChange={(e) =>
                                    setAssistantConfig({
                                        ...assistantConfig,
                                        assistantId: e.target.value
                                    })
                                }
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Modelo
                            </label>
                            <select
                                value={assistantConfig.model}
                                onChange={(e) =>
                                    setAssistantConfig({
                                        ...assistantConfig,
                                        model: e.target.value
                                    })
                                }
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                                <option value="gpt-4">GPT-4</option>
                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Temperatura
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="2"
                                step="0.1"
                                value={assistantConfig.temperature}
                                onChange={(e) =>
                                    setAssistantConfig({
                                        ...assistantConfig,
                                        temperature: parseFloat(e.target.value)
                                    })
                                }
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <button
                                type="submit"
                                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                Salvar Configurações
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
} 