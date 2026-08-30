import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

test('legacy translated blog slugs redirect to their canonical locale routes', () => {
  const redirects = read('public/_redirects');

  assert.match(redirects, /^\/es\/blog\/future-of-eddndev\/ \/es\/blog\/futuro-de-eddndev\/ 301$/m);
  assert.match(redirects, /^\/blog\/futuro-de-eddndev\/ \/blog\/future-of-eddndev\/ 301$/m);
  assert.match(redirects, /^\/es\/blog\/welcome-2026\/ \/es\/blog\/bienvenido-2026\/ 301$/m);
  assert.match(redirects, /^\/blog\/bienvenido-2026\/ \/blog\/welcome-2026\/ 301$/m);
});

test('robots advertises the canonical sitemap index', () => {
  assert.match(read('public/robots.txt'), /^Sitemap: https:\/\/eddn\.dev\/sitemap-index\.xml$/m);
});
