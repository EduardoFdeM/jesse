import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
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
import FontSize from '../extensions/fontSize';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { Indent } from '../extensions/indent';
import { CustomHorizontalRule } from '../extensions/horizontalRule';
import { 
  Save, Undo, Redo, Bold, Italic, Underline as UnderlineIcon, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table as TableIcon, Type, List, ListOrdered,
  Rows, Trash2, Columns,
  Highlighter, Palette, Maximize,
  ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, MinusSquare,
  FileText
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EditorFooter } from './EditorFooter';

interface DocumentEditorProps {
  translationId: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  sourceLanguage: string;
  targetLanguage: string;
}

export function DocumentEditor({ 
  translationId, 
  initialContent, 
  onSave,
  sourceLanguage,
  targetLanguage 
}: DocumentEditorProps) {
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
  const navigate = useNavigate();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pages, setPages] = useState<HTMLElement[]>([]);

  const fontSizes = ['12', '14', '16', '18', '20', '24', '28', '32'];
  const symbols = [
    { group: 'Comum', chars: ['©', '®', '™', '°', '±', '×', '÷', '≠', '≈', '∞'] },
    { group: 'Moedas', chars: ['€', '£', '¥', '¢', '₹', '₽', '₿'] },
    { group: 'Matemáticos', chars: ['π', '∑', '√', '∫', '∏', '∆', '∂', 'ƒ'] },
    { group: 'Gregos', chars: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'σ', 'φ', 'ω'] }
  ];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
      }),
      Document.configure({
        pageBreak: true,
      }),
      Paragraph,
      Text,
      TextStyle,
      Indent.configure({
        types: ['paragraph', 'heading', 'listItem'],
        minLevel: 0,
        maxLevel: 8,
      }),
      CustomHorizontalRule,
      Underline,
      Highlight,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
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
      CharacterCount,
      FontSize,
      BulletList.configure({
        HTMLAttributes: {
          class: 'list-disc ml-4',
        },
      }),
      OrderedList.configure({
        HTMLAttributes: {
          class: 'list-decimal ml-4',
        },
      }),
      ListItem,
      Document.extend({
        addGlobalAttributes() {
          return [
            {
              types: ['textStyle'],
              attributes: {
                spellcheck: {
                  default: true,
                  parseHTML: element => element.getAttribute('spellcheck'),
                  renderHTML: attributes => {
                    return { spellcheck: attributes.spellcheck }
                  }
                },
                lang: {
                  default: targetLanguage,
                  parseHTML: element => element.getAttribute('lang'),
                  renderHTML: attributes => {
                    return { lang: attributes.lang }
                  }
                }
              }
            }
          ]
        }
      })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none h-full',
        spellcheck: 'true',
        lang: targetLanguage
      },
    },
    onUpdate: ({ editor }) => {
      setHasChanges(true);
      
      // Atualiza o conteúdo mantendo a formatação A4
      const content = editor.getHTML();
      const editorContent = editor.view.dom as HTMLElement;
      const totalPages = Math.ceil(editorContent.scrollHeight / (297 * 3.7795275591));
      
      // Atualiza o container de páginas se necessário
      const container = document.querySelector('.editor-content');
      if (!container) return;

      // Ajusta o número de páginas
      const currentPages = container.querySelectorAll('.editor-page').length;
      if (currentPages !== totalPages) {
        // Mantém a primeira página
        const firstPage = container.firstElementChild;
        container.innerHTML = '';
        if (firstPage) container.appendChild(firstPage);

        // Adiciona páginas adicionais se necessário
        for (let i = 1; i < totalPages; i++) {
          const newPage = document.createElement('div');
          newPage.className = 'editor-page';
          container.appendChild(newPage);
        }
      }
    },
  });

  // Cores organizadas em grupos menores
  const textColors = {
    'Cores': ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
    'Principais': ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
    'Tons': ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  };

  const highlightColors = {
    'Destaque': ['#ffff00', '#00ff00', '#ff00ff', '#00ffff', '#ff9900', '#ff0000'],
    'Suaves': ['#ffd700', '#98fb98', '#dda0dd', '#87ceeb', '#ffa07a', '#f08080'],
  };

  // Estado único para controlar menus
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Função para gerenciar abertura/fechamento dos menus
  const handleMenuClick = (menuName: string) => {
    setActiveMenu(activeMenu === menuName ? null : menuName);
  };

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.menu-button') && !target.closest('.menu-content')) {
        setActiveMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Atualizar hasChanges quando o editor mudar
  useEffect(() => {
    if (editor) {
      editor.on('update', () => {
        setHasChanges(true);
      });
    }
  }, [editor]);

  const handleSave = async () => {
    if (!hasChanges) return;
    
    setIsSaving(true);
    try {
      await onSave(editor?.getHTML() || '');
      setLastSaved(new Date());
      setHasChanges(false);
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setIsSaving(false);
    }
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

  // Função para alterar tamanho da fonte
  const handleFontSize = (size: string) => {
    editor?.chain().focus().setFontSize(size).run();
    setActiveMenu(null);
  };

  // Funções auxiliares para verificar se pode indentar/recuar
  const canIndent = () => {
    if (!editor) return false;
    const { selection } = editor.state;
    const { from, to } = selection;
    let canIndentMore = false;

    editor.state.doc.nodesBetween(from, to, (node) => {
      if (editor.isActive('paragraph') || editor.isActive('heading') || editor.isActive('listItem')) {
        const currentIndent = node.attrs.indent || 0;
        if (currentIndent < 8) { // maxLevel definido no indent.ts
          canIndentMore = true;
        }
      }
    });

    return canIndentMore;
  };

  const canOutdent = () => {
    if (!editor) return false;
    const { selection } = editor.state;
    const { from, to } = selection;
    let canOutdentMore = false;

    editor.state.doc.nodesBetween(from, to, (node) => {
      if (editor.isActive('paragraph') || editor.isActive('heading') || editor.isActive('listItem')) {
        const currentIndent = node.attrs.indent || 0;
        if (currentIndent > 0) { // minLevel definido no indent.ts
          canOutdentMore = true;
        }
      }
    });

    return canOutdentMore;
  };

  useEffect(() => {
    if (editor) {
      const updatePages = () => {
        const content = editor.view.dom;
        const pageHeight = 297 * 3.7795275591; // 297mm em pixels @ 96dpi
        const pages = [];
        let currentPage = document.createElement('div');
        
        Array.from(content.children).forEach((child) => {
          const childHeight = (child as HTMLElement).offsetHeight;
          const currentPageHeight = currentPage.offsetHeight;

          if (currentPageHeight + childHeight > pageHeight) {
            pages.push(currentPage);
            currentPage = document.createElement('div');
          }

          currentPage.appendChild(child.cloneNode(true));
        });

        if (currentPage.children.length > 0) {
          pages.push(currentPage);
        }

        setPages(pages);
      };

      editor.on('update', updatePages);
      return () => editor.off('update', updatePages);
    }
  }, [editor]);

  // Atualizar o idioma quando o editor ou targetLanguage mudar
  useEffect(() => {
    if (editor && targetLanguage) {
      const editorElement = document.querySelector('.ProseMirror');
      if (editorElement) {
        editorElement.setAttribute('lang', targetLanguage);
        editorElement.setAttribute('spellcheck', 'true');
      }
    }
  }, [editor, targetLanguage]);

  // Corrigir o useEffect do editor
  useEffect(() => {
    if (editor) {
      const cleanup = () => {
        editor.destroy();
      };
      return cleanup;
    }
  }, [editor]);

  // Corrigir os comandos indent/outdent
  const handleIndent = () => {
    editor?.chain().focus().updateAttributes('paragraph', {
      indent: (editor.getAttributes('paragraph').indent || 0) + 1
    }).run();
  };

  const handleOutdent = () => {
    editor?.chain().focus().updateAttributes('paragraph', {
      indent: Math.max(0, (editor.getAttributes('paragraph').indent || 0) - 1)
    }).run();
  };

  // Função para calcular o número de páginas necessárias
  const calculatePages = (content: HTMLElement) => {
    const pageHeight = 297 * 3.7795275591; // 297mm em pixels
    const marginTop = parseFloat(pageMargins.top);
    const marginBottom = parseFloat(pageMargins.bottom);
    const availableHeight = pageHeight - (marginTop + marginBottom);
    
    const contentHeight = content.scrollHeight;
    return Math.ceil(contentHeight / availableHeight);
  };

  useEffect(() => {
    if (editor) {
      const editorContent = editor.view.dom as HTMLElement;
      const totalPages = calculatePages(editorContent);
      
      // Atualiza o container de páginas
      const container = document.querySelector('.editor-content');
      if (!container) return;

      // Mantém apenas a primeira página se já existir
      while (container.children.length > 1) {
        container.removeChild(container.lastChild!);
      }

      // Adiciona páginas necessárias
      for (let i = 1; i < totalPages; i++) {
        const newPage = document.createElement('div');
        newPage.className = 'editor-page';
        container.appendChild(newPage);
      }
    }
  }, [editor?.state.doc.content, pageMargins]);

  return (
    <div className="flex flex-col h-screen">
      {/* Barra de ferramentas principal */}
      <div className="border-b border-gray-200 p-2">
        <div className="flex items-center justify-between">
          {/* Botão Voltar */}
          <button
            onClick={() => navigate('/translations')}
            className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md mr-4"
            title="Voltar para traduções"
          >
            <ChevronLeft className="w-4 h-4" />
            <FileText className="w-5 h-5 text-blue-600" />
          </button>

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
            <div className="relative">
              <button
                onClick={() => handleMenuClick('fontSize')}
                className="menu-button flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                title="Tamanho da fonte"
              >
                <span className="text-sm">{editor?.isActive('fontSize') ? editor?.getAttributes('fontSize').size : '16px'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {activeMenu === 'fontSize' && (
                <div className="menu-content absolute top-full left-0 mt-1 bg-white shadow-lg rounded-md border border-gray-200 z-50">
                  {['12px', '14px', '16px', '18px', '20px', '24px', '30px'].map((size) => (
                    <button
                      key={size}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${
                        editor?.isActive('fontSize', { size }) ? 'bg-gray-100' : ''
                      }`}
                      onClick={() => handleFontSize(size)}
                    >
                      <span style={{ fontSize: size }}>{size}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Indentação com estado disabled */}
            <div className="flex items-center gap-1">
              <ToolbarButton
                icon={<ChevronsLeft className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().outdent().run()}
                disabled={!canOutdent()}
                tooltip="Diminuir recuo"
              />
              <ToolbarButton
                icon={<ChevronsRight className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().indent().run()}
                disabled={!canIndent()}
                tooltip="Aumentar recuo"
              />
            </div>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Linha horizontal com tooltip melhorado */}
            <ToolbarButton
              icon={<MinusSquare className="w-4 h-4" />}
              onClick={() => editor?.chain().focus().setHorizontalRule().run()}
              tooltip="Inserir linha horizontal"
              className="hover:bg-gray-100"
            />

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

            {/* Cores - Layout do grid ajustado */}
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={() => handleMenuClick('textColor')}
                  className="menu-button flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                  title="Cor do texto"
                >
                  <Palette className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </button>
                {activeMenu === 'textColor' && (
                  <div className="menu-content absolute top-full left-0 mt-1 p-2 bg-white shadow-lg rounded-md border border-gray-200 z-[100] min-w-[200px]">
                    {Object.entries(textColors).map(([group, colors]) => (
                      <div key={group} className="mb-3 last:mb-0">
                        <div className="text-xs text-gray-500 mb-1">{group}</div>
                        <div className="grid grid-cols-5 gap-1">
                          {colors.map((color) => (
                            <button
                              key={color}
                              className="w-8 h-8 rounded border border-gray-200 hover:border-gray-400"
                              style={{ backgroundColor: color }}
                              onClick={() => {
                                editor?.chain().focus().setColor(color).run();
                                setActiveMenu(null);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => handleMenuClick('highlight')}
                  className="menu-button flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                  title="Realce"
                >
                  <Highlighter className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </button>
                {activeMenu === 'highlight' && (
                  <div className="menu-content absolute top-full left-0 mt-1 p-2 bg-white shadow-lg rounded-md border border-gray-200 z-[100] min-w-[200px]">
                    {Object.entries(highlightColors).map(([group, colors]) => (
                      <div key={group} className="mb-3 last:mb-0">
                        <div className="text-xs text-gray-500 mb-1">{group}</div>
                        <div className="grid grid-cols-5 gap-1">
                          {colors.map((color) => (
                            <button
                              key={color}
                              className="w-8 h-8 rounded border border-gray-200 hover:border-gray-400"
                              style={{ backgroundColor: color }}
                              onClick={() => {
                                editor?.chain().focus().toggleHighlight({ color }).run();
                                setActiveMenu(null);
                              }}
                            />
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
              <button
                onClick={() => handleMenuClick('table')}
                className="menu-button flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                title="Tabela"
              >
                <TableIcon className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {activeMenu === 'table' && (
                <div className="menu-content absolute top-full left-0 mt-1 bg-white shadow-lg rounded-md border border-gray-200 z-50 min-w-[200px]">
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
                onClick={() => handleMenuClick('margins')}
                className="menu-button flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                title="Margens"
              >
                <Maximize className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {activeMenu === 'margins' && (
                <div className="menu-content absolute top-full left-0 mt-1 bg-white shadow-lg rounded-md border border-gray-200 z-50 p-4 min-w-[250px]">
                  <div className="space-y-4">
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

            {/* Listas */}
            <div className="flex items-center gap-1">
              <ToolbarButton
                icon={<List className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                isActive={editor?.isActive('bulletList')}
                tooltip="Lista com marcadores"
              />
              <ToolbarButton
                icon={<ListOrdered className="w-4 h-4" />}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                isActive={editor?.isActive('orderedList')}
                tooltip="Lista numerada"
              />
            </div>

            <div className="border-l border-gray-300 h-6 mx-2" />

            {/* Símbolos */}
            <div className="relative">
              <button
                onClick={() => handleMenuClick('symbols')}
                className="menu-button flex items-center gap-1 p-1 hover:bg-gray-100 rounded"
                title="Símbolos"
              >
                <Type className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {activeMenu === 'symbols' && (
                <div className="menu-content absolute top-full left-0 mt-1 bg-white shadow-lg rounded-md border border-gray-200 z-50 max-h-[400px] overflow-y-auto min-w-[300px]">
                  {symbols.map(({ group, chars }) => (
                    <div key={group} className="p-3 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-700 mb-2">{group}</div>
                      <div className="grid grid-cols-8 gap-1">
                        {chars.map((symbol) => (
                          <button
                            key={symbol}
                            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-sm"
                            onClick={() => {
                              editor?.chain().focus().insertContent(symbol).run();
                              setActiveMenu(null);
                            }}
                          >
                            {symbol}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Área de salvamento */}
          <div className="flex items-center gap-4">
            {lastSaved && (
              <span className="text-sm text-gray-500">
                Última alteração: {format(lastSaved, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className={`
                px-4 py-1.5 rounded flex items-center gap-2
                ${hasChanges 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'}
              `}
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {/* Área do editor */}
      <div className="flex-grow overflow-auto bg-gray-100 p-8">
        <div 
          className="bg-white shadow-lg mx-auto"
          style={{
            width: '210mm', // Largura A4
            minHeight: '297mm', // Altura mínima A4
            padding: `${pageMargins.top} ${pageMargins.right} ${pageMargins.bottom} ${pageMargins.left}`,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
            border: '1px solid #e5e7eb',
          }}
        >
          <EditorContent 
            editor={editor}
            className="min-h-full prose max-w-none focus:outline-none"
          />
        </div>
      </div>

      <EditorFooter
        editor={editor}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        zoom={zoom}
        onZoomChange={setZoom}
      />
    </div>
  );
}

// Definir interface para o ToolbarButton
interface ToolbarButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip?: string;
}

// Atualizar o ToolbarButton com a interface
function ToolbarButton({ 
  icon, 
  onClick, 
  isActive = false, 
  disabled = false, 
  tooltip = '' 
}: ToolbarButtonProps) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          p-1.5 rounded hover:bg-gray-100 
          ${isActive ? 'bg-gray-200' : ''} 
          ${disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}
        `}
      >
        {icon}
      </button>
      {tooltip && !disabled && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {tooltip}
        </div>
      )}
    </div>
  );
}