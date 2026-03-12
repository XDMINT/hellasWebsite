// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import { EnumChangefreq } from 'sitemap';

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

  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.includes('/api'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      serialize(item) {
        // Startseite höchste Priorität
        if (item.url === 'https://wsv-hellas.de/') {
          return { ...item, priority: 1.0, changefreq: EnumChangefreq.DAILY };
        }
        // News-Übersicht und aktive Vereinsseiten
        if (
          item.url.includes('/news') ||
          item.url.includes('/rudern') ||
          item.url.includes('/drachenboot') ||
          item.url.includes('/trainingszeiten') ||
          item.url.includes('/mitglied-werden')
        ) {
          return { ...item, priority: 0.9, changefreq: EnumChangefreq.WEEKLY };
        }
        // Sonstige Hauptseiten
        if (
          item.url.includes('/allgemeines-sportangebot') ||
          item.url.includes('/kontakt') ||
          item.url.includes('/vorstand')
        ) {
          return { ...item, priority: 0.8, changefreq: EnumChangefreq.MONTHLY };
        }
        // Rechtliche Seiten niedrige Priorität
        if (item.url.includes('/impressum') || item.url.includes('/datenschutz')) {
          return { ...item, priority: 0.3, changefreq: EnumChangefreq.YEARLY };
        }
        return item;
      },
    })
  ]
});