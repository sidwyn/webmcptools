import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { loadTool } from '../helpers/loadSource.js';

// Mock browser globals
globalThis.window = { location: { href: 'https://www.youtube.com' } };
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => []
};
globalThis.WebMCPHelpers = {
  sleep: () => Promise.resolve(),
  waitForYouTubeResults: () => Promise.resolve(true)
};

const SearchVideosTool = loadTool(
  join(__dirname, '../../content/sites/youtube/tools/searchVideos.js'),
  'SearchVideosTool'
);

describe('SearchVideosTool', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('schema', () => {
    it('has correct name', () => {
      expect(SearchVideosTool.name).toBe('search_videos');
    });

    it('requires query', () => {
      expect(SearchVideosTool.inputSchema.required).toEqual(['query']);
    });

    it('has query property with description', () => {
      expect(SearchVideosTool.inputSchema.properties.query).toBeDefined();
      expect(SearchVideosTool.inputSchema.properties.query.description).toBeDefined();
    });
  });

  describe('validation', () => {
    it('rejects missing query', async () => {
      const result = await SearchVideosTool.execute({});
      expect(result.content[0].text).toContain('ERROR');
    });

    it('rejects empty query', async () => {
      const result = await SearchVideosTool.execute({ query: '  ' });
      expect(result.content[0].text).toContain('ERROR');
    });
  });

  describe('successful execution', () => {
    it('returns navigation message for valid query', async () => {
      const result = await SearchVideosTool.execute({ query: 'javascript tutorial' });
      expect(result.content[0].text).toContain('javascript tutorial');
    });

    it('navigates to correct URL', async () => {
      await SearchVideosTool.execute({ query: 'cooking pasta' });
      expect(window.location.href).toContain('youtube.com/results');
      expect(window.location.href).toContain('search_query=cooking%20pasta');
    });
  });
});
