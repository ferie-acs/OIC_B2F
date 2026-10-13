/**
 * Vérification des transporteurs — correctif anti-fraude n° 3 (13/10/2026).
 *
 * ## Le risque traité
 *
 * Rien ne prouvait qu'un transporteur était celui qu'il prétendait être. Un faux
 * transporteur pouvait s'inscrire, accepter un chargement et disparaître avec la
 * marchandise — et la plateforme de l'OIC l'aurait présenté au client. C'est le
 * risque le plus grave pour l'Office : un vol, couvert par une plateforme
 * publique.
 *
 * ## La règle
 *
 * L'agent d'activation des inscriptions contrôle :
 * 1. le **dossier du transporteur** — RCCM, carte de transporteur, assurance ;
 * 2. la **carte grise et la carte de transport** de chaque véhicule ;
 * 3. le **permis** de chaque chauffeur.
 *
 * Tant que ce n'est pas fait, le transporteur ne publie pas, ne propose pas,
 * n'accepte pas, et aucune validation ne peut aboutir sur ses moyens. Une pièce
 * modifiée après contrôle (plaque, carte grise, permis) perd sa vérification :
 * ce que l'affréteur reçoit à la validation est exactement ce qui a été vérifié.
 *
 * ## Ce que voit l'agent
 *
 * Les seules pièces nécessaires au contrôle, servies **sous le droit
 * `groupement.verifier`** et par ce service uniquement. Ni téléphone, ni
 * courriel, ni solde : contrôler un dossier ne demande pas de pouvoir joindre
 * l'entreprise hors plateforme.
 *
 * @module services/verification.service
 */

import {
  ETAT_VERIFICATION,
  EVENEMENT_AUDIT,
  PIECE_DOSSIER,
  TYPE_GROUPEMENT,
  /* Lot b1 */
  CANAL_MESSAGE,
  CODE_TARIF,
  ETAT_ABONNEMENT,
  ETAT_INSCRIPTION,
  ETAT_PIECE,
  labelOf,
} from '../domain/enums.js';
import { exiger, projeter, projeterListe } from '../domain/access.js';
import { identifiant } from '../core/crypto.js';
import {
  agentTraiteType,
  bilanDossier,
  codeBfci,
  estTypeInscriptible,
  etatInscription,
  libellePiece,
  periodeInitiale,
  piecesCourantes,
  piecesDuType,
  roleApresRequalification,
  typeInscription,
  typesTraitesPar,
} from '../domain/inscription.js';
import { envoyerAuGroupement, envoyerModele } from './messagerie.service.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { notifier } from './notification.service.js';

/* ------------------------------------------------------------------ *
 * Lecture de l'état — fonctions sans droit, utilisées par les services
 * ------------------------------------------------------------------ */

/**
 * État de vérification d'un groupement. **Absent vaut « à vérifier »** : un
 * transporteur inscrit hier n'est pas vérifié parce que personne n'a rien écrit.
 * @param {string|null|undefined} groupementId
 * @returns {string} Valeur de `ETAT_VERIFICATION`.
 */
export function etatVerification(groupementId) {
  const g = groupementId ? depot('groupement').brutParId(groupementId) : null;
  // Lot b2 : une filiale sans décision propre hérite de la vérification de sa
  // mère — dynamiquement : si la mère la perd, la filiale la perd aussi.
  if (g && g.verificationEtat == null && g.parentId && g.parentId !== g.id) {
    return etatVerification(g.parentId);
  }
  return g?.verificationEtat ?? ETAT_VERIFICATION.A_VERIFIER;
}

/**
 * Le transporteur est-il vérifié ?
 * @param {string|null|undefined} groupementId
 * @returns {boolean}
 */
export function transporteurVerifie(groupementId) {
  return etatVerification(groupementId) === ETAT_VERIFICATION.VERIFIE;
}

/**
 * Le véhicule a-t-il été contrôlé ?
 * @param {string|null|undefined} vehiculeId
 * @returns {boolean}
 */
export function vehiculeVerifie(vehiculeId) {
  return Boolean(vehiculeId && depot('vehicule').brutParId(vehiculeId)?.verifieLe);
}

/**
 * Le chauffeur a-t-il été contrôlé ?
 * @param {string|null|undefined} chauffeurId
 * @returns {boolean}
 */
export function chauffeurVerifie(chauffeurId) {
  return Boolean(chauffeurId && depot('chauffeur').brutParId(chauffeurId)?.verifieLe);
}

/**
 * Les moyens engagés par une offre — véhicule, et chauffeur s'il est désigné —
 * ont-ils tous été contrôlés ?
 * @param {Record<string, any>|null|undefined} offre
 * @returns {boolean}
 */
export function moyensVerifies(offre) {
  if (!offre) return false;
  if (!vehiculeVerifie(offre.vehiculeId)) return false;
  return !offre.chauffeurPressentiId || chauffeurVerifie(offre.chauffeurPressentiId);
}

/**
 * Motif pour lequel une offre ne peut pas être publiée, ou `null`.
 * @param {Record<string, any>} vehicule
 * @param {string|null|undefined} chauffeurId
 * @returns {string|null}
 */
export function motifNonVerifie(vehicule, chauffeurId) {
  if (!transporteurVerifie(vehicule.groupementId)) {
    return etatVerification(vehicule.groupementId) === ETAT_VERIFICATION.REFUSE
      ? 'La vérification de votre dossier de transporteur a été refusée. Consultez ' +
        'le motif dans la fiche du groupement et transmettez les pièces demandées.'
      : 'Votre dossier de transporteur n’a pas encore été vérifié par l’agent ' +
        'd’activation. Vous pourrez publier dès que votre RCCM, votre carte de ' +
        'transporteur et votre assurance auront été contrôlés.';
  }
  if (!vehicule.verifieLe) {
    return 'La carte grise et la carte de transport de ce véhicule n’ont pas été ' +
      'contrôlées par l’agent d’activation. Il reste à votre parc et sera ' +
      'publiable après contrôle.';
  }
  if (chauffeurId && !chauffeurVerifie(chauffeurId)) {
    return 'Le permis du chauffeur choisi n’a pas été contrôlé. Choisissez un ' +
      'chauffeur vérifié, ou publiez sans chauffeur pressenti.';
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * L'écran de l'agent d'activation
 * ------------------------------------------------------------------ */

/**
 * Dossiers des transporteurs, avec les pièces nécessaires au contrôle.
 *
 * **Lecture bornée** : seuls les champs utiles à la vérification sortent d'ici.
 * Aucun téléphone, aucun courriel, aucune adresse, aucun montant.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function dossiersTransporteurs(ctx) {
  exiger(ctx, 'groupement.verifier', { groupementId: null });

  const vehicules = depot('vehicule').brutTous();
  const chauffeurs = depot('chauffeur').brutTous();

  return depot('groupement')
    .brutOu((g) => g.type === TYPE_GROUPEMENT.TRANSPORTEUR)
    .map((g) => ({
      id: g.id,
      raisonSociale: g.raisonSociale,
      rccm: g.rccm ?? null,
      carteTransporteurNumero: g.carteTransporteurNumero ?? null,
      carteTransporteurEcheance: g.carteTransporteurEcheance ?? null,
      pays: g.pays,
      creeLe: g.creeLe,
      etat: etatVerification(g.id), // Lot b2 : héritage de la mère pour une filiale
      pieces: g.verificationPieces ?? [],
      verifieLe: g.verifieLe ?? null,
      motif: g.verificationMotif ?? null,
      vehicules: vehicules
        .filter((v) => v.groupementId === g.id)
        .map((v) => ({
          id: v.id,
          immatriculation: v.immatriculation,
          carteGrise: v.carteGrise ?? null,
          carteTransportNumero: v.carteTransportNumero,
          carteTransportEcheance: v.carteTransportEcheance,
          verifieLe: v.verifieLe ?? null,
        })),
      chauffeurs: chauffeurs
        .filter((c) => c.groupementId === g.id)
        .map((c) => ({
          id: c.id,
          nom: c.nom,
          permisNumero: c.permisNumero,
          permisEcheance: c.permisEcheance ?? null,
          verifieLe: c.verifieLe ?? null,
          /* Lot b3 : pièce d'identité et catégories, contrôlées avec le permis */
          pieceType: c.pieceType ?? null,
          pieceNumero: c.pieceNumero ?? null,
          pieceExpireLe: c.pieceExpireLe ?? null,
          permisCategories: c.permisCategories ?? [],
          actif: c.actif !== false,
        })),
    }))
    .sort((a, b) => ordreEtat(a.etat) - ordreEtat(b.etat) || a.raisonSociale.localeCompare(b.raisonSociale, 'fr'));
}

/** Les dossiers à traiter d'abord. */
function ordreEtat(etat) {
  return { [ETAT_VERIFICATION.A_VERIFIER]: 0, [ETAT_VERIFICATION.REFUSE]: 1 }[etat] ?? 2;
}

/**
 * Prononce la vérification du dossier d'un transporteur.
 *
 * **Les trois pièces sont exigées** : un contrôle partiel n'est pas un contrôle.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {{pieces: string[]}} controle Pièces effectivement contrôlées.
 * @returns {Record<string, any>}
 */
export function verifierTransporteur(ctx, groupementId, { pieces }) {
  exiger(ctx, 'groupement.verifier', { groupementId });
  const g = transporteurDe(groupementId);

  const requises = Object.values(PIECE_DOSSIER);
  const controlees = requises.filter((p) => (pieces ?? []).includes(p));
  if (controlees.length !== requises.length) {
    throw new Error(
      'La vérification exige le contrôle des trois pièces : registre du commerce, ' +
        'carte de transporteur et attestation d’assurance. Un contrôle partiel ' +
        'n’est pas un contrôle.',
    );
  }
  if (!g.rccm || !g.carteTransporteurNumero) {
    throw new Error('Le dossier ne porte pas de RCCM ou de carte de transporteur : rien à contrôler.');
  }
  if (g.carteTransporteurEcheance && new Date(`${g.carteTransporteurEcheance}T23:59:59`) < new Date()) {
    throw new Error('La carte de transporteur est échue : le dossier ne peut pas être vérifié.');
  }

  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    const maj = depot('groupement').modifier(
      groupementId,
      {
        verificationEtat: ETAT_VERIFICATION.VERIFIE,
        verificationPieces: controlees,
        verifieLe: maintenant,
        verifieParUtilisateurId: ctx.utilisateurId,
        verificationMotif: null,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.TRANSPORTEUR_VERIFIE, {
      cibleType: 'groupement',
      cibleId: groupementId,
      details: 'Dossier transporteur vérifié : RCCM, carte de transporteur, assurance.',
      tx,
    });
    notifier(groupementId, EVENEMENT_AUDIT.TRANSPORTEUR_VERIFIE, {
      code: 'transporteur.verifie',
      params: {},
      cibleType: 'groupement',
      cibleId: groupementId,
      tx,
    });
    return maj;
  });
}

/**
 * Refuse — ou retire — la vérification d'un transporteur. Motif obligatoire :
 * le transporteur doit savoir quelle pièce fournir.
 *
 * Retirer une vérification ferme immédiatement ses offres au marché (le filtre
 * de recherche l'exige) et bloque toute validation en cours (garde
 * `transporteurVerifie`).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {string} motif
 * @returns {Record<string, any>}
 */
export function refuserTransporteur(ctx, groupementId, motif) {
  exiger(ctx, 'groupement.verifier', { groupementId });
  transporteurDe(groupementId);
  const texte = String(motif ?? '').trim();
  if (!texte) throw new Error('Un refus porte son motif : le transporteur doit savoir quoi corriger.');

  return stockageInterne().transaction((tx) => {
    const maj = depot('groupement').modifier(
      groupementId,
      {
        verificationEtat: ETAT_VERIFICATION.REFUSE,
        verificationPieces: [],
        verifieLe: null,
        verifieParUtilisateurId: ctx.utilisateurId,
        verificationMotif: texte.slice(0, 500),
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.TRANSPORTEUR_REFUSE, {
      cibleType: 'groupement',
      cibleId: groupementId,
      details: 'Vérification du dossier transporteur refusée ou retirée.',
      tx,
    });
    notifier(groupementId, EVENEMENT_AUDIT.TRANSPORTEUR_REFUSE, {
      code: 'transporteur.refuse',
      params: {},
      cibleType: 'groupement',
      cibleId: groupementId,
      tx,
    });
    return maj;
  });
}

/**
 * Atteste le contrôle de la carte grise et de la carte de transport d'un véhicule.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} vehiculeId
 * @returns {Record<string, any>}
 */
export function verifierVehicule(ctx, vehiculeId) {
  const v = depot('vehicule').brutParId(vehiculeId);
  if (!v) throw new Error('Véhicule introuvable.');
  exiger(ctx, 'groupement.verifier', { groupementId: v.groupementId });
  if (!v.carteGrise) {
    throw new Error('Ce véhicule ne porte pas de numéro de carte grise : rien à contrôler.');
  }
  if (new Date(`${v.carteTransportEcheance}T23:59:59`) < new Date()) {
    throw new Error('La carte de transport de ce véhicule est échue : elle doit être renouvelée avant contrôle.');
  }
  return attester(ctx, 'vehicule', v, EVENEMENT_AUDIT.VEHICULE_VERIFIE,
    'Véhicule contrôlé : carte grise et carte de transport.');
}

/**
 * Atteste le contrôle du permis d'un chauffeur.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} chauffeurId
 * @returns {Record<string, any>}
 */
export function verifierChauffeur(ctx, chauffeurId) {
  const c = depot('chauffeur').brutParId(chauffeurId);
  if (!c) throw new Error('Chauffeur introuvable.');
  exiger(ctx, 'groupement.verifier', { groupementId: c.groupementId });
  if (c.permisEcheance && new Date(`${c.permisEcheance}T23:59:59`) < new Date()) {
    throw new Error('Le permis de ce chauffeur est échu : il ne peut pas être attesté.');
  }
  /* Lot b3 : la pièce d'identité suit la même règle que le permis. */
  if (c.pieceExpireLe && new Date(`${c.pieceExpireLe}T23:59:59`) < new Date()) {
    throw new Error('La pièce d’identité de ce chauffeur est expirée : elle ne peut pas être attestée.');
  }
  if (c.actif === false) {
    throw new Error('Ce chauffeur a été retiré par son transporteur : il n’y a rien à attester.');
  }
  return attester(ctx, 'chauffeur', c, EVENEMENT_AUDIT.CHAUFFEUR_VERIFIE,
    'Chauffeur contrôlé : permis de conduire et pièce d’identité.');
}

function attester(ctx, entite, objet, evenement, details) {
  return stockageInterne().transaction((tx) => {
    const maj = depot(entite).modifier(
      objet.id,
      { verifieLe: new Date().toISOString(), verifieParUtilisateurId: ctx.utilisateurId },
      { tx },
    );
    journaliser(ctx, evenement, { cibleType: entite, cibleId: objet.id, details, tx });
    return maj;
  });
}

function transporteurDe(groupementId) {
  const g = depot('groupement').brutParId(groupementId);
  if (!g) throw new Error('Groupement introuvable.');
  if (g.type !== TYPE_GROUPEMENT.TRANSPORTEUR) {
    throw new Error('Seuls les dossiers de transporteurs font l’objet de cette vérification.');
  }
  return g;
}

/**
 * Champs dont la modification fait perdre la vérification.
 * Utilisé par le service de flotte à chaque enregistrement.
 */
export const CHAMPS_CONTROLES = Object.freeze({
  vehicule: Object.freeze(['immatriculation', 'carteGrise', 'carteTransportNumero', 'carteTransportEcheance']),
  chauffeur: Object.freeze([
    'nom', 'permisNumero', 'permisEcheance',
    /* Lot b3 : pièce d'identité et catégories du permis */
    'pieceType', 'pieceNumero', 'pieceDelivreeLe', 'pieceExpireLe', 'nationalite',
    'dateNaissance', 'permisCategories', 'cacrNumero',
  ]),
});

/**
 * Une modification touche-t-elle une pièce contrôlée ?
 * @param {'vehicule'|'chauffeur'} entite
 * @param {Record<string, any>|null} avant
 * @param {Record<string, any>} apres
 * @returns {boolean}
 */
export function pieceModifiee(entite, avant, apres) {
  if (!avant) return true;
  return CHAMPS_CONTROLES[entite].some((c) => String(avant[c] ?? '') !== String(apres[c] ?? ''));
}

/* ================================================================== *
 * Lot b1 : vérification et activation de toutes les entreprises inscrites
 *
 * La vérification des transporteurs ci-dessus est **étendue**, pas doublée :
 * affréteurs, transporteurs et intermédiaires de fret passent par la même file.
 * Pour un transporteur, l'activation prononce aussi la vérification de son
 * dossier (mêmes pièces : RCCM, carte de transporteur, assurance) ; le contrôle
 * de ses véhicules et chauffeurs reste celui des fonctions précédentes.
 *
 * Règles :
 * - un agent ne traite que les types que `domain/inscription.js` lui attribue ;
 * - chaque pièce obligatoire est déclarée conforme avant l'activation ;
 * - **quatre yeux** : la personne qui active n'est pas celle qui a déclaré les
 *   pièces conformes (modèle de la validation des crédits) ;
 * - tout motif (non-conformité, complément, refus, requalification) est
 *   obligatoire et communiqué à l'entreprise.
 * ================================================================== */

/**
 * L'agent traite-t-il ce type ? Lève sinon.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} g
 */
function exigerTypeTraite(ctx, g) {
  if (!agentTraiteType(ctx.roleId, g.type)) {
    throw new Error(
      `Les dossiers « ${labelOf(g.type)} » sont traités par un autre agent d’activation.`,
    );
  }
}

/** Groupement inscrit, brut, contrôlé pour l'agent. */
function entrepriseDe(ctx, groupementId) {
  exiger(ctx, 'inscription.activer', { groupementId });
  const g = depot('groupement').brutParId(groupementId);
  if (!g) throw new Error('Entreprise introuvable.');
  if (!estTypeInscriptible(g.type)) throw new Error('Ce groupement n’a pas de dossier d’inscription.');
  exigerTypeTraite(ctx, g);
  return g;
}

/** Ajoute un échange au fil du dossier. */
function echange(g, auteur, nature, texte) {
  return [...(g.inscriptionEchanges ?? []), { le: new Date().toISOString(), auteur, nature, texte }];
}

/** Motif obligatoire, borné. */
function motifExige(motif, message) {
  const t = String(motif ?? '').trim();
  if (!t) throw new Error(message);
  return t.slice(0, 500);
}

/**
 * Ce qui reste à faire sur un dossier, du point de vue de l'agent.
 * @param {Record<string, any>} g
 * @param {Array<Record<string, any>>} pieces
 * @returns {{aTraiter: boolean, raison: string}}
 */
function aFaire(g, pieces) {
  const etat = etatInscription(g);
  if (etat === ETAT_INSCRIPTION.EN_ATTENTE) {
    const b = bilanDossier(g.type, pieces);
    return { aTraiter: true, raison: b.complet ? 'Prêt à activer' : b.aControler.length ? 'Pièces à contrôler' : 'Dossier incomplet' };
  }
  if (etat === ETAT_INSCRIPTION.A_COMPLETER) return { aTraiter: false, raison: 'Complément attendu de l’entreprise' };
  if (g.modificationProposee) return { aTraiter: true, raison: 'Modification à contrôler' };
  if (etat === ETAT_INSCRIPTION.ACTIVEE && pieces.some((p) => p.etat === ETAT_PIECE.DEPOSEE)) {
    return { aTraiter: true, raison: 'Pièce renouvelée à contrôler' };
  }
  if (g.type === TYPE_GROUPEMENT.TRANSPORTEUR && etat === ETAT_INSCRIPTION.ACTIVEE
    && (g.verificationEtat ?? ETAT_VERIFICATION.A_VERIFIER) !== ETAT_VERIFICATION.VERIFIE) {
    return { aTraiter: true, raison: 'Vérification du transporteur' };
  }
  return { aTraiter: false, raison: '' };
}

/**
 * File des dossiers de l'agent : les entreprises des types qu'il traite.
 * **Lecture bornée** : ni téléphone, ni courriel, ni adresse, ni montant.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function dossiersInscription(ctx) {
  exiger(ctx, 'inscription.activer', { groupementId: null });
  const types = typesTraitesPar(ctx.roleId);
  const pieces = depot('piece').brutTous();
  const vehicules = depot('vehicule').brutTous();
  const chauffeurs = depot('chauffeur').brutTous();
  return depot('groupement')
    .brutOu((g) => types.includes(g.type))
    .map((g) => {
      const siennes = pieces.filter((p) => p.groupementId === g.id);
      const b = bilanDossier(g.type, siennes);
      const moyens = g.type === TYPE_GROUPEMENT.TRANSPORTEUR
        ? vehicules.filter((v) => v.groupementId === g.id && !v.verifieLe).length
          + chauffeurs.filter((c) => c.groupementId === g.id && !c.verifieLe).length
        : 0;
      return {
        id: g.id,
        raisonSociale: g.raisonSociale,
        type: g.type,
        rccm: g.rccm ?? null,
        codeBfci: g.codeBfci ?? null,
        etat: etatInscription(g),
        inscritLe: g.inscritLe ?? g.creeLe,
        activeLe: g.activeLe ?? null,
        verificationEtat: g.type === TYPE_GROUPEMENT.TRANSPORTEUR ? (g.verificationEtat ?? ETAT_VERIFICATION.A_VERIFIER) : null,
        piecesConformes: b.conformes.length,
        piecesRequises: typeInscription(g.type).piecesRequises.length,
        piecesAControler: siennes.filter((p) => p.etat === ETAT_PIECE.DEPOSEE).length,
        moyensAControler: moyens,
        modificationProposee: Boolean(g.modificationProposee),
        ...(() => {
          const f = aFaire(g, siennes);
          return !f.aTraiter && moyens > 0 ? { aTraiter: true, raison: 'Véhicules ou chauffeurs à contrôler' } : f;
        })(),
      };
    })
    .sort((a, b) => Number(b.aTraiter) - Number(a.aTraiter)
      || new Date(a.inscritLe) - new Date(b.inscritLe));
}

/**
 * Dossier complet d'une entreprise pour l'agent : identité, pièces, échanges.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @returns {Record<string, any>}
 */
export function dossierInscription(ctx, groupementId) {
  const g = entrepriseDe(ctx, groupementId);
  const pieces = depot('piece').brutOu((p) => p.groupementId === g.id);
  const bilan = bilanDossier(g.type, pieces);
  const etat = etatInscription(g);
  const courantes = piecesCourantes(pieces);
  const controleursConformes = new Set(
    typeInscription(g.type).piecesRequises
      .map((c) => courantes.get(c))
      .filter((p) => p?.etat === ETAT_PIECE.CONFORME)
      .map((p) => p.decideParUtilisateurId),
  );
  return {
    // Projeté : l'agent reçoit l'identité (`public`, `identite`), jamais les coordonnées.
    groupement: projeter(ctx, 'groupement', g),
    type: typeInscription(g.type),
    etat,
    pieces: projeterListe(ctx, 'piece', [...pieces].sort((a, b) => new Date(b.deposeLe) - new Date(a.deposeLe))),
    attendues: piecesDuType(g.type),
    bilan,
    echanges: [...(g.inscriptionEchanges ?? [])].reverse(),
    modificationProposee: g.modificationProposee ?? null,
    motifActivation: motifNonActivable(ctx, g, bilan, etat, controleursConformes),
    utilisateurs: depot('utilisateur').brutOu((u) => u.groupementId === g.id).length,
  };
}

/**
 * Motif pour lequel l'agent ne peut pas activer ce dossier, ou `null`.
 * @returns {string|null}
 */
function motifNonActivable(ctx, g, bilan, etat, controleursConformes) {
  if (etat === ETAT_INSCRIPTION.ACTIVEE) return 'Ce compte est déjà activé.';
  if (etat === ETAT_INSCRIPTION.REFUSEE) return 'Cette inscription a été refusée.';
  if (etat === ETAT_INSCRIPTION.A_COMPLETER) return 'Un complément est demandé : l’entreprise doit transmettre son dossier complété.';
  if (!bilan.complet) {
    const reste = [...bilan.manquantes, ...bilan.aControler, ...bilan.nonConformes];
    return `Chaque pièce obligatoire doit être déclarée conforme. Reste : ${reste.map(libellePiece).join(', ')}.`;
  }
  if (controleursConformes.has(ctx.utilisateurId)) {
    return 'Vous avez déclaré des pièces conformes : l’activation revient à un autre agent (principe des quatre yeux).';
  }
  return null;
}

/**
 * Décision sur une pièce : conforme, ou non conforme avec motif.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} pieceId
 * @param {{conforme: boolean, motif?: string}} decision
 * @returns {Record<string, any>}
 */
export function deciderPiece(ctx, pieceId, { conforme, motif }) {
  const p = depot('piece').brutParId(pieceId);
  if (!p) throw new Error('Pièce introuvable.');
  const g = entrepriseDe(ctx, p.groupementId);
  const etat = etatInscription(g);
  if (p.etat === ETAT_PIECE.REMPLACEE) throw new Error('Cette pièce a été remplacée par l’entreprise : contrôlez la plus récente.');
  if (etat === ETAT_INSCRIPTION.REFUSEE) throw new Error('Cette inscription a été refusée.');
  if (etat === ETAT_INSCRIPTION.ACTIVEE && p.etat !== ETAT_PIECE.DEPOSEE) {
    throw new Error('Le compte est activé : seule une pièce nouvellement déposée se contrôle.');
  }
  if (!typeInscription(g.type).piecesRequises.concat(typeInscription(g.type).piecesFacultatives).includes(p.typePiece)) {
    throw new Error('Cette pièce n’est pas prévue pour ce type d’entreprise.');
  }
  if (conforme && p.expireLe && new Date(`${p.expireLe}T23:59:59`) < new Date()) {
    throw new Error('Cette pièce est échue : elle ne peut pas être déclarée conforme.');
  }
  const texte = conforme ? null : motifExige(motif, 'Une pièce non conforme porte son motif : l’entreprise doit savoir quoi corriger.');

  return stockageInterne().transaction((tx) => {
    const maj = depot('piece').modifier(p.id, {
      etat: conforme ? ETAT_PIECE.CONFORME : ETAT_PIECE.NON_CONFORME,
      motif: texte,
      decideLe: new Date().toISOString(),
      decideParUtilisateurId: ctx.utilisateurId,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.PIECE_CONTROLEE, {
      cibleType: 'groupement',
      cibleId: g.id,
      details: `${libellePiece(p.typePiece)} : ${conforme ? 'conforme' : 'non conforme'}.`,
      tx,
    });
    return maj;
  });
}

/**
 * Demande un complément : le dossier revient à l'entreprise avec le motif.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {string} motif
 */
export function demanderComplement(ctx, groupementId, motif) {
  const g = entrepriseDe(ctx, groupementId);
  if (etatInscription(g) !== ETAT_INSCRIPTION.EN_ATTENTE) {
    throw new Error('Un complément ne se demande que sur un dossier en attente de vérification.');
  }
  const texte = motifExige(motif, 'Précisez le complément attendu : l’entreprise doit savoir quoi fournir.');
  return transitionInscription(ctx, g, {
    etat: ETAT_INSCRIPTION.A_COMPLETER, texte, nature: 'complement',
    evenement: EVENEMENT_AUDIT.COMPLEMENT_DEMANDE, details: 'Complément demandé à l’entreprise.',
    modele: 'complement.demande',
  });
}

/**
 * Refuse l'inscription, motif à l'appui. Le compte reste limité à son dossier,
 * en lecture.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {string} motif
 */
export function refuserInscription(ctx, groupementId, motif) {
  const g = entrepriseDe(ctx, groupementId);
  if (![ETAT_INSCRIPTION.EN_ATTENTE, ETAT_INSCRIPTION.A_COMPLETER].includes(etatInscription(g))) {
    throw new Error('Seule une inscription en cours d’examen peut être refusée.');
  }
  const texte = motifExige(motif, 'Un refus porte son motif : il est communiqué à l’entreprise.');
  return transitionInscription(ctx, g, {
    etat: ETAT_INSCRIPTION.REFUSEE, texte, nature: 'refus',
    evenement: EVENEMENT_AUDIT.INSCRIPTION_REFUSEE, details: 'Inscription refusée par l’agent d’activation.',
    modele: 'inscription.refusee',
  });
}

function transitionInscription(ctx, g, { etat, texte, nature, evenement, details, modele }) {
  return stockageInterne().transaction((tx) => {
    const maj = depot('groupement').modifier(g.id, {
      inscriptionEtat: etat,
      inscriptionMotif: texte,
      inscriptionEchanges: echange(g, 'oic', nature, texte),
    }, { tx });
    journaliser(ctx, evenement, { cibleType: 'groupement', cibleId: g.id, details, tx });
    envoyerModele({
      modele, params: { raisonSociale: g.raisonSociale, motif: texte }, groupementId: g.id, tx,
      expediteur: { utilisateurId: ctx.utilisateurId, roleId: ctx.roleId },
    });
    return maj;
  });
}

/**
 * **Active** le compte d'une entreprise : code d'entreprise, période
 * d'abonnement initiale au tarif du catalogue, message d'activation. Pour un
 * transporteur, prononce aussi la vérification de son dossier.
 *
 * Impossible tant qu'une pièce obligatoire n'est pas conforme, et par la personne
 * qui a déclaré les pièces conformes.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @returns {Record<string, any>} Le groupement activé.
 */
export function activerEntreprise(ctx, groupementId) {
  const g = entrepriseDe(ctx, groupementId);
  const d = dossierInscription(ctx, groupementId);
  if (d.motifActivation) throw new Error(d.motifActivation);
  const courantes = piecesCourantes(depot('piece').brutOu((p) => p.groupementId === g.id));
  for (const code of typeInscription(g.type).piecesRequises) {
    const p = courantes.get(code);
    if (p?.expireLe && new Date(`${p.expireLe}T23:59:59`) < new Date()) {
      throw new Error(`${libellePiece(code)} est échue depuis son contrôle : demandez une pièce à jour.`);
    }
  }
  const tarif = depot('tarif').brutParId(CODE_TARIF.ABONNEMENT_ANNUEL);
  if (!tarif || tarif.actif === false) {
    throw new Error('Le catalogue ne porte pas de tarif d’abonnement actif : l’activation est impossible.');
  }

  const maintenant = new Date();
  const annee = maintenant.getFullYear();
  const prefixe = `BFCI-${annee}-`;
  const rang = depot('groupement').brutOu((x) => String(x.codeBfci ?? '').startsWith(prefixe)).length + 1;
  const code = codeBfci(annee, rang);
  const periode = periodeInitiale(maintenant);

  return stockageInterne().transaction((tx) => {
    /** @type {Record<string, any>} */
    const maj = {
      inscriptionEtat: ETAT_INSCRIPTION.ACTIVEE,
      codeBfci: code,
      activeLe: maintenant.toISOString(),
      activeParUtilisateurId: ctx.utilisateurId,
      inscriptionMotif: null,
      inscriptionEchanges: echange(g, 'oic', 'activation', `Compte activé — code d’entreprise ${code}.`),
    };
    if (g.type === TYPE_GROUPEMENT.TRANSPORTEUR) {
      Object.assign(maj, {
        verificationEtat: ETAT_VERIFICATION.VERIFIE,
        verificationPieces: Object.values(PIECE_DOSSIER),
        verifieLe: maintenant.toISOString(),
        verifieParUtilisateurId: ctx.utilisateurId,
        verificationMotif: null,
      });
    }
    const active = depot('groupement').modifier(g.id, maj, { tx });
    depot('abonnement').creer({
      id: identifiant('abo'),
      groupementId: g.id,
      montant: tarif.montant,
      devise: tarif.devise,
      debuteLe: periode.debuteLe,
      finitLe: periode.finitLe,
      etat: ETAT_ABONNEMENT.ACTIF,
      creeLe: maintenant.toISOString(),
      demo: true,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.ENTREPRISE_ACTIVEE, {
      cibleType: 'groupement',
      cibleId: g.id,
      details: `Compte activé (${labelOf(g.type)}) — code ${code}, abonnement initial ouvert.`,
      tx,
    });
    envoyerModele({
      modele: 'entreprise.activee',
      params: {
        raisonSociale: g.raisonSociale,
        code,
        debut: formatJour(periode.debuteLe),
        fin: formatJour(periode.finitLe),
      },
      groupementId: g.id,
      canaux: [CANAL_MESSAGE.COURRIEL, CANAL_MESSAGE.SMS],
      tx,
      expediteur: { utilisateurId: ctx.utilisateurId, roleId: ctx.roleId },
    });
    return active;
  });
}

/** JJ/MM/AAAA, sans dépendre de la vue. */
function formatJour(iso) {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

/**
 * Requalifie une entreprise : change son type, avec motif et trace. Les comptes
 * de ses utilisateurs suivent (responsable → rôle principal du nouveau type,
 * sous-comptes → rôle auxiliaire). Les champs propres au nouveau type sont
 * fournis par l'agent s'ils manquent.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {{type: string, motif: string, champs?: Record<string, string>}} saisie
 * @returns {Record<string, any>}
 */
export function requalifierEntreprise(ctx, groupementId, { type, motif, champs = {} }) {
  const g = entrepriseDe(ctx, groupementId);
  if (!estTypeInscriptible(type)) throw new Error('Choisissez le nouveau type de l’entreprise.');
  if (type === g.type) throw new Error('L’entreprise est déjà de ce type.');
  if (etatInscription(g) === ETAT_INSCRIPTION.REFUSEE) throw new Error('Cette inscription a été refusée.');
  const texte = motifExige(motif, 'Une requalification porte son motif : il est communiqué à l’entreprise.');
  const nouveau = typeInscription(type);

  /** @type {Record<string, any>} */
  const propres = {};
  for (const c of nouveau.champs) {
    const v = String(champs[c.nom] ?? g[c.nom] ?? '').trim();
    if (c.requis && !v) throw new Error(`Renseignez « ${c.libelle} » pour requalifier l’entreprise.`);
    if (v) propres[c.nom] = v;
  }
  const avant = labelOf(g.type);
  const apres = labelOf(type);

  return stockageInterne().transaction((tx) => {
    /** @type {Record<string, any>} */
    const maj = {
      ...propres,
      type,
      inscriptionEchanges: echange(g, 'oic', 'requalification', `Requalifiée : ${avant} → ${apres}. ${texte}`),
    };
    if (type === TYPE_GROUPEMENT.TRANSPORTEUR && !g.verificationEtat) maj.verificationEtat = ETAT_VERIFICATION.A_VERIFIER;
    const res = depot('groupement').modifier(g.id, maj, { tx });
    for (const u of tx.lire('users').filter((x) => x.groupementId === g.id)) {
      const roleId = roleApresRequalification(u.roleId, g.type, type);
      if (roleId !== u.roleId) depot('utilisateur').modifier(u.id, { roleId }, { tx });
    }
    journaliser(ctx, EVENEMENT_AUDIT.ENTREPRISE_REQUALIFIEE, {
      cibleType: 'groupement',
      cibleId: g.id,
      details: `Type modifié : ${avant} → ${apres}.`,
      tx,
    });
    envoyerModele({
      modele: 'entreprise.requalifiee',
      params: { raisonSociale: g.raisonSociale, avant, apres, motif: texte },
      groupementId: g.id,
      tx,
      expediteur: { utilisateurId: ctx.utilisateurId, roleId: ctx.roleId },
    });
    return res;
  });
}

/**
 * Accepte ou refuse la modification d'identité demandée après activation.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {{accepter: boolean, motif?: string}} decision
 */
export function deciderModification(ctx, groupementId, { accepter, motif }) {
  const g = entrepriseDe(ctx, groupementId);
  const proposee = g.modificationProposee;
  if (!proposee?.champs) throw new Error('Aucune modification n’est en attente sur ce dossier.');
  const texte = accepter ? null : motifExige(motif, 'Un refus porte son motif : il est communiqué à l’entreprise.');
  if (accepter) {
    const autres = depot('groupement').brutOu((x) => x.id !== g.id);
    const norme = (v) => String(v ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
    for (const champ of ['rccm', 'compteContribuable']) {
      const v = proposee.champs[champ];
      if (v && autres.some((x) => x[champ] && norme(x[champ]) === norme(v))) {
        throw new Error('Le numéro demandé appartient déjà à une autre entreprise : la modification ne peut pas être acceptée.');
      }
    }
  }
  return stockageInterne().transaction((tx) => {
    const maj = depot('groupement').modifier(g.id, {
      ...(accepter ? proposee.champs : {}),
      modificationProposee: null,
      inscriptionEchanges: echange(g, 'oic', 'modification', accepter ? 'Modification de la fiche acceptée.' : `Modification refusée : ${texte}`),
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.MODIFICATION_DECIDEE, {
      cibleType: 'groupement',
      cibleId: g.id,
      details: accepter ? 'Modification d’identité acceptée et appliquée.' : 'Modification d’identité refusée.',
      tx,
    });
    envoyerModele({
      modele: accepter ? 'modification.acceptee' : 'modification.refusee',
      params: { raisonSociale: g.raisonSociale, motif: texte },
      groupementId: g.id,
      tx,
      expediteur: { utilisateurId: ctx.utilisateurId, roleId: ctx.roleId },
    });
    return maj;
  });
}

/**
 * Contacte l'entreprise depuis son dossier. L'agent ne voit pas ses
 * coordonnées : le message part à l'adresse enregistrée de chaque utilisateur.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {{objet: string, corps: string, canaux: string[]}} saisie
 */
export function contacterEntreprise(ctx, groupementId, saisie) {
  entrepriseDe(ctx, groupementId);
  return envoyerAuGroupement(ctx, groupementId, saisie);
}
