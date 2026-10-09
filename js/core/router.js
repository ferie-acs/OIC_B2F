/**
 * Routeur par fragment d'URL — `#/espace/page`.
 *
 * ## Deux règles
 *
 * 1. **Une route non autorisée produit un refus explicite** nommant le rôle et le
 *    droit manquant, jamais une redirection silencieuse vers l'accueil — qui
 *    laisserait l'utilisateur croire à un défaut du logiciel
 *    (`01-parcours-et-navigation.md` § 3.4).
 * 2. **Le routeur n'a aucune table en dur** : il interroge `nav.js`, qui dérive
 *    l'arborescence de la matrice des droits. Un écran hors matrice est donc
 *    impossible à atteindre — garde-fou demandé par l'audit (§ 6.5).
 *
 * @module core/router
 */

import { el, icone } from './dom.js';
import { arborescenceDe, droitDeRoute, localiser, routeAccueil, segmentEspace } from './nav.js';
import { DROITS } from '../domain/permissions.js';
import { role } from '../domain/roles.js';

/** @type {Map<string, (ctx: any, params: Record<string, string>) => Node|Promise<Node>>} */
const ecrans = new Map();

/**
 * Déclare l'écran d'une route.
 * @param {string} cle `espace/page`
 * @param {(ctx: any, params: Record<string, string>) => Node|Promise<Node>} rendu
 */
export function declarer(cle, rendu) {
  ecrans.set(cle, rendu);
}

/**
 * Analyse le fragment courant.
 * @returns {{espace: string, page: string, params: Record<string, string>}}
 */
export function routeCourante() {
  const brut = (globalThis.location.hash || '').replace(/^#\/?/, '');
  const [chemin, requete] = brut.split('?');
  const segments = chemin.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(requete ?? ''));

  const espace = segments[0] ?? '';
  // La page peut compter deux segments (`declarations/nouvelle`), le reste est
  // un identifiant (`validation/app-123`).
  const reste = segments.slice(1);
  let page = reste[0] ?? '';
  if (reste.length > 1) {
    const deux = `${reste[0]}/${reste[1]}`;
    page = deux;
  }
  return { espace, page, params: { ...params, id: reste[1] ?? '', segment: reste[2] ?? '' } };
}

/**
 * Navigue vers une route.
 * @param {string} route
 */
export function aller(route) {
  globalThis.location.hash = route.startsWith('#') ? route : `#${route}`;
}

/**
 * Démarre le routeur.
 *
 * @param {object} p
 * @param {() => any|null} p.contexte Contexte courant, ou `null` si déconnecté.
 * @param {(route: {espace: string, page: string, params: any}) => void} p.surLogin
 *   Appelé quand il n'y a pas de session.
 * @param {(ctx: any, vue: {zone: any, page: any}, contenu: Node) => void} p.rendre
 */
export function demarrer({ contexte, surLogin, surPublic, surAccueil, rendre }) {
  async function traiter() {
    const ctx = contexte();
    const route = routeCourante();
    if (surAccueil && (route.espace === 'accueil' || !route.espace)) { surAccueil(ctx); return; }
    if (surPublic && (route.espace === 'explorer' || (!ctx && !route.espace))) {
      surPublic(ctx, route.params);
      return;
    }
    if (route.espace === 'connexion') {
      if (ctx) aller(routeAccueil(ctx));
      else surLogin(route);
      return;
    }
    if (!ctx) {
      surLogin(routeCourante());
      return;
    }

    const { espace, page, params } = routeCourante();
    const monEspace = segmentEspace(ctx);

    // Route vide, ou espace d'un autre rôle : on reconduit à l'accueil du sien.
    if (!espace || !page) {
      aller(routeAccueil(ctx));
      return;
    }
    if (espace !== monEspace) {
      rendre(ctx, vueRefus(ctx), refusExplicite(ctx, espace, page, 'espace'));
      return;
    }

    // Repli : `validation/app-123` doit retrouver la page `validation`.
    const emplacement = localiser(ctx, page) ?? localiser(ctx, page.split('/')[0]);
    if (!emplacement) {
      rendre(ctx, vueRefus(ctx), refusExplicite(ctx, espace, page, 'droit'));
      return;
    }

    const cle = `${espace}/${emplacement.page.route}`;
    const rendu = ecrans.get(cle);
    if (!rendu) {
      rendre(ctx, emplacement, enChantier(emplacement.page.libelle));
      return;
    }

    try {
      const contenu = await rendu(ctx, params);
      rendre(ctx, emplacement, contenu);
    } catch (erreur) {
      rendre(ctx, emplacement, ecranErreur(erreur));
    }
    document.getElementById('contenu')?.focus({ preventScroll: true });
  }

  globalThis.addEventListener('hashchange', traiter);
  return traiter;
}

/**
 * Emplacement de repli, pour afficher un refus dans le shell.
 * @param {any} ctx
 */
function vueRefus(ctx) {
  const zones = arborescenceDe(ctx);
  return { zone: zones[0], page: { route: '', libelle: 'Accès refusé' } };
}

/**
 * Refus **explicite** : dit le rôle, le droit manquant, et où aller.
 * @param {any} ctx
 * @param {string} espace
 * @param {string} page
 * @param {'espace'|'droit'} cause
 * @returns {HTMLElement}
 */
function refusExplicite(ctx, espace, page, cause) {
  const r = role(ctx.roleId);
  const droit = droitDeRoute(espace, page);
  const libelleDroit = droit ? (DROITS[droit]?.libelle ?? droit) : null;

  return el('div.refus', { role: 'alert' }, [
    icone('shield', 30),
    el('h1', { text: 'Cet écran ne vous est pas accessible' }),
    el('p', {
      text:
        cause === 'espace'
          ? `L'adresse demandée appartient à l'espace « ${espace} ». ` +
            `Votre rôle « ${r.libelle} » dispose de son propre espace.`
          : `Votre rôle « ${r.libelle} » ne dispose pas du droit requis pour cet écran.`,
    }),
    libelleDroit
      ? el('p.refus-droit', { text: `Droit manquant : « ${libelleDroit} ».` })
      : null,
    el('p.refus-note', {
      text:
        'Ce message est volontairement explicite : un écran qui disparaîtrait sans ' +
        'explication se lirait comme un défaut du logiciel. Le cloisonnement des ' +
        'rôles est ce que ce POC démontre.',
    }),
    el('a', { class: 'btn btn-primary', href: routeAccueil(ctx), text: 'Revenir à mon espace' }),
  ]);
}

/**
 * Écran d'une page prévue mais non réalisée à ce jalon. Dit lequel, plutôt que
 * d'afficher une page vide.
 * @param {string} libelle
 */
function enChantier(libelle) {
  return el('div.empty', {}, [
    icone('clock', 28),
    el('h2', { text: libelle }),
    el('p', {
      text:
        'Cet écran est prévu au périmètre mais n’est pas réalisé à ce jalon. ' +
        'Le POC démontre d’abord son noyau transactionnel.',
    }),
  ]);
}

/**
 * Erreur d'écran. **Explicite et bloquante, jamais silencieuse.**
 * @param {unknown} erreur
 */
function ecranErreur(erreur) {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  console.error('[B2F]', erreur);
  return el('div.refus', { role: 'alert' }, [
    icone('alert', 30),
    el('h1', { text: 'Cet écran n’a pas pu être affiché' }),
    el('p', { text: message }),
  ]);
}
