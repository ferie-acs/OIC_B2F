/**
 * Abonnement — échéance, formules, prolongation.
 *
 * Lot b4. **`prolongerAbonnement()` est la seule fonction qui ouvre une période
 * d'abonnement.** Elle sert au réabonnement en ligne, à l'encaissement validé au
 * guichet, et doit servir à l'activation initiale (lot b1) : un abonnement absent
 * ou expiré repart du jour, un abonnement en cours est prolongé à partir du
 * lendemain de son échéance.
 *
 * Chaque prolongation **crée une nouvelle période** au lieu de repousser
 * l'échéance de l'ancienne : l'historique demandé par l'inventaire (libellé,
 * dates, « effectué par ») en découle, et une période payée garde pour toujours
 * le montant et la durée du jour où elle l'a été.
 *
 * @module services/abonnement.service
 */

import { identifiant } from '../core/crypto.js';
import { ETAT_ABONNEMENT, EVENEMENT_AUDIT, TYPE_GROUPEMENT } from '../domain/enums.js';
import { ETAT_REVISION, aujourdhui, joursAvant, periodeProlongation } from '../domain/finances.js';
import { exiger, projeter } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { abonnementDe } from './auth.service.js';
import { notifier } from './notification.service.js';
import { appliquerRevisionsEchues, dateFr, estFormule } from './tarif.service.js';

/** Échéance proche : le réabonnement est mis en avant à partir de ce délai. */
export const ALERTE_ECHEANCE_JOURS = 30;

/**
 * Formules d'abonnement proposées à la souscription, au prix du jour.
 * Ouvert sous `abonnement.lire`, qui reste accessible à un abonnement expiré.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function formulesAbonnement(ctx) {
  exiger(ctx, 'abonnement.lire');
  appliquerRevisionsEchues();
  const programmees = depot('revisionTarif').brutOu((r) => r.etat === ETAT_REVISION.PROGRAMMEE);
  return depot('tarif')
    .brutOu((t) => t.actif && estFormule(t))
    .map((t) => {
      const r = programmees.find((x) => x.tarifId === t.id);
      return {
        ...projeter(ctx, 'tarif', t),
        prochainMontant: r ? r.montantApres : null,
        prochaineDuree: r ? (r.dureeMoisApres ?? null) : null,
        prochainEffet: r ? r.effetLe : null,
      };
    });
}

/**
 * Situation d'abonnement d'un groupement : échéance et historique des périodes.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} [groupementId]
 */
export function situationAbonnement(ctx, groupementId = ctx.groupementId) {
  exiger(ctx, 'abonnement.lire', { groupementId });
  const courant = abonnementDe(groupementId);
  const periodes = depot('abonnement')
    .brutOu((a) => a.groupementId === groupementId)
    .sort((a, b) => b.finitLe.localeCompare(a.finitLe))
    .map((a) => {
      const paiement = depot('paiement').brutOu((p) => p.abonnementId === a.id)[0];
      const tarif = a.tarifId ? depot('tarif').brutParId(a.tarifId) : null;
      return {
        ...projeter(ctx, 'abonnement', a),
        formule: tarif?.libelle ?? 'Abonnement à la plateforme',
        prolongeParUtilisateurId: a.prolongeParUtilisateurId ?? null,
        paiement: paiement ? projeter(ctx, 'paiement', paiement) : null,
      };
    });
  const jours = joursAvant(courant.finitLe ? String(courant.finitLe).slice(0, 10) : null);
  return {
    actif: courant.actif,
    finitLe: courant.finitLe,
    joursRestants: jours,
    procheEcheance: courant.actif && jours !== null && jours <= ALERTE_ECHEANCE_JOURS,
    periodes,
  };
}

/**
 * Période qu'ouvrirait une prolongation aujourd'hui, au prix du jour.
 * @param {string} groupementId
 * @param {string} tarifId
 * @param {string} [jour]
 */
export function apercuProlongation(groupementId, tarifId, jour = aujourdhui()) {
  const t = tarifFormule(tarifId);
  const fin = abonnementDe(groupementId).finitLe;
  return {
    ...periodeProlongation({ finActuelle: fin ? String(fin).slice(0, 10) : null, dureeMois: t.dureeMois, jour }),
    montant: t.montant,
    dureeMois: t.dureeMois,
    devise: t.devise,
    libelle: t.libelle,
  };
}

/**
 * Tarif actif portant une durée — sinon, ce n'est pas une formule d'abonnement.
 * @param {string} tarifId
 */
export function tarifFormule(tarifId) {
  const t = depot('tarif').brutParId(tarifId);
  if (!t || !estFormule(t)) throw new Error('Choisissez une formule d’abonnement du catalogue.');
  if (!t.actif) throw new Error('Cette formule n’est plus proposée.');
  return t;
}

/**
 * **Ouvre une période d'abonnement.** Fonction de service réutilisable — par le
 * paiement en ligne, par la caisse et par l'activation initiale (lot b1).
 *
 * Le montant et la durée sont ceux du tarif au jour de l'appel, sauf s'ils sont
 * fournis : la caisse passe ceux du jour de la **saisie**, pour qu'une
 * modification de tarif survenue entre la saisie et la validation ne change pas
 * ce que le client a payé.
 *
 * @param {import('../domain/access.js').Contexte} ctx Contexte détenant `abonnement.prolonger`
 *   sur ce groupement.
 * @param {{groupementId: string, tarifId: string, montant?: number, dureeMois?: number,
 *   reference?: string, jour?: string}} demande `reference` : numéro du reçu, cité au
 *   journal et dans la notification.
 * @param {{tx?: any}} [options] `tx` : joint la prolongation à la transaction du paiement.
 * @returns {Record<string, any>} La nouvelle période.
 */
export function prolongerAbonnement(ctx, demande, options = {}) {
  const { groupementId, tarifId, reference = null, jour = aujourdhui() } = demande;
  exiger(ctx, 'abonnement.prolonger', { groupementId });
  const g = depot('groupement').brutParId(groupementId);
  if (!g) throw new Error('Groupement introuvable.');
  if (g.type === TYPE_GROUPEMENT.INSTITUTION) {
    throw new Error('Une institution n’est pas soumise à abonnement.');
  }
  const t = tarifFormule(tarifId);
  const dureeMois = demande.dureeMois ?? t.dureeMois;
  const montant = demande.montant ?? t.montant;
  if (!(Number.isInteger(montant) && montant > 0)) throw new Error('Montant d’abonnement invalide.');

  const travail = (tx) => {
    tx.marquer(`abonnements:${groupementId}`);
    const fins = tx
      .lire('abonnements')
      .filter((a) => a.groupementId === groupementId)
      .map((a) => String(a.finitLe).slice(0, 10))
      .sort();
    const finActuelle = fins.length ? fins[fins.length - 1] : null;
    const periode = periodeProlongation({ finActuelle, dureeMois, jour });

    const abonnement = depot('abonnement').creer(
      {
        id: identifiant('abo'),
        groupementId,
        montant,
        devise: t.devise,
        debuteLe: periode.debuteLe,
        finitLe: periode.finitLe,
        etat: ETAT_ABONNEMENT.ACTIF,
        creeLe: new Date().toISOString(),
        demo: true,
        tarifId: t.id,
        dureeMois,
        prolongeParUtilisateurId: ctx.utilisateurId ?? undefined,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.ABONNEMENT_PROLONGE, {
      cibleType: 'groupement',
      cibleId: groupementId,
      details:
        `Abonnement prolongé du ${dateFr(periode.debuteLe)} au ${dateFr(periode.finitLe)} — ` +
        `formule « ${t.libelle} »${reference ? `, reçu ${reference}` : ''}.`,
      tx,
    });
    notifier(groupementId, EVENEMENT_AUDIT.ABONNEMENT_PROLONGE, {
      code: 'abonnement.prolonge',
      params: { fin: dateFr(periode.finitLe), reference: reference ?? '' },
      cibleType: 'groupement',
      cibleId: groupementId,
      tx,
    });
    return abonnement;
  };
  return options.tx ? travail(options.tx) : stockageInterne().transaction(travail);
}
