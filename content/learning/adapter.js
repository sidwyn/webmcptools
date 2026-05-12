// content/learning/adapter.js — runtime override resolution for parser fields

window.WebMCPLearning = window.WebMCPLearning || (() => {
  const cache = {
    overrides: {},
    config: { enabled: true, dailyCapUSD: 0.10 }
  };

  function _hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function _loadCache() {
    if (!_hasChromeStorage()) return;
    try {
      chrome.storage.local.get(['parserOverrides', 'learningConfig'], (data) => {
        if (data && data.parserOverrides) cache.overrides = data.parserOverrides;
        if (data && data.learningConfig) cache.config = { ...cache.config, ...data.learningConfig };
      });
    } catch {}
  }

  if (_hasChromeStorage() && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.parserOverrides) cache.overrides = changes.parserOverrides.newValue || {};
      if (changes.learningConfig) cache.config = { ...cache.config, ...(changes.learningConfig.newValue || {}) };
    });
  }

  _loadCache();

  function applyTransform(value, transform) {
    if (value == null) return null;
    const str = typeof value === 'string' ? value.trim() : String(value).trim();
    if (!str) return null;
    switch (transform) {
      case 'price': {
        const m = str.match(/\$[\d,]+(?:\.\d{1,2})?/);
        return m ? m[0] : null;
      }
      case 'int': {
        const cleaned = str.replace(/,/g, '');
        const m = cleaned.match(/-?\d+/);
        return m ? parseInt(m[0], 10) : null;
      }
      case 'float': {
        const cleaned = str.replace(/,/g, '');
        const m = cleaned.match(/-?\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
      }
      case 'text':
      default:
        return str;
    }
  }

  function extractField(root, config) {
    if (!root || !config || !Array.isArray(config.selectors)) return null;
    for (const sel of config.selectors) {
      let el = null;
      try {
        el = root.querySelector(sel);
      } catch {
        continue;
      }
      if (!el) continue;

      let raw = null;
      if (!config.attr || config.attr === 'textContent') {
        raw = el.textContent;
      } else if (config.attr === 'innerText') {
        raw = el.innerText;
      } else {
        raw = el.getAttribute(config.attr);
      }
      if (raw == null) continue;

      if (config.regex) {
        let r;
        try { r = new RegExp(config.regex); } catch { continue; }
        const m = String(raw).match(r);
        if (!m) continue;
        raw = m[1] != null ? m[1] : m[0];
      }

      const out = applyTransform(raw, config.transform);
      if (out != null && out !== '') return out;
    }
    return null;
  }

  function _validatorPasses(parserKey, fieldKey, value, source) {
    const cfg = cache.overrides[parserKey] && cache.overrides[parserKey][source];
    if (!cfg || !cfg.validators) return true;
    const re = cfg.validators[fieldKey];
    if (!re) return true;
    try { return new RegExp(re).test(String(value)); } catch { return true; }
  }

  function resolveField(card, parserKey, fieldKey, baselineFn) {
    if (cache.config.enabled !== false) {
      const active = cache.overrides[parserKey] && cache.overrides[parserKey].active;
      if (active && active.fields && active.fields[fieldKey]) {
        const val = extractField(card, active.fields[fieldKey]);
        if (val != null && _validatorPasses(parserKey, fieldKey, val, 'active')) return val;
      }
    }
    try {
      return baselineFn(card);
    } catch {
      return null;
    }
  }

  function getActive(parserKey) {
    return cache.overrides[parserKey] && cache.overrides[parserKey].active;
  }

  function getCandidate(parserKey) {
    return cache.overrides[parserKey] && cache.overrides[parserKey].candidate;
  }

  function evaluateCandidateField(card, parserKey, fieldKey) {
    const candidate = getCandidate(parserKey);
    if (!candidate || !candidate.fields || !candidate.fields[fieldKey]) return null;
    const val = extractField(card, candidate.fields[fieldKey]);
    if (val == null) return null;
    if (!_validatorPasses(parserKey, fieldKey, val, 'candidate')) return null;
    return val;
  }

  function _setCacheForTests(next) {
    if (next.overrides) cache.overrides = next.overrides;
    if (next.config) cache.config = { ...cache.config, ...next.config };
  }

  function _getCacheForTests() {
    return cache;
  }

  return {
    resolveField,
    extractField,
    applyTransform,
    getActive,
    getCandidate,
    evaluateCandidateField,
    _setCacheForTests,
    _getCacheForTests
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.WebMCPLearning;
}
