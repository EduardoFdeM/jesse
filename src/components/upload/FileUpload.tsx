import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import api, { clearControllers } from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { KnowledgeBase } from '../../types';

interface FileUploadProps {
  sourceLanguage: string;
  targetLanguage: string;
  onFileSelect: (files: File[]) => Promise<void>;
  knowledgeBases: KnowledgeBase[];
}

interface UploadQueueItem {
  file: File;
  id: string;
  timestamp: number;
  retries: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
// const DEBOUNCE_DELAY = 1000;
export const FileUpload: React.FC<FileUploadProps> = ({ sourceLanguage, targetLanguage, onFileSelect, knowledgeBases }) => {
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Limpar recursos ao desmontar
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
      clearControllers();
    };
  }, []);

  // Processador de fila de upload
  const processQueue = useCallback(async () => {
    if (processingRef.current || uploadQueueRef.current.length === 0) return;

    processingRef.current = true;
    const item = uploadQueueRef.current[0];

    try {
        setIsLoading(true);
        const token = localStorage.getItem('jwtToken');
        
        if (!token) {
            toast.error('Sessão expirada. Por favor, faça login novamente.');
            return;
        }

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('sourceLanguage', sourceLanguage);
        formData.append('targetLanguage', targetLanguage);
        formData.append('originalname', item.file.name);

        await onFileSelect([item.file]);

        uploadQueueRef.current.shift();
    } catch (error) {
        if (error instanceof Error) {
            toast.error(error.message);
        } else {
            toast.error('Erro ao enviar arquivo');
        }
        uploadQueueRef.current.shift();
    } finally {
        setIsLoading(false);
        processingRef.current = false;
        
        if (uploadQueueRef.current.length > 0) {
            processQueue();
        }
    }
  }, [sourceLanguage, targetLanguage, onFileSelect]);

  // Efeito para monitorar a fila
  useEffect(() => {
    if (uploadQueueRef.current.length > 0 && !processingRef.current) {
      processQueue();
    }
  }, [processQueue]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setSelectedFile(acceptedFiles[0]);
      }
    },
    []
  );

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error('Selecione um arquivo primeiro');
      return;
    }

    if (!sourceLanguage || !targetLanguage) {
      toast.error('Selecione os idiomas de origem e destino');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('sourceLanguage', sourceLanguage);
    formData.append('targetLanguage', targetLanguage);
    formData.append('originalname', selectedFile.name);

    try {
        await onFileSelect([selectedFile]);
        setSelectedFile(null);
    } catch (error) {
        console.error('Erro no envio:', error);
        toast.error('Erro ao enviar arquivo');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
    disabled: isLoading || processingRef.current,
    multiple: false,
    onDropRejected: (rejectedFiles) => {
      console.log('Arquivos rejeitados:', rejectedFiles);
      toast.error('Arquivo não suportado. Use apenas PDF ou TXT.');
    },
    onDropAccepted: (files) => {
      console.log('Arquivos aceitos:', files.map(f => ({ name: f.name, size: f.size })));
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="useKnowledgeBase"
          checked={useKnowledgeBase}
          onChange={(e) => setUseKnowledgeBase(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
        />
        <label htmlFor="useKnowledgeBase" className="text-sm text-gray-700 dark:text-gray-300">
          Usar base de conhecimento para tradução
        </label>
      </div>

      {useKnowledgeBase && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Base de Conhecimento (opcional)
          </label>
          <select
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Nenhuma</option>
            {knowledgeBases.map(kb => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer 
          ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'} 
          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} disabled={isLoading || processingRef.current} />
        {isLoading ? (
          <p className="text-gray-500">Upload em andamento...</p>
        ) : isDragActive ? (
          <p className="text-blue-500">Solte o arquivo aqui...</p>
        ) : (
          <p className="text-gray-500">
            Arraste e solte um arquivo aqui, ou clique para selecionar
          </p>
        )}
      </div>

      <div className="flex justify-end">
        {selectedFile && !isLoading && !processingRef.current && (
            <button
                onClick={handleSubmit}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                disabled={!sourceLanguage || !targetLanguage}
            >
                Iniciar Tradução
            </button>
        )}
      </div>

      {selectedFile && !isLoading && !processingRef.current && (
          <div className="text-sm text-gray-600 mt-2">
              <span className="font-medium">Arquivo selecionado:</span> {selectedFile.name}
          </div>
      )}

      {isLoading && (
          <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Processando arquivo...</p>
          </div>
      )}
    </div>
  );
};
