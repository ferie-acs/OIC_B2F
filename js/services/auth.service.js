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
import { ETAT_INSCRIPTION } from '../domain/enums.js';
import { etatInscription } from '../domain/inscription.js';
// Lot b2 : organisation interne — filiales.
import { entiteOperationnelle, motifInactivite } from '../domain/organisation.js';

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
  if (abos.length === 0) {
    // Lot b2 : une filiale est couverte par l'abonnement de sa mère.
    const parentId = depot('groupement').brutParId(groupementId)?.parentId;
    if (parentId && parentId !== groupementId) return abonnementDe(parentId);
    return { actif: false, finitLe: null };
  }

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
  // Lot b2 : une filiale n'est active que si sa mère est vérifiée.
  const entite = g ? depot('groupement').brutParId(g) : null;
  const mere = entite?.parentId ? depot('groupement').brutParId(entite.parentId) : null;
  const motifEntite = motifInactivite(entite, mere);

  return {
    utilisateurId: utilisateur.id,
    roleId: utilisateur.roleId,
    groupementId: g,
    compteActif: utilisateur.etat === ETAT_COMPTE.ACTIF && entiteOperationnelle(entite, mere),
    ...(motifEntite ? { motifSuspension: motifEntite } : {}),
    abonnementActif: soumisAbonnement(utilisateur.roleId) ? abo.actif : true,
    // Lot b1 : une entreprise inscrite non activée n'ouvre que son dossier.
    inscriptionActivee: inscriptionActiveeDe(g),
    // Lot b1 : type de l'entreprise, pour adapter les textes d'aide (intermédiaire de fret).
    groupementType: g ? depot('groupement').brutParId(g)?.type ?? null : null,
    // Lot b5 : entreprise suspendue par l'exploitant (consultation seule).
    groupementSuspendu: g ? depot('groupement').brutParId(g)?.etat === ETAT_COMPTE.SUSPENDU : false,
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

  // Lot b5 : un compte désactivé par son administrateur ne se connecte plus. Le
  // message n'est servi qu'après un mot de passe exact : il ne révèle rien.
  if (u.etat !== ETAT_COMPTE.ACTIF) {
    journaliser(
      { utilisateurId: u.id, roleId: u.roleId, groupementId: u.groupementId },
      EVENEMENT_AUDIT.CONNEXION_REFUSEE,
      { cibleType: 'utilisateur', cibleId: u.id, details: 'Connexion refusée : compte désactivé.' },
    );
    throw new Error('Ce compte est désactivé. Adressez-vous à l’administrateur de votre organisation.');
  }

  // Durcissement transparent si le paramètre de coût a évolué.
  if (aRehacher(u.motDePasse)) {
    depot('utilisateur').modifier(u.id, { motDePasse: await hacher(motDePasse) });
  }

  const ctx = contexteDe(u);
  courant = ctx;
  sessionStorage.setItem(CLE_SESSION, u.id);
  sessionStorage.removeItem(CLE_MANDAT); // Lot b2 : une connexion repart de son propre espace.

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
  courant = avecMandat(contexteDe(u));
  return courant;
}

/** Recalcule le contexte — après une validation, qui libère des coordonnées. */
export function rafraichirContexte() {
  if (!courant) return null;
  const u = depot('utilisateur').brutParId(courant.utilisateurId);
  courant = u ? avecMandat(contexteDe(u)) : null;
  return courant;
}

/** @returns {import('../domain/access.js').Contexte|null} */
export function contexteCourant() {
  // Lot b2 : un contexte délégué est revérifié à chaque lecture — un mandat
  // retiré ou échu entre deux écrans referme aussitôt l'accès au mandant.
  if (courant?.mandat) return rafraichirContexte();
  return courant;
}

/** Ferme la session. */
export function deconnecter() {
  courant = null;
  sessionStorage.removeItem(CLE_SESSION);
  sessionStorage.removeItem(CLE_MANDAT);
}

/* ------------------------------------------------------------------ *
 * Lot b2 : organisation interne — contexte délégué d'un intermédiaire
 * ------------------------------------------------------------------ */

/** Mandat sous lequel la session agit, s'il y en a un. Même fabrique de clé. */
const CLE_MANDAT = `${PREFIXE}mandat`;

/**
 * Construction du contexte délégué, fournie par `mandat.service.js` (qui
 * dépend de ce module : l'inverse créerait un cycle d'import).
 * @type {((base: import('../domain/access.js').Contexte, mandatId: string) => import('../domain/access.js').Contexte)|null}
 */
let construireDelegue = null;

/**
 * Enregistre la fabrique du contexte délégué.
 * @param {(base: any, mandatId: string) => any} fabrique
 */
export function enregistrerContexteDelegue(fabrique) {
  construireDelegue = fabrique;
}

/**
 * Rend le contexte délégué si la session agit sous un mandat encore valable,
 * sinon le contexte propre de l'utilisateur. Un mandat devenu invalide est
 * oublié : l'utilisateur retrouve son espace, jamais celui du mandant.
 * @param {import('../domain/access.js').Contexte} base
 */
function avecMandat(base) {
  const mandatId = sessionStorage.getItem(CLE_MANDAT);
  if (!mandatId || !construireDelegue) return base;
  try {
    return construireDelegue(base, mandatId);
  } catch {
    sessionStorage.removeItem(CLE_MANDAT);
    return base;
  }
}

/**
 * Fait agir la session au nom d'un mandant (contexte délégué construit et
 * contrôlé par `mandat.service.js`), ou la ramène à son contexte propre.
 * @param {string|null} mandatId
 * @returns {import('../domain/access.js').Contexte|null}
 */
export function basculerMandat(mandatId) {
  if (mandatId) sessionStorage.setItem(CLE_MANDAT, mandatId);
  else sessionStorage.removeItem(CLE_MANDAT);
  return rafraichirContexte();
}

/**
 * L'utilisateur doit-il être renvoyé vers le réabonnement (M10.2) ?
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {{bloque: boolean, finitLe: string|null}}
 */
export function blocageAbonnement(ctx) {
  if (!soumisAbonnement(ctx.roleId)) return { bloque: false, finitLe: null };
  // Lot b1 : avant activation, il n'y a pas encore d'abonnement à renouveler ;
  // la restriction à « Mon dossier » est portée par `decider()`.
  if (ctx.inscriptionActivee === false) return { bloque: false, finitLe: null };
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

/**
 * Lot b1 — l'inscription du groupement est-elle activée ? Absent vaut activée :
 * groupements institutionnels et groupements antérieurs à l'inscription en ligne.
 * @param {string|null} groupementId
 * @returns {boolean}
 */
function inscriptionActiveeDe(groupementId) {
  if (!groupementId) return true;
  const g = depot('groupement').brutParId(groupementId);
  return etatInscription(g) === ETAT_INSCRIPTION.ACTIVEE;
}

/** Les états d'abonnement du POC, pour l'écran dédié. */
export { ETAT_ABONNEMENT };
