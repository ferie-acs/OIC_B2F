/**
 * Lot b5 : état de suspension d'une entreprise, lu par les services du marché.
 *
 * Une entreprise suspendue conserve son historique ; elle n'engage plus aucune
 * nouvelle opération et ses annonces quittent le marché. Module minimal, sans
 * autre dépendance que les dépôts, pour être importé sans cycle.
 *
 * @module services/suspension
 */

import { ETAT_COMPTE } from '../domain/enums.js';
import { depot } from '../repositories/index.js';

/**
 * @param {string|null|undefined} groupementId
 * @returns {boolean}
 */
export function groupementSuspendu(groupementId) {
  if (!groupementId) return false;
  return depot('groupement').brutParId(groupementId)?.etat === ETAT_COMPTE.SUSPENDU;
}

/** Motif servi quand une opération met en jeu une entreprise suspendue. */
export const MOTIF_SUSPENSION =
  'Une des deux entreprises est suspendue par l’exploitant de la plateforme : ' +
  'aucune nouvelle opération ne peut l’engager.';
