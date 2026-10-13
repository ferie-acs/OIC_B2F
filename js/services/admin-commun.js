/**
 * Outils partagés par les services d'administration du lot b5 : contrôle des
 * textes saisis, références lisibles, masquage d'une adresse de connexion.
 *
 * Aucun accès au stockage hors des dépôts ; aucune décision d'accès ici.
 *
 * @module services/admin-commun
 */

import { contientCoordonnees } from '../domain/texte.js';
import { depot } from '../repositories/index.js';

/**
 * Refus métier lisible, affichable tel quel.
 */
export class RefusAdministration extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RefusAdministration';
  }
}

/**
 * Texte obligatoire, nettoyé, sans coordonnées. Les motifs sont inscrits au
 * journal d'audit, lisible par la DGTTC : ni téléphone, ni adresse.
 *
 * @param {unknown} valeur
 * @param {string} libelle
 * @param {{min?: number, max?: number, requis?: boolean}} [options]
 * @returns {string}
 */
export function texteControle(valeur, libelle, { min = 5, max = 600, requis = true } = {}) {
  const texte = String(valeur ?? '').trim();
  if (!texte) {
    if (requis) throw new RefusAdministration(`« ${libelle} » est obligatoire.`);
    return '';
  }
  if (texte.length < min) throw new RefusAdministration(`« ${libelle} » est trop court : précisez en quelques mots.`);
  if (texte.length > max) throw new RefusAdministration(`« ${libelle} » dépasse ${max} caractères.`);
  if (contientCoordonnees(texte)) {
    throw new RefusAdministration(
      `« ${libelle} » ne doit contenir ni numéro de téléphone ni adresse électronique : ` +
        'ce texte est conservé au journal, consulté par l’exploitant et par la DGTTC.',
    );
  }
  return texte;
}

/**
 * Référence lisible et unique d'une collection : `PREFIXE-AAAA-NNNN`.
 * @param {string} nomEntite
 * @param {string} prefixe
 * @returns {string}
 */
export function referenceSuivante(nomEntite, prefixe) {
  const annee = new Date().getFullYear();
  const debut = `${prefixe}-${annee}-`;
  const rangs = depot(nomEntite)
    .brutTous()
    .map((o) => String(o.reference ?? ''))
    .filter((r) => r.startsWith(debut))
    .map((r) => Number(r.slice(debut.length)) || 0);
  const suivant = (rangs.length ? Math.max(...rangs) : 0) + 1;
  return `${debut}${String(suivant).padStart(4, '0')}`;
}

/**
 * Adresse de connexion masquée : assez pour reconnaître le compte, jamais
 * l'adresse complète (classification contact).
 * @param {string|undefined} email
 * @returns {string}
 */
export function adresseMasquee(email) {
  const [local, domaine] = String(email ?? '').split('@');
  if (!local || !domaine) return 'Adresse enregistrée';
  return `${local[0]}${'•'.repeat(Math.max(3, Math.min(6, local.length - 1)))}@${domaine}`;
}

/** Horodatage ISO courant. */
export const maintenantIso = () => new Date().toISOString();
