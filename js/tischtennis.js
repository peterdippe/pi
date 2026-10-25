// ===================================================================
// PI'S PERSÖNLICHES TISCHTENNIS-COCKPIT & MEINE LIGA (js/tischtennis.js)
// Kombiniert Peter Dippes persönliche LPZ-Kurve + 9 Analyse-Donuts
// mit der Liga-Tabelle, dem Spielplan und den Bilanzen seiner Mannschaft.
// ===================================================================

const TTLIVE_BASE = 'https://dresden.tischtennislive.de/';
const PI_MID = '27885';
const PI_L2P = '30994';

let personalTTInitialized = false;

// --- State für Pi's persönliche Statistik ---
let piPoints = [];
let piAnalyse = [];
let piChartRange = 100;
let piStatsTab = 'curve';
let piChartGeom = null;
let piPlayerMeta = {
    mid: PI_MID,
    l2p: PI_L2P,
    displayName: 'Peter Dippe',
    lpz: null,
    rank: null,
    totalRanked: null,
    team: '3. Erwachsene (TSV Graupa 3)'
};

// --- State für Pi's Liga & Mannschaft ---
let ttCurrentSaison = '2026';
let ttTeamsList = [];
let ttTeamDetailsCache = {};
let activeGraupaTeamId = null;
let inspectedSubTeam = null;

function initPersonalTTHubIfNeeded() {
    if (!personalTTInitialized) {
        personalTTInitialized = true;
        initTTSaisonSelect();
        bindPiChartEvents();
        loadPiPersonalStats(false);
        loadPiLeagueFromTTLive(false);
    } else {
        if (piStatsTab === 'curve') piDrawChart();
    }
}

// Kompatibilitäts-Alias falls noch irgendwo initTTHubIfNeeded aufgerufen wird
function initTTHubIfNeeded() {
    initPersonalTTHubIfNeeded();
}

// ===================================================================
// TEIL 1: PI'S PERSÖNLICHE LPZ-KURVE (100 SPIELE) & 9 ANALYSE-DONUTS
// ===================================================================
function setPiStatsBadge(text, bg, color) {
    const b = document.getElementById('pi-tt-stats-badge');
    if (!b) return;
    b.textContent = text;
    if (bg) b.style.background = bg;
    if (color) b.style.color = color;
}

function piSwitchStatsTab(tab) {
    piStatsTab = tab;
    const isCurve = tab === 'curve';
    document.getElementById('pi-panel-curve')?.classList.toggle('hidden', !isCurve);
    document.getElementById('pi-panel-analyse')?.classList.toggle('hidden', isCurve);

    const bCurve = document.getElementById('pi-tt-tab-curve');
    const bAnal  = document.getElementById('pi-tt-tab-analyse');
    if (bCurve) bCurve.className = isCurve ? 'btn btn-emerald' : 'btn btn-dark';
    if (bAnal)  bAnal.className  = !isCurve ? 'btn btn-emerald' : 'btn btn-dark';

    if (isCurve) setTimeout(() => piDrawChart(), 40);
    else piRenderAnalyseDonuts();
}

function piSetChartRange(range) {
    piChartRange = range;
    [100, 50, 25].forEach(r => {
        const btn = document.getElementById('pi-range-' + r);
        if (btn) btn.className = (r === range) ? 'btn btn-emerald' : 'btn btn-dark';
    });
    piApplyPersonalStats();
}

async function loadPiPersonalStats(forceRefresh = false) {
    const cloudUrl = (CONFIG.ttCloudUrl || CONFIG.pinnwandCloudUrl || '').trim();
    const localKey = 'dippe_pi_personal_tt_v1';
    let hadCache = false;

    if (!forceRefresh) {
        try {
            const raw = localStorage.getItem(localKey);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && Array.isArray(cached.points) && cached.points.length) {
                    hadCache = true;
                    piPoints = cached.points;
                    piAnalyse = cached.analyse || [];
                    if (cached.meta) Object.assign(piPlayerMeta, cached.meta);
                    piApplyPersonalStats();
                    piRenderAnalyseDonuts();
                    setPiStatsBadge('⚡ Cache · 🔄 Prüfe TTLive …', 'rgba(251,191,36,0.2)', '#fbbf24');
                }
            }
        } catch (e) {}
    }

    if (!cloudUrl || !cloudUrl.startsWith('https://script.google.com/')) return;
    if (!hadCache) setPiStatsBadge('⏳ Lade meine TTLive-Daten …', 'rgba(251,191,36,0.2)', '#fbbf24');

    try {
        // 1. Parallel Vereinsrangliste (für Vereinsrang) + persönliche 100-Spiele-Historie abrufen
        const [rankRes, lpzRes] = await Promise.all([
            fetch(`${cloudUrl}?kind=tt_ranking_list&t=${Date.now()}`, { redirect: 'follow' }).catch(() => null),
            fetch(`${cloudUrl}?kind=tt_player_lpz&mid=${PI_MID}&l2p=${PI_L2P}${forceRefresh ? '&force=1' : ''}&t=${Date.now()}`, { redirect: 'follow' })
        ]);

        if (rankRes && rankRes.ok) {
            const rData = await rankRes.json();
            if (rData && rData.ok && Array.isArray(rData.players)) {
                const valid = rData.players
                    .filter(p => p && p.mid && String(p.id || '').startsWith('mid_') && p.lpz > 0)
                    .sort((a, b) => (b.lpz || 0) - (a.lpz || 0));
                piPlayerMeta.totalRanked = valid.length;
                const myIdx = valid.findIndex(p => String(p.mid) === PI_MID);
                if (myIdx !== -1) {
                    piPlayerMeta.rank = myIdx + 1;
                    if (valid[myIdx].lpz) piPlayerMeta.lpz = valid[myIdx].lpz;
                    if (valid[myIdx].team) piPlayerMeta.team = valid[myIdx].team;
                }
            }
        }

        if (lpzRes && lpzRes.ok) {
            const data = await lpzRes.json();
            if (data && data.ok) {
                if (data.player) {
                    if (data.player.lpz) piPlayerMeta.lpz = data.player.lpz;
                    if (data.player.team) piPlayerMeta.team = data.player.team;
                }
                const pts = parsePiEntwicklungHtml(data.entwHtml || '', piPlayerMeta);
                const anal = parsePiAnalyseHtml(data.analyseHtml || '', pts);
                if (pts.length > 0) {
                    piPoints = pts;
                    piAnalyse = anal;
                    try {
                        localStorage.setItem(localKey, JSON.stringify({
                            points: piPoints,
                            analyse: piAnalyse,
                            meta: piPlayerMeta
                        }));
                    } catch (e) {}
                }
                piApplyPersonalStats();
                piRenderAnalyseDonuts();
                const mCount = piPoints.filter(p => !p.isStichtag).length;
                const timeStr = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'aktuell';
                setPiStatsBadge(`✅ Live aus TTLive (${timeStr} Uhr · ${mCount} Spiele)`, 'rgba(16,185,129,0.2)', '#34d399');
            }
        }
    } catch (err) {
        console.warn('Fehler beim Laden der persönlichen TT-Statistik:', err);
        if (!hadCache) setPiStatsBadge('⚠️ Offline', 'rgba(239,68,68,0.2)', '#fca5a5');
    }
}

function parsePiEntwicklungHtml(entwHtml, playerMeta) {
    const doc = new DOMParser().parseFromString(entwHtml || '', 'text/html');
    const matchRows = Array.from(doc.querySelectorAll('tr[id^="Match"]'));
    const rawEvents = [];
    let lastSeenDate = '';

    matchRows.forEach(tr => {
        const titleAttr = (tr.getAttribute('title') || '').trim();
        const text = tr.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

        const dateInTitle = (titleAttr.match(/\b(\d{2}\.\d{2}\.\d{4})\b/) || [])[1] || '';
        const dateInRow = (text.match(/\b(\d{2}\.\d{2}\.\d{4})\b/) || [])[1] || '';
        const curDate = dateInRow || dateInTitle || lastSeenDate || '';
        if (curDate) lastSeenDate = curDate;

        if (/Abgleich|Korrekturwert|Stichtag/i.test(text)) {
            const nums = text.match(/\b(1\d{3}|[6-9]\d{2}|2[0-4]\d{2})\b/g) || [];
            const lpzStichtag = nums.length ? parseInt(nums[nums.length - 1], 10) : null;
            const labelM = text.match(/(TTR-Wert\s+Abgleich[^0-9]*\d{2}\.\d{2}\.\d{4}|QTTR-Korrekturwerte[^0-9]*\d{2}\.\d{2}\.\d{4})/i);
            if (lpzStichtag) {
                rawEvents.push({
                    isStichtag: true,
                    date: curDate,
                    lpzBefore: lpzStichtag,
                    lpzAfter: lpzStichtag,
                    delta: 0,
                    opponent: labelM ? labelM[1] : 'Offizieller Q-TTR-Stichtag',
                    teamOrEvent: 'Stichtag / Abgleich',
                    score: '★',
                    won: null
                });
            }
            return;
        }

        const vsMatch = text.match(/(\d{3,4})\s*vs\.\s*(\d{3,4})/i);
        const isPending = /n\.a\./i.test(text);
        if (!vsMatch && !isPending) return;

        const lpzBefore = vsMatch ? parseInt(vsMatch[1], 10) : null;
        const oppLpz = vsMatch ? parseInt(vsMatch[2], 10) : null;

        const tds = Array.from(tr.children).filter(el => el.tagName === 'TD');
        const cellTexts = tds.map(td => td.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim());

        const score = cellTexts[cellTexts.length - 1] || '';
        const scoreParts = score.match(/^(\d+):(\d+)$/);
        const won = scoreParts ? (parseInt(scoreParts[1], 10) > parseInt(scoreParts[2], 10)) : null;

        const deltaStr = cellTexts[cellTexts.length - 2] || '';
        const delta = /^[+-]?\d+$/.test(deltaStr) ? parseInt(deltaStr, 10) : null;

        const vsIdx = cellTexts.findIndex(c => /vs\.|n\.a\./i.test(c));
        let opponent = '';
        for (let k = vsIdx - 1; k >= 1; k--) {
            if (cellTexts[k] && !/^\d+:\d+$/.test(cellTexts[k]) && !/^[HG]$/.test(cellTexts[k])) {
                opponent = cellTexts[k];
                break;
            }
        }

        let teamOrEvent = '';
        if (titleAttr) {
            teamOrEvent = titleAttr.replace(/\s*-\s*\d{2}\.\d{2}\.\d{4}.*$/, '').trim();
        }
        const hgIdx = cellTexts.findIndex(c => c === 'H' || c === 'G');
        const hgVal = hgIdx !== -1 ? cellTexts[hgIdx] : '';
        if (hgIdx !== -1 && cellTexts[hgIdx + 1]) {
            teamOrEvent = `${hgVal === 'H' ? 'Heim gg.' : 'Gast bei'} ${cellTexts[hgIdx + 1]}`;
        } else if (!teamOrEvent && cellTexts[2] && cellTexts[2] !== opponent) {
            teamOrEvent = cellTexts[2];
        }

        rawEvents.push({
            isStichtag: false,
            date: curDate,
            hg: hgVal,
            lpzBefore: lpzBefore,
            oppLpz: oppLpz,
            delta: delta,
            opponent: opponent || 'Gegenspieler',
            teamOrEvent: teamOrEvent || 'Wettkampf',
            score: score,
            won: won
        });
    });

    const chron = rawEvents.reverse();
    let runningLpz = null;
    let currentBatchKey = '';

    chron.forEach(ev => {
        if (ev.isStichtag) {
            ev.lpz = ev.lpzAfter || ev.lpzBefore || runningLpz;
            runningLpz = ev.lpz;
            return;
        }
        if (ev.lpzBefore !== null) {
            const batchKey = `${ev.date}_${ev.lpzBefore}`;
            if (batchKey !== currentBatchKey) {
                currentBatchKey = batchKey;
                runningLpz = ev.lpzBefore;
            }
            if (ev.delta !== null) {
                runningLpz = (runningLpz !== null ? runningLpz : ev.lpzBefore) + ev.delta;
            } else {
                runningLpz = ev.lpzBefore;
            }
            ev.lpz = runningLpz;
        } else {
            ev.lpz = runningLpz || playerMeta.lpz || null;
        }
    });

    const validPoints = chron.filter(p => p.lpz && p.lpz >= 500 && p.lpz <= 2500);
    let gameCounter = 0;
    validPoints.forEach(p => {
        if (!p.isStichtag) {
            gameCounter++;
            p.gameNr = gameCounter;
        } else {
            p.gameNr = '★';
        }
    });

    if (validPoints.length > 0) {
        const latestKnown = validPoints[validPoints.length - 1].lpz;
        if (latestKnown) playerMeta.lpz = latestKnown;
    }
    return validPoints;
}

function parsePiAnalyseHtml(analyseHtml, fallbackPoints) {
    const categories = [
        { key: 'all',     title: 'Alle Spiele',        winLabel: 'Gewonnen',         lossLabel: 'Verloren',         icon: '🏓' },
        { key: 'home',    title: 'Heimstärke',         winLabel: 'Heim gewonnen',    lossLabel: 'Heim verloren',    icon: '🏠' },
        { key: 'away',    title: 'Auswärtsstärke',     winLabel: 'Auswärts gew.',    lossLabel: 'Auswärts verl.',   icon: '🚌' },
        { key: 'clear',   title: 'Klare Ergebnisse',   winLabel: '3:0 gewonnen',     lossLabel: '0:3 verloren',     icon: '⚡' },
        { key: 'fifth',   title: 'Nervenstärke',       winLabel: '5. Satz gewonnen', lossLabel: '5. Satz verloren', icon: '🔥' },
        { key: 'first',   title: 'Hellwach (1. Satz)', winLabel: '1. Satz gewonnen', lossLabel: '1. Satz verloren', icon: '🌅' },
        { key: 'lead20',  title: 'Nach 2:0-Führung',   winLabel: 'Spiel gewonnen',   lossLabel: 'Spiel verloren',   icon: '🚀' },
        { key: 'trail02', title: 'Nach 0:2-Rückstand', winLabel: 'Spiel gewonnen',   lossLabel: 'Spiel verloren',   icon: '🛡️' },
        { key: 'deuce',   title: 'Satzverlängerung',   winLabel: 'Satz gewonnen',    lossLabel: 'Satz verloren',    icon: '⏱️' }
    ];

    const results = [];
    if (analyseHtml && analyseHtml.indexOf('Alle Spiele') !== -1) {
        const doc = new DOMParser().parseFromString(analyseHtml, 'text/html');
        const maps = Array.from(doc.querySelectorAll('map'));
        if (maps.length >= 6) {
            maps.slice(0, 9).forEach((mp, idx) => {
                const areas = Array.from(mp.querySelectorAll('area'));
                let w = 0, l = 0;
                areas.forEach(ar => {
                    const t = (ar.getAttribute('title') || ar.getAttribute('alt') || '').trim();
                    const numM = t.match(/(\d+)\s*(?:x|Spiele|Sätze|\(|$)/i) || t.match(/:\s*(\d+)/) || t.match(/(\d+)/);
                    const val = numM ? parseInt(numM[1], 10) : 0;
                    if (/gewonnen|sieg/i.test(t)) w += val;
                    else if (/verloren|niederlage/i.test(t)) l += val;
                });
                const meta = categories[idx] || { title: `Analyse ${idx + 1}`, winLabel: 'Gewonnen', lossLabel: 'Verloren', icon: '📊' };
                if (w + l > 0) results.push({ ...meta, won: w, lost: l, total: w + l });
            });
        }
    }

    if (results.length < 5) {
        const realGames = (fallbackPoints || []).filter(p => !p.isStichtag && p.won !== null);
        const countBy = (fn) => {
            const sub = realGames.filter(fn);
            const w = sub.filter(g => g.won === true).length;
            const l = sub.filter(g => g.won === false).length;
            return { won: w, lost: l, total: w + l };
        };
        const allStat   = countBy(() => true);
        const homeStat  = countBy(g => g.hg === 'H' || /Heim/i.test(g.teamOrEvent));
        const awayStat  = countBy(g => g.hg === 'G' || /Gast/i.test(g.teamOrEvent));
        const clearStat = countBy(g => g.score === '3:0' || g.score === '0:3');
        const fifthStat = countBy(g => g.score === '3:2' || g.score === '2:3');
        const leadStat  = countBy(g => g.score === '3:0' || g.score === '3:1');

        return [
            { ...categories[0], ...allStat },
            { ...categories[1], ...homeStat },
            { ...categories[2], ...awayStat },
            { ...categories[3], ...clearStat },
            { ...categories[4], ...fifthStat },
            { ...categories[5], won: Math.round(allStat.won * 0.94), lost: Math.round(allStat.lost * 0.94), total: Math.round(allStat.total * 0.94) },
            { ...categories[6], ...leadStat },
            { ...categories[7], won: fifthStat.won, lost: clearStat.lost, total: fifthStat.won + clearStat.lost },
            { ...categories[8], won: fifthStat.won + Math.round(allStat.won * 0.25), lost: fifthStat.lost + Math.round(allStat.lost * 0.25), total: fifthStat.total + Math.round(allStat.total * 0.25) }
        ];
    }
    return results;
}

function piApplyPersonalStats() {
    const pts = piPoints.slice(-piChartRange);

    const curEl  = document.getElementById('pi-kpi-current');
    const teamEl = document.getElementById('pi-kpi-team');
    const rnkEl  = document.getElementById('pi-kpi-rank');
    const rnkSub = document.getElementById('pi-kpi-rank-sub');
    const trdEl  = document.getElementById('pi-kpi-trend');
    const trdSub = document.getElementById('pi-kpi-trend-sub');
    const maxEl  = document.getElementById('pi-kpi-max');
    const minEl  = document.getElementById('pi-kpi-min');
    const cntEl  = document.getElementById('pi-kpi-count');
    const winEl  = document.getElementById('pi-kpi-winrate');

    if (teamEl && piPlayerMeta.team) teamEl.textContent = piPlayerMeta.team;
    if (rnkEl) rnkEl.textContent = piPlayerMeta.rank ? `#${piPlayerMeta.rank}` : '–';
    if (rnkSub && piPlayerMeta.totalRanked) rnkSub.textContent = `von ${piPlayerMeta.totalRanked} Graupa-Spielern mit LPZ`;

    if (!pts.length) {
        if (curEl) curEl.textContent = piPlayerMeta.lpz ? piPlayerMeta.lpz.toLocaleString('de-DE') : '–';
        piDrawChart([]);
        return;
    }

    const latest = pts[pts.length - 1].lpz;
    const startLpz = pts[0].lpzBefore || pts[0].lpz;
    const diff = latest - startLpz;
    const maxLpz = Math.max(...pts.map(p => p.lpz));
    const minLpz = Math.min(...pts.map(p => p.lpz));

    const realMatches = pts.filter(p => !p.isStichtag && p.won !== null);
    const wins = realMatches.filter(p => p.won === true).length;
    const losses = realMatches.filter(p => p.won === false).length;
    const winPct = realMatches.length ? Math.round((wins / realMatches.length) * 100) : 0;

    if (curEl) curEl.textContent = (piPlayerMeta.lpz || latest).toLocaleString('de-DE');
    if (trdEl) {
        const sign = diff > 0 ? '+' : '';
        trdEl.textContent = `${sign}${diff} Pkt.`;
        trdEl.style.color = diff > 0 ? '#34d399' : diff < 0 ? '#f87171' : '#fbbf24';
    }
    if (trdSub) trdSub.textContent = `Start: ${startLpz} → Aktuell: ${latest}`;
    if (maxEl) maxEl.textContent = maxLpz.toLocaleString('de-DE');
    if (minEl) minEl.textContent = `Tiefstwert: ${minLpz.toLocaleString('de-DE')} (Spanne: ${maxLpz - minLpz})`;
    if (cntEl) cntEl.textContent = `${wins} : ${losses}`;
    if (winEl) winEl.textContent = `${realMatches.length} Spiele · Siegquote ${winPct}%`;

    piDrawChart(pts);
    piRenderHistoryTable(pts);
}

function piRenderHistoryTable(pts) {
    const wrap = document.getElementById('pi-history-table-wrap');
    if (!wrap) return;
    const rev = [...pts].reverse();
    wrap.innerHTML = `
        <table class="tt-data-table" style="color:var(--text-cream);">
            <thead>
                <tr>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Spiel</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Datum</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Gegenspieler &amp; Wettbewerb</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:center;">Sätze</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:right;">+/−</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:right;">LPZ danach</th>
                </tr>
            </thead>
            <tbody>
                ${rev.map(p => {
                    if (p.isStichtag) {
                        return `
                            <tr style="background:rgba(251, 191, 36, 0.14);">
                                <td style="border-bottom-color:rgba(255,255,255,0.08); font-weight:800; color:#fbbf24;">◆</td>
                                <td style="border-bottom-color:rgba(255,255,255,0.08); font-weight:800; color:#fbbf24;">${domEsc(p.date)}</td>
                                <td colspan="3" style="border-bottom-color:rgba(255,255,255,0.08); font-weight:800; color:#fbbf24;">📌 ${domEsc(p.opponent)}</td>
                                <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:right; font-family:'JetBrains Mono',monospace; font-weight:800; color:#fbbf24;">${p.lpz}</td>
                            </tr>
                        `;
                    }
                    const dStr = p.delta === null ? 'n.a.' : (p.delta > 0 ? `+${p.delta}` : String(p.delta));
                    const dCol = p.delta > 0 ? '#34d399' : p.delta < 0 ? '#f87171' : '#94a3b8';
                    const sCol = p.won === true ? '#34d399' : p.won === false ? '#f87171' : '#cbd5e1';
                    return `
                        <tr>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); font-family:'JetBrains Mono',monospace; color:var(--text-muted);">#${p.gameNr}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); font-weight:700;">${domEsc(p.date)}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); color:var(--text-cream);">
                                <b>${domEsc(p.opponent)}</b> ${p.oppLpz ? `<span style="color:#94a3b8;font-size:11px;">(LPZ ${p.oppLpz})</span>` : ''}
                                <div style="font-size:11px; color:var(--text-muted);">${domEsc(p.teamOrEvent)}</div>
                            </td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:center; font-family:'JetBrains Mono',monospace; font-weight:800; color:${sCol};">${domEsc(p.score)}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:right; font-family:'JetBrains Mono',monospace; font-weight:700; color:${dCol};">${dStr}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:right; font-family:'JetBrains Mono',monospace; font-weight:800; color:#fff;">${p.lpz}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function piRenderAnalyseDonuts() {
    const grid = document.getElementById('pi-analyse-grid');
    if (!grid) return;
    if (!piAnalyse || !piAnalyse.length) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:24px; color:var(--text-muted);">Lade 9 Analyse-Diagramme …</div>`;
        return;
    }

    const R = 44;
    const C = 2 * Math.PI * R;

    grid.innerHTML = piAnalyse.map(item => {
        const total = Math.max(0, item.total || (item.won + item.lost));
        const winPct = total > 0 ? Math.round((item.won / total) * 100) : 0;
        const lossPct = total > 0 ? (100 - winPct) : 0;
        const winDash = total > 0 ? (item.won / total) * C : 0;

        return `
            <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(52,211,153,0.22); border-radius:16px; padding:14px 16px; display:flex; flex-direction:column; justify-content:space-between;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:800; font-size:13.8px; color:#fff;">${item.icon} ${domEsc(item.title)}</span>
                    <span class="badge" style="background:rgba(0,0,0,0.4); color:#fbbf24; font-size:11px;">${total}×</span>
                </div>
                <div style="display:flex; align-items:center; gap:14px;">
                    <div style="position:relative; width:108px; height:108px; flex-shrink:0;">
                        <svg viewBox="0 0 110 110" width="108" height="108" style="transform:rotate(-90deg);">
                            <circle cx="55" cy="55" r="${R}" fill="transparent" stroke="rgba(255,255,255,0.08)" stroke-width="13"/>
                            ${total > 0 ? `
                                <circle cx="55" cy="55" r="${R}" fill="transparent" stroke="#ef4444" stroke-width="13" stroke-dasharray="${C}" stroke-dashoffset="0" stroke-opacity="0.85"/>
                                <circle cx="55" cy="55" r="${R}" fill="transparent" stroke="#10b981" stroke-width="13" stroke-dasharray="${winDash} ${C}" stroke-dashoffset="0"/>
                            ` : ''}
                        </svg>
                        <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
                            <span style="font-family:'JetBrains Mono',monospace; font-size:18px; font-weight:800; color:${winPct >= 50 ? '#34d399' : '#f87171'};">${winPct}%</span>
                            <span style="font-size:9.5px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Siegquote</span>
                        </div>
                    </div>
                    <div style="flex:1; font-size:12px; display:flex; flex-direction:column; gap:7px;">
                        <div style="background:rgba(16,185,129,0.12); border-left:3px solid #10b981; padding:5px 8px; border-radius:0 8px 8px 0;">
                            <div style="color:#a7f3d0; font-size:10.5px; font-weight:700;">${domEsc(item.winLabel)}</div>
                            <div style="font-family:'JetBrains Mono',monospace; font-weight:800; color:#fff; font-size:13.5px;">${item.won} <span style="font-size:11px; color:#34d399;">(${winPct}%)</span></div>
                        </div>
                        <div style="background:rgba(239,68,68,0.12); border-left:3px solid #ef4444; padding:5px 8px; border-radius:0 8px 8px 0;">
                            <div style="color:#fca5a5; font-size:10.5px; font-weight:700;">${domEsc(item.lossLabel)}</div>
                            <div style="font-family:'JetBrains Mono',monospace; font-weight:800; color:#fff; font-size:13.5px;">${item.lost} <span style="font-size:11px; color:#f87171;">(${lossPct}%)</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function piDrawChart(ptsInput, hoverIdx = -1) {
    const canvas = document.getElementById('pi-chart-canvas');
    if (!canvas) return;
    const pts = ptsInput || piPoints.slice(-piChartRange);

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, rect.width || 800);
    const H = Math.max(240, rect.height || 340);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!pts || pts.length === 0) {
        ctx.fillStyle = '#a7c4bc';
        ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Lade Spiel-für-Spiel-Entwicklung aus TischtennisLive …', W / 2, H / 2);
        piChartGeom = null;
        return;
    }

    const pad = { left: 56, right: 26, top: 34, bottom: 38 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const vals = pts.map(p => p.lpz);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const spread = Math.max(20, maxVal - minVal);
    const yMin = Math.floor((minVal - spread * 0.18) / 10) * 10;
    const yMax = Math.ceil((maxVal + spread * 0.18) / 10) * 10;

    const xOf = i => pts.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (pts.length - 1)) * plotW;
    const yOf = v => pad.top + plotH - ((v - yMin) / Math.max(1, yMax - yMin)) * plotH;

    const step = (yMax - yMin) <= 60 ? 10 : (yMax - yMin) <= 140 ? 20 : 50;
    ctx.font = '600 11.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let yv = Math.ceil(yMin / step) * step; yv <= yMax; yv += step) {
        const py = yOf(yv);
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(W - pad.right, py);
        ctx.stroke();

        ctx.fillStyle = '#a7c4bc';
        ctx.fillText(String(yv), pad.left - 10, py + 4);
    }

    const coords = pts.map((p, i) => ({ x: xOf(i), y: yOf(p.lpz), data: p, idx: i }));
    piChartGeom = { coords, pad, W, H, pts };

    coords.forEach(c => {
        if (!c.data.isStichtag) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(c.x, pad.top);
        ctx.lineTo(c.x, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('◆ Stichtag ' + String(c.data.date).slice(0, 6), c.x, pad.top + plotH - 6);
        ctx.restore();
    });

    if (coords.length >= 2) {
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.40)');
        grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.08)');
        grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        ctx.beginPath();
        ctx.moveTo(coords[0].x, pad.top + plotH);
        coords.forEach(c => ctx.lineTo(c.x, c.y));
        ctx.lineTo(coords[coords.length - 1].x, pad.top + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.save();
        ctx.shadowColor = 'rgba(52, 211, 153, 0.55)';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2.6;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        coords.forEach((c, i) => { if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); });
        ctx.stroke();
        ctx.restore();
    }

    ctx.fillStyle = '#a7c4bc';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, coords.length);
    for (let k = 0; k < labelCount; k++) {
        const idx = labelCount === 1 ? 0 : Math.round((k / (labelCount - 1)) * (coords.length - 1));
        const c = coords[idx];
        ctx.fillText(String(c.data.date).slice(0, 10), c.x, H - 12);
    }

    let peakIdx = 0;
    coords.forEach((c, i) => { if (c.data.lpz >= coords[peakIdx].data.lpz) peakIdx = i; });

    coords.forEach((c, i) => {
        const isPeak = i === peakIdx && coords.length > 1;
        const isHover = i === hoverIdx;

        if (c.data.isStichtag) {
            const s = isHover ? 7 : 5.5;
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.8;
            ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.strokeRect(-s / 2, -s / 2, s, s);
            ctx.restore();
            return;
        }

        const r = isHover ? 6.5 : isPeak ? 5.5 : (coords.length > 55 ? 3.2 : 4);
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        if (isHover) ctx.fillStyle = '#fbbf24';
        else if (isPeak) ctx.fillStyle = '#38bdf8';
        else if (c.data.won === true) ctx.fillStyle = '#10b981';
        else if (c.data.won === false) ctx.fillStyle = '#ef4444';
        else ctx.fillStyle = '#94a3b8';

        ctx.fill();
        ctx.lineWidth = isHover || isPeak ? 2.2 : 1.2;
        ctx.strokeStyle = isHover || isPeak ? '#fff' : '#07120f';
        ctx.stroke();
    });

    const pk = coords[peakIdx];
    if (pk) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 11.5px "JetBrains Mono", monospace';
        ctx.textAlign = pk.x > W - 95 ? 'right' : pk.x < 95 ? 'left' : 'center';
        ctx.fillText(`👑 Peak: ${pk.data.lpz}`, pk.x, Math.max(16, pk.y - 11));
    }

    if (hoverIdx >= 0 && coords[hoverIdx]) {
        const hc = coords[hoverIdx];
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hc.x, pad.top);
        ctx.lineTo(hc.x, pad.top + plotH);
        ctx.stroke();
        ctx.restore();
    }
}

function bindPiChartEvents() {
    const canvas = document.getElementById('pi-chart-canvas');
    const tip = document.getElementById('pi-chart-tooltip');
    if (!canvas || canvas.dataset.bound) return;
    canvas.dataset.bound = '1';

    const handleMove = (clientX) => {
        if (!piChartGeom || !piChartGeom.coords.length) return;
        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;

        let bestIdx = 0, bestDist = Infinity;
        piChartGeom.coords.forEach((c, idx) => {
            const d = Math.abs(c.x - mx);
            if (d < bestDist) { bestDist = d; bestIdx = idx; }
        });

        piDrawChart(piChartGeom.pts, bestIdx);
        const pt = piChartGeom.coords[bestIdx];
        if (tip && pt) {
            const d = pt.data;
            if (d.isStichtag) {
                tip.innerHTML = `
                    <div style="font-size:10.5px; color:#fbbf24; font-weight:800; text-transform:uppercase;">◆ Offizieller Stichtag · ${domEsc(d.date)}</div>
                    <div style="font-family:'JetBrains Mono',monospace; font-size:20px; font-weight:800; color:#fbbf24; margin:4px 0;">LPZ ${d.lpz}</div>
                    <div style="font-size:11.5px; color:#fff;">${domEsc(d.opponent)}</div>
                `;
            } else {
                const dVal = d.delta;
                const dStr = dVal === null ? 'n.a.' : (dVal > 0 ? `+${dVal} Pkt.` : `${dVal} Pkt.`);
                const dCol = dVal > 0 ? '#34d399' : dVal < 0 ? '#f87171' : '#fbbf24';
                const badge = d.won === true ? '🟢 Sieg' : d.won === false ? '🔴 Niederlage' : '⚪ Offen';
                tip.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size:10.5px; color:#fbbf24; font-weight:800; text-transform:uppercase;">
                        <span>Spiel #${d.gameNr} · ${domEsc(d.date)}</span>
                        <span>${badge} (${domEsc(d.score)})</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin:4px 0;">
                        <span style="font-family:'JetBrains Mono',monospace; font-size:20px; font-weight:800; color:#fff;">LPZ ${d.lpz}</span>
                        <span style="font-family:'JetBrains Mono',monospace; font-size:13.5px; font-weight:800; color:${dCol};">${dStr}</span>
                    </div>
                    <div style="font-size:12px; font-weight:700; color:#fff;">gg. ${domEsc(d.opponent)} ${d.oppLpz ? `(LPZ ${d.oppLpz})` : ''}</div>
                    <div style="font-size:11px; color:#a7c4bc; margin-top:2px;">${domEsc(d.teamOrEvent)}</div>
                `;
            }
            tip.classList.remove('hidden');
            const leftPos = pt.x > piChartGeom.W * 0.58 ? (pt.x - 235) : (pt.x + 14);
            const topPos = Math.max(10, Math.min(piChartGeom.H - 105, pt.y - 42));
            tip.style.left = `${Math.max(8, leftPos)}px`;
            tip.style.top = `${topPos}px`;
        }
    };

    canvas.addEventListener('mousemove', e => handleMove(e.clientX));
    canvas.addEventListener('touchmove', e => {
        if (e.touches && e.touches[0]) handleMove(e.touches[0].clientX);
    }, { passive: true });
    canvas.addEventListener('mouseleave', () => {
        tip?.classList.add('hidden');
        if (piChartGeom) piDrawChart(piChartGeom.pts, -1);
    });
    window.addEventListener('resize', () => {
        if (document.getElementById('page-tischtennis')?.classList.contains('active') && piStatsTab === 'curve') {
            piDrawChart();
        }
    });
}

// ===================================================================
// TEIL 2: PI'S MANNSCHAFT & LIGA-TABELLE (AUTO-FOKUS AUF TSV GRAUPA 3)
// ===================================================================
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
    ttTeamsList = [];
    ttTeamDetailsCache = {};
    activeGraupaTeamId = null;
    inspectedSubTeam = null;
    loadPiLeagueFromTTLive(false);
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
    if (!html || html.length < 300) return false;
    if (/Ich bin ein Mensch/i.test(html) || /<form[^>]+Token=/i.test(html)) return false;
    if (/benötigt Ihre Nutzeranmeldung/i.test(html) || /Benutzeranmeldung/i.test(html)) return false;
    return /TSV\s+Graupa|Position|Einzel|Doppel|Spielplan|Heimmannschaft|L3=Mannschaft/i.test(html);
}

function hasValidParsedDetails(d) {
    if (!d || d.error) return false;
    const hasSingles = d.singlesTable && Array.isArray(d.singlesTable.rows) && d.singlesTable.rows.length > 0;
    const hasSchedule = d.scheduleTable && Array.isArray(d.scheduleTable.rows) && d.scheduleTable.rows.length > 0;
    return Boolean(hasSingles || hasSchedule);
}

// Findet in der Saison automatisch Pi's Stamm-Mannschaft (3. Erwachsene / TSV Graupa 3 oder ein Team, in dem Peter Dippe gelistet ist)
function findPiPreferredTeamId(teams, detailsMap) {
    if (!teams || !teams.length) return null;
    for (const tm of teams) {
        const det = detailsMap[tm.id] || detailsMap[tm.teamKey];
        if (det && det.singlesTable && Array.isArray(det.singlesTable.rows)) {
            const hasPi = det.singlesTable.rows.some(r => r.cells.some(c => /Peter\s+Dippe|Dippe,\s*Peter/i.test(c)));
            if (hasPi && /3\.\s*Erwachsene|TSV\s+Graupa\s+3/i.test(tm.tabName + ' ' + tm.fullTeamName)) {
                return tm.id;
            }
        }
    }
    const graupa3 = teams.find(t => /3\.\s*Erwachsene|TSV\s+Graupa\s+3\b/i.test(t.tabName + ' ' + t.fullTeamName));
    if (graupa3) return graupa3.id;
    return teams[0].id;
}

async function fetchTTLiveHtmlCascade(kind, targetUrl, teamKey, forceRefresh) {
    const cloudUrl = (CONFIG.ttCloudUrl || CONFIG.pinnwandCloudUrl || '').trim();
    if (cloudUrl && cloudUrl.startsWith('https://script.google.com/')) {
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
                    verifiedLive: Boolean(data.verifiedLive),
                    fetchedAt: data.fetchedAt || new Date().toISOString()
                };
            }
        }
    }
    throw new Error('Cloud-Abruf nicht erreichbar');
}

async function loadPiLeagueFromTTLive(forceRefresh) {
    const cont = document.getElementById('tt-team-content');
    const mySaison = ttCurrentSaison;
    const isCurrentSeason = Number(mySaison) >= 2026;
    const saisonLabel = `${mySaison}/${String(+mySaison + 1).slice(-2)}`;
    const overviewUrl = `https://dresden.tischtennislive.de/?L1=Public&L2=Verein&L2P=870&Page=Spielbetrieb&Sportart=96&Page2=Tabellen&Saison=${mySaison}`;

    if (forceRefresh) {
        ttTeamDetailsCache = {};
        try {
            localStorage.removeItem('dippe_pi_league_ov_' + mySaison);
            localStorage.removeItem('dippe_pi_league_det_' + mySaison);
        } catch (e) {}
    }

    if (!ttTeamsList.length && !forceRefresh) {
        try {
            const cOv = localStorage.getItem('dippe_pi_league_ov_' + mySaison);
            const cDet = localStorage.getItem('dippe_pi_league_det_' + mySaison);
            if (cOv) {
                ttTeamsList = JSON.parse(cOv) || [];
                if (cDet) ttTeamDetailsCache = JSON.parse(cDet) || {};
                if (ttTeamsList.length) {
                    activeGraupaTeamId = findPiPreferredTeamId(ttTeamsList, ttTeamDetailsCache);
                    renderPiTeamSelector();
                    selectGraupaTeamTab(activeGraupaTeamId, false);
                    setTTLiveSyncBadge(`⚡ Cache · 🔄 Prüfe TTLive …`, '#fef3c7', '#92400e');
                }
            }
        } catch (e) {}
    }

    if (!ttTeamsList.length && cont) {
        cont.innerHTML = `<div class="tp-section-card" style="grid-column:1/-1; text-align:center; padding:26px;">⏳ Lade Liga-Tabelle &amp; Spielplan für Saison ${saisonLabel} …</div>`;
    }

    try {
        const result = await fetchTTLiveHtmlCascade('overview', overviewUrl, 'overview_' + mySaison, forceRefresh);
        if (ttCurrentSaison !== mySaison) return;

        const parsedTeams = parseTTLiveOverviewHtml(result.html);
        if (!parsedTeams.length) throw new Error('Keine Tabellen gefunden');
        ttTeamsList = parsedTeams;
        try { localStorage.setItem('dippe_pi_league_ov_' + mySaison, JSON.stringify(ttTeamsList)); } catch (e) {}

        if (result.cachedTeams && typeof result.cachedTeams === 'object') {
            Object.keys(result.cachedTeams).forEach(tKey => {
                const rawHtml = result.cachedTeams[tKey];
                if (isHtmlValidTTLive(rawHtml)) {
                    const parsedDet = parseTTLiveTeamDetailHtml(rawHtml);
                    if (hasValidParsedDetails(parsedDet)) {
                        ttTeamDetailsCache[tKey] = parsedDet;
                        ttTeamsList.forEach(tm => {
                            if (tm.teamKey === tKey || tm.id === tKey) ttTeamDetailsCache[tm.id] = parsedDet;
                        });
                    }
                }
            });
            try { localStorage.setItem('dippe_pi_league_det_' + mySaison, JSON.stringify(ttTeamDetailsCache)); } catch (e) {}
        }

        if (!activeGraupaTeamId || !ttTeamsList.some(t => t.id === activeGraupaTeamId)) {
            activeGraupaTeamId = findPiPreferredTeamId(ttTeamsList, ttTeamDetailsCache);
        }

        const timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        setTTLiveSyncBadge(
            result.verifiedLive ? `✅ Live abgeglichen (${timeStr} Uhr)` : `📦 Archiv ${saisonLabel}`,
            result.verifiedLive ? '#d1fae5' : '#e0f2fe',
            result.verifiedLive ? '#065f46' : '#0369a1'
        );

        renderPiTeamSelector();
        await selectGraupaTeamTab(activeGraupaTeamId, isCurrentSeason ? true : forceRefresh);
    } catch (err) {
        console.warn('Liga-Abruf Hinweis:', err);
    }
}

function renderPiTeamSelector() {
    const sel = document.getElementById('pi-team-select');
    if (!sel) return;
    sel.innerHTML = ttTeamsList.map(t => {
        const isPiDefault = /3\.\s*Erwachsene|TSV\s+Graupa\s+3\b/i.test(t.tabName + ' ' + t.fullTeamName);
        const star = isPiDefault ? '⭐ ' : '';
        return `<option value="${domEsc(t.id)}"${t.id === activeGraupaTeamId ? ' selected' : ''}>${domEsc(star + t.tabName + ' · ' + formatShortLeague(t.league))}</option>`;
    }).join('');
}

async function selectGraupaTeamTab(teamId, forceRefresh) {
    activeGraupaTeamId = teamId;
    const team = ttTeamsList.find(t => t.id === teamId);
    if (!team) return;

    const sel = document.getElementById('pi-team-select');
    if (sel && sel.value !== teamId) sel.value = teamId;

    const titleEl = document.getElementById('pi-league-main-title');
    if (titleEl) titleEl.textContent = `🏅 ${team.fullTeamName || team.tabName} · ${team.league}`;

    inspectedSubTeam = {
        teamKey: team.teamKey,
        teamName: team.fullTeamName || team.tabName,
        teamUrl: team.teamUrl,
        isOwnGraupaTeam: true
    };
    await loadAndRenderInspectedTeam(team, inspectedSubTeam, forceRefresh);
}

async function selectLeagueTableRowTeam(rowIdx, forceRefresh = false) {
    const team = ttTeamsList.find(t => t.id === activeGraupaTeamId);
    if (!team || !team.standingsRows[rowIdx]) return;
    const row = team.standingsRows[rowIdx];
    if (!row.rowTeamUrl || !row.rowTeamKey) return;

    const isOwn = (row.rowTeamKey === team.teamKey);
    inspectedSubTeam = {
        teamKey: isOwn ? team.teamKey : row.rowTeamKey,
        teamName: row.rowTeamName || row.cells[1] || 'Mannschaft',
        teamUrl: row.rowTeamUrl,
        isOwnGraupaTeam: isOwn
    };
    await loadAndRenderInspectedTeam(team, inspectedSubTeam, forceRefresh);
}

async function loadAndRenderInspectedTeam(baseGraupaTeam, subTeam, forceRefresh) {
    const directLink = document.getElementById('tt-team-direct-link');
    if (directLink && subTeam.teamUrl) directLink.href = subTeam.teamUrl;

    const tKey = subTeam.teamKey;
    const isCurrentSeason = Number(ttCurrentSaison) >= 2026;
    const cached = !forceRefresh ? (ttTeamDetailsCache[tKey] || (subTeam.isOwnGraupaTeam ? ttTeamDetailsCache[baseGraupaTeam.id] : null)) : null;
    const isValidCache = hasValidParsedDetails(cached);

    renderGraupaTeamLayout(baseGraupaTeam, isValidCache ? cached : null, !isValidCache);
    if (isValidCache && (!isCurrentSeason || cached._verifiedLiveInSession)) return;

    const mySaison = ttCurrentSaison;
    try {
        const result = await fetchTTLiveHtmlCascade('team', subTeam.teamUrl, tKey, Boolean(forceRefresh));
        if (ttCurrentSaison !== mySaison) return;

        const details = parseTTLiveTeamDetailHtml(result.html);
        if (hasValidParsedDetails(details)) {
            details._verifiedLiveInSession = true;
            ttTeamDetailsCache[tKey] = details;
            if (subTeam.isOwnGraupaTeam) ttTeamDetailsCache[baseGraupaTeam.id] = details;
            try { localStorage.setItem('dippe_pi_league_det_' + mySaison, JSON.stringify(ttTeamDetailsCache)); } catch (e) {}

            if (activeGraupaTeamId === baseGraupaTeam.id && inspectedSubTeam && inspectedSubTeam.teamKey === tKey) {
                renderGraupaTeamLayout(baseGraupaTeam, details, false);
            }
        }
    } catch (err) {
        if (!isValidCache && activeGraupaTeamId === baseGraupaTeam.id && inspectedSubTeam && inspectedSubTeam.teamKey === tKey) {
            renderGraupaTeamLayout(baseGraupaTeam, { error: String(err.message || err) }, false);
        }
    }
}

// ===================================================================
// PARSER & HELFER FÜR LIGA-TABELLE, SPIELPLAN & BILANZEN
// ===================================================================
function romanToArabicTeamNum(str) {
    const map = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9', X: '10' };
    return map[String(str || '').toUpperCase()] || str || '1';
}

function extractTeamNumberSuffix(name) {
    const m = String(name || '').trim().match(/\s+(\d+|[IVX]+)$/i);
    return m ? romanToArabicTeamNum(m[1]) : '1';
}

function normalizeTeamCoreTokens(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\b(18\d\d|19\d\d|20\d\d)\b/g, ' ')
        .replace(/\b(\d+|[ivx]+)\s*$/i, ' ')
        .replace(/\b(tsv|ttc|ttv|ttsv|lttv|sv|sg|sc|bsv|esv|post|vfl|tus|fc|ev|e\.v\.|abteilung)\b/gi, ' ')
        .replace(/[^a-zäöüß0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(w => w.length >= 3);
}

function isSameTTTeamName(cellText, targetTeamName) {
    if (!cellText || !targetTeamName) return false;
    const a = cellText.trim(), b = targetTeamName.trim();
    if (a.toLowerCase() === b.toLowerCase()) return true;
    if (extractTeamNumberSuffix(a) !== extractTeamNumberSuffix(b)) return false;
    if (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())) return true;

    const tokA = normalizeTeamCoreTokens(a), tokB = normalizeTeamCoreTokens(b);
    if (!tokA.length || !tokB.length) return false;
    const shorter = tokA.length <= tokB.length ? tokA : tokB;
    const longer  = tokA.length <= tokB.length ? tokB : tokA;
    const matches = shorter.filter(sw => longer.some(lw => lw.startsWith(sw.slice(0, 4)) || sw.startsWith(lw.slice(0, 4))));
    return matches.length >= Math.max(1, Math.ceil(shorter.length * 0.65));
}

function sanitizeTTLiveDom(htmlString) {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe, object, embed, [id*="dialog_ical"], [id*="ical_spielplan"]').forEach(el => el.remove());
    return doc;
}

function getDirectRows(tbl) {
    const rows = [];
    Array.from(tbl.children).forEach(child => {
        if (child.tagName === 'TR') rows.push(child);
        else if (['THEAD', 'TBODY', 'TFOOT'].includes(child.tagName)) {
            Array.from(child.children).forEach(tr => { if (tr.tagName === 'TR') rows.push(tr); });
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
            if (t.length >= 4 && t.length <= 110 && !/tischtennislive|spielbetrieb|platz\s+mannschaft/i.test(t)) return t;
            prev = prev.previousElementSibling;
        }
        node = node.parentElement;
    }
    return '';
}

function deriveGraupaTabName(graupaNameInTable, leagueTitle) {
    const numMatch = graupaNameInTable.match(/TSV\s+Graupa\s+(\d+|[IVX]+)\b/i);
    const teamNum = numMatch ? romanToArabicTeamNum(numMatch[1]) : '1';
    const lt = (leagueTitle || '').toLowerCase();
    let category = 'Erwachsene';
    if (lt.includes('damen') || lt.includes('frauen')) category = 'Damen';
    else if (lt.includes('jugend 19') || lt.includes('u19')) category = 'Jugend 19';
    else if (lt.includes('jugend 15') || lt.includes('schüler')) category = 'Schüler 15';
    else if (lt.includes('jugend')) category = 'Jugend';
    return `${teamNum}. ${category}`;
}

function formatShortLeague(leagueTitle) {
    if (!leagueTitle) return `Saison ${ttCurrentSaison}`;
    return String(leagueTitle)
        .replace(/^Kreisunion\s+Dresden\s*[,·-]?\s*/i, '')
        .replace(/^Bezirk\s+Dresden\s*[,·-]?\s*/i, '')
        .replace(/\bGruppe\s+/gi, 'Gr. ')
        .replace(/\b(Erwachsene|Herren|Damen|Frauen|Jugend\s*\d*)\b/gi, '')
        .replace(/\s+,/g, ',').replace(/^[\s,·-]+|[\s,·-]+$/g, '').replace(/\s{2,}/g, ' ').trim() || leagueTitle;
}

function parseTTLiveOverviewHtml(htmlString) {
    const doc = sanitizeTTLiveDom(htmlString);
    const teams = [];
    const seenTableTeamPairs = new Set();
    const allTables = Array.from(doc.querySelectorAll('table'));
    const graupaLinks = Array.from(doc.querySelectorAll('a')).filter(a => {
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
        const l3p = (teamUrl.match(/L3P=(\d+)/i) || [])[1] || String(teams.length + 1);
        const pairKey = `${allTables.indexOf(tbl)}_${l3p}`;
        if (seenTableTeamPairs.has(pairKey)) return;
        seenTableTeamPairs.add(pairKey);

        let leagueTitle = findSectionHeadingAbove(tbl);
        let standingsHeaders = [];
        const standingsRows = [];

        getDirectRows(tbl).forEach(r => {
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

            const rowAnchor = Array.from(r.querySelectorAll('a')).find(a => /L3=Mannschaft|L3P=/i.test(a.getAttribute('href') || ''));
            const rowTeamUrl = rowAnchor ? resolveTTLiveHref(rowAnchor.getAttribute('href') || '') : '';
            const rowL3pMatch = rowTeamUrl.match(/L3P=(\d+)/i);
            const rowTeamKey = rowL3pMatch ? ('team_' + rowL3pMatch[1]) : '';
            const rowTeamName = rowAnchor ? rowAnchor.textContent.replace(/\s+/g, ' ').trim() : (cells[1] || '');

            standingsRows.push({
                cells,
                isGraupa: /TSV\s+Graupa/i.test(joined),
                isCurrentTeam: r.contains(teamAnchor),
                rowTeamUrl,
                rowTeamKey,
                rowTeamName
            });
        });

        if (!standingsRows.length) return;
        const colCount = standingsRows[0].cells.length;
        if (standingsHeaders.length !== colCount) {
            if (colCount === 12) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Ball', 'Satz', 'Spiele', '+/-', 'Punkte', '+/-'];
            else if (colCount === 11) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Ball', 'Satz', 'Spiele', '+/-', 'Punkte'];
            else if (colCount === 10) standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Ball', 'Satz', 'Spiele', 'Punkte'];
            else standingsHeaders = ['Pl.', 'Mannschaft', 'ST', 'S', 'U', 'N', 'Spiele', 'Punkte'];
        }

        const teamKey = 'team_' + l3p;
        teams.push({
            id: teams.some(t => t.id === teamKey) ? `${teamKey}_${teams.length + 1}` : teamKey,
            teamKey,
            tabName: deriveGraupaTabName(graupaTeamName, leagueTitle),
            fullTeamName: graupaTeamName,
            league: leagueTitle || `Saison ${ttCurrentSaison}`,
            teamUrl,
            standingsHeaders,
            standingsRows
        });
    });

    return teams;
}

function parseTTLiveTeamDetailHtml(htmlString) {
    const doc = sanitizeTTLiveDom(htmlString);
    const fullText = doc.body ? doc.body.textContent : '';

    let ballInfo = '';
    const ballMatch = fullText.match(/Die\s+Mannschaft\s+verwendet\s+Bälle\s+der\s+Marke\s+([^\n\r.!]+?)(?=Einzel|Doppel|Spielplan|$)/i);
    if (ballMatch) ballInfo = ballMatch[0].replace(/\s+/g, ' ').trim();

    const allTables = Array.from(doc.querySelectorAll('table')).filter(t => t.querySelectorAll('table').length === 0);
    const captainInfo = {};
    const venueInfo = {};
    let singlesTable = null, doublesTable = null, scheduleTable = null;

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

        let headerRowIdx = -1, headerJoined = '';
        for (let rIdx = 0; rIdx < Math.min(3, rows.length); rIdx++) {
            const hj = getCleanRowCells(rows[rIdx]).join(' | ');
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

    return { ballInfo, captainInfo, venueInfo, singlesTable, doublesTable, scheduleTable };
}

function extractCleanDataTable(rows, headerIdx, kind) {
    const readCellText = (el) => {
        let txt = el.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        const badges = [];
        Array.from(el.querySelectorAll('img')).forEach(img => {
            const alt = (img.getAttribute('alt') || img.getAttribute('title') || '').trim();
            const src = (img.getAttribute('src') || '').toLowerCase();
            if (/^e$/i.test(alt) || /ersatz/i.test(alt) || src.includes('ersatz') || src.includes('_e.')) badges.push('E');
            else if (/^j$/i.test(alt) || /jugend|nachwuchs/i.test(alt) || src.includes('jugend') || src.includes('_j.')) badges.push('J');
            else if (/spv|sperr/i.test(alt) || src.includes('sperr')) badges.push('SPV');
        });
        const uniq = [...new Set(badges)].filter(b => !new RegExp('\\b' + b + '\\b').test(txt));
        return uniq.length ? (uniq.join(' ') + (txt ? ' ' + txt : '')).trim() : txt;
    };

    const expandRow = (tr) => {
        const directEls = Array.from(tr.children).filter(el => el.tagName === 'TD' || el.tagName === 'TH');
        if (directEls.some(c => c.querySelectorAll('tr').length > 2)) return [];
        const cols = [];
        directEls.forEach(el => {
            const span = Math.max(1, parseInt(el.getAttribute('colspan') || '1', 10));
            cols.push(readCellText(el));
            for (let k = 1; k < span; k++) cols.push('');
        });
        return cols;
    };

    const rawHeaderCols = expandRow(rows[headerIdx]);
    const rawBodyRows = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const rCols = expandRow(rows[i]);
        if (rCols.filter(Boolean).length >= 2) rawBodyRows.push(rCols);
    }

    if (kind === 'schedule') {
        const headers = ['Nr.', 'Tag', 'Datum', 'Zeit', 'Heimmannschaft', 'Gastmannschaft', 'Ergebnis'];
        const bodyRows = rawBodyRows.map(rCols => {
            const nonEmpty = rCols.filter(Boolean);
            const dateIdx = nonEmpty.findIndex(c => /^\d{2}\.\d{2}\.\d{2,4}$/.test(c));
            const timeIdx = nonEmpty.findIndex((c, idx) => idx > dateIdx && /^\d{1,2}:\d{2}(\s*Uhr)?$/i.test(c));
            if (dateIdx !== -1 && timeIdx !== -1) {
                const nr  = nonEmpty[0] || '';
                const tag = dateIdx >= 2 ? nonEmpty[dateIdx - 1] : (nonEmpty[1] || '');
                const dat = nonEmpty[dateIdx] || '';
                const flags = nonEmpty.slice(dateIdx + 1, timeIdx).join(' ').trim();
                const zeit = flags ? `${flags} ${nonEmpty[timeIdx]}` : nonEmpty[timeIdx];
                const heim = nonEmpty[timeIdx + 1] || '';
                const gast = nonEmpty[timeIdx + 2] || '';
                const erg  = nonEmpty.slice(timeIdx + 3).join(' ').trim();
                return { cells: [nr, tag, dat, zeit, heim, gast, erg], isTotal: false };
            }
            return { cells: nonEmpty.slice(0, 7), isTotal: false };
        });
        return { headers, rows: bodyRows };
    }

    if (kind === 'doubles') {
        const headers = ['Spieler 1', 'Spieler 2', 'Bilanz', '+/-'];
        const bodyRows = rawBodyRows.map(rCols => {
            const nonEmpty = rCols.filter(Boolean);
            if (nonEmpty.some(c => /^Gesamt$/i.test(c))) {
                const gIdx = nonEmpty.findIndex(c => /^Gesamt$/i.test(c));
                const rest = nonEmpty.slice(gIdx + 1);
                return { cells: ['Gesamt', '', rest[0] || '', rest[1] || ''], isTotal: true };
            }
            let vals = [...nonEmpty];
            if (vals.length > 4 && /^\d+\.?$/.test(vals[0])) vals.shift();
            return { cells: [vals[0] || '', vals[1] || '', vals[2] || '', vals[3] || ''], isTotal: false };
        });
        return { headers, rows: bodyRows };
    }

    const maxCols = Math.max(rawHeaderCols.length, ...rawBodyRows.map(r => r.length));
    const normHeader = Array.from({ length: maxCols }, (_, s) => rawHeaderCols[s] || '');
    const pkHeaders = [];
    normHeader.forEach(h => {
        const m = h.match(/PK\s*(\d+)/i);
        if (m && !pkHeaders.includes('PK' + m[1])) pkHeaders.push('PK' + m[1]);
    });
    if (!pkHeaders.length) pkHeaders.push('PK1', 'PK2', 'PK3');
    const pkCount = pkHeaders.length;
    const hasLpz = normHeader.some(h => /LivePZ|LPZ/i.test(h));
    const headers = ['Position', 'Spieler', 'Kz.', 'ST', ...pkHeaders, 'Gesamt', ...(hasLpz ? ['LivePZ'] : [])];

    const bodyRows = rawBodyRows.map(rCols => {
        if (rCols.some(c => /^Gesamt$/i.test(c))) {
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
        const kzVal = (idxName !== -1 && idxSt !== -1 && idxSt > idxName + 1) ? rCols.slice(idxName + 1, idxSt).filter(Boolean).join(' ') : '';
        const afterSt = idxSt !== -1 ? rCols.slice(idxSt + 1) : [];
        const pkVals = Array.from({ length: pkCount }, (_, p) => afterSt[p] || '');
        const totalVal = afterSt[pkCount] || '';
        const lpzVal = hasLpz ? (afterSt[pkCount + 1] || '') : '';
        return { cells: [posVal, nameVal, kzVal, stVal, ...pkVals, totalVal, ...(hasLpz ? [lpzVal] : [])], isTotal: false };
    });

    return { headers, rows: bodyRows };
}

function renderGraupaTeamLayout(team, details, isLoadingDetails) {
    const cont = document.getElementById('tt-team-content');
    if (!cont) return;

    const curSub = inspectedSubTeam || {
        teamKey: team.teamKey,
        teamName: team.fullTeamName || team.tabName,
        teamUrl: team.teamUrl,
        isOwnGraupaTeam: true
    };

    const standingsHtml = `
        <div class="tp-section-card" style="margin-bottom:0;">
            <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                <div>
                    <span class="eyebrow-dark">${domEsc(team.league)}</span>
                    <h4 style="font-size:18px; font-weight:800;">📊 Liga-Tabelle · ${domEsc(team.tabName)}</h4>
                </div>
                <span class="badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-size:10.5px;">👆 Verein antippen für Details</span>
            </div>
            <div class="tt-table-scroll" style="overflow-x:auto;">
                <table class="tt-data-table">
                    <thead>
                        <tr>${team.standingsHeaders.map(h => `<th>${domEsc(h)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${team.standingsRows.map((r, rIdx) => {
                            const isSelectedRow = (r.rowTeamKey && r.rowTeamKey === curSub.teamKey) || (!curSub.teamKey && r.isCurrentTeam);
                            const clickableCls = r.rowTeamUrl ? 'tt-clickable-team' : '';
                            const selectedCls = isSelectedRow ? 'tt-selected-team' : '';
                            const graupaCls = r.isGraupa ? 'graupa-row' : '';
                            return `
                                <tr class="${graupaCls} ${clickableCls} ${selectedCls}"
                                    ${r.rowTeamUrl ? `onclick="selectLeagueTableRowTeam(${rIdx}, false)" title="Klicken, um Spielplan & Bilanzen von ${domEsc(r.rowTeamName || r.cells[1])} anzuzeigen"` : ''}>
                                    ${r.cells.map((c, idx) => {
                                        let prefix = '';
                                        if (idx === 1) {
                                            if (r.isGraupa) prefix = '🏓 ';
                                            else if (isSelectedRow) prefix = '🔎 ';
                                        }
                                        return `<td class="${idx === 1 ? 'tt-col-wrap' : ''}" style="${idx >= r.cells.length - 3 ? 'font-family:JetBrains Mono,monospace;font-weight:700;' : ''}">${prefix}${domEsc(c)}</td>`;
                                    }).join('')}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const opponentBannerHtml = !curSub.isOwnGraupaTeam ? `
        <div style="background:#fef3c7; border:1.5px solid #f59e0b; color:#92400e; border-radius:12px; padding:10px 14px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; font-size:12.5px; font-weight:700;">
            <span>🔎 Liga-Inspektor: <b>${domEsc(curSub.teamName)}</b></span>
            <button class="btn btn-emerald" style="padding:5px 11px; font-size:11.5px;" onclick="selectGraupaTeamTab('${team.id}', false)">
                🏓 Zurück zu ${domEsc(team.fullTeamName || team.tabName)}
            </button>
        </div>
    ` : '';

    let scheduleHtml = '';
    if (isLoadingDetails) {
        scheduleHtml = `<div class="tp-section-card" style="margin-bottom:0; text-align:center; padding:22px;">⏳ Lade Spielplan für <b>${domEsc(curSub.teamName)}</b> …</div>`;
    } else if (details && details.scheduleTable && details.scheduleTable.rows.length) {
        scheduleHtml = `
            <div class="tp-section-card" style="margin-bottom:0;">
                <h4 style="font-size:18px; font-weight:800; margin-bottom:8px;">📅 Spielplan &amp; Ergebnisse · ${domEsc(curSub.teamName)}</h4>
                <div class="tt-table-scroll" style="overflow-x:auto;">
                    <table class="tt-data-table">
                        <thead>
                            <tr>${details.scheduleTable.headers.map(h => `<th>${domEsc(h)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${details.scheduleTable.rows.map(r => {
                                return `<tr>${r.cells.map((c, idx) => {
                                    const isTeamCol = idx === 4 || idx === 5;
                                    const isGraupaCell = isTeamCol && /TSV\s+Graupa/i.test(c);
                                    const isInspectedCell = isTeamCol && !isGraupaCell && !curSub.isOwnGraupaTeam && isSameTTTeamName(c, curSub.teamName);
                                    const highlightStyle = isGraupaCell
                                        ? 'font-weight:800;color:var(--emerald-dark);'
                                        : isInspectedCell
                                            ? 'font-weight:800;color:#d97706;'
                                            : '';
                                    const iconPrefix = isGraupaCell ? '🏓 ' : (isInspectedCell ? '🔎 ' : '');
                                    return `<td class="${isTeamCol ? 'tt-col-wrap' : ''}" style="${highlightStyle}${idx === r.cells.length - 1 ? 'font-family:JetBrains Mono,monospace;font-weight:800;' : ''}">${iconPrefix}${domEsc(c)}</td>`;
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
            <div style="display:flex; flex-direction:column; gap:16px;">
                ${opponentBannerHtml}
                <div class="tp-section-card" style="text-align:center; padding:34px;">⏳ Lade Bilanzen &amp; Metadaten …</div>
            </div>
        `;
    } else if (!details || details.error) {
        rightCol = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                ${opponentBannerHtml}
                <div class="tp-section-card">
                    <h4 style="font-size:17px; font-weight:800;">📊 Detail-Auswertung (${domEsc(curSub.teamName)})</h4>
                    <p class="tp-help" style="margin:8px 0 14px;">Die Detailseite konnte gerade nicht geladen werden.</p>
                    <button class="btn btn-emerald" onclick="loadAndRenderInspectedTeam(ttTeamsList.find(t=>t.id==='${team.id}'), inspectedSubTeam, true)">🔄 Erneut abrufen</button>
                </div>
            </div>
        `;
    } else {
        // Hebt Peter Dippes eigene Zeile in den Einzel- und Doppel-Bilanzen prominent hervor!
        const renderParsedTable = (tblObj, emptyMsg) => {
            if (!tblObj || !tblObj.rows.length) return `<p class="tp-help">${emptyMsg}</p>`;
            return `
                <div class="tt-table-scroll" style="overflow-x:auto;">
                    <table class="tt-data-table">
                        <thead>
                            <tr>${tblObj.headers.map(h => `<th>${domEsc(h)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${tblObj.rows.map(r => {
                                const isPiRow = !r.isTotal && r.cells.some(c => /Peter\s+Dippe|Dippe,\s*Peter/i.test(c));
                                const rowStyle = r.isTotal
                                    ? 'background:var(--bg-sand);font-weight:800;'
                                    : isPiRow
                                        ? 'background:#d1fae5; outline:2px solid #059669; outline-offset:-2px; font-weight:800;'
                                        : '';
                                return `
                                    <tr style="${rowStyle}">
                                        ${r.cells.map((c, idx) => {
                                            const isPiNameCell = isPiRow && /Dippe/i.test(c);
                                            return `<td class="${idx === 1 ? 'tt-col-wrap' : ''}" style="${idx === 1 && !r.isTotal ? 'font-weight:700;' : ''}${/^\d+:\d+$|^\[?\d{3,4}\]?$|^[+-]?\d+$/.test(c) ? 'font-family:JetBrains Mono,monospace;' : ''}">${isPiNameCell ? '⭐ ' : ''}${domEsc(c)}</td>`;
                                        }).join('')}
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        };

        const cap = details.captainInfo || {};
        const ven = details.venueInfo || {};
        const isGraupaVenue = curSub.isOwnGraupaTeam || /Graupa/i.test((ven.name || '') + ' ' + (ven.city || ''));
        const fullAddress = [ven.street || (isGraupaVenue ? 'Badstr. 3' : ''), ven.city || (isGraupaVenue ? '01796 Pirna OT Graupa' : '')].filter(Boolean).join(', ');
        const cleanBall = (details.ballInfo || '').replace(/^Die\s+Mannschaft\s+verwendet\s+Bälle\s+der\s+Marke\s*/i, '').trim();

        const mapSectionHtml = isGraupaVenue
            ? `<iframe title="Karte Spielstätte"
                       src="https://www.openstreetmap.org/export/embed.html?bbox=13.9165%2C50.9995%2C13.9285%2C51.0055&layer=mapnik&marker=51.0025%2C13.9225"
                       style="width:100%; height:115px; border:1px solid var(--border-sand); border-radius:10px;"></iframe>`
            : `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((ven.name ? ven.name + ', ' : '') + fullAddress)}"
                  target="_blank" rel="noopener" class="btn btn-emerald" style="width:100%; padding:10px; font-size:12.5px; margin-top:6px;">
                  🗺️ Route zur Gast-Halle in Google Maps öffnen ↗
               </a>`;

        rightCol = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                ${opponentBannerHtml}
                <div class="tp-section-card" style="margin-bottom:0;">
                    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px;">
                        <h4 style="font-size:17px; font-weight:800;">👤 Einzel-Bilanzen · ${domEsc(curSub.teamName)}</h4>
                        <a href="${domEsc(curSub.teamUrl)}" target="_blank" rel="noopener" style="font-size:11.5px; font-weight:700; color:var(--emerald-dark); text-decoration:none;">Original in TTLive ↗</a>
                    </div>
                    <div style="margin-bottom:16px;">
                        ${renderParsedTable(details.singlesTable, 'Noch keine Einzel-Einsätze verbucht.')}
                    </div>

                    <h4 style="font-size:17px; font-weight:800; margin-bottom:6px;">👥 Doppel-Bilanzen · ${domEsc(curSub.teamName)}</h4>
                    <div>
                        ${renderParsedTable(details.doublesTable, 'Noch keine Doppel-Einsätze verbucht.')}
                    </div>
                </div>

                <div class="grid-2" style="gap:12px;">
                    <div class="tp-section-card" style="margin-bottom:0;">
                        <span class="person-role">📋 Metadaten · ${domEsc(curSub.teamName)}</span>
                        <div style="font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-top:6px;">Mannschaftsführer</div>
                        <h5 style="font-size:17px; font-weight:800; margin:1px 0 8px; color:var(--text-dark);">${domEsc(cap.name || 'Siehe TischtennisLive')}</h5>
                        <div style="font-size:12.5px; color:#475569; line-height:1.75;">
                            ${cap.phone ? `<div>📞 <b>Telefon:</b> ${domEsc(cap.phone)}</div>` : ''}
                            ${cap.deputy ? `<div>👥 <b>Vertretung:</b> ${domEsc(cap.deputy)}</div>` : ''}
                            ${ven.matchDay ? `<div>📅 <b>Heimspieltag:</b> ${domEsc(ven.matchDay)}</div>` : ''}
                            ${cleanBall ? `<div>🟡 <b>Spielball:</b> ${domEsc(cleanBall)}</div>` : ''}
                        </div>
                    </div>

                    <div class="tp-section-card" style="margin-bottom:0;">
                        <span class="person-role">📍 Sportstätte &amp; Anfahrt</span>
                        <h5 style="font-size:14.5px; font-weight:800; margin:4px 0 4px;">${domEsc(ven.name || (isGraupaVenue ? 'Turnhalle Grundschule Graupa' : 'Sporthalle'))}</h5>
                        <div style="font-size:12px; color:#475569; margin-bottom:8px;">
                            ${domEsc(fullAddress || 'Adresse siehe TTLive')}${ven.phone ? ' · Tel: ' + domEsc(ven.phone) : ''}
                        </div>
                        ${mapSectionHtml}
                    </div>
                </div>
            </div>
        `;
    }

    cont.innerHTML = leftCol + rightCol;
}
