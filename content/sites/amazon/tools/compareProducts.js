// content/sites/amazon/tools/compareProducts.js

const CompareProductsTool = {
  name: 'compare_products',
  description: 'Compare key attributes of products from the current Amazon search results page side by side. Provide 2-4 product rank numbers to compare.',
  inputSchema: {
    type: 'object',
    properties: {
      ranks: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Array of 2-4 product rank numbers from search results to compare (e.g., [1, 3, 5]).'
      }
    },
    required: ['ranks']
  },

  execute: async (args) => {
    const { ranks } = args;

    if (!window.location.href.includes('amazon.com/s')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon search results page. Call search_products first.' }] };
    }

    if (!Array.isArray(ranks) || ranks.length < 2 || ranks.length > 4) {
      return { content: [{ type: 'text', text: 'ERROR: Provide 2-4 rank numbers to compare.' }] };
    }

    let cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"][data-asin]'));
    if (cards.length === 0) {
      cards = Array.from(document.querySelectorAll('.s-result-item[data-asin]'));
    }
    cards = cards.filter(c => c.getAttribute('data-asin').length > 0);

    const products = [];
    for (const rank of ranks) {
      if (rank < 1 || rank > cards.length) {
        return { content: [{ type: 'text', text: `Invalid rank ${rank}. There are ${cards.length} results.` }] };
      }
      const parsed = WebMCPHelpers.parseAmazonProductCard(cards[rank - 1], rank);
      if (parsed) products.push(parsed);
    }

    if (products.length < 2) {
      return { content: [{ type: 'text', text: 'Could not parse enough products to compare.' }] };
    }

    // Build comparison table
    let output = 'Product Comparison\n' + '='.repeat(40) + '\n\n';

    // Title row
    const maxTitleLen = 35;
    output += 'Attribute'.padEnd(18);
    for (const p of products) {
      const shortTitle = p.title ? (p.title.length > maxTitleLen ? p.title.substring(0, maxTitleLen - 3) + '...' : p.title) : 'Unknown';
      output += `| #${p.rank} ${shortTitle} `.substring(0, 40).padEnd(40);
    }
    output += '\n' + '-'.repeat(18 + products.length * 40) + '\n';

    // Rows
    const rows = [
      ['Price', p => p.price || 'N/A'],
      ['Original', p => p.originalPrice || '—'],
      ['Rating', p => p.rating ? `★${p.rating}` : 'N/A'],
      ['Reviews', p => p.reviewCount ? p.reviewCount.toLocaleString() : 'N/A'],
      ['Prime', p => p.isPrime ? 'Yes' : 'No'],
      ['Sponsored', p => p.isSponsored ? 'Yes' : 'No']
    ];

    for (const [label, getter] of rows) {
      output += label.padEnd(18);
      for (const p of products) {
        output += `| ${getter(p)} `.padEnd(40);
      }
      output += '\n';
    }

    output += '\nUse get_product_details with a rank number to see full details for any of these products.';

    return { content: [{ type: 'text', text: output }] };
  }
};
