// ===================================================================
// TT-RANKING: ABTEILUNGSLISTE, LPZ-RANGLISTE & INTERAKTIVER 100-SPIELE-CHART
// ===================================================================

let ttrPlayers = [];
let ttrSelectedPlayerId = null;
let ttrCurrentPoints = [];
let ttrCurrentRange = 100;
let ttrInitialized = false;
let ttrBatchRunning = false;
let ttrChartGeom = null; // Speichert Koordinaten für präzises Mouse-/Touch-Hover

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

// -----------------------------------------------------------------
// 1. SPIELERLISTE LADEN (LOKAL -> GOOGLE DRIVE -> TTLIVE) & BATCH-ENRICHMENT
// -----------------------------------------------------------------
async function ttrLoadRankingList(forceRefresh) {
    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();

    if (!forceRefresh && !ttrPlayers.length) {
        try {
            const cached = localStorage.getItem('dippe_ttr_players_v1');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length) {
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

    setTTRSyncBadge('⏳ Lade Abteilungs-Mitglieder …', 'rgba(251,191,36,0.2)', '#fbbf24');
    try {
        const res = await fetch(`${cloudUrl}?kind=tt_ranking_list${forceRefresh ? '&force=1' : ''}&t=${Date.now()}`, { redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.players)) {
            ttrPlayers = data.players;
            try { localStorage.setItem('dippe_ttr_players_v1', JSON.stringify(ttrPlayers)); } catch (e) {}
            ttrUpdateDropdownAndTable();

            const withLpz = ttrPlayers.filter(p => p.lpz && p.lpz > 0).length;
            setTTRSyncBadge(`✓ ${ttrPlayers.length} Spieler (${withLpz} mit LPZ)`, 'rgba(16,185,129,0.2)', '#34d399');

            // Noch fehlende LPZ-Werte automatisch in schnellen 6er-Paketen nachladen
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

    const unresolved = ttrPlayers.filter(p => p.mid && !p.lpz && !p.resolved);
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
                        const idx = ttrPlayers.findIndex(p => p.id === upd.id || (upd.mid && p.mid === upd.mid));
                        if (idx !== -1) {
                            ttrPlayers[idx] = { ...ttrPlayers[idx], ...upd, resolved: true };
                        }
                    });
                    try { localStorage.setItem('dippe_ttr_players_v1', JSON.stringify(ttrPlayers)); } catch (e) {}
                    ttrUpdateDropdownAndTable(true);
                }
            }
        } catch (e) {}

        done += chunk.length;
        const pct = Math.min(100, Math.round((done / total) * 100));
        if (progTxt) progTxt.textContent = `Ermittle LivePZ-Werte aus TischtennisLive (${done} / ${total} geprüft) …`;
        if (progPct) progPct.textContent = `${pct}%`;
        if (progFill) progFill.style.width = `${pct}%`;
    }

    ttrBatchRunning = false;
    if (progBox) setTimeout(() => progBox.classList.add('hidden'), 1200);
    const withLpz = ttrPlayers.filter(p => p.lpz && p.lpz > 0).length;
    setTTRSyncBadge(`☁️ Synchronisiert · ${ttrPlayers.length} Spieler (${withLpz} mit LPZ)`, 'rgba(16,185,129,0.2)', '#34d399');
}

// -----------------------------------------------------------------
// 2. DROPDOWN & VOLLSTÄNDIGE SPIELER-TABELLE RENDERN
// -----------------------------------------------------------------
function getRankedPlayersList() {
    // Berechnet den Vereins-Rang nach LPZ absteigend
    const byLpz = [...ttrPlayers].sort((a, b) => (b.lpz || 0) - (a.lpz || 0) || (a.lastName || '').localeCompare(b.lastName || 'de'));
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
            // Standardmäßig den #1 Spieler (oder Jürgen Adler falls gewünscht) auswählen
            ttrSelectedPlayerId = ranked[0].id;
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
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">Keine passenden Spieler gefunden.</td></tr>`;
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
                <td style="color:#475569;">${domEsc(p.team || 'Abteilungsmitglied')}</td>
                <td style="text-align:right;">${lpzDisplay}</td>
                <td style="text-align:center;" onclick="event.stopPropagation();">
                    <button class="btn btn-emerald" style="padding:4px 10px; font-size:11.5px;" onclick="ttrSelectPlayerFromTable('${p.id}')">📈 Kurve</button>
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
// 3. LPZ-ENTWICKLUNG (LETZTE 100 SPIELE) ABRUFEN & PARSEN
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
    document.getElementById('ttr-kpi-rank-sub').textContent = player._rank ? `von ${totalRanked} Spielern mit LPZ` : 'Noch kein aktiver LPZ-Wert';
    document.getElementById('ttr-chart-title').textContent = `LPZ-Entwicklung · ${player.displayName || player.lastName}`;

    const directLink = document.getElementById('ttr-direct-link');
    if (directLink) {
        directLink.href = player.l2p
            ? `https://dresden.tischtennislive.de/default.aspx?L1=Public&L2=Kontakt&L2P=${player.l2p}${player.mid ? '&MID=' + player.mid : ''}&Page1=Bilanz&SA=96&Page=EntwicklungTTR`
            : `https://dresden.tischtennislive.de/default.aspx?L1=Verwaltung&L2=Verein&L2P=870&L3=Tischtennis&L3P=1740&L4=Mitglieder&Page=Liste&L5=Details&L4P=${player.mid || ''}`;
    }

    // Lokalen Cache prüfen
    const localKey = 'dippe_ttr_hist_' + playerId;
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

    setTTRSyncBadge(`⏳ Lade LPZ-Kurve für ${player.displayName || player.lastName} …`, 'rgba(251,191,36,0.2)', '#fbbf24');
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
                const latestLpz = points[points.length - 1].lpz;
                if (latestLpz && !player.lpz) player.lpz = latestLpz;
                try { localStorage.setItem(localKey, JSON.stringify(points)); } catch (e) {}
                try { localStorage.setItem('dippe_ttr_players_v1', JSON.stringify(ttrPlayers)); } catch (e) {}
            }
            ttrUpdateDropdownAndTable(true);
            ttrApplyChartPoints(player, points);
            setTTRSyncBadge(`✓ Kurve geladen (${points.length} Datenpunkte)`, 'rgba(16,185,129,0.2)', '#34d399');
        } else {
            ttrApplyChartPoints(player, []);
            setTTRSyncBadge('⚠️ Keine LPZ-Historie verfügbar', 'rgba(251,191,36,0.2)', '#fbbf24');
        }
    } catch (err) {
        console.warn('Fehler beim Abruf der LPZ-Entwicklung:', err);
        ttrApplyChartPoints(player, []);
    }
}

/**
 * Multi-Strategie-Parser für "Page=EntwicklungTTR" & "Page1=Bilanz":
 * Erkennt sowohl HTML-Spieltabellen als auch eingebettete Chart-Arrays (<script>),
 * ASP.NET Image-Maps (<area>) sowie die Halbjahres-Bilanzen.
 */
function parseTTLiveEntwicklungHtml(entwHtml, bilanzHtml, player) {
    const points = [];
    const doc = new DOMParser().parseFromString(entwHtml || '', 'text/html');

    // 1. Aktuellen LPZ-Wert im Fließtext von EntwicklungTTR suchen (z.B. "Aktueller LivePZ-Wert: 1083")
    const bodyText = doc.body ? doc.body.textContent.replace(/\s+/g, ' ') : '';
    const curMatch = bodyText.match(/(?:Aktueller\s+)?(?:LivePZ|LPZ|TTR)[\s-]*Wert\s*[:=]?\s*(\d{3,4})/i);
    if (curMatch) {
        const val = parseInt(curMatch[1], 10);
        if (val >= 500 && val <= 2500) player.lpz = val;
    }

    // 2. STRATEGIE A: Tabellenzeilen auf Page=EntwicklungTTR auslesen (Einzelspiele / Turniere / Stichtage)
    const rows = Array.from(doc.querySelectorAll('tr'));
    rows.forEach(tr => {
        if (tr.querySelector('table')) return;
        const cells = Array.from(tr.children)
            .filter(el => el.tagName === 'TD' || el.tagName === 'TH')
            .map(c => c.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (cells.length < 2) return;
        const joined = cells.join(' | ');
        if (/^(Datum|Nr\.?|Spiel|Gegner|Mannschaft|Wettbewerb)$/i.test(cells[0])) return;

        // Suche nach Datum (z.B. 12.10.2026 oder 12.10.26) oder Spielnummer + 3-4-stelligem LPZ-Wert
        const dateMatch = joined.match(/\b(\d{1,2}\.\d{1,2}\.\d{2,4})\b/);
        let lpzVal = null;
        let deltaVal = null;

        for (let i = cells.length - 1; i >= 0; i--) {
            const c = cells[i];
            if (deltaVal === null && /^[+-]\d{1,3}$/.test(c)) {
                deltaVal = parseInt(c, 10);
            } else if (lpzVal === null && /^\d{3,4}$/.test(c)) {
                const n = parseInt(c, 10);
                if (n >= 500 && n <= 2500 && n !== 2026 && n !== 2025 && n !== 2024 && n !== 2023) {
                    lpzVal = n;
                }
            }
        }

        if (lpzVal !== null && (dateMatch || cells.length >= 3)) {
            const detailCells = cells.filter(c => c !== String(lpzVal) && (!dateMatch || c !== dateMatch[1]) && !/^[+-]?\d{1,3}$/.test(c));
            points.push({
                date: dateMatch ? dateMatch[1] : `Spiel ${points.length + 1}`,
                lpz: lpzVal,
                delta: deltaVal,
                info: detailCells.join(' · ') || 'Punktspiel / Wertung'
            });
        }
    });

    // 3. STRATEGIE B: Eingebettete Chart-Skripte (Highcharts / Chart.js / Google Visualization / Arrays)
    if (points.length < 2) {
        const scripts = Array.from(doc.querySelectorAll('script')).map(s => s.textContent).join('\n');
        // Suche nach Tupeln wie ["12.10.2025", 1083] oder ['Spiel 1', 1061]
        const tupleRegex = /\[\s*["']([^"']{2,35})["']\s*,\s*(\d{3,4})\s*\]/g;
        let tM;
        while ((tM = tupleRegex.exec(scripts)) !== null) {
            const n = parseInt(tM[2], 10);
            if (n >= 500 && n <= 2500) {
                points.push({ date: tM[1], lpz: n, delta: null, info: 'LPZ-Verlauf' });
            }
        }
        // Oder Zahlen-Arrays data: [1061, 1068, 1083, ...]
        if (points.length < 2) {
            const arrayRegex = /(?:data|values|lpz|ttr)\s*[:=]\s*\[([\d\s,.\n\r]{12,})\]/gi;
            let aM;
            while ((aM = arrayRegex.exec(scripts)) !== null) {
                const nums = aM[1].split(',').map(x => parseInt(x.trim(), 10)).filter(n => n >= 500 && n <= 2500);
                if (nums.length >= 3) {
                    nums.forEach((n, idx) => points.push({ date: `Spiel ${idx + 1}`, lpz: n, delta: null, info: 'LPZ-Entwicklung' }));
                    break;
                }
            }
        }
    }

    // 4. STRATEGIE C: ASP.NET Chart Image-Map (<area title="..." ...>)
    if (points.length < 2) {
        const areas = Array.from(doc.querySelectorAll('area'));
        areas.forEach((ar, idx) => {
            const raw = ar.getAttribute('title') || ar.getAttribute('alt') || ar.getAttribute('onmouseover') || '';
            const m = raw.match(/\b(1\d{3}|[6-9]\d{2}|2[0-4]\d{2})\b/);
            if (m) {
                const d = raw.match(/\b(\d{1,2}\.\d{1,2}\.\d{2,4})\b/);
                points.push({
                    date: d ? d[1] : `Spiel ${idx + 1}`,
                    lpz: parseInt(m[1], 10),
                    delta: null,
                    info: raw.replace(/Tip\(|'\)|"/g, '').trim()
                });
            }
        });
    }

    // 5. STRATEGIE D: Halbjahres-Bilanzen aus Page1=Bilanz&SA=96 (wie in deinem Screenshot 2)
    if (points.length < 2 && bilanzHtml) {
        const bDoc = new DOMParser().parseFromString(bilanzHtml, 'text/html');
        const bTables = Array.from(bDoc.querySelectorAll('table')).filter(t => !t.querySelector('table'));
        const halfSeasons = [];
        bTables.forEach(tbl => {
            let heading = '';
            let prev = tbl.previousElementSibling;
            while (prev && !heading) {
                const t = prev.textContent.replace(/\s+/g, ' ').trim();
                if (/Bilanz\s+\d{4}/i.test(t)) heading = t.replace(/TSV\s+Graupa/i, '').trim();
                prev = prev.previousElementSibling;
            }
            const trs = Array.from(tbl.querySelectorAll('tr'));
            trs.forEach(tr => {
                const cells = Array.from(tr.children).map(c => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
                if (cells.length >= 4 && /^\d{3,4}$/.test(cells[cells.length - 1])) {
                    const lpz = parseInt(cells[cells.length - 1], 10);
                    if (lpz >= 500 && lpz <= 2500) {
                        halfSeasons.push({
                            date: heading.replace(/^Bilanz\s+/i, '') || cells[0],
                            lpz: lpz,
                            delta: null,
                            info: `${cells[0]} · Bilanz ${cells[cells.length - 2] || ''}`
                        });
                    }
                }
            });
        });
        if (halfSeasons.length > 0) {
            // Auf Bilanzübersicht steht die neueste Saison oben -> für Zeitstrahl umkehren (älteste links, neueste rechts)
            halfSeasons.reverse().forEach(h => points.push(h));
        }
    }

    // Falls auf EntwicklungTTR das neueste Spiel oben in der Tabelle stand, chronologisch sortieren (ältestes links -> neuestes rechts)
    if (points.length >= 2) {
        const parseDeDate = (str) => {
            const m = String(str || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
            if (!m) return null;
            let yr = parseInt(m[3], 10);
            if (yr < 100) yr += 2000;
            return new Date(yr, parseInt(m[2], 10) - 1, parseInt(m[1], 10)).getTime();
        };
        const tFirst = parseDeDate(points[0].date);
        const tLast = parseDeDate(points[points.length - 1].date);
        if (tFirst && tLast && tFirst > tLast) {
            points.reverse();
        } else if (!tFirst && player.lpz && points[0].lpz === player.lpz && points[points.length - 1].lpz !== player.lpz) {
            points.reverse();
        }
    }

    // Falls nur ein aktueller LPZ-Wert existiert, zumindest diesen als Punkt setzen
    if (points.length === 0 && player.lpz) {
        points.push({ date: 'Aktuell', lpz: player.lpz, delta: 0, info: player.team || 'Aktueller Stand' });
    }

    // Deltas zwischen aufeinanderfolgenden Punkten berechnen
    for (let i = 0; i < points.length; i++) {
        points[i].nr = i + 1;
        if (i === 0) {
            if (points[i].delta === null) points[i].delta = 0;
        } else {
            points[i].delta = points[i].lpz - points[i - 1].lpz;
        }
    }

    return points.slice(-100);
}

// -----------------------------------------------------------------
// 4. KPI-TELEMETRIE & INTERAKTIVER HIGH-END CANVAS-CHART
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

    if (!pts.length) {
        if (curEl) curEl.textContent = player.lpz ? player.lpz.toLocaleString('de-DE') : '–';
        if (trdEl) { trdEl.textContent = '–'; trdEl.style.color = '#fff'; }
        if (maxEl) maxEl.textContent = player.lpz ? player.lpz.toLocaleString('de-DE') : '–';
        if (minEl) minEl.textContent = 'Tiefstwert: –';
        if (cntEl) cntEl.textContent = '0';
        ttrDrawChart([]);
        document.getElementById('ttr-history-table-wrap').innerHTML = '<p class="tp-help" style="color:var(--text-muted);">Für diesen Spieler liegen noch keine Einzelspiel-Stationen vor.</p>';
        return;
    }

    const latest = pts[pts.length - 1].lpz;
    const first = pts[0].lpz;
    const diff = latest - first;
    const maxLpz = Math.max(...pts.map(p => p.lpz));
    const minLpz = Math.min(...pts.map(p => p.lpz));

    if (curEl) curEl.textContent = (player.lpz || latest).toLocaleString('de-DE');
    if (trdEl) {
        const sign = diff > 0 ? '+' : '';
        trdEl.textContent = `${sign}${diff} Pkt.`;
        trdEl.style.color = diff > 0 ? '#34d399' : diff < 0 ? '#f87171' : '#fbbf24';
    }
    if (trdSub) trdSub.textContent = `Start: ${first} → Aktuell: ${latest}`;
    if (maxEl) maxEl.textContent = maxLpz.toLocaleString('de-DE');
    if (minEl) minEl.textContent = `Tiefstwert: ${minLpz.toLocaleString('de-DE')} (Spanne: ${maxLpz - minLpz})`;
    if (cntEl) cntEl.textContent = String(pts.length);

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
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">#</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Datum / Abschnitt</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Details / Begegnung</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:right;">+/−</th>
                    <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:right;">LPZ-Wert</th>
                </tr>
            </thead>
            <tbody>
                ${rev.map(p => {
                    const dStr = p.delta > 0 ? `+${p.delta}` : String(p.delta || 0);
                    const dCol = p.delta > 0 ? '#34d399' : p.delta < 0 ? '#f87171' : '#94a3b8';
                    return `
                        <tr>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); font-family:'JetBrains Mono',monospace;">${p.nr}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); font-weight:700;">${domEsc(p.date)}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); color:var(--text-muted);">${domEsc(p.info)}</td>
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
        ctx.fillText('Wähle oben einen Spieler mit LPZ-Wert aus, um die Entwicklungskurve zu sehen.', W / 2, H / 2);
        ttrChartGeom = null;
        return;
    }

    const pad = { left: 56, right: 26, top: 32, bottom: 38 };
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

    // 2. Gestrichelte Start-LPZ-Referenzlinie
    const startY = yOf(pts[0].lpz);
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.left, startY);
    ctx.lineTo(W - pad.right, startY);
    ctx.stroke();
    ctx.restore();

    // 3. Koordinaten berechnen
    const coords = pts.map((p, i) => ({ x: xOf(i), y: yOf(p.lpz), data: p, idx: i }));
    ttrChartGeom = { coords, pad, W, H, pts };

    // 4. Smaragd-Leucht-Fläche unter der Kurve
    if (coords.length >= 2) {
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.42)');
        grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.08)');
        grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        ctx.beginPath();
        ctx.moveTo(coords[0].x, pad.top + plotH);
        ctx.lineTo(coords[0].x, coords[0].y);
        for (let i = 0; i < coords.length - 1; i++) {
            const xc = (coords[i].x + coords[i + 1].x) / 2;
            const yc = (coords[i].y + coords[i + 1].y) / 2;
            ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
        }
        ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
        ctx.lineTo(coords[coords.length - 1].x, pad.top + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // 5. Haupt-Performance-Kurve mit Glow
        ctx.save();
        ctx.shadowColor = 'rgba(52, 211, 153, 0.55)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(coords[0].x, coords[0].y);
        for (let i = 0; i < coords.length - 1; i++) {
            const xc = (coords[i].x + coords[i + 1].x) / 2;
            const yc = (coords[i].y + coords[i + 1].y) / 2;
            ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
        }
        ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
        ctx.stroke();
        ctx.restore();
    }

    // 6. X-Achsen-Datums-Labels (ca. 6 Stützstellen)
    ctx.fillStyle = '#a7c4bc';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, coords.length);
    for (let k = 0; k < labelCount; k++) {
        const idx = labelCount === 1 ? 0 : Math.round((k / (labelCount - 1)) * (coords.length - 1));
        const c = coords[idx];
        ctx.fillText(String(c.data.date).slice(0, 14), c.x, H - 12);
    }

    // 7. Höchstwert (Peak) und Punkte zeichnen
    let peakIdx = 0;
    coords.forEach((c, i) => { if (c.data.lpz >= coords[peakIdx].data.lpz) peakIdx = i; });

    coords.forEach((c, i) => {
        const isPeak = i === peakIdx && coords.length > 1;
        const isLast = i === coords.length - 1;
        const isHover = i === hoverIdx;
        const r = isHover ? 6.5 : (isPeak || isLast) ? 5 : (coords.length > 45 ? 2.5 : 3.5);

        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isHover ? '#fbbf24' : isPeak ? '#38bdf8' : isLast ? '#10b981' : '#091512';
        ctx.fill();
        ctx.lineWidth = isHover || isPeak || isLast ? 2.5 : 1.8;
        ctx.strokeStyle = isHover ? '#fff' : isPeak ? '#bae6fd' : '#34d399';
        ctx.stroke();
    });

    // Peak-Badge direkt an den höchsten Punkt schreiben
    const pk = coords[peakIdx];
    if (pk) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 11.5px "JetBrains Mono", monospace';
        ctx.textAlign = pk.x > W - 90 ? 'right' : pk.x < 90 ? 'left' : 'center';
        ctx.fillText(`👑 Max: ${pk.data.lpz}`, pk.x, Math.max(16, pk.y - 11));
    }

    // 8. Vertikales Fadenkreuz bei Hover
    if (hoverIdx >= 0 && coords[hoverIdx]) {
        const hc = coords[hoverIdx];
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
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
            const dVal = pt.data.delta || 0;
            const dSign = dVal > 0 ? '+' : '';
            const dCol = dVal > 0 ? '#34d399' : dVal < 0 ? '#f87171' : '#fbbf24';
            tip.innerHTML = `
                <div style="font-size:10.5px; color:#fbbf24; font-weight:800; text-transform:uppercase;">Station #${pt.data.nr} · ${domEsc(pt.data.date)}</div>
                <div style="display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin:4px 0;">
                    <span style="font-family:'JetBrains Mono',monospace; font-size:20px; font-weight:800; color:#fff;">LPZ ${pt.data.lpz}</span>
                    <span style="font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:800; color:${dCol};">${dSign}${dVal} Pkt.</span>
                </div>
                <div style="font-size:11.5px; color:#a7c4bc; line-height:1.35;">${domEsc(pt.data.info)}</div>
            `;
            tip.classList.remove('hidden');
            const leftPos = pt.x > ttrChartGeom.W * 0.62 ? (pt.x - 205) : (pt.x + 14);
            const topPos = Math.max(12, Math.min(ttrChartGeom.H - 95, pt.y - 35));
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
