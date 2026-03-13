import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { loadTool } from './helpers/loadSource.js';

// Mock browser globals
globalThis.window = { location: { href: 'https://www.amazon.com/' } };
globalThis.setTimeout = vi.fn();

const SearchProductsTool = loadTool(
  join(__dirname, '../content/sites/amazon/tools/searchProducts.js'),
  'SearchProductsTool'
);

describe('SearchProductsTool', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('schema', () => {
    it('has correct name', () => {
      expect(SearchProductsTool.name).toBe('search_products');
    });

    it('requires query', () => {
      expect(SearchProductsTool.inputSchema.required).toEqual(['query']);
    });

    it('defines category enum', () => {
      expect(SearchProductsTool.inputSchema.properties.category.enum).toContain('electronics');
      expect(SearchProductsTool.inputSchema.properties.category.enum).toContain('books');
    });

    it('defines sortBy enum', () => {
      expect(SearchProductsTool.inputSchema.properties.sortBy.enum).toContain('price_low_to_high');
      expect(SearchProductsTool.inputSchema.properties.sortBy.enum).toContain('avg_customer_review');
    });
  });

  describe('validation', () => {
    it('rejects empty query', async () => {
      const result = await SearchProductsTool.execute({ query: '' });
      expect(result.content[0].text).toContain('ERROR');
    });

    it('rejects missing query', async () => {
      const result = await SearchProductsTool.execute({});
      expect(result.content[0].text).toContain('ERROR');
    });
  });

  describe('successful execution', () => {
    it('returns navigation message for valid search', async () => {
      const result = await SearchProductsTool.execute({ query: 'wireless headphones' });
      const text = result.content[0].text;
      expect(text).toContain('Navigating to Amazon');
      expect(text).toContain('wireless headphones');
    });

    it('includes category in message when specified', async () => {
      const result = await SearchProductsTool.execute({ query: 'laptop', category: 'electronics' });
      expect(result.content[0].text).toContain('electronics');
    });

    it('includes sort order in message when specified', async () => {
      const result = await SearchProductsTool.execute({ query: 'shoes', sortBy: 'price_low_to_high' });
      expect(result.content[0].text).toContain('price low to high');
    });

    it('schedules navigation via setTimeout', async () => {
      await SearchProductsTool.execute({ query: 'test' });
      expect(globalThis.setTimeout).toHaveBeenCalled();
    });
  });
});
