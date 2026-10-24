// ===================================================================
// TOP-10 HIGHSCORE SYSTEM (LOKAL + GOOGLE DRIVE SYNC) (js/highscores.js)
// ===================================================================

const DEFAULT_HIGHSCORES = {
    tetris: [
        { name: 'Pi', score: 2400, label: '2.400 Pkt.' },
        { name: 'David', score: 1500, label: '1.500 Pkt.' },
        { name: 'Alwin', score: 900, label: '900 Pkt.' }
    ],
    minesweeper: [
        { name: 'Pi', score: 850, label: '850 Pkt. (25s)' }
    ],
    snake: [
        { name: 'Pi', score: 180, label: '180 Pkt.' },
        { name: 'Lili', score: 90, label: '90 Pkt.' }
    ]
};

let pendingHighscore = null;
let highscoreData = null;

function getHighscoreStore() {
    if (!highscoreData) {
        const legacy = (typeof pinnwandData !== 'undefined' && pinnwandData && typeof pinnwandData === 'object') ? pinnwandData.highscores : null;
        const raw = localStorage.getItem('dippe_highscores_v1');
        highscoreData = raw ? JSON.parse(raw) : (legacy || JSON.parse(JSON.stringify(DEFAULT_HIGHSCORES)));
    }
    return highscoreData;
}

function saveHighscoreStore(store) {
    highscoreData = store;
    try { localStorage.setItem('dippe_highscores_v1', JSON.stringify(store)); } catch (e) {}
    if (CONFIG.pinnwandCloudUrl && CONFIG.pinnwandCloudUrl.startsWith('https://script.google.com/')) {
        fetch(CONFIG.pinnwandCloudUrl, {
            method: 'POST', redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ kind: 'highscores', data: store })
        }).catch(err => console.warn('Highscore-Cloud-Save fehlgeschlagen:', err));
    }
    renderAllHighscores();
}

async function loadHighscoresFromCloud() {
    if (!(CONFIG.pinnwandCloudUrl && CONFIG.pinnwandCloudUrl.startsWith('https://script.google.com/'))) return;
    try {
        const res = await fetch(CONFIG.pinnwandCloudUrl + '?kind=highscores&t=' + Date.now(), { method: 'GET', redirect: 'follow' });
        if (!res.ok) return;
        const j = await res.json();
        const cloud = (j && j.data) ? j.data : (j && !j.empty && (j.tetris || j.snake || j.minesweeper) ? j : null);
        if (!cloud) {
            saveHighscoreStore(getHighscoreStore());
            return;
        }
        const local = getHighscoreStore();
        const merged = {};
        ['tetris', 'minesweeper', 'snake'].forEach(game => {
            const all = [].concat(local[game] || [], cloud[game] || []);
            const seen = new Set(); const uniq = [];
            all.sort((a, b) => b.score - a.score).forEach(e => { const key = e.name + '|' + e.score; if (!seen.has(key)) { seen.add(key); uniq.push(e); } });
            merged[game] = uniq.slice(0, 10);
        });
        highscoreData = merged;
        try { localStorage.setItem('dippe_highscores_v1', JSON.stringify(merged)); } catch (e) {}
        renderAllHighscores();
    } catch (err) { console.warn('Highscores laden fehlgeschlagen:', err); }
}

function renderAllHighscores() {
    const store = getHighscoreStore();
    const titles = { tetris: '🏆 Top 10 · Tetris', minesweeper: '🏆 Top 10 · Minesweeper', snake: '🏆 Top 10 · Snake' };
    ['tetris', 'minesweeper', 'snake'].forEach(game => {
        const box = document.getElementById('hs-box-' + game);
        if (!box) return;
        const list = (store[game] || []).slice(0, 10);
        box.innerHTML = `
            <h4><span>${titles[game]}</span><span style="font-size:11px; opacity:0.75;">Bestenliste</span></h4>
            <ul class="hs-list">
                ${list.length === 0 ? '<li class="hs-item"><span class="hs-name">Noch keine Einträge</span></li>' :
                  list.map((entry, idx) => `
                    <li class="hs-item ${idx === 0 ? 'top-1' : ''}">
                        <span class="hs-rank">${idx + 1}.</span>
                        <span class="hs-name">${domEsc(entry.name)}</span>
                        <span class="hs-val">${domEsc(entry.label || entry.score)}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    });
}

function checkAndOfferHighscore(game, score, label) {
    if (!score || score <= 0) return;
    const store = getHighscoreStore();
    const list = store[game] || [];
    const qualifies = list.length < 10 || score > list[list.length - 1].score;
    if (!qualifies) return;

    pendingHighscore = { game, score, label };
    const gameNames = { tetris: 'Tetris', minesweeper: 'Minesweeper', snake: 'Snake' };
    document.getElementById('hs-modal-title').textContent = `🏆 Top 10 in ${gameNames[game]}!`;
    document.getElementById('hs-modal-text').textContent = `Stark! Du hast ${label} erreicht und bist in den Top 10. Trag deinen Namen in die Bestenliste ein:`;
    const inp = document.getElementById('hs-player-name');
    inp.value = localStorage.getItem('dippe_last_player') || '';
    document.getElementById('hs-modal').classList.add('open');
    setTimeout(() => inp.focus(), 80);
}

function submitHighscoreName(e) {
    e.preventDefault();
    if (!pendingHighscore) return;
    const name = document.getElementById('hs-player-name').value.trim() || 'Anonym';
    try { localStorage.setItem('dippe_last_player', name); } catch (err) {}

    const store = getHighscoreStore();
    const list = store[pendingHighscore.game] || [];
    list.push({ name, score: pendingHighscore.score, label: pendingHighscore.label, date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    store[pendingHighscore.game] = list.slice(0, 10);

    pendingHighscore = null;
    closeHighscoreModal();
    saveHighscoreStore(store);
}

function closeHighscoreModal() {
    document.getElementById('hs-modal').classList.remove('open');
    pendingHighscore = null;
}