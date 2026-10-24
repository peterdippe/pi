// ===================================================================
// MAPS MATH: INTERAKTIVE KARTENGEOMETRIE & WELZL-KERN (js/area-maps.js)
// ===================================================================

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

function circumcircleWelzl(pts) {
    const indexed = pts.map((p, idx) => ({ idx, x: p.x, y: p.y }));
    for (let i = indexed.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [indexed[i], indexed[r]] = [indexed[r], indexed[i]];
    }
    return welzlRecursive(indexed, []);
}

let mapsMathMap = null, mapsMathLayers = {}, mapsMathDrawGroup = null;
let mapsState = { collecting: true, latlngs: [] };

function initMapsMathIfNeeded() {
    if (mapsMathMap || typeof L === 'undefined' || !document.getElementById('mapsMathContainer')) return;

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

function drawMapsOrderedEdges(latlngs, color) {
    const n = latlngs.length;
    for (let i = 0; i < n; i++) {
        const a = latlngs[i], b = latlngs[(i + 1) % n];
        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color, weight: 2.5 }).addTo(mapsMathDrawGroup);
    }
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