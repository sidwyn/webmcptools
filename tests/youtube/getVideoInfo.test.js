import { describe, it, expect, vi } from 'vitest';
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
  waitForVideoPlayer: () => Promise.resolve(true),
  getVideoElement: () => null,
  formatDuration: (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
};
globalThis.URLSearchParams = URLSearchParams;

const GetVideoInfoTool = loadTool(
  join(__dirname, '../../content/sites/youtube/tools/getVideoInfo.js'),
  'GetVideoInfoTool'
);

describe('GetVideoInfoTool', () => {
  describe('schema', () => {
    it('has correct name', () => {
      expect(GetVideoInfoTool.name).toBe('get_video_info');
    });

    it('has empty required (no params needed)', () => {
      expect(GetVideoInfoTool.inputSchema.required).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('returns error when not on a video page', async () => {
      globalThis.window.location.href = 'https://www.youtube.com';
      const result = await GetVideoInfoTool.execute({});
      expect(result.content[0].text).toContain('ERROR');
      expect(result.content[0].text).toContain('Not on a YouTube video page');
    });

    it('returns error on search page', async () => {
      globalThis.window.location.href = 'https://www.youtube.com/results?search_query=test';
      const result = await GetVideoInfoTool.execute({});
      expect(result.content[0].text).toContain('ERROR');
    });
  });
});
