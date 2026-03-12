# WebMCPTools

An open-source Chrome extension platform that injects [WebMCP](https://github.com/anthropics/webmcp) tools into websites and lets you chat with an AI agent that can use them. Each supported site is a self-contained module — community contributors can add new sites without touching the core.

**Google Flights** is the first site module. More coming soon.

---

## Demo

<!-- VIDEO PLACEHOLDER -->
> Demo video coming soon

---

## Supported Sites

| Site | Module | Tools | Description |
|------|--------|-------|-------------|
| Google Flights | `google-flights` | 14 | Search, filter, sort, compare prices, track, and book flights |

Want to add a site? See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Features

### Platform
- **Multi-site architecture** — each site is a self-contained module under `content/sites/`
- **Programmatic content scripts** — sites register dynamically, no manifest changes needed per site
- **Multi-model** — works with Claude (Anthropic) or GPT-4o (OpenAI)
- **Conversation persistence** — chat history preserved across navigation
- **Smart rate limit handling** — automatic retry with exponential backoff and cancel button on API rate limits
- **Dark mode** — adapts to system theme

### Google Flights Module
- **Natural language search** — "Cheapest nonstop from SFO to NYC in April"
- **Smart origin detection** — reads departure airport from the page
- **Full filter control** — stops, price, airlines, times, duration, bags
- **Price insights & date grid** — finds cheapest dates across a month
- **Flight details** — leg-by-leg itinerary, aircraft, legroom, emissions
- **Booking links** — direct URLs from airlines and OTAs
- **Price tracking** — email alerts when prices change
- **Explore destinations** — cheapest places to fly on a map
- **Multi-city search** — complex itineraries (SFO→Tokyo→Bangkok→SFO)
- **Quick reply suggestions** — clickable follow-up buttons
- **Markdown tables** — clean formatted results

---

## Installation

1. Clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the repo folder
5. Navigate to a supported site — the WebMCPTools panel appears in the side panel

---

## Setup

Add your API key in the extension's Settings panel:

- **Anthropic** — get a key at [console.anthropic.com](https://console.anthropic.com)
- **OpenAI** — get a key at [platform.openai.com](https://platform.openai.com)

Keys are stored locally in `chrome.storage.local` and never leave your browser except to call the respective API.

---

## Architecture

```
webmcptools/
├── manifest.json                          # Extension manifest (no static content_scripts)
├── background.js                          # SITE_MODULES registry + programmatic registration
├── content/
│   ├── bridge.js                          # Generic registry + messaging bridge
│   ├── helpers.js                         # Generic DOM helpers (sleep, findByText, etc.)
│   └── sites/
│       ├── google-flights/                # First site module
│       │   ├── helpers.js                 # Site-specific DOM helpers
│       │   ├── injector.js                # Tool registration + page context
│       │   ├── prompt.js                  # AI system prompt fragment
│       │   └── tools/                     # 14 tool files
│       │       ├── searchFlights.js
│       │       ├── getResults.js
│       │       └── ...
│       └── _template/                     # Skeleton for new site modules
├── sidepanel/
│   ├── index.html
│   ├── app.js                             # Chat UI + agent loop
│   ├── settings.js
│   ├── styles.css
│   └── providers/
│       ├── base.js
│       ├── anthropic.js
│       └── openai.js
├── tests/
├── CONTRIBUTING.md
└── icons/
```

### How it works

1. `background.js` registers content scripts programmatically for each site in `SITE_MODULES`
2. When you visit a supported site, the content scripts load: `bridge.js` → `helpers.js` → site helpers → tools → prompt → injector
3. The injector registers tools with `window.__webmcpRegistry` based on the current page
4. The side panel connects to the registry, fetches tools, and passes them to the AI provider
5. The AI calls tools via message passing — bridge executes them in the page context

Adding a new site = one entry in `SITE_MODULES` + one folder under `content/sites/`.

---

## Google Flights Tools

| Tool | Available on | Description |
|------|-------------|-------------|
| `search_flights` | All pages | Navigate with origin, destination, dates, cabin class |
| `set_search_options` | All pages | Change trip type, cabin class, passengers |
| `get_results` | Results page | Read flight listings |
| `set_filters` | Results page | Apply filters: stops, price, airlines, times, bags |
| `sort_results` | Results page | Sort by Best or Cheapest |
| `get_price_insights` | Results page | Price level, date grid, booking recommendation |
| `get_flight_details` | Results page | Detailed segment info: layovers, aircraft, legroom |
| `track_price` | Results page | Toggle email price tracking |
| `get_tracked_flights` | All pages | View saved price alerts and history |
| `get_booking_link` | Booking page | Get booking URLs from airlines/OTAs |
| `select_return_flight` | Results page | List or select return options |
| `explore_destinations` | All pages | Browse cheapest destinations on map |
| `search_multi_city` | All pages | Multi-city itineraries (2-5 legs) |
| `set_connecting_airports` | Results page | Exclude layover airports |

---

## Development

No build step required. Edit files, reload the extension in `chrome://extensions`, refresh the page.

```bash
npm test        # Run test suite
```

Git hooks are stored in `.githooks/`. After cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a new site module.

---

## License

MIT — see [LICENSE](LICENSE)

---

<!-- LAST_UPDATED -->
_Last updated: 2026-03-11_
<!-- /LAST_UPDATED -->
