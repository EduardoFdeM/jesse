import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import api, { clearControllers } from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { KnowledgeBase } from '../../types';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  sourceLanguage: string;
  targetLanguage: string;
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

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, sourceLanguage, targetLanguage }) => {
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (processingRef.current || uploadQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    const item = uploadQueueRef.current[0];

    try {
      setIsLoading(true);

      // Cancelar requisição anterior se existir
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('sourceLanguage', sourceLanguage);
      formData.append('targetLanguage', targetLanguage);
      formData.set('originalname', item.file.name);
      
      if (useKnowledgeBase && selectedKnowledgeBase) {
        formData.append('knowledgeBaseId', selectedKnowledgeBase);
      }

      const response = await api.post('/api/translations', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
        },
        signal: abortControllerRef.current.signal,
        withCredentials: true
      });

      if (response.data) {
        toast.success('Arquivo enviado com sucesso! A tradução começará em breve.');
        // Remover item da fila após sucesso
        uploadQueueRef.current.shift();
      }
    } catch (error: any) {
      if (!axios.isCancel(error)) {
        console.error('Erro durante o upload:', error);
        
        if (error.response?.status === 401) {
          toast.error('Sessão expirada. Por favor, faça login novamente.');
          window.location.href = '/login';
          uploadQueueRef.current = []; // Limpar fila
        } else if (error.response?.status === 429) {
          // Se receber 429, aumentar o delay e tentar novamente
          if (item.retries < MAX_RETRIES) {
            item.retries++;
            uploadTimeoutRef.current = setTimeout(() => {
              processingRef.current = false;
              processQueue();
            }, RETRY_DELAY * item.retries);
            return;
          } else {
            toast.error('Muitas tentativas de upload. Tente novamente mais tarde.');
            uploadQueueRef.current.shift(); // Remover após máximo de tentativas
          }
        } else {
          const errorMessage = error.response?.data?.error || 'Erro ao enviar arquivo. Verifique a conexão ou formato do arquivo.';
          toast.error(errorMessage);
          uploadQueueRef.current.shift(); // Remover em caso de erro não recuperável
        }
      }
    } finally {
      setIsLoading(false);
      if (uploadQueueRef.current.length === 0) {
        processingRef.current = false;
      } else {
        // Delay antes de processar próximo item
        uploadTimeoutRef.current = setTimeout(() => {
          processingRef.current = false;
          processQueue();
        }, RETRY_DELAY);
      }
    }
  }, [sourceLanguage, targetLanguage, useKnowledgeBase, selectedKnowledgeBase, onFileSelect]);

  // Efeito para monitorar a fila
  useEffect(() => {
    if (uploadQueueRef.current.length > 0 && !processingRef.current) {
      processQueue();
    }
  }, [processQueue]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!sourceLanguage || !targetLanguage) {
        toast.error('Selecione os idiomas de origem e destino');
        return;
      }

      const token = localStorage.getItem('jwtToken');
      if (!token) {
        toast.error('Você precisa estar autenticado para fazer upload de arquivos');
        return;
      }

      const file = acceptedFiles[0];
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;
      const now = Date.now();

      // Verificar se arquivo já está na fila
      const isDuplicate = uploadQueueRef.current.some(
        item => item.id === fileId && now - item.timestamp < 5000
      );

      if (isDuplicate) {
        console.log('Upload duplicado detectado, ignorando');
        return;
      }

      // Adicionar à fila
      uploadQueueRef.current.push({
        file,
        id: fileId,
        timestamp: now,
        retries: 0
      });

      // Iniciar processamento se não estiver em andamento
      if (!processingRef.current) {
        processQueue();
      }
    },
    [sourceLanguage, targetLanguage, processQueue]
  );

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
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="useKnowledgeBase" className="text-sm text-gray-700">
          Usar base de conhecimento para tradução
        </label>
      </div>

      {useKnowledgeBase && (
        <div className="mb-4">
          <label htmlFor="knowledgeBase" className="block text-sm font-medium text-gray-700 mb-1">
            Selecione a base de conhecimento
          </label>
          <select
            id="knowledgeBase"
            value={selectedKnowledgeBase}
            onChange={(e) => setSelectedKnowledgeBase(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Selecione uma base de conhecimento</option>
            {[].map((kb: KnowledgeBase) => (
              <option key={kb.id} value={kb.id}>
                {kb.name} ({kb.sourceLanguage} → {kb.targetLanguage})
              </option>
            ))}
          </select>
        </div>
      )}

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
    </div>
  );
};
