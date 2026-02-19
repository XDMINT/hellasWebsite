// Pegelverlauf-Chart (Canvas, HiDPI-fähig)

export interface MeasurementPoint {
    timestamp: string;
    value: number;
    isForecast?: boolean;
}

export interface ForecastPoint {
    hours: number;
    value: number;
    isOfficial?: boolean;
}

export interface HourlyForecastPoint {
    hours: number;
    value: number;
    trend?: number;
    ar?: number;
    rain?: number;
}

const FLOOD = 360;

export function drawChart(
    measurements: MeasurementPoint[],
    forecast: ForecastPoint[] | null = null,
    hourlyForecast: HourlyForecastPoint[] | null = null,
): void {
    if (!measurements || measurements.length === 0) return;

    const canvas = document.getElementById("water-chart") as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = canvas.parentElement!;
    const displayW = container.offsetWidth - 24;
    const displayH = container.offsetHeight - 24;

    // HiDPI/Retina Support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + "px";
    canvas.style.height = displayH + "px";
    ctx.scale(dpr, dpr);

    const w = displayW;
    const h = displayH;
    const isSmall = w < 500;
    const marginLeft = isSmall ? 45 : 60;
    const marginRight = isSmall ? 15 : 30;
    const marginTop = isSmall ? 25 : 40;
    const marginBottom = isSmall ? 45 : 60;
    const plotW = w - marginLeft - marginRight;
    const plotH = h - marginTop - marginBottom;

    ctx.clearRect(0, 0, w, h);

    // Kombiniere historische Daten und Prognose
    const allData: MeasurementPoint[] = [...measurements];
    const splitIndex = measurements.length;

    if (forecast && forecast.length > 0) {
        const forecastToUse =
            hourlyForecast && hourlyForecast.length > 0 ? hourlyForecast : forecast;
        const lastTimestamp = new Date(measurements[measurements.length - 1].timestamp);
        forecastToUse.forEach((f) => {
            const forecastTime = new Date(lastTimestamp.getTime() + f.hours * 3_600_000);
            allData.push({ timestamp: forecastTime.toISOString(), value: f.value, isForecast: true });
        });
    }

    const vals = allData.map((d) => d.value);
    const max = Math.max(...vals, FLOOD + 50);
    const min = Math.min(...vals) - 20;
    const range = max - min;

    const firstTime = new Date(allData[0].timestamp).getTime();
    const lastTime = new Date(allData[allData.length - 1].timestamp).getTime();
    const timeRange = lastTime - firstTime;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Grid + Y-Achse
    const ySteps = isSmall ? 4 : 5;
    for (let i = 0; i <= ySteps; i++) {
        const value = min + (range / ySteps) * i;
        const y = marginTop + plotH - (i / ySteps) * plotH;
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(marginLeft, y);
        ctx.lineTo(marginLeft + plotW, y);
        ctx.stroke();
        ctx.fillStyle = "#374151";
        ctx.font = `${isSmall ? 11 : 13}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${Math.round(value)}`, marginLeft - 5, y);
    }

    // X-Achse Grid + Zeitbeschriftungen
    const xSteps = isSmall ? 4 : 6;
    for (let i = 0; i <= xSteps; i++) {
        const x = marginLeft + (i / xSteps) * plotW;
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, marginTop);
        ctx.lineTo(x, marginTop + plotH);
        ctx.stroke();

        const timeAtPoint = new Date(firstTime + (i / xSteps) * timeRange);
        const dateStr = `${String(timeAtPoint.getDate()).padStart(2, "0")}.${String(timeAtPoint.getMonth() + 1).padStart(2, "0")}.`;
        const timeStr = `${String(timeAtPoint.getHours()).padStart(2, "0")}:${String(timeAtPoint.getMinutes()).padStart(2, "0")}`;
        ctx.fillStyle = "#374151";
        ctx.font = `${isSmall ? 9 : 11}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        if (!isSmall) {
            ctx.fillText(dateStr, x, marginTop + plotH + 5);
            ctx.fillText(timeStr, x, marginTop + plotH + 20);
        } else {
            ctx.fillText(timeStr, x, marginTop + plotH + 5);
        }
    }

    // Hochwasser-Linie
    const floodY = marginTop + plotH - ((FLOOD - min) / range) * plotH;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(marginLeft, floodY);
    ctx.lineTo(marginLeft + plotW, floodY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ef4444";
    ctx.font = `${isSmall ? 9 : 11}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Hochwasser (${FLOOD} cm)`, marginLeft + 5, floodY - 5);

    // Historische Daten (blau)
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = isSmall ? 2 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < splitIndex; i++) {
        const d = allData[i];
        const x = marginLeft + ((new Date(d.timestamp).getTime() - firstTime) / timeRange) * plotW;
        const y = marginTop + plotH - ((d.value - min) / range) * plotH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Prognose (orange, gestrichelt)
    if (allData.length > splitIndex) {
        ctx.strokeStyle = "#f59e0b";
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        for (let i = splitIndex - 1; i < allData.length; i++) {
            const d = allData[i];
            const x = marginLeft + ((new Date(d.timestamp).getTime() - firstTime) / timeRange) * plotW;
            const y = marginTop + plotH - ((d.value - min) / range) * plotH;
            i === splitIndex - 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // "Jetzt"-Linie
        const nowX =
            marginLeft +
            ((new Date(measurements[measurements.length - 1].timestamp).getTime() - firstTime) /
                timeRange) *
                plotW;
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(nowX, marginTop);
        ctx.lineTo(nowX, marginTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f59e0b";
        ctx.font = `${isSmall ? 10 : 12}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("Vorhersage", nowX + 5, marginTop + 5);
    }

    // Rahmen + Y-Titel
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(marginLeft, marginTop, plotW, plotH);
    ctx.fillStyle = "#111827";
    ctx.font = `${isSmall ? 11 : 13}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.save();
    ctx.translate(12, marginTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("[cm]", 0, 0);
    ctx.restore();
}

