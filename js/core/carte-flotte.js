import { el, icone } from './dom.js';
import { VILLES } from './carte-geographie.js';
import { charger } from './carte-relief.js';

const VIDE = { type: 'FeatureCollection', features: [] };
const PAYS = [[-8.6, 4.3], [-2.5, 10.75]];
const CAMION = new URL('../../assets/camion-b2f.png', import.meta.url).href;

/** Affiche un stationnement déclaré ou, seulement en route, le trajet du transport. */
export function carteFlotte() {
  const canvas = el('div.fleet-route-canvas', { role: 'region', 'aria-label': 'Carte des trajets de la flotte en Côte d’Ivoire' });
  const status = el('p.fleet-route-status', { 'aria-live': 'polite', text: 'Chargement de la carte…' });
  const recadrer = el('button.fleet-route-recenter', {
    type: 'button', disabled: true, title: 'Recadrer sur le véhicule ou son trajet déclaré',
    on: { click: () => cadrer() },
  }, [icone('map-pin', 16), el('span', { text: 'Recadrer' })]);
  const element = el('div.fleet-route-map', {}, [canvas, el('div.fleet-route-toolbar', {}, [recadrer]), status]);
  let map, lib, observer, resize, controller, attenteCarte, attenteRoute;
  let state = {}, ready = false, started = false, dead = false, failed = false, revision = 0;
  let markers = [], geometrie = null, stationnement = null;
  const cache = new Map();
  const duree = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
  const corridor = () => {
    const depart = VILLES[state.departId], arrivee = VILLES[state.arriveeId];
    return depart && arrivee && state.departId !== state.arriveeId ? { depart, arrivee } : null;
  };

  function cadrer(immediat = false) {
    if (!ready || dead) return;
    if (stationnement) {
      map.easeTo({ center: [stationnement.lon, stationnement.lat], zoom: 9, duration: immediat ? 0 : duree() });
      return;
    }
    const bounds = geometrie ? new lib.LngLatBounds() : PAYS;
    geometrie?.coordinates.forEach(point => bounds.extend(point));
    const marge = canvas.clientWidth < 500 ? 48 : 72;
    map.fitBounds(bounds, {
      padding: { top: marge + 32, bottom: marge + 22, left: marge, right: marge },
      maxZoom: geometrie ? 9 : 6.4,
      duration: immediat ? 0 : duree(),
    });
  }

  function nettoyerTrajet() {
    controller?.abort(); controller = null;
    clearTimeout(attenteRoute);
    markers.forEach(marker => marker.remove()); markers = [];
    geometrie = null; stationnement = null;
    map?.getSource('fleet-route')?.setData(VIDE);
  }

  function tracer(geometry, routier) {
    geometrie = geometry;
    map.getSource('fleet-route').setData({ type: 'Feature', properties: {}, geometry });
    map.setPaintProperty('fleet-route-line', 'line-dasharray', routier ? [1, 0] : [2, 2]);
    cadrer();
  }

  function repereCamion(sousTitre, description) {
    return el('div.fleet-map-origin', {
      dataset: { statut: state.statut || '' },
      title: description,
    }, [
      el('img.fleet-map-truck', { src: CAMION, alt: '', draggable: 'false' }),
      el('span.fleet-map-label', {}, [
        el('strong', { text: state.immatriculation || state.libelle || 'Véhicule sélectionné' }),
        el('small', { text: sousTitre }),
      ]),
    ]);
  }

  function ajouterReperes(depart, arrivee) {
    const origin = repereCamion(`Départ · ${depart.nom}`, `Départ déclaré : ${depart.nom}. Aucune position GPS en direct.`);
    const destination = el('div.fleet-map-destination', { title: `Arrivée prévue : ${arrivee.nom}` }, [
      icone('map-pin', 22),
      el('span.fleet-map-label', {}, [el('small', { text: 'Arrivée' }), el('strong', { text: arrivee.nom })]),
    ]);
    markers.push(new lib.Marker({ element: origin, anchor: 'bottom' }).setLngLat([depart.lon, depart.lat]).addTo(map));
    markers.push(new lib.Marker({ element: destination, anchor: 'bottom' }).setLngLat([arrivee.lon, arrivee.lat]).addTo(map));
  }

  async function actualiser() {
    if (!ready || dead) return;
    const current = ++revision;
    nettoyerTrajet();
    if (state.enRoute !== true) {
      stationnement = VILLES[state.stationnementId] || null;
      if (stationnement) {
        const texte = `Stationnement déclaré · ${stationnement.nom}`;
        const node = repereCamion(texte, `${texte}. Localisation déclarative, sans suivi GPS.`);
        markers.push(new lib.Marker({ element: node, anchor: 'center' }).setLngLat([stationnement.lon, stationnement.lat]).addTo(map));
        canvas.setAttribute('aria-label', `${texte}, sans suivi GPS`);
        status.textContent = texte;
      } else {
        canvas.setAttribute('aria-label', 'Carte de Côte d’Ivoire, stationnement du véhicule à renseigner');
        status.textContent = 'Stationnement à renseigner';
      }
      cadrer(true);
      return;
    }
    const villes = corridor();
    if (!villes) {
      canvas.setAttribute('aria-label', 'Carte de Côte d’Ivoire, trajet en cours à renseigner');
      status.textContent = 'Trajet en cours à renseigner';
      cadrer(true);
      return;
    }
    const { depart, arrivee } = villes;
    canvas.setAttribute('aria-label', `Trajet déclaré de ${depart.nom} à ${arrivee.nom}, sans suivi GPS`);
    ajouterReperes(depart, arrivee);
    tracer({ type: 'LineString', coordinates: [[depart.lon, depart.lat], [arrivee.lon, arrivee.lat]] }, false);
    status.textContent = `${depart.nom} → ${arrivee.nom} · calcul de l’itinéraire…`;
    const key = `${depart.lon},${depart.lat};${arrivee.lon},${arrivee.lat}`;
    const requete = new AbortController(); controller = requete;
    attenteRoute = setTimeout(() => requete.abort(), 12000);
    try {
      let route = cache.get(key);
      if (!route) {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`, { signal: requete.signal });
        if (!response.ok) throw new Error('Itinéraire indisponible');
        const data = await response.json(); route = data.routes?.[0];
        if (data.code !== 'Ok' || route?.geometry?.type !== 'LineString' || route.geometry.coordinates.length < 2 || !Number.isFinite(route.distance)) throw new Error('Itinéraire indisponible');
        if (cache.size >= 20) cache.delete(cache.keys().next().value);
        cache.set(key, route);
      }
      if (dead || current !== revision || !ready) return;
      tracer(route.geometry, true);
      status.textContent = `${depart.nom} → ${arrivee.nom} · ${Math.round(route.distance / 1000).toLocaleString('fr-FR')} km · itinéraire indicatif, hors contraintes poids lourds`;
    } catch {
      if (!dead && current === revision && ready) status.textContent = `${depart.nom} → ${arrivee.nom} · liaison indicative en pointillés, calcul routier indisponible`;
    } finally {
      if (current === revision) { clearTimeout(attenteRoute); controller = null; }
    }
  }

  function echouer() {
    if (dead || failed) return;
    failed = true; ready = false; ++revision;
    clearTimeout(attenteCarte); nettoyerTrajet();
    map?.remove(); map = null;
    element.classList.add('is-unavailable');
    recadrer.disabled = true;
    status.textContent = 'Carte indisponible. Le trajet déclaré reste consultable dans les informations du véhicule.';
  }

  async function demarrer() {
    if (started || dead) return;
    started = true;
    attenteCarte = setTimeout(echouer, 25000);
    try {
      lib = await charger();
      if (dead || failed) return;
      map = new lib.Map({
        container: canvas, center: [-5.5, 7.4], zoom: 6, minZoom: 4, maxZoom: 17,
        cooperativeGestures: true,
        style: {
          version: 8,
          sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
          layers: [
            { id: 'fleet-background', type: 'background', paint: { 'background-color': '#f5f7fa' } },
            { id: 'fleet-base', type: 'raster', source: 'osm', paint: { 'raster-saturation': -.9, 'raster-contrast': -.12, 'raster-opacity': .68 } },
          ],
        },
      });
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new lib.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('load', () => {
        if (dead || failed || !map) return;
        clearTimeout(attenteCarte);
        map.addSource('fleet-route', { type: 'geojson', data: VIDE });
        map.addLayer({ id: 'fleet-route-halo', type: 'line', source: 'fleet-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': .92 } });
        map.addLayer({ id: 'fleet-route-line', type: 'line', source: 'fleet-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3265af', 'line-width': 4.5 } });
        ready = true; recadrer.disabled = false; map.resize(); actualiser();
      });
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(() => { if (!dead) map?.resize(); }); resize.observe(canvas);
      }
    } catch { echouer(); }
  }

  function destroy() {
    if (dead) return;
    dead = true; ++revision;
    clearTimeout(attenteCarte); nettoyerTrajet();
    observer?.disconnect(); resize?.disconnect(); map?.remove(); map = null;
    window.removeEventListener('hashchange', destroy);
  }

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); demarrer(); }
    }, { rootMargin: '200px' });
    observer.observe(element);
  } else if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(demarrer);
  if (typeof window !== 'undefined') window.addEventListener('hashchange', destroy, { once: true });

  return {
    element, destroy,
    update(next = {}) {
      if (dead) return;
      state = { ...next };
      if (ready) actualiser();
    },
  };
}
