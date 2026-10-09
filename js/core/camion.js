import { el } from './dom.js';

/** Le sens et la silhouette dépendent de l'offre, jamais de son statut de réservation. */
export function camion(offre = {}, taille = 36) {
  const retour = offre.trajetRetour === true, vide = offre.trajetVide === true;
  return el('img.fret-truck', {
    src: vide ? 'assets/tracteur-b2f.png' : 'assets/camion-b2f.png',
    alt: `${retour ? 'Retour' : 'Départ'}${vide ? ' à vide' : ''}`,
    class: `${retour ? 'is-return' : 'is-outbound'}${vide ? ' is-empty' : ''}`,
    width: taille, height: Math.round(taille * (vide ? .65 : .4)),
    decoding: 'async',
  });
}
export function libelleTrajet(offre = {}) {
  return `${offre.trajetRetour ? 'Retour' : 'Départ'}${offre.trajetVide ? ' · À vide' : ''}`;
}
