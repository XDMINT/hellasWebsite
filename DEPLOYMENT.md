# Ruderampel - Netlify Deployment Guide

## 🚀 Quick Start

### 1. Lokal testen
```bash
npm run dev
# Öffne http://localhost:3000
```

### 2. Build testen
```bash
npm run build
# Prüft auf Fehler
```

### 3. Zu Netlify deployen
```bash
# Option 1: Git Push (Auto-Deploy)
git push origin main

# Option 2: Netlify CLI
netlify deploy --prod
```

---

## 🌧️ RainViewer CORS-Fix

Die Netlify Function `netlify/functions/rainviewer-proxy.js` löst CORS-Probleme:

- **Localhost**: Verwendet lokale OSM-Basemap (RainViewer nicht verfügbar)
- **Netlify**: RainViewer Radar wird über die Proxy-Function geladen
- **URL Pattern**: `/.netlify/functions/rainviewer-proxy?z={z}&x={x}&y={y}`

### Wie es funktioniert:
1. Leaflet fordert Tiles über die Netlify Function an
2. Function proxied Request zu RainViewer API
3. Response mit CORS-Headers zurück an Browser
4. **Regenwolken sind sichtbar!** 🌧️

---

## 📊 Komponenten

### `src/components/ruderampel.astro`
- Hauptkomponente mit allen Funktionen
- Leaflet-Karte mit RainViewer
- Wetter-Vorhersage (4 Zeiträume)
- Pegel-Diagramm (ARIMAX-Vorhersage)

### `netlify/functions/rainviewer-proxy.js`
- CORS-Proxy Function für RainViewer Tiles
- Cache-Headers (1 Stunde)
- Error-Handling

### `netlify.toml`
- Netlify-Konfiguration
- Build-Command
- Function-Verzeichnis

---

## 🔧 Features

✅ **Echtzeit-Regenradar** mit RainViewer  
✅ **Wetter-Vorhersage** für Gießen (2h/6h/12h/2 Tage)  
✅ **Pegel-Graph** mit ARIMAX-Vorhersage  
✅ **ARIMAX-Modell** mit Einzugsgebiets-Niederschlag  
✅ **Status-Ampel** (Rot/Gelb/Grün)  
✅ **Responsive Design**  
✅ **Dark Mode Support**  

---

## 📈 Technologie-Stack

- **Frontend**: Astro, Tailwind CSS, Leaflet
- **Wetter-Daten**: Open-Meteo API
- **Pegel-Daten**: Pegelonline WSV
- **Radar-Daten**: RainViewer (via Netlify Function)
- **Vorhersage**: ARIMAX-Modell
- **Hosting**: Netlify + Netlify Functions

---

## 🐛 Troubleshooting

### Regenradar zeigt nichts
- ✅ Auf Netlify deployen (lokales RainViewer hat CORS-Probleme)
- ✅ Browser-Console prüfen (F12)
- ✅ Netlify Logs prüfen: `netlify open:admin`

### Wetter-Daten fehlen
- ✅ Open-Meteo API-Status prüfen
- ✅ Browser-Console auf Fehler prüfen

### Pegel-Daten offline
- ✅ Pegelonline WSV Status prüfen
- ✅ Netzwerkfehler in Console checken

---

## 📝 Environment

Keine zusätzlichen Env-Variablen nötig. Alle APIs sind kostenlos und öffentlich.

---

**Viel Erfolg beim Deployment!** 🎯

