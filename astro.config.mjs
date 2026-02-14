// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://wsv-hellas-giessen.de',

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: netlify(),

  prefetch: true,

  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.includes('/api'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date()
    })
  ]
});