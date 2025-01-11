import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

interface GlossaryFileUploadProps {
  onContentLoaded: (content: string) => void;
  onError: (error: string) => void;
}

export function GlossaryFileUpload({ onContentLoaded, onError }: GlossaryFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        onContentLoaded(content);
      } catch (error) {
        onError('Erro ao processar arquivo');
        console.error('Erro ao processar arquivo:', error);
      }
    };
    reader.onerror = () => {
      onError('Erro ao ler arquivo');
    };
    reader.readAsText(file);
  };

  return (
    <div
      className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-500'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept=".txt,.csv,.xlsx,.xls"
      />
      <Upload className="mx-auto h-12 w-12 text-gray-400" />
      <p className="mt-2 text-sm text-gray-600">
        Arraste e solte um arquivo aqui, ou clique para selecionar
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Suporta arquivos TXT, CSV, XLSX, XLS
      </p>
    </div>
  );
}
