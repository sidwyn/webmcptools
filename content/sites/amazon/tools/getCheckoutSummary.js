// content/sites/amazon/tools/getCheckoutSummary.js

const GetCheckoutSummaryTool = {
  name: 'get_checkout_summary',
  description: 'Read the checkout page summary including items, shipping address, payment method, and order total. Use this after buy_now to review the order before the user decides to place it. This tool does NOT place the order.',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  execute: async () => {
    const url = window.location.href;
    const isCheckout = url.includes('/gp/buy') ||
                       url.includes('/checkout') ||
                       url.includes('placeOrder') ||
                       url.includes('/turbo-checkout');

    if (!isCheckout) {
      return { content: [{ type: 'text', text: 'ERROR: Not on an Amazon checkout page. Use buy_now first to navigate to checkout.' }] };
    }

    await WebMCPHelpers.sleep(1500);

    const info = {};

    // Shipping address
    const addressEl = document.querySelector('#address-section') ||
                      document.querySelector('.ship-to-this-address') ||
                      document.querySelector('[data-testid="shipping-address"]') ||
                      document.querySelector('.displayAddressDiv');
    if (addressEl) {
      info.shippingAddress = addressEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 200);
    }

    // Payment method
    const paymentEl = document.querySelector('#payment-information') ||
                      document.querySelector('.payment-info') ||
                      document.querySelector('[data-testid="payment-method"]');
    if (paymentEl) {
      info.paymentMethod = paymentEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 100);
    }

    // Items in order
    const orderItems = [];
    const itemEls = document.querySelectorAll('.item-row, .a-fixed-right-grid, [data-testid="order-item"]');
    for (const el of itemEls) {
      const titleEl = el.querySelector('.a-truncate-cut, .item-title, a');
      const priceEl = el.querySelector('.a-color-price, .item-price');
      const qtyEl = el.querySelector('.item-quantity, select');
      if (titleEl) {
        orderItems.push({
          title: titleEl.textContent.trim().substring(0, 80),
          price: priceEl ? priceEl.textContent.trim() : null,
          quantity: qtyEl ? qtyEl.textContent.trim() : '1'
        });
      }
    }
    info.items = orderItems;

    // Delivery estimate
    const deliveryEl = document.querySelector('#delivery-promise') ||
                       document.querySelector('.delivery-option') ||
                       document.querySelector('[data-testid="delivery-estimate"]');
    if (deliveryEl) {
      info.deliveryEstimate = deliveryEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 150);
    }

    // Order total
    const totalEl = document.querySelector('#subtotals-marketplace-spp-bottom .grand-total-price') ||
                    document.querySelector('.order-summary .a-color-price') ||
                    document.querySelector('#order-summary .grand-total-price') ||
                    WebMCPHelpers.findByText('Order total', 'tr');
    if (totalEl) {
      const priceInTotal = totalEl.querySelector('.a-color-price') || totalEl;
      info.orderTotal = priceInTotal.textContent.trim();
    }

    // Subtotal
    const subtotalEl = document.querySelector('.subtotals-marketplace-table .a-text-right') ||
                       WebMCPHelpers.findByText('Items:', 'tr');
    if (subtotalEl) {
      const priceInSubtotal = subtotalEl.querySelector('.a-color-price') || subtotalEl;
      info.subtotal = priceInSubtotal.textContent.trim();
    }

    // Build output
    let output = 'Checkout Summary\n' + '='.repeat(30) + '\n';
    output += 'REVIEW ONLY — Order has NOT been placed.\n\n';

    if (info.shippingAddress) output += `Shipping Address: ${info.shippingAddress}\n\n`;
    if (info.paymentMethod) output += `Payment: ${info.paymentMethod}\n\n`;
    if (info.deliveryEstimate) output += `Delivery: ${info.deliveryEstimate}\n\n`;

    if (info.items.length > 0) {
      output += 'Items:\n';
      info.items.forEach((item, i) => {
        output += `  ${i + 1}. ${item.title}`;
        if (item.price) output += ` — ${item.price}`;
        if (item.quantity && item.quantity !== '1') output += ` (qty: ${item.quantity})`;
        output += '\n';
      });
      output += '\n';
    }

    if (info.subtotal) output += `Subtotal: ${info.subtotal}\n`;
    if (info.orderTotal) output += `Order Total: ${info.orderTotal}\n`;

    output += '\nThe user must decide whether to place the order. Do NOT click "Place your order" automatically.';

    return { content: [{ type: 'text', text: output.trim() }] };
  }
};
