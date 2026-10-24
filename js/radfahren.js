// ===================================================================
// FAHRRADFAHREN: TOUREN-ZEIT & VAM-STEIGUNGSRECHNER (js/radfahren.js)
// ===================================================================

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