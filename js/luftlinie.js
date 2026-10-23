// -----------------------------------------------------------------
// 5b. LUFTLINIEN-ENTFERNUNG, ÜBERFLUG-SCANNER & TRAVLE-PFAD
// -----------------------------------------------------------------
let airMap = null, airLayers = {}, airLayerKey = 'topo';
let airMarkerA = null, airMarkerB = null;
let airLineGroup = null, airCountryHighlightGroup = null;
let airActiveSlot = 'B'; // Nach Start-Preset ist B direkt für den ersten Klick aktiv
let airPointA = { lat: 50.9940, lon: 13.9077, name: 'Pirna (Graupa)', countryCode: 'DEU', countryName: 'Deutschland' };
let airPointB = { lat: 35.6762, lon: 139.6503, name: 'Tokio', countryCode: 'JPN', countryName: 'Japan' };

let airCountriesGeo = null;   // GeoJSON Features der Weltländer
let airCountryMeta = {};      // ISO3 -> { nameDe, borders:[], continent, flag, latlng }
let airDataLoaded = false;
let airSearchTimers = { A: null, B: null };

// Kuratierte globale Geografie-Datenbank für Ozeane/Meere & große Gebirgsketten
const AIR_OCEANS = [
    { name: 'Nordatlantik', latMin: 5, latMax: 68, lonMin: -78, lonMax: -8 },
    { name: 'Südatlantik', latMin: -60, latMax: 5, lonMin: -65, lonMax: 18 },
    { name: 'Nordsee', latMin: 51, latMax: 61, lonMin: -3, lonMax: 9 },
    { name: 'Ostsee', latMin: 53.5, latMax: 65.8, lonMin: 10, lonMax: 30 },
    { name: 'Mittelmeer', latMin: 30.5, latMax: 44.5, lonMin: -5.5, lonMax: 36 },
    { name: 'Schwarzes Meer', latMin: 41, latMax: 46.5, lonMin: 27.5, lonMax: 41.8 },
    { name: 'Kaspisches Meer', latMin: 36.5, latMax: 47, lonMin: 46.5, lonMax: 54.5 },
    { name: 'Rotes Meer', latMin: 12.5, latMax: 30, lonMin: 32.5, lonMax: 43.5 },
    { name: 'Persischer Golf', latMin: 24, latMax: 30.5, lonMin: 48, lonMax: 56.5 },
    { name: 'Arabisches Meer', latMin: 5, latMax: 25, lonMin: 51, lonMax: 75 },
    { name: 'Golf von Bengalen', latMin: 5, latMax: 22, lonMin: 80, lonMax: 98 },
    { name: 'Indischer Ozean', latMin: -60, latMax: 22, lonMin: 20, lonMax: 115 },
    { name: 'Südchinesisches Meer', latMin: 2, latMax: 23, lonMin: 105, lonMax: 121 },
    { name: 'Japanisches Meer', latMin: 34, latMax: 51, lonMin: 127.5, lonMax: 142 },
    { name: 'Nordpazifik', latMin: 0, latMax: 65, lonMin: 120, lonMax: 180 },
    { name: 'Nordpazifik (Ost)', latMin: 0, latMax: 65, lonMin: -180, lonMax: -80 },
    { name: 'Südpazifik', latMin: -60, latMax: 0, lonMin: 145, lonMax: 180 },
    { name: 'Südpazifik (Ost)', latMin: -60, latMax: 0, lonMin: -180, lonMax: -70 },
    { name: 'Karibisches Meer', latMin: 9, latMax: 22, lonMin: -88, lonMax: -60 },
    { name: 'Golf von Mexiko', latMin: 18, latMax: 30, lonMin: -98, lonMax: -81 },
    { name: 'Arktischer Ozean (Nordpolarmeer)', latMin: 68, latMax: 90, lonMin: -180, lonMax: 180 },
    { name: 'Südlicher Ozean (Antarktik)', latMin: -90, latMax: -60, lonMin: -180, lonMax: 180 }
];

const AIR_MOUNTAIN_RANGES = [
    { name: 'Elbsandsteingebirge / Erzgebirge', latMin: 50.2, latMax: 51.1, lonMin: 12.3, lonMax: 14.5 },
    { name: 'Sudeten / Riesengebirge', latMin: 50.0, latMax: 51.0, lonMin: 15.0, lonMax: 17.8 },
    { name: 'Alpen', latMin: 44.0, latMax: 47.9, lonMin: 5.8, lonMax: 16.2 },
    { name: 'Pyrenäen', latMin: 42.1, latMax: 43.3, lonMin: -1.8, lonMax: 3.2 },
    { name: 'Apennin', latMin: 38.0, latMax: 44.5, lonMin: 9.5, lonMax: 16.8 },
    { name: 'Karpaten', latMin: 44.5, latMax: 49.6, lonMin: 18.0, lonMax: 26.8 },
    { name: 'Balkan / Dinarisches Gebirge', latMin: 41.0, latMax: 45.5, lonMin: 15.0, lonMax: 27.5 },
    { name: 'Skandinavisches Gebirge', latMin: 59.0, latMax: 69.5, lonMin: 5.5, lonMax: 20.5 },
    { name: 'Uralgebirge', latMin: 51.0, latMax: 68.0, lonMin: 57.0, lonMax: 65.5 },
    { name: 'Kaukasus', latMin: 40.2, latMax: 44.2, lonMin: 40.0, lonMax: 49.5 },
    { name: 'Taurus / Anatolisches Hochland', latMin: 36.5, latMax: 40.8, lonMin: 30.0, lonMax: 44.0 },
    { name: 'Zagros-Gebirge', latMin: 28.0, latMax: 36.5, lonMin: 46.0, lonMax: 55.0 },
    { name: 'Elburs-Gebirge', latMin: 35.5, latMax: 37.5, lonMin: 49.0, lonMax: 56.0 },
    { name: 'Hindukusch / Pamir', latMin: 34.5, latMax: 39.8, lonMin: 68.0, lonMax: 75.5 },
    { name: 'Tian Shan', latMin: 39.5, latMax: 44.0, lonMin: 74.0, lonMax: 86.0 },
    { name: 'Altai-Gebirge', latMin: 46.5, latMax: 52.5, lonMin: 84.0, lonMax: 99.0 },
    { name: 'Himalaya / Karakorum', latMin: 26.8, latMax: 36.2, lonMin: 73.5, lonMax: 95.5 },
    { name: 'Hochland von Tibet (Kunlun)', latMin: 30.0, latMax: 37.5, lonMin: 79.0, lonMax: 101.0 },
    { name: 'Japanische Alpen', latMin: 35.0, latMax: 37.2, lonMin: 136.5, lonMax: 139.0 },
    { name: 'Atlasgebirge', latMin: 30.0, latMax: 36.8, lonMin: -9.5, lonMax: 9.0 },
    { name: 'Ostafrikanisches Hochland / Kilimandscharo', latMin: -4.5, latMax: 9.5, lonMin: 29.0, lonMax: 40.0 },
    { name: 'Drakensberge', latMin: -31.5, latMax: -25.0, lonMin: 27.0, lonMax: 31.5 },
    { name: 'Rocky Mountains', latMin: 32.0, latMax: 60.0, lonMin: -122.0, lonMax: -105.0 },
    { name: 'Appalachen', latMin: 33.5, latMax: 47.0, lonMin: -84.0, lonMax: -69.0 },
    { name: 'Alaskakette', latMin: 59.0, latMax: 64.5, lonMin: -154.0, lonMax: -138.0 },
    { name: 'Sierra Madre (Mexiko)', latMin: 17.0, latMax: 29.0, lonMin: -109.0, lonMax: -96.0 },
    { name: 'Anden (Nord & Zentral)', latMin: -28.0, latMax: 10.0, lonMin: -80.0, lonMax: -63.0 },
    { name: 'Anden (Süd / Patagonien)', latMin: -55.0, latMax: -28.0, lonMin: -75.0, lonMax: -66.0 },
    { name: 'Australische Alpen (Great Dividing Range)', latMin: -38.0, latMax: -25.0, lonMin: 146.0, lonMax: 153.0 },
    { name: 'Neuseeländische Alpen', latMin: -46.0, latMax: -41.5, lonMin: 167.0, lonMax: 173.5 }
];

const CONTINENT_DE = {
    'Europe': 'Europa',
    'Asia': 'Asien',
    'Africa': 'Afrika',
    'Americas': 'Amerika',
    'North America': 'Nordamerika',
    'South America': 'Südamerika',
    'Oceania': 'Ozeanien / Australien',
    'Antarctic': 'Antarktika',
    'Antarctica': 'Antarktika'
};

function initAirMapIfNeeded() {
    if (airMap || typeof L === 'undefined') return;
    airMap = L.map('airMapContainer', { zoomControl: true, minZoom: 2, maxZoom: 18, worldCopyJump: true })
              .setView([38, 60], 3);
    airLayers = buildLayerSet();
    airLayers['topo'].addTo(airMap);
    airLayerKey = 'topo';
    fillLayerSelect('air-layer-select', 'topo');

    airCountryHighlightGroup = L.layerGroup().addTo(airMap);
    airLineGroup = L.layerGroup().addTo(airMap);
    L.control.scale({ imperial: false }).addTo(airMap);

    airMap.on('mousemove', (e) => {
        const el = document.getElementById('air-cursor-coords');
        if (el) el.textContent = `Cursor: ${e.latlng.lat.toFixed(4)}°, ${e.latlng.lng.toFixed(4)}°`;
    });

    airMap.on('click', (e) => {
        airSetPointFromMap(airActiveSlot, e.latlng.lat, e.latlng.lng);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.air-point-card')) {
            document.getElementById('air-dd-a')?.classList.remove('open');
            document.getElementById('air-dd-b')?.classList.remove('open');
        }
    });

    // Auch Bergdaten laden (falls noch nicht geschehen), um überflogene Gipfel zu erkennen
    if (!domInitDone && typeof loadDominanzData === 'function') {
        loadDominanzData();
    }

    loadAirGeoData();
}

function setAirLayer(key) {
    initAirMapIfNeeded();
    if (!airMap || !airLayers[key]) return;
    Object.values(airLayers).forEach(l => airMap.removeLayer(l));
    airLayers[key].addTo(airMap);
    airLayerKey = key;
}

function airWorldView() {
    if (airMap) airMap.setView([25, 15], 2);
}

function airSelectSlot(slot) {
    airActiveSlot = slot;
    document.getElementById('air-card-a')?.classList.toggle('active-slot', slot === 'A');
    document.getElementById('air-card-b')?.classList.toggle('active-slot', slot === 'B');
    const ba = document.getElementById('air-slot-badge-a');
    const bb = document.getElementById('air-slot-badge-b');
    if (ba) {
        ba.textContent = slot === 'A' ? 'Klick aktiv' : 'Klicken zum Wählen';
        ba.style.background = slot === 'A' ? 'var(--emerald-dark)' : '#e2e8f0';
        ba.style.color = slot === 'A' ? '#fff' : '#475569';
    }
    if (bb) {
        bb.textContent = slot === 'B' ? 'Klick aktiv' : 'Klicken zum Wählen';
        bb.style.background = slot === 'B' ? 'var(--amber)' : '#e2e8f0';
        bb.style.color = slot === 'B' ? '#122620' : '#475569';
    }
}

async function loadAirGeoData() {
    const st = document.getElementById('air-status');
    try {
        // Parallel laden: 1. Ländergrenzen-Nachbarschaftsgraph + deutsche Namen, 2. Welt-GeoJSON-Polygone
        const [metaRes, geoRes] = await Promise.all([
            fetch('https://raw.githubusercontent.com/mledoze/countries/master/countries.json'),
            fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        ]);
        if (metaRes.ok) {
            const metaArr = await metaRes.json();
            metaArr.forEach(c => {
                const code = c.cca3;
                if (!code) return;
                let cont = c.region || '';
                if (c.subregion === 'South America') cont = 'South America';
                else if (c.region === 'Americas') cont = 'North America';
                airCountryMeta[code] = {
                    code,
                    nameDe: c.translations?.deu?.common || c.name?.common || code,
                    borders: Array.isArray(c.borders) ? c.borders : [],
                    continent: CONTINENT_DE[cont] || CONTINENT_DE[c.region] || c.region || '',
                    flag: c.flag || '🏳️',
                    latlng: c.latlng || null
                };
            });
        }
        if (geoRes.ok) {
            const geo = await geoRes.json();
            airCountriesGeo = (geo.features || []).map(f => {
                const bbox = computeFeatureBBox(f.geometry);
                return { ...f, _bbox: bbox };
            });
        }
        airDataLoaded = true;
        if (st) st.textContent = '✓ Welt-Ländergraph & Geodaten bereit';
    } catch (e) {
        if (st) st.textContent = '⚠️ Offline-Modus (Basis-Geodäsie aktiv)';
    }
    airUpdateAll(true);
}

function computeFeatureBBox(geom) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    const scan = (coords) => {
        for (const c of coords) {
            if (typeof c[0] === 'number') {
                const lon = c[0], lat = c[1];
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
            } else if (Array.isArray(c)) {
                scan(c);
            }
        }
    };
    if (geom && geom.coordinates) scan(geom.coordinates);
    return { minLat, maxLat, minLon, maxLon };
}

// Ray-Casting Point-in-Polygon für GeoJSON (Polygon & MultiPolygon)
function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) &&
                          (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointInGeometry(lat, lon, geom, bbox) {
    if (bbox && (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon)) {
        return false;
    }
    if (!geom) return false;
    if (geom.type === 'Polygon') {
        if (!pointInRing(lon, lat, geom.coordinates[0])) return false;
        for (let k = 1; k < geom.coordinates.length; k++) {
            if (pointInRing(lon, lat, geom.coordinates[k])) return false;
        }
        return true;
    }
    if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
            if (pointInRing(lon, lat, poly[0])) {
                let inHole = false;
                for (let k = 1; k < poly.length; k++) {
                    if (pointInRing(lon, lat, poly[k])) { inHole = true; break; }
                }
                if (!inHole) return true;
            }
        }
    }
    return false;
}

function findCountryAtPoint(lat, lon) {
    let normLon = ((lon + 180) % 360 + 360) % 360 - 180;
    if (!airCountriesGeo) return null;
    for (const f of airCountriesGeo) {
        if (pointInGeometry(lat, normLon, f.geometry, f._bbox)) {
            const code = f.id || f.properties?.iso_a3;
            const meta = airCountryMeta[code];
            return {
                code,
                name: meta?.nameDe || f.properties?.name || code,
                continent: meta?.continent || '',
                flag: meta?.flag || '🏳️',
                feature: f
            };
        }
    }
    return null;
}

// Nominatim-Ortsabfrage (Vorwärts- & Rückwärtssuche)
function airSearchInput(slot, query) {
    clearTimeout(airSearchTimers[slot]);
    const dd = document.getElementById('air-dd-' + slot.toLowerCase());
    if (!query || query.trim().length < 2) {
        if (dd) dd.classList.remove('open');
        return;
    }
    airSearchTimers[slot] = setTimeout(async () => {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&accept-language=de&limit=6&q=${encodeURIComponent(query.trim())}`;
            const res = await fetch(url);
            if (!res.ok) return;
            const items = await res.json();
            if (!dd) return;
            if (!items.length) {
                dd.innerHTML = `<div class="air-dd-item" style="color:#64748b;">Keine Treffer gefunden</div>`;
                dd.classList.add('open');
                return;
            }
            dd.innerHTML = items.map((it, idx) => {
                const shortName = (it.display_name || '').split(',').slice(0, 3).join(', ');
                return `<div class="air-dd-item" data-idx="${idx}">
                    <span>📍 <b>${domEsc(shortName)}</b></span>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#64748b;">${(+it.lat).toFixed(2)}°, ${(+it.lon).toFixed(2)}°</span>
                </div>`;
            }).join('');
            dd.querySelectorAll('.air-dd-item').forEach((el, idx) => {
                el.onclick = (ev) => {
                    ev.stopPropagation();
                    const it = items[idx];
                    const shortName = (it.display_name || '').split(',').slice(0, 2).join(', ');
                    dd.classList.remove('open');
                    airApplyPoint(slot, +it.lat, +it.lon, shortName, true);
                };
            });
            dd.classList.add('open');
        } catch (err) {}
    }, 320);
}

async function airSetPointFromMap(slot, lat, lon) {
    let normLon = ((lon + 180) % 360 + 360) % 360 - 180;
    const c = findCountryAtPoint(lat, normLon);
    const fallbackName = c ? `Kartenpunkt (${c.name})` : `Kartenpunkt (${lat.toFixed(2)}°, ${normLon.toFixed(2)}°)`;
    airApplyPoint(slot, lat, normLon, fallbackName, false);

    // Im Hintergrund echten Orts-/Stadtnamen via Reverse-Geocoding nachladen
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=de&zoom=10&lat=${lat.toFixed(5)}&lon=${normLon.toFixed(5)}`);
        if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.municipality || addr.state || data.name;
            const country = addr.country || c?.name || '';
            if (city || country) {
                const niceName = [city, country].filter(Boolean).join(', ');
                const target = slot === 'A' ? airPointA : airPointB;
                if (Math.abs(target.lat - lat) < 1e-4 && Math.abs(target.lon - normLon) < 1e-4) {
                    target.name = niceName;
                    const inp = document.getElementById('air-input-' + slot.toLowerCase());
                    if (inp) inp.value = niceName;
                    airRenderDetails();
                }
            }
        }
    } catch (e) {}

    // Automatisch zum jeweils anderen Punkt weiterschalten für schnelles 2-Klick-Messen
    airSelectSlot(slot === 'A' ? 'B' : 'A');
}

function airApplyPoint(slot, lat, lon, name, fitMap) {
    const c = findCountryAtPoint(lat, lon);
    const obj = {
        lat,
        lon,
        name: name || (c ? c.name : `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`),
        countryCode: c?.code || null,
        countryName: c?.name || null
    };
    if (slot === 'A') airPointA = obj;
    else airPointB = obj;
    airUpdateAll(fitMap);
}

function airSwapPoints() {
    const tmp = airPointA;
    airPointA = airPointB;
    airPointB = tmp;
    airUpdateAll(false);
}

function airSetPreset(preset) {
    if (preset === 'pirna-tokyo') {
        airPointA = { lat: 50.9940, lon: 13.9077, name: 'Pirna (Graupa), Deutschland' };
        airPointB = { lat: 35.6762, lon: 139.6503, name: 'Tokio, Japan' };
    } else if (preset === 'lisbon-vladivostok') {
        airPointA = { lat: 38.7223, lon: -9.1393, name: 'Lissabon, Portugal' };
        airPointB = { lat: 43.1155, lon: 131.8855, name: 'Wladiwostok, Russland' };
    }
    airUpdateAll(true);
}

// Berechnet Zwischenpunkte entlang des Großkreises (Orthodrome)
function sampleGreatCircle(a, b, steps = 180) {
    const rad = Math.PI / 180;
    const lat1 = a.lat * rad, lon1 = a.lon * rad;
    const lat2 = b.lat * rad, lon2 = b.lon * rad;
    const dh = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(Math.min(1, dh)), Math.sqrt(Math.max(0, 1 - dh)));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        if (d < 1e-9) {
            pts.push({ lat: a.lat, lon: a.lon, f });
            continue;
        }
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
        const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
        const z = A * Math.sin(lat1) + B * Math.sin(lat2);
        pts.push({
            lat: Math.atan2(z, Math.hypot(x, y)) / rad,
            lon: Math.atan2(y, x) / rad,
            f
        });
    }
    return pts;
}

// Anfangs-Kurswinkel (Azimut in Grad, 0° = Nord, 90° = Ost)
function initialBearingDeg(a, b) {
    const rad = Math.PI / 180;
    const φ1 = a.lat * rad, φ2 = b.lat * rad;
    const Δλ = (b.lon - a.lon) * rad;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function compassDir(deg) {
    const dirs = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}

// Kürzeste Landgrenzen-Kette (BFS wie bei travle.earth)
function findShortestLandPath(codeA, codeB) {
    if (!codeA || !codeB || !airCountryMeta[codeA] || !airCountryMeta[codeB]) {
        return { status: 'unknown', path: [] };
    }
    if (codeA === codeB) {
        return { status: 'same', path: [codeA] };
    }
    const queue = [[codeA]];
    const visited = new Set([codeA]);
    while (queue.length > 0) {
        const path = queue.shift();
        const cur = path[path.length - 1];
        const neighbors = airCountryMeta[cur]?.borders || [];
        for (const nb of neighbors) {
            if (!airCountryMeta[nb]) continue;
            if (nb === codeB) {
                return { status: 'found', path: [...path, nb] };
            }
            if (!visited.has(nb)) {
                visited.add(nb);
                queue.push([...path, nb]);
            }
        }
    }
    return { status: 'island', path: [] };
}

let lastOverflightResult = null;

function analyzeFlightPath(samples) {
    const countriesOrder = [];
    const countryCodesSet = new Set();
    const continentsOrder = [];
    const oceansOrder = [];
    const rangesOrder = [];

    const addUnique = (arr, val) => { if (val && !arr.includes(val)) arr.push(val); };

    samples.forEach(pt => {
        const c = findCountryAtPoint(pt.lat, pt.lon);
        if (c) {
            if (!countryCodesSet.has(c.code)) {
                countryCodesSet.add(c.code);
                countriesOrder.push(c);
            }
            addUnique(continentsOrder, c.continent);
        } else {
            // Punkt liegt über Wasser -> Ozean / Meer bestimmen
            for (const oc of AIR_OCEANS) {
                if (pt.lat >= oc.latMin && pt.lat <= oc.latMax && pt.lon >= oc.lonMin && pt.lon <= oc.lonMax) {
                    addUnique(oceansOrder, oc.name.replace(/ \(Ost\)$/, ''));
                    break;
                }
            }
        }

        // Gebirgszüge entlang der Route prüfen
        for (const rg of AIR_MOUNTAIN_RANGES) {
            if (pt.lat >= rg.latMin && pt.lat <= rg.latMax && pt.lon >= rg.lonMin && pt.lon <= rg.lonMax) {
                addUnique(rangesOrder, rg.name);
            }
        }
    });

    // Bonus: Höchsten Berggipfel aus peaks.json direkt unter dem Flugkorridor (±60 km) finden
    let highestCorridorPeak = null;
    if (Array.isArray(domPeaks) && domPeaks.length > 0) {
        for (let i = 0; i < samples.length; i += 3) {
            const s = samples[i];
            for (const pk of domPeaks) {
                if (!pk.height || (highestCorridorPeak && pk.height <= highestCorridorPeak.height)) continue;
                if (Math.abs(pk.lat - s.lat) > 0.65 || Math.abs(pk.lon - s.lon) > 0.9) continue;
                const dKm = domDistanceKm(s, pk);
                if (dKm <= 60) {
                    highestCorridorPeak = { ...pk, distToTrack: dKm };
                }
            }
        }
    }

    return { countriesOrder, countryCodesSet, continentsOrder, oceansOrder, rangesOrder, highestCorridorPeak };
}

function airUpdateLayers() {
    if (!airMap || !airCountryHighlightGroup) return;
    airCountryHighlightGroup.clearLayers();
    if (!document.getElementById('air-show-countries')?.checked || !lastOverflightResult) return;

    lastOverflightResult.countriesOrder.forEach(c => {
        if (c.feature) {
            L.geoJSON(c.feature, {
                style: {
                    color: '#059669',
                    weight: 1.5,
                    fillColor: '#10b981',
                    fillOpacity: 0.18
                },
                interactive: false
            }).addTo(airCountryHighlightGroup);
        }
    });
}

function airUpdateAll(fitMap = false) {
    if (!airMap) return;

    // 1. Start- und Zielland aktualisieren
    const cA = findCountryAtPoint(airPointA.lat, airPointA.lon);
    const cB = findCountryAtPoint(airPointB.lat, airPointB.lon);
    airPointA.countryCode = cA?.code || null;
    airPointA.countryName = cA?.name || 'Internationales Gewässer';
    airPointB.countryCode = cB?.code || null;
    airPointB.countryName = cB?.name || 'Internationales Gewässer';

    // 2. Inputs & Koordinaten-Labels aktualisieren
    const inA = document.getElementById('air-input-a');
    const inB = document.getElementById('air-input-b');
    if (inA && document.activeElement !== inA) inA.value = airPointA.name;
    if (inB && document.activeElement !== inB) inB.value = airPointB.name;
    const coA = document.getElementById('air-coord-a');
    const coB = document.getElementById('air-coord-b');
    if (coA) coA.textContent = `${airPointA.lat.toFixed(4)}° N, ${airPointA.lon.toFixed(4)}° O · ${cA ? cA.flag + ' ' + cA.name : '🌊 Ozean'}`;
    if (coB) coB.textContent = `${airPointB.lat.toFixed(4)}° N, ${airPointB.lon.toFixed(4)}° O · ${cB ? cB.flag + ' ' + cB.name : '🌊 Ozean'}`;

    // 3. Marker setzen (ziehbar!)
    if (airMarkerA) airMap.removeLayer(airMarkerA);
    if (airMarkerB) airMap.removeLayer(airMarkerB);

    airMarkerA = L.marker([airPointA.lat, airPointA.lon], {
        draggable: true,
        icon: L.divIcon({ className: 'airWrapA', html: '<span class="air-MarkerA"></span>', iconSize: [18, 18] }),
        title: 'Start: ' + airPointA.name, zIndexOffset: 1200
    }).bindTooltip('A · ' + domEsc(airPointA.name), { permanent: false, direction: 'top' }).addTo(airMap);

    airMarkerB = L.marker([airPointB.lat, airPointB.lon], {
        draggable: true,
        icon: L.divIcon({ className: 'airWrapB', html: '<span class="air-MarkerB"></span>', iconSize: [18, 18] }),
        title: 'Ziel: ' + airPointB.name, zIndexOffset: 1200
    }).bindTooltip('B · ' + domEsc(airPointB.name), { permanent: false, direction: 'top' }).addTo(airMap);

    airMarkerA.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        airSetPointFromMap('A', pos.lat, pos.lng);
    });
    airMarkerB.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        airSetPointFromMap('B', pos.lat, pos.lng);
    });

    // 4. Großkreis-Kurve & Vergleichs-Loxodrome zeichnen
    airLineGroup.clearLayers();
    const samples = sampleGreatCircle(airPointA, airPointB, 180);
    const rawCoords = samples.map(p => [p.lat, p.lon]);
    const segs = domSplitAntimeridian(rawCoords);

    // Direkte Karten-Verbindungslinie (Plattkarten-Linie zum optischen Vergleich)
    if (Math.abs(airPointA.lon - airPointB.lon) <= 180) {
        L.polyline([[airPointA.lat, airPointA.lon], [airPointB.lat, airPointB.lon]], {
            color: '#f59e0b', weight: 2, opacity: 0.65, dashArray: '6, 6', interactive: false
        }).addTo(airLineGroup);
    }

    // Wahre kürzeste Kugel-Luftlinie (Orthodrome)
    segs.forEach(s => {
        L.polyline(s, { color: '#ffffff', weight: 6, opacity: 0.9, interactive: false }).addTo(airLineGroup);
        L.polyline(s, { color: '#10b981', weight: 3.5, opacity: 1, interactive: false }).addTo(airLineGroup);
    });

    // 5. Überflug-Analyse & Länder-Highlighting
    lastOverflightResult = analyzeFlightPath(samples);
    airUpdateLayers();

    if (fitMap) {
        const bounds = L.latLngBounds([[airPointA.lat, airPointA.lon], [airPointB.lat, airPointB.lon]]);
        segs.forEach(s => s.forEach(pt => bounds.extend(pt)));
        airMap.fitBounds(bounds.pad(0.22), { maxZoom: 10, animate: true });
    }

    airRenderDetails();
}

function airRenderDetails() {
    const box = document.getElementById('air-detail');
    if (!box || !lastOverflightResult) return;

    const distKm = domDistanceKm(airPointA, airPointB);
    const distNm = distKm / 1.852;
    const earthPct = (distKm / 40075.017) * 100;
    const flightHours = distKm / 850 + 0.45; // Reisegeschwindigkeit ~850 km/h + Start/Lande-Korridor
    const fh = Math.floor(flightHours);
    const fm = Math.round((flightHours - fh) * 60);
    const bearing = initialBearingDeg(airPointA, airPointB);

    const { countriesOrder, continentsOrder, oceansOrder, rangesOrder, highestCorridorPeak } = lastOverflightResult;
    const travle = findShortestLandPath(airPointA.countryCode, airPointB.countryCode);

    const renderChips = (items, emptyText) => {
        if (!items || !items.length) return `<span style="font-size:12px;color:#64748b;">${emptyText}</span>`;
        return `<div class="air-chip-list">${items.map(x => `<span class="air-chip">${domEsc(x)}</span>`).join('')}</div>`;
    };

    const renderCountryChain = (list) => {
        if (!list || !list.length) return `<span style="font-size:12px;color:#64748b;">Keine Länder überflogen (reine Ozeanroute)</span>`;
        return `<div class="air-chip-list">${list.map((c, i) =>
            `${i > 0 ? '<span class="air-chip-arrow">→</span>' : ''}<span class="air-chip">${c.flag || '🏳️'} ${domEsc(c.name)}</span>`
        ).join('')}</div>`;
    };

    let travleHtml = '';
    if (travle.status === 'same') {
        const m = airCountryMeta[airPointA.countryCode];
        travleHtml = `<div style="font-size:12.5px;color:#065f46;font-weight:700;">🎉 Start und Ziel liegen im selben Land (${m ? m.flag + ' ' + domEsc(m.nameDe) : ''}) – 0 Grenzübertritte nötig!</div>`;
    } else if (travle.status === 'found') {
        const crossings = travle.path.length - 1;
        const transitCount = Math.max(0, travle.path.length - 2);
        travleHtml = `
            <div style="font-size:12.2px;color:#78350f;margin-bottom:6px;">
                Minimal <b>${crossings} ${crossings === 1 ? 'Grenzübertritt' : 'Grenzübertritte'}</b> (${transitCount} ${transitCount === 1 ? 'Transitland' : 'Transitländer'}) über Landgrenzen:
            </div>
            <div class="air-chip-list">
                ${travle.path.map((code, i) => {
                    const m = airCountryMeta[code] || { nameDe: code, flag: '🏳️' };
                    return `${i > 0 ? '<span class="air-chip-arrow">→</span>' : ''}<span class="air-chip travle">${m.flag} ${domEsc(m.nameDe)}</span>`;
                }).join('')}
            </div>
        `;
    } else if (!airPointA.countryCode || !airPointB.countryCode) {
        travleHtml = `<div style="font-size:12px;color:#64748b;">Mindestens ein Punkt liegt auf offenem Meer – keine reine Landroute möglich.</div>`;
    } else {
        travleHtml = `<div style="font-size:12px;color:#64748b;">🌊 Keine durchgehende Landverbindung möglich (Inselstaat oder durch Ozeane getrennte Landmassen).</div>`;
    }

    box.innerHTML = `
        <div class="eyebrow-dark">Kürzeste Großkreis-Verbindung (Orthodrome)</div>
        <div style="display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:8px; margin:2px 0 10px;">
            <div style="font-family:'Outfit',sans-serif; font-size:clamp(26px,2.4vw,34px); font-weight:800; color:var(--emerald-dark);">
                ${domNum(distKm, 2)} km
            </div>
            <span class="badge" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-size:11.5px; padding:4px 9px;">
                ✈️ ~${fh} h ${fm} min Flug · Kurs ${Math.round(bearing)}° (${compassDir(bearing)})
            </span>
        </div>

        <div class="person-grid-3" style="margin:0 0 10px;">
            <div class="person-box" style="padding:8px 10px;">
                <span class="person-role">Seemeilen</span>
                <div class="person-name" style="font-size:13.5px;">${domNum(distNm, 1)} nm</div>
            </div>
            <div class="person-box" style="padding:8px 10px;">
                <span class="person-role">Erdumfang</span>
                <div class="person-name" style="font-size:13.5px;">${domNum(earthPct, 1)} %</div>
            </div>
            <div class="person-box" style="padding:8px 10px;">
                <span class="person-role">Überflogene Länder</span>
                <div class="person-name" style="font-size:13.5px;">${countriesOrder.length}</div>
            </div>
        </div>

        <div class="air-section-box">
            <span class="person-role">📍 Exakte Koordinaten (Start → Ziel)</span>
            <div style="font-size:12.2px; line-height:1.55; margin-top:3px; font-family:'JetBrains Mono',monospace;">
                <b>A:</b> ${domEsc(airPointA.name)} (${airPointA.lat.toFixed(5)}°, ${airPointA.lon.toFixed(5)}°)<br>
                <b>B:</b> ${domEsc(airPointB.name)} (${airPointB.lat.toFixed(5)}°, ${airPointB.lon.toFixed(5)}°)
            </div>
        </div>

        <div class="air-section-box">
            <span class="person-role">🌍 Überflogene Kontinente (${continentsOrder.length})</span>
            ${renderChips(continentsOrder, 'Keine Kontinentalmasse berührt')}
        </div>

        <div class="air-section-box">
            <span class="person-role">🏳️ Überflogene Länder in Flugreihenfolge (${countriesOrder.length})</span>
            ${renderCountryChain(countriesOrder)}
        </div>

        <div class="air-section-box">
            <span class="person-role">⛰️ Überflogene Gebirge & höchster Gipfel im Korridor</span>
            ${renderChips(rangesOrder, 'Keine großen Hochgebirgsketten direkt gekreuzt')}
            ${highestCorridorPeak ? `<div style="font-size:11.8px; color:#475569; margin-top:6px;">🏔️ Höchster erfasster Gipfel unter der Route (±60 km): <b>${domEsc(highestCorridorPeak.name)}</b> (${domNum(highestCorridorPeak.height)} m)</div>` : ''}
        </div>

        <div class="air-section-box">
            <span class="person-role">🌊 Überflogene Meere & Ozeane (${oceansOrder.length})</span>
            ${renderChips(oceansOrder, 'Reine Überland-Route (keine Ozeane überquert)')}
        </div>

        <div class="air-section-box" style="background:#fffbeb; border-color:#fde68a;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                <span class="person-role" style="color:#b45309;">🧭 Travle-Bonus: Kürzeste Landroute (wenigste Grenzen)</span>
                <a href="https://travle.earth/" target="_blank" rel="noopener" style="font-size:11px; font-weight:700; color:#b45309; text-decoration:none;">travle.earth ↗</a>
            </div>
            <div style="margin-top:4px;">${travleHtml}</div>
        </div>
    `;
}

