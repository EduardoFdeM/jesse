import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import api, { clearControllers } from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { KnowledgeBase, Prompt } from '../../types';

interface FileUploadProps {
  sourceLanguage: string;
  targetLanguage: string;
  onFileSelect: (files: File[]) => Promise<void>;
  knowledgeBases: KnowledgeBase[];
  prompts: Prompt[];
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
export const FileUpload: React.FC<FileUploadProps> = ({ sourceLanguage, targetLanguage, onFileSelect, knowledgeBases = [], prompts = [] }) => {
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string>('');
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [availablePrompts, setAvailablePrompts] = useState<Prompt[]>([]);

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

  // Adicionar useEffect para carregar prompts
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const response = await api.get('/api/prompts');
        setAvailablePrompts(response.data.data);
      } catch (error) {
        console.error('Erro ao carregar prompts:', error);
        toast.error('Erro ao carregar prompts');
      }
    };

    if (useCustomPrompt) {
      loadPrompts();
    }
  }, [useCustomPrompt]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setSelectedFile(acceptedFiles[0]);
      }
    },
    []
  );

  // Função para validar seleção de prompt
  const validatePromptSelection = () => {
    if (useCustomPrompt && !selectedPrompt) {
      toast.error('Selecione um prompt personalizado');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error('Selecione um arquivo primeiro');
      return;
    }

    if (!validatePromptSelection()) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('sourceLanguage', sourceLanguage);
    formData.append('targetLanguage', targetLanguage);
    formData.append('originalname', selectedFile.name);
    
    if (useKnowledgeBase && selectedKnowledgeBase) {
      formData.append('knowledgeBaseId', selectedKnowledgeBase);
    }

    if (useCustomPrompt && selectedPrompt) {
      formData.append('promptId', selectedPrompt);
    }

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
      {/* Seção de Base de Conhecimento */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="useKnowledgeBase"
            checked={useKnowledgeBase}
            onChange={(e) => setUseKnowledgeBase(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="useKnowledgeBase" className="text-sm text-gray-700">
            Usar base de conhecimento para tradução
          </label>
        </div>

        {useKnowledgeBase && (
          <select
            value={selectedKnowledgeBase}
            onChange={(e) => setSelectedKnowledgeBase(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Selecione uma base</option>
            {knowledgeBases.map(kb => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Seção de Prompt */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="useCustomPrompt"
            checked={useCustomPrompt}
            onChange={(e) => setUseCustomPrompt(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="useCustomPrompt" className="text-sm text-gray-700">
            Usar prompt personalizado
          </label>
        </div>

        {useCustomPrompt && (
          <select
            value={selectedPrompt}
            onChange={(e) => setSelectedPrompt(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Selecione um prompt...</option>
            {availablePrompts.map((prompt) => (
              <option key={prompt.id} value={prompt.id}>
                {prompt.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Área de Upload */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer 
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'} 
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
