/** Poste de gestion du parc : sélection, dossier et trajet déclaré. */
import { el, icone, date, dateHeure } from '../core/dom.js';
import { bouton, etatVide } from '../core/ui.js';
import { aller } from '../core/router.js';
import { carteFlotte } from '../core/carte-flotte.js';
import { decider } from '../domain/access.js';
import { localiser } from '../core/nav.js';
import { refDe } from './_donnees.js';
import { donneesFlotte } from './flotte-donnees.js';
import { ouvrirVehicule } from './flotte-formulaires.js?v=20261009-carte-2';

const camion = (classe = '') => el('img.fleet-truck-image', { class: classe, src: 'assets/camion-b2f.png', alt: '', decoding: 'async' });
const pastille = (texte, ton = 'info') => el('span.fleet-status', { class: `is-${ton}` }, [el('i', { 'aria-hidden': 'true' }), texte]);
const champInfo = (libelle, valeur, icon) => el('div.fleet-info-row', {}, [
  el('dt', {}, [icone(icon, 15), libelle]), el('dd', { text: valeur || 'Non renseigné' }),
]);

export function vueFlotte(ctx, params = {}) {
  const donnees = donneesFlotte(ctx);
  let selection = donnees.find(d => d.vehicule.id === params.selection) || donnees[0];
  let recherche = '', filtre = 'tous';
  const droit = nom => decider(ctx, nom, { groupementId: ctx.groupementId });
  const action = (libelle, permission, onClick, icon, variante = 'secondary', motif = null) => bouton({
    libelle, onClick, icone: icon, variante, motif: motif || (droit(permission).autorise ? null : droit(permission).explication),
  });
  const page = el('div.page.fleet-page', {}, [
    el('header.fleet-page-header', {}, [
      el('div', {}, [el('span.dash-eyebrow', { text: 'ESPACE TRANSPORTEUR' }), el('h1', { text: 'Ma flotte' }), el('p', { text: 'Vos camions, leurs disponibilités et leurs prochains trajets.' })]),
      action('Ajouter un camion', 'vehicule.gerer', () => ouvrirVehicule(ctx), 'plus', 'primary'),
    ]),
    el('nav.fleet-nav', { 'aria-label': 'Rubriques de la flotte' }, [
      el('a.active', { href: '#/transporteur/vehicules', 'aria-current': 'page' }, [icone('truck', 19), 'Vue d’ensemble', el('span', { text: donnees.length })]),
      el('a', { href: '#/transporteur/chauffeurs' }, [icone('users', 17), 'Chauffeurs']),
      el('a', { href: '#/transporteur/offres' }, [icone('calendar', 17), 'Disponibilités']),
    ]),
  ]);
  if (!donnees.length) {
    page.append(etatVide({ titre: 'Votre flotte commence ici', message: 'Ajoutez votre premier camion pour préparer sa disponibilité et retrouver ses trajets dans cet espace.' }));
    return page;
  }
  const map = carteFlotte();
  const liste = el('div.fleet-vehicle-list', { 'aria-label': 'Camions de votre flotte' });
  const compteur = el('span.fleet-list-count', { 'aria-live': 'polite' });
  const panneau = el('section.fleet-detail', { 'aria-label': 'Dossier du camion sélectionné' });
  const chips = el('div.fleet-filters', { 'aria-label': 'Filtrer les camions' });
  const disponibles = d => d.statut === 'disponible';
  const aVerifier = d => (d.alertes || []).length > 0 || ['a_verifier', 'indisponible'].includes(d.statut);
  function resultats() {
    const q = recherche.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return donnees.filter(d => {
      const texte = [d.vehicule.immatriculation, refDe(d.vehicule.carrosserieId), d.depart, d.arrivee, d.stationnement].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return texte.includes(q) && (filtre === 'tous' || (filtre === 'disponible' ? disponibles(d) : aVerifier(d)));
    });
  }
  function rendreListe() {
    const lignes = resultats();
    compteur.textContent = `${lignes.length} / ${donnees.length}`;
    chips.replaceChildren(...[
      ['tous', 'Tous', donnees.length],
      ['disponible', 'Disponibles', donnees.filter(disponibles).length],
      ['a_verifier', 'À vérifier', donnees.filter(aVerifier).length],
    ].map(([id, texte, n]) => el('button', { type: 'button', class: filtre === id ? 'active' : '', 'aria-pressed': String(filtre === id), on: { click: () => { filtre = id; rendreListe(); chips.querySelector('.active')?.focus({ preventScroll: true }); } } }, [texte, el('span', { text: n })])));
    liste.replaceChildren(...lignes.map(d => el('button.fleet-vehicle-selector', {
      type: 'button', class: d.vehicule.id === selection.vehicule.id ? 'selected' : '', 'aria-pressed': String(d.vehicule.id === selection.vehicule.id),
      on: { click: () => { selection = d; history.replaceState(null, '', `#/transporteur/vehicules?selection=${encodeURIComponent(d.vehicule.id)}`); rendreListe(); rendreDetail(); liste.querySelector('.selected')?.focus({ preventScroll: true }); } },
    }, [
      el('div.fleet-vehicle-top', {}, [el('strong', { text: d.vehicule.immatriculation }), pastille(d.libelle, d.ton)]),
      el('div.fleet-vehicle-mid', {}, [camion(), el('div', {}, [el('strong', { text: `${refDe(d.vehicule.carrosserieId)} · ${d.vehicule.capaciteT} t` }), el('small', { text: `${refDe(d.vehicule.essieuxId)} · PTAC ${d.vehicule.ptacT} t` })])]),
      el('div.fleet-vehicle-route', {}, [icone('map-pin', 13), el('span', { text: d.enRoute ? `${d.depart} → ${d.arrivee}` : d.stationnementId ? `Stationné · ${d.stationnement}` : 'Stationnement à renseigner' }), icone('chevron-right', 14)]),
    ])));
    if (!lignes.length) liste.append(el('div.fleet-no-result', {}, [icone('search', 25), el('strong', { text: 'Aucun camion trouvé' }), el('p', { text: 'Essayez une autre recherche ou un autre filtre.' })]));
  }
  const lien = (libelle, href, icon = 'arrow-right') => el('a.fleet-action-link', { href }, [icone(icon, 18), el('span', { text: libelle }), icone('chevron-right', 16)]);
  function indicateur(libelle, valeur, note, icon, ton) {
    return el('article.fleet-metric', {}, [
      el('div', {}, [el('span.fleet-metric-icon', { class: `is-${ton}` }, [icone(icon, 17)]), el('span', { text: libelle })]),
      el('strong', { text: valeur }), el('small', { text: note }), el('span.fleet-metric-watermark', { 'aria-hidden': 'true' }, [icone(icon, 65)]),
    ]);
  }
  function rendreDetail() {
    const d = selection, v = d.vehicule, c = d.chauffeur;
    const vehicule = el('article.fleet-summary-card.fleet-panel', {}, [
      el('span.fleet-card-eyebrow', { text: 'VÉHICULE SÉLECTIONNÉ' }), camion('fleet-truck-large'),
      el('h2', { text: v.immatriculation }),
      el('dl', {}, [champInfo('Carrosserie', refDe(v.carrosserieId), 'truck'), champInfo('Essieux', refDe(v.essieuxId), 'settings'), champInfo('Charge utile', `${v.capaciteT} t`, 'scale')]),
    ]);
    const etapeTrajet = (libelle, ville, destination = false) => el('div.fleet-trip-stop', { class: destination ? 'is-destination' : '' }, [
      el('span.fleet-stop-icon', { 'aria-hidden': 'true' }, [icone(destination ? 'map-pin' : 'truck', 17)]),
      el('div', {}, [el('dt', { text: libelle }), el('dd', { text: ville })]),
    ]);
    const trajet = el('article.fleet-trip-card.fleet-panel', {}, [
      el('div.fleet-card-heading', {}, [el('h2', { text: d.enRoute ? 'Transport en cours' : 'Disponibilité du camion' }), pastille(d.libelle, d.ton)]),
      d.offre ? el('div.fleet-trip-content', {}, [
        el('dl.fleet-trip-itinerary', { 'aria-label': 'Itinéraire annoncé' }, [
          etapeTrajet('Départ', d.depart), etapeTrajet('Destination', d.arrivee, true),
        ]),
        el('dl.fleet-trip-dates', { 'aria-label': 'Période de disponibilité' }, [
          el('div', {}, [el('dt', {}, [icone('calendar', 15), 'Disponible du']), el('dd', { text: date(d.offre.disponibleDu) })]),
          el('div', {}, [el('dt', {}, [icone('calendar', 15), 'Jusqu’au']), el('dd', { text: date(d.offre.disponibleAu) })]),
        ]),
      ]) : el('div.fleet-trip-empty', {}, [icone('calendar', 24), el('div', {}, [el('strong', { text: 'Préparez le prochain trajet' }), el('p', { text: 'Publiez un départ, une destination et une période pour rendre ce camion visible sur le marché.' })])]),
      c ? el('div.fleet-trip-crew', {}, [icone('users', 16), el('div', {}, [el('span', { text: 'Chauffeur prévu pour ce trajet' }), el('strong', { text: c.nom })])]) : null,
      el('div.fleet-trip-footer', {}, [
        el('span', { text: d.offre?.reference || 'Aucune disponibilité publiée' }),
        d.offre ? el('a', { href: '#/transporteur/offres' }, ['Voir les disponibilités', icone('arrow-right', 14)]) : action('Publier', 'offre.publier', () => aller(`#/transporteur/offres/nouvelle?vehicule=${encodeURIComponent(v.id)}`), 'plus', 'ghost', !v.publiable ? v.motif : null),
      ]),
    ]);
    const titreTrajet = d.enRoute ? `${d.depart} → ${d.arrivee}` : d.stationnementId ? `Stationné à ${d.stationnement}` : 'Lieu de stationnement à renseigner';
    const carte = el('section.fleet-map-card.fleet-panel', { 'aria-label': d.enRoute ? 'Trajet du transport en cours' : 'Stationnement du camion' }, [
      el('div.fleet-map-heading', {}, [el('div', {}, [el('span.fleet-card-eyebrow', { text: d.enRoute ? 'LE CAMION EST EN ROUTE' : 'LE CAMION EST À L’ARRÊT' }), el('h2', { text: titreTrajet })]), el('span.fleet-map-mode', {}, [icone('map-pin', 14), d.enRoute ? 'Trajet en cours' : 'Stationnement'])]),
      map.element,
      el('div.fleet-map-caption', {}, [el('span', {}, [el('i.fleet-origin-dot', { 'aria-hidden': 'true' }), d.enRoute ? 'Départ' : 'Point de stationnement']), d.enRoute ? el('span', {}, [el('i.fleet-destination-dot', { 'aria-hidden': 'true' }), 'Destination']) : null, el('small', { text: d.stationnementSource === 'livraison' && !d.enRoute ? 'Lieu issu de la dernière livraison déclarée' : 'Localisation déclarée · sans suivi GPS en direct' })]),
    ]);
    const carteValide = Number.isFinite(Date.parse(v.carteTransportEcheance)) && new Date(`${v.carteTransportEcheance.slice(0, 10)}T23:59:59`).getTime() >= Date.now();
    const metrics = el('div.fleet-metrics', {}, [
      indicateur('Capacité utile', `${v.capaciteT} t`, refDe(v.carrosserieId), 'scale', 'info'),
      indicateur('Disponibilités actives', String(d.offresActives || 0), 'Offres publiées ou réservées', 'calendar', 'warn'),
      indicateur('Carte de transport', carteValide ? 'À jour' : 'À renouveler', `Échéance · ${date(v.carteTransportEcheance)}`, 'check-circle', carteValide ? 'success' : 'warn'),
      indicateur('PTAC', `${v.ptacT} t`, `Configuration · ${refDe(v.essieuxId)}`, 'truck', 'info'),
      // Correctif anti-fraude n° 3 : la carte grise contrôlée conditionne la publication.
      indicateur('Contrôle des pièces', v.verifieLe ? 'Contrôlé' : 'À contrôler', v.verifieLe ? `Le ${date(v.verifieLe)}` : 'Par l’agent d’activation', 'shield', v.verifieLe ? 'success' : 'warn'),
    ]);
    const actions = el('section.fleet-panel.fleet-quick-actions', {}, [
      el('h2', { text: 'Actions rapides' }),
      action('Modifier le camion', 'vehicule.gerer', () => ouvrirVehicule(ctx, v), 'settings'),
      action('Publier une disponibilité', 'offre.publier', () => aller(`#/transporteur/offres/nouvelle?vehicule=${encodeURIComponent(v.id)}`), 'calendar', 'primary', !v.publiable ? v.motif : null),
      // Intégration : le lien n'apparaît que si l'écran existe pour ce rôle (le partenaire n'a pas le marché).
      ...[d.transport ? ['Suivre ce transport', 'suivi', 'map-pin'] : d.appariement ? ['Voir la réservation', 'reservations', 'handshake'] : ['Trouver du fret', 'marche', 'search']]
        .filter(([, page]) => localiser(ctx, page)).map(([libelle, page, ic]) => lien(libelle, `#/transporteur/${page}`, ic)),
    ]);
    const historique = el('section.fleet-panel.fleet-history', {}, [el('div.fleet-card-heading', {}, [el('h2', { text: 'Activité du véhicule' }), icone('history', 18)])]);
    const evenements = (d.historique || []).slice(0, 3);
    historique.append(el('ol', {}, evenements.length ? evenements.map(e => el('li', {}, [
      el('i', { 'aria-hidden': 'true' }), el('div', {}, [el('strong', { text: e.libelle }), el('small', { text: dateHeure(e.date) }), e.detail ? el('p', { text: e.detail }) : null]),
    ])) : [el('li', {}, [el('i', { 'aria-hidden': 'true' }), el('div', {}, [el('strong', { text: 'Camion enregistré dans votre parc' }), el('small', { text: date(v.creeLe) })])])]));
    const alertes = (d.alertes || []).length ? el('div.fleet-alerts', {}, d.alertes.map(a => el('div', {}, [icone('alert', 16), el('span', {}, [el('strong', { text: a.libelle }), a.detail ? ` · ${a.detail}` : null])]))) : null;
    panneau.replaceChildren(...[el('div.fleet-summary', {}, [vehicule, trajet]), carte, metrics, alertes, el('div.fleet-bottom', {}, [actions, historique])].filter(Boolean));
    map.update({ departId: d.departId, arriveeId: d.arriveeId, immatriculation: v.immatriculation, statut: d.statut, libelle: d.libelle, enRoute: d.enRoute, stationnementId: d.stationnementId });
  }
  page.append(el('div.fleet-workspace', {}, [
    el('aside.fleet-list-panel.fleet-panel', {}, [
      el('div.fleet-list-heading', {}, [el('h2', { text: 'Mes camions' }), compteur]),
      el('label.fleet-search', {}, [icone('search', 18), el('input', { type: 'search', placeholder: 'Immatriculation, type, ville…', 'aria-label': 'Rechercher dans ma flotte', on: { input: e => { recherche = e.target.value; rendreListe(); } } })]), chips, liste,
      el('div.fleet-list-footer', {}, [icone('info', 15), 'Sélectionnez un camion pour consulter son dossier et son trajet.']),
    ]), panneau,
  ]));
  rendreListe(); rendreDetail();
  return page;
}
