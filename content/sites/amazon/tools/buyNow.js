// content/sites/amazon/tools/buyNow.js

const BuyNowTool = {
  name: 'buy_now',
  description: 'Click "Buy Now" on the current Amazon product page to proceed to the checkout page. Stops at the checkout summary — does NOT place the order. Use get_checkout_summary to read the order details before the user confirms.',
  inputSchema: {
    type: 'object',
    properties: {
      quantity: {
        type: 'integer',
        description: 'Quantity to buy. Defaults to 1.'
      },
      variant: {
        type: 'object',
        description: 'Variant options to select before buying (e.g., {"Size": "Large", "Color": "Blue"}). Keys are option names, values are option values.'
      }
    }
  },

  execute: async (args) => {
    const { quantity = 1, variant } = args;

    const isProductPage = /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(window.location.href);
    if (!isProductPage) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon product page. Navigate to a product first.' }] };
    }

    await WebMCPHelpers.waitForAmazonProductPage(10000);

    // Select variant options if specified
    if (variant && typeof variant === 'object') {
      for (const [optionName, optionValue] of Object.entries(variant)) {
        const selected = await WebMCPHelpers.selectAmazonVariant(optionName, optionValue);
        if (!selected) {
          return { content: [{ type: 'text', text: `WARNING: Could not select variant ${optionName}: "${optionValue}". Check available variants with get_product_details.` }] };
        }
      }
      await WebMCPHelpers.sleep(500);
    }

    // Set quantity
    if (quantity > 1) {
      const qtySelect = document.getElementById('quantity') ||
                         document.querySelector('#quantityDropdownContainer select') ||
                         document.querySelector('select[name="quantity"]');
      if (qtySelect) {
        const option = Array.from(qtySelect.options).find(o => o.value === String(quantity));
        if (option) {
          qtySelect.value = option.value;
          qtySelect.dispatchEvent(new Event('change', { bubbles: true }));
          await WebMCPHelpers.sleep(300);
        }
      }
    }

    // Click "Buy Now"
    const buyBtn = document.getElementById('buy-now-button') ||
                   document.querySelector('[name="submit.buy-now"]') ||
                   document.querySelector('#buyNow input[type="submit"]') ||
                   WebMCPHelpers.findByText('Buy Now', 'input') ||
                   WebMCPHelpers.findByText('Buy Now', 'button');

    if (!buyBtn) {
      return { content: [{ type: 'text', text: 'ERROR: Could not find the "Buy Now" button. The product may be unavailable, or the user may not be signed in.' }] };
    }

    WebMCPHelpers.simulateClick(buyBtn);
    await WebMCPHelpers.sleep(3000);

    // Check if we landed on a checkout page
    const isCheckout = window.location.href.includes('/gp/buy') ||
                       window.location.href.includes('/checkout') ||
                       window.location.href.includes('placeOrder');

    if (isCheckout) {
      return {
        content: [{
          type: 'text',
          text: 'Arrived at checkout page. Call get_checkout_summary to review the order details (shipping address, payment, total) before confirming. IMPORTANT: Do NOT place the order without explicit user confirmation.'
        }]
      };
    }

    // May have been redirected to sign-in
    if (window.location.href.includes('signin') || window.location.href.includes('ap/signin')) {
      return {
        content: [{
          type: 'text',
          text: 'Redirected to sign-in page. The user needs to sign in to their Amazon account before proceeding with Buy Now.'
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: 'Clicked "Buy Now". The page may be loading or the user may need to sign in. Wait for the checkout page to load, then call get_checkout_summary.'
      }]
    };
  }
};
