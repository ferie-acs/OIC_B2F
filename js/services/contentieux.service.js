/**
 * Contentieux — enregistrement et suivi d'un litige jusqu'à sa clôture.
 *
 * Lot b4. Le rôle `contentieux_paie` était déclaré sans écran. Un contentieux
 * porte ses parties, son objet, le montant en jeu et les **métadonnées** des
 * pièces versées (nom, type, taille : le fichier n'est pas conservé dans la
 * démonstration). Il avance d'une étape à la fois — ouvert, en instruction, en
 * conciliation — et peut être clos à tout moment avec son issue. Chaque pas est
 * daté, signé, historisé dans le dossier et inscrit au journal d'audit.
 *
 * Le service contentieux **n'encaisse pas** : un règlement passe par la caisse,
 * en quatre yeux, et s'impute au dossier à sa validation (`imputerReglement`).
 *
 * @module services/contentieux.service
 */

import { identifiant } from '../core/crypto.js';
import { EVENEMENT_AUDIT, TYPE_GROUPEMENT } from '../domain/enums.js';
import {
  ETAPE_CONTENTIEUX,
  ISSUE_CONTENTIEUX,
  NATURE_CONTENTIEUX,
  libelleFinance,
  numeroSuivant,
  transitionContentieuxPermise,
} from '../domain/finances.js';
import { exiger, projeter } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

/** Nombre maximal de pièces décrites par dossier. */
export const PIECES_MAX = 20;

const texte = (v, max) => String(v ?? '').trim().slice(0, max);

function pieceValide(p, ctx, maintenant) {
  const nom = texte(p?.nom, 160);
  if (!nom) throw new Error('Une pièce porte au moins son nom.');
  const taille = Number(p?.taille);
  return {
    nom,
    type: texte(p?.type, 80) || undefined,
    taille: Number.isInteger(taille) && taille >= 0 ? taille : undefined,
    ajouteLe: maintenant,
    ajouteParUtilisateurId: ctx.utilisateurId ?? undefined,
  };
}

/**
 * Ouvre un contentieux.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{groupementId: string, partieAdverseGroupementId?: string, appariementId?: string,
 *   nature: string, objet: string, montant: number, pieces?: Array<{nom: string, type?: string, taille?: number}>}} d
 */
export function ouvrirContentieux(ctx, d) {
  exiger(ctx, 'contentieux.gerer', { groupementId: d.groupementId });
  const g = depot('groupement').brutParId(d.groupementId);
  if (!g || g.type === TYPE_GROUPEMENT.INSTITUTION) throw new Error('Choisissez l’entreprise concernée par le contentieux.');
  const adverse = d.partieAdverseGroupementId || undefined;
  if (adverse) {
    if (adverse === d.groupementId) throw new Error('La partie adverse ne peut pas être l’entreprise concernée elle-même.');
    if (!depot('groupement').brutParId(adverse)) throw new Error('Partie adverse introuvable.');
  }
  const appariementId = d.appariementId || undefined;
  if (appariementId) {
    const a = depot('appariement').brutParId(appariementId);
    if (!a) throw new Error('Mise en relation introuvable.');
    if (a.groupementAffreteurId !== d.groupementId && a.groupementTransporteurId !== d.groupementId) {
      throw new Error('Cette mise en relation ne concerne pas l’entreprise choisie.');
    }
  }
  if (!Object.values(NATURE_CONTENTIEUX).includes(d.nature)) throw new Error('Choisissez la nature du contentieux.');
  const objet = texte(d.objet, 600);
  if (!objet) throw new Error('Décrivez l’objet du contentieux.');
  const montant = Number(d.montant);
  if (!(Number.isInteger(montant) && montant >= 0)) throw new Error('Le montant en jeu est un nombre entier de francs (zéro si le litige n’est pas chiffré).');
  const maintenant = new Date().toISOString();
  const pieces = (d.pieces ?? []).slice(0, PIECES_MAX).map((p) => pieceValide(p, ctx, maintenant));

  return stockageInterne().transaction((tx) => {
    const reference = numeroSuivant('CT', tx.lire('contentieux').map((c) => c.reference));
    const c = depot('contentieux').creer(
      {
        id: identifiant('ctx'),
        reference,
        groupementId: d.groupementId,
        partieAdverseGroupementId: adverse,
        appariementId,
        nature: d.nature,
        objet,
        montant,
        montantRegle: 0,
        etape: ETAPE_CONTENTIEUX.OUVERT,
        pieces,
        historique: [{ etape: ETAPE_CONTENTIEUX.OUVERT, le: maintenant, parUtilisateurId: ctx.utilisateurId, commentaire: 'Ouverture du dossier.' }],
        ouvertLe: maintenant,
        ouvertParUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.CONTENTIEUX_OUVERT, {
      cibleType: 'contentieux',
      cibleId: c.id,
      details: `Contentieux ${reference} ouvert — ${libelleFinance(d.nature).toLowerCase()}, ${pieces.length} pièce(s) décrite(s).`,
      tx,
    });
    return c;
  });
}

function dossierOuvert(id) {
  const c = depot('contentieux').brutParId(id);
  if (!c) throw new Error('Contentieux introuvable.');
  if (c.etape === ETAPE_CONTENTIEUX.CLOS) throw new Error('Ce contentieux est clos : il ne peut plus évoluer.');
  return c;
}

/**
 * Fait passer un contentieux à l'étape suivante. Le commentaire est obligatoire :
 * il dit pourquoi le dossier avance.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{vers: string, commentaire: string}} d
 */
export function avancerContentieux(ctx, id, { vers, commentaire }) {
  const c = dossierOuvert(id);
  exiger(ctx, 'contentieux.gerer', { groupementId: c.groupementId });
  if (vers === ETAPE_CONTENTIEUX.CLOS) throw new Error('La clôture se prononce avec son issue : utilisez « Clore le dossier ».');
  if (!transitionContentieuxPermise(c.etape, vers)) {
    throw new Error(`Un contentieux « ${libelleFinance(c.etape)} » ne passe pas à l’étape « ${libelleFinance(vers)} » : les étapes se suivent, sans retour.`);
  }
  const note = texte(commentaire, 600);
  if (!note) throw new Error('Indiquez ce qui justifie le passage à l’étape suivante.');
  return modifierDossier(ctx, c, { etape: vers }, { etape: vers, commentaire: note }, EVENEMENT_AUDIT.CONTENTIEUX_ETAPE,
    `Contentieux ${c.reference} passé à l’étape « ${libelleFinance(vers)} ».`);
}

/**
 * Clôt un contentieux avec son issue.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{issue: string, commentaire: string}} d
 */
export function cloreContentieux(ctx, id, { issue, commentaire }) {
  const c = dossierOuvert(id);
  exiger(ctx, 'contentieux.gerer', { groupementId: c.groupementId });
  if (!Object.values(ISSUE_CONTENTIEUX).includes(issue)) throw new Error('Choisissez l’issue du contentieux.');
  const note = texte(commentaire, 600);
  if (!note) throw new Error('Un contentieux se clôt avec un commentaire : il reste au dossier.');
  return modifierDossier(
    ctx,
    c,
    { etape: ETAPE_CONTENTIEUX.CLOS, issue, closLe: new Date().toISOString() },
    { etape: ETAPE_CONTENTIEUX.CLOS, commentaire: `${libelleFinance(issue)} — ${note}` },
    EVENEMENT_AUDIT.CONTENTIEUX_CLOS,
    `Contentieux ${c.reference} clos — ${libelleFinance(issue).toLowerCase()}.`,
  );
}

/**
 * Verse la description d'une pièce au dossier.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{nom: string, type?: string, taille?: number}} piece
 */
export function ajouterPiece(ctx, id, piece) {
  const c = dossierOuvert(id);
  exiger(ctx, 'contentieux.gerer', { groupementId: c.groupementId });
  if ((c.pieces ?? []).length >= PIECES_MAX) throw new Error(`Un dossier compte au plus ${PIECES_MAX} pièces décrites.`);
  const maintenant = new Date().toISOString();
  const p = pieceValide(piece, ctx, maintenant);
  return modifierDossier(
    ctx,
    c,
    { pieces: [...(c.pieces ?? []), p] },
    { etape: c.etape, commentaire: `Pièce versée au dossier : ${p.nom}.` },
    EVENEMENT_AUDIT.CONTENTIEUX_PIECE,
    `Pièce versée au contentieux ${c.reference}.`,
  );
}

/**
 * **Réservé au service de caisse**, après `caisse.valider` : impute au dossier
 * un règlement encaissé. Ne vérifie pas `contentieux.gerer` — l'agent de caisse
 * ne l'a pas, et n'en a pas besoin pour constater un encaissement validé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{numero: string, montant: number}} paiement
 * @param {{tx: any}} options
 */
export function imputerReglement(ctx, id, paiement, { tx }) {
  const c = tx.lire('contentieux').find((x) => x.id === id);
  if (!c) throw new Error('Contentieux introuvable.');
  if (c.etape === ETAPE_CONTENTIEUX.CLOS) throw new Error(`Le contentieux ${c.reference} est clos : rejetez cet encaissement.`);
  const regle = (c.montantRegle ?? 0) + paiement.montant;
  if (regle > c.montant) throw new Error(`Ce règlement dépasse le montant restant dû au contentieux ${c.reference}.`);
  tx.marquer(`contentieux:${id}`);
  const maintenant = new Date().toISOString();
  const modifie = depot('contentieux').modifier(
    id,
    {
      montantRegle: regle,
      historique: [...c.historique, { etape: c.etape, le: maintenant, parUtilisateurId: ctx.utilisateurId, commentaire: `Règlement encaissé à la caisse — reçu ${paiement.numero}.` }],
    },
    { tx },
  );
  journaliser(ctx, EVENEMENT_AUDIT.CONTENTIEUX_ETAPE, {
    cibleType: 'contentieux',
    cibleId: id,
    details: `Règlement imputé au contentieux ${c.reference} — reçu ${paiement.numero}.`,
    tx,
  });
  return modifie;
}

function modifierDossier(ctx, c, champs, evenementHistorique, evenementAudit, details) {
  return stockageInterne().transaction((tx) => {
    tx.marquer(`contentieux:${c.id}`);
    const courant = tx.lire('contentieux').find((x) => x.id === c.id);
    if (!courant || courant.etape !== c.etape) throw new Error('Ce dossier a été modifié entre-temps. Rechargez la page.');
    const modifie = depot('contentieux').modifier(
      c.id,
      {
        ...champs,
        historique: [...courant.historique, { ...evenementHistorique, le: new Date().toISOString(), parUtilisateurId: ctx.utilisateurId }],
      },
      { tx },
    );
    journaliser(ctx, evenementAudit, { cibleType: 'contentieux', cibleId: c.id, details, tx });
    return modifie;
  });
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

/**
 * Contentieux lisibles, les plus récents d'abord, avec le restant dû.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {(c: Record<string, any>) => boolean} [filtre]
 */
export function listeContentieux(ctx, filtre = () => true) {
  return depot('contentieux')
    .lisiblesPar(ctx, 'contentieux.lire', filtre)
    .map((c) => ({
      ...c,
      restant: typeof c.montant === 'number' ? Math.max(0, c.montant - (c.montantRegle ?? 0)) : null,
      partie: nomProjete(ctx, depot('contentieux').brutParId(c.id)?.groupementId),
      adverse: nomProjete(ctx, depot('contentieux').brutParId(c.id)?.partieAdverseGroupementId),
    }))
    .sort((a, b) => String(b.ouvertLe).localeCompare(String(a.ouvertLe)));
}

/** Raison sociale **projetée** : absente pour un rôle qui ne lit pas l'identité. */
export function nomProjete(ctx, groupementId) {
  if (!groupementId) return null;
  const g = depot('groupement').brutParId(groupementId);
  return g ? (projeter(ctx, 'groupement', g).raisonSociale ?? null) : null;
}

/**
 * Parties et mises en relation proposables à l'ouverture d'un dossier.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function partiesPossibles(ctx) {
  exiger(ctx, 'contentieux.gerer', {});
  const entreprises = depot('groupement')
    .brutOu((g) => g.type !== TYPE_GROUPEMENT.INSTITUTION)
    .map((g) => ({ id: g.id, nom: nomProjete(ctx, g.id) ?? g.id }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const relations = depot('appariement')
    .brutOu((a) => a.etat === 'valider')
    .map((a) => ({ id: a.id, reference: projeter(ctx, 'appariement', a, { proprietaireId: null }).reference ?? a.id }))
    .sort((a, b) => String(a.reference).localeCompare(String(b.reference)));
  return { entreprises, relations };
}
