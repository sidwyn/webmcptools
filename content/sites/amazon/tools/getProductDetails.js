// content/sites/amazon/tools/getProductDetails.js

const GetProductDetailsTool = {
  name: 'get_product_details',
  description: 'Read detailed information about a product. If on a product detail page, reads the current product. If a rank is provided (from search results), navigates to that product first.',
  inputSchema: {
    type: 'object',
    properties: {
      rank: {
        type: 'integer',
        description: '1-based rank of the product from search results to navigate to. Omit to read the current product page.'
      }
    }
  },

  execute: async (args) => {
    const { rank } = args;

    // If rank is provided, navigate to that product from search results
    if (rank) {
      if (!window.location.href.includes('amazon.com/s')) {
        return { content: [{ type: 'text', text: 'ERROR: Must be on an Amazon search results page to use rank. Call search_products first.' }] };
      }

      let cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"][data-asin]'));
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.s-result-item[data-asin]'));
      }
      cards = cards.filter(c => c.getAttribute('data-asin').length > 0);

      if (rank < 1 || rank > cards.length) {
        return { content: [{ type: 'text', text: `Invalid rank ${rank}. There are ${cards.length} results. Use a rank between 1 and ${cards.length}.` }] };
      }

      const card = cards[rank - 1];
      const link = card.querySelector('h2 a') || card.querySelector('a.a-link-normal[href*="/dp/"]');
      if (link) {
        setTimeout(() => { link.click(); }, 50);
        return { content: [{ type: 'text', text: `Navigating to product #${rank}. Wait for the page to load, then call get_product_details again (without rank) to read the details.` }] };
      }
      return { content: [{ type: 'text', text: `Could not find a link for product #${rank}.` }] };
    }

    // Read the current product detail page
    const isProductPage = /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(window.location.href);
    if (!isProductPage) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon product detail page. Navigate to a product first (use rank parameter from search results).' }] };
    }

    await WebMCPHelpers.waitForAmazonProductPage(10000);

    const asin = WebMCPHelpers.getAmazonASIN();

    // Title
    const titleEl = document.getElementById('productTitle') || document.getElementById('title');
    const title = titleEl ? titleEl.textContent.trim() : 'Unknown';

    // Price
    const priceEl = document.querySelector('#corePrice_feature_div .a-price') ||
                    document.querySelector('#priceblock_ourprice') ||
                    document.querySelector('#priceblock_dealprice') ||
                    document.querySelector('.a-price.aok-align-center');
    const price = WebMCPHelpers.parseAmazonPrice(priceEl);

    // Original/list price
    const origPriceEl = document.querySelector('#corePrice_feature_div .a-price[data-a-strike]') ||
                        document.querySelector('#priceblock_ourprice_row .a-text-price');
    const originalPrice = WebMCPHelpers.parseAmazonPrice(origPriceEl);

    // Savings
    const savingsEl = document.querySelector('#corePrice_feature_div .savingsPercentage') ||
                      document.querySelector('.priceBlockSavingsString');
    const savings = savingsEl ? savingsEl.textContent.trim() : null;

    // Rating
    const ratingEl = document.querySelector('#averageCustomerReviews [class*="a-star"]') ||
                     document.querySelector('#acrPopover');
    const rating = WebMCPHelpers.parseAmazonStarRating(ratingEl);

    // Review count
    const reviewCountEl = document.getElementById('acrCustomerReviewCount') ||
                          document.querySelector('#acrCustomerReviewLink span');
    let reviewCount = null;
    if (reviewCountEl) {
      const match = reviewCountEl.textContent.replace(/[,\s]/g, '').match(/(\d+)/);
      if (match) reviewCount = parseInt(match[1], 10);
    }

    // Availability
    const availEl = document.getElementById('availability') ||
                    document.querySelector('#outOfStock');
    const availability = availEl ? availEl.textContent.trim().replace(/\s+/g, ' ') : null;

    // Sold by / shipped by
    const sellerEl = document.getElementById('merchant-info') ||
                     document.querySelector('#tabular-buybox .tabular-buybox-text');
    const seller = sellerEl ? sellerEl.textContent.trim().replace(/\s+/g, ' ') : null;

    // Bullet points (feature list)
    const bullets = [];
    const bulletEls = document.querySelectorAll('#feature-bullets li span.a-list-item');
    for (const el of bulletEls) {
      const text = el.textContent.trim();
      if (text.length > 5 && !text.includes('Click here') && !text.includes('Make sure')) {
        bullets.push(text);
      }
    }

    // Product description
    const descEl = document.getElementById('productDescription');
    const description = descEl ? descEl.textContent.trim().substring(0, 500) : null;

    // Specifications table
    const specs = {};
    const specRows = document.querySelectorAll('#productDetails_techSpec_section_1 tr, #detailBullets_feature_div li');
    for (const row of specRows) {
      const cells = row.querySelectorAll('th, td');
      if (cells.length >= 2) {
        const key = cells[0].textContent.trim();
        const val = cells[1].textContent.trim();
        if (key && val) specs[key] = val;
      } else {
        // Detail bullets format: "key : value"
        const text = row.textContent.trim();
        const colonSplit = text.split(/\s*:\s*/);
        if (colonSplit.length >= 2) {
          specs[colonSplit[0].trim()] = colonSplit.slice(1).join(': ').trim();
        }
      }
    }

    // Variant options
    const variants = {};
    const variationSections = document.querySelectorAll('[id*="variation_"] .a-row');
    for (const section of variationSections) {
      const labelEl = section.querySelector('.a-form-label, .a-size-base');
      if (!labelEl) continue;
      const label = labelEl.textContent.replace(/:$/, '').trim();
      const options = [];
      const optionEls = section.querySelectorAll('li[title], option, .swatchAvailable');
      for (const opt of optionEls) {
        const val = opt.getAttribute('title') || opt.textContent.trim();
        if (val && val !== 'Select') options.push(val.replace('Click to select ', ''));
      }
      if (label && options.length > 0) variants[label] = options;
    }

    // Build output
    let output = `Product Details\n${'='.repeat(40)}\n\n`;
    output += `Title: ${title}\n`;
    if (asin) output += `ASIN: ${asin}\n`;
    if (price) output += `Price: ${price}\n`;
    if (originalPrice) output += `Original Price: ${originalPrice}\n`;
    if (savings) output += `Savings: ${savings}\n`;
    if (rating) output += `Rating: ★${rating}`;
    if (reviewCount) output += ` (${reviewCount.toLocaleString()} reviews)`;
    if (rating) output += '\n';
    if (availability) output += `Availability: ${availability}\n`;
    if (seller) output += `Seller: ${seller}\n`;

    if (Object.keys(variants).length > 0) {
      output += `\nVariants:\n`;
      for (const [key, vals] of Object.entries(variants)) {
        output += `  ${key}: ${vals.join(', ')}\n`;
      }
    }

    if (bullets.length > 0) {
      output += `\nKey Features:\n`;
      for (const b of bullets.slice(0, 8)) {
        output += `  • ${b}\n`;
      }
    }

    if (Object.keys(specs).length > 0) {
      output += `\nSpecifications:\n`;
      for (const [key, val] of Object.entries(specs).slice(0, 10)) {
        output += `  ${key}: ${val}\n`;
      }
    }

    if (description) {
      output += `\nDescription:\n${description}\n`;
    }

    return { content: [{ type: 'text', text: output.trim() }] };
  }
};
