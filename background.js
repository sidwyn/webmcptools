// background.js — Service worker, registers side panel behavior and site modules

// ── Site Module Registry ──────────────────────────────────────────────────────
// Each entry defines a supported site. Adding a new site = adding one entry here
// + a new folder under content/sites/.

const SITE_MODULES = [
  {
    id: 'google-flights',
    defaultUrl: 'https://www.google.com/travel/flights/search',
    matches: [
      'https://www.google.com/travel/flights*',
      'https://www.google.com/travel/explore*'
    ],
    js: [
      'content/bridge.js',
      'content/helpers.js',
      'content/sites/google-flights/helpers.js',
      'content/sites/google-flights/tools/searchFlights.js',
      'content/sites/google-flights/tools/getResults.js',
      'content/sites/google-flights/tools/setFilters.js',
      'content/sites/google-flights/tools/getPriceInsights.js',
      'content/sites/google-flights/tools/setSearchOptions.js',
      'content/sites/google-flights/tools/sortResults.js',
      'content/sites/google-flights/tools/getFlightDetails.js',
      'content/sites/google-flights/tools/trackPrice.js',
      'content/sites/google-flights/tools/exploreDestinations.js',
      'content/sites/google-flights/tools/searchMultiCity.js',
      'content/sites/google-flights/tools/setConnectingAirports.js',
      'content/sites/google-flights/tools/getTrackedFlights.js',
      'content/sites/google-flights/tools/getBookingLink.js',
      'content/sites/google-flights/tools/selectReturnFlight.js',
      'content/sites/google-flights/prompt.js',
      'content/sites/google-flights/injector.js'
    ]
  },
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
      'content/sites/youtube/tools/getSearchResults.js',
      'content/sites/youtube/tools/getVideoInfo.js',
      'content/sites/youtube/tools/controlPlayback.js',
      'content/sites/youtube/tools/getTranscript.js',
      'content/sites/youtube/tools/getComments.js',
      'content/sites/youtube/tools/getChannelInfo.js',
      'content/sites/youtube/tools/getRecommendations.js',
      'content/sites/youtube/prompt.js',
      'content/sites/youtube/injector.js'
    ]
  }
];

// ── Programmatic Content Script Registration ──────────────────────────────────

async function registerContentScripts() {
  // Unregister any existing scripts first to avoid duplicates
  try {
    await chrome.scripting.unregisterContentScripts();
  } catch {
    // May not have any registered yet
  }

  const scripts = SITE_MODULES.map(mod => ({
    id: mod.id,
    matches: mod.matches,
    js: mod.js,
    runAt: 'document_idle'
  }));

  try {
    await chrome.scripting.registerContentScripts(scripts);
  } catch (e) {
    console.error('Failed to register content scripts:', e);
  }
}

chrome.runtime.onInstalled.addListener(registerContentScripts);
chrome.runtime.onStartup.addListener(registerContentScripts);

// ── Side Panel ────────────────────────────────────────────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel/index.html',
      enabled: true
    });
  }
});

// ── Navigation Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NAVIGATE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: message.url }, () => {
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true; // async response
  }

  if (message.type === 'GET_SITE_MODULES') {
    sendResponse({ siteModules: SITE_MODULES });
    return false;
  }
});
