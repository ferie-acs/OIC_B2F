/**
 * Règles de l'attestation de bourse de fret et de sa vérification (lot b3).
 *
 * Module **pur** : état, échéance, forme du code de vérification. Le jeton est
 * tiré par le service ; ce module ne fait que le présenter et le relire.
 *
 * ## Durée de validité — hypothèse du POC, à confirmer par l'OIC
 *
 * L'attestation couvre le trajet : elle vaut depuis son émission jusqu'à
 * l'arrivée prévue, **plus trois jours** de marge pour les aléas de la route.
 * Au-delà, elle est expirée ; le contrôle le dit, sans la rendre invalide
 * rétroactivement.
 *
 * @module domain/attestation.regles
 */

import { ETAT_ATTESTATION, RESULTAT_CONTROLE } from './enums.js';

/** Marge ajoutée à l'arrivée prévue. */
export const MARGE_VALIDITE_HEURES = 72;

/**
 * Alphabet du code de vérification (base 32 de Crockford) : ni I, ni L, ni O, ni U,
 * pour qu'un agent qui recopie un document ne confonde pas 0 et O, 1 et I.
 */
export const ALPHABET_CODE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Longueur du jeton : 24 caractères de 5 bits, soit 120 bits d'aléa. */
export const LONGUEUR_JETON = 24;

/**
 * Fin de validité d'une attestation.
 * @param {string} arriveePrevue ISO.
 * @returns {string} ISO.
 */
export function finValidite(arriveePrevue) {
  const t = new Date(arriveePrevue).getTime();
  if (!Number.isFinite(t)) throw new Error('Date d’arrivée prévue invalide.');
  return new Date(t + MARGE_VALIDITE_HEURES * 3600000).toISOString();
}

/**
 * État d'une attestation à une date. L'expiration se constate à la lecture (D38).
 * @param {{etat: string, valableJusquau: string}} a
 * @param {Date} [maintenant]
 * @returns {string} Valeur de `ETAT_ATTESTATION`.
 */
export function etatAttestation(a, maintenant = new Date()) {
  if (a?.etat === ETAT_ATTESTATION.ANNULEE) return ETAT_ATTESTATION.ANNULEE;
  const fin = new Date(a?.valableJusquau ?? '').getTime();
  // Une échéance illisible n'est pas une validité : l'attestation est tenue pour expirée.
  if (!Number.isFinite(fin) || fin < maintenant.getTime()) return ETAT_ATTESTATION.EXPIREE;
  return ETAT_ATTESTATION.EN_VIGUEUR;
}

/**
 * Verdict de contrôle correspondant à un état.
 * @param {string|null} etat `null` : aucune attestation ne porte ce code.
 * @returns {string} Valeur de `RESULTAT_CONTROLE`.
 */
export function resultatDe(etat) {
  if (etat === ETAT_ATTESTATION.EN_VIGUEUR) return RESULTAT_CONTROLE.VALIDE;
  if (etat === ETAT_ATTESTATION.EXPIREE) return RESULTAT_CONTROLE.EXPIREE;
  if (etat === ETAT_ATTESTATION.ANNULEE) return RESULTAT_CONTROLE.ANNULEE;
  return RESULTAT_CONTROLE.INCONNUE;
}

/**
 * Jeton à partir d'octets aléatoires.
 * @param {Uint8Array} alea Au moins 15 octets.
 * @returns {string}
 */
export function jetonDepuis(alea) {
  let bits = '';
  for (const o of alea) bits += o.toString(2).padStart(8, '0');
  let jeton = '';
  for (let i = 0; i + 5 <= bits.length && jeton.length < LONGUEUR_JETON; i += 5) {
    jeton += ALPHABET_CODE[Number.parseInt(bits.slice(i, i + 5), 2)];
  }
  if (jeton.length < LONGUEUR_JETON) throw new Error('Aléa insuffisant pour un jeton de vérification.');
  return jeton;
}

/**
 * Présentation du code : six groupes de quatre caractères.
 * @param {string} jeton
 * @returns {string}
 */
export function codeLisible(jeton) {
  return String(jeton ?? '').match(/.{1,4}/g)?.join('-') ?? '';
}

/**
 * Relit un code saisi ou scanné : adresse de vérification complète, code groupé
 * par tirets, minuscules, confusions courantes (O pour 0, I ou L pour 1).
 * @param {string} saisie
 * @returns {string|null} Le jeton normalisé, ou `null` s'il n'a pas la forme attendue.
 */
export function normaliserCode(saisie) {
  let brut = String(saisie ?? '').trim();
  const lien = brut.match(/verifier\/([A-Za-z0-9-]+)/);
  if (lien) brut = lien[1];
  const jeton = brut
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (jeton.length !== LONGUEUR_JETON) return null;
  if ([...jeton].some((c) => !ALPHABET_CODE.includes(c))) return null;
  return jeton;
}

/**
 * Chemin de la page publique de vérification, à joindre à l'adresse du site.
 * **Le jeton seul** : ni identifiant, ni référence, ni immatriculation.
 * @param {string} jeton
 * @returns {string}
 */
export function cheminVerification(jeton) {
  return `#/verifier/${jeton}`;
}
