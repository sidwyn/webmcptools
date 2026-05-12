import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadTool } from './helpers/loadSource.js';

globalThis.window = { location: { href: 'https://docs.google.com/document/d/abc123/edit' } };
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  dispatchEvent: () => {},
  getElementById: () => null,
  body: { textContent: '', innerText: '' },
  title: 'Test Doc - Google Docs',
  createTreeWalker: () => ({ nextNode: () => null })
};
globalThis.setTimeout = () => {};
globalThis.URL = URL;
globalThis.Event = class Event { constructor() {} };
globalThis.KeyboardEvent = class KeyboardEvent { constructor() {} };
globalThis.MouseEvent = class MouseEvent { constructor() {} };
globalThis.ClipboardEvent = class ClipboardEvent { constructor() {} };
globalThis.DataTransfer = class DataTransfer { setData() {} };
globalThis.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
globalThis.WebMCPHelpers = {
  findByText: () => null,
  findByAriaLabel: () => null,
  simulateClick: () => {},
  simulateTyping: () => Promise.resolve(),
  sleep: () => Promise.resolve(),
  waitForElement: () => Promise.resolve(null),
  getDocsEditorFrame: () => null,
  getDocsEditDiv: () => null,
  focusDocsEditor: () => {},
  docsKeyCombo: () => true,
  readDocsText: () => Promise.resolve(''),
  docsInsertText: () => true,
  getDocsToolbarState: () => ({}),
  getDocsTitle: () => 'Test Doc',
  openDocsFindReplace: () => Promise.resolve(true),
  waitForDocsFindReplace: () => Promise.resolve(null),
  closeDocsFindReplace: () => true,
};

const toolDir = join(__dirname, '../content/sites/google-docs/tools');
const toolFiles = readdirSync(toolDir).filter(f => f.endsWith('.js'));
const tools = {};

for (const file of toolFiles) {
  const filePath = join(toolDir, file);
  const source = readFileSync(filePath, 'utf-8');
  const constMatch = source.match(/^const\s+(\w+Tool)\s*=/m);
  if (constMatch) {
    try {
      const tool = loadTool(filePath, constMatch[1]);
      if (tool) tools[constMatch[1]] = tool;
    } catch {}
  }
}

describe('Google Docs tool schemas', () => {
  const toolEntries = Object.entries(tools);

  it('loaded at least 8 tools', () => {
    expect(toolEntries.length).toBeGreaterThanOrEqual(8);
  });

  for (const [constName, tool] of toolEntries) {
    describe(constName, () => {
      it('has a snake_case name', () => {
        expect(tool.name).toBeDefined();
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      });

      it('has a description longer than 10 chars', () => {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
      });

      it('has an inputSchema with type "object"', () => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });

      it('has an execute function', () => {
        expect(typeof tool.execute).toBe('function');
      });

      if (tool.inputSchema.properties) {
        it('has descriptions for all properties', () => {
          for (const [propName, prop] of Object.entries(tool.inputSchema.properties)) {
            expect(prop.description, `${tool.name}.${propName} missing description`).toBeDefined();
          }
        });
      }

      if (tool.inputSchema.required) {
        it('required fields exist in properties', () => {
          for (const field of tool.inputSchema.required) {
            expect(
              tool.inputSchema.properties?.[field],
              `${tool.name}: required field "${field}" not in properties`
            ).toBeDefined();
          }
        });
      }
    });
  }
});
