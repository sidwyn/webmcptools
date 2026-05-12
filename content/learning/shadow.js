// content/learning/shadow.js — candidate execution and promotion tracking

window.WebMCPShadow = window.WebMCPShadow || (() => {
  const RUNS_NEEDED = 5;
  const OVERRIDES_KEY = 'parserOverrides';

  function _hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function _readOverrides() {
    return new Promise(resolve => {
      if (!_hasChromeStorage()) return resolve({});
      try {
        chrome.storage.local.get([OVERRIDES_KEY], data => resolve((data && data[OVERRIDES_KEY]) || {}));
      } catch {
        resolve({});
      }
    });
  }

  function _writeOverrides(next) {
    if (!_hasChromeStorage()) return;
    try { chrome.storage.local.set({ [OVERRIDES_KEY]: next }); } catch {}
  }

  function compareMetrics(baseline, candidate, requiredFields) {
    if (candidate.cardCount < baseline.cardCount) return { ok: false, reason: 'fewer_cards' };
    if (candidate.nullRate > baseline.nullRate + 0.01) return { ok: false, reason: 'higher_null_rate' };
    if (candidate.throws > 0) return { ok: false, reason: 'threw' };
    if (!candidate.validatorsPass) return { ok: false, reason: 'validator_fail' };
    return { ok: true };
  }

  function buildCandidateResult(card, candidateFields, baselineResult) {
    if (!card || !candidateFields) return null;
    const out = { ...baselineResult };
    let validatorsPass = true;
    for (const [key, cfg] of Object.entries(candidateFields)) {
      try {
        const val = window.WebMCPLearning.extractField(card, cfg);
        out[key] = val;
      } catch {
        out[key] = null;
        validatorsPass = false;
      }
    }
    return { result: out, validatorsPass };
  }

  function nullRateOf(results, fields) {
    if (!results.length) return 1;
    const missing = results.filter(r => fields.some(f => r[f] == null || r[f] === ''));
    return missing.length / results.length;
  }

  async function recordRun(parserKey, baselineResults, candidateResults, requiredFields) {
    const all = await _readOverrides();
    const entry = all[parserKey];
    if (!entry || !entry.candidate) return { skipped: true };

    const baseline = {
      cardCount: baselineResults.filter(Boolean).length,
      nullRate: nullRateOf(baselineResults, requiredFields)
    };
    const candidate = {
      cardCount: candidateResults.filter(r => r && r.result).length,
      nullRate: nullRateOf(candidateResults.map(r => r ? r.result : null), requiredFields),
      throws: candidateResults.filter(r => !r).length,
      validatorsPass: candidateResults.every(r => r && r.validatorsPass)
    };

    const cmp = compareMetrics(baseline, candidate, requiredFields);
    const runs = [...(entry.candidate.runs || []), { ts: Date.now(), baseline, candidate, ok: cmp.ok, reason: cmp.reason || null }];

    if (!cmp.ok) {
      delete all[parserKey].candidate;
      _writeOverrides(all);
      return { promoted: false, discarded: true, reason: cmp.reason };
    }

    if (runs.length >= RUNS_NEEDED) {
      const { config } = entry.candidate;
      all[parserKey] = { active: { ...config, installedAt: Date.now() } };
      _writeOverrides(all);
      return { promoted: true, runsCompleted: runs.length };
    }

    all[parserKey].candidate.runs = runs;
    _writeOverrides(all);
    return { promoted: false, runsCompleted: runs.length };
  }

  async function shadowMap(parserKey, cards, baselineResults, requiredFields) {
    if (!window.WebMCPLearning) return null;
    const candidate = window.WebMCPLearning.getCandidate(parserKey);
    if (!candidate || !candidate.fields) return null;

    const candidateResults = cards.map((card, i) =>
      buildCandidateResult(card, candidate.fields, baselineResults[i] || {})
    );
    return recordRun(parserKey, baselineResults, candidateResults, requiredFields || ['title', 'price']);
  }

  return {
    shadowMap,
    recordRun,
    compareMetrics,
    buildCandidateResult,
    nullRateOf
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.WebMCPShadow;
}
