// -----------------------------------------------------------------
// 6. GEOMETRIE-KERN FÜR MAPS MATH & PURE MATH (Welzl, Polygon, Konvexhülle)
// -----------------------------------------------------------------
function polygonAreaOrdered(pts) {
    const n = pts.length;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2.0;
}

function segmentsProperlyIntersect(p1, p2, p3, p4) {
    const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const onSeg = (a, b, c) =>
        Math.min(a.x, b.x) - 1e-9 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-9 &&
        Math.min(a.y, b.y) - 1e-9 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-9;
    const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    if (d1 !== d2 && d3 !== d4) return true;
    if (d1 === 0 && onSeg(p3, p4, p1)) return true;
    if (d2 === 0 && onSeg(p3, p4, p2)) return true;
    if (d3 === 0 && onSeg(p1, p2, p3)) return true;
    if (d4 === 0 && onSeg(p1, p2, p4)) return true;
    return false;
}

function findSelfIntersection(pts) {
    const n = pts.length;
    const edge = i => [pts[i], pts[(i + 1) % n]];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (j === i) continue;
            if (i === (j + 1) % n || j === (i + 1) % n) continue;
            const [a1, a2] = edge(i), [b1, b2] = edge(j);
            if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
                return { a: [i + 1, (i + 1) % n + 1], b: [j + 1, (j + 1) % n + 1] };
            }
        }
    }
    return null;
}

function circumcircleWelzl(pts) {
    const indexed = pts.map((p, idx) => ({ idx, x: p.x, y: p.y }));
    for (let i = indexed.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [indexed[i], indexed[r]] = [indexed[r], indexed[i]];
    }
    return welzlRecursive(indexed, []);
}

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

    const indexedPts = pts.map((p, idx) => ({ idx, x: p.x, y: p.y }));
    for (let i = indexedPts.length - 1; i > 0; i--) {
        const rIdx = Math.floor(Math.random() * (i + 1));
        [indexedPts[i], indexedPts[rIdx]] = [indexedPts[rIdx], indexedPts[i]];
    }
    const circle = welzlRecursive(indexedPts, []);

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

function circleFrom2Points(p1, p2) {
    const xM = (p1.x + p2.x) / 2.0, yM = (p1.y + p2.y) / 2.0;
    const r = Math.hypot(p1.x - p2.x, p1.y - p2.y) / 2.0;
    return { x: xM, y: yM, r: r, support: [p1.idx, p2.idx] };
}

function circleFrom3Points(p1, p2, p3) {
    const D = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(D) < 1e-12) {
        const pairs = [[p1, p2], [p1, p3], [p2, p3]];
        let best = pairs[0], maxD = -1;
        for (const pr of pairs) {
            const d = Math.hypot(pr[0].x - pr[1].x, pr[0].y - pr[1].y);
            if (d > maxD) { maxD = d; best = pr; }
        }
        return circleFrom2Points(best[0], best[1]);
    }
    const ux = ((p1.x**2 + p1.y**2)*(p2.y - p3.y) + (p2.x**2 + p2.y**2)*(p3.y - p1.y) + (p3.x**2 + p3.y**2)*(p1.y - p2.y)) / D;
    const uy = ((p1.x**2 + p1.y**2)*(p3.x - p2.x) + (p2.x**2 + p2.y**2)*(p1.x - p3.x) + (p3.x**2 + p3.y**2)*(p2.x - p1.x)) / D;
    const r = Math.hypot(p1.x - ux, p1.y - uy);
    return { x: ux, y: uy, r: r, support: [p1.idx, p2.idx, p3.idx] };
}

function trivialCircle(R) {
    if (R.length === 0) return { x: 0, y: 0, r: 0, support: [] };
    if (R.length === 1) return { x: R[0].x, y: R[0].y, r: 0, support: [R[0].idx] };
    if (R.length === 2) return circleFrom2Points(R[0], R[1]);
    return circleFrom3Points(R[0], R[1], R[2]);
}

function welzlRecursive(P, R) {
    if (P.length === 0 || R.length === 3) return trivialCircle(R);
    const p = P[P.length - 1];
    const P_rest = P.slice(0, P.length - 1);
    const c = welzlRecursive(P_rest, R);
    if (Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-7) return c;
    return welzlRecursive(P_rest, [...R, p]);
}


// -----------------------------------------------------------------
// 7. MAPS MATH (Interaktive Karte)
// -----------------------------------------------------------------
let mapsMathMap = null, mapsMathLayers = {}, mapsMathDrawGroup = null;
let mapsState = { collecting: true, latlngs: [] };

function initMapsMathIfNeeded() {
    if (mapsMathMap || typeof L === 'undefined') return;

    mapsMathMap = L.map('mapsMathContainer', { center: pirnaCoords, zoom: 16 });
    mapsMathLayers = buildLayerSet();
    mapsMathLayers['osm'].addTo(mapsMathMap);
    mapsMathDrawGroup = L.layerGroup().addTo(mapsMathMap);
    fillLayerSelect('maps-layer-select', 'osm');

    mapsMathMap.on('mousemove', (e) => {
        document.getElementById('maps-lat-val').value = e.latlng.lat.toFixed(5);
        document.getElementById('maps-lng-val').value = e.latlng.lng.toFixed(5);
    });
    mapsMathMap.on('zoomend', () => {
        document.getElementById('maps-zoom-badge').textContent = `Zoom: ${mapsMathMap.getZoom()}`;
    });
    mapsMathMap.on('click', (e) => {
        if (!mapsState.collecting) return;
        mapsState.latlngs.push({ lat: e.latlng.lat, lng: e.latlng.lng });
        renderMapsMathMarkersOnly();
    });
    mapsMathMap.on('contextmenu', () => {
        if (mapsState.collecting && mapsState.latlngs.length >= 3) mapsMathFinishAndCalculate();
    });
}

function setMapsMathLayer(key) {
    initMapsMathIfNeeded();
    if (!mapsMathMap || !mapsMathLayers[key]) return;
    Object.values(mapsMathLayers).forEach(l => mapsMathMap.removeLayer(l));
    mapsMathLayers[key].addTo(mapsMathMap);
    const sel = document.getElementById('maps-layer-select');
    if (sel && sel.value !== key) sel.value = key;
}

function mapsMathResetToPirna() {
    initMapsMathIfNeeded();
    if (mapsMathMap) mapsMathMap.setView(pirnaCoords, 16);
}

function mapsMathStart() {
    initMapsMathIfNeeded();
    mapsState.collecting = true;
    mapsState.latlngs = [];
    if (mapsMathDrawGroup) mapsMathDrawGroup.clearLayers();
    document.getElementById('maps-output-text').value = [
        "Sammle Koordinaten auf der Karte!",
        "",
        "Scrolle und zoome frei in der Karte.",
        "Setze Punkte per Linksklick.",
        "",
        "Berechnung starten:",
        "Klicke auf „Berechnen (ENTER)“, drücke ENTER oder Rechtsklick."
    ].join("\n");
}

function renderMapsMathMarkersOnly() {
    mapsMathDrawGroup.clearLayers();
    mapsState.latlngs.forEach((pt, idx) => {
        L.circleMarker([pt.lat, pt.lng], {
            radius: 6, color: '#0072bd', weight: 2.5, fillColor: '#ffffff', fillOpacity: 0.95
        }).bindTooltip(`P${idx + 1}`, { permanent: true, direction: 'right' }).addTo(mapsMathDrawGroup);
    });
}

function formatAdaptiveArea(areaSqMeters, zoom) {
    if (areaSqMeters >= 1_000_000 || zoom <= 11) {
        return `${(areaSqMeters / 1_000_000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} km²`;
    } else if (areaSqMeters >= 10_000 || (zoom <= 14 && areaSqMeters >= 2500)) {
        const ha = areaSqMeters / 10_000;
        return `${ha.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ha (${Math.round(areaSqMeters).toLocaleString('de-DE')} m²)`;
    }
    return `${areaSqMeters.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function formatAdaptiveDistance(meters) {
    if (meters >= 1000) {
        return `${(meters / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km (${Math.round(meters).toLocaleString('de-DE')} m)`;
    }
    return `${meters.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function mapsMathFinishAndCalculate() {
    initMapsMathIfNeeded();
    const n = mapsState.latlngs.length;
    if (n < 3) {
        document.getElementById('maps-output-text').value = `Zu wenige Punkte auf der Karte! (${n} gesetzt, mindestens 3 benötigt).`;
        return;
    }
    mapsState.collecting = false;
    mapsMathDrawGroup.clearLayers();

    const R_EARTH = 6371008.8;
    const lat0 = mapsState.latlngs.reduce((s, p) => s + p.lat, 0) / n;
    const lng0 = mapsState.latlngs.reduce((s, p) => s + p.lng, 0) / n;
    const cosLat0 = Math.cos(lat0 * Math.PI / 180.0);

    const toMeters = (lat, lng) => ({
        x: R_EARTH * ((lng - lng0) * Math.PI / 180.0) * cosLat0,
        y: R_EARTH * ((lat - lat0) * Math.PI / 180.0)
    });
    const toLatLng = (x, y) => ({
        lat: lat0 + (y / R_EARTH) * (180.0 / Math.PI),
        lng: lng0 + (x / (R_EARTH * cosLat0)) * (180.0 / Math.PI)
    });

    const metricPts = mapsState.latlngs.map(p => toMeters(p.lat, p.lng));

    const crossing = findSelfIntersection(metricPts);
    if (crossing) {
        drawMapsOrderedEdges(mapsState.latlngs, '#dc2626');
        mapsState.latlngs.forEach((pt, idx) => {
            L.circleMarker([pt.lat, pt.lng], { radius: 6, color: '#dc2626', weight: 2.5, fillColor: '#ffffff', fillOpacity: 1 })
             .bindTooltip(`P${idx + 1}`, { permanent: true, direction: 'right' }).addTo(mapsMathDrawGroup);
        });
        document.getElementById('maps-output-text').value = [
            '⚠️ FEHLER: Die Kanten des Polygons überkreuzen sich!',
            '',
            `Die Kante P${crossing.a[0]}–P${crossing.a[1]} schneidet die Kante P${crossing.b[0]}–P${crossing.b[1]}.`,
            '',
            'Ein Flächeninhalt in Klick-Reihenfolge ist so nicht eindeutig definiert.',
            'Bitte starte neu („Start“) und setze die Punkte so, dass sich',
            'keine Verbindungslinien kreuzen.'
        ].join('\n');
        mapsState.collecting = false;
        return;
    }

    const res = circumcircleWelzl(metricPts);
    const areaM2 = polygonAreaOrdered(metricPts);
    const M_U_ll = toLatLng(res.x, res.y);

    L.polygon(mapsState.latlngs.map(p => [p.lat, p.lng]),
        { color: '#2563eb', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.16 }).addTo(mapsMathDrawGroup);

    L.circle([M_U_ll.lat, M_U_ll.lng], {
        radius: res.r, color: '#10b981', weight: 2.5, dashArray: '8, 6', fillColor: '#10b981', fillOpacity: 0.06
    }).addTo(mapsMathDrawGroup);

    mapsState.latlngs.forEach((pt, idx) => {
        L.circleMarker([pt.lat, pt.lng], { radius: 6, color: '#0072bd', weight: 2.5, fillColor: '#ffffff', fillOpacity: 1 })
         .bindTooltip(`P${idx + 1}`, { permanent: true, direction: 'right' }).addTo(mapsMathDrawGroup);
    });

    L.circleMarker([M_U_ll.lat, M_U_ll.lng], { radius: 6, color: '#d97706', weight: 3, fillColor: '#d97706', fillOpacity: 1 })
     .bindTooltip('M_U', { permanent: true, direction: 'top' })
     .bindPopup(`<b>M_U (Umkreismittelpunkt)</b><br>Breite: ${M_U_ll.lat.toFixed(5)}°<br>Länge: ${M_U_ll.lng.toFixed(5)}°`)
     .addTo(mapsMathDrawGroup);

    const zoom = mapsMathMap.getZoom();
    const areaFormatted = formatAdaptiveArea(areaM2, zoom);
    const radiusFormatted = formatAdaptiveDistance(res.r);

    const lines = ["Die Koordinaten der Punkte (Breite / Länge):"];
    mapsState.latlngs.forEach((p, idx) => lines.push(`P${idx + 1} = (${p.lat.toFixed(5)}° N / ${p.lng.toFixed(5)}° O)`));
    lines.push(
        "",
        `Flächeninhalt des ${n}-Ecks in Klick-Reihenfolge (Zoom ${zoom}):`,
        `${areaFormatted}`,
        "",
        `Kantenfolge: ${mapsState.latlngs.map((_, i) => 'P' + (i + 1)).join(' → ')} → P1`,
        "",
        `Umkreis (kleinster umschließender Kreis):`,
        `M_U = (${M_U_ll.lat.toFixed(5)}° N / ${M_U_ll.lng.toFixed(5)}° O), r = ${radiusFormatted}`
    );
    document.getElementById('maps-output-text').value = lines.join("\n");
}

function drawMapsOrderedEdges(latlngs, color) {
    const n = latlngs.length;
    for (let i = 0; i < n; i++) {
        const a = latlngs[i], b = latlngs[(i + 1) % n];
        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color, weight: 2.5 }).addTo(mapsMathDrawGroup);
    }
}

// -----------------------------------------------------------------
// 8. PURE MATH (Koordinatensystem 200 breit x 130 hoch)
// -----------------------------------------------------------------
const canvas = document.getElementById('areaCanvas');
const ctx = canvas.getContext('2d');
const PAD = { left: 48, right: 22, top: 22, bottom: 42 };
const X_MAX = 200, Y_MAX = 130;
let areaState = { collecting: false, points: [], hullEdges: [], M_A: null, M_M: null, M_U: null };

function toCanvasX(x) { return PAD.left + (x / X_MAX) * (canvas.width - PAD.left - PAD.right); }
function toCanvasY(y) { return canvas.height - PAD.bottom - (y / Y_MAX) * (canvas.height - PAD.top - PAD.bottom); }
function toWorldX(px) { return ((px - PAD.left) / (canvas.width - PAD.left - PAD.right)) * X_MAX; }
function toWorldY(py) { return ((canvas.height - PAD.bottom - py) / (canvas.height - PAD.top - PAD.bottom)) * Y_MAX; }

function drawAreaCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const plotW = canvas.width - PAD.left - PAD.right, plotH = canvas.height - PAD.top - PAD.bottom;

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.font = '12px "JetBrains Mono", monospace'; ctx.fillStyle = '#334155';

    ctx.textAlign = 'center';
    for (let x = 0; x <= X_MAX; x += 10) {
        const cx = toCanvasX(x);
        ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, canvas.height - PAD.bottom); ctx.stroke();
        ctx.fillText(x.toString(), cx, canvas.height - PAD.bottom + 20);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y <= Y_MAX; y += 10) {
        const cy = toCanvasY(y);
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
            ctx.beginPath(); ctx.moveTo(toCanvasX(p1.x), toCanvasY(p1.y)); ctx.lineTo(toCanvasX(p2.x), toCanvasY(p2.y)); ctx.stroke();
        });
        ctx.setLineDash([]);
    }

    if (areaState.M_U) {
        const cx = toCanvasX(areaState.M_U.x), cy = toCanvasY(areaState.M_U.y);
        const rx = (areaState.M_U.r / X_MAX) * plotW, ry = (areaState.M_U.r / Y_MAX) * plotH;
        ctx.strokeStyle = 'rgb(13, 210, 25)'; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
        ctx.setLineDash([]);
    }

    areaState.points.forEach((pt, idx) => {
        const cx = toCanvasX(pt.x), cy = toCanvasY(pt.y);
        ctx.strokeStyle = '#0072bd'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.stroke();
        if (!areaState.collecting) {
            ctx.fillStyle = '#00aa00'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(`${idx + 1}`, cx + 7, cy + 4);
        }
    });

    const drawCenterMarker = (pt, label, crossColor, textColor) => {
        if (!pt) return;
        const cx = toCanvasX(pt.x), cy = toCanvasY(pt.y);
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

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    document.getElementById('area-x-val').value = toWorldX(px).toFixed(4);
    document.getElementById('area-y-val').value = toWorldY(py).toFixed(4);
});

canvas.addEventListener('mousedown', (e) => {
    if (!areaState.collecting) return;
    if (e.button === 2) { e.preventDefault(); areaFinishAndCalculate(); return; }
    if (e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (canvas.width / rect.width);
        const py = (e.clientY - rect.top) * (canvas.height / rect.height);
        const wx = Math.round(toWorldX(px) * 100) / 100, wy = Math.round(toWorldY(py) * 100) / 100;
        if (wx >= 0 && wx <= X_MAX && wy >= 0 && wy <= Y_MAX) {
            areaState.points.push({ x: wx, y: wy });
            drawAreaCanvas();
        }
    }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (document.getElementById('page-area-pur').classList.contains('active') && areaState.collecting) {
            e.preventDefault(); areaFinishAndCalculate();
        } else if (document.getElementById('page-area-maps').classList.contains('active') && mapsState.collecting && mapsState.latlngs.length >= 3) {
            e.preventDefault(); mapsMathFinishAndCalculate();
        }
    }
});

function areaStartCollection() {
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

