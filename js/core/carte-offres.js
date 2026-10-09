import { el, icone } from './dom.js';
import { VILLES } from './carte-geographie.js';
import { charger } from './carte-relief.js';

export function carteOffres(surVille, { compact = false, onSelection } = {}) {
  const canvas = el('div.freight-market-map-canvas', { 'aria-label': 'Carte des annonces disponibles' });
  const status = el('p.freight-market-map-status', { 'aria-live': 'polite', text: 'Chargement de la carte…' });
  const root = el('div.freight-market-map', {}, [canvas, status]);
  let map, lib, ready = false, dead = false, started = false, markers = [], offres = [], selection, controller, revision = 0, timer, resize, observer, popup;
  const cache = new Map();
  const empty = { type: 'FeatureCollection', features: [] };
  const typeOffre = o => o.type === 'frets' ? 'frets' : 'camions';
  const libelleType = (type, count) => type === 'frets'
    ? `${count} fret${count > 1 ? 's' : ''}` : `${count} camion${count > 1 ? 's' : ''}`;
  function overview() { map?.fitBounds([[-8.6,4.3],[-2.5,10.75]], { padding: 45, duration: 0 }); }
  function choisir(offre) {
    popup?.remove(); popup = null;
    if (typeof onSelection === 'function') onSelection(offre.id);
    else surVille?.(offre.localiteDepartId);
  }
  function ouvrirOffres(ville, list, type) {
    if (typeof onSelection !== 'function') { surVille?.(list[0].localiteDepartId); return; }
    if (list.length === 1) { choisir(list[0]); return; }
    popup?.remove();
    const content = el('div.market-map-offers', {}, [
      el('strong', { text: `${libelleType(type, list.length)} au départ de ${ville.nom}` }),
      el('p', { text: 'Choisissez un trajet pour le voir sur la carte.' }),
      el('div.market-map-offer-list', {}, list.map(o => {
        const destination = VILLES[o.localiteArriveeId]?.nom || o.arrivee || 'Destination à préciser';
        return el('button.market-map-offer', {
          type: 'button', dataset: { type }, 'aria-pressed': String(selection?.id === o.id),
          on: { click: () => choisir(o) },
        }, [
          icone(type === 'frets' ? 'package' : 'truck', 18),
          el('span', {}, [el('strong', { text: `${ville.nom} → ${destination}` }),
            el('small', { text: o.titre || o.reference || (type === 'frets' ? 'Fret disponible' : 'Camion disponible') })]),
          icone('arrow-right', 16),
        ]);
      })),
    ]);
    popup = new lib.Popup({ className: 'market-offers-popup', maxWidth: '340px', offset: 32 })
      .setLngLat([ville.lon, ville.lat]).setDOMContent(content).addTo(map);
  }
  async function paint() {
    if (!ready || dead) return;
    const current = ++revision; controller?.abort(); popup?.remove(); popup = null;
    markers.forEach(m => m.remove()); markers = [];
    map.getSource('route').setData(empty);
    const groups = new Map();
    for (const o of offres) {
      if (!VILLES[o.localiteDepartId]) continue;
      if (!groups.has(o.localiteDepartId)) groups.set(o.localiteDepartId, []);
      groups.get(o.localiteDepartId).push(o);
    }
    for (const [id, list] of groups) {
      const v = VILLES[id];
      const types = ['camions', 'frets'].map(type => {
        const items = list.filter(o => typeOffre(o) === type);
        if (!items.length) return null;
        const active = items.some(o => o.id === selection?.id);
        return el('button.market-pin.market-type-pin', {
          type: 'button', class: active ? 'selected' : '', dataset: { type },
          'aria-label': `${libelleType(type, items.length)} au départ de ${v.nom}. Voir les trajets.`,
          'aria-pressed': String(active), on: { click: e => { e.stopPropagation(); ouvrirOffres(v, items, type); } },
        }, [icone(type === 'frets' ? 'package' : 'truck', 18), el('b', { text: items.length })]);
      });
      const node = el('div.market-city-pin', {}, [
        el('button.market-city-label', { type: 'button', text: v.nom,
          'aria-label': `Filtrer les annonces au départ de ${v.nom}`,
          on: { click: e => { e.stopPropagation(); surVille?.(id); } } }),
        el('div.market-city-offers', {}, types),
      ]);
      markers.push(new lib.Marker({ element: node, anchor: 'bottom' }).setLngLat([v.lon,v.lat]).addTo(map));
    }
    const a = VILLES[selection?.localiteDepartId], b = VILLES[selection?.localiteArriveeId];
    const camions = offres.filter(o => typeOffre(o) === 'camions').length;
    const frets = offres.length - camions;
    status.textContent = `${libelleType('camions', camions)} · ${libelleType('frets', frets)} · départs déclarés, sans suivi GPS`;
    if (!a || !b) {
      if (selection) status.textContent = 'Trajet hors du périmètre cartographique · détails disponibles dans la liste.';
      overview(); return;
    }
    map.setPaintProperty('route-line', 'line-color', typeOffre(selection) === 'frets' ? '#ce741d' : '#3265af');
    const show = (geometry, routed) => {
      map.getSource('route').setData({ type: 'Feature', properties: {}, geometry });
      map.setPaintProperty('route-line', 'line-dasharray', routed ? [1,0] : [2,2]);
      const bounds = new lib.LngLatBounds(); geometry.coordinates.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, { padding: compact ? 48 : 90, maxZoom: 9, duration: 0 });
    };
    const pin = el('div.market-arrival', {}, [icone('map-pin', 15), el('span', { text: `Arrivée · ${b.nom}` })]);
    markers.push(new lib.Marker({ element: pin }).setLngLat([b.lon,b.lat]).addTo(map));
    show({ type: 'LineString', coordinates: [[a.lon,a.lat],[b.lon,b.lat]] }, false);
    status.textContent = 'Calcul de l’itinéraire routier…';
    const key = `${a.lon},${a.lat};${b.lon},${b.lat}`;
    controller = new AbortController(); const signal = controller.signal;
    const timeout = setTimeout(() => { if (current === revision) controller?.abort(); }, 12000);
    try {
      let route = cache.get(key);
      if (!route) {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`, { signal });
        if (!response.ok) throw new Error('Route indisponible');
        const data = await response.json(); route = data.routes?.[0];
        if (data.code !== 'Ok' || route?.geometry?.type !== 'LineString') throw new Error('Route indisponible');
        cache.set(key, route);
      }
      if (dead || revision !== current) return;
      show(route.geometry, true);
      status.textContent = `${a.nom} → ${b.nom} · ${Math.round(route.distance/1000)} km · itinéraire indicatif, hors contraintes poids lourds`;
    } catch { if (!dead && revision === current) status.textContent = 'Liaison indicative en pointillés · calcul routier indisponible'; }
    finally { clearTimeout(timeout); }
  }
  function fail() {
    if (dead) return;
    clearTimeout(timer); ready = false; controller?.abort(); popup?.remove();
    markers.forEach(m => m.remove()); markers = []; map?.remove(); map = null;
    status.textContent = 'Carte indisponible · les offres restent consultables dans la liste.';
  }
  async function start() {
    if (started || dead) return; started = true;
    try {
      lib = await charger(); if (dead) return;
      map = new lib.Map({ container: canvas, center: [-5.5,7.4], zoom: 6, minZoom: 4, maxZoom: 16, cooperativeGestures: true,
        style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } }, layers: [{ id: 'base', type: 'raster', source: 'osm', paint: { 'raster-saturation': -.45 } }] }
      });
      timer = setTimeout(fail, 25000);
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new lib.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('load', () => {
        if (dead || !map) return; clearTimeout(timer); ready = true;
        map.addSource('route', { type: 'geojson', data: empty });
        map.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': '#fff', 'line-width': 9 } });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#3265af', 'line-width': 5 } }); paint();
      });
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(() => map?.resize()); resize.observe(canvas);
      }
    } catch { fail(); }
  }
  function destroy() {
    if (dead) return;
    dead = true; ++revision; clearTimeout(timer); controller?.abort(); popup?.remove();
    observer?.disconnect(); resize?.disconnect(); markers.forEach(m=>m.remove()); map?.remove();
    window.removeEventListener('hashchange', destroy);
  }
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); start(); } }); observer.observe(root);
  } else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(start);
  if (typeof window !== 'undefined') window.addEventListener('hashchange', destroy, { once: true });
  return { element: root, destroy, update(next, chosen) { offres = next || []; selection = chosen; paint(); } };
}
