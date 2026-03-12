// src/pages/sitemap-news.xml.ts
// Dynamische Sitemap für alle WordPress-News-Artikel.
// @astrojs/sitemap erfasst keine SSR-Routen, daher wird diese Sitemap
// separat generiert und in sitemap-index.xml eingebunden (siehe astro.config.mjs).

import type { APIRoute } from "astro";
import { fetchWp, type WpPost } from "../lib/wp";

export const prerender = false;

// 24 h cachen, stale-while-revalidate damit Suchmaschinen nie einen Fehler sehen
const CACHE = "public, s-maxage=86400, stale-while-revalidate=86400, stale-if-error=604800";

async function fetchAllPosts(): Promise<WpPost[]> {
    const perPage = 100;
    let page = 1;
    const all: WpPost[] = [];

    while (true) {
        const batch = await fetchWp<WpPost[]>(
            `/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_fields=slug,date,modified&status=publish`
        );
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < perPage) break;
        page++;
    }

    return all;
}

export const GET: APIRoute = async () => {
    let posts: WpPost[] = [];

    try {
        posts = await fetchAllPosts();
    } catch (e) {
        console.error("[sitemap-news] WP-API nicht erreichbar:", e);
        // Leere aber valide Sitemap zurückgeben, damit Suchmaschinen keinen Fehler erhalten
    }

    const urls = posts
        .map((post) => {
            const lastmod = post.modified ?? post.date ?? "";
            const lastmodTag = lastmod
                ? `\n    <lastmod>${new Date(lastmod).toISOString().split("T")[0]}</lastmod>`
                : "";
            return `  <url>
    <loc>https://wsv-hellas.de/news/${post.slug}</loc>${lastmodTag}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
        })
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": CACHE,
        },
    });
};


