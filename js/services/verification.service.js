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
} from '../domain/enums.js';
import { exiger } from '../domain/access.js';
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
  return attester(ctx, 'chauffeur', c, EVENEMENT_AUDIT.CHAUFFEUR_VERIFIE,
    'Chauffeur contrôlé : permis de conduire.');
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
  chauffeur: Object.freeze(['nom', 'permisNumero', 'permisEcheance']),
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
