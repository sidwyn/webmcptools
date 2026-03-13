import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { loadTool } from './helpers/loadSource.js';

// Mock browser globals needed by tool files
globalThis.window = { location: { href: 'https://www.google.com/travel/flights' } };
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  dispatchEvent: () => {},
  body: { innerText: '', textContent: '' }
};
globalThis.setTimeout = () => {};
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;
globalThis.Event = class Event { constructor() {} };
globalThis.WebMCPHelpers = {
  findByText: () => null,
  findByAriaLabel: () => null,
  simulateClick: () => {},
  sleep: () => Promise.resolve(),
  waitForElement: () => Promise.resolve(null),
  waitForGoogleFlightsResults: () => Promise.resolve(true),
  parseGoogleFlightCard: () => ({}),
  setSliderValue: () => {},
  waitForWalmartResults: () => Promise.resolve(true),
  findWalmartProductCards: () => [],
  parseWalmartProductCard: () => ({}),
  parseWalmartProductDetail: () => ({}),
};

// Discover all site modules and load their tools
const sitesDir = join(__dirname, '../content/sites');
const allSites = readdirSync(sitesDir).filter(d =>
  d !== '_template' && existsSync(join(sitesDir, d, 'tools'))
);

const allTools = {};

for (const site of allSites) {
  const toolDir = join(sitesDir, site, 'tools');
  const toolFiles = readdirSync(toolDir).filter(f => f.endsWith('.js'));
  for (const file of toolFiles) {
    const filePath = join(toolDir, file);
    const { readFileSync } = await import('fs');
    const source = readFileSync(filePath, 'utf-8');
    const constMatch = source.match(/^const\s+(\w+Tool)\s*=/m);
    if (constMatch) {
      try {
        const tool = loadTool(filePath, constMatch[1]);
        if (tool) allTools[`${site}/${constMatch[1]}`] = tool;
      } catch {
        // Skip tools that can't load without full DOM
      }
    }
  }
}

describe('All tool schemas', () => {
  const toolEntries = Object.entries(allTools);

  it('loaded at least 10 tools across all sites', () => {
    expect(toolEntries.length).toBeGreaterThanOrEqual(10);
  });

  for (const [qualifiedName, tool] of toolEntries) {
    describe(qualifiedName, () => {
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
