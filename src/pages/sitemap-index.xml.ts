// src/pages/sitemap-index.xml.ts
// Vollständige Sitemap-Index-Datei (SSR).
// Da @astrojs/sitemap eine statische sitemap-index.xml baut, die auf Netlify
// diese SSR-Route überschreibt (leerer Body), wird der Plugin NICHT mehr genutzt.
// Stattdessen werden alle statischen Seiten hier direkt eingetragen und
// die dynamische News-Sitemap als zweiten Eintrag verlinkt.

import type { APIRoute } from "astro";

export const prerender = false;

const SITE = "https://wsv-hellas.de";

const STATIC_PAGES: Array<{ loc: string; changefreq: string; priority: string }> = [
    { loc: `${SITE}/`,                          changefreq: "daily",   priority: "1.0" },
    { loc: `${SITE}/rudern/`,                   changefreq: "weekly",  priority: "0.9" },
    { loc: `${SITE}/drachenboot/`,              changefreq: "weekly",  priority: "0.9" },
    { loc: `${SITE}/trainingszeiten/`,          changefreq: "weekly",  priority: "0.9" },
    { loc: `${SITE}/mitglied-werden/`,          changefreq: "weekly",  priority: "0.9" },
    { loc: `${SITE}/news/`,                     changefreq: "weekly",  priority: "0.9" },
    { loc: `${SITE}/allgemeines-sportangebot/`, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE}/kontakt/`,                  changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE}/vorstand/`,                 changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE}/impressum/`,                changefreq: "yearly",  priority: "0.3" },
    { loc: `${SITE}/datenschutz/`,              changefreq: "yearly",  priority: "0.3" },
];

export const GET: APIRoute = async () => {
    const now = new Date().toISOString().split("T")[0];

    const urlEntries = STATIC_PAGES.map(
        (p) => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    ).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
        },
    });
};

