# YouTube Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add YouTube as a supported site in the WebMCP Tool Library, enabling an AI agent in the side panel to search videos, control playback, read video metadata, get transcripts, and navigate the YouTube interface using natural language.

**Architecture:** Follows the existing site module pattern — a new `content/sites/youtube/` folder with helpers, tools, prompt, and injector. Registered in `background.js` `SITE_MODULES` and granted host permissions in `manifest.json`. No changes to core infrastructure required.

**Key Challenge:** YouTube is a complex SPA built with Polymer/Web Components. DOM elements are custom elements (e.g., `ytd-video-renderer`, `ytd-watch-flexy`). The site uses the YouTube Player API (`document.querySelector('video')` and `document.querySelector('#movie_player')`) for playback control. Navigation is client-side, requiring MutationObserver-based re-registration.

---

## Phase 1: Extension Registration + Module Skeleton

### Task 1: Add YouTube to manifest.json and background.js

**Files:**
- Edit: `manifest.json`
- Edit: `background.js`

**Step 1: Add host permissions in manifest.json**

Add YouTube URL patterns to the `host_permissions` array:

```json
"host_permissions": [
  "https://www.google.com/travel/flights*",
  "https://www.google.com/travel/explore*",
  "https://www.youtube.com/*"
]
```

**Step 2: Add SITE_MODULES entry in background.js**

Add a new entry to the `SITE_MODULES` array after the `google-flights` entry:

```javascript
{
  id: 'youtube',
  defaultUrl: 'https://www.youtube.com',
  matches: [
    'https://www.youtube.com/*'
  ],
  js: [
    'content/bridge.js',
    'content/helpers.js',
    'content/sites/youtube/helpers.js',
    'content/sites/youtube/tools/searchVideos.js',
    'content/sites/youtube/tools/getVideoInfo.js',
    'content/sites/youtube/tools/getTranscript.js',
    'content/sites/youtube/tools/controlPlayback.js',
    'content/sites/youtube/tools/getSearchResults.js',
    'content/sites/youtube/tools/getComments.js',
    'content/sites/youtube/tools/getChannelInfo.js',
    'content/sites/youtube/tools/getRecommendations.js',
    'content/sites/youtube/prompt.js',
    'content/sites/youtube/injector.js'
  ]
}
```

### Task 2: Create YouTube Module Skeleton

**Files:**
- Create: `content/sites/youtube/helpers.js`
- Create: `content/sites/youtube/prompt.js`
- Create: `content/sites/youtube/injector.js`
- Create: `content/sites/youtube/tools/` (directory)

**Step 1: Create helpers.js**

Extend `WebMCPHelpers` with YouTube-specific DOM utilities:

```javascript
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
  // Parse a ytd-video-renderer or ytd-rich-item-renderer into structured data
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
```

**Step 2: Create prompt.js** (see Task 4 below for full content)

**Step 3: Create injector.js** (see Task 5 below for full content)

---

## Phase 2: Core Tools

### Task 3: Implement YouTube Tools

Each tool is one file in `content/sites/youtube/tools/`. All tools follow the standard pattern: `{ name, description, inputSchema, execute }`.

#### Tool 1: `searchVideos.js`

**Purpose:** Navigate to YouTube search results for a given query.

```javascript
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
      return { content: [{ type: 'text', text: 'ERROR: query is required.' }] };
    }
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
    // Use NAVIGATE_TAB message for cross-origin or use window.location for same-origin
    window.location.href = url;
    // Wait for results to load
    await WebMCPHelpers.sleep(2000);
    const loaded = await WebMCPHelpers.waitForYouTubeResults(10000);
    if (!loaded) {
      return { content: [{ type: 'text', text: `Navigated to search for "${query}". Results are still loading — call get_search_results to read them.` }] };
    }
    return { content: [{ type: 'text', text: `Navigated to search results for "${query}". Call get_search_results to read the results.` }] };
  }
};
```

#### Tool 2: `getSearchResults.js`

**Purpose:** Read the current search results from the page.

```javascript
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
```

#### Tool 3: `getVideoInfo.js`

**Purpose:** Get detailed info about the currently playing video (title, channel, views, likes, description, duration).

```javascript
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

    // Description
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
```

#### Tool 4: `controlPlayback.js`

**Purpose:** Control video playback — play, pause, seek, adjust volume, toggle fullscreen, change playback speed.

```javascript
const ControlPlaybackTool = {
  name: 'control_playback',
  description: 'Control YouTube video playback: play, pause, seek to a timestamp, adjust volume, change speed, or toggle fullscreen.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['play', 'pause', 'seek', 'volume', 'speed', 'fullscreen', 'mute', 'unmute'],
        description: 'The playback action to perform.'
      },
      value: {
        type: 'string',
        description: 'Value for the action. For seek: timestamp in seconds or "MM:SS" format. For volume: 0-100. For speed: playback rate like "1.5" or "2".'
      }
    },
    required: ['action']
  },
  execute: async (args) => {
    const { action, value } = args;
    const video = WebMCPHelpers.getVideoElement();
    if (!video) {
      return { content: [{ type: 'text', text: 'ERROR: No video player found on page.' }] };
    }

    switch (action) {
      case 'play':
        video.play();
        return { content: [{ type: 'text', text: 'Video playing.' }] };
      case 'pause':
        video.pause();
        return { content: [{ type: 'text', text: 'Video paused.' }] };
      case 'seek': {
        let seconds = 0;
        if (value.includes(':')) {
          const parts = value.split(':').map(Number);
          seconds = parts.length === 3 ? parts[0]*3600 + parts[1]*60 + parts[2] : parts[0]*60 + parts[1];
        } else {
          seconds = parseFloat(value);
        }
        video.currentTime = seconds;
        return { content: [{ type: 'text', text: `Seeked to ${WebMCPHelpers.formatDuration(seconds)}.` }] };
      }
      case 'volume':
        video.volume = Math.max(0, Math.min(1, parseInt(value) / 100));
        return { content: [{ type: 'text', text: `Volume set to ${value}%.` }] };
      case 'speed':
        video.playbackRate = parseFloat(value);
        return { content: [{ type: 'text', text: `Playback speed set to ${value}x.` }] };
      case 'mute':
        video.muted = true;
        return { content: [{ type: 'text', text: 'Video muted.' }] };
      case 'unmute':
        video.muted = false;
        return { content: [{ type: 'text', text: 'Video unmuted.' }] };
      case 'fullscreen': {
        const player = WebMCPHelpers.getYouTubePlayer();
        const fsButton = player?.querySelector('.ytp-fullscreen-button');
        if (fsButton) fsButton.click();
        return { content: [{ type: 'text', text: 'Toggled fullscreen.' }] };
      }
      default:
        return { content: [{ type: 'text', text: `ERROR: Unknown action "${action}".` }] };
    }
  }
};
```

#### Tool 5: `getTranscript.js`

**Purpose:** Get the transcript/captions for the currently playing video.

```javascript
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

    // Try to open transcript panel via the "Show transcript" button
    // Strategy 1: Click "...more" on description, then "Show transcript"
    // Strategy 2: Click the transcript button in the engagement panel
    const moreButton = document.querySelector('tp-yt-paper-button#expand');
    if (moreButton) moreButton.click();
    await WebMCPHelpers.sleep(500);

    // Look for "Show transcript" button
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
      await WebMCPHelpers.sleep(1000);
    }

    // Read transcript segments from the engagement panel
    const segments = document.querySelectorAll('ytd-transcript-segment-renderer, ytd-transcript-segment-list-renderer segments-container > div');
    if (segments.length === 0) {
      return { content: [{ type: 'text', text: 'No transcript available for this video, or the transcript panel could not be opened.' }] };
    }

    let startSeconds = 0;
    if (startTime) {
      const parts = startTime.split(':').map(Number);
      startSeconds = parts.length === 2 ? parts[0]*60 + parts[1] : parts[0];
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
        const segSeconds = timeParts.length === 2 ? timeParts[0]*60 + timeParts[1] : timeParts[0];
        if (segSeconds < startSeconds) continue;
      }

      if (text) lines.push(`[${time}] ${text}`);
      if (lines.length >= maxSegments) break;
    }

    return { content: [{ type: 'text', text: `Transcript (${lines.length} segments):\n\n${lines.join('\n')}` }] };
  }
};
```

#### Tool 6: `getComments.js`

**Purpose:** Read top comments on the current video.

```javascript
const GetCommentsTool = {
  name: 'get_comments',
  description: 'Read the top comments on the currently playing YouTube video. Scrolls down to load the comments section.',
  inputSchema: {
    type: 'object',
    properties: {
      maxComments: {
        type: 'integer',
        description: 'Maximum number of comments to return. Defaults to 10.'
      }
    }
  },
  execute: async (args) => {
    const { maxComments = 10 } = args;
    if (!window.location.href.includes('/watch')) {
      return { content: [{ type: 'text', text: 'ERROR: Not on a video page.' }] };
    }

    // Scroll down to load comments section
    const commentsSection = document.querySelector('ytd-comments#comments');
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth' });
      await WebMCPHelpers.sleep(2000);
    } else {
      window.scrollBy(0, 600);
      await WebMCPHelpers.sleep(2000);
    }

    const commentEls = document.querySelectorAll('ytd-comment-thread-renderer');
    if (commentEls.length === 0) {
      return { content: [{ type: 'text', text: 'No comments found. Comments may be disabled or still loading.' }] };
    }

    const comments = Array.from(commentEls).slice(0, maxComments).map((el, i) => {
      const author = el.querySelector('#author-text')?.textContent?.trim() || 'Unknown';
      const text = el.querySelector('#content-text')?.textContent?.trim() || '';
      const likes = el.querySelector('#vote-count-middle')?.textContent?.trim() || '0';
      const time = el.querySelector('.published-time-text a, #header-author .published-time-text')?.textContent?.trim() || '';
      return `${i + 1}. ${author} (${time}, ${likes} likes):\n   "${text}"`;
    });

    return { content: [{ type: 'text', text: `Top comments (${comments.length}):\n\n${comments.join('\n\n')}` }] };
  }
};
```

#### Tool 7: `getChannelInfo.js`

**Purpose:** Get information about the channel of the currently playing video or a channel page.

```javascript
const GetChannelInfoTool = {
  name: 'get_channel_info',
  description: 'Get information about a YouTube channel. Works on channel pages or extracts channel info from the current video page.',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async (args) => {
    // On a video page: get channel info from the video
    if (window.location.href.includes('/watch')) {
      const channelName = document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || '';
      const subscribers = document.querySelector('#owner-sub-count, yt-formatted-string#owner-sub-count')?.textContent?.trim() || '';
      const channelUrl = document.querySelector('#channel-name a, ytd-channel-name a')?.href || '';
      return { content: [{ type: 'text', text: `Channel: ${channelName}\nSubscribers: ${subscribers}\nURL: ${channelUrl}` }] };
    }
    // On a channel page: get fuller info
    if (window.location.href.includes('/@') || window.location.href.includes('/channel/')) {
      const name = document.querySelector('yt-formatted-string#text.ytd-channel-name, #channel-header-container #channel-name')?.textContent?.trim() || '';
      const subs = document.querySelector('#subscriber-count, yt-formatted-string#subscriber-count')?.textContent?.trim() || '';
      const description = document.querySelector('#description-container, .description')?.textContent?.trim()?.substring(0, 500) || '';
      const videoCount = document.querySelector('#videos-count')?.textContent?.trim() || '';
      return { content: [{ type: 'text', text: `Channel: ${name}\nSubscribers: ${subs}\nVideos: ${videoCount}\nDescription: ${description}` }] };
    }
    return { content: [{ type: 'text', text: 'ERROR: Not on a video or channel page.' }] };
  }
};
```

#### Tool 8: `getRecommendations.js`

**Purpose:** Read recommended/related videos from the sidebar or homepage.

```javascript
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
      return { content: [{ type: 'text', text: `Related videos (${results.length}):\n\n${results.join('\n\n')}` }] };
    }

    // On homepage: get recommended videos
    const items = document.querySelectorAll('ytd-rich-item-renderer');
    const results = Array.from(items).slice(0, maxResults).map((el, i) => {
      const title = el.querySelector('#video-title')?.textContent?.trim() || '';
      const channel = el.querySelector('ytd-channel-name')?.textContent?.trim() || '';
      const meta = el.querySelector('#metadata-line span')?.textContent?.trim() || '';
      const url = el.querySelector('a#thumbnail')?.href || '';
      return `${i + 1}. "${title}" by ${channel} — ${meta}\n   ${url}`;
    });
    return { content: [{ type: 'text', text: `Recommended videos (${results.length}):\n\n${results.join('\n\n')}` }] };
  }
};
```

---

## Phase 3: Prompt + Injector

### Task 4: Write the YouTube System Prompt

**File:** `content/sites/youtube/prompt.js`

```javascript
const YOUTUBE_PROMPT = `SCOPE: You help users browse, search, and watch YouTube videos. You can search for videos, read video details, control playback, read transcripts, view comments, and explore recommendations.

AVAILABLE TOOLS:
- search_videos: Search YouTube for videos by keyword
- get_search_results: Read the current search results page
- get_video_info: Get title, channel, views, likes, description, duration of the current video
- control_playback: Play, pause, seek, adjust volume, change speed, mute/unmute, toggle fullscreen
- get_transcript: Read the video transcript (closed captions) with timestamps
- get_comments: Read top comments on the current video
- get_channel_info: Get channel details (name, subscribers, description)
- get_recommendations: Get related videos (sidebar) or homepage recommendations

PAGE AWARENESS:
- If already on a video page (/watch), DO NOT search again — use get_video_info to read what's playing.
- If already on search results (/results), DO NOT re-search — use get_search_results to read them.
- If on the homepage, use get_recommendations to see what's trending.

WORKFLOW:
1. User asks to find a video → call search_videos, then get_search_results
2. User asks about current video → call get_video_info
3. User wants to control playback → call control_playback with the appropriate action
4. User wants to read the transcript → call get_transcript
5. User asks about comments → call get_comments
6. User wants related videos → call get_recommendations

CRITICAL RULES:
- When reporting video search results, always include the video title, channel name, and view count.
- When the user asks "what's playing" or "what video is this", use get_video_info, NOT search_videos.
- For seek, accept natural language times like "skip to 5 minutes" → seek to 300 seconds.
- If the transcript is unavailable, let the user know — not all videos have captions.
- Summarize video descriptions concisely rather than dumping raw text.
- When the user asks to "summarize this video", get the transcript first, then provide a summary.`;
```

### Task 5: Write the YouTube Injector

**File:** `content/sites/youtube/injector.js`

```javascript
// content/sites/youtube/injector.js — Registers tools based on the current YouTube page

(function() {
  const registry = window.__webmcpRegistry;
  if (!registry) return;

  // Page context provider — extracts current video info
  registry.pageContextProvider = () => {
    const context = {};
    if (window.location.href.includes('/watch')) {
      const title = document.querySelector('yt-formatted-string.ytd-watch-metadata, h1.ytd-watch-metadata')?.textContent?.trim();
      if (title) context.currentVideo = title;
      const channel = document.querySelector('#channel-name a')?.textContent?.trim();
      if (channel) context.currentChannel = channel;
      const urlParams = new URLSearchParams(window.location.search);
      context.videoId = urlParams.get('v') || '';
    }
    if (window.location.href.includes('/results')) {
      const searchParams = new URLSearchParams(window.location.search);
      context.searchQuery = searchParams.get('search_query') || '';
    }
    context.page = window.location.href.includes('/watch') ? 'video'
      : window.location.href.includes('/results') ? 'search'
      : window.location.href.includes('/@') || window.location.href.includes('/channel/') ? 'channel'
      : 'home';
    return context;
  };

  // Set the site prompt
  registry.sitePrompt = typeof YOUTUBE_PROMPT !== 'undefined' ? YOUTUBE_PROMPT : '';

  const ALL_TOOLS = [
    typeof SearchVideosTool !== 'undefined' ? SearchVideosTool : null,
    typeof GetSearchResultsTool !== 'undefined' ? GetSearchResultsTool : null,
    typeof GetVideoInfoTool !== 'undefined' ? GetVideoInfoTool : null,
    typeof ControlPlaybackTool !== 'undefined' ? ControlPlaybackTool : null,
    typeof GetTranscriptTool !== 'undefined' ? GetTranscriptTool : null,
    typeof GetCommentsTool !== 'undefined' ? GetCommentsTool : null,
    typeof GetChannelInfoTool !== 'undefined' ? GetChannelInfoTool : null,
    typeof GetRecommendationsTool !== 'undefined' ? GetRecommendationsTool : null
  ].filter(Boolean);

  function registerTools() {
    const url = window.location.href;

    // Unregister all first
    ALL_TOOLS.forEach(tool => registry.unregister(tool.name));

    // Always available
    registry.register(SearchVideosTool);
    registry.register(GetRecommendationsTool);

    // Search results page
    if (url.includes('/results')) {
      registry.register(GetSearchResultsTool);
    }

    // Video watch page
    if (url.includes('/watch')) {
      registry.register(GetVideoInfoTool);
      registry.register(ControlPlaybackTool);
      registry.register(GetTranscriptTool);
      registry.register(GetCommentsTool);
      registry.register(GetChannelInfoTool);
    }

    // Channel page
    if (url.includes('/@') || url.includes('/channel/')) {
      registry.register(GetChannelInfoTool);
    }
  }

  registerTools();

  // Re-register on SPA navigation (YouTube is a single-page app)
  let lastHref = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      // Small delay to let YouTube update the DOM
      setTimeout(registerTools, 1000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
```

---

## Phase 4: Tests

### Task 6: Write Unit Tests

**Files:**
- Create: `tests/youtube/searchVideos.test.js`
- Create: `tests/youtube/controlPlayback.test.js`
- Create: `tests/youtube/getVideoInfo.test.js`
- Create: `tests/youtube/prompt.test.js`

Tests should follow the existing pattern using Vitest and `tests/helpers/loadSource.js` to load vanilla JS. Tests should validate:

1. **searchVideos.test.js** — Rejects empty queries, builds correct YouTube URL
2. **controlPlayback.test.js** — Validates action enum values, requires `value` for seek/volume/speed
3. **getVideoInfo.test.js** — Returns error when not on `/watch` page
4. **prompt.test.js** — Verifies all 8 tools are listed in the YOUTUBE_PROMPT string

Also update existing structural tests:
- **Edit:** `tests/siteModules.test.js` — Verify the youtube entry exists and has required fields
- **Edit:** `tests/toolSchemas.test.js` — Include youtube tools in schema validation
- **Edit:** `tests/manifest.test.js` — Verify youtube host_permissions are present

---

## Phase 5: Documentation

### Task 7: Update README and CONTRIBUTING

**Files:**
- Edit: `README.md` — Add YouTube to the supported sites list, add YouTube tool reference section
- No new docs files needed

---

## Implementation Checklist

- [ ] Add `https://www.youtube.com/*` to `manifest.json` host_permissions
- [ ] Add youtube entry to `SITE_MODULES` in `background.js`
- [ ] Create `content/sites/youtube/helpers.js`
- [ ] Create `content/sites/youtube/tools/searchVideos.js`
- [ ] Create `content/sites/youtube/tools/getSearchResults.js`
- [ ] Create `content/sites/youtube/tools/getVideoInfo.js`
- [ ] Create `content/sites/youtube/tools/controlPlayback.js`
- [ ] Create `content/sites/youtube/tools/getTranscript.js`
- [ ] Create `content/sites/youtube/tools/getComments.js`
- [ ] Create `content/sites/youtube/tools/getChannelInfo.js`
- [ ] Create `content/sites/youtube/tools/getRecommendations.js`
- [ ] Create `content/sites/youtube/prompt.js`
- [ ] Create `content/sites/youtube/injector.js`
- [ ] Write tests for youtube tools
- [ ] Update existing structural tests
- [ ] Update README.md
- [ ] Test: reload extension, navigate to youtube.com, verify tools in settings panel

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| YouTube DOM changes frequently (class names, element structure) | Use semantic selectors (`#video-title`, `ytd-video-renderer`) and YouTube's custom element names which are more stable than CSS classes |
| Transcript panel may not be available for all videos | Tool returns a clear message; prompt instructs AI to inform user |
| YouTube Polymer/Web Component shadow DOM may hide elements | YouTube's custom elements expose most content in the light DOM; shadow DOM access can be added to helpers if needed |
| SPA navigation can cause stale tool state | MutationObserver re-registers tools on URL change with a 1s delay for DOM settling |
| Content Security Policy may block some interactions | All tools use DOM manipulation only (no API calls from content script); CSP should not be an issue |
