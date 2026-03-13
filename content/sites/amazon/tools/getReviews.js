// content/sites/amazon/tools/getReviews.js

const GetReviewsTool = {
  name: 'get_reviews',
  description: 'Read customer reviews for the current product on its Amazon detail page. Shows review rating, title, body, and verified purchase status.',
  inputSchema: {
    type: 'object',
    properties: {
      sortBy: {
        type: 'string',
        enum: ['top_reviews', 'most_recent'],
        description: 'Sort reviews by "top_reviews" (default) or "most_recent".'
      },
      filterByStars: {
        type: 'string',
        enum: ['all', '5', '4', '3', '2', '1', 'positive', 'critical'],
        description: 'Filter reviews by star rating. Defaults to "all".'
      },
      maxReviews: {
        type: 'integer',
        description: 'Maximum number of reviews to return. Defaults to 5.'
      }
    }
  },

  execute: async (args) => {
    const { sortBy = 'top_reviews', filterByStars = 'all', maxReviews = 5 } = args;

    const isProductPage = /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(window.location.href);
    if (!isProductPage) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon product page. Navigate to a product first.' }] };
    }

    // Sort dropdown
    if (sortBy === 'most_recent') {
      const sortDropdown = document.getElementById('sort-order-dropdown') ||
                           WebMCPHelpers.findByText('Top reviews', 'select');
      if (sortDropdown && sortDropdown.tagName === 'SELECT') {
        const recentOpt = Array.from(sortDropdown.options).find(o => /recent/i.test(o.textContent));
        if (recentOpt) {
          sortDropdown.value = recentOpt.value;
          sortDropdown.dispatchEvent(new Event('change', { bubbles: true }));
          await WebMCPHelpers.sleep(1000);
        }
      }
    }

    // Star filter
    if (filterByStars !== 'all') {
      const filterMap = {
        '5': 'five_star',
        '4': 'four_star',
        '3': 'three_star',
        '2': 'two_star',
        '1': 'one_star',
        positive: 'positive',
        critical: 'critical'
      };
      const filterLink = document.querySelector(`a[data-reftag*="${filterMap[filterByStars]}"]`) ||
                          WebMCPHelpers.findByText(`${filterByStars} star`, 'a');
      if (filterLink) {
        WebMCPHelpers.simulateClick(filterLink);
        await WebMCPHelpers.sleep(1000);
      }
    }

    // Parse reviews
    const reviewEls = document.querySelectorAll('[data-hook="review"], #cm_cr-review_list .review, .review-views .review');
    const reviews = [];

    for (let i = 0; i < Math.min(reviewEls.length, maxReviews); i++) {
      const el = reviewEls[i];

      // Star rating
      const starEl = el.querySelector('[data-hook="review-star-rating"], [class*="a-star"]');
      const stars = WebMCPHelpers.parseAmazonStarRating(starEl);

      // Title
      const titleEl = el.querySelector('[data-hook="review-title"] span:not(.a-letter-space)') ||
                       el.querySelector('.review-title span');
      const title = titleEl ? titleEl.textContent.trim() : null;

      // Author
      const authorEl = el.querySelector('[data-hook="review-author"], .a-profile-name');
      const author = authorEl ? authorEl.textContent.trim() : null;

      // Date
      const dateEl = el.querySelector('[data-hook="review-date"]');
      const date = dateEl ? dateEl.textContent.trim() : null;

      // Verified purchase
      const verifiedEl = el.querySelector('[data-hook="avp-badge"], .a-color-state');
      const verifiedPurchase = verifiedEl ? /verified/i.test(verifiedEl.textContent) : false;

      // Body
      const bodyEl = el.querySelector('[data-hook="review-body"] span, .review-text-content span');
      const body = bodyEl ? bodyEl.textContent.trim().substring(0, 500) : null;

      // Helpful votes
      const helpfulEl = el.querySelector('[data-hook="helpful-vote-statement"]');
      let helpfulVotes = null;
      if (helpfulEl) {
        const match = helpfulEl.textContent.match(/(\d+)/);
        if (match) helpfulVotes = parseInt(match[1], 10);
      }

      reviews.push({ stars, title, author, date, verifiedPurchase, body, helpfulVotes });
    }

    if (reviews.length === 0) {
      return { content: [{ type: 'text', text: 'No reviews found on this page. The product may have no reviews yet, or the reviews section may not be visible.' }] };
    }

    const summary = reviews.map((r, i) => {
      let text = `${i + 1}. ★${r.stars || '?'} — "${r.title || 'No title'}"`;
      if (r.author) text += ` by ${r.author}`;
      if (r.verifiedPurchase) text += ' [Verified]';
      if (r.date) text += `\n   ${r.date}`;
      if (r.body) text += `\n   ${r.body.length > 200 ? r.body.substring(0, 197) + '...' : r.body}`;
      if (r.helpfulVotes) text += `\n   ${r.helpfulVotes} people found this helpful`;
      return text;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Customer Reviews (${reviews.length} shown):\n\n${summary}`
      }]
    };
  }
};
