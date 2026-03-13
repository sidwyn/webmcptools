// content/sites/youtube/injector.js — Registers tools based on the current YouTube page

(function() {
  const registry = window.__webmcpRegistry;
  if (!registry) return;

  // Page context provider — extracts current video/search info
  registry.pageContextProvider = () => {
    const context = {};
    const url = window.location.href;

    if (url.includes('/watch')) {
      const title = document.querySelector('yt-formatted-string.ytd-watch-metadata, h1.ytd-watch-metadata')?.textContent?.trim();
      if (title) context.currentVideo = title;
      const channel = document.querySelector('#channel-name a')?.textContent?.trim();
      if (channel) context.currentChannel = channel;
      const urlParams = new URLSearchParams(window.location.search);
      context.videoId = urlParams.get('v') || '';
    }

    if (url.includes('/results')) {
      const searchParams = new URLSearchParams(window.location.search);
      context.searchQuery = searchParams.get('search_query') || '';
    }

    context.page = url.includes('/watch') ? 'video'
      : url.includes('/results') ? 'search'
      : url.includes('/@') || url.includes('/channel/') ? 'channel'
      : 'home';

    return context;
  };

  // Set the site prompt
  registry.sitePrompt = typeof YOUTUBE_PROMPT !== 'undefined' ? YOUTUBE_PROMPT : '';

  const ALL_TOOL_NAMES = [
    'search_videos',
    'get_search_results',
    'get_video_info',
    'control_playback',
    'get_transcript',
    'get_comments',
    'get_channel_info',
    'get_recommendations'
  ];

  function registerTools() {
    const url = window.location.href;

    // Unregister all first
    ALL_TOOL_NAMES.forEach(name => registry.unregister(name));

    // Always available
    if (typeof SearchVideosTool !== 'undefined') registry.register(SearchVideosTool);
    if (typeof GetRecommendationsTool !== 'undefined') registry.register(GetRecommendationsTool);

    // Search results page
    if (url.includes('/results')) {
      if (typeof GetSearchResultsTool !== 'undefined') registry.register(GetSearchResultsTool);
    }

    // Video watch page
    if (url.includes('/watch')) {
      if (typeof GetVideoInfoTool !== 'undefined') registry.register(GetVideoInfoTool);
      if (typeof ControlPlaybackTool !== 'undefined') registry.register(ControlPlaybackTool);
      if (typeof GetTranscriptTool !== 'undefined') registry.register(GetTranscriptTool);
      if (typeof GetCommentsTool !== 'undefined') registry.register(GetCommentsTool);
      if (typeof GetChannelInfoTool !== 'undefined') registry.register(GetChannelInfoTool);
    }

    // Channel page
    if (url.includes('/@') || url.includes('/channel/')) {
      if (typeof GetChannelInfoTool !== 'undefined') registry.register(GetChannelInfoTool);
    }
  }

  registerTools();

  // Re-register on SPA navigation (YouTube uses client-side routing)
  let lastHref = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      // Delay to let YouTube update the DOM after navigation
      setTimeout(registerTools, 1000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
