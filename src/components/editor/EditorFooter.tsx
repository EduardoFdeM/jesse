import { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Languages, ZoomIn, ZoomOut } from 'lucide-react';

interface EditorFooterProps {
  editor: Editor | null;
  sourceLanguage: string;
  targetLanguage: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function EditorFooter({ 
  editor, 
  sourceLanguage, 
  targetLanguage,
  zoom,
  onZoomChange 
}: EditorFooterProps) {
  const [stats, setStats] = useState({
    words: 0,
    characters: 0
  });

  // Função para ajustar zoom
  const handleZoom = (delta: number) => {
    const newZoom = Math.min(Math.max(zoom + delta, 50), 200);
    onZoomChange(newZoom);
  };

  useEffect(() => {
    const updateStats = () => {
      if (!editor) return;

      const content = editor.getText();
      const words = content.trim().split(/\s+/).filter(word => word.length > 0).length;
      const characters = content.length;
      
      setStats({ words, characters });
    };

    if (editor) {
      editor.on('update', updateStats);
      updateStats();
    }

    return () => {
      if (editor) {
        editor.off('update', updateStats);
      }
    };
  }, [editor]);

  // Função para formatar o código do idioma
  const formatLanguage = (lang: string) => {
    if (!lang) return '';
    return lang.toUpperCase();
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t text-sm text-gray-600">
      <div className="flex items-center gap-6">
        <span>Palavras: {stats.words}</span>
        <span>Caracteres: {stats.characters}</span>
      </div>
      
      <div className="flex items-center gap-6">
        {/* Controle de Zoom */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleZoom(-10)}
            className="p-1 hover:bg-gray-200 rounded"
            title="Diminuir zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span>{zoom}%</span>
          <button
            onClick={() => handleZoom(10)}
            className="p-1 hover:bg-gray-200 rounded"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Idiomas */}
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4" />
          <span>
            {sourceLanguage && targetLanguage 
              ? `${formatLanguage(sourceLanguage)} → ${formatLanguage(targetLanguage)}`
              : 'Idioma não definido'}
          </span>
        </div>
      </div>
    </div>
  );
} 