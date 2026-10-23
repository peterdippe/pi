// ===================================================================
// CORE: GLOBALE HELFER, NAVIGATION, STARTSEITEN-KARTE & FOTO-TRESOR
// ===================================================================

const domEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const domNum = (n, d = 0) => n == null ? '–' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: d }).format(n);
const domNorm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// -----------------------------------------------------------------
// 1. NAVIGATION
// -----------------------------------------------------------------
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

const NAV_GROUPS = {
    familie:     ['fotos', 'pinnwand'],
    sport:       ['tischtennis', 'zaehlboard', 'turnierplaner', 'radfahren', 'wandern'],
    maptools:    ['area-maps', 'dominanz', 'luftlinie', 'area-pur'],
    spiele:      ['tetris', 'minesweeper', 'snake'],
    rechtliches: ['impressum']
};

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

function switchPage(pageId) {
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
        // Wenn Home geklickt wird, alle anderen Gruppen zuklappen
        Object.keys(NAV_GROUPS).forEach(g => {
            const p = document.getElementById('subnav-group-' + g);
            const b = document.getElementById('nav-' + g);
            if (p) p.classList.remove('open');
            if (b) b.classList.remove('group-open');
        });
    }

    document.getElementById('sidebar').classList.remove('open');

    if (pageId === 'home' && homeMap) {
        setTimeout(() => homeMap.invalidateSize(), 150);
    }
    if (pageId === 'pinnwand') {
        loadPinnwandFromCloud(false);
    }
    if (pageId === 'area-maps') {
        setTimeout(() => {
            initMapsMathIfNeeded();
            if (mapsMathMap) mapsMathMap.invalidateSize();
        }, 150);
    }
    if (pageId === 'dominanz') {
        setTimeout(() => {
            initDominanzMapIfNeeded();
            if (dominanzMap) dominanzMap.invalidateSize();
        }, 150);
    }
    if (pageId === 'luftlinie') {
        setTimeout(() => {
            initAirMapIfNeeded();
            if (airMap) airMap.invalidateSize();
        }, 150);
    }
    if (pageId === 'area-pur') {
        drawAreaCanvas();
    }
    if (pageId === 'tetris') {
        setTimeout(() => initTetrisIfNeeded(), 120);
    }
    if (pageId === 'minesweeper') {
        setTimeout(() => initMinesweeperIfNeeded(), 80);
    }
    if (pageId === 'snake') {
        setTimeout(() => initSnakeIfNeeded(), 80);
    }
    if (pageId === 'tischtennis') {
        setTimeout(() => initTTHubIfNeeded(), 80);
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

// -----------------------------------------------------------------
// 2. STARTSEITEN-KARTE (Standort Pirna + Kartenebenen)
// -----------------------------------------------------------------
let homeMap = null;
let homeMarker = null;
let homeLayers = {};
let pirnaCoords = [50.9939978, 13.9076698];  // Emil-Gast-Str. 4

const HOME_LOCATIONS = [
    { id: 'dippe-graupa', label: 'Familie Dippe (Graupa)', fam: 'Familie Dippe',
      addr: 'Emil-Gast-Straße 4', plz: '01796 Pirna', lat: 50.9939978, lon: 13.9076698 }
];

function buildLayerSet() {
    return {
        'osm':            L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
        'google-streets': L.tileLayer('//mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Maps' }),
        'google-sat':     L.tileLayer('//mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Satellit' }),
        'topo':           L.tileLayer('//{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' }),
        'esri-sat':       L.tileLayer('//server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' })
    };
}

const LAYER_LABELS = {
    'osm': 'OpenStreetMap',
    'google-streets': 'Google Maps',
    'google-sat': 'Google Satellit',
    'topo': 'Topografie',
    'esri-sat': 'Esri Luftbild (3D-artig)'
};
const LAYER_ORDER = ['osm', 'google-streets', 'google-sat', 'topo', 'esri-sat'];

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

let homeLayerKey = 'osm';

function updateHomeRouteLink() {
    const loc = HOME_LOCATIONS[0];
    const link = document.getElementById('home-route-link');
    if (loc && link) link.href = externalMapUrl(homeLayerKey, loc.lat, loc.lon, 17);
}

function initHomeMap() {
    if (typeof L === 'undefined') return;
    const loc = HOME_LOCATIONS[0];
    homeMap = L.map('osm-map').setView([loc.lat, loc.lon], 17);
    homeLayers = buildLayerSet();
    homeLayers['osm'].addTo(homeMap);
    homeMarker = L.marker([loc.lat, loc.lon]).addTo(homeMap);
    homeMarker.bindPopup(`<b>${loc.fam}</b><br>${loc.addr}<br>${loc.plz}`).openPopup();

    fillLayerSelect('home-layer-select', 'osm');
    const t = document.getElementById('home-loc-title');
    if (t) t.textContent = '📍 ' + loc.addr + ', ' + loc.plz;
    updateHomeRouteLink();
}

function setHomeLayer(key) {
    if (!homeMap || !homeLayers[key]) return;
    Object.values(homeLayers).forEach(l => homeMap.removeLayer(l));
    homeLayers[key].addTo(homeMap);
    homeLayerKey = key;
    updateHomeRouteLink();
}

window.addEventListener('DOMContentLoaded', () => {
    initHomeMap();
    initPinnwand();
});

// -----------------------------------------------------------------
// 3. FOTO-TRESOR
// -----------------------------------------------------------------
function renderAlbums() {
    const grid = document.getElementById('alben-grid');
    grid.innerHTML = CONFIG.alben.map(a => `
        <div class="sand-card" style="padding:0; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <div style="background:${a.bg}; padding:22px; color:#fff;">
                    <span style="font-size:11px; font-weight:800; text-transform:uppercase; background:rgba(0,0,0,0.25); padding:4px 10px; border-radius:20px;">${a.anbieter}</span>
                    <h3 style="font-size:21px; font-weight:800; margin-top:12px;">${a.titel}</h3>
                </div>
                <div style="padding:20px;">
                    <div style="font-size:12px; font-weight:700; color:var(--emerald-dark);">${a.datum}</div>
                    <p style="font-size:14px; line-height:1.55; margin-top:8px;">${a.beschreibung}</p>
                </div>
            </div>
            <div style="padding:0 20px 20px;">
                <a href="${a.link}" target="_blank" rel="noopener" class="btn btn-dark" style="width:100%;">Ordner in Cloud öffnen ↗</a>
            </div>
        </div>
    `).join('');
}

async function unlockPhotos(e) {
    e.preventDefault();
    const val = document.getElementById('foto-password-input').value.trim();
    const err = document.getElementById('foto-error-msg');
    
    if (!val || !CONFIG.pinnwandCloudUrl) {
        err.classList.remove('hidden');
        return;
    }

    try {
        const res = await fetch(CONFIG.pinnwandCloudUrl + `?kind=auth&type=foto&password=${encodeURIComponent(val)}`);
        const j = await res.json();
        
        if (j && j.ok === true) {
            err.classList.add('hidden');
            document.getElementById('foto-login-gate').classList.add('hidden');
            document.getElementById('foto-content').classList.remove('hidden');
            document.getElementById('logout-btn').classList.remove('hidden');
            document.getElementById('lock-indicator').textContent = '🔓';
            renderAlbums();
        } else {
            err.classList.remove('hidden');
        }
    } catch (ex) {
        alert('Verbindungsfehler zum Authentifizierungs-Server.');
    }
}

function lockPhotos() {
    document.getElementById('foto-password-input').value = '';
    document.getElementById('foto-login-gate').classList.remove('hidden');
    document.getElementById('foto-content').classList.add('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
    document.getElementById('lock-indicator').textContent = '🔒';
}

