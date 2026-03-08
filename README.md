# WSV Hellas 1920 Gießen e. V. – Website

Die offizielle Website des Wassersportvereins Hellas 1920 Gießen e. V., gebaut mit [Astro](https://astro.build), [Tailwind CSS v4](https://tailwindcss.com) und deployed auf [Netlify](https://netlify.com).

---

## 🛠 Tech Stack

| Technologie | Version | Zweck |
|---|---|---|
| [Astro](https://astro.build) | ^5 | Static-Site-Framework mit SSR via Netlify |
| [Tailwind CSS](https://tailwindcss.com) | ^4 | Utility-first CSS |
| [@astrojs/netlify](https://docs.astro.build/en/guides/integrations-guide/netlify/) | ^6 | Netlify-Adapter für SSR & Edge Functions |
| [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/) | ^3 | Automatische Sitemap-Generierung |
| [Sharp](https://sharp.pixelplumbing.com) | ^0.33 | Bildoptimierung |

---

## 🚀 Projektstruktur

```text
/
├── netlify/
│   └── functions/
│       └── purge-cache.mjs       # Netlify Edge Function zum Cache-Invalidieren
├── public/
│   ├── fonts/                    # Self-hosted Schriften (Albert Sans, Barlow)
│   ├── downloads/                # PDFs (Aufnahmeantrag, Satzung)
│   └── _headers                  # Netlify HTTP-Header (Cache, Security)
├── scripts/
│   └── convert-fonts.mjs         # Hilfsskript: Schriften → woff2 konvertieren
└── src/
    ├── assets/
    │   └── images/               # Optimierte Bilder (via astro:assets)
    ├── components/               # Wiederverwendbare Astro-Komponenten
    ├── layouts/
    │   └── siteLayout.astro      # Haupt-Layout mit Header, Footer, Hero
    ├── lib/                      # Hilfsfunktionen (WordPress-API, Ruderampel, Wetter)
    ├── pages/                    # Seiten (Routing über Dateinamen)
    │   └── news/
    │       ├── index.astro       # News-Übersicht
    │       └── [slug].astro      # Dynamische News-Detailseite (WordPress)
    └── styles/
        └── global.css            # Globale CSS-Stile & Schrift-Definitionen
```

---

## 🧞 Befehle

Alle Befehle werden im Projektverzeichnis ausgeführt:

| Befehl | Aktion |
| :--- | :--- |
| `npm install` | Abhängigkeiten installieren |
| `npm run dev` | Lokaler Dev-Server auf `localhost:4321` |
| `npm run build` | Produktions-Build nach `./dist/` |
| `npm run preview` | Build lokal vorschauen |
| `npm run convert-fonts` | Schriften nach woff2 konvertieren |

---

## 📄 Seiten

| Route | Beschreibung |
| :--- | :--- |
| `/` | Startseite |
| `/news` | News-Übersicht (WordPress-CMS) |
| `/news/[slug]` | News-Detailseite |
| `/rudern` | Rudersport |
| `/drachenboot` | Drachenboot |
| `/allgemeines-sportangebot` | Allgemeines Sportangebot |
| `/trainingszeiten` | Trainingszeiten |
| `/vorstand` | Vorstand |
| `/mitglied-werden` | Mitglied werden |
| `/kontakt` | Kontakt & Anfahrt |
| `/impressum` | Impressum |
| `/datenschutz` | Datenschutzerklärung |

---

## 🚦 Ruderampel

Die Ruderampel ist ein zentrales Feature der Startseite. Sie zeigt Mitgliedern auf einen Blick, ob die Lahn aktuell für den Ruderbetrieb geeignet ist.

### Funktionsweise

Die Ampel basiert auf dem aktuellen **Pegelstand der Lahn** und berechnet daraus einen Farbstatus:

| Farbe | Pegelstand | Bedeutung |
| :--- | :--- | :--- |
| 🟢 Grün | unter Richtwert | Normalbetrieb, Rudern problemlos möglich |
| 🟡 Gelb | erhöhter Pegel | Eingeschränkter Betrieb, Vorsicht geboten |
| 🔴 Rot | über Hochwassergrenze (≥ 360 cm) | Kein Ruderbetrieb |

### Datenquellen

- **Pegelstand** – [PEGELONLINE REST-API](https://www.pegelonline.wsv.de) des Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV). Gemessen wird an der Station Gießen (`32807065-b887-49f0-935a-80033e5f3cb0`), Abruf der letzten 48 Stunden im 15-Minuten-Takt.
- **Wettervorhersage** – [Open-Meteo API](https://open-meteo.com) liefert stündliche Temperaturen, Niederschlag, Windgeschwindigkeit und -richtung sowie Wettercode für die nächsten 48 Stunden.
- **Niederschlagsradar** – [Brightsky API](https://brightsky.dev) (DWD-Daten) für aktuelle Radarkarten.

### ARIMAX-Pegelprognose (`ruderampel-core.ts`)

Aus den abgerufenen Messwerten wird clientseitig eine **48-Stunden-Pegelprognose** berechnet. Das Modell nutzt einen vereinfachten **ARIMAX-Ansatz** (AutoRegressive Integrated Moving Average with eXogenous input):

1. **Lineare Trendbereinigung** – Regression über die letzten 48 Messwerte, um den langfristigen Trend zu isolieren.
2. **AR(3)-Modell** – Autoregressive Koeffizienten werden per vereinfachten Yule-Walker-Gleichungen aus der Autokorrelationsfunktion (ACF) des detrendierten Signals geschätzt.
3. **Exogene Variable: Niederschlag** – Die stündliche Niederschlagsprognose aus Open-Meteo fließt mit einem gewichteten Faktor in die Pegelprognose ein, da Regen mit Verzögerung den Pegel anhebt.
4. **Iterative Vorwärtsprognose** – Jeder der 48 Prognoseschritte nutzt die vorangegangenen (prognostizierten) Werte als Input für den nächsten.

Die Prognose wird zusammen mit den Messwerten in einem interaktiven **Canvas-Diagramm** (`ruderampel-chart.ts`) visualisiert, das Messwerte, Prognose, Hochwasserlinie und Konfidenzband darstellt.

### UI-Komponenten (`src/components/ruderampel.astro`)

- **Ampel-Dot** auf der Startseite – farbiger Kreis mit aktuellem Status
- **Ampel-Modal** – aufklappbares Detail-Panel mit:
  - Aktuellem Pegelstand und Trend
  - Interaktivem Pegeldiagramm (48h Messung + 48h Prognose)
  - Wettervorhersage (stündlich, 48h)
  - Niederschlagsradar (Brightsky/DWD)

---

## 📰 News (WordPress-Integration)

Die News-Sektion ist vollständig mit einem externen **WordPress-CMS** verbunden. WordPress läuft unter `https://wsv-hellas.de` und stellt Inhalte über die **WordPress REST API** bereit.

### Implementierung (`src/lib/wp.ts`)

| Funktion | Beschreibung |
| :--- | :--- |
| `fetchWp<T>(path)` | Generischer GET-Request an die WP REST API mit 8s Timeout |
| `fetchWpWithHeaders<T>(path)` | Wie `fetchWp`, gibt zusätzlich `X-WP-Total` und `X-WP-TotalPages` Header zurück (für Pagination, ohne separaten HEAD-Request) |
| `getFeaturedImage(post)` | Extrahiert die URL des Beitragsbildes aus `_embedded` |
| `stripHtml(html)` | Entfernt HTML-Tags, `<style>` und `<script>`-Blöcke aus WP-Inhalten |
| `formatDateDE(iso)` | Formatiert ISO-Datum auf deutsches Format (z. B. „8. März 2026") |

### Seiten

- **`/news`** – Übersichtsseite mit Pagination. Lädt Beiträge seitenweise (`per_page=9`) inkl. Featured Image via `_embed`. Die Gesamtanzahl der Seiten wird aus dem `X-WP-TotalPages`-Header gelesen.
- **`/news/[slug]`** – Dynamische Detailseite. Der Slug wird zur Laufzeit (SSR) aufgelöst. Vollständiger Beitragsinhalt (`content.rendered`) wird bereinigt dargestellt.

### Caching & Cache-Invalidierung

Da die Seite als SSR auf Netlify läuft, werden WordPress-Inhalte bei jedem Request frisch geladen. Über die Netlify Edge Function `netlify/functions/purge-cache.mjs` kann der Netlify-Cache gezielt invalidiert werden – z. B. ausgelöst durch einen WordPress-Webhook beim Veröffentlichen neuer Beiträge.

---

## 🌐 Deployment

Die Seite wird automatisch über **Netlify** deployed. Der Netlify-Adapter ermöglicht SSR für dynamische Seiten (z. B. News via WordPress-API). CSS wird immer inline gerendert, um blockierende Netzwerk-Requests zu vermeiden.

**Live:** [https://wsv-hellas-giessen.de](https://wsv-hellas-giessen.de)
