import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadTool } from './helpers/loadSource.js';

// Mock browser globals needed by tool files
globalThis.window = { location: { href: 'https://www.google.com/travel/flights' } };
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  dispatchEvent: () => {},
  body: { innerText: '' }
};
globalThis.setTimeout = () => {};
globalThis.URLSearchParams = URLSearchParams;
globalThis.URL = URL;
globalThis.WebMCPHelpers = {
  findByText: () => null,
  findByAriaLabel: () => null,
  simulateClick: () => {},
  sleep: () => Promise.resolve(),
  waitForGoogleFlightsResults: () => Promise.resolve(true),
  parseGoogleFlightCard: () => ({}),
  setSliderValue: () => {},
  waitForYouTubeResults: () => Promise.resolve(true),
  waitForVideoPlayer: () => Promise.resolve(true),
  getVideoElement: () => null,
  getYouTubePlayer: () => null,
  formatDuration: () => '0:00',
  parseYouTubeVideoRenderer: () => ({}),
};

// Discover all site tool directories
const sitesDir = join(__dirname, '../content/sites');
const siteNames = readdirSync(sitesDir).filter(d =>
  d !== '_template' && existsSync(join(sitesDir, d, 'tools'))
);

const tools = {};
for (const site of siteNames) {
  const toolDir = join(sitesDir, site, 'tools');
  const toolFiles = readdirSync(toolDir).filter(f => f.endsWith('.js'));
  for (const file of toolFiles) {
    const filePath = join(toolDir, file);
    const source = readFileSync(filePath, 'utf-8');
    const constMatch = source.match(/^const\s+(\w+Tool)\s*=/m);
    if (constMatch) {
      try {
        const tool = loadTool(filePath, constMatch[1]);
        if (tool) tools[constMatch[1]] = tool;
      } catch {
        // Skip tools that can't load without full DOM
      }
    }
  }
}

describe('All tool schemas', () => {
  const toolEntries = Object.entries(tools);

  it('loaded at least 10 tools', () => {
    expect(toolEntries.length).toBeGreaterThanOrEqual(10);
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
