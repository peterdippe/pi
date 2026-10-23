// -----------------------------------------------------------------
// 14. TISCHTENNIS-HUB: LIVE-SCRAPER FÜR ALLE TSV GRAUPA MANNSCHAFTEN
// -----------------------------------------------------------------
const TTLIVE_BASE = 'https://dresden.tischtennislive.de/';
const TTLIVE_OVERVIEW_URL = 'https://dresden.tischtennislive.de/?L1=Public&L2=Verein&L2P=870&Page=Spielbetrieb&Sportart=96&Page2=Tabellen&Saison=2026';

const DEFAULT_TT_NEWS = [
    { source: 'myTischtennis.de', title: 'WTT Champions & TTBL: Die aktuellen Top-Duelle im Überblick', desc: 'Spannende Fünfsatz-Krimis in der Bundesliga und internationale Highlights der WTT-Serie.', link: 'https://www.mytischtennis.de/public/home/' },
    { source: 'TTVSA / Bezirk Dresden', title: 'Punktspielsaison 2026/27: Alle Tabellen & LivePZ-Werte des TSV Graupa', desc: 'Direkter Durchgriff auf alle Ligen, Einzelbilanzen und Spielpläne unserer Mannschaften.', link: TTLIVE_OVERVIEW_URL },
    { source: 'Material & Technik', title: '8-Eck-Hölzer, Hybrid-Beläge & Plastikball-Rotation im Check', desc: 'Wie moderne Schlägergeometrien den Sweetspot vergrößern und welche Beläge maximalen Spin erzeugen.', link: 'https://tt-spin.de/' },
    { source: 'TSV Graupa TT', title: 'Abteilungs-News & Heimspiel-Wochenenden in der Grundschule Graupa', desc: 'Aktuelle Berichte, Nachwuchsarbeit und Termine unserer Tischtennis-Abteilung.', link: 'https://www.tsv-graupa.de/index.php?s=Tischtennis&c=TT_Start' }
];

const DEFAULT_TT_VIDEOS = [
    { channel: 'World Table Tennis (WTT)', title: 'Top 10 Unbelievable Rallies · WTT Star Contender & Champions', url: 'https://www.youtube.com/@WTTGlobal/videos', badge: '🔥 WTT Highlights' },
    { channel: 'TableTennisDaily', title: 'Pro vs Amateur & Equipment Review · Spin, Speed & Cybershape', url: 'https://www.youtube.com/@TableTennisDaily/videos', badge: '🏓 Equipment & Action' },
    { channel: 'Tischtennis Deutschland', title: 'DTTB-Nationalteam · Beste Ballwechsel & Turnier-Specials', url: 'https://www.youtube.com/@tischtennisdeutschland/videos', badge: '🇩🇪 DTTB Team' },
    { channel: 'Adam Bobrow', title: 'The Snake, Around the Net & Crazy Exhibition Points!', url: 'https://www.youtube.com/@AdamBobrow/videos', badge: '⚡ Viral TT' }
];

let ttCurrentSaison = '2026';
let ttTeamsList = [];
let ttTeamDetailsCache = {};
let activeGraupaTeamId = null;
let ttHubInitialized = false;
let ttPreloadGen = 0;

function initTTSaisonSelect() {
    const sel = document.getElementById('tt-saison-select');
    if (!sel || sel.children.length > 0) return;
    const years = [];
    for (let y = 2026; y >= 2009; y--) {
        const nextShort = String(y + 1).slice(-2);
        years.push(`<option value="${y}"${y === 2026 ? ' selected' : ''}>${y}/${nextShort}</option>`);
    }
    sel.innerHTML = years.join('');
}

function changeTTSaison(newSaison) {
    ttCurrentSaison = String(newSaison);
    ttPreloadGen++;
    ttTeamsList = [];
    ttTeamDetailsCache = {};
    activeGraupaTeamId = null;

    const eb = document.getElementById('tt-saison-eyebrow');
    if (eb) {
        eb.textContent = `Saison ${newSaison}/${String(+newSaison + 1).slice(-2)} · Punktspielbetrieb · Tabellen, Bilanzen & Spielpläne`;
    }

    loadAllGraupaTeamsFromTTLive(false);
}

function initTTHubIfNeeded() {
    if (!ttHubInitialized) {
        ttHubInitialized = true;
        initTTSaisonSelect();
        renderTTNewsAndVideos(DEFAULT_TT_NEWS, DEFAULT_TT_VIDEOS);
        loadTTNewsFeed(false);
        loadAllGraupaTeamsFromTTLive(false);
    }
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = String(str);
    return txt.value;
}

function renderTTNewsAndVideos(newsList, videoList) {
    const nBox = document.getElementById('tt-news-container');
    if (nBox) {
        nBox.innerHTML = newsList.map(n => `
            <a href="${domEsc(n.link)}" target="_blank" rel="noopener" class="tt-news-item">
                <div style="display:flex; justify-content:space-between; font-size:10.5px; color:#fbbf24; font-weight:800; text-transform:uppercase;">
                    <span>${domEsc(decodeHtmlEntities(n.source))}</span><span>Artikel öffnen ↗</span>
                </div>
                <div style="font-weight:800; font-size:13.2px; margin:2px 0 3px; color:#fff;">${domEsc(decodeHtmlEntities(n.title))}</div>
                <div style="font-size:11.8px; color:var(--text-muted); line-height:1.45;">${domEsc(decodeHtmlEntities(n.desc))}</div>
            </a>
        `).join('');
    }

    const yBox = document.getElementById('tt-yt-container');
    if (yBox) {
        yBox.innerHTML = videoList.map(v => `
            <a href="${domEsc(v.url)}" target="_blank" rel="noopener" class="tt-yt-card">
                ${v.thumb
                    ? `<img src="${domEsc(v.thumb)}" alt="${domEsc(decodeHtmlEntities(v.title))}" class="tt-yt-thumb">`
                    : `<div class="tt-yt-thumb" style="display:flex; flex-direction:column; align-items:center; justify-content:center; background:linear-gradient(135deg,#0f2922,#1e1b4b); padding:8px; text-align:center;">
                        <span style="font-size:24px;">▶️</span>
                        <span style="font-size:10px; color:#fbbf24; font-weight:800; margin-top:2px;">${domEsc(v.badge || 'YouTube')}</span>
                       </div>`
                }
                <div style="padding:7px 9px;">
                    <div style="font-size:10px; color:#34d399; font-weight:700;">${domEsc(decodeHtmlEntities(v.channel))}</div>
                    <div style="font-size:11.8px; font-weight:700; line-height:1.35; margin-top:2px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${domEsc(decodeHtmlEntities(v.title))}</div>
                </div>
            </a>
        `).join('');
    }
}

async function loadTTNewsFeed() {
    const url = (CONFIG.pinnwandCloudUrl || '').trim();
    if (!url || !url.startsWith('https://script.google.com/')) return;
    try {
        const res = await fetch(url + '?kind=tt_news&t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.ok) {
            const news = (data.news && data.news.length) ? data.news : DEFAULT_TT_NEWS;
            const vids = (data.videos && data.videos.length) ? data.videos : DEFAULT_TT_VIDEOS;
            renderTTNewsAndVideos(news, vids);
        }
    } catch (e) {}
}

function setTTLiveSyncBadge(text, bg, color) {
    const b = document.getElementById('tt-live-sync-badge');
    if (!b) return;
    b.textContent = text;
    if (bg) b.style.background = bg;
    if (color) b.style.color = color;
}

function resolveTTLiveHref(href) {
    if (!href) return '';
    const clean = href.replace(/&amp;/g, '&').trim();
    if (clean.startsWith('http')) return clean;
    if (clean.startsWith('?')) return TTLIVE_BASE + 'default.aspx' + clean;
    return TTLIVE_BASE + clean.replace(/^\/+/, '');
}

function isHtmlValidTTLive(html) {
    if (!html || !/TSV\s+Graupa/i.test(html)) return false;
    if (/Ich bin ein Mensch/i.test(html) || /<form[^>]+Token=/i.test(html)) return false;
    if (/benötigt Ihre Nutzeranmeldung/i.test(html) || /Benutzeranmeldung/i.test(html)) return false;
    return true;
}

function hasValidParsedDetails(d) {
    if (!d || d.error) return false;
    const hasSingles = d.singlesTable && Array.isArray(d.singlesTable.rows) && d.singlesTable.rows.length > 0;
    const hasSchedule = d.scheduleTable && Array.isArray(d.scheduleTable.rows) && d.scheduleTable.rows.length > 0;
    return Boolean(hasSingles || hasSchedule);
}

// -----------------------------------------------------------------
// SCHRITT A: KASKADIERENDER ABRUF (APPS SCRIPT INKL. LOGIN -> PROXIES)
// -----------------------------------------------------------------
async function fetchTTLiveHtmlCascade(kind, targetUrl, teamKey, forceRefresh) {
    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();

    // STUFE 1: Google Apps Script (inkl. Server-Login & Saison-JSON auf Google Drive)
    if (cloudUrl && cloudUrl.startsWith('https://script.google.com/')) {
        try {
            const gasUrl = kind === 'overview'
                ? `${cloudUrl}?kind=tt_overview&saison=${ttCurrentSaison}${forceRefresh ? '&force=1' : ''}&t=${Date.now()}`
                : `${cloudUrl}?kind=tt_team&saison=${ttCurrentSaison}&url=${encodeURIComponent(targetUrl)}${forceRefresh ? '&force=1' : ''}&t=${Date.now()}`;
            const res = await fetch(gasUrl, { redirect: 'follow' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.ok && isHtmlValidTTLive(data.html)) {
                    return {
                        html: data.html,
                        cachedTeams: data.cachedTeams || null,
                        source: data.cached === 'drive' ? 'Drive-Archiv' : 'TTLive (Cloud)'
                    };
                }
            }
        } catch (e) {}
    }

    // STUFE 2: Browser-CORS-Proxies (nur falls die Seite keine Benutzeranmeldung verlangt!)
    const proxies = [
        {
            name: 'CodeTabs',
            buildUrl: u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
            extract: async r => await r.text()
        },
        {
            name: 'AllOrigins-JSON',
            buildUrl: u => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u) + '&t=' + Date.now(),
            extract: async r => { const j = await r.json(); return (j && j.contents) ? j.contents : ''; }
        },
        {
            name: 'CorsProxy',
            buildUrl: u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
            extract: async r => await r.text()
        }
    ];

    for (const p of proxies) {
        try {
            const res = await fetch(p.buildUrl(targetUrl));
            if (!res.ok) continue;
            const html = await p.extract(res);
            if (isHtmlValidTTLive(html)) {
                if (cloudUrl) {
                    fetch(cloudUrl, {
                        method: 'POST', redirect: 'follow',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            kind: 'tt_save_cache',
                            saison: ttCurrentSaison,
                            type: kind,
                            teamKey: teamKey || '',
                            html: html
                        })
                    }).catch(() => {});
                }
                return { html, cachedTeams: null, source: 'TTLive (' + p.name + ')' };
            }
        } catch (e) {}
    }

    throw new Error('Abruf erfordert aktuellen Google-Script-Login (Neue Version bereitstellen)');
}

function openManualTTImportModal() {
    const pasted = prompt(
        'Quelltext-Direktimport in deine Google-Drive-Saison-JSON:\n\n' +
        '1. Öffne die TTLive-Seite über den gelben Button.\n' +
        '2. Drücke dort Strg+U (Seitenquelltext), dann Strg+A und Strg+C.\n' +
        '3. Füge den kopierten Quelltext hier mit Strg+V ein:'
    );
    if (!pasted || !/TSV\s+Graupa/i.test(pasted)) {
        if (pasted) alert('Im eingefügten Text wurden keine Tabellen des TSV Graupa gefunden.');
        return;
    }
    const parsedTeams = parseTTLiveOverviewHtml(pasted);
    if (!parsedTeams.length) {
        alert('Keine Liga-Tabellen im Quelltext erkannt.');
        return;
    }
    ttTeamsList = parsedTeams;
    try { localStorage.setItem('dippe_tt_overview_v2_' + ttCurrentSaison, JSON.stringify(ttTeamsList)); } catch (e) {}
    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();
    if (cloudUrl) {
        fetch(cloudUrl, {
            method: 'POST', redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ kind: 'tt_save_cache', saison: ttCurrentSaison, type: 'overview', html: pasted })
        }).catch(() => {});
    }
    activeGraupaTeamId = ttTeamsList[0].id;
    setTTLiveSyncBadge(`☁️ Synchronisiert (${ttTeamsList.length} Mannschaften)`, '#d1fae5', '#065f46');
    renderGraupaTeamTabs();
    selectGraupaTeamTab(activeGraupaTeamId, false);
}

async function loadAllGraupaTeamsFromTTLive(forceRefresh) {
    const cont = document.getElementById('tt-team-content');
    const mySaison = ttCurrentSaison;
    if (forceRefresh) {
        ttTeamDetailsCache = {};
        try {
            localStorage.removeItem('dippe_tt_overview_v2_' + mySaison);
            localStorage.removeItem('dippe_tt_details_v2_' + mySaison);
        } catch (e) {}
    }

    initTTSaisonSelect();
    const saisonLabel = `${mySaison}/${String(+mySaison + 1).slice(-2)}`;
    const overviewUrl = `https://dresden.tischtennislive.de/?L1=Public&L2=Verein&L2P=870&Page=Spielbetrieb&Sportart=96&Page2=Tabellen&Saison=${mySaison}`;

    const directLink = document.getElementById('tt-team-direct-link');
    if (directLink) directLink.href = overviewUrl;

    // 1. Lokalen Browser-Cache (v2) für 0 ms Sofort-Anzeige prüfen
    if (!ttTeamsList.length && !forceRefresh) {
        try {
            const cachedOverview = localStorage.getItem('dippe_tt_overview_v2_' + mySaison);
            const cachedDetails = localStorage.getItem('dippe_tt_details_v2_' + mySaison);
            if (cachedOverview) {
                const parsedCache = JSON.parse(cachedOverview);
                if (Array.isArray(parsedCache) && parsedCache.length) {
                    ttTeamsList = parsedCache;
                    if (cachedDetails) {
                        const rawDet = JSON.parse(cachedDetails) || {};
                        Object.keys(rawDet).forEach(k => {
                            if (hasValidParsedDetails(rawDet[k])) ttTeamDetailsCache[k] = rawDet[k];
                        });
                    }
                    activeGraupaTeamId = ttTeamsList[0].id;
                    renderGraupaTeamTabs();
                    selectGraupaTeamTab(activeGraupaTeamId, false);

                    const allDetailsPresent = ttTeamsList.every(t => hasValidParsedDetails(ttTeamDetailsCache[t.id] || ttTeamDetailsCache[t.teamKey]));
                    if (Number(mySaison) < 2026 && allDetailsPresent) {
                        setTTLiveSyncBadge(`⚡ Archiv ${saisonLabel} (${ttTeamsList.length} Mannschaften)`, '#e0f2fe', '#0369a1');
                        return;
                    }
                }
            }
        } catch (e) {}
    }

    setTTLiveSyncBadge(`⏳ Lade Saison ${saisonLabel} …`, '#fef3c7', '#92400e');
    if (cont && !ttTeamsList.length) {
        cont.innerHTML = `<div class="tp-section-card" style="grid-column:1/-1; text-align:center; padding:28px;">
            <div style="font-size:28px; margin-bottom:8px;">🏓</div>
            <h4 style="font-size:18px; font-weight:800;">Lade TSV Graupa Saison ${saisonLabel} …</h4>
            <p class="tp-help" style="margin-top:6px;">Quelle: dresden.tischtennislive.de (Verein 870 · Saison ${mySaison})</p>
        </div>`;
    }

    try {
        const result = await fetchTTLiveHtmlCascade('overview', overviewUrl, 'overview_' + mySaison, forceRefresh);
        if (ttCurrentSaison !== mySaison) return;

        const parsedTeams = parseTTLiveOverviewHtml(result.html);
        if (!parsedTeams.length) throw new Error('Keine Graupa-Tabellen im HTML gefunden');

        ttTeamsList = parsedTeams;
        try { localStorage.setItem('dippe_tt_overview_v2_' + mySaison, JSON.stringify(ttTeamsList)); } catch (e) {}

        if (result.cachedTeams && typeof result.cachedTeams === 'object') {
            Object.keys(result.cachedTeams).forEach(tKey => {
                const rawHtml = result.cachedTeams[tKey];
                if (isHtmlValidTTLive(rawHtml)) {
                    const parsedDet = parseTTLiveTeamDetailHtml(rawHtml);
                    if (hasValidParsedDetails(parsedDet)) {
                        ttTeamDetailsCache[tKey] = parsedDet;
                        ttTeamsList.forEach(tm => {
                            if (tm.teamKey === tKey || tm.id === tKey) {
                                ttTeamDetailsCache[tm.id] = parsedDet;
                            }
                        });
                    }
                }
            });
            try { localStorage.setItem('dippe_tt_details_v2_' + mySaison, JSON.stringify(ttTeamDetailsCache)); } catch (e) {}
        }

        if (!activeGraupaTeamId || !ttTeamsList.some(t => t.id === activeGraupaTeamId)) {
            activeGraupaTeamId = ttTeamsList[0].id;
        }

        const timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        setTTLiveSyncBadge(`☁️ ${result.source} · Saison ${saisonLabel} (${ttTeamsList.length} Teams · ${timeStr})`, '#d1fae5', '#065f46');
        renderGraupaTeamTabs();
        await selectGraupaTeamTab(activeGraupaTeamId, forceRefresh);

        preloadRemainingSeasonTeams(mySaison);
    } catch (err) {
        console.warn('Live-Abruf Hinweis:', err);
        if (ttTeamsList.length) {
            setTTLiveSyncBadge(`⚡ Gespeicherter Stand ${saisonLabel} (${ttTeamsList.length} Mannschaften)`, '#e0f2fe', '#0369a1');
        } else {
            setTTLiveSyncBadge('⚠️ TTLive Abruf-Hinweis', '#fee2e2', '#b91c1c');
            if (cont) {
                cont.innerHTML = `<div class="tp-section-card" style="grid-column:1/-1; text-align:center; padding:24px;">
                    <div style="font-size:28px; margin-bottom:8px;">🛡️</div>
                    <h4 style="font-size:18px; font-weight:800; color:#b91c1c;">TischtennisLive-Abruf benötigt Freigabe</h4>
                    <p style="font-size:13.5px; margin:8px 0 16px; color:#475569;">
                        Stelle sicher, dass das aktualisierte Google Apps Script als <b>Neue Version</b> bereitgestellt ist:
                    </p>
                    <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
                        <a href="${overviewUrl}" target="_blank" rel="noopener" class="btn btn-amber">
                            🏓 1. TTLive-Tabellen (${saisonLabel}) öffnen ↗
                        </a>
                        <button class="btn btn-emerald" onclick="loadAllGraupaTeamsFromTTLive(true)">
                            🔄 2. Erneut automatisch abrufen
                        </a>
                        <button class="btn btn-dark" onclick="openManualTTImportModal()">
                            📋 3. Quelltext einfügen (Cloud-Sync)
                        </button>
                    </div>
                </div>`;
            }
        }
    }
}

async function preloadRemainingSeasonTeams(saisonForRun) {
    const gen = ++ttPreloadGen;
    for (const team of ttTeamsList) {
        if (gen !== ttPreloadGen || ttCurrentSaison !== saisonForRun) return;
        const existing = ttTeamDetailsCache[team.id] || ttTeamDetailsCache[team.teamKey];
        if (hasValidParsedDetails(existing)) continue;

        await new Promise(r => setTimeout(r, 750));
        if (gen !== ttPreloadGen || ttCurrentSaison !== saisonForRun) return;

        try {
            const result = await fetchTTLiveHtmlCascade('team', team.teamUrl, team.teamKey, false);
            if (gen !== ttPreloadGen || ttCurrentSaison !== saisonForRun) return;
            const details = parseTTLiveTeamDetailHtml(result.html);
            if (hasValidParsedDetails(details)) {
                ttTeamDetailsCache[team.id] = details;
                ttTeamDetailsCache[team.teamKey] = details;
                try { localStorage.setItem('dippe_tt_details_v2_' + saisonForRun, JSON.stringify(ttTeamDetailsCache)); } catch (e) {}
                if (activeGraupaTeamId === team.id) {
                    renderGraupaTeamLayout(team, details, false);
                }
            }
        } catch (e) {}
    }
}

// -----------------------------------------------------------------
// PRÄZISER DOM-PARSER FÜR TISCHTENNISLIVE (INKL. MEHRERER TEAMS PRO LIGA)
// -----------------------------------------------------------------
function sanitizeTTLiveDom(htmlString) {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe, object, embed, [id*="dialog_ical"], [id*="ical_spielplan"]').forEach(el => el.remove());
    return doc;
}

function getDirectRows(tbl) {
    const rows = [];
    Array.from(tbl.children).forEach(child => {
        if (child.tagName === 'TR') {
            rows.push(child);
        } else if (['THEAD', 'TBODY', 'TFOOT'].includes(child.tagName)) {
            Array.from(child.children).forEach(tr => {
                if (tr.tagName === 'TR') rows.push(tr);
            });
        }
    });
    return rows;
}

function getCleanRowCells(tr) {
    const DirectCells = Array.from(tr.children).filter(el => el.tagName === 'TD' || el.tagName === 'TH');
    if (DirectCells.some(c => c.querySelectorAll('tr').length > 2)) return [];

    const raw = DirectCells.map(c => c.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim());

    const merged = [];
    for (let i = 0; i < raw.length; i++) {
        const cur = raw[i];
        if (!cur) continue;
        if (cur === ':' && merged.length > 0 && i + 1 < raw.length && raw[i + 1]) {
            merged[merged.length - 1] = merged[merged.length - 1] + ':' + raw[i + 1];
            i++;
        } else if (/^:\d+$/.test(cur) && merged.length > 0 && /^\d+$/.test(merged[merged.length - 1])) {
            merged[merged.length - 1] = merged[merged.length - 1] + cur;
        } else {
            merged.push(cur);
        }
    }
    return merged;
}

function findSectionHeadingAbove(tbl) {
    let node = tbl;
    while (node && node.tagName !== 'BODY') {
        let prev = node.previousElementSibling;
        while (prev) {
            const t = prev.textContent.replace(/\s+/g, ' ').trim();
            if (t.length >= 4 && t.length <= 110 && !/tischtennislive|spielbetrieb|platz\s+mannschaft/i.test(t)) {
                return t;
            }
            prev = prev.previousElementSibling;
        }
        node = node.parentElement;
    }
    return '';
}

function romanToArabicTeamNum(str) {
    const map = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9', X: '10' };
    return map[String(str || '').toUpperCase()] || str || '1';
}

function deriveGraupaTabName(graupaNameInTable, leagueTitle) {
    const numMatch = graupaNameInTable.match(/TSV\s+Graupa\s+(\d+|[IVX]+)\b/i);
    const teamNum = numMatch ? romanToArabicTeamNum(numMatch[1]) : '1';
    const lt = (leagueTitle || '').toLowerCase();

    let category = 'Erwachsene';
    if (lt.includes('damen') || lt.includes('frauen') || lt.includes('mädchen')) category = 'Damen';
    else if (lt.includes('jugend 19') || lt.includes('u19') || lt.includes('jungen 19')) category = 'Jugend 19';
    else if (lt.includes('jugend 18') || lt.includes('u18') || lt.includes('jungen 18')) category = 'Jugend 18';
    else if (lt.includes('jugend 15') || lt.includes('u15') || lt.includes('schüler 15') || lt.includes('jungen 15') || lt.includes('schüler a')) category = 'Schüler 15';
    else if (lt.includes('jugend 13') || lt.includes('u13') || lt.includes('u11') || lt.includes('schüler b') || lt.includes('schüler c')) category = 'Nachwuchs';
    else if (lt.includes('schüler')) category = 'Schüler';
    else if (lt.includes('jugend') || lt.includes('jungen')) category = 'Jugend';
    else if (lt.includes('senioren') || lt.includes('altersklasse')) category = 'Senioren';

    return `${teamNum}. ${category}`;
}

function formatShortLeague(leagueTitle) {
    if (!leagueTitle) return `Saison ${ttCurrentSaison}/${String(+ttCurrentSaison + 1).slice(-2)}`;
    let s = String(leagueTitle)
        .replace(/^Kreisunion\s+Dresden\s*[,·-]?\s*/i, '')
        .replace(/^Bezirk\s+Dresden\s*[,·-]?\s*/i, '')
        .replace(/\bGruppe\s+/gi, 'Gr. ')
        .replace(/\b(Erwachsene|Herren|Damen|Frauen|Jugend\s*\d*|Jungen\s*\d*|Schüler\s*[A-C0-9]*)\b/gi, '')
        .replace(/\s+,/g, ',')
        .replace(/,\s*,/g, ',')
        .replace(/^[\s,·-]+|[\s,·-]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return s || leagueTitle;
}

function parseTTLiveOverviewHtml(htmlString) {
    const doc = sanitizeTTLiveDom(htmlString);
    const teams = [];
    const seenTableTeamPairs = new Set();
    const allTables = Array.from(doc.querySelectorAll('table'));

    const allLinks = Array.from(doc.querySelectorAll('a'));
    const graupaLinks = allLinks.filter(a => {
        const txt = a.textContent.replace(/\s+/g, ' ').trim();
        const href = a.getAttribute('href') || '';
        return /TSV\s+Graupa/i.test(txt) && /L3=Mannschaft|L3P=/i.test(href);
    });

    graupaLinks.forEach(teamAnchor => {
        const tbl = teamAnchor.closest('table');
        if (!tbl) return;

        const rawHref = teamAnchor.getAttribute('href') || '';
        const teamUrl = resolveTTLiveHref(rawHref);
        const graupaTeamName = teamAnchor.textContent.replace(/\s+/g, ' ').trim();
        const l3pMatch = teamUrl.match(/L3P=(\d+)/i);
        const l3p = l3pMatch ? l3pMatch[1] : String(teams.length + 1);
        const tblIdx = allTables.indexOf(tbl);

        const pairKey = `${tblIdx}_${l3p}`;
        if (seenTableTeamPairs.has(pairKey)) return;
        seenTableTeamPairs.add(pairKey);

        let leagueTitle = findSectionHeadingAbove(tbl);
        let standingsHeaders = [];
        const standingsRows = [];

        const rows = getDirectRows(tbl);
        rows.forEach(r => {
            const cells = getCleanRowCells(r);
            if (!cells.length) return;

            if (!standingsHeaders.length && cells.length <= 2 && cells[0].length > 4 && !/Platz|Mannschaft/i.test(cells[0])) {
                if (!leagueTitle) leagueTitle = cells[0];
                return;
            }

            if (cells.length < 4) return;
            const joined = cells.join(' ');

            if (!standingsHeaders.length && /Mannschaft/i.test(joined) && /Punkte|Pkt|Spiele|ST/i.test(joined)) {
                standingsHeaders = cells;
                return;
            }

            if (/^Platz$/i.test(cells[0]) || /^Mannschaft$/i.test(cells[1] || '')) return;

            const isGraupa = /TSV\s+Graupa/i.test(joined);
            const isCurrentTeam = r.contains(teamAnchor);
            standingsRows.push({ cells, isGraupa, isCurrentTeam });
        });

        if (!standingsRows.length) return;

        const colCount = standingsRows[0].cells.length;
        if (standingsHeaders.length !== colCount) {
            if (colCount === 10) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Ball', 'Satz', 'Spiele', 'Punkte'];
            else if (colCount === 11) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Ball', 'Satz', 'Spiele', '+/-', 'Punkte'];
            else if (colCount === 12) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Ball', 'Satz', 'Spiele', '+/-', 'Punkte', '+/-'];
            else if (colCount === 9) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Spiele', '+/-', 'Punkte'];
            else if (colCount === 8) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Spiele', 'Punkte'];
            else standingsHeaders = Array.from({ length: colCount }, (_, i) => i === 0 ? 'Pl.' : i === 1 ? 'Mannschaft' : i === colCount - 1 ? 'Pkt.' : '');
        }

        const teamKey = 'team_' + l3p;
        let id = teamKey;
        if (teams.some(t => t.id === id)) {
            id = `${teamKey}_${teams.length + 1}`;
        }

        const tabName = deriveGraupaTabName(graupaTeamName, leagueTitle);

        teams.push({
            id,
            teamKey,
            tabName,
            fullTeamName: graupaTeamName,
            league: leagueTitle || `Saison ${ttCurrentSaison}/${String(+ttCurrentSaison + 1).slice(-2)}`,
            teamUrl,
            standingsHeaders,
            standingsRows
        });
    });

    return teams;
}

function renderGraupaTeamTabs() {
    const bar = document.getElementById('tt-team-tabs');
    if (!bar) return;
    bar.innerHTML = ttTeamsList.map((t, idx) => {
        const shortLg = formatShortLeague(t.league);
        return `
            <button class="tt-team-tab ${t.id === activeGraupaTeamId ? 'active' : ''}"
                    onclick="selectGraupaTeamTab('${t.id}', false)"
                    title="${domEsc(t.fullTeamName + ' · ' + t.league)}">
                <span class="tt-tab-title">🏓 ${domEsc(t.tabName || ((idx + 1) + '. Mannschaft'))}</span>
                <span class="tt-tab-sub">${domEsc(shortLg)}</span>
            </button>
        `;
    }).join('') + `
        <button class="btn btn-sand" style="margin-left:auto; padding:6px 11px; font-size:11.5px; align-self:center;" onclick="loadAllGraupaTeamsFromTTLive(true)" title="Alle Tabellen & Bilanzen dieser Saison frisch von TischtennisLive abrufen">
            🔄 Alle live aktualisieren
        </button>
    `;
}

async function selectGraupaTeamTab(teamId, forceRefresh) {
    activeGraupaTeamId = teamId;
    renderGraupaTeamTabs();

    const team = ttTeamsList.find(t => t.id === teamId);
    if (!team) return;

    const directLink = document.getElementById('tt-team-direct-link');
    if (directLink && team.teamUrl) directLink.href = team.teamUrl;

    const cached = !forceRefresh ? (ttTeamDetailsCache[teamId] || ttTeamDetailsCache[team.teamKey] || null) : null;
    const isValidCache = hasValidParsedDetails(cached);

    renderGraupaTeamLayout(team, isValidCache ? cached : null, !isValidCache);
    if (isValidCache) return;

    const mySaison = ttCurrentSaison;
    try {
        const tKey = team.teamKey || ('team_' + ((team.teamUrl.match(/L3P=(\d+)/i) || [])[1] || teamId));
        const result = await fetchTTLiveHtmlCascade('team', team.teamUrl, tKey, Boolean(forceRefresh));
        if (ttCurrentSaison !== mySaison) return;

        const details = parseTTLiveTeamDetailHtml(result.html);
        ttTeamDetailsCache[teamId] = details;
        ttTeamDetailsCache[tKey] = details;
        try { localStorage.setItem('dippe_tt_details_v2_' + mySaison, JSON.stringify(ttTeamDetailsCache)); } catch (e) {}

        if (activeGraupaTeamId === teamId) {
            renderGraupaTeamLayout(team, details, false);
        }
    } catch (err) {
        console.warn('Fehler beim Laden der Mannschaftsdetails:', err);
        if (activeGraupaTeamId === teamId) {
            renderGraupaTeamLayout(team, { error: String(err.message || err) }, false);
        }
    }
}

function parseTTLiveTeamDetailHtml(htmlString) {
    const doc = sanitizeTTLiveDom(htmlString);
    const fullText = doc.body ? doc.body.textContent : '';

    let headerTitle = '';
    const candidates = Array.from(doc.querySelectorAll('h1, h2, h3, td, th, div, span'));
    for (const el of candidates) {
        if (el.querySelector('table')) continue;
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (/^TSV\s+Graupa\s*,\s*[^,]{3,45}$/i.test(t)) {
            headerTitle = t.replace(/\s+(Vorrunde|Rückrunde|Gesamt)$/i, '').trim();
            break;
        }
    }

    let ballInfo = '';
    const ballMatch = fullText.match(/Die\s+Mannschaft\s+verwendet\s+Bälle\s+der\s+Marke\s+([^\n\r.!]+?)(?=Einzel|Doppel|Spielplan|$)/i);
    if (ballMatch) ballInfo = ballMatch[0].replace(/\s+/g, ' ').trim();

    const allTables = Array.from(doc.querySelectorAll('table')).filter(t => t.querySelectorAll('table').length === 0);
    const captainInfo = {};
    const venueInfo = {};
    let singlesTable = null;
    let doublesTable = null;
    let scheduleTable = null;

    allTables.forEach(tbl => {
        const rows = getDirectRows(tbl);
        if (!rows.length) return;
        const txt = tbl.textContent.replace(/\s+/g, ' ').trim();

        if (/Name/i.test(txt) && /Vertretung|Mobil|Email|Telefon/i.test(txt) && rows.length <= 12) {
            rows.forEach(r => {
                const cells = getCleanRowCells(r);
                if (cells.length >= 2) {
                    const k = cells[0].toLowerCase();
                    const v = cells.slice(1).join(' ').replace(/Erst nach Anmeldung.*/i, '').trim();
                    if (k === 'name' && !captainInfo.name && v) captainInfo.name = v;
                    else if (k.includes('vertretung') && v) captainInfo.deputy = v;
                    else if ((k.includes('mobil') || k.includes('telefon')) && v) captainInfo.phone = v;
                }
            });
            return;
        }

        if (/Bezeichnung/i.test(txt) && /Strasse|Straße|PLZ|Spieltag/i.test(txt) && rows.length <= 14) {
            rows.forEach(r => {
                const cells = getCleanRowCells(r);
                if (cells.length >= 2) {
                    const k = cells[0].toLowerCase();
                    const v = cells.slice(1).join(' ');
                    if (k.includes('bezeichnung')) venueInfo.name = v;
                    else if (k.includes('strasse') || k.includes('straße')) venueInfo.street = v;
                    else if (k.includes('plz') || k.includes('ort')) venueInfo.city = v;
                    else if (k.includes('telefon')) venueInfo.phone = v;
                    else if (k.includes('spieltag')) venueInfo.matchDay = v;
                }
            });
            return;
        }

        let headerRowIdx = -1;
        let headerJoined = '';
        for (let rIdx = 0; rIdx < Math.min(3, rows.length); rIdx++) {
            const hc = getCleanRowCells(rows[rIdx]);
            const hj = hc.join(' | ');
            if ((/Position/i.test(hj) && /Spieler/i.test(hj)) ||
                (/Spieler\s*1/i.test(hj) && /Spieler\s*2/i.test(hj)) ||
                (/Datum/i.test(hj) && (/Heim/i.test(hj) || /Gast/i.test(hj)))) {
                headerRowIdx = rIdx;
                headerJoined = hj;
                break;
            }
        }
        if (headerRowIdx === -1) return;

        if (/Position/i.test(headerJoined) && /Spieler/i.test(headerJoined)) {
            singlesTable = extractCleanDataTable(rows, headerRowIdx, 'singles');
        } else if (/Spieler\s*1/i.test(headerJoined) && /Spieler\s*2/i.test(headerJoined)) {
            doublesTable = extractCleanDataTable(rows, headerRowIdx, 'doubles');
        } else if (/Datum/i.test(headerJoined) && (/Heim/i.test(headerJoined) || /Gast/i.test(headerJoined))) {
            scheduleTable = extractCleanDataTable(rows, headerRowIdx, 'schedule');
        }
    });

    return { headerTitle, ballInfo, captainInfo, venueInfo, singlesTable, doublesTable, scheduleTable };
}

function extractCleanDataTable(rows, headerIdx, kind) {
    const readCellText = (el) => {
        let txt = el.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        if (!txt) {
            const img = el.querySelector('img');
            if (img) {
                const alt = (img.getAttribute('alt') || img.getAttribute('title') || img.getAttribute('src') || '').trim();
                if (/^e$/i.test(alt) || /ersatz/i.test(alt)) txt = 'E';
                else if (/jugend|spv|sperr/i.test(alt)) txt = alt.slice(0, 2).toUpperCase();
            }
        }
        return txt;
    };

    const expandRow = (tr) => {
        const directEls = Array.from(tr.children).filter(el => el.tagName === 'TD' || el.tagName === 'TH');
        if (directEls.some(c => c.querySelectorAll('tr').length > 2)) return [];
        const cols = [];
        directEls.forEach(el => {
            const span = Math.max(1, parseInt(el.getAttribute('colspan') || '1', 10));
            const txt = readCellText(el);
            cols.push(txt);
            for (let k = 1; k < span; k++) cols.push('');
        });
        return cols;
    };

    const rawHeaderCols = expandRow(rows[headerIdx]);
    const rawBodyRows = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const rCols = expandRow(rows[i]);
        if (rCols.filter(Boolean).length >= 2) {
            rawBodyRows.push(rCols);
        }
    }

    if (kind === 'schedule') {
        const bodyRows = rawBodyRows.map(rCols => {
            const nonEmpty = rCols.filter(Boolean);
            const merged = [];
            for (let c = 0; c < nonEmpty.length; c++) {
                if (nonEmpty[c] === 'v' && c + 1 < nonEmpty.length && /^\d{1,2}:\d{2}/.test(nonEmpty[c + 1])) {
                    merged.push('v ' + nonEmpty[c + 1]);
                    c++;
                } else {
                    merged.push(nonEmpty[c]);
                }
            }
            return { cells: merged, isTotal: false };
        });
        const headers = (bodyRows[0] && bodyRows[0].cells.length === 7)
            ? ['Nr.', 'Tag', 'Datum', 'Zeit', 'Heimmannschaft', 'Gastmannschaft', 'Ergebnis']
            : rawHeaderCols.filter(Boolean).map(h => /^Datum/i.test(h) ? 'Datum' : /^Ergebnis/i.test(h) ? 'Ergebnis' : h);
        return { headers, rows: bodyRows };
    }

    if (kind === 'doubles') {
        const headers = ['Spieler 1', 'Spieler 2', 'Bilanz', '+/-'];
        const bodyRows = rawBodyRows.map(rCols => {
            const nonEmpty = rCols.filter(Boolean);
            const isTotal = nonEmpty.some(c => /^Gesamt$/i.test(c));
            if (isTotal) {
                const gIdx = nonEmpty.findIndex(c => /^Gesamt$/i.test(c));
                const rest = nonEmpty.slice(gIdx + 1);
                return { cells: ['Gesamt', '', rest[0] || '', rest[1] || ''], isTotal: true };
            }
            let vals = [...nonEmpty];
            if (vals.length > 4 && /^\d+\.?$/.test(vals[0])) vals.shift();
            return {
                cells: [vals[0] || '', vals[1] || '', vals[2] || '', vals[3] || ''],
                isTotal: false
            };
        });
        return { headers, rows: bodyRows };
    }

    const maxCols = Math.max(rawHeaderCols.length, ...rawBodyRows.map(r => r.length));
    const normHeader = Array.from({ length: maxCols }, (_, s) => rawHeaderCols[s] || '');
    const normBody = rawBodyRows.map(r => Array.from({ length: maxCols }, (_, s) => r[s] || ''));

    if (normBody.length > 0 && /^Position$/i.test(normHeader[0]) && normBody.every(r => !r[0]) && normBody.some(r => /^\d+\.?$|^\d+[A-Za-z]+\/\d+$/.test(r[1]))) {
        normBody.forEach(r => r.shift());
        normBody.forEach(r => r.push(''));
    }

    if (kind === 'singles') {
        const hasPk3 = normHeader.some(h => /PK\s*3/i.test(h));
        const hasLpz = normHeader.some(h => /LivePZ|LPZ/i.test(h));
        const headers = ['Position', 'Spieler', 'Kz.', 'ST', 'PK1', 'PK2', ...(hasPk3 ? ['PK3'] : []), 'Gesamt', ...(hasLpz ? ['LivePZ'] : [])];
        const pkCount = hasPk3 ? 3 : 2;

        const bodyRows = rawBodyRows.map(rCols => {
            const isTotal = rCols.some(c => /^Gesamt$/i.test(c));
            if (isTotal) {
                const nonEmpty = rCols.filter(Boolean);
                const gIdx = nonEmpty.findIndex(c => /^Gesamt$/i.test(c));
                const ratios = nonEmpty.slice(gIdx + 1);
                const cells = ['Gesamt', '', '', ''];
                for (let p = 0; p < pkCount; p++) cells.push(ratios[p] || '');
                cells.push(ratios[pkCount] || '');
                if (hasLpz) cells.push('');
                return { cells, isTotal: true };
            }

            let idxPos = rCols.findIndex(c => /^\d+\.?$|^\d+[A-Za-z]+\/\d+$/.test(c));
            if (idxPos === -1) idxPos = 0;
            const posVal = rCols[idxPos] || '';

            let idxName = -1;
            for (let k = idxPos + 1; k < rCols.length; k++) {
                if (rCols[k] && !/^\d+$/.test(rCols[k])) { idxName = k; break; }
            }
            const nameVal = idxName !== -1 ? rCols[idxName] : '';

            let idxSt = -1;
            for (let k = (idxName !== -1 ? idxName + 1 : idxPos + 1); k < rCols.length; k++) {
                if (/^\d{1,2}$/.test(rCols[k])) { idxSt = k; break; }
            }
            const stVal = idxSt !== -1 ? rCols[idxSt] : '';

            let kzVal = '';
            if (idxName !== -1 && idxSt !== -1 && idxSt > idxName + 1) {
                kzVal = rCols.slice(idxName + 1, idxSt).filter(Boolean).join(' ');
            }

            const afterSt = idxSt !== -1 ? rCols.slice(idxSt + 1) : [];
            const pkVals = [];
            for (let p = 0; p < pkCount; p++) pkVals.push(afterSt[p] || '');
            const totalVal = afterSt[pkCount] || '';
            const lpzVal = hasLpz ? (afterSt[pkCount + 1] || '') : '';

            const cells = [posVal, nameVal, kzVal, stVal, ...pkVals, totalVal, ...(hasLpz ? [lpzVal] : [])];
            return { cells, isTotal: false };
        });

        return { headers, rows: bodyRows };
    }

    return { headers: normHeader, rows: normBody.map(cells => ({ cells, isTotal: false })) };
}

// -----------------------------------------------------------------
// SCHRITT C: ZWEISPALTIGES RENDERING FÜR JEDE MANNSCHAFT
// Links: Liga-Tabelle + Spielplan
// Rechts: Einzel-Bilanzen + Doppel-Bilanzen + Metadaten (inkl. Ball) + Spielstätte
// -----------------------------------------------------------------
function renderGraupaTeamLayout(team, details, isLoadingDetails) {
    const cont = document.getElementById('tt-team-content');
    if (!cont) return;

    const standingsHtml = `
        <div class="tp-section-card" style="margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                <div>
                    <span class="eyebrow-dark">${domEsc(team.league)}</span>
                    <h4 style="font-size:18px; font-weight:800;">📊 Liga-Tabelle · ${domEsc(team.tabName)}</h4>
                </div>
                <span class="badge" style="background:var(--emerald-dark); color:#fff;">Live-Tabelle</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="tt-data-table">
                    <thead>
                        <tr>${team.standingsHeaders.map(h => `<th>${domEsc(h)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${team.standingsRows.map(r => {
                            const isActiveRow = r.isCurrentTeam || (r.isGraupa && !team.standingsRows.some(x => x.isCurrentTeam));
                            const rowStyle = (!isActiveRow && r.isGraupa) ? 'background:#ecfdf5; font-weight:700; color:#047857;' : '';
                            return `
                                <tr class="${isActiveRow ? 'graupa-row' : ''}" style="${rowStyle}">
                                    ${r.cells.map((c, idx) => `<td class="${idx === 1 ? 'tt-col-wrap' : ''}" style="${idx >= r.cells.length - 3 ? 'font-family:JetBrains Mono,monospace;font-weight:700;' : ''}">${r.isGraupa && idx === 1 ? '🏓 ' : ''}${domEsc(c)}</td>`).join('')}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    let scheduleHtml = '';
    if (isLoadingDetails) {
        scheduleHtml = `<div class="tp-section-card" style="margin-bottom:0; text-align:center; padding:22px;">
            ⏳ Lade aktuellen Spielplan für <b>${domEsc(team.tabName)}</b> …
        </div>`;
    } else if (details && details.scheduleTable && details.scheduleTable.rows.length) {
        scheduleHtml = `
            <div class="tp-section-card" style="margin-bottom:0;">
                <h4 style="font-size:18px; font-weight:800; margin-bottom:8px;">📅 Spielplan & Ergebnisse</h4>
                <div style="overflow-x:auto;">
                    <table class="tt-data-table">
                        <thead>
                            <tr>${details.scheduleTable.headers.map(h => `<th>${domEsc(h)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${details.scheduleTable.rows.map(r => {
                                return `<tr>${r.cells.map((c, idx) => {
                                    const isGraupaCell = /TSV\s+Graupa/i.test(c);
                                    const isTeamCol = idx === 4 || idx === 5;
                                    return `<td class="${isTeamCol ? 'tt-col-wrap' : ''}" style="${isGraupaCell ? 'font-weight:800;color:var(--emerald-dark);' : ''}${idx === r.cells.length - 1 ? 'font-family:JetBrains Mono,monospace;font-weight:800;' : ''}">${domEsc(c)}</td>`;
                                }).join('')}</tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    const leftCol = `<div style="display:flex; flex-direction:column; gap:16px;">${standingsHtml}${scheduleHtml}</div>`;

    let rightCol = '';
    if (isLoadingDetails) {
        rightCol = `
            <div class="tp-section-card" style="text-align:center; padding:34px;">
                <div style="font-size:26px; margin-bottom:8px;">⏳</div>
                <h4 style="font-size:17px; font-weight:800;">Ziehe Einzel-/Doppel-Bilanzen & Metadaten aus TischtennisLive …</h4>
            </div>
        `;
    } else if (!details || details.error) {
        rightCol = `
            <div class="tp-section-card">
                <h4 style="font-size:17px; font-weight:800;">📊 Detail-Auswertung auf TischtennisLive</h4>
                <p class="tp-help" style="margin:8px 0 14px;">Die Detailseite konnte gerade nicht geladen werden (${domEsc(details?.error || 'Unbekannter Status')}).</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-emerald" onclick="selectGraupaTeamTab('${team.id}', true)">🔄 Erneut mit Login abrufen</button>
                    <a href="${domEsc(team.teamUrl)}" target="_blank" rel="noopener" class="btn btn-sand">Direkt in TischtennisLive öffnen ↗</a>
                </div>
            </div>
        `;
    } else {
        const renderParsedTable = (tblObj, emptyMsg) => {
            if (!tblObj || !tblObj.rows.length) return `<p class="tp-help">${emptyMsg}</p>`;
            return `
                <div style="overflow-x:auto;">
                    <table class="tt-data-table">
                        <thead>
                            <tr>${tblObj.headers.map(h => `<th>${domEsc(h)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${tblObj.rows.map(r => `
                                <tr style="${r.isTotal ? 'background:var(--bg-sand);font-weight:800;' : ''}">
                                    ${r.cells.map((c, idx) => `<td class="${idx === 1 ? 'tt-col-wrap' : ''}" style="${idx === 1 && !r.isTotal ? 'font-weight:700;' : ''}${/^\d+:\d+$|^\d{3,4}$|^[+-]?\d+$/.test(c) ? 'font-family:JetBrains Mono,monospace;' : ''}">${domEsc(c)}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        };

        const cap = details.captainInfo || {};
        const ven = details.venueInfo || {};
        const fullAddress = [ven.street || 'Badstr. 3', ven.city || '01796 Pirna OT Graupa'].filter(Boolean).join(', ');
        const cleanBall = (details.ballInfo || '')
            .replace(/^Die\s+Mannschaft\s+verwendet\s+Bälle\s+der\s+Marke\s*/i, '')
            .trim();

        rightCol = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div class="tp-section-card" style="margin-bottom:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <h4 style="font-size:17px; font-weight:800;">👤 Einzel-Bilanzen</h4>
                        <a href="${domEsc(team.teamUrl)}" target="_blank" rel="noopener" style="font-size:11.5px; font-weight:700; color:var(--emerald-dark); text-decoration:none;">Alle Reiter (Analyse/Matrix/LivePZ) ↗</a>
                    </div>
                    <div style="margin-bottom:16px;">
                        ${renderParsedTable(details.singlesTable, 'Noch keine Einzel-Einsätze verbucht.')}
                    </div>

                    <h4 style="font-size:17px; font-weight:800; margin-bottom:6px;">👥 Doppel-Bilanzen</h4>
                    <div>
                        ${renderParsedTable(details.doublesTable, 'Noch keine Doppel-Einsätze verbucht.')}
                    </div>
                </div>

                <!-- Metadaten (inkl. Mannschaftsführer & Ballmarke) + Sportstätte darunter -->
                <div class="grid-2" style="gap:12px;">
                    <div class="tp-section-card" style="margin-bottom:0;">
                        <span class="person-role">📋 Metadaten</span>
                        <div style="font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-top:6px;">Mannschaftsführer</div>
                        <h5 style="font-size:17px; font-weight:800; margin:1px 0 8px; color:var(--text-dark);">${domEsc(cap.name || 'Siehe TischtennisLive')}</h5>
                        <div style="font-size:12.5px; color:#475569; line-height:1.65;">
                            ${cap.deputy ? `<div><b>Vertretung:</b> ${domEsc(cap.deputy)}</div>` : ''}
                            ${ven.matchDay ? `<div><b>Heimspieltag:</b> ${domEsc(ven.matchDay)}</div>` : ''}
                            ${cleanBall ? `<div><b>Spielball:</b> 🟡 ${domEsc(cleanBall)}</div>` : ''}
                            <div style="margin-top:8px;">
                                <a href="${domEsc(team.teamUrl)}" target="_blank" rel="noopener" style="color:var(--emerald-dark); font-weight:700; font-size:12px;">
                                    🔗 Kontaktdaten in TTLive ↗
                                </a>
                            </div>
                        </div>
                    </div>

                    <div class="tp-section-card" style="margin-bottom:0;">
                        <span class="person-role">📍 Sportstätte & Karte</span>
                        <h5 style="font-size:14.5px; font-weight:800; margin:4px 0 4px;">${domEsc(ven.name || 'Turnhalle Grundschule Graupa')}</h5>
                        <div style="font-size:12px; color:#475569; margin-bottom:8px;">
                            ${domEsc(fullAddress)}${ven.phone ? ' · Tel: ' + domEsc(ven.phone) : ''}
                        </div>
                        <iframe title="Karte Spielstätte"
                                src="https://www.openstreetmap.org/export/embed.html?bbox=13.9165%2C50.9995%2C13.9285%2C51.0055&layer=mapnik&marker=51.0025%2C13.9225"
                                style="width:100%; height:115px; border:1px solid var(--border-sand); border-radius:10px;"></iframe>
                    </div>
                </div>
            </div>
        `;
    }

    cont.innerHTML = leftCol + rightCol;
}

window.addEventListener('DOMContentLoaded', () => {
    initTTHubIfNeeded();
});
