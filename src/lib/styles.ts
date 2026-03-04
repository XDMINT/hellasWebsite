/**
 * Zentrale Design-Token-Klassen (Tailwind-Strings)
 * Werden von allen Seiten und Komponenten importiert.
 */

// ── Überschriften ──────────────────────────────────────────────────
export const titleClass =
  "font-albert text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight";

/** Titel mit blauem Unterstrich-Akzent */
export const underlinedTitleClass =
  "font-albert text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 " +
  "relative inline-block after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-2 " +
  "after:h-1 after:rounded-full after:bg-blue-500";

/** Kleinerer Titelstil (z. B. index.astro) */
export const underlinedTitleSmClass =
  `${titleClass} relative inline-block after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-2 after:h-1 after:rounded-full after:bg-blue-500`;

/** Abschnitts-Titel (h2/h3 ohne Unterstrich) */
export const sectionTitleClass =
  "font-albert text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900";

// ── Text ───────────────────────────────────────────────────────────
export const bodyClass = "font-barlow text-base sm:text-lg leading-relaxed text-neutral-700";
export const smallClass = "font-barlow text-sm text-neutral-600";
export const sectionKickerClass = "font-barlow text-sm font-semibold text-blue-700";

// ── Buttons ────────────────────────────────────────────────────────
export const ctaBtn =
  "inline-flex items-center justify-center rounded-xl px-4 py-3 font-barlow text-sm sm:text-base font-semibold " +
  "bg-amber-500 text-white hover:bg-amber-600 transition " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300";

export const secondaryBtn =
  "inline-flex items-center justify-center rounded-xl px-4 py-3 font-barlow text-sm sm:text-base font-semibold " +
  "bg-white text-neutral-900 ring-1 ring-black/10 hover:bg-neutral-50 transition " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300";

/** Heller Ghost-Button für dunkle Hintergründe */
export const tertiaryBtn =
  "font-barlow inline-flex items-center justify-center rounded-md bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50";

/** Unterstrichener Titel mit konfigurierbarer Größe (für SectionIntro) */
export const makeUnderlinedTitle = (titleSize: string) =>
  `font-albert ${titleSize} font-extrabold tracking-tight text-neutral-900 ` +
  "relative inline-block after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-2 " +
  "after:h-1 after:rounded-full after:bg-blue-500";

// ── Layout-Bausteine ───────────────────────────────────────────────
/** Graue Box mit abgerundeten Ecken */
export const box = "bg-neutral-100 rounded-2xl px-6 py-10 sm:px-10 sm:py-12";

/** Weiße Karte mit Ring */
export const card = "bg-white rounded-2xl ring-1 ring-black/10 p-6";

/** Blauer Akzentbalken */
export const accentBar = "h-1 w-12 rounded-full bg-blue-500/90";

// ── Formular ───────────────────────────────────────────────────────
export const inputClass =
  "w-full rounded-xl bg-white px-4 py-3 font-barlow text-sm sm:text-base text-neutral-900 " +
  "ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-300";

export const labelClass = "font-barlow text-sm font-semibold text-neutral-700";

