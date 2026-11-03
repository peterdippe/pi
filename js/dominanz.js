// ===================================================================
// DOMINANZ-ATLAS – TEIL 3: KARTEN-KERN, GPS-RADAR & DOMINANZKETTE
// Lädt automatisch js/dominanz-configs.js und js/dominanz-weather.js
// ===================================================================

let _domModulesPromise = null;
function ensureDominanzModules() {
    if (typeof DOM_MODE_CFG !== 'undefined' && typeof sanitizeWeatherDataset === 'function') {
        return Promise.resolve();
    }
    if (_domModulesPromise) return _domModulesPromise;
    const loadScript = (src) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
    });
    _domModulesPromise = loadScript('js/dominanz-configs.js')
        .then(() => loadScript('js/dominanz-weather.js'));
    return _domModulesPromise;
}
ensureDominanzModules();

let dominanzMap = null;
let dominanzLayers = {};
let domLayerKey = 'topo';

let domMode = 'peaks';
let domListMode = 'gps';

let domDatasets = {
    peaks: [], powerplants: [], towns: [],
    towers: [], lakes: [], castles: [], weather: []
};
let domLoaded = {
    peaks: false, powerplants: false, towns: false,
    towers: false, lakes: false, castles: false, weather: false
};
let domPeaks = [];

let domActive = null;
let domReference = null;
let domCircle = null;
let domSelMarker = null;
let domRefMarker = null;
let domMarkers = null;
let domGen = 0, domSearchGen = 0, domSearchTimer = null;

// --- GPS-Standort- & Telemetrie-State ---
let domUserLoc = null;
let domUserMarker = null;
let domGeoWatchId = null;
let domInitialAutoSelected = {
    peaks: false, powerplants: false, towns: false,
    towers: false, lakes: false, castles: false, weather: false
};
let domManualOverride = false;
let domLastElevFetchLoc = null;
let domFallbackAltitude = null;
let domNearbyFetched = {
    powerplants: null, towns: null,
    towers: null, lakes: null, castles: null
};

// ===================================================================
// INITIALISIERUNG & KONTEXT-UMSCHALTER
// ===================================================================
function initDominanzMapIfNeeded() {
    if (typeof DOM_MODE_CFG === 'undefined' || typeof sanitizeWeatherDataset !== 'function') {
        ensureDominanzModules().then(() => initDominanzMapIfNeeded());
        return;
    }
    if (dominanzMap || typeof L === 'undefined') return;
    dominanzMap = L.map('dominanzMapContainer', { zoomControl: true, minZoom: 2, maxZoom: 17 })
        .setView([50.95, 13.95], 9);

    dominanzLayers = buildLayerSet();
    dominanzLayers['topo'].addTo(dominanzMap);
    domLayerKey = 'topo';
    fillLayerSelect('dom-layer-select', 'topo');
    domMarkers = L.layerGroup().addTo(dominanzMap);
    L.control.scale({ imperial: false }).addTo(dominanzMap);
    dominanzMap.on('moveend zoomend', () => {
        domPaint();
        if (domListMode === 'view') {
            const si = document.getElementById('dom-search-input');
            if (!si || !si.value.trim()) domSearch();
        }
    });

    dominanzMap.on('click', (e) => {
        if (domPickMode) measureDomPoint(e.latlng.lat, e.latlng.lng);
    });

    const si = document.getElementById('dom-search-input');
    if (si) {
        si.oninput = () => { clearTimeout(domSearchTimer); domSearchTimer = setTimeout(domSearch, 200); };
        si.onkeydown = e => {
            if (e.key === 'Enter') document.querySelector('#dom-results .peak-item')?.click();
            if (e.key === 'Escape') { si.value = ''; domSearch(); }
        };
    }

    const chk = document.getElementById('dom-show-circle');
    if (chk) {
        chk.onchange = () => {
            if (!domCircle) return;
            chk.checked ? domCircle.addTo(dominanzMap) : dominanzMap.removeLayer(domCircle);
        };
    }

    if (!domWeatherTimerId) {
        domWeatherTimerId = setInterval(() => {
            if (domMode === 'weather' && domLoaded.weather) {
                updateWeatherSyncStatusUI();
                if (Date.now() - domLastWeatherSyncTs >= DOM_WEATHER_SNAPSHOT_MS) {
                    refreshLiveWeatherField(false);
                }
            }
        }, 30000);
    }

    renderDomLegend();
    updateDomModeUI();
    startDomGeolocation(false);
    loadDominanzData('peaks');
}

function setDomListMode(mode) {
    domListMode = mode === 'view' ? 'view' : 'gps';
    document.getElementById('dom-list-btn-gps')?.classList.toggle('active', domListMode === 'gps');
    document.getElementById('dom-list-btn-view')?.classList.toggle('active', domListMode === 'view');
    const si = document.getElementById('dom-search-input');
    if (si) si.value = '';
    domSearch();
}

function cycleDominanzMode(step) {
    const idx = DOM_MODES_ORDER.indexOf(domMode);
    const nextIdx = (idx + step + DOM_MODES_ORDER.length) % DOM_MODES_ORDER.length;
    setDominanzMode(DOM_MODES_ORDER[nextIdx]);
}

function setDominanzMode(mode) {
    if (typeof DOM_MODE_CFG === 'undefined') {
        ensureDominanzModules().then(() => setDominanzMode(mode));
        return;
    }
    if (!DOM_MODE_CFG[mode]) return;
    initDominanzMapIfNeeded();
    domMode = mode;
    domPeaks = domDatasets[mode] || [];
    domManualOverride = false;

    const sel = document.getElementById('dom-mode-select');
    if (sel && sel.value !== mode) sel.value = mode;

    const wBar = document.getElementById('dom-weather-polarity-bar');
    if (wBar) wBar.classList.toggle('open', mode === 'weather');

    updateDomModeUI();
    renderDomLegend();

    if (domRefMarker && dominanzMap) { dominanzMap.removeLayer(domRefMarker); domRefMarker = null; }
    if (domSelMarker && dominanzMap) { dominanzMap.removeLayer(domSelMarker); domSelMarker = null; }
    if (domCircle && dominanzMap) { dominanzMap.removeLayer(domCircle); domCircle = null; }

    if (!domLoaded[mode]) {
        loadDominanzData(mode);
    } else {
        onModeDatasetReady(mode);
    }
}

function setWeatherPolarity(pol) {
    domWeatherPolarity = pol === 'cold' ? 'cold' : 'hot';
    const hotBtn = document.getElementById('dom-pol-hot');
    const coldBtn = document.getElementById('dom-pol-cold');
    if (hotBtn) hotBtn.className = 'dom-pol-btn' + (domWeatherPolarity === 'hot' ? ' active-hot' : '');
    if (coldBtn) coldBtn.className = 'dom-pol-btn' + (domWeatherPolarity === 'cold' ? ' active-cold' : '');

    if (domMode === 'weather' && domPeaks.length) {
        recomputeWeatherDominance();
        renderDomLegend();
        if (domActive) {
            domSelect(domActive, null, { isAutoNearest: true, clearSearchInput: true });
        }
        domSearch();
    }
}

function domJumpToWeatherPole(pol) {
    if (domMode !== 'weather') setDominanzMode('weather');
    const targetPol = pol === 'cold' ? 'cold' : 'hot';
    domWeatherPolarity = targetPol;
    const hotBtn = document.getElementById('dom-pol-hot');
    const coldBtn = document.getElementById('dom-pol-cold');
    if (hotBtn) hotBtn.className = 'dom-pol-btn' + (domWeatherPolarity === 'hot' ? ' active-hot' : '');
    if (coldBtn) coldBtn.className = 'dom-pol-btn' + (domWeatherPolarity === 'cold' ? ' active-cold' : '');

    recomputeWeatherDominance();
    const poleStation = targetPol === 'cold' ? domWeatherColdPole : domWeatherHotPole;
    if (poleStation) {
        domManualOverride = true;
        domSelect(poleStation, null, { clearSearchInput: true, zoomToTarget: 7 });
    }
}

function domJumpToSupreme() {
    if (domMode === 'weather') {
        domJumpToWeatherPole(domWeatherPolarity);
        return;
    }
    const cfg = domCfg();
    const sup = domPeaks.find(p => p.id === cfg.supremeId);
    if (sup) {
        domManualOverride = true;
        domSelect(sup, null, { clearSearchInput: true, zoomToTarget: 8 });
    }
}

function updateDomModeUI() {
    const cfg = domCfg();
    const hintEl = document.getElementById('dom-mode-supreme-hint') || document.getElementById('dom-mode- supreme-hint');
    if (hintEl) hintEl.textContent = cfg.supremeHint;

    const si = document.getElementById('dom-search-input');
    if (si) {
        si.placeholder = cfg.searchPlaceholder;
        si.value = '';
    }
    const locBtn = document.getElementById('dom-locate-btn');
    if (locBtn) locBtn.textContent = cfg.locateBtnText;
}

// ===================================================================
// GPS-STANDORT, HÖHE & GESCHWINDIGKEIT AM BLAUEN PFEIL
// ===================================================================
function formatUserAltText() {
    const alt = (domUserLoc && domUserLoc.altitude != null) ? domUserLoc.altitude : domFallbackAltitude;
    return alt != null ? `⛰️ ${Math.round(alt)} m` : '⛰️ … m';
}

function formatUserSpeedText() {
    const spd = (domUserLoc && domUserLoc.speedKmh != null && isFinite(domUserLoc.speedKmh))
        ? Math.max(0, Math.round(domUserLoc.speedKmh)) : 0;
    return `${spd} km/h`;
}

function buildUserLocationIcon(headingDeg) {
    const rot = (typeof headingDeg === 'number' && isFinite(headingDeg)) ? Math.round(headingDeg) : 0;
    return L.divIcon({
        className: 'dom-user-loc-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -24],
        html: `
            <div class="dom-user-loc-wrap">
                <div class="dom-user-badge-top">${domEsc(formatUserAltText())}</div>
                <span class="dom-user-loc-ring"></span>
                <span class="dom-user-loc-arrow" style="transform: rotate(${rot}deg);">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"
                              fill="#2563eb" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>
                    </svg>
                </span>
                <div class="dom-user-badge-bottom">${domEsc(formatUserSpeedText())}</div>
            </div>
        `
    });
}

function domBearingDeg(fromPt, toPt) {
    const rad = Math.PI / 180;
    const lat1 = fromPt.lat * rad, lat2 = toPt.lat * rad;
    const dLon = (toPt.lon - fromPt.lon) * rad;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function domCompassDirection(fromPt, toPt) {
    const dirs = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(domBearingDeg(fromPt, toPt) / 22.5) % 16];
}

function ensureUserAltitudeFallback() {
    if (!domUserLoc || (domUserLoc.altitude != null && isFinite(domUserLoc.altitude))) return;
    if (domLastElevFetchLoc && domDistanceKm(domLastElevFetchLoc, domUserLoc) < 0.15 && domFallbackAltitude != null) return;
    domLastElevFetchLoc = { lat: domUserLoc.lat, lon: domUserLoc.lon };
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${domUserLoc.lat.toFixed(5)}&longitude=${domUserLoc.lon.toFixed(5)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (data?.elevation?.length) {
                domFallbackAltitude = Math.round(data.elevation[0]);
                updateDomUserMarker();
                refreshLiveUserDistancesUI();
            }
        })
        .catch(() => {});
}

function updateDomUserMarker() {
    if (!dominanzMap || !domUserLoc) return;
    const { lat, lon, heading, accuracy } = domUserLoc;
    const rot = (typeof heading === 'number' && isFinite(heading)) ? Math.round(heading) : 0;

    if (!domUserMarker) {
        domUserMarker = L.marker([lat, lon], { icon: buildUserLocationIcon(rot), title: 'Mein Standort (GPS)', zIndexOffset: 1600 }).addTo(dominanzMap);
    } else {
        domUserMarker.setLatLng([lat, lon]);
        const el = domUserMarker.getElement();
        if (el) {
            const topB = el.querySelector('.dom-user-badge-top');
            const botB = el.querySelector('.dom-user-badge-bottom');
            const arrEl = el.querySelector('.dom-user-loc-arrow');
            if (topB) topB.textContent = formatUserAltText();
            if (botB) botB.textContent = formatUserSpeedText();
            if (arrEl) arrEl.style.transform = `rotate(${rot}deg)`;
        } else {
            domUserMarker.setIcon(buildUserLocationIcon(rot));
        }
    }

    const nearest = findNearestItemTo(lat, lon);
    const distStr = nearest ? `${domNum(nearest.distKm, 2)} km (${domCompassDirection(domUserLoc, nearest.item)})` : '';
    const accStr = accuracy ? ` · ±${Math.round(accuracy)} m` : '';
    domUserMarker.bindPopup(
        `<b>🧭 Mein Standort</b>${accStr}<br>` +
        `<span style="font-size:12px;color:#047857;font-weight:700;">${domEsc(formatUserAltText())} · 🚗 ${domEsc(formatUserSpeedText())}</span><br>` +
        `<span style="font-size:11.5px;color:#475569;">${lat.toFixed(5)}° N, ${lon.toFixed(5)}° O</span>` +
        (nearest ? `<br><span style="font-size:12.5px;">${domCfg().icon} Nächster Punkt: <b>${domEsc(nearest.item.name)}</b> (${distStr})</span>` : '')
    );
}

function refreshLiveUserDistancesUI() {
    if (!domUserLoc || !domPeaks.length) return;
    const cfg = domCfg();
    const nearest = findNearestItemTo(domUserLoc.lat, domUserLoc.lon);
    const startInfo = document.getElementById('dom-start-info');
    if (nearest && startInfo) {
        const dir = domCompassDirection(domUserLoc, nearest.item);
        startInfo.innerHTML =
            `📍 <b>${domEsc(formatUserAltText())}</b> · 🚗 <b>${domEsc(formatUserSpeedText())}</b> · ` +
            `Nächstes Ziel (${domEsc(cfg.nounSingular)}): <b>${domEsc(nearest.item.name)}</b> (${domNum(nearest.distKm, 2)} km ${dir})`;
    }
    if (domActive && isFinite(domActive.lat) && isFinite(domActive.lon)) {
        const distEl = document.getElementById('dom-active-user-dist');
        if (distEl) {
            distEl.textContent = `${domNum(domDistanceKm(domUserLoc, domActive), 2)} km (${domCompassDirection(domUserLoc, domActive)})`;
        }
    }
    const si = document.getElementById('dom-search-input');
    const q = (si ? si.value : '').trim();
    if (!q && domListMode === 'gps') {
        const cap = document.getElementById('dom-results-Caption');
        if (cap) cap.textContent = `🧭 10 nächste ${cfg.nounPlural} rund um deinen Standort (Live):`;
        const nearestList = [...domPeaks]
            .filter(p => isFinite(p.lat) && isFinite(p.lon))
            .map(p => ({ item: p, d: domDistanceKm(domUserLoc, p) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 10)
            .map(x => x.item);
        domRenderResults(nearestList, false, true);
    } else {
        document.querySelectorAll('#dom-results .peak-item[data-peak-id]').forEach(row => {
            const pid = row.getAttribute('data-peak-id');
            const pk = domPeaks.find(x => x.id === pid);
            const badge = row.querySelector('.dom-live-dist-line');
            if (pk && badge) {
                badge.textContent = `🧭 ${domNum(domDistanceKm(domUserLoc, pk), 2)} km · Richtung ${domCompassDirection(domUserLoc, pk)}`;
            }
        });
    }
}

function findNearestItemTo(lat, lon) {
    if (!domPeaks || !domPeaks.length) return null;
    const pt = { lat, lon };
    let bestItem = null, minKm = Infinity;
    for (const p of domPeaks) {
        if (!isFinite(p.lat) || !isFinite(p.lon)) continue;
        const d = domDistanceKm(pt, p);
        if (d < minKm) { minKm = d; bestItem = p; }
    }
    return bestItem ? { item: bestItem, distKm: minKm } : null;
}

function selectNearestPeakForUser(forceSelect = false) {
    if (!domUserLoc || !domPeaks.length) return;
    const nearest = findNearestItemTo(domUserLoc.lat, domUserLoc.lon);
    if (!nearest) return;
    if (forceSelect || !domInitialAutoSelected[domMode] || !domManualOverride) {
        domInitialAutoSelected[domMode] = true;
        domSelect(nearest.item, null, { isAutoNearest: true, clearSearchInput: true });
    }
    refreshLiveUserDistancesUI();
}

function startDomGeolocation(forceSelectNearest = false) {
    if (!navigator.geolocation) return;
    if (forceSelectNearest) setDomStatus(`🧭 Bestimme GPS-Standort & suche nächstgelegenes Ziel (${domCfg().nounSingular}) …`);

    const onPosSuccess = (pos, shouldSelect) => {
        const prevLoc = domUserLoc;
        const nowTs = pos.timestamp || Date.now();
        const newLat = pos.coords.latitude, newLon = pos.coords.longitude;

        let speedKmh = 0;
        if (pos.coords.speed != null && isFinite(pos.coords.speed) && pos.coords.speed >= 0) {
            speedKmh = pos.coords.speed * 3.6;
        } else if (prevLoc?.ts && nowTs > prevLoc.ts) {
            const dtH = (nowTs - prevLoc.ts) / 3600000;
            const dKm = domDistanceKm(prevLoc, { lat: newLat, lon: newLon });
            speedKmh = (dtH > 0.0002 && dKm >= 0.008 && dKm / dtH < 260) ? (dKm / dtH) : (prevLoc.speedKmh || 0);
        }

        let heading = (pos.coords.heading != null && isFinite(pos.coords.heading) && pos.coords.heading >= 0) ? pos.coords.heading : null;
        if (heading === null && prevLoc) {
            heading = domDistanceKm(prevLoc, { lat: newLat, lon: newLon }) > 0.012
                ? domBearingDeg(prevLoc, { lat: newLat, lon: newLon }) : (prevLoc.heading || 0);
        }

        domUserLoc = {
            lat: newLat, lon: newLon, heading, speedKmh,
            altitude: (pos.coords.altitude != null && isFinite(pos.coords.altitude)) ? Math.round(pos.coords.altitude) : null,
            accuracy: pos.coords.accuracy, ts: nowTs
        };

        ensureUserAltitudeFallback();
        updateDomUserMarker();

        if (shouldSelect || !domInitialAutoSelected[domMode]) {
            if (shouldSelect) domManualOverride = false;
            selectNearestPeakForUser(shouldSelect);
            if (shouldSelect) setDomStatus('');
        } else {
            refreshLiveUserDistancesUI();
        }
    };

    navigator.geolocation.getCurrentPosition(
        pos => onPosSuccess(pos, forceSelectNearest),
        () => navigator.geolocation.getCurrentPosition(pos => onPosSuccess(pos, forceSelectNearest), () => {}, { enableHighAccuracy: false, timeout: 10000 }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );

    if (domGeoWatchId === null) {
        try {
            domGeoWatchId = navigator.geolocation.watchPosition(pos => onPosSuccess(pos, false), () => {}, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
        } catch (e) {}
    }
}

function domLocateUserAndSelectNearest(fromButton = true) {
    initDominanzMapIfNeeded();
    if (domUserLoc && domPeaks.length) {
        domManualOverride = false;
        selectNearestPeakForUser(true);
    }
    startDomGeolocation(fromButton);
}

// ===================================================================
// EIGENER PUNKT & DATEN-LOADER
// ===================================================================
let domPickMode = false;
let domPickMarker = null;

function toggleDomPickMode() {
    domPickMode = !domPickMode;
    const btn = document.getElementById('dom-pick-btn');
    if (!dominanzMap || !btn) return;
    btn.textContent = domPickMode ? '📍 Eigenen Punkt setzen: AN (auf Karte klicken)' : '📍 Eigenen Punkt setzen: AUS';
    btn.className = domPickMode ? 'btn btn-emerald' : 'btn btn-amber';
    dominanzMap.getContainer().style.cursor = domPickMode ? 'crosshair' : '';
}

function round2(x) { return Math.round(x * 100) / 100; }

function measureDomPoint(lat, lon) {
    domManualOverride = true;
    const token = ++domGen;
    if (domPickMarker) dominanzMap.removeLayer(domPickMarker);
    domPickMarker = L.marker([lat, lon], {
        icon: L.divIcon({ className: 'domPickWrap', html: '<span class="domPickDot"></span>', iconSize: [16, 16] }),
        title: 'Gewählter Punkt', zIndexOffset: 1200
    }).addTo(dominanzMap);

    if (domMode === 'weather') {
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&current=temperature_2m`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                if (token !== domGen) return;
                const tVal = clampPlausibleTemp({ lat, lon, elev: 0 }, data?.current?.temperature_2m ?? 15.0);
                const pt = { id: 'pick', name: 'Gewählter Kartenpunkt', lat, lon, temp: tVal, height: tVal, isoCalc: true, range: 'Live-2m-Temperaturmessung' };
                const best = domNearestHigher(pt);
                pt.isolation = best ? round2(domDistanceKm(pt, best)) : null;
                domSelect(pt);
            })
            .catch(() => {});
        return;
    }

    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (token !== domGen) return;
            const elev = data?.elevation?.length ? Math.round(data.elevation[0]) : 100;
            const refVal = domMode === 'peaks' ? elev : ({ powerplants: 10, towns: 1000, towers: 30, lakes: 0.25, castles: 250 }[domMode] || 10);
            const pt = { id: 'pick', name: 'Gewählter Kartenpunkt', lat, lon, height: refVal, capacity: refVal, population: refVal, area: refVal, age: refVal, isoCalc: true, range: 'Kartenpunkt-Messung' };
            const best = domNearestHigher(pt);
            pt.isolation = best ? round2(domDistanceKm(pt, best)) : null;
            domSelect(pt);
        })
        .catch(() => {});
}

function normalizeHeightMeters(h) {
    return (typeof h === 'number' && isFinite(h) && h > 8849) ? Math.round(h * 0.3048) : h;
}

function recomputeIsolationsForDataset(list) {
    const curY = new Date().getFullYear();
    for (const p of list) {
        const valP = p.capacity ?? p.population ?? p.area ?? p.age ?? (p.year != null ? (curY - p.year) : p.height);
        p.height = valP;
        if (p.isolation != null && !p.isoCalc) continue;
        let minKm = Infinity;
        for (const q of list) {
            if (q.id === p.id) continue;
            const valQ = q.capacity ?? q.population ?? q.area ?? q.age ?? (q.year != null ? (curY - q.year) : q.height);
            if (valQ == null || valP == null || valQ <= valP) continue;
            const d = domDistanceKm(p, q);
            if (d > 0.01 && d < minKm) minKm = d;
        }
        p.isolation = isFinite(minKm) ? round2(minKm) : null;
        p.isoCalc = true;
    }
}

function loadDominanzData(targetMode = domMode) {
    const cfg = DOM_MODE_CFG[targetMode] || DOM_MODE_CFG.peaks;
    setDomStatus(`${cfg.nounPlural}-Daten (${cfg.file}) werden geladen …`);

    fetch(cfg.file, { signal: AbortSignal.timeout(25000) })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(data => {
            if (targetMode === 'peaks') {
                data.forEach(p => { p.height = normalizeHeightMeters(p.height); });
            } else if (targetMode === 'weather') {
                sanitizeWeatherDataset(data);
                domDatasets.weather = data;
                recomputeWeatherDominance();
            } else {
                recomputeIsolationsForDataset(data);
            }
            domDatasets[targetMode] = data;
            domLoaded[targetMode] = true;
            if (domMode === targetMode) onModeDatasetReady(targetMode);
        })
        .catch(() => {
            if (domMode === targetMode) setDomStatus(`⏳ Datei ${cfg.file} wird geladen – bitte kurz warten.`);
        });
}

function onModeDatasetReady(mode) {
    if (domMode !== mode) return;
    const cfg = domCfg();
    domPeaks = domDatasets[mode] || [];
    setDomStatus('');

    const cnt = document.getElementById('dom-count');
    if (cnt) cnt.textContent = `${domNum(domPeaks.length)} ${cfg.nounPlural} weltweit`;
    if (dominanzMap) dominanzMap.invalidateSize();

    if (mode === 'weather') {
        recomputeWeatherDominance();
        refreshLiveWeatherField(false);
    }

    if (domUserLoc) {
        updateDomUserMarker();
        selectNearestPeakForUser(true);
    } else {
        const fb = domPeaks.find(p => p.id === cfg.fallbackId) || domPeaks.find(p => p.name === cfg.fallbackName) || domPeaks[0];
        if (fb) domSelect(fb, null, { isFallback: true, clearSearchInput: true });
        domSearch();
    }
    domPaint();
}

function setDomStatus(txt) { const el = document.getElementById('dom-status'); if (el) el.textContent = txt; }

function setDominanzLayer(key) {
    initDominanzMapIfNeeded();
    if (!dominanzMap || !dominanzLayers[key]) return;
    Object.values(dominanzLayers).forEach(l => dominanzMap.removeLayer(l));
    dominanzLayers[key].addTo(dominanzMap);
    domLayerKey = key;
}

function dominanzWorldView() { if (dominanzMap) dominanzMap.setView([25, 10], 2); }

// ===================================================================
// KARTEN-RENDERING, GEODÄSIE & DOMINANZKETTE
// ===================================================================
function domMaxForZoom(z) {
    return z <= 3 ? 70 : (z <= 4 ? 120 : (z <= 5 ? 200 : (z <= 6 ? 280 : (z <= 7 ? 380 : (z <= 8 ? 500 : (z <= 10 ? 680 : 900))))));
}

function domPaint() {
    if (!domMarkers || !dominanzMap) return;
    domMarkers.clearLayers();
    const b = dominanzMap.getBounds().pad(0.08);
    const cap = domMaxForZoom(dominanzMap.getZoom());
    const isColdWeather = (domMode === 'weather' && domWeatherPolarity === 'cold');

    const shown = domPeaks
        .filter(p => b.contains([p.lat, p.lon]) && p.id !== domActive?.id && p.id !== domReference?.id)
        .sort((a, c) => {
            const va = domVal(a) ?? (isColdWeather ? 999 : -999);
            const vc = domVal(c) ?? (isColdWeather ? 999 : -999);
            return isColdWeather ? (va - vc) : (vc - va);
        })
        .slice(0, cap);

    shown.forEach(p => {
        const val = domVal(p);
        const swimSuffix = (domMode === 'lakes' && p.swim)
            ? ` · ${p.swim === 'no' ? '🚫 Badeverbot' : (p.swim === 'yes' ? '🏊 Badesee' : '⚠️ Stausee')}`
            : (domMode === 'weather' && p.elev != null ? ` · ⛰️ ${cleanStationElev(p.elev)} m` : '');
        L.circleMarker([p.lat, p.lon], {
            radius: domRadiusForItem(p), color: 'rgba(0,0,0,0.45)', weight: 1,
            fillColor: domColorForItem(p), fillOpacity: 0.95
        }).bindTooltip(`${domItemIcon(p)} ${domEsc(p.name)}` + (val != null ? ` (${domFormatVal(val)}${swimSuffix})` : ''))
            .on('click', () => domSelect(p))
            .addTo(domMarkers);
    });
    const vis = document.getElementById('dom-visible');
    if (vis) vis.textContent = shown.length + ' sichtbar ·';
}

function domDistanceKm(a, b) {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

const DOM_CIRCLE_MAX_KM = 3000;

function domDestination(a, b, d, t) {
    const lat = Math.asin(Math.sin(a) * Math.cos(d) + Math.cos(a) * Math.sin(d) * Math.cos(t));
    const lon = b + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(a), Math.cos(d) - Math.sin(a) * Math.sin(lat));
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}

function domSplitAntimeridian(raw) {
    const segs = []; let cur = [];
    for (let i = 0; i < raw.length; i++) {
        if (i > 0 && Math.abs(raw[i][1] - raw[i - 1][1]) > 180) { if (cur.length) segs.push(cur); cur = []; }
        cur.push(raw[i]);
    }
    if (cur.length) segs.push(cur);
    return segs;
}

function domStrokeStyle() {
    if (domMode === 'weather') return domWeatherPolarity === 'cold' ? { stroke: '#0284c7', fill: '#38bdf8' } : { stroke: '#dc2626', fill: '#f97316' };
    return { stroke: '#2563eb', fill: '#3b82f6' };
}

function domGeoLine(p, target) {
    const rad = Math.PI / 180;
    const a1 = p.lat * rad, b1 = p.lon * rad, a2 = target.lat * rad, b2 = target.lon * rad;
    const dh = Math.sin((a2 - a1) / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin((b2 - b1) / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(Math.min(1, dh)), Math.sqrt(Math.max(0, 1 - dh)));
    const N = 180, raw = [];
    for (let i = 0; i <= N; i++) {
        const f = i / N;
        if (d === 0) { raw.push([p.lat, p.lon]); continue; }
        const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(a1) * Math.cos(b1) + B * Math.cos(a2) * Math.cos(b2);
        const y = A * Math.cos(a1) * Math.sin(b1) + B * Math.cos(a2) * Math.sin(b2);
        const z = A * Math.sin(a1) + B * Math.sin(a2);
        raw.push([Math.atan2(z, Math.hypot(x, y)) / rad, Math.atan2(y, x) / rad]);
    }
    const parts = [], st = domStrokeStyle();
    domSplitAntimeridian(raw).forEach(s => {
        parts.push(L.polyline(s, { color: '#ffffff', weight: 6, opacity: .9, interactive: false }));
        parts.push(L.polyline(s, { color: st.stroke, weight: 3, opacity: 1, dashArray: '10, 8', interactive: false }));
    });
    return L.featureGroup(parts);
}

function domGeodesic(p, r, target) {
    if (r / 1000 > DOM_CIRCLE_MAX_KM && target) return domGeoLine(p, target);
    const R = 6371008.8, d = r / R, a = p.lat * Math.PI / 180, b = p.lon * Math.PI / 180;
    const bearing = target ? Math.atan2(
        Math.sin((target.lon - p.lon) * Math.PI / 180) * Math.cos(target.lat * Math.PI / 180),
        Math.cos(a) * Math.sin(target.lat * Math.PI / 180) - Math.sin(a) * Math.cos(target.lat * Math.PI / 180) * Math.cos((target.lon - p.lon) * Math.PI / 180)
    ) : 0;
    const raw = [];
    for (let i = 0; i <= 360; i++) raw.push(domDestination(a, b, d, bearing + i * Math.PI / 180));
    const segs = domSplitAntimeridian(raw), st = domStrokeStyle();
    if (segs.length === 1) {
        return L.featureGroup([
            L.polygon(segs[0], { color: '#ffffff', weight: 6, opacity: .9, fill: false, interactive: false }),
            L.polygon(segs[0], { color: st.stroke, weight: 3, opacity: 1, dashArray: '10, 8', fillColor: st.fill, fillOpacity: .10, interactive: false })
        ]);
    }
    const parts = [];
    segs.forEach(s => {
        parts.push(L.polyline(s, { color: '#ffffff', weight: 6, opacity: .9, interactive: false }));
        parts.push(L.polyline(s, { color: st.stroke, weight: 3, opacity: 1, dashArray: '10, 8', interactive: false }));
    });
    return L.featureGroup(parts);
}

function domNearestHigher(p) {
    const cfg = domCfg();
    const valP = domVal(p);
    if (p.id === cfg.supremeId || !Number.isFinite(valP)) return null;
    const isColdSearch = (domMode === 'weather' && domWeatherPolarity === 'cold');

    let best = null, min = Infinity;
    for (const c of domPeaks) {
        const valC = domVal(c);
        if (c.id === p.id || !Number.isFinite(valC)) continue;
        if (domMode === 'weather') {
            if (isColdSearch ? (valC > valP - 0.09) : (valC < valP + 0.09)) continue;
        } else {
            if (valC <= valP) continue;
        }
        const d = domDistanceKm(p, c);
        if (d > 0.01 && d < min) { best = c; min = d; }
    }
    return best;
}

function domOfferHigher(p, next, token, customZoom) {
    if (token !== domGen) return;
    const cfg = domCfg();
    const box = document.getElementById('dom-higher');
    if (!box) return;
    if (!next) {
        const isoBox = document.getElementById('dom-iso-val');
        if (isoBox) isoBox.textContent = 'Welt-Extremum';
        box.innerHTML = `<p class="dom-note" style="margin:0;">${domEsc(cfg.supremeNote)}</p>`;
        if (customZoom && dominanzMap) dominanzMap.setView([p.lat, p.lon], customZoom);
        return;
    }
    domReference = next;
    const domDistKm = domDistanceKm(p, next);
    if (p.isolation == null || p.isoCalc || domMode === 'weather') {
        p.isolation = round2(domDistKm);
        p.isoCalc = true;
        const isoBox = document.getElementById('dom-iso-val');
        if (isoBox) isoBox.textContent = domNum(p.isolation, 2) + ' km';
    }

    const asLine = domDistKm > DOM_CIRCLE_MAX_KM;
    if (domCircle) dominanzMap.removeLayer(domCircle);
    domCircle = domGeodesic(p, domDistKm * 1000, next);
    if (document.getElementById('dom-show-circle').checked) domCircle.addTo(dominanzMap);
    document.getElementById('dom-circle-label').textContent = asLine ? `Linie zu ${cfg.refLabel}` : `Kreis zu ${cfg.refLabel}`;

    if (domRefMarker) dominanzMap.removeLayer(domRefMarker);
    let lon = next.lon;
    while (lon - p.lon > 180) lon -= 360;
    while (lon - p.lon < -180) lon += 360;
    domRefMarker = L.marker([next.lat, lon], {
        icon: L.divIcon({ className: 'domHigherPeak', html: '<span class="domHigherCore"></span>', iconSize: [22, 22] }),
        title: `${cfg.higherLabel}: ${next.name}`, zIndexOffset: 1000
    }).bindTooltip(domEsc(next.name), { permanent: true, direction: 'top', className: 'domHigherTip', offset: [0, -10] })
        .on('click', () => domSelect(next)).addTo(dominanzMap);

    const nextInitialLoc = getInitialPlaceLabel(next);
    const arrowIcon = (domMode === 'weather' && domWeatherPolarity === 'cold') ? '❄️⬇️' : '⬆️';

    box.innerHTML =
        `<button type="button" class="dom-higher-btn">` +
        `<span>${arrowIcon} ${domEsc(cfg.higherLabel)}: <b>${domEsc(next.name)}</b><span id="dom-higher-loc-label" style="font-weight:600; font-size:12px; opacity:0.9;">${nextInitialLoc ? ' (' + domEsc(nextInitialLoc) + ')' : ''}</span></span> ` +
        `<span class="dom-higher-h">${domFormatVal(domVal(next))}</span> →` +
        `</button>` +
        `<p class="dom-note" style="margin-bottom:0;">${domNum(domDistKm, 2)} km Luftlinie bis zur ${domEsc(cfg.refLabel)}. Klick dich Schritt für Schritt weiter!</p>`;
    box.querySelector('button').onclick = () => domSelect(next);

    resolvePlaceLabel(next).then(lbl => {
        if (token === domGen && lbl && document.getElementById('dom-higher-loc-label')) {
            document.getElementById('dom-higher-loc-label').textContent = ` (${lbl})`;
        }
    });

    const bounds = domCircle ? domCircle.getBounds() : L.latLngBounds([[p.lat, p.lon]]);
    bounds.extend([next.lat, lon]);
    if (domUserLoc && domDistanceKm(domUserLoc, p) < 50) bounds.extend([domUserLoc.lat, domUserLoc.lon]);
    dominanzMap.fitBounds(bounds.pad(0.25), { maxZoom: 14, animate: false });
    domPaint();
}

function domSelect(p, known, opts = {}) {
    if (!dominanzMap || !p) return;
    const cfg = domCfg();
    if (!opts.isFallback && !opts.isAutoNearest) domManualOverride = true;
    if (domRefMarker) { dominanzMap.removeLayer(domRefMarker); domRefMarker = null; }
    if (domPickMarker) { dominanzMap.removeLayer(domPickMarker); domPickMarker = null; }
    domReference = null;
    domActive = p;
    const token = ++domGen;

    const si = document.getElementById('dom-search-input');
    if (si && opts.clearSearchInput) si.value = '';
    setDomStatus('');

    if (domCircle) dominanzMap.removeLayer(domCircle);
    if (domSelMarker) dominanzMap.removeLayer(domSelMarker);
    domCircle = (p.isolation > 0 && domMode !== 'weather') ? domGeodesic(p, p.isolation * 1000) : null;
    if (domCircle && document.getElementById('dom-show-circle').checked) domCircle.addTo(dominanzMap);

    domSelMarker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: 'domSelWrap', html: '<span class="domSelDot"></span>', iconSize: [18, 18] }),
        title: p.name, zIndexOffset: 1100
    }).addTo(dominanzMap);

    if (opts.zoomToTarget) dominanzMap.setView([p.lat, p.lon], opts.zoomToTarget);
    else if (domCircle) dominanzMap.fitBounds(domCircle.getBounds().pad(0.4), { maxZoom: 12, animate: false });
    else dominanzMap.setView([p.lat, p.lon], 10);
    domPaint();

    let userDistHtml = '';
    if (domUserLoc) {
        userDistHtml = `
            <div style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; border-radius:11px; padding:8px 11px; font-size:12.5px; font-weight:700; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
                <span>🧭 Abstand von deinem Standort:</span>
                <span id="dom-active-user-dist" style="font-family:'JetBrains Mono',monospace;">${domNum(domDistanceKm(domUserLoc, p), 2)} km (${domCompassDirection(domUserLoc, p)})</span>
            </div>
        `;
    }

    let extraContextHtml = '';
    if (domMode === 'weather') {
        extraContextHtml = `<div id="dom-weather-station-box" style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px; padding:10px 12px; margin-bottom:10px; font-size:12.5px;">⏳ Lade Zusatz-Synoptik …</div>`;
    } else if (domMode === 'powerplants') {
        extraContextHtml = `<div id="dom-live-power-box" style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px; padding:10px 12px; margin-bottom:10px; font-size:12.5px;">⏳ Berechne Live-Einspeisung …</div>`;
    } else if (domMode === 'lakes') {
        const swMeta = LAKE_SWIM_META[p.swim || 'yes'] || LAKE_SWIM_META.yes;
        extraContextHtml = `
            <div style="background:${swMeta.badgeBg}; border:1.5px solid ${swMeta.badgeBorder}; color:${swMeta.badgeText}; border-radius:12px; padding:10px 12px; margin-bottom:10px;">
                <div style="font-weight:800; font-size:13.5px; margin-bottom:3px;">${domEsc(p.swimNote || swMeta.label)}</div>
                <div id="dom-lake-live-sub" style="font-size:11.5px; opacity:0.9;">⏳ Lade Vor-Ort-Wetter …</div>
            </div>
        `;
    } else if (domMode === 'castles') {
        const yrTxt = domFormatCastleYear(p);
        if (yrTxt) {
            extraContextHtml = `<div style="background:#fffbeb; border:1.5px solid #fde68a; color:#92400e; border-radius:12px; padding:9px 12px; margin-bottom:10px; font-size:12.5px; font-weight:700; display:flex; justify-content:space-between;"><span>📜 Entstehungszeit:</span><span style="font-family:'JetBrains Mono',monospace; font-weight:800;">${domEsc(yrTxt)}</span></div>`;
        }
    }

    const subtitleDefault = domMode === 'powerplants' ? (PLANT_TYPE_META[p.type]?.label || p.range || 'Kraftwerk') : (p.range || cfg.nounSingular);
    const initialLoc = getInitialPlaceLabel(p);
    const gmapsDirUrl = buildGoogleMapsRouteUrl(p);
    const wikiSearch = 'https://de.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(p.name);

    document.getElementById('dom-detail').innerHTML =
        '<div id="dom-photo"></div>' +
        '<div id="dom-range" class="eyebrow-dark" style="display:block; margin-bottom:3px;">' + domEsc(subtitleDefault) + '</div>' +
        `<h3 style="font-size:24px; font-weight:800; margin:0 0 4px;">${domItemIcon(p)} ${domEsc(p.name)}</h3>` +
        `<div id="dom-loc-subtitle" style="font-size:13px; font-weight:700; color:#047857; margin-bottom:10px;">📍 ${domEsc(initialLoc || 'Ermittle Stadt & Land …')}</div>` +
        userDistHtml +
        '<div class="person-grid-2" style="margin:0 0 10px;">' +
        `<div class="person-box" style="background:#ecfdf5; border-color:#a7f3d0;"><span class="person-role">${domEsc(cfg.valueLabel)}</span><div id="dom-main-val-display" class="person-name" style="font-size:18px;">${domFormatVal(domVal(p))}</div></div>` +
        '<div class="person-box" style="background:#fffbeb; border-color:#fde68a;"><span class="person-role" style="color:var(--amber);">Dominanz ≈</span><div id="dom-iso-val" class="person-name" style="font-size:18px;">' + (p.isolation != null ? domNum(p.isolation, 2) + ' km' : '–') + '</div></div>' +
        '</div>' +
        extraContextHtml +
        '<p id="dom-summary" style="font-size:12.8px; line-height:1.55; color:#334155; margin:0 0 10px;"></p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">' +
        `<a class="btn btn-emerald" href="${gmapsDirUrl}" target="_blank" rel="noopener" style="font-size:12px; padding:7px 12px; text-decoration:none;">🧭 Route (Google Maps) ↗</a>` +
        '<a class="btn btn-dark" id="dom-wiki" href="' + wikiSearch + '" target="_blank" rel="noopener" style="font-size:12px; padding:7px 12px;">Wikipedia ↗</a>' +
        (String(p.id).startsWith('Q') ? '<a class="btn btn-sand" href="https://www.wikidata.org/wiki/' + domEsc(p.id) + '" target="_blank" rel="noopener" style="font-size:12px; padding:7px 12px;">Wikidata ↗</a>' : '') +
        '</div>' +
        `<div id="dom-higher" style="margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0;"><p class="dom-note" style="margin:0;">${domEsc(cfg.refLabel)} wird geprüft …</p></div>`;

    resolvePlaceLabel(p).then(lbl => {
        if (token === domGen && document.getElementById('dom-loc-subtitle')) {
            document.getElementById('dom-loc-subtitle').textContent = lbl ? `📍 ${lbl}` : `📍 ${p.lat.toFixed(4)}° N, ${p.lon.toFixed(4)}° O`;
        }
    });

    domOfferHigher(p, domNearestHigher(p), token, opts.zoomToTarget);
    if (domMode === 'weather') fetchLiveStationTelemetry(p, token);
    if (domMode === 'powerplants') fetchLivePowerplantOutput(p, token);
    if (domMode === 'lakes') fetchLiveLakeBathingInfo(p, token);
    if (String(p.id).startsWith('Q')) domEnrich(p, token, known);
}

async function domGetJSON(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

const domClaim = (e, prop) => e.claims?.[prop]?.filter(c => c.rank !== 'deprecated')
    .sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred'))[0]?.mainsnak.datavalue?.value;

async function domEntity(id) {
    return (await domGetJSON('https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' + id + '&props=labels|claims|sitelinks&languages=de|en&format=json&origin=*')).entities[id];
}

async function domEnrich(p, token, known) {
    try {
        const e = known || await domEntity(p.id);
        if (token !== domGen) return;
        const site = e.sitelinks?.dewiki || e.sitelinks?.enwiki, lang = e.sitelinks?.dewiki ? 'de' : 'en';
        if (site) {
            const wk = document.getElementById('dom-wiki');
            if (wk) wk.href = 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(site.title);
            const r = await domGetJSON('https://' + lang + '.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(site.title) + '&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=650&format=json&origin=*');
            if (token !== domGen) return;
            const page = Object.values(r.query.pages)[0];
            const text = page.extract || '';
            const sm = document.getElementById('dom-summary');
            if (sm) sm.textContent = text.length > 320 ? text.slice(0, 317).replace(/\s+\S*$/, '') + ' …' : text;
            if (page.thumbnail) {
                const ph = document.getElementById('dom-photo');
                if (ph) ph.innerHTML = '<img src="' + domEsc(page.thumbnail.source) + '" alt="' + domEsc(p.name) + '" style="width:100%; max-height:220px; object-fit:cover; border-radius:12px; margin-bottom:10px;">';
            }
        }
    } catch (err) {}
}

function domRenderResults(items, remote = false, showDistance = false) {
    const box = document.getElementById('dom-results');
    if (!box) return;
    box.innerHTML = items.map((p, i) => {
        const isCurrent = domActive && domActive.id === p.id;
        const val = domVal(p);
        let subLine = '';
        if (showDistance && domUserLoc && isFinite(p.lat) && isFinite(p.lon)) {
            subLine = `<div class="dom-live-dist-line" style="font-size:11.5px; color:#2563eb; font-weight:700; margin-top:1px; font-family:'JetBrains Mono',monospace;">🧭 ${domNum(domDistanceKm(domUserLoc, p), 2)} km · Richtung ${domCompassDirection(domUserLoc, p)}</div>`;
        }
        let extraRight = '';
        if (domMode === 'lakes' && p.swim) {
            extraRight = `<div style="font-size:10.5px; font-weight:700; color:${p.swim === 'no' ? '#dc2626' : (p.swim === 'yes' ? '#0284c7' : '#d97706')};">${p.swim === 'no' ? '🚫 Badeverbot' : (p.swim === 'yes' ? '🏊 Baden ok' : '⚠️ Stausee')}</div>`;
        } else if (domMode === 'castles' && (p.year != null || p.age != null)) {
            extraRight = `<div style="font-size:10.5px; color:#64748b;">${domEsc(domFormatCastleYear(p))}</div>`;
        } else if (domMode === 'weather' && p.elev != null) {
            extraRight = `<div style="font-size:10.5px; color:#64748b;">⛰️ ${domNum(cleanStationElev(p.elev), 0)} m ü. NHN</div>`;
        }
        const locHint = getInitialPlaceLabel(p);
        return `
            <div class="peak-item ${isCurrent ? 'active' : ''}" data-i="${i}" data-peak-id="${domEsc(p.id || '')}">
                <div>
                    <div style="font-weight:800; font-size:14px; color:var(--text-dark);">${domItemIcon(p)} ${domEsc(p.name)}</div>
                    ${locHint ? `<div style="font-size:11px; color:#64748b;">📍 ${domEsc(locHint)}</div>` : ''}
                    ${subLine}
                </div>
                <div style="text-align:right;">
                    <div style="font-family:'JetBrains Mono',monospace; font-weight:700; font-size:13px; color:var(--emerald-dark);">
                        ${val != null ? domFormatVal(val) : ''}
                    </div>
                    ${extraRight}
                </div>
            </div>
        `;
    }).join('');
    box.querySelectorAll('.peak-item').forEach((b, i) => {
        b.onclick = () => domSelect(items[i], null, { clearSearchInput: showDistance });
    });
}

async function domSearch() {
    const cfg = domCfg();
    const si = document.getElementById('dom-search-input');
    const cap = document.getElementById('dom-results-Caption');
    const q = (si ? si.value : '').trim();

    if (!q) {
        if (domListMode === 'view' && dominanzMap && domPeaks.length) {
            const b = dominanzMap.getBounds();
            const isCold = (domMode === 'weather' && domWeatherPolarity === 'cold');
            const inView = domPeaks
                .filter(p => isFinite(p.lat) && isFinite(p.lon) && b.contains([p.lat, p.lon]))
                .sort((a, z) => isCold ? ((domVal(a) ?? 999) - (domVal(z) ?? 999)) : ((domVal(z) ?? -999) - (domVal(a) ?? -999)))
                .slice(0, 10);
            if (cap) cap.textContent = `👁️ Top 10 ${cfg.nounPlural} im aktuellen Kartenausschnitt:`;
            domRenderResults(inView, false, Boolean(domUserLoc));
            return;
        }
        if (domUserLoc && domPeaks.length) {
            if (cap) cap.textContent = `🧭 10 nächste ${cfg.nounPlural} rund um deinen Standort (Live):`;
            const nearestList = [...domPeaks]
                .filter(p => isFinite(p.lat) && isFinite(p.lon))
                .map(p => ({ item: p, d: domDistanceKm(domUserLoc, p) }))
                .sort((a, b) => a.d - b.d)
                .slice(0, 10)
                .map(x => x.item);
            domRenderResults(nearestList, false, true);
        } else {
            if (cap) cap.textContent = `🌍 Bekannte Referenz-${cfg.nounPlural}:`;
            domRenderResults(domPeaks.filter(p => cfg.defaultIds.includes(p.id)).slice(0, 8), false, false);
        }
        return;
    }

    if (cap) cap.textContent = '🔍 Suchergebnisse:';
    const local = domPeaks.filter(p => domNorm(p.name).includes(domNorm(q)))
        .sort((a, b) => domNorm(a.name).indexOf(domNorm(q)) - domNorm(b.name).indexOf(domNorm(q))).slice(0, 10);
    domRenderResults(local, false, Boolean(domUserLoc));
}

function openDominanzInfo() { document.getElementById('dom-info-modal')?.classList.add('open'); }
function closeDominanzInfo() { document.getElementById('dom-info-modal')?.classList.remove('open'); }
