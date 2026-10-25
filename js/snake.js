// ===================================================================
// SNAKE: LIVE-DEMO-PREVIEW, VEKTOR-APFEL & 2-DAUMEN-HANDLING (js/snake.js)
// ===================================================================

const SNAKE_GRID = 20;
const SNAKE_SPEED_NAMES = {
    1: '1 · Zeitlupe', 2: '2 · Sehr gemütlich', 3: '3 · Gemütlich',
    4: '4 · Locker',   5: '5 · Normal',         6: '6 · Flott',
    7: '7 · Schnell',  8: '8 · Sehr schnell',   9: '9 · Turbo',
    10: '10 · Überschall'
};

let snake = {
    body: [],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: { x: 14, y: 10 },
    score: 0,
    apples: 0,
    running: false,
    demo: true,
    paused: false,
    timer: null,
    currentMs: 135,
    tickCount: 0
};

function snakeLevelToMs(level) {
    const lvl = Math.max(1, Math.min(10, Number(level) || 5));
    // Stufe 1 = 235ms, Stufe 5 = 135ms, Stufe 10 = 50ms
    return Math.round(255 - lvl * 20.5);
}

function initSnakeIfNeeded() {
    if (typeof renderAllHighscores === 'function') renderAllHighscores();
    if (!snake.body.length) {
        snakeStartDemoMode();
    } else {
        snakeDraw();
    }
}

function snakeUpdateSpeedSlider(val) {
    const lvl = Number(val) || 5;
    const ms = snakeLevelToMs(lvl);
    const lbl = document.getElementById('snake-speed-label');
    if (lbl) lbl.textContent = `Stufe ${SNAKE_SPEED_NAMES[lvl] || lvl} (${ms} ms)`;

    if (snake.running || snake.demo) {
        snakeStartTimer();
    }
}

function snakeResetState() {
    snake.body = [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
        { x: 5, y: 10 }
    ];
    snake.dir = { x: 1, y: 0 };
    snake.nextDir = { x: 1, y: 0 };
    snake.score = 0;
    snake.apples = 0;
    snakePlaceFood();
    snakeUpdateUI();
}

function snakeStartDemoMode() {
    clearInterval(snake.timer);
    snakeResetState();
    snake.running = false;
    snake.demo = true;
    snake.paused = false;
    const st = document.getElementById('snake-status');
    if (st) st.textContent = '👀 Live-Demo läuft! Stell oben am Regler dein Wunschtempo ein oder tippe auf Start.';
    snakeStartTimer();
    snakeDraw();
}

function snakePlaceFood() {
    let tries = 0;
    while (tries < 500) {
        tries++;
        const fx = Math.floor(Math.random() * SNAKE_GRID);
        const fy = Math.floor(Math.random() * SNAKE_GRID);
        if (!snake.body.some(seg => seg.x === fx && seg.y === fy)) {
            snake.food = { x: fx, y: fy };
            break;
        }
    }
}

function snakeNewGame() {
    clearInterval(snake.timer);
    snakeResetState();
    snake.demo = false;
    snake.running = true;
    snake.paused = false;
    document.getElementById('snake-status').textContent = '🐍 Spiel läuft – hol dir die Äpfel!';
    snakeStartTimer();
    snakeDraw();
}

function snakeStartTimer() {
    clearInterval(snake.timer);
    const lvl = Number(document.getElementById('snake-speed-slider')?.value || 5);
    const baseMs = snakeLevelToMs(lvl);

    if (!snake.demo && document.getElementById('snake-accel')?.checked) {
        const speedUp = Math.min(55, snake.apples * 2.5);
        snake.currentMs = Math.max(40, Math.round(baseMs - speedUp));
    } else {
        snake.currentMs = baseMs;
    }
    snake.timer = setInterval(snakeStep, snake.currentMs);
}

function snakeSetDir(dx, dy) {
    if (snake.demo || !snake.running) {
        snakeNewGame();
    }
    if (dx === -snake.dir.x && dy === -snake.dir.y) return;
    snake.nextDir = { x: dx, y: dy };
}

// Intelligente Demo-Steuerung: Bewegt die Vorschau-Schlange mit dem eingestellten Tempo durchs Feld
function snakeChooseDemoDir() {
    const head = snake.body[0];
    const dirs = [
        { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 0, y: 1 }, { x: 0, y: -1 }
    ].filter(d => !(d.x === -snake.dir.x && d.y === -snake.dir.y));

    const safeDirs = dirs.filter(d => {
        const nx = (head.x + d.x + SNAKE_GRID) % SNAKE_GRID;
        const ny = (head.y + d.y + SNAKE_GRID) % SNAKE_GRID;
        if (head.x + d.x < 0 || head.x + d.x >= SNAKE_GRID || head.y + d.y < 0 || head.y + d.y >= SNAKE_GRID) return false;
        return !snake.body.slice(0, -1).some(seg => seg.x === nx && seg.y === ny);
    });

    if (!safeDirs.length) return snake.dir;

    // Zu 75% Richtung Apfel schlängeln, zu 25% zufälliger Schlenker für lebendige Demo
    if (Math.random() < 0.75) {
        safeDirs.sort((a, b) => {
            const distA = Math.abs((head.x + a.x) - snake.food.x) + Math.abs((head.y + a.y) - snake.food.y);
            const distB = Math.abs((head.x + b.x) - snake.food.x) + Math.abs((head.y + b.y) - snake.food.y);
            return distA - distB;
        });
        return safeDirs[0];
    }
    return safeDirs[Math.floor(Math.random() * safeDirs.length)];
}

function snakeStep() {
    if (snake.paused) return;
    if (!snake.running && !snake.demo) return;

    snake.tickCount++;
    if (snake.demo) {
        snake.nextDir = snakeChooseDemoDir();
    }
    snake.dir = snake.nextDir;

    let nx = snake.body[0].x + snake.dir.x;
    let ny = snake.body[0].y + snake.dir.y;

    const wallsDeadly = !snake.demo && document.getElementById('snake-walls')?.checked;
    if (nx < 0 || nx >= SNAKE_GRID || ny < 0 || ny >= SNAKE_GRID) {
        if (wallsDeadly) { snakeGameOver(); return; }
        nx = (nx + SNAKE_GRID) % SNAKE_GRID;
        ny = (ny + SNAKE_GRID) % SNAKE_GRID;
    }

    if (snake.body.slice(0, -1).some(seg => seg.x === nx && seg.y === ny)) {
        if (snake.demo) {
            snakeResetState();
            return;
        }
        snakeGameOver();
        return;
    }

    snake.body.unshift({ x: nx, y: ny });
    if (nx === snake.food.x && ny === snake.food.y) {
        if (!snake.demo) {
            snake.apples++;
            const lvl = Number(document.getElementById('snake-speed-slider')?.value || 5);
            snake.score += 10 + lvl * 2;
            snakeUpdateUI();
            if (document.getElementById('snake-accel')?.checked) snakeStartTimer();
        } else if (snake.body.length > 10) {
            snake.body.pop();
        }
        snakePlaceFood();
    } else {
        snake.body.pop();
    }
    snakeDraw();
}

function snakeGameOver() {
    snake.running = false;
    clearInterval(snake.timer);
    const finalScore = snake.score;
    document.getElementById('snake-status').textContent = `💥 Game Over (${finalScore} Pkt.) – Tippe auf Start!`;
    snakeDraw();
    checkAndOfferHighscore('snake', finalScore, `${finalScore.toLocaleString('de-DE')} Pkt.`);
    // Nach kurzem Moment wieder sanft in die Live-Vorschau wechseln
    setTimeout(() => {
        if (!snake.running) snakeStartDemoMode();
    }, 3200);
}

function snakeUpdateUI() {
    if (document.getElementById('snake-score')) document.getElementById('snake-score').textContent = snake.score.toLocaleString('de-DE');
    if (document.getElementById('snake-apples')) document.getElementById('snake-apples').textContent = snake.apples;
    if (document.getElementById('snake-len')) document.getElementById('snake-len').textContent = snake.body.length;
}

// Zeichnet einen täuschend echten Apfel (Fruchtkörper, Glanzlicht, Stiel & grünes Blatt)
function drawVectorApple(ctx, gx, gy, size, tick) {
    const cx = (gx + 0.5) * size;
    const cy = (gy + 0.54) * size;
    const pulse = 1 + Math.sin(tick * 0.25) * 0.05;
    const r = size * 0.40 * pulse;

    ctx.save();
    // Roter Apfelkörper mit 3D-Verlauf
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(0.55, '#ef4444');
    grad.addColorStop(1, '#991b1b');

    ctx.shadowColor = 'rgba(239, 68, 68, 0.55)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx - r * 0.22, cy, r * 0.78, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.22, cy, r * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Weißer Glanzpunkt auf der Schale
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.25, r * 0.22, r * 0.12, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Brauner Stiel
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.65);
    ctx.quadraticCurveTo(cx + 2, cy - r * 1.15, cx + 4, cy - r * 1.2);
    ctx.stroke();

    // Grünes Blatt
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.38, cy - r * 0.95, r * 0.36, r * 0.17, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function snakeDraw() {
    const c = document.getElementById('snake-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const size = c.width / SNAKE_GRID;

    // Edler dunkelgrüner Rasen-Schachbrett-Hintergrund
    for (let y = 0; y < SNAKE_GRID; y++) {
        for (let x = 0; x < SNAKE_GRID; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#06130f' : '#091a15';
            ctx.fillRect(x * size, y * size, size, size);
        }
    }

    // Apfel zeichnen
    drawVectorApple(ctx, snake.food.x, snake.food.y, size, snake.tickCount);

    // Organische Schlange von hinten nach vorne zeichnen
    const len = snake.body.length;
    for (let i = len - 1; i >= 0; i--) {
        const seg = snake.body[i];
        const cx = (seg.x + 0.5) * size;
        const cy = (seg.y + 0.5) * size;
        const isHead = i === 0;
        const ratio = 1 - (i / Math.max(1, len + 2)) * 0.38;
        const radius = (size * 0.44) * (isHead ? 1.08 : ratio);

        // Verbindung zum Vorgänger-Glied für nahtlosen Schlangenkörper
        if (i > 0) {
            const prev = snake.body[i - 1];
            if (Math.abs(prev.x - seg.x) <= 1 && Math.abs(prev.y - seg.y) <= 1) {
                ctx.strokeStyle = i % 2 === 0 ? '#10b981' : '#059669';
                ctx.lineWidth = radius * 1.85;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo((prev.x + 0.5) * size, (prev.y + 0.5) * size);
                ctx.stroke();
            }
        }

        // Schuppen-Glanzpunkt auf dem Körper
        ctx.fillStyle = isHead ? '#34d399' : (i % 2 === 0 ? '#10b981' : '#047857');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        if (!isHead && i % 2 === 0) {
            ctx.fillStyle = 'rgba(167, 243, 208, 0.35)';
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Schlangenkopf-Details (Augen in Blickrichtung + Zunge)
    if (snake.body.length > 0) {
        const head = snake.body[0];
        const hcx = (head.x + 0.5) * size;
        const hcy = (head.y + 0.5) * size;
        const angle = Math.atan2(snake.dir.y, snake.dir.x);

        ctx.save();
        ctx.translate(hcx, hcy);
        ctx.rotate(angle);

        // Kleine gegabelte rote Zunge (züngelt leicht)
        if (snake.tickCount % 4 < 2) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(size * 0.42, 0);
            ctx.lineTo(size * 0.66, 0);
            ctx.lineTo(size * 0.76, -3);
            ctx.moveTo(size * 0.66, 0);
            ctx.lineTo(size * 0.76, 3);
            ctx.stroke();
        }

        // Zwei wache Augen
        [-1, 1].forEach(side => {
            const ex = size * 0.14;
            const ey = side * size * 0.22;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ex, ey, size * 0.13, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#04130e';
            ctx.beginPath();
            ctx.arc(ex + 1.5, ey, size * 0.065, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    // Dezentes "LIVE-VORSCHAU"-Wasserzeichen im Demo-Modus
    if (snake.demo) {
        ctx.save();
        ctx.fillStyle = 'rgba(6, 40, 30, 0.78)';
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(c.width / 2 - 125, 12, 250, 30, 99);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#34d399';
        ctx.font = '800 11.5px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👀 LIVE-TEMPO-VORSCHAU (DEMO)', c.width / 2, 31);
        ctx.restore();
    }
}

document.addEventListener('keydown', e => {
    if (!document.getElementById('page-snake')?.classList.contains('active')) return;
    if (document.getElementById('hs-modal')?.classList.contains('open')) return;
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    if (k === 'ArrowLeft'  || k === 'a' || k === 'A') snakeSetDir(-1, 0);
    if (k === 'ArrowRight' || k === 'd' || k === 'D') snakeSetDir(1, 0);
    if (k === 'ArrowUp'    || k === 'w' || k === 'W') snakeSetDir(0, -1);
    if (k === 'ArrowDown'  || k === 's' || k === 'S') snakeSetDir(0, 1);
    if (k === ' ' && snake.running) {
        snake.paused = !snake.paused;
        document.getElementById('snake-status').textContent = snake.paused ? '⏸️ Pausiert (Leertaste zum Fortsetzen)' : '🐍 Spiel läuft!';
    }
});