// Wetter-Hilfsfunktionen und Wettervorhersage-UI

export function weatherCodeToEmoji(code: number | null): string {
    if (code === null || code === undefined) return "🌥️";
    if (code === 0) return "☀️";
    if (code <= 2) return "🌤️";
    if (code <= 3) return "☁️";
    if (code >= 45 && code <= 48) return "🌫️";
    if (code >= 51 && code <= 67) return "🌧️";
    if (code >= 71 && code <= 77) return "❄️";
    if (code >= 80 && code <= 82) return "🌦️";
    if (code >= 95) return "⛈️";
    return "🌥️";
}

export function windDirection(deg: number | null | undefined): string {
    if (deg === null || deg === undefined) return "–";
    const dirs = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
    return dirs[Math.round(deg / 45) % 8];
}

export function windArrow(deg: number | null | undefined): string {
    if (deg === null || deg === undefined) return "•";
    if (deg >= 337.5 || deg < 22.5) return "↑";
    if (deg < 67.5) return "↗";
    if (deg < 112.5) return "→";
    if (deg < 157.5) return "↘";
    if (deg < 202.5) return "↓";
    if (deg < 247.5) return "↙";
    if (deg < 292.5) return "←";
    return "↖";
}

export function formatTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatDateWithDay(date: Date): string {
    const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const day = dayNames[date.getDay()];
    const dateStr = `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
    return `${dateStr} ${day}`;
}

// ─── Wetter-API Typen ─────────────────────────────────────────────────────────

interface HourlyWeather {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation: number[];
    precipitation_probability: number[];
    uv_index: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
}

interface Minutely15Weather {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
}

export interface WeatherData {
    current: {
        temperature_2m: number;
        apparent_temperature?: number;
        weather_code: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
    };
    hourly?: HourlyWeather;
    minutely_15?: Minutely15Weather;
}

// ─── Wettervorhersage-Karten rendern ─────────────────────────────────────────

export function renderWeatherForecast(weather: WeatherData, rangeKey = "2h"): void {
    const forecastEl = document.querySelector("[data-forecast]");
    if (!forecastEl) return;

    const hourly = weather?.hourly;
    const minutely = weather?.minutely_15;
    const useMinutely = rangeKey === "2h" && Array.isArray(minutely?.temperature_2m);

    const getSeries = <T>(key: keyof HourlyWeather & keyof Minutely15Weather): T[] => {
        if (useMinutely && minutely && Array.isArray(minutely[key])) {
            return minutely[key] as unknown as T[];
        }
        if (hourly && Array.isArray(hourly[key])) {
            return hourly[key] as unknown as T[];
        }
        return [];
    };

    const temps = getSeries<number>("temperature_2m");
    const codes = getSeries<number>("weather_code");
    const precip = getSeries<number>("precipitation");
    const precipProb = getSeries<number>("precipitation_probability");
    // uv_index nur in hourly verfügbar (nicht in minutely_15)
    const uv: number[] = hourly?.uv_index ?? [];
    const wind = getSeries<number>("wind_speed_10m");
    const windDir = getSeries<number>("wind_direction_10m");

    // Zeitstempel-Array direkt aus der API (ISO-Strings)
    const times: string[] = (useMinutely ? minutely?.time : hourly?.time) ?? [];
    const hourlyTimes: string[] = hourly?.time ?? [];

    // Open-Meteo liefert Zeitstempel ohne TZ-Suffix (z.B. "2026-03-08T14:00").
    // new Date("2026-03-08T14:00") wird laut ECMAScript-Spec als UTC interpretiert → falscher Index.
    // Deshalb: manuell parsen und als Lokalzeit behandeln (cross-browser-sicher).
    const parseLocalTime = (s: string): number => {
        const [datePart, timePart = "00:00"] = s.split("T");
        const [year, month, day] = datePart.split("-").map(Number);
        const [hour, minute = 0] = timePart.split(":").map(Number);
        return new Date(year, month - 1, day, hour, minute).getTime();
    };

    // Hilfsfunktion: letzten Index suchen, dessen Zeitstempel <= jetzt
    const findStartIndex = (timesArr: string[]): number => {
        const now = Date.now();
        let idx = 0;
        for (let k = 0; k < timesArr.length; k++) {
            if (parseLocalTime(timesArr[k]) <= now) idx = k;
            else break;
        }
        return idx;
    };

    const startIndex = findStartIndex(times);
    // Separater hourly-Startindex für UV (uv_index ist nur in hourly verfügbar)
    const hourlyStartIndex = useMinutely ? findStartIndex(hourlyTimes) : startIndex;

    // Schrittweite je nach Bereich
    let step: number;
    let count: number;
    if (rangeKey === "2h") {
        step = useMinutely ? 2 : 1;   // 2×15min = 30min  oder  1h
        count = 4;
    } else if (rangeKey === "6h") {
        step = useMinutely ? 8 : 2;   // 8×15min = 2h     oder  2h
        count = 4;
    } else if (rangeKey === "12h") {
        step = useMinutely ? 16 : 4;  // 16×15min = 4h    oder  4h
        count = 4;
    } else {
        // 48h – immer hourly, Schrittweite 12h
        step = 12;
        count = 4;
    }

    const indices = Array.from({ length: count }, (_, n) => startIndex + n * step);
    // Für UV immer hourly-Schrittweite (1h), unabhängig von minutely
    const hourlyStep = useMinutely ? 1 : step;
    const hourlyIndices = Array.from({ length: count }, (_, n) => hourlyStartIndex + n * hourlyStep);

    const showDate = rangeKey !== "2h";

    forecastEl.innerHTML = indices
        .map((i, n) => {
            const hi = hourlyIndices[n]; // hourly-Index für UV
            const t = i < temps.length ? temps[i] : null;
            const code = i < codes.length ? codes[i] : null;
            const p = i < precip.length ? precip[i] : 0;
            const pp = i < precipProb.length ? precipProb[i] : null;
            const uvIndex = hi < uv.length ? uv[hi] : null;
            const w = i < wind.length ? wind[i] : null;
            const wd = i < windDir.length ? windDir[i] : null;

            const emoji = weatherCodeToEmoji(code);
            // Zeit direkt aus dem API-Zeitstempel lesen (als Lokalzeit parsen)
            const time = i < times.length ? new Date(parseLocalTime(times[i])) : new Date();

            const isRain = (code !== null && code >= 51) || p > 0.1;

            const rainLine = isRain
                ? `🌧️ ${pp !== null ? `${pp}%` : "–"} · ${p.toFixed(1)} mm`
                : "";
            // UV nur anzeigen wenn tatsächlich > 0 (tagsüber und nicht nachts/0-Wert)
            const uvLine = (uvIndex !== null && uvIndex > 0)
                ? `☀️ UV ${uvIndex.toFixed(1)}`
                : "";
            const windLine = `💨 ${w !== null ? w.toFixed(0) : "–"} km/h ${windArrow(wd)} ${windDirection(wd)}`;

            const timeDisplay = showDate
                ? `<div class="font-barlow text-xs text-neutral-400">${formatDateWithDay(time)}</div>
                   <div class="font-barlow text-xs text-neutral-500">${formatTime(time)}</div>`
                : `<div class="font-barlow text-xs text-neutral-500">${formatTime(time)}</div>`;

            return `<div class="text-center bg-white rounded-lg p-3">
                ${timeDisplay}
                <div class="font-albert text-xl font-bold">${t !== null ? t.toFixed(0) : "–"}°C</div>
                <div class="font-barlow text-lg mt-1">${emoji}</div>
                ${rainLine ? `<div class="font-barlow text-xs text-blue-700 mt-1">${rainLine}</div>` : ""}
                ${uvLine ? `<div class="font-barlow text-xs text-yellow-700 mt-1">${uvLine}</div>` : ""}
                <div class="font-barlow text-xs text-neutral-600 mt-1">${windLine}</div>
            </div>`;
        })
        .join("");
}


