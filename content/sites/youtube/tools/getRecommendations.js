// content/sites/youtube/tools/getRecommendations.js — Read recommended/related videos

const GetRecommendationsTool = {
  name: 'get_recommendations',
  description: 'Get recommended or related videos. On a video page, reads the sidebar suggestions. On the homepage, reads trending/recommended videos.',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'integer',
        description: 'Maximum number of recommendations to return. Defaults to 10.'
      }
    }
  },

  execute: async (args) => {
    const { maxResults = 10 } = args;

    // On watch page: get sidebar recommendations
    if (window.location.href.includes('/watch')) {
      const items = document.querySelectorAll('ytd-compact-video-renderer');
      const results = Array.from(items).slice(0, maxResults).map((el, i) => {
        const title = el.querySelector('#video-title')?.textContent?.trim() || '';
        const channel = el.querySelector('ytd-channel-name')?.textContent?.trim() || '';
        const views = el.querySelector('#metadata-line span')?.textContent?.trim() || '';
        const url = el.querySelector('a')?.href || '';
        return `${i + 1}. "${title}" by ${channel} — ${views}\n   ${url}`;
      });

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No related videos found in sidebar.' }] };
      }
      return { content: [{ type: 'text', text: `Related videos (${results.length}):\n\n${results.join('\n\n')}` }] };
    }

    // On homepage or other pages: get recommended videos
    const items = document.querySelectorAll('ytd-rich-item-renderer');
    const results = Array.from(items).slice(0, maxResults).map((el, i) => {
      const title = el.querySelector('#video-title')?.textContent?.trim() || '';
      const channel = el.querySelector('ytd-channel-name')?.textContent?.trim() || '';
      const meta = el.querySelector('#metadata-line span')?.textContent?.trim() || '';
      const url = el.querySelector('a#thumbnail')?.href || '';
      return `${i + 1}. "${title}" by ${channel} — ${meta}\n   ${url}`;
    });

    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No recommended videos found on the page.' }] };
    }
    return { content: [{ type: 'text', text: `Recommended videos (${results.length}):\n\n${results.join('\n\n')}` }] };
  }
};
