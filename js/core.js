// ===================================================================
// CORE: VIEW-LOADER, ROUTER, NAVIGATION & GLOBALE HELFER (js/core.js)
// ===================================================================

const domEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const domNum = (n, d = 0) => n == null ? '–' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: d }).format(n);
const domNorm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const NAV_GROUPS = {
    familie:     ['fotos', 'pinnwand'],
    sport:       ['tischtennis', 'zaehlboard', 'tt-ranking', 'turnierplaner', 'radfahren', 'wandern'],
    maptools:    ['area-maps', 'dominanz', 'luftlinie', 'area-pur'],
    spiele:      ['tetris', 'minesweeper', 'snake'],
    rechtliches: ['impressum']
};

const ALL_VIEWS = [
    'home', 'pinnwand', 'fotos',
    'tischtennis', 'zaehlboard', 'tt-ranking', 'turnierplaner', 'radfahren', 'wandern',
    'area-maps', 'dominanz', 'luftlinie', 'area-pur',
    'tetris', 'minesweeper', 'snake',
    'impressum'
];

// Gemeinsame Karten-Helfer für Home, Maps Math, Dominanz & Luftlinie
let pirnaCoords = [50.9939978, 13.9076698];
const HOME_LOCATIONS = [
    { id: 'dippe-graupa', label: 'Familie Dippe (Graupa)', fam: 'Familie Dippe',
      addr: 'Emil-Gast-Straße 4', plz: '01796 Pirna', lat: 50.9939978, lon: 13.9076698 }
];

const LAYER_LABELS = {
    'osm': 'OpenStreetMap',
    'google-streets': 'Google Maps',
    'google-sat': 'Google Satellit',
    'topo': 'Topografie',
    'esri-sat': 'Esri Luftbild (3D-artig)'
};
const LAYER_ORDER = ['osm', 'google-streets', 'google-sat', 'topo', 'esri-sat'];

function buildLayerSet() {
    return {
        'osm':            L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
        'google-streets': L.tileLayer('//mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Maps' }),
        'google-sat':     L.tileLayer('//mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Satellit' }),
        'topo':           L.tileLayer('//{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' }),
        'esri-sat':       L.tileLayer('//server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' })
    };
}

function externalMapUrl(key, lat, lon, z) {
    z = z || 17;
    switch (key) {
        case 'google-streets': return `https://www.google.com/maps/@${lat},${lon},${z}z`;
        case 'google-sat':     return `https://www.google.com/maps/@${lat},${lon},${z}z/data=!3m1!1e3`;
        case 'topo':           return `https://www.opentopomap.org/#map=${z}/${lat}/${lon}`;
        case 'esri-sat':       return `https://www.arcgis.com/apps/mapviewer/index.html?center=${lon},${lat}&level=${z}`;
        default:               return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${z}/${lat}/${lon}`;
    }
}

function fillLayerSelect(selId, current) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = LAYER_ORDER.map(k => `<option value="${k}"${k===current?' selected':''}>${LAYER_LABELS[k]}</option>`).join('');
}

// Navigation & Sidebar
function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
}

function groupOfPage(pageId) {
    for (const g in NAV_GROUPS) {
        if (NAV_GROUPS[g].includes(pageId)) return g;
    }
    return null;
}

function toggleNavGroup(group) {
    const panel = document.getElementById('subnav-group-' + group);
    const btn = document.getElementById('nav-' + group);
    if (!panel || !btn) return;
    const isOpen = panel.classList.toggle('open');
    btn.classList.toggle('group-open', isOpen);
}

function openNavGroup(group) {
    const panel = document.getElementById('subnav-group-' + group);
    const btn = document.getElementById('nav-' + group);
    if (panel) panel.classList.add('open');
    if (btn) btn.classList.add('group-open');
}

// Ergänzt automatisch den "📈 TT-Ranking"-Button in den Kopfzeilen der Sport-Ecke-Unterseiten
function injectTTRankingHeaderButtons() {
    ['tischtennis', 'zaehlboard', 'turnierplaner', 'radfahren', 'wandern'].forEach(pid => {
        const sec = document.getElementById('page-' + pid);
        if (!sec) return;
        const tpBtn = sec.querySelector('.section-header button[onclick*="turnierplaner"]');
        if (tpBtn && !sec.querySelector('.section-header button[onclick*="tt-ranking"]')) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-sand';
            btn.setAttribute('onclick', "switchPage('tt-ranking')");
            btn.textContent = '📈 TT-Ranking';
            tpBtn.parentNode.insertBefore(btn, tpBtn);
        }
    });
}

// Lädt alle HTML-Views aus dem Ordner views/ in den <main>-Container
let viewsLoadedPromise = null;

async function ensureAllViewsLoaded() {
    if (viewsLoadedPromise) return viewsLoadedPromise;
    viewsLoadedPromise = (async () => {
        const main = document.getElementById('app-main');
        if (!main) return;
        const snippets = await Promise.all(ALL_VIEWS.map(async (viewName) => {
            try {
                const res = await fetch(`views/${viewName}.html`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.text();
            } catch (err) {
                console.error(`View views/${viewName}.html konnte nicht geladen werden:`, err);
                return `<section id="page-${viewName}" class="page-section"><div class="sand-card"><h3>Ansicht "${viewName}" konnte nicht geladen werden (bitte prüfen, ob views/${viewName}.html existiert).</h3></div></section>`;
            }
        }));
        main.innerHTML = snippets.join('\n');
        injectTTRankingHeaderButtons();

        // Sobald die Views im DOM liegen, alle Basis-Module sauber initialisieren
        if (typeof initHomeMap === 'function') initHomeMap();
        if (typeof initPinnwand === 'function') initPinnwand();
        if (typeof calcBikeMetrics === 'function') calcBikeMetrics();
        if (typeof calcHikeTime === 'function') calcHikeTime();
        if (typeof initAreaPur === 'function') initAreaPur();
        if (typeof tpInitTurnierplaner === 'function') tpInitTurnierplaner();
        if (typeof renderAllHighscores === 'function') renderAllHighscores();
        if (typeof initTTHubIfNeeded === 'function') {
            ttHubInitialized = false;
            initTTHubIfNeeded();
        }
    })();
    return viewsLoadedPromise;
}

async function switchPage(pageId) {
    await ensureAllViewsLoaded();

    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sub-nav-btn').forEach(el => el.classList.remove('active'));

    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');

    const group = groupOfPage(pageId);
    if (group) {
        const groupBtn = document.getElementById('nav-' + group);
        if (groupBtn) groupBtn.classList.add('active');
        openNavGroup(group);
        const sub = document.getElementById('subnav-' + pageId);
        if (sub) sub.classList.add('active');
    } else {
        const nav = document.getElementById('nav-' + pageId);
        if (nav) nav.classList.add('active');
        Object.keys(NAV_GROUPS).forEach(g => {
            document.getElementById('subnav-group-' + g)?.classList.remove('open');
            document.getElementById('nav-' + g)?.classList.remove('group-open');
        });
    }

    document.getElementById('sidebar')?.classList.remove('open');

    if (pageId === 'home' && typeof homeMap !== 'undefined' && homeMap) {
        setTimeout(() => homeMap.invalidateSize(), 150);
    }
    if (pageId === 'pinnwand' && typeof loadPinnwandFromCloud === 'function') {
        loadPinnwandFromCloud(false);
    }
    if (pageId === 'area-maps' && typeof initMapsMathIfNeeded === 'function') {
        setTimeout(() => {
            initMapsMathIfNeeded();
            if (typeof mapsMathMap !== 'undefined' && mapsMathMap) mapsMathMap.invalidateSize();
        }, 150);
    }
    if (pageId === 'dominanz' && typeof initDominanzMapIfNeeded === 'function') {
        setTimeout(() => {
            initDominanzMapIfNeeded();
            if (typeof dominanzMap !== 'undefined' && dominanzMap) dominanzMap.invalidateSize();
        }, 150);
    }
    if (pageId === 'luftlinie' && typeof initAirMapIfNeeded === 'function') {
        setTimeout(() => {
            initAirMapIfNeeded();
            if (typeof airMap !== 'undefined' && airMap) airMap.invalidateSize();
        }, 150);
    }
    if (pageId === 'area-pur' && typeof drawAreaCanvas === 'function') {
        if (typeof initAreaPur === 'function') initAreaPur();
        drawAreaCanvas();
    }
    if (pageId === 'tetris' && typeof initTetrisIfNeeded === 'function') {
        setTimeout(() => initTetrisIfNeeded(), 120);
    }
    if (pageId === 'minesweeper' && typeof initMinesweeperIfNeeded === 'function') {
        setTimeout(() => initMinesweeperIfNeeded(), 80);
    }
    if (pageId === 'snake' && typeof initSnakeIfNeeded === 'function') {
        setTimeout(() => initSnakeIfNeeded(), 80);
    }
    if (pageId === 'tischtennis' && typeof initTTHubIfNeeded === 'function') {
        setTimeout(() => initTTHubIfNeeded(), 80);
    }
    if (pageId === 'tt-ranking' && typeof initTTRankingIfNeeded === 'function') {
        setTimeout(() => initTTRankingIfNeeded(), 80);
    }
}

let _mapResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_mapResizeTimer);
    _mapResizeTimer = setTimeout(() => {
        if (typeof homeMap !== 'undefined' && homeMap) homeMap.invalidateSize();
        if (typeof mapsMathMap !== 'undefined' && mapsMathMap) mapsMathMap.invalidateSize();
        if (typeof dominanzMap !== 'undefined' && dominanzMap) dominanzMap.invalidateSize();
        if (typeof airMap !== 'undefined' && airMap) airMap.invalidateSize();
    }, 180);
});

window.addEventListener('DOMContentLoaded', () => {
    ensureAllViewsLoaded();
});
