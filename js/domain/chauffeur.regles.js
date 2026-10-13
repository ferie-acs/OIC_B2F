/**
 * Règles du chauffeur — fiche complète, aptitude à une mission (lot b3).
 *
 * Module **pur** : aucune lecture de stockage. Le service de flotte lui passe le
 * chauffeur, le véhicule et le libellé de ses essieux ; il rend une décision
 * motivée, rédigée pour l'écran.
 *
 * ## Catégories de permis exigées par un véhicule — hypothèse du POC
 *
 * Le système existant enregistre les catégories sans jamais les confronter au
 * véhicule. Le POC applique la règle courante, **à confirmer par l'OIC** :
 * - PTAC jusqu'à 3,5 t : catégorie B (ou C, qui la couvre) ;
 * - PTAC au-delà de 3,5 t : catégorie C ;
 * - ensemble de quatre essieux ou plus (tracteur et semi-remorque) : C et E.
 *
 * @module domain/chauffeur.regles
 */

import { CATEGORIE_PERMIS, labelOf } from './enums.js';

/** Âge minimal pour conduire un poids lourd retenu par le POC. */
export const AGE_MINIMAL = 18;

/**
 * Une date civile `AAAA-MM-JJ` vaut jusqu'à la fin de son jour, heure locale.
 * @param {string|null|undefined} valeur
 * @returns {number} Horodatage, ou `NaN` si la date est invalide.
 */
export function finDeJour(valeur) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valeur ?? ''))) return NaN;
  const d = new Date(`${valeur}T23:59:59.999`);
  const [a, m, j] = valeur.split('-').map(Number);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j ? d.getTime() : NaN;
}

/**
 * Une pièce datée est-elle échue ?
 * @param {string|null|undefined} echeance
 * @param {number} [maintenant]
 * @returns {boolean} `false` si la date est absente : une échéance inconnue
 *   n'est pas une échéance dépassée — elle est signalée comme « à renseigner ».
 */
export function estEchue(echeance, maintenant = Date.now()) {
  const t = finDeJour(echeance);
  return Number.isFinite(t) && t < maintenant;
}

/**
 * Âge révolu à une date.
 * @param {string} dateNaissance
 * @param {Date} [maintenant]
 * @returns {number} `NaN` si la date est invalide.
 */
export function ageA(dateNaissance, maintenant = new Date()) {
  if (!Number.isFinite(finDeJour(dateNaissance))) return NaN;
  const [a, m, j] = dateNaissance.split('-').map(Number);
  let age = maintenant.getFullYear() - a;
  const anniversairePasse =
    maintenant.getMonth() + 1 > m || (maintenant.getMonth() + 1 === m && maintenant.getDate() >= j);
  if (!anniversairePasse) age -= 1;
  return age;
}

/**
 * Catégories exigées par un véhicule.
 * @param {{ptacT?: number}} vehicule
 * @param {string|number|null} [essieux] Nombre d'essieux (code ou libellé du référentiel).
 * @returns {string[]}
 */
export function categoriesRequises(vehicule, essieux = null) {
  const ptac = Number(vehicule?.ptacT);
  const nbEssieux = Number.parseInt(String(essieux ?? ''), 10);
  if (Number.isFinite(ptac) && ptac <= 3.5) return [CATEGORIE_PERMIS.B];
  const requises = [CATEGORIE_PERMIS.C];
  if (Number.isFinite(nbEssieux) && nbEssieux >= 4) requises.push(CATEGORIE_PERMIS.E);
  return requises;
}

/**
 * Les catégories d'un chauffeur couvrent-elles le véhicule ?
 * La catégorie C couvre la B.
 * @param {string[]|null|undefined} categories
 * @param {{ptacT?: number}} vehicule
 * @param {string|number|null} [essieux]
 * @returns {{connues: boolean, compatible: boolean, requises: string[], manquantes: string[]}}
 */
export function compatibilitePermis(categories, vehicule, essieux = null) {
  const requises = categoriesRequises(vehicule, essieux);
  const detenues = new Set(Array.isArray(categories) ? categories : []);
  if (detenues.has(CATEGORIE_PERMIS.C)) detenues.add(CATEGORIE_PERMIS.B);
  const connues = detenues.size > 0;
  const manquantes = requises.filter((c) => !detenues.has(c));
  return { connues, compatible: connues && manquantes.length === 0, requises, manquantes };
}

/**
 * Alertes de la fiche d'un chauffeur, pour l'écran. Rien n'est bloqué ici : la
 * fiche reste enregistrable, c'est l'affectation à une mission qui est refusée.
 * @param {Record<string, any>} c
 * @param {number} [maintenant]
 * @returns {string[]}
 */
export function alertesFiche(c, maintenant = Date.now()) {
  const alertes = [];
  if (c.actif === false) alertes.push('Chauffeur retiré de l’équipe');
  if (estEchue(c.permisEcheance, maintenant)) alertes.push('Permis échu');
  if (estEchue(c.pieceExpireLe, maintenant)) alertes.push('Pièce d’identité expirée');
  if (!Array.isArray(c.permisCategories) || c.permisCategories.length === 0) {
    alertes.push('Catégories de permis à renseigner');
  }
  if (!c.pieceType || !c.pieceNumero || !c.nationalite || !c.dateNaissance) {
    alertes.push('Fiche d’identité incomplète');
  }
  return alertes;
}

/**
 * Le chauffeur peut-il être désigné pour une nouvelle mission sur ce véhicule ?
 *
 * Refus motivé : chauffeur retiré, permis échu, pièce d'identité expirée,
 * catégorie de permis incompatible. Des catégories **non renseignées** (fiche
 * antérieure au lot b3) ne bloquent pas — elles sont signalées sur la fiche et
 * exigées à la prochaine modification.
 *
 * @param {Record<string, any>} c
 * @param {{ptacT?: number}|null} vehicule
 * @param {string|number|null} [essieux]
 * @param {number} [maintenant]
 * @returns {string|null} Motif du refus, ou `null`.
 */
export function motifInaptitude(c, vehicule = null, essieux = null, maintenant = Date.now()) {
  if (!c) return 'Chauffeur introuvable.';
  if (c.actif === false) {
    return 'Ce chauffeur a été retiré de votre équipe : il ne peut plus être choisi pour une nouvelle mission. Réactivez-le s’il revient.';
  }
  if (estEchue(c.permisEcheance, maintenant)) {
    return 'Le permis de ce chauffeur est échu : il ne peut pas être choisi pour une mission tant qu’il n’est pas renouvelé.';
  }
  if (estEchue(c.pieceExpireLe, maintenant)) {
    return 'La pièce d’identité de ce chauffeur est expirée : mettez sa fiche à jour avant de le choisir.';
  }
  if (vehicule) {
    const compat = compatibilitePermis(c.permisCategories, vehicule, essieux);
    if (compat.connues && !compat.compatible) {
      return `Le permis de ce chauffeur ne couvre pas ce véhicule : catégorie${compat.manquantes.length > 1 ? 's' : ''} ` +
        `${compat.manquantes.map((x) => labelOf(x)).join(' et ')} exigée${compat.manquantes.length > 1 ? 's' : ''}.`;
    }
  }
  return null;
}
