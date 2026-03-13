// content/sites/youtube/helpers.js — YouTube-specific DOM utilities

WebMCPHelpers.waitForYouTubeResults = async function(timeout = 10000) {
  const start = Date.now();
  return new Promise(resolve => {
    const check = () => {
      const results = document.querySelector('ytd-section-list-renderer, ytd-item-section-renderer');
      if (results && results.querySelector('ytd-video-renderer')) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 300);
    };
    check();
  });
};

WebMCPHelpers.waitForVideoPlayer = async function(timeout = 10000) {
  const start = Date.now();
  return new Promise(resolve => {
    const check = () => {
      const player = document.querySelector('#movie_player video');
      if (player && player.readyState >= 2) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 300);
    };
    check();
  });
};

WebMCPHelpers.getYouTubePlayer = function() {
  return document.querySelector('#movie_player');
};

WebMCPHelpers.getVideoElement = function() {
  return document.querySelector('#movie_player video');
};

WebMCPHelpers.formatDuration = function(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

WebMCPHelpers.parseYouTubeVideoRenderer = function(el) {
  const titleEl = el.querySelector('#video-title');
  const channelEl = el.querySelector('ytd-channel-name a, .ytd-channel-name a');
  const metadataLine = el.querySelector('#metadata-line');
  const thumbnailEl = el.querySelector('ytd-thumbnail img');

  const spans = metadataLine ? metadataLine.querySelectorAll('span') : [];
  const views = spans[0]?.textContent?.trim() || '';
  const uploaded = spans[1]?.textContent?.trim() || '';

  return {
    title: titleEl?.textContent?.trim() || '',
    url: titleEl?.href || '',
    videoId: titleEl?.href ? new URL(titleEl.href).searchParams.get('v') : '',
    channel: channelEl?.textContent?.trim() || '',
    views,
    uploaded,
    thumbnail: thumbnailEl?.src || ''
  };
};
