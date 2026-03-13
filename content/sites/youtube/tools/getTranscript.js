// content/sites/youtube/tools/getTranscript.js — Read video transcript/captions

const GetTranscriptTool = {
  name: 'get_transcript',
  description: 'Get the transcript (closed captions) for the currently playing YouTube video. Opens the transcript panel and reads timestamped text.',
  inputSchema: {
    type: 'object',
    properties: {
      startTime: {
        type: 'string',
        description: 'Optional start timestamp to filter from (e.g., "2:30"). Returns transcript from this point onward.'
      },
      maxSegments: {
        type: 'integer',
        description: 'Maximum number of transcript segments to return. Defaults to 50.'
      }
    }
  },

  execute: async (args) => {
    const { startTime, maxSegments = 50 } = args;

    if (!window.location.href.includes('/watch')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a video page.' }] };
    }

    // Try to open the transcript panel
    // Strategy 1: Click "...more" on the description to expand it
    const moreButton = document.querySelector('tp-yt-paper-button#expand');
    if (moreButton) {
      moreButton.click();
      await WebMCPHelpers.sleep(500);
    }

    // Strategy 2: Look for "Show transcript" button
    let transcriptButton = null;
    const buttons = document.querySelectorAll('ytd-button-renderer, button');
    for (const btn of buttons) {
      if (btn.textContent?.toLowerCase().includes('show transcript')) {
        transcriptButton = btn;
        break;
      }
    }
    if (transcriptButton) {
      transcriptButton.click();
      await WebMCPHelpers.sleep(1500);
    }

    // Read transcript segments from the engagement panel
    const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (segments.length === 0) {
      return { content: [{ type: 'text', text: 'No transcript available for this video, or the transcript panel could not be opened.' }] };
    }

    let startSeconds = 0;
    if (startTime) {
      const parts = startTime.split(':').map(Number);
      startSeconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
    }

    const lines = [];
    for (const seg of segments) {
      const timeEl = seg.querySelector('.segment-timestamp, [class*="timestamp"]');
      const textEl = seg.querySelector('.segment-text, yt-formatted-string');
      const time = timeEl?.textContent?.trim() || '';
      const text = textEl?.textContent?.trim() || '';

      // Filter by start time if provided
      if (startTime && time) {
        const timeParts = time.replace(/\s/g, '').split(':').map(Number);
        const segSeconds = timeParts.length === 2 ? timeParts[0] * 60 + timeParts[1] : timeParts[0];
        if (segSeconds < startSeconds) continue;
      }

      if (text) lines.push(`[${time}] ${text}`);
      if (lines.length >= maxSegments) break;
    }

    if (lines.length === 0) {
      return { content: [{ type: 'text', text: 'No transcript segments found.' }] };
    }
    return { content: [{ type: 'text', text: `Transcript (${lines.length} segments):\n\n${lines.join('\n')}` }] };
  }
};
