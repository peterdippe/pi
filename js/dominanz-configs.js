// ===================================================================
// DOMINANZ-ATLAS – TEIL 1: KONFIGURATION, FARBSKALEN, LEGENDE & ORTE
// ===================================================================

window.domEsc = window.domEsc || (s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
window.domNum = window.domNum || ((n, d = 0) => (n == null || !isFinite(n)) ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
window.domNorm = window.domNorm || (s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

const DOM_MODES_ORDER = ['peaks', 'powerplants', 'towns', 'towers', 'lakes', 'castles', 'weather'];
const domPlaceCache = {};

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
        supremeHint: '🏔️ Endpunkt: Mount Everest (8.849 m) 🎯',
        supremeNote: '🏔️ Mount Everest – höchster Berg der Erde (8.849 m). Kein höherer Bezugsgipfel.',
        fallbackId: 'Q3375',
        fallbackName: 'Zugspitze',
        searchPlaceholder: '🔍 Berg suchen (oder leer lassen für Umkreis- & Sichtfeld-Liste)',
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
        supremeHint: '⚡ Endpunkt: Drei-Schluchten-Staudamm (22.500 MW) 🎯',
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
        supremeHint: '🏙️ Endpunkt: Tokio (37,4 Mio. Einwohner) 🎯',
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
        supremeHint: '📡 Endpunkt: Burj Khalifa (828 m) 🎯',
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
        supremeHint: '🌊 Endpunkt: Kaspisches Meer (371.000 km²) 🎯',
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
        supremeHint: '🏰 Endpunkt: Göbekli Tepe (~11.500 Jahre) 🎯',
        supremeNote: '🏰 Göbekli Tepe – älteste bekannte Monumentalanlage der Menschheit (~9500 v. Chr.).',
        fallbackId: 'Q157723',
        fallbackName: 'Festung Königstein',
        searchPlaceholder: '🔍 Burg, Schloss oder Monument suchen (z. B. Königstein, Stolpen, Gizeh …)',
        locateBtnText: '🧭 Nächste Burg (GPS)',
        defaultIds: ['Q157723', 'Q882711', 'Q315218', 'Q37200', 'Q211276']
    },
    weather: {
        file: 'weatherstations.json',
        icon: '🌡️',
        nounSingular: 'Wetterstation',
        nounPlural: 'Wetterstationen',
        unit: '°C',
        valueLabel: '2m-Temperatur (10-Min-Snapshot)',
        higherLabel: 'Nächste wärmere Station',
        refLabel: 'Bezugsstation',
        supremeId: 'WS_DEATH_VALLEY',
        supremeHint: '🔥 Ermittle aktuellen Hitzepol der Erde …',
        supremeNote: '🌡️ Globales Temperatur-Extremum im aktuellen 10-Minuten-Messnetz erreicht!',
        fallbackId: 'WMO_10488',
        fallbackName: 'Wetterwarte Dresden-Klotzsche (DWD)',
        searchPlaceholder: '🔍 Wetterstation suchen (z. B. Dresden, Zinnwald, Sněžka, Zugspitze, Wostok …)',
        locateBtnText: '🧭 Nächste Wetterstation (GPS)',
        defaultIds: ['WMO_10488', 'WMO_10582', 'WMO_11653', 'WMO_10961', 'WS_DEATH_VALLEY', 'WS_VOSTOK']
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

const ISO_COUNTRY_DE = {
    DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', CZ: 'Tschechien', PL: 'Polen',
    FR: 'Frankreich', IT: 'Italien', ES: 'Spanien', PT: 'Portugal', NL: 'Niederlande',
    BE: 'Belgien', LU: 'Luxemburg', DK: 'Dänemark', SE: 'Schweden', NO: 'Norwegen',
    FI: 'Finnland', GB: 'Großbritannien', IE: 'Irland', HU: 'Ungarn', SK: 'Slowakei',
    SI: 'Slowenien', HR: 'Kroatien', GR: 'Griechenland', RO: 'Rumänien', BG: 'Bulgarien',
    TR: 'Türkei', RU: 'Russland', UA: 'Ukraine', US: 'USA', CA: 'Kanada', MX: 'Mexiko',
    BR: 'Brasilien', AR: 'Argentinien', CN: 'China', JP: 'Japan', IN: 'Indien',
    AU: 'Australien', NZ: 'Neuseeland', ZA: 'Südafrika', EG: 'Ägypten', AQ: 'Antarktis',
    GL: 'Grönland', KW: 'Kuwait', IR: 'Iran', PK: 'Pakistan', SA: 'Saudi-Arabien',
    CK: 'Cookinseln', PF: 'Französisch-Polynesien', FJ: 'Fidschi', IS: 'Island'
};

function domCfg() {
    const base = DOM_MODE_CFG[domMode] || DOM_MODE_CFG.peaks;
    if (domMode === 'weather') {
        base.higherLabel = domWeatherPolarity === 'cold' ? 'Nächste kältere Station' : 'Nächste wärmere Station';
        base.refLabel = domWeatherPolarity === 'cold' ? 'Kältere Bezugsstation' : 'Wärmere Bezugsstation';
    }
    return base;
}

function domVal(p) {
    if (!p) return null;
    if (domMode === 'weather') {
        const v = p.temp ?? p.height;
        return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 10) / 10 : null;
    }
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
    if (domMode === 'weather') {
        const rounded = Math.round(v * 10) / 10;
        const sign = rounded > 0 ? '+' : '';
        return sign + domNum(rounded, 1) + (withUnit ? ' °C' : '');
    }
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
    if (domMode === 'weather') {
        const t = domVal(p);
        if (t == null) return '🌡️';
        if (t <= -15) return '🥶';
        if (t <= 0)   return '❄️';
        if (t >= 30)  return '🔥';
        if (t >= 20)  return '☀️';
        return '🌡️';
    }
    if (domMode === 'powerplants') return (PLANT_TYPE_META[p?.type] || PLANT_TYPE_META.other).icon;
    if (domMode === 'towers')      return (TOWER_TYPE_META[p?.type] || TOWER_TYPE_META.tvtower).icon;
    if (domMode === 'lakes')       return p?.swim === 'no' ? '🚫' : (p?.swim === 'yes' ? '🏊' : '🌊');
    if (domMode === 'castles')     return (CASTLE_TYPE_META[p?.type] || CASTLE_TYPE_META.castle).icon;
    return domCfg().icon;
}

function getInitialPlaceLabel(p) {
    if (!p) return '';
    if (p.placeLabel) return p.placeLabel;
    const key = `${Number(p.lat).toFixed(3)},${Number(p.lon).toFixed(3)}`;
    if (domPlaceCache[key]) {
        p.placeLabel = domPlaceCache[key];
        return p.placeLabel;
    }
    if (p.city && p.country) {
        const cName = ISO_COUNTRY_DE[p.country] || p.country;
        return `${p.city}, ${cName}`;
    }
    if (p.country) {
        return ISO_COUNTRY_DE[p.country] || p.country;
    }
    if (p.range && p.range.includes('·')) {
        const rhs = p.range.split('·').pop().trim();
        if (ISO_COUNTRY_DE[rhs]) return ISO_COUNTRY_DE[rhs];
        if (rhs.length > 2) return rhs;
    }
    return '';
}

async function resolvePlaceLabel(p) {
    if (!p || !isFinite(p.lat) || !isFinite(p.lon)) return '';
    if (p.placeLabel) return p.placeLabel;
    const key = `${Number(p.lat).toFixed(3)},${Number(p.lon).toFixed(3)}`;
    if (domPlaceCache[key]) {
        p.placeLabel = domPlaceCache[key];
        return p.placeLabel;
    }
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&zoom=12&accept-language=de`;
        const r = await fetch(url, { signal: AbortSignal.timeout(6500) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const addr = data?.address || {};
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || addr.county || addr.state || '';
        const country = addr.country || ISO_COUNTRY_DE[p.country] || p.country || '';

        let label = '';
        if (city && country && domNorm(city) !== domNorm(p.name)) {
            label = `${city}, ${country}`;
        } else if (addr.county && country && domNorm(city) === domNorm(p.name)) {
            label = `${addr.county}, ${country}`;
        } else if (city && country) {
            label = `${city}, ${country}`;
        } else {
            label = country || city || getInitialPlaceLabel(p);
        }
        if (label) {
            domPlaceCache[key] = label;
            p.placeLabel = label;
        }
        return label;
    } catch (e) {
        return getInitialPlaceLabel(p);
    }
}

function buildGoogleMapsRouteUrl(p) {
    if (!p || !isFinite(p.lat) || !isFinite(p.lon)) return 'https://www.google.com/maps';
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat + ',' + p.lon)}&travelmode=driving`;
}

function domColorForItem(p) {
    const v = domVal(p);
    if (domMode === 'weather') {
        if (v == null) return '#94a3b8';
        if (v > 36)   return '#991b1b';
        if (v >= 28)  return '#ef4444';
        if (v >= 20)  return '#f59e0b';
        if (v >= 10)  return '#84cc16';
        if (v >= 0)   return '#10b981';
        if (v >= -5)  return '#06b6d4';
        if (v >= -20) return '#1d4ed8';
        return '#6b21a8';
    }
    if (domMode === 'powerplants') return (PLANT_TYPE_META[p?.type] || PLANT_TYPE_META.other).color;
    if (domMode === 'towers')      return (TOWER_TYPE_META[p?.type] || TOWER_TYPE_META.tvtower).color;
    if (domMode === 'lakes')       return (LAKE_SWIM_META[p?.swim || 'yes'] || LAKE_SWIM_META.yes).color;
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
    if (domMode === 'weather') return (v >= 35 || v <= -25) ? 8.5 : ((v >= 28 || v <= -10) ? 7 : 6);
    if (domMode === 'powerplants') return v >= 3000 ? 9.5 : (v >= 1000 ? 8 : (v >= 300 ? 7 : (v >= 50 ? 6 : 5)));
    if (domMode === 'towns') return v >= 5000000 ? 9.5 : (v >= 1000000 ? 8.5 : (v >= 250000 ? 7.5 : (v >= 50000 ? 6.5 : 5.5)));
    if (domMode === 'towers') return v >= 400 ? 9 : (v >= 250 ? 8 : (v >= 150 ? 7 : (v >= 80 ? 6 : 5)));
    if (domMode === 'lakes') return v >= 1000 ? 9.5 : (v >= 100 ? 8 : (v >= 10 ? 7 : (v >= 1 ? 6 : 5.5)));
    if (domMode === 'castles') return v >= 2500 ? 9 : (v >= 1000 ? 8 : (v >= 700 ? 7 : (v >= 400 ? 6 : 5.5)));
    return v > 7000 ? 9 : (v >= 5000 ? 8 : (v >= 3000 ? 7 : (v >= 2000 ? 6 : 5)));
}

function renderDomLegend() {
    const box = document.getElementById('dom-legend');
    if (!box) return;
    const userLegendHtml = `
        <span class="dom-legend-sep">|</span>
        <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#111;"></span> gewählt</span>
        <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#fff; border-color:#111;"></span> ${domEsc(domCfg().refLabel)}</span>
        <span class="dom-legend-item">
            <span class="dom-legend-user-arrow" title="Deine aktuelle GPS-Position">
                <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
                </svg>
            </span>
            Standort (⛰️ Höhe / km/h)
        </span>
    `;
    const legends = {
        weather: `<strong style="font-size:12px; margin-right:2px;">2m-Temperatur:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#6b21a8;"></span> &lt; −20 °C</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#1d4ed8;"></span> −20…−5 °C</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#06b6d4;"></span> −5…0 °C</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#10b981;"></span> 0…10 °C</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#84cc16;"></span> 10…20 °C</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f59e0b;"></span> 20…28 °C</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#ef4444;"></span> 28…36 °C</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#991b1b;"></span> &gt; 36 °C</span>`,
        powerplants: `<strong style="font-size:12px; margin-right:2px;">Energieträger:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> ☀️ Solar</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#06b6d4;"></span> 🌬️ Wind</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#2563eb;"></span> 💧 Wasser</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 🔥 Gas</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#475569;"></span> 🏭 Kohle</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#9333ea;"></span> ⚛️ Kernkraft</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> 🌿 Biomasse</span>`,
        towns: `<strong style="font-size:12px; margin-right:2px;">Einwohner:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> &lt; 10 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#65a30d;"></span> 10–50 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> 50–100 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 100–500 Tsd.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#ef4444;"></span> 0,5–1 Mio.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#dc2626;"></span> 1–5 Mio.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#7e22ce;"></span> &gt; 5 Mio.</span>`,
        towers: `<strong style="font-size:12px; margin-right:2px;">Bauwerkstyp:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#2563eb;"></span> 📡 Fernseh-/Funkturm</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#9333ea;"></span> 🏙️ Wolkenkratzer</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> 🔭 Aussichtsturm</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> ⛪ Kirchturm / Dom</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 🌉 Brücke / Kamin</span>`,
        lakes: `<strong style="font-size:12px; margin-right:2px;">Bade-Status:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#0ea5e9;"></span> 🏊 Baden erlaubt</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f59e0b;"></span> ⚠️ Stausee / prüfen</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#ef4444;"></span> 🚫 Baden verboten</span>`,
        castles: `<strong style="font-size:12px; margin-right:2px;">Epoche / Alter:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#16a34a;"></span> &lt; 300 J.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#eab308;"></span> 300–600 J.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f97316;"></span> 600–1000 J.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#dc2626;"></span> 1000–2500 J.</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#7e22ce;"></span> &gt; 2500 J.</span>`,
        peaks: `<strong style="font-size:12px; margin-right:2px;">Höhe ü. NN:</strong>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#1a6b2e;"></span> &lt; 1000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#5bd16a;"></span> 1000–2000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f2d307;"></span> 2000–3000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#d9a406;"></span> 3000–4000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f27405;"></span> 4000–5000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#f2766e;"></span> 5000–6000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#e01b1b;"></span> 6000–7000 m</span>
            <span class="dom-legend-item"><span class="dom-legend-dot" style="background:#8b2fc9;"></span> &gt; 7000 m</span>`
    };
    box.innerHTML = (legends[domMode] || legends.peaks) + userLegendHtml;
}
