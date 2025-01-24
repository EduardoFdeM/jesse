import { Extension } from '@tiptap/core'
import { TextSelection, AllSelection } from '@tiptap/pm/state'

export const Indent = Extension.create({
  name: 'indent',

  defaultOptions: {
    types: ['paragraph', 'heading', 'listItem'],
    minLevel: 0,
    maxLevel: 8,
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            renderHTML: attributes => ({
              style: `margin-left: ${attributes.indent}em`,
            }),
            parseHTML: element => element.style.marginLeft ? 
              parseInt(element.style.marginLeft) : 0,
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent: () => ({ tr, state, dispatch }) => {
        const { selection } = state
        const { from, to } = selection

        if (!(selection instanceof TextSelection || selection instanceof AllSelection)) {
          return false
        }

        tr.doc.nodesBetween(from, to, (node, pos) => {
          if (this.options.types.includes(node.type.name)) {
            const indent = node.attrs.indent || 0
            if (indent < this.options.maxLevel) {
              tr.setNodeMarkup(pos, null, {
                ...node.attrs,
                indent: indent + 1,
              })
            }
          }
        })

        if (tr.docChanged && dispatch) {
          dispatch(tr)
          return true
        }

        return false
      },
      outdent: () => ({ tr, state, dispatch }) => {
        const { selection } = state
        const { from, to } = selection

        if (!(selection instanceof TextSelection || selection instanceof AllSelection)) {
          return false
        }

        tr.doc.nodesBetween(from, to, (node, pos) => {
          if (this.options.types.includes(node.type.name)) {
            const indent = node.attrs.indent || 0
            if (indent > this.options.minLevel) {
              tr.setNodeMarkup(pos, null, {
                ...node.attrs,
                indent: indent - 1,
              })
            }
          }
        })

        if (tr.docChanged && dispatch) {
          dispatch(tr)
          return true
        }

        return false
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    }
  },
}) 