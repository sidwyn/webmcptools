import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import vm from 'vm';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function loadIntoGlobal(relPath) {
  const src = readFileSync(join(ROOT, relPath), 'utf-8');
  vm.runInThisContext(src, { filename: relPath });
}

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.self = globalThis;
  loadIntoGlobal('content/learning/adapter.js');
  loadIntoGlobal('content/learning/snapshot.js');
  loadIntoGlobal('content/learning/gate.js');
  loadIntoGlobal('content/learning/shadow.js');
  loadIntoGlobal('background/learning.js');
});

function fakeEl({ tag = 'div', text = '', attrs = {}, children = [] } = {}) {
  return {
    tagName: tag.toUpperCase(),
    textContent: text || children.map(c => c.textContent || '').join(''),
    innerText: text,
    nodeType: 1,
    children,
    childNodes: children,
    className: attrs.class || '',
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    getAttribute(name) { return attrs[name] != null ? attrs[name] : null; },
    setAttribute(name, value) { attrs[name] = value; },
    removeAttribute(name) { delete attrs[name]; },
    querySelector(sel) {
      const m = sel.match(/^\[([\w-]+)(?:[*~|^$]?)?=?"?([^"\]]*)"?\]$/);
      if (m) {
        const [, attr, want] = m;
        const walk = (n) => {
          if (n.getAttribute && n.getAttribute(attr) === want) return n;
          for (const c of n.children || []) {
            const r = walk(c);
            if (r) return r;
          }
          return null;
        };
        return walk(this);
      }
      if (sel.startsWith('.')) {
        const want = sel.slice(1);
        const walk = (n) => {
          if ((n.className || '').split(/\s+/).includes(want)) return n;
          for (const c of n.children || []) {
            const r = walk(c);
            if (r) return r;
          }
          return null;
        };
        return walk(this);
      }
      const tagWant = sel.toUpperCase();
      const walk = (n) => {
        if (n.tagName === tagWant) return n;
        for (const c of n.children || []) {
          const r = walk(c);
          if (r) return r;
        }
        return null;
      };
      return walk(this);
    }
  };
}

describe('WebMCPLearning.applyTransform', () => {
  it('extracts a price', () => {
    expect(globalThis.WebMCPLearning.applyTransform('Only $29.99 today', 'price')).toBe('$29.99');
  });

  it('extracts an int from formatted number', () => {
    expect(globalThis.WebMCPLearning.applyTransform('1,234 reviews', 'int')).toBe(1234);
  });

  it('extracts a float', () => {
    expect(globalThis.WebMCPLearning.applyTransform('Rated 4.5 stars', 'float')).toBe(4.5);
  });

  it('falls back to trimmed text', () => {
    expect(globalThis.WebMCPLearning.applyTransform('  hello world  ', 'text')).toBe('hello world');
  });

  it('returns null for empty input', () => {
    expect(globalThis.WebMCPLearning.applyTransform('', 'price')).toBe(null);
    expect(globalThis.WebMCPLearning.applyTransform(null, 'int')).toBe(null);
  });
});

describe('WebMCPLearning.extractField', () => {
  it('uses textContent by default', () => {
    const root = fakeEl({
      children: [fakeEl({ tag: 'h2', text: 'Hello' })]
    });
    const out = globalThis.WebMCPLearning.extractField(root, { selectors: ['h2'] });
    expect(out).toBe('Hello');
  });

  it('reads aria-label when attr specified', () => {
    const root = fakeEl({
      children: [fakeEl({ tag: 'span', attrs: { 'aria-label': '4.5 out of 5 stars' } })]
    });
    const out = globalThis.WebMCPLearning.extractField(root, {
      selectors: ['span'],
      attr: 'aria-label',
      transform: 'float'
    });
    expect(out).toBe(4.5);
  });

  it('falls back to next selector when first matches but returns empty', () => {
    const root = fakeEl({
      children: [fakeEl({ tag: 'h2', text: '' }), fakeEl({ tag: 'span', text: 'Found' })]
    });
    const out = globalThis.WebMCPLearning.extractField(root, { selectors: ['h2', 'span'] });
    expect(out).toBe('Found');
  });

  it('applies regex with capture group', () => {
    const root = fakeEl({
      children: [fakeEl({ tag: 'span', text: 'Save $20 today' })]
    });
    const out = globalThis.WebMCPLearning.extractField(root, {
      selectors: ['span'],
      regex: 'Save (\\$\\d+)',
      transform: 'text'
    });
    expect(out).toBe('$20');
  });
});

describe('WebMCPLearning.resolveField', () => {
  beforeEach(() => {
    globalThis.WebMCPLearning._setCacheForTests({ overrides: {}, config: { enabled: true } });
  });

  it('falls back to baseline when no override exists', () => {
    const card = fakeEl({ children: [fakeEl({ tag: 'h2', text: 'Title' })] });
    const baseline = (c) => c.querySelector('h2').textContent;
    expect(globalThis.WebMCPLearning.resolveField(card, 'amazon.searchResults', 'title', baseline)).toBe('Title');
  });

  it('uses active override when present', () => {
    globalThis.WebMCPLearning._setCacheForTests({
      overrides: {
        'amazon.searchResults': {
          active: { fields: { title: { selectors: ['span'] } } }
        }
      }
    });
    const card = fakeEl({
      children: [
        fakeEl({ tag: 'h2', text: 'Old' }),
        fakeEl({ tag: 'span', text: 'New' })
      ]
    });
    const baseline = (c) => c.querySelector('h2').textContent;
    expect(globalThis.WebMCPLearning.resolveField(card, 'amazon.searchResults', 'title', baseline)).toBe('New');
  });

  it('skips override when validator rejects', () => {
    globalThis.WebMCPLearning._setCacheForTests({
      overrides: {
        'amazon.searchResults': {
          active: {
            fields: { price: { selectors: ['span'] } },
            validators: { price: '^\\$\\d+' }
          }
        }
      }
    });
    const card = fakeEl({ children: [fakeEl({ tag: 'span', text: 'invalid' })] });
    const baseline = () => '$10';
    expect(globalThis.WebMCPLearning.resolveField(card, 'amazon.searchResults', 'price', baseline)).toBe('$10');
  });

  it('disabled config short-circuits to baseline', () => {
    globalThis.WebMCPLearning._setCacheForTests({
      overrides: {
        'amazon.searchResults': { active: { fields: { title: { selectors: ['span'] } } } }
      },
      config: { enabled: false }
    });
    const card = fakeEl({ children: [fakeEl({ tag: 'span', text: 'New' })] });
    expect(globalThis.WebMCPLearning.resolveField(card, 'amazon.searchResults', 'title', () => 'Old')).toBe('Old');
  });
});

describe('WebMCPGate._shouldTrip', () => {
  it('returns hard signal when cards exist but parser returned 0', () => {
    const r = globalThis.WebMCPGate._shouldTrip({ runs: [] }, {
      cardCount: 0, results: [], requiredFields: ['title'], sampleCard: null, presentCount: 24
    });
    expect(r[0]).toMatch(/cards_present_but_zero_parsed/);
  });

  it('does not trip with no history', () => {
    const r = globalThis.WebMCPGate._shouldTrip({ runs: [] }, {
      cardCount: 10, results: [{ title: 'a', price: '$1' }], requiredFields: ['title', 'price'], sampleCard: null, presentCount: 10
    });
    expect(r).toEqual([]);
  });

  it('trips on count drop + null rate combo', () => {
    const runs = Array.from({ length: 5 }, () => ({ ts: 0, cardCount: 20, nullRate: 0 }));
    const results = Array.from({ length: 5 }, () => ({ title: null, price: null }));
    const r = globalThis.WebMCPGate._shouldTrip({ runs }, {
      cardCount: 5, results, requiredFields: ['title', 'price'], sampleCard: null, presentCount: 5
    });
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it('does not trip on single weak signal alone', () => {
    const runs = Array.from({ length: 5 }, () => ({ ts: 0, cardCount: 20, nullRate: 0 }));
    const results = Array.from({ length: 20 }, () => ({ title: 'a', price: '$1' }));
    const r = globalThis.WebMCPGate._shouldTrip({ runs }, {
      cardCount: 5, results, requiredFields: ['title', 'price'], sampleCard: null, presentCount: 5
    });
    expect(r).toEqual([]);
  });
});

describe('WebMCPShadow.compareMetrics', () => {
  it('passes when candidate is at-or-better', () => {
    const cmp = globalThis.WebMCPShadow.compareMetrics(
      { cardCount: 10, nullRate: 0.1 },
      { cardCount: 10, nullRate: 0.05, throws: 0, validatorsPass: true },
      ['title']
    );
    expect(cmp.ok).toBe(true);
  });

  it('fails on fewer cards', () => {
    const cmp = globalThis.WebMCPShadow.compareMetrics(
      { cardCount: 10, nullRate: 0 },
      { cardCount: 8, nullRate: 0, throws: 0, validatorsPass: true },
      ['title']
    );
    expect(cmp.ok).toBe(false);
    expect(cmp.reason).toBe('fewer_cards');
  });

  it('fails on higher null rate', () => {
    const cmp = globalThis.WebMCPShadow.compareMetrics(
      { cardCount: 10, nullRate: 0.1 },
      { cardCount: 10, nullRate: 0.3, throws: 0, validatorsPass: true },
      ['title']
    );
    expect(cmp.ok).toBe(false);
  });

  it('fails when validators fail', () => {
    const cmp = globalThis.WebMCPShadow.compareMetrics(
      { cardCount: 10, nullRate: 0 },
      { cardCount: 10, nullRate: 0, throws: 0, validatorsPass: false },
      ['title']
    );
    expect(cmp.ok).toBe(false);
  });
});

describe('LEARNING._validateConfigShape', () => {
  it('accepts a minimal valid config', () => {
    expect(globalThis.LEARNING._validateConfigShape({
      fields: { title: { selectors: ['h2'] } }
    })).toBe(true);
  });

  it('rejects missing fields object', () => {
    expect(globalThis.LEARNING._validateConfigShape({})).toBe(false);
  });

  it('rejects empty selectors', () => {
    expect(globalThis.LEARNING._validateConfigShape({
      fields: { title: { selectors: [] } }
    })).toBe(false);
  });

  it('rejects non-string selectors', () => {
    expect(globalThis.LEARNING._validateConfigShape({
      fields: { title: { selectors: [123] } }
    })).toBe(false);
  });
});

describe('LEARNING._extractJSON', () => {
  it('parses JSON from content array', () => {
    const out = globalThis.LEARNING._extractJSON([
      { type: 'text', text: 'Sure, here you go:\n{"fields":{"title":{"selectors":["h2"]}}}\n' }
    ]);
    expect(out.fields.title.selectors[0]).toBe('h2');
  });

  it('returns null on malformed', () => {
    const out = globalThis.LEARNING._extractJSON([{ type: 'text', text: 'no braces here' }]);
    expect(out).toBe(null);
  });
});

describe('LEARNING url/parser allowlists', () => {
  it('denies checkout urls', () => {
    expect(globalThis.LEARNING.urlAllowed('https://www.amazon.com/gp/cart/view.html')).toBe(false);
    expect(globalThis.LEARNING.urlAllowed('https://www.walmart.com/checkout/something')).toBe(false);
    expect(globalThis.LEARNING.urlAllowed('https://docs.google.com/document/abc')).toBe(false);
  });

  it('allows search urls', () => {
    expect(globalThis.LEARNING.urlAllowed('https://www.amazon.com/s?k=headphones')).toBe(true);
  });

  it('only allows registered parser ids', () => {
    expect(globalThis.LEARNING.parserAllowed('amazon.searchResults')).toBe(true);
    expect(globalThis.LEARNING.parserAllowed('random.thing')).toBe(false);
  });
});

describe('WebMCPSnapshot.stripToHTML', () => {
  it('strips script and style tags', () => {
    globalThis.document = { documentElement: {} };
    const card = {
      nodeType: 1,
      tagName: 'DIV',
      attributes: [{ name: 'class', value: 'card' }, { name: 'onclick', value: 'evil()' }],
      cloneNode() {
        return {
          nodeType: 1,
          tagName: 'DIV',
          attributes: [{ name: 'class', value: 'card' }],
          getAttribute(n) { return n === 'class' ? 'card' : null; },
          setAttribute() {},
          removeAttribute(n) { this.attributes = this.attributes.filter(a => a.name !== n); },
          childNodes: [],
          appendChild() {},
          outerHTML: '<div class="card"></div>'
        };
      },
      childNodes: []
    };
    const html = globalThis.WebMCPSnapshot.stripToHTML(card);
    expect(html).toContain('<div');
    expect(html).not.toContain('onclick');
  });
});
