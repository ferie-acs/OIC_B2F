/**
 * Instances de dépôts, une par entité du schéma.
 *
 * Construites à partir de `ENTITES` : ajouter une entité au schéma suffit à lui
 * donner son dépôt. Aucune liste à tenir à jour en parallèle — une liste
 * parallèle finit toujours par diverger.
 *
 * @module repositories
 */

import { creerStockage } from '../core/storage.js';
import { ENTITES } from '../domain/schema.js';
import { creerDepot } from './repository.js';

/** @type {ReturnType<typeof creerStockage>} */
let stockage;

/** @type {Record<string, ReturnType<typeof creerDepot>>} */
const depots = {};

/**
 * Initialise la couche de persistance.
 *
 * **Rejoue d'abord un éventuel journal d'annulation**, avant toute lecture
 * métier : une interruption entre l'application d'un lot et l'effacement du
 * journal laisserait sinon des écritures partielles. Le finding S14 relevait que
 * le commentaire l'exigeait sans que rien ne l'impose ; c'est imposé ici.
 *
 * @param {object} [options]
 * @param {any} [options.backend] Backend injecté — les tests passent la mémoire.
 * @param {(raison: string) => void} [options.onDegradation]
 * @returns {{restauree: boolean, collections: string[]}}
 */
export function initialiserPersistance(options = {}) {
  stockage = creerStockage(options.backend, { onDegradation: options.onDegradation });
  const bilan = stockage.restaurerSiInterrompu();

  for (const nom of Object.keys(ENTITES)) {
    depots[nom] = creerDepot(nom, stockage);
  }
  return bilan;
}

/**
 * Rend le dépôt d'une entité.
 * @param {string} nomEntite
 * @returns {ReturnType<typeof creerDepot>}
 */
export function depot(nomEntite) {
  if (!depots[nomEntite]) {
    throw new Error(
      `Dépôt indisponible pour « ${nomEntite} ». ` +
        'La persistance a-t-elle été initialisée (initialiserPersistance) ?',
    );
  }
  return depots[nomEntite];
}

/**
 * Accès au stockage, pour les services qui ont besoin d'une transaction.
 * **Aucune vue ne doit appeler ceci.**
 * @returns {ReturnType<typeof creerStockage>}
 */
export function stockageInterne() {
  if (!stockage) throw new Error('Persistance non initialisée.');
  return stockage;
}

/**
 * Efface toutes les données du POC. Ne touche qu'aux clés `b2f_` : le POC DUT
 * servi depuis la même origine n'est pas concerné (risque R5).
 */
export function reinitialiser() {
  const utilisateurs = depots.utilisateur?.brutTous() ?? [];
  const preferences = utilisateurs.map((u) => `recherche_${u.id}`);
  stockageInterne().reinitialiser(
    Object.values(ENTITES).map((e) => e.collection),
    preferences,
  );
}
