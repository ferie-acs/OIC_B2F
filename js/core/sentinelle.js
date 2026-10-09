/**
 * Filet de securite d'execution.
 *
 * Le POC n'a pas de serveur : aucune erreur survenue dans le navigateur ne
 * remonte nulle part. Sans filet, une exception levee apres le demarrage —
 * un clic, une navigation — laisse l'interface figee sans le moindre signe.
 * Devant un commanditaire, « l'ecran ne repond plus » est le pire des
 * diagnostics : on ne sait pas s'il faut recharger, changer de navigateur ou
 * arreter la demonstration.
 *
 * Ce module ne fait donc que trois choses, et rien de plus :
 *   1. il capte les erreurs non rattrapees et les rejets de promesse ;
 *   2. il les journalise dans la console, avec un prefixe reperable ;
 *   3. il affiche un bandeau discret, non bloquant, avec un bouton de
 *      rechargement.
 *
 * Ce qu'il ne fait PAS, volontairement : aucun envoi reseau, aucune
 * telemetrie, aucun service tiers. Le POC ne parle a personne (ecart E1), et
 * une sonde distante contredirait sa politique de securite du contenu autant
 * que la confidentialite de la demonstration.
 *
 * @module core/sentinelle
 */

import { el, remplacer } from './dom.js';

/** Identifiant du bandeau, pour ne jamais en empiler deux. */
const ID_BANDEAU = 'b2f-sentinelle';

/** Nombre d'erreurs observees depuis le chargement de la page. */
let compteur = 0;

/**
 * Reduit une valeur levee — quelle qu'elle soit — a un message lisible.
 *
 * @param {unknown} cause Valeur levee ou rejetee.
 * @returns {string} Message affichable.
 */
function messageDe(cause) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === 'string' && cause) return cause;
  return 'Erreur inattendue, sans message.';
}

/**
 * Affiche ou met a jour le bandeau d'incident.
 *
 * @param {string} message Message a afficher.
 * @returns {void}
 */
function signaler(message) {
  compteur += 1;

  const existant = document.getElementById(ID_BANDEAU);
  const corps = [
    el('strong', { text: 'Incident dans la démonstration.' }),
    el('span', {
      text:
        ` ${message}` +
        (compteur > 1 ? ` (${compteur} incidents depuis le chargement)` : ''),
    }),
    // `on` et non `onclick` : un gestionnaire pose en attribut serait du
    // script en ligne, que la politique de securite du contenu refuse.
    el('button.sentinelle-action', {
      type: 'button',
      text: 'Recharger la page',
      on: { click: () => window.location.reload() },
    }),
  ];

  if (existant) {
    remplacer(existant, ...corps);
    return;
  }

  const bandeau = el('div.sentinelle', { id: ID_BANDEAU, role: 'alert' }, corps);
  document.body.appendChild(bandeau);
}

/**
 * Installe le filet. Idempotent : un second appel ne fait rien.
 *
 * A appeler le plus tot possible, avant meme l'amorcage des donnees, pour
 * que les erreurs du demarrage soient couvertes elles aussi.
 *
 * @returns {void}
 */
export function installerSentinelle() {
  if (window.__b2fSentinelle) return;
  window.__b2fSentinelle = true;

  window.addEventListener('error', (evenement) => {
    // Une ressource qui ne se charge pas (feuille de style, module) leve un
    // evenement sans `error` : on le distingue pour rester precis.
    if (!evenement.error && evenement.target && evenement.target !== window) {
      const cible = /** @type {HTMLElement} */ (evenement.target);
      const source = cible.getAttribute?.('src') ?? cible.getAttribute?.('href');
      if (source) {
        console.error('[B2F] Ressource introuvable :', source);
        signaler(`Une ressource n’a pas pu être chargée (${source}).`);
      }
      return;
    }
    console.error('[B2F] Erreur non rattrapée :', evenement.error ?? evenement.message);
    signaler(messageDe(evenement.error ?? evenement.message));
  }, true);

  window.addEventListener('unhandledrejection', (evenement) => {
    console.error('[B2F] Promesse rejetée sans traitement :', evenement.reason);
    signaler(messageDe(evenement.reason));
  });
}
