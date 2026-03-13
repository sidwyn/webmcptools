import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { readFileSync } from 'fs';
import vm from 'vm';

// Setup minimal DOM mocks
const mockCards = [];

globalThis.window = { location: { href: 'https://www.walmart.com/search?q=test' } };
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: (selector) => {
    if (selector === '[data-item-id]') return mockCards;
    return [];
  },
  body: { textContent: '' }
};
globalThis.WebMCPHelpers = {
  sleep: () => Promise.resolve(),
  waitForElementToDisappear: () => Promise.resolve(),
  findByText: () => null,
};
globalThis.Array = Array;
globalThis.Promise = Promise;
globalThis.setTimeout = (fn, ms) => fn();

// Load the helpers file
const source = readFileSync(join(__dirname, '../content/sites/walmart/helpers.js'), 'utf-8');
vm.runInThisContext(source, { filename: 'walmart/helpers.js' });

describe('Walmart helpers', () => {
  describe('parseWalmartProductCard', () => {
    it('is defined on WebMCPHelpers', () => {
      expect(typeof WebMCPHelpers.parseWalmartProductCard).toBe('function');
    });

    it('returns structured data with rank', () => {
      const mockCard = {
        textContent: 'Samsung Galaxy Buds $99.99 4.5 out of 5 stars 1234 reviews',
        querySelector: () => null,
        querySelectorAll: () => [],
        offsetHeight: 100,
        offsetWidth: 300,
      };
      const result = WebMCPHelpers.parseWalmartProductCard(mockCard, 1);
      expect(result.rank).toBe(1);
      expect(result.price).toBe('$99.99');
    });

    it('extracts price from card text', () => {
      const mockCard = {
        textContent: 'Some Product $49.97 Free shipping',
        querySelector: () => null,
        querySelectorAll: () => [],
        offsetHeight: 100,
        offsetWidth: 300,
      };
      const result = WebMCPHelpers.parseWalmartProductCard(mockCard, 2);
      expect(result.price).toBe('$49.97');
      expect(result.rank).toBe(2);
    });

    it('handles card with no price', () => {
      const mockCard = {
        textContent: 'Some Product - Currently unavailable',
        querySelector: () => null,
        querySelectorAll: () => [],
        offsetHeight: 100,
        offsetWidth: 300,
      };
      const result = WebMCPHelpers.parseWalmartProductCard(mockCard, 3);
      expect(result.price).toBeNull();
    });

    it('detects out of stock', () => {
      const mockCard = {
        textContent: 'Some Product $29.99 Out of Stock',
        querySelector: () => null,
        querySelectorAll: () => [],
        offsetHeight: 100,
        offsetWidth: 300,
      };
      const result = WebMCPHelpers.parseWalmartProductCard(mockCard, 1);
      expect(result.outOfStock).toBe(true);
    });
  });

  describe('waitForWalmartResults', () => {
    it('is defined on WebMCPHelpers', () => {
      expect(typeof WebMCPHelpers.waitForWalmartResults).toBe('function');
    });
  });

  describe('findWalmartProductCards', () => {
    it('is defined on WebMCPHelpers', () => {
      expect(typeof WebMCPHelpers.findWalmartProductCards).toBe('function');
    });
  });

  describe('parseWalmartProductDetail', () => {
    it('is defined on WebMCPHelpers', () => {
      expect(typeof WebMCPHelpers.parseWalmartProductDetail).toBe('function');
    });

    it('returns an object when no product data found', () => {
      const result = WebMCPHelpers.parseWalmartProductDetail();
      expect(result).toBeDefined();
      expect(result.title).toBeNull();
    });
  });
});
