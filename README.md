# WebMCPTools

An open-source Chrome extension platform that injects [WebMCP](https://github.com/anthropics/webmcp) tools into websites. Each supported site is a self-contained module, and community contributors can add new sites without touching the core.

This heavily leans on the [webmcp](https://github.com/webmachinelearning/webmcp) repository and webmcp definitions.

I believe that instead of companies building webmcp tools and failing:
![Companies building WebMCP tools and failing](media/company-fail.png)

Tools should be built by the community:
![Community building WebMCP tools and succeeding](media/community-success.png)

This way a company won't over-invest at the start, and the community gets early access to awesome agents utilizing the webmcp spec. This beats the chicken-and-egg problem as well.

**Google Flights** and **YouTube** are the first site modules. More coming soon. Open an issue if you have a suggestion for what else to tackle next.

---

## Demo

![WebMCPTools Google Flights demo](media/google-flights-tokyo-demo.gif)

Here's me booking a flight for a friend from Tokyo to San Francisco. It uses a familiar chat interface, BUT plugs into webmcp tools in this repo that are community-contributed. Of course, these tools aren't official, so they tend to run into bugs, but it works well enough, _and_ gives companies a good idea of what works.

https://github.com/sidwyn/webmcp-tool-library/raw/main/media/google-flights-tokyo-demo.mp4

## Supported Sites

| Site           | Module           | Tools | Description                                                   |
| -------------- | ---------------- | ----- | ------------------------------------------------------------- |
| Google Flights | `google-flights` | 14    | Search, filter, sort, compare prices, track, and book flights |
| YouTube        | `youtube`        | 8     | Search, watch, control playback, transcripts, comments        |

Want to add a site? See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## How it uses WebMCP

[WebMCP](https://github.com/webmachinelearning/webmcp) is a proposed Web API that lets web pages expose JavaScript tools to AI agents. The spec defines `window.navigator.modelContext.registerTool()` for pages to declare callable functions with structured schemas — so agents can interact with sites programmatically instead of scraping UI.

Since no browser ships this API yet, this extension acts as a polyfill. Each site module registers tools on a `window.__webmcpRegistry` object that mirrors the spec's tool shape:

```js
registry.register({
  name: "search_flights",
  description: "Search for flights on Google Flights",
  inputSchema: {
    type: "object",
    properties: {
      origin: { type: "string", description: "Departure airport IATA code" },
      destination: { type: "string", description: "Arrival airport IATA code" },
      // ...
    },
    required: ["origin", "departureDate"],
  },
  execute: async (args) => {
    // Interact with the page DOM
    return { content: [{ type: "text", text: "Results loaded." }] };
  },
});
```

Tools use `name`, `description`, `inputSchema` (JSON Schema), and an `execute` callback that returns MCP-compatible `{ content: [{ type, text }] }` responses — matching the spec exactly. When browsers eventually ship native `modelContext`, adding a thin bridge layer is all that's needed.

---

## Architecture

```
webmcp-tool-library/
├── manifest.json                          # Extension manifest (no static content_scripts)
├── background.js                          # SITE_MODULES registry + programmatic registration
├── content/
│   ├── bridge.js                          # Generic registry + messaging bridge
│   ├── helpers.js                         # Generic DOM helpers (sleep, findByText, etc.)
│   └── sites/
│       ├── google-flights/                # Google Flights module
│       │   ├── helpers.js                 # Site-specific DOM helpers
│       │   ├── injector.js                # Tool registration + page context
│       │   ├── prompt.js                  # AI system prompt fragment
│       │   └── tools/                     # 14 tool files
│       │       ├── searchFlights.js
│       │       ├── getResults.js
│       │       └── ...
│       ├── youtube/                       # YouTube module
│       │   ├── helpers.js
│       │   ├── injector.js
│       │   ├── prompt.js
│       │   └── tools/                     # 8 tool files
│       │       ├── searchVideos.js
│       │       ├── controlPlayback.js
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

## Features

### Platform

- **Multi-site architecture** — each site is a self-contained module under `content/sites/`
- **Programmatic content scripts** — sites register dynamically, no manifest changes needed per site
- **Multi-model** — works with Claude (Anthropic) or GPT-4o (OpenAI)
- **Prompt caching** — caches system prompt and tools to reduce token usage and avoid rate limits (Anthropic)
- **Token usage display** — shows total tokens used and cache hit percentage per session
- **Conversation persistence** — chat history preserved across navigation
- **Smart rate limit handling** — automatic retry with exponential backoff, "Retry Now" button, and cancel
- **Dark mode** — adapts to system theme

### Google Flights Module

- **Natural language search** — "Cheapest nonstop from SFO to NYC in April"
- **Smart origin detection** — reads departure airport from the page
- **Full filter control** — stops, price, airlines, times, duration, bags
- **Price insights & date grid** — navigates the full date grid to find cheapest dates across a month
- **Flight details** — leg-by-leg itinerary, aircraft, legroom, emissions
- **One-click booking** — clicks "Continue" to open the airline's booking site directly
- **Fare comparison** — shows fare options (Basic Economy, Economy, etc.) with features and prices
- **Destination fun facts** — shares interesting facts about your destination when booking
- **Price tracking** — email alerts when prices change
- **Explore destinations** — cheapest places to fly on a map
- **Multi-city search** — complex itineraries (SFO→Tokyo→Bangkok→SFO)
- **Page awareness** — detects existing search results and acts on them without re-asking
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

## Google Flights Tools

| Tool                      | Available on | Description                                               |
| ------------------------- | ------------ | --------------------------------------------------------- |
| `search_flights`          | All pages    | Navigate with origin, destination, dates, cabin class     |
| `set_search_options`      | All pages    | Change trip type, cabin class, passengers                 |
| `get_results`             | Results page | Read flight listings                                      |
| `set_filters`             | Results page | Apply filters: stops, price, airlines, times, bags        |
| `sort_results`            | Results page | Sort by Best or Cheapest                                  |
| `get_price_insights`      | Results page | Price level, date grid, booking recommendation            |
| `get_flight_details`      | Results page | Detailed segment info: layovers, aircraft, legroom        |
| `track_price`             | Results page | Toggle email price tracking                               |
| `get_tracked_flights`     | All pages    | View saved price alerts and history                       |
| `get_booking_link`        | Booking page | Show fare options and click "Continue" to book (fareRank) |
| `select_return_flight`    | Results page | List or select return options                             |
| `explore_destinations`    | All pages    | Browse cheapest destinations on map                       |
| `search_multi_city`       | All pages    | Multi-city itineraries (2-5 legs)                         |
| `set_connecting_airports` | Results page | Exclude layover airports                                  |

---

## YouTube Tools

| Tool                 | Available on       | Description                                                |
| -------------------- | ------------------ | ---------------------------------------------------------- |
| `search_videos`      | All pages          | Search YouTube for videos by keyword                       |
| `get_search_results` | Search results     | Read video titles, channels, views from search results     |
| `get_video_info`     | Video watch page   | Title, channel, views, likes, duration, description        |
| `control_playback`   | Video watch page   | Play, pause, seek, volume, speed, mute/unmute, fullscreen  |
| `get_transcript`     | Video watch page   | Read timestamped closed captions                           |
| `get_comments`       | Video watch page   | Read top comments with author, likes, timestamp            |
| `get_channel_info`   | Video/channel page | Channel name, subscribers, description                     |
| `get_recommendations`| All pages          | Related videos (sidebar) or homepage recommendations       |

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

_Last updated: 2026-03-13_

<!-- /LAST_UPDATED -->
