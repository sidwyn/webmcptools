// content/sites/google-docs/tools/getDocument.js

const GetDocumentTool = {
  name: 'get_document',
  description: 'Read the full text content of the current Google Doc. Returns the document text and title.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  execute: async (args) => {
    const text = await WebMCPHelpers.readDocsText();
    if (text === null) {
      return { content: [{ type: 'text', text: 'ERROR: Could not read the document. Make sure a Google Doc is open and you have access.' }] };
    }

    const title = WebMCPHelpers.getDocsTitle();
    const lines = text.split('\n');
    const wordCount = text.trim().split(/\s+/).filter(w => w).length;

    let result = `**${title}**\n`;
    result += `${wordCount} words, ${lines.length} lines\n\n`;
    result += text;

    return { content: [{ type: 'text', text: result }] };
  }
};
