/**
 * purge-cache.mjs – Netlify Function
 *
 * Invalidiert den Netlify CDN-Cache für News-Seiten gezielt per Cache-Tag,
 * ohne einen neuen Deploy auszulösen.
 *
 * Setup (einmalig in Netlify → Site configuration → Environment variables):
 *   PURGE_SECRET      – beliebiger langer String als Zugriffsschutz
 *   NETLIFY_AUTH_TOKEN – Personal Access Token (Netlify → User settings → OAuth applications)
 *   NETLIFY_SITE_ID   – Site-ID (Netlify → Site configuration → General → Site ID)
 *
 * Aufruf – alle News purgen (Übersicht + alle Einzelbeiträge):
 *   curl -X POST https://<deine-domain>/.netlify/functions/purge-cache \
 *        -H "x-purge-secret: <PURGE_SECRET>"
 *
 * Aufruf – nur einen einzelnen Beitrag purgen:
 *   curl -X POST https://<deine-domain>/.netlify/functions/purge-cache \
 *        -H "x-purge-secret: <PURGE_SECRET>" \
 *        -H "Content-Type: application/json" \
 *        -d '{"slug":"mein-artikel-slug"}'
 */

export default async (req) => {
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    // Secret prüfen
    const secret = process.env.PURGE_SECRET;
    if (secret) {
        const incoming = req.headers.get("x-purge-secret") ?? "";
        if (incoming !== secret) {
            console.warn("[purge-cache] Ungültiges Secret.");
            return new Response("Forbidden", { status: 403 });
        }
    } else {
        console.warn("[purge-cache] PURGE_SECRET nicht gesetzt – alle Anfragen werden akzeptiert!");
    }

    const authToken = process.env.NETLIFY_AUTH_TOKEN;
    const siteId = process.env.NETLIFY_SITE_ID;

    if (!authToken || !siteId) {
        console.error("[purge-cache] NETLIFY_AUTH_TOKEN oder NETLIFY_SITE_ID fehlt.");
        return new Response("Server misconfigured", { status: 500 });
    }

    // Optional: einzelnen Slug aus Body lesen
    let slug = null;
    try {
        const body = await req.json();
        slug = body?.slug ?? null;
    } catch {
        // kein Body oder kein JSON → alle News purgen
    }

    // Tags bestimmen: entweder nur den Einzelbeitrag oder alle News
    const tags = slug ? [`news-${slug}`, "news"] : ["news"];

    try {
        const res = await fetch(
            `https://api.netlify.com/api/v1/sites/${siteId}/purge`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ cache_tags: tags }),
                signal: AbortSignal.timeout(10_000),
            }
        );

        if (!res.ok) {
            const text = await res.text();
            console.error(`[purge-cache] Netlify API ${res.status}: ${text}`);
            return new Response(`Purge failed: ${res.status}`, { status: 502 });
        }

        console.log(`[purge-cache] Cache für Tags [${tags.join(", ")}] erfolgreich geleert.`);
        return new Response(
            JSON.stringify({ purged: true, tags }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("[purge-cache] Fehler:", err);
        return new Response("Internal Server Error", { status: 500 });
    }
};

export const config = {
    path: "/.netlify/functions/purge-cache",
};

