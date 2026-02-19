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

    return new Promise((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => resolve();
        document.head.appendChild(script);
    });
}

function ensurePako(): Promise<void> {
    if (window.pako) return Promise.resolve();

    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/pako@2.1.0/dist/pako.min.js";
        script.onload = () => resolve();
        document.head.appendChild(script);
    });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

async function setupRadar(mapElementId: string): Promise<void> {
    const mapContainer = document.getElementById(mapElementId);
    if (!mapContainer) return;
    await loadAndDisplayRadar(mapContainer);
}

async function loadAndDisplayRadar(mapContainer: HTMLElement): Promise<void> {
    const timestampEl = mapContainer.parentElement?.querySelector<HTMLElement>(
        "[data-radar-timestamp]"
    );

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

    // Leaflet-Zoom-Buttons auf niedrigen z-index setzen,
    // damit sie beim Scrollen nicht über den Modal-Content ragen
    map.whenReady(() => {
        const zoomControl = mapContainer.querySelector<HTMLElement>(".leaflet-control-container");
        if (zoomControl) {
            zoomControl.style.zIndex = "9";
        }
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
    const frames: RadarFrame[] = [];

    for (const record of data.radar) {
        try {
            const dateTime = new Date(record.timestamp);
            const isForecast = dateTime > now;
            const imageUrl = makeCanvasImage(record, gridWidth, gridHeight);

            frames.push({
                timestamp: Math.floor(dateTime.getTime() / 1000),
                dateTime,
                isForecast,
                imageUrl,
                label: dateTime.toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                }),
            });
        } catch {
            // Fehlerhaften Frame überspringen
        }
    }

    if (frames.length === 0) {
        if (timestampEl) timestampEl.textContent = "Keine Frames verarbeitet";
        return;
    }

    createFrameControl(map, frames);
    initTimeline(frames);
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function initTimeline(frames: RadarFrame[]): void {
    const timelineEl = document.querySelector<HTMLElement>("[data-radar-timeline]");
    if (!timelineEl) return;

    const forecastStartIdx = frames.findIndex((f) => f.isForecast);
    const nowPercentage =
        forecastStartIdx > 0 ? (forecastStartIdx / (frames.length - 1)) * 100 : null;

    // Container braucht position:relative für absolute Labels
    timelineEl.style.position = "relative";
    timelineEl.style.height = "28px"; // Platz für Labels + "jetzt"-Marker
    timelineEl.innerHTML = "";

    // 5 Labels an exakt berechneten Positionen platzieren
    const numLabels = 5;
    for (let i = 0; i < numLabels; i++) {
        const frameIndex = Math.round((i / (numLabels - 1)) * (frames.length - 1));
        const frame = frames[frameIndex];
        const leftPct = (frameIndex / (frames.length - 1)) * 100;

        const timeStr = frame.dateTime.toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
        });

        // Erstes Label linksbündig, letztes rechtsbündig, Rest zentriert
        const transform =
            i === 0 ? "translateX(0)" :
            i === numLabels - 1 ? "translateX(-100%)" :
            "translateX(-50%)";

        const span = document.createElement("span");
        span.style.cssText = `
            position: absolute;
            left: ${leftPct}%;
            top: 0;
            transform: ${transform};
            font-size: 10px;
            white-space: nowrap;
            color: #9CA3AF;
            pointer-events: none;
        `;
        span.textContent = timeStr;
        timelineEl.appendChild(span);
    }

    // „Jetzt"-Marker als grüne senkrechte Linie mit Label
    if (nowPercentage !== null) {
        const marker = document.createElement("div");
        marker.setAttribute("data-now-marker", "true");
        marker.innerHTML = `
            <div style="
                position: absolute; left: ${nowPercentage}%;
                top: -20px; height: 20px; width: 2px;
                background: #10b981; transform: translateX(-50%);
                opacity: 0.7; pointer-events: none;
            "></div>
            <span style="
                position: absolute; left: ${nowPercentage}%;
                top: 12px; transform: translateX(-50%);
                font-size: 10px; color: #10b981;
                font-weight: bold; white-space: nowrap;
                pointer-events: none;
            ">jetzt</span>`;
        timelineEl.appendChild(marker);
    }

    // Fortschrittsbalken-Interaktion
    const progressContainer =
        document.querySelector<HTMLElement>("[data-radar-progress]")?.parentElement ?? null;
    if (!progressContainer) return;

    // Styles einmalig injizieren
    if (!document.getElementById("radar-toggler-style")) {
        const style = document.createElement("style");
        style.id = "radar-toggler-style";
        style.textContent = `
            [data-radar-progress-forecast] {
                position: absolute; top: 0; left: 0; height: 100%;
                background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
                z-index: 5; transition: width 0.1s ease-out;
            }
            [data-radar-progress]::after {
                content: ''; position: absolute; top: 50%; right: 0;
                width: 16px; height: 16px; margin-top: -8px; margin-right: -8px;
                background: white; border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0,0,0,.3);
                cursor: grab; z-index: 20; transition: box-shadow .2s;
            }
            [data-radar-progress]:active::after {
                cursor: grabbing; box-shadow: 0 4px 12px rgba(0,0,0,.4);
            }`;
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

    progressContainer.addEventListener("mousedown", (e) => {
        isDragging = true;
        updateFrameFromX(e.clientX);
    });
    progressContainer.addEventListener("mousemove", (e) => {
        if (isDragging) updateFrameFromX(e.clientX);
    });
    progressContainer.addEventListener("touchstart", (e) => {
        isDragging = true;
        updateFrameFromX(e.touches[0].clientX);
    });
    progressContainer.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        e.preventDefault();
        updateFrameFromX(e.touches[0].clientX);
    });
    progressContainer.addEventListener("click", (e) => updateFrameFromX(e.clientX));
    document.addEventListener("mouseup", () => { isDragging = false; });
    document.addEventListener("touchend", () => { isDragging = false; });
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

function createFrameControl(map: L.Map, frames: RadarFrame[]): void {
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
        currentLayer = window.L.imageOverlay(frame.imageUrl, radarBounds, {
            opacity: 0.8,
            zIndex: 10,
            attribution: "Bright Sky / DWD",
        });
        currentLayer.addTo(map);

        // Zeitstempel-Label auf der Karte (links unten)
        const timestampEl = document.querySelector<HTMLElement>("[data-radar-timestamp]");
        if (timestampEl) {
            const label = frame.isForecast ? "🔮 Vorhersage" : "📡 Radar";
            const dateStr = frame.dateTime.toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
            });
            const timeStr = frame.dateTime.toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
            });
            timestampEl.textContent = `${label}: ${dateStr} ${timeStr}`;
        }

        // Aktuelle Frame-Zeit über dem Fortschrittsbalken
        const currentTimeEl = document.querySelector<HTMLElement>("[data-radar-current-time]");
        if (currentTimeEl) {
            const weekday = frame.dateTime.toLocaleDateString("de-DE", { weekday: "short" });
            const dateStr = frame.dateTime.toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
            });
            const timeStr = frame.dateTime.toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
            });
            const icon = frame.isForecast ? "🔮" : "📡";
            currentTimeEl.textContent = `${icon} ${weekday}, ${dateStr} · ${timeStr} Uhr`;
        }

        // Blauer Fortschrittsbalken
        const progressEl = document.querySelector<HTMLElement>("[data-radar-progress]");
        if (progressEl) {
            const progress = frames.length > 1 ? (idx / (frames.length - 1)) * 100 : 0;
            progressEl.style.width = `${progress}%`;
        }

        // Gelber Vorhersage-Fortschrittsbalken
        if (forecastStartIdx > 0) {
            const forecastProgressEl = document.querySelector<HTMLElement>(
                "[data-radar-progress-forecast]"
            );
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

        const iconEl = document.querySelector<HTMLElement>("[data-radar-icon]");
        if (iconEl) { iconEl.textContent = "⏸"; iconEl.style.color = "black"; }

        const toggleBtn = document.querySelector<HTMLElement>("[data-radar-toggle]");
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

        const iconEl = document.querySelector<HTMLElement>("[data-radar-icon]");
        if (iconEl) { iconEl.textContent = "▶"; iconEl.style.color = ""; }

        const toggleBtn = document.querySelector<HTMLElement>("[data-radar-toggle]");
        if (toggleBtn) {
            toggleBtn.classList.remove("bg-neutral-300", "hover:bg-neutral-400");
            toggleBtn.classList.add("bg-blue-600", "hover:bg-blue-700");
        }

        if (animationInterval !== null) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    };

    // Globale jumpToFrame-Funktion (wird von der Timeline genutzt)
    window.radarJumpToFrame = (frameIndex: number): void => {
        if (window.stopRadarAnimation) {
            stopAnimation();
            window.stopRadarAnimation = false;
        }
        showFrame(frameIndex);
    };

    // Play/Pause-Button verdrahten
    document.querySelectorAll<HTMLElement>("[data-radar-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (isPlaying) stopAnimation();
            else startAnimation();
        });
    });

    // Ersten Frame anzeigen
    showFrame(currentFrameIdx);
}



