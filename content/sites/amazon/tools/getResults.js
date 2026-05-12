// content/sites/amazon/tools/getResults.js

const GetResultsTool = {
  name: 'get_results',
  description: 'Read the current product search results from the Amazon page and return them as structured data. Must be on an Amazon search results page.',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return. Defaults to 10.'
      }
    }
  },

  execute: async (args) => {
    const { maxResults = 10 } = args;

    if (!window.location.href.includes('amazon.com/s')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon search results page. Call search_products first or navigate to amazon.com/s.' }] };
    }

    await WebMCPHelpers.waitForAmazonResults(15000);

    let cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"][data-asin]'));
    if (cards.length === 0) {
      cards = Array.from(document.querySelectorAll('.s-result-item[data-asin]'));
    }
    cards = cards.filter(card => card.getAttribute('data-asin').length > 0);

    if (cards.length === 0) {
      return { content: [{ type: 'text', text: 'No product results found. The page may still be loading, or no products match your search. Try waiting a moment and calling get_results again.' }] };
    }

    const limited = cards.slice(0, maxResults);
    const results = limited.map((card, i) => WebMCPHelpers.parseAmazonProductCard(card, i + 1)).filter(Boolean);

    const presentCount = document.querySelectorAll('[data-component-type="s-search-result"][data-asin]').length;
    if (window.WebMCPGate) {
      window.WebMCPGate.observe(WebMCPHelpers.AMAZON_PARSER_KEY, {
        results,
        cardCount: results.length,
        presentCount,
        requiredFields: ['title', 'price'],
        sampleCard: limited[0],
        rootSelector: '.s-main-slot',
        cardSelector: '[data-component-type="s-search-result"][data-asin]',
        siteId: 'amazon'
      });
    }
    if (window.WebMCPShadow) {
      window.WebMCPShadow.shadowMap(WebMCPHelpers.AMAZON_PARSER_KEY, limited, results, ['title', 'price']);
    }

    const summary = results.map(r => {
      const parts = [`${r.rank}.`];
      if (r.isSponsored) parts.push('[Sponsored]');
      parts.push(r.title ? (r.title.length > 80 ? r.title.substring(0, 77) + '...' : r.title) : 'Unknown');
      parts.push('—');
      if (r.price) parts.push(r.price);
      else parts.push('Price not shown');
      if (r.originalPrice) parts.push(`(was ${r.originalPrice})`);
      if (r.rating) parts.push(`★${r.rating}`);
      if (r.reviewCount) parts.push(`(${r.reviewCount.toLocaleString()} reviews)`);
      if (r.isPrime) parts.push('[Prime]');
      if (r.delivery) parts.push(`| ${r.delivery}`);
      return parts.join(' ');
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} product result(s):\n\n${summary}\n\nUse get_product_details with a rank number to see full details for a product.`
      }]
    };
  }
};
