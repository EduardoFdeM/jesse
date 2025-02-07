import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DocumentEditor } from '../components/editor/DocumentEditor';
import api from '../axiosConfig';
import { toast } from 'react-toastify';

export function Editor() {
  const { id } = useParams<{ id: string }>();
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');

  useEffect(() => {
    loadDocument();
  }, [id]);

  const loadDocument = async () => {
    try {
      const [contentResponse, translationResponse] = await Promise.all([
        api.get(`/api/translations/${id}/content`),
        api.get(`/api/translations/${id}`)
      ]);

      // Converte o texto plano para HTML, preservando parágrafos
      const plainText: string = contentResponse.data.content;
      const formattedContent = plainText
        .split('\n\n')
        .map(paragraph => `<p>${paragraph}</p>`)
        .join('');
        
      setContent(formattedContent);
      setSourceLanguage(translationResponse.data.sourceLanguage);
      setTargetLanguage(translationResponse.data.targetLanguage);
    } catch (error) {
      console.error('Erro ao carregar documento:', error);
      toast.error('Erro ao carregar documento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (newContent: string) => {
    try {
      await api.put(`/api/translations/${id}/content`, { content: newContent });
      toast.success('Documento salvo com sucesso');
    } catch (error) {
      console.error('Erro ao salvar documento:', error);
      toast.error('Erro ao salvar documento');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50">
      <DocumentEditor
        translationId={id!}
        initialContent={content}
        onSave={handleSave}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
      />
    </div>
  );
} 