// content/sites/amazon/tools/checkPriceHistory.js

const CheckPriceHistoryTool = {
  name: 'check_price_history',
  description: 'Read the current pricing information, deals, coupons, and savings for the product on the current Amazon detail page.',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  execute: async () => {
    const isProductPage = /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(window.location.href);
    if (!isProductPage) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon product page. Navigate to a product first.' }] };
    }

    await WebMCPHelpers.waitForAmazonProductPage(10000);

    const info = {};

    // Current price
    const priceEl = document.querySelector('#corePrice_feature_div .a-price') ||
                    document.querySelector('#priceblock_ourprice') ||
                    document.querySelector('#priceblock_dealprice') ||
                    document.querySelector('.a-price.aok-align-center');
    info.currentPrice = WebMCPHelpers.parseAmazonPrice(priceEl);

    // List price (original)
    const listPriceEl = document.querySelector('#corePrice_feature_div .a-price[data-a-strike]') ||
                        document.querySelector('#listPrice') ||
                        document.querySelector('.priceBlockStrikePriceString');
    info.listPrice = WebMCPHelpers.parseAmazonPrice(listPriceEl);

    // Savings amount
    const savingsEl = document.querySelector('#corePrice_feature_div .savingsPercentage') ||
                      document.querySelector('.priceBlockSavingsString');
    info.savingsPercent = savingsEl ? savingsEl.textContent.trim() : null;

    const savingsAmountEl = document.querySelector('#corePrice_feature_div .a-color-price');
    info.savingsAmount = savingsAmountEl ? savingsAmountEl.textContent.trim() : null;

    // Coupon
    const couponEl = document.getElementById('couponBadgeRegularVpc') ||
                     document.querySelector('[data-csa-c-coupon]') ||
                     document.querySelector('.couponBadge');
    info.coupon = couponEl ? couponEl.textContent.trim().replace(/\s+/g, ' ') : null;

    // Deal badge
    const dealEl = document.querySelector('#dealBadge_feature_div') ||
                   document.querySelector('.dealBadge') ||
                   document.querySelector('[data-feature-name="dealBadge"]');
    info.dealType = dealEl ? dealEl.textContent.trim().replace(/\s+/g, ' ') : null;

    // Prime price (if different)
    const primePriceEl = document.querySelector('#pep-signup-link .a-color-price') ||
                         document.querySelector('[data-action="pep-signup"] .a-color-price');
    info.primePrice = primePriceEl ? primePriceEl.textContent.trim() : null;

    // Subscribe & Save
    const snsEl = document.querySelector('#snsPrice') ||
                  document.querySelector('#sns-base-price');
    info.subscribeAndSave = snsEl ? snsEl.textContent.trim() : null;

    // Build output
    let output = 'Price Information\n' + '='.repeat(30) + '\n\n';

    if (info.currentPrice) output += `Current Price: ${info.currentPrice}\n`;
    if (info.listPrice) output += `List Price: ${info.listPrice}\n`;
    if (info.savingsPercent || info.savingsAmount) {
      output += `Savings: ${info.savingsAmount || ''} ${info.savingsPercent || ''}\n`.trim() + '\n';
    }
    if (info.coupon) output += `Coupon: ${info.coupon}\n`;
    if (info.dealType) output += `Deal: ${info.dealType}\n`;
    if (info.primePrice) output += `Prime Price: ${info.primePrice}\n`;
    if (info.subscribeAndSave) output += `Subscribe & Save: ${info.subscribeAndSave}\n`;

    if (!info.currentPrice && !info.listPrice) {
      output += 'No pricing information could be found on this page.\n';
    }

    return { content: [{ type: 'text', text: output.trim() }] };
  }
};
