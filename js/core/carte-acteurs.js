/**
 * Lot b5 : carte des acteurs inscrits, pour la DGTTC.
 *
 * Même fond que la carte du marché (`carte-marche.js`) : contour local de la
 * Côte d'Ivoire, sans tuiles ni géolocalisation. Un point est le centre d'une
 * ville ; son nombre est celui des entreprises et intermédiaires qui y ont
 * déclaré leur localité. Aucune entreprise n'est placée individuellement.
 *
 * @module core/carte-acteurs
 */

import { el } from './dom.js';
import { CONTOUR_CI, VILLES, position } from './carte-geographie.js';

function svg(nom, attrs = {}, enfants = []) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', nom);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...enfants);
  return n;
}

function texte(x, y, valeur, classe) {
  const n = svg('text', { x, y, class: classe });
  n.textContent = String(valeur);
  return n;
}

/**
 * @param {Array<{localiteId: string|null, transporteurs: number, affreteurs: number, intermediaires: number}>} lignes
 *   Répartition par localité, telle que `dgttc.service.repartitions` la rend.
 * @returns {{element: HTMLElement, horsCarte: number}}
 */
export function carteActeurs(lignes) {
  const total = (l) => l.transporteurs + l.affreteurs + l.intermediaires;
  const parVille = new Map(lignes.filter((l) => l.localiteId && VILLES[l.localiteId]).map((l) => [l.localiteId, l]));
  const horsCarte = lignes.filter((l) => !parVille.has(l.localiteId)).reduce((n, l) => n + total(l), 0);
  const maximum = Math.max(1, ...[...parVille.values()].map(total));

  const dessin = svg('svg', {
    viewBox: '0 0 530 500', class: 'market-map', role: 'img',
    'aria-label': 'Carte des acteurs inscrits en Côte d’Ivoire, par ville déclarée.',
  });
  dessin.append(svg('path', { d: CONTOUR_CI, class: 'map-country' }));
  dessin.append(texte(45, 140, 'GUINÉE', 'map-neighbour'), texte(182, 36, 'MALI', 'map-neighbour'),
    texte(380, 60, 'BURKINA FASO', 'map-neighbour'), texte(450, 265, 'GHANA', 'map-neighbour'),
    texte(32, 338, 'LIBÉRIA', 'map-neighbour'), texte(220, 478, 'GOLFE DE GUINÉE', 'map-ocean'));

  for (const [id, ville] of Object.entries(VILLES)) {
    const [x, y] = position(ville);
    const l = parVille.get(id);
    const nombre = l ? total(l) : 0;
    const detail = l
      ? `${l.transporteurs} transporteur(s), ${l.affreteurs} affréteur(s), ${l.intermediaires} intermédiaire(s)`
      : 'aucun acteur inscrit';
    const g = svg('g', { class: `map-city${nombre ? ' populated' : ''}` });
    const titre = svg('title');
    titre.textContent = `${ville.nom} : ${detail}`;
    // Le halo grandit avec le nombre d'acteurs, dans une plage lisible.
    const halo = nombre ? 12 + Math.round((nombre / maximum) * 16) : 10;
    g.append(titre, svg('circle', { cx: x, cy: y, r: halo, class: 'map-halo' }), svg('circle', { cx: x, cy: y, r: 6, class: 'map-dot' }));
    const gauche = id === 'loc-daloa' || id === 'loc-man';
    const label = texte(x + (gauche ? -15 : 15), y + 5, ville.nom, 'map-label');
    label.setAttribute('text-anchor', gauche ? 'end' : 'start');
    g.append(label);
    if (nombre) g.append(svg('circle', { cx: x, cy: y - 24, r: 10, class: 'map-count-bg' }), texte(x, y - 20, nombre, 'map-count'));
    dessin.append(g);
  }

  return {
    element: el('div.map-canvas.lot-b5-carte', {}, [dessin, el('span.map-north', { text: 'N ↑', 'aria-hidden': 'true' })]),
    horsCarte,
  };
}
