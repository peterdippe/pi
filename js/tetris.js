// ===================================================================
// TETRIS (js/tetris.js)
// ===================================================================

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
    if (cleared) { tetris.lines += cleared; tetris.score += [0,100,300,500,800][cleared] * tetris.level; if (document.getElementById('tetris-sound')?.checked) tetrisBeep(440, 0.08); }
    tetris.level = document.getElementById('tetris-speed')?.checked ? Math.min(15, 1 + Math.floor(tetris.lines / 10)) : Number(document.getElementById('tetris-level')?.value || 3);
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
    tetrisInitBoard(); tetris.score=0; tetris.lines=0; tetris.level=Number(document.getElementById('tetris-level')?.value || 3); tetris.over=false; tetris.running=true; tetris.piece=tetrisMakePiece(); tetris.next=tetrisMakePiece();
    document.getElementById('tetris-status').textContent='Läuft – viel Spaß!'; tetrisRestartTimer(); tetrisUpdateStats(); tetrisDraw();
}
function tetrisSetLevel() { if (!tetris.running) return; tetris.level=Number(document.getElementById('tetris-level')?.value || 3); tetrisRestartTimer(); tetrisUpdateStats(); }
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
function initTetrisIfNeeded(){ renderAllHighscores(); if (!tetris.board.length) tetrisInitBoard(); tetrisDraw(); }
document.addEventListener('keydown', e => { if(!document.getElementById('page-tetris')?.classList.contains('active')) return; if(document.getElementById('hs-modal')?.classList.contains('open')) return; if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' ','p','P'].includes(e.key)) e.preventDefault(); if(e.key==='ArrowLeft')tetrisMove(-1);if(e.key==='ArrowRight')tetrisMove(1);if(e.key==='ArrowDown')tetrisStep();if(e.key==='ArrowUp')tetrisRotate();if(e.key===' ')tetrisHardDrop();if(e.key==='p'||e.key==='P'){tetris.running=!tetris.running;if(tetris.running)tetrisRestartTimer();else clearInterval(tetris.timer);}});