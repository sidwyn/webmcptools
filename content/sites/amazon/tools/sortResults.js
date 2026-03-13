// content/sites/amazon/tools/sortResults.js

const SortResultsTool = {
  name: 'sort_results',
  description: 'Change the sort order of Amazon search results. Only works on an Amazon search results page.',
  inputSchema: {
    type: 'object',
    properties: {
      sortBy: {
        type: 'string',
        enum: ['featured', 'price_low_to_high', 'price_high_to_low', 'avg_customer_review', 'newest_arrivals'],
        description: 'Sort order to apply to search results.'
      }
    },
    required: ['sortBy']
  },

  execute: async (args) => {
    const { sortBy } = args;

    if (!window.location.href.includes('amazon.com/s')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon search results page.' }] };
    }

    const sortLabels = {
      featured: 'Featured',
      price_low_to_high: 'Price: Low to High',
      price_high_to_low: 'Price: High to Low',
      avg_customer_review: 'Avg. Customer Review',
      newest_arrivals: 'Newest Arrivals'
    };

    const targetLabel = sortLabels[sortBy];
    if (!targetLabel) {
      return { content: [{ type: 'text', text: `ERROR: Invalid sortBy value. Use one of: ${Object.keys(sortLabels).join(', ')}` }] };
    }

    // Try the sort dropdown (Amazon uses a <select> or a button dropdown)
    const sortSelect = document.getElementById('s-result-sort-select') ||
                       document.querySelector('[aria-label="Sort by:"]') ||
                       document.querySelector('#a-autoid-0-announce');

    if (sortSelect && sortSelect.tagName === 'SELECT') {
      // Native <select> element
      const options = Array.from(sortSelect.options);
      const target = options.find(o => o.textContent.trim().includes(targetLabel));
      if (target) {
        sortSelect.value = target.value;
        sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await WebMCPHelpers.sleep(1000);
        return {
          content: [{ type: 'text', text: `Sorted results by: ${targetLabel}. Call get_results to see the updated order.` }]
        };
      }
    }

    // Try clicking the sort dropdown button to open it
    const sortButton = document.querySelector('.a-dropdown-container #a-autoid-0-announce') ||
                       document.querySelector('[aria-label*="Sort by"]') ||
                       WebMCPHelpers.findByText('Sort by:', 'span');

    if (sortButton) {
      WebMCPHelpers.simulateClick(sortButton);
      await WebMCPHelpers.sleep(300);

      // Find the option in the dropdown
      const dropdownItems = document.querySelectorAll('.a-popover-inner li a, .a-dropdown-item a');
      for (const item of dropdownItems) {
        if (item.textContent.trim().includes(targetLabel)) {
          WebMCPHelpers.simulateClick(item);
          await WebMCPHelpers.sleep(1000);
          return {
            content: [{ type: 'text', text: `Sorted results by: ${targetLabel}. Call get_results to see the updated order.` }]
          };
        }
      }
    }

    // Fallback: modify URL directly
    const sortMap = {
      featured: '',
      price_low_to_high: 'price-asc-rank',
      price_high_to_low: 'price-desc-rank',
      avg_customer_review: 'review-rank',
      newest_arrivals: 'date-desc-rank'
    };

    const url = new URL(window.location.href);
    const sortVal = sortMap[sortBy];
    if (sortVal) {
      url.searchParams.set('s', sortVal);
    } else {
      url.searchParams.delete('s');
    }

    setTimeout(() => { window.location.href = url.toString(); }, 50);

    return {
      content: [{ type: 'text', text: `Navigating to results sorted by: ${targetLabel}. Wait for the page to load, then call get_results.` }]
    };
  }
};
