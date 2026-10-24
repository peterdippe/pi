// ===================================================================
// PURE MATH: KLASSISCHES KOORDINATENSYSTEM (js/area-pur.js)
// ===================================================================

const PAD = { left: 48, right: 22, top: 22, bottom: 42 };
const X_MAX = 200, Y_MAX = 130;
let areaState = { collecting: false, points: [], hullEdges: [], M_A: null, M_M: null, M_U: null };
let areaPurBound = false;

function computeCentroid(hullPts) {
    const n = hullPts.length;
    if (n < 3) return { x: 0, y: 0 };
    const cx = hullPts.reduce((s, p) => s + p.x, 0) / n;
    const cy = hullPts.reduce((s, p) => s + p.y, 0) / n;
    const sorted = [...hullPts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

    let A2 = 0, Sx = 0, Sy = 0;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const cross = sorted[i].x * sorted[j].y - sorted[j].x * sorted[i].y;
        A2 += cross;
        Sx += (sorted[i].x + sorted[j].x) * cross;
        Sy += (sorted[i].y + sorted[j].y) * cross;
    }
    const area = A2 / 2.0;
    if (Math.abs(area) < 1e-12) return { x: cx, y: cy };
    return { x: Sx / (6.0 * area), y: Sy / (6.0 * area) };
}

function solveGeometry2D(pts) {
    const n = pts.length;
    const Aussenkanten = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            let seite = 0;
            for (let k = 0; k < n; k++) {
                if (k !== i && k !== j) {
                    const cross = (pts[k].y - pts[i].y) * (pts[j].x - pts[i].x) - (pts[j].y - pts[i].y) * (pts[k].x - pts[i].x);
                    const sig = Math.sign(cross);
                    if (seite !== 0 && Aussenkanten[i][j] !== 0) {
                        if (seite !== sig) { Aussenkanten[i][j] = 0; Aussenkanten[j][i] = 0; }
                        else { Aussenkanten[i][j] = 1; Aussenkanten[j][i] = 1; }
                    }
                    if (seite === 0) { seite = sig; Aussenkanten[i][j] = 1; Aussenkanten[j][i] = 1; }
                }
            }
        }
    }

    const hullEdges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (Aussenkanten[i][j] === 1) hullEdges.push([i, j]);
        }
    }

    const Aussenpunkte = Array(n).fill(0);
    let aussenCnt = 0, xM_a = 0, yM_a = 0;
    const hullPts = [], outerIndices = [];

    for (let i = 0; i < n; i++) {
        if (Aussenkanten[i].some(val => val === 1)) {
            Aussenpunkte[i] = 1;
            aussenCnt++;
            xM_a += pts[i].x; yM_a += pts[i].y;
            hullPts.push(pts[i]); outerIndices.push(i);
        }
    }
    if (aussenCnt > 0) { xM_a /= aussenCnt; yM_a /= aussenCnt; }
    const M_A = { x: xM_a, y: yM_a };
    const M_M = computeCentroid(hullPts);

    let Flaeche = 0, p1 = 0;
    while (p1 < n && Aussenpunkte[p1] !== 1) p1++;
    for (let p2 = p1 + 1; p2 < n - 1; p2++) {
        for (let p3 = p2 + 1; p3 < n; p3++) {
            if (Aussenkanten[p2][p3] === 1) {
                const a = Math.hypot(pts[p2].x - pts[p1].x, pts[p2].y - pts[p1].y);
                const b = Math.hypot(pts[p3].x - pts[p1].x, pts[p3].y - pts[p1].y);
                const c = Math.hypot(pts[p3].x - pts[p2].x, pts[p3].y - pts[p2].y);
                const s = 0.5 * (a + b + c);
                Flaeche += Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
            }
        }
    }

    const circle = circumcircleWelzl(pts);
    const tol = Math.max(1e-3, circle.r * 1e-3);
    let randIndizes = [];
    for (let i = 0; i < n; i++) {
        if (Math.abs(Math.hypot(pts[i].x - circle.x, pts[i].y - circle.y) - circle.r) <= tol) {
            randIndizes.push(i);
        }
    }
    if (randIndizes.length < circle.support.length) {
        randIndizes = [...circle.support].sort((a, b) => a - b);
    }

    return { hullEdges, aussenCnt, outerIndices, M_A, M_M, M_U: circle, Flaeche, randIndizes };
}

function formatPointList(indices) {
    const labels = indices.map(i => `P${i + 1}`);
    if (labels.length > 1) return labels.slice(0, -1).join(", ") + " und " + labels[labels.length - 1];
    return labels[0] || "-";
}

function toCanvasX(x, c) { return PAD.left + (x / X_MAX) * (c.width - PAD.left - PAD.right); }
function toCanvasY(y, c) { return c.height - PAD.bottom - (y / Y_MAX) * (c.height - PAD.top - PAD.bottom); }
function toWorldX(px, c) { return ((px - PAD.left) / (c.width - PAD.left - PAD.right)) * X_MAX; }
function toWorldY(py, c) { return ((c.height - PAD.bottom - py) / (c.height - PAD.top - PAD.bottom)) * Y_MAX; }

function drawAreaCanvas() {
    const canvas = document.getElementById('areaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const plotW = canvas.width - PAD.left - PAD.right, plotH = canvas.height - PAD.top - PAD.bottom;

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.font = '12px "JetBrains Mono", monospace'; ctx.fillStyle = '#334155';

    ctx.textAlign = 'center';
    for (let x = 0; x <= X_MAX; x += 10) {
        const cx = toCanvasX(x, canvas);
        ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, canvas.height - PAD.bottom); ctx.stroke();
        ctx.fillText(x.toString(), cx, canvas.height - PAD.bottom + 20);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y <= Y_MAX; y += 10) {
        const cy = toCanvasY(y, canvas);
        ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(canvas.width - PAD.right, cy); ctx.stroke();
        ctx.fillText(y.toString(), PAD.left - 8, cy + 4);
    }

    ctx.setLineDash([]); ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2;
    ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

    ctx.save(); ctx.beginPath(); ctx.rect(PAD.left, PAD.top, plotW, plotH); ctx.clip();

    if (areaState.hullEdges.length > 0) {
        ctx.strokeStyle = '#0000ff'; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
        areaState.hullEdges.forEach(([i, j]) => {
            const p1 = areaState.points[i], p2 = areaState.points[j];
            ctx.beginPath(); ctx.moveTo(toCanvasX(p1.x, canvas), toCanvasY(p1.y, canvas)); ctx.lineTo(toCanvasX(p2.x, canvas), toCanvasY(p2.y, canvas)); ctx.stroke();
        });
        ctx.setLineDash([]);
    }

    if (areaState.M_U) {
        const cx = toCanvasX(areaState.M_U.x, canvas), cy = toCanvasY(areaState.M_U.y, canvas);
        const rx = (areaState.M_U.r / X_MAX) * plotW, ry = (areaState.M_U.r / Y_MAX) * plotH;
        ctx.strokeStyle = 'rgb(13, 210, 25)'; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
        ctx.setLineDash([]);
    }

    areaState.points.forEach((pt, idx) => {
        const cx = toCanvasX(pt.x, canvas), cy = toCanvasY(pt.y, canvas);
        ctx.strokeStyle = '#0072bd'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.stroke();
        if (!areaState.collecting) {
            ctx.fillStyle = '#00aa00'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(`${idx + 1}`, cx + 7, cy + 4);
        }
    });

    const drawCenterMarker = (pt, label, crossColor, textColor) => {
        if (!pt) return;
        const cx = toCanvasX(pt.x, canvas), cy = toCanvasY(pt.y, canvas);
        ctx.strokeStyle = crossColor; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
        ctx.fillStyle = textColor; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(label, cx + 8, cy + 4);
    };
    drawCenterMarker(areaState.M_A, 'M_A', '#d95319', '#00aa00');
    drawCenterMarker(areaState.M_M, 'M_M', '#9333ea', '#9333ea');
    drawCenterMarker(areaState.M_U, 'M_U', '#d95319', '#00aa00');

    ctx.restore();
}

function initAreaPur() {
    const canvas = document.getElementById('areaCanvas');
    if (!canvas || areaPurBound) return;
    areaPurBound = true;

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (canvas.width / rect.width);
        const py = (e.clientY - rect.top) * (canvas.height / rect.height);
        document.getElementById('area-x-val').value = toWorldX(px, canvas).toFixed(4);
        document.getElementById('area-y-val').value = toWorldY(py, canvas).toFixed(4);
    });

    canvas.addEventListener('mousedown', (e) => {
        if (!areaState.collecting) return;
        if (e.button === 2) { e.preventDefault(); areaFinishAndCalculate(); return; }
        if (e.button === 0) {
            const rect = canvas.getBoundingClientRect();
            const px = (e.clientX - rect.left) * (canvas.width / rect.width);
            const py = (e.clientY - rect.top) * (canvas.height / rect.height);
            const wx = Math.round(toWorldX(px, canvas) * 100) / 100, wy = Math.round(toWorldY(py, canvas) * 100) / 100;
            if (wx >= 0 && wx <= X_MAX && wy >= 0 && wy <= Y_MAX) {
                areaState.points.push({ x: wx, y: wy });
                drawAreaCanvas();
            }
        }
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    drawAreaCanvas();
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (document.getElementById('page-area-pur')?.classList.contains('active') && areaState.collecting) {
            e.preventDefault(); areaFinishAndCalculate();
        } else if (document.getElementById('page-area-maps')?.classList.contains('active') && typeof mapsState !== 'undefined' && mapsState.collecting && mapsState.latlngs.length >= 3) {
            e.preventDefault(); mapsMathFinishAndCalculate();
        }
    }
});

function areaStartCollection() {
    initAreaPur();
    areaState = { collecting: true, points: [], hullEdges: [], M_A: null, M_M: null, M_U: null };
    document.getElementById('area-calc-btn').classList.remove('hidden');
    document.getElementById('area-output-text').value = "Sammle Koordinaten mit der Maus!\n\nBeenden mit ENTER, Rechtsklick oder dem grünen Button.";
    drawAreaCanvas();
}

function formatNum(val) { return Number(Math.round(val * 100) / 100).toString(); }

function areaFinishAndCalculate() {
    areaState.collecting = false;
    document.getElementById('area-calc-btn').classList.add('hidden');
    const pts = areaState.points;
    if (pts.length < 3) {
        document.getElementById('area-output-text').value = `Zu wenige Punkte ausgewählt (${pts.length}). Bitte mindestens 3 Punkte klicken.`;
        drawAreaCanvas(); return;
    }
    const res = solveGeometry2D(pts);
    areaState.hullEdges = res.hullEdges; areaState.M_A = res.M_A; areaState.M_M = res.M_M; areaState.M_U = res.M_U;

    const lines = ["Die Koordinaten der Punkte:"];
    pts.forEach((p, idx) => lines.push(`P${idx + 1} = (${formatNum(p.x)} / ${formatNum(p.y)})`));
    lines.push(
        "", `Flächeninhalt des umspannenden ${res.aussenCnt}-Ecks:`, `${formatNum(res.Flaeche)}`,
        "", `Die ${res.aussenCnt} aussen liegenden Punkte:`, formatPointList(res.outerIndices),
        "", "Die Punkte, die auf dem Umkreis", `(M = (${formatNum(res.M_U.x)} / ${formatNum(res.M_U.y)}), r = ${formatNum(res.M_U.r)}) liegen:`, formatPointList(res.randIndizes),
        "", "Die Mittelpunkte:",
        `M_U = (${formatNum(res.M_U.x)} / ${formatNum(res.M_U.y)}), r = ${formatNum(res.M_U.r)}`,
        `M_A = (${formatNum(res.M_A.x)} / ${formatNum(res.M_A.y)})`,
        `M_M = (${formatNum(res.M_M.x)} / ${formatNum(res.M_M.y)})`
    );
    document.getElementById('area-output-text').value = lines.join("\n");
    drawAreaCanvas();
}