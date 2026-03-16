// content/sites/google-docs/tools/replaceText.js
//
// Google Docs canvas mode doesn't allow opening Find & Replace from JS alone.
// This tool tries the Edit menu approach first, then falls back to instructing
// the user to open it manually (Cmd+Shift+H).

const ReplaceTextTool = {
  name: 'replace_text',
  description: 'Find and replace text in the Google Doc. Opens the Find & Replace dialog. If it cannot open automatically, it will ask the user to press ⌘+Shift+H first.',
  inputSchema: {
    type: 'object',
    properties: {
      find: {
        type: 'string',
        description: 'The text to find'
      },
      replace: {
        type: 'string',
        description: 'The replacement text'
      },
      replaceAll: {
        type: 'boolean',
        description: 'Replace all occurrences (default true)'
      }
    },
    required: ['find', 'replace']
  },

  execute: async (args) => {
    const { find, replace, replaceAll = true } = args;
    if (!find) {
      return { content: [{ type: 'text', text: 'ERROR: find text is required.' }] };
    }

    // Try to open Find & Replace dialog
    let dialog = document.querySelector('.docs-findandreplacedialog');

    if (!dialog) {
      // Try Edit menu approach
      await WebMCPHelpers.openDocsFindReplace();
      await WebMCPHelpers.sleep(300);
      dialog = document.querySelector('.docs-findandreplacedialog');
    }

    if (!dialog) {
      return { content: [{ type: 'text', text: 'The Find & Replace dialog could not be opened automatically. Please press ⌘+Shift+H (Mac) or Ctrl+Shift+H (Windows) to open it, then call this tool again.' }] };
    }

    const findInput = dialog.querySelector('.docs-findinput-input');
    const replaceInput = dialog.querySelector('.docs-findandreplacedialog-text');

    if (!findInput || !replaceInput) {
      return { content: [{ type: 'text', text: 'ERROR: Could not find input fields in the dialog.' }] };
    }

    // Set find value using native setter to bypass React-style value trapping
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    findInput.focus();
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(findInput, find);
    } else {
      findInput.value = find;
    }
    findInput.dispatchEvent(new Event('input', { bubbles: true }));
    await WebMCPHelpers.sleep(100);

    // Press Enter to search
    findInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    await WebMCPHelpers.sleep(200);

    // Set replace value
    replaceInput.focus();
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(replaceInput, replace);
    } else {
      replaceInput.value = replace;
    }
    replaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    await WebMCPHelpers.sleep(100);

    // Click Replace All or Replace (div[role="button"])
    const buttons = Array.from(dialog.querySelectorAll('[role="button"]'));
    const actionBtn = replaceAll
      ? buttons.find(b => b.textContent.trim() === 'Replace all')
      : buttons.find(b => b.textContent.trim() === 'Replace');

    if (actionBtn) {
      WebMCPHelpers.simulateClick(actionBtn);
      await WebMCPHelpers.sleep(200);
    } else {
      return { content: [{ type: 'text', text: 'ERROR: Could not find the Replace button in the dialog.' }] };
    }

    // Close dialog
    WebMCPHelpers.closeDocsFindReplace();
    await WebMCPHelpers.sleep(100);

    const mode = replaceAll ? 'all occurrences' : 'first occurrence';
    return { content: [{ type: 'text', text: `Replaced ${mode} of "${find}" with "${replace}".` }] };
  }
};
