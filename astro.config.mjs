import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import { transformerMetaHighlight, transformerNotationFocus } from '@shikijs/transformers';

import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import achGrammar from './src/styles/achronyme.tmLanguage.json';

// https://astro.build/config
export default defineConfig({
  site: 'https://eddn.dev',
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'nord',
      wrap: true,
      langs: [
        { ...achGrammar, name: 'ach', aliases: ['achronyme'] },
      ],
      transformers: [
        transformerMetaHighlight(),
        transformerNotationFocus(),
      ],
    },
  },
  integrations: [sitemap({
    i18n: {
      defaultLocale: 'en',
      locales: {
        en: 'en',
        es: 'es',
      },
    },
  })],
});