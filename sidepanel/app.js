// sidepanel/app.js — Chat UI and conversation loop

const App = (() => {
  // State
  let conversationHistory = [];
  let registeredTools = [];
  let disabledTools = new Set();
  let isStreaming = false;
  let pageContext = {};
  let sitePrompt = '';
  let registeredSitePatterns = [];
  let sessionTokens = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  let userPreferences = {};

  // Fun flight-themed status messages mapped to tool names
  const STATUS_VERBS = {
    search_flights: ['Scanning runways', 'Checking departure boards', 'Browsing the skies'],
    get_results: ['Reading the arrivals board', 'Collecting boarding passes', 'Reviewing flight manifests'],
    set_filters: ['Adjusting the radar', 'Fine-tuning your search', 'Dialing in preferences'],
    sort_results: ['Reshuffling the deck', 'Reranking itineraries', 'Sorting by wing span'],
    get_price_insights: ['Consulting the fare oracle', 'Crunching ticket prices', 'Scanning the date grid'],
    get_flight_details: ['Peeking inside the cabin', 'Checking legroom specs', 'Inspecting the aircraft'],
    track_price: ['Setting up fare alerts', 'Watching for price drops', 'Deploying price radar'],
    get_tracked_flights: ['Checking your watchlist', 'Reviewing saved alerts', 'Opening the logbook'],
    get_booking_link: ['Preparing your boarding pass', 'Opening the booking gate', 'Connecting to the airline'],
    select_return_flight: ['Browsing return options', 'Planning the trip home', 'Picking a comeback flight'],
    explore_destinations: ['Spinning the globe', 'Scouting destinations', 'Mapping cheap getaways'],
    search_multi_city: ['Plotting the world tour', 'Charting multiple legs', 'Planning your adventure'],
    set_connecting_airports: ['Rerouting the layovers', 'Adjusting connections', 'Filtering transit hubs'],
    set_search_options: ['Tweaking trip settings', 'Updating passenger count', 'Adjusting cabin class'],
    _default: ['Working on it', 'Crunching the numbers', 'Fetching data', 'Processing', 'Almost there']
  };

  function getStatusVerb(toolName) {
    const verbs = STATUS_VERBS[toolName] || STATUS_VERBS._default;
    return verbs[Math.floor(Math.random() * verbs.length)];
  }

  function setFunStatus(toolName) {
    const verb = getStatusVerb(toolName);
    const icons = ['✈️', '🌍', '🗺️', '🧳', '🛫', '🎫', '🏝️', '⛅'];
    const icon = icons[Math.floor(Math.random() * icons.length)];
    showInlineStatus(`<span class="status-icon">${icon}</span> ${verb}...`);
  }

  // Inline status shown inside the messages area (visible to user while scrolling)
  let inlineStatusEl = null;

  function showInlineStatus(html) {
    if (!inlineStatusEl) {
      inlineStatusEl = document.createElement('div');
      inlineStatusEl.className = 'inline-status';
    }
    inlineStatusEl.innerHTML = html;
    // Always append at the end of messages so it appears below the last tool card
    if (!inlineStatusEl.parentElement || inlineStatusEl.parentElement !== messagesEl) {
      messagesEl.appendChild(inlineStatusEl);
    }
    // Also keep footer status in sync for accessibility
    statusText.innerHTML = html;
    scrollToBottom();
  }

  function clearInlineStatus() {
    if (inlineStatusEl && inlineStatusEl.parentElement) {
      inlineStatusEl.remove();
    }
    clearInlineStatus();
  }

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
  const tokenDisplay = document.getElementById('token-display');

  // ── Tool Name Formatting ──────────────────────────────────────────────────

  function toolDisplayName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

    // Horizontal rules
    processed = processed.replace(/^---+$/gm, '<hr>');

    // Headings (### before ## before #)
    processed = processed
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

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

  function updateTokenDisplay() {
    const total = sessionTokens.input + sessionTokens.output + sessionTokens.cacheRead + sessionTokens.cacheCreate;
    if (total === 0) {
      tokenDisplay.textContent = '';
      return;
    }
    const cached = sessionTokens.cacheRead;
    const parts = [`${formatTokenCount(total)} tokens`];
    if (cached > 0) {
      const pct = Math.round(cached / (sessionTokens.input + sessionTokens.cacheRead + sessionTokens.cacheCreate) * 100);
      parts.push(`${pct}% cached`);
    }
    tokenDisplay.textContent = parts.join(' · ');
  }

  function formatTokenCount(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
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
    sessionTokens = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
    updateTokenDisplay();
    saveConversation();

    // Clear all messages from DOM
    const children = Array.from(messagesEl.children);
    for (const child of children) {
      if (child !== welcomeState) child.remove();
    }
    welcomeState.style.display = '';

    messageInput.value = '';
    messageInput.style.height = 'auto';
    clearInlineStatus();
    messageInput.focus();
  }

  // ── Provider Management ──────────────────────────────────────────────────

  async function getProvider() {
    const saved = await Settings.load();
    const selectedOption = modelSelector.selectedOptions[0];
    const providerName = selectedOption?.dataset.provider;
    const modelId = selectedOption?.value;

    if (providerName === 'anthropic') {
      if (!saved.anthropicKey) throw new Error('Anthropic API key not set. Open Settings to add it.');
      return new AnthropicProvider(saved.anthropicKey, modelId);
    } else if (providerName === 'openai') {
      if (!saved.openaiKey) throw new Error('OpenAI API key not set. Open Settings to add it.');
      return new OpenAIProvider(saved.openaiKey, modelId);
    }
    throw new Error('Unknown provider selected.');
  }

  // ── Token Management ─────────────────────────────────────────────────────

  // Cap a tool result before it enters conversation history
  function capToolResult(result, maxLen) {
    if (typeof result === 'string') {
      return result.length > maxLen ? result.slice(0, maxLen) + '…' : result;
    }
    if (result?.content && Array.isArray(result.content)) {
      return {
        ...result,
        content: result.content.map(c => {
          if (c.type === 'text' && c.text && c.text.length > maxLen) {
            return { ...c, text: c.text.slice(0, maxLen) + '…' };
          }
          return c;
        })
      };
    }
    return result;
  }

  // Truncate old messages to stay under API rate limits.
  // Keep the last KEEP_RECENT messages intact; older tool results get summarized.
  function trimmedHistory() {
    const KEEP_RECENT = 6;           // Keep last N messages with full content
    const MAX_TOOL_RESULT_LEN = 150; // Truncate older tool results to this many chars
    const DROP_BEYOND = 20;          // Drop tool results entirely beyond this many messages back

    if (conversationHistory.length <= KEEP_RECENT) return conversationHistory;

    return conversationHistory.reduce((acc, msg, idx) => {
      const age = conversationHistory.length - idx;
      const isRecent = age <= KEEP_RECENT;

      if (isRecent) { acc.push(msg); return acc; }

      // Very old tool results: drop entirely (keep the message shell for API validity)
      const isVeryOld = age > DROP_BEYOND;

      // Anthropic format: role=user with tool_result blocks
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const trimmed = msg.content.map(block => {
          if (block.type === 'tool_result' && Array.isArray(block.content)) {
            if (isVeryOld) return { ...block, content: [{ type: 'text', text: '[old result removed]' }] };
            const fullText = block.content.map(c => c.text || '').join(' ');
            if (fullText.length > MAX_TOOL_RESULT_LEN) {
              return { ...block, content: [{ type: 'text', text: fullText.slice(0, MAX_TOOL_RESULT_LEN) + '…' }] };
            }
          }
          return block;
        });
        acc.push({ ...msg, content: trimmed });
        return acc;
      }

      // OpenAI format: role=tool
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        if (isVeryOld) { acc.push({ ...msg, content: '[old result removed]' }); return acc; }
        if (msg.content.length > MAX_TOOL_RESULT_LEN) {
          acc.push({ ...msg, content: msg.content.slice(0, MAX_TOOL_RESULT_LEN) + '…' });
          return acc;
        }
      }

      // Truncate old assistant text too (e.g. long flight summaries)
      if (msg.role === 'assistant' && !isRecent) {
        if (typeof msg.content === 'string' && msg.content.length > 300) {
          acc.push({ ...msg, content: msg.content.slice(0, 300) + '…' });
          return acc;
        }
        // Anthropic assistant format: array of content blocks
        if (Array.isArray(msg.content)) {
          const trimmedContent = msg.content.map(block => {
            if (block.type === 'text' && block.text && block.text.length > 300) {
              return { ...block, text: block.text.slice(0, 300) + '…' };
            }
            return block;
          });
          acc.push({ ...msg, content: trimmedContent });
          return acc;
        }
      }

      acc.push(msg);
      return acc;
    }, []);
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

    // If no tools connected, try to navigate to a supported site and wait
    if (getActiveTools().length === 0) {
      showInlineStatus('<span class="status-icon">🛫</span> Navigating to supported site...');
      const navigated = await navigateToDefaultSite();
      if (navigated) {
        const toolsReady = await waitForTools(10000);
        if (!toolsReady) {
          addErrorMessage('Could not connect to site tools. Please navigate to a supported site and try again.');
          isStreaming = false;
          sendBtn.disabled = false;
          messageInput.disabled = false;
          clearInlineStatus();
          return;
        }
      }
    }

    // Pin the target tab so switching tabs mid-stream doesn't break tool calls
    const targetTabId = await getActiveTabId();
    pageContext = await fetchPageContext(targetTabId);

    // Pass site-specific prompt + user preferences to the provider
    const saved = await Settings.load();
    userPreferences = saved.preferences || {};
    provider.sitePrompt = sitePrompt;
    provider.userPreferences = userPreferences;

    await runAgentLoop(provider, targetTabId);

    saveConversation();

    isStreaming = false;
    sendBtn.disabled = false;
    messageInput.disabled = false;
    clearInlineStatus();
    // Delay focus slightly to ensure the browser processes the disabled=false change
    setTimeout(() => messageInput.focus(), 50);
  }

  function getActiveTabId() {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id || null);
      });
    });
  }

  function fetchPageContext(tabId) {
    return new Promise(resolve => {
      if (!tabId) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0]) { resolve({}); return; }
          chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_CONTEXT' }, (response) => {
            if (chrome.runtime.lastError) { resolve({}); return; }
            resolve(response?.pageContext || {});
          });
        });
      } else {
        chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }, (response) => {
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve(response?.pageContext || {});
        });
      }
    });
  }

  function navigateToDefaultSite() {
    // Navigate to the first registered site module's URL
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SITE_MODULES' }, (response) => {
        if (chrome.runtime.lastError || !response?.siteModules?.length) { resolve(false); return; }
        // Use the first match pattern, stripped of wildcard
        const firstUrl = response.siteModules[0].matches[0].replace(/\*$/, '');
        registeredSitePatterns = response.siteModules.flatMap(m => m.matches);
        chrome.runtime.sendMessage({ type: 'NAVIGATE_TAB', url: firstUrl }, (navResponse) => {
          if (chrome.runtime.lastError) { resolve(false); return; }
          resolve(navResponse?.ok || false);
        });
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

  // ── Rate Limit Retry ──────────────────────────────────────────────────────

  let retryCancelled = false;
  const retryContainer = document.getElementById('retry-container');

  function removeRunningToolCards() {
    // Clean up tool call cards still in "running" state (ghost lines)
    messagesEl.querySelectorAll('.tool-call-card').forEach(card => {
      const status = card.querySelector('.tool-call-status');
      if (status?.classList.contains('running')) {
        card.remove();
      }
    });
  }

  function showRetryCountdown(waitSeconds, retryFn) {
    retryCancelled = false;
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'retry-banner';
      el.innerHTML = `
        <span class="retry-text">Rate limited. Retrying in <strong class="retry-countdown">${waitSeconds}</strong>s...<span class="retry-status"></span></span>
        <button class="retry-btn">Retry Now</button>
        <button class="retry-cancel-btn">Cancel</button>
      `;

      const countdownEl = el.querySelector('.retry-countdown');
      const statusEl = el.querySelector('.retry-status');
      const retryBtn = el.querySelector('.retry-btn');
      const cancelBtn = el.querySelector('.retry-cancel-btn');

      let remaining = waitSeconds;
      let timer;

      function cleanup() {
        clearInterval(timer);
        el.remove();
      }

      async function attemptRetry() {
        retryBtn.disabled = true;
        statusEl.textContent = '';
        if (retryFn) {
          const ok = await retryFn();
          if (ok) {
            cleanup();
            resolve(true);
            return;
          }
          // Retry failed — reset countdown and show status
          statusEl.textContent = 'Retry failed';
          setTimeout(() => { statusEl.textContent = ''; }, 3000);
          remaining = waitSeconds;
          countdownEl.textContent = remaining;
          retryBtn.disabled = false;
        } else {
          cleanup();
          resolve(true);
        }
      }

      cancelBtn.addEventListener('click', () => {
        retryCancelled = true;
        cleanup();
        resolve(false);
      });

      retryBtn.addEventListener('click', attemptRetry);

      retryContainer.appendChild(el);
      scrollToBottom();

      timer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          cleanup();
          resolve(true);
        } else {
          countdownEl.textContent = remaining;
        }
      }, 1000);
    });
  }

  async function runAgentLoop(provider, targetTabId) {
    let iteration = 0;
    const maxIterations = 10;
    let retryCount = 0;
    const MAX_RETRIES = 4;

    while (iteration < maxIterations) {
      iteration++;
      const thinkingVerbs = ['Plotting the route', 'Charting a course', 'Checking the itinerary', 'Consulting the co-pilot'];
      const thinkVerb = thinkingVerbs[Math.floor(Math.random() * thinkingVerbs.length)];
      const thinkIcons = ['✈️', '🌍', '🗺️', '🧳'];
      const thinkIcon = thinkIcons[Math.floor(Math.random() * thinkIcons.length)];
      showInlineStatus(`<span class="status-icon">${thinkIcon}</span> ${thinkVerb}...`);

      const bubble = createAssistantMessage();
      let accumulatedText = '';
      let pendingToolCalls = [];
      let streamError = null;
      let stopReason = null;

      await new Promise(resolve => {
        provider.streamMessage(
          trimmedHistory(),
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
            onDone: (reason, usage) => {
              stopReason = reason;
              if (usage) {
                sessionTokens.input += (usage.input_tokens || 0);
                sessionTokens.output += (usage.output_tokens || 0);
                sessionTokens.cacheRead += (usage.cache_read_input_tokens || 0);
                sessionTokens.cacheCreate += (usage.cache_creation_input_tokens || 0);
                updateTokenDisplay();
              }
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
        // Clean up empty bubble
        if (!accumulatedText || !accumulatedText.trim()) {
          bubble.closest('.message')?.remove();
        } else {
          finalizeMessage(bubble);
          pushAssistantText(accumulatedText);
        }

        // Clean up tool call cards stuck in "running" state (ghost lines)
        removeRunningToolCards();

        // Rate limit: retry with exponential backoff
        if (streamError.isRateLimit && retryCount < MAX_RETRIES) {
          retryCount++;
          const baseWait = streamError.retryAfter || 30;
          const waitSeconds = Math.min(baseWait * Math.pow(2, retryCount - 1), 300);

          // "Retry Now" tests the API with a lightweight probe
          const retryFn = async () => {
            try {
              const testProvider = await getProvider();
              testProvider.sitePrompt = sitePrompt;
              // Quick probe: send a minimal request to check if rate limit is lifted
              return await new Promise((resolve) => {
                testProvider.streamMessage(
                  [{ role: 'user', content: 'hi' }],
                  [],
                  {},
                  {
                    onToken: () => {},
                    onToolCall: () => {},
                    onDone: () => resolve(true),
                    onError: (err) => resolve(!err.isRateLimit)
                  }
                );
              });
            } catch {
              return false;
            }
          };

          const shouldRetry = await showRetryCountdown(waitSeconds, retryFn);
          if (shouldRetry && !retryCancelled) {
            iteration--; // Retry the same iteration
            continue;
          }
          // Cancelled — fall through to show a friendly message
          addErrorMessage('Request cancelled. Try again when ready.');
          return;
        }

        addErrorMessage(`Error: ${streamError.message}`);
        return;
      }

      // Reset retry count on success
      retryCount = 0;

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
        setFunStatus(toolName);

        let result;
        try {
          result = await executeToolViaContentScript(toolName, args, targetTabId);
          updateToolCallCard(card, { args, result });
        } catch (e) {
          updateToolCallCard(card, { args, result: null, error: e.message });
          result = { content: [{ type: 'text', text: `ERROR: ${e.message}` }] };
        }

        // Cap tool result size before adding to history to control token usage
        const cappedResult = capToolResult(result, 1500);
        conversationHistory.push(provider.formatToolResult(toolUseId, cappedResult));
      }
    }

    addErrorMessage('Max iterations reached. The agent may be stuck in a loop.');
  }

  // ── Tool Execution Bridge ─────────────────────────────────────────────────

  async function executeToolViaContentScript(toolName, args, pinnedTabId) {
    const TOTAL_TIMEOUT = 35000;
    const RETRY_INTERVAL = 800;
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Tool ${toolName} timed out`)), TOTAL_TIMEOUT);

      function sendToTab(id) {
        chrome.tabs.sendMessage(id, {
          type: 'EXECUTE_TOOL',
          toolName,
          args
        }, (response) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || '';
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
      }

      function attempt() {
        if (pinnedTabId) {
          sendToTab(pinnedTabId);
        } else {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
              clearTimeout(timeout);
              reject(new Error('No active tab'));
              return;
            }
            sendToTab(tabs[0].id);
          });
        }
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

  function urlMatchesSitePatterns(url) {
    return registeredSitePatterns.some(pattern => {
      // Convert match pattern to regex: strip trailing *, escape dots
      const regex = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'));
      return regex.test(url);
    });
  }

  function initMessageListener() {
    // Load site patterns from background
    chrome.runtime.sendMessage({ type: 'GET_SITE_MODULES' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.siteModules) {
        registeredSitePatterns = response.siteModules.flatMap(m => m.matches);
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TOOLS_UPDATED') {
        registeredTools = message.tools || [];
        if (message.sitePrompt !== undefined) {
          sitePrompt = message.sitePrompt;
        }
        updateToolUI();
      }
    });

    // Clear tools when user navigates away from a supported site
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.url === undefined) return;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || tabs[0].id !== tabId) return;
        if (!urlMatchesSitePatterns(changeInfo.url)) {
          registeredTools = [];
          pageContext = {};
          sitePrompt = '';
          updateToolUI();
        } else {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: 'GET_TOOLS' }, (response) => {
              if (chrome.runtime.lastError) return;
              if (response?.tools) {
                registeredTools = response.tools;
                updateToolUI();
              }
              if (response?.pageContext) {
                pageContext = response.pageContext;
              }
              if (response?.sitePrompt !== undefined) {
                sitePrompt = response.sitePrompt;
              }
            });
          }, 1000);
        }
      });
    });

    // Also refresh tools when user switches tabs
    chrome.tabs.onActivated.addListener(({ tabId }) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return;
        if (!tab.url || !urlMatchesSitePatterns(tab.url)) {
          registeredTools = [];
          pageContext = {};
          sitePrompt = '';
          updateToolUI();
        } else {
          chrome.tabs.sendMessage(tabId, { type: 'GET_TOOLS' }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response?.tools) {
              registeredTools = response.tools;
              updateToolUI();
            }
            if (response?.pageContext) {
              pageContext = response.pageContext;
            }
            if (response?.sitePrompt !== undefined) {
              sitePrompt = response.sitePrompt;
            }
          });
        }
      });
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

    // Autofocus the input so user can start typing immediately
    messageInput.focus();
    // Re-focus when side panel becomes visible (Chrome may not focus on initial open)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) messageInput.focus();
    });

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
          if (response?.sitePrompt !== undefined) {
            sitePrompt = response.sitePrompt;
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
