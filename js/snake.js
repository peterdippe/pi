// ===================================================================
// SNAKE (js/snake.js)
// ===================================================================

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
    const baseSpeed = Number(document.getElementById('snake-speed')?.value || 150);
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
        const baseSpeed = Number(document.getElementById('snake-speed')?.value || 150);
        const speedMultiplier = Math.round((210 - baseSpeed) / 25);
        snake.score += 10 + Math.max(0, speedMultiplier);
        snakePlaceFood();
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
    if (document.getElementById('snake-score')) document.getElementById('snake-score').textContent = snake.score.toLocaleString('de-DE');
    if (document.getElementById('snake-apples')) document.getElementById('snake-apples').textContent = snake.apples;
    if (document.getElementById('snake-len')) document.getElementById('snake-len').textContent = snake.body.length;
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

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc((snake.food.x + 0.5) * size, (snake.food.y + 0.5) * size, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

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