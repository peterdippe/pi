// -----------------------------------------------------------------
// 4. INTERAKTIVE FAMILIEN-PINNWAND (INKL. GOOGLE DRIVE CLOUD-SYNC)
// -----------------------------------------------------------------
const DEFAULT_PINNWAND = {
    categories: [
        { id: 'alle', icon: '✨', name: 'Alle Beiträge' },
        { id: 'termine', icon: '📅', name: 'Termine & Treffen' },
        { id: 'rezepte', icon: '🍰', name: 'Rezepte & Kulinarisches' },
        { id: 'wandern', icon: '🥾', name: 'Ausflüge & Wandern' },
        { id: 'haus', icon: '🏡', name: 'Haus, Garten & Technik' },
        { id: 'verleih', icon: '🔧', name: 'Verleih & Flohmarkt' },
        { id: 'dokumente', icon: '📄', name: 'Dokumente & Dateien' }
    ],
    activeCat: 'alle',
    posts: [
        {
            id: 101,
            cat: 'termine',
            title: '🏡 Großes Sippen-Treffen in Pirna',
            desc: 'Gemütliches Beisammensein in der Emil-Gast-Straße 4 in Pirna. Neue Termine und Ideen einfach hier per „Bearbeiten“ ergänzen!',
            img: '',
            fileLink: ''
        },
        {
            id: 1,
            cat: 'rezepte',
            title: 'Sächsische Eierschecke & Familienrezepte',
            desc: 'Hier sammeln wir die besten Kuchen-, Grill- und Festtagsrezepte unserer Familie – gern direkt mit eingebettetem Foto oder PDF-Rezeptblatt!',
            img: '',
            fileLink: ''
        },
        {
            id: 2,
            cat: 'wandern',
            title: 'Wanderrouten & Gipfel rund um Pirna',
            desc: 'Unsere schönsten Touren im Elbsandsteingebirge. Tipp: Im „Berg-Dominanz-Atlas“ unter Map-Tools könnt ihr alle Gipfel der Region erkunden!',
            img: '',
            fileLink: ''
        },
        {
            id: 3,
            cat: 'haus',
            title: 'Haus- & Garten-Wissen (Pläne & Anleitungen)',
            desc: 'Praktische Übersicht für Schaltpläne, Gartenbewässerung, Bedienungsanleitungen und technische Skizzen rund ums Haus.',
            img: '',
            fileLink: ''
        },
        {
            id: 4,
            cat: 'verleih',
            title: 'Familien-Werkzeug & Ausrüstungs-Pool',
            desc: 'Wer braucht mal eine Heckenschere, ein Familienzelt, Dachbox oder Kinder-Ausrüstung? Einfach hier eintragen!',
            img: '',
            fileLink: ''
        }
    ]
};

let pinnwandData = null;
let editingPinId = null;
let currentPinImageData = '';

function setPinnwandSyncStatus(text, color) {
    const el = document.getElementById('pinnwand-sync-status');
    if (!el) return;
    el.textContent = text;
    if (color) el.style.color = color;
}

function ensureTermineCategory(data) {
    if (!data || !Array.isArray(data.categories)) return DEFAULT_PINNWAND;
    if (!data.categories.some(c => c.id === 'termine')) {
        data.categories.splice(1, 0, { id: 'termine', icon: '📅', name: 'Termine & Treffen' });
    }
    if (!Array.isArray(data.posts)) data.posts = [];
    return data;
}

async function initPinnwand() {
     // 1. Lokalen Stand sofort anzeigen
     const saved = localStorage.getItem('dippe_pinnwand_v1');
     if (saved) {
         try { pinnwandData = JSON.parse(saved); } catch { pinnwandData = DEFAULT_PINNWAND; }
     } else {
         pinnwandData = DEFAULT_PINNWAND;
     }
     renderPinnwand();
     renderAllHighscores();
     // Highscores aus eigener Drive-Datei nachladen (getrennt von Pinnwand)
     loadHighscoresFromCloud();

     // 2. Strg+V Bild-Upload im Formular aktivieren
     const postForm = document.getElementById('pinnwand-post-form');
     if (postForm && !postForm.dataset.pasteBound) {
         postForm.dataset.pasteBound = "1";
         postForm.addEventListener('paste', (e) => {
             const items = e.clipboardData?.items;
             if (!items) return;
             for (const item of items) {
                 if (item.type.indexOf('image') !== -1) {
                     const file = item.getAsFile();
                     if (file) compressAndSetPinImage(file);
                     e.preventDefault();
                     break;
                 }
             }
         });
     }

     // 3. Aktuellen Stand aus dippe_pinnwand_db.json in Google Drive laden
     if (CONFIG.pinnwandCloudUrl && CONFIG.pinnwandCloudUrl.startsWith('https://script.google.com/')) {
         try {
             const res = await fetch(CONFIG.pinnwandCloudUrl + '?kind=pinnwand', { method: 'GET', redirect: 'follow' });
             const cloudData = await res.json();
             if (cloudData && Array.isArray(cloudData.posts) && Array.isArray(cloudData.categories)) {
                 pinnwandData = cloudData;
                 localStorage.setItem('dippe_pinnwand_v1', JSON.stringify(pinnwandData));
                 renderPinnwand();
             } else if (cloudData && cloudData.empty) {
                 // Noch keine Pinnwand-Datei in Drive vorhanden -> jetzt automatisch anlegen
                 savePinnwandState();
             }
             // Fremde Antwort -> lokalen Stand behalten, nichts ueberschreiben.
         } catch (err) {
             console.warn('Cloud-Pinnwand konnte nicht geladen werden:', err);
         }
     }
 }

async function loadPinnwandFromCloud(manualClick) {
    const url = (CONFIG.pinnwandCloudUrl || '').trim();
    if (!url || !url.startsWith('https://script.google.com/')) {
        if (manualClick) alert('Bitte trage zuerst deine Google Apps Script Web-App-URL unter CONFIG.pinnwandCloudUrl ein.');
        return;
    }
    setPinnwandSyncStatus('⏳ Lade aus Google Drive …', '#fbbf24');
    try {
        const res = await fetch(url + '?kind=pinnwand&t=' + Date.now(), { method: 'GET', redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const cloudData = await res.json();

        if (cloudData && Array.isArray(cloudData.categories) && Array.isArray(cloudData.posts)) {
            const currentActive = pinnwandData?.activeCat || 'alle';
            pinnwandData = ensureTermineCategory(cloudData);
            pinnwandData.activeCat = currentActive;
            localStorage.setItem('dippe_pinnwand_v1', JSON.stringify(pinnwandData));
            renderPinnwand();
            setPinnwandSyncStatus('☁️ Synchronisiert mit Google Drive', '#a7f3d0');
        } else {
            // Datei war leer oder hatte Altlasten -> lokalen Stand jetzt initial in Drive speichern!
            await savePinnwandState();
        }
    } catch (err) {
        setPinnwandSyncStatus('⚠️ Offline / Lokal gespeichert', '#fca5a5');
    }
}

async function savePinnwandState() {
    try {
        localStorage.setItem('dippe_pinnwand_v1', JSON.stringify(pinnwandData));
    } catch (err) {}
    renderPinnwand();

    if (CONFIG.pinnwandCloudUrl && CONFIG.pinnwandCloudUrl.startsWith('https://script.google.com/')) {
        setPinnwandSyncStatus('⏳ Speichere in Google Drive …', '#fbbf24');
        try {
            const res = await fetch(CONFIG.pinnwandCloudUrl, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ kind: 'pinnwand', data: pinnwandData })
            });
            const j = await res.json();
            if (j && j.ok) {
                setPinnwandSyncStatus('☁️ Synchronisiert mit Google Drive', '#a7f3d0');
            } else {
                setPinnwandSyncStatus('⚠️ Lokal gespeichert (Cloud-Antwort prüfen)', '#fcd34d');
            }
        } catch (err) {
            setPinnwandSyncStatus('⚠️ Offline / Lokal gespeichert', '#fca5a5');
        }
    }
}

function compressAndSetPinImage(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const maxDim = 1000;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
                else { w = Math.round(w * (maxDim / h)); h = maxDim; }
            }
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            currentPinImageData = c.toDataURL('image/jpeg', 0.80);
            updatePinImagePreviewUI(currentPinImageData);
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function previewPinnwandImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    document.getElementById('pin-img-url').value = '';
    compressAndSetPinImage(file);
}

function previewPinnwandImageUrl(url) {
    const trimmed = url.trim();
    if (trimmed) {
        currentPinImageData = trimmed;
        document.getElementById('pin-img-input').value = '';
        updatePinImagePreviewUI(trimmed);
    } else if (!document.getElementById('pin-img-input').files?.length) {
        clearPinnwandImage();
    }
}

function updatePinImagePreviewUI(src) {
    const box = document.getElementById('pin-img-preview-box');
    const preview = document.getElementById('pin-img-preview');
    if (src) {
        preview.src = src;
        box.classList.remove('hidden');
    } else {
        preview.src = '';
        box.classList.add('hidden');
    }
}

function clearPinnwandImage() {
    currentPinImageData = '';
    const fileIn = document.getElementById('pin-img-input');
    const urlIn = document.getElementById('pin-img-url');
    if (fileIn) fileIn.value = '';
    if (urlIn) urlIn.value = '';
    updatePinImagePreviewUI('');
}

function openNewPinnwandPostForm() {
    editingPinId = null;
    document.getElementById('pin-form-heading').textContent = '➕ Neuen Pinnwand-Eintrag hinzufügen';
    document.getElementById('pin-submit-btn').textContent = '💾 Speichern';
    document.getElementById('pin-title').value = '';
    document.getElementById('pin-desc').value = '';
    document.getElementById('pin-file-link').value = '';
    if (pinnwandData.activeCat && pinnwandData.activeCat !== 'alle') {
        document.getElementById('pin-cat-select').value = pinnwandData.activeCat;
    }
    clearPinnwandImage();
    togglePinnwandForm('post');
}

function editPinnwandPost(id) {
    const post = pinnwandData.posts.find(p => p.id === id);
    if (!post) return;
    editingPinId = id;
    document.getElementById('pin-form-heading').textContent = '✏️ Pinnwand-Eintrag bearbeiten';
    document.getElementById('pin-submit-btn').textContent = '💾 Änderungen speichern';
    document.getElementById('pin-cat-select').value = post.cat;
    document.getElementById('pin-title').value = post.title || '';
    document.getElementById('pin-desc').value = post.desc || '';
    document.getElementById('pin-file-link').value = post.fileLink || '';
    document.getElementById('pin-img-input').value = '';
    currentPinImageData = post.img || '';
    document.getElementById('pin-img-url').value = (post.img && !post.img.startsWith('data:')) ? post.img : '';
    updatePinImagePreviewUI(currentPinImageData);
    togglePinnwandForm('post');
    document.getElementById('pinnwand-post-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function togglePinnwandForm(type) {
    document.getElementById('pinnwand-post-form').classList.toggle('hidden', type !== 'post');
    document.getElementById('pinnwand-cat-form').classList.toggle('hidden', type !== 'cat');
    if (type === null) {
        editingPinId = null;
    }
}

function addPinnwandCategory() {
    const icon = document.getElementById('new-cat-icon').value.trim() || '📌';
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return;
    const id = 'cat_' + Date.now();
    pinnwandData.categories.push({ id, icon, name });
    pinnwandData.activeCat = id;
    document.getElementById('new-cat-name').value = '';
    togglePinnwandForm(null);
    savePinnwandState();
}

function savePinnwandPost() {
    const cat = document.getElementById('pin-cat-select').value;
    const title = document.getElementById('pin-title').value.trim();
    const desc = document.getElementById('pin-desc').value.trim();
    const fileLink = document.getElementById('pin-file-link').value.trim();

    if (!title) return;

    if (editingPinId !== null) {
        const idx = pinnwandData.posts.findIndex(p => p.id === editingPinId);
        if (idx !== -1) {
            pinnwandData.posts[idx] = {
                ...pinnwandData.posts[idx],
                cat,
                title,
                desc,
                img: currentPinImageData || '',
                fileLink
            };
        }
    } else {
        pinnwandData.posts.unshift({
            id: Date.now(),
            cat,
            title,
            desc,
            img: currentPinImageData || '',
            fileLink
        });
    }

    editingPinId = null;
    clearPinnwandImage();
    document.getElementById('pin-title').value = '';
    document.getElementById('pin-desc').value = '';
    document.getElementById('pin-file-link').value = '';
    togglePinnwandForm(null);
    savePinnwandState();
}

function deletePinnwandPost(id) {
    if (!confirm('Möchtest du diesen Pinnwand-Eintrag wirklich löschen?')) return;
    pinnwandData.posts = pinnwandData.posts.filter(p => p.id !== id);
    if (editingPinId === id) togglePinnwandForm(null);
    savePinnwandState();
}

function openPinLightbox(id) {
    const post = pinnwandData.posts.find(p => p.id === id);
    if (!post || !post.img) return;
    document.getElementById('pin-lightbox-img').src = post.img;
    document.getElementById('pin-lightbox-caption').textContent = post.title || '';
    document.getElementById('pin-lightbox-modal').classList.add('open');
}

function closePinLightbox() {
    document.getElementById('pin-lightbox-modal').classList.remove('open');
    document.getElementById('pin-lightbox-img').src = '';
}

function renderPinnwand() {
    const bar = document.getElementById('pinnwand-categories-bar');
    bar.innerHTML = pinnwandData.categories.map(c => `
        <button class="cat-pill ${pinnwandData.activeCat === c.id ? 'active' : ''}"
                onclick="pinnwandData.activeCat='${c.id}'; renderPinnwand();">
            ${c.icon} ${c.name}
        </button>
    `).join('');

    const select = document.getElementById('pin-cat-select');
    const currentCatVal = select.value;
    select.innerHTML = pinnwandData.categories
        .filter(c => c.id !== 'alle')
        .map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
        .join('');
    if (currentCatVal && pinnwandData.categories.some(c => c.id === currentCatVal)) {
        select.value = currentCatVal;
    }

    const filteredPosts = pinnwandData.activeCat === 'alle'
        ? pinnwandData.posts
        : pinnwandData.posts.filter(p => p.cat === pinnwandData.activeCat);

    const grid = document.getElementById('pinnwand-grid');
    grid.innerHTML = filteredPosts.map(p => {
        const catObj = pinnwandData.categories.find(c => c.id === p.cat) || { icon: '📌', name: 'Allgemein' };
        return `
            <div class="pin-card">
                <div>
                    ${p.img ? `<img src="${p.img}" class="pin-img" alt="${domEsc(p.title)}" style="cursor:zoom-in;" onclick="openPinLightbox(${p.id})" title="Klicken zum Vergrößern">` : ''}
                    <div style="padding:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                            <span class="eyebrow-dark">${catObj.icon} ${catObj.name}</span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <button onclick="editPinnwandPost(${p.id})" style="border:1px solid var(--border-sand); background:var(--bg-sand-light); border-radius:8px; padding:3px 8px; cursor:pointer; font-size:12px; font-weight:700; color:var(--text-dark);" title="Eintrag bearbeiten">✏️ Bearbeiten</button>
                                <button onclick="deletePinnwandPost(${p.id})" style="border:none; background:transparent; cursor:pointer; font-size:14px; opacity:0.5; padding:2px 4px;" title="Eintrag löschen">✕</button>
                            </div>
                        </div>
                        <h3 style="font-size:19px; font-weight:800; margin:6px 0 8px;">${domEsc(p.title)}</h3>
                        <p style="font-size:13.5px; line-height:1.6; white-space:pre-line;">${domEsc(p.desc)}</p>
                    </div>
                </div>
                ${p.fileLink ? `
                    <div style="padding:0 20px 18px;">
                        <a href="${domEsc(p.fileLink)}" target="_blank" rel="noopener" class="btn btn-dark" style="width:100%; font-size:12.5px;">
                            📎 Datei / Link öffnen ↗
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

