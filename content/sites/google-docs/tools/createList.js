// content/sites/google-docs/tools/createList.js

const CreateListTool = {
  name: 'create_list',
  description: 'Create a numbered list, bulleted list, or checklist at the current position by clicking the toolbar button.',
  inputSchema: {
    type: 'object',
    properties: {
      listType: {
        type: 'string',
        enum: ['numbered', 'bulleted', 'checklist'],
        description: 'The type of list to create'
      }
    },
    required: ['listType']
  },

  execute: async (args) => {
    const { listType } = args;
    const labels = {
      numbered: 'Numbered list',
      bulleted: 'Bulleted list',
      checklist: 'Checklist'
    };

    const label = labels[listType];
    if (!label) {
      return { content: [{ type: 'text', text: `ERROR: Unknown list type "${listType}". Use: numbered, bulleted, checklist.` }] };
    }

    const clicked = WebMCPHelpers.clickDocsToolbarButton(label);
    if (!clicked) {
      return { content: [{ type: 'text', text: `ERROR: Could not find the ${listType} list toolbar button.` }] };
    }

    await WebMCPHelpers.sleep(100);
    return { content: [{ type: 'text', text: `Toggled ${listType} list.` }] };
  }
};
