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
 * - des **libellés** (`nomDe`, `refDe`) : l'identité commerciale n'en sort que
 *   pour qui a le droit de la lire — sinon un alias (correctif anti-fraude n° 1) ;
 * - des **objets projetés**, quand la vue a besoin de plus.
 *
 * Ce qu'il ne rend jamais : un objet brut.
 *
 * @module views/_donnees
 */

import { identiteLiberee, projeter } from '../domain/access.js';
import { profilConfiance } from '../services/avis.service.js';
import { depot } from '../repositories/index.js';

/**
 * Nom d'un groupement **tel que ce lecteur a le droit de le voir**.
 *
 * Correctif anti-fraude n° 1 (13/10/2026). Cet accesseur rendait la raison
 * sociale à tout le monde, au motif qu'elle était « visible sur le marché ».
 * C'était précisément le défaut : connaître le nom d'un transporteur avant de
 * payer suffisait à le joindre hors plateforme. La règle est désormais celle de
 * la projection (`identiteLiberee`) : le nom n'est servi qu'au groupement
 * lui-même, aux rôles institutionnels, et aux deux parties d'une mise en
 * relation validée. Aux autres, un **alias stable** — « Transporteur T-4F2A » —
 * qui permet de reconnaître la même contrepartie d'un écran à l'autre sans
 * pouvoir l'identifier.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string|null|undefined} groupementId
 * @returns {string}
 */
export function nomDe(ctx, groupementId) {
  if (!groupementId) return '—';
  const g = depot('groupement').brutParId(groupementId);
  if (!g) return '—';
  if (identiteLiberee(ctx, `groupement:${groupementId}`, groupementId)) return g.raisonSociale ?? '—';
  return aliasDe(g);
}

/**
 * Alias non identifiant d'un groupement : son type et un code dérivé de son
 * identifiant technique. Le code ne se recoupe avec aucune donnée publique.
 * @param {{id: string, type?: string}} g
 * @returns {string}
 */
function aliasDe(g) {
  let h = 2166136261;
  for (const c of String(g.id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const code = h.toString(36).toUpperCase().padStart(4, '0').slice(-4);
  const type = g.type === 'affreteur' ? 'Affréteur' : g.type === 'transporteur' ? 'Transporteur' : 'Partenaire';
  return `${type} ${type[0]}-${code}`;
}

/**
 * Profil de confiance d'un groupement : ce qu'on montre à la place de son nom.
 * Des agrégats uniquement (correctifs n° 1 et n° 2).
 * @param {string|null|undefined} groupementId
 */
export function confianceDe(groupementId) {
  return profilConfiance(groupementId);
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
 * Immatriculation d'un véhicule, **si ce lecteur a le droit de la voir**.
 *
 * Correctif anti-fraude n° 1 : une plaque suffit à retrouver son propriétaire.
 * Elle suit la règle de l'identité — propriétaire, rôles institutionnels, ou
 * parties d'une mise en relation validée portant sur ce véhicule.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string|null|undefined} vehiculeId
 * @returns {string}
 */
export function immatriculationDe(ctx, vehiculeId) {
  if (!vehiculeId) return '—';
  const v = depot('vehicule').brutParId(vehiculeId);
  if (!v) return '—';
  return identiteLiberee(ctx, `vehicule:${vehiculeId}`, v.groupementId)
    ? v.immatriculation ?? '—'
    : 'Communiquée à la validation';
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
