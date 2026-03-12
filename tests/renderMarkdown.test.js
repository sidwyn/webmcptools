import { describe, it, expect } from 'vitest';

// Standalone copy of renderMarkdown and escapeHtml from app.js for testing.
// Changes to app.js must be mirrored here.

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text) {
  let processed = text.replace(/^\s*\{[\s\S]*?\}\s*$/gm, '').replace(/\n{2,}/g, '\n\n').replace(/^\s*\n/gm, '').trim();
  if (!processed) return '';

  const codeBlocks = [];
  processed = processed.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`);
    return `\x00CB${idx}\x00`;
  });

  const tableBlocks = [];
  processed = processed.replace(/((?:^\|.+\|[ \t]*$\n?){2,})/gm, (tableStr) => {
    const rows = tableStr.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return tableStr;
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

  processed = processed
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  processed = processed
    .replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');

  for (let i = 0; i < codeBlocks.length; i++) {
    processed = processed.replace(`\x00CB${i}\x00`, codeBlocks[i]);
  }
  for (let i = 0; i < tableBlocks.length; i++) {
    processed = processed.replace(`\x00TB${i}\x00`, tableBlocks[i]);
  }

  processed = processed
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/(<br\s*\/?>){2,}/g, '<br>')
    .replace(/<p>\s*<br\s*\/?>\s*<\/p>/g, '');

  return processed;
}

describe('renderMarkdown headings', () => {
  it('renders h1', () => {
    const result = renderMarkdown('# Hello');
    expect(result).toContain('<h1>Hello</h1>');
  });

  it('renders h2', () => {
    const result = renderMarkdown('## Section');
    expect(result).toContain('<h2>Section</h2>');
  });

  it('renders h3', () => {
    const result = renderMarkdown('### Subsection');
    expect(result).toContain('<h3>Subsection</h3>');
  });

  it('renders multiple heading levels', () => {
    const result = renderMarkdown('# Title\n## Subtitle\n### Detail');
    expect(result).toContain('<h1>Title</h1>');
    expect(result).toContain('<h2>Subtitle</h2>');
    expect(result).toContain('<h3>Detail</h3>');
  });

  it('does not treat mid-line # as headings', () => {
    const result = renderMarkdown('This is not ## a heading');
    expect(result).not.toContain('<h2>');
  });

  it('renders headings mixed with paragraphs', () => {
    const result = renderMarkdown('Some text\n\n## Heading\n\nMore text');
    expect(result).toContain('<h2>Heading</h2>');
    expect(result).toContain('Some text');
    expect(result).toContain('More text');
  });
});

describe('renderMarkdown inline', () => {
  it('renders bold', () => {
    const result = renderMarkdown('**bold text**');
    expect(result).toContain('<strong>bold text</strong>');
  });

  it('renders inline code', () => {
    const result = renderMarkdown('use `npm install`');
    expect(result).toContain('<code>npm install</code>');
  });

  it('escapes HTML in code', () => {
    const result = renderMarkdown('`<script>`');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('renderMarkdown tables', () => {
  it('renders a simple table', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const result = renderMarkdown(md);
    expect(result).toContain('<table');
    expect(result).toContain('<th>A</th>');
    expect(result).toContain('<td>1</td>');
  });
});

describe('renderMarkdown horizontal rules', () => {
  it('renders --- as <hr>', () => {
    const result = renderMarkdown('Above\n\n---\n\nBelow');
    expect(result).toContain('<hr>');
    expect(result).toContain('Above');
    expect(result).toContain('Below');
  });

  it('renders longer dashes as <hr>', () => {
    const result = renderMarkdown('-----');
    expect(result).toContain('<hr>');
  });

  it('does not render mid-line --- as <hr>', () => {
    const result = renderMarkdown('some --- text');
    expect(result).not.toContain('<hr>');
  });
});

describe('renderMarkdown edge cases', () => {
  it('returns empty for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('strips raw JSON objects', () => {
    const result = renderMarkdown('Hello\n{"tool": "call"}\nWorld');
    expect(result).not.toContain('tool');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });
});
