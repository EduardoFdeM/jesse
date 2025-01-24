import HorizontalRule from '@tiptap/extension-horizontal-rule'

export const CustomHorizontalRule = HorizontalRule.configure({
  HTMLAttributes: {
    class: 'my-6 border-t border-gray-300 mx-2',
  },
}).extend({
  addStyle() {
    return `
      .ProseMirror hr {
        height: 1px;
        border: none;
        background-color: #e5e7eb;
        margin: 24px 8px;
        pointer-events: none;
      }
      
      .ProseMirror hr.selected {
        background-color: #b4d5ff;
        outline: 2px solid #b4d5ff;
      }
    `
  },
}) 