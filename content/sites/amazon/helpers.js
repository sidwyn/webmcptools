// content/sites/amazon/helpers.js — Amazon-specific DOM utilities
// Extends WebMCPHelpers (loaded from content/helpers.js)

/**
 * Wait for Amazon search results to load.
 * Polls for product cards with data-asin attributes.
 */
WebMCPHelpers.waitForAmazonResults = async function(timeout = 15000) {
  const start = Date.now();

  function hasResults() {
    return document.querySelectorAll('[data-component-type="s-search-result"][data-asin]').length > 0 ||
           document.querySelectorAll('.s-result-item[data-asin]').length > 0;
  }

  if (hasResults()) return true;

  await WebMCPHelpers.sleep(500);
  if (hasResults()) return true;

  // Wait for any loading spinners to disappear
  try {
    await WebMCPHelpers.waitForElementToDisappear('.s-result-list-placeholder', Math.min(5000, timeout));
  } catch {
    // May not be present
  }

  // Poll for results
  return new Promise(resolve => {
    const check = () => {
      if (hasResults()) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 200);
    };
    check();
  });
};

/**
 * Wait for an Amazon product detail page to load.
 */
WebMCPHelpers.waitForAmazonProductPage = async function(timeout = 15000) {
  const start = Date.now();

  function hasProductInfo() {
    return document.getElementById('productTitle') !== null ||
           document.getElementById('title') !== null;
  }

  if (hasProductInfo()) return true;

  await WebMCPHelpers.sleep(500);
  if (hasProductInfo()) return true;

  return new Promise(resolve => {
    const check = () => {
      if (hasProductInfo()) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 200);
    };
    check();
  });
};

/**
 * Parse an Amazon price element into a numeric string like "$29.99".
 * Amazon uses split spans: .a-price-whole and .a-price-fraction, or .a-offscreen for screen readers.
 */
WebMCPHelpers.parseAmazonPrice = function(container) {
  if (!container) return null;

  // Screen-reader price (most reliable)
  const offscreen = container.querySelector('.a-offscreen');
  if (offscreen) {
    const text = offscreen.textContent.trim();
    if (/^\$[\d,.]+$/.test(text)) return text;
  }

  // Split spans
  const whole = container.querySelector('.a-price-whole');
  const fraction = container.querySelector('.a-price-fraction');
  if (whole) {
    const w = whole.textContent.replace(/[^0-9,]/g, '');
    const f = fraction ? fraction.textContent.replace(/[^0-9]/g, '') : '00';
    return `$${w}.${f}`;
  }

  // Fallback: look for dollar amount in text content
  const priceMatch = container.textContent.match(/\$[\d,.]+/);
  return priceMatch ? priceMatch[0] : null;
};

/**
 * Extract star rating from Amazon's icon span class.
 * Classes like "a-star-small-4-5" means 4.5 stars.
 */
WebMCPHelpers.parseAmazonStarRating = function(element) {
  if (!element) return null;

  // Look for the star icon element
  const starIcon = element.querySelector('[class*="a-star"]') || element;
  const className = starIcon.className || '';

  // Match patterns like "a-star-4-5" or "a-star-small-4-5"
  const match = className.match(/a-star(?:-small)?-(\d)-(\d)/);
  if (match) return parseFloat(`${match[1]}.${match[2]}`);

  const matchWhole = className.match(/a-star(?:-small)?-(\d)/);
  if (matchWhole) return parseInt(matchWhole[1], 10);

  // Fallback: aria-label like "4.5 out of 5 stars"
  const ariaLabel = element.getAttribute('aria-label') || '';
  const ariaMatch = ariaLabel.match(/([\d.]+)\s+out\s+of/);
  if (ariaMatch) return parseFloat(ariaMatch[1]);

  return null;
};

/**
 * Parse an Amazon search result card into structured data.
 */
WebMCPHelpers.parseAmazonProductCard = function(card, rank) {
  const asin = card.getAttribute('data-asin');
  if (!asin) return null;

  // Title
  const titleEl = card.querySelector('h2 a span') ||
                   card.querySelector('h2 span') ||
                   card.querySelector('[data-cy="title-recipe"] span');
  const title = titleEl ? titleEl.textContent.trim() : null;

  // URL
  const linkEl = card.querySelector('h2 a') || card.querySelector('a.a-link-normal[href*="/dp/"]');
  const url = linkEl ? linkEl.getAttribute('href') : null;

  // Price — find the main price (not the list/original price)
  const priceEl = card.querySelector('.a-price:not([data-a-strike])') ||
                  card.querySelector('[data-cy="price-recipe"] .a-price');
  const price = WebMCPHelpers.parseAmazonPrice(priceEl);

  // Original/list price (struck through)
  const origPriceEl = card.querySelector('.a-price[data-a-strike]') ||
                      card.querySelector('.a-text-price[data-a-strike]');
  const originalPrice = WebMCPHelpers.parseAmazonPrice(origPriceEl);

  // Rating
  const ratingEl = card.querySelector('[class*="a-star"]') ||
                   card.querySelector('[aria-label*="out of 5"]');
  const rating = WebMCPHelpers.parseAmazonStarRating(ratingEl);

  // Review count
  const reviewEl = card.querySelector('[aria-label*="stars"] + span') ||
                   card.querySelector('a[href*="customerReviews"] span') ||
                   card.querySelector('[data-cy="reviews-block"] span.a-size-base');
  let reviewCount = null;
  if (reviewEl) {
    const reviewText = reviewEl.textContent.replace(/[,\s]/g, '');
    const reviewMatch = reviewText.match(/(\d+)/);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1], 10);
  }

  // Prime badge
  const isPrime = card.querySelector('[aria-label="Amazon Prime"]') !== null ||
                  card.querySelector('.s-prime') !== null ||
                  card.querySelector('[data-cy="prime-badge"]') !== null;

  // Sponsored
  const isSponsored = card.querySelector('.puis-label-popover-default') !== null ||
                      card.textContent.includes('Sponsored');

  // Delivery info
  const deliveryEl = card.querySelector('[data-cy="delivery-recipe"]') ||
                     card.querySelector('.s-align-children-center span[aria-label*="delivery"]');
  const delivery = deliveryEl ? deliveryEl.textContent.trim().substring(0, 80) : null;

  return {
    rank,
    asin,
    title,
    price,
    originalPrice,
    rating,
    reviewCount,
    isPrime,
    isSponsored,
    delivery,
    url
  };
};

/**
 * Extract the ASIN from the current product detail page URL.
 */
WebMCPHelpers.getAmazonASIN = function() {
  const url = window.location.href;
  const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return match ? match[1] : null;
};

/**
 * Select a product variant (size, color, etc.) on the product detail page.
 */
WebMCPHelpers.selectAmazonVariant = async function(optionName, optionValue) {
  const lower = optionName.toLowerCase();
  const valueLower = optionValue.toLowerCase();

  // Try dropdown-based variants
  const selects = document.querySelectorAll('select');
  for (const sel of selects) {
    const label = (sel.getAttribute('aria-label') || sel.name || '').toLowerCase();
    if (label.includes(lower)) {
      const options = Array.from(sel.options);
      const match = options.find(o => o.textContent.toLowerCase().includes(valueLower));
      if (match) {
        sel.value = match.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await WebMCPHelpers.sleep(500);
        return true;
      }
    }
  }

  // Try button/swatch-based variants (color, size buttons)
  const swatches = document.querySelectorAll('[id*="variation"] li, [data-defaultasin] li, .swatchAvailable');
  for (const swatch of swatches) {
    const text = swatch.textContent.trim().toLowerCase();
    const ariaLabel = (swatch.getAttribute('aria-label') || '').toLowerCase();
    if (text.includes(valueLower) || ariaLabel.includes(valueLower)) {
      const btn = swatch.querySelector('button') || swatch.querySelector('a') || swatch;
      WebMCPHelpers.simulateClick(btn);
      await WebMCPHelpers.sleep(500);
      return true;
    }
  }

  return false;
};
