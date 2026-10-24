// ===================================================================
// MINESWEEPER (js/minesweeper.js)
// ===================================================================

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