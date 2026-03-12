// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  site: 'https://wsv-hellas.de',

  build: {
    // Gesamtes CSS inline im HTML – spart den blockierenden /_astro/*.css Request (8.8 KB gzip).
    // Inline-CSS blockiert nicht den Render-Tree-Aufbau, da kein Netzwerk-Roundtrip nötig ist.
    inlineStylesheets: 'always',
  },

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: netlify(),

  prefetch: true,

  integrations: []
});