import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import { transformerMetaHighlight, transformerNotationFocus } from '@shikijs/transformers';

// https://astro.build/config
export default defineConfig({
  site: 'https://eddn.dev',
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      theme: 'nord',
      wrap: true,
      transformers: [
        transformerMetaHighlight(),
        transformerNotationFocus(),
      ],
    },
  },
  integrations: [sitemap()],
});