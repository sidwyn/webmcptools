import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const manifest = JSON.parse(readFileSync(join(__dirname, '../manifest.json'), 'utf-8'));

describe('manifest.json', () => {
  it('uses manifest v3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('has required permissions', () => {
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).toContain('tabs');
    expect(manifest.permissions).toContain('scripting');
  });

  it('has correct host permissions', () => {
    expect(manifest.host_permissions).toContain('https://www.google.com/travel/flights*');
    expect(manifest.host_permissions).toContain('https://www.google.com/travel/explore*');
    expect(manifest.host_permissions).toContain('https://www.youtube.com/*');
  });

  it('does not have static content_scripts (uses programmatic registration)', () => {
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('side panel path exists', () => {
    const panelPath = join(__dirname, '..', manifest.side_panel.default_path);
    expect(existsSync(panelPath)).toBe(true);
  });

  it('background service worker exists', () => {
    const bgPath = join(__dirname, '..', manifest.background.service_worker);
    expect(existsSync(bgPath)).toBe(true);
  });

  it('icon files exist', () => {
    for (const [size, path] of Object.entries(manifest.icons)) {
      const fullPath = join(__dirname, '..', path);
      expect(existsSync(fullPath), `Missing icon: ${path}`).toBe(true);
    }
  });

  it('is named WebMCPTools', () => {
    expect(manifest.name).toBe('WebMCPTools');
  });

  it('is version 0.2.0', () => {
    expect(manifest.version).toBe('0.2.0');
  });
});
