// ===================================================================
// DOMINANZ-ATLAS (6 KONTEXTE + LIVE-GPS-RADAR & WETTER-/BADE-TELEMETRIE)
// Kontexte: peaks | powerplants | towns | towers | lakes | castles
// ===================================================================

window.domEsc = window.domEsc || (s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
window.domNum = window.domNum || ((n, d = 0) => (n == null || !isFinite(n)) ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
window.domNorm = window.domNorm || (s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

let dominanzMap = null;
let dominanzLayers = {};
let domLayerKey = 'topo';

// --- Multi-Kontext-State (6 Welten) ---
const DOM_MODES_ORDER = ['peaks', 'powerplants', 'towns', 'towers', 'lakes', 'castles'];
let domMode = 'peaks';
let domDatasets = {
    peaks: [],
    powerplants: [],
    towns: [],
    towers: [],
    lakes: [],
    castles: []
};
let domLoaded = {
    peaks: false,
    powerplants: false,
    towns: false,
    towers: false,
    lakes: false,
    castles: false
};
let domPeaks = []; // Zeigt immer auf das aktive Datensatz-Array

let domActive = null;
let domReference = null;
let domCircle = null;
let domSelMarker = null;
let domRefMarker = null;
let domMarkers = null;
let domGen = 0, domSearchGen = 0, domSearchTimer = null;

// --- GPS-Standort- & Telemetrie-State ---
let domUserLoc = null;          // { lat, lon, heading, speedKmh, altitude, accuracy, ts }
let domUserMarker = null;       // Blauer Pfeil-Marker mit Höhe (oben) & Speed (unten)
let domGeoWatchId = null;       // Laufendes GPS-Tracking während der Fahrt
let domInitialAutoSelected = {
    peaks: false, powerplants: false, towns: false,
    towers: false, lakes: false, castles: false
};
let domManualOverride = false;
let domLastElevFetchLoc = null;
let domFallbackAltitude = null;
let domNearbyFetched = {
    powerplants: null, towns: null,
    towers: null, lakes: null, castles: null
};

// --- Konfiguration aller 6 Kontexte ---
const DOM_MODE_CFG = {
    peaks: {
        file: 'peaks.json',
        icon: '⛰️',
        nounSingular: 'Berg',
        nounPlural: 'Gipfel',
        unit: 'm',
        valueLabel: 'Höhe ü. NHN',
        higherLabel: 'Nächsthöherer Berg',
        refLabel: 'Bezugsgipfel',
        supremeId: 'Q513',
        supremeHint: '🏔️ Endpunkt: Mount Everest (8.849 m)',
        supremeNote: '🏔️ Mount Everest – höchster Berg der Erde (8.849 m). Kein höherer Bezugsgipfel.',
        fallbackId: 'Q3375',
        fallbackName: 'Zugspitze',
        searchPlaceholder: '🔍 Berg suchen (oder leer lassen für Gipfel im Umkreis)',
        locateBtnText: '🧭 Nächster Berg (GPS)',
        defaultIds: ['Q3375', 'Q513', 'Q43512', 'Q3926', 'Q46190']
    },
    powerplants: {
        file: 'powerplants.json',
        icon: '⚡',
        nounSingular: 'Kraftwerk',
        nounPlural: 'Kraftwerke',
        unit: 'MW',
        valueLabel: 'Max. Nennleistung',
        higherLabel: 'Nächststärkeres Kraftwerk',
        refLabel: 'Bezugskraftwerk',
        supremeId: 'Q12514',
        supremeHint: '⚡ Endpunkt: Drei-Schluchten-Staudamm (22.500 MW)',
        supremeNote: '⚡ Drei-Schluchten-Staudamm (China) – leistungsstärkstes Kraftwerk der Erde (22.500 MW).',
        fallbackId: 'Q835660',
        fallbackName: 'Kraftwerk Boxberg',
        searchPlaceholder: '🔍 Kraftwerk suchen (z. B. Boxberg, Jänschwalde, Goldisthal …)',
        locateBtnText: '🧭 Nächstes Kraftwerk (GPS)',
        defaultIds: ['Q835660', 'Q694615', 'Q835654', 'Q314114', 'Q12514']
    },
    towns: {
        file: 'towns.json',
        icon: '🏙️',
        nounSingular: 'Stadt',
        nounPlural: 'Städte',
        unit: 'Einw.',
        valueLabel: 'Einwohnerzahl',
        higherLabel: 'Nächstgrößere Stadt',
        refLabel: 'Bezugsstadt',
        supremeId: 'Q1490',
        supremeHint: '🏙️ Endpunkt: Tokio (37,4 Mio. Einwohner)',
        supremeNote: '🏙️ Tokio – bevölkerungsreichste Metropole der Erde. Keine größere Bezugsstadt.',
        fallbackId: 'Q1731',
        fallbackName: 'Dresden',
        searchPlaceholder: '🔍 Stadt/Ort suchen (z. B. Pirna, Dresden, Berlin, Tokio …)',
        locateBtnText: '🧭 Nächste Stadt (GPS)',
        defaultIds: ['Q14839', 'Q1731', 'Q64', 'Q84', 'Q1490']
    },
    towers: {
        file: 'towers.json',
        icon: '📡',
        nounSingular: 'Turm / Bauwerk',
        nounPlural: 'Türme & Bauwerke',
        unit: 'm',
        valueLabel: 'Höhe über Grund',
        higherLabel: 'Nächsthöheres Bauwerk',
        refLabel: 'Bezugsbauwerk',
        supremeId: 'Q12495',
        supremeHint: '📡 Endpunkt: Burj Khalifa (828 m)',
        supremeNote: '📡 Burj Khalifa (Dubai) – höchstes Bauwerk der Erde (828 m). Kein höheres Bezugsbauwerk.',
        fallbackId: 'Q572551',
        fallbackName: 'Fernsehturm Dresden',
        searchPlaceholder: '🔍 Turm / Bauwerk suchen (z. B. Fernsehturm Dresden, Eiffelturm, Burj Khalifa …)',
        locateBtnText: '🧭 Nächster Turm (GPS)',
        defaultIds: ['Q572551', 'Q151356', 'Q243', 'Q57965', 'Q12495']
    },
    lakes: {
        file: 'lakes.json',
        icon: '🌊',
        nounSingular: 'See / Talsperre',
        nounPlural: 'Seen & Talsperren',
        unit: 'km²',
        valueLabel: 'Wasserfläche',
        higherLabel: 'Nächstgrößerer See',
        refLabel: 'Bezugssee',
        supremeId: 'Q5484',
        supremeHint: '🌊 Endpunkt: Kaspisches Meer (371.000 km²)',
        supremeNote: '🌊 Kaspisches Meer – größtes Binnengewässer der Erde (371.000 km²). Kein größerer Bezugssee.',
        fallbackId: 'Q1741150',
        fallbackName: 'Kiessee Birkwitz-Pratzschwitz',
        searchPlaceholder: '🔍 See / Talsperre suchen (z. B. Birkwitz, Malter, Bodensee, Müritz …)',
        locateBtnText: '🧭 Nächster See (GPS)',
        defaultIds: ['Q1741150', 'Q315089', 'Q315104', 'Q4127', 'Q5484']
    },
    castles: {
        file: 'castles.json',
        icon: '🏰',
        nounSingular: 'Burg / Monument',
        nounPlural: 'Burgen & Monumente',
        unit: 'Jahre',
        valueLabel: 'Alter (Historie)',
        higherLabel: 'Nächstälteres Bauwerk',
        refLabel: 'Bezugsmonument',
        supremeId: 'Q211276',
        supremeHint: '🏰 Endpunkt: Göbekli Tepe (~11.500 Jahre)',
        supremeNote: '🏰 Göbekli Tepe – älteste bekannte Monumentalanlage der Menschheit (~9500 v. Chr.).',
        fallbackId: 'Q157723',
        fallbackName: 'Festung Königstein',
        searchPlaceholder: '🔍 Burg, Schloss oder Monument suchen (z. B. Königstein, Stolpen, Gizeh …)',
        locateBtnText: '🧭 Nächste Burg (GPS)',
        defaultIds: ['Q157723', 'Q882711', 'Q315218', 'Q37200', 'Q211276']
    }
};

const PLANT_TYPE_META = {
    solar:   { label: 'Solarpark',        icon: '☀️', color: '#eab308' },
    wind:    { label: 'Windpark',         icon: '🌬️', color: '#06b6d4' },
    hydro:   { label: 'Wasserkraft',      icon: '💧', color: '#2563eb' },
    coal:    { label: 'Kohlekraftwerk',   icon: '🏭', color: '#475569' },
    gas:     { label: 'Gaskraftwerk',     icon: '🔥', color: '#f97316' },
    nuclear: { label: 'Kernkraftwerk',    icon: '⚛️', color: '#9333ea' },
    biomass: { label: 'Biomasse / Müll',  icon: '🌿', color: '#16a34a' },
    other:   { label: 'Kraftwerk',        icon: '⚡', color: '#10b981' }
};

const TOWER_TYPE_META = {
    tvtower:    { label: 'Fernseh- / Funkturm',       icon: '📡', color: '#2563eb' },
    skyscraper: { label: 'Wolkenkratzer / Hochhaus',  icon: '🏙️', color: '#9333ea' },
    lookout:    { label: 'Aussichts- / Leuchtturm',   icon: '🔭', color: '#16a34a' },
    church:     { label: 'Kirchturm / Dom',           icon: '⛪', color: '#eab308' },
    industrial: { label: 'Brücke / Kamin / Mast',     icon: '🌉', color: '#f97316' }
};

const LAKE_SWIM_META = {
    yes:   { label: '🏊 Baden erlaubt',                      color: '#0ea5e9', badgeBg: '#ecfdf5', badgeBorder: '#6ee7b7', badgeText: '#065f46' },
    no:    { label: '🚫 Baden verboten (Trinkwasser/Sperr)', color: '#ef4444', badgeBg: '#fef2f2', badgeBorder: '#fecaca', badgeText: '#991b1b' },
    check: { label: '⚠️ Stausee / Vor Ort prüfen',           color: '#f59e0b', badgeBg: '#fffbeb', badgeBorder: '#fde68a', badgeText: '#92400e' }
};

const CASTLE_TYPE_META = {
    castle:   { label: 'Burg / Burgruine',       icon: '🏰', color: '#d97706' },
    palace:   { label: 'Schloss / Residenz',     icon: '👑', color: '#2563eb' },
    fortress: { label: 'Festung / Zitadelle',    icon: '🛡️', color: '#475569' },
    monument: { label: 'Antikes Monument',       icon: '🏛️', color: '#9333ea' }
};

function domCfg() { return DOM_MODE_CFG[domMode] || DOM_MODE_CFG.peaks; }

function domVal(p) {
    if (!p) return null;
    if (domMode === 'powerplants') {
        const v = p.capacity ?? p.mw ?? p.height;
        return (typeof v === 'number' && isFinite(v)) ? v : null;
    }
    if (domMode === 'towns') {
        const v = p.population ?? p.pop ?? p.height;
        return (typeof v === 'number' && isFinite(v)) ? v : null;
    }
    if (domMode === 'lakes') {
        const v = p.area ?? p.height;
        return (typeof v === 'number' && isFinite(v)) ? v : null;
    }
    if (domMode === 'castles') {
        const curY = new Date().getFullYear();
        const v = p.age ?? (p.year != null ? (curY - p.year) : p.height);
        return (typeof v === 'number' && isFinite(v)) ? v : null;
    }
    return (typeof p.height === 'number' && isFinite(p.height)) ? p.height : null;
}

function domFormatVal(v, withUnit = true) {
    if (v == null || !isFinite(v)) return '–';
    if (domMode === 'powerplants') {
        const d = (v < 100 && Math.round(v) !== v) ? 1 : 0;
        return domNum(v, d) + (withUnit ? ' MW' : '');
    }
    if (domMode === 'towns') {
        return domNum(Math.round(v), 0) + (withUnit ? ' Einw.' : '');
    }
    if (domMode === 'towers') {
        const d = (v < 200 && Math.round(v) !== v) ? 1 : 0;
        return domNum(v, d) + (withUnit ? ' m' : '');
    }
    if (domMode === 'lakes') {
        const d = v < 0.1 ? 3 : (v < 10 ? 2 : (v < 100 ? 1 : 0));
        return domNum(v, d) + (withUnit ? ' km²' : '');
    }
    if (domMode === 'castles') {
        return domNum(Math.round(v), 0) + (withUnit ? ' Jahre' : '');
    }
    return domNum(Math.round(v), 0) + (withUnit ? ' m' : '');
}

function domFormatCastleYear(p) {
    if (!p) return '';
    const yr = p.year != null ? p.year : (p.age != null ? (new Date().getFullYear() - p.age) : null);
    if (yr == null || !isFinite(yr)) return '';
    return yr < 0 ? `ca. ${domNum(Math.abs(Math.round(yr)), 0)} v. Chr.` : `um ${Math.round(yr)} n. Chr.`;
}

function domItemIcon(p) {
    if (domMode === 'powerplants') return (PLANT_TYPE_META[p?.type] || PLANT_TYPE_META.other).icon;
    if (domMode === 'towers')      return (TOWER_TYPE_META[p?.type] || TOWER_TYPE_META.tvtower).icon;
    if (domMode === 'lakes')       return p?.swim === 'no' ? '🚫' : (p?.swim === 'yes' ? '🏊' : '🌊');
    if (domMode === 'castles')     return (CASTLE_TYPE_META[p?.type] || CASTLE_TYPE_META.castle).icon;
    return domCfg().icon;
}

// ===================================================================
// INITIALISIERUNG & KONTEXT-UMSCHALTER (DROPDOWN + VOR/ZURÜCK)
// ===================================================================
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

    renderDomLegend();
    updateDomModeUI();
    startDomGeolocation(false);
    loadDominanzData('peaks');
}

function cycleDominanzMode(step) {
    const idx = DOM_MODES_ORDER.indexOf(domMode);
    const nextIdx = (idx + step + DOM_MODES_ORDER.length) % DOM_MODES_ORDER.length;
    setDominanzMode(DOM_MODES_ORDER[nextIdx]);
}

function setDominanzMode(mode) {
    if (!DOM_MODE_CFG[mode]) return;
    initDominanzMapIfNeeded();
    domMode = mode;
    domPeaks = domDatasets[mode] || [];
    domManualOverride = false;

    const sel = document.getElementById('dom-mode-select');
    if (sel && sel.value !== mode) sel.value = mode;

    // Falls noch Buttons vorhanden sind, ebenfalls synchronisieren
    DOM_MODES_ORDER.forEach(m => {
        const btn = document.getElementById('dom-mode-' + m);
        if (btn) btn.classList.toggle('active', m === mode);
    });

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

function renderDomLegend() {
    const box = document.getElementById('dom-legend');
    if (!box) return;

    const userLegendHtml = `
        <span class="dom-legend-sep">|</span>
        <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#111;"></span> gewählt</span>
        <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#fff; border-color:#111;"></span> ${domEsc(domCfg().refLabel)}</span>
        <span class="dom-legend-item">
            <span class="dom-legend-user-arrow" title="Deine aktuelle GPS-Position (oben: Höhe, unten: Geschwindigkeit)">
                <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
                </svg>
            </span>
            Standort (⛰️ Höhe / km/h)
        </span>
    `;

    if (domMode === 'powerplants') {
        box.innerHTML = `
            <strong style="font-size:12px; margin-right:2px;">Energieträger:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> ☀️ Solar</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#06b6d4;"></span> 🌬️ Wind</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#2563eb;"></span> 💧 Wasser</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 🔥 Gas</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#475569;"></span> 🏭 Kohle</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#9333ea;"></span> ⚛️ Kernkraft</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> 🌿 Biomasse</span>
            ${userLegendHtml}
        `;
    } else if (domMode === 'towns') {
        box.innerHTML = `
            <strong style="font-size:12px; margin-right:2px;">Einwohner:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> &lt; 10 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#65a30d;"></span> 10–50 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> 50–100 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 100–500 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#ef4444;"></span> 0,5–1 Mio.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#dc2626;"></span> 1–5 Mio.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#7e22ce;"></span> &gt; 5 Mio.</span>
            ${userLegendHtml}
        `;
    } else if (domMode === 'towers') {
        box.innerHTML = `
            <strong style="font-size:12px; margin-right:2px;">Bauwerkstyp:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#2563eb;"></span> 📡 Fernseh-/Funkturm</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#9333ea;"></span> 🏙️ Wolkenkratzer</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> 🔭 Aussichtsturm</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> ⛪ Kirchturm / Dom</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 🌉 Brücke / Kamin</span>
            ${userLegendHtml}
        `;
    } else if (domMode === 'lakes') {
        box.innerHTML = `
            <strong style="font-size:12px; margin-right:2px;">Bade-Status:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#0ea5e9;"></span> 🏊 Baden erlaubt (Badesee / Natursee)</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f59e0b;"></span> ⚠️ Stausee / Vor Ort prüfen</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#ef4444;"></span> 🚫 Baden verboten (Trinkwasserschutz)</span>
            ${userLegendHtml}
        `;
    } else if (domMode === 'castles') {
        box.innerHTML = `
            <strong style="font-size:12px; margin-right:2px;">Epoche / Alter:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> &lt; 300 J. (Neuzeit)</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> 300–600 J.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 600–1000 J. (Mittelalter)</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#dc2626;"></span> 1000–2500 J. (Antike)</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#7e22ce;"></span> &gt; 2500 J. (Frühzeit)</span>
            ${userLegendHtml}
        `;
    } else {
        box.innerHTML = `
            <strong style="font-size:12px; margin-right:2px;">Höhe ü. NN:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#1a6b2e;"></span> &lt; 1000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#5bd16a;"></span> 1000–2000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f2d307;"></span> 2000–3000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#d9a406;"></span> 3000–4000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f27405;"></span> 4000–5000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f2766e;"></span> 5000–6000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#e01b1b;"></span> 6000–7000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#8b2fc9;"></span> &gt; 7000 m</span>
            ${userLegendHtml}
        `;
    }
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

function ensureUserAltitudeFallback() {
    if (!domUserLoc) return;
    if (domUserLoc.altitude != null && isFinite(domUserLoc.altitude)) return;
    if (domLastElevFetchLoc && domDistanceKm(domLastElevFetchLoc, domUserLoc) < 0.15 && domFallbackAltitude != null) {
        return;
    }
    domLastElevFetchLoc = { lat: domUserLoc.lat, lon: domUserLoc.lon };
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${domUserLoc.lat.toFixed(5)}&longitude=${domUserLoc.lon.toFixed(5)}`)
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
    const cfg = domCfg();
    domUserMarker.bindPopup(
        `<b>🧭 Mein Standort</b>${accStr}<br>` +
        `<span style="font-size:12px;color:#047857;font-weight:700;">${domEsc(formatUserAltText())} · 🚗 ${domEsc(formatUserSpeedText())}</span><br>` +
        `<span style="font-size:11.5px;color:#475569;">${lat.toFixed(5)}° N, ${lon.toFixed(5)}° O</span>` +
        (nearest ? `<br><span style="font-size:12.5px;">${cfg.icon} Nächster Punkt: <b>${domEsc(nearest.item.name)}</b> (${distStr})</span>` : '')
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
            const dActive = domDistanceKm(domUserLoc, domActive);
            const dirActive = domCompassDirection(domUserLoc, domActive);
            distEl.textContent = `${domNum(dActive, 2)} km (${dirActive})`;
        }
    }

    const si = document.getElementById('dom-search-input');
    const q = (si ? si.value : '').trim();
    if (!q) {
        const cap = document.getElementById('dom-results-Caption');
        if (cap) cap.textContent = `🧭 Nächste ${cfg.nounPlural} rund um deinen Standort (Live):`;
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
                const dKm = domDistanceKm(domUserLoc, pk);
                const dir = domCompassDirection(domUserLoc, pk);
                badge.textContent = `🧭 ${domNum(dKm, 2)} km · Richtung ${dir}`;
            }
        });
    }
}

function findNearestItemTo(lat, lon) {
    if (!domPeaks || !domPeaks.length) return null;
    const pt = { lat, lon };
    let bestItem = null;
    let minKm = Infinity;
    for (const p of domPeaks) {
        if (!isFinite(p.lat) || !isFinite(p.lon)) continue;
        const d = domDistanceKm(pt, p);
        if (d < minKm) {
            minKm = d;
            bestItem = p;
        }
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
    if (!navigator.geolocation) {
        setDomStatus('Standorterkennung wird von diesem Browser nicht unterstützt.');
        return;
    }
    if (forceSelectNearest) {
        setDomStatus(`🧭 Bestimme GPS-Standort & suche nächstgelegenes Ziel (${domCfg().nounSingular}) …`);
    }

    const onPosSuccess = (pos, shouldSelect) => {
        const prevLoc = domUserLoc;
        const nowTs = pos.timestamp || Date.now();
        const newLat = pos.coords.latitude;
        const newLon = pos.coords.longitude;

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

        if (domMode !== 'peaks') {
            enrichNearbyFromWikidata(newLat, newLon, domMode);
        }

        if (shouldSelect || !domInitialAutoSelected[domMode]) {
            if (shouldSelect) domManualOverride = false;
            selectNearestPeakForUser(shouldSelect);
            if (shouldSelect) setDomStatus('');
        } else {
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
                        startInfo.textContent = `Standort nicht freigegeben · Fallback: ${domCfg().fallbackName}`;
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
// SPEZIAL-TELEMETRIE 1: LIVE-LEISTUNG FÜR KRAFTWERKE (OPEN-METEO)
// ===================================================================
async function fetchLivePowerplantOutput(p, token) {
    const box = document.getElementById('dom-live-power-box');
    if (!box || domMode !== 'powerplants') return;

    const maxMw = domVal(p) || 0;
    if (p.status === 'decommissioned') {
        box.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span>🛑 <b>Aktuelle Einspeisung:</b></span>
                <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:#b91c1c;">0 MW (Stillgelegt)</span>
            </div>
            <div style="font-size:11.5px;color:#64748b;margin-top:3px;">Dieses Kraftwerk befindet sich nicht mehr im kommerziellen Leistungsbetrieb.</div>
        `;
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
            let cf = 0;
            if (v100 < 3.0 || v100 >= 25.0) cf = 0;
            else if (v100 >= 12.5) cf = 0.95;
            else cf = Math.pow((v100 - 3.0) / (12.5 - 3.0), 2.6) * 0.95;
            liveMw = maxMw * cf;
            pct = Math.round(cf * 100);
            detailText = `🌬️ Live-Wind am Standort (100 m Nabenhöhe): <b>${domNum(v100, 1)} m/s</b> (${domNum(v100 * 3.6, 0)} km/h)`;
            badgeColor = pct >= 50 ? '#047857' : (pct >= 15 ? '#0369a1' : '#b45309');
        } else if (p.type === 'solar') {
            if (ghi <= 5) {
                liveMw = 0; pct = 0;
                detailText = `🌙 Aktuelle Solarstrahlung: <b>${Math.round(ghi)} W/m²</b> (Nacht / Dämmerung)`;
                badgeColor = '#475569';
            } else {
                const tempLoss = Math.max(0.82, 1 - Math.max(0, temp - 20) * 0.004);
                const cf = Math.min(0.94, (ghi / 920) * tempLoss);
                liveMw = maxMw * cf;
                pct = Math.round(cf * 100);
                detailText = `☀️ Globalstrahlung vor Ort: <b>${Math.round(ghi)} W/m²</b> · Bewölkung: ${clouds}% · ${domNum(temp, 1)} °C`;
                badgeColor = pct >= 45 ? '#b45309' : '#0369a1';
            }
        } else {
            const hour = new Date().getHours();
            const isPeakHour = (hour >= 7 && hour <= 20);
            let baseCf = 0.65;
            if (p.type === 'nuclear') baseCf = 0.92;
            else if (p.type === 'coal') baseCf = isPeakHour ? 0.78 : 0.58;
            else if (p.type === 'hydro') baseCf = isPeakHour ? 0.72 : 0.45;
            else if (p.type === 'gas') baseCf = isPeakHour ? 0.62 : 0.30;
            else if (p.type === 'biomass') baseCf = 0.85;
            liveMw = maxMw * baseCf;
            pct = Math.round(baseCf * 100);
            detailText = `⚙️ Typische aktuelle Betriebsauslastung (${isPeakHour ? 'Tageslast' : 'Grund-/Nachtlast'}) · Vor Ort: ${domNum(temp, 1)} °C, Wind ${domNum(v10, 1)} m/s`;
            badgeColor = '#047857';
        }

        const mwDigits = (liveMw < 50 && liveMw > 0) ? 1 : 0;
        box.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span>⚡ <b>Aktuelle Leistung (Live-Schätzung):</b></span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:14.5px;font-weight:800;color:${badgeColor};">
                    ≈ ${domNum(liveMw, mwDigits)} / ${domNum(maxMw, 0)} MW (${pct} %)
                </span>
            </div>
            <div style="width:100%;height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:6px 0;">
                <div style="width:${Math.min(100, Math.max(2, pct))}%;height:100%;background:${badgeColor};border-radius:999px;transition:width 0.3s;"></div>
            </div>
            <div style="font-size:11.5px;color:#334155;">${detailText}</div>
        `;
    } catch (e) {
        if (token === domGen && box) {
            box.innerHTML = `<div style="font-size:12px;color:#64748b;">⚡ Live-Wettertelemetrie für diesen Standort aktuell nicht erreichbar.</div>`;
        }
    }
}

// ===================================================================
// SPEZIAL-TELEMETRIE 2: BADE-ERLAUBNIS & LIVE-BADEWETTER FÜR SEEN
// ===================================================================
async function fetchLiveLakeBathingInfo(p, token) {
    const subEl = document.getElementById('dom-lake-live-sub');
    if (!subEl || domMode !== 'lakes') return;

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}&current=temperature_2m,wind_speed_10m,uv_index,cloud_cover`;
        const r = await fetch(url, { signal: AbortSignal.timeout(7500) });
        if (!r.ok) return;
        const data = await r.json();
        if (token !== domGen || !document.getElementById('dom-lake-live-sub')) return;

        const cur = data.current || {};
        const airT = cur.temperature_2m;
        const windKmh = cur.wind_speed_10m;
        const uv = cur.uv_index;
        if (airT != null) {
            // Jahreszeitliche Schätzung der Oberflächentemperatur von Binnengewässern
            const month = new Date().getMonth(); // 0..11
            const seasonalBase = [3, 3.5, 6, 10, 15, 19, 21.5, 22, 18, 13, 8, 4.5][month] || 12;
            const estWaterT = Math.max(2, Math.min(26, Math.round((seasonalBase * 0.7 + airT * 0.3) * 10) / 10));
            subEl.innerHTML =
                `🌡️ Vor-Ort-Wetter am See: <b>${domNum(airT, 1)} °C Luft</b> · 💧 Wassertemperatur ≈ <b>${domNum(estWaterT, 1)} °C</b>` +
                (windKmh != null ? ` · 🌬️ Wind ${domNum(windKmh, 0)} km/h` : '') +
                (uv != null ? ` · ☀️ UV-Index ${domNum(uv, 1)}` : '');
        }
    } catch (e) {}
}

// ===================================================================
// WIKIDATA-UMKREIS-ANREICHERUNG (FÜR ALLE KONTEXTE RUND UMS AUTO)
// ===================================================================
async function enrichNearbyFromWikidata(lat, lon, mode) {
    if (mode === 'peaks') return;
    const prev = domNearbyFetched[mode];
    if (prev && domDistanceKm(prev, { lat, lon }) < 22) return;
    domNearbyFetched[mode] = { lat, lon };

    let sparql = '';
    if (mode === 'powerplants') {
        sparql = `
            SELECT ?item ?itemLabel ?coord ?cap ?unit ?type WHERE {
              SERVICE wikibase:around {
                ?item wdt:P625 ?coord .
                bd:serviceParam wikibase:center "Point(${lon.toFixed(3)} ${lat.toFixed(3)})"^^geo:wktLiteral .
                bd:serviceParam wikibase:radius "60" .
              }
              ?item wdt:P31/wdt:P279* wd:Q159719 ;
                    p:P2109/psv:P2109 ?capVal .
              ?capVal wikibase:quantityAmount ?cap ; wikibase:quantityUnit ?unit .
              OPTIONAL { ?item wdt:P31 ?type . }
              SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
            } LIMIT 100
        `;
    } else if (mode === 'towns') {
        sparql = `
            SELECT ?item ?itemLabel ?coord ?pop WHERE {
              SERVICE wikibase:around {
                ?item wdt:P625 ?coord .
                bd:serviceParam wikibase:center "Point(${lon.toFixed(3)} ${lat.toFixed(3)})"^^geo:wktLiteral .
                bd:serviceParam wikibase:radius "40" .
              }
              ?item wdt:P1082 ?pop .
              FILTER(?pop >= 1000)
              SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
            } LIMIT 100
        `;
    } else if (mode === 'towers') {
        sparql = `
            SELECT ?item ?itemLabel ?coord ?h ?unit WHERE {
              SERVICE wikibase:around {
                ?item wdt:P625 ?coord .
                bd:serviceParam wikibase:center "Point(${lon.toFixed(3)} ${lat.toFixed(3)})"^^geo:wktLiteral .
                bd:serviceParam wikibase:radius "45" .
              }
              ?item p:P2048/psv:P2048 ?hVal .
              ?hVal wikibase:quantityAmount ?h ; wikibase:quantityUnit ?unit .
              FILTER(?h >= 15)
              SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
            } LIMIT 100
        `;
    } else if (mode === 'lakes') {
        sparql = `
            SELECT ?item ?itemLabel ?coord ?area ?unit ?use WHERE {
              SERVICE wikibase:around {
                ?item wdt:P625 ?coord .
                bd:serviceParam wikibase:center "Point(${lon.toFixed(3)} ${lat.toFixed(3)})"^^geo:wktLiteral .
                bd:serviceParam wikibase:radius "45" .
              }
              ?item wdt:P31/wdt:P279* wd:Q23397 ;
                    p:P2046/psv:P2046 ?aVal .
              ?aVal wikibase:quantityAmount ?area ; wikibase:quantityUnit ?unit .
              OPTIONAL { ?item wdt:P366 ?use . }
              SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
            } LIMIT 100
        `;
    } else if (mode === 'castles') {
        sparql = `
            SELECT ?item ?itemLabel ?coord ?inception WHERE {
              SERVICE wikibase:around {
                ?item wdt:P625 ?coord .
                bd:serviceParam wikibase:center "Point(${lon.toFixed(3)} ${lat.toFixed(3)})"^^geo:wktLiteral .
                bd:serviceParam wikibase:radius "45" .
              }
              VALUES ?cls { wd:Q23413 wd:Q751876 wd:Q57821 wd:Q17715832 wd:Q44613 }
              ?item wdt:P31 ?cls ; wdt:P571 ?inception .
              SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
            } LIMIT 100
        `;
    }

    if (!sparql) return;

    try {
        const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql);
        const r = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' }, signal: AbortSignal.timeout(12000) });
        if (!r.ok) return;
        const data = await r.json();
        const bindings = data?.results?.bindings || [];
        const list = domDatasets[mode];
        let added = 0;
        const curY = new Date().getFullYear();

        bindings.forEach(b => {
            const id = (b.item?.value || '').split('/').pop();
            const name = b.itemLabel?.value || '';
            if (!id || !name || /^Q\d+$/.test(name) || list.some(x => x.id === id)) return;
            const m = (b.coord?.value || '').match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
            if (!m) return;
            const pLon = parseFloat(m[1]), pLat = parseFloat(m[2]);

            if (mode === 'powerplants') {
                let cap = parseFloat(b.cap?.value || '0');
                const unitQ = (b.unit?.value || '').split('/').pop();
                if (unitQ === 'Q3320608') cap /= 1000;
                else if (unitQ === 'Q5879479') cap *= 1000;
                if (!isFinite(cap) || cap < 3 || cap > 25000) return;
                let pType = 'other';
                if (/solar|photovolta/i.test(name)) pType = 'solar';
                else if (/wind/i.test(name)) pType = 'wind';
                else if (/wasser|pumpspeicher|speicher|hydro|talsperre/i.test(name)) pType = 'hydro';
                else if (/kern|atom|nuclear/i.test(name)) pType = 'nuclear';
                else if (/kohle|braunkohle|steinkohle/i.test(name)) pType = 'coal';
                else if (/gas|heizkraftwerk/i.test(name)) pType = 'gas';
                const cRound = Math.round(cap * 10) / 10;
                list.push({ id, name, lat: pLat, lon: pLon, capacity: cRound, height: cRound, type: pType, range: PLANT_TYPE_META[pType]?.label || 'Kraftwerk' });
                added++;
            } else if (mode === 'towns') {
                const pop = Math.round(parseFloat(b.pop?.value || '0'));
                if (!isFinite(pop) || pop < 1000) return;
                list.push({ id, name, lat: pLat, lon: pLon, population: pop, height: pop, range: 'Stadt / Gemeinde' });
                added++;
            } else if (mode === 'towers') {
                let h = parseFloat(b.h?.value || '0');
                const unitQ = (b.unit?.value || '').split('/').pop();
                if (unitQ === 'Q3710') h *= 0.3048;
                else if (unitQ === 'Q174728') h *= 0.01;
                else if (unitQ !== 'Q11573') return;
                if (!isFinite(h) || h < 15 || h > 830) return;
                let tType = 'lookout';
                if (/fernsehturm|funkturm|sender/i.test(name)) tType = 'tvtower';
                else if (/hochhaus|tower|wolkenkratzer/i.test(name)) tType = 'skyscraper';
                else if (/kirche|dom|münster/i.test(name)) tType = 'church';
                else if (/brücke|kamin|schornstein/i.test(name)) tType = 'industrial';
                const hRound = Math.round(h * 10) / 10;
                list.push({ id, name, lat: pLat, lon: pLon, height: hRound, type: tType, range: TOWER_TYPE_META[tType]?.label || 'Turm / Bauwerk' });
                added++;
            } else if (mode === 'lakes') {
                let area = parseFloat(b.area?.value || '0');
                const unitQ = (b.unit?.value || '').split('/').pop();
                if (unitQ === 'Q25343') area /= 1e6;
                else if (unitQ === 'Q35852') area *= 0.01;
                else if (unitQ !== 'Q712226') return;
                if (!isFinite(area) || area < 0.01 || area > 380000) return;
                const useQ = (b.use?.value || '').split('/').pop();
                const isNoSwim = useQ === 'Q7892' || /trinkwasser|gottleuba|lehnmühle|klingenberg|eibenstock|sosa|cranzahl|rauschenbach|saidenbach/i.test(name);
                const swim = isNoSwim ? 'no' : (/talsperre|stausee/i.test(name) ? 'check' : 'yes');
                const swimNote = isNoSwim ? '🚫 Baden verboten (Trinkwasserschutz / Betriebsanlage)' : (swim === 'check' ? '⚠️ Stausee / Talsperre (Baden nur an ausgewiesenen Strandbereichen)' : '🏊 Badesee / Natursee (Baden an öffentlichen Ufern erlaubt)');
                const aRound = Math.round(area * 1000) / 1000;
                list.push({ id, name, lat: pLat, lon: pLon, area: aRound, height: aRound, swim, swimNote, range: 'See / Talsperre' });
                added++;
            } else if (mode === 'castles') {
                const inc = String(b.inception?.value || '');
                const mYr = inc.match(/^([+-]?\d{1,5})-/);
                if (!mYr) return;
                const yr = parseInt(mYr[1], 10);
                const age = curY - yr;
                if (!isFinite(age) || age < 60 || age > 12000) return;
                let cType = 'castle';
                if (/schloss|palast|zwinger|residenz/i.test(name)) cType = 'palace';
                else if (/festung|zitadelle|fort/i.test(name)) cType = 'fortress';
                list.push({ id, name, lat: pLat, lon: pLon, age, year: yr, height: age, type: cType, range: CASTLE_TYPE_META[cType]?.label || 'Burg / Schloss' });
                added++;
            }
        });

        if (added > 0 && domMode === mode) {
            recomputeIsolationsForDataset(list);
            const cnt = document.getElementById('dom-count');
            if (cnt) cnt.textContent = `${domNum(list.length)} ${domCfg().nounPlural} weltweit`;
            domPaint();
            refreshLiveUserDistancesUI();
        }
    } catch (e) {}
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
    setDomStatus('Standortwert & Dominanz werden berechnet …');
    if (domPickMarker) dominanzMap.removeLayer(domPickMarker);
    domPickMarker = L.marker([lat, lon], {
        icon: L.divIcon({ className: 'domPickWrap', html: '<span class="domPickDot"></span>', iconSize: [16, 16] }),
        title: 'Gewählter Punkt', zIndexOffset: 1200
    }).addTo(dominanzMap);

    if (domMode === 'peaks') {
        fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                if (token !== domGen) return;
                const elev = (data && data.elevation && data.elevation.length) ? Math.round(data.elevation[0]) : null;
                let best = null, bestd = Infinity;
                if (elev != null) {
                    const pt = { lat, lon };
                    for (const q of domPeaks) {
                        if ((domVal(q) || 0) <= elev) continue;
                        const d = domDistanceKm(pt, { lat: q.lat, lon: q.lon });
                        if (d < bestd && d > 0.001) { bestd = d; best = q; }
                    }
                }
                const p = {
                    id: 'pick', name: 'Gewählter Kartenpunkt', lat, lon,
                    height: elev, isolation: best ? round2(bestd) : null, isoCalc: true,
                    range: 'Live-Messung (Open-Meteo)'
                };
                renderPickResult(p, best);
                setDomStatus('');
            })
            .catch(() => { if (token === domGen) setDomStatus('Höhenabfrage nicht erreichbar – bitte erneut versuchen.'); });
    } else {
        const defaultRefVals = { powerplants: 10, towns: 1000, towers: 30, lakes: 0.25, castles: 250 };
        const refVal = defaultRefVals[domMode] || 10;
        const pt = { lat, lon };
        let best = null, bestd = Infinity;
        for (const q of domPeaks) {
            if ((domVal(q) || 0) <= refVal) continue;
            const d = domDistanceKm(pt, q);
            if (d < bestd && d > 0.001) { bestd = d; best = q; }
        }
        const p = {
            id: 'pick', name: 'Gewählter Kartenpunkt', lat, lon,
            height: refVal, capacity: refVal, population: refVal, area: refVal, age: refVal,
            isolation: best ? round2(bestd) : null, isoCalc: true,
            range: `Simulierter Referenzpunkt (${domFormatVal(refVal)})`
        };
        renderPickResult(p, best);
        setDomStatus('');
    }
}

function round2(x) { return Math.round(x * 100) / 100; }

function renderPickResult(p, ref) {
    const cfg = domCfg();
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
            title: cfg.higherLabel + ': ' + ref.name, zIndexOffset: 1000
        }).bindTooltip(domEsc(ref.name), { permanent: true, direction: 'top', className: 'domHigherTip', offset: [0,-10] })
            .on('click', () => domSelect(ref)).addTo(dominanzMap);
        const b = domCircle.getBounds(); b.extend([ref.lat, lon]);
        dominanzMap.fitBounds(b.pad(0.25), { maxZoom: 13, animate: false });
    }
    document.getElementById('dom-detail').innerHTML =
        `<div class="eyebrow-dark" style="display:block; margin-bottom:4px;">📍 ${domEsc(p.range)}</div>` +
        '<h3 style="font-size:22px; font-weight:800; margin:0 0 12px;">Gewählter Kartenpunkt</h3>' +
        '<div class="person-grid-2" style="margin:0 0 10px;">' +
        `<div class="person-box" style="background:#ecfdf5; border-color:#a7f3d0;"><span class="person-role">${domEsc(cfg.valueLabel)}</span><div class="person-name" style="font-size:18px;">${domFormatVal(domVal(p))}</div></div>` +
        '<div class="person-box" style="background:#fffbeb; border-color:#fde68a;"><span class="person-role" style="color:var(--amber);">Dominanz ≈</span><div class="person-name" style="font-size:18px;">' + (p.isolation != null ? domNum(p.isolation, 2) + ' km' : '–') + '</div></div>' +
        '</div>' +
        (ref ? `<p class="dom-note">${domEsc(cfg.higherLabel)}: <b>${domEsc(ref.name)}</b> (${domFormatVal(domVal(ref))}) – ${domNum(p.isolation, 2)} km entfernt.</p>` : '<p class="dom-note">Kein höherer Punkt im Datensatz gefunden.</p>') +
        '<p class="dom-note">Koordinaten: ' + p.lat.toFixed(4) + '°, ' + p.lon.toFixed(4) + '°.</p>';
}

// ===================================================================
// DATEN LADEN & ISOLATION BERECHNEN (ALLE 6 KONTEXTE)
// ===================================================================
function normalizeHeightMeters(h) {
    if (typeof h !== 'number' || !isFinite(h)) return h;
    if (h > 8849) return Math.round(h * 0.3048);
    return h;
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
        if (isFinite(minKm)) {
            p.isolation = round2(minKm);
            p.isoCalc = true;
        } else {
            p.isolation = null;
        }
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
            } else {
                recomputeIsolationsForDataset(data);
            }
            domDatasets[targetMode] = data;
            domLoaded[targetMode] = true;

            if (domMode === targetMode) {
                onModeDatasetReady(targetMode);
            }
        })
        .catch(() => {
            if (domMode === targetMode) {
                setDomStatus(`⏳ Datei ${cfg.file} wird gerade vom GitHub-Workflow gebaut – bitte in ca. 30 Sekunden neu laden.`);
                const cnt = document.getElementById('dom-count');
                if (cnt) cnt.textContent = `${cfg.file} wird erstellt …`;
            }
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

    if (domUserLoc) {
        updateDomUserMarker();
        if (mode !== 'peaks') {
            enrichNearbyFromWikidata(domUserLoc.lat, domUserLoc.lon, mode);
        }
        selectNearestPeakForUser(true);
    } else {
        const fb = domPeaks.find(p => p.id === cfg.fallbackId) || domPeaks.find(p => p.name === cfg.fallbackName) || domPeaks[0];
        if (fb) domSelect(fb, null, { isFallback: true, clearSearchInput: true });
        domSearch();
    }

    domPaint();
    setTimeout(() => { if (dominanzMap) dominanzMap.invalidateSize(); domPaint(); }, 300);
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

// ===================================================================
// FARB- & GRÖSSENSKALA FÜR ALLE 6 KONTEXTE
// ===================================================================
function domColorForItem(p) {
    const v = domVal(p);
    if (domMode === 'powerplants') {
        return (PLANT_TYPE_META[p?.type] || PLANT_TYPE_META.other).color;
    }
    if (domMode === 'towers') {
        return (TOWER_TYPE_META[p?.type] || TOWER_TYPE_META.tvtower).color;
    }
    if (domMode === 'lakes') {
        const sw = p?.swim || 'yes';
        return (LAKE_SWIM_META[sw] || LAKE_SWIM_META.yes).color;
    }
    if (domMode === 'castles') {
        if (v == null) return '#94a3b8';
        if (v >= 2500) return '#7e22ce';
        if (v >= 1000) return '#dc2626';
        if (v >= 600)  return '#f97316';
        if (v >= 300)  return '#eab308';
        return '#16a34a';
    }
    if (domMode === 'towns') {
        if (v == null) return '#94a3b8';
        if (v >= 5000000) return '#7e22ce';
        if (v >= 1000000) return '#dc2626';
        if (v >= 500000)  return '#ef4444';
        if (v >= 100000)  return '#f97316';
        if (v >= 50000)   return '#eab308';
        if (v >= 10000)   return '#65a30d';
        return '#16a34a';
    }
    // Peaks
    if (v == null) return '#94a3b8';
    if (v > 7000) return '#8b2fc9';
    if (v >= 6000) return '#e01b1b';
    if (v >= 5000) return '#f2766e';
    if (v >= 4000) return '#f27405';
    if (v >= 3000) return '#d9a406';
    if (v >= 2000) return '#f2d307';
    if (v >= 1000) return '#5bd16a';
    return '#1a6b2e';
}

function domRadiusForItem(p) {
    const v = domVal(p);
    if (v == null) return 5;
    if (domMode === 'powerplants') {
        if (v >= 3000) return 9.5;
        if (v >= 1000) return 8;
        if (v >= 300)  return 7;
        if (v >= 50)   return 6;
        return 5;
    }
    if (domMode === 'towns') {
        if (v >= 5000000) return 9.5;
        if (v >= 1000000) return 8.5;
        if (v >= 250000)  return 7.5;
        if (v >= 50000)   return 6.5;
        return 5.5;
    }
    if (domMode === 'towers') {
        if (v >= 400) return 9;
        if (v >= 250) return 8;
        if (v >= 150) return 7;
        if (v >= 80)  return 6;
        return 5;
    }
    if (domMode === 'lakes') {
        if (v >= 1000) return 9.5;
        if (v >= 100)  return 8;
        if (v >= 10)   return 7;
        if (v >= 1)    return 6;
        return 5.5;
    }
    if (domMode === 'castles') {
        if (v >= 2500) return 9;
        if (v >= 1000) return 8;
        if (v >= 700)  return 7;
        if (v >= 400)  return 6;
        return 5.5;
    }
    if (v > 7000) return 9;
    if (v >= 5000) return 8;
    if (v >= 3000) return 7;
    if (v >= 2000) return 6;
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
        .sort((a, c) => (domVal(c) || 0) - (domVal(a) || 0))
        .slice(0, cap);
    shown.forEach(p => {
        const r = domRadiusForItem(p);
        const val = domVal(p);
        const swimSuffix = (domMode === 'lakes' && p.swim)
            ? ` · ${p.swim === 'no' ? '🚫 Badeverbot' : (p.swim === 'yes' ? '🏊 Badesee' : '⚠️ Stausee')}`
            : '';
        L.circleMarker([p.lat, p.lon], {
            radius: r, color: 'rgba(0,0,0,0.45)', weight: 1,
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

// ===================================================================
// DOMINANZKETTE: NÄCHSTHÖHERES OBJEKT BESTIMMEN & ANZEIGEN
// ===================================================================
function domNearestHigher(p) {
    const cfg = domCfg();
    const valP = domVal(p);
    if (p.id === cfg.supremeId || !Number.isFinite(valP)) return null;
    let best = null, min = Infinity;
    for (const c of domPeaks) {
        const valC = domVal(c);
        if (c.id === p.id || !Number.isFinite(valC) || valC <= valP) continue;
        const d = domDistanceKm(p, c);
        if (d > 0.01 && d < min) { best = c; min = d; }
    }
    return best;
}

function domOfferHigher(p, next, token) {
    if (token !== domGen) return;
    const cfg = domCfg();
    const box = document.getElementById('dom-higher');
    if (!box) return;
    if (!next) {
        box.innerHTML = '<p class="dom-note">' +
            (p.id === cfg.supremeId ? cfg.supremeNote :
            domVal(p) == null ? `Für die Dominanzsuche wird ein bekannter Wert (${cfg.unit}) benötigt.` :
            cfg.supremeNote) + '</p>';
        return;
    }
    domReference = next;
    const domDistKm = domDistanceKm(p, next);
    if (p.isolation == null || p.isoCalc) {
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

    box.innerHTML =
        `<button type="button" class="dom-higher-btn">⬆️ ${domEsc(cfg.higherLabel)}: ${domEsc(next.name)} ` +
        `<span class="dom-higher-h">${domFormatVal(domVal(next))}</span> →</button>` +
        '<p class="dom-note">' + domNum(domDistKm, 2) +
        (asLine
            ? ` km Luftlinie bis zum ${cfg.refLabel} (direkte Geodäte).`
            : ` km Luftlinie bis zum ${cfg.refLabel} (Kreisradius).`) +
        ' Klick dich Schritt für Schritt weiter nach oben!</p>';
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
    if (!dominanzMap || !p) return;
    const cfg = domCfg();
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

    // Kontextspezifische Zusatzboxen (Kraftwerke / Seen Bade-Info / Burgen Baujahr)
    let extraContextHtml = '';
    if (domMode === 'powerplants') {
        extraContextHtml = `
            <div id="dom-live-power-box" style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px; padding:10px 12px; margin-bottom:10px; font-size:12.5px;">
                ⏳ Berechne aktuelle Live-Einspeisung am Standort (Open-Meteo) …
            </div>
        `;
    } else if (domMode === 'lakes') {
        const sw = p.swim || 'yes';
        const swMeta = LAKE_SWIM_META[sw] || LAKE_SWIM_META.yes;
        const noteText = p.swimNote || swMeta.label;
        extraContextHtml = `
            <div style="background:${swMeta.badgeBg}; border:1.5px solid ${swMeta.badgeBorder}; color:${swMeta.badgeText}; border-radius:12px; padding:10px 12px; margin-bottom:10px;">
                <div style="font-weight:800; font-size:13.5px; margin-bottom:3px;">${domEsc(noteText)}</div>
                <div id="dom-lake-live-sub" style="font-size:11.5px; opacity:0.9;">⏳ Lade aktuelles Vor-Ort-Wetter &amp; Wassertemperatur-Schätzung …</div>
            </div>
        `;
    } else if (domMode === 'castles') {
        const yrTxt = domFormatCastleYear(p);
        if (yrTxt) {
            extraContextHtml = `
                <div style="background:#fffbeb; border:1.5px solid #fde68a; color:#92400e; border-radius:12px; padding:9px 12px; margin-bottom:10px; font-size:12.5px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
                    <span>📜 Entstehungszeit / Ersterwähnung:</span>
                    <span style="font-family:'JetBrains Mono',monospace; font-weight:800;">${domEsc(yrTxt)}</span>
                </div>
            `;
        }
    }

    const subtitleDefault = domMode === 'powerplants'
        ? (PLANT_TYPE_META[p.type]?.label || p.range || 'Kraftwerk') + (p.country ? ' · ' + p.country : '')
        : domMode === 'peaks'
            ? (p.range || 'Gebirge wird geprüft …')
            : (p.range || cfg.nounSingular);

    const wikiSearch = 'https://de.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(p.name);
    document.getElementById('dom-detail').innerHTML =
        '<div id="dom-photo"></div>' +
        '<div id="dom-range" class="eyebrow-dark" style="display:block; margin-bottom:4px;">' + domEsc(subtitleDefault) + '</div>' +
        `<h3 style="font-size:24px; font-weight:800; margin:0 0 10px;">${domItemIcon(p)} ${domEsc(p.name)}</h3>` +
        userDistHtml +
        '<div class="person-grid-2" style="margin:0 0 10px;">' +
        `<div class="person-box" style="background:#ecfdf5; border-color:#a7f3d0;"><span class="person-role">${domEsc(cfg.valueLabel)}</span><div class="person-name" style="font-size:18px;">${domFormatVal(domVal(p))}</div></div>` +
        '<div class="person-box" style="background:#fffbeb; border-color:#fde68a;"><span class="person-role" style="color:var(--amber);">Dominanz' + (p.isoCalc ? ' ≈' : '') + '</span><div id="dom-iso-val" class="person-name" style="font-size:18px;">' + (p.isolation != null ? domNum(p.isolation, 2) + ' km' : '–') + '</div></div>' +
        '</div>' +
        extraContextHtml +
        `<div id="dom-higher" style="margin:4px 0 10px;"><p class="dom-note">${domEsc(cfg.refLabel)} wird geprüft …</p></div>` +
        '<p id="dom-summary" style="font-size:12.8px; line-height:1.55; color:#334155; margin:0 0 10px;"></p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">' +
        '<a class="btn btn-dark" id="dom-wiki" href="' + wikiSearch + '" target="_blank" rel="noopener" style="font-size:12px; padding:7px 12px;">Auf Wikipedia weiterlesen ↗</a>' +
        (String(p.id).startsWith('Q') ? '<a class="btn btn-sand" href="https://www.wikidata.org/wiki/' + domEsc(p.id) + '" target="_blank" rel="noopener" style="font-size:12px; padding:7px 12px;">Wikidata ↗</a>' : '') +
        '</div>';

    domOfferHigher(p, domNearestHigher(p), token);
    if (domMode === 'powerplants') fetchLivePowerplantOutput(p, token);
    if (domMode === 'lakes') fetchLiveLakeBathingInfo(p, token);
    if (String(p.id).startsWith('Q')) domEnrich(p, token, known);
}

// ===================================================================
// WIKIDATA / WIKIPEDIA ANREICHERUNG (FOTOS, TEXT & DATEN)
// ===================================================================
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

function domItemFromEntity(e, id) {
    const c = domClaim(e, 'P625'); if (!c) return null;
    const name = e.labels.de?.value || e.labels.en?.value || id;

    if (domMode === 'powerplants') {
        const capClaim = domClaim(e, 'P2109');
        let mw = capClaim ? +capClaim.amount : null;
        const unitQ = capClaim?.unit?.split('/').pop();
        if (mw != null) {
            if (unitQ === 'Q3320608') mw /= 1000;
            else if (unitQ === 'Q5879479') mw *= 1000;
        }
        let pType = 'other';
        if (/solar|photovolta/i.test(name)) pType = 'solar';
        else if (/wind/i.test(name)) pType = 'wind';
        else if (/wasser|pumpspeicher|speicher|hydro|staudamm/i.test(name)) pType = 'hydro';
        else if (/kern|atom|nuclear/i.test(name)) pType = 'nuclear';
        else if (/kohle|braunkohle|steinkohle/i.test(name)) pType = 'coal';
        else if (/gas|heizkraftwerk/i.test(name)) pType = 'gas';
        const cRound = mw ? Math.round(mw * 10) / 10 : null;
        return { id, name, lat: c.latitude, lon: c.longitude, capacity: cRound, height: cRound, type: pType, range: PLANT_TYPE_META[pType]?.label || 'Kraftwerk', isoCalc: true };
    }

    if (domMode === 'towns') {
        const popClaim = domClaim(e, 'P1082');
        const pop = popClaim ? Math.round(+popClaim.amount) : null;
        return { id, name, lat: c.latitude, lon: c.longitude, population: pop, height: pop, range: 'Stadt / Gemeinde', isoCalc: true };
    }

    if (domMode === 'towers') {
        const hClaim = domClaim(e, 'P2048');
        let h = hClaim ? +hClaim.amount : null;
        const unitQ = hClaim?.unit?.split('/').pop();
        if (h != null && unitQ === 'Q3710') h *= 0.3048;
        const hRound = h ? Math.round(h * 10) / 10 : null;
        return { id, name, lat: c.latitude, lon: c.longitude, height: hRound, type: 'tvtower', range: 'Turm / Bauwerk', isoCalc: true };
    }

    if (domMode === 'lakes') {
        const aClaim = domClaim(e, 'P2046');
        let area = aClaim ? +aClaim.amount : null;
        const unitQ = aClaim?.unit?.split('/').pop();
        if (area != null) {
            if (unitQ === 'Q25343') area /= 1e6;
            else if (unitQ === 'Q35852') area *= 0.01;
        }
        const isNoSwim = /trinkwasser|gottleuba|lehnmühle|klingenberg|eibenstock/i.test(name);
        const swim = isNoSwim ? 'no' : (/talsperre|stausee/i.test(name) ? 'check' : 'yes');
        const aRound = area ? Math.round(area * 1000) / 1000 : null;
        return { id, name, lat: c.latitude, lon: c.longitude, area: aRound, height: aRound, swim, range: 'See / Talsperre', isoCalc: true };
    }

    if (domMode === 'castles') {
        const incClaim = domClaim(e, 'P571');
        let yr = null, age = null;
        if (incClaim && incClaim.time) {
            const m = String(incClaim.time).match(/^([+-]?\d{1,5})-/);
            if (m) {
                yr = parseInt(m[1], 10);
                age = new Date().getFullYear() - yr;
            }
        }
        return { id, name, lat: c.latitude, lon: c.longitude, age, year: yr, height: age, type: 'castle', range: 'Burg / Monument', isoCalc: true };
    }

    const h = domClaim(e, 'P2044'), iso = domClaim(e, 'P2659'), unit = iso?.unit?.split('/').pop();
    return {
        id, name, lat: c.latitude, lon: c.longitude,
        height: h ? normalizeHeightMeters(+h.amount) : null,
        isolation: iso ? +iso.amount * (unit === 'Q11573' ? .001 : unit === 'Q253276' ? 1.609344 : 1) : null,
        range: null
    };
}

async function domEnrich(p, token, known) {
    try {
        const e = known || await domEntity(p.id);
        if (token !== domGen) return;

        if (domMode === 'peaks') {
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
        }

        const site = e.sitelinks?.dewiki || e.sitelinks?.enwiki, lang = e.sitelinks?.dewiki ? 'de' : 'en';
        if (site) {
            const url = 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(site.title);
            const wk = document.getElementById('dom-wiki'); if (wk) wk.href = url;
            const r = await domGetJSON('https://' + lang + '.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(site.title) + '&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=650&format=json&origin=*');
            if (token !== domGen) return;
            const page = Object.values(r.query.pages)[0]; const text = page.extract || '';
            const sm = document.getElementById('dom-summary');
            if (sm) sm.textContent = text.length > 320 ? text.slice(0, 317).replace(/\s+\S*$/, '') + ' …' : text;
            if (page.thumbnail) {
                const ph = document.getElementById('dom-photo');
                if (ph) ph.innerHTML = '<img src="' + domEsc(page.thumbnail.source) + '" alt="' + domEsc(p.name) + '" style="width:100%; max-height:220px; object-fit:cover; border-radius:12px; margin-bottom:10px;">';
            }
        }
    } catch (err) {}
}

// ===================================================================
// SUCHE & ECHTZEIT-UMGEBUNGSLISTE (INKL. LIVE-DISTANZ-NACHFÜHRUNG)
// ===================================================================
function domRenderResults(items, remote = false, showDistance = false) {
    const box = document.getElementById('dom-results');
    if (!box) return;
    box.innerHTML = items.map((p, i) => {
        const isCurrent = domActive && domActive.id === p.id;
        const val = domVal(p);
        let subLine = '';
        if (showDistance && domUserLoc && isFinite(p.lat) && isFinite(p.lon)) {
            const dKm = domDistanceKm(domUserLoc, p);
            const dir = domCompassDirection(domUserLoc, p);
            subLine = `<div class="dom-live-dist-line" style="font-size:11.5px; color:#2563eb; font-weight:700; margin-top:1px; font-family:'JetBrains Mono',monospace;">🧭 ${domNum(dKm, 2)} km · Richtung ${dir}</div>`;
        }
        let extraRight = '';
        if (domMode === 'lakes' && p.swim) {
            extraRight = `<div style="font-size:10.5px; font-weight:700; color:${p.swim === 'no' ? '#dc2626' : (p.swim === 'yes' ? '#0284c7' : '#d97706')};">${p.swim === 'no' ? '🚫 Badeverbot' : (p.swim === 'yes' ? '🏊 Baden ok' : '⚠️ Stausee')}</div>`;
        } else if (domMode === 'castles' && (p.year != null || p.age != null)) {
            extraRight = `<div style="font-size:10.5px; color:#64748b;">${domEsc(domFormatCastleYear(p))}</div>`;
        }
        return `
            <div class="peak-item ${isCurrent ? 'active' : ''}" data-i="${i}" data-peak-id="${domEsc(p.id || '')}">
                <div>
                    <div style="font-weight:800; font-size:14px; color:var(--text-dark);">${domItemIcon(p)} ${domEsc(p.name)}</div>
                    ${subLine}
                </div>
                <div style="text-align:right;">
                    <div style="font-family:'JetBrains Mono',monospace; font-weight:700; font-size:13px; color:var(--emerald-dark);">
                        ${val != null ? domFormatVal(val) : (remote ? 'Wikidata ↗' : '')}
                    </div>
                    ${extraRight}
                </div>
            </div>
        `;
    }).join('');
    box.querySelectorAll('.peak-item').forEach((b, i) => {
        b.onclick = () => remote ? domLoadEntity(items[i].id) : domSelect(items[i], null, { clearSearchInput: showDistance });
    });
}

async function domSearch() {
    const cfg = domCfg();
    const si = document.getElementById('dom-search-input');
    const cap = document.getElementById('dom-results-Caption');
    const q = (si ? si.value : '').trim();
    const token = ++domSearchGen;

    if (!q) {
        if (domUserLoc && domPeaks.length) {
            if (cap) cap.textContent = `🧭 Nächste ${cfg.nounPlural} rund um deinen Standort (Live):`;
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
        .sort((a, b) => domNorm(a.name).indexOf(domNorm(q)) - domNorm(b.name).indexOf(domNorm(q))).slice(0, 7);
    domRenderResults(local, false, Boolean(domUserLoc));
    if (local.length >= 5) return;

    try {
        const r = await domGetJSON('https://www.wikidata.org/w/api.php?action=wbsearchentities&search=' + encodeURIComponent(q) + '&language=de&uselang=de&limit=10&format=json&origin=*');
        if (token !== domSearchGen) return;
        const rxMap = {
            peaks:       /berg|gipfel|mountain|peak|vulkan|volcano|summit/i,
            powerplants: /kraftwerk|windpark|solarpark|staudamm|power station|power plant|nuclear|hydroelectric|wind farm|solar farm|talsperre/i,
            towns:       /stadt|gemeinde|metropole|city|town|municipality|hauptstadt|capital|dorf|ort/i,
            towers:      /turm|fernsehturm|funkturm|wolkenkratzer|hochhaus|tower|skyscraper|kirche|dom|münster|brücke|schornstein/i,
            lakes:       /see|stausee|talsperre|badesee|meer|lake|reservoir|teich/i,
            castles:     /burg|schloss|festung|ruine|pyramide|tempel|castle|palace|fortress|monument/i
        };
        const rx = rxMap[domMode] || rxMap.peaks;

        const more = r.search.filter(p => !local.some(x => x.id === p.id) && rx.test((p.description || '') + ' ' + (p.label || '')))
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
    setDomStatus(`${domCfg().nounSingular} wird aus Wikidata geladen …`);
    try {
        const e = await domEntity(id), c = domClaim(e, 'P625');
        if (!c) throw new Error('Keine Koordinaten');
        const p = domItemFromEntity(e, id);
        if (!p) throw new Error('Kein gültiges Objekt');
        if (!domPeaks.some(x => x.id === id)) {
            domPeaks.push(p);
            recomputeIsolationsForDataset(domPeaks);
        }
        setDomStatus('');
        domSelect(p, e);
    } catch {
        setDomStatus('Dieser Treffer hat keine auswertbaren Koordinaten.');
    }
}

function openDominanzInfo() { document.getElementById('dom-info-modal').classList.add('open'); }
function closeDominanzInfo() { document.getElementById('dom-info-modal').classList.remove('open'); }
