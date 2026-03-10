// content/tools/google-flights/setFilters.js

const SetFiltersTool = {
  name: 'set_filters',
  description: 'Apply filters to Google Flights results. Supports: stops, max price, specific airlines, departure/arrival time windows, max flight duration, and number of bags included. Only works on a Google Flights results page.',
  inputSchema: {
    type: 'object',
    properties: {
      stops: {
        type: 'string',
        enum: ['any', 'nonstop', '1_or_fewer', '2_or_fewer'],
        description: 'Maximum number of stops'
      },
      maxPrice: {
        type: 'integer',
        description: 'Maximum total price in USD'
      },
      airlines: {
        type: 'string',
        description: 'Comma-separated airline names to show only (e.g. "United, Delta"). All others will be deselected.'
      },
      departureTimeStart: {
        type: 'string',
        description: 'Earliest departure time in HH:MM 24h format (e.g. "06:00")'
      },
      departureTimeEnd: {
        type: 'string',
        description: 'Latest departure time in HH:MM 24h format (e.g. "22:00")'
      },
      arrivalTimeStart: {
        type: 'string',
        description: 'Earliest arrival time in HH:MM 24h format'
      },
      arrivalTimeEnd: {
        type: 'string',
        description: 'Latest arrival time in HH:MM 24h format'
      },
      maxDurationHours: {
        type: 'number',
        description: 'Maximum total flight duration in hours (e.g. 8.5 for 8h 30m)'
      },
      carryOnBags: {
        type: 'integer',
        description: 'Minimum number of carry-on bags included (0 or 1)'
      },
      checkedBags: {
        type: 'integer',
        description: 'Minimum number of checked bags included (0, 1, or 2)'
      }
    }
  },

  execute: async (args) => {
    if (!window.location.href.includes('google.com/travel/flights')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on Google Flights.' }] };
    }

    const actions = [];

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Open a filter panel by clicking its button, then wait for checkboxes to appear
    async function openFilterPanel(labels) {
      for (const label of labels) {
        const btn = WebMCPHelpers.findByText(label, 'button') ||
                    WebMCPHelpers.findByAriaLabel(label);
        if (btn) {
          WebMCPHelpers.simulateClick(btn);
          // Poll for checkboxes to appear (up to 3s) instead of fixed delay
          for (let attempt = 0; attempt < 12; attempt++) {
            await WebMCPHelpers.sleep(250);
            if (document.querySelectorAll('input[type="checkbox"]').length > 0) return true;
          }
          return true; // panel opened even if no checkboxes found
        }
      }
      return false;
    }

    // Close open panel with Escape
    async function closePanel() {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await WebMCPHelpers.sleep(300);
    }

    // Convert "HH:MM" to minutes since midnight
    function timeToMinutes(hhmm) {
      if (!hhmm) return null;
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + (m || 0);
    }

    // ── Stops ─────────────────────────────────────────────────────────────────
    if (args.stops && args.stops !== 'any') {
      const optionLabels = {
        nonstop:    ['Nonstop only', 'Nonstop'],
        '1_or_fewer': ['1 stop or fewer', '1 stop'],
        '2_or_fewer': ['2 stops or fewer', '2 stops']
      };
      const targets = optionLabels[args.stops] || [];
      let clicked = false;

      // Try direct chip click first
      for (const label of targets) {
        const btn = WebMCPHelpers.findByAriaLabel(label) ||
                    WebMCPHelpers.findByText(label, 'button') ||
                    WebMCPHelpers.findByText(label, '[role="option"]');
        if (btn) {
          WebMCPHelpers.simulateClick(btn);
          await WebMCPHelpers.sleep(400);
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        const opened = await openFilterPanel(['Stops', 'Number of stops']);
        if (opened) {
          for (const label of targets) {
            const opt = WebMCPHelpers.findByText(label, '[role="option"]') ||
                        WebMCPHelpers.findByText(label, 'label') ||
                        WebMCPHelpers.findByText(label, 'li');
            if (opt) {
              WebMCPHelpers.simulateClick(opt);
              await WebMCPHelpers.sleep(400);
              clicked = true;
              break;
            }
          }
        }
      }

      actions.push(clicked
        ? `Set stops filter: ${args.stops.replace(/_/g, ' ')}`
        : `WARNING: Could not set stops filter to "${args.stops}"`);
    }

    // ── Max price ─────────────────────────────────────────────────────────────
    if (args.maxPrice) {
      const opened = await openFilterPanel(['Price', 'Max price', 'Price filter']);
      if (opened) {
        await WebMCPHelpers.sleep(300);
        const sliders = document.querySelectorAll('input[type="range"]');
        // Use the last slider in case there are multiple (typically the max handle)
        const slider = sliders[sliders.length - 1];
        if (slider) {
          WebMCPHelpers.setSliderValue(slider, args.maxPrice);
          await WebMCPHelpers.sleep(300);
          actions.push(`Set max price: $${args.maxPrice}`);
        } else {
          actions.push('WARNING: Could not find price slider');
        }
        await closePanel();
      } else {
        actions.push('WARNING: Could not open Price filter');
      }
    }

    // ── Airlines ──────────────────────────────────────────────────────────────
    if (args.airlines) {
      const wantedAirlines = args.airlines.split(',').map(a => a.trim().toLowerCase());
      const opened = await openFilterPanel(['Airlines', 'Airline']);
      if (opened) {
        await WebMCPHelpers.sleep(300);

        // Match airline names flexibly: exact substring, word-start match, or first letters
        function airlineMatches(name, wanted) {
          // Direct substring match (either direction)
          if (name.includes(wanted) || wanted.includes(name)) return true;
          // Word-start match: "singapore" matches "singapore airlines"
          const nameWords = name.split(/\s+/);
          const wantedWords = wanted.split(/\s+/);
          if (nameWords.some(w => wantedWords.some(ww => w.startsWith(ww) || ww.startsWith(w)))) return true;
          return false;
        }

        // Google Flights has an "Only" button next to each airline in the filter panel.
        // Clicking "Only" deselects all other airlines in one click — much faster.
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        let clicked = false;

        for (const cb of checkboxes) {
          const label = cb.id ? document.querySelector(`label[for="${cb.id}"]`) : null;
          const name = (label?.textContent?.trim() || '').toLowerCase();
          if (!name || name.length < 2) continue;
          if (/^(oneworld|skyteam|star alliance)$/i.test(name)) continue;

          const isWanted = wantedAirlines.some(a => airlineMatches(name, a));
          if (!isWanted) continue;

          // Find the "Only" button in this airline's row
          // Walk up from the checkbox to find the row container (typically an <li>)
          let row = cb.parentElement;
          for (let i = 0; i < 5 && row; i++) {
            // Look for a button containing an "Only" span
            const onlyBtn = Array.from(row.querySelectorAll('button')).find(btn =>
              Array.from(btn.querySelectorAll('span')).some(s => s.textContent.trim() === 'Only')
            );
            if (onlyBtn) {
              WebMCPHelpers.simulateClick(onlyBtn);
              await WebMCPHelpers.sleep(300);
              clicked = true;
              actions.push(`Filtered to airline: ${label.textContent.trim()} (clicked "Only")`);
              break;
            }
            row = row.parentElement;
          }
          if (clicked) break;
        }

        // Fallback: if "Only" button not found, use the old checkbox approach
        if (!clicked) {
          let found = 0;
          let unchecked = 0;
          for (const cb of checkboxes) {
            const label = cb.id ? document.querySelector(`label[for="${cb.id}"]`) : null;
            const name = (label?.textContent?.trim() || '').toLowerCase();
            if (!name || name.length < 2) continue;
            if (/^(oneworld|skyteam|star alliance)$/i.test(name)) continue;

            const isWanted = wantedAirlines.some(a => airlineMatches(name, a));
            if (isWanted) {
              found++;
              if (!cb.checked) { WebMCPHelpers.simulateClick(label || cb); await WebMCPHelpers.sleep(30); }
            } else if (cb.checked) {
              WebMCPHelpers.simulateClick(label || cb);
              await WebMCPHelpers.sleep(30);
              unchecked++;
            }
          }
          actions.push(found > 0
            ? `Filtered to airlines: ${args.airlines} (deselected ${unchecked} others)`
            : `WARNING: Could not find airline checkboxes for: ${args.airlines}`);
        }

        await closePanel();
      } else {
        actions.push('WARNING: Could not open Airlines filter');
      }
    }

    // ── Times ─────────────────────────────────────────────────────────────────
    const hasTimes = args.departureTimeStart || args.departureTimeEnd ||
                     args.arrivalTimeStart || args.arrivalTimeEnd;
    if (hasTimes) {
      const opened = await openFilterPanel(['Times', 'Departure & arrival times', 'Departure time']);
      if (opened) {
        await WebMCPHelpers.sleep(400);
        const sliders = Array.from(document.querySelectorAll('input[type="range"]'));

        // Google Flights Times panel: 4 sliders in order:
        // [0] departure start, [1] departure end, [2] arrival start, [3] arrival end
        if (sliders.length >= 2) {
          const deptStart = timeToMinutes(args.departureTimeStart);
          const deptEnd   = timeToMinutes(args.departureTimeEnd);
          const arrStart  = timeToMinutes(args.arrivalTimeStart);
          const arrEnd    = timeToMinutes(args.arrivalTimeEnd);

          if (deptStart !== null && sliders[0]) WebMCPHelpers.setSliderValue(sliders[0], deptStart);
          if (deptEnd   !== null && sliders[1]) WebMCPHelpers.setSliderValue(sliders[1], deptEnd);
          if (sliders.length >= 4) {
            if (arrStart !== null && sliders[2]) WebMCPHelpers.setSliderValue(sliders[2], arrStart);
            if (arrEnd   !== null && sliders[3]) WebMCPHelpers.setSliderValue(sliders[3], arrEnd);
          }
          actions.push('Applied time filters');
        } else {
          actions.push('WARNING: Could not find time range sliders');
        }
        await closePanel();
      } else {
        actions.push('WARNING: Could not open Times filter');
      }
    }

    // ── Duration ──────────────────────────────────────────────────────────────
    if (args.maxDurationHours !== undefined) {
      const opened = await openFilterPanel(['Duration', 'Max duration', 'Flight duration']);
      if (opened) {
        await WebMCPHelpers.sleep(300);
        const slider = document.querySelector('input[type="range"]');
        if (slider) {
          // Duration sliders are often in minutes
          const sliderMax = parseFloat(slider.max) || 0;
          // If max > 30 assume minutes, else hours
          const value = sliderMax > 30 ? args.maxDurationHours * 60 : args.maxDurationHours;
          WebMCPHelpers.setSliderValue(slider, value);
          await WebMCPHelpers.sleep(300);
          actions.push(`Set max duration: ${args.maxDurationHours}h`);
        } else {
          actions.push('WARNING: Could not find duration slider');
        }
        await closePanel();
      } else {
        actions.push('WARNING: Could not open Duration filter');
      }
    }

    // ── Bags ──────────────────────────────────────────────────────────────────
    if (args.carryOnBags !== undefined || args.checkedBags !== undefined) {
      const opened = await openFilterPanel(['Bags', 'Baggage', 'Carry-on bags']);
      if (opened) {
        await WebMCPHelpers.sleep(300);

        async function setBagCount(sectionKeywords, targetCount) {
          let sectionEl = null;
          for (const kw of sectionKeywords) {
            sectionEl = WebMCPHelpers.findByText(kw) || WebMCPHelpers.findByAriaLabel(kw);
            if (sectionEl) break;
          }
          if (!sectionEl) return false;

          const container = sectionEl.closest('[jsname], [role="listitem"]') ||
                            sectionEl.closest('div[class]') || sectionEl.parentElement?.parentElement;
          if (!container) return false;

          const countEl = Array.from(container.querySelectorAll('*')).find(el =>
            el.children.length === 0 && /^\d+$/.test(el.textContent.trim())
          );
          const current = countEl ? parseInt(countEl.textContent.trim(), 10) : 0;
          const diff = targetCount - current;
          if (diff === 0) return true;

          const btns = Array.from(container.querySelectorAll('button'));
          const minusBtn = btns.find(b => b.textContent.trim() === '–' || /decrease|remove/i.test(b.getAttribute('aria-label') || ''));
          const plusBtn  = btns.find(b => b.textContent.trim() === '+' || /increase|add/i.test(b.getAttribute('aria-label') || ''));
          const btn = diff > 0 ? plusBtn : minusBtn;
          if (!btn) return false;

          for (let i = 0; i < Math.abs(diff); i++) {
            WebMCPHelpers.simulateClick(btn);
            await WebMCPHelpers.sleep(120);
          }
          return true;
        }

        if (args.carryOnBags !== undefined) {
          const ok = await setBagCount(['Carry-on bag', 'Carry-on', 'Carry on'], args.carryOnBags);
          actions.push(ok ? `Set carry-on bags: ${args.carryOnBags}` : 'WARNING: Could not set carry-on bags');
        }
        if (args.checkedBags !== undefined) {
          const ok = await setBagCount(['Checked bag', 'Checked bags', 'Checked'], args.checkedBags);
          actions.push(ok ? `Set checked bags: ${args.checkedBags}` : 'WARNING: Could not set checked bags');
        }

        await closePanel();
      } else {
        actions.push('WARNING: Could not open Bags filter');
      }
    }

    if (actions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No filters specified. Available: stops, maxPrice, airlines, departureTimeStart/End, arrivalTimeStart/End, maxDurationHours, carryOnBags, checkedBags.'
        }]
      };
    }

    await WebMCPHelpers.sleep(800);

    return {
      content: [{
        type: 'text',
        text: `Filters applied:\n${actions.join('\n')}\n\nCall get_results to see the updated flights.`
      }]
    };
  }
};
