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

      // Collect price cells — Google Flights Date Grid uses div[role="button"]
      // with aria-labels like "$379, cheapest price, Apr 12 to Apr 17"
      let allParsed = [];
      const MAX_PAGES = 3;

      for (let page = 0; page < MAX_PAGES; page++) {
        // Primary: div[role="button"] with price+date aria-labels
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
          // Extract date range from label (e.g. "Apr 12 to Apr 17")
          const dateMatch = label.match(/([A-Z][a-z]{2}\s+\d{1,2})\s+to\s+([A-Z][a-z]{2}\s+\d{1,2})/);
          const dates = dateMatch ? `${dateMatch[1]} → ${dateMatch[2]}` : label;
          const isCheapest = /cheapest/i.test(label);
          if (!allParsed.some(p => p.dates === dates)) {
            allParsed.push({ price, dates, isCheapest });
          }
        }

        // Fallback: [role="gridcell"] or td with price text
        if (allParsed.length === 0) {
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

        // Try to navigate to next week/page in the grid
        if (page < MAX_PAGES - 1) {
          const forwardBtns = Array.from(document.querySelectorAll('button[aria-label]'))
            .filter(b => /next|forward|later|show later/i.test(b.getAttribute('aria-label')));
          const btn = forwardBtns[forwardBtns.length - 1];
          if (btn && !btn.disabled) {
            WebMCPHelpers.simulateClick(btn);
            await WebMCPHelpers.sleep(1500);
          } else {
            break;
          }
        }
      }

      if (allParsed.length > 0) {
        allParsed.sort((a, b) => a.price - b.price);
        const top5 = allParsed.slice(0, 5);
        dateGridInfo = 'Cheapest dates from the date grid:\n' +
          top5.map((c, i) => `  ${i + 1}. $${c.price}${c.isCheapest ? ' ★ cheapest' : ''} — ${c.dates}`).join('\n');
        if (allParsed.length > 5) {
          dateGridInfo += `\n  (${allParsed.length} date combinations found total)`;
        }
      }

      // Close the date grid dialog
      const okBtn = WebMCPHelpers.findByText('OK', 'button') ||
                    WebMCPHelpers.findByText('Cancel', 'button') ||
                    WebMCPHelpers.findByText('Close', 'button');
      if (okBtn) {
        WebMCPHelpers.simulateClick(okBtn);
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
