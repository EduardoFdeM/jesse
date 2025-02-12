import { useState, useRef, useEffect } from 'react';
import { Save, Upload, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../axiosConfig';
import { LANGUAGES } from '../../constants/languages';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

interface FileWithLanguages {
    file: File;
    sourceLanguage: string;
    targetLanguage: string;
}

interface OpenAIFile {
    id: string;
    filename: string;
    bytes: number;
    created_at: number;
    purpose: string;
    status: string;
}

interface KnowledgeBaseFormProps {
    initialData?: {
        id?: string;
        name: string;
        description: string;
        vectorStoreId?: string;
        fileIds?: string[];
        updatedAt?: string;
        createdAt?: string;
    };
}

// Adicionar aos tipos suportados
const SUPPORTED_EXTENSIONS = [
    '.txt', '.pdf', '.doc', '.docx', '.pptx',
    '.md', '.html', '.js', '.ts', '.py',
    '.java', '.json', '.c', '.cpp', '.cs',
    '.css', '.go', '.php', '.rb', '.sh',
    '.tex'
];

export function KnowledgeBaseForm({ initialData }: KnowledgeBaseFormProps) {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [isLoading, setIsLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        description: initialData?.description || ''
    });
    const [files, setFiles] = useState<FileWithLanguages[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastFile, setLastFile] = useState<string>('');
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [existingFiles, setExistingFiles] = useState<OpenAIFile[]>([]);
    const [selectedExistingFiles, setSelectedExistingFiles] = useState<string[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(true);

    useEffect(() => {
        const loadKnowledgeBase = async () => {
            if (id) {
                try {
                    setIsLoading(true);
                    const response = await api.get(`/api/knowledge-bases/${id}`);
                    const data = response.data.data;
                    setFormData({
                        name: data.name,
                        description: data.description,
                    });
                    setLastFile(data.fileName || '');
                    setLastUpdate(data.updatedAt || data.createdAt);
                } catch (err) {
                    console.error('Erro ao carregar base de conhecimento:', err);
                    setError('Erro ao carregar base de conhecimento');
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        };

        loadKnowledgeBase();
    }, [id]);

    useEffect(() => {
        loadExistingFiles();
    }, []);

    const loadExistingFiles = async () => {
        try {
            setIsLoadingFiles(true);
            const response = await api.get('/api/files');
            setExistingFiles(response.data.data);
        } catch (error) {
            toast.error('Erro ao carregar arquivos existentes');
            console.error(error);
        } finally {
            setIsLoadingFiles(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            if (!formData.name.trim()) {
                setError('O nome é obrigatório');
                return;
            }

            if (!id && files.length === 0 && selectedExistingFiles.length === 0) {
                setError('Selecione pelo menos um arquivo');
                return;
            }

            const data = new FormData();
            data.append('name', formData.name);
            data.append('description', formData.description);

            // Adicionar novos arquivos
            files.forEach(fileWithLanguages => {
                data.append('files', fileWithLanguages.file);
            });

            // Adicionar IDs dos arquivos existentes
            if (selectedExistingFiles.length > 0) {
                data.append('existingFileIds', JSON.stringify(selectedExistingFiles));
            }

            if (id) {
                await api.put(`/api/knowledge-bases/${id}`, data);
                toast.success('Base de conhecimento atualizada com sucesso');
            } else {
                await api.post('/api/knowledge-bases', data);
                toast.success('Base de conhecimento criada com sucesso');
            }

            navigate('/knowledge-bases');
        } catch (err: unknown) {
            console.error('Erro ao salvar base de conhecimento:', err);
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Erro ao salvar base de conhecimento');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        
        // Validar extensões
        const invalidFiles = selectedFiles.filter(file => {
            const extension = '.' + file.name.split('.').pop()?.toLowerCase();
            return !SUPPORTED_EXTENSIONS.includes(extension);
        });

        if (invalidFiles.length > 0) {
            const invalidFileNames = invalidFiles.map(f => f.name).join(', ');
            setError(`Arquivos não suportados: ${invalidFileNames}. Extensões suportadas: ${SUPPORTED_EXTENSIONS.join(', ')}`);
            return;
        }

        if (selectedFiles.length > 0) {
            setFiles(selectedFiles.map(file => ({
                file,
                sourceLanguage: '',
                targetLanguage: ''
            })));
            setError(null);
        }
    };

    const updateFileLanguages = (index: number, field: 'sourceLanguage' | 'targetLanguage', value: string) => {
        setFiles(prev => prev.map((file, i) => 
            i === index ? { ...file, [field]: value } : file
        ));
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <span className="text-sm text-gray-600">Carregando...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        to="/knowledge-bases"
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Voltar"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h2 className="text-lg font-medium">
                        {id ? 'Editar Base de Conhecimento' : 'Nova Base de Conhecimento'}
                    </h2>
                </div>
                {lastFile && (
                    <div className="text-sm text-gray-500">
                        <p>Último arquivo: {lastFile}</p>
                        <p>
                            {lastUpdate
                                ? `Última atualização: ${format(new Date(lastUpdate), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`
                                : 'Sem atualizações'}
                        </p>
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="p-3 text-red-600 bg-red-50 rounded-md flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                            Nome <span className="text-red-500 font-bold">*</span>
                        </label>
                        <input
                            type="text"
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                            Descrição <span className="text-red-500 font-bold">*</span>
                        </label>
                        <textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Arquivos {!id && <span className="text-red-500 font-bold">*</span>}
                        </label>
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-700 mb-2">Enviar Novos Arquivos</h3>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    className="hidden"
                                    accept=".txt,.pdf,.doc,.docx,.pptx,.md,.html,.js,.ts,.py,.java,.json"
                                    multiple
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    Selecionar Arquivos
                                </button>

                                {files.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        {files.map((file, index) => (
                                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                                                <span className="text-sm text-gray-600">{file.file.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFile(index)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3 className="text-sm font-medium text-gray-700 mb-2">Selecionar Arquivos Existentes</h3>
                                {isLoadingFiles ? (
                                    <div className="text-sm text-gray-500">Carregando arquivos...</div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto border rounded-md">
                                        {existingFiles.map((file) => (
                                            <label
                                                key={file.id}
                                                className="flex items-center p-2 hover:bg-gray-50 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedExistingFiles.includes(file.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedExistingFiles([...selectedExistingFiles, file.id]);
                                                        } else {
                                                            setSelectedExistingFiles(
                                                                selectedExistingFiles.filter(id => id !== file.id)
                                                            );
                                                        }
                                                    }}
                                                    className="h-4 w-4 text-blue-600 rounded border-gray-300"
                                                />
                                                <div className="ml-3">
                                                    <span className="text-sm font-medium text-gray-700">
                                                        {file.filename}
                                                    </span>
                                                    <span className="ml-2 text-xs text-gray-500">
                                                        ({new Date(file.created_at * 1000).toLocaleDateString()})
                                                    </span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center border-t pt-4">
                    <p className="text-sm text-gray-500">
                        <span className="text-red-500 font-bold">*</span> Campos obrigatórios
                    </p>
                    <div className="flex gap-3">
                        <Link
                            to="/knowledge-bases"
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
        </div>
    );
}