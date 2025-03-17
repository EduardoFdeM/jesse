import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import api, { clearControllers } from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { Assistant } from '../../types';
import { LanguageSelector } from '../translation/LanguageSelector';

interface FileUploadProps {
  sourceLanguage: string;
  targetLanguage: string;
  onFileSelect: (files: File[]) => Promise<void>;
  assistants: Assistant[];
  onReset: () => void;
  selectedAssistant?: string | undefined;
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
  assistants,
  onReset,
  selectedAssistant,
  onAssistantSelect
}) => {
  const [useAssistant, setUseAssistant] = useState(false);
  const [useOCR, setUseOCR] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isTextMode, setIsTextMode] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [textTitle, setTextTitle] = useState('');

  // Refs para controle de upload
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Verificar se o arquivo é diferente de TXT para mostrar opção de OCR
  const isOCRAvailable = selectedFile && 
    selectedFile.type !== 'text/plain' && 
    !selectedFile.name.toLowerCase().endsWith('.txt');

  // Limpar recursos ao desmontar
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      clearControllers();
    };
  }, []);

  // Reset OCR quando o arquivo é alterado
  useEffect(() => {
    if (!isOCRAvailable) {
      setUseOCR(false);
    }
  }, [isOCRAvailable]);

  const handleSubmit = async () => {
    if (isTextMode) {
      if (!textContent.trim() || !textTitle.trim()) {
        toast.error('Digite um título e o texto para traduzir');
        return;
      }

      if (isLoading) return;

      try {
        setIsLoading(true);
        setUploadStatus('Preparando texto...');
        
        // Criar um arquivo de texto a partir do conteúdo
        const blob = new Blob([textContent], { type: 'text/plain' });
        const file = new File([blob], `${textTitle}.txt`, { type: 'text/plain' });
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sourceLanguage', sourceLanguage);
        formData.append('targetLanguage', targetLanguage);
        formData.append('originalname', `${textTitle}.txt`);
        formData.append('useCustomAssistant', useAssistant.toString());
        formData.append('useOCR', 'false');
        
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

        toast.success('Texto enviado com sucesso!');
        setTextContent('');
        setTextTitle('');
        onReset();
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            toast.error('Envio cancelado');
          } else if ('response' in error && error.response?.data?.message) {
            toast.error(error.response.data.message);
          } else {
            toast.error(error.message);
          }
        } else {
          toast.error('Erro desconhecido ao enviar o texto');
        }
      } finally {
        setIsLoading(false);
        setUploadProgress(0);
        setUploadStatus('');
        abortControllerRef.current = null;
      }
    } else {
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
        formData.append('useCustomAssistant', useAssistant.toString());
        formData.append('useOCR', useOCR.toString());
        
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
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
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

  return (
    <div className="space-y-4">
      {/* Toggle entre arquivo e texto */}
      <div className="flex justify-center space-x-4 mb-4">
        <button
          onClick={() => setIsTextMode(false)}
          className={`px-4 py-2 rounded-lg transition-all duration-300 ${
            !isTextMode 
              ? 'bg-blue-600 text-white shadow-lg transform scale-105'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Upload de Arquivo
        </button>
        <button
          onClick={() => setIsTextMode(true)}
          className={`px-4 py-2 rounded-lg transition-all duration-300 ${
            isTextMode 
              ? 'bg-blue-600 text-white shadow-lg transform scale-105'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Texto Direto
        </button>
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
                {assistant.name} {assistant.model && `(${assistant.model})`}
                {assistant.knowledgeBase && ` 📚 ${assistant.knowledgeBase.name}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {isTextMode ? (
        // Interface de entrada de texto
        <div className="space-y-4 transition-all duration-300">
          <div>
            <label htmlFor="textTitle" className="block text-sm font-medium text-gray-700 mb-1">
              Título do Documento
            </label>
            <input
              id="textTitle"
              type="text"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Digite um título para o documento..."
              className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="textContent" className="block text-sm font-medium text-gray-700 mb-1">
              Texto para Tradução
            </label>
            <textarea
              id="textContent"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Digite ou cole o texto que deseja traduzir..."
              rows={10}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Seção de OCR (só aparece para arquivos não-TXT) */}
          {isOCRAvailable && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="useOCR"
                  checked={useOCR}
                  onChange={(e) => setUseOCR(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="useOCR" className="text-sm text-gray-700">
                  Usar OCR avançado para estruturas complexas (tabelas, colunas, imagens)
                </label>
              </div>
              {useOCR && (
                <p className="text-xs text-gray-500 italic">
                  Esta opção usa IA para detectar e extrair texto de estruturas complexas como tabelas, múltiplas colunas e imagens.
                </p>
              )}
            </div>
          )}

          {/* Área de Upload */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300
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
        </>
      )}

      <div className="flex justify-end">
        {((isTextMode && textContent && textTitle) || (!isTextMode && selectedFile)) && !isLoading && !processingRef.current && (
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            disabled={!sourceLanguage || !targetLanguage}
          >
            Iniciar Tradução
          </button>
        )}
      </div>

      {selectedFile && !isLoading && !processingRef.current && !isTextMode && (
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
