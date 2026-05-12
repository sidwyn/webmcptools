// content/learning/gate.js — heuristic detection of parser degradation

window.WebMCPGate = window.WebMCPGate || (() => {
  const DEBOUNCE_MS = 60_000;
  const METRICS_KEY = 'parserMetrics';
  const RING_CAP = 20;
  const REQUIRED_FIELDS_DEFAULT = ['title', 'price'];
  const NULL_RATE_TRIP = 0.30;
  const COUNT_DELTA_TRIP = 0.5;

  const lastTrip = {};

  function _now() { return Date.now(); }

  function _hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function _readMetrics(parserKey) {
    return new Promise(resolve => {
      if (!_hasChromeStorage()) return resolve({});
      try {
        chrome.storage.local.get([METRICS_KEY], data => {
          const all = (data && data[METRICS_KEY]) || {};
          resolve(all[parserKey] || { runs: [], lastStructureHash: null });
        });
      } catch {
        resolve({});
      }
    });
  }

  function _writeMetrics(parserKey, value) {
    if (!_hasChromeStorage()) return;
    try {
      chrome.storage.local.get([METRICS_KEY], data => {
        const all = (data && data[METRICS_KEY]) || {};
        all[parserKey] = value;
        chrome.storage.local.set({ [METRICS_KEY]: all });
      });
    } catch {}
  }

  function structureHash(card) {
    if (!card || !card.children) return null;
    const firstChild = card.children[0];
    if (!firstChild) return null;
    const classes = [];
    for (const c of firstChild.children || []) {
      const cn = (c.className || '').split(/\s+/).filter(Boolean).sort().join('.');
      if (cn) classes.push(`${c.tagName.toLowerCase()}:${cn}`);
    }
    return classes.sort().join('|').slice(0, 200);
  }

  function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function _nullRate(results, fields) {
    if (!results.length) return 1;
    const missing = results.filter(r => fields.some(f => r[f] == null || r[f] === ''));
    return missing.length / results.length;
  }

  function _shouldTrip(metrics, options) {
    const { cardCount, results, requiredFields, sampleCard, presentCount } = options;
    const reasons = [];

    if (presentCount > 0 && cardCount === 0) {
      return ['hard_signal:cards_present_but_zero_parsed'];
    }

    const runs = metrics.runs || [];
    if (runs.length >= 3) {
      const counts = runs.map(r => r.cardCount);
      const med = median(counts);
      if (med > 0 && cardCount < med * COUNT_DELTA_TRIP) reasons.push('count_drop');
    }

    const nullRate = _nullRate(results, requiredFields);
    if (nullRate > NULL_RATE_TRIP) reasons.push('null_rate_high');

    const hash = structureHash(sampleCard);
    if (metrics.lastStructureHash && hash && metrics.lastStructureHash !== hash) {
      reasons.push('structure_change');
    }

    return reasons.length >= 2 ? reasons : [];
  }

  async function observe(parserKey, options) {
    const {
      results = [],
      cardCount = results.length,
      presentCount = 0,
      requiredFields = REQUIRED_FIELDS_DEFAULT,
      sampleCard = null,
      rootSelector = null,
      cardSelector = null,
      siteId = 'unknown'
    } = options || {};

    const metrics = await _readMetrics(parserKey);
    const hash = structureHash(sampleCard);

    const nextRuns = [...(metrics.runs || []), { ts: _now(), cardCount, nullRate: _nullRate(results, requiredFields) }];
    if (nextRuns.length > RING_CAP) nextRuns.splice(0, nextRuns.length - RING_CAP);

    const nextMetrics = {
      runs: nextRuns,
      lastStructureHash: cardCount > 0 ? hash : metrics.lastStructureHash
    };
    _writeMetrics(parserKey, nextMetrics);

    const reasons = _shouldTrip(metrics, { cardCount, results, requiredFields, sampleCard, presentCount });
    if (!reasons.length) return { tripped: false };

    const since = _now() - (lastTrip[parserKey] || 0);
    if (since < DEBOUNCE_MS) return { tripped: false, debounced: true };
    lastTrip[parserKey] = _now();

    let snapshot = [];
    try {
      if (rootSelector && cardSelector && window.WebMCPSnapshot) {
        const root = document.querySelector(rootSelector) || document;
        const cards = root.querySelectorAll(cardSelector);
        snapshot = window.WebMCPSnapshot.captureCards(Array.from(cards));
      }
    } catch {}

    _dispatchLearnRequest({
      parserKey,
      siteId,
      reasons,
      baselineSample: results.slice(0, 3),
      requiredFields,
      snapshot,
      url: typeof location !== 'undefined' ? location.href : ''
    });

    return { tripped: true, reasons };
  }

  function _dispatchLearnRequest(payload) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ type: 'LEARN_PARSER', payload }).catch(() => {});
    } catch {}
  }

  return {
    observe,
    structureHash,
    _shouldTrip,
    _resetForTests() {
      for (const k of Object.keys(lastTrip)) delete lastTrip[k];
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.WebMCPGate;
}
