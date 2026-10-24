// ===================================================================
// HOME: STARTSEITEN-KARTE BASECAMP GRAUPA / PIRNA (js/home.js)
// ===================================================================

let homeMap = null;
let homeMarker = null;
let homeLayers = {};
let homeLayerKey = 'osm';

function updateHomeRouteLink() {
    const loc = HOME_LOCATIONS[0];
    const link = document.getElementById('home-route-link');
    if (loc && link) link.href = externalMapUrl(homeLayerKey, loc.lat, loc.lon, 17);
}

function initHomeMap() {
    if (homeMap || typeof L === 'undefined' || !document.getElementById('osm-map')) return;
    const loc = HOME_LOCATIONS[0];
    homeMap = L.map('osm-map').setView([loc.lat, loc.lon], 17);
    homeLayers = buildLayerSet();
    homeLayers['osm'].addTo(homeMap);
    homeMarker = L.marker([loc.lat, loc.lon]).addTo(homeMap);
    homeMarker.bindPopup(`<b>${loc.fam}</b><br>${loc.addr}<br>${loc.plz}`).openPopup();

    fillLayerSelect('home-layer-select', 'osm');
    const t = document.getElementById('home-loc-title');
    if (t) t.textContent = '📍 ' + loc.addr + ', ' + loc.plz;
    updateHomeRouteLink();
}

function setHomeLayer(key) {
    if (!homeMap || !homeLayers[key]) return;
    Object.values(homeLayers).forEach(l => homeMap.removeLayer(l));
    homeLayers[key].addTo(homeMap);
    homeLayerKey = key;
    updateHomeRouteLink();
}