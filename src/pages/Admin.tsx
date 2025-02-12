import { useState, useEffect } from 'react';
import { Users, Settings } from 'lucide-react';
import api from '../axiosConfig';
import { toast } from 'react-hot-toast';
import type { User, AssistantConfig, UserStats } from '../types/index';

const defaultConfig: AssistantConfig = {
    id: '',
    name: '',
    model: 'gpt-4-turbo-preview',
    instructions: '',
    temperature: 0.3
};

interface UserDetails extends User {
    stats?: UserStats;
}

export function Admin() {
    const [activeTab, setActiveTab] = useState<'users' | 'assistant'>('users');
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
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

    const loadUserDetails = async (userId: string) => {
        try {
            const [userDetails, userStats] = await Promise.all([
                api.get(`/api/admin/users/${userId}`),
                api.get(`/api/admin/users/${userId}/stats`)
            ]);

            setSelectedUser({
                ...userDetails.data.user,
                stats: userStats.data
            });
        } catch (error) {
            console.error('Erro ao carregar detalhes do usuário:', error);
            toast.error('Erro ao carregar detalhes do usuário');
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
            await api.put('/api/admin/assistant/config', {
                model: config.model,
                instructions: config.instructions,
                temperature: config.temperature
            });
            toast.success('Configuração atualizada com sucesso');
            setAssistantConfig(config);
        } catch (error) {
            console.error('Erro ao atualizar configuração:', error);
            toast.error('Erro ao atualizar configuração');
        }
    };

    const handleDownload = async (translationId: string) => {
        try {
            const response = await api.get(`/api/translations/${translationId}/download`);
            if (response.data.url) {
                window.open(response.data.url, '_blank');
            }
        } catch (error) {
            console.error('Erro ao baixar arquivo:', error);
            toast.error('Erro ao baixar arquivo');
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8">Painel Administrativo</h1>

            <div className="flex space-x-4 mb-6">
                <button
                    onClick={() => {
                        setActiveTab('users');
                        setSelectedUser(null);
                    }}
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
                selectedUser ? (
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold">Detalhes do Usuário</h2>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="text-gray-600 hover:text-gray-900"
                            >
                                Voltar
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-lg font-medium mb-4">Informações Básicas</h3>
                                <div className="space-y-2">
                                    <p><span className="font-medium">Nome:</span> {selectedUser.name}</p>
                                    <p><span className="font-medium">Email:</span> {selectedUser.email}</p>
                                    <p><span className="font-medium">Cargo:</span> {selectedUser.role}</p>
                                    <p><span className="font-medium">Criado em:</span> {new Date(selectedUser.createdAt!).toLocaleDateString()}</p>
                                </div>
                            </div>
                            {selectedUser.stats && (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-lg font-medium mb-4">Estatísticas</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <p className="text-sm text-gray-500">Total de Traduções</p>
                                                <p className="text-2xl font-semibold">{selectedUser.stats.totalTranslations}</p>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <p className="text-sm text-gray-500">Taxa de Sucesso</p>
                                                <p className="text-2xl font-semibold">{selectedUser.stats.successRate}%</p>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <p className="text-sm text-gray-500">Custo Total</p>
                                                <p className="text-2xl font-semibold">${selectedUser.stats.totalCost.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <p className="text-sm text-gray-500">Tempo Médio</p>
                                                <p className="text-2xl font-semibold">{selectedUser.stats.averageTranslationTime}min</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium mb-4">Últimas Traduções</h3>
                                        <div className="bg-white shadow overflow-hidden rounded-md">
                                            <ul className="divide-y divide-gray-200">
                                                {selectedUser.stats.recentTranslations.map((translation) => (
                                                    <li key={translation.id} className="px-6 py-4">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">{translation.fileName}</p>
                                                                <p className="text-sm text-gray-500">
                                                                    {translation.sourceLanguage} → {translation.targetLanguage}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center space-x-4">
                                                                <div className="text-right">
                                                                    <p className="text-sm text-gray-900">{translation.status}</p>
                                                                    <p className="text-sm text-gray-500">
                                                                        {new Date(translation.createdAt).toLocaleDateString()}
                                                                    </p>
                                                                </div>
                                                                {translation.status === 'completed' && (
                                                                    <button
                                                                        onClick={() => handleDownload(translation.id)}
                                                                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-blue-600 hover:text-blue-900"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                        </svg>
                                                                        Download
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium mb-4">Assistants Personalizados</h3>
                                        <div className="bg-white shadow overflow-hidden rounded-md">
                                            <ul className="divide-y divide-gray-200">
                                                {selectedUser.stats.recentPrompts.map((assistant) => (
                                                    <li key={assistant.id} className="px-6 py-4">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">{assistant.name}</p>
                                                                <p className="text-sm text-gray-500">{assistant.description}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm text-gray-500">Modelo: {assistant.model}</p>
                                                                <p className="text-sm text-gray-500">Temperatura: {assistant.temperature}</p>
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium mb-4">Últimas Atividades</h3>
                                        <div className="bg-white shadow overflow-hidden rounded-md">
                                            <ul className="divide-y divide-gray-200">
                                                {selectedUser.stats.recentActivity.map((activity) => (
                                                    <li key={activity.id} className="px-6 py-4">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                                                                <p className="text-sm text-gray-500">
                                                                    {activity.details.fileName || activity.details.promptName || activity.details.knowledgeBaseName}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm text-gray-500">
                                                                    {new Date(activity.timestamp).toLocaleString()}
                                                                </p>
                                                                {activity.details.cost && (
                                                                    <p className="text-sm text-gray-900">
                                                                        ${activity.details.cost.toFixed(2)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium mb-4">Custos por Mês</h3>
                                        <div className="bg-white shadow overflow-hidden rounded-md p-4">
                                            <div className="space-y-2">
                                                {Object.entries(selectedUser.stats.costByMonth).map(([month, cost]) => (
                                                    <div key={month} className="flex justify-between">
                                                        <span className="text-sm text-gray-500">{month}</span>
                                                        <span className="text-sm font-medium">${cost.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
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
                                            <div>Traduções: {user._count?.translations || 0}</div>
                                            <div>Bases de Conhecimento: {user._count?.knowledgeBases || 0}</div>
                                            <div>Assistants: {user._count?.prompts || 0}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button
                                                onClick={() => loadUserDetails(user.id)}
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
                )
            ) : (
                <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4">Configuração do Assistente Padrão</h2>
                    <div className="mb-6">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700">ID do Assistente</label>
                            <input
                                type="text"
                                value={assistantConfig.id}
                                disabled
                                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700">Nome do Assistente</label>
                            <input
                                type="text"
                                value={assistantConfig.name}
                                disabled
                                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm"
                            />
                        </div>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleAssistantConfigUpdate(assistantConfig);
                        }}
                        className="space-y-4"
                    >
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
                                Instruções
                            </label>
                            <textarea
                                value={assistantConfig.instructions}
                                onChange={(e) =>
                                    setAssistantConfig({
                                        ...assistantConfig,
                                        instructions: e.target.value
                                    })
                                }
                                rows={5}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
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