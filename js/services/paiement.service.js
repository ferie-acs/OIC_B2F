/**
 * Paiements en ligne de l'entreprise — **simulés** — et lecture des reçus.
 *
 * Lot b4. Deux démarches de l'inventaire (paiement CinetPay du système existant) :
 * - **réabonnement** : formule du catalogue, payée par mobile money, par carte ou
 *   par débit du compte prépayé ;
 * - **rechargement** : nombre de mises en relation × frais unitaire, payé par
 *   mobile money.
 *
 * Aucun opérateur n'est appelé. La simulation est rendue visible à l'écran et la
 * référence de transaction est fabriquée par `referenceTransactionSimulee()`.
 * **Un paiement en ligne réussi crédite directement** : c'est la transaction de
 * l'opérateur qui fait foi, il n'y a pas de saisie humaine à faire contrôler par
 * une seconde personne — contrairement au guichet (`caisse.service.js`).
 *
 * @module services/paiement.service
 */

import { identifiant } from '../core/crypto.js';
import {
  CODE_TARIF,
  ETAT_CREDIT,
  EVENEMENT_AUDIT,
  MOTIF_OPERATION,
  SENS_OPERATION,
  TYPE_GROUPEMENT,
} from '../domain/enums.js';
import {
  CANAL_PAIEMENT,
  ETAT_PAIEMENT,
  MODE_PAIEMENT,
  MODES_PAR_CANAL,
  OBJET_PAIEMENT,
  OPERATEUR_MOBILE,
  libelleFinance,
  normaliserNumeroMobile,
  normaliserReference,
  numeroSuivant,
} from '../domain/finances.js';
import { exiger, projeter } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { referenceDejaUtilisee } from './compte.service.js';
import { notifier } from './notification.service.js';
import { prolongerAbonnement, tarifFormule } from './abonnement.service.js';
import { appliquerRevisionsEchues, dateFr } from './tarif.service.js';

/** Plafond d'un rechargement en ligne, en nombre de mises en relation. */
export const RECHARGEMENT_MAX_OPERATIONS = 50;

/* ------------------------------------------------------------------ *
 * Outils partagés avec la caisse
 * ------------------------------------------------------------------ */

/** Prochain numéro de reçu, lu dans la transaction. */
export const numeroRecu = (tx, maintenant = new Date()) =>
  numeroSuivant('RC', tx.lire('paiements').map((p) => p.numero), maintenant);

/** Solde d'un groupement, lu dans la transaction (jamais stocké). */
export const soldeDansTx = (tx, groupementId) =>
  tx
    .lire('operations')
    .filter((o) => o.groupementId === groupementId)
    .reduce((n, o) => n + (o.sens === SENS_OPERATION.CREDIT ? o.montant : -o.montant), 0);

/**
 * Une référence de transaction ou de pièce a-t-elle déjà servi ? Comparée sans
 * casse ni séparateurs, contre les paiements non rejetés, les crédits et les
 * mouvements de compte : un même paiement ne crédite qu'une fois.
 * @param {string} reference
 */
export function referencePaiementUtilisee(reference) {
  const cle = normaliserReference(reference);
  if (!cle) return false;
  return (
    referenceDejaUtilisee(reference) ||
    depot('paiement').brutOu(
      (p) => p.etat !== ETAT_PAIEMENT.REJETE && p.referenceTransaction && normaliserReference(p.referenceTransaction) === cle,
    ).length > 0
  );
}

/**
 * État effectif d'un paiement. Un rechargement au guichet passe par un crédit en
 * quatre yeux, qui peut être validé depuis l'écran « Crédits à valider » : son
 * état fait alors foi.
 * @param {Record<string, any>} p Paiement brut.
 */
export function etatEffectif(p) {
  if (p.etat !== ETAT_PAIEMENT.EN_ATTENTE || !p.creditId) return p.etat;
  const c = depot('credit').brutParId(p.creditId);
  if (c?.etat === ETAT_CREDIT.CREDITE) return ETAT_PAIEMENT.ENCAISSE;
  if (c?.etat === ETAT_CREDIT.REJETE) return ETAT_PAIEMENT.REJETE;
  return p.etat;
}

/** Frais unitaire de mise en relation applicable au groupement. */
export function fraisUnitaire(groupementId) {
  const g = depot('groupement').brutParId(groupementId);
  const code = g?.type === TYPE_GROUPEMENT.TRANSPORTEUR ? CODE_TARIF.FRAIS_TRANSPORTEUR : CODE_TARIF.FRAIS_AFFRETEUR;
  return depot('tarif').brutParId(code)?.montant ?? null;
}

/* ------------------------------------------------------------------ *
 * Contrôles de saisie d'un paiement en ligne
 * ------------------------------------------------------------------ */

function controlerMoyen({ mode, operateur, numero, referenceTransaction }) {
  if (!MODES_PAR_CANAL[CANAL_PAIEMENT.EN_LIGNE].includes(mode)) {
    throw new Error('Choisissez un mode de paiement : mobile money, carte bancaire ou débit du compte.');
  }
  const sortie = { mode, operateur: undefined, numeroPayeur: undefined, referenceTransaction: undefined };
  if (mode === MODE_PAIEMENT.DEBIT_COMPTE) return sortie;
  if (mode === MODE_PAIEMENT.MOBILE_MONEY) {
    if (!Object.values(OPERATEUR_MOBILE).includes(operateur)) throw new Error('Choisissez l’opérateur de mobile money.');
    const n = normaliserNumeroMobile(numero);
    if (!n) throw new Error('Le numéro de mobile money doit compter dix chiffres et commencer par 01, 05 ou 07.');
    sortie.operateur = operateur;
    sortie.numeroPayeur = n;
  }
  const ref = String(referenceTransaction ?? '').trim();
  if (!ref) throw new Error('La transaction n’a pas été confirmée par l’opérateur : aucune référence reçue.');
  if (referencePaiementUtilisee(ref)) {
    throw new Error(`La transaction ${ref} a déjà été enregistrée : un paiement ne compte qu’une fois.`);
  }
  sortie.referenceTransaction = ref;
  return sortie;
}

/* ------------------------------------------------------------------ *
 * Réabonnement en ligne
 * ------------------------------------------------------------------ */

/**
 * Réabonnement payé en ligne par l'entreprise elle-même.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{tarifId: string, mode: string, operateur?: string, numero?: string,
 *   referenceTransaction?: string}} demande
 * @returns {{paiement: Record<string, any>, abonnement: Record<string, any>}}
 */
export function renouvelerEnLigne(ctx, demande) {
  const groupementId = ctx.groupementId;
  exiger(ctx, 'abonnement.prolonger', { groupementId });
  appliquerRevisionsEchues();
  const t = tarifFormule(demande.tarifId);
  const moyen = controlerMoyen(demande);
  const maintenant = new Date().toISOString();

  return stockageInterne().transaction((tx) => {
    const numero = numeroRecu(tx);
    let operationId;
    if (moyen.mode === MODE_PAIEMENT.DEBIT_COMPTE) {
      tx.marquer(`operations:${groupementId}`);
      const solde = soldeDansTx(tx, groupementId);
      if (solde < t.montant) {
        throw new Error(
          `Solde insuffisant pour payer l’abonnement par débit du compte : il manque ` +
            `${(t.montant - solde).toLocaleString('fr-FR')} F CFA. Payez par mobile money ou par carte, ou rechargez d’abord le compte.`,
        );
      }
      operationId = depot('operation').creer(
        {
          id: identifiant('ope'),
          groupementId,
          sens: SENS_OPERATION.DEBIT,
          montant: t.montant,
          motif: MOTIF_OPERATION.ABONNEMENT,
          libelle: `Abonnement — reçu ${numero}`,
          horodatage: maintenant,
          auteurUtilisateurId: ctx.utilisateurId,
          demo: true,
        },
        { tx },
      ).id;
    }
    const abonnement = prolongerAbonnement(
      ctx,
      { groupementId, tarifId: t.id, montant: t.montant, dureeMois: t.dureeMois, reference: numero },
      { tx },
    );
    const paiement = depot('paiement').creer(
      {
        id: identifiant('pai'),
        numero,
        groupementId,
        objet: OBJET_PAIEMENT.ABONNEMENT,
        canal: CANAL_PAIEMENT.EN_LIGNE,
        ...moyen,
        montant: t.montant,
        devise: t.devise,
        detail: `${t.libelle} — du ${dateFr(abonnement.debuteLe)} au ${dateFr(abonnement.finitLe)}`,
        tarifId: t.id,
        dureeMois: t.dureeMois,
        abonnementId: abonnement.id,
        operationId,
        etat: ETAT_PAIEMENT.ENCAISSE,
        saisiLe: maintenant,
        saisiParUtilisateurId: ctx.utilisateurId,
        valideLe: maintenant,
        impressions: 0,
        demo: true,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.PAIEMENT_EN_LIGNE, {
      cibleType: 'paiement',
      cibleId: paiement.id,
      details: `Paiement en ligne ${numero} — réabonnement, ${libelleFinance(moyen.mode).toLowerCase()} (simulé).`,
      tx,
    });
    return { paiement, abonnement };
  });
}

/* ------------------------------------------------------------------ *
 * Rechargement en ligne
 * ------------------------------------------------------------------ */

/**
 * Rechargement du compte prépayé par mobile money : nombre de mises en relation
 * à provisionner × frais unitaire du catalogue (inventaire, `rechargement.php`).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{nombre: number, operateur: string, numero: string, referenceTransaction: string}} demande
 * @returns {{paiement: Record<string, any>, operation: Record<string, any>}}
 */
export function rechargerEnLigne(ctx, demande) {
  const groupementId = ctx.groupementId;
  exiger(ctx, 'compte.recharger', { groupementId });
  appliquerRevisionsEchues();
  const nombre = Number(demande.nombre);
  if (!(Number.isInteger(nombre) && nombre >= 1 && nombre <= RECHARGEMENT_MAX_OPERATIONS)) {
    throw new Error(`Indiquez un nombre de mises en relation entre 1 et ${RECHARGEMENT_MAX_OPERATIONS}.`);
  }
  const unitaire = fraisUnitaire(groupementId);
  if (!unitaire) throw new Error('Le tarif des frais de mise en relation est introuvable au catalogue.');
  const montant = nombre * unitaire;
  const moyen = controlerMoyen({ ...demande, mode: MODE_PAIEMENT.MOBILE_MONEY });
  const maintenant = new Date().toISOString();

  return stockageInterne().transaction((tx) => {
    tx.marquer(`operations:${groupementId}`);
    const numero = numeroRecu(tx);
    const operation = depot('operation').creer(
      {
        id: identifiant('ope'),
        groupementId,
        sens: SENS_OPERATION.CREDIT,
        montant,
        motif: MOTIF_OPERATION.RECHARGEMENT,
        libelle: `Rechargement mobile money — reçu ${numero}`,
        referenceEncaissement: moyen.referenceTransaction,
        horodatage: maintenant,
        auteurUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );
    const paiement = depot('paiement').creer(
      {
        id: identifiant('pai'),
        numero,
        groupementId,
        objet: OBJET_PAIEMENT.RECHARGEMENT,
        canal: CANAL_PAIEMENT.EN_LIGNE,
        ...moyen,
        montant,
        devise: 'XOF',
        detail: `Rechargement — ${nombre} mise${nombre > 1 ? 's' : ''} en relation`,
        operationId: operation.id,
        etat: ETAT_PAIEMENT.ENCAISSE,
        saisiLe: maintenant,
        saisiParUtilisateurId: ctx.utilisateurId,
        valideLe: maintenant,
        impressions: 0,
        demo: true,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.PAIEMENT_EN_LIGNE, {
      cibleType: 'paiement',
      cibleId: paiement.id,
      details:
        `Paiement en ligne ${numero} — rechargement du compte par mobile money (simulé). ` +
        'Crédit direct : la transaction de l’opérateur fait foi.',
      tx,
    });
    notifier(groupementId, EVENEMENT_AUDIT.COMPTE_CREDITE, {
      code: 'compte.credite',
      params: { reference: numero },
      cibleType: 'groupement',
      cibleId: groupementId,
      tx,
    });
    return { paiement, operation };
  });
}

/**
 * Trace un paiement en ligne non abouti (refus simulé du payeur). Rien n'est
 * débité ni crédité ; l'entreprise et l'exploitant savent qu'une tentative a eu lieu.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{objet: string, mode: string}} tentative
 */
export function signalerEchec(ctx, { objet, mode }) {
  const droit = objet === OBJET_PAIEMENT.ABONNEMENT ? 'abonnement.prolonger' : 'compte.recharger';
  exiger(ctx, droit, { groupementId: ctx.groupementId });
  return stockageInterne().transaction((tx) => {
    journaliser(ctx, EVENEMENT_AUDIT.PAIEMENT_REFUSE, {
      cibleType: 'groupement',
      cibleId: ctx.groupementId,
      details: `Paiement en ligne non abouti — ${libelleFinance(objet).toLowerCase()}, ${libelleFinance(mode).toLowerCase()} (simulation). Rien n’a été débité ni crédité.`,
      tx,
    });
    notifier(ctx.groupementId, EVENEMENT_AUDIT.PAIEMENT_REFUSE, {
      code: 'paiement.refuse',
      params: { objet: libelleFinance(objet) },
      cibleType: 'groupement',
      cibleId: ctx.groupementId,
      tx,
    });
  });
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

/**
 * Paiements de l'entreprise de l'utilisateur, des plus récents aux plus anciens.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function mesPaiements(ctx) {
  const bruts = new Map(depot('paiement').brutTous().map((p) => [p.id, p]));
  return depot('paiement')
    .lisiblesPar(ctx, 'compte.lire', (p) => p.groupementId === ctx.groupementId)
    .map((p) => ({ ...p, etat: etatEffectif(bruts.get(p.id)) }))
    .sort((a, b) => String(b.saisiLe).localeCompare(String(a.saisiLe)));
}

/**
 * Un paiement et tout ce que son reçu affiche, **projeté** pour le lecteur.
 * L'entreprise lit les siens (`compte.lire`) ; l'exploitant, ceux de tous
 * (`caisse.lire`). Le numéro du payeur, coordonnée, n'est pas servi à l'exploitant.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} paiementId
 */
export function paiementDetaille(ctx, paiementId) {
  const p = depot('paiement').brutParId(paiementId);
  if (!p) throw new Error('Paiement introuvable.');
  if (p.groupementId === ctx.groupementId) exiger(ctx, 'compte.lire', { groupementId: p.groupementId });
  else exiger(ctx, 'caisse.lire', { groupementId: p.groupementId });

  const g = depot('groupement').brutParId(p.groupementId);
  const client = g ? projeter(ctx, 'groupement', g) : {};
  const abonnement = p.abonnementId ? depot('abonnement').brutParId(p.abonnementId) : null;
  const contentieux = p.contentieuxId ? depot('contentieux').brutParId(p.contentieuxId) : null;
  const nom = (id) => {
    const u = id ? depot('utilisateur').brutParId(id) : null;
    return u ? `${u.prenom ?? ''} ${u.nom}`.trim() : null;
  };
  return {
    ...projeter(ctx, 'paiement', p),
    etat: etatEffectif(p),
    client: {
      raisonSociale: client.raisonSociale ?? null,
      compteContribuable: client.compteContribuable ?? null,
      rccm: client.rccm ?? null,
    },
    periode: abonnement ? { debuteLe: abonnement.debuteLe, finitLe: abonnement.finitLe } : null,
    contentieuxReference: contentieux?.reference ?? null,
    saisiPar: nom(p.saisiParUtilisateurId),
    validePar: nom(p.valideParUtilisateurId),
  };
}

/**
 * Note l'édition d'un reçu : le premier est l'original, les suivants des
 * duplicatas numérotés. Journalisé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} paiementId
 * @returns {number} Rang de l'édition (1 = original).
 */
export function noterEditionRecu(ctx, paiementId) {
  const d = paiementDetaille(ctx, paiementId); // contrôle d'accès
  return stockageInterne().transaction((tx) => {
    tx.marquer(`paiements:${paiementId}`);
    const courant = tx.lire('paiements').find((x) => x.id === paiementId);
    const rang = (courant.impressions ?? 0) + 1;
    depot('paiement').modifier(paiementId, { impressions: rang }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.RECU_EDITE, {
      cibleType: 'paiement',
      cibleId: paiementId,
      details: rang === 1 ? `Reçu ${d.numero} édité (original).` : `Reçu ${d.numero} réédité — duplicata n° ${rang - 1}.`,
      tx,
    });
    return rang;
  });
}

/** Rang de la prochaine édition, sans l'enregistrer. */
export function rangEditionSuivante(paiementId) {
  return (depot('paiement').brutParId(paiementId)?.impressions ?? 0) + 1;
}
