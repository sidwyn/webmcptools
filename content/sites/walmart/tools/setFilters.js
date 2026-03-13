// content/sites/walmart/tools/setFilters.js

const SetFiltersTool = {
  name: 'set_filters',
  description: 'Apply filters to Walmart search results. Filters include price range, brand, fulfillment method, minimum customer rating, and special offers. Must be on a search results page.',
  inputSchema: {
    type: 'object',
    properties: {
      priceMin: {
        type: 'number',
        description: 'Minimum price in dollars (e.g., 10)'
      },
      priceMax: {
        type: 'number',
        description: 'Maximum price in dollars (e.g., 50)'
      },
      brand: {
        type: 'string',
        description: 'Brand name to filter by (e.g., "Samsung", "Nike")'
      },
      fulfillment: {
        type: 'string',
        enum: ['shipping', 'pickup', 'delivery'],
        description: 'Filter by fulfillment method'
      },
      rating: {
        type: 'integer',
        description: 'Minimum customer rating (1-4, filters to X stars and up)'
      },
      specialOffers: {
        type: 'string',
        enum: ['rollback', 'clearance', 'reduced_price'],
        description: 'Filter by special offer type'
      }
    }
  },

  execute: async (args) => {
    const { priceMin, priceMax, brand, fulfillment, rating, specialOffers } = args;
    const url = window.location.href;

    if (!url.includes('walmart.com/search') && !url.includes('walmart.com/browse') && !url.includes('walmart.com/cp/')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a Walmart search/category page. Search for products first.' }] };
    }

    const applied = [];

    // Price range filter — use URL params for reliability
    if (priceMin !== undefined || priceMax !== undefined) {
      const currentUrl = new URL(window.location.href);
      if (priceMin !== undefined) currentUrl.searchParams.set('min_price', priceMin);
      if (priceMax !== undefined) currentUrl.searchParams.set('max_price', priceMax);

      setTimeout(() => { window.location.href = currentUrl.toString(); }, 50);

      let priceDesc = 'Price: ';
      if (priceMin !== undefined && priceMax !== undefined) priceDesc += `$${priceMin} – $${priceMax}`;
      else if (priceMin !== undefined) priceDesc += `$${priceMin}+`;
      else priceDesc += `up to $${priceMax}`;
      applied.push(priceDesc);

      return {
        content: [{
          type: 'text',
          text: `Applying filter: ${priceDesc}. Page will reload — call get_results after it loads.`
        }]
      };
    }

    // Brand filter — click the brand checkbox in the filter sidebar
    if (brand) {
      const brandSection = WebMCPHelpers.findByText('Brand', 'h2') ||
                           WebMCPHelpers.findByText('Brand', 'button') ||
                           WebMCPHelpers.findByText('Brand', 'span');

      if (brandSection) {
        const container = brandSection.closest('[data-testid]') || brandSection.closest('div');
        if (container) {
          const brandOption = Array.from(container.querySelectorAll('label, button, a, span'))
            .find(el => el.textContent.trim().toLowerCase() === brand.toLowerCase());
          if (brandOption) {
            WebMCPHelpers.simulateClick(brandOption.closest('label') || brandOption);
            applied.push(`Brand: ${brand}`);
            await WebMCPHelpers.sleep(2000);
          } else {
            return { content: [{ type: 'text', text: `Could not find brand "${brand}" in the filter options. Try checking available brands on the page.` }] };
          }
        }
      }
      if (!applied.length) {
        // Fallback: try URL parameter
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('brand', brand);
        setTimeout(() => { window.location.href = currentUrl.toString(); }, 50);
        applied.push(`Brand: ${brand}`);
        return {
          content: [{
            type: 'text',
            text: `Applying brand filter: ${brand}. Page will reload — call get_results after it loads.`
          }]
        };
      }
    }

    // Fulfillment filter
    if (fulfillment) {
      const fulfillmentLabels = {
        shipping: ['Shipping', '2-day shipping', 'Free shipping'],
        pickup: ['Pickup', 'Store pickup', 'Free pickup'],
        delivery: ['Delivery', 'Same-day delivery']
      };
      const labels = fulfillmentLabels[fulfillment] || [fulfillment];
      let found = false;
      for (const label of labels) {
        const el = WebMCPHelpers.findByText(label, 'label') ||
                   WebMCPHelpers.findByText(label, 'button') ||
                   WebMCPHelpers.findByText(label, 'a');
        if (el) {
          WebMCPHelpers.simulateClick(el.closest('label') || el);
          applied.push(`Fulfillment: ${fulfillment}`);
          found = true;
          await WebMCPHelpers.sleep(2000);
          break;
        }
      }
      if (!found) {
        return { content: [{ type: 'text', text: `Could not find "${fulfillment}" fulfillment filter on the page.` }] };
      }
    }

    // Rating filter
    if (rating !== undefined) {
      if (rating < 1 || rating > 4) {
        return { content: [{ type: 'text', text: 'ERROR: rating must be between 1 and 4 (X stars & up).' }] };
      }
      const ratingEl = WebMCPHelpers.findByText(`${rating} Stars`, 'label') ||
                       WebMCPHelpers.findByText(`${rating} stars & up`, 'button') ||
                       WebMCPHelpers.findByText(`${rating} Stars & Up`, 'a') ||
                       document.querySelector(`[aria-label*="${rating} stars"]`);
      if (ratingEl) {
        WebMCPHelpers.simulateClick(ratingEl.closest('label') || ratingEl);
        applied.push(`Rating: ${rating}+ stars`);
        await WebMCPHelpers.sleep(2000);
      } else {
        return { content: [{ type: 'text', text: `Could not find a ${rating}-star rating filter on the page.` }] };
      }
    }

    // Special offers filter
    if (specialOffers) {
      const offerLabels = {
        rollback: ['Rollback', 'Rollback!'],
        clearance: ['Clearance'],
        reduced_price: ['Reduced Price', 'Reduced price']
      };
      const labels = offerLabels[specialOffers] || [specialOffers];
      let found = false;
      for (const label of labels) {
        const el = WebMCPHelpers.findByText(label, 'label') ||
                   WebMCPHelpers.findByText(label, 'button') ||
                   WebMCPHelpers.findByText(label, 'a');
        if (el) {
          WebMCPHelpers.simulateClick(el.closest('label') || el);
          applied.push(`Special offer: ${specialOffers.replace(/_/g, ' ')}`);
          found = true;
          await WebMCPHelpers.sleep(2000);
          break;
        }
      }
      if (!found) {
        return { content: [{ type: 'text', text: `Could not find "${specialOffers.replace(/_/g, ' ')}" offer filter on the page.` }] };
      }
    }

    if (applied.length === 0) {
      return { content: [{ type: 'text', text: 'No filters were specified. Provide at least one filter parameter (priceMin, priceMax, brand, fulfillment, rating, or specialOffers).' }] };
    }

    return {
      content: [{
        type: 'text',
        text: `Applied filters: ${applied.join(', ')}. Call get_results to see the filtered products.`
      }]
    };
  }
};
