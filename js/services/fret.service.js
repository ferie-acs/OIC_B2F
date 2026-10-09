/**
 * Fret : déclarations, demandes de transport, lignes de marchandise.
 *
 * La publication crée la déclaration, la demande et ses lignes **en une seule
 * transaction applicative** (spécification B.3) : une déclaration sans demande
 * serait un orphelin que rien ne rattraperait.
 *
 * @module services/fret.service
 */

import { identifiant } from '../core/crypto.js';
import {
  ETAT_DECLARATION,
  ETAT_DEMANDE,
  ETAT_APPARIEMENT,
  EVENEMENT_AUDIT,
} from '../domain/enums.js';
import { exiger } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { reference } from './matching.service.js';

/**
 * Publie un fret : déclaration + demande + lignes, d'un bloc.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {object} saisie
 * @param {{libelle: string, provenanceId: string, destinationId: string, observation?: string}} saisie.fret
 * @param {{departPrevu: string, arriveePrevue: string, capaciteId: string, carrosserieId: string, essieuxId?: string, contraintes?: string}} saisie.besoin
 * @param {Array<{produitId: string, poidsT: number, volumeM3?: number, nombreColis?: number, emballageId?: string}>} saisie.lignes
 * @param {{brouillon?: boolean}} [options]
 * @returns {{declaration: Record<string, any>, demande: Record<string, any>}}
 */
export function publierFret(ctx, { fret, besoin, lignes }, options = {}) {
  exiger(ctx, 'declaration.creer', { groupementId: ctx.groupementId });
  if (!options.brouillon) exiger(ctx, 'demande.publier', { groupementId: ctx.groupementId });

  const maintenant = new Date().toISOString();
  // Le départ dans le passé est refusé à la publication, pas au brouillon
  // (règle de validation § 2.3 de la conception UX).
  if (!options.brouillon && new Date(besoin.departPrevu) < new Date()) {
    throw new Error(
      'La date de départ est déjà passée. Corrigez-la avant de publier, ou ' +
        'enregistrez en brouillon.',
    );
  }

  return stockageInterne().transaction((tx) => {
    const declaration = depot('declaration').creer(
      {
        id: identifiant('dec'),
        reference: reference('DF'),
        groupementId: ctx.groupementId,
        libelle: fret.libelle,
        provenanceId: fret.provenanceId,
        destinationId: fret.destinationId,
        observation: fret.observation,
        etat: options.brouillon ? ETAT_DECLARATION.BROUILLON : ETAT_DECLARATION.ACTIVE,
        creeeLe: maintenant,
        creeeParUtilisateurId: ctx.utilisateurId,
        publieeLe: options.brouillon ? undefined : maintenant,
        demo: true,
      },
      { tx },
    );

    const demande = depot('demande').creer(
      {
        id: identifiant('dem'),
        reference: reference('DT'),
        declarationId: declaration.id,
        groupementId: ctx.groupementId,
        departPrevu: besoin.departPrevu,
        arriveePrevue: besoin.arriveePrevue,
        capaciteId: besoin.capaciteId,
        carrosserieId: besoin.carrosserieId,
        essieuxId: besoin.essieuxId,
        contraintes: besoin.contraintes,
        lignes: lignes.map((l) => ({ id: identifiant('lig'), ...l })),
        etat: options.brouillon ? ETAT_DEMANDE.BROUILLON : ETAT_DEMANDE.PUBLIEE,
        creeeLe: maintenant,
        creeeParUtilisateurId: ctx.utilisateurId,
        publieeLe: options.brouillon ? undefined : maintenant,
        demo: true,
      },
      { tx },
    );

    if (!options.brouillon) {
      journaliser(ctx, EVENEMENT_AUDIT.DECLARATION_PUBLIEE, {
        cibleType: 'demande',
        cibleId: demande.id,
        details: `Demande ${demande.reference} publiée.`,
        tx,
      });
    }

    return { declaration, demande };
  });
}

/**
 * Annule une demande. Impossible après validation : un débit a eu lieu.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} demandeId
 */
export function annulerDemande(ctx, demandeId) {
  const d = depot('demande').brutParId(demandeId);
  if (!d) throw new Error('Demande introuvable.');
  exiger(ctx, 'demande.annuler', { groupementId: d.groupementId });

  if (d.etat === ETAT_DEMANDE.VALIDEE) {
    throw new Error(
      'Cette demande a donné lieu à une mise en relation validée et à un débit. ' +
        'Elle ne peut plus être annulée. Pour interrompre le transport, contactez ' +
        'le transporteur et signalez un incident.',
    );
  }

  const enCours = depot('appariement').brutOu(
    (a) =>
      a.demandeId === demandeId &&
      (a.etat === ETAT_APPARIEMENT.RESERVER || a.etat === ETAT_APPARIEMENT.ACCEPTER),
  );
  if (enCours.length > 0) {
    throw new Error(
      'Une réservation est en cours sur cette demande. Annulez-la d’abord : ' +
        'le transporteur doit être informé.',
    );
  }

  return stockageInterne().transaction((tx) => {
    const maj = depot('demande').modifier(
      demandeId,
      { etat: ETAT_DEMANDE.ANNULEE, annuleeLe: new Date().toISOString() },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.DEMANDE_ANNULEE, {
      cibleType: 'demande',
      cibleId: demandeId,
      details: `Demande ${d.reference} annulée.`,
      tx,
    });
    return maj;
  });
}

/**
 * Demandes du groupement, projetées, avec leur signalement de date dépassée.
 * Le calcul se fait **à l'affichage** — aucune tâche planifiée (M2.5).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} [etat] Filtre d'onglet.
 * @returns {Array<Record<string, any>>}
 */
export function mesDemandes(ctx, etat = undefined) {
  return depot('demande')
    .lisiblesPar(ctx, 'demande.lire', (d) => !etat || d.etat === etat)
    .map((d) => ({
      ...d,
      departDepasse:
        d.etat !== ETAT_DEMANDE.VALIDEE &&
        d.etat !== ETAT_DEMANDE.ANNULEE &&
        new Date(d.departPrevu) < new Date(),
    }))
    .sort((a, b) => new Date(b.creeeLe) - new Date(a.creeeLe));
}

/**
 * Déclarations du groupement, avec le nombre de demandes rattachées.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function mesDeclarations(ctx) {
  const demandes = depot('demande').brutTous();
  return depot('declaration')
    .lisiblesPar(ctx, 'declaration.lire')
    .map((d) => ({
      ...d,
      nbDemandes: demandes.filter((x) => x.declarationId === d.id).length,
    }))
    .sort((a, b) => new Date(b.creeeLe) - new Date(a.creeeLe));
}

/**
 * Demandes publiées par d'autres — le second sens du flux (M3.3).
 *
 * La portée `MARCHE` exige un état de publication : le filtre est appliqué ici
 * **avant** la projection, et la cible le porte explicitement (finding S7).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{departId?: string, arriveeId?: string, carrosserieId?: string}} [filtres]
 * @returns {Array<Record<string, any>>}
 */
export function marcheDesDemandes(ctx, filtres = {}) {
  exiger(ctx, 'marche.demandes', { groupementId: null, publie: true });

  const declarations = new Map(depot('declaration').brutTous().map((d) => [d.id, d]));

  return depot('demande')
    .brutOu((d) => d.etat === ETAT_DEMANDE.PUBLIEE && d.groupementId !== ctx.groupementId)
    .filter((d) => {
      const dec = declarations.get(d.declarationId);
      if (!dec) return false;
      if (filtres.departId && dec.provenanceId !== filtres.departId) return false;
      if (filtres.arriveeId && dec.destinationId !== filtres.arriveeId) return false;
      if (filtres.carrosserieId && d.carrosserieId !== filtres.carrosserieId) return false;
      return true;
    })
    .map((d) => {
      const dec = declarations.get(d.declarationId);
      return {
        ...projeterDemandeDeMarche(ctx, d),
        provenanceId: dec.provenanceId,
        destinationId: dec.destinationId,
        libelleFret: dec.libelle,
      };
    });
}

/**
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} demande
 */
function projeterDemandeDeMarche(ctx, demande) {
  return depot('demande').lire(ctx, demande.id, { proprietaireId: null }) ?? {};
}
