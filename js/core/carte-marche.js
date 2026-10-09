/** Carte locale, sans tuiles ni géolocalisation. Les traits sont des liaisons,
 * pas des itinéraires routiers. Les points représentent des centres de villes.
 */
import { el, icone } from './dom.js';
import { CONTOUR_CI, VILLES, position } from './carte-geographie.js';

function svg(nom, attrs = {}, enfants = []) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', nom);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...enfants);
  return n;
}
function texte(x, y, valeur, classe) {
  const n = svg('text', { x, y, class: classe }); n.textContent = valeur; return n;
}

export function carteMarche({ offres, selection, depart, surVille }) {
  const dessin = svg('svg', { viewBox: '0 0 530 500', class: 'market-map', role: 'group',
    'aria-label': 'Carte des disponibilités en Côte d’Ivoire. Sélectionnez une ville de départ.' });
  dessin.append(svg('path', { d: CONTOUR_CI, class: 'map-country' }));
  dessin.append(texte(45, 140, 'GUINÉE', 'map-neighbour'), texte(182, 36, 'MALI', 'map-neighbour'),
    texte(380, 60, 'BURKINA FASO', 'map-neighbour'), texte(450, 265, 'GHANA', 'map-neighbour'),
    texte(32, 338, 'LIBÉRIA', 'map-neighbour'), texte(220, 478, 'GOLFE DE GUINÉE', 'map-ocean'));
  const source = selection && VILLES[selection.departId];
  const cible = selection && VILLES[selection.arriveeId];
  if (source && cible) {
    const [x, y] = position(source); const [a, b] = position(cible);
    const d = `M${x},${y} Q${(x+a)/2+30},${(y+b)/2} ${a},${b}`;
    dessin.append(svg('path', { d, class: 'map-route-halo' }), svg('path', { d, class: 'map-route' }));
  }
  for (const [id, ville] of Object.entries(VILLES)) {
    const [x, y] = position(ville);
    const nombre = offres.filter(o => o.departId === id).length;
    const actif = id === depart || id === selection?.departId || id === selection?.arriveeId;
    const g = svg('g', { class: `map-city${actif ? ' selected' : ''}${nombre ? ' populated' : ''}`,
      'data-focus': `ville-${id}`,
      tabindex: '0', role: 'button', 'aria-label': `${ville.nom} : ${nombre} annonce${nombre > 1 ? 's' : ''} au départ`,
      'aria-pressed': String(id === depart) });
    g.append(svg('circle', { cx:x, cy:y, r:21, class:'map-hit' }),
      svg('circle', { cx:x, cy:y, r:12, class:'map-halo' }),
      svg('circle', { cx:x, cy:y, r:6, class:'map-dot' }));
    // Daloa et Yamoussoukro ont des libellés décalés pour rester lisibles.
    const gauche = id === 'loc-daloa' || id === 'loc-man';
    const label = texte(x + (gauche ? -15 : 15), y + 5, ville.nom, 'map-label');
    label.setAttribute('text-anchor', gauche ? 'end' : 'start');
    g.append(label);
    if (nombre) {
      g.append(svg('circle', { cx:x, cy:y-24, r:10, class:'map-count-bg' }),
        texte(x, y-20, nombre, 'map-count'));
    }
    const choisir = () => surVille(id === depart ? '' : id);
    g.addEventListener('click', choisir);
    g.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); choisir(); } });
    dessin.append(g);
  }
  let niveau = 0;
  const ajuster = delta => {
    niveau = Math.max(0, Math.min(2, niveau + delta));
    const facteur = 1 + niveau * .35;
    dessin.setAttribute('viewBox', `${265-265/facteur} ${250-250/facteur} ${530/facteur} ${500/facteur}`);
    moins.disabled = niveau === 0; plus.disabled = niveau === 2;
  };
  const moins = el('button', { type:'button', 'aria-label':'Réduire la carte', disabled:true,
    on:{click:()=>ajuster(-1)}, text:'−' });
  const plus = el('button', { type:'button', 'aria-label':'Agrandir la carte', on:{click:()=>ajuster(1)}, text:'+' });
  return el('section.map-panel', { 'aria-label':'Carte des annonces' }, [
    el('div.map-heading', {}, [el('div', {}, [el('span.eyebrow', {text:'LE MARCHÉ SUR LA CARTE'}),
      el('h2', {text:'Chaque ville, une opportunité.'})]),
      el('span.map-country-chip', {}, [icone('map-pin',14), 'Côte d’Ivoire'])]),
    el('div.map-canvas', {}, [dessin,
      el('div.map-controls', {}, [plus, moins]),
      el('span.map-north', {text:'N ↑', 'aria-hidden':'true'})]),
    el('div.map-legend', {}, [el('span.legend-dot'), el('span',{text:'Départs disponibles'}),
      el('span.legend-line'), el('span',{text:'Trajet sélectionné'})]),
    el('p.map-disclaimer', {text: selection && (!source || !cible)
      ? 'Ce corridor dépasse la carte. Les détails restent accessibles dans la liste.'
      : 'Localisation à la ville · liaison indicative, sans suivi GPS.'}),
  ]);
}
