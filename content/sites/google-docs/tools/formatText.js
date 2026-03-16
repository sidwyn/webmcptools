// content/sites/google-docs/tools/formatText.js

const FormatTextTool = {
  name: 'format_text',
  description: 'Toggle bold, italic, underline, or strikethrough formatting by clicking the toolbar button. Works on the current selection or sets formatting for new text at cursor.',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['bold', 'italic', 'underline', 'strikethrough'],
        description: 'The formatting to toggle'
      }
    },
    required: ['format']
  },

  execute: async (args) => {
    const { format } = args;
    const labels = {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      strikethrough: 'Strikethrough'
    };

    const label = labels[format];
    if (!label) {
      return { content: [{ type: 'text', text: `ERROR: Unknown format "${format}". Use: bold, italic, underline, strikethrough.` }] };
    }

    const clicked = WebMCPHelpers.clickDocsToolbarButton(label);
    if (!clicked) {
      return { content: [{ type: 'text', text: `ERROR: Could not find the ${format} toolbar button.` }] };
    }

    await WebMCPHelpers.sleep(100);
    return { content: [{ type: 'text', text: `Toggled ${format} formatting.` }] };
  }
};
