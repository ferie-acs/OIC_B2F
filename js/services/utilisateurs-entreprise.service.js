/**
 * Lot b2 : organisation interne — les utilisateurs d'une entreprise.
 *
 * L'administrateur d'une entreprise (affréteur, transporteur, intermédiaire)
 * crée, modifie, désactive et réactive ses utilisateurs, et réinitialise un
 * accès. Quatre règles, vérifiées ici et non dans les écrans :
 *
 * 1. **Cloisonnement** : il n'agit que sur les comptes de son entreprise et de
 *    ses filiales, jamais sur ceux d'une autre entreprise ni sur un compte
 *    institutionnel.
 * 2. **Rôles bornés** : le rôle attribué est pris parmi ceux de son type
 *    d'entreprise (`rolesAttribuables`, `domain/roles.js`) — jamais un rôle OIC,
 *    jamais un rôle de délégation.
 * 3. **Pas d'auto-administration** : il ne modifie pas son propre rôle et ne se
 *    désactive pas ; l'entreprise garde toujours au moins un administrateur actif.
 * 4. **Code d'activation à usage unique**, affiché une seule fois à
 *    l'administrateur, stocké sous forme d'empreinte, valable 24 heures, invalidé
 *    après cinq essais erronés. Le mot de passe en place reste valable tant que
 *    le nouveau n'est pas défini : une réinitialisation ne bloque pas le compte.
 *
 * Tout changement d'état est journalisé (audit en ajout seul).
 *
 * @module services/utilisateurs-entreprise.service
 */

import { hacher, identifiant, verifier } from '../core/crypto.js';
import { decider, exiger } from '../domain/access.js';
import { ETAT_COMPTE, EVENEMENT_AUDIT } from '../domain/enums.js';
import {
  ALPHABET_CODE,
  ESSAIS_CODE_MAX,
  VALIDITE_CODE_HEURES,
  controlerMotDePasse,
} from '../domain/organisation.js';
import { PORTEE, porteeDe } from '../domain/permissions.js';
import { role, rolesAttribuables } from '../domain/roles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

/** Erreur métier affichable telle quelle. */
export class RefusOrganisation extends Error {
  /** @param {string|string[]} motifs */
  constructor(motifs) {
    const liste = Array.isArray(motifs) ? motifs : [motifs];
    super(liste.join(' '));
    this.name = 'RefusOrganisation';
    this.motifs = liste;
  }
}

const MOTIF_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Message unique de l'activation : il ne révèle jamais ce qui a échoué. */
const ECHEC_ACTIVATION =
  'Activation impossible : l’adresse, le code ou sa validité ne correspondent pas. ' +
  'Demandez un nouveau code à l’administrateur de votre entreprise.';

/* ------------------------------------------------------------------ *
 * Périmètre de gestion
 * ------------------------------------------------------------------ */

/**
 * Entreprises dont l'administrateur gère les comptes : la sienne et ses filiales.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<{id: string, raisonSociale: string, type: string, estMere: boolean}>}
 */
export function entitesGerees(ctx) {
  if (!ctx.groupementId || ctx.mandat) return [];
  const propre = depot('groupement').brutParId(ctx.groupementId);
  if (!propre) return [];
  const filiales = depot('groupement').brutOu((g) => g.parentId === ctx.groupementId);
  return [propre, ...filiales].map((g) => ({
    id: g.id,
    raisonSociale: g.raisonSociale,
    type: g.type,
    estMere: g.id === ctx.groupementId,
  }));
}

/**
 * Exige le droit de gérer ET l'appartenance de l'entreprise visée au périmètre.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 */
function exigerGestion(ctx, groupementId) {
  if (ctx.mandat) {
    throw new RefusOrganisation('Un intermédiaire n’administre pas les comptes de son mandant.');
  }
  exiger(ctx, 'utilisateur.gerer', { groupementId: ctx.groupementId });
  if (!entitesGerees(ctx).some((e) => e.id === groupementId)) {
    throw new RefusOrganisation(
      'Ce compte appartient à une autre entreprise : vous ne pouvez pas le modifier.',
    );
  }
}

/**
 * Charge un compte géré par l'administrateur, ou lève.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} utilisateurId
 */
function compteGere(ctx, utilisateurId) {
  const u = depot('utilisateur').brutParId(utilisateurId);
  if (!u) throw new RefusOrganisation('Compte introuvable.');
  if (role(u.roleId).institutionnel) {
    throw new RefusOrganisation('Un compte institutionnel ne s’administre pas depuis une entreprise.');
  }
  exigerGestion(ctx, u.groupementId);
  return u;
}

/** Le rôle administre-t-il les comptes de son entreprise ? */
function estAdministrateur(roleId) {
  return porteeDe(roleId, 'utilisateur.gerer') !== PORTEE.AUCUNE;
}

/**
 * Rôles que l'administrateur peut attribuer dans une entreprise de son périmètre.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} [groupementId] Par défaut, la sienne.
 * @returns {Array<{valeur: string, libelle: string}>}
 */
export function rolesProposes(ctx, groupementId = ctx.groupementId) {
  const g = depot('groupement').brutParId(groupementId);
  if (!g) return [];
  return rolesAttribuables(g.type, ctx.roleId).map((id) => ({ valeur: id, libelle: role(id).libelle }));
}

/**
 * Refuse la perte du dernier administrateur actif d'une entreprise.
 * @param {Record<string, any>} cible Compte dont l'état ou le rôle va changer.
 */
function garderUnAdministrateur(cible) {
  const autres = depot('utilisateur').brutOu(
    (u) =>
      u.groupementId === cible.groupementId &&
      u.id !== cible.id &&
      u.etat === ETAT_COMPTE.ACTIF &&
      estAdministrateur(u.roleId),
  );
  if (autres.length === 0) {
    throw new RefusOrganisation(
      'L’entreprise doit garder au moins un administrateur actif. Nommez-en un autre ' +
        'avant de retirer celui-ci.',
    );
  }
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

/**
 * Comptes de l'entreprise et de ses filiales, pour l'écran d'administration.
 *
 * Rend une **vue métier**, jamais l'objet stocké : ni empreinte, ni code. Les
 * adresses électroniques ne sont rendues qu'à qui administre ces comptes.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function utilisateursEntreprise(ctx) {
  exiger(ctx, 'utilisateur.lire', { groupementId: ctx.groupementId });
  const gere = decider(ctx, 'utilisateur.gerer', { groupementId: ctx.groupementId }).autorise;
  const entites = gere ? entitesGerees(ctx) : entitesGerees(ctx).filter((e) => e.estMere);
  const parId = new Map(entites.map((e) => [e.id, e]));
  const maintenant = Date.now();

  return depot('utilisateur')
    .brutOu((u) => parId.has(u.groupementId))
    .map((u) => {
      const a = codeDe(u);
      const activation = a && Date.parse(a.expireLe) > maintenant
        ? { expireLe: a.expireLe, motif: a.motif }
        : null;
      return {
        id: u.id,
        nom: u.nom,
        prenom: u.prenom ?? '',
        email: gere ? u.email : null,
        telephone: gere ? u.telephone ?? '' : null,
        roleId: u.roleId,
        roleLibelle: role(u.roleId).libelle,
        administrateur: estAdministrateur(u.roleId),
        groupementId: u.groupementId,
        entite: parId.get(u.groupementId)?.raisonSociale ?? '—',
        estMere: parId.get(u.groupementId)?.estMere ?? false,
        etat: u.etat,
        dernierAccesLe: u.dernierAccesLe ?? null,
        activationEnAttente: activation,
        soiMeme: u.id === ctx.utilisateurId,
      };
    })
    .sort((a, b) => Number(b.estMere) - Number(a.estMere)
      || a.entite.localeCompare(b.entite, 'fr')
      || a.nom.localeCompare(b.nom, 'fr'));
}

/* ------------------------------------------------------------------ *
 * Code d'activation
 * ------------------------------------------------------------------ */

/**
 * Tire un code de huit caractères, sans biais de modulo.
 * @returns {string} Forme `XXXX-XXXX`.
 */
export function genererCode() {
  const n = ALPHABET_CODE.length;
  const limite = 256 - (256 % n);
  let code = '';
  while (code.length < 8) {
    for (const o of globalThis.crypto.getRandomValues(new Uint8Array(16))) {
      if (o < limite && code.length < 8) code += ALPHABET_CODE[o % n];
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Code d'activation en attente d'un compte. Il est rangé dans `motDePasse`,
 * seul champ « systeme » de l'utilisateur (`schema.js`).
 * @param {Record<string, any>} u
 */
function codeDe(u) {
  return u?.motDePasse?.activation ?? null;
}

/**
 * Empreinte de mot de passe avec ou sans code d'activation : le mot de passe
 * en place est conservé tel quel — il reste valable.
 * @param {Record<string, any>} u
 * @param {Record<string, any>|null} activation
 */
function avecCode(u, activation) {
  const { activation: _ancien, ...motDePasse } = u.motDePasse ?? {};
  return activation ? { ...motDePasse, activation } : motDePasse;
}

/** Normalise une saisie de code : majuscules, sans espace ni tiret. */
function normaliserCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Prépare un code et son enregistrement. Le code en clair ne sort que d'ici,
 * vers l'administrateur, une seule fois.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {'creation'|'reinitialisation'} motif
 */
async function preparerCode(ctx, motif) {
  const code = genererCode();
  const emisLe = new Date();
  const expireLe = new Date(emisLe.getTime() + VALIDITE_CODE_HEURES * 3600000).toISOString();
  return {
    code,
    expireLe,
    activation: {
      empreinte: await hacher(normaliserCode(code)),
      emisLe: emisLe.toISOString(),
      expireLe,
      emisParUtilisateurId: ctx.utilisateurId,
      motif,
      echecs: 0,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Écriture
 * ------------------------------------------------------------------ */

/**
 * Contrôle la saisie d'un compte.
 * @param {{nom?: string, prenom?: string, email?: string, telephone?: string}} saisie
 * @param {string|null} idExistant
 */
function controlerSaisie(saisie, idExistant = null) {
  /** @type {string[]} */
  const manquements = [];
  const nom = String(saisie.nom ?? '').trim();
  const email = String(saisie.email ?? '').trim().toLowerCase();
  if (!nom) manquements.push('Le nom est obligatoire.');
  if (nom.length > 80 || String(saisie.prenom ?? '').trim().length > 80) {
    manquements.push('Le nom et le prénom comptent au plus 80 caractères.');
  }
  if (!MOTIF_EMAIL.test(email)) manquements.push('Indiquez une adresse électronique valide.');
  else if (depot('utilisateur').brutOu((u) => u.email === email && u.id !== idExistant).length > 0) {
    manquements.push('Cette adresse est déjà celle d’un compte de la plateforme.');
  }
  const telephone = String(saisie.telephone ?? '').trim();
  if (telephone && !/^[+\d][\d\s.-]{5,30}$/.test(telephone)) {
    manquements.push('Le numéro de téléphone n’est pas valide.');
  }
  if (manquements.length) throw new RefusOrganisation(manquements);
  return {
    nom,
    prenom: String(saisie.prenom ?? '').trim() || undefined,
    email,
    telephone: telephone || undefined,
  };
}

/**
 * Contrôle un rôle demandé pour une entreprise d'un type donné.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string|undefined} typeEntreprise
 * @param {string} roleId
 */
function controlerRole(ctx, typeEntreprise, roleId) {
  if (!rolesAttribuables(typeEntreprise, ctx.roleId).includes(roleId)) {
    throw new RefusOrganisation(
      'Ce rôle ne peut pas être attribué par une entreprise de votre type. Les rôles ' +
        'de l’OIC et de l’administration de la plateforme ne s’attribuent pas ici.',
    );
  }
}

/**
 * Construit un nouveau compte, non encore enregistré. Sert aussi à la création
 * d'une filiale, qui ouvre le compte de son responsable dans la même transaction.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{nom: string, prenom?: string, email: string, telephone?: string, roleId: string, groupementId?: string}} saisie
 * @param {{groupementNouveau?: Record<string, any>}} [options] Filiale en cours de création.
 * @returns {Promise<{compte: Record<string, any>, code: string, expireLe: string}>}
 */
export async function preparerCompte(ctx, saisie, options = {}) {
  const groupementId = options.groupementNouveau?.id ?? saisie.groupementId ?? ctx.groupementId;
  if (!options.groupementNouveau) exigerGestion(ctx, groupementId);
  const champs = controlerSaisie(saisie);
  const type = options.groupementNouveau?.type ?? depot('groupement').brutParId(groupementId)?.type;
  controlerRole(ctx, type, saisie.roleId);

  const { code, expireLe, activation } = await preparerCode(ctx, 'creation');
  // Mot de passe initial aléatoire et jamais communiqué : le compte ne s'ouvre
  // qu'avec le code d'activation.
  const inutilisable = await hacher(genererCode() + genererCode() + identifiant());
  return {
    code,
    expireLe,
    compte: {
      id: identifiant('usr'),
      ...champs,
      roleId: saisie.roleId,
      groupementId,
      creeParUtilisateurId: ctx.utilisateurId,
      motDePasse: { ...inutilisable, activation },
      etat: ETAT_COMPTE.ACTIF,
      creeLe: new Date().toISOString(),
      demo: true,
    },
  };
}

/**
 * Crée un compte et rend son code d'activation, à afficher une seule fois.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{nom: string, prenom?: string, email: string, telephone?: string, roleId: string, groupementId?: string}} saisie
 * @returns {Promise<{utilisateurId: string, code: string, expireLe: string}>}
 */
export async function creerUtilisateur(ctx, saisie) {
  const { compte, code, expireLe } = await preparerCompte(ctx, saisie);
  stockageInterne().transaction((tx) => {
    depot('utilisateur').creer(compte, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.UTILISATEUR_CREE, {
      cibleType: 'utilisateur',
      cibleId: compte.id,
      details:
        `Compte ${libelleCompte(compte)} créé — rôle ${role(compte.roleId).libelle}. ` +
        'Code d’activation à usage unique émis.',
      tx,
    });
  });
  return { utilisateurId: compte.id, code, expireLe };
}

/**
 * Modifie l'identité ou le rôle d'un compte.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} utilisateurId
 * @param {{nom: string, prenom?: string, email: string, telephone?: string, roleId: string}} saisie
 */
export function modifierUtilisateur(ctx, utilisateurId, saisie) {
  const u = compteGere(ctx, utilisateurId);
  const champs = controlerSaisie(saisie, u.id);
  const roleId = saisie.roleId ?? u.roleId;
  if (roleId !== u.roleId) {
    if (u.id === ctx.utilisateurId) {
      throw new RefusOrganisation('Vous ne pouvez pas modifier votre propre rôle.');
    }
    controlerRole(ctx, depot('groupement').brutParId(u.groupementId)?.type, roleId);
    if (estAdministrateur(u.roleId) && !estAdministrateur(roleId) && u.etat === ETAT_COMPTE.ACTIF) {
      garderUnAdministrateur(u);
    }
  }
  const changements = [];
  if (roleId !== u.roleId) changements.push(`rôle ${role(u.roleId).libelle} → ${role(roleId).libelle}`);
  if (champs.email !== u.email) changements.push('adresse électronique');
  if (champs.nom !== u.nom || (champs.prenom ?? '') !== (u.prenom ?? '')) changements.push('identité');
  if ((champs.telephone ?? '') !== (u.telephone ?? '')) changements.push('téléphone');

  return stockageInterne().transaction((tx) => {
    const maj = depot('utilisateur').modifier(
      u.id,
      { ...champs, roleId, modifieLe: new Date().toISOString() },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.UTILISATEUR_MODIFIE, {
      cibleType: 'utilisateur',
      cibleId: u.id,
      details: `Compte ${libelleCompte(maj)} modifié${changements.length ? ` : ${changements.join(', ')}` : ''}.`,
      tx,
    });
    return { id: maj.id };
  });
}

/**
 * Désactive un compte. Réversible ; un code d'activation en attente est annulé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} utilisateurId
 * @param {string} [motif]
 */
export function desactiverUtilisateur(ctx, utilisateurId, motif = '') {
  const u = compteGere(ctx, utilisateurId);
  if (u.id === ctx.utilisateurId) {
    throw new RefusOrganisation('Vous ne pouvez pas désactiver votre propre compte.');
  }
  if (u.etat === ETAT_COMPTE.SUSPENDU) throw new RefusOrganisation('Ce compte est déjà désactivé.');
  if (estAdministrateur(u.roleId)) garderUnAdministrateur(u);
  const raison = String(motif ?? '').trim();

  return stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(
      u.id,
      { etat: ETAT_COMPTE.SUSPENDU, motDePasse: avecCode(u, null), modifieLe: new Date().toISOString() },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.UTILISATEUR_DESACTIVE, {
      cibleType: 'utilisateur',
      cibleId: u.id,
      details: `Compte ${libelleCompte(u)} désactivé${raison ? ` — motif : ${raison}` : ''}.`,
      tx,
    });
    return { id: u.id };
  });
}

/**
 * Réactive un compte désactivé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} utilisateurId
 */
export function reactiverUtilisateur(ctx, utilisateurId) {
  const u = compteGere(ctx, utilisateurId);
  if (u.etat === ETAT_COMPTE.ACTIF) throw new RefusOrganisation('Ce compte est déjà actif.');
  return stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(u.id, { etat: ETAT_COMPTE.ACTIF, modifieLe: new Date().toISOString() }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.UTILISATEUR_REACTIVE, {
      cibleType: 'utilisateur',
      cibleId: u.id,
      details: `Compte ${libelleCompte(u)} réactivé.`,
      tx,
    });
    return { id: u.id };
  });
}

/**
 * Réinitialise l'accès d'un compte : émet un nouveau code à usage unique, qui
 * remplace le précédent. **Le compte n'est pas bloqué** : l'ancien mot de passe
 * reste valable jusqu'à ce que le nouveau soit défini.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} utilisateurId
 * @returns {Promise<{code: string, expireLe: string}>}
 */
export async function reinitialiserAcces(ctx, utilisateurId) {
  const u = compteGere(ctx, utilisateurId);
  if (u.etat !== ETAT_COMPTE.ACTIF) {
    throw new RefusOrganisation('Réactivez d’abord ce compte : un compte désactivé ne reçoit pas de code.');
  }
  const { code, expireLe, activation } = await preparerCode(ctx, 'reinitialisation');
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(u.id, { motDePasse: avecCode(u, activation) }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.ACCES_REINITIALISE, {
      cibleType: 'utilisateur',
      cibleId: u.id,
      details:
        `Accès de ${libelleCompte(u)} réinitialisé : code à usage unique émis, valable ` +
        `${VALIDITE_CODE_HEURES} heures. Le mot de passe en place reste valable jusqu’à son remplacement.`,
      tx,
    });
  });
  return { code, expireLe };
}

/**
 * Active un compte, ou change son mot de passe, avec un code reçu de
 * l'administrateur. **Sans session** : c'est l'écran de connexion qui l'appelle.
 *
 * Le message d'échec est unique — il ne dit jamais si l'adresse existe, si le
 * code est faux ou s'il a expiré. Les règles du mot de passe sont contrôlées
 * avant le code, pour que leur message ne renseigne pas sur la validité du code.
 *
 * @param {{email: string, code: string, motDePasse: string, confirmation: string}} saisie
 * @returns {Promise<void>}
 */
export async function activerCompte({ email, code, motDePasse, confirmation }) {
  const regles = controlerMotDePasse(motDePasse, confirmation);
  if (regles.length) throw new RefusOrganisation(regles);

  const normalise = String(email ?? '').trim().toLowerCase();
  const u = depot('utilisateur').brutOu((x) => x.email === normalise)[0];
  const a = codeDe(u);
  const valable = Boolean(a && Date.parse(a.expireLe) > Date.now() && (a.echecs ?? 0) < ESSAIS_CODE_MAX);
  const correct = valable ? await verifier(normaliserCode(code), a.empreinte) : false;

  if (!u || !valable || !correct) {
    if (u && a) {
      const echecs = (a.echecs ?? 0) + 1;
      depot('utilisateur').modifier(u.id, {
        motDePasse: avecCode(u, echecs >= ESSAIS_CODE_MAX || !valable ? null : { ...a, echecs }),
      });
    }
    throw new RefusOrganisation(ECHEC_ACTIVATION);
  }
  if (u.etat !== ETAT_COMPTE.ACTIF) throw new RefusOrganisation(ECHEC_ACTIVATION);

  const empreinte = await hacher(String(motDePasse));
  const auteur = { utilisateurId: u.id, roleId: u.roleId, groupementId: u.groupementId };
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(u.id, { motDePasse: empreinte }, { tx });
    journaliser(auteur, EVENEMENT_AUDIT.COMPTE_ACTIVE, {
      cibleType: 'utilisateur',
      cibleId: u.id,
      details: `Mot de passe défini par ${libelleCompte(u)} avec un code à usage unique.`,
      tx,
    });
  });
}

/**
 * Nom d'un compte pour le journal : identité, jamais l'adresse (le journal est
 * lisible de la DGTTC, à qui les coordonnées sont fermées).
 * @param {{nom: string, prenom?: string}} u
 */
function libelleCompte(u) {
  return `${u.prenom ?? ''} ${u.nom}`.trim();
}
