// content/sites/google-docs/tools/renameDocument.js

const RenameDocumentTool = {
  name: 'rename_document',
  description: 'Rename the current Google Doc by changing its title.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The new document title'
      }
    },
    required: ['title']
  },

  execute: async (args) => {
    const { title } = args;
    if (!title) {
      return { content: [{ type: 'text', text: 'ERROR: title is required.' }] };
    }

    const input = document.querySelector('input.docs-title-input') ||
                  document.querySelector('[aria-label="Rename"]');

    if (!input) {
      return { content: [{ type: 'text', text: 'ERROR: Could not find the document title input. Make sure a Google Doc is open.' }] };
    }

    // Focus and clear the title input
    input.focus();
    input.select();
    await WebMCPHelpers.sleep(50);

    // Set value
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(input, title);
    } else {
      input.value = title;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await WebMCPHelpers.sleep(50);

    // Press Enter to confirm
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    await WebMCPHelpers.sleep(100);

    // Click back into document to deselect title
    WebMCPHelpers.focusDocsEditor();

    return { content: [{ type: 'text', text: `Renamed document to "${title}".` }] };
  }
};
