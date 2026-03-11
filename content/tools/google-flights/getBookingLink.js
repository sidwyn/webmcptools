// content/tools/google-flights/getBookingLink.js

const GetBookingLinkTool = {
  name: 'get_booking_link',
  description: 'Get booking options and prices for a flight. On the BOOKING PAGE (after selecting both departing and return flights), reads the "Book with" options. On the RESULTS PAGE, expands a flight card to show the "Select flight" button. You must select both departing and return flights before booking options appear.',
  inputSchema: {
    type: 'object',
    properties: {
      rank: {
        type: 'integer',
        description: '1-based rank of the flight result to get booking info for (only used on results page, ignored on booking page)'
      }
    }
  },

  execute: async (args) => {
    const { rank } = args;
    const url = window.location.href;
    const { simulateClick, sleep, findByText } = WebMCPHelpers;

    // ── BOOKING PAGE: /travel/flights/booking ──────────────────────────────
    if (url.includes('/travel/flights/booking')) {
      await sleep(1000);

      // Expand "more booking options" if present
      const moreBtn = findByText('more booking options', 'button') ||
                      findByText('more booking options');
      if (moreBtn) {
        simulateClick(moreBtn);
        await sleep(1000);
      }

      // Parse all "Book with" sections
      const allElements = Array.from(document.querySelectorAll('*'));
      const bookingSections = allElements.filter(el => {
        const text = el.textContent.trim();
        return /^Book with /i.test(text) && el.children.length < 15 &&
               el.offsetHeight > 0 && text.length < 200;
      });

      // Deduplicate: keep the most specific (smallest) container per source
      const seen = new Map();
      for (const el of bookingSections) {
        const text = el.textContent.trim();
        const sourceMatch = text.match(/^Book with (.+?)(?:\s|$)/i);
        const source = sourceMatch ? sourceMatch[1].replace(/Airline$/, '').trim() : text.substring(0, 30);
        const key = source.toLowerCase();
        if (!seen.has(key) || el.textContent.length < seen.get(key).textContent.length) {
          seen.set(key, el);
        }
      }

      const options = [];
      for (const [key, el] of seen) {
        const text = el.textContent.trim();
        const sourceMatch = text.match(/^Book with (.+?)(?:\s|$)/i);
        const source = sourceMatch ? sourceMatch[1].replace(/Airline$/, '').trim() : key;
        const priceMatch = text.match(/\$[\d,]+/);
        options.push({ source, price: priceMatch ? priceMatch[0] : null });
      }

      if (options.length === 0) {
        return { content: [{ type: 'text', text: 'On the booking page but could not find booking options. The page may still be loading.' }] };
      }

      // Get the total price shown at top
      const totalMatch = document.body.innerText.match(/Lowest total price[\s\S]*?\$[\d,]+/i);
      const totalPrice = totalMatch ? totalMatch[0].match(/\$[\d,]+/)?.[0] : null;

      const summary = options.map((o, i) => {
        let line = `${i + 1}. ${o.source}`;
        if (o.price) line += ` — ${o.price}`;
        return line;
      }).join('\n');

      const header = totalPrice ? `Lowest total price: ${totalPrice}\n\n` : '';

      return {
        content: [{
          type: 'text',
          text: `${header}Booking options:\n\n${summary}\n\nTo book, the user should click "Continue" next to their preferred option on the page.`
        }]
      };
    }

    // ── RESULTS PAGE: expand card to show Select flight ────────────────────
    if (!url.includes('google.com/travel/flights') ||
        (!url.includes('q=') && !url.includes('tfs='))) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a Google Flights page. Search for flights first.' }] };
    }

    if (!rank) {
      return { content: [{ type: 'text', text: 'ERROR: Provide a rank number. On the results page, booking options are only available after selecting both departing and return flights. Use select_return_flight to complete the selection first.' }] };
    }

    let cards = Array.from(document.querySelectorAll('div.yR1fYc'));
    if (cards.length === 0) {
      const allDivs = Array.from(document.querySelectorAll('div'));
      cards = allDivs.filter(el => {
        const h = el.offsetHeight;
        if (h < 60 || h > 200 || el.children.length < 3) return false;
        const text = el.textContent;
        return /\$[\d,]+/.test(text) && /\d{1,2}:\d{2}\s*(AM|PM)/i.test(text);
      }).filter((el, _, arr) => !arr.some(o => o !== el && o.contains(el)));
    }

    if (cards.length === 0) {
      return { content: [{ type: 'text', text: 'No flight results found on the page.' }] };
    }
    if (rank < 1 || rank > cards.length) {
      return { content: [{ type: 'text', text: `Invalid rank ${rank}. There are ${cards.length} results (1-${cards.length}).` }] };
    }

    const card = cards[rank - 1];

    // Click to expand the flight card
    const buttonsInCard = Array.from(card.querySelectorAll('button'));
    let expandButton = buttonsInCard.find(btn => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('detail') || label.includes('flight detail');
    });
    if (!expandButton && buttonsInCard.length > 0) {
      expandButton = buttonsInCard[buttonsInCard.length - 1];
    }

    if (expandButton) {
      simulateClick(expandButton);
      await sleep(1500);
    }

    // Look for "Select flight" button in the expanded area
    const selectBtn = findByText('Select flight', 'button');
    const hasSelectBtn = selectBtn && selectBtn.offsetHeight > 0;

    // Collapse the card
    if (expandButton) {
      simulateClick(expandButton);
      await sleep(300);
    }

    if (hasSelectBtn) {
      return {
        content: [{
          type: 'text',
          text: `Flight #${rank} is ready to select. On Google Flights, booking options (airlines and OTAs with prices) appear on the BOOKING PAGE after selecting both departing and return flights.\n\nNext steps:\n1. Call select_return_flight to select this departing flight and choose a return\n2. After both flights are selected, Google Flights will show the booking page\n3. Then call get_booking_link (without rank) to read the booking options`
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Could not find a "Select flight" button for flight #${rank}. Make sure you're on a results page with flight listings.`
      }]
    };
  }
};
