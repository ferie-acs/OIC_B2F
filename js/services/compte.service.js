/**
 * Compte prépayé — solde, mouvements, crédit en deux temps (saisie puis validation).
 *
 * **Le solde n'est jamais stocké** : il vaut la somme des crédits moins celle des
 * débits, recalculée à chaque lecture. Un solde stocké se désynchronise ; un
 * solde calculé ne le peut pas. Le système existant procède déjà ainsi — on le
 * confirme plutôt qu'on ne l'invente.
 *
 * @module services/compte.service
 */

import { identifiant } from '../core/crypto.js';
import { ETAT_CREDIT, EVENEMENT_AUDIT, MOTIF_OPERATION, SENS_OPERATION } from '../domain/enums.js';
import { exiger, projeterListe } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { notifier } from './notification.service.js';

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

/* ------------------------------------------------------------------ *
 * Crédit en deux temps — correctif anti-fraude n° 5 (13/10/2026)
 * ------------------------------------------------------------------ *
 *
 * Une seule personne pouvait créditer un compte, sur une référence
 * d'encaissement que personne ne rapprochait d'un paiement réel : la porte
 * ouverte à une fraude interne — créditer le compte d'un proche sans
 * encaissement. Le crédit se fait désormais en deux temps, par deux
 * personnes différentes :
 *
 * 1. **saisie** — un agent du concessionnaire enregistre l'encaissement ; le
 *    solde ne bouge pas ;
 * 2. **validation** — une autre personne, après rapprochement avec
 *    l'encaissement réel, valide : le mouvement de compte est alors créé.
 *
 * La règle « validateur ≠ auteur de la saisie » est vérifiée ici ET portée par
 * l'invariant `quatreYeux` du schéma. Une même référence d'encaissement ne peut
 * servir qu'une fois.
 * ------------------------------------------------------------------ */

/**
 * La référence d'encaissement a-t-elle déjà servi ?
 * @param {string} referenceEncaissement
 * @returns {boolean}
 */
export function referenceDejaUtilisee(referenceEncaissement) {
  const cle = normaliserReference(referenceEncaissement);
  const parCredit = depot('credit').brutOu(
    (c) => c.etat !== ETAT_CREDIT.REJETE && normaliserReference(c.referenceEncaissement) === cle,
  );
  const parOperation = depot('operation').brutOu(
    (o) => o.referenceEncaissement && normaliserReference(o.referenceEncaissement) === cle,
  );
  return parCredit.length > 0 || parOperation.length > 0;
}

/** Référence comparée sans casse, accents ni séparateurs : « ENC.DEMO_1004 » = « ENC-DEMO-1004 ». */
const normaliserReference = (r) =>
  String(r ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Saisit un crédit. **Sans effet sur le solde** tant qu'une autre personne ne
 * l'a pas validé.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{groupementId: string, montant: number, referenceEncaissement: string}} entree
 * @param {{tx?: any}} [options] Lot b4 : `tx` joint la saisie à la transaction
 *   d'un encaissement au guichet (reçu et crédit écrits ensemble, ou pas du tout).
 * @returns {Record<string, any>} Le crédit saisi, à l'état `en_attente`.
 */
export function saisirCredit(ctx, { groupementId, montant, referenceEncaissement }, options = {}) {
  exiger(ctx, 'compte.crediter', { groupementId });

  if (!depot('groupement').brutParId(groupementId)) throw new Error('Groupement introuvable.');
  if (!(Number.isInteger(montant) && montant > 0)) {
    throw new Error('Le montant à créditer doit être un nombre entier de francs, strictement positif.');
  }
  const reference = String(referenceEncaissement ?? '').trim();
  if (!reference) {
    throw new Error(
      "Une référence d'encaissement est obligatoire : elle est la trace du " +
        'paiement reçu hors de la plateforme.',
    );
  }
  if (referenceDejaUtilisee(reference)) {
    throw new Error(
      `La référence d’encaissement « ${reference} » a déjà servi. Un encaissement ` +
        'ne crédite qu’une fois : vérifiez la pièce ou saisissez sa référence exacte.',
    );
  }

  return executer(options, (tx) => {
    const credit = depot('credit').creer(
      {
        id: identifiant('cre'),
        reference: referenceCredit(),
        groupementId,
        montant,
        referenceEncaissement: reference,
        etat: ETAT_CREDIT.EN_ATTENTE,
        saisiLe: new Date().toISOString(),
        saisiParUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.CREDIT_SAISI, {
      cibleType: 'groupement',
      cibleId: groupementId,
      // Pas de montant : le journal est lisible par la DGTTC.
      details: `Crédit ${credit.reference} saisi — encaissement ${reference}, en attente de validation.`,
      tx,
    });
    return credit;
  });
}

/**
 * Valide un crédit saisi : **seul moment où le solde augmente**.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} creditId
 * @param {{rapprochementConfirme: boolean}} confirmation Le validateur atteste
 *   avoir rapproché la saisie de l'encaissement réel. Sans cette attestation, rien.
 * @param {{tx?: any}} [options] Lot b4 : jointure à la transaction de la caisse.
 * @returns {{credit: Record<string, any>, operation: Record<string, any>}}
 */
export function validerCredit(ctx, creditId, { rapprochementConfirme } = { rapprochementConfirme: false }, options = {}) {
  const c = creditAttendu(creditId);
  exiger(ctx, 'compte.valider_credit', { groupementId: c.groupementId });

  if (c.saisiParUtilisateurId === ctx.utilisateurId) {
    throw new Error(
      'Vous avez saisi ce crédit : sa validation revient à une autre personne. ' +
        'C’est ce qui empêche une personne seule de créditer un compte.',
    );
  }
  if (rapprochementConfirme !== true) {
    throw new Error(
      'Confirmez avoir rapproché cette saisie de l’encaissement réel (relevé, reçu ' +
        'de caisse ou avis de paiement) avant de la valider.',
    );
  }

  const maintenant = new Date().toISOString();
  return executer(options, (tx) => {
    tx.marquer(`credits:${creditId}`, `operations:${c.groupementId}`);
    const courant = tx.lire('credits').find((x) => x.id === creditId);
    if (!courant || courant.etat !== ETAT_CREDIT.EN_ATTENTE) {
      throw new Error('Ce crédit a déjà été traité. Rechargez la page pour voir son état.');
    }

    const operation = depot('operation').creer(
      {
        id: identifiant('ope'),
        groupementId: c.groupementId,
        sens: SENS_OPERATION.CREDIT,
        montant: c.montant,
        motif: MOTIF_OPERATION.RECHARGEMENT,
        libelle: `Rechargement — ${c.referenceEncaissement}`,
        referenceEncaissement: c.referenceEncaissement,
        horodatage: maintenant,
        auteurUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );
    const credit = depot('credit').modifier(
      creditId,
      {
        etat: ETAT_CREDIT.CREDITE,
        valideLe: maintenant,
        valideParUtilisateurId: ctx.utilisateurId,
        operationId: operation.id,
      },
      { tx },
    );

    journaliser(ctx, EVENEMENT_AUDIT.COMPTE_CREDITE, {
      cibleType: 'groupement',
      cibleId: c.groupementId,
      details: `Compte crédité — crédit ${c.reference}, encaissement ${c.referenceEncaissement}, validé par une seconde personne.`,
      tx,
    });
    notifier(c.groupementId, EVENEMENT_AUDIT.COMPTE_CREDITE, {
      code: 'compte.credite',
      params: { reference: c.referenceEncaissement },
      cibleType: 'groupement',
      cibleId: c.groupementId,
      tx,
    });
    return { credit, operation };
  });
}

/**
 * Rejette un crédit saisi — encaissement introuvable, montant discordant…
 * Motif obligatoire. La référence redevient disponible pour une saisie correcte.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} creditId
 * @param {string} motif
 * @param {{tx?: any}} [options] Lot b4 : jointure à la transaction de la caisse.
 * @returns {Record<string, any>}
 */
export function rejeterCredit(ctx, creditId, motif, options = {}) {
  const c = creditAttendu(creditId);
  exiger(ctx, 'compte.valider_credit', { groupementId: c.groupementId });
  if (c.saisiParUtilisateurId === ctx.utilisateurId) {
    throw new Error('Vous avez saisi ce crédit : son contrôle revient à une autre personne.');
  }
  const texte = String(motif ?? '').trim();
  if (!texte) throw new Error('Un rejet porte son motif : l’agent doit savoir quoi corriger.');

  return executer(options, (tx) => {
    const credit = depot('credit').modifier(
      creditId,
      {
        etat: ETAT_CREDIT.REJETE,
        rejeteLe: new Date().toISOString(),
        valideParUtilisateurId: ctx.utilisateurId,
        motifRejet: texte.slice(0, 300),
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.CREDIT_REJETE, {
      cibleType: 'groupement',
      cibleId: c.groupementId,
      details: `Crédit ${c.reference} rejeté au rapprochement.`,
      tx,
    });
    return credit;
  });
}

/**
 * Crédits saisis, projetés — les plus récents d'abord.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {(c: Record<string, any>) => boolean} [filtre]
 * @returns {Array<Record<string, any>>}
 */
export function creditsSaisis(ctx, filtre = () => true) {
  return depot('credit')
    .lisiblesPar(ctx, 'compte.lire', filtre)
    .sort((a, b) => new Date(b.saisiLe) - new Date(a.saisiLe));
}

/**
 * Lot b4 : exécute le travail dans la transaction fournie, ou en ouvre une.
 * Le stockage n'imbrique pas les transactions : une écriture appelée depuis la
 * caisse doit rejoindre la sienne, sans quoi reçu et crédit seraient écrits
 * séparément — l'un pouvant exister sans l'autre.
 */
function executer(options, travail) {
  return options?.tx ? travail(options.tx) : stockageInterne().transaction(travail);
}

function creditAttendu(creditId) {
  const c = depot('credit').brutParId(creditId);
  if (!c) throw new Error('Crédit introuvable.');
  if (c.etat !== ETAT_CREDIT.EN_ATTENTE) {
    throw new Error('Ce crédit a déjà été traité. Rechargez la page pour voir son état.');
  }
  return c;
}

function referenceCredit() {
  const n = depot('credit').brutTous().length + 1;
  return `CR-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
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
