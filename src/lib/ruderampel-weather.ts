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
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
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
        weather_code: number;
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

    let indices: number[];
    if (rangeKey === "2h") {
        indices = useMinutely ? [0, 2, 4, 6] : [0, 1, 2, 3];
    } else if (rangeKey === "6h") {
        indices = [0, 2, 4, 6];
    } else if (rangeKey === "12h") {
        indices = [0, 4, 8, 12];
    } else {
        const maxIndex = Math.min(temps.length - 1, 47);
        indices = [0, 12, 24, Math.max(36, maxIndex)];
    }

    const showDate = rangeKey !== "2h";

    forecastEl.innerHTML = indices
        .map((i) => {
            const t = i < temps.length ? temps[i] : null;
            const code = i < codes.length ? codes[i] : null;
            const p = i < precip.length ? precip[i] : 0;
            const pp = i < precipProb.length ? precipProb[i] : null;
            const uvIndex = i < uv.length ? uv[i] : null;
            const w = i < wind.length ? wind[i] : null;
            const wd = i < windDir.length ? windDir[i] : null;

            const emoji = weatherCodeToEmoji(code);
            const time = new Date();
            if (useMinutely) {
                time.setMinutes(time.getMinutes() + i * 15);
            } else {
                time.setHours(time.getHours() + i);
                time.setMinutes(0, 0, 0);
            }

            const isRain = (code !== null && code >= 51) || p > 0.1;
            const isSunny = code === 0 || code === 1 || code === 2;

            const rainLine = isRain
                ? `🌧️ ${pp !== null ? `${pp}%` : "–"} · ${p.toFixed(1)} mm`
                : "";
            const uvLine = isSunny
                ? `☀️ UV ${uvIndex !== null ? uvIndex.toFixed(1) : "–"}`
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


