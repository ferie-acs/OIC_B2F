/**
 * Gestion des entreprises inscrites (groupements) par l'exploitant OIC.
 *
 * - **Consulter** : liste projetée selon le rôle (ni coordonnées ni montants
 *   au-delà de ce que la classification ouvre).
 * - **Modifier** avec motif : seuls les champs d'identité que l'exploitant
 *   voit. Une pièce contrôlée modifiée (RCCM, carte de transporteur) fait perdre
 *   la vérification, comme pour un véhicule (correctif anti-fraude n° 3).
 * - **Suspendre / réactiver** en **quatre yeux** : un agent demande, une autre
 *   personne confirme, sur le modèle de la validation des crédits. Une
 *   suspension bloque les nouvelles opérations sans effacer l'historique.
 * - **Exporter** la liste au format CSV, sans coordonnée ni montant.
 *
 * L'activation des inscriptions relève d'un autre lot (b1).
 *
 * @module services/groupements-admin.service
 */

import { identifiant } from '../core/crypto.js';
import { exiger, projeter } from '../domain/access.js';
import {
  ACTION_GROUPEMENT,
  ETAT_COMPTE,
  ETAT_DECISION,
  ETAT_VERIFICATION,
  EVENEMENT_AUDIT,
  TYPE_GROUPEMENT,
  labelOf,
} from '../domain/enums.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { abonnementDe } from './auth.service.js';
import { notifier } from './notification.service.js';
import { RefusAdministration, maintenantIso, texteControle } from './admin-commun.js';
import { dateCsv, versCsv } from './export-csv.js';

/** Champs d'identité modifiables par l'exploitant, avec leur libellé. */
export const CHAMPS_MODIFIABLES = Object.freeze({
  raisonSociale: 'Raison sociale',
  rccm: 'RCCM',
  compteContribuable: 'Compte contribuable',
  pays: 'Pays',
  localiteId: 'Localité',
  carteTransporteurNumero: 'Carte de transporteur',
  carteTransporteurEcheance: 'Échéance de la carte',
});

/** Pièces dont la modification fait perdre la vérification d'un transporteur. */
const PIECES_CONTROLEES = ['rccm', 'carteTransporteurNumero', 'carteTransporteurEcheance', 'raisonSociale'];

/**
 * Entreprises visibles, projetées, enrichies de leurs indicateurs de gestion.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function entreprises(ctx) {
  exiger(ctx, 'groupement.lire');
  const decisions = depot('decision_groupement').brutOu((d) => d.etat === ETAT_DECISION.EN_ATTENTE);
  return depot('groupement')
    .lisiblesPar(ctx, 'groupement.lire')
    .sort((a, b) => String(a.raisonSociale ?? '').localeCompare(String(b.raisonSociale ?? ''), 'fr'))
    .map((g) => ({
      ...g,
      vehicules: depot('vehicule').brutOu((v) => v.groupementId === g.id).length,
      utilisateurs: depot('utilisateur').brutOu((u) => u.groupementId === g.id).length,
      abonnementActif: g.type === TYPE_GROUPEMENT.INSTITUTION ? null : abonnementDe(g.id).actif,
      decisionEnAttente: decisions.find((d) => d.groupementId === g.id) ?? null,
    }));
}

/**
 * Modifie la fiche d'identité d'une entreprise, avec motif.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {Record<string, any>} saisie
 * @param {string} motifSaisi
 * @returns {{verificationRetiree: boolean}}
 */
export function modifierEntreprise(ctx, id, saisie, motifSaisi) {
  const g = depot('groupement').brutParId(id);
  if (!g) throw new RefusAdministration('Entreprise introuvable.');
  exiger(ctx, 'groupement.gerer', { groupementId: id });
  const motif = texteControle(motifSaisi, 'Motif');

  const modifs = {};
  for (const champ of Object.keys(CHAMPS_MODIFIABLES)) {
    if (!(champ in saisie)) continue;
    if ((champ === 'carteTransporteurNumero' || champ === 'carteTransporteurEcheance') && g.type !== TYPE_GROUPEMENT.TRANSPORTEUR) continue;
    const valeur = String(saisie[champ] ?? '').trim();
    if (String(g[champ] ?? '') === valeur) continue;
    if (champ === 'raisonSociale' && valeur.length < 2) throw new RefusAdministration('La raison sociale est obligatoire.');
    if (champ === 'pays' && !valeur) throw new RefusAdministration('Le pays est obligatoire.');
    if (champ === 'localiteId') {
      const loc = depot('referentiel').brutParId(valeur);
      if (!loc || loc.famille !== 'localites' || !loc.actif) throw new RefusAdministration('Choisissez une localité active du référentiel.');
    }
    if (valeur.length > 160) throw new RefusAdministration(`« ${CHAMPS_MODIFIABLES[champ]} » dépasse 160 caractères.`);
    if (champ === 'carteTransporteurEcheance' && valeur && Number.isNaN(new Date(valeur).getTime())) {
      throw new RefusAdministration('Saisissez une échéance de carte valide.');
    }
    modifs[champ] = valeur || undefined;
  }
  if (!Object.keys(modifs).length) throw new RefusAdministration('Aucune modification à enregistrer.');

  const verificationRetiree =
    g.type === TYPE_GROUPEMENT.TRANSPORTEUR &&
    g.verificationEtat === ETAT_VERIFICATION.VERIFIE &&
    PIECES_CONTROLEES.some((c) => c in modifs);
  if (verificationRetiree) {
    Object.assign(modifs, {
      verificationEtat: ETAT_VERIFICATION.A_VERIFIER,
      verificationPieces: [],
      verifieLe: undefined,
      verifieParUtilisateurId: undefined,
    });
  }

  stockageInterne().transaction((tx) => {
    depot('groupement').modifier(id, modifs, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.GROUPEMENT_MODIFIE, {
      cibleType: 'groupement',
      cibleId: id,
      details:
        `Fiche modifiée (${Object.keys(modifs).filter((c) => CHAMPS_MODIFIABLES[c]).map((c) => CHAMPS_MODIFIABLES[c]).join(', ')})` +
        `${verificationRetiree ? ' — pièce contrôlée modifiée : dossier à vérifier de nouveau' : ''}. Motif : ${motif}`,
      tx,
    });
  });
  return { verificationRetiree };
}

/**
 * Demande la suspension ou la réactivation d'une entreprise. La décision
 * n'a d'effet qu'après confirmation par une autre personne.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} action Valeur de `ACTION_GROUPEMENT`.
 * @param {string} motifSaisi
 */
export function demanderDecision(ctx, id, action, motifSaisi) {
  const g = depot('groupement').brutParId(id);
  if (!g) throw new RefusAdministration('Entreprise introuvable.');
  exiger(ctx, 'groupement.suspendre', { groupementId: id });
  if (g.type === TYPE_GROUPEMENT.INSTITUTION) {
    throw new RefusAdministration('Une institution n’est pas une entreprise du marché : elle ne se suspend pas.');
  }
  if (!Object.values(ACTION_GROUPEMENT).includes(action)) throw new RefusAdministration('Action inconnue.');
  if (action === ACTION_GROUPEMENT.SUSPENDRE && g.etat !== ETAT_COMPTE.ACTIF) {
    throw new RefusAdministration('Cette entreprise est déjà suspendue.');
  }
  if (action === ACTION_GROUPEMENT.REACTIVER && g.etat !== ETAT_COMPTE.SUSPENDU) {
    throw new RefusAdministration('Cette entreprise n’est pas suspendue.');
  }
  if (depot('decision_groupement').brutOu((d) => d.groupementId === id && d.etat === ETAT_DECISION.EN_ATTENTE).length) {
    throw new RefusAdministration('Une décision attend déjà sa confirmation pour cette entreprise.');
  }
  const motif = texteControle(motifSaisi, 'Motif');
  return stockageInterne().transaction((tx) => {
    const d = depot('decision_groupement').creer({
      id: identifiant('dgr'),
      groupementId: id,
      action,
      etat: ETAT_DECISION.EN_ATTENTE,
      motif,
      demandeParUtilisateurId: ctx.utilisateurId,
      demandeLe: maintenantIso(),
      demo: true,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.DECISION_GROUPEMENT_DEMANDEE, {
      cibleType: 'groupement',
      cibleId: id,
      details: `${labelOf(action)} demandée, en attente de confirmation par une autre personne. Motif : ${motif}`,
      tx,
    });
    return d;
  });
}

/** @param {string} decisionId */
function decisionEnAttente(decisionId) {
  const d = depot('decision_groupement').brutParId(decisionId);
  if (!d) throw new RefusAdministration('Décision introuvable.');
  if (d.etat !== ETAT_DECISION.EN_ATTENTE) throw new RefusAdministration('Cette décision a déjà été traitée.');
  return d;
}

/** Motif servi à l'auteur d'une demande : on ne confirme pas sa propre décision. */
export const MOTIF_QUATRE_YEUX =
  'Vous avez demandé cette décision : sa confirmation revient à une autre personne.';

/**
 * Confirme une décision demandée par un autre agent : elle prend effet.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} decisionId
 */
export function confirmerDecision(ctx, decisionId) {
  const d = decisionEnAttente(decisionId);
  exiger(ctx, 'groupement.suspendre', { groupementId: d.groupementId });
  if (d.demandeParUtilisateurId === ctx.utilisateurId) throw new RefusAdministration(MOTIF_QUATRE_YEUX);
  const suspendre = d.action === ACTION_GROUPEMENT.SUSPENDRE;
  const maintenant = maintenantIso();
  stockageInterne().transaction((tx) => {
    depot('decision_groupement').modifier(d.id, {
      etat: ETAT_DECISION.CONFIRMEE,
      traiteParUtilisateurId: ctx.utilisateurId,
      traiteLe: maintenant,
    }, { tx });
    depot('groupement').modifier(d.groupementId, { etat: suspendre ? ETAT_COMPTE.SUSPENDU : ETAT_COMPTE.ACTIF }, { tx });
    const evenement = suspendre ? EVENEMENT_AUDIT.GROUPEMENT_SUSPENDU : EVENEMENT_AUDIT.GROUPEMENT_REACTIVE;
    journaliser(ctx, evenement, {
      cibleType: 'groupement',
      cibleId: d.groupementId,
      details: `${suspendre ? 'Suspension' : 'Réactivation'} confirmée (demande d’une autre personne). Motif initial : ${d.motif}`,
      tx,
    });
    notifier(d.groupementId, evenement, {
      code: suspendre ? 'groupement.suspendu' : 'groupement.reactive',
      cibleType: 'groupement',
      cibleId: d.groupementId,
      tx,
    });
  });
}

/**
 * Rejette une décision demandée par un autre agent : rien ne change.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} decisionId
 * @param {string} motifSaisi
 */
export function rejeterDecision(ctx, decisionId, motifSaisi) {
  const d = decisionEnAttente(decisionId);
  exiger(ctx, 'groupement.suspendre', { groupementId: d.groupementId });
  if (d.demandeParUtilisateurId === ctx.utilisateurId) throw new RefusAdministration(MOTIF_QUATRE_YEUX);
  const motif = texteControle(motifSaisi, 'Motif du rejet');
  stockageInterne().transaction((tx) => {
    depot('decision_groupement').modifier(d.id, {
      etat: ETAT_DECISION.REJETEE,
      traiteParUtilisateurId: ctx.utilisateurId,
      traiteLe: maintenantIso(),
      motifRejet: motif,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.DECISION_GROUPEMENT_REJETEE, {
      cibleType: 'groupement',
      cibleId: d.groupementId,
      details: `${labelOf(d.action)} rejetée. Motif : ${motif}`,
      tx,
    });
  });
}

/**
 * Décisions de suspension et de réactivation, les plus récentes d'abord.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function decisionsEntreprises(ctx) {
  exiger(ctx, 'groupement.lire');
  return depot('decision_groupement')
    .lisiblesPar(ctx, 'groupement.lire')
    .sort((a, b) => new Date(b.demandeLe) - new Date(a.demandeLe));
}

/**
 * Liste des entreprises au format CSV : identité, type, état. Ni coordonnée
 * ni montant, quel que soit le rôle.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {{nom: string, contenu: string, lignes: number}}
 */
export function exporterEntreprises(ctx) {
  exiger(ctx, 'export.donnees');
  const refs = new Map(depot('referentiel').brutTous().map((r) => [r.id, r.libelle]));
  const liste = entreprises(ctx);
  const contenu = versCsv(
    ['Raison sociale', 'Type', 'RCCM', 'Compte contribuable', 'Localité', 'Pays', 'État', 'Vérification', 'Inscrite le', 'Véhicules', 'Utilisateurs'],
    liste.map((g) => [
      g.raisonSociale,
      g.type ? labelOf(g.type) : '',
      g.rccm,
      g.compteContribuable,
      refs.get(g.localiteId) ?? '',
      g.pays,
      g.etat ? labelOf(g.etat) : '',
      g.type === TYPE_GROUPEMENT.TRANSPORTEUR ? labelOf(g.verificationEtat || ETAT_VERIFICATION.A_VERIFIER) : '',
      dateCsv(g.creeLe),
      g.vehicules,
      g.utilisateurs,
    ]),
  );
  journaliser(ctx, EVENEMENT_AUDIT.EXPORT_CSV, {
    cibleType: 'groupement',
    details: `Export de la liste des entreprises (${liste.length} lignes).`,
  });
  return { nom: `entreprises-${new Date().toISOString().slice(0, 10)}.csv`, contenu, lignes: liste.length };
}

/** Projection d'une entreprise pour une fiche. */
export function entreprise(ctx, id) {
  exiger(ctx, 'groupement.lire');
  const g = depot('groupement').brutParId(id);
  return g ? projeter(ctx, 'groupement', g, { proprietaireId: g.id }) : null;
}
