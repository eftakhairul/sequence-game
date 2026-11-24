// Fails if the initial JS (scripts referenced by index.html) exceeds 200 KB gzip (spec §9.5).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const scripts = [
  ...html.matchAll(/<script[^>]+src="\/([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+)"/g),
].map((m) => m[1]);
let total = 0;
for (const s of scripts) {
  const size = gzipSync(readFileSync(join(dist, s))).length;
  total += size;
  console.log(`${s}: ${(size / 1024).toFixed(1)} KB gzip`);
}
const limit = 200 * 1024;
console.log(`Initial JS: ${(total / 1024).toFixed(1)} KB gzip (limit ${limit / 1024} KB)`);
if (total > limit) {
  console.error('Bundle size budget exceeded');
  process.exit(1);
}
