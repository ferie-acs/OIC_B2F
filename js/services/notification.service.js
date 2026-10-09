/**
 * Notifications — dans l'application uniquement.
 *
 * Le système existant double chaque courriel d'un SMS et délègue l'envoi à une
 * procédure stockée du serveur SQL. Non reproductible sans backend : le POC
 * montre le centre de notifications, pas l'acheminement.
 *
 * **Forme `{ code, params }`, jamais une phrase composée** (finding S1 + S13) :
 * la vue résout le gabarit et échappe. Les paramètres ne portent que des
 * références et des libellés publics — un invariant du schéma le vérifie.
 *
 * @module services/notification.service
 */

import { identifiant } from '../core/crypto.js';
import { exiger, projeterListe } from '../domain/access.js';
import { depot } from '../repositories/index.js';

/**
 * Gabarits de message. La vue compose ; le domaine ne fabrique pas de phrases.
 * @type {Readonly<Record<string, {objet: string, texte: (p: Record<string, any>) => string}>>}
 */
export const GABARITS = Object.freeze({
  'appariement.reserve': {
    objet: 'Nouvelle réservation reçue',
    texte: (p) =>
      `La mise en relation ${p.reference} attend votre réponse. ` +
      `Tant que vous n'avez pas répondu, l'affréteur ne peut pas valider.`,
  },
  'appariement.accepte': {
    objet: 'Réservation acceptée',
    texte: (p) => `Le transporteur a accepté la mise en relation ${p.reference}. À vous de valider.`,
  },
  'appariement.rejete': {
    objet: 'Réservation rejetée',
    texte: (p) =>
      `La mise en relation ${p.reference} a été rejetée${p.motif ? ` — ${p.motif}` : ''}. ` +
      `Vous pouvez chercher un autre véhicule.`,
  },
  'appariement.annule': {
    objet: 'Réservation annulée',
    texte: (p) => `La mise en relation ${p.reference} a été annulée.`,
  },
  'appariement.valide': {
    objet: 'Mise en relation validée',
    texte: (p) =>
      `La mise en relation ${p.reference} est validée. Les coordonnées de la ` +
      `contrepartie vous sont désormais accessibles.`,
  },
  'offre.retiree': {
    objet: 'Offre retirée',
    texte: (p) => `L'offre ${p.reference} a été retirée du marché.`,
  },
  'offre.retiree.reservation': {
    objet: 'Réservation close — offre retirée',
    texte: (p) =>
      `Le transporteur a retiré le véhicule réservé pour la mise en relation ` +
      `${p.reference}. Votre demande est rendue au marché : vous pouvez réserver ` +
      `un autre véhicule dès maintenant.`,
  },
  'transport.etape': {
    objet: 'Transport : nouvelle étape',
    texte: (p) => `Le transport ${p.reference} est passé à l'étape « ${p.etape} ».`,
  },
  'transport.incident': {
    objet: 'Incident signalé',
    texte: (p) => `Un incident a été signalé sur le transport ${p.reference}.`,
  },
});

/**
 * Notifie tous les utilisateurs d'un groupement.
 *
 * @param {string} groupementId
 * @param {string} evenement Valeur de `EVENEMENT_AUDIT`.
 * @param {{code: string, params?: Record<string, any>, cibleType?: string, cibleId?: string, tx?: any}} message
 * @returns {number} Nombre de notifications créées.
 */
export function notifier(groupementId, evenement, message) {
  if (!GABARITS[message.code]) {
    throw new Error(
      `Gabarit de notification inconnu : « ${message.code} ». ` +
        'Une notification sans gabarit s’afficherait vide.',
    );
  }

  const destinataires = depot('utilisateur').brutOu(
    (u) => u.groupementId === groupementId && u.etat === 'actif',
  );

  for (const u of destinataires) {
    depot('notification').creer(
      {
        id: identifiant('not'),
        destinataireUtilisateurId: u.id,
        evenement,
        message: { code: message.code, params: message.params ?? {} },
        cibleType: message.cibleType,
        cibleId: message.cibleId,
        creeeLe: new Date().toISOString(),
        demo: true,
      },
      { tx: message.tx },
    );
  }
  return destinataires.length;
}

/**
 * Notifications de l'utilisateur courant, les plus récentes d'abord.
 * La portée `PROPRE` fait que même un collègue du même groupement ne les lit pas.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function mesNotifications(ctx) {
  exiger(ctx, 'notification.lire', {
    utilisateurId: ctx.utilisateurId,
    groupementId: ctx.groupementId,
  });

  const miennes = depot('notification')
    .brutOu((n) => n.destinataireUtilisateurId === ctx.utilisateurId)
    .sort((a, b) => new Date(b.creeeLe) - new Date(a.creeeLe));

  return projeterListe(ctx, 'notification', miennes);
}

/**
 * Nombre de non-lues — l'indicateur visible depuis tous les écrans (M7.2).
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {number}
 */
export function nonLues(ctx) {
  return depot('notification').brutOu(
    (n) => n.destinataireUtilisateurId === ctx.utilisateurId && !n.luLe,
  ).length;
}

/**
 * Résout un message en texte affichable. **Appelée par la vue**, qui pose le
 * résultat avec `textContent`.
 * @param {{code: string, params?: Record<string, any>}} message
 * @returns {{objet: string, texte: string}}
 */
export function composer(message) {
  const g = GABARITS[message.code];
  if (!g) return { objet: 'Notification', texte: '' };
  return { objet: g.objet, texte: g.texte(message.params ?? {}) };
}

/**
 * Marque une notification comme lue.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 */
export function marquerLue(ctx, id) {
  const n = depot('notification').brutParId(id);
  if (!n || n.destinataireUtilisateurId !== ctx.utilisateurId) return;
  depot('notification').modifier(id, { luLe: new Date().toISOString() });
}
