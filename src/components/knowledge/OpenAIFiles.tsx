import { useState, useEffect } from 'react';
import { Upload, Trash2, AlertCircle, Files } from 'lucide-react';
import api from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OpenAIFile {
    id: string;
    filename: string;
    bytes: number;
    created_at: number;
    purpose: string;
    status: string;
}

export function OpenAIFiles() {
    const [files, setFiles] = useState<OpenAIFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    useEffect(() => {
        loadFiles();
    }, []);

    const loadFiles = async () => {
        try {
            setIsLoading(true);
            const response = await api.get('/api/files');
            setFiles(response.data.data);
            setError(null);
        } catch (error) {
            console.error('Erro ao carregar arquivos:', error);
            setError('Erro ao carregar arquivos');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setUploadingFile(true);
        const formData = new FormData();
        
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        try {
            await api.post('/api/files/upload', formData);
            toast.success('Arquivo(s) enviado(s) com sucesso');
            loadFiles();
        } catch (error) {
            console.error('Erro ao enviar arquivo:', error);
            toast.error('Erro ao enviar arquivo');
        } finally {
            setUploadingFile(false);
        }
    };

    const handleDelete = async (fileId: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este arquivo?')) {
            return;
        }

        try {
            await api.delete(`/api/files/${fileId}`);
            toast.success('Arquivo excluído com sucesso');
            setFiles(files.filter(f => f.id !== fileId));
        } catch (error) {
            console.error('Erro ao excluir arquivo:', error);
            toast.error('Erro ao excluir arquivo');
        }
    };

    const formatFileSize = (bytes: number) => {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Byte';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
        return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
    };

    const formatDate = (timestamp: number) => {
        return format(new Date(timestamp * 1000), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { 
            locale: ptBR 
        });
    };

    return (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {error && (
                <div className="p-3 text-red-600 bg-red-50 rounded-md flex items-center gap-2 m-4">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Files className="h-5 w-5 text-gray-500" />
                        <h3 className="text-lg font-medium">Arquivos OpenAI</h3>
                    </div>
                    <label className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
                        <Upload className="h-4 w-4" />
                        Enviar Arquivo(s)
                        <input
                            type="file"
                            className="hidden"
                            onChange={handleFileUpload}
                            multiple
                            accept=".txt,.pdf,.doc,.docx,.pptx,.md,.html,.js,.ts,.py,.java,.json,.c,.cpp,.cs,.css,.go,.php,.rb,.sh,.tex"
                            disabled={uploadingFile}
                        />
                    </label>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Nome
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tamanho
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Data de Criação
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-4">
                                    <div className="flex justify-center items-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                    </div>
                                </td>
                            </tr>
                        ) : files.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                                    Nenhum arquivo encontrado
                                </td>
                            </tr>
                        ) : (
                            files.map((file) => (
                                <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {file.filename}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatFileSize(file.bytes)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDate(file.created_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            file.status === 'processed' 
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {file.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleDelete(file.id)}
                                            className="text-red-600 hover:text-red-900 transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
} 