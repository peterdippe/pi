// ===================================================================
// CORE: VIEW-LOADER, DEEP-LINK ROUTER, PASSWORT-MODAL & HELFER
// (js/core.js für pi.dippe-sippe.de – mit persönlicher Tischtennis-Seite)
// ===================================================================

const domEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const domNum = (n, d = 0) => n == null ? '–' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: d }).format(n);
const domNorm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Nur die reinen Vereins-Tools leiten auf www.tsvgraupa-tischtennis.de weiter;
// "tischtennis" bleibt als Pi's persönliche Statistik- & Liga-Seite lokal erhalten!
const MOVED_TT_PAGES = {
    'spielbetrieb':  'https://www.tsvgraupa-tischtennis.de/#spielbetrieb',
    'tt-news':       'https://www.tsvgraupa-tischtennis.de/#tt-news',
    'tt-ranking':    'https://www.tsvgraupa-tischtennis.de/#tt-ranking',
    'turnierplaner': 'https://www.tsvgraupa-tischtennis.de/#turnierplaner',
    'zaehlboard':    'https://www.tsvgraupa-tischtennis.de/#zaehlboard'
};

const NAV_GROUPS = {
    familie:     ['fotos', 'pinnwand'],
    sport:       ['tischtennis', 'radfahren', 'wandern', 'kicker'],
    maptools:    ['area-maps', 'dominanz', 'luftlinie', 'area-pur'],
    spiele:      ['tetris', 'minesweeper', 'snake'],
    rechtliches: ['impressum']
};

const ALL_VIEWS = [
    'home', 'pinnwand', 'fotos',
    'tischtennis', 'radfahren', 'wandern', 'kicker',
    'area-maps', 'dominanz', 'luftlinie', 'area-pur',
    'tetris', 'minesweeper', 'snake',
    'impressum'
];

const PAGE_TITLES = {
    'home':        'π | Peters Page',
    'pinnwand':    "📌 π's Pinnwand | Peters Page",
    'fotos':       '📸 Fotos & Cloud | Peters Page',
    'tischtennis': "🏓 π's Tischtennis-Cockpit | Peters Page",
    'radfahren':   '🚴 Fahrradfahren | Peters Page',
    'wandern':     '🥾 Wanderungen | Peters Page',
    'kicker':      '⚽ Kickerabend | Peters Page',
    'area-maps':   '🌍 Maps Math | Peters Page',
    'dominanz':    '⛰️ Berg-Dominanz-Atlas | Peters Page',
    'luftlinie':   '✈️ Luftlinien-Entfernung | Peters Page',
    'area-pur':    '📏 Pure Math | Peters Page',
    'tetris':      '🧱 Tetris | Peters Page',
    'minesweeper': '💣 Minesweeper | Peters Page',
    'snake':       '🐍 Snake | Peters Page',
    'impressum':   '📄 Impressum | Peters Page'
};

const SPORT_HEADER_ITEMS = [
    { id: 'tischtennis', label: '🏓 Tischtennis' },
    { id: 'radfahren',   label: '🚴 Fahrradfahren' },
    { id: 'wandern',     label: '🥾 Wanderungen' },
    { id: 'kicker',      label: '⚽ Kickerabend' }
];

let currentActivePageId = 'home';

// ===================================================================
// GLOBALER MASKIERTER PASSWORT-DIALOG
// ===================================================================
let _pwdModalResolver = null;

function askPasswordModal(title, subtitle) {
    return new Promise((resolve) => {
        const modal = document.getElementById('pwd-modal');
        const inp = document.getElementById('pwd-modal-input');
        const tEl = document.getElementById('pwd-modal-title');
        const sEl = document.getElementById('pwd-modal-sub');
        if (!modal || !inp) {
            resolve(null);
            return;
        }
        if (tEl) tEl.textContent = title || 'Passwort';
        if (sEl) sEl.textContent = subtitle || 'Bitte gib das Passwort ein (Eingabe erfolgt verdeckt):';
        inp.value = '';
        _pwdModalResolver = resolve;
        modal.classList.add('open');
        setTimeout(() => inp.focus(), 60);
    });
}

function submitPasswordModal(e) {
    if (e) e.preventDefault();
    const inp = document.getElementById('pwd-modal-input');
    const val = inp ? inp.value.trim() : '';
    closePasswordModal(val || null);
}

function closePasswordModal(resultVal) {
    const modal = document.getElementById('pwd-modal');
    const inp = document.getElementById('pwd-modal-input');
    if (inp) inp.value = '';
    if (modal) modal.classList.remove('open');
    if (_pwdModalResolver) {
        const fn = _pwdModalResolver;
        _pwdModalResolver = null;
        fn(resultVal);
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('pwd-modal')?.classList.contains('open')) {
        closePasswordModal(null);
    }
});

// ===================================================================
// DEEP-LINK ROUTING & TEILEN-FUNKTION
// ===================================================================
function resolvePageIdFromUrl() {
    const redirected = sessionStorage.getItem('dippe_spa_redirect');
    if (redirected) {
        sessionStorage.removeItem('dippe_spa_redirect');
        const cleanRedir = redirected.toLowerCase().trim();
        if (MOVED_TT_PAGES[cleanRedir]) {
            window.location.replace(MOVED_TT_PAGES[cleanRedir]);
            return 'home';
        }
        if (ALL_VIEWS.includes(cleanRedir)) return cleanRedir;
    }

    const rawHash = window.location.hash.replace(/^#\/?/, '').split('?')[0].toLowerCase().trim();
    if (rawHash && MOVED_TT_PAGES[rawHash]) {
        window.location.replace(MOVED_TT_PAGES[rawHash]);
        return 'home';
    }
    if (rawHash && ALL_VIEWS.includes(rawHash)) return rawHash;

    const params = new URLSearchParams(window.location.search);
    const qp = (params.get('p') || params.get('page') || '').toLowerCase().trim();
    if (qp && MOVED_TT_PAGES[qp]) {
        window.location.replace(MOVED_TT_PAGES[qp]);
        return 'home';
    }
    if (qp && ALL_VIEWS.includes(qp)) return qp;

    const pathSeg = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').pop().toLowerCase();
    if (pathSeg && MOVED_TT_PAGES[pathSeg]) {
        window.location.replace(MOVED_TT_PAGES[pathSeg]);
        return 'home';
    }
    if (pathSeg && ALL_VIEWS.includes(pathSeg)) return pathSeg;

    return 'home';
}

function getShareableUrlForPage(pageId) {
    const base = window.location.origin + window.location.pathname.replace(/index\.html$/i, '');
    if (!pageId || pageId === 'home') return base;
    return `${base}#${pageId}`;
}

async function shareCurrentPage(customPageId) {
    const pid = customPageId || currentActivePageId || 'home';
    const url = getShareableUrlForPage(pid);
    const title = PAGE_TITLES[pid] || 'π | Peters Page';

    if (navigator.share) {
        try {
            await navigator.share({ title, url });
            return;
        } catch (e) {}
    }
    try {
        await navigator.clipboard.writeText(url);
        showQuickToast(`🔗 Direktlink kopiert: ${url}`);
    } catch (e) {
        prompt('Direktlink zu dieser Seite kopieren:', url);
    }
}

function showQuickToast(msg) {
    let t = document.getElementById('pi-quick-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'pi-quick-toast';
        t.style.cssText = 'position:fixed; bottom:22px; right:22px; background:#06281e; color:#34d399; border:1.5px solid #34d399; padding:10px 16px; border-radius:12px; font-weight:800; font-size:13px; box-shadow:0 12px 30px rgba(0,0,0,0.5); z-index:9999; transition:opacity 0.25s;';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2600);
}

// ===================================================================
// GEMEINSAME KARTEN-HELFER FÜR HOME, MAPS MATH, DOMINANZ & LUFTLINIE
// ===================================================================
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

// Synchronisiert die obere Button-Leiste auf den 4 Sport-Seiten (+ Link zur Vereins-Homepage)
function syncSportHeaderButtons() {
    SPORT_HEADER_ITEMS.forEach(activeItem => {
        const sec = document.getElementById('page-' + activeItem.id);
        if (!sec) return;
        const header = sec.querySelector('.section-header');
        if (!header) return;
        let btnContainer = header.querySelectorAll('div')[1];
        if (!btnContainer) {
            btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px;';
            header.appendChild(btnContainer);
        }
        btnContainer.innerHTML = SPORT_HEADER_ITEMS.map(item => `
            <button class="btn ${item.id === activeItem.id ? 'btn-emerald' : 'btn-sand'}" onclick="switchPage('${item.id}')">${item.label}</button>
        `).join('') + `
            <a href="https://www.tsvgraupa-tischtennis.de" target="_blank" rel="noopener" class="btn btn-amber" style="text-decoration:none;">🌐 Vereins-Hub (TSV Graupa) ↗</a>
        `;
    });
}

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
                return `<section id="page-${viewName}" class="page-section"><div class="sand-card"><h3>Ansicht "${viewName}" konnte nicht geladen werden.</h3></div></section>`;
            }
        }));
        main.innerHTML = snippets.join('\n');
        syncSportHeaderButtons();

        if (typeof initHomeMap === 'function') initHomeMap();
        if (typeof initPinnwand === 'function') initPinnwand();
        if (typeof calcBikeMetrics === 'function') calcBikeMetrics();
        if (typeof calcHikeTime === 'function') calcHikeTime();
        if (typeof initAreaPur === 'function') initAreaPur();
        if (typeof renderAllHighscores === 'function') renderAllHighscores();
        if (typeof initPersonalTTHubIfNeeded === 'function') initPersonalTTHubIfNeeded();
        if (typeof initKickerIfNeeded === 'function') initKickerIfNeeded();
    })();
    return viewsLoadedPromise;
}

async function switchPage(pageId, skipHistoryPush = false) {
    const cleanTarget = String(pageId || '').toLowerCase().trim();
    if (MOVED_TT_PAGES[cleanTarget]) {
        window.open(MOVED_TT_PAGES[cleanTarget], '_blank', 'noopener');
        return;
    }

    await ensureAllViewsLoaded();
    if (!ALL_VIEWS.includes(cleanTarget)) pageId = 'home';
    else pageId = cleanTarget;
    currentActivePageId = pageId;

    if (!skipHistoryPush) {
        const targetHash = pageId === 'home' ? window.location.pathname : `#${pageId}`;
        if (window.location.hash !== `#${pageId}` && !(pageId === 'home' && !window.location.hash)) {
            history.pushState({ pageId }, PAGE_TITLES[pageId] || 'π', targetHash);
        }
    }
    document.title = PAGE_TITLES[pageId] || 'π | Peters Page';

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
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (pageId === 'home' && typeof homeMap !== 'undefined' && homeMap) {
        setTimeout(() => homeMap.invalidateSize(), 150);
    }
    if (pageId === 'pinnwand' && typeof loadPinnwandFromCloud === 'function') {
        loadPinnwandFromCloud(false);
    }
    if (pageId === 'tischtennis' && typeof initPersonalTTHubIfNeeded === 'function') {
        setTimeout(() => initPersonalTTHubIfNeeded(), 80);
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
    if (pageId === 'kicker' && typeof initKickerIfNeeded === 'function') {
        setTimeout(() => initKickerIfNeeded(), 80);
    }
}

window.addEventListener('popstate', () => {
    const pid = resolvePageIdFromUrl();
    switchPage(pid, true);
});
window.addEventListener('hashchange', () => {
    const pid = resolvePageIdFromUrl();
    if (pid !== currentActivePageId) switchPage(pid, true);
});

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

window.addEventListener('DOMContentLoaded', async () => {
    const initialPage = resolvePageIdFromUrl();
    await ensureAllViewsLoaded();
    if (initialPage && initialPage !== 'home') {
        switchPage(initialPage, true);
    }
});