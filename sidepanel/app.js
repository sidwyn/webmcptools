// sidepanel/app.js — Chat UI and conversation loop

const App = (() => {
  // State
  let conversationHistory = [];
  let registeredTools = [];
  let disabledTools = new Set();
  let isStreaming = false;
  let pageContext = {};

  // DOM refs
  const messagesEl = document.getElementById('messages');
  const welcomeState = document.getElementById('welcome-state');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const statusText = document.getElementById('status-text');
  const toolCount = document.getElementById('tool-count');
  const toolBadge = document.getElementById('tool-badge');
  const modelSelector = document.getElementById('model-selector');
  const newChatBtn = document.getElementById('new-chat-btn');
  const toolsList = document.getElementById('tools-list');

  // ── Tool Name Formatting ──────────────────────────────────────────────────

  const TOOL_DISPLAY_NAMES = {
    search_flights:           'Search Flights',
    get_results:              'Get Results',
    set_filters:              'Set Filters',
    set_search_options:       'Search Options',
    sort_results:             'Sort Results',
    get_price_insights:       'Price Insights',
    get_flight_details:       'Flight Details',
    track_price:              'Track Price',
    explore_destinations:     'Explore Destinations',
    search_multi_city:        'Multi-City Search',
    set_connecting_airports:  'Connecting Airports',
    get_tracked_flights:      'Tracked Flights',
    get_booking_link:         'Booking Link',
    select_return_flight:     'Return Flight'
  };

  function toolDisplayName(name) {
    return TOOL_DISPLAY_NAMES[name] ||
      name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Tool Management ──────────────────────────────────────────────────────

  function getActiveTools() {
    return registeredTools.filter(t => !disabledTools.has(t.name));
  }

  function updateToolUI() {
    const count = getActiveTools().length;
    toolCount.textContent = count > 0 ? `${count} WebMCP Tools Connected` : '0 Tools';
    toolBadge.classList.toggle('has-tools', count > 0);

    // Settings tools list
    if (!toolsList) return;
    toolsList.innerHTML = '';
    if (registeredTools.length === 0) {
      toolsList.innerHTML = '<p class="empty-tools">No tools registered on this page.</p>';
      return;
    }
    for (const tool of registeredTools) {
      const item = document.createElement('div');
      item.className = 'tool-item';
      item.innerHTML = `
        <span class="tool-item-name">${toolDisplayName(tool.name)}</span>
        <span class="tool-item-desc">${tool.description}</span>
        <label class="tool-toggle" title="${disabledTools.has(tool.name) ? 'Disabled' : 'Enabled'}">
          <input type="checkbox" ${disabledTools.has(tool.name) ? '' : 'checked'} data-tool="${tool.name}">
          <span class="toggle-track"></span>
        </label>
      `;
      item.querySelector('input').addEventListener('change', async (e) => {
        if (e.target.checked) {
          disabledTools.delete(tool.name);
        } else {
          disabledTools.add(tool.name);
        }
        await Settings.save({ disabledTools: [...disabledTools] });
        updateToolUI();
      });
      toolsList.appendChild(item);
    }
  }

  // ── Message Rendering ────────────────────────────────────────────────────

  function renderMarkdown(text) {
    // Strip any raw JSON objects/arrays that the model may echo as text
    // (tool call inputs/outputs that shouldn't be shown to users)
    let processed = text.replace(/^\s*\{[\s\S]*?\}\s*$/gm, '').replace(/\n{2,}/g, '\n\n').replace(/^\s*\n/gm, '').trim();
    if (!processed) return '';

    // First extract code blocks to protect them
    const codeBlocks = [];
    processed = processed.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`);
      return `\x00CB${idx}\x00`;
    });

    // Extract and render markdown tables
    const tableBlocks = [];
    processed = processed.replace(/((?:^\|.+\|[ \t]*$\n?){2,})/gm, (tableStr) => {
      const rows = tableStr.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return tableStr;

      // Check if second row is a separator row
      const sepRow = rows[1];
      if (!/^\|[\s:|-]+\|$/.test(sepRow.trim())) return tableStr;

      const parseRow = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

      const headers = parseRow(rows[0]);
      const dataRows = rows.slice(2);

      const inlineFormat = (s) => s
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

      let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      for (const h of headers) html += `<th>${inlineFormat(h)}</th>`;
      html += '</tr></thead><tbody>';
      for (const row of dataRows) {
        const cells = parseRow(row);
        html += '<tr>';
        for (const c of cells) html += `<td>${inlineFormat(c)}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table></div>';

      const idx = tableBlocks.length;
      tableBlocks.push(html);
      return `\x00TB${idx}\x00`;
    });

    // Inline formatting
    processed = processed
      .replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');

    // Restore code blocks and tables
    for (let i = 0; i < codeBlocks.length; i++) {
      processed = processed.replace(`\x00CB${i}\x00`, codeBlocks[i]);
    }
    for (let i = 0; i < tableBlocks.length; i++) {
      processed = processed.replace(`\x00TB${i}\x00`, tableBlocks[i]);
    }

    // Remove empty paragraphs and excess line breaks
    processed = processed
      .replace(/<p>\s*<\/p>/g, '')
      .replace(/(<br\s*\/?>){2,}/g, '<br>')
      .replace(/<p>\s*<br\s*\/?>\s*<\/p>/g, '');

    return processed;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function addUserMessage(text) {
    welcomeState.style.display = 'none';
    const el = document.createElement('div');
    el.className = 'message user';
    el.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function createAssistantMessage() {
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.innerHTML = `<div class="message-bubble"></div>`;
    messagesEl.appendChild(el);
    scrollToBottom();
    return el.querySelector('.message-bubble');
  }

  function appendToken(bubble, token) {
    const cursor = bubble.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    bubble.dataset.raw = (bubble.dataset.raw || '') + token;
    bubble.innerHTML = renderMarkdown(bubble.dataset.raw);

    const cursorEl = document.createElement('span');
    cursorEl.className = 'streaming-cursor';
    bubble.appendChild(cursorEl);

    scrollToBottom();
  }

  function finalizeMessage(bubble) {
    const cursor = bubble.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();
    if (bubble.dataset.raw) {
      // Extract suggestion buttons: <<suggestion text>>
      const raw = bubble.dataset.raw;
      const suggestions = [];
      const cleaned = raw.replace(/<<([^>]+)>>/g, (_, s) => {
        suggestions.push(s.trim());
        return '';
      }).trimEnd();

      bubble.innerHTML = renderMarkdown(cleaned);

      // Render suggestion buttons after the bubble
      if (suggestions.length > 0) {
        const container = document.createElement('div');
        container.className = 'suggestion-buttons';
        for (const text of suggestions) {
          const btn = document.createElement('button');
          btn.className = 'suggestion-btn';
          btn.textContent = text;
          btn.addEventListener('click', () => {
            // Remove all suggestion button groups when one is clicked
            document.querySelectorAll('.suggestion-buttons').forEach(el => el.remove());
            messageInput.value = '';
            messageInput.style.height = 'auto';
            sendMessage(text);
          });
          container.appendChild(btn);
        }
        // Insert after the bubble's parent message div
        bubble.closest('.message').appendChild(container);
        scrollToBottom();
      }
    }
  }

  function createToolCallCard(toolName) {
    const card = document.createElement('div');
    card.className = 'tool-call-card';
    card.innerHTML = `
      <div class="tool-call-header">
        <div class="tool-call-status running"></div>
        <span class="tool-call-name">${escapeHtml(toolDisplayName(toolName))}</span>
        <span class="tool-call-toggle">▼</span>
      </div>
      <div class="tool-call-body">
        <div class="tool-call-section-label">Input</div>
        <div class="tool-call-json input-json">...</div>
      </div>
    `;
    card.querySelector('.tool-call-header').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
    messagesEl.appendChild(card);
    scrollToBottom();
    return card;
  }

  function updateToolCallCard(card, { args, result, error }) {
    const status = card.querySelector('.tool-call-status');
    const inputJson = card.querySelector('.input-json');

    inputJson.textContent = JSON.stringify(args, null, 2);

    let resultEl = card.querySelector('.result-json');
    if (!resultEl) {
      const label = document.createElement('div');
      label.className = 'tool-call-section-label';
      label.textContent = error ? 'Error' : 'Result';
      resultEl = document.createElement('div');
      resultEl.className = 'tool-call-json result-json';
      card.querySelector('.tool-call-body').append(label, resultEl);
    }

    if (error) {
      status.className = 'tool-call-status error';
      resultEl.textContent = error;
    } else {
      status.className = 'tool-call-status done';
      const resultText = typeof result === 'string'
        ? result
        : result?.content?.map(c => c.text || JSON.stringify(c)).join('\n') || JSON.stringify(result, null, 2);
      resultEl.textContent = resultText;
    }
    scrollToBottom();
  }

  function addErrorMessage(text) {
    const el = document.createElement('div');
    el.className = 'error-message';
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Conversation Persistence ───────────────────────────────────────────────

  function saveConversation() {
    try {
      chrome.storage.session.set({
        webmcp_conversation: conversationHistory,
        webmcp_has_messages: conversationHistory.length > 0
      });
    } catch {
      // session storage may not be available
    }
  }

  async function loadConversation() {
    return new Promise(resolve => {
      try {
        chrome.storage.session.get(['webmcp_conversation', 'webmcp_has_messages'], items => {
          if (chrome.runtime.lastError || !items.webmcp_has_messages) {
            resolve(false);
            return;
          }
          conversationHistory = items.webmcp_conversation || [];
          resolve(conversationHistory.length > 0);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function restoreConversationUI() {
    if (conversationHistory.length === 0) return;
    welcomeState.style.display = 'none';

    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text) addUserMessage(text);
      } else if (msg.role === 'assistant') {
        const text = typeof msg.content === 'string'
          ? msg.content
          : (Array.isArray(msg.content)
              ? msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
              : '');
        if (text) {
          const bubble = createAssistantMessage();
          bubble.dataset.raw = text;
          finalizeMessage(bubble);
        }
      }
      // Skip tool_result messages in UI restoration
    }
  }

  // ── New Chat ────────────────────────────────────────────────────────────────

  function startNewChat() {
    conversationHistory = [];
    saveConversation();

    // Clear all messages from DOM
    const children = Array.from(messagesEl.children);
    for (const child of children) {
      if (child !== welcomeState) child.remove();
    }
    welcomeState.style.display = '';

    messageInput.value = '';
    messageInput.style.height = 'auto';
    statusText.textContent = '';
  }

  // ── Provider Management ──────────────────────────────────────────────────

  async function getProvider() {
    const saved = await Settings.load();
    const providerName = modelSelector.selectedOptions[0]?.dataset.provider;

    if (providerName === 'anthropic') {
      if (!saved.anthropicKey) throw new Error('Anthropic API key not set. Open Settings to add it.');
      return new AnthropicProvider(saved.anthropicKey);
    } else if (providerName === 'openai') {
      if (!saved.openaiKey) throw new Error('OpenAI API key not set. Open Settings to add it.');
      return new OpenAIProvider(saved.openaiKey);
    }
    throw new Error('Unknown provider selected.');
  }

  // ── Conversation History Helpers ─────────────────────────────────────────

  function pushUserMessage(text) {
    conversationHistory.push({ role: 'user', content: text });
  }

  function pushAssistantText(text) {
    const last = conversationHistory[conversationHistory.length - 1];
    if (last?.role === 'assistant') {
      if (typeof last.content === 'string') {
        last.content += text;
      } else {
        last.content.push({ type: 'text', text });
      }
    } else {
      conversationHistory.push({ role: 'assistant', content: text });
    }
  }

  function pushAssistantToolUse(toolUseId, toolName, args) {
    const last = conversationHistory[conversationHistory.length - 1];
    const block = { type: 'tool_use', id: toolUseId, name: toolName, input: args };
    if (last?.role === 'assistant' && Array.isArray(last.content)) {
      last.content.push(block);
    } else if (last?.role === 'assistant' && typeof last.content === 'string') {
      last.content = [{ type: 'text', text: last.content }, block];
    } else {
      conversationHistory.push({ role: 'assistant', content: [block] });
    }
  }

  // ── Main Send Loop ────────────────────────────────────────────────────────

  async function sendMessage(userText) {
    if (isStreaming || !userText.trim()) return;
    isStreaming = true;
    sendBtn.disabled = true;
    messageInput.disabled = true;

    addUserMessage(userText);
    pushUserMessage(userText);

    let provider;
    try {
      provider = await getProvider();
    } catch (e) {
      addErrorMessage(e.message);
      isStreaming = false;
      sendBtn.disabled = false;
      messageInput.disabled = false;
      return;
    }

    // If no tools connected, auto-navigate to Google Flights and wait for tools
    if (getActiveTools().length === 0) {
      statusText.textContent = 'Navigating to Google Flights...';
      const navigated = await navigateToGoogleFlights();
      if (navigated) {
        // Wait for content script to load and register tools (poll up to 10s)
        const toolsReady = await waitForTools(10000);
        if (!toolsReady) {
          addErrorMessage('Could not connect to Google Flights. Please refresh the page and try again.');
          isStreaming = false;
          sendBtn.disabled = false;
          messageInput.disabled = false;
          statusText.textContent = '';
          return;
        }
      }
    }

    // Refresh page context right before the agent runs
    pageContext = await fetchPageContext();

    await runAgentLoop(provider);

    saveConversation();

    isStreaming = false;
    sendBtn.disabled = false;
    messageInput.disabled = false;
    statusText.textContent = '';
    // Delay focus slightly to ensure the browser processes the disabled=false change
    setTimeout(() => messageInput.focus(), 50);
  }

  function fetchPageContext() {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) { resolve({}); return; }
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_CONTEXT' }, (response) => {
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve(response?.pageContext || {});
        });
      });
    });
  }

  function navigateToGoogleFlights() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'NAVIGATE_TAB', url: 'https://www.google.com/travel/flights' }, (response) => {
        if (chrome.runtime.lastError) { resolve(false); return; }
        resolve(response?.ok || false);
      });
    });
  }

  function waitForTools(timeout = 10000) {
    return new Promise(resolve => {
      if (getActiveTools().length > 0) { resolve(true); return; }
      const start = Date.now();
      const check = () => {
        if (getActiveTools().length > 0) { resolve(true); return; }
        if (Date.now() - start > timeout) { resolve(false); return; }
        setTimeout(check, 500);
      };
      setTimeout(check, 1000);
    });
  }

  async function runAgentLoop(provider) {
    let iteration = 0;
    const maxIterations = 10;

    while (iteration < maxIterations) {
      iteration++;
      statusText.textContent = iteration > 1 ? `Continuing (step ${iteration})...` : 'Thinking...';

      const bubble = createAssistantMessage();
      let accumulatedText = '';
      let pendingToolCalls = [];
      let streamError = null;
      let stopReason = null;

      await new Promise(resolve => {
        provider.streamMessage(
          conversationHistory,
          getActiveTools(),
          pageContext,
          {
            onToken: (token) => {
              accumulatedText += token;
              appendToken(bubble, token);
            },
            onToolCall: (toolCall) => {
              pendingToolCalls.push(toolCall);
            },
            onDone: (reason) => {
              stopReason = reason;
              resolve();
            },
            onError: (err) => {
              streamError = err;
              resolve();
            }
          }
        );
      });

      if (streamError) {
        finalizeMessage(bubble);
        addErrorMessage(`Error: ${streamError.message}`);
        return;
      }

      if (accumulatedText && accumulatedText.trim()) {
        finalizeMessage(bubble);
        pushAssistantText(accumulatedText);
      } else {
        // Remove empty bubble
        bubble.closest('.message')?.remove();
      }

      if (pendingToolCalls.length === 0) {
        return;
      }

      for (const { toolName, toolUseId, args } of pendingToolCalls) {
        pushAssistantToolUse(toolUseId, toolName, args);

        const card = createToolCallCard(toolName);
        statusText.textContent = `Calling ${toolName}...`;

        let result;
        try {
          result = await executeToolViaContentScript(toolName, args);
          updateToolCallCard(card, { args, result });
        } catch (e) {
          updateToolCallCard(card, { args, result: null, error: e.message });
          result = { content: [{ type: 'text', text: `ERROR: ${e.message}` }] };
        }

        conversationHistory.push(provider.formatToolResult(toolUseId, result));
      }
    }

    addErrorMessage('Max iterations reached. The agent may be stuck in a loop.');
  }

  // ── Tool Execution Bridge ─────────────────────────────────────────────────

  async function executeToolViaContentScript(toolName, args) {
    const TOTAL_TIMEOUT = 35000;
    const RETRY_INTERVAL = 800;
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Tool ${toolName} timed out`)), TOTAL_TIMEOUT);

      function attempt() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0]) {
            clearTimeout(timeout);
            reject(new Error('No active tab'));
            return;
          }

          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'EXECUTE_TOOL',
            toolName,
            args
          }, (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message || '';
              // Content script not yet loaded (page still navigating) — retry
              if (msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')) {
                if (Date.now() - start < TOTAL_TIMEOUT - RETRY_INTERVAL) {
                  setTimeout(attempt, RETRY_INTERVAL);
                } else {
                  clearTimeout(timeout);
                  reject(new Error(msg));
                }
              } else {
                clearTimeout(timeout);
                reject(new Error(msg));
              }
            } else if (response?.error) {
              clearTimeout(timeout);
              reject(new Error(response.error));
            } else {
              clearTimeout(timeout);
              resolve(response?.result);
            }
          });
        });
      }

      attempt();
    });
  }

  // ── Input Handling ────────────────────────────────────────────────────────

  function initInput() {
    messageInput.addEventListener('input', () => {
      sendBtn.disabled = !messageInput.value.trim() || isStreaming;

      // Auto-resize
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
          const text = messageInput.value.trim();
          messageInput.value = '';
          messageInput.style.height = 'auto';
          sendBtn.disabled = true;
          sendMessage(text);
        }
      }
    });

    sendBtn.addEventListener('click', () => {
      const text = messageInput.value.trim();
      if (text) {
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendBtn.disabled = true;
        sendMessage(text);
      }
    });
  }

  // ── Content Script Listener ───────────────────────────────────────────────

  function initMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TOOLS_UPDATED') {
        registeredTools = message.tools || [];
        updateToolUI();
      }
    });
  }

  // ── Initialization ────────────────────────────────────────────────────────

  function initExamplePrompts() {
    document.querySelectorAll('.example-prompt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.textContent.trim();
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendMessage(text);
      });
    });
  }

  async function init() {
    const saved = await Settings.load();
    disabledTools = new Set(saved.disabledTools || []);

    initInput();
    initExamplePrompts();
    initMessageListener();
    updateToolUI();

    // New chat button
    newChatBtn.addEventListener('click', startNewChat);

    // Restore previous conversation
    const hasHistory = await loadConversation();
    if (hasHistory) {
      restoreConversationUI();
    }

    // Request current tools from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_TOOLS' }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.tools) {
            registeredTools = response.tools;
            updateToolUI();
          }
          if (response?.pageContext) {
            pageContext = response.pageContext;
          }
        });
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (chrome?.storage) App.init();
});
