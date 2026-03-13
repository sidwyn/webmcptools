// content/sites/walmart/tools/getResults.js

const GetResultsTool = {
  name: 'get_results',
  description: 'Read the current product listings from a Walmart search results or category page and return them as structured data. Must be on a Walmart page with product results.',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return. Defaults to 5.'
      }
    }
  },

  execute: async (args) => {
    const { maxResults = 5 } = args;

    if (!window.location.href.includes('walmart.com')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on Walmart. Please navigate to walmart.com first.' }] };
    }

    // Wait for results to load
    const loaded = await WebMCPHelpers.waitForWalmartResults(25000);

    const cards = WebMCPHelpers.findWalmartProductCards();

    if (cards.length === 0) {
      return { content: [{ type: 'text', text: 'No product results found. The page may still be loading, or no products match your search. Try waiting a moment and calling get_results again.' }] };
    }

    const results = cards.slice(0, maxResults).map((card, i) =>
      WebMCPHelpers.parseWalmartProductCard(card, i + 1)
    );

    const summary = results.map(r => {
      let line = `${r.rank}. ${r.title || 'Unknown product'}`;
      line += ` — ${r.price || 'Price unavailable'}`;
      if (r.originalPrice) line += ` (was ${r.originalPrice})`;
      if (r.rating) line += ` | ${r.rating}/5`;
      if (r.reviewCount) line += ` (${r.reviewCount} reviews)`;
      if (r.seller) line += ` | ${r.seller}`;
      if (r.fulfillment) line += ` | ${r.fulfillment}`;
      if (r.outOfStock) line += ' | OUT OF STOCK';
      return line;
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${cards.length} product(s), showing top ${results.length}:\n\n${summary}`
      }]
    };
  }
};
