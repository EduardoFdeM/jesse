import { useState, useRef, useEffect } from 'react';
import { Save, Upload, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../axiosConfig';
import { LANGUAGES } from '../../constants/languages';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { VECTOR_STORE_EXTENSIONS_LIST } from '../../constants/filesTypes';

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

export function KnowledgeBaseForm({ initialData }: KnowledgeBaseFormProps) {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        description: initialData?.description || ''
    });
    const [files, setFiles] = useState<FileWithLanguages[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedExistingFiles, setSelectedExistingFiles] = useState<string[]>(initialData?.fileIds || []);
    const [existingFiles, setExistingFiles] = useState<OpenAIFile[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(true);

    const filterSupportedFiles = (files: OpenAIFile[]) => {
        return files.filter(file => {
            const extension = '.' + file.filename.split('.').pop()?.toLowerCase();
            return VECTOR_STORE_EXTENSIONS_LIST.includes(extension);
        });
    };

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
                    setSelectedExistingFiles(data.fileIds || []);
                } catch (err) {
                    console.error('Erro ao carregar base de conhecimento:', err);
                    setError('Erro ao carregar base de conhecimento');
                } finally {
                    setIsLoading(false);
                }
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
            setExistingFiles(filterSupportedFiles(response.data.data));
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

            // Validação de arquivos
            if (files.length === 0 && selectedExistingFiles.length === 0) {
                setError('É necessário enviar pelo menos um arquivo ou selecionar arquivos existentes');
                return;
            }

            // Validar limite total de arquivos
            if (files.length + selectedExistingFiles.length > 10) {
                setError('O limite máximo é de 10 arquivos por base de conhecimento');
                return;
            }

            const endpoint = id ? `/api/knowledge-bases/${id}` : '/api/knowledge-bases';
            const method = id ? 'put' : 'post';

            if (files.length > 0) {
                // Se tiver novos arquivos, usar FormData
                const formDataToSend = new FormData();
                formDataToSend.append('name', formData.name);
                formDataToSend.append('description', formData.description);
                
                // Adicionar cada ID de arquivo existente separadamente
                selectedExistingFiles.forEach(fileId => {
                    formDataToSend.append('existingFileIds[]', fileId);
                });
                
                files.forEach(fileWithLanguages => {
                    formDataToSend.append('files', fileWithLanguages.file);
                });

                await api[method](endpoint, formDataToSend, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });
            } else {
                // Se só tiver arquivos existentes, enviar como JSON
                await api[method](endpoint, {
                    name: formData.name,
                    description: formData.description,
                    existingFileIds: selectedExistingFiles
                });
            }

            toast.success(id ? 'Base de conhecimento atualizada com sucesso' : 'Base de conhecimento criada com sucesso');
            navigate('/knowledge-bases');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            console.error('Detalhes do erro:', error.response?.data);
            setError(error.response?.data?.message || 'Erro ao salvar base de conhecimento');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        
        // Validar extensões
        const invalidFiles = selectedFiles.filter(file => {
            const extension = '.' + file.name.split('.').pop()?.toLowerCase();
            return !VECTOR_STORE_EXTENSIONS_LIST.includes(extension);
        });

        if (invalidFiles.length > 0) {
            const invalidFileNames = invalidFiles.map(f => f.name).join(', ');
            setError(`Arquivos não suportados: ${invalidFileNames}. Extensões suportadas: ${VECTOR_STORE_EXTENSIONS_LIST.join(', ')}`);
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
                                    accept={VECTOR_STORE_EXTENSIONS_LIST.join(',')}
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