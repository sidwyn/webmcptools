// content/sites/walmart/tools/getCart.js

const GetCartTool = {
  name: 'get_cart',
  description: 'View the current Walmart shopping cart contents, including items, quantities, prices, and the cart total. Navigates to the cart page if not already there.',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  execute: async () => {
    const url = window.location.href;

    // Navigate to cart if not already there
    if (!url.includes('walmart.com/cart')) {
      setTimeout(() => { window.location.href = 'https://www.walmart.com/cart'; }, 50);
      return {
        content: [{
          type: 'text',
          text: 'Navigating to cart. Wait for the page to load, then call get_cart again to read the contents.'
        }]
      };
    }

    // Wait for cart to load
    await WebMCPHelpers.sleep(2000);
    await WebMCPHelpers.waitForElement('[data-testid="cart-item"], [data-automation-id="cart-item"]', 10000).catch(() => {});

    // Check for empty cart
    const emptyMsg = WebMCPHelpers.findByText('Your cart is empty', 'span') ||
                     WebMCPHelpers.findByText('Your cart is empty', 'h1') ||
                     WebMCPHelpers.findByText('Your cart is empty', 'div');
    if (emptyMsg) {
      return { content: [{ type: 'text', text: 'Your Walmart cart is empty.' }] };
    }

    // Parse cart items
    const cartItems = document.querySelectorAll('[data-testid="cart-item"], [data-automation-id="cart-item"]');
    const items = [];

    cartItems.forEach((item, i) => {
      const titleEl = item.querySelector('a[href*="/ip/"] span, a[href*="/ip/"]');
      const title = titleEl?.textContent?.trim() || 'Unknown item';

      const priceMatch = item.textContent.match(/\$[\d,]+(?:\.\d{2})?/);
      const price = priceMatch ? priceMatch[0] : 'N/A';

      const qtyEl = item.querySelector('select[aria-label*="uantity"], [data-testid="quantity-selector"] select, input[aria-label*="uantity"]');
      const quantity = qtyEl?.value || '1';

      const sellerEl = item.querySelector('[data-automation-id="sold-by"], [data-testid="sold-by"]');
      const seller = sellerEl?.textContent?.trim() || null;

      items.push({ rank: i + 1, title, price, quantity, seller });
    });

    if (items.length === 0) {
      // Fallback: try to find any items via heuristic
      const fallbackItems = document.querySelectorAll('div[class*="cart-item"], li[class*="cart-item"]');
      if (fallbackItems.length === 0) {
        return { content: [{ type: 'text', text: 'Could not read cart items. The cart page may still be loading. Try calling get_cart again.' }] };
      }
    }

    // Parse cart summary
    let subtotal = null;
    let estimatedTotal = null;
    const summarySection = document.querySelector('[data-testid="cart-summary"], [data-automation-id="cart-summary"]') || document.body;

    const subtotalEl = Array.from(summarySection.querySelectorAll('span, div')).find(el =>
      /subtotal/i.test(el.textContent) && /\$/.test(el.parentElement?.textContent)
    );
    if (subtotalEl) {
      const parent = subtotalEl.closest('div') || subtotalEl.parentElement;
      const match = parent?.textContent.match(/\$[\d,]+(?:\.\d{2})?/);
      subtotal = match ? match[0] : null;
    }

    const totalEl = Array.from(summarySection.querySelectorAll('span, div')).find(el =>
      /estimated\s+total|total/i.test(el.textContent) && !/subtotal/i.test(el.textContent) && /\$/.test(el.parentElement?.textContent)
    );
    if (totalEl) {
      const parent = totalEl.closest('div') || totalEl.parentElement;
      const match = parent?.textContent.match(/\$[\d,]+(?:\.\d{2})?/);
      estimatedTotal = match ? match[0] : null;
    }

    let text = `Cart (${items.length} item${items.length !== 1 ? 's' : ''}):\n\n`;
    text += items.map(item => {
      let line = `${item.rank}. ${item.title} — ${item.price}`;
      if (item.quantity !== '1') line += ` (qty: ${item.quantity})`;
      if (item.seller) line += ` | ${item.seller}`;
      return line;
    }).join('\n');

    text += '\n';
    if (subtotal) text += `\nSubtotal: ${subtotal}`;
    if (estimatedTotal) text += `\nEstimated Total: ${estimatedTotal}`;

    return { content: [{ type: 'text', text }] };
  }
};
