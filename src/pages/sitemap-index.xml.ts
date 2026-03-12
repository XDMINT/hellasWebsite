// src/pages/sitemap-index.xml.ts
// Überschreibt den von @astrojs/sitemap generierten sitemap-index.xml.
// Bündelt die statische Seiten-Sitemap (sitemap-0.xml) und die dynamische
// News-Sitemap (/sitemap-news.xml) in einem einzigen Index-Dokument.

import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
    const now = new Date().toISOString().split("T")[0];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://wsv-hellas.de/sitemap-0.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://wsv-hellas.de/sitemap-news.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
        },
    });
};

