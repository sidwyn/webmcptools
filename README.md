# WebMCPTools

An open-source Chrome extension platform that injects [WebMCP](https://github.com/webmachinelearning/webmcp) tools into websites. Each supported site is a self-contained module, and community contributors can add new sites without touching the core.

This heavily leans on the [webmcp](https://github.com/webmachinelearning/webmcp) repository and webmcp definitions.

I believe that instead of companies building webmcp tools and failing:
![Companies building WebMCP tools and failing](media/company-fail.png)

Tools should be built by the community:
![Community building WebMCP tools and succeeding](media/community-success.png)

This way a company won't over-invest at the start, and the community gets early access to awesome agents utilizing the webmcp spec. This beats the chicken-and-egg problem as well.

**Google Flights**, **Google Hotels**, **Amazon**, **Walmart**, and **Target** are the five site modules. Open an issue if you have a suggestion for what else to tackle next.

---

## Demo

![WebMCPTools Google Flights demo](media/google-flights-tokyo-demo.gif)

Here's me booking a flight for a friend from Tokyo to San Francisco. It uses a familiar chat interface, BUT plugs into webmcp tools in this repo that are community-contributed. Of course, these tools aren't official, so they tend to run into bugs, but it works well enough, _and_ gives companies a good idea of what works.

https://github.com/sidwyn/webmcp-tool-library/raw/main/media/google-flights-tokyo-demo.mp4

## Supported Sites

| Site           | Module           | Tools | Description                                                   |
| -------------- | ---------------- | ----- | ------------------------------------------------------------- |
| Google Flights | `google-flights` | 14    | Search, filter, sort, compare prices, track, and book flights |
| Google Hotels  | `google-hotels`  | 11    | Search, filter, sort, compare prices, read reviews, book, track, and save hotels |
| Amazon         | `amazon`         | 12    | Search, filter, sort, compare, read reviews, add to cart, buy now, check prices |
| Walmart        | `walmart`        | 7     | Search, filter, sort, view details, add to cart, view cart |
| Target         | `target`         | 9     | Search, filter, sort, view details, add to cart, find deals, check store availability |

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
│       ├── google-flights/                # Flight search module (14 tools)
│       │   ├── helpers.js                 # Site-specific DOM helpers
│       │   ├── injector.js                # Tool registration + page context
│       │   ├── prompt.js                  # AI system prompt fragment
│       │   └── tools/                     # 14 tool files
│       ├── google-hotels/                 # Hotel search module (11 tools)
│       │   ├── helpers.js
│       │   ├── injector.js
│       │   ├── prompt.js
│       │   └── tools/                     # 11 tool files
│       ├── amazon/                        # Amazon shopping module (12 tools)
│       │   ├── helpers.js
│       │   ├── injector.js
│       │   ├── prompt.js
│       │   └── tools/                     # 12 tool files
│       ├── walmart/                       # Walmart shopping module (7 tools)
│       │   ├── helpers.js
│       │   ├── injector.js
│       │   ├── prompt.js
│       │   └── tools/                     # 7 tool files
│       ├── target/                        # Target shopping module (9 tools)
│       │   ├── helpers.js
│       │   ├── injector.js
│       │   ├── prompt.js
│       │   └── tools/                     # 9 tool files
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

### Google Hotels Module

- **Natural language search** — "Find me a hotel in Tokyo under $150/night"
- **Full filter control** — price, star rating, guest rating, amenities, brands, property type, eco-certified, free cancellation
- **Price comparison** — compare rates from Booking.com, Expedia, Hotels.com, Agoda, and more
- **Guest reviews** — overall rating, category scores, review snippets with author names, third-party ratings
- **Hotel details** — amenities, address, check-in/out times, deal badges, hotel website link
- **One-click booking** — opens the booking provider's website directly
- **Price tracking** — email alerts when hotel prices change
- **Save hotels** — bookmark hotels to your collection for later
- **Smart sorting** — by price, rating, most reviewed, or relevance
- **Site-aware UI** — welcome screen and example prompts change based on whether you're on Flights or Hotels
- **Onboarding preferences** — customize defaults for both flights and hotels (budget, star rating, amenities)

### Amazon Module

- **Natural language search** — "Find the best rated wireless headphones under $100"
- **Full filter control** — price range, brand, Prime eligibility, customer rating, department
- **Product comparison** — compare multiple products side by side
- **Review reading** — customer reviews with ratings and titles
- **Price tracking** — current vs list price, coupon detection
- **Cart management** — add to cart, view cart, buy now
- **Checkout summary** — review order details before placing

### Walmart Module

- **Natural language search** — "Find me a 4K TV under $400"
- **Full filter control** — price, brand, fulfillment method, rating, special offers (rollback, clearance)
- **Product details** — specifications, seller info, fulfillment options
- **Cart management** — add to cart with quantity, view cart with totals

### Target Module

- **Natural language search** — "Find me a coffee maker under $50"
- **Full filter control** — price, brand, rating, shipping options, sale items
- **Store availability** — check pickup, shipping, and delivery by ZIP code
- **Deal finder** — Circle offers, sale badges, promo badges
- **Cart management** — add to cart with color/size/quantity options

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

## Google Hotels Tools

| Tool                 | Available on | Description                                                              |
| -------------------- | ------------ | ------------------------------------------------------------------------ |
| `search_hotels`      | All pages    | Search by location, dates, and guests                                    |
| `set_search_options` | All pages    | Change check-in/check-out dates or guest count                           |
| `get_results`        | Results page | Read hotel listings with prices, ratings, and deal badges                |
| `set_filters`        | Results page | Filter by price, rating, class, amenities, brands, eco-certified, type   |
| `sort_results`       | Results page | Sort by relevance, price, rating, or most reviewed                       |
| `get_hotel_details`  | Results page | Full details: amenities, address, check-in/out, deals, website           |
| `get_prices`         | Detail page  | Compare booking prices across providers (Booking.com, Expedia, etc.)     |
| `get_reviews`        | Detail page  | Guest reviews, category ratings, and third-party review scores           |
| `save_hotel`         | Results page | Save or unsave a hotel to your collection                                |
| `book_hotel`         | Detail page  | Open a booking provider's website to complete the reservation            |
| `track_hotel`        | Detail page  | Enable/disable price tracking alerts for a hotel                         |

## Amazon Tools

| Tool                   | Available on     | Description                                                    |
| ---------------------- | ---------------- | -------------------------------------------------------------- |
| `search_products`      | All pages        | Search Amazon by keyword with optional sort                    |
| `get_results`          | Search page      | Read product listings with prices, ratings, Prime badges       |
| `set_filters`          | Search page      | Filter by price range, brand, Prime, rating, department        |
| `sort_results`         | Search page      | Sort by featured, price, rating, newest, best sellers          |
| `get_product_details`  | Search / Product | Full product info: price, rating, availability, specs          |
| `get_reviews`          | Product page     | Read customer reviews with ratings and titles                  |
| `check_price_history`  | Product page     | Check current vs list price and any available coupons          |
| `add_to_cart`          | Product page     | Add current product to cart with quantity                      |
| `buy_now`              | Product page     | Click "Buy Now" for immediate checkout                        |
| `get_cart`             | All pages        | View cart contents, subtotal, and estimated total              |
| `compare_products`     | Search page      | Compare multiple products side by side                        |
| `get_checkout_summary` | Checkout page    | Read order summary before placing order                       |

## Walmart Tools

| Tool                  | Available on     | Description                                                     |
| --------------------- | ---------------- | --------------------------------------------------------------- |
| `search_products`     | All pages        | Search Walmart by keyword with optional sort                    |
| `get_results`         | Search page      | Read product listings with prices, ratings, seller info         |
| `set_filters`         | Search page      | Filter by price, brand, fulfillment, rating, special offers     |
| `sort_results`        | Search page      | Sort by best match, price, best seller, rating, newest          |
| `get_product_details` | Search / Product | Full product info: price, rating, seller, fulfillment, specs    |
| `add_to_cart`         | Product page     | Add current product to cart with quantity                       |
| `get_cart`            | All pages        | View cart contents, subtotal, and estimated total               |

## Target Tools

| Tool                       | Available on     | Description                                                    |
| -------------------------- | ---------------- | -------------------------------------------------------------- |
| `search_products`          | All pages        | Search Target by keyword                                       |
| `get_search_results`       | Search page      | Read product listings with prices, ratings, badges             |
| `set_filters`              | Search page      | Filter by price, brand, rating, shipping, sale                 |
| `sort_results`             | Search page      | Sort by relevance, price, rating, newest, best selling         |
| `get_product_details`      | Search / Product | Full product info: price, rating, availability, specs          |
| `add_to_cart`              | Product page     | Add to cart with color, size, and quantity options              |
| `get_cart_summary`         | All pages        | View cart contents and totals                                  |
| `get_deals`                | All pages        | Find deals, Circle offers, and sale badges on current page     |
| `check_store_availability` | Product page     | Check in-store pickup, shipping, and delivery by ZIP code      |

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

_Last updated: 2026-03-14_

<!-- /LAST_UPDATED -->
