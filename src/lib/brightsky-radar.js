// Bright Sky Radar Implementation
window.initBrightSkyRadar = async function(mapElementId) {
    // Ensure Leaflet is loaded
    await ensureLeaflet();
    // Ensure Pako is loaded
    await ensurePako();
    // Setup the radar
    await setupRadar(mapElementId);
};

async function ensureLeaflet() {
    if (window.L) {
        return;
    }

    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => {
            resolve();
        };
        document.head.appendChild(script);
    });
}

async function ensurePako() {
    if (window.pako) {
        return;
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/pako@2.1.0/dist/pako.min.js';
        script.onload = () => {
            resolve();
        };
        document.head.appendChild(script);
    });
}

async function setupRadar(mapElementId) {
    const mapContainer = document.getElementById(mapElementId);
    if (!mapContainer) {
        return;
    }
    await loadAndDisplayRadar(mapContainer);
}

async function loadAndDisplayRadar(mapContainer) {
    try {
        const response = await fetch('https://api.brightsky.dev/radar?tz=Europe/Berlin');

        if (!response.ok) {
            throw new Error(`Bright Sky API Error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.radar || data.radar.length === 0) {
            throw new Error('No radar data available');
        }

        const gridWidth = 1100;
        const gridHeight = 1200;

        const map = window.L.map(mapContainer, {
            center: [50.585, 8.678],
            zoom: 11,
            zoomControl: true
        });

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);

        window.L.circleMarker([50.585, 8.678], {
            radius: 8,
            fillColor: '#3b82f6',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(map).bindPopup('<b>Gießen</b><br>Ruderanlegestelle Lahn');

        const frames = [];
        const now = new Date();

        data.radar.forEach((record) => {
            try {
                const timestamp = new Date(record.timestamp);
                const isForecast = timestamp > now;
                const imageUrl = makeCanvasImage(record, gridWidth, gridHeight);

                frames.push({
                    timestamp: Math.floor(timestamp.getTime() / 1000),
                    dateTime: timestamp,
                    isForecast: isForecast,
                    imageUrl: imageUrl,
                    label: timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                });
            } catch (frameErr) {
                // Skip frames with errors
            }
        });

        if (frames.length === 0) {
            throw new Error('No frames processed');
        }

        createFrameControl(map, frames);
        initTimeline(frames);

    } catch (err) {
        const timestampEl = mapContainer.parentElement?.querySelector('[data-radar-timestamp]');
        if (timestampEl) {
            timestampEl.textContent = 'Fehler: ' + err.message;
        }
    }
}

function initTimeline(frames) {
    const timelineEl = document.querySelector('[data-radar-timeline]');
    if (!timelineEl) {
        return;
    }

    const numLabels = 5;
    const indices = [];
    for (let i = 0; i < numLabels; i++) {
        const index = Math.floor((i / (numLabels - 1)) * (frames.length - 1));
        indices.push(index);
    }

    const forecastStartIdx = frames.findIndex(f => f.isForecast);
    const nowPercentage = forecastStartIdx > 0 ? (forecastStartIdx / (frames.length - 1)) * 100 : null;

    const htmlContent = indices.map((index) => {
        const frame = frames[index];
        const timeStr = frame.dateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const isNow = !frame.isForecast && frames[index + 1] && frames[index + 1].isForecast;
        return `<span style="font-size: 10px; ${isNow ? 'font-weight: bold; color: #374151;' : 'color: #9CA3AF;'}">${timeStr}${isNow ? ' (jetzt)' : ''}</span>`;
    }).join('');

    timelineEl.innerHTML = htmlContent;

    if (nowPercentage !== null) {
        const nowMarkerHTML = `
            <div style="
                position: absolute;
                left: ${nowPercentage}%;
                top: 0;
                bottom: 0;
                width: 2px;
                background: #10b981;
                transform: translateX(-50%);
                z-index: 10;
                opacity: 0.6;
            "></div>
            <div style="
                position: absolute;
                left: ${nowPercentage}%;
                bottom: -18px;
                transform: translateX(-50%);
                font-size: 10px;
                color: #10b981;
                font-weight: bold;
                white-space: nowrap;
                z-index: 10;
            ">jetzt</div>
        `;

        if (window.getComputedStyle(timelineEl).position === 'static') {
            timelineEl.style.position = 'relative';
        }

        const marker = document.createElement('div');
        marker.setAttribute('data-now-marker', 'true');
        marker.innerHTML = nowMarkerHTML;
        timelineEl.appendChild(marker);
    }

    const progressContainer = document.querySelector('[data-radar-progress]')?.parentElement;
    if (!progressContainer) {
        return;
    }

    if (!document.getElementById('radar-toggler-style')) {
        const style = document.createElement('style');
        style.id = 'radar-toggler-style';
        style.textContent = `
            /* Forecasted part of progress bar (gelb) */
            [data-radar-progress-forecast] {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
                z-index: 5;
                transition: width 0.1s ease-out;
            }
            
            /* Weißer Kreis am Ende des Balkens */
            [data-radar-progress]::after {
                content: '';
                position: absolute;
                top: 50%;
                right: 0;
                width: 16px;
                height: 16px;
                margin-top: -8px;
                margin-right: -8px;
                background: white;
                border: none;
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                cursor: grab;
                z-index: 20;
                transition: box-shadow 0.2s;
            }
            
            [data-radar-progress]:active::after {
                cursor: grabbing;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    if (progressContainer.style.position !== 'relative') {
        progressContainer.style.position = 'relative';
    }

    let isDragging = false;

    const updateFrameFromMouse = (clientX) => {
        const rect = progressContainer.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, relativeX / rect.width));
        const frameIndex = Math.round(percentage * (frames.length - 1));

        if (window.radarJumpToFrame) {
            window.stopRadarAnimation = true;
            window.radarJumpToFrame(frameIndex);
        }
    };

    progressContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateFrameFromMouse(e.clientX);
    });

    progressContainer.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        updateFrameFromMouse(e.clientX);
    });

    progressContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        updateFrameFromMouse(e.touches[0].clientX);
    });

    progressContainer.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        updateFrameFromMouse(e.touches[0].clientX);
    });

    progressContainer.addEventListener('click', (e) => {
        updateFrameFromMouse(e.clientX);
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
        }
    });

    document.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
        }
    });
}

function decompress(raw) {
    if (!window.pako) {
        console.warn('Pako not loaded');
        return new Uint16Array(0);
    }

    try {
        const compressed = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
        const rawBytes = window.pako.inflate(compressed).buffer;
        return new Uint16Array(rawBytes);
    } catch (err) {
        console.error('Decompression error:', err);
        return new Uint16Array(0);
    }
}

function precipitationToRgba(precip) {
    const val = Math.min(precip, 250) / 250;

    let r, g, b;
    if (val < 0.2) {
        r = 0; g = Math.round(100 + 155 * (val / 0.2)); b = 255;
    } else if (val < 0.4) {
        const t = (val - 0.2) / 0.2;
        r = 0; g = 255; b = Math.round(255 * (1 - t));
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

function makeCanvasImage(record, width, height) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    const imageData = ctx.createImageData(width, height);

    const precip = decompress(record.precipitation_5);

    for (let idx = 0; idx < precip.length && idx < imageData.data.length / 4; idx++) {
        const rgba = precipitationToRgba(precip[idx]);
        imageData.data[idx * 4] = rgba[0];
        imageData.data[idx * 4 + 1] = rgba[1];
        imageData.data[idx * 4 + 2] = rgba[2];
        imageData.data[idx * 4 + 3] = rgba[3];
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

function createFrameControl(map, frames) {
    let currentFrameIdx = Math.max(0, frames.findIndex(f => f.isForecast) - 1 || 0);
    let isPlaying = false;
    let animationInterval = null;
    let currentLayer = null;

    const radarBounds = [
        [49.5, 2.5],
        [55.5, 17.5]
    ];

    const showFrame = (idx) => {
        idx = Math.max(0, Math.min(idx, frames.length - 1));
        currentFrameIdx = idx;

        if (currentLayer && map.hasLayer(currentLayer)) {
            map.removeLayer(currentLayer);
        }

        const frame = frames[idx];
        currentLayer = window.L.imageOverlay(frame.imageUrl, radarBounds, {
            opacity: 0.8,
            zIndex: 10,
            attribution: 'Bright Sky / DWD'
        });
        currentLayer.addTo(map);

        // Update timestamp - suche global
        const timestampEl = document.querySelector('[data-radar-timestamp]');
        if (timestampEl) {
            const label = frame.isForecast ? '🔮 Vorhersage' : '📡 Radar';
            const dateStr = frame.dateTime.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            const timeStr = frame.dateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            timestampEl.textContent = `${label}: ${dateStr} ${timeStr}`;
        }

        // Update progress bar - suche global
        const progressEl = document.querySelector('[data-radar-progress]');
        if (progressEl) {
            const progress = frames.length > 1 ? (idx / (frames.length - 1)) * 100 : 0;
            progressEl.style.width = `${progress}%`;
        }

        // Update forecast progress bar (gelb)
        // Finde den Index wo die Vorhersage anfängt
        const forecastStartIdx = frames.findIndex(f => f.isForecast);
        if (forecastStartIdx > 0) {
            const forecastProgressEl = document.querySelector('[data-radar-progress-forecast]');
            if (forecastProgressEl) {
                // Berechne wie viel Prozent der Vorhersage-Bereich einnimmt
                const forecastRangeStart = (forecastStartIdx / (frames.length - 1)) * 100;
                const forecastRangeEnd = 100;
                const currentProgress = (idx / (frames.length - 1)) * 100;

                // Zeige die gelbe Linie nur im Vorhersage-Bereich
                if (currentProgress > forecastRangeStart) {
                    const forecastWidth = currentProgress - forecastRangeStart;
                    forecastProgressEl.style.width = `${forecastWidth}%`;
                    forecastProgressEl.style.left = `${forecastRangeStart}%`;
                } else {
                    forecastProgressEl.style.width = '0%';
                }
            }
        }
    };

    const startAnimation = () => {
        if (isPlaying) {
            return;
        }
        isPlaying = true;

        let iconEl = document.querySelector('[data-radar-icon]');
        if (iconEl) {
            iconEl.textContent = '⏸';
            iconEl.style.color = 'black';
        }

        // Ändere Button zu hellerem Grau während Animation läuft
        let toggleBtn = document.querySelector('[data-radar-toggle]');
        if (toggleBtn) {
            toggleBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            toggleBtn.classList.add('bg-neutral-300', 'hover:bg-neutral-400');
        }

        if (currentFrameIdx >= frames.length - 1) {
            currentFrameIdx = 0;
        }

        animationInterval = setInterval(() => {
            currentFrameIdx++;
            if (currentFrameIdx >= frames.length) {
                currentFrameIdx = 0;
            }
            showFrame(currentFrameIdx);
        }, 500);
    };

    const stopAnimation = () => {
        if (!isPlaying) {
            return;
        }
        isPlaying = false;

        let iconEl = document.querySelector('[data-radar-icon]');
        if (iconEl) {
            iconEl.textContent = '▶';
            iconEl.style.color = '';
        }

        // Ändere Button zurück zu blau wenn Animation stoppt
        let toggleBtn = document.querySelector('[data-radar-toggle]');
        if (toggleBtn) {
            toggleBtn.classList.remove('bg-neutral-300', 'hover:bg-neutral-400');
            toggleBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        }

        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    };

    // Mache jumpToFrame global verfügbar
    window.radarJumpToFrame = (frameIndex) => {
        if (window.stopRadarAnimation) {
            stopAnimation();
            window.stopRadarAnimation = false;
        }
        showFrame(frameIndex);
    };

    const container = map.getContainer();

    let toggleBtn = container.querySelector('[data-radar-toggle]');
    if (!toggleBtn) {
        toggleBtn = document.querySelector('[data-radar-toggle]');
    }

    if (toggleBtn) {
        const clickHandler = () => {
            if (isPlaying) {
                stopAnimation();
            } else {
                startAnimation();
            }
        };
        toggleBtn.addEventListener('click', clickHandler);
    } else {
        const allRadarButtons = document.querySelectorAll('[data-radar-toggle]');
        allRadarButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                if (isPlaying) {
                    stopAnimation();
                } else {
                    startAnimation();
                }
            });
        });
    }

    showFrame(currentFrameIdx);
}










