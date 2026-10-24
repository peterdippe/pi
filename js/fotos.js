// ===================================================================
// FOTOS & CLOUD-ALBEN (js/fotos.js)
// ===================================================================

function renderAlbums() {
    const grid = document.getElementById('alben-grid');
    if (!grid) return;
    grid.innerHTML = CONFIG.alben.map(a => `
        <div class="sand-card" style="padding:0; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <div style="background:${a.bg}; padding:22px; color:#fff;">
                    <span style="font-size:11px; font-weight:800; text-transform:uppercase; background:rgba(0,0,0,0.25); padding:4px 10px; border-radius:20px;">${a.anbieter}</span>
                    <h3 style="font-size:21px; font-weight:800; margin-top:12px;">${a.titel}</h3>
                </div>
                <div style="padding:20px;">
                    <div style="font-size:12px; font-weight:700; color:var(--emerald-dark);">${a.datum}</div>
                    <p style="font-size:14px; line-height:1.55; margin-top:8px;">${a.beschreibung}</p>
                </div>
            </div>
            <div style="padding:0 20px 20px;">
                <a href="${a.link}" target="_blank" rel="noopener" class="btn btn-dark" style="width:100%;">Ordner in Cloud öffnen ↗</a>
            </div>
        </div>
    `).join('');
}

async function unlockPhotos(e) {
    e.preventDefault();
    const val = document.getElementById('foto-password-input').value.trim();
    const err = document.getElementById('foto-error-msg');

    if (!val || !CONFIG.pinnwandCloudUrl) {
        err.classList.remove('hidden');
        return;
    }

    try {
        const res = await fetch(CONFIG.pinnwandCloudUrl + `?kind=auth&type=foto&password=${encodeURIComponent(val)}`);
        const j = await res.json();

        if (j && j.ok === true) {
            err.classList.add('hidden');
            document.getElementById('foto-login-gate').classList.add('hidden');
            document.getElementById('foto-content').classList.remove('hidden');
            document.getElementById('logout-btn').classList.remove('hidden');
            document.getElementById('lock-indicator').textContent = '🔓';
            renderAlbums();
        } else {
            err.classList.remove('hidden');
        }
    } catch (ex) {
        alert('Verbindungsfehler zum Authentifizierungs-Server.');
    }
}

function lockPhotos() {
    document.getElementById('foto-password-input').value = '';
    document.getElementById('foto-login-gate').classList.remove('hidden');
    document.getElementById('foto-content').classList.add('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
    document.getElementById('lock-indicator').textContent = '🔒';
}