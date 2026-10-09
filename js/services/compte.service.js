/**
 * Compte prépayé — solde, mouvements, crédit manuel.
 *
 * **Le solde n'est jamais stocké** : il vaut la somme des crédits moins celle des
 * débits, recalculée à chaque lecture. Un solde stocké se désynchronise ; un
 * solde calculé ne le peut pas. Le système existant procède déjà ainsi — on le
 * confirme plutôt qu'on ne l'invente.
 *
 * @module services/compte.service
 */

import { identifiant } from '../core/crypto.js';
import { EVENEMENT_AUDIT, MOTIF_OPERATION, SENS_OPERATION } from '../domain/enums.js';
import { exiger, projeterListe } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

/**
 * Solde d'un groupement.
 * @param {string|null|undefined} groupementId
 * @returns {number}
 */
export function soldeDe(groupementId) {
  if (!groupementId) return 0;
  return depot('operation')
    .brutOu((o) => o.groupementId === groupementId)
    .reduce((n, o) => n + (o.sens === SENS_OPERATION.CREDIT ? o.montant : -o.montant), 0);
}

/**
 * Mouvements d'un groupement, du plus récent au plus ancien, avec le solde
 * après chaque opération — la colonne que réclame la spécification B.11.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @returns {Array<Record<string, any>>}
 */
export function mouvementsDe(ctx, groupementId) {
  exiger(ctx, 'compte.lire', { groupementId });

  const chronologiques = depot('operation')
    .brutOu((o) => o.groupementId === groupementId)
    .sort((a, b) => new Date(a.horodatage) - new Date(b.horodatage));

  let cumul = 0;
  const avecSolde = chronologiques.map((o) => {
    cumul += o.sens === SENS_OPERATION.CREDIT ? o.montant : -o.montant;
    return { ...o, soldeApres: cumul };
  });

  return projeterListe(ctx, 'operation', avecSolde.reverse());
}

/**
 * Crédite manuellement un compte. Réservé au concessionnaire — remplace
 * l'intégration de paiement, écartée du périmètre (arbitrage N2).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{groupementId: string, montant: number, referenceEncaissement: string}} entree
 * @returns {Record<string, any>}
 */
export function crediter(ctx, { groupementId, montant, referenceEncaissement }) {
  exiger(ctx, 'compte.crediter', { groupementId });

  if (!(montant > 0)) throw new Error('Le montant à créditer doit être strictement positif.');
  if (!referenceEncaissement) {
    throw new Error(
      "Une référence d'encaissement est obligatoire : elle est la trace du " +
        'paiement reçu hors de la plateforme.',
    );
  }

  const stockage = stockageInterne();
  return stockage.transaction((tx) => {
    const operation = depot('operation').creer(
      {
        id: identifiant('ope'),
        groupementId,
        sens: SENS_OPERATION.CREDIT,
        montant,
        motif: MOTIF_OPERATION.RECHARGEMENT,
        libelle: `Rechargement — ${referenceEncaissement}`,
        referenceEncaissement,
        horodatage: new Date().toISOString(),
        auteurUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );

    journaliser(ctx, EVENEMENT_AUDIT.COMPTE_CREDITE, {
      cibleType: 'groupement',
      cibleId: groupementId,
      // Pas de montant : le journal est lisible par la DGTTC.
      details: `Compte crédité — référence ${referenceEncaissement}.`,
      tx,
    });

    return operation;
  });
}

/**
 * Le solde couvre-t-il les frais annoncés ? Sert au tableau de bord, qui affiche
 * « suffisant » ou « insuffisant pour une validation » (spécification B.1).
 *
 * @param {string} groupementId
 * @param {number} frais
 * @returns {{solde: number, suffisant: boolean, manque: number}}
 */
export function couverture(groupementId, frais) {
  const solde = soldeDe(groupementId);
  return { solde, suffisant: solde >= frais, manque: Math.max(0, frais - solde) };
}
