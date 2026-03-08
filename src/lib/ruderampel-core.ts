// Hauptlogik der Ruderampel: API, ARIMAX-Prognose, UI-Steuerung

import { drawChart, type MeasurementPoint, type ForecastPoint, type HourlyForecastPoint } from "./ruderampel-chart";
import { renderWeatherForecast, type WeatherData } from "./ruderampel-weather";

// ─── Konstanten ───────────────────────────────────────────────────────────────

const API = "https://www.pegelonline.wsv.de/webservices/rest-api/v2";
const STATION = "32807065-b887-49f0-935a-80033e5f3cb0";
const WEATHER = "https://api.open-meteo.com/v1/forecast";
const FLOOD = 360;

// ─── Zustand ──────────────────────────────────────────────────────────────────

let measurements: MeasurementPoint[] = [];
let isModalOpen = false;

// ─── UI-Farbe setzen ──────────────────────────────────────────────────────────

function setColor(c: "red" | "yellow" | "green" | "unknown", isOverlay: boolean): void {
    const dot = document.querySelector<HTMLElement>("[data-ampel-dot]");
    const button = document.querySelector<HTMLElement>("[data-ampel-button]");
    const miniLights = Array.from(document.querySelectorAll<HTMLElement>("[data-ampel-mini-light]"));

    if (dot) {
        dot.classList.remove("bg-neutral-300", "bg-red-500", "bg-yellow-400", "bg-green-500");
        if (c === "red") dot.classList.add("bg-red-500");
        else if (c === "yellow") dot.classList.add("bg-yellow-400");
        else if (c === "green") dot.classList.add("bg-green-500");
        else dot.classList.add("bg-neutral-300");
    }

    miniLights.forEach((light) => {
        light.classList.remove("bg-red-500", "bg-yellow-400", "bg-green-500");
        light.classList.add("bg-neutral-400/50");
    });
    const active = miniLights.find((l) => l.getAttribute("data-ampel-mini-light") === c);
    if (active) {
        active.classList.remove("bg-neutral-400/50");
        if (c === "red") active.classList.add("bg-red-500");
        else if (c === "yellow") active.classList.add("bg-yellow-400");
        else if (c === "green") active.classList.add("bg-green-500");
    }

    if (isOverlay && button) {
        button.classList.remove("ring-red-400/70", "ring-yellow-300/70", "ring-green-400/70");
        if (c === "red") button.classList.add("ring-red-400/70");
        else if (c === "yellow") button.classList.add("ring-yellow-300/70");
        else if (c === "green") button.classList.add("ring-green-400/70");
    }

    // Ampel-Lichter im Modal
    const lights = {
        red: document.querySelector<HTMLElement>('[data-light="red"]'),
        yellow: document.querySelector<HTMLElement>('[data-light="yellow"]'),
        green: document.querySelector<HTMLElement>('[data-light="green"]'),
    };
    Object.values(lights).forEach((l) => {
        if (l) {
            l.classList.remove("bg-red-500", "bg-yellow-400", "bg-green-500");
            l.classList.add("bg-neutral-500/40");
        }
    });
    const activeLamp = lights[c as keyof typeof lights];
    if (activeLamp) {
        activeLamp.classList.remove("bg-neutral-500/40");
        if (c === "red") activeLamp.classList.add("bg-red-500");
        else if (c === "yellow") activeLamp.classList.add("bg-yellow-400");
        else if (c === "green") activeLamp.classList.add("bg-green-500");
    }
}

// ─── ARIMAX-Pegelprognose ─────────────────────────────────────────────────────

function computeArimaxForecast(
    series: number[],
    precipitation: number[],
): HourlyForecastPoint[] {
    const lookback = Math.min(48, series.length);
    const s = series.slice(-lookback);
    const n = s.length;

    // Lineare Regression (Trend)
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += i; sumY += s[i]; sumXY += i * s[i]; sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const detrended = s.map((v, i) => v - (intercept + slope * i));

    // ACF und AR(3)-Koeffizienten (Yule-Walker vereinfacht)
    const mean = detrended.reduce((a, b) => a + b, 0) / detrended.length;
    const acf = [0, 1, 2, 3].map((lag) => {
        let sum = 0, cnt = 0;
        for (let i = lag; i < detrended.length; i++) {
            sum += (detrended[i] - mean) * (detrended[i - lag] - mean);
            cnt++;
        }
        return cnt > 0 ? sum / cnt : 0;
    });
    const phi1 = acf[0] !== 0 ? acf[1] / acf[0] : 0.5;
    const phi2 = acf[0] !== 0 ? (acf[2] - phi1 * acf[1]) / acf[0] : 0.3;
    const phi3 = acf[0] !== 0 ? (acf[3] - phi1 * acf[2] - phi2 * acf[1]) / acf[0] : 0.15;

    // MA(1) Residual
    const residuals: number[] = [];
    for (let i = 3; i < detrended.length; i++) {
        residuals.push(
            detrended[i] - (phi1 * detrended[i - 1] + phi2 * detrended[i - 2] + phi3 * detrended[i - 3])
        );
    }
    const theta = 0.5;

    // Unit Hydrograph (Nash-Modell)
    const k = 3;
    const unitHydrograph = (t: number) => (t <= 0 ? 0 : (1 / k) * Math.exp(-t / k));

    const lastValue = s[s.length - 1];
    const recentValues = s.slice(-6);
    const shortTermSlope =
        recentValues.length >= 2
            ? (recentValues[recentValues.length - 1] - recentValues[0]) / (recentValues.length - 1)
            : slope;
    const lastDetrended = detrended.slice(-3);
    let lastResidual = residuals.length > 0 ? residuals[residuals.length - 1] : 0;

    const hourlyForecast: HourlyForecastPoint[] = [];

    for (let h = 1; h <= 24; h++) {
        const trendWeight = Math.exp(-0.08 * h);
        const longTrend = intercept + slope * (n + h - 1);
        const shortTrend = lastValue + shortTermSlope * h;
        const trendComponent = shortTrend * trendWeight + longTrend * (1 - trendWeight);
        const nearTermDamping = 1 - 0.6 * trendWeight;

        const arDecay = Math.exp(-0.05 * h);
        const arComponent =
            arDecay *
            (phi1 * (lastDetrended[lastDetrended.length - 1] ?? 0) +
                phi2 * (lastDetrended[lastDetrended.length - 2] ?? 0) +
                phi3 * (lastDetrended[lastDetrended.length - 3] ?? 0)) *
            nearTermDamping;

        const maComponent = theta * lastResidual * Math.exp(-0.2 * h) * nearTermDamping;

        let rainComponent = 0;
        for (let t = 0; t < h && t < precipitation.length; t++) {
            rainComponent += (precipitation[t] ?? 0) * unitHydrograph(h - t) * 4.0;
        }

        const longTermMean = s.reduce((a, b) => a + b, 0) / s.length;
        const meanReversion =
            0.01 * (longTermMean - lastValue) * (h / 24) * (1 - trendWeight);

        let value = trendComponent + arComponent + maComponent + rainComponent + meanReversion;
        value = Math.max(50, value);
        value = Math.min(lastValue + h * 10, Math.max(lastValue - h * 5, value));

        if (h <= 6 && Math.abs(shortTermSlope) >= 0.5) {
            const minFollow = lastValue + shortTermSlope * h * 0.5;
            value = shortTermSlope > 0 ? Math.max(value, minFollow) : Math.min(value, minFollow);
        }

        lastDetrended.push(value - (intercept + slope * (n + h - 1)));
        lastDetrended.shift();
        lastResidual *= 0.85;

        hourlyForecast.push({ hours: h, value, trend: trendComponent, ar: arComponent, rain: rainComponent });
    }

    return hourlyForecast;
}

// ─── Einzugsgebiets-Niederschlag ─────────────────────────────────────────────

interface CatchmentPoint {
    name: string;
    lat: number;
    lon: number;
    weight: number;
    data: { hourly: { precipitation: number[] } };
}

async function fetchCatchmentPrecipitation(): Promise<number[] | null> {
    const catchmentPoints = [
        { name: "Marburg",    lat: 50.809, lon: 8.774, weight: 0.25 },
        { name: "Gießen",     lat: 50.585, lon: 8.678, weight: 0.30 },
        { name: "Wetzlar",    lat: 50.557, lon: 8.501, weight: 0.25 },
        { name: "Dillenburg", lat: 50.742, lon: 8.287, weight: 0.20 },
    ];

    try {
        const results = await Promise.all(
            catchmentPoints.map(async (p) => {
                const url = `${WEATHER}?latitude=${p.lat}&longitude=${p.lon}&timezone=Europe%2FBerlin&hourly=precipitation&forecast_days=2`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                return { ...p, data } as CatchmentPoint;
            })
        );

        const valid = results.filter((r): r is CatchmentPoint => r !== null);
        if (valid.length === 0) return null;

        const totalWeight = valid.reduce((s, r) => s + r.weight, 0);
        const length = valid[0].data.hourly.precipitation.length;
        const area: number[] = [];
        for (let h = 0; h < length; h++) {
            let weighted = 0;
            for (const p of valid) {
                weighted += (p.data.hourly.precipitation[h] ?? 0) * (p.weight / totalWeight);
            }
            area.push(weighted);
        }
        return area;
    } catch {
        return null;
    }
}

// ─── Haupt-Load-Funktion ──────────────────────────────────────────────────────

async function load(isOverlay: boolean): Promise<void> {
    try {
        // Station + Wetter parallel laden
        const [stationRes, weatherRes] = await Promise.all([
            fetch(`${API}/stations/${STATION}.json?includeTimeseries=true&includeCurrentMeasurement=true`),
            fetch(`${WEATHER}?latitude=50.585&longitude=8.678&timezone=Europe%2FBerlin&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code,precipitation,precipitation_probability,uv_index,wind_speed_10m,wind_direction_10m&minutely_15=temperature_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m&forecast_days=2`),
        ]);

        if (!stationRes.ok) throw new Error(`Station API ${stationRes.status}`);
        if (!weatherRes.ok) throw new Error(`Weather API ${weatherRes.status}`);

        const [station, weather] = await Promise.all([stationRes.json(), weatherRes.json()]) as [any, WeatherData];

        // Einzugsgebiet-Niederschlag (non-blocking)
        const catchmentPrecipitation = await fetchCatchmentPrecipitation();

        // Pegel + Temperatur extrahieren
        const levelTs = station.timeseries?.find((t: any) => t.shortname === "W");
        const tempTs  = station.timeseries?.find((t: any) =>
            t.longname?.toLowerCase().includes("wassertemperatur") ||
            t.longname?.toLowerCase().includes("wasser-temperatur") ||
            ["WT", "TW", "WTEMP", "WASSER_TEMP", "W_TEMP"].includes(t.shortname?.toUpperCase())
        );
        const level        = levelTs?.currentMeasurement?.value ?? 0;
        const temp         = tempTs?.currentMeasurement?.value ?? null;
        const tempIsFallback = temp === null;
        const tempValue = temp ?? 5;

        const status = level >= FLOOD || tempValue < 1 ? "red" : tempValue < 10 ? "yellow" : "green";
        setColor(status, isOverlay);

        const dot = document.querySelector<HTMLElement>("[data-ampel-dot]");
        dot?.classList.remove("animate-pulse");

        // Status-UI aktualisieren
        const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
        const levelEl   = q("[data-level]");
        const trendEl   = q("[data-trend]");
        const tempEl    = q("[data-temp]");
        const airTempEl = q("[data-air-temp]");
        const weatherEl = q("[data-weather]");
        const timeEl    = q("[data-time]");
        const alert     = q("[data-status-alert]");
        const statusTitle = q("[data-status-title]");
        const hint      = q("[data-hint]");

        if (levelEl)   levelEl.textContent   = `${Math.round(level)} cm`;
        if (trendEl)   trendEl.textContent   = "Lade...";
        if (tempEl)    tempEl.textContent    = tempIsFallback ? "n/v" : `${tempValue.toFixed(1)}°C`;
        if (airTempEl) {
            const airT = weather.current.temperature_2m;
            const feelT = weather.current.apparent_temperature;
            airTempEl.textContent = `${airT.toFixed(1)}°C`;
            const feelEl = airTempEl.nextElementSibling as HTMLElement | null;
            if (feelEl) {
                feelEl.textContent = (feelT !== undefined && feelT !== null && Math.abs(feelT - airT) >= 1)
                    ? `gefühlt ${feelT.toFixed(1)}°C`
                    : "";
            }
        }
        if (timeEl)    timeEl.textContent    = new Date().toLocaleString("de-DE");

        const weatherCode = weather.current.weather_code;
        if (weatherEl) {
            weatherEl.textContent =
                weatherCode >= 95 ? "⛈️ Gewitter" :
                weatherCode >= 80 ? "🌦️ Schauer" :
                weatherCode >= 71 ? "❄️ Schnee" :
                weatherCode >= 51 ? "🌧️ Regen" :
                weatherCode >= 45 ? "🌫️ Nebel" :
                weatherCode >= 3  ? "☁️ Bewölkt" :
                weatherCode >= 1  ? "🌤️ Leicht bewölkt" :
                "☀️ Klar";
        }

        if (alert) {
            alert.className = `rounded-xl p-4 ring-1 ${
                status === "red"    ? "bg-red-50 ring-red-200" :
                status === "yellow" ? "bg-yellow-50 ring-yellow-200" :
                "bg-green-50 ring-green-200"
            }`;
        }
        if (statusTitle) {
            statusTitle.textContent =
                status === "red"    ? "⛔ Wassersportverbot" :
                status === "yellow" ? "⚠️ Eingeschränkter Betrieb" :
                "✅ Normaler Betrieb";
        }
        if (hint) {
            hint.textContent =
                status === "red"
                    ? (level >= FLOOD ? "Hochwasser" : "Wassertemperatur zu kalt")
                    : status === "yellow" ? "Kaltwasser – erhöhte Vorsicht"
                    : "Alle Bedingungen optimal";
            if (tempIsFallback) {
                hint.textContent += " (Wassertemperatur aktuell nicht verfügbar)";
            }
        }

        // Messungen + Prognose laden
        const measureRes = await fetch(`${API}/stations/${STATION}/W/measurements.json?start=PT24H`);
        if (!measureRes.ok) throw new Error(`Measurements API ${measureRes.status}`);
        measurements = await measureRes.json() as MeasurementPoint[];

        // Trend berechnen
        if (measurements.length >= 6) {
            const recent = measurements.slice(-6);
            const changePerHour = (recent[recent.length - 1].value - recent[0].value) / (recent.length - 1);
            const trendEl2 = q("[data-trend]");
            if (trendEl2) {
                if (Math.abs(changePerHour) < 0.5) {
                    trendEl2.textContent = "→ Stagnierend";
                    trendEl2.className = "font-barlow text-xs text-neutral-600 mt-1";
                } else if (changePerHour > 0) {
                    trendEl2.textContent = `↗ Steigend (${changePerHour.toFixed(1)} cm/h)`;
                    trendEl2.className = "font-barlow text-xs text-orange-600 mt-1";
                } else {
                    trendEl2.textContent = `↘ Fallend (${Math.abs(changePerHour).toFixed(1)} cm/h)`;
                    trendEl2.className = "font-barlow text-xs text-green-600 mt-1";
                }
            }
        }

        // Offizielle Pegelonline-Vorhersage versuchen
        let forecastData: ForecastPoint[] | null = null;
        try {
            const forecastTs = station.timeseries?.find((t: any) =>
                t.longname?.toUpperCase().includes("VORHERSAGE") ||
                t.shortname?.toUpperCase() === "PVT"
            );
            if (forecastTs) {
                const fRes = await fetch(`${API}/stations/${STATION}/${forecastTs.shortname}/measurements.json`);
                if (fRes.ok) {
                    const official = await fRes.json();
                    const now = new Date(measurements[measurements.length - 1].timestamp);
                    forecastData = official
                        .filter((f: any) => new Date(f.timestamp) > now)
                        .slice(0, 4)
                        .map((f: any) => ({
                            hours: Math.round((new Date(f.timestamp).getTime() - now.getTime()) / 3_600_000),
                            value: f.value,
                            isOfficial: true,
                        }));
                }
            }
        } catch {
            // keine offizielle Vorhersage
        }

        // ARIMAX als Fallback – auch wenn offizielle Vorhersage leer zurückkam (Bug 4)
        let hourlyForecast: HourlyForecastPoint[] | null = null;
        if ((!forecastData || forecastData.length === 0) && measurements.length >= 24) {
            const series = measurements.map((m) => m.value);
            const precipitation = catchmentPrecipitation ?? weather.hourly?.precipitation ?? [];
            hourlyForecast = computeArimaxForecast(series, precipitation);
            forecastData = [6, 12, 18, 24].map((h) => ({
                hours: h,
                value: hourlyForecast![h - 1].value,
            }));

            const totalRain = precipitation.slice(0, 24).reduce((a, b) => a + b, 0);
            (window as any)._ruderampelHourlyForecast = hourlyForecast;
            (window as any)._ruderampelForecastMethod = "ARIMAX";
            (window as any)._ruderampelRainTotal = totalRain;
            (window as any)._ruderampelRainSource = catchmentPrecipitation ? "Einzugsgebiet Lahn" : "Gießen";
        } else {
            // Offizieller Pfad: hourlyForecast zurücksetzen damit drawChart nicht veraltete ARIMAX-Daten verwendet
            (window as any)._ruderampelHourlyForecast = null;
            (window as any)._ruderampelForecastMethod = "Offiziell";
        }

        // Prognose-Karten rendern
        const waterForecastEl = q("[data-water-forecast]");
        if (waterForecastEl && forecastData) {
            const forecastBaseTime = measurements.length > 0
                ? new Date(measurements[measurements.length - 1].timestamp).getTime()
                : Date.now();
            waterForecastEl.innerHTML = forecastData
                .map((f) => {
                    const time = new Date(forecastBaseTime + f.hours * 3_600_000);
                    const overLimit = f.value >= FLOOD;
                    const nearLimit = f.value >= FLOOD - 50;
                    const color = overLimit ? "text-red-600" : nearLimit ? "text-yellow-600" : "text-green-600";
                    const icon  = overLimit ? "⚠" : nearLimit ? "!" : "✓";
                    return `<div class="text-center bg-white rounded-lg p-3">
                        <div class="font-barlow text-xs text-neutral-500">in ${f.hours}h</div>
                        <div class="font-barlow text-xs text-neutral-400">${String(time.getHours()).padStart(2, "0")}:00</div>
                        <div class="font-albert text-xl font-bold ${color} mt-1">${Math.round(f.value)} cm</div>
                        <div class="font-barlow text-xs ${color} mt-1">${icon}</div>
                    </div>`;
                })
                .join("");

            const hintEl = waterForecastEl.nextElementSibling as HTMLElement | null;
            if (hintEl) {
                if (forecastData[0]?.isOfficial) {
                    hintEl.textContent = "Offizielle Vorhersage von Pegelonline";
                } else {
                    const rainTotal = (window as any)._ruderampelRainTotal ?? 0;
                    const rainSource = (window as any)._ruderampelRainSource ?? "Gießen";
                    hintEl.innerHTML = `Vorhersage: ARIMAX-Modell mit Niederschlagsdaten ${rainSource} (Ø ${(rainTotal as number).toFixed(1)}mm/24h). <strong>⚠️ Bei extremen Wetterereignissen offizielle Hochwasservorhersage RLP beachten!</strong>`;
                }
            }
        }

        // Graph zeichnen
        if (isModalOpen) {
            setTimeout(() => drawChart(measurements, forecastData, hourlyForecast), 100);
        } else {
            (window as any)._ruderampelForecast = forecastData;
        }

        // Wettervorhersage-Karten
        const forecastEl = q("[data-forecast]");
        if (forecastEl && (weather.hourly || weather.minutely_15)) {
            // Aktuelles WeatherData für Listener zugänglich machen
            (window as any)._ruderampelWeather = weather;

            const controls = document.querySelector("[data-forecast-controls]");
            const setActive = (rangeKey: string) => {
                controls?.querySelectorAll("[data-forecast-range]").forEach((btn) => {
                    const active = btn.getAttribute("data-forecast-range") === rangeKey;
                    btn.className = `px-3 py-1.5 rounded-lg text-xs font-barlow font-semibold ${
                        active ? "bg-blue-600 text-white" : "bg-neutral-300 text-neutral-800"
                    }`;
                });
            };
            // Bug 1: Listener nur beim ersten Mal registrieren, nicht bei jedem 5-Min-Reload.
            // Nutzt window._ruderampelWeather damit immer aktuelle Daten verwendet werden.
            if (controls && !(controls as any)._forecastListenerAttached) {
                controls.addEventListener("click", (e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-forecast-range]");
                    if (!target) return;
                    const rangeKey = target.getAttribute("data-forecast-range") ?? "2h";
                    setActive(rangeKey);
                    const currentWeather = (window as any)._ruderampelWeather;
                    if (currentWeather) renderWeatherForecast(currentWeather, rangeKey);
                });
                (controls as any)._forecastListenerAttached = true;
            }
            setActive("2h");
            renderWeatherForecast(weather, "2h");
        }

    } catch (err) {
        console.error("Ruderampel: Fehler beim Laden", err);
        const hint = document.querySelector("[data-hint]");
        if (hint) hint.textContent = `Fehler: ${(err as Error).message}`;
        setColor("unknown", isOverlay);
    }
}

// ─── Öffentliche Init-Funktion ────────────────────────────────────────────────

export function initRuderampel(isOverlay: boolean): void {
    const toggle = document.querySelector<HTMLElement>("[data-ampel-toggle]");
    const modal  = document.querySelector<HTMLElement>("[data-ampel-modal]");
    const close  = document.querySelector<HTMLElement>("[data-ampel-close]");

    if (!toggle || !modal) {
        console.error("Ruderampel: Fehlende DOM-Elemente");
        return;
    }

    const openModal = () => {
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        toggle.setAttribute("aria-expanded", "true");
        isModalOpen = true;
        setTimeout(() => {
            if (measurements.length > 0) {
                const forecast = (window as any)._ruderampelForecast ?? null;
                const hourly   = (window as any)._ruderampelHourlyForecast ?? null;
                drawChart(measurements, forecast, hourly);
            }
        }, 100);
    };

    const closeModal = () => {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        toggle.setAttribute("aria-expanded", "false");
        isModalOpen = false;
    };

    toggle.addEventListener("click", openModal);
    close?.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    // Erstladen + alle 5 Minuten aktualisieren
    load(isOverlay);
    setInterval(() => load(isOverlay), 5 * 60 * 1000);
}


