// ===================================================================
// BERG-DOMINANZ-ATLAS (LIVE-GPS, HÖHE ÜBER PFEIL, SPEED UNTER PFEIL
// & ECHTZEIT-DISTANZ-RADAR FÜR DIE UMGEBUNGSBERGE)
// ===================================================================

let dominanzMap = null;
let dominanzLayers = {};
let domLayerKey = 'topo';
let domPeaks = [];
let domActive = null;
let domReference = null;
let domCircle = null;
let domSelMarker = null;
let domRefMarker = null;
let domMarkers = null;
let domGen = 0, domSearchGen = 0, domSearchTimer = null;
let domInitDone = false;

// --- GPS-Standort- & Telemetrie-State ---
let domUserLoc = null;          // { lat, lon, heading, speedKmh, altitude, accuracy, ts }
let domUserMarker = null;       // Blauer Pfeil-Marker mit Höhe (oben) & Speed (unten)
let domGeoWatchId = null;       // Laufendes GPS-Tracking während der Fahrt
let domInitialAutoSelected = false;
let domManualOverride = false;
let domLastElevFetchLoc = null; // Letzter Punkt für Höhen-Fallback via Open-Meteo
let domFallbackAltitude = null; // Geländehöhe, falls Browser coords.altitude = null liefert

function initDominanzMapIfNeeded() {
    if (dominanzMap || typeof L === 'undefined') return;
    dominanzMap = L.map('dominanzMapContainer', { zoomControl: true, minZoom: 2, maxZoom: 17 })
        .setView([50.95, 13.95], 9);

    dominanzLayers = buildLayerSet();
    dominanzLayers['topo'].addTo(dominanzMap);
    domLayerKey = 'topo';
    fillLayerSelect('dom-layer-select', 'topo');
    domMarkers = L.layerGroup().addTo(dominanzMap);
    L.control.scale({ imperial: false }).addTo(dominanzMap);
    dominanzMap.on('moveend zoomend', domPaint);

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

    startDomGeolocation(false);
    loadDominanzData();
}

// ===================================================================
// STANDORTERKENNUNG, HÖHEN- & GESCHWINDIGKEITS-BADGES AM BLAUEN PFEIL
// ===================================================================
function formatUserAltText() {
    const alt = (domUserLoc && domUserLoc.altitude != null)
        ? domUserLoc.altitude
        : domFallbackAltitude;
    return alt != null ? `⛰️ ${Math.round(alt)} m` : '⛰️ … m';
}

function formatUserSpeedText() {
    const spd = (domUserLoc && domUserLoc.speedKmh != null && isFinite(domUserLoc.speedKmh))
        ? Math.max(0, Math.round(domUserLoc.speedKmh))
        : 0;
    return `${spd} km/h`;
}

function buildUserLocationIcon(headingDeg) {
    const rot = (typeof headingDeg === 'number' && isFinite(headingDeg)) ? Math.round(headingDeg) : 0;
    const altTxt = formatUserAltText();
    const spdTxt = formatUserSpeedText();

    return L.divIcon({
        className: 'dom-user-loc-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -24],
        html: `
            <div class="dom-user-loc-wrap">
                <div class="dom-user-badge-top">${domEsc(altTxt)}</div>
                <span class="dom-user-loc-ring"></span>
                <span class="dom-user-loc-arrow" style="transform: rotate(${rot}deg);">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"
                              fill="#2563eb" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>
                    </svg>
                </span>
                <div class="dom-user-badge-bottom">${domEsc(spdTxt)}</div>
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
    const brng = domBearingDeg(fromPt, toPt);
    const dirs = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(brng / 22.5) % 16];
}

// Holt die Geländehöhe von Open-Meteo, falls das Smartphone-GPS keine eigene Höhe liefert
function ensureUserAltitudeFallback() {
    if (!domUserLoc) return;
    if (domUserLoc.altitude != null && isFinite(domUserLoc.altitude)) return;
    if (domLastElevFetchLoc && domDistanceKm(domLastElevFetchLoc, domUserLoc) < 0.15 && domFallbackAltitude != null) {
        return;
    }
    domLastElevFetchLoc = { lat: domUserLoc.lat, lon: domUserLoc.lon };
    fetch(`//api.open-meteo.com/v1/elevation?latitude=${domUserLoc.lat.toFixed(5)}&longitude=${domUserLoc.lon.toFixed(5)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (data && Array.isArray(data.elevation) && data.elevation.length) {
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
        domUserMarker = L.marker([lat, lon], {
            icon: buildUserLocationIcon(rot),
            title: 'Mein Standort (GPS)',
            zIndexOffset: 1600
        }).addTo(dominanzMap);
    } else {
        domUserMarker.setLatLng([lat, lon]);
        // Direktes DOM-Update verhindert ein Zurücksetzen der Blink-Animation!
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

    const nearest = findNearestPeakTo(lat, lon);
    const distStr = nearest ? `${domNum(nearest.distKm, 2)} km (${domCompassDirection(domUserLoc, nearest.peak)})` : '';
    const accStr = accuracy ? ` · ±${Math.round(accuracy)} m` : '';
    domUserMarker.bindPopup(
        `<b>🧭 Mein Standort</b>${accStr}<br>` +
        `<span style="font-size:12px;color:#047857;font-weight:700;">${domEsc(formatUserAltText())} · 🚗 ${domEsc(formatUserSpeedText())}</span><br>` +
        `<span style="font-size:11.5px;color:#475569;">${lat.toFixed(5)}° N, ${lon.toFixed(5)}° O</span>` +
        (nearest ? `<br><span style="font-size:12.5px;">⛰️ Nächster Berg: <b>${domEsc(nearest.peak.name)}</b> (${distStr})</span>` : '')
    );
}

// Aktualisiert bei jeder Positionsänderung sofort alle Distanzen (Liste, aktiver Berg & Statuszeile)
function refreshLiveUserDistancesUI() {
    if (!domUserLoc || !domPeaks.length) return;

    // 1. Obere Statuszeile aktualisieren
    const nearest = findNearestPeakTo(domUserLoc.lat, domUserLoc.lon);
    const startInfo = document.getElementById('dom-start-info');
    if (nearest && startInfo) {
        const dir = domCompassDirection(domUserLoc, nearest.peak);
        startInfo.innerHTML =
            `📍 <b>${domEsc(formatUserAltText())}</b> · 🚗 <b>${domEsc(formatUserSpeedText())}</b> · ` +
            `Nächster Berg: <b>${domEsc(nearest.peak.name)}</b> (${domNum(nearest.distKm, 2)} km ${dir})`;
    }

    // 2. Distanz-Anzeige in der Detail-Box des aktuell gewählten Bergs aktualisieren
    if (domActive && isFinite(domActive.lat) && isFinite(domActive.lon)) {
        const distEl = document.getElementById('dom-active-user-dist');
        if (distEl) {
            const dActive = domDistanceKm(domUserLoc, domActive);
            const dirActive = domCompassDirection(domUserLoc, domActive);
            distEl.textContent = `${domNum(dActive, 2)} km (${dirActive})`;
        }
    }

    // 3. Liste der nächstgelegenen Berge (oder aktuelle Suchtreffer) live mit neuer Distanz aktualisieren
    const si = document.getElementById('dom-search-input');
    const q = (si ? si.value : '').trim();
    if (!q) {
        const cap = document.getElementById('dom-results-Caption');
        if (cap) cap.textContent = '🧭 Nächste Berge rund um deinen Standort (Live):';
        const nearestList = [...domPeaks]
            .filter(p => isFinite(p.lat) && isFinite(p.lon))
            .map(p => ({ peak: p, d: domDistanceKm(domUserLoc, p) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 10)
            .map(x => x.peak);
        domRenderResults(nearestList, false, true);
    } else {
        // Falls eine Suche aktiv ist, die Distanz-Badges der sichtbaren Suchergebnisse live nachziehen
        document.querySelectorAll('#dom-results .peak-item[data-peak-id]').forEach(row => {
            const pid = row.getAttribute('data-peak-id');
            const pk = domPeaks.find(x => x.id === pid);
            const badge = row.querySelector('.dom-live-dist-line');
            if (pk && badge) {
                const dKm = domDistanceKm(domUserLoc, pk);
                const dir = domCompassDirection(domUserLoc, pk);
                badge.textContent = `🧭 ${domNum(dKm, 2)} km · Richtung ${dir}`;
            }
        });
    }
}

function findNearestPeakTo(lat, lon) {
    if (!domPeaks || !domPeaks.length) return null;
    const pt = { lat, lon };
    let bestPeak = null;
    let minKm = Infinity;
    for (const p of domPeaks) {
        if (!isFinite(p.lat) || !isFinite(p.lon)) continue;
        const d = domDistanceKm(pt, p);
        if (d < minKm) {
            minKm = d;
            bestPeak = p;
        }
    }
    return bestPeak ? { peak: bestPeak, distKm: minKm } : null;
}

function selectNearestPeakForUser(forceSelect = false) {
    if (!domUserLoc || !domPeaks.length) return;
    const nearest = findNearestPeakTo(domUserLoc.lat, domUserLoc.lon);
    if (!nearest) return;

    if (forceSelect || !domInitialAutoSelected || !domManualOverride) {
        domInitialAutoSelected = true;
        domSelect(nearest.peak, null, { isAutoNearest: true, clearSearchInput: true });
    }
    refreshLiveUserDistancesUI();
}

function startDomGeolocation(forceSelectNearest = false) {
    if (!navigator.geolocation) {
        setDomStatus('Standorterkennung wird von diesem Browser nicht unterstützt.');
        return;
    }
    if (forceSelectNearest) {
        setDomStatus('🧭 Bestimme GPS-Standort & suche nächstgelegenen Berg …');
    }

    const onPosSuccess = (pos, shouldSelect) => {
        const prevLoc = domUserLoc;
        const nowTs = pos.timestamp || Date.now();
        const newLat = pos.coords.latitude;
        const newLon = pos.coords.longitude;

        // 1. Geschwindigkeit (km/h): Direkt vom GPS (m/s * 3.6) oder aus Positionsdelta berechnen
        let speedKmh = null;
        if (pos.coords.speed != null && isFinite(pos.coords.speed) && pos.coords.speed >= 0) {
            speedKmh = pos.coords.speed * 3.6;
        } else if (prevLoc && prevLoc.ts && nowTs > prevLoc.ts) {
            const dtHours = (nowTs - prevLoc.ts) / 3600000;
            const dKm = domDistanceKm(prevLoc, { lat: newLat, lon: newLon });
            if (dtHours > 0.0002 && dKm >= 0.008 && dKm / dtHours < 260) {
                speedKmh = dKm / dtHours;
            } else {
                speedKmh = prevLoc.speedKmh || 0;
            }
        } else {
            speedKmh = 0;
        }

        // 2. Fahrtrichtung (Heading): Direkt vom GPS oder aus Bewegungsvektor berechnen
        let heading = (pos.coords.heading != null && isFinite(pos.coords.heading) && pos.coords.heading >= 0)
            ? pos.coords.heading
            : null;
        if (heading === null && prevLoc) {
            const movedKm = domDistanceKm(prevLoc, { lat: newLat, lon: newLon });
            if (movedKm > 0.012) {
                heading = domBearingDeg(prevLoc, { lat: newLat, lon: newLon });
            } else {
                heading = prevLoc.heading || 0;
            }
        }

        // 3. Höhe (m ü. NHN): Direkt vom GPS oder per Open-Meteo-Geländemodell
        const gpsAlt = (pos.coords.altitude != null && isFinite(pos.coords.altitude))
            ? Math.round(pos.coords.altitude)
            : null;

        domUserLoc = {
            lat: newLat,
            lon: newLon,
            heading: heading,
            speedKmh: speedKmh,
            altitude: gpsAlt,
            accuracy: pos.coords.accuracy,
            ts: nowTs
        };

        ensureUserAltitudeFallback();
        updateDomUserMarker();

        if (shouldSelect || !domInitialAutoSelected) {
            if (shouldSelect) domManualOverride = false;
            selectNearestPeakForUser(shouldSelect);
            if (shouldSelect) setDomStatus('');
        } else {
            // Bei JEDEM GPS-Impuls sofort alle Distanzen in der Liste & im Cockpit aktualisieren!
            refreshLiveUserDistancesUI();
        }
    };

    navigator.geolocation.getCurrentPosition(
        (pos) => onPosSuccess(pos, forceSelectNearest),
        () => {
            navigator.geolocation.getCurrentPosition(
                (pos) => onPosSuccess(pos, forceSelectNearest),
                () => {
                    const startInfo = document.getElementById('dom-start-info');
                    if (startInfo && !domUserLoc) {
                        startInfo.textContent = 'Standort nicht freigegeben · Fallback: Zugspitze';
                    }
                    if (forceSelectNearest) {
                        setDomStatus('Standortzugriff nicht freigegeben – bitte GPS im Browser erlauben.');
                    }
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
            );
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );

    if (domGeoWatchId === null) {
        try {
            domGeoWatchId = navigator.geolocation.watchPosition(
                (pos) => onPosSuccess(pos, false),
                () => {},
                { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
            );
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
// EIGENER PUNKT: DOMINANZ PER KARTENKLICK MESSEN
// ===================================================================
let domPickMode = false;
let domPickMarker = null;

function toggleDomPickMode() {
    domPickMode = !domPickMode;
    const btn = document.getElementById('dom-pick-btn');
    if (!dominanzMap) return;
    if (domPickMode) {
        btn.textContent = '📍 Eigenen Punkt setzen: AN (auf Karte klicken)';
        btn.className = 'btn btn-emerald';
        dominanzMap.getContainer().style.cursor = 'crosshair';
        setDomStatus('Klicke auf die Karte, um die Dominanz eines beliebigen Punkts zu messen.');
    } else {
        btn.textContent = '📍 Eigenen Punkt setzen: AUS';
        btn.className = 'btn btn-amber';
        dominanzMap.getContainer().style.cursor = '';
        setDomStatus('');
    }
}

function measureDomPoint(lat, lon) {
    domManualOverride = true;
    const token = ++domGen;
    setDomStatus('Höhe & Dominanz werden berechnet …');
    if (domPickMarker) dominanzMap.removeLayer(domPickMarker);
    domPickMarker = L.marker([lat, lon], {
        icon: L.divIcon({ className: 'domPickWrap', html: '<span class="domPickDot"></span>', iconSize: [16, 16] }),
        title: 'Gewählter Punkt', zIndexOffset: 1200
    }).addTo(dominanzMap);
    fetch(`//api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (token !== domGen) return;
            const elev = (data && data.elevation && data.elevation.length) ? Math.round(data.elevation[0]) : null;
            let best = null, bestd = Infinity;
            if (elev != null) {
                const pt = { lat, lon };
                for (const q of domPeaks) {
                    if ((q.height || 0) <= elev) continue;
                    const d = domDistanceKm(pt, { lat: q.lat, lon: q.lon });
                    if (d < bestd && d > 0.001) { bestd = d; best = q; }
                }
            }
            const p = {
                id: 'pick', name: 'Gewählter Kartenpunkt', lat, lon,
                height: elev, isolation: best ? round2(bestd) : null, isoCalc: true,
                range: 'Live-Messung (Open-Meteo)',
                refName: best ? best.name : null, refLat: best ? best.lat : null, refLon: best ? best.lon : null
            };
            if (token !== domGen) return;
            renderPickResult(p, best);
            setDomStatus('');
        })
        .catch(() => { if (token === domGen) setDomStatus('Höhenabfrage nicht erreichbar – bitte erneut versuchen.'); });
}

function round2(x) { return Math.round(x * 100) / 100; }

function renderPickResult(p, ref) {
    domActive = p; domReference = ref || null;
    if (domSelMarker) { dominanzMap.removeLayer(domSelMarker); domSelMarker = null; }
    if (domRefMarker) { dominanzMap.removeLayer(domRefMarker); domRefMarker = null; }
    if (domCircle) { dominanzMap.removeLayer(domCircle); domCircle = null; }
    if (ref && p.isolation) {
        domCircle = domGeodesic({lat:p.lat, lon:p.lon}, p.isolation * 1000, {lat:ref.lat, lon:ref.lon});
        if (document.getElementById('dom-show-circle').checked) domCircle.addTo(dominanzMap);
        let lon = ref.lon;
        while (lon - p.lon > 180) lon -= 360; while (lon - p.lon < -180) lon += 360;
        domRefMarker = L.marker([ref.lat, lon], {
            icon: L.divIcon({ className: 'domHigherPeak', html: '<span class="domHigherCore"></span>', iconSize: [22,22] }),
            title: 'Nächsthöherer Berg: ' + ref.name, zIndexOffset: 1000
        }).bindTooltip(domEsc(ref.name), { permanent: true, direction: 'top', className: 'domHigherTip', offset: [0,-10] })
            .on('click', () => domSelect(ref)).addTo(dominanzMap);
        const b = domCircle.getBounds(); b.extend([ref.lat, lon]);
        dominanzMap.fitBounds(b.pad(0.25), { maxZoom: 13, animate: false });
    }
    document.getElementById('dom-detail').innerHTML =
        '<div class="eyebrow-dark" style="display:block; margin-bottom:4px;">📍 Live-Messung (Open-Meteo)</div>' +
        '<h3 style="font-size:22px; font-weight:800; margin:0 0 12px;">Gewählter Kartenpunkt</h3>' +
        '<div class="person-grid-2" style="margin:0 0 10px;">' +
        '<div class="person-box" style="background:#ecfdf5; border-color:#a7f3d0;"><span class="person-role">Höhe (geschätzt)</span><div class="person-name" style="font-size:18px;">' + (p.height != null ? domNum(p.height) + ' m' : '–') + '</div></div>' +
        '<div class="person-box" style="background:#fffbeb; border-color:#fde68a;"><span class="person-role" style="color:var(--amber);">Dominanz ≈</span><div class="person-name" style="font-size:18px;">' + (p.isolation != null ? domNum(p.isolation, 2) + ' km' : '–') + '</div></div>' +
        '</div>' +
        (ref ? '<p class="dom-note">Nächsthöherer Gipfel: <b>' + domEsc(ref.name) + '</b> (' + domNum(ref.height) + ' m) – ' + domNum(p.isolation, 2) + ' km entfernt.</p>' : '<p class="dom-note">Kein höherer Gipfel im Datensatz gefunden.</p>') +
        '<p class="dom-note">Koordinaten: ' + p.lat.toFixed(4) + '°, ' + p.lon.toFixed(4) + '°. Höhe live via Open-Meteo, Dominanz näherungsweise (Distanz zum nächsten höheren Gipfel).</p>';
}

function normalizeHeightMeters(h) {
    if (typeof h !== 'number' || !isFinite(h)) return h;
    if (h > 8849) return Math.round(h * 0.3048);
    return h;
}

function loadDominanzData() {
    if (domInitDone) return;
    setDomStatus('Bergdaten werden geladen …');
    fetch('peaks.json', { signal: AbortSignal.timeout(20000) })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(data => {
            data.forEach(p => { p.height = normalizeHeightMeters(p.height); });
            domPeaks = data;
            domInitDone = true;
            setDomStatus('');
            const cnt = document.getElementById('dom-count');
            if (cnt) cnt.textContent = domNum(domPeaks.length) + ' Gipfel weltweit';

            if (dominanzMap) dominanzMap.invalidateSize();

            if (domUserLoc) {
                updateDomUserMarker();
                selectNearestPeakForUser(true);
            } else {
                const z = domPeaks.find(p => p.name === 'Zugspitze') || domPeaks.find(p => p.id === 'Q3375');
                if (z) domSelect(z, null, { isFallback: true, clearSearchInput: true });
                domSearch();
            }

            domPaint();
            setTimeout(() => { if (dominanzMap) dominanzMap.invalidateSize(); domPaint(); }, 300);
            setTimeout(() => { if (dominanzMap) dominanzMap.invalidateSize(); domPaint(); }, 700);
        })
        .catch(() => {
            setDomStatus('Bergdaten (peaks.json) konnten nicht geladen werden. Bitte Seite neu laden.');
            const cnt = document.getElementById('dom-count');
            if (cnt) cnt.textContent = 'Daten nicht erreichbar';
        });
}

function setDomStatus(txt) { const el = document.getElementById('dom-status'); if (el) el.textContent = txt; }

function setDominanzLayer(key) {
    initDominanzMapIfNeeded();
    if (!dominanzMap || !dominanzLayers[key]) return;
    Object.values(dominanzLayers).forEach(l => dominanzMap.removeLayer(l));
    dominanzLayers[key].addTo(dominanzMap);
    domLayerKey = key;
    const sel = document.getElementById('dom-layer-select');
    if (sel && sel.value !== key) sel.value = key;
}

function dominanzWorldView() { if (dominanzMap) dominanzMap.setView([25, 10], 2); }

function domColorForHeight(h) {
    if (h == null) return '#94a3b8';
    if (h > 7000) return '#8b2fc9';
    if (h >= 6000) return '#e01b1b';
    if (h >= 5000) return '#f2766e';
    if (h >= 4000) return '#f27405';
    if (h >= 3000) return '#d9a406';
    if (h >= 2000) return '#f2d307';
    if (h >= 1000) return '#5bd16a';
    return '#1a6b2e';
}

function domRadiusForHeight(h) {
    if (h == null) return 5;
    if (h > 7000) return 9;
    if (h >= 5000) return 8;
    if (h >= 3000) return 7;
    if (h >= 2000) return 6;
    return 5;
}

function domMaxForZoom(z) {
    if (z <= 3) return 60;
    if (z <= 4) return 110;
    if (z <= 5) return 180;
    if (z <= 6) return 260;
    if (z <= 7) return 360;
    if (z <= 8) return 480;
    if (z <= 10) return 650;
    return 850;
}

function domPaint() {
    if (!domMarkers || !dominanzMap) return;
    domMarkers.clearLayers();
    const b = dominanzMap.getBounds().pad(0.08);
    const cap = domMaxForZoom(dominanzMap.getZoom());
    const shown = domPeaks
        .filter(p => b.contains([p.lat, p.lon]) && p.id !== domActive?.id && p.id !== domReference?.id)
        .sort((a, c) => (c.height || 0) - (a.height || 0))
        .slice(0, cap);
    shown.forEach(p => {
        const r = domRadiusForHeight(p.height);
        L.circleMarker([p.lat, p.lon], {
            radius: r, color: 'rgba(0,0,0,0.45)', weight: 1,
            fillColor: domColorForHeight(p.height), fillOpacity: 0.95
        }).bindTooltip(domEsc(p.name) + (p.height != null ? ' (' + domNum(p.height) + ' m)' : ''))
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
    const segs = [];
    let cur = [];
    for (let i = 0; i < raw.length; i++) {
        if (i > 0 && Math.abs(raw[i][1] - raw[i - 1][1]) > 180) {
            if (cur.length) segs.push(cur);
            cur = [];
        }
        cur.push(raw[i]);
    }
    if (cur.length) segs.push(cur);
    return segs;
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
    const segs = domSplitAntimeridian(raw);
    const parts = [];
    segs.forEach(s => {
        parts.push(L.polyline(s, { color: '#ffffff', weight: 6, opacity: .9, interactive: false }));
        parts.push(L.polyline(s, { color: '#2563eb', weight: 3, opacity: 1, dashArray: '10, 8', interactive: false }));
    });
    return L.featureGroup(parts);
}

function domGeodesic(p, r, target) {
    if (r / 1000 > DOM_CIRCLE_MAX_KM && target) {
        return domGeoLine(p, target);
    }
    const R = 6371008.8, d = r / R, a = p.lat * Math.PI / 180, b = p.lon * Math.PI / 180;
    const bearing = target ? Math.atan2(
        Math.sin((target.lon - p.lon) * Math.PI / 180) * Math.cos(target.lat * Math.PI / 180),
        Math.cos(a) * Math.sin(target.lat * Math.PI / 180) - Math.sin(a) * Math.cos(target.lat * Math.PI / 180) * Math.cos((target.lon - p.lon) * Math.PI / 180)
    ) : 0;
    const raw = [];
    for (let i = 0; i <= 360; i++) {
        const t = bearing + i * Math.PI / 180;
        raw.push(domDestination(a, b, d, t));
    }
    const segs = domSplitAntimeridian(raw);
    if (segs.length === 1) {
        const pts = segs[0];
        return L.featureGroup([
            L.polygon(pts, { color: '#ffffff', weight: 6, opacity: .9, fill: false, interactive: false }),
            L.polygon(pts, { color: '#2563eb', weight: 3, opacity: 1, dashArray: '10, 8', fillColor: '#3b82f6', fillOpacity: .10, interactive: false })
        ]);
    }
    const parts = [];
    segs.forEach(s => {
        parts.push(L.polyline(s, { color: '#ffffff', weight: 6, opacity: .9, interactive: false }));
        parts.push(L.polyline(s, { color: '#2563eb', weight: 3, opacity: 1, dashArray: '10, 8', interactive: false }));
    });
    return L.featureGroup(parts);
}

function domNearestHigher(p) {
    if (p.id === 'Q513' || !Number.isFinite(p.height)) return null;
    let best = null, min = Infinity;
    for (const c of domPeaks) {
        if (c.id === p.id || !Number.isFinite(c.height) || c.height <= p.height) continue;
        const d = domDistanceKm(p, c);
        if (d > 0.01 && d < min) { best = c; min = d; }
    }
    return best;
}

function domOfferHigher(p, next, token) {
    if (token !== domGen) return;
    const box = document.getElementById('dom-higher');
    if (!box) return;
    if (!next) {
        box.innerHTML = '<p class="dom-note">' +
            (p.id === 'Q513' ? '🏔️ Mount Everest – höchster Berg der Erde. Kein höherer Bezugsgipfel.' :
            p.height == null ? 'Für die Bezugssuche wird eine bekannte Gipfelhöhe benötigt.' :
            'Kein höherer Gipfel im Datensatz gefunden.') + '</p>';
        return;
    }
    domReference = next;
    const domDistKm = domDistanceKm(p, next);
    const asLine = domDistKm > DOM_CIRCLE_MAX_KM;
    if (domCircle) dominanzMap.removeLayer(domCircle);
    domCircle = domGeodesic(p, domDistKm * 1000, next);
    if (document.getElementById('dom-show-circle').checked) domCircle.addTo(dominanzMap);
    document.getElementById('dom-circle-label').textContent = asLine ? 'Linie zum Bezugsgipfel' : 'Kreis zum Bezugsgipfel';

    if (domRefMarker) dominanzMap.removeLayer(domRefMarker);
    let lon = next.lon;
    while (lon - p.lon > 180) lon -= 360;
    while (lon - p.lon < -180) lon += 360;
    domRefMarker = L.marker([next.lat, lon], {
        icon: L.divIcon({ className: 'domHigherPeak', html: '<span class="domHigherCore"></span>', iconSize: [22, 22] }),
        title: 'Nächsthöherer Berg: ' + next.name, zIndexOffset: 1000
    }).bindTooltip(domEsc(next.name), { permanent: true, direction: 'top', className: 'domHigherTip', offset: [0, -10] })
        .on('click', () => domSelect(next)).addTo(dominanzMap);

    box.innerHTML =
        '<button type="button" class="dom-higher-btn">⬆️ Nächsthöherer Berg: ' + domEsc(next.name) +
        ' <span class="dom-higher-h">' + domNum(next.height) + ' m</span> →</button>' +
        '<p class="dom-note">' + domNum(domDistKm, 2) +
        (asLine
            ? ' km bis zum Bezugsgipfel. Bei so großer Dominanz wäre der Kreis fast ein ganzer Erdumlauf – daher zeigt die Karte die direkte Linie zum Bezugsgipfel.'
            : ' km bis zum Bezugsgipfel (Kreisradius).') +
        ' Klick dich weiter – irgendwann landest du beim Mount Everest.</p>';
    box.querySelector('button').onclick = () => domSelect(next);

    const bounds = domCircle ? domCircle.getBounds() : L.latLngBounds([[p.lat, p.lon]]);
    bounds.extend([next.lat, lon]);
    if (domUserLoc && domDistanceKm(domUserLoc, p) < 50) {
        bounds.extend([domUserLoc.lat, domUserLoc.lon]);
    }
    dominanzMap.fitBounds(bounds.pad(0.25), { maxZoom: 14, animate: false });
    domPaint();
}

function domSelect(p, known, opts = {}) {
    if (!dominanzMap) return;
    if (!opts.isFallback && !opts.isAutoNearest) {
        domManualOverride = true;
    }
    if (domPickMode) {
        domPickMode = false;
        const pb = document.getElementById('dom-pick-btn');
        if (pb) { pb.textContent = '📍 Eigenen Punkt setzen: AUS'; pb.className = 'btn btn-amber'; }
        dominanzMap.getContainer().style.cursor = '';
    }
    if (domRefMarker) { dominanzMap.removeLayer(domRefMarker); domRefMarker = null; }
    if (domPickMarker) { dominanzMap.removeLayer(domPickMarker); domPickMarker = null; }
    domReference = null;
    document.getElementById('dom-circle-label').textContent = 'Dominanzradius';
    domActive = p;
    const token = ++domGen;

    const si = document.getElementById('dom-search-input');
    if (si) {
        if (opts.clearSearchInput) {
            si.value = '';
        } else {
            si.value = p.name;
            document.getElementById('dom-results').innerHTML = '';
            const cap = document.getElementById('dom-results-Caption');
            if (cap) cap.textContent = '';
        }
    }
    setDomStatus('');

    if (domCircle) dominanzMap.removeLayer(domCircle);
    if (domSelMarker) dominanzMap.removeLayer(domSelMarker);
    domCircle = (p.isolation > 0) ? domGeodesic(p, p.isolation * 1000) : null;
    if (domCircle && document.getElementById('dom-show-circle').checked) domCircle.addTo(dominanzMap);

    domSelMarker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: 'domSelWrap', html: '<span class="domSelDot"></span>', iconSize: [18, 18] }),
        title: p.name, zIndexOffset: 1100
    }).addTo(dominanzMap);

    if (domCircle) {
        const b = domCircle.getBounds();
        if (domUserLoc && domDistanceKm(domUserLoc, p) < 50) b.extend([domUserLoc.lat, domUserLoc.lon]);
        dominanzMap.fitBounds(b.pad(0.4), { maxZoom: 12, animate: false });
    } else {
        dominanzMap.setView([p.lat, p.lon], 10);
    }
    domPaint();

    let userDistHtml = '';
    if (domUserLoc) {
        const distFromUser = domDistanceKm(domUserLoc, p);
        const dirFromUser = domCompassDirection(domUserLoc, p);
        userDistHtml = `
            <div style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; border-radius:11px; padding:8px 11px; font-size:12.5px; font-weight:700; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
                <span>🧭 Abstand von deinem Standort:</span>
                <span id="dom-active-user-dist" style="font-family:'JetBrains Mono',monospace;">${domNum(distFromUser, 2)} km (${dirFromUser})</span>
            </div>
        `;
    }

    const wikiSearch = '//de.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(p.name);
    document.getElementById('dom-detail').innerHTML =
        '<div id="dom-photo"></div>' +
        '<div id="dom-range" class="eyebrow-dark" style="display:block; margin-bottom:4px;">' + domEsc(p.range || 'Gebirge wird geprüft …') + '</div>' +
        '<h3 style="font-size:24px; font-weight:800; margin:0 0 10px;">⛰️ ' + domEsc(p.name) + '</h3>' +
        userDistHtml +
        '<div class="person-grid-2" style="margin:0 0 10px;">' +
        '<div class="person-box" style="background:#ecfdf5; border-color:#a7f3d0;"><span class="person-role">Höhe ü. NHN</span><div class="person-name" style="font-size:18px;">' + domNum(p.height) + ' m</div></div>' +
        '<div class="person-box" style="background:#fffbeb; border-color:#fde68a;"><span class="person-role" style="color:var(--amber);">Dominanz' + (p.isoCalc ? ' ≈' : '') + '</span><div class="person-name" style="font-size:18px;">' + (p.isolation != null ? domNum(p.isolation, 2) + ' km' : '–') + '</div></div>' +
        '</div>' +
        '<div id="dom-higher" style="margin:4px 0 10px;"><p class="dom-note">Bezugsgipfel wird geprüft …</p></div>' +
        '<p id="dom-summary" style="font-size:12.8px; line-height:1.55; color:#334155; margin:0 0 10px;"></p>' +
        (p.isoCalc ? '<p class="dom-note">≈ Dominanz aus Koordinaten berechnet (Distanz zum nächsten höheren Gipfel im Datensatz).</p>' : '') +
        (p.isolation == null ? '<p class="dom-note">' + (p.id === 'Q513' ? 'Höchster Berg der Erde: kein höherer Berg und kein endlicher Dominanzkreis.' : 'Kein höherer Gipfel im Datensatz.') + '</p>' : '') +
        '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">' +
        '<a class="btn btn-dark" id="dom-wiki" href="' + wikiSearch + '" target="_blank" rel="noopener" style="font-size:12px; padding:7px 12px;">Auf Wikipedia weiterlesen ↗</a>' +
        '<a class="btn btn-sand" href="//www.wikidata.org/wiki/' + domEsc(p.id) + '" target="_blank" rel="noopener" style="font-size:12px; padding:7px 12px;">Wikidata ↗</a>' +
        '</div>';

    domOfferHigher(p, domNearestHigher(p), token);
    domEnrich(p, token, known);
}

async function domGetJSON(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

const domClaim = (e, prop) => e.claims?.[prop]?.filter(c => c.rank !== 'deprecated')
    .sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred'))[0]?.mainsnak.datavalue?.value;

async function domEntity(id) {
    return (await domGetJSON('//www.wikidata.org/w/api.php?action=wbgetentities&ids=' + id + '&props=labels|claims|sitelinks&languages=de|en&format=json&origin=*')).entities[id];
}

function domPeakFromEntity(e, id) {
    const c = domClaim(e, 'P625'); if (!c) return null;
    const h = domClaim(e, 'P2044'), iso = domClaim(e, 'P2659'), unit = iso?.unit?.split('/').pop();
    return {
        id,
        name: e.labels.de?.value || e.labels.en?.value || id,
        lat: c.latitude,
        lon: c.longitude,
        height: h ? normalizeHeightMeters(+h.amount) : null,
        isolation: iso ? +iso.amount * (unit === 'Q11573' ? .001 : unit === 'Q253276' ? 1.609344 : 1) : null,
        range: null
    };
}

async function domEnrich(p, token, known) {
    try {
        const e = known || await domEntity(p.id);
        if (token !== domGen) return;
        const range = domClaim(e, 'P4552');
        if (!p.range && range) {
            const re = await domEntity(range.id);
            if (token === domGen) {
                const r = re.labels.de?.value || re.labels.en?.value || 'Gebirge nicht angegeben';
                p.range = r;
                const el = document.getElementById('dom-range');
                if (el) el.textContent = r;
            }
        } else if (!p.range) {
            const el = document.getElementById('dom-range');
            if (el) el.textContent = 'Gebirge nicht angegeben';
        }

        const site = e.sitelinks.dewiki || e.sitelinks.enwiki, lang = e.sitelinks.dewiki ? 'de' : 'en';
        if (site) {
            const url = '//' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(site.title);
            const wk = document.getElementById('dom-wiki'); if (wk) wk.href = url;
            const r = await domGetJSON('//' + lang + '.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(site.title) + '&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=650&format=json&origin=*');
            if (token !== domGen) return;
            const page = Object.values(r.query.pages)[0]; const text = page.extract || '';
            const sm = document.getElementById('dom-summary');
            if (sm) sm.textContent = text.length > 320 ? text.slice(0, 317).replace(/\s+\S*$/, '') + ' …' : text;
            if (page.thumbnail) {
                const ph = document.getElementById('dom-photo');
                if (ph) ph.innerHTML = '<img src="' + domEsc(page.thumbnail.source) + '" alt="' + domEsc(p.name) + '" style="width:100%; border-radius:12px; margin-bottom:10px;">';
            }
        }
        if (p.id === 'Q513') return;

        const article = e.sitelinks.dewiki || e.sitelinks.enwiki;
        if (article) {
            const w = await domGetJSON('//' + lang + '.wikipedia.org/w/api.php?action=parse&page=' + encodeURIComponent(article.title) + '&prop=wikitext&format=json&origin=*');
            if (token !== domGen) return;
            const field = (w.parse?.wikitext?.['*'] || '').match(/\|\s*(?:isolation_parent|DOMINANZ-BEZUG)\s*=([^\n]+)/i);
            const link = field?.[1]?.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
            if (link) {
                const data = await domGetJSON('//' + lang + '.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(link[1]) + '&redirects=1&prop=pageprops&format=json&origin=*');
                if (token !== domGen) return;
                const id = Object.values(data.query.pages)[0]?.pageprops?.wikibase_item;
                if (id && id !== p.id) {
                    let next = domPeaks.find(x => x.id === id);
                    if (!next) {
                        const eNext = await domEntity(id);
                        if (token !== domGen) return;
                        next = domPeakFromEntity(eNext, id);
                        if (next) domPeaks.push(next);
                    }
                    if (next && (next.height == null || p.height == null || next.height > p.height)) domOfferHigher(p, next, token);
                }
            }
        }
    } catch (err) {
        if (token === domGen && !p.range) {
            const el = document.getElementById('dom-range');
            if (el) el.textContent = 'Gebirge nicht angegeben';
        }
    }
}

// ===================================================================
// SUCHE & ECHTZEIT-UMGEBUNGSLISTE (INKL. LIVE-DISTANZ-NACHFÜHRUNG)
// ===================================================================
function domRenderResults(items, remote = false, showDistance = false) {
    const box = document.getElementById('dom-results');
    if (!box) return;
    box.innerHTML = items.map((p, i) => {
        const isCurrent = domActive && domActive.id === p.id;
        let subLine = '';
        if (showDistance && domUserLoc && isFinite(p.lat) && isFinite(p.lon)) {
            const dKm = domDistanceKm(domUserLoc, p);
            const dir = domCompassDirection(domUserLoc, p);
            subLine = `<div class="dom-live-dist-line" style="font-size:11.5px; color:#2563eb; font-weight:700; margin-top:1px; font-family:'JetBrains Mono',monospace;">🧭 ${domNum(dKm, 2)} km · Richtung ${dir}</div>`;
        }
        return `
            <div class="peak-item ${isCurrent ? 'active' : ''}" data-i="${i}" data-peak-id="${domEsc(p.id || '')}">
                <div>
                    <div style="font-weight:800; font-size:14px; color:var(--text-dark);">⛰️ ${domEsc(p.name)}</div>
                    ${subLine}
                </div>
                <div style="text-align:right;">
                    <div style="font-family:'JetBrains Mono',monospace; font-weight:700; font-size:13px; color:var(--emerald-dark);">
                        ${p.height ? domNum(p.height) + ' m' : (remote ? 'Wikidata ↗' : '')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    box.querySelectorAll('.peak-item').forEach((b, i) => {
        b.onclick = () => remote ? domLoadEntity(items[i].id) : domSelect(items[i], null, { clearSearchInput: showDistance });
    });
}

async function domSearch() {
    const si = document.getElementById('dom-search-input');
    const cap = document.getElementById('dom-results-Caption');
    const q = (si ? si.value : '').trim();
    const token = ++domSearchGen;

    if (!q) {
        if (domUserLoc && domPeaks.length) {
            if (cap) cap.textContent = '🧭 Nächste Berge rund um deinen Standort (Live):';
            const nearestList = [...domPeaks]
                .filter(p => isFinite(p.lat) && isFinite(p.lon))
                .map(p => ({ peak: p, d: domDistanceKm(domUserLoc, p) }))
                .sort((a, b) => a.d - b.d)
                .slice(0, 10)
                .map(x => x.peak);
            domRenderResults(nearestList, false, true);
        } else {
            if (cap) cap.textContent = '🌍 Bekannte Referenzgipfel:';
            domRenderResults(domPeaks.filter(p => ['Q3375','Q513','Q43512','Q3926','Q46190'].includes(p.id)), false, false);
        }
        return;
    }

    if (cap) cap.textContent = '🔍 Suchergebnisse:';
    const local = domPeaks.filter(p => domNorm(p.name).includes(domNorm(q)))
        .sort((a, b) => domNorm(a.name).indexOf(domNorm(q)) - domNorm(b.name).indexOf(domNorm(q))).slice(0, 7);
    domRenderResults(local, false, Boolean(domUserLoc));
    if (local.length >= 5) return;

    try {
        const r = await domGetJSON('//www.wikidata.org/w/api.php?action=wbsearchentities&search=' + encodeURIComponent(q) + '&language=de&uselang=de&limit=10&format=json&origin=*');
        if (token !== domSearchGen) return;
        const more = r.search.filter(p => !local.some(x => x.id === p.id) && /berg|gipfel|mountain|peak|vulkan|volcano|summit/i.test(p.description || ''))
            .map(p => ({ id: p.id, name: p.label }));
        const combined = [...local, ...more].slice(0, 9);
        if (combined.length) {
            domRenderResults(combined, false, Boolean(domUserLoc));
            document.getElementById('dom-results').querySelectorAll('.peak-item').forEach((b, i) =>
                b.onclick = () => domPeaks.find(p => p.id === combined[i].id) ? domSelect(domPeaks.find(p => p.id === combined[i].id)) : domLoadEntity(combined[i].id));
        } else {
            document.getElementById('dom-results').innerHTML = '<div style="padding:12px; text-align:center; color:#64748b; font-size:13px;">Keine Treffer. Anderen Namen versuchen.</div>';
        }
    } catch {
        if (!local.length && token === domSearchGen) {
            document.getElementById('dom-results').innerHTML = '<div style="padding:12px; text-align:center; color:#64748b; font-size:13px;">Online-Suche nicht erreichbar – Suche im geladenen Datensatz.</div>';
        }
    }
}

async function domLoadEntity(id) {
    setDomStatus('Berg wird geladen …');
    try {
        const e = await domEntity(id), c = domClaim(e, 'P625');
        if (!c) throw new Error('Keine Koordinaten');
        const p = domPeakFromEntity(e, id);
        if (!p) throw new Error('kein Gipfel');
        if (!domPeaks.some(x => x.id === id)) domPeaks.push(p);
        setDomStatus('');
        domSelect(p, e);
    } catch {
        setDomStatus('Dieser Treffer hat keine verfügbaren Bergkoordinaten.');
    }
}

function openDominanzInfo() { document.getElementById('dom-info-modal').classList.add('open'); }
function closeDominanzInfo() { document.getElementById('dom-info-modal').classList.remove('open'); }
