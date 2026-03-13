// content/sites/walmart/tools/searchProducts.js

const SearchProductsTool = {
  name: 'search_products',
  description: 'Search for products on Walmart by keyword. Navigates to the Walmart search results page. After calling this tool, call get_results to read the product listings.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search term (e.g., "wireless headphones", "air fryer", "lego star wars")'
      },
      sort: {
        type: 'string',
        enum: ['best_match', 'price_low', 'price_high', 'best_seller', 'rating_high', 'new'],
        description: 'Sort order for results. Defaults to best_match.'
      }
    },
    required: ['query']
  },

  execute: async (args) => {
    const { query, sort } = args;

    if (!query || query.trim().length === 0) {
      return { content: [{ type: 'text', text: 'ERROR: query is required and cannot be empty.' }] };
    }

    const sortMap = {
      best_match: 'best_match',
      price_low: 'price_low',
      price_high: 'price_high',
      best_seller: 'best_seller',
      rating_high: 'rating_high',
      new: 'new'
    };

    let url = `https://www.walmart.com/search?q=${encodeURIComponent(query.trim())}`;
    if (sort && sortMap[sort]) {
      url += `&sort=${sortMap[sort]}`;
    }

    // Navigate AFTER returning — the page unload destroys the content script context
    setTimeout(() => { window.location.href = url; }, 50);

    const sortLabel = sort ? ` sorted by ${sort.replace(/_/g, ' ')}` : '';
    return {
      content: [{
        type: 'text',
        text: `Navigating to Walmart search: "${query.trim()}"${sortLabel}. Wait for the page to load, then call get_results.`
      }]
    };
  }
};
