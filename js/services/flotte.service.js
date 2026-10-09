/**
 * Flotte et marché des véhicules : véhicules, chauffeurs, offres, recherche.
 *
 * @module services/flotte.service
 */

import { identifiant } from '../core/crypto.js';
import {
  ETAT_APPARIEMENT,
  ETAT_OFFRE,
  ETAT_VEHICULE,
  EVENEMENT_AUDIT,
} from '../domain/enums.js';
import { exiger } from '../domain/access.js';
import { champsManquantsPourRole } from '../domain/permissions.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { cloreSurRetraitOffre, reference } from './matching.service.js';
import { notifier } from './notification.service.js';

/**
 * Un véhicule est-il publiable ?
 *
 * Contrôle fait **à la publication, pas à la saisie** : le véhicule reste au parc
 * et y est signalé « non publiable » (spécification C.2). Le distinguer évite de
 * faire disparaître un véhicule dont la pièce est simplement à renouveler.
 *
 * @param {Record<string, any>} vehicule
 * @returns {{publiable: boolean, motif: string|null}}
 */
/** Une réservation acceptée ou un transport non livré occupe réellement le camion. */
function vehiculeOccupe(vehiculeId) {
  if (!vehiculeId) return false;
  const offres = new Set(depot('offre').brutOu(o => o.vehiculeId === vehiculeId).map(o => o.id));
  const termines = new Set(depot('transport').brutOu(t => ['livre', 'cloture'].includes(t.etape)).map(t => t.appariementId));
  return depot('appariement').brutTous().some(a => offres.has(a.offreId) &&
    (a.etat === ETAT_APPARIEMENT.ACCEPTER || (a.etat === ETAT_APPARIEMENT.VALIDER && !termines.has(a.id))));
}

export function publiabilite(vehicule) {
  if (vehicule.etat === ETAT_VEHICULE.HORS_SERVICE) {
    return { publiable: false, motif: 'Ce véhicule est hors service.' };
  }
  if (vehicule.etat === ETAT_VEHICULE.ENGAGE || vehiculeOccupe(vehicule.id)) {
    return { publiable: false, motif: 'Ce véhicule est déjà engagé sur un transport.' };
  }
  const echeance = finDeJour(vehicule.carteTransportEcheance);
  if (!Number.isFinite(echeance)) {
    return { publiable: false, motif: 'Renseignez une date de validité correcte pour la carte de transport.' };
  }
  if (echeance < Date.now()) {
    return {
      publiable: false,
      motif:
        'La carte de transport de ce véhicule est échue. Il reste à votre parc ' +
        'mais ne peut pas être publié sur le marché tant qu’elle n’est pas renouvelée.',
    };
  }
  return { publiable: true, motif: null };
}

/**
 * Véhicules du groupement, avec leur publiabilité calculée.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function mesVehicules(ctx) {
  const brut = new Map(depot('vehicule').brutTous().map((v) => [v.id, v]));
  return depot('vehicule')
    .lisiblesPar(ctx, 'vehicule.lire')
    .map((v) => ({ ...v, engage: vehiculeOccupe(v.id), ...publiabilite(brut.get(v.id) ?? v) }));
}

/**
 * Chauffeurs du groupement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function mesChauffeurs(ctx) {
  return depot('chauffeur')
    .lisiblesPar(ctx, 'chauffeur.lire')
    .map(({ vehiculeId: _ancienneAffectation, ...c }) => ({
      ...c,
      permisEchu: c.permisEcheance ? finDeJour(c.permisEcheance) < Date.now() : false,
    }));
}

/** Une pièce reste valable jusqu'à la fin de sa date civile, heure locale. */
function finDeJour(valeur) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valeur ?? ''))) return NaN;
  const date = new Date(`${valeur}T23:59:59.999`);
  const [annee, mois, jour] = valeur.split('-').map(Number);
  return date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour
    ? date.getTime() : NaN;
}

function texte(valeur) { return String(valeur ?? '').trim(); }
function clePiece(valeur) { return texte(valeur).toLocaleUpperCase('fr').replace(/[\s-]+/g, ''); }

function verifierDate(valeur, libelle, facultative = false) {
  if (!valeur && facultative) return null;
  if (!Number.isFinite(finDeJour(valeur))) throw new Error(`${libelle} : saisissez une date valide.`);
  return valeur;
}

function verifierNombre(valeur, libelle, minimum = 0) {
  const nombre = typeof valeur === 'number' ? valeur : texte(valeur) ? Number(valeur) : NaN;
  if (!Number.isFinite(nombre) || nombre < minimum) {
    throw new Error(`${libelle} : saisissez un nombre supérieur ou égal à ${minimum}.`);
  }
  return nombre;
}

function verifierReferentiel(id, famille, libelle, precedentId = null) {
  const entree = depot('referentiel').brutParId(id);
  if (!entree || entree.famille !== famille || (!entree.actif && id !== precedentId)) {
    throw new Error(`${libelle} : choisissez une valeur disponible dans la liste.`);
  }
  return id;
}

function objetDuParc(ctx, entite, id, droit) {
  exiger(ctx, droit, { groupementId: ctx.groupementId });
  const objet = id ? depot(entite).brutParId(id) : null;
  if (id && (!objet || objet.groupementId !== ctx.groupementId)) {
    throw new Error('Cet élément ne fait pas partie de votre groupement.');
  }
  return objet;
}

/** Ajoute ou modifie un véhicule sans accepter les identifiants de propriétaire du formulaire. */
export function enregistrerVehicule(ctx, saisie, vehiculeId = null) {
  const actuel = objetDuParc(ctx, 'vehicule', vehiculeId, 'vehicule.gerer');
  const immatriculation = texte(saisie.immatriculation).toLocaleUpperCase('fr');
  if (!immatriculation) throw new Error('Renseignez l’immatriculation du véhicule.');
  if (depot('vehicule').brutTous().some(v => v.id !== vehiculeId && clePiece(v.immatriculation) === clePiece(immatriculation))) {
    throw new Error('Cette immatriculation est déjà enregistrée.');
  }
  const carteTransportNumero = texte(saisie.carteTransportNumero);
  if (!carteTransportNumero) throw new Error('Renseignez le numéro de carte de transport.');
  const etat = saisie.etat ?? actuel?.etat ?? ETAT_VEHICULE.DISPONIBLE;
  if (etat === ETAT_VEHICULE.ENGAGE && actuel?.etat !== ETAT_VEHICULE.ENGAGE) {
    throw new Error('Le véhicule devient engagé lors de la validation d’une mise en relation.');
  }
  if ((actuel?.etat === ETAT_VEHICULE.ENGAGE || vehiculeOccupe(actuel?.id)) && etat !== actuel.etat) {
    throw new Error('Terminez le transport en cours avant de modifier la disponibilité du véhicule.');
  }
  const donnees = {
    immatriculation,
    carteGrise: texte(saisie.carteGrise) || null,
    capaciteT: verifierNombre(saisie.capaciteT, 'Capacité utile', 0.1),
    ptacT: verifierNombre(saisie.ptacT, 'PTAC', 0.1),
    carrosserieId: verifierReferentiel(saisie.carrosserieId, 'carrosseries', 'Carrosserie', actuel?.carrosserieId),
    essieuxId: verifierReferentiel(saisie.essieuxId, 'essieux', 'Essieux', actuel?.essieuxId),
    carteTransportNumero,
    carteTransportEcheance: verifierDate(saisie.carteTransportEcheance, 'Validité de la carte de transport'),
    paysImmatriculation: texte(saisie.paysImmatriculation) || null,
    prixKmT: saisie.prixKmT == null || saisie.prixKmT === '' ? null : verifierNombre(saisie.prixKmT, 'Prix indicatif'),
    etat,
  };
  if (Object.prototype.hasOwnProperty.call(saisie, 'stationnementLocaliteId')) {
    const stationnement = texte(saisie.stationnementLocaliteId) || null;
    donnees.stationnementLocaliteId = stationnement
      ? verifierReferentiel(stationnement, 'localites', 'Lieu de stationnement', actuel?.stationnementLocaliteId)
      : null;
    if (stationnement !== (actuel?.stationnementLocaliteId ?? null) || !actuel?.stationnementMisAJourLe) {
      donnees.stationnementMisAJourLe = new Date().toISOString();
    }
  }
  if (donnees.capaciteT > donnees.ptacT) throw new Error('La capacité utile ne peut pas dépasser le PTAC.');
  if (champsManquantsPourRole(ctx.roleId, 'vehicule', donnees).length) {
    throw new Error('Renseignez le pays d’immatriculation pour votre véhicule.');
  }
  if (actuel) return depot('vehicule').modifier(actuel.id, donnees);
  return depot('vehicule').creer({
    ...donnees, id: identifiant('veh'), groupementId: ctx.groupementId,
    creeLe: new Date().toISOString(), demo: true,
  }, { roleAuteur: ctx.roleId });
}

/** Enregistre un chauffeur de l'équipe ; son choix se fait ensuite pour chaque offre. */
export function enregistrerChauffeur(ctx, saisie, chauffeurId = null) {
  const actuel = objetDuParc(ctx, 'chauffeur', chauffeurId, 'chauffeur.gerer');
  const nom = texte(saisie.nom);
  const permisNumero = texte(saisie.permisNumero).toLocaleUpperCase('fr');
  if (!nom || !permisNumero) throw new Error('Renseignez le nom du chauffeur et son numéro de permis.');
  if (depot('chauffeur').brutTous().some(c => c.groupementId === ctx.groupementId && c.id !== chauffeurId && clePiece(c.permisNumero) === clePiece(permisNumero))) {
    throw new Error('Ce permis est déjà associé à un chauffeur de votre groupement.');
  }
  const donnees = {
    nom, permisNumero,
    // Nettoie les anciennes affectations du POC sans accepter ce champ en saisie.
    vehiculeId: null,
    permisEcheance: verifierDate(saisie.permisEcheance, 'Validité du permis', true),
    telephone: texte(saisie.telephone) || null,
  };
  if (actuel) return depot('chauffeur').modifier(actuel.id, donnees);
  return depot('chauffeur').creer({
    ...donnees, id: identifiant('chf'), groupementId: ctx.groupementId,
    creeLe: new Date().toISOString(), demo: true,
  }, { roleAuteur: ctx.roleId });
}

/** Prépare une annonce retour, sans rien publier ni modifier le transport. */
export function preparerRetour(ctx, transportId) {
  exiger(ctx, 'offre.publier', { groupementId: ctx.groupementId });
  const transport = depot('transport').brutParId(transportId);
  const a = transport && depot('appariement').brutParId(transport.appariementId);
  if (!a || a.groupementTransporteurId !== ctx.groupementId) {
    throw new Error('Ce transport ne concerne pas votre groupement.');
  }
  if (!['livre', 'cloture'].includes(transport.etape)) {
    throw new Error('Confirmez la livraison avant de préparer un nouveau départ.');
  }
  const offre = depot('offre').brutParId(a.offreId);
  const demande = depot('demande').brutParId(a.demandeId);
  const declaration = demande && depot('declaration').brutParId(demande.declarationId);
  if (!offre || !declaration) throw new Error('Le dossier de transport est incomplet.');
  return { vehiculeId: offre.vehiculeId, localiteDepartId: declaration.destinationId, trajetRetour: true };
}

/**
 * Publie une offre de véhicule.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{vehiculeId: string, chauffeurPressentiId?: string, localiteDepartId: string, localiteArriveeId: string, disponibleDu: string, disponibleAu: string, prixKmT?: number}} saisie
 * @returns {Record<string, any>}
 */
export function publierOffre(ctx, saisie) {
  exiger(ctx, 'offre.publier', { groupementId: ctx.groupementId });

  const v = depot('vehicule').brutParId(saisie.vehiculeId);
  if (!v) throw new Error('Véhicule introuvable.');
  if (v.groupementId !== ctx.groupementId) {
    throw new Error('Ce véhicule n’appartient pas à votre groupement.');
  }
  const { publiable, motif } = publiabilite(v);
  if (!publiable) throw new Error(motif);

  const localiteDepartId = verifierReferentiel(saisie.localiteDepartId, 'localites', 'Départ');
  const localiteArriveeId = verifierReferentiel(saisie.localiteArriveeId, 'localites', 'Arrivée');
  if (localiteDepartId === localiteArriveeId) throw new Error('Choisissez deux localités différentes pour le trajet.');
  const chauffeurPressentiId = saisie.chauffeurPressentiId || null;
  if (chauffeurPressentiId && depot('chauffeur').brutParId(chauffeurPressentiId)?.groupementId !== ctx.groupementId) {
    throw new Error('Le chauffeur sélectionné ne fait pas partie de votre groupement.');
  }
  const debutSaisi = texte(saisie.disponibleDu);
  const finSaisie = texte(saisie.disponibleAu);
  const debut = new Date(debutSaisi.length === 10 ? `${debutSaisi}T00:00:00` : debutSaisi);
  const fin = new Date(finSaisie.length === 10 ? `${finSaisie}T23:59:59.999` : finSaisie);
  if (!Number.isFinite(finDeJour(debutSaisi.slice(0, 10))) ||
      !Number.isFinite(finDeJour(finSaisie.slice(0, 10))) ||
      !Number.isFinite(debut.getTime()) || !Number.isFinite(fin.getTime())) {
    throw new Error('Renseignez deux dates de disponibilité valides.');
  }
  if (fin < debut) throw new Error('La fin de disponibilité doit suivre le début.');
  if (fin.getTime() < Date.now()) throw new Error('La période de disponibilité est déjà terminée.');
  const prixKmT = saisie.prixKmT == null || saisie.prixKmT === ''
    ? null : verifierNombre(saisie.prixKmT, 'Prix indicatif');

  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    const offre = depot('offre').creer(
      {
        id: identifiant('off'),
        reference: reference('OV'),
        groupementId: ctx.groupementId,
        vehiculeId: v.id,
        chauffeurPressentiId,
        localiteDepartId,
        localiteArriveeId,
        disponibleDu: debut.toISOString(),
        disponibleAu: fin.toISOString(),
        prixKmT,
        trajetRetour: saisie.trajetRetour === true,
        trajetVide: saisie.trajetVide === true,
        etat: ETAT_OFFRE.DISPONIBLE,
        publieeLe: maintenant,
        creeeParUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx, roleAuteur: ctx.roleId },
    );
    journaliser(ctx, EVENEMENT_AUDIT.OFFRE_PUBLIEE, {
      cibleType: 'offre',
      cibleId: offre.id,
      details: `Offre ${offre.reference} publiée.`,
      tx,
    });
    return offre;
  });
}

/**
 * Retire une offre du marché.
 *
 * Impossible après acceptation d'une réservation. Le bouton n'est jamais masqué :
 * il est désactivé et le motif est écrit (décision D32).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} offreId
 */
export function retirerOffre(ctx, offreId) {
  const o = depot('offre').brutParId(offreId);
  if (!o) throw new Error('Offre introuvable.');
  exiger(ctx, 'offre.retirer', { groupementId: o.groupementId });

  const { retirable, motif } = retirabilite(offreId);
  if (!retirable) throw new Error(motif);

  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    const maj = depot('offre').modifier(
      offreId,
      { etat: ETAT_OFFRE.RETIREE, retireeLe: maintenant },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.OFFRE_RETIREE, {
      cibleType: 'offre',
      cibleId: offreId,
      details: `Offre ${o.reference} retirée.`,
      tx,
    });

    // Correctif QA-04 — l'appariement zombie.
    //
    // Le retrait notifiait l'affréteur mais **ne corrigeait aucun état** :
    // l'appariement restait à `reserver`, la demande hors du marché, et
    // l'affréteur attendait une réponse qui ne viendrait jamais — le
    // transporteur ne pouvait plus répondre, son offre n'étant plus tenable.
    // Une impasse silencieuse, dont la seule issue était que l'affréteur devine
    // qu'il devait annuler lui-même.
    //
    // La clôture est **déléguée au service d'appariement** : lui seul change un
    // état d'appariement (M4.5). Elle partage cette transaction, donc le retrait
    // et la clôture sont tout ou rien.
    cloreSurRetraitOffre(ctx, offreId, tx);

    return maj;
  });
}

/**
 * Une offre peut-elle être retirée ?
 * @param {string} offreId
 * @returns {{retirable: boolean, motif: string|null}}
 */
export function retirabilite(offreId) {
  const acceptee = depot('appariement').brutOu(
    (a) => a.offreId === offreId && a.etat === ETAT_APPARIEMENT.ACCEPTER,
  );
  if (acceptee.length > 0) {
    return {
      retirable: false,
      motif:
        'Vous avez accepté une réservation sur cette offre : elle ne peut plus être ' +
        'retirée tant que l’affréteur n’a pas validé ou annulé.',
    };
  }
  const validee = depot('appariement').brutOu(
    (a) => a.offreId === offreId && a.etat === ETAT_APPARIEMENT.VALIDER,
  );
  if (validee.length > 0) {
    return { retirable: false, motif: 'Cette offre a donné lieu à une mise en relation validée.' };
  }

  // Retrait possible malgré une réservation en attente, mais il n'est pas sans
  // conséquence : la réservation est close et la demande rendue au marché.
  // L'écran doit le dire avant, pas après.
  const enAttente = depot('appariement').brutOu(
    (a) => a.offreId === offreId && a.etat === ETAT_APPARIEMENT.RESERVER,
  );
  if (enAttente.length > 0) {
    return {
      retirable: true,
      motif: null,
      avertissement:
        'Une réservation est en attente de votre réponse sur cette offre. La retirer ' +
        'clôt cette réservation et rend la demande au marché ; l’affréteur en sera informé.',
    };
  }
  return { retirable: true, motif: null };
}

/**
 * Offres publiées par le groupement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function mesOffres(ctx) {
  return depot('offre')
    .lisiblesPar(ctx, 'offre.lire')
    .map((o) => ({ ...o, ...retirabilite(o.id) }))
    .sort((a, b) => new Date(b.publieeLe) - new Date(a.publieeLe));
}

/**
 * Recherche sur le marché des véhicules disponibles (M3.2).
 *
 * Ne rend que les offres `disponible` d'autres groupements, dont le véhicule est
 * à jour de carte de transport. Le `chauffeurPressentiId` porté par l'offre est
 * de classification `contact` : la projection le retire tant que la mise en
 * relation n'est pas validée.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{departId?: string, arriveeId?: string, aPartirDu?: string, capaciteMin?: number, carrosserieId?: string, essieuxId?: string}} [filtres]
 * @returns {Array<Record<string, any>>}
 */
export function chercherVehicules(ctx, filtres = {}) {
  exiger(ctx, 'marche.offres', { groupementId: null, publie: true });

  const vehicules = new Map(depot('vehicule').brutTous().map((v) => [v.id, v]));
  const groupements = new Map(depot('groupement').brutTous().map((g) => [g.id, g]));

  return depot('offre')
    .brutOu((o) => o.etat === ETAT_OFFRE.DISPONIBLE && o.groupementId !== ctx.groupementId)
    .filter((o) => {
      const v = vehicules.get(o.vehiculeId);
      if (!v || !publiabilite(v).publiable) return false;
      if (filtres.departId && o.localiteDepartId !== filtres.departId) return false;
      if (filtres.arriveeId && o.localiteArriveeId !== filtres.arriveeId) return false;
      if (filtres.aPartirDu && new Date(o.disponibleAu) < new Date(filtres.aPartirDu)) return false;
      if (filtres.capaciteMin && v.capaciteT < filtres.capaciteMin) return false;
      if (filtres.carrosserieId && v.carrosserieId !== filtres.carrosserieId) return false;
      if (filtres.essieuxId && v.essieuxId !== filtres.essieuxId) return false;
      return true;
    })
    .map((o) => {
      const v = vehicules.get(o.vehiculeId);
      const g = groupements.get(o.groupementId);
      return {
        ...(depot('offre').lire(ctx, o.id) ?? {}),
        // Données du véhicule et du groupement servies via leur propre
        // projection : la carte grise et les contacts restent fermés.
        vehicule: depot('vehicule').lire(ctx, v.id, { proprietaireId: v.groupementId }),
        groupement: depot('groupement').lire(ctx, g.id, { proprietaireId: g.id }),
      };
    })
    .sort((a, b) => new Date(a.disponibleDu) - new Date(b.disponibleDu));
}
