// content/sites/youtube/tools/getVideoInfo.js — Get info about the current video

const GetVideoInfoTool = {
  name: 'get_video_info',
  description: 'Get detailed information about the currently playing YouTube video, including title, channel, views, likes, description, and duration.',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  execute: async (args) => {
    if (!window.location.href.includes('/watch')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a YouTube video page. Navigate to a video first.' }] };
    }

    await WebMCPHelpers.waitForVideoPlayer(8000);

    const title = document.querySelector('yt-formatted-string.ytd-watch-metadata, h1.ytd-watch-metadata')?.textContent?.trim() || '';
    const channel = document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || '';
    const viewCount = document.querySelector('ytd-watch-info-text span, .view-count')?.textContent?.trim() || '';

    const video = WebMCPHelpers.getVideoElement();
    const duration = video ? WebMCPHelpers.formatDuration(video.duration) : 'unknown';
    const currentTime = video ? WebMCPHelpers.formatDuration(video.currentTime) : '0:00';

    // Try to get likes
    const likeButton = document.querySelector('ytd-menu-renderer like-button-view-model button, ytd-toggle-button-renderer #text');
    const likes = likeButton?.getAttribute('aria-label') || likeButton?.textContent?.trim() || '';

    // Description (truncated)
    const descriptionEl = document.querySelector('ytd-text-inline-expander, #description-inline-expander');
    const description = descriptionEl?.textContent?.trim()?.substring(0, 500) || '';

    // Video ID
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v') || '';

    const info = [
      `Title: ${title}`,
      `Channel: ${channel}`,
      `Views: ${viewCount}`,
      `Likes: ${likes}`,
      `Duration: ${duration}`,
      `Current position: ${currentTime}`,
      `Video ID: ${videoId}`,
      `Description: ${description}${description.length >= 500 ? '...' : ''}`
    ].join('\n');

    return { content: [{ type: 'text', text: info }] };
  }
};
