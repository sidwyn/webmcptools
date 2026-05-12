// content/sites/amazon/helpers.js — Amazon-specific DOM utilities

WebMCPHelpers.waitForAmazonResults = async function(timeout = 15000) {
  const start = Date.now();

  function hasResults() {
    return document.querySelectorAll('[data-component-type="s-search-result"][data-asin]').length > 0 ||
           document.querySelectorAll('.s-result-item[data-asin]').length > 0;
  }

  if (hasResults()) return true;

  await WebMCPHelpers.sleep(500);
  if (hasResults()) return true;

  try {
    await WebMCPHelpers.waitForElementToDisappear('.s-result-list-placeholder', Math.min(5000, timeout));
  } catch {}

  return new Promise(resolve => {
    const check = () => {
      if (hasResults()) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 200);
    };
    check();
  });
};

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

WebMCPHelpers.parseAmazonPrice = function(container) {
  if (!container) return null;

  const offscreen = container.querySelector('.a-offscreen');
  if (offscreen) {
    const text = offscreen.textContent.trim();
    if (/^\$[\d,.]+$/.test(text)) return text;
  }

  const whole = container.querySelector('.a-price-whole');
  const fraction = container.querySelector('.a-price-fraction');
  if (whole) {
    const w = whole.textContent.replace(/[^0-9,]/g, '');
    const f = fraction ? fraction.textContent.replace(/[^0-9]/g, '') : '00';
    return `$${w}.${f}`;
  }

  const priceMatch = container.textContent.match(/\$[\d,.]+/);
  return priceMatch ? priceMatch[0] : null;
};

WebMCPHelpers.parseAmazonStarRating = function(element) {
  if (!element) return null;

  const starIcon = element.querySelector('[class*="a-star"]') || element;
  const className = starIcon.className || '';

  const match = className.match(/a-star(?:-small|-mini)?-(\d)-(\d)/);
  if (match) return parseFloat(`${match[1]}.${match[2]}`);

  const matchWhole = className.match(/a-star(?:-small|-mini)?-(\d)/);
  if (matchWhole) return parseInt(matchWhole[1], 10);

  const ariaLabel = element.getAttribute('aria-label') || '';
  const ariaMatch = ariaLabel.match(/([\d.]+)\s+out\s+of/);
  if (ariaMatch) return parseFloat(ariaMatch[1]);

  return null;
};

WebMCPHelpers.AMAZON_PARSER_KEY = 'amazon.searchResults';

WebMCPHelpers._amazonBaselines = {
  title: (c) => {
    const el = c.querySelector('h2 a span') || c.querySelector('h2 span') || c.querySelector('[data-cy="title-recipe"] span');
    return el ? el.textContent.trim() : null;
  },
  url: (c) => {
    const h2 = c.querySelector('h2');
    const link = (h2 && h2.closest('a')) || c.querySelector('h2 a') || c.querySelector('a.a-link-normal[href*="/dp/"]');
    return link ? link.getAttribute('href') : null;
  },
  price: (c) => {
    const el = c.querySelector('.a-price:not([data-a-strike])') || c.querySelector('[data-cy="price-recipe"] .a-price');
    return WebMCPHelpers.parseAmazonPrice(el);
  },
  originalPrice: (c) => {
    const el = c.querySelector('.a-price[data-a-strike]') || c.querySelector('.a-text-price[data-a-strike]');
    return WebMCPHelpers.parseAmazonPrice(el);
  },
  rating: (c) => {
    const el = c.querySelector('[aria-label*="out of 5"]') || c.querySelector('[class*="a-star"]');
    return WebMCPHelpers.parseAmazonStarRating(el);
  },
  reviewCount: (c) => {
    const el = c.querySelector('[aria-label*="stars"] + span') ||
               c.querySelector('a[href*="customerReviews"] span') ||
               c.querySelector('[data-cy="reviews-block"] span.a-size-base');
    if (!el) return null;
    const text = el.textContent.trim();
    const kMatch = text.match(/([\d.]+)K/i);
    if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
    const numMatch = text.replace(/[,\s()]/g, '').match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : null;
  },
  delivery: (c) => {
    const el = c.querySelector('[data-cy="delivery-recipe"]') ||
               c.querySelector('.s-align-children-center span[aria-label*="delivery"]');
    return el ? el.textContent.trim().substring(0, 80) : null;
  }
};

WebMCPHelpers.parseAmazonProductCard = function(card, rank) {
  const asin = card.getAttribute('data-asin');
  if (!asin) return null;

  const learning = (typeof window !== 'undefined' && window.WebMCPLearning) ? window.WebMCPLearning : null;
  const baselines = WebMCPHelpers._amazonBaselines;
  const key = WebMCPHelpers.AMAZON_PARSER_KEY;

  const resolve = (field) => learning
    ? learning.resolveField(card, key, field, baselines[field])
    : baselines[field](card);

  const title = resolve('title');
  const url = resolve('url');
  const price = resolve('price');
  const originalPrice = resolve('originalPrice');
  const rating = resolve('rating');
  const reviewCount = resolve('reviewCount');
  const delivery = resolve('delivery');

  const isPrime = card.querySelector('[aria-label="Amazon Prime"]') !== null ||
                  card.querySelector('[aria-label="Prime"]') !== null ||
                  card.querySelector('.s-prime') !== null ||
                  card.querySelector('[data-cy="prime-badge"]') !== null;

  const isSponsored = card.querySelector('.puis-label-popover-default') !== null ||
                      card.textContent.includes('Sponsored');

  return { rank, asin, title, price, originalPrice, rating, reviewCount, isPrime, isSponsored, delivery, url };
};

WebMCPHelpers.getAmazonASIN = function() {
  const url = window.location.href;
  const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return match ? match[1] : null;
};

WebMCPHelpers.selectAmazonVariant = async function(optionName, optionValue) {
  const lower = optionName.toLowerCase();
  const valueLower = optionValue.toLowerCase();

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
