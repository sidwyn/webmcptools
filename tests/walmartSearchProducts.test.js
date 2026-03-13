import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import { loadTool } from './helpers/loadSource.js';

// Mock browser globals
let navigatedUrl = null;
globalThis.window = { location: { href: 'https://www.walmart.com' } };
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { textContent: '' }
};
globalThis.setTimeout = (fn) => { fn(); };
globalThis.WebMCPHelpers = {
  findByText: () => null,
  findByAriaLabel: () => null,
  simulateClick: () => {},
  sleep: () => Promise.resolve(),
  waitForWalmartResults: () => Promise.resolve(true),
  findWalmartProductCards: () => [],
  parseWalmartProductCard: () => ({}),
};

const SearchProductsTool = loadTool(
  join(__dirname, '../content/sites/walmart/tools/searchProducts.js'),
  'SearchProductsTool'
);

describe('SearchProductsTool', () => {
  beforeEach(() => {
    navigatedUrl = null;
    globalThis.window.location = { href: 'https://www.walmart.com' };
    globalThis.setTimeout = (fn) => { fn(); };
  });

  it('has the correct name', () => {
    expect(SearchProductsTool.name).toBe('search_products');
  });

  it('requires query parameter', () => {
    expect(SearchProductsTool.inputSchema.required).toContain('query');
  });

  it('rejects empty query', async () => {
    const result = await SearchProductsTool.execute({ query: '' });
    expect(result.content[0].text).toMatch(/ERROR/);
  });

  it('rejects missing query', async () => {
    const result = await SearchProductsTool.execute({});
    expect(result.content[0].text).toMatch(/ERROR/);
  });

  it('returns navigation confirmation for valid query', async () => {
    globalThis.setTimeout = () => {}; // Don't actually navigate
    const result = await SearchProductsTool.execute({ query: 'wireless headphones' });
    expect(result.content[0].text).toMatch(/Navigating to Walmart/);
    expect(result.content[0].text).toMatch(/wireless headphones/);
    expect(result.content[0].text).toMatch(/get_results/);
  });

  it('includes sort in confirmation when provided', async () => {
    globalThis.setTimeout = () => {};
    const result = await SearchProductsTool.execute({ query: 'laptop', sort: 'price_low' });
    expect(result.content[0].text).toMatch(/sorted by price low/);
  });

  it('has valid sort enum values', () => {
    const sortProp = SearchProductsTool.inputSchema.properties.sort;
    expect(sortProp.enum).toContain('best_match');
    expect(sortProp.enum).toContain('price_low');
    expect(sortProp.enum).toContain('price_high');
    expect(sortProp.enum).toContain('best_seller');
    expect(sortProp.enum).toContain('rating_high');
    expect(sortProp.enum).toContain('new');
  });
});
