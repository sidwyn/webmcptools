// content/sites/amazon/tools/getCart.js

const GetCartTool = {
  name: 'get_cart',
  description: 'View the current Amazon shopping cart contents and totals. Navigates to the cart page if not already there.',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  execute: async () => {
    // Navigate to cart if not already there
    if (!window.location.href.includes('/gp/cart') && !window.location.href.includes('/cart/view')) {
      setTimeout(() => { window.location.href = 'https://www.amazon.com/gp/cart/view.html'; }, 50);
      return {
        content: [{
          type: 'text',
          text: 'Navigating to shopping cart. Wait for the page to load, then call get_cart again to read the contents.'
        }]
      };
    }

    await WebMCPHelpers.sleep(1000);

    // Check for empty cart
    const emptyEl = document.querySelector('#sc-active-cart .sc-empty-cart') ||
                    WebMCPHelpers.findByText('Your Amazon Cart is empty');
    if (emptyEl) {
      return { content: [{ type: 'text', text: 'Your Amazon cart is empty.' }] };
    }

    // Parse cart items
    const items = [];
    const cartItems = document.querySelectorAll('[data-asin].sc-list-item, .sc-item-product, [data-item-index]');

    for (const item of cartItems) {
      const asin = item.getAttribute('data-asin') || null;

      // Title
      const titleEl = item.querySelector('.sc-product-title a, .sc-item-title a, .a-truncate-cut');
      const title = titleEl ? titleEl.textContent.trim() : null;

      // Price
      const priceEl = item.querySelector('.sc-product-price, .sc-item-price');
      const price = priceEl ? priceEl.textContent.trim() : null;

      // Quantity
      const qtyEl = item.querySelector('.a-dropdown-prompt, select[name*="quantity"] option[selected], input[name*="quantity"]');
      let quantity = 1;
      if (qtyEl) {
        const qtyMatch = qtyEl.textContent?.trim().match(/\d+/) || qtyEl.value?.match(/\d+/);
        if (qtyMatch) quantity = parseInt(qtyMatch[0], 10);
      }

      // Seller
      const sellerEl = item.querySelector('.sc-product-sold-by, .sc-item-seller');
      const seller = sellerEl ? sellerEl.textContent.replace(/Sold by:?\s*/i, '').trim() : null;

      if (title || asin) {
        items.push({ asin, title: title ? title.substring(0, 80) : 'Unknown', price, quantity, seller });
      }
    }

    // Cart subtotal
    const subtotalEl = document.getElementById('sc-subtotal-amount-activecart') ||
                       document.querySelector('.sc-subtotal .a-color-price') ||
                       document.querySelector('#sc-subtotal-label-activecart + .a-color-price');
    const subtotal = subtotalEl ? subtotalEl.textContent.trim() : null;

    // Item count
    const countEl = document.getElementById('sc-subtotal-label-activecart');
    const itemCount = countEl ? countEl.textContent.trim() : null;

    if (items.length === 0) {
      return { content: [{ type: 'text', text: 'Could not parse cart items. The cart may be empty or the page layout has changed.' }] };
    }

    let output = 'Shopping Cart\n' + '='.repeat(30) + '\n\n';

    items.forEach((item, i) => {
      output += `${i + 1}. ${item.title}\n`;
      if (item.price) output += `   Price: ${item.price}\n`;
      output += `   Qty: ${item.quantity}\n`;
      if (item.seller) output += `   Seller: ${item.seller}\n`;
      output += '\n';
    });

    if (itemCount) output += `${itemCount}\n`;
    if (subtotal) output += `Subtotal: ${subtotal}\n`;

    return { content: [{ type: 'text', text: output.trim() }] };
  }
};
