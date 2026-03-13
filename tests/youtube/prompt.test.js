import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read prompt.js source and extract the prompt string content
const source = readFileSync(join(__dirname, '../../content/sites/youtube/prompt.js'), 'utf-8');
const match = source.match(/YOUTUBE_PROMPT\s*=\s*`([\s\S]*)`\s*;/);
const prompt = match ? match[1] : '';

describe('YouTube prompt', () => {
  it('defines YOUTUBE_PROMPT', () => {
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('lists all 8 tools', () => {
    const tools = [
      'search_videos',
      'get_search_results',
      'get_video_info',
      'control_playback',
      'get_transcript',
      'get_comments',
      'get_channel_info',
      'get_recommendations'
    ];
    for (const tool of tools) {
      expect(prompt, `missing tool: ${tool}`).toContain(tool);
    }
  });

  it('includes page awareness instructions', () => {
    expect(prompt).toContain('PAGE AWARENESS');
  });

  it('includes scope', () => {
    expect(prompt).toContain('SCOPE');
  });

  it('includes workflow', () => {
    expect(prompt).toContain('WORKFLOW');
  });

  it('includes critical rules', () => {
    expect(prompt).toContain('CRITICAL RULES');
  });

  it('instructs to use get_video_info for "what\'s playing"', () => {
    expect(prompt).toContain('get_video_info');
    expect(prompt).toContain("what's playing");
  });

  it('mentions transcript unavailability', () => {
    expect(prompt).toContain('transcript');
    expect(prompt).toContain('unavailable');
  });
});
