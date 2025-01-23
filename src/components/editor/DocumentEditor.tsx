import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import TextStyle from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CharacterCount from '@tiptap/extension-character-count';
import { 
  Save, Undo, Redo, Bold, Italic, Underline as UnderlineIcon, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table as TableIcon, Minus, Type, 
  Eraser, Rows, Trash2, Columns,
  Highlighter, Palette, Maximize, Minimize,
  ChevronDown
} from 'lucide-react';
import { useState } from 'react';

interface DocumentEditorProps {
  translationId: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
}

export function DocumentEditor({ translationId, initialContent, onSave }: DocumentEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [fontSize, setFontSize] = useState('16px');
  const [showTableOptions, setShowTableOptions] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [pageMargins, setPageMargins] = useState({
    top: '20mm',
    right: '20mm',
    bottom: '20mm',
    left: '20mm'
  });
  const [showMarginSettings, setShowMarginSettings] = useState(false);

  const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
  const symbols = ['©', '®', '™', '€', '£', '¥', '§', '¶', '†', '‡', '•', '·', '‰', '°', '±', '≠', '≈', '∞', '≤', '≥'];

  const editor = useEditor({
    extensions: [
      StarterKit,
      Document,
      Paragraph,
      Text,
      TextStyle,
      Underline,
      Highlight.configure({ multicolor: true }),
      Color,
      TextAlign.configure({
        types: ['paragraph', 'heading'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-fixed w-full',
        },
      }),
      TableRow,
      TableCell,
      TableHeader,
      CharacterCount
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[500px]',
        style: `font-size: ${fontSize}`,
      },
    },
  });

  // Cores disponíveis em grupos
  const textColors = {
    'Cores do tema': ['#000000', '#666666', '#0000FF', '#009688'],
    'Cores personalizadas': ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'],
  };

  const highlightColors = {
    'Cores de destaque': ['#FFFF00', '#00FF00', '#FF69B4', '#87CEEB', '#DDA0DD'],
    'Cores personalizadas': ['#FFE0B2', '#F5F5F5', '#E1F5FE', '#E8F5E9', '#FFF3E0'],
  };

  const handleSave = async () => {
    if (!editor) return;
    setIsSaving(true);
    try {
      await onSave(editor.getHTML());
    } finally {
      setIsSaving(false);
    }
  };

  const handleColorPickerClick = () => {
    setShowColorPicker(!showColorPicker);
    if (showHighlightPicker) setShowHighlightPicker(false);
  };

  const handleHighlightPickerClick = () => {
    setShowHighlightPicker(!showHighlightPicker);
    if (showColorPicker) setShowColorPicker(false);
  };

  const updateMargins = (margin: keyof typeof pageMargins, value: string) => {
    setPageMargins(prev => ({
      ...prev,
      [margin]: value
    }));
  };

  // Funções para tabela
  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3 }).run();
    setShowTableOptions(false);
  };

  const addColumnBefore = () => {
    editor?.chain().focus().addColumnBefore().run();
  };

  const addColumnAfter = () => {
    editor?.chain().focus().addColumnAfter().run();
  };

  const deleteColumn = () => {
    editor?.chain().focus().deleteColumn().run();
  };

  const addRowBefore = () => {
    editor?.chain().focus().addRowBefore().run();
  };

  const addRowAfter = () => {
    editor?.chain().focus().addRowAfter().run();
  };

  const deleteRow = () => {
    editor?.chain().focus().deleteRow().run();
  };

  const deleteTable = () => {
    editor?.chain().focus().deleteTable().run();
    setShowTableOptions(false);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Barra de ferramentas principal */}
      <div className="border-b border-gray-200 p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Desfazer/Refazer */}
            <div className="flex items-center gap-1">
              <ToolbarButton
                icon={<Undo className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().undo().run()}
                disabled={!editor?.can().undo()}
                tooltip="Desfazer"
              />
              <ToolbarButton
                icon={<Redo className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().redo().run()}
                disabled={!editor?.can().redo()}
                tooltip="Refazer"
              />
            </div>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Fonte e Tamanho */}
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              className="px-2 py-1 border rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {fontSizes.map(size => (
                <option key={size} value={size}>{parseInt(size)}pt</option>
              ))}
            </select>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Formatação de texto */}
            <div className="flex items-center gap-1">
              <ToolbarButton
                icon={<Bold className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().toggleBold().run()}
                isActive={editor?.isActive('bold')}
                tooltip="Negrito"
              />
              <ToolbarButton
                icon={<Italic className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                isActive={editor?.isActive('italic')}
                tooltip="Itálico"
              />
              <ToolbarButton
                icon={<UnderlineIcon className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                isActive={editor?.isActive('underline')}
                tooltip="Sublinhado"
              />
            </div>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Cores - Layout melhorado */}
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={handleColorPickerClick}
                  className="flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                  title="Cor do texto"
                >
                  <Palette className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white shadow-lg rounded-md border border-gray-200 z-20 min-w-[180px]">
                    {Object.entries(textColors).map(([group, colors]) => (
                      <div key={group} className="p-2">
                        <div className="text-xs text-gray-500 mb-1">{group}</div>
                        <div className="grid grid-cols-4 gap-1">
                          {colors.map((color) => (
                            <button
                              key={color}
                              className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center hover:border-gray-400"
                              style={{ backgroundColor: color }}
                              onClick={() => {
                                editor?.chain().focus().setColor(color).run();
                                setShowColorPicker(false);
                              }}
                            >
                              {editor?.isActive('textStyle', { color }) && (
                                <div className="w-2 h-2 bg-white rounded-full shadow-sm" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={handleHighlightPickerClick}
                  className="flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                  title="Realce"
                >
                  <Highlighter className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showHighlightPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white shadow-lg rounded-md border border-gray-200 z-20 min-w-[180px]">
                    {Object.entries(highlightColors).map(([group, colors]) => (
                      <div key={group} className="p-2">
                        <div className="text-xs text-gray-500 mb-1">{group}</div>
                        <div className="grid grid-cols-4 gap-1">
                          {colors.map((color) => (
                            <button
                              key={color}
                              className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center hover:border-gray-400"
                              style={{ backgroundColor: color }}
                              onClick={() => {
                                editor?.chain().focus().toggleHighlight({ color }).run();
                                setShowHighlightPicker(false);
                              }}
                            >
                              {editor?.isActive('highlight', { color }) && (
                                <div className="w-2 h-2 bg-white rounded-full shadow-sm" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Alinhamento */}
            <div className="flex items-center gap-1">
              <ToolbarButton
                icon={<AlignLeft className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                isActive={editor?.isActive({ textAlign: 'left' })}
                tooltip="Alinhar à esquerda"
              />
              <ToolbarButton
                icon={<AlignCenter className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                isActive={editor?.isActive({ textAlign: 'center' })}
                tooltip="Centralizar"
              />
              <ToolbarButton
                icon={<AlignRight className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                isActive={editor?.isActive({ textAlign: 'right' })}
                tooltip="Alinhar à direita"
              />
              <ToolbarButton
                icon={<AlignJustify className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
                isActive={editor?.isActive({ textAlign: 'justify' })}
                tooltip="Justificar"
              />
            </div>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Tabela */}
            <div className="relative">
              <ToolbarButton
                icon={<TableIcon className="w-4 h-4" />}
                onClick={() => setShowTableOptions(!showTableOptions)}
                tooltip="Inserir tabela"
              />
              {showTableOptions && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white shadow-lg rounded-md border border-gray-200 py-1 z-20">
                  <button
                    onClick={insertTable}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <TableIcon className="w-4 h-4" /> Inserir tabela 3x3
                  </button>
                  <div className="border-t border-gray-200 my-1" />
                  <button
                    onClick={addColumnBefore}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Columns className="w-4 h-4" /> Inserir coluna antes
                  </button>
                  <button
                    onClick={addColumnAfter}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Columns className="w-4 h-4" /> Inserir coluna depois
                  </button>
                  <button
                    onClick={deleteColumn}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir coluna
                  </button>
                  <div className="border-t border-gray-200 my-1" />
                  <button
                    onClick={addRowBefore}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Rows className="w-4 h-4" /> Inserir linha acima
                  </button>
                  <button
                    onClick={addRowAfter}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Rows className="w-4 h-4" /> Inserir linha abaixo
                  </button>
                  <button
                    onClick={deleteRow}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir linha
                  </button>
                  <div className="border-t border-gray-200 my-1" />
                  <button
                    onClick={deleteTable}
                    className="w-full text-left px-3 py-1 hover:bg-gray-100 text-red-600 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir tabela
                  </button>
                </div>
              )}
            </div>

            {/* Margens */}
            <div className="relative">
              <button
                onClick={() => setShowMarginSettings(!showMarginSettings)}
                className="px-3 py-1 border rounded hover:bg-gray-50 flex items-center gap-1"
              >
                Margens <ChevronDown className="w-4 h-4" />
              </button>
              {showMarginSettings && (
                <div className="absolute top-full left-0 mt-1 p-4 bg-white shadow-lg rounded-md border border-gray-200 z-20 w-64">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Superior:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={parseInt(pageMargins.top)}
                        onChange={(e) => updateMargins('top', `${e.target.value}mm`)}
                        className="w-20 px-2 py-1 border rounded"
                      /> mm
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Inferior:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={parseInt(pageMargins.bottom)}
                        onChange={(e) => updateMargins('bottom', `${e.target.value}mm`)}
                        className="w-20 px-2 py-1 border rounded"
                      /> mm
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Esquerda:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={parseInt(pageMargins.left)}
                        onChange={(e) => updateMargins('left', `${e.target.value}mm`)}
                        className="w-20 px-2 py-1 border rounded"
                      /> mm
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Direita:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={parseInt(pageMargins.right)}
                        onChange={(e) => updateMargins('right', `${e.target.value}mm`)}
                        className="w-20 px-2 py-1 border rounded"
                      /> mm
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Botão Salvar à direita */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Área do editor com formato A4 */}
      <div className="flex-grow overflow-auto bg-gray-100 p-8">
        <div className="mx-auto bg-white shadow-lg" style={{
          width: '210mm',
          minHeight: '297mm',
          padding: `${pageMargins.top} ${pageMargins.right} ${pageMargins.bottom} ${pageMargins.left}`,
          boxSizing: 'border-box',
        }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Menu flutuante para formatação rápida */}
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
          <div className="flex items-center gap-1 bg-white shadow-lg rounded-md border border-gray-200 p-1">
            <ToolbarButton
              icon={<Bold className="w-4 h-4" />}
              isActive={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
            <ToolbarButton
              icon={<Italic className="w-4 h-4" />}
              isActive={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
            <ToolbarButton
              icon={<UnderlineIcon className="w-4 h-4" />}
              isActive={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            />
          </div>
        </BubbleMenu>
      )}
    </div>
  );
}

// Componente ToolbarButton melhorado com tooltip
function ToolbarButton({ icon, onClick, isActive = false, disabled = false, tooltip = '' }) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          p-1.5 rounded hover:bg-gray-100 
          ${isActive ? 'bg-gray-200' : ''} 
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {icon}
      </button>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {tooltip}
        </div>
      )}
    </div>
  );
}