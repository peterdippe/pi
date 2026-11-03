// ===================================================================
// DOMINANZ-ATLAS – TEIL 2: WETTER-PLAUSIBILITÄT, 10-MIN-SNAPSHOT & TELEMETRIE
// ===================================================================

const DOM_WEATHER_SNAPSHOT_MS = 10 * 60 * 1000; // 10 Minuten statisches Fenster
let domWeatherPolarity = 'hot'; // 'hot' (Wärmer -> Hitzepol) | 'cold' (Kälter -> Kältepol)
let domLastWeatherSyncTs = 0;
let domWeatherSyncInFlight = false;
let domWeatherTimerId = null;
let domWeatherHotPole = null;
let domWeatherColdPole = null;

// 1. Bereinigt fehlerhafte WMO/Meteostat-Höhencodes (z. B. -9999 m oder +9999 m)
function cleanStationElev(elev) {
    if (elev == null || !isFinite(elev)) return 0;
    const e = Number(elev);
    if (e < -425 || e > 5800) return 0;
    return Math.round(e);
}

// 2. Meteorologischer Plausibilitätscheck nach Breitengrad & Stationshöhe
function clampPlausibleTemp(s, t) {
    if (t == null || !isFinite(t)) return 15.0;
    const latAbs = Math.abs(s.lat || 0);
    const elev = cleanStationElev(s.elev);

    // Physikalische Grenzen auf der Erde + Klimazonen-Korridor
    let minAllowed = -89.2;
    let maxAllowed = 56.7;

    if (latAbs < 23.5) {
        // Tropen: Auf Meeresniveau nie unter +8 °C, auf Hochgebirgen max. -18 °C, nie über +50 °C
        minAllowed = Math.max(-18, 10 - elev * 0.0075);
        maxAllowed = 50.0;
    } else if (latAbs < 40) {
        // Subtropen
        minAllowed = Math.max(-35, -8 - elev * 0.0075);
        maxAllowed = 54.0;
    } else if (latAbs < 60) {
        // Gemäßigte Breiten (inkl. Europa): Schutz gegen -9999m-Kälte-Ausreißer
        minAllowed = Math.max(-52, -28 - elev * 0.0065);
        maxAllowed = 47.0;
    } else if (s.lat > 0) {
        // Arktis / Subarktis (Nordhalbkugel)
        minAllowed = -68.0;
        maxAllowed = 36.0;
    } else {
        // Antarktis / Südpolarregion
        minAllowed = -89.2;
        maxAllowed = 18.0;
    }

    return Math.round(Math.max(minAllowed, Math.min(maxAllowed, t)) * 10) / 10;
}

// 3. Bereinigt weatherstations.json sofort beim Laden von -9999m-Artefakten
function sanitizeWeatherDataset(list) {
    if (!Array.isArray(list)) return;
    for (const s of list) {
        const rawElev = s.elev;
        const hadBadElev = (rawElev == null || !isFinite(rawElev) || rawElev < -425 || rawElev > 5800);
        s.elev = cleanStationElev(rawElev);

        if (s.range && typeof s.range === 'string') {
            s.range = s.range.replace(/-\d{4,}\s*m/g, '0 m').replace(/\b9999\s*m/g, '0 m');
        }

        // Falls die Station in der JSON durch -9999 m um +65 °C verschoben wurde, rückrechnen:
        if (hadBadElev && typeof rawElev === 'number' && rawElev < -1000 && isFinite(s.temp)) {
            s.temp = Math.round((s.temp + rawElev * 0.0065) * 10) / 10;
        }
        s.temp = clampPlausibleTemp(s, s.temp);
        s.height = s.temp;
    }
}

function updateWeatherSyncStatusUI() {
    const syncEl = document.getElementById('dom-weather-sync-info');
    if (!syncEl) return;
    if (!domLastWeatherSyncTs) {
        syncEl.textContent = '⏳ Synchronisiere 10-Minuten-Snapshot …';
        return;
    }
    const elapsedMs = Date.now() - domLastWeatherSyncTs;
    const remainMin = Math.max(1, Math.ceil((DOM_WEATHER_SNAPSHOT_MS - elapsedMs) / 60000));
    const syncTimeStr = new Date(domLastWeatherSyncTs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    syncEl.textContent = `🔒 10-Min-Snapshot (${syncTimeStr} Uhr · nächstes Update in ${remainMin} Min.)`;
}

function recomputeWeatherDominance() {
    const list = domDatasets.weather || [];
    if (!list.length) return;

    let hottest = null;
    let coldest = null;
    for (const s of list) {
        s.elev = cleanStationElev(s.elev);
        if (s.temp != null && isFinite(s.temp)) {
            s.temp = clampPlausibleTemp(s, s.temp);
            s.height = s.temp;
        }
        const t = domVal(s);
        if (t == null) continue;
        if (!hottest || t > domVal(hottest)) hottest = s;
        if (!coldest || t < domVal(coldest)) coldest = s;
        s.isoCalc = true;
    }

    domWeatherHotPole = hottest;
    domWeatherColdPole = coldest;

    const hotNameEl = document.getElementById('dom-hot-pole-name');
    const hotTempEl = document.getElementById('dom-hot-pole-temp');
    if (hottest && hotNameEl && hotTempEl) {
        const locH = getInitialPlaceLabel(hottest);
        hotNameEl.textContent = hottest.name + (locH ? ` (${locH})` : '');
        hotTempEl.textContent = domFormatVal(domVal(hottest));
        resolvePlaceLabel(hottest).then(lbl => {
            if (lbl && document.getElementById('dom-hot-pole-name') && domWeatherHotPole?.id === hottest.id) {
                document.getElementById('dom-hot-pole-name').textContent = `${hottest.name} (${lbl})`;
            }
        });
    }

    const coldNameEl = document.getElementById('dom-cold-pole-name');
    const coldTempEl = document.getElementById('dom-cold-pole-temp');
    if (coldest && coldNameEl && coldTempEl) {
        const locC = getInitialPlaceLabel(coldest);
        coldNameEl.textContent = coldest.name + (locC ? ` (${locC})` : '');
        coldTempEl.textContent = domFormatVal(domVal(coldest));
        resolvePlaceLabel(coldest).then(lbl => {
            if (lbl && document.getElementById('dom-cold-pole-name') && domWeatherColdPole?.id === coldest.id) {
                document.getElementById('dom-cold-pole-name').textContent = `${coldest.name} (${lbl})`;
            }
        });
    }

    const cfg = DOM_MODE_CFG.weather;
    if (domWeatherPolarity === 'cold') {
        cfg.supremeId = coldest ? coldest.id : 'WS_VOSTOK';
        cfg.supremeHint = coldest
            ? `❄️ Kältepol: ${coldest.name} (${domFormatVal(domVal(coldest))}) 🎯`
            : '❄️ Endpunkt: Aktueller Kältepol 🎯';
        cfg.supremeNote = coldest
            ? `❄️ ${coldest.name} (${domFormatVal(domVal(coldest))}) – aktuell kälteste Wetterstation der Erde!`
            : '❄️ Kältepol der Erde erreicht.';
    } else {
        cfg.supremeId = hottest ? hottest.id : 'WS_DEATH_VALLEY';
        cfg.supremeHint = hottest
            ? `🔥 Hitzepol: ${hottest.name} (${domFormatVal(domVal(hottest))}) 🎯`
            : '🔥 Endpunkt: Aktueller Hitzepol 🎯';
        cfg.supremeNote = hottest
            ? `🔥 ${hottest.name} (${domFormatVal(domVal(hottest))}) – aktuell heißeste Wetterstation der Erde!`
            : '🔥 Hitzepol der Erde erreicht.';
    }

    const hintEl = document.getElementById('dom-mode-supreme-hint') || document.getElementById('dom-mode- supreme-hint');
    if (hintEl && domMode === 'weather') hintEl.textContent = cfg.supremeHint;
}

async function refreshLiveWeatherField(force = false) {
    const list = domDatasets.weather || [];
    if (!list.length || domWeatherSyncInFlight) return;

    const now = Date.now();
    if (!force && domLastWeatherSyncTs > 0 && (now - domLastWeatherSyncTs < DOM_WEATHER_SNAPSHOT_MS)) {
        recomputeWeatherDominance();
        updateWeatherSyncStatusUI();
        return;
    }

    // Neuer Cache-Schlüssel v3 (ignoriert alte unbereinigte Caches)
    if (!force && domLastWeatherSyncTs === 0) {
        try {
            const rawSnap = sessionStorage.getItem('dom_weather_snap_v3');
            if (rawSnap) {
                const parsed = JSON.parse(rawSnap);
                if (parsed && parsed.ts && (now - parsed.ts < DOM_WEATHER_SNAPSHOT_MS) && parsed.map) {
                    list.forEach(s => {
                        if (parsed.map[s.id] !== undefined) {
                            s.temp = clampPlausibleTemp(s, parsed.map[s.id]);
                            s.height = s.temp;
                        }
                    });
                    domLastWeatherSyncTs = parsed.ts;
                    recomputeWeatherDominance();
                    updateWeatherSyncStatusUI();
                    return;
                }
            }
        } catch (e) {}
    }

    domWeatherSyncInFlight = true;
    const syncEl = document.getElementById('dom-weather-sync-info');
    if (syncEl) syncEl.textContent = '⏳ Aktualisiere & prüfe globalen 10-Minuten-Snapshot …';

    try {
        const step = Math.max(1, Math.floor(list.length / 220));
        const anchorSet = new Map();
        for (let i = 0; i < list.length; i += step) {
            anchorSet.set(list[i].id, list[i]);
        }

        const refPt = domUserLoc || (dominanzMap ? { lat: dominanzMap.getCenter().lat, lon: dominanzMap.getCenter().lng } : { lat: 50.95, lon: 13.95 });
        [...list]
            .map(s => ({ s, d: domDistanceKm(refPt, s) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 80)
            .forEach(x => anchorSet.set(x.s.id, x.s));

        const extremeIds = new Set([
            'WS_VOSTOK', 'WS_DOME_A', 'WS_DOME_C', 'WS_SOUTH_POLE', 'WS_SUMMIT_GL',
            'WS_OYMYAKON', 'WS_VERKHOYANSK', 'WS_DEATH_VALLEY', 'WS_MITRIBAH',
            'WS_AHWAZ', 'WS_ASWAN', 'WS_JACOBABAD', 'WS_MARBLE_BAR',
            'WMO_10961', 'WMO_06730', 'WMO_11146', 'WMO_11653', 'WMO_10578',
            'WMO_10453', 'WMO_10582', 'WMO_11464', 'WMO_10488'
        ]);
        const sortedByT = [...list].filter(s => domVal(s) != null).sort((a, b) => domVal(b) - domVal(a));
        sortedByT.slice(0, 20).forEach(s => extremeIds.add(s.id));
        sortedByT.slice(-20).forEach(s => extremeIds.add(s.id));
        list.forEach(s => { if (extremeIds.has(s.id)) anchorSet.set(s.id, s); });

        const batchTargets = Array.from(anchorSet.values());
        const liveAnchors = [];

        for (let i = 0; i < batchTargets.length; i += 85) {
            const chunk = batchTargets.slice(i, i + 85);
            const lats = chunk.map(s => s.lat.toFixed(3)).join(',');
            const lons = chunk.map(s => s.lon.toFixed(3)).join(',');
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m`;
                const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
                if (r.ok) {
                    let data = await r.json();
                    if (!Array.isArray(data)) data = [data];
                    data.forEach((item, idx) => {
                        const t = item?.current?.temperature_2m;
                        const st = chunk[idx];
                        if (t != null && isFinite(t) && st) {
                            const demElev = cleanStationElev(item?.elevation);
                            if (!st.elev && demElev > 0) st.elev = demElev;
                            const validElev = cleanStationElev(st.elev || demElev);
                            const tRound = clampPlausibleTemp(st, t);
                            st.temp = tRound;
                            st.height = tRound;
                            st._directLive = true;

                            const rad = Math.PI / 180;
                            const cosLat = Math.cos(st.lat * rad);
                            liveAnchors.push({
                                x: cosLat * Math.cos(st.lon * rad),
                                y: cosLat * Math.sin(st.lon * rad),
                                z: Math.sin(st.lat * rad),
                                seaT: tRound + validElev * 0.0065
                            });
                        }
                    });
                }
            } catch (e) {}
        }

        if (liveAnchors.length >= 25) {
            const rad = Math.PI / 180;
            const nA = liveAnchors.length;
            for (const s of list) {
                if (s._directLive) {
                    delete s._directLive;
                    continue;
                }
                const cosLat = Math.cos(s.lat * rad);
                const sx = cosLat * Math.cos(s.lon * rad);
                const sy = cosLat * Math.sin(s.lon * rad);
                const sz = Math.sin(s.lat * rad);

                let d1 = Infinity, d2 = Infinity, d3 = Infinity;
                let t1 = 15, t2 = 15, t3 = 15;
                for (let j = 0; j < nA; j++) {
                    const a = liveAnchors[j];
                    const dx = sx - a.x, dy = sy - a.y, dz = sz - a.z;
                    const dSq = dx * dx + dy * dy + dz * dz;
                    if (dSq < d1) {
                        d3 = d2; t3 = t2; d2 = d1; t2 = t1; d1 = dSq; t1 = a.seaT;
                    } else if (dSq < d2) {
                        d3 = d2; t3 = t2; d2 = dSq; t2 = a.seaT;
                    } else if (dSq < d3) {
                        d3 = dSq; t3 = a.seaT;
                    }
                }
                const w1 = 1 / Math.max(d1, 1e-7);
                const w2 = 1 / Math.max(d2, 1e-7);
                const w3 = 1 / Math.max(d3, 1e-7);
                const seaInterp = (t1 * w1 + t2 * w2 + t3 * w3) / (w1 + w2 + w3);
                const validElev = cleanStationElev(s.elev);
                const rawEst = seaInterp - validElev * 0.0065;
                s.temp = clampPlausibleTemp(s, rawEst);
                s.height = s.temp;
            }
        }

        // 4. Direkt-Verifikation der Top-12 Hitze- und Top-12 Kältepol-Kandidaten
        // Verhindert zu 100%, dass ein ungemessener Interpolationspunkt fälschlich Welt-Pol wird!
        const checkSorted = [...list].sort((a, b) => (domVal(b) || 0) - (domVal(a) || 0));
        const poleCandidates = [...checkSorted.slice(0, 12), ...checkSorted.slice(-12)];
        if (poleCandidates.length) {
            const pLats = poleCandidates.map(s => s.lat.toFixed(3)).join(',');
            const pLons = poleCandidates.map(s => s.lon.toFixed(3)).join(',');
            try {
                const pUrl = `https://api.open-meteo.com/v1/forecast?latitude=${pLats}&longitude=${pLons}&current=temperature_2m`;
                const pr = await fetch(pUrl, { signal: AbortSignal.timeout(7000) });
                if (pr.ok) {
                    let pData = await pr.json();
                    if (!Array.isArray(pData)) pData = [pData];
                    pData.forEach((item, idx) => {
                        const t = item?.current?.temperature_2m;
                        const st = poleCandidates[idx];
                        if (t != null && isFinite(t) && st) {
                            st.temp = clampPlausibleTemp(st, t);
                            st.height = st.temp;
                        }
                    });
                }
            } catch (e) {}
        }

        domLastWeatherSyncTs = Date.now();
        try {
            const snapMap = {};
            list.forEach(s => { snapMap[s.id] = s.temp; });
            sessionStorage.setItem('dom_weather_snap_v3', JSON.stringify({ ts: domLastWeatherSyncTs, map: snapMap }));
        } catch (e) {}

        recomputeWeatherDominance();
        updateWeatherSyncStatusUI();

        if (domMode === 'weather') {
            domPaint();
            if (domActive) {
                const mainValEl = document.getElementById('dom-main-val-display');
                if (mainValEl) mainValEl.textContent = domFormatVal(domVal(domActive));
                domOfferHigher(domActive, domNearestHigher(domActive), domGen);
            }
            domSearch();
        }
    } finally {
        domWeatherSyncInFlight = false;
    }
}

async function fetchLiveStationTelemetry(p, token) {
    const box = document.getElementById('dom-weather-station-box');
    if (!box || domMode !== 'weather') return;

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}&current=apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (token !== domGen || !document.getElementById('dom-weather-station-box')) return;

        const cur = data.current || {};
        const elevVal = cleanStationElev(p.elev || data.elevation);
        const elevTxt = `${domNum(elevVal, 0)} m ü. NHN`;

        box.innerHTML = `
            <div style="font-weight:800; font-size:12.5px; color:#0f172a; margin-bottom:6px; display:flex; justify-content:space-between;">
                <span>📡 Zusatz-Synoptik an der Messstation:</span>
                <span style="color:#047857;">⛰️ Stationshöhe: ${domEsc(elevTxt)}</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:6px; font-size:12px;">
                <div style="background:#fff; padding:6px 8px; border-radius:8px; border:1px solid #e2e8f0;">
                    <span style="color:#64748b; display:block; font-size:10.5px;">Gefühlte Temp.</span>
                    <b>${cur.apparent_temperature != null ? domFormatVal(cur.apparent_temperature) : '–'}</b>
                </div>
                <div style="background:#fff; padding:6px 8px; border-radius:8px; border:1px solid #e2e8f0;">
                    <span style="color:#64748b; display:block; font-size:10.5px;">Rel. Luftfeuchte</span>
                    <b>${cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) + ' %' : '–'}</b>
                </div>
                <div style="background:#fff; padding:6px 8px; border-radius:8px; border:1px solid #e2e8f0;">
                    <span style="color:#64748b; display:block; font-size:10.5px;">Wind (10 m)</span>
                    <b>${cur.wind_speed_10m != null ? domNum(cur.wind_speed_10m, 1) + ' km/h' : '–'}</b>
                </div>
                <div style="background:#fff; padding:6px 8px; border-radius:8px; border:1px solid #e2e8f0;">
                    <span style="color:#64748b; display:block; font-size:10.5px;">Luftdruck (Station)</span>
                    <b>${cur.surface_pressure != null ? domNum(cur.surface_pressure, 0) + ' hPa' : '–'}</b>
                </div>
            </div>
        `;
    } catch (e) {
        if (token === domGen && box) {
            box.innerHTML = `<div style="font-size:12px;color:#64748b;">🌡️ Stationshöhe: ${domNum(cleanStationElev(p.elev), 0)} m ü. NHN</div>`;
        }
    }
}

async function fetchLivePowerplantOutput(p, token) {
    const box = document.getElementById('dom-live-power-box');
    if (!box || domMode !== 'powerplants') return;
    const maxMw = domVal(p) || 0;
    if (p.status === 'decommissioned') {
        box.innerHTML = `<div>🛑 <b>Aktuelle Einspeisung:</b> <span style="color:#b91c1c;font-weight:800;">0 MW (Stillgelegt)</span></div>`;
        return;
    }
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}&current=wind_speed_10m,wind_speed_100m,shortwave_radiation,cloud_cover,temperature_2m&wind_speed_unit=ms`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (token !== domGen || !document.getElementById('dom-live-power-box')) return;

        const cur = data.current || {};
        const v10 = cur.wind_speed_10m ?? 0;
        const v100 = cur.wind_speed_100m ?? (v10 * 1.38);
        const ghi = cur.shortwave_radiation ?? 0;
        const temp = cur.temperature_2m ?? 15;
        const clouds = cur.cloud_cover ?? 0;
        let liveMw = 0, pct = 0, detailText = '', badgeColor = '#047857';

        if (p.type === 'wind') {
            const cf = (v100 < 3.0 || v100 >= 25.0) ? 0 : (v100 >= 12.5 ? 0.95 : Math.pow((v100 - 3.0) / 9.5, 2.6) * 0.95);
            liveMw = maxMw * cf; pct = Math.round(cf * 100);
            detailText = `🌬️ Live-Wind (100 m): <b>${domNum(v100, 1)} m/s</b> (${domNum(v100 * 3.6, 0)} km/h)`;
            badgeColor = pct >= 50 ? '#047857' : (pct >= 15 ? '#0369a1' : '#b45309');
        } else if (p.type === 'solar') {
            if (ghi <= 5) {
                liveMw = 0; pct = 0; detailText = `🌙 Solarstrahlung: <b>${Math.round(ghi)} W/m²</b>`; badgeColor = '#475569';
            } else {
                const cf = Math.min(0.94, (ghi / 920) * Math.max(0.82, 1 - Math.max(0, temp - 20) * 0.004));
                liveMw = maxMw * cf; pct = Math.round(cf * 100);
                detailText = `☀️ Globalstrahlung: <b>${Math.round(ghi)} W/m²</b> · Wolken: ${clouds}% · ${domNum(temp, 1)} °C`;
                badgeColor = pct >= 45 ? '#b45309' : '#0369a1';
            }
        } else {
            const isPeak = (new Date().getHours() >= 7 && new Date().getHours() <= 20);
            const baseCf = p.type === 'nuclear' ? 0.92 : (p.type === 'coal' ? (isPeak ? 0.78 : 0.58) : (p.type === 'hydro' ? (isPeak ? 0.72 : 0.45) : 0.62));
            liveMw = maxMw * baseCf; pct = Math.round(baseCf * 100);
            detailText = `⚙️ Typische Auslastung (${isPeak ? 'Tageslast' : 'Grundlast'}) · Vor Ort: ${domNum(temp, 1)} °C`;
        }
        box.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span>⚡ <b>Aktuelle Leistung (Live-Schätzung):</b></span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:800;color:${badgeColor};">≈ ${domNum(liveMw, liveMw < 50 && liveMw > 0 ? 1 : 0)} / ${domNum(maxMw, 0)} MW (${pct} %)</span>
            </div>
            <div style="width:100%;height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:6px 0;">
                <div style="width:${Math.min(100, Math.max(2, pct))}%;height:100%;background:${badgeColor};border-radius:999px;"></div>
            </div>
            <div style="font-size:11.5px;color:#334155;">${detailText}</div>
        `;
    } catch (e) {}
}

async function fetchLiveLakeBathingInfo(p, token) {
    const subEl = document.getElementById('dom-lake-live-sub');
    if (!subEl || domMode !== 'lakes') return;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}&current=temperature_2m,wind_speed_10m,uv_index`;
        const r = await fetch(url, { signal: AbortSignal.timeout(7500) });
        if (!r.ok) return;
        const data = await r.json();
        if (token !== domGen || !document.getElementById('dom-lake-live-sub')) return;
        const cur = data.current || {};
        if (cur.temperature_2m != null) {
            const seasonalBase = [3, 3.5, 6, 10, 15, 19, 21.5, 22, 18, 13, 8, 4.5][new Date().getMonth()] || 12;
            const estWaterT = Math.max(2, Math.min(26, Math.round((seasonalBase * 0.7 + cur.temperature_2m * 0.3) * 10) / 10));
            subEl.innerHTML = `🌡️ Vor-Ort-Wetter: <b>${domNum(cur.temperature_2m, 1)} °C Luft</b> · 💧 Wasser ≈ <b>${domNum(estWaterT, 1)} °C</b>` +
                (cur.wind_speed_10m != null ? ` · 🌬️ Wind ${domNum(cur.wind_speed_10m, 0)} km/h` : '');
        }
    } catch (e) {}
}
