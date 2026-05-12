// content/sites/google-docs/tools/insertText.js

const InsertTextTool = {
  name: 'insert_text',
  description: 'Insert text at the current cursor position in the Google Doc. Use get_document first to understand where the cursor is.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to insert at the current cursor position'
      }
    },
    required: ['text']
  },

  execute: async (args) => {
    const { text } = args;
    if (!text) {
      return { content: [{ type: 'text', text: 'ERROR: text is required.' }] };
    }

    WebMCPHelpers.focusDocsEditor();
    await WebMCPHelpers.sleep(50);

    const success = WebMCPHelpers.docsInsertText(text);
    if (!success) {
      return { content: [{ type: 'text', text: 'ERROR: Could not access the document editor.' }] };
    }

    await WebMCPHelpers.sleep(100);
    return { content: [{ type: 'text', text: `Inserted ${text.length} characters.` }] };
  }
};
