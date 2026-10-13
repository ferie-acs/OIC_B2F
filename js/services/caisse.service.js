/**
 * Caisse — encaissement au guichet, en deux temps et par deux personnes.
 *
 * Lot b4. Reprend, pour tout ce qui s'encaisse au guichet, le principe des
 * quatre yeux du correctif anti-fraude n° 5 :
 *
 * 1. **saisie** (`caisse.encaisser`) — l'agent enregistre l'encaissement et remet
 *    le reçu numéroté ; rien ne bouge encore : ni solde, ni abonnement, ni dossier ;
 * 2. **validation** (`caisse.valider`) — une **autre** personne, après
 *    rapprochement avec la caisse ou le relevé, valide : le compte est crédité,
 *    l'abonnement prolongé ou le règlement imputé au contentieux.
 *
 * Un rechargement passe par `saisirCredit` / `validerCredit` du service de compte,
 * dans la même transaction que le reçu : le crédit apparaît aussi dans « Crédits
 * à valider », et le valider à l'un ou l'autre endroit produit le même effet.
 *
 * Le prix d'un réabonnement est celui du catalogue **au jour de la saisie** et ne
 * se saisit pas : l'agent ne peut ni le minorer ni le majorer.
 *
 * @module services/caisse.service
 */

import { identifiant } from '../core/crypto.js';
import { ETAT_CREDIT, EVENEMENT_AUDIT, TYPE_GROUPEMENT } from '../domain/enums.js';
import {
  CANAL_PAIEMENT,
  ETAPE_CONTENTIEUX,
  ETAT_PAIEMENT,
  MODE_PAIEMENT,
  MODES_PAR_CANAL,
  OBJET_PAIEMENT,
  aujourdhui,
  libelleFinance,
  normaliserNumeroMobile,
} from '../domain/finances.js';
import { exiger, projeter } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { rejeterCredit, saisirCredit, validerCredit } from './compte.service.js';
import { notifier } from './notification.service.js';
import { envoyerModele } from './messagerie.service.js';
import { prolongerAbonnement, tarifFormule } from './abonnement.service.js';
import { imputerReglement, nomProjete } from './contentieux.service.js';
import { etatEffectif, numeroRecu, referencePaiementUtilisee } from './paiement.service.js';
import { appliquerRevisionsEchues } from './tarif.service.js';

/** Plafond d'un encaissement au guichet, garde-fou contre une faute de frappe. */
export const ENCAISSEMENT_MAX = 50_000_000;

/**
 * Montant restant dû sur un contentieux, encaissements en attente déduits.
 * @param {Record<string, any>} c Contentieux brut.
 */
export function restantDu(c) {
  const enAttente = depot('paiement')
    .brutOu((p) => p.contentieuxId === c.id && etatEffectif(p) === ETAT_PAIEMENT.EN_ATTENTE)
    .reduce((n, p) => n + p.montant, 0);
  return Math.max(0, c.montant - (c.montantRegle ?? 0) - enAttente);
}

/**
 * Enregistre un encaissement au guichet et émet son reçu.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{groupementId: string, objet: string, mode: string, montant?: number,
 *   tarifId?: string, contentieuxId?: string, referencePiece?: string, numeroPayeur?: string}} d
 * @returns {Record<string, any>} Le paiement, à l'état `en_attente`.
 */
export function encaisser(ctx, d) {
  exiger(ctx, 'caisse.encaisser', { groupementId: d.groupementId });
  const g = depot('groupement').brutParId(d.groupementId);
  if (!g || g.type === TYPE_GROUPEMENT.INSTITUTION) throw new Error('Choisissez l’entreprise cliente.');
  if (!Object.values(OBJET_PAIEMENT).includes(d.objet)) throw new Error('Choisissez l’objet de l’encaissement.');
  if (!MODES_PAR_CANAL[CANAL_PAIEMENT.GUICHET].includes(d.mode)) {
    throw new Error('Choisissez le mode de règlement : espèces, chèque, virement ou mobile money.');
  }
  const piece = String(d.referencePiece ?? '').trim();
  if (d.mode !== MODE_PAIEMENT.ESPECES) {
    if (!piece) throw new Error('Hors espèces, saisissez la référence de la pièce : numéro de chèque, de virement ou de transaction.');
    if (referencePaiementUtilisee(piece)) {
      throw new Error(`La pièce ${piece} a déjà servi à un encaissement : une pièce ne s’encaisse qu’une fois.`);
    }
  }
  let numeroPayeur;
  if (String(d.numeroPayeur ?? '').trim()) {
    numeroPayeur = normaliserNumeroMobile(d.numeroPayeur);
    if (!numeroPayeur) throw new Error('Le numéro du payeur doit compter dix chiffres et commencer par 01, 05 ou 07.');
  }
  appliquerRevisionsEchues();

  /** @type {Record<string, any>} */
  const specifique = {};
  let montant;
  if (d.objet === OBJET_PAIEMENT.ABONNEMENT) {
    const t = tarifFormule(d.tarifId);
    montant = t.montant;
    Object.assign(specifique, { tarifId: t.id, dureeMois: t.dureeMois, detail: `${t.libelle} — ${t.dureeMois} mois` });
  } else {
    montant = Number(d.montant);
    if (!(Number.isInteger(montant) && montant > 0 && montant <= ENCAISSEMENT_MAX)) {
      throw new Error('Le montant encaissé est un nombre entier de francs, strictement positif.');
    }
    if (d.objet === OBJET_PAIEMENT.CONTENTIEUX) {
      const c = depot('contentieux').brutParId(d.contentieuxId);
      if (!c || c.groupementId !== d.groupementId) throw new Error('Choisissez le contentieux réglé par ce client.');
      if (c.etape === ETAPE_CONTENTIEUX.CLOS) throw new Error(`Le contentieux ${c.reference} est clos.`);
      if (montant > restantDu(c)) throw new Error(`Le montant dépasse le restant dû au contentieux ${c.reference}.`);
      Object.assign(specifique, { contentieuxId: c.id, detail: `Règlement du contentieux ${c.reference}` });
    } else {
      specifique.detail = 'Rechargement du compte prépayé';
    }
  }
  const maintenant = new Date().toISOString();

  return stockageInterne().transaction((tx) => {
    const numero = numeroRecu(tx);
    if (d.objet === OBJET_PAIEMENT.RECHARGEMENT) {
      // Le crédit porte le numéro du reçu comme référence d'encaissement : la
      // saisie et sa trace physique se rapprochent l'une de l'autre sans effort.
      specifique.creditId = saisirCredit(ctx, { groupementId: d.groupementId, montant, referenceEncaissement: numero }, { tx }).id;
    }
    const paiement = depot('paiement').creer(
      {
        id: identifiant('pai'),
        numero,
        groupementId: d.groupementId,
        objet: d.objet,
        canal: CANAL_PAIEMENT.GUICHET,
        mode: d.mode,
        numeroPayeur,
        referenceTransaction: piece || undefined,
        montant,
        devise: 'XOF',
        ...specifique,
        etat: ETAT_PAIEMENT.EN_ATTENTE,
        saisiLe: maintenant,
        saisiParUtilisateurId: ctx.utilisateurId,
        impressions: 0,
        demo: true,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.ENCAISSEMENT_SAISI, {
      cibleType: 'paiement',
      cibleId: paiement.id,
      details:
        `Encaissement ${numero} saisi au guichet — ${libelleFinance(d.objet).toLowerCase()}, ` +
        `${libelleFinance(d.mode).toLowerCase()}. En attente de validation par une autre personne.`,
      tx,
    });
    return paiement;
  });
}

function encaissementAttendu(id) {
  const p = depot('paiement').brutParId(id);
  if (!p || p.canal !== CANAL_PAIEMENT.GUICHET) throw new Error('Encaissement introuvable.');
  if (p.etat !== ETAT_PAIEMENT.EN_ATTENTE) throw new Error('Cet encaissement a déjà été traité. Rechargez la page pour voir son état.');
  return p;
}

/**
 * Valide un encaissement saisi par un autre agent : **seul moment où il produit
 * son effet**.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{rapprochementConfirme: boolean}} confirmation
 */
export function validerEncaissement(ctx, id, { rapprochementConfirme } = { rapprochementConfirme: false }) {
  const p = encaissementAttendu(id);
  exiger(ctx, 'caisse.valider', { groupementId: p.groupementId });
  if (p.saisiParUtilisateurId === ctx.utilisateurId) {
    throw new Error(
      'Vous avez saisi cet encaissement : sa validation revient à une autre personne. ' +
        'C’est ce qui empêche une personne seule de créditer un compte ou de prolonger un abonnement.',
    );
  }
  if (rapprochementConfirme !== true) {
    throw new Error('Confirmez avoir rapproché cet encaissement de la caisse ou du relevé avant de le valider.');
  }
  const maintenant = new Date().toISOString();

  return stockageInterne().transaction((tx) => {
    tx.marquer(`paiements:${id}`);
    const courant = tx.lire('paiements').find((x) => x.id === id);
    if (!courant || courant.etat !== ETAT_PAIEMENT.EN_ATTENTE) {
      throw new Error('Cet encaissement a déjà été traité. Rechargez la page pour voir son état.');
    }
    /** @type {Record<string, any>} */
    const effets = {};
    if (p.objet === OBJET_PAIEMENT.RECHARGEMENT) {
      const credit = tx.lire('credits').find((c) => c.id === p.creditId);
      if (credit?.etat === ETAT_CREDIT.EN_ATTENTE) {
        effets.operationId = validerCredit(ctx, p.creditId, { rapprochementConfirme: true }, { tx }).operation.id;
      } else if (credit?.etat === ETAT_CREDIT.CREDITE) {
        effets.operationId = credit.operationId; // déjà validé depuis « Crédits à valider »
      } else {
        throw new Error('Le crédit lié à cet encaissement a été rejeté : rejetez l’encaissement.');
      }
    } else if (p.objet === OBJET_PAIEMENT.ABONNEMENT) {
      effets.abonnementId = prolongerAbonnement(
        ctx,
        { groupementId: p.groupementId, tarifId: p.tarifId, montant: p.montant, dureeMois: p.dureeMois, reference: p.numero },
        { tx },
      ).id;
    } else {
      imputerReglement(ctx, p.contentieuxId, p, { tx });
    }
    const valide = depot('paiement').modifier(
      id,
      { etat: ETAT_PAIEMENT.ENCAISSE, valideLe: maintenant, valideParUtilisateurId: ctx.utilisateurId, ...effets },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.ENCAISSEMENT_VALIDE, {
      cibleType: 'paiement',
      cibleId: id,
      details: `Encaissement ${p.numero} validé par une seconde personne — ${libelleFinance(p.objet).toLowerCase()}.`,
      tx,
    });
    notifier(p.groupementId, EVENEMENT_AUDIT.ENCAISSEMENT_VALIDE, {
      code: 'paiement.enregistre',
      params: { reference: p.numero, objet: libelleFinance(p.objet).toLowerCase() },
      cibleType: 'paiement',
      cibleId: id,
      tx,
    });
    // Intégration : courriel simulé par la messagerie unique (lot b1).
    envoyerModele({
      modele: 'encaissement.valide',
      params: {
        entreprise: depot('groupement').brutParId(p.groupementId)?.raisonSociale ?? '',
        reference: p.numero,
        objet: libelleFinance(p.objet).toLowerCase(),
      },
      groupementId: p.groupementId,
      tx,
      expediteur: { utilisateurId: ctx.utilisateurId, roleId: ctx.roleId },
    });
    return valide;
  });
}

/**
 * Rejette un encaissement saisi : encaissement introuvable en caisse, montant
 * discordant… Motif obligatoire. Rien n'est crédité ni prolongé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} motif
 */
export function rejeterEncaissement(ctx, id, motif) {
  const p = encaissementAttendu(id);
  exiger(ctx, 'caisse.valider', { groupementId: p.groupementId });
  if (p.saisiParUtilisateurId === ctx.utilisateurId) {
    throw new Error('Vous avez saisi cet encaissement : son contrôle revient à une autre personne.');
  }
  const texte = String(motif ?? '').trim();
  if (!texte) throw new Error('Un rejet porte son motif : l’agent de caisse doit savoir quoi corriger.');

  return stockageInterne().transaction((tx) => {
    tx.marquer(`paiements:${id}`);
    if (p.creditId) {
      const credit = tx.lire('credits').find((c) => c.id === p.creditId);
      if (credit?.etat === ETAT_CREDIT.CREDITE) {
        throw new Error('Le crédit lié a déjà été validé : le compte est crédité, l’encaissement ne peut plus être rejeté.');
      }
      if (credit?.etat === ETAT_CREDIT.EN_ATTENTE) rejeterCredit(ctx, p.creditId, texte, { tx });
    }
    const rejete = depot('paiement').modifier(
      id,
      { etat: ETAT_PAIEMENT.REJETE, rejeteLe: new Date().toISOString(), valideParUtilisateurId: ctx.utilisateurId, motifRejet: texte.slice(0, 300) },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.ENCAISSEMENT_REJETE, {
      cibleType: 'paiement',
      cibleId: id,
      details: `Encaissement ${p.numero} rejeté au contrôle de caisse.`,
      tx,
    });
    notifier(p.groupementId, EVENEMENT_AUDIT.ENCAISSEMENT_REJETE, {
      code: 'encaissement.rejete',
      params: { reference: p.numero },
      cibleType: 'paiement',
      cibleId: id,
      tx,
    });
    // Intégration : courriel simulé ; le motif interne du contrôle n'y figure pas.
    envoyerModele({
      modele: 'encaissement.rejete',
      params: { reference: p.numero },
      groupementId: p.groupementId,
      tx,
      expediteur: { utilisateurId: ctx.utilisateurId, roleId: ctx.roleId },
    });
    return rejete;
  });
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

/**
 * Encaissements et paiements lisibles par la caisse, projetés, avec leur état
 * effectif et le nom projeté du client — les plus récents d'abord.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{du?: string, au?: string, canal?: string}} [filtres] Dates `AAAA-MM-JJ` incluses.
 */
export function encaissements(ctx, filtres = {}) {
  exiger(ctx, 'caisse.lire');
  return depot('paiement')
    .brutOu((p) => {
      const jour = String(p.saisiLe).slice(0, 10);
      if (filtres.du && jour < filtres.du) return false;
      if (filtres.au && jour > filtres.au) return false;
      if (filtres.canal && p.canal !== filtres.canal) return false;
      return true;
    })
    .sort((a, b) => String(b.saisiLe).localeCompare(String(a.saisiLe)))
    .map((p) => ({ ...projeter(ctx, 'paiement', p), etat: etatEffectif(p), client: nomProjete(ctx, p.groupementId) }));
}

/**
 * Synthèse du jour de la caisse.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} [jour]
 */
export function syntheseDuJour(ctx, jour = aujourdhui()) {
  const liste = encaissements(ctx, { du: jour, au: jour, canal: CANAL_PAIEMENT.GUICHET });
  const somme = (l) => l.reduce((n, p) => n + (p.montant ?? 0), 0);
  const valides = liste.filter((p) => p.etat === ETAT_PAIEMENT.ENCAISSE);
  const attente = liste.filter((p) => p.etat === ETAT_PAIEMENT.EN_ATTENTE);
  return {
    liste,
    nombre: liste.length,
    montantSaisi: somme(liste.filter((p) => p.etat !== ETAT_PAIEMENT.REJETE)),
    montantValide: somme(valides),
    enAttente: attente.length,
  };
}

/**
 * Encaissements au guichet en attente de validation, toutes dates.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function encaissementsEnAttente(ctx) {
  return encaissements(ctx, { canal: CANAL_PAIEMENT.GUICHET }).filter((p) => p.etat === ETAT_PAIEMENT.EN_ATTENTE);
}

/**
 * Clients du guichet : entreprises inscrites, nom projeté.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function clientsGuichet(ctx) {
  // Liste de saisie, sans cible propre : la cible est vérifiée à l'encaissement.
  exiger(ctx, 'caisse.encaisser', {});
  return depot('groupement')
    .brutOu((g) => g.type !== TYPE_GROUPEMENT.INSTITUTION)
    .map((g) => ({ id: g.id, type: g.type, nom: nomProjete(ctx, g.id) ?? g.id }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Contentieux ouverts d'un client, avec leur restant dû — pour l'encaissement
 * d'un règlement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 */
export function contentieuxReglables(ctx, groupementId) {
  exiger(ctx, 'caisse.encaisser', { groupementId });
  return depot('contentieux')
    .brutOu((c) => c.groupementId === groupementId && c.etape !== ETAPE_CONTENTIEUX.CLOS)
    .map((c) => ({ id: c.id, reference: c.reference, restant: restantDu(c) }))
    .filter((c) => c.restant > 0);
}
