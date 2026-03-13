// content/sites/youtube/tools/getSearchResults.js — Read current search results

const GetSearchResultsTool = {
  name: 'get_search_results',
  description: 'Read the current YouTube search results from the page. Must be on a search results page.',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return. Defaults to 10.'
      }
    }
  },

  execute: async (args) => {
    const { maxResults = 10 } = args;

    if (!window.location.href.includes('/results')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a YouTube search results page. Call search_videos first.' }] };
    }

    await WebMCPHelpers.waitForYouTubeResults(8000);

    const renderers = document.querySelectorAll('ytd-video-renderer');
    const results = Array.from(renderers).slice(0, maxResults).map((el, i) => {
      const parsed = WebMCPHelpers.parseYouTubeVideoRenderer(el);
      return `${i + 1}. "${parsed.title}" by ${parsed.channel} — ${parsed.views}, ${parsed.uploaded}\n   ${parsed.url}`;
    });

    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No video results found on the page.' }] };
    }
    return { content: [{ type: 'text', text: `Search results (${results.length}):\n\n${results.join('\n\n')}` }] };
  }
};
