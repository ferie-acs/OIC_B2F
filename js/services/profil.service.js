/**
 * Mon profil, changement et récupération du mot de passe (lot b1).
 *
 * ## Récupération — la règle, sans exception
 *
 * Faille relevée sur l'application en service, corrigée ici :
 * 1. le code part **toujours à l'adresse enregistrée sur le compte**, jamais à
 *    une adresse saisie dans la demande ;
 * 2. **code à usage unique**, de **validité courte**, invalidé après quelques
 *    essais manqués ; seule son empreinte est conservée ;
 * 3. **le compte n'est pas bloqué** : l'ancien mot de passe reste valable tant
 *    que le nouveau n'est pas défini — une demande malveillante ne peut pas
 *    enfermer le titulaire hors de son compte ;
 * 4. **réponse identique** que l'adresse existe ou non, et temps de réponse
 *    comparable : la demande ne sert pas à sonder l'annuaire des comptes.
 *
 * @module services/profil.service
 */

import { hacher, identifiant, verifier } from '../core/crypto.js';
import { CANAL_MESSAGE, ETAT_COMPTE, EVENEMENT_AUDIT } from '../domain/enums.js';
import { RECUPERATION, motifMotDePasse } from '../domain/inscription.js';
import { role } from '../domain/roles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { envoyerModele } from './messagerie.service.js';

/** Réponse unique à toute demande de récupération. */
export const REPONSE_DEMANDE =
  'Si un compte correspond à cette adresse, un code à usage unique vient d’être envoyé à ' +
  `l’adresse enregistrée sur ce compte. Il est valable ${RECUPERATION.VALIDITE_MINUTES} minutes. ` +
  'Votre mot de passe actuel reste valable tant que vous n’en avez pas défini un nouveau.';

/** Message unique d'échec d'une réinitialisation. */
const ECHEC_CODE = 'Code invalide ou expiré. Vérifiez votre saisie, ou demandez un nouveau code.';

/** Au-delà de ce nombre de demandes en une période de validité, aucun nouveau code n'est émis. */
const DEMANDES_MAX_PAR_PERIODE = 3;

/** Contexte d'audit d'un utilisateur qui n'est pas connecté. */
const ctxDe = (u) => ({ utilisateurId: u.id, roleId: u.roleId, groupementId: u.groupementId ?? null });

/** Code numérique tiré par le générateur cryptographique. */
function tirerCode() {
  const valeurs = new Uint32Array(RECUPERATION.LONGUEUR_CODE);
  globalThis.crypto.getRandomValues(valeurs);
  return [...valeurs].map((v) => String(v % 10)).join('');
}

/**
 * Demande de récupération. **Ne lève jamais, et répond toujours la même chose.**
 *
 * @param {string} adresse Adresse saisie : sert à **retrouver** le compte, jamais
 *   de destination au code.
 * @returns {Promise<string>} {@link REPONSE_DEMANDE}.
 */
export async function demanderReinitialisation(adresse) {
  const normalise = String(adresse ?? '').trim().toLowerCase();
  const u = normalise ? depot('utilisateur').brutOu((x) => x.email === normalise)[0] : undefined;
  const code = tirerCode();
  // Le calcul d'empreinte a lieu dans tous les cas : le temps de réponse ne
  // trahit pas l'existence du compte.
  const empreinte = await hacher(code);
  if (!u || u.etat !== ETAT_COMPTE.ACTIF) return REPONSE_DEMANDE;

  const maintenant = Date.now();
  const fenetre = RECUPERATION.VALIDITE_MINUTES * 60000;
  const recentes = depot('reinitialisation').brutOu(
    (r) => r.utilisateurId === u.id && maintenant - new Date(r.creeeLe).getTime() < fenetre,
  );
  // Une rafale de demandes n'inonde pas la boîte du titulaire ; la réponse ne change pas.
  if (recentes.length >= DEMANDES_MAX_PAR_PERIODE) return REPONSE_DEMANDE;

  stockageInterne().transaction((tx) => {
    // Un seul code valable à la fois : les précédents sont invalidés.
    for (const r of tx.lire('reinitialisations').filter((x) => x.utilisateurId === u.id && !x.utiliseeLe && !x.invalideeLe)) {
      depot('reinitialisation').modifier(r.id, { invalideeLe: new Date(maintenant).toISOString() }, { tx });
    }
    depot('reinitialisation').creer({
      id: identifiant('rei'),
      utilisateurId: u.id,
      empreinte,
      creeeLe: new Date(maintenant).toISOString(),
      expireLe: new Date(maintenant + fenetre).toISOString(),
      tentatives: 0,
      demo: true,
    }, { tx });
    journaliser(ctxDe(u), EVENEMENT_AUDIT.MOT_DE_PASSE_DEMANDE, {
      cibleType: 'utilisateur',
      cibleId: u.id,
      details: 'Code de récupération envoyé à l’adresse enregistrée du compte.',
      tx,
    });
    // Le destinataire est le compte retrouvé : son adresse ENREGISTRÉE, pas la saisie.
    envoyerModele({
      modele: 'motdepasse.code',
      params: { minutes: RECUPERATION.VALIDITE_MINUTES },
      utilisateurIds: [u.id],
      canaux: [CANAL_MESSAGE.COURRIEL],
      code,
      tx,
    });
  });
  return REPONSE_DEMANDE;
}

/**
 * Définit un nouveau mot de passe avec le code reçu.
 *
 * @param {{adresse: string, code: string, motDePasse: string, confirmation: string}} saisie
 * @returns {Promise<void>}
 * @throws {Error} Message unique pour tout code refusé, quel qu'en soit le motif.
 */
export async function reinitialiserMotDePasse({ adresse, code, motDePasse, confirmation }) {
  const motif = motifMotDePasse(motDePasse, confirmation);
  if (motif) throw new Error(motif);
  const normalise = String(adresse ?? '').trim().toLowerCase();
  const u = depot('utilisateur').brutOu((x) => x.email === normalise)[0];
  const maintenant = new Date();
  const demande = u
    ? depot('reinitialisation')
      .brutOu((r) => r.utilisateurId === u.id && !r.utiliseeLe && !r.invalideeLe && new Date(r.expireLe) > maintenant)
      .sort((a, b) => new Date(b.creeeLe) - new Date(a.creeeLe))[0]
    : undefined;
  if (!u || !demande || u.etat !== ETAT_COMPTE.ACTIF) {
    await hacher(String(code ?? '')); // même coût que l'échec d'un code réel
    throw new Error(ECHEC_CODE);
  }

  const bon = await verifier(String(code ?? '').trim(), demande.empreinte);
  if (!bon) {
    const tentatives = demande.tentatives + 1;
    depot('reinitialisation').modifier(demande.id, {
      tentatives,
      invalideeLe: tentatives >= RECUPERATION.TENTATIVES_MAX ? maintenant.toISOString() : undefined,
    });
    throw new Error(
      tentatives >= RECUPERATION.TENTATIVES_MAX
        ? 'Trop d’essais : ce code n’est plus valable. Demandez un nouveau code.'
        : ECHEC_CODE,
    );
  }

  const empreinte = await hacher(String(motDePasse));
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(u.id, { motDePasse: empreinte }, { tx });
    for (const r of tx.lire('reinitialisations').filter((x) => x.utilisateurId === u.id && !x.utiliseeLe && !x.invalideeLe)) {
      depot('reinitialisation').modifier(r.id, r.id === demande.id
        ? { utiliseeLe: maintenant.toISOString() }
        : { invalideeLe: maintenant.toISOString() }, { tx });
    }
    journaliser(ctxDe(u), EVENEMENT_AUDIT.MOT_DE_PASSE_REINITIALISE, {
      cibleType: 'utilisateur', cibleId: u.id, details: 'Mot de passe redéfini avec un code de récupération.', tx,
    });
    envoyerModele({ modele: 'motdepasse.modifie', utilisateurIds: [u.id], tx });
  });
}

/**
 * Change le mot de passe de l'utilisateur connecté. Le mot de passe actuel est exigé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{actuel: string, motDePasse: string, confirmation: string}} saisie
 * @returns {Promise<void>}
 */
export async function changerMotDePasse(ctx, { actuel, motDePasse, confirmation }) {
  const u = depot('utilisateur').brutParId(ctx.utilisateurId);
  if (!u) throw new Error('Compte introuvable.');
  if (!(await verifier(String(actuel ?? ''), u.motDePasse))) {
    journaliser(ctx, EVENEMENT_AUDIT.CONNEXION_REFUSEE, {
      cibleType: 'utilisateur', cibleId: u.id, details: 'Changement de mot de passe refusé : mot de passe actuel inexact.',
    });
    throw new Error('Le mot de passe actuel est inexact.');
  }
  const motif = motifMotDePasse(motDePasse, confirmation);
  if (motif) throw new Error(motif);
  if (String(motDePasse) === String(actuel)) throw new Error('Choisissez un mot de passe différent de l’actuel.');
  const empreinte = await hacher(String(motDePasse));
  const maintenant = new Date().toISOString();
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(u.id, { motDePasse: empreinte }, { tx });
    for (const r of tx.lire('reinitialisations').filter((x) => x.utilisateurId === u.id && !x.utiliseeLe && !x.invalideeLe)) {
      depot('reinitialisation').modifier(r.id, { invalideeLe: maintenant }, { tx });
    }
    journaliser(ctx, EVENEMENT_AUDIT.MOT_DE_PASSE_CHANGE, {
      cibleType: 'utilisateur', cibleId: u.id, details: 'Mot de passe changé par son titulaire.', tx,
    });
    envoyerModele({ modele: 'motdepasse.modifie', utilisateurIds: [u.id], tx });
  });
}

/**
 * Profil de l'utilisateur connecté — **ses propres données**, coordonnées
 * comprises. Lecture bornée aux champs affichés ; jamais l'empreinte.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Record<string, any>}
 */
export function monProfil(ctx) {
  const u = depot('utilisateur').brutParId(ctx.utilisateurId);
  if (!u) throw new Error('Compte introuvable.');
  const g = u.groupementId ? depot('groupement').brutParId(u.groupementId) : null;
  return {
    nom: u.nom,
    prenom: u.prenom ?? '',
    fonction: u.fonction ?? '',
    email: u.email,
    telephone: u.telephone ?? '',
    role: role(u.roleId).libelle,
    entreprise: g?.raisonSociale ?? null,
    dernierAccesLe: u.dernierAccesLe ?? null,
    creeLe: u.creeLe,
  };
}

/**
 * Met à jour les coordonnées personnelles. L'adresse de connexion n'est pas
 * modifiable ici : c'est elle qui reçoit les codes de récupération, et la
 * changer sans contrôle ouvrirait la prise de compte.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{nom: string, prenom?: string, fonction?: string, telephone?: string}} saisie
 */
export function mettreAJourProfil(ctx, saisie) {
  const u = depot('utilisateur').brutParId(ctx.utilisateurId);
  if (!u) throw new Error('Compte introuvable.');
  const nom = String(saisie.nom ?? '').trim();
  if (!nom) throw new Error('Le nom est obligatoire.');
  const telephone = String(saisie.telephone ?? '').trim();
  if (telephone && !/^\+?[\d\s.()-]{8,20}$/.test(telephone)) {
    throw new Error('Le numéro de téléphone n’a pas un format valide.');
  }
  stockageInterne().transaction((tx) => {
    depot('utilisateur').modifier(u.id, {
      nom: nom.slice(0, 80),
      prenom: String(saisie.prenom ?? '').trim().slice(0, 80),
      fonction: String(saisie.fonction ?? '').trim().slice(0, 80),
      telephone,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.PROFIL_MODIFIE, {
      cibleType: 'utilisateur', cibleId: u.id, details: 'Coordonnées personnelles mises à jour.', tx,
    });
  });
}
