/**
 * Lot b2 : organisation interne — le mandat d'un intermédiaire de fret.
 *
 * Un affréteur ou un transporteur (le **mandant**) désigne une entreprise
 * intermédiaire, pour un **périmètre** et une **période**. Les utilisateurs de
 * l'intermédiaire agissent alors au nom du mandant par un **contexte délégué** :
 * le rôle `mandataire_*` (matrice des droits) borné par ce module.
 *
 * Trois règles, toutes pures et testées par table :
 *
 * 1. **Hors période ou retiré, plus rien** : un mandat échu ou retiré ne couvre
 *    plus aucun droit, pas même la lecture.
 * 2. **Le périmètre filtre les actes** : un droit de mutation qu'aucun
 *    périmètre du mandat ne couvre est refusé, même si le rôle délégué le
 *    détient en principe. Les lectures du rôle délégué restent ouvertes.
 * 3. **La validation n'est jamais déléguée** : aucun périmètre ne la couvre, et
 *    le rôle délégué ne la détient pas. L'acte qui engage les frais reste au
 *    mandant (choix du POC, conforme à l'auxiliaire existant).
 *
 * @module domain/mandat
 */

import { ETAT_MANDAT, PERIMETRE_MANDAT, STATUT_MANDAT, TYPE_GROUPEMENT } from './enums.js';

/**
 * Périmètres proposés à chaque type de mandant.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const PERIMETRES_PAR_TYPE = Object.freeze({
  [TYPE_GROUPEMENT.AFFRETEUR]: Object.freeze([
    PERIMETRE_MANDAT.DECLARER_FRET,
    PERIMETRE_MANDAT.GERER_RESERVATIONS,
  ]),
  [TYPE_GROUPEMENT.TRANSPORTEUR]: Object.freeze([
    PERIMETRE_MANDAT.PROPOSER_VEHICULES,
    PERIMETRE_MANDAT.REPONDRE_RESERVATIONS,
  ]),
});

/**
 * Droits de mutation que chaque périmètre ouvre. Tout droit cité ici est
 * **gardé par le périmètre** ; un droit du rôle délégué absent de cette table
 * est une lecture, ouverte pendant toute la période du mandat.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const DROITS_PAR_PERIMETRE = Object.freeze({
  [PERIMETRE_MANDAT.DECLARER_FRET]: Object.freeze([
    'declaration.creer',
    'declaration.modifier',
    'demande.creer',
    'demande.publier',
    'demande.annuler',
  ]),
  [PERIMETRE_MANDAT.GERER_RESERVATIONS]: Object.freeze([
    'marche.offres',
    'appariement.reserver',
    'appariement.annuler',
  ]),
  [PERIMETRE_MANDAT.PROPOSER_VEHICULES]: Object.freeze([
    'marche.demandes',
    'offre.publier',
    'offre.retirer',
    'appariement.proposer',
    'appariement.annuler',
  ]),
  [PERIMETRE_MANDAT.REPONDRE_RESERVATIONS]: Object.freeze([
    'appariement.repondre',
    'appariement.annuler',
  ]),
});

/** Droits gardés par au moins un périmètre. */
const DROITS_GARDES = new Set(Object.values(DROITS_PAR_PERIMETRE).flat());

/**
 * Rôle délégué porté par le contexte d'un intermédiaire, selon le mandant.
 * @type {Readonly<Record<string, string>>}
 */
export const ROLE_MANDATAIRE = Object.freeze({
  [TYPE_GROUPEMENT.AFFRETEUR]: 'mandataire_affreteur',
  [TYPE_GROUPEMENT.TRANSPORTEUR]: 'mandataire_transporteur',
});

/** Durée maximale d'un mandat, en jours. Proposition du POC, à confirmer par l'OIC. */
export const DUREE_MAX_JOURS = 366;

/**
 * Date du jour au format `AAAA-MM-JJ`.
 * @param {Date} maintenant
 * @returns {string}
 */
export function jourDe(maintenant = new Date()) {
  return new Date(maintenant).toISOString().slice(0, 10);
}

/**
 * Statut d'un mandat à une date donnée.
 * @param {{etat: string, debuteLe: string, finitLe: string}} mandat
 * @param {Date} [maintenant]
 * @returns {string} Valeur de `STATUT_MANDAT`.
 */
export function statutMandat(mandat, maintenant = new Date()) {
  if (mandat.etat !== ETAT_MANDAT.ACTIF) return STATUT_MANDAT.RETIRE;
  const jour = jourDe(maintenant);
  if (jour < String(mandat.debuteLe).slice(0, 10)) return STATUT_MANDAT.A_VENIR;
  if (jour > String(mandat.finitLe).slice(0, 10)) return STATUT_MANDAT.ECHU;
  return STATUT_MANDAT.EN_VIGUEUR;
}

/**
 * Le mandat est-il en vigueur ?
 * @param {{etat: string, debuteLe: string, finitLe: string}} mandat
 * @param {Date} [maintenant]
 * @returns {boolean}
 */
export function mandatEnVigueur(mandat, maintenant = new Date()) {
  return statutMandat(mandat, maintenant) === STATUT_MANDAT.EN_VIGUEUR;
}

/**
 * Le droit est-il couvert par le mandat ? Rend `null` si oui, sinon la raison
 * affichable du refus. Appelée par `access.js` pour tout contexte délégué.
 *
 * @param {{etat: string, debuteLe: string, finitLe: string, perimetre: string[], reference?: string}} mandat
 * @param {string} droit
 * @param {Date} [maintenant]
 * @returns {string|null}
 */
export function refusMandat(mandat, droit, maintenant = new Date()) {
  const statut = statutMandat(mandat, maintenant);
  if (statut === STATUT_MANDAT.RETIRE) {
    return 'Le mandat qui vous permettait d’agir au nom de cette entreprise a été retiré.';
  }
  if (statut === STATUT_MANDAT.A_VENIR) {
    return 'Le mandat qui vous permet d’agir au nom de cette entreprise n’a pas encore commencé.';
  }
  if (statut === STATUT_MANDAT.ECHU) {
    return 'Le mandat qui vous permettait d’agir au nom de cette entreprise est arrivé à échéance.';
  }
  if (!DROITS_GARDES.has(droit)) return null;
  const couvert = (mandat.perimetre ?? []).some((p) => DROITS_PAR_PERIMETRE[p]?.includes(droit));
  return couvert
    ? null
    : 'Ce geste ne fait pas partie du périmètre que votre mandant vous a confié. ' +
        'Il peut élargir le mandat depuis son espace.';
}

/**
 * Contrôle la saisie d'une désignation. Rend la liste des manquements, vide si
 * la désignation est recevable.
 *
 * @param {{typeMandant: string, perimetre: string[], debuteLe: string, finitLe: string}} saisie
 * @param {Date} [maintenant]
 * @returns {string[]}
 */
export function controlerDesignation({ typeMandant, perimetre, debuteLe, finitLe }, maintenant = new Date()) {
  /** @type {string[]} */
  const manquements = [];
  const admis = PERIMETRES_PAR_TYPE[typeMandant];
  if (!admis) {
    manquements.push('Seuls un affréteur ou un transporteur peuvent désigner un intermédiaire.');
    return manquements;
  }
  if (!Array.isArray(perimetre) || perimetre.length === 0) {
    manquements.push('Choisissez au moins un élément du périmètre confié.');
  } else if (perimetre.some((p) => !admis.includes(p))) {
    manquements.push('Le périmètre choisi ne correspond pas à votre type d’entreprise.');
  }
  const motifDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!motifDate.test(String(debuteLe ?? '')) || !motifDate.test(String(finitLe ?? ''))) {
    manquements.push('Indiquez la date de début et la date de fin du mandat.');
    return manquements;
  }
  if (finitLe < debuteLe) manquements.push('La fin du mandat doit suivre son début.');
  if (finitLe < jourDe(maintenant)) manquements.push('Un mandat ne peut pas se terminer dans le passé.');
  const duree = (Date.parse(finitLe) - Date.parse(debuteLe)) / 86400000;
  if (duree > DUREE_MAX_JOURS) {
    manquements.push(`Un mandat dure au plus ${DUREE_MAX_JOURS} jours ; il se renouvelle ensuite.`);
  }
  return manquements;
}
