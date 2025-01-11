import { useState, useRef } from 'react';
import { Save, Upload, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

interface KnowledgeBaseFormProps {
    initialData?: {
        id?: string;
        name: string;
        description: string;
        sourceLanguage: string;
        targetLanguage: string;
    };
}

export function KnowledgeBaseForm({ initialData }: KnowledgeBaseFormProps) {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        description: initialData?.description || '',
        sourceLanguage: initialData?.sourceLanguage || '',
        targetLanguage: initialData?.targetLanguage || ''
    });
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('description', formData.description);
            data.append('sourceLanguage', formData.sourceLanguage);
            data.append('targetLanguage', formData.targetLanguage);

            if (file) {
                data.append('file', file);
            }

            if (initialData?.id) {
                await api.put(`/api/knowledge-bases/${initialData.id}`, data);
            } else {
                await api.post('/api/knowledge-bases', data);
            }

            navigate('/knowledge-bases');
        } catch (err) {
            console.error('Erro ao salvar base de conhecimento:', err);
            setError('Erro ao salvar base de conhecimento');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setError(null);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                        Nome
                    </label>
                    <input
                        type="text"
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        required
                    />
                </div>

                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                        Descrição
                    </label>
                    <textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="sourceLanguage" className="block text-sm font-medium text-gray-700">
                            Idioma de Origem
                        </label>
                        <select
                            id="sourceLanguage"
                            value={formData.sourceLanguage}
                            onChange={(e) => setFormData({ ...formData, sourceLanguage: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            required
                        >
                            <option value="">Selecione...</option>
                            <option value="pt">Português</option>
                            <option value="en">Inglês</option>
                            <option value="es">Espanhol</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-700">
                            Idioma de Destino
                        </label>
                        <select
                            id="targetLanguage"
                            value={formData.targetLanguage}
                            onChange={(e) => setFormData({ ...formData, targetLanguage: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            required
                        >
                            <option value="">Selecione...</option>
                            <option value="pt">Português</option>
                            <option value="en">Inglês</option>
                            <option value="es">Espanhol</option>
                        </select>
                    </div>
                </div>

                {!initialData?.id && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Arquivo
                        </label>
                        <div className="mt-1 flex items-center">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept=".txt,.csv,.xlsx,.xls"
                                required={!initialData?.id}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                Selecionar Arquivo
                            </button>
                            {file && (
                                <span className="ml-3 text-sm text-gray-500">
                                    {file.name}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                            Suporta arquivos TXT, CSV, XLSX, XLS
                        </p>
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 text-red-600 bg-red-50 rounded-md">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

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
    );
}