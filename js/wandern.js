// ===================================================================
// WANDERUNGEN: GEHZEIT-RECHNER NACH DIN 33466 (js/wandern.js)
// ===================================================================

function calcHikeTime() {
    const km = Math.max(0, parseFloat(document.getElementById('hike-km')?.value) || 0);
    const up = Math.max(0, parseFloat(document.getElementById('hike-up')?.value) || 0);
    const down = Math.max(0, parseFloat(document.getElementById('hike-down')?.value) || 0);

    const tHoriz = km / 4.0;
    const tVert = (up / 300.0) + (down / 500.0);
    const totalHours = Math.max(tHoriz, tVert) + 0.5 * Math.min(tHoriz, tVert);

    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    const box = document.getElementById('hike-calc-result');
    if (box) {
        box.innerHTML = `
            <span class="person-role">Reine Gehzeit (DIN 33466)</span>
            <div class="score-big" style="color:var(--emerald-dark); margin:6px 0;">${h} h ${m} min</div>
            <div style="font-size:12px; color:#475569;">Horizontal: ${(tHoriz*60).toFixed(0)} Min. · Vertikal: ${(tVert*60).toFixed(0)} Min. (ohne Pausen)</div>
        `;
    }
}