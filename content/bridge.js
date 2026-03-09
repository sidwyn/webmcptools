// content/bridge.js — Content script messaging bridge
// Initializes the tool registry and handles messages from the side panel.

window.__webmcpRegistry = window.__webmcpRegistry || {
  tools: {},

  register(toolDef) {
    this.tools[toolDef.name] = toolDef;
    this._notifySidePanel();
  },

  unregister(name) {
    delete this.tools[name];
    this._notifySidePanel();
  },

  getAll() {
    return Object.values(this.tools).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));
  },

  _notifySidePanel() {
    chrome.runtime.sendMessage({
      type: 'TOOLS_UPDATED',
      tools: this.getAll()
    }).catch(() => {}); // Side panel may not be open
  }
};

/**
 * Read the current origin airport text from the Google Flights search form.
 * Works on both the homepage and results pages.
 */
function getPageContext() {
  const ctx = { url: window.location.href };

  const candidates = [
    // 1. Standard input with "Where from?" aria-label
    () => {
      const el = document.querySelector('input[aria-label="Where from?"]');
      return el?.value?.trim() || null;
    },
    // 2. Placeholder-based fallback
    () => {
      const el = document.querySelector('input[placeholder="Where from?"]');
      return el?.value?.trim() || null;
    },
    // 3. Any input inside the origin combobox
    () => {
      const el = document.querySelector('[data-placeholder="Where from?"] input') ||
                 document.querySelector('[aria-label="Where from?"]');
      if (el?.tagName === 'INPUT') return el.value?.trim() || null;
      // If it's a div/combobox container, read its text
      return el?.textContent?.trim() || null;
    },
    // 4. Results page: look for aria-label containing "from" on any element
    () => {
      const els = document.querySelectorAll('[aria-label*="from" i], [aria-label*="From"]');
      for (const el of els) {
        const label = el.getAttribute('aria-label') || '';
        if (/where|from/i.test(label)) {
          const text = el.value?.trim() || el.textContent?.trim();
          if (text && text.length > 1 && text.length < 60) return text;
        }
      }
      return null;
    },
    // 5. Results page URL: extract origin from ?q= parameter
    () => {
      const url = window.location.href;
      // URL like: ?q=flights%20from%20SFO%20to%20...
      const fromMatch = url.match(/from%20([A-Z]{3})/i) ||
                        url.match(/from\+([A-Z]{3})/i) ||
                        url.match(/from\s+([A-Z]{3})/i);
      return fromMatch ? fromMatch[1].toUpperCase() : null;
    },
    // 6. Look for the first combobox-like container with airport code pattern
    () => {
      const inputs = document.querySelectorAll('input[type="text"]');
      for (const input of inputs) {
        const container = input.closest('[role="combobox"], [jscontroller]');
        if (!container) continue;
        const val = input.value?.trim();
        // Check if this looks like an airport (has 3-letter code or city name)
        if (val && val.length > 1 && val.length < 60) {
          // Only return if it's the first/origin field (before destination)
          const allComboboxes = document.querySelectorAll('[role="combobox"], [jscontroller]');
          if (container === allComboboxes[0] || container === allComboboxes[1]) {
            return val;
          }
        }
      }
      return null;
    }
  ];

  for (const fn of candidates) {
    try {
      const val = fn();
      if (val) { ctx.originText = val; break; }
    } catch {
      // Selector may throw — continue to next
    }
  }

  return ctx;
}

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TOOLS') {
    sendResponse({ tools: window.__webmcpRegistry.getAll(), pageContext: getPageContext() });
    return false;
  }

  if (message.type === 'GET_PAGE_CONTEXT') {
    sendResponse({ pageContext: getPageContext() });
    return false;
  }

  if (message.type === 'EXECUTE_TOOL') {
    const tool = window.__webmcpRegistry.tools[message.toolName];
    if (!tool) {
      sendResponse({ error: `Tool "${message.toolName}" not registered` });
      return false;
    }

    // Execute async — must return true to keep channel open
    tool.execute(message.args)
      .then(result => sendResponse({ result }))
      .catch(err => sendResponse({ error: err.message || String(err) }));
    return true; // Keep message channel open for async response
  }
});
