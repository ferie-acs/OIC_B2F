/**
 * Attestation de bourse de fret — émission, impression, annulation (lot b3).
 *
 * ## Ce que l'attestation atteste
 *
 * Qu'un transport a été conclu **par la plateforme** : une mise en relation
 * validée, dont les frais ont été réglés de part et d'autre. Elle voyage avec le
 * camion et se vérifie sur route par son QR code.
 *
 * ## Le jeton, et pourquoi
 *
 * Le QR ne porte ni l'identifiant interne ni la référence, qui se devinent
 * (`ABF-2026-0001`, `0002`…) : il porte un **jeton de 120 bits** tiré au hasard,
 * classé `systeme` au schéma, donc jamais projeté. Seul ce service le rend, et
 * au seul transporteur titulaire, pour l'impression. Énumérer les attestations
 * depuis la page publique est ainsi hors de portée.
 *
 * @module services/attestation.service
 */

import { identifiant } from '../core/crypto.js';
import {
  ETAPE_TRANSPORT,
  ETAT_APPARIEMENT,
  ETAT_ATTESTATION,
  EVENEMENT_AUDIT,
} from '../domain/enums.js';
import { decider, exiger, projeter } from '../domain/access.js';
import {
  cheminVerification,
  codeLisible,
  etatAttestation,
  finValidite,
  jetonDepuis,
} from '../domain/attestation.regles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

const libelle = (id) => depot('referentiel').brutParId(id)?.libelle ?? '—';

/** Tire un jeton inédit. */
function nouveauJeton() {
  for (let essai = 0; essai < 5; essai += 1) {
    const jeton = jetonDepuis(globalThis.crypto.getRandomValues(new Uint8Array(15)));
    if (!depot('attestation').brutOu((a) => a.jeton === jeton).length) return jeton;
  }
  throw new Error('Le code de vérification n’a pas pu être tiré. Réessayez.');
}

/** Référence lisible `ABF-AAAA-NNNN`. */
function referenceAttestation() {
  const n = depot('attestation').brutTous().length + 1;
  return `ABF-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}

/**
 * Éléments du dossier : offre, demande, déclaration, véhicule.
 * @param {Record<string, any>} a Appariement brut.
 */
function sourcesDe(a) {
  const offre = depot('offre').brutParId(a.offreId);
  const demande = depot('demande').brutParId(a.demandeId);
  const declaration = demande ? depot('declaration').brutParId(demande.declarationId) : null;
  const vehicule = offre ? depot('vehicule').brutParId(offre.vehiculeId) : null;
  const transport = depot('transport').brutOu((t) => t.appariementId === a.id)[0] ?? null;
  return { offre, demande, declaration, vehicule, transport };
}

/** Attestation telle que l'écran la reçoit : projetée, état calculé, sans jeton. */
function vue(ctx, att) {
  return { ...projeter(ctx, 'attestation', att), etatCourant: etatAttestation(att) };
}

/**
 * Peut-on émettre une attestation pour cette mise en relation ?
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} a Appariement brut.
 * @param {Array<Record<string, any>>} existantes Attestations de ce dossier.
 * @returns {{emettable: boolean, motif: string|null}}
 */
function emissibilite(ctx, a, existantes) {
  const droit = decider(ctx, 'attestation.generer', { groupementId: a.groupementTransporteurId });
  if (!droit.autorise) return { emettable: false, motif: droit.explication };
  if (a.etat !== ETAT_APPARIEMENT.VALIDER) {
    return { emettable: false, motif: 'L’attestation n’est émise que pour une mise en relation validée.' };
  }
  if (!a.operationAffreteurId || !a.operationTransporteurId) {
    return { emettable: false, motif: 'Les frais de mise en relation n’ont pas été réglés par les deux parties.' };
  }
  if (existantes.some((x) => etatAttestation(x) === ETAT_ATTESTATION.EN_VIGUEUR)) {
    return { emettable: false, motif: 'Une attestation est déjà en vigueur pour ce transport. Annulez-la pour en émettre une nouvelle.' };
  }
  const { demande, transport } = sourcesDe(a);
  if (transport && [ETAPE_TRANSPORT.CLOTURE].includes(transport.etape)) {
    return { emettable: false, motif: 'Ce transport est clôturé : aucune attestation n’est plus nécessaire.' };
  }
  if (!demande || new Date(finValidite(demande.arriveePrevue)).getTime() < Date.now()) {
    return { emettable: false, motif: 'La période de ce transport est terminée : une attestation naîtrait expirée.' };
  }
  return { emettable: true, motif: null };
}

/**
 * Mises en relation validées du transporteur, avec leur attestation.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function dossiersAttestation(ctx) {
  exiger(ctx, 'attestation.lire', undefined);
  const attestations = depot('attestation').brutOu((x) => x.groupementTransporteurId === ctx.groupementId);
  return depot('appariement')
    .brutOu((a) => a.etat === ETAT_APPARIEMENT.VALIDER && a.groupementTransporteurId === ctx.groupementId)
    .map((a) => {
      const liees = attestations
        .filter((x) => x.appariementId === a.id)
        .sort((x, y) => new Date(y.genereeLe) - new Date(x.genereeLe));
      const { demande, declaration, vehicule, transport } = sourcesDe(a);
      return {
        appariement: projeter(ctx, 'appariement', a, { proprietaireId: ctx.groupementId }),
        attestation: liees[0] ? vue(ctx, liees[0]) : null,
        historique: liees.map((x) => vue(ctx, x)),
        trajet: {
          depart: libelle(declaration?.provenanceId),
          arrivee: libelle(declaration?.destinationId),
          departPrevu: demande?.departPrevu ?? null,
          arriveePrevue: demande?.arriveePrevue ?? null,
        },
        // Le véhicule appartient au lecteur : la projection le lui sert en entier.
        immatriculation: vehicule ? depot('vehicule').lire(ctx, vehicule.id)?.immatriculation ?? '—' : '—',
        etapeTransport: transport?.etape ?? null,
        ...emissibilite(ctx, a, liees),
      };
    })
    .sort((x, y) => new Date(y.appariement.valideLe) - new Date(x.appariement.valideLe));
}

/**
 * Émet l'attestation d'une mise en relation validée et payée.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @returns {Record<string, any>} L'attestation, projetée (sans jeton).
 */
export function emettreAttestation(ctx, appariementId) {
  const a = depot('appariement').brutParId(appariementId);
  if (!a) throw new Error('Mise en relation introuvable.');
  exiger(ctx, 'attestation.generer', { groupementId: a.groupementTransporteurId });
  const existantes = depot('attestation').brutOu((x) => x.appariementId === a.id);
  const { emettable, motif } = emissibilite(ctx, a, existantes);
  if (!emettable) throw new Error(motif);

  const { demande, declaration, vehicule } = sourcesDe(a);
  if (!demande || !declaration || !vehicule) {
    throw new Error('Le dossier est incomplet : la demande, le fret ou le véhicule est introuvable.');
  }
  const maintenant = new Date().toISOString();

  return stockageInterne().transaction((tx) => {
    const att = depot('attestation').creer(
      {
        id: identifiant('att'),
        reference: referenceAttestation(),
        appariementId: a.id,
        groupementTransporteurId: a.groupementTransporteurId,
        groupementAffreteurId: a.groupementAffreteurId,
        jeton: nouveauJeton(),
        immatriculation: vehicule.immatriculation,
        localiteDepartId: declaration.provenanceId,
        localiteArriveeId: declaration.destinationId,
        departPrevu: demande.departPrevu,
        arriveePrevue: demande.arriveePrevue,
        valableJusquau: finValidite(demande.arriveePrevue),
        etat: ETAT_ATTESTATION.EN_VIGUEUR,
        genereeLe: maintenant,
        genereeParUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.ATTESTATION_GENEREE, {
      cibleType: 'attestation',
      cibleId: att.id,
      details: `Attestation ${att.reference} émise pour la mise en relation ${a.reference}.`,
      tx,
    });
    return vue(ctx, att);
  });
}

/**
 * Tout ce qu'il faut pour imprimer : le document et **son jeton**, rendu au seul
 * transporteur titulaire.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} attestationId
 * @returns {Record<string, any>}
 */
export function attestationPourImpression(ctx, attestationId) {
  const att = depot('attestation').brutParId(attestationId);
  if (!att) throw new Error('Attestation introuvable.');
  exiger(ctx, 'attestation.lire', { groupementId: att.groupementTransporteurId });
  if (att.groupementTransporteurId !== ctx.groupementId) {
    throw new Error('Cette attestation ne concerne pas votre groupement.');
  }
  const a = depot('appariement').brutParId(att.appariementId);
  const { offre, demande, declaration, vehicule } = sourcesDe(a);
  const chauffeur = offre?.chauffeurPressentiId ? depot('chauffeur').brutParId(offre.chauffeurPressentiId) : null;
  const groupe = (id) => depot('groupement').lire(ctx, id, { proprietaireId: id }) ?? {};
  const poids = (demande?.lignes ?? []).reduce((n, l) => n + (Number(l.poidsT) || 0), 0);
  return {
    attestation: vue(ctx, att),
    jeton: att.jeton,
    code: codeLisible(att.jeton),
    chemin: cheminVerification(att.jeton),
    document: {
      reference: att.reference,
      etat: etatAttestation(att),
      appariementReference: a?.reference ?? '',
      valideLe: a?.valideLe ?? null,
      transporteur: groupe(att.groupementTransporteurId).raisonSociale ?? '',
      affreteur: groupe(att.groupementAffreteurId).raisonSociale ?? '',
      immatriculation: att.immatriculation,
      carteTransportNumero: vehicule?.carteTransportNumero ?? '',
      chauffeur: chauffeur?.nom ?? '',
      depart: libelle(att.localiteDepartId),
      arrivee: libelle(att.localiteArriveeId),
      departPrevu: att.departPrevu,
      arriveePrevue: att.arriveePrevue,
      marchandise: declaration?.libelle ?? '',
      poidsT: poids || null,
      genereeLe: att.genereeLe,
      valableJusquau: att.valableJusquau,
    },
  };
}

/**
 * Annule une attestation en vigueur — transport interrompu, véhicule remplacé.
 * Le contrôle sur route le dira aussitôt.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} attestationId
 * @param {string} motif
 * @returns {Record<string, any>}
 */
export function annulerAttestation(ctx, attestationId, motif) {
  const att = depot('attestation').brutParId(attestationId);
  if (!att) throw new Error('Attestation introuvable.');
  exiger(ctx, 'attestation.generer', { groupementId: att.groupementTransporteurId });
  if (etatAttestation(att) !== ETAT_ATTESTATION.EN_VIGUEUR) {
    throw new Error('Seule une attestation en vigueur peut être annulée.');
  }
  const raison = String(motif ?? '').trim();
  if (!raison) throw new Error('Indiquez le motif de l’annulation : il sera conservé.');
  if (raison.length > 300) throw new Error('Le motif ne doit pas dépasser 300 caractères.');

  return stockageInterne().transaction((tx) => {
    const maj = depot('attestation').modifier(
      att.id,
      {
        etat: ETAT_ATTESTATION.ANNULEE,
        annuleeLe: new Date().toISOString(),
        annuleeParUtilisateurId: ctx.utilisateurId,
        motifAnnulation: raison,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.ATTESTATION_ANNULEE, {
      cibleType: 'attestation',
      cibleId: att.id,
      details: `Attestation ${att.reference} annulée par le transporteur.`,
      tx,
    });
    return vue(ctx, maj);
  });
}

/**
 * Attestation portant un jeton — pour le seul service de contrôle.
 * @param {string|null} jeton Jeton normalisé.
 * @returns {Record<string, any>|null} Objet brut.
 */
export function attestationParJeton(jeton) {
  if (!jeton) return null;
  return depot('attestation').brutOu((a) => a.jeton === jeton)[0] ?? null;
}
