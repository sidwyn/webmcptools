// content/sites/google-docs/tools/getFormatting.js

const GetFormattingTool = {
  name: 'get_formatting',
  description: 'Get the current formatting state at the cursor position — style, font, size, bold/italic/underline status.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  execute: async (args) => {
    const state = WebMCPHelpers.getDocsToolbarState();

    if (Object.keys(state).length === 0) {
      return { content: [{ type: 'text', text: 'ERROR: Could not read toolbar state. Make sure a Google Doc is open and the toolbar is visible.' }] };
    }

    const parts = [];
    if (state.style) parts.push(`Style: ${state.style}`);
    if (state.font) parts.push(`Font: ${state.font}`);
    if (state.fontSize) parts.push(`Size: ${state.fontSize}`);
    if (state.bold !== undefined) parts.push(`Bold: ${state.bold ? 'on' : 'off'}`);
    if (state.italic !== undefined) parts.push(`Italic: ${state.italic ? 'on' : 'off'}`);
    if (state.underline !== undefined) parts.push(`Underline: ${state.underline ? 'on' : 'off'}`);
    if (state.strikethrough !== undefined) parts.push(`Strikethrough: ${state.strikethrough ? 'on' : 'off'}`);
    if (state.textColor) parts.push(`Text color: ${state.textColor}`);

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  }
};
