// ===================================================================
// MINESWEEPER: 10 FELDGRÖSSEN (BIS 36x22 XXL) & 5%-BOMBEN-REGLER (js/minesweeper.js)
// ===================================================================

const MS_SIZE_STEPS = [
    { step: 1,  cols: 8,  rows: 8,  name: 'Mini (8×8)' },
    { step: 2,  cols: 9,  rows: 9,  name: 'Klassisch (9×9)' },
    { step: 3,  cols: 12, rows: 12, name: 'Mittel (12×12)' },
    { step: 4,  cols: 15, rows: 13, name: 'Groß (15×13)' },
    { step: 5,  cols: 16, rows: 16, name: 'Fortgeschritten (16×16)' },
    { step: 6,  cols: 20, rows: 16, name: 'Breitbild (20×16)' },
    { step: 7,  cols: 24, rows: 18, name: 'Experte (24×18)' },
    { step: 8,  cols: 28, rows: 20, name: 'Meister (28×20)' },
    { step: 9,  cols: 32, rows: 20, name: 'Episch (32×20)' },
    { step: 10, cols: 36, rows: 22, name: 'XXL-Gigant (36×22)' }
];

let ms = {
    cols: 12,
    rows: 12,
    mines: 22,
    bombPct: 15,
    baseScore: 2200,
    grid: [],
    started: false,
    over: false,
    flagMode: false,
    flags: 0,
    opened: 0,
    startTime: 0,
    timer: null
};

function initMinesweeperIfNeeded() {
    if (typeof renderAllHighscores === 'function') renderAllHighscores();
    if (!ms.grid.length) msUpdateSliders();
}

function msToggleFlagMode() {
    ms.flagMode = !ms.flagMode;
    const btn = document.getElementById('ms-flag-toggle');
    if (!btn) return;
    btn.textContent = ms.flagMode
        ? '🚩 Modus: Flagge setzen (Aktiv)'
        : '⛏️ Modus: Aufdecken (Tippen zum Wechseln auf 🚩)';
    btn.className = ms.flagMode ? 'btn btn-amber' : 'btn btn-sand';
}

function msUpdateSliders() {
    const stepVal = Number(document.getElementById('ms-size-slider')?.value || 3);
    const pctVal = Number(document.getElementById('ms-bomb-slider')?.value || 15);
    const cfg = MS_SIZE_STEPS.find(s => s.step === stepVal) || MS_SIZE_STEPS[2];
    const totalCells = cfg.cols * cfg.rows;
    const minesCount = Math.max(3, Math.min(totalCells - 9, Math.round(totalCells * (pctVal / 100))));

    const sizeLbl = document.getElementById('ms-size-label');
    if (sizeLbl) sizeLbl.textContent = `Stufe ${cfg.step} · ${cfg.name} (${totalCells} Felder)`;

    const bombLbl = document.getElementById('ms-bomb-label');
    if (bombLbl) bombLbl.textContent = `${pctVal}% (${minesCount} Bomben)`;

    msNewGame();
}

function msNewGame() {
    clearInterval(ms.timer);
    const stepVal = Number(document.getElementById('ms-size-slider')?.value || 3);
    const pctVal = Number(document.getElementById('ms-bomb-slider')?.value || 15);
    const cfg = MS_SIZE_STEPS.find(s => s.step === stepVal) || MS_SIZE_STEPS[2];
    const totalCells = cfg.cols * cfg.rows;
    const minesCount = Math.max(3, Math.min(totalCells - 9, Math.round(totalCells * (pctVal / 100))));
    const baseScore = Math.round(totalCells * (pctVal / 10) * 12);

    ms = {
        cols: cfg.cols,
        rows: cfg.rows,
        mines: minesCount,
        bombPct: pctVal,
        baseScore: baseScore,
        grid: [],
        started: false,
        over: false,
        flagMode: ms.flagMode,
        flags: 0,
        opened: 0,
        startTime: 0,
        timer: null
    };

    for (let r = 0; r < ms.rows; r++) {
        const row = [];
        for (let c = 0; c < ms.cols; c++) {
            row.push({ r, c, mine: false, open: false, flag: false, count: 0 });
        }
        ms.grid.push(row);
    }

    if (document.getElementById('ms-mines-left')) document.getElementById('ms-mines-left').textContent = ms.mines;
    if (document.getElementById('ms-time')) document.getElementById('ms-time').textContent = '0.0 s';
    if (document.getElementById('ms-score')) document.getElementById('ms-score').textContent = '0';
    if (document.getElementById('ms-status')) document.getElementById('ms-status').textContent = `Bereit (${ms.cols}×${ms.rows} · ${ms.bombPct}% Bomben) – 1. Klick ist sicher!`;

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

    // Chording: Klick auf bereits geöffnetes Zahlenfeld öffnet Nachbarn, wenn Flaggenanzahl stimmt
    if (cell.open) {
        if (cell.count > 0) {
            const nbs = msNeighbors(r, c);
            const flagged = nbs.filter(n => n.flag).length;
            if (flagged === cell.count) {
                let hitMine = false;
                nbs.forEach(n => {
                    if (!n.open && !n.flag) {
                        if (n.mine) { n.open = true; hitMine = true; }
                        else msReveal(n.r, n.c);
                    }
                });
                if (hitMine) { msGameOver(false); return; }
                msRenderBoard();
                msCheckWin();
            }
        }
        return;
    }

    if (ms.flagMode) { msToggleFlag(r, c); return; }
    if (cell.flag) return;

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
        document.getElementById('ms-status').textContent = '💥 Bumm! Mine erwischt – versuch es gleich nochmal!';
    } else {
        const score = Math.max(150, ms.baseScore - sec * 5);
        document.getElementById('ms-score').textContent = score.toLocaleString('de-DE');
        document.getElementById('ms-status').textContent = `🎉 Gelöst in ${sec}s! Score: ${score} Pkt.`;
        msRenderBoard();
        checkAndOfferHighscore('minesweeper', score, `${score} Pkt. (${ms.cols}×${ms.rows} · ${ms.bombPct}% · ${sec}s)`);
    }
}

function msRenderBoard() {
    const board = document.getElementById('ms-board');
    if (!board) return;

    // Zellgröße dynamisch an die Spaltenanzahl anpassen, damit auch 36x22 top aussieht
    const cellSize = ms.cols >= 28 ? 26 : ms.cols >= 20 ? 29 : 33;
    board.style.gridTemplateColumns = `repeat(${ms.cols}, ${cellSize}px)`;
    board.innerHTML = '';

    for (let r = 0; r < ms.rows; r++) {
        for (let c = 0; c < ms.cols; c++) {
            const cell = ms.grid[r][c];
            const btn = document.createElement('button');
            btn.style.width = `${cellSize}px`;
            btn.style.height = `${cellSize}px`;
            btn.style.fontSize = ms.cols >= 28 ? '12.5px' : '14px';
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

            // Long-Press auf Smartphone setzt automatisch eine Flagge
            let pressTimer = null;
            let longPressed = false;
            btn.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'touch' && !cell.open) {
                    longPressed = false;
                    pressTimer = setTimeout(() => {
                        longPressed = true;
                        msToggleFlag(r, c);
                    }, 380);
                }
            });
            btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
            btn.addEventListener('pointerleave', () => clearTimeout(pressTimer));
            btn.onclick = () => { if (!longPressed) msHandleClick(r, c); };
            btn.oncontextmenu = (e) => { e.preventDefault(); msToggleFlag(r, c); };
            board.appendChild(btn);
        }
    }
}