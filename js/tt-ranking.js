// ===================================================================
// TT-RANKING: VEREINS-RANGLISTE & SPIEL-FÜR-SPIEL LPZ-ENTWICKLUNG (js/tt-ranking.js)
// ===================================================================

let ttrPlayers = [];
let ttrSelectedPlayerId = null;
let ttrCurrentPoints = [];
let ttrCurrentRange = 100;
let ttrInitialized = false;
let ttrBatchRunning = false;
let ttrChartGeom = null;

function initTTRankingIfNeeded() {
    if (!ttrInitialized) {
        ttrInitialized = true;
        bindTTRChartEvents();
        ttrLoadRankingList(false);
    } else {
        ttrDrawChart();
    }
}

function setTTRSyncBadge(text, bg, color) {
    const b = document.getElementById('ttr-sync-badge');
    if (!b) return;
    b.textContent = text;
    if (bg) b.style.background = bg;
    if (color) b.style.color = color;
}

// Filtert vereinsfremde Altlasten (ohne echte Vereins-MID) konsequent aus
function sanitizeGraupaPlayers(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(p => p && p.mid && String(p.id || '').startsWith('mid_')).map(p => {
        if (p.l2p && Number(p.l2p) >= 20000 && Number(p.l2p) <= 22000) {
            p.l2p = '';
            p.resolved = false;
        }
        return p;
    });
}

// -----------------------------------------------------------------
// 1. SPIELERLISTE LADEN & HINTERGRUND-AUFLÖSUNG
// -----------------------------------------------------------------
async function ttrLoadRankingList(forceRefresh) {
    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();

    if (forceRefresh) {
        try { localStorage.removeItem('dippe_ttr_players_v2'); } catch (e) {}
    }

    if (!forceRefresh && !ttrPlayers.length) {
        try {
            const cached = localStorage.getItem('dippe_ttr_players_v2');
            if (cached) {
                const parsed = sanitizeGraupaPlayers(JSON.parse(cached));
                if (parsed.length) {
                    ttrPlayers = parsed;
                    ttrUpdateDropdownAndTable();
                }
            }
        } catch (e) {}
    }

    if (!cloudUrl || !cloudUrl.startsWith('https://script.google.com/')) {
        setTTRSyncBadge('⚠️ Cloud-URL fehlt', '#fee2e2', '#b91c1c');
        return;
    }

    setTTRSyncBadge('⏳ Lade TSV Graupa Spieler …', 'rgba(251,191,36,0.2)', '#fbbf24');
    try {
        const res = await fetch(`${cloudUrl}?kind=tt_ranking_list${forceRefresh ? '&force=1' : ''}&t=${Date.now()}`, { redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.players)) {
            ttrPlayers = sanitizeGraupaPlayers(data.players);
            try { localStorage.setItem('dippe_ttr_players_v2', JSON.stringify(ttrPlayers)); } catch (e) {}
            ttrUpdateDropdownAndTable();

            const withLpz = ttrPlayers.filter(p => p.lpz && p.lpz > 0).length;
            setTTRSyncBadge(`✓ ${ttrPlayers.length} Graupa-Mitglieder (${withLpz} mit LPZ)`, 'rgba(16,185,129,0.2)', '#34d399');

            ttrRunBackgroundBatchResolver();
        }
    } catch (err) {
        console.warn('Fehler beim Laden der TT-Ranking-Liste:', err);
        setTTRSyncBadge('⚠️ Offline / Lokaler Stand', 'rgba(239,68,68,0.2)', '#fca5a5');
    }
}

async function ttrRunBackgroundBatchResolver() {
    if (ttrBatchRunning) return;
    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();
    if (!cloudUrl) return;

    const unresolved = ttrPlayers.filter(p => p.mid && (!p.lpz || !p.l2p) && !p.resolved);
    if (!unresolved.length) {
        document.getElementById('ttr-batch-progress')?.classList.add('hidden');
        return;
    }

    ttrBatchRunning = true;
    const progBox = document.getElementById('ttr-batch-progress');
    const progTxt = document.getElementById('ttr-batch-text');
    const progPct = document.getElementById('ttr-batch-pct');
    const progFill = document.getElementById('ttr-batch-fill');
    if (progBox) progBox.classList.remove('hidden');

    const total = unresolved.length;
    let done = 0;

    for (let i = 0; i < unresolved.length; i += 6) {
        const chunk = unresolved.slice(i, i + 6);
        const midsCsv = chunk.map(p => p.mid).join(',');
        try {
            const res = await fetch(`${cloudUrl}?kind=tt_ranking_batch&mids=${encodeURIComponent(midsCsv)}&t=${Date.now()}`, { redirect: 'follow' });
            if (res.ok) {
                const j = await res.json();
                if (j && j.ok && Array.isArray(j.resolved)) {
                    j.resolved.forEach(upd => {
                        if (!upd || !upd.mid) return;
                        const idx = ttrPlayers.findIndex(p => p.mid === upd.mid);
                        if (idx !== -1) {
                            ttrPlayers[idx] = { ...ttrPlayers[idx], ...upd, resolved: true };
                        }
                    });
                    try { localStorage.setItem('dippe_ttr_players_v2', JSON.stringify(ttrPlayers)); } catch (e) {}
                    ttrUpdateDropdownAndTable(true);
                }
            }
        } catch (e) {}

        done += chunk.length;
        const pct = Math.min(100, Math.round((done / total) * 100));
        if (progTxt) progTxt.textContent = `Ermittle LivePZ-Werte & Spieler-IDs (${done} / ${total} geprüft) …`;
        if (progPct) progPct.textContent = `${pct}%`;
        if (progFill) progFill.style.width = `${pct}%`;
    }

    ttrBatchRunning = false;
    if (progBox) setTimeout(() => progBox.classList.add('hidden'), 1200);
    const withLpz = ttrPlayers.filter(p => p.lpz && p.lpz > 0).length;
    setTTRSyncBadge(`☁️ Synchronisiert · ${ttrPlayers.length} Mitglieder (${withLpz} mit LPZ)`, 'rgba(16,185,129,0.2)', '#34d399');
}

// -----------------------------------------------------------------
// 2. DROPDOWN & VEREINS-TABELLE RENDERN
// -----------------------------------------------------------------
function getRankedPlayersList() {
    const byLpz = [...ttrPlayers].sort((a, b) => (b.lpz || 0) - (a.lpz || 0) || (a.lastName || '').localeCompare(b.lastName || '', 'de'));
    let currentRank = 1;
    byLpz.forEach((p, idx) => {
        if (p.lpz && p.lpz > 0) {
            if (idx > 0 && byLpz[idx - 1].lpz === p.lpz) {
                p._rank = byLpz[idx - 1]._rank;
            } else {
                p._rank = currentRank;
            }
            currentRank++;
        } else {
            p._rank = null;
        }
    });
    return byLpz;
}

function ttrUpdateDropdownAndTable(keepSelection) {
    const ranked = getRankedPlayersList();
    const sel = document.getElementById('ttr-player-select');
    if (sel) {
        const prevVal = keepSelection ? (ttrSelectedPlayerId || sel.value) : sel.value;
        sel.innerHTML = ranked.map(p => {
            const rankStr = p._rank ? `#${p._rank} · ` : '';
            const lpzStr = p.lpz ? ` (LPZ ${p.lpz})` : ' (ohne LPZ)';
            const nameStr = p.lastName && p.firstName ? `${p.lastName}, ${p.firstName}` : (p.displayName || p.id);
            return `<option value="${domEsc(p.id)}">${domEsc(rankStr + nameStr + lpzStr)}</option>`;
        }).join('');

        if (prevVal && ranked.some(p => p.id === prevVal)) {
            sel.value = prevVal;
            ttrSelectedPlayerId = prevVal;
        } else if (ranked.length > 0 && !ttrSelectedPlayerId) {
            // Standardmäßig Peter Dippe (mid_27885) oder Platz #1 vorauswählen
            const piPlayer = ranked.find(p => p.mid === '27885') || ranked[0];
            ttrSelectedPlayerId = piPlayer.id;
            sel.value = ttrSelectedPlayerId;
            ttrSelectPlayer(ttrSelectedPlayerId);
        }
    }
    ttrRenderPlayersTable();
}

function ttrRenderPlayersTable() {
    const tbody = document.getElementById('ttr-players-tbody');
    if (!tbody) return;

    const ranked = getRankedPlayersList();
    const q = (document.getElementById('ttr-search-input')?.value || '').trim().toLowerCase();
    const sortMode = document.getElementById('ttr-sort-select')?.value || 'lpz-desc';

    let filtered = ranked.filter(p => {
        if (!q) return true;
        const hay = `${p.lastName || ''} ${p.firstName || ''} ${p.displayName || ''} ${p.team || ''} ${p.lpz || ''}`.toLowerCase();
        return hay.includes(q);
    });

    filtered.sort((a, b) => {
        if (sortMode === 'lpz-desc') return (b.lpz || -1) - (a.lpz || -1) || (a.lastName || '').localeCompare(b.lastName || '', 'de');
        if (sortMode === 'lpz-asc')  return (a.lpz || 99999) - (b.lpz || 99999) || (a.lastName || '').localeCompare(b.lastName || '', 'de');
        if (sortMode === 'name-asc') return (a.lastName || a.displayName || '').localeCompare(b.lastName || b.displayName || '', 'de');
        if (sortMode === 'team-asc') return (a.team || 'zzz').localeCompare(b.team || 'zzz', 'de') || (b.lpz || 0) - (a.lpz || 0);
        return 0;
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">Keine passenden Vereinsmitglieder gefunden.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const isSel = p.id === ttrSelectedPlayerId;
        const medal = p._rank === 1 ? '🥇 ' : p._rank === 2 ? '🥈 ' : p._rank === 3 ? '🥉 ' : '';
        const rankDisplay = p._rank ? `${medal}#${p._rank}` : '<span style="color:#94a3b8;">–</span>';
        const fullName = (p.lastName && p.firstName) ? `${p.lastName}, ${p.firstName}` : (p.displayName || p.id);
        const lpzDisplay = p.lpz
            ? `<span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:800; color:var(--emerald-dark); background:#ecfdf5; border:1px solid #a7f3d0; padding:3px 9px; border-radius:8px;">${p.lpz}</span>`
            : `<span style="color:#94a3b8; font-size:12px;">${p.resolved ? 'kein LPZ' : '⏳ lädt…'}</span>`;

        const ttliveUrl = p.l2p
            ? `https://dresden.tischtennislive.de/default.aspx?L1=Public&L2=Kontakt&L2P=${p.l2p}${p.mid ? '&MID=' + p.mid : ''}&Page1=Bilanz&SA=96&Page=EntwicklungTTR`
            : `https://dresden.tischtennislive.de/default.aspx?L1=Verwaltung&L2=Verein&L2P=870&L3=Tischtennis&L3P=1740&L4=Mitglieder&Page=Liste&L5=Details&L4P=${p.mid || ''}`;

        return `
            <tr class="${isSel ? 'graupa-row' : ''}" style="cursor:pointer;" onclick="ttrSelectPlayerFromTable('${p.id}')">
                <td style="font-family:'JetBrains Mono',monospace; font-weight:800;">${rankDisplay}</td>
                <td style="font-weight:800; font-size:13.8px;">🏓 ${domEsc(fullName)}</td>
                <td style="color:#475569;">${domEsc(p.team || 'TSV Graupa')}</td>
                <td style="text-align:right;">${lpzDisplay}</td>
                <td style="text-align:center;" onclick="event.stopPropagation();">
                    <button class="btn btn-emerald" style="padding:4px 10px; font-size:11.5px;" onclick="ttrSelectPlayerFromTable('${p.id}')">📈 Spiel-Kurve</button>
                    <a href="${domEsc(ttliveUrl)}" target="_blank" rel="noopener" class="btn btn-sand" style="padding:4px 8px; font-size:11.5px;" title="In TischtennisLive öffnen">↗</a>
                </td>
            </tr>
        `;
    }).join('');
}

function ttrSelectPlayerFromTable(playerId) {
    const sel = document.getElementById('ttr-player-select');
    if (sel) sel.value = playerId;
    ttrSelectPlayer(playerId);
    document.getElementById('page-tt-ranking')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function ttrRefreshSelectedPlayer() {
    if (ttrSelectedPlayerId) ttrSelectPlayer(ttrSelectedPlayerId, true);
}

// -----------------------------------------------------------------
// 3. SPIEL-FÜR-SPIEL LPZ-ENTWICKLUNG ABRUFEN & EXAKT PARSEN
// -----------------------------------------------------------------
async function ttrSelectPlayer(playerId, forceRefresh = false) {
    if (!playerId) return;
    ttrSelectedPlayerId = playerId;
    ttrRenderPlayersTable();

    const ranked = getRankedPlayersList();
    const player = ranked.find(p => p.id === playerId);
    if (!player) return;

    const totalRanked = ranked.filter(x => x.lpz && x.lpz > 0).length;
    document.getElementById('ttr-kpi-current').textContent = player.lpz ? player.lpz.toLocaleString('de-DE') : '…';
    document.getElementById('ttr-kpi-team').textContent = player.team || 'TSV Graupa · Abt. Tischtennis';
    document.getElementById('ttr-kpi-rank').textContent = player._rank ? `#${player._rank}` : '–';
    document.getElementById('ttr-kpi-rank-sub').textContent = player._rank ? `von ${totalRanked} Graupa-Spielern mit LPZ` : 'Noch kein aktiver LPZ-Wert';
    document.getElementById('ttr-chart-title').textContent = `LPZ-Entwicklung von Spiel zu Spiel · ${player.displayName || player.lastName}`;

    const directLink = document.getElementById('ttr-direct-link');
    if (directLink) {
        directLink.href = player.l2p
            ? `https://dresden.tischtennislive.de/default.aspx?L1=Public&L2=Kontakt&L2P=${player.l2p}${player.mid ? '&MID=' + player.mid : ''}&Page1=Bilanz&SA=96&Page=EntwicklungTTR`
            : `https://dresden.tischtennislive.de/default.aspx?L1=Verwaltung&L2=Verein&L2P=870&L3=Tischtennis&L3P=1740&L4=Mitglieder&Page=Liste&L5=Details&L4P=${player.mid || ''}`;
    }

    const localKey = 'dippe_ttr_matchhist_v2_' + playerId;
    if (!forceRefresh) {
        try {
            const localHist = localStorage.getItem(localKey);
            if (localHist) {
                const parsed = JSON.parse(localHist);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    ttrApplyChartPoints(player, parsed);
                    return;
                }
            }
        } catch (e) {}
    }

    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();
    if (!cloudUrl) return;

    setTTRSyncBadge(`⏳ Lade 100-Spiele-Historie für ${player.displayName || player.lastName} …`, 'rgba(251,191,36,0.2)', '#fbbf24');
    try {
        const url = `${cloudUrl}?kind=tt_player_lpz&mid=${encodeURIComponent(player.mid || '')}&l2p=${encodeURIComponent(player.l2p || '')}${forceRefresh ? '&force=1' : ''}&t=${Date.now()}`;
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        if (data && data.ok) {
            if (data.player) {
                Object.assign(player, data.player);
                if (directLink && player.l2p) {
                    directLink.href = `https://dresden.tischtennislive.de/default.aspx?L1=Public&L2=Kontakt&L2P=${player.l2p}${player.mid ? '&MID=' + player.mid : ''}&Page1=Bilanz&SA=96&Page=EntwicklungTTR`;
                }
            }
            const points = parseTTLiveEntwicklungHtml(data.entwHtml || '', data.bilanzHtml || '', player);
            if (points.length > 0) {
                const lastGame = [...points].reverse().find(p => p.lpz);
                if (lastGame && !player.lpz) player.lpz = lastGame.lpz;
                try { localStorage.setItem(localKey, JSON.stringify(points)); } catch (e) {}
                try { localStorage.setItem('dippe_ttr_players_v2', JSON.stringify(ttrPlayers)); } catch (e) {}
            }
            ttrUpdateDropdownAndTable(true);
            ttrApplyChartPoints(player, points);
            const matchCount = points.filter(p => !p.isStichtag).length;
            setTTRSyncBadge(`✓ ${matchCount} Einzelspiele geladen`, 'rgba(16,185,129,0.2)', '#34d399');
        } else {
            ttrApplyChartPoints(player, []);
            setTTRSyncBadge('⚠️ Keine LPZ-Spiele gefunden', 'rgba(251,191,36,0.2)', '#fbbf24');
        }
    } catch (err) {
        console.warn('Fehler beim Abruf der LPZ-Entwicklung:', err);
        ttrApplyChartPoints(player, []);
    }
}

/**
 * Parst die exakte Einzelspiel-Tabelle (ID="Match1" bis ID="Match100") aus Page=EntwicklungTTR!
 * Berechnet für JEDES einzelne Spiel den genauen LPZ-Wert nach dem Spiel und markiert
 * offizielle Q-TTR-Abgleiche/Stichtage separat als goldene Meilensteine (isStichtag = true).
 */
function parseTTLiveEntwicklungHtml(entwHtml, bilanzHtml, player) {
    const doc = new DOMParser().parseFromString(entwHtml || '', 'text/html');
    const matchRows = Array.from(doc.querySelectorAll('tr[id^="Match"]'));
    const rawEvents = [];
    let lastSeenDate = '';

    matchRows.forEach(tr => {
        const idAttr = tr.getAttribute('id') || '';
        const titleAttr = (tr.getAttribute('title') || '').trim();
        const text = tr.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

        // Datum aus der Zeile oder aus dem tr-Title (z.B. "Bezirksklasse - 24.10.2026 10:00") holen
        const dateInTitle = (titleAttr.match(/\b(\d{2}\.\d{2}\.\d{4})\b/) || [])[1] || '';
        const dateInRow = (text.match(/\b(\d{2}\.\d{2}\.\d{4})\b/) || [])[1] || '';
        const curDate = dateInRow || dateInTitle || lastSeenDate || '';
        if (curDate) lastSeenDate = curDate;

        // FALL 1: Offizieller Q-TTR-Stichtag / Abgleich (z.B. "TTR-Wert Abgleich vom 11.08.2026" oder "QTTR-Korrekturwerte")
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

        // FALL 2: Echtes Einzelspiel (Punktspiel, Pokal oder Ranglistenturnier)
        const vsMatch = text.match(/(\d{3,4})\s*vs\.\s*(\d{3,4})/i);
        const isPending = /n\.a\./i.test(text);
        if (!vsMatch && !isPending) return;

        const lpzBefore = vsMatch ? parseInt(vsMatch[1], 10) : null;
        const oppLpz = vsMatch ? parseInt(vsMatch[2], 10) : null;

        const tds = Array.from(tr.children).filter(el => el.tagName === 'TD');
        const cellTexts = tds.map(td => td.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim());

        // Satz-Ergebnis (letzte Zelle, z.B. "3:1" oder "0:3")
        const score = cellTexts[cellTexts.length - 1] || '';
        const scoreParts = score.match(/^(\d+):(\d+)$/);
        const won = scoreParts ? (parseInt(scoreParts[1], 10) > parseInt(scoreParts[2], 10)) : null;

        // +/- Veränderung (vorletzte Zelle, z.B. "+7", "-12" oder "n.a.")
        const deltaStr = cellTexts[cellTexts.length - 2] || '';
        const delta = /^[+-]?\d+$/.test(deltaStr) ? parseInt(deltaStr, 10) : null;

        // Gegenspieler & Gegnermannschaft / Turniername ermitteln
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
        // Falls Gegnermannschaft in Spalte 3 steht:
        const hgIdx = cellTexts.findIndex(c => c === 'H' || c === 'G');
        if (hgIdx !== -1 && cellTexts[hgIdx + 1]) {
            teamOrEvent = `${cellTexts[hgIdx] === 'H' ? 'Heim gg.' : 'Gast bei'} ${cellTexts[hgIdx + 1]}`;
        } else if (!teamOrEvent && cellTexts[2] && cellTexts[2] !== opponent) {
            teamOrEvent = cellTexts[2];
        }

        rawEvents.push({
            isStichtag: false,
            isPending: Boolean(isPending && lpzBefore === null),
            date: curDate,
            lpzBefore: lpzBefore,
            oppLpz: oppLpz,
            delta: delta,
            opponent: opponent || 'Gegenspieler',
            teamOrEvent: teamOrEvent || 'Wettkampf',
            score: score,
            won: won
        });
    });

    // Falls für einen Spieler (z.B. ohne Spiele) keine Match-Tabelle existiert, ImageMap als Fallback prüfen
    if (rawEvents.length === 0) {
        const areas = Array.from(doc.querySelectorAll('area[shape="circle"]'));
        areas.forEach(ar => {
            const raw = ar.getAttribute('title') || '';
            const m = raw.match(/(\d{2}\.\d{2}\.\d{4})\s*:\s*(\d{3,4})/);
            if (m) {
                rawEvents.push({
                    isStichtag: false,
                    date: m[1],
                    lpzBefore: parseInt(m[2], 10),
                    lpzAfter: parseInt(m[2], 10),
                    delta: 0,
                    opponent: 'Tagesschnitt',
                    teamOrEvent: 'LPZ-Verlauf',
                    score: '',
                    won: null
                });
            }
        });
    }

    // In TTLive steht das neueste Spiel oben (Match1) und das älteste unten (Match100).
    // Wir drehen die Liste um, damit Spiel #1 links (ältestes) und das aktuellste rechts steht!
    const chron = rawEvents.reverse();

    // Jetzt für jedes einzelne Spiel den exakten LPZ-Wert NACH dem Spiel berechnen!
    // Hinweis: Wenn an einem Spieltag 2 Einzel gespielt wurden, zeigt TTLive bei beiden derselben
    // Begegnung denselben Start-LPZ ("lpzBefore") und addiert beide Deltas nacheinander auf.
    let runningLpz = null;
    let currentBatchBase = null;
    let currentBatchKey = '';

    chron.forEach((ev, idx) => {
        if (ev.isStichtag) {
            ev.lpz = ev.lpzAfter || ev.lpzBefore || runningLpz;
            runningLpz = ev.lpz;
            currentBatchBase = null;
            return;
        }

        if (ev.lpzBefore !== null) {
            const batchKey = `${ev.date}_${ev.lpzBefore}`;
            if (batchKey !== currentBatchKey) {
                currentBatchKey = batchKey;
                currentBatchBase = ev.lpzBefore;
                runningLpz = ev.lpzBefore;
            }
            if (ev.delta !== null) {
                runningLpz = (runningLpz !== null ? runningLpz : ev.lpzBefore) + ev.delta;
            } else {
                runningLpz = ev.lpzBefore;
            }
            ev.lpz = runningLpz;
        } else {
            // Noch nicht berechnetes Spiel vom selben Tag ("n.a.") behält vorerst den letzten bekannten LPZ
            ev.lpz = runningLpz || player.lpz || null;
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
        const vsInfo = p.oppLpz ? ` (LPZ ${p.oppLpz})` : '';
        const scoreInfo = p.score && p.score !== '★' ? ` · Erg. ${p.score}` : '';
        p.info = p.isStichtag
            ? `📌 ${p.opponent} → LPZ ${p.lpz}`
            : `gg. ${p.opponent}${vsInfo}${scoreInfo} · ${p.teamOrEvent}`;
    });

    if (validPoints.length > 0) {
        const latestKnown = validPoints[validPoints.length - 1].lpz;
        if (latestKnown) player.lpz = latestKnown;
    }

    return validPoints;
}

// -----------------------------------------------------------------
// 4. KPI-TELEMETRIE & INTERAKTIVER SPIEL-FÜR-SPIEL CANVAS-CHART
// -----------------------------------------------------------------
function ttrSetRange(range) {
    ttrCurrentRange = range;
    [100, 50, 25].forEach(r => {
        document.getElementById('ttr-range-' + r)?.classList.toggle('active', r === range);
    });
    const player = ttrPlayers.find(p => p.id === ttrSelectedPlayerId);
    if (player) ttrApplyChartPoints(player, ttrCurrentPoints);
}

function ttrApplyChartPoints(player, allPoints) {
    ttrCurrentPoints = Array.isArray(allPoints) ? allPoints : [];
    const pts = ttrCurrentPoints.slice(-ttrCurrentRange);

    const curEl = document.getElementById('ttr-kpi-current');
    const trdEl = document.getElementById('ttr-kpi-trend');
    const trdSub = document.getElementById('ttr-kpi-trend-sub');
    const maxEl = document.getElementById('ttr-kpi-max');
    const minEl = document.getElementById('ttr-kpi-min');
    const cntEl = document.getElementById('ttr-kpi-count');
    const winEl = document.getElementById('ttr-kpi-winrate');

    if (!pts.length) {
        if (curEl) curEl.textContent = player.lpz ? player.lpz.toLocaleString('de-DE') : '–';
        if (trdEl) { trdEl.textContent = '–'; trdEl.style.color = '#fff'; }
        if (maxEl) maxEl.textContent = player.lpz ? player.lpz.toLocaleString('de-DE') : '–';
        if (minEl) minEl.textContent = 'Tiefstwert: –';
        if (cntEl) cntEl.textContent = '0 : 0';
        if (winEl) winEl.textContent = 'Keine Einzelspiele im Zeitraum';
        ttrDrawChart([]);
        document.getElementById('ttr-history-table-wrap').innerHTML = '<p class="tp-help" style="color:var(--text-muted);">Für diesen Spieler liegen noch keine gewerteten Einzelspiele vor.</p>';
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

    if (curEl) curEl.textContent = (player.lpz || latest).toLocaleString('de-DE');
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

    ttrDrawChart(pts);
    ttrRenderHistoryTable(pts);
}

function ttrRenderHistoryTable(pts) {
    const wrap = document.getElementById('ttr-history-table-wrap');
    if (!wrap) return;
    const rev = [...pts].reverse();
    wrap.innerHTML = `
        <table class="tt-data-table" style="color:var(--text-cream);">
            <thead>
                <tr>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Spiel</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Datum</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Gegenspieler & Wettbewerb</th>
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

function ttrDrawChart(ptsInput, hoverIdx = -1) {
    const canvas = document.getElementById('ttr-chart-canvas');
    if (!canvas) return;
    const pts = ptsInput || ttrCurrentPoints.slice(-ttrCurrentRange);

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, rect.width || 800);
    const H = Math.max(240, rect.height || 350);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!pts || pts.length === 0) {
        ctx.fillStyle = '#a7c4bc';
        ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Wähle oben einen Spieler mit LPZ-Wert aus, um die Spiel-für-Spiel-Entwicklung zu sehen.', W / 2, H / 2);
        ttrChartGeom = null;
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

    // 1. Horizontales Gitter & Y-Achsen-Labels
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
    ttrChartGeom = { coords, pad, W, H, pts };

    // 2. Offizielle Q-TTR-Stichtage als goldene vertikale Markierungslinien hervorheben!
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

    // 3. Smaragd-Leucht-Fläche & Kurve
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

    // 4. X-Achsen-Labels (Datum + Spielnummer)
    ctx.fillStyle = '#a7c4bc';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, coords.length);
    for (let k = 0; k < labelCount; k++) {
        const idx = labelCount === 1 ? 0 : Math.round((k / (labelCount - 1)) * (coords.length - 1));
        const c = coords[idx];
        ctx.fillText(String(c.data.date).slice(0, 10), c.x, H - 12);
    }

    // 5. Spielpunkte zeichnen (Grün = Sieg, Rot = Niederlage, Goldene Raute = Stichtag, Blau = Peak)
    let peakIdx = 0;
    coords.forEach((c, i) => { if (c.data.lpz >= coords[peakIdx].data.lpz) peakIdx = i; });

    coords.forEach((c, i) => {
        const isPeak = i === peakIdx && coords.length > 1;
        const isHover = i === hoverIdx;

        if (c.data.isStichtag) {
            // Goldene Raute für Stichtag
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

    // Peak-Krone über dem höchsten Wert
    const pk = coords[peakIdx];
    if (pk) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 11.5px "JetBrains Mono", monospace';
        ctx.textAlign = pk.x > W - 95 ? 'right' : pk.x < 95 ? 'left' : 'center';
        ctx.fillText(`👑 Peak: ${pk.data.lpz}`, pk.x, Math.max(16, pk.y - 11));
    }

    // 6. Hover-Fadenkreuz
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

function bindTTRChartEvents() {
    const canvas = document.getElementById('ttr-chart-canvas');
    const tip = document.getElementById('ttr-chart-tooltip');
    if (!canvas || canvas.dataset.bound) return;
    canvas.dataset.bound = '1';

    const handleMove = (clientX) => {
        if (!ttrChartGeom || !ttrChartGeom.coords.length) return;
        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;

        let bestIdx = 0, bestDist = Infinity;
        ttrChartGeom.coords.forEach((c, idx) => {
            const d = Math.abs(c.x - mx);
            if (d < bestDist) { bestDist = d; bestIdx = idx; }
        });

        ttrDrawChart(ttrChartGeom.pts, bestIdx);
        const pt = ttrChartGeom.coords[bestIdx];
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
            const leftPos = pt.x > ttrChartGeom.W * 0.58 ? (pt.x - 235) : (pt.x + 14);
            const topPos = Math.max(10, Math.min(ttrChartGeom.H - 105, pt.y - 42));
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
        if (ttrChartGeom) ttrDrawChart(ttrChartGeom.pts, -1);
    });
    window.addEventListener('resize', () => {
        if (document.getElementById('page-tt-ranking')?.classList.contains('active')) {
            ttrDrawChart();
        }
    });
}