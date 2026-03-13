// content/sites/walmart/tools/getProductDetails.js

const GetProductDetailsTool = {
  name: 'get_product_details',
  description: 'Get detailed information about a product on Walmart. If on a product detail page, reads the current product. If given a rank number from search results, clicks that product to navigate to its detail page.',
  inputSchema: {
    type: 'object',
    properties: {
      rank: {
        type: 'integer',
        description: 'The rank number of the product from search results to click into. Omit if already on a product detail page.'
      }
    }
  },

  execute: async (args) => {
    const { rank } = args;
    const url = window.location.href;

    // If rank is given, click the product from search results
    if (rank) {
      if (!url.includes('walmart.com/search') && !url.includes('walmart.com/browse') && !url.includes('walmart.com/cp/')) {
        return { content: [{ type: 'text', text: 'ERROR: rank can only be used on a search results or category page. Navigate to search results first.' }] };
      }

      const cards = WebMCPHelpers.findWalmartProductCards();
      if (rank < 1 || rank > cards.length) {
        return { content: [{ type: 'text', text: `ERROR: rank ${rank} is out of range. There are ${cards.length} results on the page.` }] };
      }

      const card = cards[rank - 1];
      const link = card.querySelector('a[href*="/ip/"]');
      if (!link) {
        return { content: [{ type: 'text', text: `ERROR: Could not find a product link for result #${rank}.` }] };
      }

      // Navigate to the product page
      setTimeout(() => { window.location.href = link.href; }, 50);
      return {
        content: [{
          type: 'text',
          text: `Navigating to product #${rank}. Wait for the page to load, then call get_product_details again (without rank) to read the details.`
        }]
      };
    }

    // On a product detail page — parse it
    if (!url.includes('walmart.com/ip/')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a Walmart product detail page. Provide a rank number to navigate from search results, or navigate to a product page first.' }] };
    }

    // Wait for the page to load
    await WebMCPHelpers.sleep(1500);
    await WebMCPHelpers.waitForElement('[data-testid="product-title"], h1[itemprop="name"], #main-title', 10000).catch(() => {});

    const detail = WebMCPHelpers.parseWalmartProductDetail();

    if (!detail.title) {
      return { content: [{ type: 'text', text: 'Could not read product details. The page may still be loading. Try calling get_product_details again.' }] };
    }

    let text = `**${detail.title}**\n`;
    text += `Price: ${detail.price || 'Unavailable'}`;
    if (detail.originalPrice) text += ` (was ${detail.originalPrice})`;
    text += '\n';
    if (detail.rating) text += `Rating: ${detail.rating}/5`;
    if (detail.reviewCount) text += ` (${detail.reviewCount} reviews)`;
    if (detail.rating) text += '\n';
    text += `In Stock: ${detail.inStock ? 'Yes' : 'No'}\n`;
    text += `Sold by: ${detail.seller || 'Unknown'}\n`;
    if (detail.fulfillment) text += `Fulfillment: ${detail.fulfillment}\n`;

    if (detail.highlights && detail.highlights.length > 0) {
      text += `\nHighlights:\n${detail.highlights.map(h => `• ${h}`).join('\n')}\n`;
    }

    if (detail.specifications) {
      text += `\nSpecifications:\n`;
      for (const [key, val] of Object.entries(detail.specifications)) {
        text += `• ${key}: ${val}\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
};
