/**
 * Comptes du back-office : agents OIC et utilisateurs d'une institution (DGTTC).
 *
 * Deux périmètres, un seul jeu de règles :
 *
 * - **OIC** — l'administrateur de la plateforme (droit `agent.gerer`) gère les
 *   comptes portant un rôle institutionnel de l'exploitant (concessionnaire et
 *   profils de back-office). La DGTTC, entité distincte, n'en fait pas partie.
 * - **Institution** — l'administrateur DGTTC (droit `institution.utilisateurs`,
 *   portée groupement, et désignation `administrateur` sur son compte) gère les
 *   seuls comptes DGTTC de son institution.
 *
 * Règles communes : un administrateur ne change pas son propre rôle et ne se
 * désactive pas ; il reste toujours au moins un administrateur actif ; toute
 * action est journalisée avec son motif. La réinitialisation d'accès émet un
 * **code à usage unique**, valable quinze minutes, adressé à l'adresse
 * enregistrée du compte — jamais à une adresse saisie. Le compte reste
 * utilisable avec son mot de passe actuel tant que le nouveau n'est pas défini.
 *
 * @module services/agents.service
 */

import { hacher, identifiant, verifier } from '../core/crypto.js';
import { decider, exiger, projeter } from '../domain/access.js';
import { ETAT_COMPTE, EVENEMENT_AUDIT } from '../domain/enums.js';
import { PORTEE, porteeDe } from '../domain/permissions.js';
import { ROLES, role } from '../domain/roles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { RefusAdministration, adresseMasquee, maintenantIso, texteControle } from './admin-commun.js';

/** Durée de validité d'un code d'accès. */
export const VALIDITE_CODE_MINUTES = 15;
/** Nombre d'essais avant invalidation du code. */
export const ESSAIS_CODE_MAX = 5;

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Rôles de l'exploitant, attribuables par l'administrateur OIC. */
export const ROLES_OIC = Object.freeze(
  Object.values(ROLES)
    .filter((r) => r.institutionnel && r.id !== 'dgttc')
    .map((r) => r.id),
);

/**
 * Périmètre d'administration de l'utilisateur connecté, ou `null`.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function perimetreDe(ctx) {
  if (decider(ctx, 'agent.gerer').autorise) {
    return Object.freeze({
      type: 'oic',
      droit: 'agent.gerer',
      roles: ROLES_OIC,
      libelle: 'Agents de l’OIC',
      contient: (u) => ROLES_OIC.includes(u.roleId),
      estAdmin: (u) => u.etat === ETAT_COMPTE.ACTIF && porteeDe(u.roleId, 'agent.gerer') !== PORTEE.AUCUNE,
      groupementId: ctx.groupementId,
    });
  }
  const institution = decider(ctx, 'institution.utilisateurs');
  const moi = depot('utilisateur').brutParId(ctx.utilisateurId);
  if (institution.autorise && moi?.administrateur === true && ctx.groupementId) {
    return Object.freeze({
      type: 'institution',
      droit: 'institution.utilisateurs',
      roles: Object.freeze([ctx.roleId]),
      libelle: 'Utilisateurs de l’institution',
      contient: (u) => u.groupementId === ctx.groupementId && u.roleId === ctx.roleId,
      estAdmin: (u) => u.etat === ETAT_COMPTE.ACTIF && u.administrateur === true,
      groupementId: ctx.groupementId,
    });
  }
  return null;
}

/**
 * Motif de refus de l'écran de gestion, ou `null` si l'utilisateur administre.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {string|null}
 */
export function motifSansPerimetre(ctx) {
  if (perimetreDe(ctx)) return null;
  const d = decider(ctx, 'institution.utilisateurs');
  if (d.autorise) {
    return 'Vous consultez les comptes de votre institution. Leur création et leur ' +
      'désactivation reviennent à la personne désignée administrateur.';
  }
  const a = decider(ctx, 'agent.gerer');
  return a.explication || d.explication;
}

/** @param {import('../domain/access.js').Contexte} ctx */
function perimetreExige(ctx) {
  const p = perimetreDe(ctx);
  if (!p) throw new RefusAdministration(motifSansPerimetre(ctx) ?? 'Accès refusé.');
  return p;
}

/**
 * Comptes visibles du périmètre, projetés, avec une adresse masquée.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function comptesDuPerimetre(ctx) {
  const p = perimetreDe(ctx);
  // Un agent DGTTC non administrateur consulte la liste de son institution.
  const filtre = p
    ? p.contient
    : decider(ctx, 'institution.utilisateurs').autorise
      ? (u) => u.groupementId === ctx.groupementId && u.roleId === ctx.roleId
      : null;
  if (!filtre) exiger(ctx, 'agent.gerer', { groupementId: ctx.groupementId });

  const maintenant = Date.now();
  const codes = depot('code_acces').brutTous();
  return depot('utilisateur')
    .brutOu(filtre)
    .sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`, 'fr'))
    .map((u) => ({
      ...projeter(ctx, 'utilisateur', u, { proprietaireId: u.groupementId ?? null }),
      adresse: adresseMasquee(u.email),
      estAdministrateur: p ? p.estAdmin({ ...u, etat: ETAT_COMPTE.ACTIF }) : u.administrateur === true,
      codeEnCours: codes.some(
        (c) => c.utilisateurId === u.id && !c.utiliseLe && !c.annuleLe && new Date(c.expireLe).getTime() > maintenant,
      ),
      soi: u.id === ctx.utilisateurId,
    }));
}

/**
 * Nombre d'administrateurs actifs du périmètre, après une modification envisagée.
 * @param {ReturnType<typeof perimetreDe>} p
 * @param {Record<string, any>} [apres] Compte tel qu'il serait après l'action.
 */
function administrateursActifs(p, apres = null) {
  return depot('utilisateur')
    .brutOu(p.contient)
    .map((u) => (apres && u.id === apres.id ? apres : u))
    .filter((u) => p.estAdmin(u)).length;
}

/** @param {ReturnType<typeof perimetreDe>} p @param {string} id */
function compteCible(p, id) {
  const u = depot('utilisateur').brutParId(id);
  if (!u || !p.contient(u)) throw new RefusAdministration('Ce compte n’appartient pas à votre périmètre d’administration.');
  return u;
}

/** Code aléatoire lisible, sans caractère ambigu : `XXXX-XXXX`. */
function nouveauCode() {
  const octets = new Uint8Array(8);
  globalThis.crypto.getRandomValues(octets);
  const brut = [...octets].map((o) => ALPHABET[o % ALPHABET.length]).join('');
  return `${brut.slice(0, 4)}-${brut.slice(4)}`;
}

/**
 * Prépare un code à usage unique pour un compte : annule les codes en cours.
 * Le hachage précède la transaction (Web Crypto est asynchrone).
 */
async function preparerCode(ctx, utilisateurId) {
  const code = nouveauCode();
  const empreinte = await hacher(code);
  const creeLe = new Date();
  const expireLe = new Date(creeLe.getTime() + VALIDITE_CODE_MINUTES * 60000);
  return {
    code,
    expireLe: expireLe.toISOString(),
    ecrire: (tx) => {
      for (const c of depot('code_acces').brutOu((x) => x.utilisateurId === utilisateurId && !x.utiliseLe && !x.annuleLe)) {
        depot('code_acces').modifier(c.id, { annuleLe: creeLe.toISOString() }, { tx });
      }
      depot('code_acces').creer({
        id: identifiant('cod'),
        utilisateurId,
        empreinte,
        creeLe: creeLe.toISOString(),
        expireLe: expireLe.toISOString(),
        tentatives: 0,
        creeParUtilisateurId: ctx.utilisateurId,
        demo: true,
      }, { tx });
    },
  };
}

/** Message simulé : ce qui partirait à l'adresse enregistrée du compte. */
function messageSimule(u, code, expireLe) {
  return Object.freeze({
    simule: true,
    destinataire: adresseMasquee(u.email),
    objet: 'Bourse de Fret — votre code d’accès',
    code,
    expireLe,
    texte:
      `Bonjour ${u.prenom ?? ''} ${u.nom}. Un code d’accès à usage unique a été émis pour votre ` +
      `compte. Saisissez-le dans les ${VALIDITE_CODE_MINUTES} minutes sur la page « Code d’accès » ` +
      'pour définir votre mot de passe.',
  });
}

/**
 * Crée un compte du périmètre. Le compte ne reçoit aucun mot de passe connu :
 * un code d'accès part à son adresse pour qu'il définisse le sien.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{nom: string, prenom?: string, email: string, roleId: string, administrateur?: boolean, motif: string}} saisie
 */
export async function creerCompte(ctx, saisie) {
  const p = perimetreExige(ctx);
  exiger(ctx, p.droit, { groupementId: p.groupementId });

  const nom = texteControle(saisie.nom, 'Nom', { min: 2, max: 80 });
  const prenom = texteControle(saisie.prenom, 'Prénom', { min: 1, max: 80, requis: false });
  const email = String(saisie.email ?? '').trim().toLowerCase();
  if (!COURRIEL.test(email)) throw new RefusAdministration('Saisissez une adresse électronique valide.');
  if (depot('utilisateur').brutOu((u) => u.email === email).length) {
    throw new RefusAdministration('Cette adresse est déjà rattachée à un compte.');
  }
  const roleId = p.type === 'institution' ? p.roles[0] : saisie.roleId;
  if (!p.roles.includes(roleId)) throw new RefusAdministration('Choisissez un rôle de votre périmètre.');
  const motif = texteControle(saisie.motif, 'Motif');

  const id = identifiant('usr');
  const provisoire = await hacher(nouveauCode() + nouveauCode());
  const u = {
    id,
    email,
    nom,
    prenom: prenom || undefined,
    roleId,
    groupementId: p.groupementId ?? undefined,
    creeParUtilisateurId: ctx.utilisateurId,
    motDePasse: provisoire,
    etat: ETAT_COMPTE.ACTIF,
    administrateur: p.type === 'institution' ? saisie.administrateur === true : undefined,
    creeLe: maintenantIso(),
    demo: true,
  };
  const code = await preparerCode(ctx, id);

  stockageInterne().transaction((tx) => {
    depot('utilisateur').creer(u, { tx });
    code.ecrire(tx);
    journaliser(ctx, EVENEMENT_AUDIT.AGENT_CREE, {
      cibleType: 'utilisateur',
      cibleId: id,
      details: `Compte créé — rôle ${role(roleId).libelle}${u.administrateur ? ', administrateur' : ''}. Motif : ${motif}`,
      tx,
    });
    journaliser(ctx, EVENEMENT_AUDIT.ACCES_REINITIALISE, {
      cibleType: 'utilisateur',
      cibleId: id,
      details: 'Code d’accès initial adressé à l’adresse enregistrée du compte.',
      tx,
    });
  });
  return { utilisateurId: id, message: messageSimule(u, code.code, code.expireLe) };
}

/**
 * Modifie l'identité, le rôle ou la désignation d'administrateur d'un compte.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{nom?: string, prenom?: string, roleId?: string, administrateur?: boolean, motif: string}} saisie
 */
export function modifierCompte(ctx, id, saisie) {
  const p = perimetreExige(ctx);
  const u = compteCible(p, id);
  exiger(ctx, p.droit, { groupementId: u.groupementId ?? p.groupementId });
  const motif = texteControle(saisie.motif, 'Motif');

  const modifs = {};
  if (saisie.nom !== undefined) modifs.nom = texteControle(saisie.nom, 'Nom', { min: 2, max: 80 });
  if (saisie.prenom !== undefined) modifs.prenom = texteControle(saisie.prenom, 'Prénom', { min: 1, max: 80, requis: false }) || undefined;
  if (p.type === 'oic' && saisie.roleId !== undefined && saisie.roleId !== u.roleId) {
    if (!p.roles.includes(saisie.roleId)) throw new RefusAdministration('Choisissez un rôle de votre périmètre.');
    if (u.id === ctx.utilisateurId) {
      throw new RefusAdministration('Vous ne pouvez pas modifier votre propre rôle : demandez-le à un autre administrateur.');
    }
    modifs.roleId = saisie.roleId;
  }
  if (p.type === 'institution' && saisie.administrateur !== undefined && saisie.administrateur !== (u.administrateur === true)) {
    if (u.id === ctx.utilisateurId) {
      throw new RefusAdministration('Vous ne pouvez pas retirer votre propre désignation d’administrateur.');
    }
    modifs.administrateur = saisie.administrateur === true;
  }
  if (!Object.keys(modifs).length) throw new RefusAdministration('Aucune modification à enregistrer.');
  if (administrateursActifs(p, { ...u, ...modifs }) < 1) {
    throw new RefusAdministration('Au moins un administrateur actif doit subsister.');
  }

  const changements = [
    modifs.nom || modifs.prenom ? 'identité' : null,
    modifs.roleId ? `rôle ${role(u.roleId).libelle} → ${role(modifs.roleId).libelle}` : null,
    modifs.administrateur !== undefined ? (modifs.administrateur ? 'désigné administrateur' : 'désignation d’administrateur retirée') : null,
  ].filter(Boolean).join(', ');

  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(id, { ...modifs, modifieLe: maintenantIso() }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.AGENT_MODIFIE, {
      cibleType: 'utilisateur', cibleId: id, details: `Compte modifié (${changements}). Motif : ${motif}`, tx,
    });
  });
}

/**
 * Désactive un compte : il ne se connecte plus, ses codes en cours sont annulés.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} motifSaisi
 */
export function desactiverCompte(ctx, id, motifSaisi) {
  const p = perimetreExige(ctx);
  const u = compteCible(p, id);
  exiger(ctx, p.droit, { groupementId: u.groupementId ?? p.groupementId });
  const motif = texteControle(motifSaisi, 'Motif');
  if (u.id === ctx.utilisateurId) throw new RefusAdministration('Vous ne pouvez pas désactiver votre propre compte.');
  if (u.etat !== ETAT_COMPTE.ACTIF) throw new RefusAdministration('Ce compte est déjà désactivé.');
  if (administrateursActifs(p, { ...u, etat: ETAT_COMPTE.SUSPENDU }) < 1) {
    throw new RefusAdministration('Au moins un administrateur actif doit subsister.');
  }
  const maintenant = maintenantIso();
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(id, { etat: ETAT_COMPTE.SUSPENDU, modifieLe: maintenant }, { tx });
    for (const c of depot('code_acces').brutOu((x) => x.utilisateurId === id && !x.utiliseLe && !x.annuleLe)) {
      depot('code_acces').modifier(c.id, { annuleLe: maintenant }, { tx });
    }
    journaliser(ctx, EVENEMENT_AUDIT.AGENT_DESACTIVE, {
      cibleType: 'utilisateur', cibleId: id, details: `Compte désactivé. Motif : ${motif}`, tx,
    });
  });
}

/**
 * Réactive un compte désactivé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} motifSaisi
 */
export function reactiverCompte(ctx, id, motifSaisi) {
  const p = perimetreExige(ctx);
  const u = compteCible(p, id);
  exiger(ctx, p.droit, { groupementId: u.groupementId ?? p.groupementId });
  const motif = texteControle(motifSaisi, 'Motif');
  if (u.etat === ETAT_COMPTE.ACTIF) throw new RefusAdministration('Ce compte est déjà actif.');
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(id, { etat: ETAT_COMPTE.ACTIF, modifieLe: maintenantIso() }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.AGENT_REACTIVE, {
      cibleType: 'utilisateur', cibleId: id, details: `Compte réactivé. Motif : ${motif}`, tx,
    });
  });
}

/**
 * Émet un code d'accès à usage unique pour un compte du périmètre.
 * Le compte n'est pas bloqué : son mot de passe actuel reste valable tant que
 * le nouveau n'est pas défini.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} motifSaisi
 */
export async function reinitialiserAcces(ctx, id, motifSaisi) {
  const p = perimetreExige(ctx);
  const u = compteCible(p, id);
  exiger(ctx, p.droit, { groupementId: u.groupementId ?? p.groupementId });
  const motif = texteControle(motifSaisi, 'Motif');
  if (u.id === ctx.utilisateurId) {
    throw new RefusAdministration('Pour votre propre compte, utilisez la procédure de mot de passe oublié.');
  }
  if (u.etat !== ETAT_COMPTE.ACTIF) throw new RefusAdministration('Réactivez d’abord ce compte.');
  const code = await preparerCode(ctx, id);
  stockageInterne().transaction((tx) => {
    code.ecrire(tx);
    journaliser(ctx, EVENEMENT_AUDIT.ACCES_REINITIALISE, {
      cibleType: 'utilisateur',
      cibleId: id,
      details: `Code d’accès à usage unique adressé à l’adresse enregistrée du compte. Motif : ${motif}`,
      tx,
    });
  });
  return messageSimule(u, code.code, code.expireLe);
}

/**
 * Définit un nouveau mot de passe à l'aide d'un code d'accès. Message d'échec
 * unique : il ne révèle ni l'existence du compte ni la cause précise.
 *
 * @param {{email: string, code: string, motDePasse: string, confirmation: string}} saisie
 */
export async function utiliserCodeAcces({ email, code, motDePasse, confirmation }) {
  const ECHEC = 'Code invalide ou expiré. Demandez un nouveau code à votre administrateur.';
  const mdp = String(motDePasse ?? '');
  if (mdp.length < 8 || !/[A-Za-z]/.test(mdp) || !/\d/.test(mdp)) {
    throw new RefusAdministration('Le mot de passe compte au moins huit caractères, dont des lettres et des chiffres.');
  }
  if (mdp !== confirmation) throw new RefusAdministration('Les deux saisies du mot de passe diffèrent.');

  const normalise = String(email ?? '').trim().toLowerCase();
  const u = depot('utilisateur').brutOu((x) => x.email === normalise)[0];
  if (!u || u.etat !== ETAT_COMPTE.ACTIF) throw new RefusAdministration(ECHEC);
  const maintenant = new Date();
  const actif = depot('code_acces')
    .brutOu((c) => c.utilisateurId === u.id && !c.utiliseLe && !c.annuleLe)
    .sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe))[0];
  if (!actif || new Date(actif.expireLe) <= maintenant) throw new RefusAdministration(ECHEC);

  const saisi = String(code ?? '').trim().toUpperCase().replace(/\s/g, '');
  const ok = await verifier(saisi, actif.empreinte);
  if (!ok) {
    const tentatives = (actif.tentatives ?? 0) + 1;
    depot('code_acces').modifier(actif.id, {
      tentatives,
      annuleLe: tentatives >= ESSAIS_CODE_MAX ? maintenant.toISOString() : undefined,
    });
    throw new RefusAdministration(ECHEC);
  }

  const empreinte = await hacher(mdp);
  const ctxUtilisateur = { utilisateurId: u.id, roleId: u.roleId, groupementId: u.groupementId ?? null };
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(u.id, { motDePasse: empreinte, modifieLe: maintenant.toISOString() }, { tx });
    depot('code_acces').modifier(actif.id, { utiliseLe: maintenant.toISOString() }, { tx });
    journaliser(ctxUtilisateur, EVENEMENT_AUDIT.ACCES_RETABLI, {
      cibleType: 'utilisateur', cibleId: u.id, details: 'Mot de passe défini à l’aide d’un code d’accès à usage unique.', tx,
    });
  });
  return true;
}
