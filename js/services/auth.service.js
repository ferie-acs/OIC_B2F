/**
 * Authentification et contexte de session.
 *
 * Le contexte produit ici est celui que consomment `decider()` et `projeter()` :
 * c'est le point unique où l'on décide **qui est l'utilisateur, ce que son
 * abonnement autorise, et quels objets tiers lui sont libérés**.
 *
 * @module services/auth.service
 */

import { aRehacher, hacher, verifier } from '../core/crypto.js';
import { PREFIXE } from '../core/storage.js';
import { ETAT_ABONNEMENT, ETAT_COMPTE, EVENEMENT_AUDIT } from '../domain/enums.js';
import { liberationsDe } from '../domain/access.js';
import { role, soumisAbonnement } from '../domain/roles.js';
import { depot } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

/** Clé de session. Le préfixe vient de `core/storage.js` : une seule fabrique
 *  de clés dans tout le POC, pour que la parade du risque R5 reste vérifiable
 *  en un point (Definition of Done, point 5). */
const CLE_SESSION = `${PREFIXE}session`;

/** @type {import('../domain/access.js').Contexte|null} */
let courant = null;

/**
 * L'abonnement du groupement est-il actif ?
 *
 * **L'autorité est la date, jamais l'état stocké** : celui-ci n'existe que pour
 * la lisibilité des jeux de démonstration. Calcul à la lecture, aucune tâche
 * planifiée (cohérent avec D38).
 *
 * @param {string|null|undefined} groupementId
 * @returns {{actif: boolean, finitLe: string|null}}
 */
export function abonnementDe(groupementId) {
  if (!groupementId) return { actif: true, finitLe: null };
  const abos = depot('abonnement').brutOu((a) => a.groupementId === groupementId);
  if (abos.length === 0) return { actif: false, finitLe: null };

  const dernier = abos.sort((a, b) => new Date(b.finitLe) - new Date(a.finitLe))[0];
  const actif = new Date(dernier.finitLe) >= new Date(new Date().toDateString());
  return { actif, finitLe: dernier.finitLe };
}

/**
 * Construit le contexte d'accès d'un utilisateur.
 *
 * `objetsLiberes` est calculé ici, une fois par session, par la fonction pure du
 * domaine. Le verrou des coordonnées ne dépend donc d'aucun calcul improvisé par
 * un appelant (finding S11).
 *
 * @param {Record<string, any>} utilisateur
 * @returns {import('../domain/access.js').Contexte}
 */
export function contexteDe(utilisateur) {
  const g = utilisateur.groupementId ?? null;
  const abo = abonnementDe(g);

  return {
    utilisateurId: utilisateur.id,
    roleId: utilisateur.roleId,
    groupementId: g,
    compteActif: utilisateur.etat === ETAT_COMPTE.ACTIF,
    abonnementActif: soumisAbonnement(utilisateur.roleId) ? abo.actif : true,
    objetsLiberes: liberationsDe({
      groupementId: g,
      appariements: depot('appariement').brutTous(),
      offres: depot('offre').brutTous(),
      transports: depot('transport').brutTous(),
    }),
  };
}

/**
 * Connecte un utilisateur.
 *
 * **Message d'échec unique et non discriminant** : ne jamais révéler si une
 * adresse existe (spécification A.1).
 *
 * @param {string} email
 * @param {string} motDePasse
 * @returns {Promise<import('../domain/access.js').Contexte>}
 * @throws {Error} « Identifiants incorrects. »
 */
export async function connecter(email, motDePasse) {
  const normalise = String(email ?? '').trim().toLowerCase();
  const u = depot('utilisateur').brutOu((x) => x.email === normalise)[0];

  const ok = u ? await verifier(motDePasse, u.motDePasse) : false;
  if (!u || !ok) {
    if (u) {
      journaliser(
        { utilisateurId: u.id, roleId: u.roleId, groupementId: u.groupementId },
        EVENEMENT_AUDIT.CONNEXION_REFUSEE,
        { cibleType: 'utilisateur', cibleId: u.id, details: 'Tentative de connexion refusée.' },
      );
    }
    throw new Error('Identifiants incorrects.');
  }

  // Durcissement transparent si le paramètre de coût a évolué.
  if (aRehacher(u.motDePasse)) {
    depot('utilisateur').modifier(u.id, { motDePasse: await hacher(motDePasse) });
  }

  const ctx = contexteDe(u);
  courant = ctx;
  sessionStorage.setItem(CLE_SESSION, u.id);

  journaliser(ctx, EVENEMENT_AUDIT.CONNEXION, {
    cibleType: 'utilisateur',
    cibleId: u.id,
    details: `Connexion — rôle ${role(u.roleId).libelle}.`,
  });
  depot('utilisateur').modifier(u.id, { dernierAccesLe: new Date().toISOString() });

  return ctx;
}

/**
 * Rétablit la session d'un rechargement de page, si elle existe.
 * @returns {import('../domain/access.js').Contexte|null}
 */
export function reprendreSession() {
  if (courant) return courant;
  const id = sessionStorage.getItem(CLE_SESSION);
  if (!id) return null;
  const u = depot('utilisateur').brutParId(id);
  if (!u) return null;
  courant = contexteDe(u);
  return courant;
}

/** Recalcule le contexte — après une validation, qui libère des coordonnées. */
export function rafraichirContexte() {
  if (!courant) return null;
  const u = depot('utilisateur').brutParId(courant.utilisateurId);
  courant = u ? contexteDe(u) : null;
  return courant;
}

/** @returns {import('../domain/access.js').Contexte|null} */
export function contexteCourant() {
  return courant;
}

/** Ferme la session. */
export function deconnecter() {
  courant = null;
  sessionStorage.removeItem(CLE_SESSION);
}

/**
 * L'utilisateur doit-il être renvoyé vers le réabonnement (M10.2) ?
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {{bloque: boolean, finitLe: string|null}}
 */
export function blocageAbonnement(ctx) {
  if (!soumisAbonnement(ctx.roleId)) return { bloque: false, finitLe: null };
  const abo = abonnementDe(ctx.groupementId);
  return { bloque: !abo.actif, finitLe: abo.finitLe };
}

/**
 * Utilisateur courant, projeté — pour l'affichage de l'identité en barre latérale.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Record<string, any>|null}
 */
export function profil(ctx) {
  return depot('utilisateur').lire(ctx, ctx.utilisateurId, {
    proprietaireId: ctx.groupementId,
  });
}

/** Les états d'abonnement du POC, pour l'écran dédié. */
export { ETAT_ABONNEMENT };
