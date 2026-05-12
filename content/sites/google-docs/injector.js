// content/sites/google-docs/injector.js — Registers WebMCP tools for Google Docs

function getGoogleDocsPageContext() {
  const ctx = {};
  const title = WebMCPHelpers.getDocsTitle();
  if (title) ctx.documentTitle = title;
  return ctx;
}

window.__webmcpRegistry.pageContextProvider = getGoogleDocsPageContext;
window.__webmcpRegistry.sitePrompt = typeof GOOGLE_DOCS_PROMPT !== 'undefined' ? GOOGLE_DOCS_PROMPT : '';

function registerGoogleDocsTools() {
  const url = window.location.href;
  const registry = window.__webmcpRegistry;

  ['get_document', 'insert_text', 'replace_text', 'format_text',
   'set_heading', 'create_list', 'get_formatting', 'rename_document'
  ].forEach(name => registry.unregister(name));

  if (!url.includes('docs.google.com/document/')) return;

  // Check that the editor is loaded
  const hasEditor = !!document.querySelector('.docs-texteventtarget-iframe') ||
                    !!document.querySelector('.kix-appview-editor');

  if (hasEditor) {
    registry.register(GetDocumentTool);
    registry.register(InsertTextTool);
    registry.register(ReplaceTextTool);
    registry.register(FormatTextTool);
    registry.register(SetHeadingTool);
    registry.register(CreateListTool);
    registry.register(GetFormattingTool);
    registry.register(RenameDocumentTool);
  } else {
    // Editor not loaded yet — try again shortly
    setTimeout(registerGoogleDocsTools, 1000);
  }
}

registerGoogleDocsTools();

// Re-register when DOM changes (e.g., editor finishes loading)
let lastDocsHref = window.location.href;
const docsNavObserver = new MutationObserver(() => {
  if (window.location.href !== lastDocsHref) {
    lastDocsHref = window.location.href;
    registerGoogleDocsTools();
  }
});
docsNavObserver.observe(document.body, { childList: true, subtree: true });
