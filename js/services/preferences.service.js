/**
 * Préférences d'affichage, **par utilisateur**.
 *
 * Correctif QA-09. Les critères de recherche étaient écrits directement en
 * LocalStorage depuis une vue (`js/views/affreteur.js`), ce qui violait la règle
 * `VUE → SERVICE → REPOSITORY → LOCALSTORAGE` et produisait trois effets :
 *
 * - la clé échappait à la réinitialisation de la démonstration et lui survivait ;
 * - elle n'était **rattachée à aucun utilisateur** : les critères d'un affréteur
 *   étaient servis au suivant, sur la même origine ;
 * - la parade du risque R5 cessait d'être vérifiable en un point.
 *
 * Les préférences sont désormais nominatives et passent par le stockage.
 *
 * @module services/preferences.service
 */

import { stockageInterne } from '../repositories/index.js';

/** Préférences connues. Sert à la réinitialisation de la démonstration. */
export const CLES = Object.freeze(['recherche']);

/**
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} cle
 * @returns {string}
 */
const nominative = (ctx, cle) => `${cle}_${ctx.utilisateurId}`;

/**
 * Lit une préférence de l'utilisateur courant.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} cle
 * @param {unknown} [defaut]
 * @returns {any}
 */
export function lire(ctx, cle, defaut = {}) {
  return stockageInterne().lirePreference(nominative(ctx, cle)) ?? defaut;
}

/**
 * Enregistre une préférence de l'utilisateur courant.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} cle
 * @param {unknown} valeur
 */
export function ecrire(ctx, cle, valeur) {
  stockageInterne().ecrirePreference(nominative(ctx, cle), valeur);
}
