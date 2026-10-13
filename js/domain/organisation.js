/**
 * Lot b2 : organisation interne — règles pures des filiales et des comptes.
 *
 * Une filiale (ou entité rattachée) hérite des pièces de sa mère : RCCM, compte
 * contribuable, carte de transporteur, et la vérification que l'agent
 * d'activation a prononcée sur ces pièces. Elle en hérite **dynamiquement** : si
 * la mère perd sa vérification, la filiale la perd aussi. C'est la règle
 * anti-fraude existante prolongée — une filiale d'une entreprise non vérifiée
 * n'est pas active.
 *
 * @module domain/organisation
 */

import { ETAT_COMPTE, ETAT_VERIFICATION, TYPE_GROUPEMENT } from './enums.js';

/**
 * Une entreprise est-elle vérifiée ? Seule source de la règle, lue par les
 * filiales (héritage) et par l'annuaire des intermédiaires.
 *
 * L'état est écrit par l'agent d'activation (lot b1) pour tout type
 * d'entreprise : « à vérifier » à l'inscription en ligne, « vérifié » à
 * l'activation, « refusé » au refus. Sans état écrit :
 * - un transporteur n'est **pas** vérifié (correctif anti-fraude : personne n'a
 *   rien contrôlé) ;
 * - un affréteur ou un intermédiaire antérieur à l'inscription en ligne (sans
 *   `inscriptionEtat`) est tenu pour vérifié, comme il est tenu pour activé ;
 * - une entreprise inscrite en ligne ne l'est pas tant que l'agent n'a rien écrit.
 *
 * @param {Record<string, any>|null|undefined} g
 * @returns {boolean}
 */
export function entrepriseVerifiee(g) {
  if (!g) return false;
  if (g.verificationEtat != null) return g.verificationEtat === ETAT_VERIFICATION.VERIFIE;
  return g.type !== TYPE_GROUPEMENT.TRANSPORTEUR && g.inscriptionEtat == null;
}

/**
 * L'entreprise mère est-elle vérifiée, au sens de ce qui conditionne ses filiales ?
 * @param {Record<string, any>|null|undefined} mere
 * @returns {boolean}
 */
export function mereVerifiee(mere) {
  return entrepriseVerifiee(mere);
}

/**
 * Une entreprise est-elle opérationnelle ? Toujours vrai pour une entreprise
 * qui n'est pas une filiale : son état reste gouverné comme avant ce lot.
 *
 * @param {Record<string, any>|null|undefined} groupement
 * @param {Record<string, any>|null|undefined} mere Groupement `parentId`, s'il y en a un.
 * @returns {boolean}
 */
export function entiteOperationnelle(groupement, mere) {
  if (!groupement?.parentId) return true;
  if (groupement.etat !== ETAT_COMPTE.ACTIF) return false;
  if (groupement.verificationEtat === ETAT_VERIFICATION.REFUSE) return false;
  if (!mere || mere.etat !== ETAT_COMPTE.ACTIF) return false;
  return mereVerifiee(mere);
}

/**
 * Raison affichable pour laquelle une filiale n'est pas opérationnelle, ou `null`.
 * @param {Record<string, any>|null|undefined} groupement
 * @param {Record<string, any>|null|undefined} mere
 * @returns {string|null}
 */
export function motifInactivite(groupement, mere) {
  if (entiteOperationnelle(groupement, mere)) return null;
  if (groupement?.verificationEtat === ETAT_VERIFICATION.REFUSE) {
    return 'La vérification de cette entité a été refusée par l’agent d’activation.';
  }
  if (!mere || mere.etat !== ETAT_COMPTE.ACTIF) {
    return 'L’entreprise mère de cette entité n’est pas active.';
  }
  if (!mereVerifiee(mere)) {
    return 'Cette entité sera active dès que le dossier de son entreprise mère aura été ' +
      'vérifié par l’agent d’activation.';
  }
  return 'Cette entité est suspendue.';
}

/** Validité d'un code d'activation, en heures. Courte, et à usage unique. */
export const VALIDITE_CODE_HEURES = 24;

/** Nombre d'essais erronés au-delà duquel un code est invalidé. */
export const ESSAIS_CODE_MAX = 5;

/** Alphabet des codes : sans caractère ambigu (0/O, 1/I/L). */
export const ALPHABET_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Règle de mot de passe défini à l'activation. Rend la liste des manquements.
 * @param {string} motDePasse
 * @param {string} confirmation
 * @returns {string[]}
 */
export function controlerMotDePasse(motDePasse, confirmation) {
  const m = String(motDePasse ?? '');
  /** @type {string[]} */
  const manquements = [];
  if (m.length < 8) manquements.push('Le mot de passe compte au moins 8 caractères.');
  if (!/[A-Za-zÀ-ÿ]/.test(m) || !/\d/.test(m)) {
    manquements.push('Le mot de passe contient au moins une lettre et un chiffre.');
  }
  if (m !== String(confirmation ?? '')) manquements.push('Les deux saisies du mot de passe diffèrent.');
  return manquements;
}
