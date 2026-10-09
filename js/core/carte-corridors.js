import { el, icone } from './dom.js';
import { VILLES } from './carte-geographie.js';
import { charger } from './carte-relief.js';

/** Les seuls lieux transmis au service routier sont les centres des villes. */
export function corridorsDe(declarations) {
  const uniques = new Map();
  for (const d of declarations) {
    const a = VILLES[d.provenanceId], b = VILLES[d.destinationId];
    if (!a || !b || d.provenanceId === d.destinationId) continue;
    const id = `${d.provenanceId}:${d.destinationId}`;
    if (!uniques.has(id)) uniques.set(id, { id, a, b, nombre: 0 });
    uniques.get(id).nombre++;
  }
  return [...uniques.values()];
}

export function carteCorridors(declarations) {
  const corridors = corridorsDe(declarations);
  const canvas = el('div.dash-road-canvas', { 'aria-label': 'Carte routière interactive des corridors de fret' });
  const status = el('p.dash-road-status', { 'aria-live': 'polite', text: 'Chargement du fond routier…' });
  const distance = el('span.dash-road-distance', { text: 'CÔTE D’IVOIRE' });
  const recadrer = el('button.dash-road-reset', { type: 'button', title: 'Recentrer la carte', 'aria-label': 'Recentrer la carte', on: { click: () => cadrer() } }, [icone('map-pin', 16)]);
  const buttons = corridors.map((c, i) => el('button.dash-corridor-choice', { type: 'button', 'aria-pressed': String(i === 0), on: { click: () => selectionner(i) } }, [
    el('span.dash-corridor-symbol', { 'aria-hidden': 'true', text: '↗' }),
    el('span', {}, [el('strong', { text: `${c.a.nom} → ${c.b.nom}` }), el('small', { text: `${c.nombre} déclaration${c.nombre > 1 ? 's' : ''}` })]),
    icone('chevron-right', 16),
  ]));
  const root = el('section.dash-panel.dash-geography', {}, [
    el('div.dash-panel-head', {}, [el('div', {}, [el('span.dash-eyebrow', { text: 'VOTRE ACTIVITÉ EN CÔTE D’IVOIRE' }), el('h2', { text: 'Vos corridors de fret' })]), icone('map-pin', 19)]),
    el('div.dash-road-map', {}, [canvas, el('div.dash-road-toolbar', {}, [distance, recadrer])]),
    status,
    el('div.dash-corridor-list', { 'aria-label': 'Choisir un corridor' }, buttons),
    el('p.dash-map-note', { text: corridors.length ? 'Itinéraires routiers indicatifs, hors contraintes poids lourds · sans suivi GPS.' : 'Déclarez un fret entre les villes couvertes pour afficher votre corridor.' }),
  ]);
  if (typeof IntersectionObserver === 'undefined') return root;
  let map, lib, ready = false, dead = false, started = false, failed = false, active = 0, markers = [], controller, timer, resize;
  const cache = new Map();
  let coordinates = [];
  function cadrer() {
    if (!ready) return;
    if (!coordinates.length) { map.fitBounds([[-8.65,4.35],[-2.45,10.75]], { padding: 30, duration: 0 }); return; }
    const bounds = new lib.LngLatBounds();
    coordinates.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { padding: { top: 110, bottom: 55, left: 65, right: 65 }, maxZoom: 9, duration: 0 });
  }
  function tracer(c, geometry, routier) {
    coordinates = geometry.coordinates;
    map.getSource('corridor').setData({ type: 'Feature', properties: {}, geometry });
    map.setPaintProperty('corridor-line', 'line-dasharray', routier ? [1, 0] : [2, 2]);
    markers.forEach(m => m.remove());
    markers = [c.a, c.b].map((v, i) => {
      const pin = el('div.dash-road-pin', { class: i ? 'arrival' : 'departure' }, [el('b', { text: i ? 'B' : 'A' }), el('span', { text: v.nom })]);
      return new lib.Marker({ element: pin, anchor: 'bottom', offset: [0, 15] }).setLngLat([v.lon, v.lat]).addTo(map);
    });
    cadrer();
  }
  async function selectionner(index) {
    active = index;
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    if (!ready || dead) return;
    controller?.abort();
    const c = corridors[index];
    if (!c) { status.textContent = 'Fond routier · explorez la Côte d’Ivoire'; cadrer(); return; }
    distance.textContent = `${c.a.nom} → ${c.b.nom}`;
    tracer(c, { type: 'LineString', coordinates: [[c.a.lon, c.a.lat], [c.b.lon, c.b.lat]] }, false);
    status.textContent = 'Calcul de l’itinéraire routier…';
    const request = new AbortController(); controller = request;
    const timeout = setTimeout(() => request.abort(), 12000);
    try {
      let route = cache.get(c.id);
      if (!route) {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${c.a.lon},${c.a.lat};${c.b.lon},${c.b.lat}?overview=full&geometries=geojson&steps=false`, { signal: request.signal });
        if (!response.ok) throw new Error('Itinéraire indisponible');
        const data = await response.json(); route = data.routes?.[0];
        if (data.code !== 'Ok' || route?.geometry?.type !== 'LineString' || !route.geometry.coordinates?.length) throw new Error('Tracé absent');
        cache.set(c.id, route);
      }
      if (dead || controller !== request) return;
      tracer(c, route.geometry, true);
      distance.textContent = `${Math.round(route.distance / 1000)} km · par la route`;
      status.textContent = 'A Départ · B Arrivée — tracé routier calculé avec OSRM';
    } catch {
      if (!dead && controller === request) status.textContent = 'Calcul routier indisponible · liaison directe en pointillés.';
    } finally { clearTimeout(timeout); }
  }
  function fail() {
    if (dead) return;
    clearTimeout(timer); failed = true; ready = false; controller?.abort(); map?.remove(); map = null;
    status.textContent = 'Fond de carte indisponible. Rechargez la page pour réessayer.';
    canvas.replaceChildren(el('div.dash-road-unavailable', {}, [icone('map-pin', 28), el('span', { text: 'La carte nécessite une connexion et WebGL.' })]));
  }
  async function start() {
    if (started || dead) return; started = true;
    timer = setTimeout(fail, 25000);
    try {
      lib = await charger(); if (dead || failed) return;
      map = new lib.Map({ container: canvas, center: [-5.55, 7.4], zoom: 6, minZoom: 4, maxZoom: 16, cooperativeGestures: true,
        style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } }, layers: [{ id: 'roads', type: 'raster', source: 'osm', paint: { 'raster-saturation': -.5 } }] }
      });
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new lib.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-left');
      map.on('load', () => {
        if (dead || !map) return;
        clearTimeout(timer); ready = true;
        map.addSource('corridor', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'corridor-halo', type: 'line', source: 'corridor', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': .95 } });
        map.addLayer({ id: 'corridor-line', type: 'line', source: 'corridor', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#3265af', 'line-width': 4 } });
        selectionner(active);
      });
      resize = new ResizeObserver(() => map?.resize()); resize.observe(canvas);
    } catch { fail(); }
  }
  const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); start(); } }, { rootMargin: '200px' });
  observer.observe(root);
  function dispose() {
    dead = true; clearTimeout(timer); observer.disconnect(); resize?.disconnect(); controller?.abort(); markers.forEach(m => m.remove()); map?.remove();
    window.removeEventListener('hashchange', dispose);
  }
  window.addEventListener('hashchange', dispose, { once: true });
  return root;
}
