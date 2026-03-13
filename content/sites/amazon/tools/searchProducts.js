// content/sites/amazon/tools/searchProducts.js

const SearchProductsTool = {
  name: 'search_products',
  description: 'Search for products on Amazon. Navigates to Amazon search results with the given query. After calling this tool, call get_results to read the product listings.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search terms (e.g., "wireless headphones", "laptop stand")'
      },
      category: {
        type: 'string',
        enum: ['all', 'electronics', 'books', 'clothing', 'home', 'toys', 'sports', 'beauty', 'grocery', 'automotive', 'garden', 'health', 'pet-supplies', 'office', 'tools'],
        description: 'Department to search in. Defaults to "all".'
      },
      sortBy: {
        type: 'string',
        enum: ['relevance', 'price_low_to_high', 'price_high_to_low', 'avg_customer_review', 'newest_arrivals'],
        description: 'Sort order for results. Defaults to "relevance".'
      }
    },
    required: ['query']
  },

  execute: async (args) => {
    const { query, category = 'all', sortBy = 'relevance' } = args;

    if (!query || query.trim().length === 0) {
      return { content: [{ type: 'text', text: 'ERROR: query is required and cannot be empty.' }] };
    }

    // Map category names to Amazon's "i" parameter values
    const categoryMap = {
      all: '',
      electronics: 'electronics',
      books: 'stripbooks',
      clothing: 'fashion',
      home: 'garden',
      toys: 'toys-and-games',
      sports: 'sporting',
      beauty: 'beauty',
      grocery: 'grocery',
      automotive: 'automotive',
      garden: 'lawngarden',
      health: 'hpc',
      'pet-supplies': 'pets',
      office: 'office-products',
      tools: 'tools'
    };

    // Map sort options to Amazon's "s" parameter values
    const sortMap = {
      relevance: '',
      price_low_to_high: 'price-asc-rank',
      price_high_to_low: 'price-desc-rank',
      avg_customer_review: 'review-rank',
      newest_arrivals: 'date-desc-rank'
    };

    let url = `https://www.amazon.com/s?k=${encodeURIComponent(query.trim())}`;

    const catVal = categoryMap[category];
    if (catVal) {
      url += `&i=${catVal}`;
    }

    const sortVal = sortMap[sortBy];
    if (sortVal) {
      url += `&s=${sortVal}`;
    }

    // Navigate after returning response (page unload destroys content script context)
    setTimeout(() => { window.location.href = url; }, 50);

    const catDisplay = category !== 'all' ? ` in ${category}` : '';
    const sortDisplay = sortBy !== 'relevance' ? ` sorted by ${sortBy.replace(/_/g, ' ')}` : '';

    return {
      content: [{
        type: 'text',
        text: `Navigating to Amazon search: "${query}"${catDisplay}${sortDisplay}. Wait for the page to load, then call get_results.`
      }]
    };
  }
};
