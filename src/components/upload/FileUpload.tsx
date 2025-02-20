import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import api, { clearControllers } from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { KnowledgeBase, Assistant } from '../../types';
import { LanguageSelector } from '../translation/LanguageSelector';

interface FileUploadProps {
  sourceLanguage: string;
  targetLanguage: string;
  onFileSelect: (files: File[]) => Promise<void>;
  knowledgeBases: KnowledgeBase[];
  assistants: Assistant[];
  onReset: () => void;
  selectedKnowledgeBase?: string | undefined;
  selectedAssistant?: string | undefined;
  onKnowledgeBaseSelect?: (id: string) => void;
  onAssistantSelect?: (id: string | undefined) => void;
}

interface UploadQueueItem {
  file: File;
  id: string;
  timestamp: number;
  retries: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export const FileUpload: React.FC<FileUploadProps> = ({
  sourceLanguage,
  targetLanguage,
  onFileSelect,
  knowledgeBases,
  assistants,
  onReset,
  selectedKnowledgeBase,
  selectedAssistant,
  onKnowledgeBaseSelect,
  onAssistantSelect
}) => {
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);
  const [useAssistant, setUseAssistant] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // Refs para controle de upload
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Limpar recursos ao desmontar
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      clearControllers();
    };
  }, []);

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error('Selecione um arquivo primeiro');
      return;
    }

    if (isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      setUploadStatus('Preparando arquivo...');
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('sourceLanguage', sourceLanguage);
      formData.append('targetLanguage', targetLanguage);
      formData.append('originalname', selectedFile.name);
      formData.append('useKnowledgeBase', useKnowledgeBase.toString());
      formData.append('useCustomAssistant', useAssistant.toString());
      
      if (useKnowledgeBase && selectedKnowledgeBase) {
        formData.append('knowledgeBaseId', selectedKnowledgeBase);
      }
      if (useAssistant && selectedAssistant) {
        formData.append('assistantId', selectedAssistant);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await api.post('/api/translations', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        signal: controller.signal,
        timeout: 300000
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      toast.success('Arquivo enviado com sucesso!');
      setSelectedFile(null);
      onReset();
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          toast.error('Upload cancelado');
        } else if ('response' in error && error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Erro desconhecido ao fazer upload do arquivo');
      }
      console.error('Erro detalhado no upload:', error);
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      setUploadStatus('');
      abortControllerRef.current = null;
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
    disabled: isLoading || processingRef.current,
    multiple: false
  });

  // Efeito para limpar o assistant selecionado quando desmarcar o checkbox
  useEffect(() => {
    if (!useAssistant) {
      onAssistantSelect?.(undefined);
    }
  }, [useAssistant, onAssistantSelect]);

  // Efeito para limpar a base de conhecimento quando desmarcar o checkbox
  useEffect(() => {
    if (!useKnowledgeBase) {
      onKnowledgeBaseSelect?.('');
    }
  }, [useKnowledgeBase, onKnowledgeBaseSelect]);

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
            value={selectedKnowledgeBase || ''}
            onChange={(e) => onKnowledgeBaseSelect?.(e.target.value)}
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

      {/* Seção de Assistant */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="useCustomAssistant"
            checked={useAssistant}
            onChange={(e) => setUseAssistant(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="useCustomAssistant" className="text-sm text-gray-700">
            Usar assistant personalizado
          </label>
        </div>

        {useAssistant && (
          <select
            value={selectedAssistant || ''}
            onChange={(e) => onAssistantSelect?.(e.target.value || undefined)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Selecione um assistant</option>
            {assistants.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>
                {assistant.name}
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
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-2">{uploadStatus}</p>
        </div>
      )}
    </div>
  );
};
