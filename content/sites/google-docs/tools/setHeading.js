// content/sites/google-docs/tools/setHeading.js

const SetHeadingTool = {
  name: 'set_heading',
  description: 'Set the heading level for the current line/selection using the Styles dropdown in the toolbar. Use 0 for Normal text, 1-6 for Heading 1 through Heading 6.',
  inputSchema: {
    type: 'object',
    properties: {
      level: {
        type: 'integer',
        description: 'Heading level: 0 for Normal text, 1-6 for Heading 1 through Heading 6'
      }
    },
    required: ['level']
  },

  execute: async (args) => {
    const { level } = args;
    if (level < 0 || level > 6) {
      return { content: [{ type: 'text', text: 'ERROR: level must be 0 (normal) through 6.' }] };
    }

    const styleName = level === 0 ? 'Normal text' : `Heading ${level}`;

    // Click the Styles dropdown then select the style
    const stylesBtn = document.querySelector('[aria-label*="Styles list"]') ||
                      document.querySelector('[aria-label="Styles"]');
    if (!stylesBtn) {
      return { content: [{ type: 'text', text: 'ERROR: Could not find the Styles dropdown.' }] };
    }

    // Open the dropdown
    WebMCPHelpers.simulateClick(stylesBtn);
    await WebMCPHelpers.sleep(300);

    // Find the style option in the dropdown
    const options = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]');
    const target = Array.from(options).find(o => {
      const text = o.textContent.trim();
      return text.startsWith(styleName);
    });

    if (!target) {
      // Close dropdown
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { content: [{ type: 'text', text: `ERROR: Could not find "${styleName}" in the Styles dropdown.` }] };
    }

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await WebMCPHelpers.sleep(50);
    WebMCPHelpers.simulateClick(target);
    await WebMCPHelpers.sleep(100);

    return { content: [{ type: 'text', text: `Applied ${styleName} style.` }] };
  }
};
