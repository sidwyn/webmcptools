// background/learning.js — service worker side of the learning loop

const LEARNING = (() => {
  const MODEL = 'claude-haiku-4-5-20251001';
  const COST_PER_MTOK_IN = 1.00;
  const COST_PER_MTOK_OUT = 5.00;
  const DEFAULT_CAP_USD = 0.10;
  const MAX_TOKENS = 600;

  const ALLOWED_PARSER_IDS = new Set([
    'amazon.searchResults',
    'walmart.searchResults',
    'target.searchResults',
    'google-flights.results',
    'google-hotels.results'
  ]);

  const DENY_URL_PATTERNS = [
    /\/cart\b/i,
    /\/checkout/i,
    /\/orders?\b/i,
    /\/account/i,
    /\/payment/i,
    /\/gp\/your-account/i,
    /docs\.google\.com\/document/i
  ];

  function _todayUTC() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function _readJSON(keys) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, data => resolve(data || {}));
    });
  }

  function _writeJSON(obj) {
    return new Promise(resolve => {
      chrome.storage.local.set(obj, () => resolve());
    });
  }

  async function getBudget() {
    const { learningBudget, learningConfig } = await _readJSON(['learningBudget', 'learningConfig']);
    const cap = (learningConfig && typeof learningConfig.dailyCapUSD === 'number')
      ? learningConfig.dailyCapUSD
      : DEFAULT_CAP_USD;
    const enabled = !learningConfig || learningConfig.enabled !== false;
    const today = _todayUTC();
    let state = learningBudget || { dateUTC: today, spentUSD: 0, callCount: 0 };
    if (state.dateUTC !== today) state = { dateUTC: today, spentUSD: 0, callCount: 0 };
    return { state, cap, enabled };
  }

  async function canSpend(estUSD = 0.005) {
    const { state, cap, enabled } = await getBudget();
    if (!enabled) return { ok: false, reason: 'disabled', state, cap };
    if (state.spentUSD + estUSD > cap) return { ok: false, reason: 'cap_reached', state, cap };
    return { ok: true, state, cap };
  }

  async function debitBudget(usage) {
    const { state, cap } = await getBudget();
    const inTok = (usage && usage.input_tokens) || 0;
    const outTok = (usage && usage.output_tokens) || 0;
    const cost = (inTok / 1_000_000) * COST_PER_MTOK_IN + (outTok / 1_000_000) * COST_PER_MTOK_OUT;
    const next = {
      dateUTC: state.dateUTC,
      spentUSD: +(state.spentUSD + cost).toFixed(6),
      callCount: state.callCount + 1,
      lastCallAt: Date.now()
    };
    await _writeJSON({ learningBudget: next });
    return { cost, state: next, cap };
  }

  function urlAllowed(url) {
    if (!url) return false;
    return !DENY_URL_PATTERNS.some(re => re.test(url));
  }

  function parserAllowed(parserKey) {
    return ALLOWED_PARSER_IDS.has(parserKey);
  }

  function _buildPrompt(payload) {
    const { parserKey, siteId, reasons, baselineSample, requiredFields, snapshot } = payload;
    const system = [
      'You are a DOM-parsing engineer. Given HTML snippets of cards from a search-results page and the current parser output,',
      'produce a JSON object describing CSS selectors that extract the requested fields from each card.',
      '',
      'Return ONLY valid JSON in this exact shape:',
      '{',
      '  "fields": {',
      '    "<fieldName>": {',
      '      "selectors": ["css1", "css2"],',
      '      "attr": "textContent" | "aria-label" | "href" | "<other>",',
      '      "regex": "<optional regex on extracted string, use capture group 1 if present>",',
      '      "transform": "price" | "int" | "float" | "text"',
      '    }',
      '  },',
      '  "validators": { "<fieldName>": "<regex the extracted value must match>" },',
      '  "confidence": 0.0-1.0',
      '}',
      '',
      'Rules:',
      '- Selectors must be plain CSS (no :contains, no jQuery).',
      '- Prefer stable attributes (aria-label, data-*) over class names.',
      '- Validators must be strict (e.g. price: "^\\\\$[\\\\d,.]+$").',
      '- If you cannot infer a field reliably, omit it from "fields".'
    ].join('\n');

    const userBody = [
      `Site: ${siteId}`,
      `Parser: ${parserKey}`,
      `Required fields: ${requiredFields.join(', ')}`,
      `Trip reasons: ${reasons.join(', ')}`,
      '',
      'Current baseline output (first 3 results, showing nulls):',
      JSON.stringify(baselineSample, null, 2),
      '',
      'HTML samples (one per card, stripped):',
      ...snapshot.map((html, i) => `--- card ${i + 1} ---\n${html}`)
    ].join('\n');

    return { system, user: userBody };
  }

  async function _callAnthropic({ apiKey, system, user }) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`anthropic ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  function _extractJSON(content) {
    if (!Array.isArray(content)) return null;
    const text = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  function _validateConfigShape(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    if (!cfg.fields || typeof cfg.fields !== 'object') return false;
    for (const [k, v] of Object.entries(cfg.fields)) {
      if (!v || !Array.isArray(v.selectors) || !v.selectors.length) return false;
      for (const sel of v.selectors) if (typeof sel !== 'string' || !sel) return false;
    }
    return true;
  }

  async function handleLearnParser(payload) {
    if (!payload || !payload.parserKey) return { ok: false, reason: 'invalid_payload' };
    if (!parserAllowed(payload.parserKey)) return { ok: false, reason: 'parser_not_allowlisted' };
    if (!urlAllowed(payload.url)) return { ok: false, reason: 'url_denied' };
    if (!payload.snapshot || !payload.snapshot.length) return { ok: false, reason: 'no_snapshot' };

    const gate = await canSpend(0.005);
    if (!gate.ok) return { ok: false, reason: gate.reason };

    const { webmcp_anthropic_key } = await _readJSON(['webmcp_anthropic_key']);
    if (!webmcp_anthropic_key) return { ok: false, reason: 'no_api_key' };

    const { system, user } = _buildPrompt(payload);
    let response;
    try {
      response = await _callAnthropic({ apiKey: webmcp_anthropic_key, system, user });
    } catch (err) {
      return { ok: false, reason: 'api_error', error: String(err.message || err) };
    }

    const budgetAfter = await debitBudget(response.usage || {});

    const config = _extractJSON(response.content);
    if (!_validateConfigShape(config)) return { ok: false, reason: 'invalid_config', budgetAfter };

    const { parserOverrides } = await _readJSON(['parserOverrides']);
    const all = parserOverrides || {};
    const existing = all[payload.parserKey] || {};
    all[payload.parserKey] = {
      ...existing,
      candidate: {
        config: {
          fields: config.fields,
          validators: config.validators || {},
          confidence: typeof config.confidence === 'number' ? config.confidence : 0.5
        },
        runs: [],
        createdAt: Date.now(),
        trippedFor: payload.reasons || []
      }
    };
    await _writeJSON({ parserOverrides: all });

    return { ok: true, candidateInstalled: true, budgetAfter };
  }

  function init() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === 'LEARN_PARSER') {
        handleLearnParser(message.payload).then(sendResponse).catch(err => {
          sendResponse({ ok: false, reason: 'exception', error: String(err.message || err) });
        });
        return true;
      }
      if (message && message.type === 'BUDGET_STATUS') {
        getBudget().then(sendResponse);
        return true;
      }
      return undefined;
    });
  }

  return {
    init,
    handleLearnParser,
    canSpend,
    debitBudget,
    getBudget,
    urlAllowed,
    parserAllowed,
    _buildPrompt,
    _extractJSON,
    _validateConfigShape
  };
})();

if (typeof self !== 'undefined') self.LEARNING = LEARNING;
if (typeof module !== 'undefined' && module.exports) module.exports = LEARNING;
