import { Extension } from '@tiptap/core';

export const ColumnsExtension = Extension.create({
  name: 'columns',

  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          columns: {
            default: 'single',
            parseHTML: element => element.getAttribute('data-columns'),
            renderHTML: attributes => {
              if (!attributes.columns) {
                return {};
              }
              return { 'data-columns': attributes.columns };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setColumns:
        (columns: 'single' | 'double' | 'triple') =>
        ({ editor }) => {
          editor.chain().focus().updateAttributes('doc', { columns }).run();
          return true;
        },
    };
  },
}); 