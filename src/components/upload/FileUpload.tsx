import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import api, { clearControllers } from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { KnowledgeBase } from '../../types';

interface FileUploadProps {
  sourceLanguage: string;
  targetLanguage: string;
  onFileSelect: (files: File[]) => Promise<void>;
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
export const FileUpload: React.FC<FileUploadProps> = ({ sourceLanguage, targetLanguage, onFileSelect }) => {
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState('pdf');

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

    try {
      await onFileSelect([selectedFile]);
      setSelectedFile(null); // Limpa o arquivo selecionado após envio
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

      <div className="flex space-x-4 items-center">
        <select
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value)}
          className="mt-1 block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="txt">TXT</option>
        </select>

        {selectedFile && (
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={!sourceLanguage || !targetLanguage}
          >
            Iniciar Tradução
          </button>
        )}
      </div>

      {selectedFile && (
        <div className="text-sm text-gray-600">
          Arquivo selecionado: {selectedFile.name}
        </div>
      )}
    </div>
  );
};
