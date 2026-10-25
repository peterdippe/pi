// ===================================================================
// TETRIS: NES A-TYPE EDITION & GAMEBOY CONTROLLER (js/tetris.js)
// ===================================================================

const TETRIS_W = 10, TETRIS_H = 20;

// Die 7 klassischen Tetrominos in exakt der Reihenfolge des NES-Statistik-Screens (T, J, Z, O, S, L, I)
const TETRIS_PIECES = [
    { key: 'T', shape: [[1,1,1],[0,1,0]], color: '#2dd4bf', accent: '#ccfbf1' },
    { key: 'J', shape: [[1,1,1],[0,0,1]], color: '#38bdf8', accent: '#e0f2fe' },
    { key: 'Z', shape: [[1,1,0],[0,1,1]], color: '#a855f7', accent: '#f3e8ff' },
    { key: 'O', shape: [[1,1],[1,1]],     color: '#fbbf24', accent: '#fef3c7' },
    { key: 'S', shape: [[0,1,1],[1,1,0]], color: '#10b981', accent: '#d1fae5' },
    { key: 'L', shape: [[1,1,1],[1,0,0]], color: '#f97316', accent: '#ffedd5' },
    { key: 'I', shape: [[1,1,1,1]],       color: '#22d3ee', accent: '#cffafe' }
];

let tetris = {
    board: [],
    piece: null,
    next: null,
    score: 0,
    lines: 0,
    level: 3,
    counts: { T: 0, J: 0, Z: 0, O: 0, S: 0, L: 0, I: 0 },
    timer: null,
    softDropTimer: null,
    over: false,
    running: false,
    paused: false
};

function padZero(num, len) {
    return String(Math.max(0, Math.floor(num || 0))).padStart(len, '0');
}

function tetrisMakePiece() {
    const i = Math.floor(Math.random() * TETRIS_PIECES.length);
    const tpl = TETRIS_PIECES[i];
    return {
        key: tpl.key,
        shape: tpl.shape.map(r => [...r]),
        color: tpl.color,
        accent: tpl.accent,
        x: Math.floor((TETRIS_W - tpl.shape[0].length) / 2),
        y: 0
    };
}

function tetrisInitBoard() {
    tetris.board = Array.from({ length: TETRIS_H }, () => Array(TETRIS_W).fill(null));
}

function tetrisCollides(p, dx = 0, dy = 0, shape = p.shape) {
    return shape.some((row, y) => row.some((cell, x) => {
        if (!cell) return false;
        const nx = p.x + x + dx;
        const ny = p.y + y + dy;
        return nx < 0 || nx >= TETRIS_W || ny >= TETRIS_H || (ny >= 0 && tetris.board[ny][nx]);
    }));
}

function tetrisRotateMatrix(m) {
    return m[0].map((_, i) => m.map(row => row[i]).reverse());
}

function tetrisRotate() {
    if (!tetris.running && !tetris.over) tetrisNewGame();
    if (!tetris.running || tetris.paused || tetris.over) return;
    const rotated = tetrisRotateMatrix(tetris.piece.shape);
    for (const shift of [0, -1, 1, -2, 2]) {
        if (!tetrisCollides(tetris.piece, shift, 0, rotated)) {
            tetris.piece.x += shift;
            tetris.piece.shape = rotated;
            if (document.getElementById('tetris-sound')?.checked) tetrisBeep(330, 0.035);
            tetrisDraw();
            return;
        }
    }
}

function tetrisMove(dx) {
    if (!tetris.running && !tetris.over) tetrisNewGame();
    if (!tetris.running || tetris.paused || tetris.over) return;
    if (!tetrisCollides(tetris.piece, dx, 0)) {
        tetris.piece.x += dx;
        if (document.getElementById('tetris-sound')?.checked) tetrisBeep(240, 0.025);
        tetrisDraw();
    }
}

function tetrisStartSoftDrop(e) {
    if (e) e.preventDefault();
    if (!tetris.running && !tetris.over) { tetrisNewGame(); return; }
    if (!tetris.running || tetris.paused) return;
    tetrisStep(true);
    clearInterval(tetris.softDropTimer);
    tetris.softDropTimer = setInterval(() => tetrisStep(true), 55);
}

function tetrisStopSoftDrop() {
    clearInterval(tetris.softDropTimer);
    tetris.softDropTimer = null;
}

function tetrisLock() {
    tetrisStopSoftDrop();
    tetris.piece.shape.forEach((row, y) => row.forEach((cell, x) => {
        if (cell && tetris.piece.y + y >= 0) {
            tetris.board[tetris.piece.y + y][tetris.piece.x + x] = {
                color: tetris.piece.color,
                accent: tetris.piece.accent
            };
        }
    }));

    let cleared = 0;
    for (let y = TETRIS_H - 1; y >= 0; y--) {
        if (tetris.board[y].every(Boolean)) {
            tetris.board.splice(y, 1);
            tetris.board.unshift(Array(TETRIS_W).fill(null));
            cleared++;
            y++;
        }
    }

    if (cleared) {
        tetris.lines += cleared;
        tetris.score += [0, 100, 300, 500, 800][cleared] * tetris.level;
        if (document.getElementById('tetris-sound')?.checked) tetrisBeep(cleared === 4 ? 660 : 440, 0.09);
    } else if (document.getElementById('tetris-sound')?.checked) {
        tetrisBeep(160, 0.03);
    }

    const baseLvl = Number(document.getElementById('tetris-level')?.value || 3);
    if (document.getElementById('tetris-speed')?.checked) {
        const newLvl = Math.min(20, Math.max(baseLvl, 1 + Math.floor(tetris.lines / 10)));
        if (newLvl !== tetris.level) {
            tetris.level = newLvl;
            tetrisRestartTimer();
        }
    }

    tetris.piece = tetris.next || tetrisMakePiece();
    tetris.counts[tetris.piece.key] = (tetris.counts[tetris.piece.key] || 0) + 1;
    tetris.next = tetrisMakePiece();

    if (tetrisCollides(tetris.piece)) {
        tetris.over = true;
        tetris.running = false;
        clearInterval(tetris.timer);
        document.getElementById('tetris-status').textContent = '💥 GAME OVER – Tippe auf „▶ Start“ für eine neue Runde!';
        checkAndOfferHighscore('tetris', tetris.score, `${tetris.score.toLocaleString('de-DE')} Pkt.`);
    }
    tetrisUpdateStats();
    tetrisDraw();
}

function tetrisStep(fromSoftDrop = false) {
    if (!tetris.running || tetris.paused) return;
    if (!tetrisCollides(tetris.piece, 0, 1)) {
        tetris.piece.y++;
        if (fromSoftDrop) tetris.score += 1;
    } else {
        tetrisLock();
    }
    tetrisUpdateStats();
    tetrisDraw();
}

function tetrisHardDrop() {
    if (!tetris.running && !tetris.over) { tetrisNewGame(); return; }
    if (!tetris.running || tetris.paused) return;
    let n = 0;
    while (!tetrisCollides(tetris.piece, 0, 1)) {
        tetris.piece.y++;
        n++;
    }
    tetris.score += n * 2;
    tetrisLock();
}

function tetrisRestartTimer() {
    clearInterval(tetris.timer);
    const ms = Math.max(65, 880 - (tetris.level - 1) * 52);
    tetris.timer = setInterval(() => tetrisStep(false), ms);
}

function tetrisTogglePause() {
    if (!tetris.running) return;
    tetris.paused = !tetris.paused;
    const btn = document.getElementById('tetris-pause-btn');
    if (btn) btn.textContent = tetris.paused ? '▶ Weiter' : '⏸️ Pause';
    document.getElementById('tetris-status').textContent = tetris.paused ? '⏸️ Spiel pausiert' : '🕹️ A-TYPE läuft!';
}

function tetrisNewGame() {
    tetrisStopSoftDrop();
    tetrisInitBoard();
    tetris.score = 0;
    tetris.lines = 0;
    tetris.level = Number(document.getElementById('tetris-level')?.value || 3);
    tetris.counts = { T: 0, J: 0, Z: 0, O: 0, S: 0, L: 0, I: 0 };
    tetris.over = false;
    tetris.running = true;
    tetris.paused = false;

    const btn = document.getElementById('tetris-pause-btn');
    if (btn) btn.textContent = '⏸️ Pause';

    tetris.piece = tetrisMakePiece();
    tetris.counts[tetris.piece.key]++;
    tetris.next = tetrisMakePiece();

    document.getElementById('tetris-status').textContent = '🕹️ A-TYPE läuft – viel Erfolg!';
    tetrisRestartTimer();
    tetrisUpdateStats();
    tetrisDraw();
}

function tetrisSetLevel() {
    tetris.level = Number(document.getElementById('tetris-level')?.value || 3);
    if (tetris.running && !tetris.paused) tetrisRestartTimer();
    tetrisUpdateStats();
}

function tetrisRenderPieceStats() {
    const box = document.getElementById('tetris-stats-list');
    if (!box) return;

    box.innerHTML = TETRIS_PIECES.map(p => {
        const w = p.shape[0].length;
        const h = p.shape.length;
        const cellSz = 10;
        let rects = '';
        p.shape.forEach((row, ry) => row.forEach((val, rx) => {
            if (val) {
                const px = rx * cellSz;
                const py = ry * cellSz;
                rects += `<rect x="${px}" y="${py}" width="${cellSz - 1}" height="${cellSz - 1}" fill="${p.color}" rx="1.5"/>`;
                rects += `<rect x="${px + 1.5}" y="${py + 1.5}" width="${cellSz - 5}" height="${cellSz - 5}" fill="#ffffff" fill-opacity="0.75"/>`;
            }
        }));
        const svgW = w * cellSz;
        const svgH = h * cellSz;
        return `
            <div class="nes-stat-row">
                <div style="width:52px; display:flex; align-items:center; justify-content:center;">
                    <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${rects}</svg>
                </div>
                <span class="nes-stat-count">${padZero(tetris.counts[p.key] || 0, 3)}</span>
            </div>
        `;
    }).join('');
}

function tetrisUpdateStats() {
    const store = typeof getHighscoreStore === 'function' ? getHighscoreStore() : null;
    const topStored = (store && store.tetris && store.tetris[0]) ? store.tetris[0].score : 2400;
    const topVal = Math.max(topStored, tetris.score);

    const sStr = padZero(tetris.score, 6);
    const tStr = padZero(topVal, 6);
    const lStr = padZero(tetris.lines, 3);
    const lvStr = padZero(tetris.level, 2);

    if (document.getElementById('tetris-score')) document.getElementById('tetris-score').textContent = sStr;
    if (document.getElementById('tetris-top')) document.getElementById('tetris-top').textContent = tStr;
    if (document.getElementById('tetris-lines')) document.getElementById('tetris-lines').textContent = lStr;
    if (document.getElementById('tetris-level-view')) document.getElementById('tetris-level-view').textContent = lvStr;

    if (document.getElementById('tetris-score-mob')) document.getElementById('tetris-score-mob').textContent = sStr;
    if (document.getElementById('tetris-top-mob')) document.getElementById('tetris-top-mob').textContent = tStr;
    if (document.getElementById('tetris-lines-mob')) document.getElementById('tetris-lines-mob').textContent = lStr;
    if (document.getElementById('tetris-level-mob')) document.getElementById('tetris-level-mob').textContent = lvStr;

    tetrisRenderPieceStats();
}

// Zeichnet einen einzelnen Block im ikonischen NES-Retro-Look (mit hellem Innen-Glanzpunkt)
function tetrisDrawNESCell(ctx, x, y, size, color, accent) {
    const px = x * size;
    const py = y * size;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

    // Heller Innenkern wie im NES-Original
    ctx.fillStyle = accent || 'rgba(255,255,255,0.75)';
    ctx.fillRect(px + 4, py + 4, size - 10, size - 10);

    // Kleiner Glanzpunkt oben links
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 3, py + 3, 4, 4);
}

function tetrisDraw() {
    const c = document.getElementById('tetris-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const size = c.width / TETRIS_W;

    ctx.fillStyle = '#030806';
    ctx.fillRect(0, 0, c.width, c.height);

    // Dezentes Raster
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 1; x < TETRIS_W; x++) {
        ctx.beginPath(); ctx.moveTo(x * size, 0); ctx.lineTo(x * size, c.height); ctx.stroke();
    }
    for (let y = 1; y < TETRIS_H; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * size); ctx.lineTo(c.width, y * size); ctx.stroke();
    }

    // Gesetzte Blöcke
    tetris.board.forEach((row, y) => row.forEach((cell, x) => {
        if (cell) tetrisDrawNESCell(ctx, x, y, size, cell.color, cell.accent);
    }));

    // Aktueller Stein + Schattenstein
    if (tetris.piece) {
        if (document.getElementById('tetris-ghost')?.checked) {
            let gy = tetris.piece.y;
            while (!tetrisCollides({ ...tetris.piece, y: gy }, 0, 1)) gy++;
            tetris.piece.shape.forEach((r, y) => r.forEach((v, x) => {
                if (v) {
                    ctx.save();
                    ctx.globalAlpha = 0.22;
                    tetrisDrawNESCell(ctx, tetris.piece.x + x, gy + y, size, tetris.piece.color, tetris.piece.accent);
                    ctx.restore();
                }
            }));
        }
        tetris.piece.shape.forEach((r, y) => r.forEach((v, x) => {
            if (v) tetrisDrawNESCell(ctx, tetris.piece.x + x, tetris.piece.y + y, size, tetris.piece.color, tetris.piece.accent);
        }));
    }

    // NEXT-Vorschau
    const n = document.getElementById('tetris-next');
    if (n && tetris.next) {
        const nc = n.getContext('2d');
        nc.fillStyle = '#030806';
        nc.fillRect(0, 0, n.width, n.height);
        const s = 22;
        const ox = (n.width - tetris.next.shape[0].length * s) / 2;
        const oy = (n.height - tetris.next.shape.length * s) / 2;
        tetris.next.shape.forEach((r, y) => r.forEach((v, x) => {
            if (v) {
                nc.save();
                nc.translate(ox, oy);
                tetrisDrawNESCell(nc, x, y, s, tetris.next.color, tetris.next.accent);
                nc.restore();
            }
        }));
    }
}

function tetrisBeep(freq, duration) {
    try {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return;
        const a = new A(), o = a.createOscillator(), g = a.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        g.gain.value = 0.028;
        o.connect(g);
        g.connect(a.destination);
        o.start();
        o.stop(a.currentTime + duration);
    } catch (e) {}
}

function initTetrisIfNeeded() {
    if (typeof renderAllHighscores === 'function') renderAllHighscores();
    if (!tetris.board.length) tetrisInitBoard();
    tetrisUpdateStats();
    tetrisDraw();
}

document.addEventListener('keydown', e => {
    if (!document.getElementById('page-tetris')?.classList.contains('active')) return;
    if (document.getElementById('hs-modal')?.classList.contains('open')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'p', 'P'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft') tetrisMove(-1);
    if (e.key === 'ArrowRight') tetrisMove(1);
    if (e.key === 'ArrowDown') tetrisStep(true);
    if (e.key === 'ArrowUp') tetrisRotate();
    if (e.key === ' ') tetrisHardDrop();
    if (e.key === 'p' || e.key === 'P') tetrisTogglePause();
});