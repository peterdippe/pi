// -----------------------------------------------------------------
// RADFAHREN (VAM- & TOUREN-RECHNER) & WANDERN (GEHZEIT NACH DIN 33466)
// -----------------------------------------------------------------
function calcBikeMetrics() {
    const dist = Math.max(0.1, parseFloat(document.getElementById('bike-dist')?.value) || 0);
    const hm = Math.max(0, parseFloat(document.getElementById('bike-hm')?.value) || 0);
    const flatSpeed = Math.max(5, parseFloat(document.getElementById('bike-speed')?.value) || 25);
    const vam = Math.max(100, parseFloat(document.getElementById('bike-vam')?.value) || 600);

    const flatHours = dist / flatSpeed;
    const climbHours = hm / vam;
    const totalHours = flatHours + climbHours * 0.55;
    const avgSpeed = dist / totalHours;
    const hmPerKm = hm / dist;

    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    const box = document.getElementById('bike-calc-result');
    if (box) {
        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                <div><span class="person-role">Geschätzte Fahrzeit</span><div class="person-name" style="font-size:20px;">${h} Std. ${m} Min.</div></div>
                <div><span class="person-role">Effektiver Schnitt</span><div class="person-name" style="font-size:20px;">${avgSpeed.toFixed(1)} km/h</div></div>
                <div><span class="person-role">Profil-Härte</span><div class="person-name" style="font-size:20px;">${hmPerKm.toFixed(1)} Hm/km</div></div>
            </div>
        `;
    }
}

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

window.addEventListener('DOMContentLoaded', () => {
    calcBikeMetrics();
    calcHikeTime();
});

