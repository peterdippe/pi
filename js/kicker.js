// ===================================================================
// KICKERABEND: 2v2 MONSTER-DYP ENGINE, FAIR-CHECKPOINTS & KELLER-TELEMETRIE
// (js/kicker.js – Bombensichere Single-Flight-Sync & Local-First Edition)
// ===================================================================

const KK_PRESET_PLAYERS = [
    'Pi', 'Bianca', 'David', 'Alwin', 'Klaus', 'Steffi',
    'Tobias', 'Anna', 'Andreas', 'Natascha', 'Edgar', 'Paula'
];

let kkStore = {
    activeTournament: null,
    archive: []
};

let kkViewingId = 'active';
let kkAdminUnlocked = false;
let kkInitialized = false;
let kkSetupPlayers = ['Pi', 'Bianca', 'David', 'Alwin', 'Tobias', 'Andreas'];
let kkSelectedMatchId = null;
let kkDraftGoalsA = 6;
let kkDraftGoalsB = 3;

// Schutz-Mechanismen gegen Race-Conditions & versehentliche Doppeltipps
let kkUndoStack = [];
let kkInputCooldownUntil = 0;
let kkLocalMutationRev = 0;
let kkSyncInFlight = false;
let kkSyncPendingPayload = null;
let kkSyncStatusText = '☁️ Bereit';

function kkGcd(a, b) { return b === 0 ? a : kkGcd(b, a % b); }

// Berechnet die mathematische Fair-Block-Größe B = N / gcd(4, N)
function kkFairBlockInfo(nPlayers) {
    const n = Math.max(4, nPlayers);
    const g = kkGcd(4, n);
    const matchesPerBlock = n / g;
    const gamesPerPlayerPerBlock = (4 * matchesPerBlock) / n;
    const totalUniqueQuartets = (n * (n - 1) * (n - 2) * (n - 3)) / 24;
    const totalUniqueMatchups = totalUniqueQuartets * 3;
    return { n, matchesPerBlock, gamesPerPlayerPerBlock, totalUniqueMatchups };
}

function initKickerIfNeeded() {
    kkSyncAdminState();
    if (!kkInitialized) {
        kkInitialized = true;
        kkRenderSetupUI();
        kkLoadFromCloud();
    } else {
        kkRenderAll();
    }
}

// ===================================================================
// 1. ADMIN-MODUS (MIT MASKIERTEM PASSWORT-MODAL ANALOG ZU TT-RANKING)
// ===================================================================
function kkSyncAdminState() {
    kkAdminUnlocked = Boolean(sessionStorage.getItem('dippe_admin_pwd'));
    kkUpdateAdminUI();
}

function kkUpdateAdminUI() {
    const btn = document.getElementById('kk-admin-btn');
    const ctrls = document.getElementById('kk-admin-controls');
    if (btn) {
        btn.textContent = kkAdminUnlocked ? '🔓 Admin aktiv (Sperren)' : '🔒 Admin-Modus entsperren';
        btn.className = kkAdminUnlocked ? 'btn btn-emerald' : 'btn btn-amber';
    }
    if (ctrls) {
        ctrls.classList.toggle('hidden', !kkAdminUnlocked);
    }
}

async function kkToggleAdmin() {
    if (kkAdminUnlocked) {
        kkAdminUnlocked = false;
        sessionStorage.removeItem('dippe_admin_pwd');
        kkUpdateAdminUI();
        kkCloseSetupPanel();
        kkRenderAll();
        return;
    }
    const pwd = (typeof askPasswordModal === 'function')
        ? await askPasswordModal('⚽ Kickerabend · Admin', 'Bitte gib das Admin-Passwort ein (verdeckte Eingabe):')
        : prompt('Bitte Admin-Passwort eingeben:');
    if (!pwd) return;

    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();
    try {
        const res = await fetch(`${cloudUrl}?kind=auth&type=admin&password=${encodeURIComponent(pwd)}`);
        const j = await res.json();
        if (j && j.ok === true) {
            sessionStorage.setItem('dippe_admin_pwd', pwd);
            kkAdminUnlocked = true;
            kkUpdateAdminUI();
            if (!kkStore.activeTournament) kkOpenSetupPanel();
            kkRenderAll();
        } else {
            alert('Falsches Admin-Passwort!');
        }
    } catch (e) {
        alert('Verbindungsfehler bei der Passwortprüfung.');
    }
}

// ===================================================================
// 2. SETUP-KONFIGURATOR (SPIELER, SCHNELLWAHL & FAIR-BLOCK-MATHEMATIK)
// ===================================================================
function kkOpenSetupPanel() {
    if (!kkAdminUnlocked) { kkToggleAdmin(); return; }
    document.getElementById('kk-setup-panel')?.classList.remove('hidden');
    kkRenderSetupUI();
    document.getElementById('kk-new-player-input')?.focus();
}

function kkCloseSetupPanel() {
    document.getElementById('kk-setup-panel')?.classList.add('hidden');
}

function kkAddPlayerFromInput() {
    const inp = document.getElementById('kk-new-player-input');
    if (!inp) return;
    const raw = inp.value.trim();
    if (!raw) return;
    raw.split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(name => {
        if (!kkSetupPlayers.some(p => p.toLowerCase() === name.toLowerCase())) {
            kkSetupPlayers.push(name);
        }
    });
    inp.value = '';
    kkRenderSetupUI();
    inp.focus();
}

function kkTogglePresetPlayer(name) {
    const idx = kkSetupPlayers.findIndex(p => p.toLowerCase() === name.toLowerCase());
    if (idx >= 0) kkSetupPlayers.splice(idx, 1);
    else kkSetupPlayers.push(name);
    kkRenderSetupUI();
}

function kkRemoveSetupPlayer(idx) {
    kkSetupPlayers.splice(idx, 1);
    kkRenderSetupUI();
}

function kkRenderSetupUI() {
    const cntEl = document.getElementById('kk-player-count-badge');
    if (cntEl) cntEl.textContent = String(kkSetupPlayers.length);

    const chipsEl = document.getElementById('kk-quick-chips');
    if (chipsEl) {
        chipsEl.innerHTML = KK_PRESET_PLAYERS.map(name => {
            const active = kkSetupPlayers.some(p => p.toLowerCase() === name.toLowerCase());
            return `<span class="tp-dbl-chip ${active ? 'sel' : ''}" onclick="kkTogglePresetPlayer('${domEsc(name)}')">${active ? '✓ ' : '+ '}${domEsc(name)}</span>`;
        }).join('');
    }

    const listEl = document.getElementById('kk-setup-player-list');
    if (listEl) {
        if (!kkSetupPlayers.length) {
            listEl.innerHTML = `<span style="font-size:12.5px; color:#94a3b8;">Noch keine Spieler ausgewählt. Tippe oben auf die Namen oder gib eigene ein!</span>`;
        } else {
            listEl.innerHTML = kkSetupPlayers.map((name, i) => `
                <span style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-sand-light); border:1.5px solid var(--emerald-dark); color:var(--text-dark); font-weight:800; font-size:13px; padding:5px 11px; border-radius:99px;">
                    <span>${i + 1}. ${domEsc(name)}</span>
                    <button type="button" onclick="kkRemoveSetupPlayer(${i})" style="border:none; background:transparent; color:#b91c1c; font-weight:800; cursor:pointer; font-size:13px; line-height:1;">✕</button>
                </span>
            `).join('');
        }
    }

    const mathBox = document.getElementById('kk-math-info-box');
    const blocksSel = document.getElementById('kk-cfg-blocks');
    const n = kkSetupPlayers.length;

    if (n < 4) {
        if (mathBox) {
            mathBox.innerHTML = `⚠️ Für ein 2-gegen-2-Doppelturnier werden <b>mindestens 4 Spieler</b> benötigt (aktuell: ${n}).`;
        }
        if (blocksSel) blocksSel.innerHTML = `<option value="1">Bitte mindestens 4 Spieler wählen</option>`;
        return;
    }

    const info = kkFairBlockInfo(n);
    if (mathBox) {
        mathBox.innerHTML = `
            ⚖️ <b>Mathematische Fair-Block-Garantie bei ${n} Spielern:</b><br>
            Alle <b>${info.matchesPerBlock} Spiele</b> (= 1 Fair-Block) hat jeder Teilnehmer exakt <b>${info.gamesPerPlayerPerBlock} Spiele</b> absolviert!
            Insgesamt gibt es bei ${n} Spielern <b>${info.totalUniqueMatchups}</b> verschiedene 2v2-Kombinationen.
        `;
    }

    if (blocksSel) {
        const curVal = parseInt(blocksSel.value || '3', 10) || 3;
        const opts = [];
        for (let b = 1; b <= 8; b++) {
            const totalM = b * info.matchesPerBlock;
            const gamesEach = b * info.gamesPerPlayerPerBlock;
            const selAttr = (b === curVal || (!blocksSel.value && totalM >= 9 && totalM <= 16)) ? ' selected' : '';
            opts.push(`<option value="${b}"${selAttr}>${b} Fair-${b === 1 ? 'Block' : 'Blöcke'} (${totalM} Spiele gesamt · jeder spielt exakt ${gamesEach}×)</option>`);
        }
        blocksSel.innerHTML = opts.join('');
    }
}

// ===================================================================
// 3. DER 2v2 MONSTER-DYP ROTATIONS-ALGORITHMUS (ANTI-STREAK & MAX-MIX)
// ===================================================================
function kkGenerateFairBlockMatches(players, existingMatches, blockNumber) {
    const n = players.length;
    if (n < 4) return [];
    const info = kkFairBlockInfo(n);
    const B = info.matchesPerBlock;

    const gamesCount = {};
    const playStreak = {};
    const waitStreak = {};
    const partnerMatrix = {};
    const oppMatrix = {};
    const exactMatchupSet = {};

    players.forEach(p => {
        gamesCount[p] = 0;
        playStreak[p] = 0;
        waitStreak[p] = 0;
        partnerMatrix[p] = {};
        oppMatrix[p] = {};
        players.forEach(q => {
            partnerMatrix[p][q] = 0;
            oppMatrix[p][q] = 0;
        });
    });

    const recordMatchInStats = (tA, tB) => {
        const activeSet = new Set([...tA, ...tB]);
        players.forEach(p => {
            if (activeSet.has(p)) {
                gamesCount[p]++;
                playStreak[p]++;
                waitStreak[p] = 0;
            } else {
                playStreak[p] = 0;
                waitStreak[p]++;
            }
        });
        partnerMatrix[tA[0]][tA[1]]++; partnerMatrix[tA[1]][tA[0]]++;
        partnerMatrix[tB[0]][tB[1]]++; partnerMatrix[tB[1]][tB[0]]++;
        tA.forEach(a => tB.forEach(b => {
            oppMatrix[a][b]++;
            oppMatrix[b][a]++;
        }));
        const key1 = [...tA].sort().join('|') + ' vs ' + [...tB].sort().join('|');
        const key2 = [...tB].sort().join('|') + ' vs ' + [...tA].sort().join('|');
        exactMatchupSet[key1] = (exactMatchupSet[key1] || 0) + 1;
        exactMatchupSet[key2] = (exactMatchupSet[key2] || 0) + 1;
    };

    (existingMatches || []).forEach(m => recordMatchInStats(m.teamA, m.teamB));

    const minStartGames = Math.min(...players.map(p => gamesCount[p]));
    const targetGames = minStartGames + info.gamesPerPlayerPerBlock;

    const newMatches = [];
    const baseMatchNr = (existingMatches ? existingMatches.length : 0);

    for (let step = 0; step < B; step++) {
        const remainingMatchesInBlock = B - step;
        const needyPlayers = players.filter(p => gamesCount[p] < targetGames);
        const mustPlay = needyPlayers.filter(p => (targetGames - gamesCount[p]) >= remainingMatchesInBlock);

        const sortedPool = [...needyPlayers].sort((a, b) => {
            if (gamesCount[a] !== gamesCount[b]) return gamesCount[a] - gamesCount[b];
            if (waitStreak[b] !== waitStreak[a]) return waitStreak[b] - waitStreak[a];
            if (playStreak[a] !== playStreak[b]) return playStreak[a] - playStreak[b];
            return Math.random() - 0.5;
        });

        const minG = sortedPool[0] ? gamesCount[sortedPool[0]] : 0;
        let pool = sortedPool.filter(p => gamesCount[p] === minG);
        if (pool.length < 4) {
            const nextTier = sortedPool.filter(p => gamesCount[p] > minG);
            pool = [...pool, ...nextTier.slice(0, Math.max(4 - pool.length, 5))];
        }

        let bestSplit = null;
        let bestCost = Infinity;

        const len = pool.length;
        for (let i = 0; i < len - 3; i++) {
            for (let j = i + 1; j < len - 2; j++) {
                for (let k = j + 1; k < len - 1; k++) {
                    for (let l = k + 1; l < len; l++) {
                        const q = [pool[i], pool[j], pool[k], pool[l]];
                        if (mustPlay.some(mp => !q.includes(mp))) continue;

                        let quartetPenalty = 0;
                        q.forEach(p => {
                            quartetPenalty += (gamesCount[p] - minG) * 6000;
                            if (n > 4) {
                                quartetPenalty += (playStreak[p] * playStreak[p]) * 1400;
                                quartetPenalty -= waitStreak[p] * 1600;
                            }
                        });

                        const splits = [
                            { tA: [q[0], q[1]], tB: [q[2], q[3]] },
                            { tA: [q[0], q[2]], tB: [q[1], q[3]] },
                            { tA: [q[0], q[3]], tB: [q[1], q[2]] }
                        ];

                        splits.forEach(sp => {
                            const pA = partnerMatrix[sp.tA[0]][sp.tA[1]];
                            const pB = partnerMatrix[sp.tB[0]][sp.tB[1]];
                            const partnerCost = (pA * pA + pB * pB) * 12000 + (pA + pB) * 4000;

                            const o1 = oppMatrix[sp.tA[0]][sp.tB[0]];
                            const o2 = oppMatrix[sp.tA[0]][sp.tB[1]];
                            const o3 = oppMatrix[sp.tA[1]][sp.tB[0]];
                            const o4 = oppMatrix[sp.tA[1]][sp.tB[1]];
                            const oppCost = (o1 * o1 + o2 * o2 + o3 * o3 + o4 * o4) * 320;

                            const mKey = [...sp.tA].sort().join('|') + ' vs ' + [...sp.tB].sort().join('|');
                            const exactRepeatCost = (exactMatchupSet[mKey] || 0) * 8000;

                            const totalCost = quartetPenalty + partnerCost + oppCost + exactRepeatCost + Math.random() * 10;
                            if (totalCost < bestCost) {
                                bestCost = totalCost;
                                bestSplit = sp;
                            }
                        });
                    }
                }
            }
        }

        if (!bestSplit) {
            const fallbackQ = sortedPool.slice(0, 4);
            bestSplit = { tA: [fallbackQ[0], fallbackQ[1]], tB: [fallbackQ[2], fallbackQ[3]] };
        }

        recordMatchInStats(bestSplit.tA, bestSplit.tB);
        const matchNr = baseMatchNr + step + 1;
        const isCheckpoint = (step === B - 1);

        newMatches.push({
            id: 'kkm_' + Date.now() + '_' + matchNr,
            nr: matchNr,
            block: blockNumber,
            isCheckpoint: isCheckpoint,
            checkpointGamesEach: targetGames,
            teamA: bestSplit.tA,
            teamB: bestSplit.tB,
            goalsA: null,
            goalsB: null,
            done: false,
            _updatedAt: 0
        });
    }

    return newMatches;
}

// ===================================================================
// 4. BOMBENSICHERE SINGLE-FLIGHT CLOUD-SYNC QUEUE (KEINE RACE-CONDITIONS!)
// ===================================================================
function kkUpdateSyncIndicator(text, color) {
    kkSyncStatusText = text;
    const el = document.getElementById('kk-sync-indicator');
    if (el) {
        el.textContent = text;
        if (color) el.style.color = color;
    }
}

function kkSaveLocalStoreImmediate() {
    kkLocalMutationRev++;
    if (kkStore.activeTournament) {
        kkStore.activeTournament._rev = kkLocalMutationRev;
        kkStore.activeTournament._updatedAtMs = Date.now();
    }
    try {
        localStorage.setItem('dippe_kicker_v1', JSON.stringify(kkStore));
    } catch (e) {}
}

/**
 * Führt Cloud-Daten und lokale Daten intelligent zusammen, ohne jemals
 * neuere lokale Eingaben durch ältere Server-Antworten zu überschreiben!
 */
function kkMergeCloudStoreSafely(cloudStore) {
    if (!cloudStore || typeof cloudStore !== 'object') return;
    if (!kkStore.activeTournament && cloudStore.activeTournament) {
        kkStore = cloudStore;
        return;
    }
    if (kkStore.activeTournament && cloudStore.activeTournament &&
        kkStore.activeTournament.id === cloudStore.activeTournament.id) {
        // Merge auf Einzelspiel-Ebene anhand von _updatedAt
        const localMatches = kkStore.activeTournament.matches || [];
        const cloudMatches = cloudStore.activeTournament.matches || [];
        if (cloudMatches.length > localMatches.length) {
            // Falls auf anderem Gerät ein Fair-Block angehängt wurde
            for (let i = localMatches.length; i < cloudMatches.length; i++) {
                localMatches.push(cloudMatches[i]);
            }
        }
        localMatches.forEach((lm, idx) => {
            const cm = cloudMatches.find(x => x.id === lm.id) || cloudMatches[idx];
            if (!cm) return;
            const localTime = lm._updatedAt || (lm.done ? 1 : 0);
            const cloudTime = cm._updatedAt || (cm.done ? 1 : 0);
            if (cloudTime > localTime) {
                lm.goalsA = cm.goalsA;
                lm.goalsB = cm.goalsB;
                lm.done = cm.done;
                lm.playedAt = cm.playedAt;
                lm._updatedAt = cm._updatedAt;
            }
        });
    }
    if (Array.isArray(cloudStore.archive) && cloudStore.archive.length > (kkStore.archive || []).length) {
        kkStore.archive = cloudStore.archive;
    }
}

async function kkLoadFromCloud() {
    const revBeforeLoad = kkLocalMutationRev;
    try {
        const local = localStorage.getItem('dippe_kicker_v1');
        if (local) {
            kkStore = JSON.parse(local);
            kkRenderAll();
        }
    } catch (e) {}

    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();
    if (!cloudUrl || !cloudUrl.startsWith('https://script.google.com/')) return;
    try {
        const res = await fetch(`${cloudUrl}?kind=kicker&t=${Date.now()}`, { redirect: 'follow' });
        if (res.ok) {
            const j = await res.json();
            if (j && j.ok && j.data) {
                // Falls der Nutzer noch NICHTS lokal geklickt hat, Cloud-Stand übernehmen, sonst sicher mergen!
                if (kkLocalMutationRev === revBeforeLoad && !kkSyncInFlight) {
                    kkMergeCloudStoreSafely(j.data);
                    if (!kkStore.activeTournament && j.data.activeTournament) {
                        kkStore = j.data;
                    }
                    try { localStorage.setItem('dippe_kicker_v1', JSON.stringify(kkStore)); } catch (e) {}
                    kkRenderAll();
                } else {
                    kkMergeCloudStoreSafely(j.data);
                }
            }
        }
    } catch (e) {}
}

/**
 * Single-Flight Queue: Egal wie schnell der Nutzer klickt, es läuft immer
 * maximal 1 Request gleichzeitig, und danach wird garantiert der allerneueste
 * Stand in einem einzigen Request nachgeschoben. NIEMALS wird kkStore durch
 * eine veraltete Server-Antwort überschrieben!
 */
function kkQueueCloudSync(actionPayload) {
    kkSaveLocalStoreImmediate();
    kkSyncPendingPayload = actionPayload;
    kkUpdateSyncIndicator('⏳ Speichere in Google Drive…', '#fbbf24');
    kkProcessSyncQueue();
}

async function kkProcessSyncQueue() {
    if (kkSyncInFlight || !kkSyncPendingPayload) return;
    const cloudUrl = (CONFIG.pinnwandCloudUrl || '').trim();
    if (!cloudUrl || !cloudUrl.startsWith('https://script.google.com/')) {
        kkSyncPendingPayload = null;
        kkUpdateSyncIndicator('💾 Lokal gespeichert', '#34d399');
        return;
    }

    kkSyncInFlight = true;
    const payloadToSend = kkSyncPendingPayload;
    kkSyncPendingPayload = null;

    // Immer die aktuellste Kopie aus kkStore mitschicken!
    if (payloadToSend.action === 'public_update_active' && kkStore.activeTournament) {
        payloadToSend.tournament = JSON.parse(JSON.stringify(kkStore.activeTournament));
    } else if (payloadToSend.action === 'save_store') {
        payloadToSend.store = JSON.parse(JSON.stringify(kkStore));
    }

    try {
        const res = await fetch(cloudUrl, {
            method: 'POST', redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ kind: 'kicker_action', ...payloadToSend })
        });
        const j = await res.json();
        if (j && !j.ok && j.error) {
            kkUpdateSyncIndicator('⚠️ ' + j.error, '#f87171');
        } else {
            // WICHTIG: Wir überschreiben kkStore HIER NICHT mit j.data,
            // damit schnelle Zwischenklicks des Nutzers niemals gelöscht werden!
            if (!kkSyncPendingPayload) {
                const timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                kkUpdateSyncIndicator(`☁️ In Drive gesichert (${timeStr})`, '#34d399');
            }
        }
    } catch (e) {
        kkUpdateSyncIndicator('💾 Lokal gesichert (Offline)', '#fbbf24');
    } finally {
        kkSyncInFlight = false;
        // Falls der Nutzer während des Speicherns schon wieder 3 Spiele eingetragen hat -> jetzt den neuesten Stand senden!
        if (kkSyncPendingPayload) {
            kkProcessSyncQueue();
        }
    }
}

async function kkStartNewTournament() {
    if (!kkAdminUnlocked) { await kkToggleAdmin(); if (!kkAdminUnlocked) return; }
    if (kkSetupPlayers.length < 4) {
        alert('Bitte mindestens 4 Teilnehmer auswählen!');
        return;
    }

    const name = (document.getElementById('kk-cfg-name')?.value || '').trim() || 'Graupaer Keller-Kicker-Cup';
    const winGoals = parseInt(document.getElementById('kk-cfg-wingoals')?.value || '6', 10) || 6;
    const midfield = document.getElementById('kk-cfg-midfield')?.value || 'Zählen voll (Erlaubt)';
    const spin = document.getElementById('kk-cfg-spin')?.value || 'Streng verboten (Foul!)';
    const deuce = document.getElementById('kk-cfg-deuce')?.value || 'Nein (Entscheidungstor zählt sofort)';
    const zeroRule = document.getElementById('kk-cfg-zero')?.value || 'Tisch-Krabbel-Pflicht! 🐛';
    const numBlocks = parseInt(document.getElementById('kk-cfg-blocks')?.value || '3', 10) || 3;

    const players = [...kkSetupPlayers];
    let matches = [];
    for (let b = 1; b <= numBlocks; b++) {
        const blockMatches = kkGenerateFairBlockMatches(players, matches, b);
        matches = matches.concat(blockMatches);
    }

    const newTourney = {
        id: 'kkt_' + Date.now(),
        name: name,
        date: new Date().toLocaleDateString('de-DE'),
        status: 'active',
        players: players,
        rules: { winGoals, midfield, spin, deuce, zeroRule },
        numBlocks: numBlocks,
        matches: matches,
        createdAt: new Date().toISOString(),
        _rev: 1,
        _updatedAtMs: Date.now()
    };

    const pwd = sessionStorage.getItem('dippe_admin_pwd');
    if (kkStore.activeTournament && kkStore.activeTournament.matches?.some(m => m.done)) {
        if (!Array.isArray(kkStore.archive)) kkStore.archive = [];
        kkStore.activeTournament.status = 'ended';
        if (!kkStore.archive.some(a => a.id === kkStore.activeTournament.id)) {
            kkStore.archive.unshift(kkStore.activeTournament);
        }
    }
    kkStore.activeTournament = newTourney;
    kkUndoStack = [];
    kkViewingId = 'active';
    kkSelectedMatchId = matches[0]?.id || null;
    kkDraftGoalsA = winGoals;
    kkDraftGoalsB = Math.max(0, winGoals - 2);

    kkCloseSetupPanel();
    kkRenderAll();
    kkQueueCloudSync({ action: 'save_store', password: pwd });
}

function kkAppendFairBlock() {
    const t = kkGetViewedTournament();
    if (!t || t.status === 'ended') {
        alert('Dieses Turnier ist bereits beendet.');
        return;
    }
    const nextBlockNr = (t.numBlocks || 1) + 1;
    const more = kkGenerateFairBlockMatches(t.players, t.matches, nextBlockNr);
    t.matches = t.matches.concat(more);
    t.numBlocks = nextBlockNr;

    const nextOpen = t.matches.find(m => !m.done);
    if (nextOpen) kkSelectedMatchId = nextOpen.id;

    kkRenderAll();
    kkQueueCloudSync({ action: 'public_update_active' });
}

async function kkFinishTournament() {
    if (!kkAdminUnlocked) { await kkToggleAdmin(); if (!kkAdminUnlocked) return; }
    const t = kkStore.activeTournament;
    if (!t) return;

    const playedCount = t.matches.filter(m => m.done).length;
    if (playedCount === 0 && !confirm('Es wurde noch kein Spiel eingetragen. Turnier trotzdem beenden?')) return;
    if (playedCount > 0 && !confirm('Kickerabend jetzt offiziell beenden und den Keller-Champion küren?')) return;

    t.status = 'ended';
    t.endedAt = new Date().toISOString();
    if (!Array.isArray(kkStore.archive)) kkStore.archive = [];
    const existingIdx = kkStore.archive.findIndex(a => a.id === t.id);
    if (existingIdx >= 0) kkStore.archive[existingIdx] = JSON.parse(JSON.stringify(t));
    else kkStore.archive.unshift(JSON.parse(JSON.stringify(t)));

    kkRenderAll();
    const pwd = sessionStorage.getItem('dippe_admin_pwd');
    kkQueueCloudSync({ action: 'save_store', password: pwd });
}

async function kkDeleteCurrentTournament() {
    if (!kkAdminUnlocked) { await kkToggleAdmin(); if (!kkAdminUnlocked) return; }
    const t = kkGetViewedTournament();
    if (!t) return;
    if (!confirm(`Möchtest du das Kicker-Turnier „${t.name}“ wirklich unwiderruflich löschen?`)) return;

    if (kkViewingId === 'active' || (kkStore.activeTournament && kkStore.activeTournament.id === t.id)) {
        kkStore.activeTournament = null;
    }
    if (Array.isArray(kkStore.archive)) {
        kkStore.archive = kkStore.archive.filter(a => a.id !== t.id);
    }
    if (!kkStore.activeTournament && kkStore.archive.length > 0) {
        kkStore.activeTournament = kkStore.archive[0];
    }
    kkUndoStack = [];
    kkViewingId = 'active';
    kkRenderAll();
    const pwd = sessionStorage.getItem('dippe_admin_pwd');
    kkQueueCloudSync({ action: 'save_store', password: pwd });
}

function kkSelectTournamentView(val) {
    kkViewingId = val;
    kkSelectedMatchId = null;
    kkRenderAll();
}

function kkGetViewedTournament() {
    if (kkViewingId === 'active') return kkStore.activeTournament;
    return (kkStore.archive || []).find(a => a.id === kkViewingId) || kkStore.activeTournament;
}

// ===================================================================
// 5. BOMBENSICHERE ERGEBNIS-EINGABE (MIT DOPPELTIPP-SCHUTZ & UNDO)
// ===================================================================
function kkSelectMatchForEntry(matchId) {
    const t = kkGetViewedTournament();
    if (!t) return;
    const m = t.matches.find(x => x.id === matchId);
    if (!m) return;
    kkSelectedMatchId = m.id;
    const wg = t.rules?.winGoals || 6;
    kkDraftGoalsA = m.done && m.goalsA !== null ? m.goalsA : wg;
    kkDraftGoalsB = m.done && m.goalsB !== null ? m.goalsB : Math.max(0, wg - 2);
    kkRenderAll(true);
}

function kkQuickSaveScore(gA, gB) {
    // 250ms Schutz gegen versehentliches Doppeltippen auf dem Smartphone
    const now = Date.now();
    if (now < kkInputCooldownUntil) return;
    kkInputCooldownUntil = now + 250;

    kkDraftGoalsA = gA;
    kkDraftGoalsB = gB;
    kkSaveCurrentMatchScore();
}

function kkStepDraftGoal(team, delta) {
    if (team === 'A') kkDraftGoalsA = Math.max(0, kkDraftGoalsA + delta);
    else kkDraftGoalsB = Math.max(0, kkDraftGoalsB + delta);
    const elA = document.getElementById('kk-draft-score-a');
    const elB = document.getElementById('kk-draft-score-b');
    if (elA) elA.textContent = String(kkDraftGoalsA);
    if (elB) elB.textContent = String(kkDraftGoalsB);
}

function kkSaveCurrentMatchScore() {
    const t = kkGetViewedTournament();
    if (!t || t.status === 'ended') return;
    const m = t.matches.find(x => x.id === kkSelectedMatchId) || t.matches.find(x => !x.done);
    if (!m) return;

    if (kkDraftGoalsA === kkDraftGoalsB) {
        if (!confirm('Unentschieden eintragen? (Normalerweise wird beim Kicker bis zum Siegtor gespielt)')) return;
    }

    // Snapshot für 1-Klick-Undo sichern
    kkUndoStack.push({
        matchId: m.id,
        prevGoalsA: m.goalsA,
        prevGoalsB: m.goalsB,
        prevDone: m.done,
        prevUpdatedAt: m._updatedAt || 0
    });
    if (kkUndoStack.length > 50) kkUndoStack.shift();

    m.goalsA = kkDraftGoalsA;
    m.goalsB = kkDraftGoalsB;
    m.done = true;
    m.playedAt = new Date().toISOString();
    m._updatedAt = Date.now();

    // Automatisch zum nächsten offenen Spiel weiterschalten
    const nextOpen = t.matches.find(x => !x.done);
    kkSelectedMatchId = nextOpen ? nextOpen.id : m.id;
    const wg = t.rules?.winGoals || 6;
    kkDraftGoalsA = wg;
    kkDraftGoalsB = Math.max(0, wg - 2);

    kkRenderAll(false);
    kkQueueCloudSync({ action: 'public_update_active' });
}

function kkUndoLastMatch() {
    const t = kkGetViewedTournament();
    if (!t || t.status === 'ended' || !kkUndoStack.length) return;
    const last = kkUndoStack.pop();
    const m = t.matches.find(x => x.id === last.matchId);
    if (!m) return;

    m.goalsA = last.prevGoalsA;
    m.goalsB = last.prevGoalsB;
    m.done = last.prevDone;
    m._updatedAt = Date.now();

    kkSelectedMatchId = m.id;
    const wg = t.rules?.winGoals || 6;
    kkDraftGoalsA = m.goalsA !== null ? m.goalsA : wg;
    kkDraftGoalsB = m.goalsB !== null ? m.goalsB : Math.max(0, wg - 2);

    kkRenderAll(false);
    kkQueueCloudSync({ action: 'public_update_active' });
}

// ===================================================================
// 6. AUSWERTUNGS-ENGINE: EINZEL-RANGLISTE, KICKER-ELO & 8 KELLER-AWARDS
// ===================================================================
function kkComputeAnalytics(t) {
    if (!t || !Array.isArray(t.players)) {
        return { standings: [], awards: [], pairsList: [] };
    }

    const playerStats = {};
    t.players.forEach(name => {
        playerStats[name] = {
            name,
            games: 0, wins: 0, losses: 0, draws: 0,
            pts: 0,
            goalsF: 0, goalsA: 0, diff: 0,
            elo: 1000,
            cleanSheetsWon: 0,
            crawledUnderTable: 0,
            clutchWins: 0,
            clutchGames: 0,
            partnersWonWith: new Set(),
            form: []
        };
    });

    const pairStats = {};
    const h2hStats = {};

    const ensurePair = (p1, p2) => {
        const sorted = [p1, p2].sort((a, b) => a.localeCompare(b, 'de'));
        const key = `${sorted[0]} & ${sorted[1]}`;
        if (!pairStats[key]) {
            pairStats[key] = { key, p1: sorted[0], p2: sorted[1], games: 0, wins: 0, losses: 0, goalsF: 0, goalsA: 0, pts: 0 };
        }
        return pairStats[key];
    };

    const doneMatches = (t.matches || []).filter(m => m.done && m.goalsA !== null && m.goalsB !== null);

    doneMatches.forEach(m => {
        const gA = Number(m.goalsA), gB = Number(m.goalsB);
        const [a1, a2] = m.teamA;
        const [b1, b2] = m.teamB;
        if (!playerStats[a1] || !playerStats[a2] || !playerStats[b1] || !playerStats[b2]) return;

        const eloTeamA = (playerStats[a1].elo + playerStats[a2].elo) / 2;
        const eloTeamB = (playerStats[b1].elo + playerStats[b2].elo) / 2;
        const expA = 1 / (1 + Math.pow(10, (eloTeamB - eloTeamA) / 250));
        const scoreA = gA > gB ? 1 : gA < gB ? 0 : 0.5;
        const goalMult = 1 + Math.abs(gA - gB) * 0.08;
        const eloDeltaA = Math.round(28 * goalMult * (scoreA - expA));

        const updatePlayer = (pName, partnerName, myG, oppG, eloDelta) => {
            const st = playerStats[pName];
            st.games++;
            st.goalsF += myG;
            st.goalsA += oppG;
            st.diff = st.goalsF - st.goalsA;
            st.elo += eloDelta;

            if (Math.abs(myG - oppG) === 1) {
                st.clutchGames++;
                if (myG > oppG) st.clutchWins++;
            }

            if (myG > oppG) {
                st.wins++;
                st.pts += 3;
                st.form.push('W');
                st.partnersWonWith.add(partnerName);
                if (oppG === 0) st.cleanSheetsWon++;
            } else if (myG < oppG) {
                st.losses++;
                st.form.push('L');
                if (myG === 0) st.crawledUnderTable++;
            } else {
                st.draws++;
                st.pts += 1;
                st.form.push('D');
            }
        };

        updatePlayer(a1, a2, gA, gB, eloDeltaA);
        updatePlayer(a2, a1, gA, gB, eloDeltaA);
        updatePlayer(b1, b2, gB, gA, -eloDeltaA);
        updatePlayer(b2, b1, gB, gA, -eloDeltaA);

        const pairA = ensurePair(a1, a2);
        const pairB = ensurePair(b1, b2);
        pairA.games++; pairA.goalsF += gA; pairA.goalsA += gB;
        pairB.games++; pairB.goalsF += gB; pairB.goalsA += gA;
        if (gA > gB) { pairA.wins++; pairA.pts += 3; pairB.losses++; }
        else if (gB > gA) { pairB.wins++; pairB.pts += 3; pairA.losses++; }
        else { pairA.pts += 1; pairB.pts += 1; }

        if (gA !== gB) {
            const winners = gA > gB ? m.teamA : m.teamB;
            const losers  = gA > gB ? m.teamB : m.teamA;
            winners.forEach(w => losers.forEach(l => {
                const pairKey = [w, l].sort().join(' vs ');
                if (!h2hStats[pairKey]) h2hStats[pairKey] = { winsBy: {}, total: 0 };
                h2hStats[pairKey].total++;
                h2hStats[pairKey].winsBy[w] = (h2hStats[pairKey].winsBy[w] || 0) + 1;
            }));
        }
    });

    const sortMode = document.getElementById('kk-rank-sort')?.value || 'pts-total';
    const standings = Object.values(playerStats).map(st => ({
        ...st,
        ptsPerGame: st.games > 0 ? (st.pts / st.games) : 0,
        goalsPerGame: st.games > 0 ? (st.goalsF / st.games) : 0,
        concededPerGame: st.games > 0 ? (st.goalsA / st.games) : 0,
        uniqueWinPartners: st.partnersWonWith.size
    }));

    standings.sort((a, b) => {
        if (sortMode === 'pts-avg') {
            if (Math.abs(b.ptsPerGame - a.ptsPerGame) > 1e-4) return b.ptsPerGame - a.ptsPerGame;
        } else if (sortMode === 'elo') {
            if (b.elo !== a.elo) return b.elo - a.elo;
        } else if (sortMode === 'diff') {
            if (b.diff !== a.diff) return b.diff - a.diff;
        }
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if (b.goalsF !== a.goalsF) return b.goalsF - a.goalsF;
        if (b.elo !== a.elo) return b.elo - a.elo;
        return a.name.localeCompare(b.name, 'de');
    });
    standings.forEach((s, i) => s.rank = i + 1);

    const activePlayers = standings.filter(s => s.games > 0);
    const pairsList = Object.values(pairStats).filter(p => p.games > 0).sort((a, b) => {
        const avgA = a.pts / a.games, avgB = b.pts / b.games;
        if (Math.abs(avgB - avgA) > 1e-4) return avgB - avgA;
        return (b.goalsF - b.goalsA) - (a.goalsF - a.goalsA);
    });

    const bestDuo = pairsList[0] || null;
    const worstDuo = [...pairsList].sort((a, b) => (a.pts / a.games) - (b.pts / b.games) || (a.goalsF - a.goalsA) - (b.goalsF - b.goalsA))[0] || null;
    const bomber = [...activePlayers].sort((a, b) => b.goalsPerGame - a.goalsPerGame || b.goalsF - a.goalsF)[0] || null;
    const wall   = [...activePlayers].sort((a, b) => a.concededPerGame - b.concededPerGame || b.wins - a.wins)[0] || null;
    const clutch = [...activePlayers].filter(p => p.clutchWins > 0).sort((a, b) => b.clutchWins - a.clutchWins)[0] || null;
    const backpack = [...activePlayers].sort((a, b) => b.uniqueWinPartners - a.uniqueWinPartners || b.wins - a.wins)[0] || null;
    const crawler = [...activePlayers].filter(p => p.crawledUnderTable > 0).sort((a, b) => b.crawledUnderTable - a.crawledUnderTable)[0] || null;
    const whiteVest = [...activePlayers].filter(p => p.cleanSheetsWon > 0).sort((a, b) => b.cleanSheetsWon - a.cleanSheetsWon)[0] || null;

    let topNemesis = null;
    Object.values(h2hStats).forEach(entry => {
        Object.entries(entry.winsBy).forEach(([winner, wCnt]) => {
            const lCnt = entry.total - wCnt;
            const diff = wCnt - lCnt;
            if (wCnt >= 2 && (!topNemesis || diff > topNemesis.diff || (diff === topNemesis.diff && wCnt > topNemesis.wCnt))) {
                const loser = Object.keys(entry.winsBy).find(k => k !== winner) || '';
                topNemesis = { winner, loser, wCnt, lCnt, diff, total: entry.total };
            }
        });
    });
    if (topNemesis && !topNemesis.loser) {
        Object.entries(h2hStats).forEach(([k, v]) => {
            if (v === topNemesis || v.winsBy[topNemesis.winner] === topNemesis.wCnt) {
                const parts = k.split(' vs ');
                topNemesis.loser = parts[0] === topNemesis.winner ? parts[1] : parts[0];
            }
        });
    }

    const awards = [
        {
            icon: '🤝', title: 'Traum-Duo (Blindes Verständnis)',
            winner: bestDuo ? `${bestDuo.p1} & ${bestDuo.p2}` : 'Noch offen',
            sub: bestDuo ? `${bestDuo.wins}S : ${bestDuo.losses}N · ${bestDuo.goalsF}:${bestDuo.goalsA} Tore (${bestDuo.games} Sp.)` : 'Spielt das erste Match!'
        },
        {
            icon: '💔', title: 'Scheidungs-Duo (Keller-Krise)',
            winner: (worstDuo && pairsList.length > 1) ? `${worstDuo.p1} & ${worstDuo.p2}` : 'Noch harmonisch',
            sub: (worstDuo && pairsList.length > 1) ? `${worstDuo.wins}S : ${worstDuo.losses}N · Diff ${worstDuo.goalsF - worstDuo.goalsA} (${worstDuo.games} Sp.)` : 'Noch keine Krise'
        },
        {
            icon: '🚀', title: 'Ballermann (Tormaschine)',
            winner: bomber ? bomber.name : 'Noch offen',
            sub: bomber ? `Ø ${bomber.goalsPerGame.toFixed(1)} Tore/Spiel (${bomber.goalsF} Treffer gesamt)` : '–'
        },
        {
            icon: '🧱', title: 'Die Mauer von Graupa',
            winner: wall ? wall.name : 'Noch offen',
            sub: wall ? `Nur Ø ${wall.concededPerGame.toFixed(1)} Gegentore/Spiel (${wall.goalsA} kassiert)` : '–'
        },
        {
            icon: '🔥', title: 'Nerven aus Drahtseilen (Krimi-König)',
            winner: clutch ? clutch.name : 'Noch kein 1-Tor-Krimi',
            sub: clutch ? `${clutch.clutchWins}× mit genau 1 Tor Vorsprung gewonnen!` : 'Entscheidet knappe Spiele!'
        },
        {
            icon: '🎒', title: 'Rucksack-Award (Universal-Genie)',
            winner: backpack ? backpack.name : 'Noch offen',
            sub: backpack ? `Hat schon mit ${backpack.uniqueWinPartners} verschiedenen Partnern gewonnen!` : '–'
        },
        {
            icon: '🩸', title: 'Angstgegner-Duell',
            winner: topNemesis ? `${topNemesis.winner} ▶ ${topNemesis.loser}` : 'Noch ausgeglichen',
            sub: topNemesis ? `${topNemesis.wCnt} : ${topNemesis.lCnt} Siege im direkten Aufeinandertreffen` : 'Noch keine Dominanz'
        },
        {
            icon: '🐛', title: 'Tisch-Krabbel-Bilanz (Zu Null)',
            winner: crawler ? `${crawler.name} (${crawler.crawledUnderTable}× 0:x)` : (whiteVest ? `${whiteVest.name} (${whiteVest.cleanSheetsWon}× Zu-Null)` : 'Noch keine 0:x Klatsche!'),
            sub: crawler ? `Musste ${crawler.crawledUnderTable}× zu Null drunter durch!` : 'Alle haben mindestens 1 Ehrentor geschossen'
        }
    ];

    return { standings, awards, pairsList };
}

// ===================================================================
// 7. KOMPLETTES RENDERING DER KICKERABEND-SEITE (OHNE SCROLL-SPRINGEN)
// ===================================================================
function kkRenderAll(manualSelect = false) {
    kkUpdateAdminUI();

    const activeT = kkStore.activeTournament;
    const archive = kkStore.archive || [];

    const archSel = document.getElementById('kk-archive-select');
    if (archSel) {
        const opts = [];
        if (activeT) {
            opts.push(`<option value="active">${domEsc(activeT.name)} (${activeT.status === 'ended' ? 'Beendet' : 'Live'})</option>`];
        }
        archive.forEach(a => {
            if (!activeT || a.id !== activeT.id) {
                opts.push(`<option value="${domEsc(a.id)}">Archiv: ${domEsc(a.name)} (${domEsc(a.date || '')})</option>`);
            }
        });
        if (!opts.length) opts.push(`<option value="active">Noch kein Turnier gestartet</option>`);
        archSel.innerHTML = opts.join('');
        if ([...archSel.options].some(o => o.value === kkViewingId)) archSel.value = kkViewingId;
        else kkViewingId = 'active';
    }

    const t = kkGetViewedTournament();
    const badge = document.getElementById('kk-status-badge');
    const title = document.getElementById('kk-header-title');
    const rulesBanner = document.getElementById('kk-rules-banner');

    if (!t) {
        if (badge) { badge.textContent = '⚙️ Setup bereit'; badge.style.background = '#fbbf24'; }
        if (title) title.textContent = 'Graupaer Keller-Kicker-Cup';
        if (rulesBanner) rulesBanner.classList.add('hidden');
        document.getElementById('kk-active-match-box').innerHTML = `
            <div style="text-align:center; padding:18px; color:var(--text-muted);">
                Noch kein aktives Kicker-Turnier. Entsperre oben rechts den <b>🔒 Admin-Modus</b> und klicke auf <b>„➕ Neues Turnier / Setup“</b>, um Spieler und Keller-Regeln festzulegen!
            </div>
        `;
        document.getElementById('kk-leaderboard-tbody').innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#64748b;">Noch keine Teilnehmer.</td></tr>`;
        document.getElementById('kk-schedule-list').innerHTML = `<div style="padding:16px; text-align:center; color:#64748b;">Noch kein Spielplan generiert.</div>`;
        document.getElementById('kk-awards-grid').innerHTML = '';
        return;
    }

    const isEnded = t.status === 'ended';
    if (badge) {
        badge.textContent = isEnded ? '🏁 Beendet & Ausgewertet' : '🟢 Turnier läuft';
        badge.style.background = isEnded ? '#fbbf24' : '#10b981';
    }
    if (title) title.textContent = `⚽ ${t.name} (${t.date || ''})`;

    if (rulesBanner && t.rules) {
        rulesBanner.classList.remove('hidden');
        rulesBanner.innerHTML = `
            <span>🎯 <b>Siegpunkt:</b> ${t.rules.winGoals} Tore</span>
            <span>·</span>
            <span>⚡ <b>Mittelfeldtore:</b> ${domEsc(t.rules.midfield)}</span>
            <span>·</span>
            <span>🌪️ <b>Kurbeln:</b> ${domEsc(t.rules.spin)}</span>
            <span>·</span>
            <span>🔥 <b>Deuce:</b> ${domEsc(t.rules.deuce)}</span>
            <span>·</span>
            <span>🐛 <b>Bei 0:${t.rules.winGoals}:</b> ${domEsc(t.rules.zeroRule)}</span>
            <span id="kk-sync-indicator" style="margin-left:auto; font-weight:800; color:#34d399;">${domEsc(kkSyncStatusText)}</span>
        `;
    }

    const totalM = t.matches.length;
    const doneM = t.matches.filter(m => m.done).length;
    const pct = totalM > 0 ? Math.round((doneM / totalM) * 100) : 0;
    const fbInfo = kkFairBlockInfo(t.players.length);
    const isAtFairCheckpoint = doneM > 0 && (doneM % fbInfo.matchesPerBlock === 0);
    const nextCheckpointM = (Math.floor(doneM / fbInfo.matchesPerBlock) + 1) * fbInfo.matchesPerBlock;
    const gamesToNextCheckpoint = nextCheckpointM - doneM;

    document.getElementById('kk-progress-text').textContent = `${doneM} von ${totalM} geplanten Spielen absolviert (${t.players.length} Spieler)`;
    document.getElementById('kk-progress-fill').style.width = `${pct}%`;

    const cpPill = document.getElementById('kk-checkpoint-pill');
    const cpHint = document.getElementById('kk-checkpoint-hint');
    if (isAtFairCheckpoint) {
        if (cpPill) {
            cpPill.textContent = `⚖️ FAIR-CHECKPOINT ERREICHT! (Jeder hat exakt ${(doneM * 4) / t.players.length} Spiele)`;
            cpPill.style.background = 'rgba(16,185,129,0.25)';
            cpPill.style.color = '#34d399';
            cpPill.style.borderColor = '#34d399';
        }
        if (cpHint) cpHint.textContent = `✓ Perfekter Ausstiegspunkt erreicht! Alle haben gleich viele Spiele.`;
    } else {
        if (cpPill) {
            cpPill.textContent = `⏳ Noch ${gamesToNextCheckpoint} ${gamesToNextCheckpoint === 1 ? 'Spiel' : 'Spiele'} bis Fair-Checkpoint #${Math.floor(doneM / fbInfo.matchesPerBlock) + 1}`;
            cpPill.style.background = 'rgba(251,191,36,0.18)';
            cpPill.style.color = '#fbbf24';
            cpPill.style.borderColor = 'rgba(251,191,36,0.4)';
        }
        if (cpHint) cpHint.textContent = `Nächster Gleichstands-Checkpoint nach Spiel #${nextCheckpointM}`;
    }

    const curMatch = t.matches.find(x => x.id === kkSelectedMatchId) || t.matches.find(x => !x.done) || t.matches[t.matches.length - 1];
    if (curMatch) kkSelectedMatchId = curMatch.id;
    kkRenderActiveMatchArena(t, curMatch, isEnded);

    const { standings, awards, pairsList } = kkComputeAnalytics(t);
    kkRenderPodium(t, standings, isEnded);
    kkRenderLeaderboard(standings);
    kkRenderSchedule(t, curMatch, fbInfo, manualSelect);
    kkRenderAwardsAndPairs(awards, pairsList);
}

function kkRenderActiveMatchArena(t, m, isEnded) {
    const box = document.getElementById('kk-active-match-box');
    const titleEl = document.getElementById('kk-active-match-title');
    const eyeEl = document.getElementById('kk-active-match-eyebrow');
    if (!box || !m) return;

    const wg = t.rules?.winGoals || 6;
    const bench = t.players.filter(p => !m.teamA.includes(p) && !m.teamB.includes(p));

    if (eyeEl) eyeEl.textContent = `Spiel #${m.nr} (Fair-Block ${m.block}) · ${m.done ? 'Bereits eingetragen (Modus: Korrektur)' : 'Jetzt am Tisch'}`;
    if (titleEl) titleEl.textContent = `⚽ ${m.teamA[0]} & ${m.teamA[1]}  vs.  ${m.teamB[0]} & ${m.teamB[1]}`;

    const quickWinsA = [];
    const quickWinsB = [];
    for (let loseG = 0; loseG < wg; loseG++) {
        quickWinsA.push(`<button type="button" class="btn btn-emerald" style="font-family:'JetBrains Mono',monospace; font-size:13.5px; padding:8px 11px;" onclick="kkQuickSaveScore(${wg}, ${loseG})">${wg}:${loseG}</button>`);
    }
    for (let loseG = wg - 1; loseG >= 0; loseG--) {
        quickWinsB.push(`<button type="button" class="btn btn-amber" style="font-family:'JetBrains Mono',monospace; font-size:13.5px; padding:8px 11px;" onclick="kkQuickSaveScore(${loseG}, ${wg})">${loseG}:${wg}</button>`);
    }

    const canUndo = kkUndoStack.length > 0;

    box.innerHTML = `
        <div class="grid-2" style="gap:14px; align-items:stretch; margin-bottom:14px;">
            <!-- TEAM A (GRÜN) -->
            <div style="background:rgba(16,185,129,0.14); border:2px solid #34d399; border-radius:18px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                    <div style="font-size:11px; font-weight:800; color:#34d399; text-transform:uppercase;">🟢 Team A (Heim-Seite)</div>
                    <div style="font-size:clamp(18px, 2vw, 23px); font-weight:800; color:#fff; margin-top:3px;">
                        ${domEsc(m.teamA[0])} <span style="color:#34d399;">&</span> ${domEsc(m.teamA[1])}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="btn btn-dark" style="padding:6px 11px; font-size:16px;" onclick="kkStepDraftGoal('A', -1)">−</button>
                    <span id="kk-draft-score-a" style="font-family:'JetBrains Mono',monospace; font-size:32px; font-weight:800; color:#fff; min-width:38px; text-align:center;">${kkDraftGoalsA}</span>
                    <button type="button" class="btn btn-emerald" style="padding:6px 11px; font-size:16px;" onclick="kkStepDraftGoal('A', 1)">+</button>
                </div>
            </div>

            <!-- TEAM B (GOLD) -->
            <div style="background:rgba(245,158,11,0.14); border:2px solid #fbbf24; border-radius:18px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                    <div style="font-size:11px; font-weight:800; color:#fbbf24; text-transform:uppercase;">🟡 Team B (Gast-Seite)</div>
                    <div style="font-size:clamp(18px, 2vw, 23px); font-weight:800; color:#fff; margin-top:3px;">
                        ${domEsc(m.teamB[0])} <span style="color:#fbbf24;">&</span> ${domEsc(m.teamB[1])}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="btn btn-dark" style="padding:6px 11px; font-size:16px;" onclick="kkStepDraftGoal('B', -1)">−</button>
                    <span id="kk-draft-score-b" style="font-family:'JetBrains Mono',monospace; font-size:32px; font-weight:800; color:#fff; min-width:38px; text-align:center;">${kkDraftGoalsB}</span>
                    <button type="button" class="btn btn-amber" style="padding:6px 11px; font-size:16px;" onclick="kkStepDraftGoal('B', 1)">+</button>
                </div>
            </div>
        </div>

        ${!isEnded ? `
            <div style="background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:12px 14px;">
                <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
                        <span style="font-size:11px; font-weight:800; color:#34d399; text-transform:uppercase; margin-right:2px;">⚡ 1-Tap Sieg Team A:</span>
                        ${quickWinsA.join('')}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
                        <span style="font-size:11px; font-weight:800; color:#fbbf24; text-transform:uppercase; margin-right:2px;">⚡ 1-Tap Sieg Team B:</span>
                        ${quickWinsB.join('')}
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-left:auto;">
                        ${canUndo ? `
                            <button type="button" class="btn btn-dark" style="padding:9px 13px; font-size:12.5px; border:1px solid rgba(251,191,36,0.5); color:#fbbf24;" onclick="kkUndoLastMatch()" title="Letztes eingetragenes Ergebnis rückgängig machen">
                                ↩ Rückgängig
                            </button>
                        ` : ''}
                        <button type="button" class="btn btn-emerald" style="padding:9px 16px; font-size:13px;" onclick="kkSaveCurrentMatchScore()">
                            ✅ Manuelles Ergebnis (${kkDraftGoalsA}:${kkDraftGoalsB}) speichern
                        </button>
                    </div>
                </div>
            </div>
        ` : ''}

        ${bench.length > 0 ? `
            <div style="margin-top:10px; font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span>🍺 <b>Aktuell auf der Pausen-Bank (und als Nächstes vorrangig dran):</b></span>
                ${bench.map(p => `<span class="badge" style="background:rgba(255,255,255,0.08); color:#fff; font-size:11.5px; padding:3px 9px;">${domEsc(p)}</span>`).join('')}
            </div>
        ` : ''}
    `;
}

function kkRenderPodium(t, standings, isEnded) {
    const pod = document.getElementById('kk-podium-box');
    if (!pod) return;
    if (!isEnded || standings.length === 0) {
        pod.classList.add('hidden');
        pod.innerHTML = '';
        return;
    }
    const p1 = standings[0], p2 = standings[1], p3 = standings[2];
    pod.classList.remove('hidden');
    pod.innerHTML = `
        <div class="hero-card" style="background:linear-gradient(135deg,#0f2922,#1e3a2f); border:2px solid #fbbf24; text-align:center; padding:22px; margin-bottom:0;">
            <span class="eyebrow">🏆 Offizieller Keller-Kicker-Champion · ${domEsc(t.name)}</span>
            <h3 style="font-size:28px; font-weight:800; color:#fff; margin:4px 0 14px;">👑 ${domEsc(p1.name)} (${p1.pts} Pkt. · Diff ${p1.diff > 0 ? '+' : ''}${p1.diff})</h3>
            <div class="tp-podium">
                ${p2 ? `<div class="tp-podium-col"><div class="tp-podium-block tp-podium-2"><div class="tp-podium-rank">🥈</div><div class="tp-podium-name">${domEsc(p2.name)}</div><div class="tp-podium-club">${p2.pts} Pkt. (${p2.goalsF}:${p2.goalsA})</div></div></div>` : ''}
                <div class="tp-podium-col"><div class="tp-podium-block tp-podium-1"><div class="tp-podium-rank">🥇</div><div class="tp-podium-name">${domEsc(p1.name)}</div><div class="tp-podium-club">${p1.pts} Pkt. (${p1.goalsF}:${p1.goalsA})</div></div></div>
                ${p3 ? `<div class="tp-podium-col"><div class="tp-podium-block tp-podium-3"><div class="tp-podium-rank">🥉</div><div class="tp-podium-name">${domEsc(p3.name)}</div><div class="tp-podium-club">${p3.pts} Pkt. (${p3.goalsF}:${p3.goalsA})</div></div></div>` : ''}
            </div>
        </div>
    `;
}

function kkRenderLeaderboard(standings) {
    const tbody = document.getElementById('kk-leaderboard-tbody');
    if (!tbody) return;
    if (!standings.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px;">Noch keine Daten.</td></tr>`;
        return;
    }

    tbody.innerHTML = standings.map(s => {
        const medal = s.rank === 1 ? '🥇 ' : s.rank === 2 ? '🥈 ' : s.rank === 3 ? '🥉 ' : '';
        const diffStr = s.diff > 0 ? `+${s.diff}` : String(s.diff);
        const diffCol = s.diff > 0 ? '#059669' : s.diff < 0 ? '#dc2626' : '#64748b';
        const formIcons = s.form.slice(-4).map(f => f === 'W' ? '🟢' : f === 'L' ? '🔴' : '⚪').join('');

        return `
            <tr class="${s.rank === 1 && s.games > 0 ? 'graupa-row' : ''}">
                <td style="font-family:'JetBrains Mono',monospace; font-weight:800;">${medal}${s.rank}.</td>
                <td>
                    <div style="font-weight:800; font-size:13.5px;">${domEsc(s.name)} <span style="font-size:10px;">${formIcons}</span></div>
                </td>
                <td style="text-align:center; font-family:'JetBrains Mono',monospace;">${s.games}</td>
                <td style="text-align:center; font-family:'JetBrains Mono',monospace; font-weight:700;">${s.wins}:${s.losses}</td>
                <td style="text-align:center; font-family:'JetBrains Mono',monospace; color:#475569;">${s.goalsF}:${s.goalsA}</td>
                <td style="text-align:center; font-family:'JetBrains Mono',monospace; font-weight:700; color:${diffCol};">${diffStr}</td>
                <td style="text-align:center; font-family:'JetBrains Mono',monospace; font-size:12px;">${s.ptsPerGame.toFixed(2)}</td>
                <td style="text-align:right; font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:800; color:var(--emerald-dark);">${s.pts}</td>
                <td style="text-align:right; font-family:'JetBrains Mono',monospace; font-weight:700; color:#475569;">${s.elo}</td>
            </tr>
        `;
    }).join('');
}

function kkRenderSchedule(t, curMatch, fbInfo, manualSelect = false) {
    const listEl = document.getElementById('kk-schedule-list');
    if (!listEl) return;

    // Bisherige Scrollposition merken, damit die Liste beim Neuzeichnen nicht ruckelt!
    const prevScrollTop = listEl.scrollTop;

    const html = [];
    t.matches.forEach((m, idx) => {
        const isSel = curMatch && m.id === curMatch.id;
        const isAWin = m.done && m.goalsA > m.goalsB;
        const isBWin = m.done && m.goalsB > m.goalsA;
        const borderStyle = isSel ? 'border:2px solid var(--emerald-dark); background:#ecfdf5;' : '';

        html.push(`
            <div id="kk-sched-row-${m.id}" class="tp-match ${m.done ? 'done' : ''}" style="${borderStyle}; opacity:${m.done && !isSel ? '0.82' : '1'};" onclick="kkSelectMatchForEntry('${m.id}')">
                <span style="font-family:'JetBrains Mono',monospace; font-weight:800; font-size:11.5px; color:#64748b; width:34px;">#${m.nr}</span>
                <span class="tp-match-names" style="text-decoration:none; font-size:12.8px;">
                    <span style="${isAWin ? 'color:var(--emerald-dark);font-weight:800;' : ''}">${domEsc(m.teamA[0])} & ${domEsc(m.teamA[1])}</span>
                    <span style="color:#94a3b8; margin:0 5px;">vs.</span>
                    <span style="${isBWin ? 'color:#d97706;font-weight:800;' : ''}">${domEsc(m.teamB[0])} & ${domEsc(m.teamB[1])}</span>
                </span>
                ${m.done
                    ? `<span class="tp-match-res" style="font-family:'JetBrains Mono',monospace; font-size:13.5px;">${m.goalsA}:${m.goalsB}</span>`
                    : `<span class="tp-badge ${isSel ? 'tp-badge-run' : 'tp-badge-open'}">${isSel ? 'am Tisch' : 'offen'}</span>`
                }
            </div>
        `);

        if ((idx + 1) % fbInfo.matchesPerBlock === 0) {
            const blockNr = (idx + 1) / fbInfo.matchesPerBlock;
            const gamesEach = blockNr * fbInfo.gamesPerPlayerPerBlock;
            const blockDone = t.matches.slice(0, idx + 1).every(x => x.done);
            html.push(`
                <div style="background:${blockDone ? '#d1fae5' : '#fef3c7'}; border:1.5px dashed ${blockDone ? '#059669' : '#f59e0b'}; color:${blockDone ? '#065f46' : '#92400e'}; border-radius:10px; padding:6px 12px; font-size:11.5px; font-weight:800; text-align:center; margin:3px 0 6px;">
                    ⚖️ ${blockDone ? '✓ ' : ''}FAIR-STOPP CHECKPOINT #${blockNr} · Jeder Spieler hat hier exakt ${gamesEach} Spiele absolviert!
                </div>
            `);
        }
    });

    listEl.innerHTML = html.join('');
    listEl.scrollTop = prevScrollTop;

    // Sanftes Nachführen innerhalb der Spielplan-Box (ohne die Hauptseite zu verschieben),
    // wenn automatisch zum nächsten offenen Spiel weitergeschaltet wurde:
    if (!manualSelect && curMatch) {
        const activeRow = document.getElementById('kk-sched-row-' + curMatch.id);
        if (activeRow) {
            const rowTop = activeRow.offsetTop - listEl.offsetTop;
            const rowBottom = rowTop + activeRow.offsetHeight;
            if (rowBottom > listEl.scrollTop + listEl.clientHeight || rowTop < listEl.scrollTop) {
                listEl.scrollTo({ top: Math.max(0, rowTop - 80), behavior: 'smooth' });
            }
        }
    }
}

function kkRenderAwardsAndPairs(awards, pairsList) {
    const grid = document.getElementById('kk-awards-grid');
    if (grid) {
        grid.innerHTML = awards.map(a => `
            <div class="sport-stat-box" style="background:rgba(255,255,255,0.04); border:1px solid rgba(52,211,153,0.22);">
                <div class="telemetry-label">${a.icon} ${domEsc(a.title)}</div>
                <div style="font-size:16.5px; font-weight:800; color:#fff; margin:5px 0 3px;">${domEsc(a.winner)}</div>
                <div style="font-size:11.5px; color:var(--text-muted); line-height:1.4;">${domEsc(a.sub)}</div>
            </div>
        `).join('');
    }

    const pairBox = document.getElementById('kk-pairings-detail-box');
    if (pairBox) {
        if (!pairsList.length) {
            pairBox.innerHTML = `<p style="font-size:12.5px; color:var(--text-muted);">Noch keine Doppel-Spiele abgeschlossen.</p>`;
            return;
        }
        pairBox.innerHTML = `
            <table class="tt-data-table" style="color:var(--text-cream);">
                <thead>
                    <tr>
                        <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">#</th>
                        <th style="background:rgba(255,255,255,0.06); color:#fbbf24;">Doppel-Paarung</th>
                        <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:center;">Gemeinsame Spiele</th>
                        <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:center;">Bilanz (S:N)</th>
                        <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:center;">Tore</th>
                        <th style="background:rgba(255,255,255,0.06); color:#fbbf24; text-align:right;">Punkte</th>
                    </tr>
                </thead>
                <tbody>
                    ${pairsList.map((p, idx) => `
                        <tr>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); font-family:'JetBrains Mono',monospace;">${idx + 1}.</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); font-weight:800; color:#fff;">🤝 ${domEsc(p.key)}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:center; font-family:'JetBrains Mono',monospace;">${p.games}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:center; font-family:'JetBrains Mono',monospace; font-weight:700; color:#34d399;">${p.wins}:${p.losses}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:center; font-family:'JetBrains Mono',monospace;">${p.goalsF}:${p.goalsA}</td>
                            <td style="border-bottom-color:rgba(255,255,255,0.08); text-align:right; font-family:'JetBrains Mono',monospace; font-weight:800; color:#fbbf24;">${p.pts}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}