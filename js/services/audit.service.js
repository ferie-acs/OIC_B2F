/**
 * Journal d'audit — **en ajout seul**.
 *
 * Ajout du POC : le système existant n'a aucune piste d'audit unifiée. Aucune
 * fonction de modification ni de suppression n'est développée ici, et le dépôt
 * lève si on l'essaie (`appendOnly` au schéma). C'est un point de la Definition
 * of Done, pas une intention.
 *
 * **Règle sur le contenu** : `details` ne doit porter aucune donnée de
 * classification `contact`, `financier` ou `systeme`. Le journal est lisible par
 * deux rôles, dont la DGTTC à qui les montants sont fermés — un montant glissé
 * dans une phrase contournerait la projection, qui ne relit pas les chaînes.
 *
 * @module services/audit.service
 */

import { identifiant } from '../core/crypto.js';
import { exiger, projeterListe } from '../domain/access.js';
import { depot } from '../repositories/index.js';

/**
 * Références métier — publiques et nécessaires au journal. Neutralisées avant
 * l'analyse, faute de quoi `DT-2026-0003` passerait pour un montant.
 */
const REFERENCE = /\b[A-Z]{2,3}-\d{4}-\d{4}\b/g;

/**
 * Motifs qui trahissent une donnée sensible dans un libellé d'audit :
 * montant en francs, nombre à séparateur de milliers, numéro de téléphone,
 * adresse électronique.
 *
 * Volontairement strict : un faux positif se voit en développement et coûte une
 * reformulation ; un montant servi à un contrôleur ne se voit pas du tout.
 */
const SUSPECT =
  /(\d[\d\s  ]*\s?F\s?CFA)|(\d{1,3}(?:[\s  ]\d{3})+)|(\+\d[\d\s]{7,})|(@[\w.-]+\.\w{2,})/;

/**
 * Inscrit un événement.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} evenement Valeur de `EVENEMENT_AUDIT`.
 * @param {{cibleType?: string, cibleId?: string, details?: string, tx?: any}} [options]
 * @returns {Record<string, any>}
 */
export function journaliser(ctx, evenement, options = {}) {
  const details = options.details ?? '';
  if (SUSPECT.test(details.replace(REFERENCE, ''))) {
    throw new Error(
      `Entrée d'audit refusée : « ${details} » semble contenir un montant, un ` +
        'numéro ou une adresse. Le journal est lisible par la DGTTC, à qui les ' +
        'données financières et les coordonnées sont fermées. Reformulez sans la donnée.',
    );
  }

  return depot('audit').creer(
    {
      id: identifiant('aud'),
      horodatage: new Date().toISOString(),
      auteurUtilisateurId: ctx.utilisateurId ?? null,
      auteurRoleId: ctx.roleId,
      groupementId: ctx.groupementId ?? null,
      evenement,
      cibleType: options.cibleType,
      cibleId: options.cibleId,
      details,
      demo: true,
    },
    { tx: options.tx },
  );
}

/**
 * Lit le journal, du plus récent au plus ancien.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{depuis?: string, jusqua?: string, evenement?: string}} [filtres]
 * @returns {Array<Record<string, any>>}
 */
export function lireJournal(ctx, filtres = {}) {
  exiger(ctx, 'audit.lire', undefined);

  const entrees = depot('audit')
    .brutTous()
    .filter((e) => {
      if (filtres.evenement && e.evenement !== filtres.evenement) return false;
      if (filtres.depuis && new Date(e.horodatage) < new Date(filtres.depuis)) return false;
      if (filtres.jusqua && new Date(e.horodatage) > new Date(filtres.jusqua)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage));

  return projeterListe(ctx, 'audit', entrees);
}
