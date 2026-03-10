// background.js — Service worker, registers side panel behavior

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

// Navigate the active tab on request from the sidepanel
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
});
