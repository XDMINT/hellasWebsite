// src/lib/wp.ts
export const WP_BASE =
    import.meta.env.WP_BASE_URL ?? "https://wsv-hellas.de";

export type WpPost = {
    id: number;
    slug: string;
    link: string;
    date: string;
    title: { rendered: string };
    excerpt: { rendered: string };
    content?: { rendered: string };
    _embedded?: any;
};

export function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function getFeaturedImage(post: WpPost): string | null {
    return (
        post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url ??
        post?._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.large?.source_url ??
        null
    );
}

export function formatDateDE(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    }).format(d);
}

export async function fetchWp<T>(path: string): Promise<T> {
    const url = `${WP_BASE}${path}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
        throw new Error(`WP API Error ${res.status}: ${url}`);
    }
    return (await res.json()) as T;
}
