/**
 * Accès aux données **pour les vues** — projeté, ou strictement limité.
 *
 * ## Pourquoi ce module
 *
 * La campagne QA a établi un constat transversal : le domaine est rigoureux,
 * **les vues le contournent**. Là où un service passe par `decider()` puis
 * `projeter()`, une vue lisait l'objet brut et l'affichait — d'où QA-01 (les
 * montants d'un dossier entre concurrents), QA-02 (le solde de la contrepartie)
 * et QA-03 (l'agrégat de toute la plateforme).
 *
 * Corriger les trois cas ne suffisait pas : la porte restait ouverte pour le
 * prochain écran. Les vues n'accèdent donc plus aux dépôts que par ici, et un
 * test de conformité (`tests/conformite.test.mjs`) leur interdit `brutParId`,
 * `brutOu` et `brutTous` sur les entités qui portent des champs classés.
 *
 * ## Ce que ce module rend
 *
 * - des **libellés** (`nomDe`, `refDe`) : de l'identité commerciale, publique
 *   entre acteurs du marché, jamais une coordonnée ;
 * - des **objets projetés**, quand la vue a besoin de plus.
 *
 * Ce qu'il ne rend jamais : un objet brut.
 *
 * @module views/_donnees
 */

import { projeter } from '../domain/access.js';
import { depot } from '../repositories/index.js';

/**
 * Raison sociale d'un groupement.
 *
 * Classification `identite` : c'est ce qui permet de choisir avec qui traiter,
 * et c'est visible sur le marché. Cet accesseur ne rend **que** cette chaîne —
 * il ne donne pas accès à l'objet, donc pas aux coordonnées.
 *
 * @param {string|null|undefined} groupementId
 * @returns {string}
 */
export function nomDe(groupementId) {
  if (!groupementId) return '—';
  return depot('groupement').brutParId(groupementId)?.raisonSociale ?? '—';
}

/**
 * Libellé d'une entrée de référentiel. Les nomenclatures sont publiques.
 * @param {string|null|undefined} id
 * @returns {string}
 */
export function refDe(id) {
  if (!id) return '—';
  return depot('referentiel').brutParId(id)?.libelle ?? '—';
}

/**
 * Immatriculation d'un véhicule.
 *
 * `identite` : c'est un critère de choix affiché sur le marché. Rendre la
 * chaîne plutôt que l'objet ferme l'accès à la carte grise, qui est `contact`.
 *
 * @param {string|null|undefined} vehiculeId
 * @returns {string}
 */
export function immatriculationDe(vehiculeId) {
  if (!vehiculeId) return '—';
  return depot('vehicule').brutParId(vehiculeId)?.immatriculation ?? '—';
}

/**
 * Nom d'un utilisateur, pour le journal d'audit.
 *
 * Rend la chaîne, jamais l'objet : celui-ci porte l'empreinte du mot de passe.
 * La projection l'écarterait de toute façon, mais un accesseur qui ne peut pas
 * la rendre vaut mieux qu'une projection qu'on peut oublier d'appeler.
 *
 * @param {string|null|undefined} utilisateurId
 * @returns {string}
 */
export function nomUtilisateur(utilisateurId) {
  if (!utilisateurId) return '—';
  const u = depot('utilisateur').brutParId(utilisateurId);
  return u ? `${u.prenom ?? ''} ${u.nom}`.trim() : '—';
}

/**
 * Tarif en vigueur pour un code du catalogue.
 * @param {string} code
 * @returns {number|null}
 */
export function tarifDe(code) {
  return depot('tarif').brutParId(code)?.montant ?? null;
}

/**
 * Un objet projeté par son identifiant.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} nomEntite
 * @param {string} id
 * @param {{proprietaireId?: string|null}} [options]
 * @returns {Record<string, any>|null}
 */
export function lire(ctx, nomEntite, id, options = {}) {
  return depot(nomEntite).lire(ctx, id, options);
}

/**
 * Objets projetés d'une entité, filtrés.
 *
 * Le filtre s'applique sur l'objet **brut** — il faut bien filtrer sur quelque
 * chose — mais ce qui sort est projeté. Un filtre n'est pas un affichage.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} nomEntite
 * @param {(o: Record<string, any>) => boolean} predicat
 * @param {{proprietaireId?: string|null}} [options]
 * @returns {Array<Record<string, any>>}
 */
export function projeterOu(ctx, nomEntite, predicat, options = {}) {
  return depot(nomEntite)
    .brutOu(predicat)
    .map((o) => projeter(ctx, nomEntite, o, options));
}

/**
 * Compte des objets sans en rendre aucun.
 *
 * Pour les indicateurs. **Le prédicat doit porter le cloisonnement** : c'est la
 * leçon de QA-03, où un compteur sans filtre de groupement affichait à un
 * affréteur le transport d'un concurrent.
 *
 * @param {string} nomEntite
 * @param {(o: Record<string, any>) => boolean} predicat
 * @returns {number}
 */
export function compter(nomEntite, predicat) {
  return depot(nomEntite).brutOu(predicat).length;
}
