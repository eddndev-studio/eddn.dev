import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

function collectFiles(directory, extension) {
  return readdirSync(join(projectRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(relativePath, extension);
      }
      return relativePath.endsWith(extension) ? [relativePath] : [];
    });
}

test('generated pages expose the correct language and one main landmark', () => {
  const routes = [
    ['dist/index.html', 'en'],
    ['dist/blog/index.html', 'en'],
    ['dist/articles/achronyme-prove-ir/index.html', 'en'],
    ['dist/es/index.html', 'es'],
    ['dist/es/blog/index.html', 'es'],
    ['dist/es/articles/achronyme-prove-ir/index.html', 'es'],
  ];

  for (const [route, language] of routes) {
    const html = read(route);
    assert.match(html, new RegExp(`<html lang="${language}"`), route);
    assert.equal(html.match(/<main\b/g)?.length, 1, route);
  }
});

test('Astro links do not remove focus without a visible replacement', () => {
  const astroSource = collectFiles('src', '.astro')
    .map((file) => read(file))
    .join('\n');

  assert.doesNotMatch(astroSource, /focus:outline-none/);
  assert.match(astroSource, /focus-visible:/);
});

test('small purple text uses the readable brand shades', () => {
  const astroSource = collectFiles('src', '.astro')
    .map((file) => read(file))
    .join('\n');

  assert.doesNotMatch(
    astroSource,
    /(?:text-(?:xs|sm)[^"\n]*text-brand-500|text-brand-500[^"\n]*text-(?:xs|sm))/,
  );
});

test('motion has reduced-motion and visibility safeguards', () => {
  const css = read('src/styles/global.css');
  const clientSource = [
    read('src/layouts/Layout.astro'),
    read('src/components/Header.astro'),
    read('src/utils/visuals.ts'),
  ].join('\n');

  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(clientSource, /prefers-reduced-motion/);
  assert.match(clientSource, /IntersectionObserver/);
  assert.match(clientSource, /visibilitychange/);
});

test('Canvas renderers scale for high-density displays', () => {
  const canvasSource = collectFiles('src/lib', '.ts')
    .map((file) => read(file))
    .join('\n');

  assert.match(canvasSource, /devicePixelRatio/);
  assert.match(canvasSource, /setTransform/);
});

test('the mobile menu renders the current year with ASCII text', () => {
  const header = read('src/components/Header.astro');

  assert.match(header, /const currentYear = new Date\(\)\.getFullYear\(\)/);
  assert.match(header, /\(c\) \{currentYear\}/);
  assert.doesNotMatch(header, /2025/);
  assert.doesNotMatch(header, /[\u00a9\u2318]/);
});

test('default metadata follows the page locale', () => {
  const english = read('dist/index.html');
  const spanish = read('dist/es/index.html');

  assert.match(
    english,
    /content="Software engineering, trajectory, and personal notes by Eduardo Alonso\."/,
  );
  assert.match(english, /content="Cover of: eddn\.dev/);
  assert.match(
    spanish,
    /content="Ingenier\u00eda de software, trayectoria y pensamientos personales de Eduardo Alonso\."/,
  );
  assert.match(spanish, /content="Portada de: eddn\.dev/);
});

test('search shortcuts are removed between view transitions', () => {
  const search = read('src/components/Search.astro');

  assert.match(search, /searchAbort:\s*AbortController/);
  assert.match(search, /signal:\s*searchAbort\.signal/);
  assert.match(search, /astro:before-swap/);
});

test('pagination, filters, and solution details use localized labels', () => {
  const englishPagination = read('dist/leetcode/2/index.html');
  const spanishPagination = read('dist/es/leetcode/2/index.html');
  const englishSolution = read('dist/leetcode/0001-two-sum/index.html');
  const spanishSolution = read('dist/es/leetcode/0001-two-sum/index.html');

  assert.match(englishPagination, />Page</);
  assert.match(englishPagination, />Prev</);
  assert.match(englishPagination, />Next</);
  assert.match(spanishPagination, />P\u00e1gina</);
  assert.match(spanishPagination, />Anterior</);
  assert.match(spanishPagination, />Siguiente</);
  assert.match(spanishPagination, /aria-current="page"/);
  assert.match(spanishPagination, />\s*Todos\s*</);
  assert.match(englishSolution, /Back to Solutions/);
  assert.doesNotMatch(englishSolution, /Volver a Soluciones/);
  assert.match(spanishSolution, /PROBLEMA EN LEETCODE/);
  assert.match(spanishSolution, /Complejidad Temporal/);
  assert.match(spanishSolution, /Complejidad Espacial/);
  assert.match(spanishSolution, /title="Vistas totales"/);
});

test('navigation exposes the current page and canvases have distinct lifecycles', () => {
  const englishBlog = read('dist/blog/index.html');
  const landing = read('src/components/pages/LandingPage.astro');
  const notFound = read('src/components/pages/NotFoundPage.astro');

  assert.match(englishBlog, /href="\/blog\/" aria-current="page"/);
  assert.match(landing, /id="hero-canvas"/);
  assert.match(notFound, /id="not-found-canvas"/);
  assert.match(notFound, /manageVisualMotion/);
});

test('restored styles do not reference removed client runtimes or fonts', () => {
  const globalCss = read('src/styles/global.css');
  const pageSource = collectFiles('src/pages', '.astro')
    .map((file) => read(file))
    .join('\n');

  assert.doesNotMatch(globalCss, /\.lenis/);
  assert.doesNotMatch(pageSource, /JetBrains Mono/);
});

test('the visual restoration preserves the current freelance copy', () => {
  const translations = read('src/i18n/ui.ts');

  assert.match(translations, /take on select freelance projects/);
  assert.match(translations, /proyectos freelance selectos/);
  assert.match(translations, /Open to freelance projects/);
  assert.match(translations, /Abierto a proyectos freelance/);
});
