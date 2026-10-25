# ⚡ π | Peters Page (`pi.dippe-sippe.de`)

Persönliches Web-Portal, Familien-Pinnwand, Karten-/Mathematik-Labor, Retro-Spiele-Ecke und persönliches Sport-Cockpit.

---

## 1. System-Architektur & Dual-Backend-Konzept

Die Plattform arbeitet als modulare Single-Page-Application (SPA) über GitHub Pages und nutzt zwei sauber getrennte Google-Apps-Script-Backends:

1. **Privates Backend (`Pi-Homepage-Backend` im Google-Drive-Ordner `pi (Subdomain)`):**
   - Konfiguriert in `js/config.js` unter **`pinnwandCloudUrl`**.
   - Zuständig für alle privaten Module und Passwörter:
     - `dippe_pinnwand_db.json`: Kategorien, Beiträge und Kommentare auf π's Pinnwand.
     - `dippe_highscores_db.json`: Top-10-Bestenlisten für Tetris, Minesweeper und Snake.
     - `dippe_kicker_db.json`: Aktive Turniere und Archiv des Kickerabends.
     - Endpunkt `?kind=auth`: Serverseitige Prüfung von `FOTO_PASSWORD` (Foto-Tresor) und `ADMIN_PASSWORD` (Kicker-Admin), sodass keine Klartext-Passwörter im öffentlichen GitHub-Code liegen.

2. **Vereins-Backend (`TSV-Graupa-TT-Backend` im Vereins-Ordner):**
   - Konfiguriert in `js/config.js` unter **`ttCloudUrl`**.
   - Wird auf der privaten Seite ausschließlich **lesend** vom Modul `js/tischtennis.js` genutzt, um unter `#tischtennis` Peter Dippes persönliche LivePZ-Entwicklung (`MID=27885`, `L2P=30994`), die 9 Analyse-Donuts sowie die aktuelle Liga-Tabelle seiner Mannschaft (`TSV Graupa 3`) anzuzeigen.
   - Die aktuell aktive Saison wird automatisch aus der zentralen Metadaten-Datei (`dippe_tt_meta_db.json`) des Vereins-Backends bezogen – es ist keine manuelle Anpassung am privaten Code bei einem Saisonwechsel nötig.

3. **Automatische Weiterleitung ausgelagerter Vereins-Tools (`MOVED_TT_PAGES` in `js/core.js`):**
   - Ruft jemand alte Lesezeichen wie `pi.dippe-sippe.de/#tt-ranking`, `#turnierplaner`, `#zaehlboard`, `#tt-news` oder `#spielbetrieb` auf, leitet `js/core.js` den Browser automatisch auf die neue Vereinsdomain `https://www.tsvgraupa-tischtennis.de` weiter.

---

## 2. Verzeichnis- & Modulstruktur

```text
├── index.html               # Hauptrahmen, Sidebar mit Ausklapp-Gruppen, Highscore- & Passwort-Modal
├── 404.html                 # SPA-Redirect für direkte Pfad-Aufrufe
├── css/
│   └── style.css            # Stylesheet inkl. NES-Tetris-Gehäuse, GameBoy-Pad & Karten-Layouts
├── js/
│   ├── config.js            # Enthält pinnwandCloudUrl (privat) und ttCloudUrl (TT-Statistik)
│   ├── core.js              # View-Loader, Gruppen-Navigation, Karten-Basislayer, Weiterleitungen
│   ├── home.js              # Startseiten-Karte (Basecamp Graupa)
│   ├── pinnwand.js          # Cloud-Pinnwand mit Kategorien & Suchfilter
│   ├── fotos.js             # Passwortgeschützte Foto-Alben
│   ├── tischtennis.js       # Pi's persönliches TT-Cockpit (100-Spiele-Kurve, 9 Donuts, Meine Liga)
│   ├── radfahren.js         # Gravel-/Rennrad-Telemetrie & Leistungsrechner
│   ├── wandern.js           # Wander-Touren & Gehzeit-Rechner (DIN 33466)
│   ├── kicker.js            # Kickerabend-Turniermanager (Fair-Block-Generator & Live-Tabelle)
│   ├── area-maps.js         # Maps Math (Sphärische Polygon-Flächenberechnung auf Karten)
│   ├── dominanz.js          # Berg-Dominanz-Atlas & Schartenhöhe (nutzt peaks.json)
│   ├── luftlinie.js         # Großkreis-Entfernungsrechner (Orthodrome auf dem Ellipsoid)
│   ├── area-pur.js          # Pure Math (Geometrie-Zeichenbrett & Gaußsche Trapezformel)
│   ├── highscores.js        # Gemeinsame Cloud-Highscore-Verwaltung für die Spiele-Ecke
│   ├── tetris.js            # NES A-Type Tetris mit GameBoy-Steuerkreuz & Stein-Statistik
│   ├── minesweeper.js       # Minesweeper (10 Feldgrößen bis 36×22 XXL & 5%-Bomben-Regler)
│   ├── snake.js             # Snake mit Live-Tempo-Vorschau, Vektor-Apfel & 2-Daumen-Split-Pad
│   └── impressum.js         # Impressums-Logik
└── views/
    └── [14 HTML-Snippets]   # Jeweils eine HTML-Datei pro Modul in ALL_VIEWS
