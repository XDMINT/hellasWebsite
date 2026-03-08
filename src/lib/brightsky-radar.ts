// Bright Sky Radar Implementation (TypeScript)
import type * as L from "leaflet";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface RadarRecord {
    timestamp: string;
    precipitation_5: string; // base64-kodiert, gzip-komprimiert
}

interface BrightSkyResponse {
    radar: RadarRecord[];
}

interface RadarFrame {
    timestamp: number;   // Unix-Sekunden
    dateTime: Date;
    isForecast: boolean;
    imageUrl: string;    // canvas.toDataURL()
    label: string;       // "HH:MM"
}

interface PakoLib {
    inflate(data: Uint8Array): Uint8Array;
}

// Window-Erweiterungen für dynamisch geladene Bibliotheken
declare global {
    interface Window {
        L: typeof L;
        pako: PakoLib;
        initBrightSkyRadar: (mapElementId: string) => Promise<void>;
        radarJumpToFrame: (frameIndex: number) => void;
        stopRadarAnimation: boolean;
    }
}

// Damit declare global als Modul-Augmentation gilt
export {};

// Globale Flags initialisieren
window.stopRadarAnimation = false;

// ─── Öffentliche API ──────────────────────────────────────────────────────────

export async function initBrightSkyRadar(mapElementId: string): Promise<void> {
    await ensureLeaflet();
    await ensurePako();
    await setupRadar(mapElementId);
}

// Rückwärtskompatibilität: auch auf window verfügbar halten
window.initBrightSkyRadar = initBrightSkyRadar;

// ─── Abhängigkeiten dynamisch laden ───────────────────────────────────────────

function ensureLeaflet(): Promise<void> {
    if (window.L) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Leaflet load timeout")), 10_000);

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); reject(new Error("Leaflet load error")); };
        document.head.appendChild(script);
    });
}

function ensurePako(): Promise<void> {
    if (window.pako) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Pako load timeout")), 10_000);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/pako@2.1.0/dist/pako.min.js";
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); reject(new Error("Pako load error")); };
        document.head.appendChild(script);
    });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

async function setupRadar(mapElementId: string): Promise<void> {
    const mapContainer = document.getElementById(mapElementId);
    if (!mapContainer) return;

    // Bug 9: Leaflet wirft Fehler wenn Container bereits initialisiert ist
    if ((mapContainer as any)._leaflet_id != null) return;

    // Bug 11: laufende Animation des vorherigen Inits stoppen
    if ((mapContainer as any)._radarStopAnimation) {
        (mapContainer as any)._radarStopAnimation();
    }

    await loadAndDisplayRadar(mapContainer);
}

async function loadAndDisplayRadar(mapContainer: HTMLElement): Promise<void> {
    // Bug 10: dediziertes data-radar-section Attribut als Scope, robuster als .closest('.rounded-xl')
    const radarSection = mapContainer.closest<HTMLElement>("[data-radar-section]") ?? document;

    const timestampEl = radarSection.querySelector<HTMLElement>("[data-radar-timestamp]");

    let data: BrightSkyResponse;
    try {
        const response = await fetch("https://api.brightsky.dev/radar?tz=Europe/Berlin");
        if (!response.ok) {
            if (timestampEl) timestampEl.textContent = `Fehler: HTTP ${response.status}`;
            return;
        }
        data = await response.json() as BrightSkyResponse;
    } catch (err) {
        if (timestampEl) timestampEl.textContent = "Fehler: " + (err as Error).message;
        return;
    }

    if (!data.radar || data.radar.length === 0) {
        if (timestampEl) timestampEl.textContent = "Keine Radardaten verfügbar";
        return;
    }

    const gridWidth = 1100;
    const gridHeight = 1200;

    const map = window.L.map(mapContainer, {
        center: [50.585, 8.678],
        zoom: 11,
        zoomControl: true,
    });

    map.whenReady(() => {
        const zoomControl = mapContainer.querySelector<HTMLElement>(".leaflet-control-container");
        if (zoomControl) zoomControl.style.zIndex = "9";
    });

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
    }).addTo(map);

    window.L.circleMarker([50.585, 8.678] as L.LatLngExpression, {
        radius: 8,
        fillColor: "#3b82f6",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
    })
        .addTo(map)
        .bindPopup("<b>Gießen</b><br>Ruderanlegestelle Lahn");

    const now = new Date();

    // Bug 4: Nur Metadaten + komprimierte Rohdaten speichern, Canvas erst bei showFrame rendern
    const frames: RadarFrame[] = [];
    const rawRecords: RadarRecord[] = [];

    for (const record of data.radar) {
        try {
            const dateTime = new Date(record.timestamp);
            const isForecast = dateTime > now;
            frames.push({
                timestamp: Math.floor(dateTime.getTime() / 1000),
                dateTime,
                isForecast,
                imageUrl: "",   // wird lazy befüllt
                label: dateTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
            });
            rawRecords.push(record);
        } catch {
            // Fehlerhaften Frame überspringen
        }
    }

    if (frames.length === 0) {
        if (timestampEl) timestampEl.textContent = "Keine Frames verarbeitet";
        return;
    }

    createFrameControl(map, frames, rawRecords, gridWidth, gridHeight, radarSection);
    initTimeline(frames, radarSection);
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function initTimeline(frames: RadarFrame[], scope: Element | Document): void {
    const timelineEl = scope.querySelector<HTMLElement>("[data-radar-timeline]");
    if (!timelineEl) return;

    const forecastStartIdx = frames.findIndex((f) => f.isForecast);
    const nowPercentage =
        forecastStartIdx > 0 ? (forecastStartIdx / (frames.length - 1)) * 100 : null;

    timelineEl.style.position = "relative";
    timelineEl.style.height = "28px";
    timelineEl.innerHTML = "";

    const numLabels = 5;
    for (let i = 0; i < numLabels; i++) {
        const frameIndex = Math.round((i / (numLabels - 1)) * (frames.length - 1));
        const frame = frames[frameIndex];
        const leftPct = (frameIndex / (frames.length - 1)) * 100;
        const timeStr = frame.dateTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const transform =
            i === 0 ? "translateX(0)" :
            i === numLabels - 1 ? "translateX(-100%)" :
            "translateX(-50%)";
        const span = document.createElement("span");
        span.style.cssText = `position:absolute;left:${leftPct}%;top:0;transform:${transform};font-size:10px;white-space:nowrap;color:#9CA3AF;pointer-events:none;`;
        span.textContent = timeStr;
        timelineEl.appendChild(span);
    }

    if (nowPercentage !== null) {
        const marker = document.createElement("div");
        marker.setAttribute("data-now-marker", "true");
        marker.innerHTML = `
            <div style="position:absolute;left:${nowPercentage}%;top:-20px;height:20px;width:2px;background:#10b981;transform:translateX(-50%);opacity:0.7;pointer-events:none;"></div>
            <span style="position:absolute;left:${nowPercentage}%;top:12px;transform:translateX(-50%);font-size:10px;color:#10b981;font-weight:bold;white-space:nowrap;pointer-events:none;">jetzt</span>`;
        timelineEl.appendChild(marker);
    }

    const progressContainer = scope.querySelector<HTMLElement>("[data-radar-progress]")?.parentElement ?? null;
    if (!progressContainer) return;

    if (!document.getElementById("radar-toggler-style")) {
        const style = document.createElement("style");
        style.id = "radar-toggler-style";
        style.textContent = `
            [data-radar-progress-forecast]{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,#fbbf24 0%,#f59e0b 100%);z-index:5;transition:width 0.1s ease-out;}
            [data-radar-progress]::after{content:'';position:absolute;top:50%;right:0;width:16px;height:16px;margin-top:-8px;margin-right:-8px;background:white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:grab;z-index:20;transition:box-shadow .2s;}
            [data-radar-progress]:active::after{cursor:grabbing;box-shadow:0 4px 12px rgba(0,0,0,.4);}`;
        document.head.appendChild(style);
    }

    if (window.getComputedStyle(progressContainer).position === "static") {
        progressContainer.style.position = "relative";
    }

    let isDragging = false;

    const updateFrameFromX = (clientX: number): void => {
        const rect = progressContainer.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const frameIndex = Math.round(percentage * (frames.length - 1));
        if (window.radarJumpToFrame) {
            window.stopRadarAnimation = true;
            window.radarJumpToFrame(frameIndex);
        }
    };

    // Bug 1: AbortController damit Listener beim nächsten Init sauber entfernt werden
    const listenerAc = new AbortController();
    const { signal } = listenerAc;

    progressContainer.addEventListener("mousedown", (e) => { isDragging = true; updateFrameFromX(e.clientX); }, { signal });
    progressContainer.addEventListener("mousemove", (e) => { if (isDragging) updateFrameFromX(e.clientX); }, { signal });
    progressContainer.addEventListener("touchstart", (e) => { isDragging = true; updateFrameFromX(e.touches[0].clientX); }, { signal });
    progressContainer.addEventListener("touchmove", (e) => { if (!isDragging) return; e.preventDefault(); updateFrameFromX(e.touches[0].clientX); }, { signal, passive: false });
    progressContainer.addEventListener("click", (e) => updateFrameFromX(e.clientX), { signal });
    document.addEventListener("mouseup", () => { isDragging = false; }, { signal });
    document.addEventListener("touchend", () => { isDragging = false; }, { signal });

    // Beim nächsten Radar-Init (z.B. nach 5-Minuten-Reload) Listener aufräumen
    (progressContainer as any)._radarListenerAc?.abort();
    (progressContainer as any)._radarListenerAc = listenerAc;
}

// ─── Dekompression ────────────────────────────────────────────────────────────

function decompress(raw: string): Uint16Array {
    if (!window.pako) {
        console.warn("Pako not loaded");
        return new Uint16Array(0);
    }
    try {
        const compressed = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
        const rawBytes = window.pako.inflate(compressed).buffer;
        return new Uint16Array(rawBytes);
    } catch (err) {
        console.error("Decompression error:", err);
        return new Uint16Array(0);
    }
}

// ─── Niederschlag → Farbe ─────────────────────────────────────────────────────

function precipitationToRgba(precip: number): [number, number, number, number] {
    const val = Math.min(precip, 250) / 250;

    let r: number, g: number, b: number;
    if (val < 0.2) {
        r = 0;   g = Math.round(100 + 155 * (val / 0.2)); b = 255;
    } else if (val < 0.4) {
        const t = (val - 0.2) / 0.2;
        r = 0;   g = 255; b = Math.round(255 * (1 - t));
    } else if (val < 0.6) {
        const t = (val - 0.4) / 0.2;
        r = Math.round(255 * t); g = 255; b = 0;
    } else if (val < 0.8) {
        const t = (val - 0.6) / 0.2;
        r = 255; g = Math.round(255 * (1 - t * 0.35)); b = 0;
    } else {
        const t = (val - 0.8) / 0.2;
        r = 255; g = Math.round(165 * (1 - t)); b = 0;
    }

    const alpha = Math.max(Math.min(val * 200, 255), precip > 0 ? 80 : 0);
    return [r, g, b, alpha];
}

// ─── Canvas-Bild ──────────────────────────────────────────────────────────────

function makeCanvasImage(record: RadarRecord, width: number, height: number): string {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(width, height);
    const precip = decompress(record.precipitation_5);

    const maxIdx = Math.min(precip.length, imageData.data.length / 4);
    for (let idx = 0; idx < maxIdx; idx++) {
        const [r, g, b, a] = precipitationToRgba(precip[idx]);
        const base = idx * 4;
        imageData.data[base]     = r;
        imageData.data[base + 1] = g;
        imageData.data[base + 2] = b;
        imageData.data[base + 3] = a;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

// ─── Frame-Controller ─────────────────────────────────────────────────────────

function createFrameControl(
    map: L.Map,
    frames: RadarFrame[],
    rawRecords: RadarRecord[],
    gridWidth: number,
    gridHeight: number,
    scope: Element | Document,
): void {
    const forecastStartIdx = frames.findIndex((f) => f.isForecast);
    let currentFrameIdx = Math.max(0, forecastStartIdx > 0 ? forecastStartIdx - 1 : 0);
    let isPlaying = false;
    let animationInterval: ReturnType<typeof setInterval> | null = null;
    let currentLayer: L.ImageOverlay | null = null;

    const radarBounds: L.LatLngBoundsExpression = [
        [49.5, 2.5],
        [55.5, 17.5],
    ];

    const showFrame = (idx: number): void => {
        idx = Math.max(0, Math.min(idx, frames.length - 1));
        currentFrameIdx = idx;

        if (currentLayer && map.hasLayer(currentLayer)) {
            map.removeLayer(currentLayer);
        }

        const frame = frames[idx];

        // Bug 4: Canvas lazy rendern – nur beim ersten Anzeigen dieses Frames
        if (!frame.imageUrl) {
            frame.imageUrl = makeCanvasImage(rawRecords[idx], gridWidth, gridHeight);
        }

        currentLayer = window.L.imageOverlay(frame.imageUrl, radarBounds, {
            opacity: 0.8,
            zIndex: 10,
            attribution: "Bright Sky / DWD",
        });
        currentLayer.addTo(map);

        // Bug 7: scope-relative Selektoren
        const timestampEl = scope.querySelector<HTMLElement>("[data-radar-timestamp]");
        if (timestampEl) {
            const label = frame.isForecast ? "🔮 Vorhersage" : "📡 Radar";
            const dateStr = frame.dateTime.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
            const timeStr = frame.dateTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
            timestampEl.textContent = `${label}: ${dateStr} ${timeStr}`;
        }

        const currentTimeEl = scope.querySelector<HTMLElement>("[data-radar-current-time]");
        if (currentTimeEl) {
            const weekday = frame.dateTime.toLocaleDateString("de-DE", { weekday: "short" });
            const dateStr = frame.dateTime.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
            const timeStr = frame.dateTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
            currentTimeEl.textContent = `${frame.isForecast ? "🔮" : "📡"} ${weekday}, ${dateStr} · ${timeStr} Uhr`;
        }

        const progressEl = scope.querySelector<HTMLElement>("[data-radar-progress]");
        if (progressEl) {
            progressEl.style.width = `${frames.length > 1 ? (idx / (frames.length - 1)) * 100 : 0}%`;
        }

        if (forecastStartIdx > 0) {
            const forecastProgressEl = scope.querySelector<HTMLElement>("[data-radar-progress-forecast]");
            if (forecastProgressEl) {
                const forecastRangeStart = (forecastStartIdx / (frames.length - 1)) * 100;
                const currentProgress = (idx / (frames.length - 1)) * 100;
                if (currentProgress > forecastRangeStart) {
                    forecastProgressEl.style.width = `${currentProgress - forecastRangeStart}%`;
                    forecastProgressEl.style.left = `${forecastRangeStart}%`;
                } else {
                    forecastProgressEl.style.width = "0%";
                }
            }
        }
    };

    const startAnimation = (): void => {
        if (isPlaying) return;
        isPlaying = true;

        const iconEl = scope.querySelector<HTMLElement>("[data-radar-icon]");
        if (iconEl) { iconEl.textContent = "⏸"; iconEl.style.color = "black"; }

        const toggleBtn = scope.querySelector<HTMLElement>("[data-radar-toggle]");
        if (toggleBtn) {
            toggleBtn.classList.remove("bg-blue-600", "hover:bg-blue-700");
            toggleBtn.classList.add("bg-neutral-300", "hover:bg-neutral-400");
        }

        if (currentFrameIdx >= frames.length - 1) currentFrameIdx = 0;

        animationInterval = setInterval(() => {
            currentFrameIdx = (currentFrameIdx + 1) % frames.length;
            showFrame(currentFrameIdx);
        }, 700);
    };

    const stopAnimation = (): void => {
        if (!isPlaying) return;
        isPlaying = false;

        const iconEl = scope.querySelector<HTMLElement>("[data-radar-icon]");
        if (iconEl) { iconEl.textContent = "▶"; iconEl.style.color = ""; }

        const toggleBtn = scope.querySelector<HTMLElement>("[data-radar-toggle]");
        if (toggleBtn) {
            toggleBtn.classList.remove("bg-neutral-300", "hover:bg-neutral-400");
            toggleBtn.classList.add("bg-blue-600", "hover:bg-blue-700");
        }

        if (animationInterval !== null) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    };

    window.radarJumpToFrame = (frameIndex: number): void => {
        if (window.stopRadarAnimation) {
            stopAnimation();
            window.stopRadarAnimation = false;
        }
        showFrame(frameIndex);
    };

    // Bug 11: stopAnimation für setupRadar zugänglich machen
    const mapEl = document.getElementById(map.getContainer().id);
    if (mapEl) (mapEl as any)._radarStopAnimation = stopAnimation;

    scope.querySelectorAll<HTMLElement>("[data-radar-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (isPlaying) stopAnimation();
            else startAnimation();
        });
    });

    showFrame(currentFrameIdx);
}



