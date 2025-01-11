import { useState } from 'react';
import { FileUpload } from './FileUpload';
import { LanguageSelector } from '../translation/LanguageSelector';
import api from '../../axiosConfig';



export function DocumentUploader() {
    const [sourceLanguage, setSourceLanguage] = useState('');
    const [targetLanguage, setTargetLanguage] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [translatedFilePath, setTranslatedFilePath] = useState<string | null>(null);
  
    const handleFileSelect = (selectedFiles: File[]) => {
      setFiles(selectedFiles);
    };
  
    const handleSubmit = async () => {
        if (!sourceLanguage || !targetLanguage) {
          alert('Por favor, selecione as linguagens de origem e destino.');
          return;
        }
    
        if (files.length === 0) {
          alert('Por favor, envie pelo menos um arquivo PDF.');
          return;
        }
    
        const formData = new FormData();
        formData.append('file', files[0]); // Considera apenas o primeiro arquivo
        formData.append('sourceLanguage', sourceLanguage);
        formData.append('targetLanguage', targetLanguage);
    
        try {
          const response = await api.post('/api/translations', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
    
          setUploadStatus('Upload realizado com sucesso!');
          setTranslatedFilePath(response.data.filePath); // Atualiza o estado com o caminho do arquivo traduzido
          console.log('Resposta do servidor:', response.data);
        } catch (error) {
          console.error('Erro no upload:', error);
          setUploadStatus('Erro ao realizar o upload.');
        }
      };
  
    return (
      <div className="p-4 border rounded shadow">
        <h2 className="text-lg font-bold mb-4">Upload Documents</h2>
        <div className="flex space-x-4 mb-4">
          <LanguageSelector
            value={sourceLanguage}
            onChange={setSourceLanguage}
            label="Source Language"
          />
          <LanguageSelector
            value={targetLanguage}
            onChange={setTargetLanguage}
            label="Target Language"
          />
        </div>
        <FileUpload 
          onFileSelect={handleFileSelect}
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
        />
        <button
          onClick={handleSubmit}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Enviar
        </button>
        {uploadStatus && <p>{uploadStatus}</p>}

        {uploadStatus === 'Upload realizado com sucesso!' && translatedFilePath && (
            <a href={`/api/translations/download/${translatedFilePath}`} download>
        <button className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700">
        Baixar PDF Traduzido
        </button>
        </a>
        )}
      </div>
    );
  }
