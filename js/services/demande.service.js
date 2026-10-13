/**
 * Demandes de transport : modification et republication, avec trace (lot b3).
 *
 * ## Les deux gestes, et leurs bornes
 *
 * - **Modifier** une demande n'est possible que tant qu'**aucune réservation ni
 *   proposition n'est engagée** : un transporteur qui a répondu à un fret doit
 *   transporter ce fret-là. C'est la règle du système existant (« tant qu'aucune
 *   offre de véhicule n'a été reçue »).
 * - **Republier** rend au marché une demande **annulée** ou **expirée** (date de
 *   départ dépassée), avec de nouvelles dates. La demande garde sa référence.
 *
 * Chaque geste est inscrit au journal d'audit et dans l'historique de la
 * demande : date, action, auteur et **nature** des champs changés — jamais leurs
 * valeurs. Les textes libres passent le filtre des coordonnées (correctif
 * anti-fraude n° 1) : ils sont lus par les transporteurs avant toute validation.
 *
 * @module services/demande.service
 */

import { identifiant } from '../core/crypto.js';
import { ETAT_APPARIEMENT, ETAT_DEMANDE, EVENEMENT_AUDIT } from '../domain/enums.js';
import { exiger } from '../domain/access.js';
import { refuserCoordonnees } from '../domain/texte.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

/** Champs suivis par la trace, avec leur libellé. */
const LIBELLES = Object.freeze({
  libelle: 'libellé du fret',
  provenanceId: 'provenance',
  destinationId: 'destination',
  observation: 'observation',
  departPrevu: 'départ',
  arriveePrevue: 'arrivée',
  capaciteId: 'capacité',
  carrosserieId: 'carrosserie',
  essieuxId: 'essieux',
  contraintes: 'contraintes',
  lignes: 'marchandises',
});

const texte = (v) => String(v ?? '').trim();

function referentiel(id, famille, libelle, facultatif = false) {
  if (!id && facultatif) return null;
  const r = depot('referentiel').brutParId(id);
  if (!r || r.famille !== famille || !r.actif) {
    throw new Error(`${libelle} : choisissez une valeur disponible dans la liste.`);
  }
  return id;
}

function dates(departPrevu, arriveePrevue) {
  const d = new Date(departPrevu);
  const a = new Date(arriveePrevue);
  if (!Number.isFinite(d.getTime()) || !Number.isFinite(a.getTime())) {
    throw new Error('Renseignez une date de départ et une date d’arrivée valides.');
  }
  if (d.getTime() < Date.now()) throw new Error('La date de départ est déjà passée : choisissez une date à venir.');
  if (a <= d) throw new Error('L’arrivée doit être strictement postérieure au départ.');
  return { departPrevu: d.toISOString(), arriveePrevue: a.toISOString() };
}

function appariementsEngages(demandeId) {
  return depot('appariement').brutOu(
    (a) => a.demandeId === demandeId && [ETAT_APPARIEMENT.RESERVER, ETAT_APPARIEMENT.ACCEPTER].includes(a.etat),
  );
}

/**
 * La demande peut-elle être modifiée ?
 * @param {Record<string, any>} d
 * @returns {{modifiable: boolean, motif: string|null}}
 */
export function modifiabiliteDemande(d) {
  if (![ETAT_DEMANDE.PUBLIEE, ETAT_DEMANDE.BROUILLON].includes(d.etat) || appariementsEngages(d.id).length) {
    return {
      modifiable: false,
      motif:
        d.etat === ETAT_DEMANDE.VALIDEE
          ? 'Mise en relation validée : la demande ne se modifie plus.'
          : d.etat === ETAT_DEMANDE.ANNULEE
            ? 'Cette demande est annulée. Republiez-la pour la rendre de nouveau visible.'
            : 'Réservation ou proposition engagée : la demande ne se modifie plus.',
    };
  }
  return { modifiable: true, motif: null };
}

/**
 * La demande peut-elle être republiée ?
 * @param {Record<string, any>} d
 * @returns {{republiable: boolean, motif: string|null}}
 */
export function republiabilite(d) {
  const expiree = d.etat === ETAT_DEMANDE.PUBLIEE && new Date(d.departPrevu).getTime() < Date.now();
  if (d.etat === ETAT_DEMANDE.ANNULEE || expiree) {
    if (depot('appariement').brutOu((a) => a.demandeId === d.id && a.etat === ETAT_APPARIEMENT.VALIDER).length) {
      return { republiable: false, motif: 'Cette demande a déjà donné lieu à une mise en relation validée.' };
    }
    return { republiable: true, motif: null };
  }
  return {
    republiable: false,
    motif: 'Seule une demande annulée, ou dont la date de départ est dépassée, peut être republiée.',
  };
}

/**
 * Demande du groupement, avec sa déclaration, pour le formulaire.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} demandeId
 * @returns {Record<string, any>}
 */
export function demandePourModification(ctx, demandeId) {
  const d = depot('demande').brutParId(demandeId);
  if (!d) throw new Error('Demande introuvable.');
  exiger(ctx, 'demande.lire', undefined);
  if (d.groupementId !== ctx.groupementId) {
    throw new Error('Cette demande ne fait pas partie de votre groupement.');
  }
  const declaration = depot('declaration').lire(ctx, d.declarationId) ?? {};
  const partagee = depot('demande').brutOu((x) => x.declarationId === d.declarationId).length > 1;
  return {
    demande: depot('demande').lire(ctx, demandeId),
    declaration,
    corridorModifiable: !partagee,
    ...modifiabiliteDemande(d),
    ...republiabilite(d),
  };
}

/**
 * Modifie une demande sans réservation engagée.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} demandeId
 * @param {{fret?: {libelle?: string, provenanceId?: string, destinationId?: string, observation?: string},
 *   besoin: {departPrevu: string, arriveePrevue: string, capaciteId: string, carrosserieId: string, essieuxId?: string, contraintes?: string},
 *   lignes: Array<{produitId: string, poidsT: number, volumeM3?: number, nombreColis?: number, emballageId?: string}>}} saisie
 * @returns {Record<string, any>} La demande modifiée.
 */
export function modifierDemande(ctx, demandeId, { fret = {}, besoin = {}, lignes = [] }) {
  const d = depot('demande').brutParId(demandeId);
  if (!d) throw new Error('Demande introuvable.');
  exiger(ctx, 'demande.modifier', { groupementId: d.groupementId });
  const { modifiable, motif } = modifiabiliteDemande(d);
  if (!modifiable) throw new Error(motif);

  const dec = depot('declaration').brutParId(d.declarationId);
  const partagee = depot('demande').brutOu((x) => x.declarationId === d.declarationId).length > 1;

  // Correctif anti-fraude n° 1 : ces textes sont lus avant toute validation.
  refuserCoordonnees(fret.libelle, 'Libellé du fret');
  refuserCoordonnees(fret.observation, 'Observation');
  refuserCoordonnees(besoin.contraintes, 'Contraintes');

  const nouvelleDeclaration = {
    libelle: fret.libelle === undefined ? dec.libelle : texte(fret.libelle),
    provenanceId: fret.provenanceId === undefined ? dec.provenanceId : referentiel(fret.provenanceId, 'localites', 'Provenance'),
    destinationId: fret.destinationId === undefined ? dec.destinationId : referentiel(fret.destinationId, 'localites', 'Destination'),
    observation: fret.observation === undefined ? dec.observation : texte(fret.observation) || null,
  };
  if (!nouvelleDeclaration.libelle) throw new Error('Renseignez le libellé du fret.');
  if (nouvelleDeclaration.provenanceId === nouvelleDeclaration.destinationId) {
    throw new Error('La destination doit être différente de la provenance.');
  }
  const changeDeclaration = Object.keys(nouvelleDeclaration).filter(
    (k) => String(dec[k] ?? '') !== String(nouvelleDeclaration[k] ?? ''),
  );
  if (changeDeclaration.length) {
    exiger(ctx, 'declaration.modifier', { groupementId: dec.groupementId });
    if (partagee) {
      throw new Error(
        'Ce fret porte plusieurs demandes : son libellé et son corridor ne se modifient pas ' +
          'depuis l’une d’elles. Modifiez seulement les dates, le véhicule attendu et les marchandises.',
      );
    }
  }

  if (!Array.isArray(lignes) || lignes.length === 0) throw new Error('Ajoutez au moins une ligne de marchandise.');
  const nouvellesLignes = lignes.map((l) => {
    const poidsT = Number(l.poidsT);
    if (!(poidsT > 0)) throw new Error('Chaque marchandise porte un poids strictement positif.');
    const ligne = {
      id: l.id || identifiant('lig'),
      produitId: referentiel(l.produitId, 'produits_sh', 'Produit'),
      poidsT,
    };
    if (l.volumeM3) ligne.volumeM3 = Number(l.volumeM3);
    if (l.nombreColis) ligne.nombreColis = Number(l.nombreColis);
    if (l.emballageId) ligne.emballageId = referentiel(l.emballageId, 'emballages', 'Emballage');
    return ligne;
  });

  const nouvelleDemande = {
    ...dates(besoin.departPrevu, besoin.arriveePrevue),
    capaciteId: referentiel(besoin.capaciteId, 'capacites', 'Capacité'),
    carrosserieId: referentiel(besoin.carrosserieId, 'carrosseries', 'Carrosserie'),
    essieuxId: referentiel(besoin.essieuxId, 'essieux', 'Essieux', true),
    contraintes: texte(besoin.contraintes) || null,
    lignes: nouvellesLignes,
  };
  const empreinteLignes = (liste) =>
    JSON.stringify((liste ?? []).map((l) => [l.produitId, l.poidsT, l.volumeM3 ?? null, l.nombreColis ?? null, l.emballageId ?? null]));
  const comparer = (k) =>
    k === 'lignes'
      ? empreinteLignes(d.lignes) !== empreinteLignes(nouvellesLignes)
      : k === 'departPrevu' || k === 'arriveePrevue'
        ? new Date(d[k]).getTime() !== new Date(nouvelleDemande[k]).getTime()
        : String(d[k] ?? '') !== String(nouvelleDemande[k] ?? '');
  const changeDemande = Object.keys(nouvelleDemande).filter(comparer);
  const changes = [...changeDeclaration, ...changeDemande];
  if (!changes.length) throw new Error('Aucune modification à enregistrer.');

  const maintenant = new Date().toISOString();
  const resume = `Champs modifiés : ${changes.map((k) => LIBELLES[k]).join(', ')}.`;

  return stockageInterne().transaction((tx) => {
    // Relecture dans la transaction : une réservation a pu arriver entre-temps.
    tx.marquer(`demandes:${demandeId}`);
    const courante = tx.lire('demandes').find((x) => x.id === demandeId);
    if (![ETAT_DEMANDE.PUBLIEE, ETAT_DEMANDE.BROUILLON].includes(courante?.etat)) {
      throw new Error('Une réservation vient d’être engagée sur cette demande : elle ne peut plus être modifiée.');
    }
    if (changeDeclaration.length) {
      depot('declaration').modifier(dec.id, nouvelleDeclaration, { tx });
    }
    const maj = depot('demande').modifier(
      demandeId,
      {
        ...nouvelleDemande,
        modifieeLe: maintenant,
        modifieeParUtilisateurId: ctx.utilisateurId,
        historique: [
          ...(d.historique ?? []),
          { id: identifiant('his'), le: maintenant, action: 'modification', parUtilisateurId: ctx.utilisateurId, resume },
        ],
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.DEMANDE_MODIFIEE, {
      cibleType: 'demande',
      cibleId: demandeId,
      details: `Demande ${d.reference} modifiée. ${resume}`,
      tx,
    });
    return maj;
  });
}

/**
 * Republie une demande annulée ou expirée, avec de nouvelles dates.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} demandeId
 * @param {{departPrevu: string, arriveePrevue: string}} nouvellesDates
 * @returns {Record<string, any>}
 */
export function republierDemande(ctx, demandeId, nouvellesDates) {
  const d = depot('demande').brutParId(demandeId);
  if (!d) throw new Error('Demande introuvable.');
  exiger(ctx, 'demande.publier', { groupementId: d.groupementId });
  const { republiable, motif } = republiabilite(d);
  if (!republiable) throw new Error(motif);
  const { departPrevu, arriveePrevue } = dates(nouvellesDates?.departPrevu, nouvellesDates?.arriveePrevue);

  const maintenant = new Date().toISOString();
  const ancien = d.etat === ETAT_DEMANDE.ANNULEE ? 'annulée' : 'expirée';
  const resume = `Demande ${ancien} rendue au marché avec de nouvelles dates.`;

  return stockageInterne().transaction((tx) => {
    tx.marquer(`demandes:${demandeId}`);
    const maj = depot('demande').modifier(
      demandeId,
      {
        etat: ETAT_DEMANDE.PUBLIEE,
        departPrevu,
        arriveePrevue,
        publieeLe: maintenant,
        republieeLe: maintenant,
        annuleeLe: null,
        historique: [
          ...(d.historique ?? []),
          { id: identifiant('his'), le: maintenant, action: 'republication', parUtilisateurId: ctx.utilisateurId, resume },
        ],
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.DEMANDE_REPUBLIEE, {
      cibleType: 'demande',
      cibleId: demandeId,
      details: `Demande ${d.reference} republiée (${ancien}).`,
      tx,
    });
    return maj;
  });
}
