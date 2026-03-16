// content/sites/google-docs/helpers.js — Google Docs-specific DOM utilities
// Extends WebMCPHelpers (loaded from content/helpers.js)
//
// Google Docs (2024+) uses a canvas-based renderer. There are no DOM text nodes.
// Reading uses the export endpoint; writing uses ClipboardEvent paste;
// formatting uses toolbar button clicks (simulated mouse events work on toolbar).

/**
 * Get the Google Docs editor iframe document.
 */
WebMCPHelpers.getDocsEditorFrame = function() {
  const iframe = document.querySelector('.docs-texteventtarget-iframe');
  if (!iframe) return null;
  try {
    return iframe.contentDocument || iframe.contentWindow?.document;
  } catch {
    return null;
  }
};

/**
 * Get the contenteditable div inside the editor iframe.
 */
WebMCPHelpers.getDocsEditDiv = function() {
  const iframeDoc = WebMCPHelpers.getDocsEditorFrame();
  if (!iframeDoc) return null;
  return iframeDoc.querySelector('[contenteditable="true"]');
};

/**
 * Focus the editor so events reach it.
 */
WebMCPHelpers.focusDocsEditor = function() {
  const iframe = document.querySelector('.docs-texteventtarget-iframe');
  if (iframe) iframe.focus();
  const editDiv = WebMCPHelpers.getDocsEditDiv();
  if (editDiv) editDiv.focus();
};

/**
 * Extract the document ID from the current URL.
 */
WebMCPHelpers.getDocsId = function() {
  const match = window.location.pathname.match(/\/document\/d\/([^/]+)/);
  return match ? match[1] : null;
};

/**
 * Read the full document text using the export endpoint.
 * Works in the canvas-based renderer where DOM selection doesn't return text.
 */
WebMCPHelpers.readDocsText = async function() {
  const docId = WebMCPHelpers.getDocsId();
  if (!docId) return null;

  try {
    const resp = await fetch('/document/d/' + docId + '/export?format=txt');
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
};

/**
 * Paste text at the current cursor position using ClipboardEvent.
 * This is the only reliable way to insert text in the canvas-based editor.
 */
WebMCPHelpers.docsInsertText = function(text) {
  const editDiv = WebMCPHelpers.getDocsEditDiv();
  if (!editDiv) return false;

  editDiv.focus();
  editDiv.textContent = text;

  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  const pasteEvent = new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true
  });
  editDiv.dispatchEvent(pasteEvent);
  return true;
};

/**
 * Click a toolbar button by aria-label prefix.
 * Google Docs toolbar buttons respond to mousedown events.
 */
WebMCPHelpers.clickDocsToolbarButton = function(labelPrefix) {
  const btn = document.querySelector(`[aria-label^="${labelPrefix}"]`);
  if (!btn) return false;
  WebMCPHelpers.simulateClick(btn);
  return true;
};

/**
 * Open a Google Docs menu by name and click a menu item.
 * Menus respond to mousedown on the menu bar item.
 * @returns {boolean} Whether the item was clicked
 */
WebMCPHelpers.clickDocsMenuItem = async function(menuName, itemText) {
  const menuBar = document.querySelector('[role="menubar"]');
  if (!menuBar) return false;

  const menuItem = Array.from(menuBar.children).find(c => c.textContent.trim() === menuName);
  if (!menuItem) return false;

  // Open the menu
  menuItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await WebMCPHelpers.sleep(300);

  // Find the item in the dropdown
  const items = document.querySelectorAll('[role="menuitem"]');
  const target = Array.from(items).find(m => m.textContent.trim().startsWith(itemText));
  if (!target) {
    // Close menu by pressing Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  }

  target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await WebMCPHelpers.sleep(50);
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await WebMCPHelpers.sleep(50);
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
};

/**
 * Open a submenu from Format menu and click an item.
 * e.g., Format > Paragraph styles > Heading 1
 */
WebMCPHelpers.clickDocsSubMenuItem = async function(menuName, subMenuText, itemText) {
  const menuBar = document.querySelector('[role="menubar"]');
  if (!menuBar) return false;

  const menuItem = Array.from(menuBar.children).find(c => c.textContent.trim() === menuName);
  if (!menuItem) return false;

  menuItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await WebMCPHelpers.sleep(300);

  // Find submenu trigger
  const items = document.querySelectorAll('[role="menuitem"]');
  const subMenu = Array.from(items).find(m => m.textContent.trim().startsWith(subMenuText));
  if (!subMenu) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  }

  // Hover to open submenu
  subMenu.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await WebMCPHelpers.sleep(400);

  // Find item in submenu
  const allItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
  const target = Array.from(allItems).find(m => {
    const text = m.textContent.trim();
    return text.startsWith(itemText) && m !== subMenu;
  });

  if (!target) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await WebMCPHelpers.sleep(50);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  }

  target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await WebMCPHelpers.sleep(50);
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await WebMCPHelpers.sleep(50);
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
};

/**
 * Get the current formatting state from toolbar aria-labels.
 */
WebMCPHelpers.getDocsToolbarState = function() {
  const state = {};

  // Current style (Heading 1, Normal text, etc.)
  const stylesBtn = document.querySelector('[aria-label*="Styles list"]') ||
                    document.querySelector('[aria-label*="styles"]');
  if (stylesBtn) {
    const label = stylesBtn.getAttribute('aria-label') || '';
    // "Styles list. Heading 1 selected." → "Heading 1"
    const match = label.match(/Styles list\.\s*(.+?)\s*selected/i);
    state.style = match ? match[1].trim() : label;
  }

  // Font — aria-label is just "Font", actual font name is in textContent
  const fontBtn = document.querySelector('div[aria-label="Font"]');
  if (fontBtn) {
    state.font = fontBtn.textContent?.trim();
  }

  // Font size — from the input element or the "Font size list. X selected." label
  const sizeInput = document.querySelector('input[aria-label="Font size"]');
  if (sizeInput) {
    state.fontSize = sizeInput.value;
  } else {
    const sizeList = document.querySelector('[aria-label*="Font size list"]');
    if (sizeList) {
      const match = (sizeList.getAttribute('aria-label') || '').match(/([\d.]+)\s*selected/i);
      if (match) state.fontSize = match[1];
    }
  }

  // Bold, Italic, Underline, Strikethrough
  const toggles = {
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strikethrough: 'Strikethrough'
  };
  for (const [key, label] of Object.entries(toggles)) {
    const btn = document.querySelector(`[aria-label^="${label}"][aria-pressed]`);
    if (btn) {
      state[key] = btn.getAttribute('aria-pressed') === 'true';
    }
  }

  // Text color
  const colorBtn = document.querySelector('[aria-label*="Text color"]');
  if (colorBtn) {
    state.textColor = colorBtn.getAttribute('aria-label');
  }

  return state;
};

/**
 * Get the document title from the rename input.
 */
WebMCPHelpers.getDocsTitle = function() {
  const input = document.querySelector('input.docs-title-input') ||
                document.querySelector('[aria-label="Rename"]');
  return input?.value || document.title.replace(/ - Google Docs$/, '').trim();
};

/**
 * Open Find & Replace dialog via Edit menu.
 * Keyboard shortcuts don't work in canvas mode, so we use the menu.
 */
WebMCPHelpers.openDocsFindReplace = async function() {
  // Try menu approach
  const clicked = await WebMCPHelpers.clickDocsMenuItem('Edit', 'Find and replace');
  if (clicked) {
    await WebMCPHelpers.sleep(300);
    const dialog = document.querySelector('.docs-findandreplacedialog') ||
                   document.querySelector('[aria-label="Find and Replace"]');
    return !!dialog;
  }
  return false;
};

/**
 * Wait for Find & Replace dialog to be ready.
 */
WebMCPHelpers.waitForDocsFindReplace = async function(timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const dialog = document.querySelector('.docs-findandreplacedialog') ||
                   document.querySelector('[aria-label="Find and Replace"]');
    if (dialog) return dialog;
    await WebMCPHelpers.sleep(100);
  }
  return null;
};

/**
 * Close Find & Replace dialog if open.
 */
WebMCPHelpers.closeDocsFindReplace = function() {
  // Close button is a span with role="button" aria-label="Close"
  const closeBtn = document.querySelector('.docs-findandreplacedialog [role="button"][aria-label="Close"]') ||
                   document.querySelector('.modal-dialog-title-close');
  if (closeBtn) {
    WebMCPHelpers.simulateClick(closeBtn);
    return true;
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return false;
};
