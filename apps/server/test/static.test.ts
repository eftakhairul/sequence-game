import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from './helpers.js';

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lineup-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>t</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  server = await startServer({ webDist: dir });
});
afterAll(() => server.close());

describe('static files', () => {
  it('serves index, assets with long cache and SPA fallback', async () => {
    const index = await fetch(`${server.url}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(index.headers.get('x-content-type-options')).toBe('nosniff');
    const asset = await fetch(`${server.url}/assets/app.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const route = await fetch(`${server.url}/r/ABCDEF`);
    expect(route.status).toBe(200);
    expect(await route.text()).toContain('<title>t</title>');
    expect((await fetch(`${server.url}/missing.js`)).status).toBe(404);
    const dotted = await fetch(`${server.url}/%2e%2e/%2e%2e/etc/passwd`); // normalised by URL parsing
    expect(await dotted.text()).not.toContain('root:');
    expect((await fetch(`${server.url}/..%2f..%2f..%2fetc%2fpasswd`)).status).toBe(403);
    expect((await fetch(`${server.url}/`, { method: 'POST' })).status).toBe(405);
  });
});
