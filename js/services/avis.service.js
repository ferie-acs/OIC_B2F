/**
 * Avis après transport et profil de confiance — correctifs anti-fraude n° 1 et n° 2.
 *
 * ## Pourquoi ce service
 *
 * **N° 2.** Une fois les coordonnées échangées, rien n'obligeait à revenir : la
 * seconde affaire entre les mêmes parties pouvait se traiter en direct. Aucune
 * règle ne peut l'interdire complètement ; on peut en revanche donner une
 * raison de revenir. La réputation — note et nombre de transports réalisés — ne
 * se constitue que sur des transports conclus par la plateforme : un
 * transporteur qui traite en direct ne la fait pas progresser.
 *
 * **N° 1.** Cette réputation remplace, sur le marché, la raison sociale qu'on
 * ne montre plus avant paiement. L'affréteur choisit sur des faits — vérifié,
 * nombre de transports, note, ancienneté — sans pouvoir identifier
 * l'entreprise et la joindre ailleurs.
 *
 * ## Ce qui n'est jamais servi
 *
 * Aucun avis individuel, aucun commentaire, aucun identifiant d'auteur : des
 * agrégats seulement. Un commentaire libre serait un canal de coordonnées.
 *
 * @module services/avis.service
 */

import { identifiant } from '../core/crypto.js';
import { ETAPE_TRANSPORT, ETAT_APPARIEMENT, EVENEMENT_AUDIT, TYPE_GROUPEMENT } from '../domain/enums.js';
import { exiger } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { etatVerification } from './verification.service.js';

/**
 * Peut-on noter la contrepartie de ce transport, et sinon pourquoi ?
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @returns {{possible: boolean, motif: string|null, dejaDonne: number|null}}
 */
export function avisPossible(ctx, appariementId) {
  const a = depot('appariement').brutParId(appariementId);
  if (!a) return { possible: false, motif: 'Mise en relation introuvable.', dejaDonne: null };
  const partie =
    a.groupementAffreteurId === ctx.groupementId || a.groupementTransporteurId === ctx.groupementId;
  if (!partie) {
    return { possible: false, motif: 'Seules les deux parties notent un transport.', dejaDonne: null };
  }
  const existant = depot('avis').brutOu(
    (x) => x.appariementId === appariementId && x.auteurGroupementId === ctx.groupementId,
  )[0];
  if (existant) return { possible: false, motif: 'Votre groupement a déjà noté ce transport.', dejaDonne: existant.note };

  const t = depot('transport').brutOu((x) => x.appariementId === appariementId)[0];
  if (a.etat !== ETAT_APPARIEMENT.VALIDER || t?.etape !== ETAPE_TRANSPORT.CLOTURE) {
    return {
      possible: false,
      motif: 'La note se donne une fois le transport clôturé par l’affréteur.',
      dejaDonne: null,
    };
  }
  return { possible: true, motif: null, dejaDonne: null };
}

/**
 * Note la contrepartie d'un transport clôturé. Une fois par partie et par transport.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @param {number} note Entier de 1 à 5.
 * @returns {Record<string, any>}
 */
export function donnerAvis(ctx, appariementId, note) {
  exiger(ctx, 'avis.donner', { groupementId: ctx.groupementId });
  const { possible, motif } = avisPossible(ctx, appariementId);
  if (!possible) throw new Error(motif);
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    throw new Error('La note est un nombre entier de 1 à 5.');
  }

  const a = depot('appariement').brutParId(appariementId);
  const cible =
    a.groupementAffreteurId === ctx.groupementId ? a.groupementTransporteurId : a.groupementAffreteurId;

  return stockageInterne().transaction((tx) => {
    const avis = depot('avis').creer(
      {
        id: identifiant('avi'),
        appariementId,
        auteurGroupementId: ctx.groupementId,
        cibleGroupementId: cible,
        note,
        donneLe: new Date().toISOString(),
        auteurUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.AVIS_DONNE, {
      cibleType: 'appariement',
      cibleId: appariementId,
      details: `Avis donné sur la mise en relation ${a.reference}.`,
      tx,
    });
    return avis;
  });
}

/**
 * Profil de confiance d'un groupement — **des agrégats, rien qui identifie**.
 *
 * Sert à l'écran ce qu'on montrait avant sous la forme d'une raison sociale :
 * de quoi choisir avec qui traiter.
 *
 * @param {string|null|undefined} groupementId
 * @returns {{type: string|null, verifie: boolean|null, transportsRealises: number,
 *   note: number|null, nombreAvis: number, membreDepuis: string|null}}
 */
export function profilConfiance(groupementId) {
  const g = groupementId ? depot('groupement').brutParId(groupementId) : null;
  if (!g) {
    return { type: null, verifie: null, transportsRealises: 0, note: null, nombreAvis: 0, membreDepuis: null };
  }
  const clotures = new Set(
    depot('transport')
      .brutOu((t) => t.etape === ETAPE_TRANSPORT.CLOTURE || t.etape === ETAPE_TRANSPORT.LIVRE)
      .map((t) => t.appariementId),
  );
  const transportsRealises = depot('appariement').brutOu(
    (a) =>
      clotures.has(a.id) &&
      (a.groupementAffreteurId === groupementId || a.groupementTransporteurId === groupementId),
  ).length;
  const avis = depot('avis').brutOu((x) => x.cibleGroupementId === groupementId);
  const note = avis.length
    ? Math.round((avis.reduce((n, x) => n + x.note, 0) / avis.length) * 10) / 10
    : null;

  return {
    type: g.type ?? null,
    // La vérification ne concerne que les transporteurs (correctif n° 3).
    verifie: g.type === TYPE_GROUPEMENT.TRANSPORTEUR ? etatVerification(groupementId) === 'verifie' : null,
    transportsRealises,
    note,
    nombreAvis: avis.length,
    membreDepuis: g.creeLe ?? null,
  };
}
