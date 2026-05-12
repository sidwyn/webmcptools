// content/learning/snapshot.js — DOM stripping for learning calls

window.WebMCPSnapshot = window.WebMCPSnapshot || (() => {
  const ATTR_ALLOWLIST = new Set(['class', 'id', 'href', 'role']);
  const ATTR_PREFIX_ALLOWLIST = ['data-', 'aria-'];
  const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'IFRAME', 'LINK', 'META']);
  const MAX_PER_CARD = 4096;
  const MAX_TOTAL = 12288;

  function _isAllowedAttr(name) {
    if (ATTR_ALLOWLIST.has(name)) return true;
    return ATTR_PREFIX_ALLOWLIST.some(p => name.startsWith(p));
  }

  function _stripAttrValue(value) {
    if (typeof value !== 'string') return '';
    if (value.startsWith('data:')) return '';
    if (value.length > 200) return value.slice(0, 200);
    return value;
  }

  function stripElement(el) {
    if (!el || el.nodeType !== 1) return null;
    const clone = el.cloneNode(false);
    for (const attr of Array.from(clone.attributes || [])) {
      const name = attr.name.toLowerCase();
      if (!_isAllowedAttr(name)) {
        clone.removeAttribute(attr.name);
        continue;
      }
      const stripped = _stripAttrValue(attr.value);
      if (stripped !== attr.value) clone.setAttribute(attr.name, stripped);
    }

    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1) {
        if (STRIP_TAGS.has(child.tagName)) continue;
        const stripped = stripElement(child);
        if (stripped) clone.appendChild(stripped);
      } else if (child.nodeType === 3) {
        const text = child.textContent;
        if (text && text.trim()) clone.appendChild(child.cloneNode(false));
      }
    }
    return clone;
  }

  function stripToHTML(el) {
    const stripped = stripElement(el);
    if (!stripped) return '';
    let html = stripped.outerHTML || '';
    html = html.replace(/\s+/g, ' ').trim();
    if (html.length > MAX_PER_CARD) html = html.slice(0, MAX_PER_CARD) + '…';
    return html;
  }

  function captureCards(cardElements, n = 3) {
    if (!cardElements || !cardElements.length) return [];
    const picks = [];
    if (cardElements.length === 1) {
      picks.push(0);
    } else if (cardElements.length === 2) {
      picks.push(0, 1);
    } else {
      const last = cardElements.length - 1;
      picks.push(0, Math.floor(last / 2), last);
    }
    const chosen = picks.slice(0, n).map(i => cardElements[i]).filter(Boolean);

    const out = [];
    let total = 0;
    for (const el of chosen) {
      const html = stripToHTML(el);
      if (!html) continue;
      if (total + html.length > MAX_TOTAL) break;
      total += html.length;
      out.push(html);
    }
    return out;
  }

  return { captureCards, stripToHTML, stripElement };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.WebMCPSnapshot;
}
