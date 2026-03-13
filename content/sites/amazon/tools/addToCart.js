// content/sites/amazon/tools/addToCart.js

const AddToCartTool = {
  name: 'add_to_cart',
  description: 'Add the currently viewed product to the Amazon shopping cart. Must be on a product detail page. Optionally select variant options (size, color) and quantity first.',
  inputSchema: {
    type: 'object',
    properties: {
      quantity: {
        type: 'integer',
        description: 'Quantity to add. Defaults to 1.'
      },
      variant: {
        type: 'object',
        description: 'Variant options to select before adding to cart (e.g., {"Size": "Large", "Color": "Blue"}). Keys are option names, values are option values.'
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
          return { content: [{ type: 'text', text: `WARNING: Could not select variant ${optionName}: "${optionValue}". The option may not be available. Check available variants with get_product_details.` }] };
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

    // Click "Add to Cart"
    const addBtn = document.getElementById('add-to-cart-button') ||
                   document.querySelector('[name="submit.add-to-cart"]') ||
                   document.querySelector('#addToCart input[type="submit"]') ||
                   WebMCPHelpers.findByText('Add to Cart', 'input') ||
                   WebMCPHelpers.findByText('Add to Cart', 'button');

    if (!addBtn) {
      return { content: [{ type: 'text', text: 'ERROR: Could not find the "Add to Cart" button. The product may be unavailable or the page layout has changed.' }] };
    }

    WebMCPHelpers.simulateClick(addBtn);
    await WebMCPHelpers.sleep(2000);

    // Check for success
    const confirmEl = document.getElementById('NATC_SMART_WAGON_CONF_MSG_SUCCESS') ||
                      document.querySelector('[data-feature-name="atcConfirmation"]') ||
                      WebMCPHelpers.findByText('Added to Cart') ||
                      document.getElementById('huc-v2-order-row-confirm-text');

    // Check cart count in header
    const cartCount = document.getElementById('nav-cart-count');
    const cartText = cartCount ? cartCount.textContent.trim() : null;

    if (confirmEl || (cartText && parseInt(cartText) > 0)) {
      const titleEl = document.getElementById('productTitle') || document.getElementById('title');
      const title = titleEl ? titleEl.textContent.trim().substring(0, 60) : 'Product';
      return {
        content: [{
          type: 'text',
          text: `Added to cart: "${title}" (qty: ${quantity}).${cartText ? ` Cart now has ${cartText} item(s).` : ''}`
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: 'Clicked "Add to Cart". The confirmation may take a moment. Check get_cart to verify the item was added.'
      }]
    };
  }
};
