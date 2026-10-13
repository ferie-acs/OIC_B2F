/**
 * Offres de transport : modification et duplication (« partage ») — lot b3.
 *
 * Le système existant permet de modifier une offre et de la « partager »,
 * c'est-à-dire d'en créer une copie à ajuster pour un autre trajet. Le POC
 * conserve les deux gestes, avec deux règles :
 *
 * - **une offre ne se modifie que tant qu'elle est disponible** et qu'aucune
 *   réservation n'attend de réponse : l'affréteur doit recevoir ce qu'il a réservé ;
 * - **une copie est une nouvelle offre**, publiée par le même chemin que les
 *   autres (`publierOffre`), avec ses contrôles, et rattachée à son origine.
 *
 * @module services/offre-gestion.service
 */

import { ETAT_APPARIEMENT, ETAT_OFFRE, EVENEMENT_AUDIT } from '../domain/enums.js';
import { exiger } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { preparerOffre } from './flotte.service.js';

/** Libellés des champs modifiables, pour la trace (jamais les valeurs). */
const LIBELLES_CHAMPS = Object.freeze({
  vehiculeId: 'véhicule',
  chauffeurPressentiId: 'chauffeur',
  localiteDepartId: 'départ',
  localiteArriveeId: 'arrivée',
  disponibleDu: 'début de disponibilité',
  disponibleAu: 'fin de disponibilité',
  prixKmT: 'prix indicatif',
  trajetRetour: 'sens du trajet',
  trajetVide: 'trajet à vide',
});

/**
 * Offre du groupement, ou refus.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} offreId
 */
function offreDuGroupement(ctx, offreId) {
  const o = depot('offre').brutParId(offreId);
  if (!o) throw new Error('Offre introuvable.');
  exiger(ctx, 'offre.publier', { groupementId: o.groupementId });
  return o;
}

/**
 * Une offre peut-elle être modifiée ?
 * @param {Record<string, any>} o Offre brute ou projetée (porte `id` et `etat`).
 * @returns {{modifiable: boolean, motif: string|null}}
 */
export function modifiabilite(o) {
  if (o.etat !== ETAT_OFFRE.DISPONIBLE) {
    return {
      modifiable: false,
      motif:
        o.etat === ETAT_OFFRE.RETIREE
          ? 'Cette offre est retirée du marché. Dupliquez-la pour publier une nouvelle disponibilité.'
          : 'Offre réservée ou engagée : dupliquez-la pour publier une variante.',
    };
  }
  const enAttente = depot('appariement').brutOu(
    (a) => a.offreId === o.id && [ETAT_APPARIEMENT.RESERVER, ETAT_APPARIEMENT.ACCEPTER].includes(a.etat),
  );
  if (enAttente.length) {
    return {
      modifiable: false,
      motif: 'Une réservation est en cours sur cette offre : répondez-y avant de la modifier.',
    };
  }
  return { modifiable: true, motif: null };
}

/**
 * Valeurs d'une offre du groupement, pour préremplir le formulaire de
 * modification ou de copie. Lecture projetée : rien que le propriétaire ne voie déjà.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} offreId
 * @returns {Record<string, any>}
 */
export function offrePourFormulaire(ctx, offreId) {
  exiger(ctx, 'offre.lire', undefined);
  const o = depot('offre').brutParId(offreId);
  if (!o || o.groupementId !== ctx.groupementId) {
    throw new Error('Cette offre ne fait pas partie de votre groupement.');
  }
  return { ...depot('offre').lire(ctx, offreId), ...modifiabilite(o) };
}

/**
 * Modifie une offre disponible. Mêmes contrôles qu'à la publication.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} offreId
 * @param {Record<string, any>} saisie
 * @returns {Record<string, any>}
 */
export function modifierOffre(ctx, offreId, saisie) {
  const o = offreDuGroupement(ctx, offreId);
  const { modifiable, motif } = modifiabilite(o);
  if (!modifiable) throw new Error(motif);

  const champs = preparerOffre(ctx, saisie);
  const changes = Object.keys(LIBELLES_CHAMPS).filter(
    (k) => String(o[k] ?? '') !== String(champs[k] ?? ''),
  );
  if (!changes.length) throw new Error('Aucune modification à enregistrer.');

  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    // Relecture dans la transaction : une réservation a pu arriver entre-temps.
    tx.marquer(`offres:${offreId}`);
    const courante = tx.lire('offres').find((x) => x.id === offreId);
    if (courante?.etat !== ETAT_OFFRE.DISPONIBLE) {
      throw new Error('Cette offre vient d’être réservée : elle ne peut plus être modifiée.');
    }
    const maj = depot('offre').modifier(
      offreId,
      { ...champs, modifieeLe: maintenant, modifieeParUtilisateurId: ctx.utilisateurId },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.OFFRE_MODIFIEE, {
      cibleType: 'offre',
      cibleId: offreId,
      details: `Offre ${o.reference} modifiée : ${changes.map((k) => LIBELLES_CHAMPS[k]).join(', ')}.`,
      tx,
    });
    return maj;
  });
}
