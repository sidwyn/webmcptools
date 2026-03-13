import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { loadTool } from '../helpers/loadSource.js';

// Mock video element
const mockVideo = {
  play: vi.fn(),
  pause: vi.fn(),
  currentTime: 0,
  duration: 600,
  volume: 1,
  playbackRate: 1,
  muted: false,
  readyState: 4
};

// Mock browser globals
globalThis.window = { location: { href: 'https://www.youtube.com/watch?v=test' } };
globalThis.document = {
  querySelector: (sel) => {
    if (sel === '#movie_player video') return mockVideo;
    if (sel === '#movie_player') return { querySelector: () => null };
    return null;
  },
  querySelectorAll: () => []
};
globalThis.WebMCPHelpers = {
  sleep: () => Promise.resolve(),
  getVideoElement: () => mockVideo,
  getYouTubePlayer: () => ({ querySelector: () => null }),
  formatDuration: (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
};

const ControlPlaybackTool = loadTool(
  join(__dirname, '../../content/sites/youtube/tools/controlPlayback.js'),
  'ControlPlaybackTool'
);

describe('ControlPlaybackTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVideo.currentTime = 0;
    mockVideo.volume = 1;
    mockVideo.playbackRate = 1;
    mockVideo.muted = false;
  });

  describe('schema', () => {
    it('has correct name', () => {
      expect(ControlPlaybackTool.name).toBe('control_playback');
    });

    it('requires action', () => {
      expect(ControlPlaybackTool.inputSchema.required).toEqual(['action']);
    });

    it('defines action enum', () => {
      expect(ControlPlaybackTool.inputSchema.properties.action.enum).toEqual([
        'play', 'pause', 'seek', 'volume', 'speed', 'fullscreen', 'mute', 'unmute'
      ]);
    });
  });

  describe('play/pause', () => {
    it('plays video', async () => {
      const result = await ControlPlaybackTool.execute({ action: 'play' });
      expect(mockVideo.play).toHaveBeenCalled();
      expect(result.content[0].text).toContain('playing');
    });

    it('pauses video', async () => {
      const result = await ControlPlaybackTool.execute({ action: 'pause' });
      expect(mockVideo.pause).toHaveBeenCalled();
      expect(result.content[0].text).toContain('paused');
    });
  });

  describe('seek', () => {
    it('seeks to seconds', async () => {
      const result = await ControlPlaybackTool.execute({ action: 'seek', value: '90' });
      expect(mockVideo.currentTime).toBe(90);
      expect(result.content[0].text).toContain('Seeked');
    });

    it('seeks to MM:SS format', async () => {
      await ControlPlaybackTool.execute({ action: 'seek', value: '2:30' });
      expect(mockVideo.currentTime).toBe(150);
    });

    it('seeks to HH:MM:SS format', async () => {
      await ControlPlaybackTool.execute({ action: 'seek', value: '1:05:30' });
      expect(mockVideo.currentTime).toBe(3930);
    });

    it('requires value for seek', async () => {
      const result = await ControlPlaybackTool.execute({ action: 'seek' });
      expect(result.content[0].text).toContain('ERROR');
    });
  });

  describe('volume', () => {
    it('sets volume', async () => {
      await ControlPlaybackTool.execute({ action: 'volume', value: '50' });
      expect(mockVideo.volume).toBe(0.5);
    });

    it('rejects invalid volume', async () => {
      const result = await ControlPlaybackTool.execute({ action: 'volume', value: '150' });
      expect(result.content[0].text).toContain('ERROR');
    });

    it('requires value for volume', async () => {
      const result = await ControlPlaybackTool.execute({ action: 'volume' });
      expect(result.content[0].text).toContain('ERROR');
    });
  });

  describe('speed', () => {
    it('sets playback speed', async () => {
      await ControlPlaybackTool.execute({ action: 'speed', value: '1.5' });
      expect(mockVideo.playbackRate).toBe(1.5);
    });

    it('requires value for speed', async () => {
      const result = await ControlPlaybackTool.execute({ action: 'speed' });
      expect(result.content[0].text).toContain('ERROR');
    });
  });

  describe('mute/unmute', () => {
    it('mutes video', async () => {
      await ControlPlaybackTool.execute({ action: 'mute' });
      expect(mockVideo.muted).toBe(true);
    });

    it('unmutes video', async () => {
      mockVideo.muted = true;
      await ControlPlaybackTool.execute({ action: 'unmute' });
      expect(mockVideo.muted).toBe(false);
    });
  });
});
