// content/sites/youtube/tools/searchVideos.js — Search YouTube for videos

const SearchVideosTool = {
  name: 'search_videos',
  description: 'Search YouTube for videos matching a query. Navigates to the search results page.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g., "javascript tutorial", "cooking pasta")'
      }
    },
    required: ['query']
  },

  execute: async (args) => {
    const { query } = args;
    if (!query || query.trim().length === 0) {
      return { content: [{ type: 'text', text: 'ERROR: query is required and cannot be empty.' }] };
    }

    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
    window.location.href = url;

    await WebMCPHelpers.sleep(2000);
    const loaded = await WebMCPHelpers.waitForYouTubeResults(10000);

    if (!loaded) {
      return { content: [{ type: 'text', text: `Navigated to search for "${query}". Results are still loading — call get_search_results to read them.` }] };
    }
    return { content: [{ type: 'text', text: `Navigated to search results for "${query}". Call get_search_results to read the results.` }] };
  }
};
