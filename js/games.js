// -----------------------------------------------------------------
// 9. TETRIS (mobil bedienbar, Tastatur + Touch)
// -----------------------------------------------------------------
let tetris = { board: [], piece: null, next: null, score: 0, lines: 0, level: 1, timer: null, over: false, running: false };
const TETRIS_COLORS = ['#22d3ee','#3b82f6','#f97316','#facc15','#a855f7','#22c55e','#ef4444'];
const TETRIS_SHAPES = [
    [[1,1,1,1]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]],
    [[1,1],[1,1]], [[0,1,1],[1,1,0]], [[0,1,0],[1,1,1]], [[1,1,0],[0,1,1]]
];
const TETRIS_W = 10, TETRIS_H = 20;

function tetrisMakePiece() {
    const i = Math.floor(Math.random() * TETRIS_SHAPES.length);
    return { shape: TETRIS_SHAPES[i].map(r => [...r]), color: TETRIS_COLORS[i], x: 3, y: 0 };
}
function tetrisInitBoard() { tetris.board = Array.from({length:TETRIS_H}, () => Array(TETRIS_W).fill(0)); }
function tetrisCollides(p, dx=0, dy=0, shape=p.shape) {
    return shape.some((row, y) => row.some((cell, x) => cell &&
        (p.x + x + dx < 0 || p.x + x + dx >= TETRIS_W || p.y + y + dy >= TETRIS_H ||
         (p.y + y + dy >= 0 && tetris.board[p.y + y + dy][p.x + x + dx]))));
}
function tetrisRotateMatrix(m) {
    return m[0].map((_, i) => m.map(row => row[i]).reverse());
}
function tetrisRotate() {
    if (!tetris.running || tetris.over) return;
    const rotated = tetrisRotateMatrix(tetris.piece.shape);
    for (const shift of [0,-1,1,-2,2]) {
        if (!tetrisCollides(tetris.piece, shift, 0, rotated)) { tetris.piece.x += shift; tetris.piece.shape = rotated; tetrisDraw(); return; }
    }
}
function tetrisMove(dx) { if (tetris.running && !tetrisCollides(tetris.piece, dx, 0)) { tetris.piece.x += dx; tetrisDraw(); } }
function tetrisLock() {
    tetris.piece.shape.forEach((row,y) => row.forEach((cell,x) => { if (cell && tetris.piece.y+y >= 0) tetris.board[tetris.piece.y+y][tetris.piece.x+x] = tetris.piece.color; }));
    let cleared = 0;
    for (let y=TETRIS_H-1; y>=0; y--) if (tetris.board[y].every(Boolean)) { tetris.board.splice(y,1); tetris.board.unshift(Array(TETRIS_W).fill(0)); cleared++; y++; }
    if (cleared) { tetris.lines += cleared; tetris.score += [0,100,300,500,800][cleared] * tetris.level; if (document.getElementById('tetris-sound').checked) tetrisBeep(440, 0.08); }
    tetris.level = document.getElementById('tetris-speed').checked ? Math.min(15, 1 + Math.floor(tetris.lines / 10)) : Number(document.getElementById('tetris-level').value);
    tetris.piece = tetris.next || tetrisMakePiece(); tetris.next = tetrisMakePiece();
    if (tetrisCollides(tetris.piece)) {
        tetris.over = true; tetris.running = false; clearInterval(tetris.timer);
        document.getElementById('tetris-status').textContent = 'Game Over – Neues Spiel starten';
        checkAndOfferHighscore('tetris', tetris.score, `${tetris.score.toLocaleString('de-DE')} Pkt.`);
    }
    tetrisUpdateStats(); tetrisDraw();
}
function tetrisStep() { if (!tetris.running) return; if (!tetrisCollides(tetris.piece,0,1)) tetris.piece.y++; else tetrisLock(); tetrisDraw(); }
function tetrisHardDrop() { if (!tetris.running) return; let n=0; while (!tetrisCollides(tetris.piece,0,1)) { tetris.piece.y++; n++; } tetris.score += n*2; tetrisLock(); }
function tetrisRestartTimer() { clearInterval(tetris.timer); const ms = Math.max(80, 900 - (tetris.level-1)*55); tetris.timer = setInterval(tetrisStep, ms); }
function tetrisNewGame() {
    tetrisInitBoard(); tetris.score=0; tetris.lines=0; tetris.level=Number(document.getElementById('tetris-level').value); tetris.over=false; tetris.running=true; tetris.piece=tetrisMakePiece(); tetris.next=tetrisMakePiece();
    document.getElementById('tetris-status').textContent='Läuft – viel Spaß!'; tetrisRestartTimer(); tetrisUpdateStats(); tetrisDraw();
}
function tetrisSetLevel() { if (!tetris.running) return; tetris.level=Number(document.getElementById('tetris-level').value); tetrisRestartTimer(); tetrisUpdateStats(); }
function tetrisUpdateStats() { ['score','lines'].forEach(k => document.getElementById('tetris-'+k).textContent=tetris[k].toLocaleString('de-DE')); document.getElementById('tetris-level-view').textContent=tetris.level; }
function tetrisDrawCell(ctx,x,y,size,color) { ctx.fillStyle=color; ctx.fillRect(x*size+1,y*size+1,size-2,size-2); ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fillRect(x*size+2,y*size+2,size-5,3); }
function tetrisDraw() {
    const c=document.getElementById('tetris-canvas'); if (!c) return; const ctx=c.getContext('2d'), size=c.width/TETRIS_W; ctx.fillStyle='#07120f'; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle='rgba(52,211,153,.11)'; ctx.lineWidth=1; for(let x=1;x<TETRIS_W;x++){ctx.beginPath();ctx.moveTo(x*size,0);ctx.lineTo(x*size,c.height);ctx.stroke();} for(let y=1;y<TETRIS_H;y++){ctx.beginPath();ctx.moveTo(0,y*size);ctx.lineTo(c.width,y*size);ctx.stroke();}
    tetris.board.forEach((row,y)=>row.forEach((color,x)=>{if(color)tetrisDrawCell(ctx,x,y,size,color);}));
    if (tetris.piece) {
        if (document.getElementById('tetris-ghost')?.checked) { let gy=tetris.piece.y; while(!tetrisCollides({...tetris.piece,y:gy},0,1)) gy++; tetris.piece.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v){ctx.globalAlpha=.18;tetrisDrawCell(ctx,tetris.piece.x+x,gy+y,size,tetris.piece.color);ctx.globalAlpha=1;}})); }
        tetris.piece.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v)tetrisDrawCell(ctx,tetris.piece.x+x,tetris.piece.y+y,size,tetris.piece.color);}));
    }
    const n=document.getElementById('tetris-next'); if(n&&tetris.next){const nc=n.getContext('2d');nc.fillStyle='#07120f';nc.fillRect(0,0,n.width,n.height);const s=24, ox=(n.width-tetris.next.shape[0].length*s)/2, oy=(n.height-tetris.next.shape.length*s)/2;tetris.next.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v){nc.fillStyle=tetris.next.color;nc.fillRect(ox+x*s+1,oy+y*s+1,s-2,s-2);}}));}
}
function tetrisBeep(freq,duration){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const a=new A(),o=a.createOscillator(),g=a.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration);}catch(e){}}
function initTetrisIfNeeded(){ tetrisInitBoard(); tetrisDraw(); }
document.addEventListener('keydown', e => { if(!document.getElementById('page-tetris')?.classList.contains('active')) return; if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' ','p','P'].includes(e.key)) e.preventDefault(); if(e.key==='ArrowLeft')tetrisMove(-1);if(e.key==='ArrowRight')tetrisMove(1);if(e.key==='ArrowDown')tetrisStep();if(e.key==='ArrowUp')tetrisRotate();if(e.key===' ')tetrisHardDrop();if(e.key==='p'||e.key==='P'){tetris.running=!tetris.running;if(tetris.running)tetrisRestartTimer();else clearInterval(tetris.timer);}});
drawAreaCanvas();
// -----------------------------------------------------------------
// 10. TOP-10 HIGHSCORE SYSTEM (LOKAL + GOOGLE DRIVE SYNC)
// -----------------------------------------------------------------
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
// Highscores liegen in EIGENER Drive-Datei (kind=highscores), komplett
// getrennt von Pinnwand und Turnieren. Lokaler Cache: dippe_highscores_v1.
let highscoreData = null;

function getHighscoreStore() {
    if (!highscoreData) {
        // Migration: alter Stand lag evtl. in pinnwandData.highscores
        const legacy = (pinnwandData && typeof pinnwandData === 'object') ? pinnwandData.highscores : null;
        const raw = localStorage.getItem('dippe_highscores_v1');
        highscoreData = raw ? JSON.parse(raw) : (legacy || JSON.parse(JSON.stringify(DEFAULT_HIGHSCORES)));
    }
    return highscoreData;
}

function saveHighscoreStore(store) {
    highscoreData = store;
    try { localStorage.setItem('dippe_highscores_v1', JSON.stringify(store)); } catch (e) {}
    // In eigene Drive-Datei sichern (kind=highscores)
    if (CONFIG.pinnwandCloudUrl && CONFIG.pinnwandCloudUrl.startsWith('https://script.google.com/')) {
        fetch(CONFIG.pinnwandCloudUrl, {
            method: 'POST', redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ kind: 'highscores', data: store })
        }).catch(err => console.warn('Highscore-Cloud-Save fehlgeschlagen:', err));
    }
    renderAllHighscores();
}

// Highscores aus eigener Drive-Datei laden und mit lokalem Stand mergen
// (hoechster Score pro Spiel/Name bleibt; nichts geht verloren).
async function loadHighscoresFromCloud() {
    if (!(CONFIG.pinnwandCloudUrl && CONFIG.pinnwandCloudUrl.startsWith('https://script.google.com/'))) return;
    try {
        const res = await fetch(CONFIG.pinnwandCloudUrl + '?kind=highscores&t=' + Date.now(), { method: 'GET', redirect: 'follow' });
        if (!res.ok) return;
        const j = await res.json();
        const cloud = (j && j.data) ? j.data : (j && !j.empty && (j.tetris || j.snake || j.minesweeper) ? j : null);
        if (!cloud) {
            // Noch keine Highscore-Datei in Drive -> aktuellen Stand initial anlegen
            saveHighscoreStore(getHighscoreStore());
            return;
        }
        const local = getHighscoreStore();
        const merged = {};
        ['tetris', 'minesweeper', 'snake'].forEach(game => {
            const all = [].concat(local[game] || [], cloud[game] || []);
            // Duplikate (gleicher Name+Score) entfernen, nach Score sortieren, Top 10
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

// -----------------------------------------------------------------
// 11. MINESWEEPER
// -----------------------------------------------------------------
const MS_CONFIGS = {
    easy:   { cols: 9,  rows: 9,  mines: 10, baseScore: 1000 },
    medium: { cols: 12, rows: 12, mines: 22, baseScore: 2200 },
    hard:   { cols: 16, rows: 12, mines: 35, baseScore: 3800 }
};
let ms = { cols: 9, rows: 9, mines: 10, baseScore: 1000, grid: [], started: false, over: false, flagMode: false, flags: 0, opened: 0, startTime: 0, timer: null };

function initMinesweeperIfNeeded() {
    renderAllHighscores();
    if (!ms.grid.length) msNewGame();
}

function msToggleFlagMode() {
    ms.flagMode = !ms.flagMode;
    const btn = document.getElementById('ms-flag-toggle');
    btn.textContent = ms.flagMode ? '🚩 Modus: Flagge setzen (Aktiv)' : '⛏️ Modus: Aufdecken (Rechtsklick = 🚩)';
    btn.className = ms.flagMode ? 'btn btn-amber' : 'btn btn-sand';
}

function msNewGame() {
    clearInterval(ms.timer);
    const diff = document.getElementById('ms-diff')?.value || 'easy';
    const cfg = MS_CONFIGS[diff] || MS_CONFIGS.easy;
    ms = { ...cfg, grid: [], started: false, over: false, flagMode: ms.flagMode, flags: 0, opened: 0, startTime: 0, timer: null };

    for (let r = 0; r < ms.rows; r++) {
        const row = [];
        for (let c = 0; c < ms.cols; c++) {
            row.push({ r, c, mine: false, open: false, flag: false, count: 0 });
        }
        ms.grid.push(row);
    }
    document.getElementById('ms-mines-left').textContent = ms.mines;
    document.getElementById('ms-time').textContent = '0.0 s';
    document.getElementById('ms-score').textContent = '0';
    document.getElementById('ms-status').textContent = 'Bereit – erstes Feld ist garantiert sicher!';
    msRenderBoard();
}

function msPlaceMines(safeR, safeC) {
    let placed = 0;
    while (placed < ms.mines) {
        const r = Math.floor(Math.random() * ms.rows);
        const c = Math.floor(Math.random() * ms.cols);
        if (ms.grid[r][c].mine || (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1)) continue;
        ms.grid[r][c].mine = true;
        placed++;
    }
    for (let r = 0; r < ms.rows; r++) {
        for (let c = 0; c < ms.cols; c++) {
            if (ms.grid[r][c].mine) continue;
            let cnt = 0;
            msNeighbors(r, c).forEach(n => { if (n.mine) cnt++; });
            ms.grid[r][c].count = cnt;
        }
    }
}

function msNeighbors(r, c) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols) list.push(ms.grid[nr][nc]);
        }
    }
    return list;
}

function msHandleClick(r, c) {
    if (ms.over) return;
    const cell = ms.grid[r][c];
    if (ms.flagMode) { msToggleFlag(r, c); return; }
    if (cell.flag || cell.open) return;

    if (!ms.started) {
        ms.started = true;
        msPlaceMines(r, c);
        ms.startTime = performance.now();
        ms.timer = setInterval(() => {
            const sec = (performance.now() - ms.startTime) / 1000;
            document.getElementById('ms-time').textContent = sec.toFixed(1) + ' s';
        }, 100);
    }

    if (cell.mine) {
        cell.open = true;
        msGameOver(false);
        return;
    }
    msReveal(r, c);
    msRenderBoard();
    msCheckWin();
}

function msToggleFlag(r, c) {
    if (ms.over) return;
    const cell = ms.grid[r][c];
    if (cell.open) return;
    cell.flag = !cell.flag;
    ms.flags += cell.flag ? 1 : -1;
    document.getElementById('ms-mines-left').textContent = ms.mines - ms.flags;
    msRenderBoard();
}

function msReveal(r, c) {
    const stack = [ms.grid[r][c]];
    while (stack.length) {
        const cur = stack.pop();
        if (cur.open || cur.flag) continue;
        cur.open = true;
        ms.opened++;
        if (cur.count === 0 && !cur.mine) {
            msNeighbors(cur.r, cur.c).forEach(n => { if (!n.open && !n.flag) stack.push(n); });
        }
    }
}

function msCheckWin() {
    const totalSafe = ms.rows * ms.cols - ms.mines;
    if (ms.opened >= totalSafe) msGameOver(true);
}

function msGameOver(won) {
    ms.over = true;
    clearInterval(ms.timer);
    const sec = ms.started ? Math.max(1, Math.round((performance.now() - ms.startTime) / 1000)) : 0;
    if (!won) {
        ms.grid.forEach(row => row.forEach(c => { if (c.mine) c.open = true; }));
        msRenderBoard();
        document.getElementById('ms-status').textContent = '💥 Bumm! Mine getroffen. Versuch es gleich nochmal!';
    } else {
        const score = Math.max(100, ms.baseScore - sec * 6);
        document.getElementById('ms-score').textContent = score.toLocaleString('de-DE');
        document.getElementById('ms-status').textContent = `🎉 Gelöst in ${sec}s! Score: ${score} Pkt.`;
        msRenderBoard();
        checkAndOfferHighscore('minesweeper', score, `${score} Pkt. (${sec}s)`);
    }
}

function msRenderBoard() {
    const board = document.getElementById('ms-board');
    if (!board) return;
    board.style.gridTemplateColumns = `repeat(${ms.cols}, auto)`;
    board.innerHTML = '';
    for (let r = 0; r < ms.rows; r++) {
        for (let c = 0; c < ms.cols; c++) {
            const cell = ms.grid[r][c];
            const btn = document.createElement('button');
            btn.className = 'ms-cell' + (cell.open ? ' open' : '') + (cell.open && cell.mine ? ' mine' : '') + (cell.flag ? ' flagged' : '');
            if (cell.open) {
                if (cell.mine) btn.textContent = '💣';
                else if (cell.count > 0) {
                    btn.textContent = cell.count;
                    btn.classList.add('ms-n' + Math.min(6, cell.count));
                }
            } else if (cell.flag) {
                btn.textContent = '🚩';
            }
            btn.onclick = () => msHandleClick(r, c);
            btn.oncontextmenu = (e) => { e.preventDefault(); msToggleFlag(r, c); };
            board.appendChild(btn);
        }
    }
}

// -----------------------------------------------------------------
// 12. SNAKE
// -----------------------------------------------------------------
const SNAKE_GRID = 20;
let snake = { body: [], dir: {x:1, y:0}, nextDir: {x:1, y:0}, food: {x:10, y:10}, score: 0, apples: 0, running: false, paused: false, timer: null, currentMs: 105 };
function initSnakeIfNeeded() {
    renderAllHighscores();
    if (!snake.body.length) {
        snakeResetState();
        snakeDraw();
    }
}

function snakeResetState() {
    snake.body = [{x: 8, y: 10}, {x: 7, y: 10}, {x: 6, y: 10}];
    snake.dir = {x: 1, y: 0};
    snake.nextDir = {x: 1, y: 0};
    snake.score = 0;
    snake.apples = 0;
    snakePlaceFood();
    snakeUpdateUI();
}

function snakePlaceFood() {
    while (true) {
        const fx = Math.floor(Math.random() * SNAKE_GRID);
        const fy = Math.floor(Math.random() * SNAKE_GRID);
        if (!snake.body.some(seg => seg.x === fx && seg.y === fy)) {
            snake.food = {x: fx, y: fy};
            break;
        }
    }
}

function snakeNewGame() {
    clearInterval(snake.timer);
    snakeResetState();
    snake.running = true;
    snake.paused = false;
    document.getElementById('snake-status').textContent = '🐍 Läuft – sammle die Äpfel!';
    snakeStartTimer();
    snakeDraw();
}

function snakeStartTimer() {
    clearInterval(snake.timer);
    const baseSpeed = Number(document.getElementById('snake-speed')?.value || 115);
    // Wenn die automatische Steigerung aktiv ist, wird es pro gefressenem Apfel ein Stück schneller (bis min 45ms)
    if (document.getElementById('snake-accel')?.checked) {
        const penalty = Math.min(65, snake.apples * 3.5);
        snake.currentMs = Math.max(45, baseSpeed - penalty);
    } else {
        snake.currentMs = baseSpeed;
    }
    snake.timer = setInterval(snakeStep, snake.currentMs);
}

function snakeChangeSpeed() {
    if (snake.running && !snake.paused) snakeStartTimer();
}

function snakeSetDir(dx, dy) {
    if (!snake.running) snakeNewGame();
    if (dx === -snake.dir.x && dy === -snake.dir.y) return;
    snake.nextDir = {x: dx, y: dy};
}

function snakeStep() {
    if (!snake.running || snake.paused) return;
    snake.dir = snake.nextDir;
    let nx = snake.body[0].x + snake.dir.x;
    let ny = snake.body[0].y + snake.dir.y;

    const wallsDeadly = document.getElementById('snake-walls')?.checked;
    if (nx < 0 || nx >= SNAKE_GRID || ny < 0 || ny >= SNAKE_GRID) {
        if (wallsDeadly) { snakeGameOver(); return; }
        nx = (nx + SNAKE_GRID) % SNAKE_GRID;
        ny = (ny + SNAKE_GRID) % SNAKE_GRID;
    }

    if (snake.body.some(seg => seg.x === nx && seg.y === ny)) {
        snakeGameOver();
        return;
    }

    snake.body.unshift({x: nx, y: ny});
    if (nx === snake.food.x && ny === snake.food.y) {
        snake.apples++;
        // Punkte hängen jetzt auch vom gewählten Tempo ab (höheres Tempo = mehr Bonuspunkte)
        const baseSpeed = Number(document.getElementById('snake-speed')?.value || 115);
        const speedMultiplier = Math.round((210 - baseSpeed) / 25);
        snake.score += 10 + Math.max(0, speedMultiplier);
        
        snakePlaceFood();
        // Timer bei jedem Apfel neu starten, damit die Beschleunigung sofort greift
        if (document.getElementById('snake-accel')?.checked) {
            snakeStartTimer();
        }
    } else {
        snake.body.pop();
    }
    snakeUpdateUI();
    snakeDraw();
}

function snakeGameOver() {
    snake.running = false;
    clearInterval(snake.timer);
    document.getElementById('snake-status').textContent = '💥 Game Over – Neues Spiel starten!';
    snakeDraw();
    checkAndOfferHighscore('snake', snake.score, `${snake.score.toLocaleString('de-DE')} Pkt.`);
}

function snakeUpdateUI() {
    document.getElementById('snake-score').textContent = snake.score.toLocaleString('de-DE');
    document.getElementById('snake-apples').textContent = snake.apples;
    document.getElementById('snake-len').textContent = snake.body.length;
}

function snakeDraw() {
    const c = document.getElementById('snake-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const size = c.width / SNAKE_GRID;
    ctx.fillStyle = '#07120f';
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.strokeStyle = 'rgba(52, 211, 153, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < SNAKE_GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * size, 0); ctx.lineTo(i * size, c.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * size); ctx.lineTo(c.width, i * size); ctx.stroke();
    }

    // Apfel
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc((snake.food.x + 0.5) * size, (snake.food.y + 0.5) * size, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Schlange
    snake.body.forEach((seg, idx) => {
        ctx.fillStyle = idx === 0 ? '#fbbf24' : '#10b981';
        ctx.fillRect(seg.x * size + 1.5, seg.y * size + 1.5, size - 3, size - 3);
    });
}

document.addEventListener('keydown', e => {
    if (!document.getElementById('page-snake')?.classList.contains('active')) return;
    if (document.getElementById('hs-modal')?.classList.contains('open')) return;
    const k = e.key;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(k)) e.preventDefault();
    if (k === 'ArrowLeft'  || k === 'a' || k === 'A') snakeSetDir(-1, 0);
    if (k === 'ArrowRight' || k === 'd' || k === 'D') snakeSetDir(1, 0);
    if (k === 'ArrowUp'    || k === 'w' || k === 'W') snakeSetDir(0, -1);
    if (k === 'ArrowDown'  || k === 's' || k === 'S') snakeSetDir(0, 1);
    if (k === ' ' && snake.running) {
        snake.paused = !snake.paused;
        document.getElementById('snake-status').textContent = snake.paused ? '⏸️ Pausiert (Leertaste zum Fortsetzen)' : '🐍 Läuft!';
    }
});

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderAllHighscores, 400);
});

