// content/sites/walmart/injector.js — Registers WebMCP tools based on current Walmart page

/**
 * Read page context from the current Walmart page.
 * Provides search query, store location, and login state to the AI.
 */
function getWalmartPageContext() {
  const ctx = {};

  // Current search query from URL
  try {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (query) ctx.searchQuery = query;
  } catch {
    // URL parsing may fail
  }

  // Store location (shown in header for pickup availability)
  const storeEl = document.querySelector('[data-automation-id="store-address"], [data-testid="store-selector"] span, [aria-label*="store"]');
  if (storeEl) {
    const storeText = storeEl.textContent.trim();
    if (storeText && storeText.length < 100) ctx.storeLocation = storeText;
  }

  // Login state
  const accountEl = document.querySelector('[data-automation-id="account-menu"], [data-testid="account-menu"]');
  if (accountEl) {
    const text = accountEl.textContent.trim();
    ctx.loggedIn = !/sign in/i.test(text);
  }

  return ctx;
}

// Register the page context provider
window.__webmcpRegistry.pageContextProvider = getWalmartPageContext;

// Set the site prompt (loaded from prompt.js)
window.__webmcpRegistry.sitePrompt = typeof WALMART_PROMPT !== 'undefined' ? WALMART_PROMPT : '';

function registerWalmartTools() {
  const url = window.location.href;
  const registry = window.__webmcpRegistry;

  // Clear all Walmart tools before re-registering
  ['search_products', 'get_results', 'set_filters', 'sort_results',
   'get_product_details', 'add_to_cart', 'get_cart'
  ].forEach(name => registry.unregister(name));

  if (!url.includes('walmart.com')) return;

  const isSearchPage = url.includes('/search');
  const isCategoryPage = url.includes('/browse') || url.includes('/cp/');
  const isProductPage = url.includes('/ip/');
  const isCartPage = url.includes('/cart');
  const isResultsLike = isSearchPage || isCategoryPage;

  // Always available on any Walmart page
  registry.register(SearchProductsTool);
  registry.register(GetCartTool);

  // Search results / category pages
  if (isResultsLike) {
    registry.register(GetResultsTool);
    registry.register(SetFiltersTool);
    registry.register(SortResultsTool);
    registry.register(GetProductDetailsTool);
  }

  // Product detail page
  if (isProductPage) {
    registry.register(GetProductDetailsTool);
    registry.register(AddToCartTool);
  }
}

// Initial registration
registerWalmartTools();

// Re-register on SPA navigation (Walmart uses client-side routing)
let lastHref = window.location.href;
const navObserver = new MutationObserver(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    registerWalmartTools();
  }
});
navObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('popstate', () => {
  setTimeout(registerWalmartTools, 100);
});
