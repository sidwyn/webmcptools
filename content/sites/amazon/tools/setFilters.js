// content/sites/amazon/tools/setFilters.js

const SetFiltersTool = {
  name: 'set_filters',
  description: 'Apply filters to Amazon search results. Supports price range, Prime-only, minimum star rating, brand, and condition. Only works on an Amazon search results page.',
  inputSchema: {
    type: 'object',
    properties: {
      minPrice: {
        type: 'number',
        description: 'Minimum price in dollars (e.g., 25)'
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price in dollars (e.g., 100)'
      },
      primeOnly: {
        type: 'boolean',
        description: 'Filter to show only Prime-eligible items'
      },
      minRating: {
        type: 'integer',
        enum: [1, 2, 3, 4],
        description: 'Minimum star rating (1-4). Filters to "X Stars & Up".'
      },
      brand: {
        type: 'string',
        description: 'Comma-separated brand names to filter by (e.g., "Apple, Samsung")'
      },
      condition: {
        type: 'string',
        enum: ['new', 'used', 'renewed'],
        description: 'Product condition filter'
      }
    }
  },

  execute: async (args) => {
    if (!window.location.href.includes('amazon.com/s')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon search results page.' }] };
    }

    const actions = [];

    // ── Price range ──────────────────────────────────────────────────────────
    if (args.minPrice !== undefined || args.maxPrice !== undefined) {
      const lowInput = document.getElementById('low-price') ||
                       document.querySelector('input[name="low-price"]');
      const highInput = document.getElementById('high-price') ||
                        document.querySelector('input[name="high-price"]');
      const goBtn = document.querySelector('.a-button-input[type="submit"]') ||
                    document.querySelector('#priceRefinements .a-button-input') ||
                    WebMCPHelpers.findByText('Go', 'input') ||
                    WebMCPHelpers.findByText('Go', 'button');

      if (lowInput && highInput) {
        if (args.minPrice !== undefined) {
          lowInput.value = '';
          lowInput.value = String(args.minPrice);
          lowInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (args.maxPrice !== undefined) {
          highInput.value = '';
          highInput.value = String(args.maxPrice);
          highInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (goBtn) {
          WebMCPHelpers.simulateClick(goBtn);
          await WebMCPHelpers.sleep(1000);
        }
        actions.push(`Set price range: $${args.minPrice || '0'} – $${args.maxPrice || '∞'}`);
      } else {
        // Fallback: use URL parameters
        const url = new URL(window.location.href);
        if (args.minPrice !== undefined) url.searchParams.set('low-price', args.minPrice);
        if (args.maxPrice !== undefined) url.searchParams.set('high-price', args.maxPrice);
        setTimeout(() => { window.location.href = url.toString(); }, 50);
        return {
          content: [{ type: 'text', text: `Navigating with price filter: $${args.minPrice || '0'} – $${args.maxPrice || '∞'}. Wait for the page to load, then call get_results.` }]
        };
      }
    }

    // ── Prime only ──────────────────────────────────────────────────────────
    if (args.primeOnly) {
      const primeLink = document.querySelector('a[aria-label*="Prime"]') ||
                        document.querySelector('#primeRefinements a') ||
                        WebMCPHelpers.findByAriaLabel('Prime Eligible');

      if (primeLink) {
        WebMCPHelpers.simulateClick(primeLink);
        await WebMCPHelpers.sleep(1000);
        actions.push('Filtered to Prime-eligible items');
      } else {
        // Fallback: URL param
        const url = new URL(window.location.href);
        url.searchParams.set('rh', (url.searchParams.get('rh') || '') + ',p_85:2470955011');
        setTimeout(() => { window.location.href = url.toString(); }, 50);
        return {
          content: [{ type: 'text', text: 'Navigating with Prime filter. Wait for the page to load, then call get_results.' }]
        };
      }
    }

    // ── Star rating ─────────────────────────────────────────────────────────
    if (args.minRating) {
      const ratingLabels = {
        4: '4 Stars & Up',
        3: '3 Stars & Up',
        2: '2 Stars & Up',
        1: '1 Star & Up'
      };
      const label = ratingLabels[args.minRating];
      const ratingLink = WebMCPHelpers.findByAriaLabel(label) ||
                         WebMCPHelpers.findByText(label, 'a') ||
                         document.querySelector(`[aria-label="${label}"]`);

      if (ratingLink) {
        WebMCPHelpers.simulateClick(ratingLink);
        await WebMCPHelpers.sleep(1000);
        actions.push(`Filtered to ${label}`);
      } else {
        actions.push(`WARNING: Could not find rating filter for "${label}"`);
      }
    }

    // ── Brand ───────────────────────────────────────────────────────────────
    if (args.brand) {
      const brands = args.brand.split(',').map(b => b.trim().toLowerCase());
      let found = 0;

      for (const brand of brands) {
        // Look for brand checkboxes in the sidebar
        const brandLinks = document.querySelectorAll('#brandsRefinements a, [id*="brand"] a, .a-checkbox label');
        for (const link of brandLinks) {
          const text = link.textContent.trim().toLowerCase();
          if (text.includes(brand)) {
            WebMCPHelpers.simulateClick(link);
            await WebMCPHelpers.sleep(500);
            found++;
            break;
          }
        }
      }

      if (found > 0) {
        actions.push(`Filtered to brand(s): ${args.brand}`);
        await WebMCPHelpers.sleep(500);
      } else {
        actions.push(`WARNING: Could not find brand filter for "${args.brand}"`);
      }
    }

    // ── Condition ───────────────────────────────────────────────────────────
    if (args.condition) {
      const conditionLabels = {
        new: 'New',
        used: 'Used',
        renewed: 'Renewed'
      };
      const label = conditionLabels[args.condition];
      const condLink = WebMCPHelpers.findByText(label, 'a') ||
                       WebMCPHelpers.findByAriaLabel(label);

      if (condLink) {
        WebMCPHelpers.simulateClick(condLink);
        await WebMCPHelpers.sleep(1000);
        actions.push(`Filtered to condition: ${label}`);
      } else {
        actions.push(`WARNING: Could not find condition filter for "${label}"`);
      }
    }

    if (actions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No filters specified. Available: minPrice, maxPrice, primeOnly, minRating, brand, condition.'
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Filters applied:\n${actions.join('\n')}\n\nCall get_results to see the updated products.`
      }]
    };
  }
};
