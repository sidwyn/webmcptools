// content/tools/google-flights/getPriceInsights.js

const GetPriceInsightsTool = {
  name: 'get_price_insights',
  description: 'Read price insights and the Date Grid for the current search. Shows price level (high/low/typical), typical range, and the cheapest departure/return date combinations from the Date Grid. IMPORTANT: The Date Grid is only available on the departing flights page — call this BEFORE selecting any flight. If called on the return flights page, the Date Grid will not be available.',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  execute: async () => {
    if (!window.location.href.includes('google.com/travel/flights') ||
        (!window.location.search.includes('q=') && !window.location.search.includes('tfs='))) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a Google Flights results page. Search for flights first.' }] };
    }

    await WebMCPHelpers.sleep(500);

    const insights = {};

    // 1. Price level: "Prices are currently high/low/typical for your search"
    const allText = document.body.innerText;
    const levelMatch = allText.match(/prices are currently (high|low|typical)/i);
    if (levelMatch) insights.level = levelMatch[1].toLowerCase();

    // 2. Usual price range: "usually cost between $X–$Y"
    const rangeMatch = allText.match(/usually\s+cost\s+between\s+(\$[\d,]+)[–\-](\$[\d,]+)/i);
    if (rangeMatch) {
      insights.typicalMin = rangeMatch[1];
      insights.typicalMax = rangeMatch[2];
    }

    // 3. Current price note: "$X,XXX is high" or similar
    const currentNoteMatch = allText.match(/(\$[\d,]+)\s+is\s+(high|low|typical)/i);
    if (currentNoteMatch) {
      insights.currentPrice = currentNoteMatch[1];
      insights.currentNote = currentNoteMatch[2].toLowerCase();
    }

    // 4. Try to read Date Grid for cheapest dates (only available on departing flights page)
    let dateGridInfo = null;
    // Detect if we're on the return flights page — Date Grid is not available there
    const isReturnPage = !!document.querySelector('[class*="return"]') ||
                         /returning|choose return|return to/i.test(document.body.innerText.substring(0, 500)) ||
                         !!WebMCPHelpers.findByText('Top returning flights') ||
                         !!WebMCPHelpers.findByText('Choose return');
    const dateGridBtn = isReturnPage ? null :
                        (WebMCPHelpers.findByText('Date grid', 'button') ||
                         WebMCPHelpers.findByText('Date grid') ||
                         WebMCPHelpers.findByAriaLabel('Date grid'));
    if (isReturnPage) {
      dateGridInfo = 'Date Grid is not available on the return flights page. To compare dates, use the Date Grid before selecting a departing flight.';
    } else if (dateGridBtn) {
      WebMCPHelpers.simulateClick(dateGridBtn);
      await WebMCPHelpers.sleep(2000);

      // Click the "Dates" tab within the date grid dialog
      const datesTab = Array.from(document.querySelectorAll('*'))
        .find(el => el.textContent.trim() === 'Dates' && el.children.length === 0);
      if (datesTab) {
        WebMCPHelpers.simulateClick(datesTab);
        await WebMCPHelpers.sleep(1000);
      }

      // Collect price cells from the Date Grid.
      // The grid has two axes: Departure (columns, navigated by < > arrows)
      // and Return (rows, navigated by a separate set of arrows or scroll).
      // We navigate both axes to cover the full date range.
      let allParsed = [];

      // Helper: scrape all visible price cells from the current grid view
      function scrapePriceCells() {
        let found = 0;
        // Primary: div[role="button"] with aria-labels like "$379, cheapest price, Apr 12 to Apr 17"
        const priceBtns = Array.from(document.querySelectorAll('[role="button"][aria-label]'))
          .filter(el => {
            const label = el.getAttribute('aria-label') || '';
            return /\$\d+/.test(label) && /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(label);
          });

        for (const el of priceBtns) {
          const label = el.getAttribute('aria-label');
          const priceMatch = label.match(/\$([\d,]+)/);
          if (!priceMatch) continue;
          const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
          if (price >= 100000) continue;
          const dateMatch = label.match(/([A-Z][a-z]{2}\s+\d{1,2})\s+to\s+([A-Z][a-z]{2}\s+\d{1,2})/);
          const dates = dateMatch ? `${dateMatch[1]} → ${dateMatch[2]}` : label;
          const isCheapest = /cheapest/i.test(label);
          if (!allParsed.some(p => p.dates === dates)) {
            allParsed.push({ price, dates, isCheapest });
            found++;
          }
        }

        // Fallback: [role="gridcell"] or td with price text
        if (found === 0) {
          const cells = Array.from(document.querySelectorAll('[role="gridcell"], td'))
            .filter(el => /\$[\d,]+/.test(el.textContent));
          for (const el of cells) {
            const priceMatch = el.textContent.match(/\$[\d,]+/);
            if (!priceMatch) continue;
            const price = parseInt(priceMatch[0].replace(/[$,]/g, ''), 10);
            if (price >= 100000) continue;
            const ariaLabel = el.getAttribute('aria-label') || el.textContent.trim();
            if (!allParsed.some(p => p.dates === ariaLabel)) {
              allParsed.push({ price, dates: ariaLabel, isCheapest: false });
            }
          }
        }
        return found;
      }

      // Helper: find navigation buttons for a given axis
      // The date grid has "Departure" with < > and "Return" with < > (or scroll)
      function findNavButtons() {
        const allBtns = Array.from(document.querySelectorAll('button'));
        // Look for arrow buttons near the Departure / Return labels
        // These are typically SVG-icon-only buttons with aria-labels or within nav containers
        const backBtns = allBtns.filter(b => {
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          const text = b.textContent.trim();
          // Match: "previous", "back", "<", "earlier", "Show earlier dates", chevron-left
          return /previous|earlier|show earlier|back|^<$/.test(label) ||
                 /previous|earlier|show earlier/.test(text) ||
                 (text === '' && b.querySelector('svg') && label === '');
        });
        const fwdBtns = allBtns.filter(b => {
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          const text = b.textContent.trim();
          return /next|later|show later|forward|^>$/.test(label) ||
                 /next|later|show later/.test(text);
        });
        return { backBtns, fwdBtns };
      }

      // Helper: try clicking a navigation button (the departure axis arrows)
      // Google Flights date grid typically has two sets of arrows:
      //   - Near "Departure" label (top) for columns
      //   - Near "Return" label (right side) for rows
      // We identify the departure arrows by their position near the top of the grid.
      async function clickDepartureNav(direction) {
        const { backBtns, fwdBtns } = findNavButtons();
        // The departure nav arrows are at the top of the grid near "Departure" text.
        // Pick buttons that are near the top of the dialog.
        const dialog = document.querySelector('[role="dialog"]') || document.body;
        const dialogTop = dialog.getBoundingClientRect().top;

        const candidates = direction === 'forward' ? fwdBtns : backBtns;
        // Sort by vertical position, pick the one closest to the top (departure axis)
        const sorted = candidates
          .filter(b => !b.disabled && b.offsetHeight > 0)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

        if (sorted.length > 0) {
          WebMCPHelpers.simulateClick(sorted[0]);
          await WebMCPHelpers.sleep(1200);
          return true;
        }
        return false;
      }

      async function clickReturnNav(direction) {
        const { backBtns, fwdBtns } = findNavButtons();
        const candidates = direction === 'forward' ? fwdBtns : backBtns;
        // Return axis arrows are lower in the grid — pick the bottommost button
        const sorted = candidates
          .filter(b => !b.disabled && b.offsetHeight > 0)
          .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);

        if (sorted.length > 0) {
          WebMCPHelpers.simulateClick(sorted[0]);
          await WebMCPHelpers.sleep(1200);
          return true;
        }
        return false;
      }

      // Scrape the initial view
      scrapePriceCells();

      // Navigate forward through the departure axis to cover more dates
      // Keep it light — 2 forward pages is enough to cover ~3 weeks beyond current view
      for (let i = 0; i < 2; i++) {
        const moved = await clickDepartureNav('forward');
        if (!moved) break;
        scrapePriceCells();
      }

      // One page forward on the return axis, then re-scan departure
      const returnMoved = await clickReturnNav('forward');
      if (returnMoved) {
        scrapePriceCells();
        // Go back on departure to rescan from the start at this return offset
        await clickDepartureNav('back');
        scrapePriceCells();
        await clickDepartureNav('back');
        scrapePriceCells();
      }

      if (allParsed.length > 0) {
        allParsed.sort((a, b) => a.price - b.price);
        const top = allParsed.slice(0, 8);
        dateGridInfo = `Cheapest dates from the date grid (${allParsed.length} combinations scanned):\n` +
          top.map((c, i) => `  ${i + 1}. $${c.price}${c.isCheapest ? ' ★ cheapest' : ''} — ${c.dates}`).join('\n');
        if (allParsed.length > 8) {
          const maxPrice = allParsed[allParsed.length - 1].price;
          dateGridInfo += `\n  Price range: $${allParsed[0].price}–$${maxPrice}`;
        }
      }

      // Close the date grid dialog — MUST use Cancel, NOT OK.
      // Clicking OK confirms the selected dates and navigates away from the departing page.
      const cancelBtn = WebMCPHelpers.findByText('Cancel', 'button') ||
                        WebMCPHelpers.findByText('Close', 'button');
      if (cancelBtn) {
        WebMCPHelpers.simulateClick(cancelBtn);
        await WebMCPHelpers.sleep(500);
      } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await WebMCPHelpers.sleep(500);
      }
    }

    // 5. Build recommendation
    let recommendation = '';
    if (insights.level === 'low') {
      recommendation = 'Prices are LOW — this is a great time to book!';
    } else if (insights.level === 'high') {
      const range = insights.typicalMin && insights.typicalMax
        ? ` (typical: ${insights.typicalMin}–${insights.typicalMax})`
        : '';
      recommendation = `Prices are HIGH${range}. Consider trying different dates, a nearby airport, or waiting if your travel dates are flexible. Use the Date grid to find cheaper dates.`;
    } else if (insights.level === 'typical') {
      recommendation = 'Prices are at typical levels — neither a great deal nor unusually expensive. Book if the timing works for you.';
    } else {
      recommendation = 'No price level indicator found — prices may not have loaded yet, or this route has limited data.';
    }

    const lines = [
      insights.level ? `Price level: ${insights.level.toUpperCase()}` : null,
      insights.currentPrice ? `Current lowest price: ${insights.currentPrice} (${insights.currentNote})` : null,
      insights.typicalMin ? `Typical price range: ${insights.typicalMin}–${insights.typicalMax}` : null,
      dateGridInfo,
      `\nAdvice: ${recommendation}`,
    ].filter(Boolean);

    return {
      content: [{
        type: 'text',
        text: lines.join('\n')
      }]
    };
  }
};
