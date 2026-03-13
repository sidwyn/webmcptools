// content/sites/youtube/tools/getChannelInfo.js — Get channel information

const GetChannelInfoTool = {
  name: 'get_channel_info',
  description: 'Get information about a YouTube channel. Works on channel pages or extracts channel info from the current video page.',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  execute: async (args) => {
    const url = window.location.href;

    // On a video page: get channel info from the video
    if (url.includes('/watch')) {
      const channelName = document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || '';
      const subscribers = document.querySelector('#owner-sub-count, yt-formatted-string#owner-sub-count')?.textContent?.trim() || '';
      const channelUrl = document.querySelector('#channel-name a, ytd-channel-name a')?.href || '';

      return { content: [{ type: 'text', text: `Channel: ${channelName}\nSubscribers: ${subscribers}\nURL: ${channelUrl}` }] };
    }

    // On a channel page: get fuller info
    if (url.includes('/@') || url.includes('/channel/')) {
      const name = document.querySelector('yt-formatted-string#text.ytd-channel-name, #channel-header-container #channel-name')?.textContent?.trim() || '';
      const subs = document.querySelector('#subscriber-count, yt-formatted-string#subscriber-count')?.textContent?.trim() || '';
      const description = document.querySelector('#description-container, .description')?.textContent?.trim()?.substring(0, 500) || '';
      const videoCount = document.querySelector('#videos-count')?.textContent?.trim() || '';

      return { content: [{ type: 'text', text: `Channel: ${name}\nSubscribers: ${subs}\nVideos: ${videoCount}\nDescription: ${description}` }] };
    }

    return { content: [{ type: 'text', text: 'ERROR: Not on a video or channel page.' }] };
  }
};
