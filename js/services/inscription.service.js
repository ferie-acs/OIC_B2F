/**
 * Inscription d'une entreprise et dossier « Mon dossier » (lot b1).
 *
 * ## Le parcours
 *
 * 1. **Inscription publique** — affréteur, transporteur ou intermédiaire de fret.
 *    Le formulaire est décrit par `domain/inscription.js`. Un e-mail, un RCCM ou
 *    un compte contribuable déjà connus sont refusés : c'est la parade à la
 *    fraude par doublon (une entreprise écartée qui revient sous un autre compte).
 * 2. **Compte en attente d'activation** — l'entreprise se connecte, mais
 *    `decider()` ne lui ouvre que son dossier : dépôt des pièces, suivi de leur
 *    contrôle, réponse à une demande de complément, correction de sa fiche.
 * 3. **Activation** par l'agent d'activation (`verification.service.js`).
 * 4. **Après activation**, toute modification d'une donnée d'identité est une
 *    demande soumise au contrôle : l'identité affichée reste celle qui a été
 *    vérifiée tant que l'agent n'a pas accepté la modification.
 *
 * Le fichier d'une pièce n'est jamais stocké : seules ses métadonnées le sont.
 *
 * @module services/inscription.service
 */

import { hacher, identifiant } from '../core/crypto.js';
import { exiger, projeter, projeterListe } from '../domain/access.js';
import {
  ETAT_COMPTE,
  ETAT_INSCRIPTION,
  ETAT_PIECE,
  ETAT_VERIFICATION,
  EVENEMENT_AUDIT,
  TYPE_GROUPEMENT,
  labelOf,
} from '../domain/enums.js';
import {
  CHAMPS_ENTREPRISE,
  CHAMPS_RESPONSABLE,
  bilanDossier,
  champsIdentite,
  estTypeInscriptible,
  etatInscription,
  motifMotDePasse,
  piecesDuType,
  typeInscription,
} from '../domain/inscription.js';
import { contientCoordonnees } from '../domain/texte.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { CONTEXTE_PLATEFORME, journaliser } from './audit.service.js';
import { envoyerModele } from './messagerie.service.js';

/** Types de fichier admis pour une pièce. */
export const FICHIERS_ADMIS = Object.freeze({
  types: Object.freeze(['application/pdf', 'image/jpeg', 'image/png']),
  extensions: Object.freeze(['pdf', 'jpg', 'jpeg', 'png']),
  tailleMaxOctets: 5 * 1024 * 1024,
});

const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise un identifiant administratif pour la comparaison anti-doublon. */
export function normaliserNumero(v) {
  return String(v ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
}

/** @param {unknown} v */
const texte = (v) => String(v ?? '').trim();

/* ================================================================== *
 * Contrôle anti-doublon
 * ================================================================== */

/**
 * Cherche un doublon parmi les entreprises et comptes connus.
 * @param {{email?: string, rccm?: string, compteContribuable?: string}} d
 * @param {string|null} [saufGroupementId] Entreprise à exclure (sa propre fiche).
 * @returns {string|null} Message de refus, ou `null`.
 */
export function motifDoublon({ email, rccm, compteContribuable }, saufGroupementId = null) {
  const autres = depot('groupement').brutOu((g) => g.id !== saufGroupementId);
  const mail = texte(email).toLowerCase();
  if (mail && depot('utilisateur').brutOu((u) => u.email === mail).length > 0) {
    return 'Cette adresse électronique est déjà utilisée par un compte de la plateforme. ' +
      'Si c’est la vôtre, connectez-vous ou utilisez « Mot de passe oublié ».';
  }
  if (rccm && autres.some((g) => g.rccm && normaliserNumero(g.rccm) === normaliserNumero(rccm))) {
    return 'Une entreprise portant ce numéro RCCM est déjà inscrite. Une même entreprise ne ' +
      'peut pas ouvrir un second compte : adressez-vous à l’OIC si vous pensez à une erreur.';
  }
  if (compteContribuable && autres.some((g) => g.compteContribuable
    && normaliserNumero(g.compteContribuable) === normaliserNumero(compteContribuable))) {
    return 'Une entreprise portant ce compte contribuable est déjà inscrite. Une même entreprise ' +
      'ne peut pas ouvrir un second compte : adressez-vous à l’OIC si vous pensez à une erreur.';
  }
  return null;
}

/* ================================================================== *
 * 1. Inscription publique
 * ================================================================== */

/**
 * Inscrit une entreprise et son responsable.
 *
 * @param {Record<string, any>} donnees Valeurs du formulaire : `type`, les champs
 *   de `CHAMPS_ENTREPRISE`, ceux du type, ceux de `CHAMPS_RESPONSABLE`,
 *   `motDePasse`, `confirmation`, `attestation`.
 * @returns {Promise<{groupementId: string, utilisateurId: string, email: string}>}
 */
export async function inscrire(donnees) {
  const type = texte(donnees.type);
  if (!estTypeInscriptible(type)) throw new Error('Choisissez le type de votre entreprise.');
  const def = typeInscription(type);

  const manquants = [...CHAMPS_ENTREPRISE, ...def.champs, ...CHAMPS_RESPONSABLE]
    .filter((c) => c.requis && !texte(donnees[c.nom]))
    .map((c) => c.libelle);
  if (manquants.length) {
    throw new Error(`Renseignez les champs obligatoires : ${manquants.join(', ')}.`);
  }
  const email = texte(donnees.email).toLowerCase();
  if (!COURRIEL.test(email) || !COURRIEL.test(texte(donnees.contactEmail))) {
    throw new Error('Une adresse électronique n’a pas un format valide.');
  }
  const motif = motifMotDePasse(donnees.motDePasse, donnees.confirmation);
  if (motif) throw new Error(motif);
  if (donnees.attestation !== true && donnees.attestation !== 'on') {
    throw new Error('Attestez l’exactitude des informations transmises.');
  }
  if (!depot('referentiel').brutParId(donnees.localiteId)) throw new Error('Choisissez la ville de l’entreprise.');
  for (const c of def.champs.filter((x) => x.type === 'date')) {
    if (new Date(`${donnees[c.nom]}T23:59:59`) < new Date()) {
      throw new Error(`« ${c.libelle} » : la date est dépassée. Une pièce échue ne permet pas l’inscription.`);
    }
  }

  const doublon = motifDoublon({ email, rccm: donnees.rccm, compteContribuable: donnees.compteContribuable });
  if (doublon) {
    // Trace de la tentative : une fraude par doublon se repère à sa répétition.
    journaliser(CONTEXTE_PLATEFORME, EVENEMENT_AUDIT.INSCRIPTION_REFUSEE, {
      cibleType: 'groupement',
      details: 'Inscription en ligne refusée : entreprise ou adresse déjà connue (contrôle anti-doublon).',
    });
    throw new Error(doublon);
  }

  const empreinte = await hacher(String(donnees.motDePasse));
  const maintenant = new Date().toISOString();
  const groupementId = identifiant('grp');
  const utilisateurId = identifiant('usr');

  /** @type {Record<string, any>} */
  const groupement = {
    id: groupementId,
    type,
    etat: ETAT_COMPTE.ACTIF,
    inscriptionEtat: ETAT_INSCRIPTION.EN_ATTENTE,
    inscritLe: maintenant,
    inscriptionEchanges: [],
    creeLe: maintenant,
    demo: true,
  };
  for (const c of [...CHAMPS_ENTREPRISE, ...def.champs]) {
    if (texte(donnees[c.nom])) groupement[c.nom] = texte(donnees[c.nom]);
  }
  groupement.contactNom = `${texte(donnees.prenom)} ${texte(donnees.nom)}`.trim();
  // Intégration b1 / b2 : l'état de vérification est écrit pour tout type
  // d'entreprise ; c'est lui que lisent les filiales et l'annuaire des intermédiaires.
  groupement.verificationEtat = ETAT_VERIFICATION.A_VERIFIER;

  const utilisateur = {
    id: utilisateurId,
    email,
    nom: texte(donnees.nom).toUpperCase(),
    prenom: texte(donnees.prenom),
    fonction: texte(donnees.fonction) || undefined,
    telephone: texte(donnees.telephone),
    roleId: def.role,
    groupementId,
    motDePasse: empreinte,
    etat: ETAT_COMPTE.ACTIF,
    creeLe: maintenant,
    demo: true,
  };
  const ctxNouveau = { utilisateurId, roleId: def.role, groupementId };

  stockageInterne().transaction((tx) => {
    depot('groupement').creer(groupement, { tx });
    depot('utilisateur').creer(utilisateur, { tx });
    journaliser(ctxNouveau, EVENEMENT_AUDIT.INSCRIPTION_RECUE, {
      cibleType: 'groupement',
      cibleId: groupementId,
      details: `Inscription en ligne — ${labelOf(type)}. Compte en attente d’activation.`,
      tx,
    });
    envoyerModele({
      modele: 'inscription.recue',
      params: { raisonSociale: groupement.raisonSociale, type: labelOf(type) },
      utilisateurIds: [utilisateurId],
      tx,
    });
  });

  return { groupementId, utilisateurId, email };
}

/* ================================================================== *
 * 2. Mon dossier
 * ================================================================== */

/** Groupement de l'utilisateur, brut — pour décider. */
function monGroupement(ctx) {
  const g = ctx.groupementId ? depot('groupement').brutParId(ctx.groupementId) : null;
  if (!g) throw new Error('Aucune entreprise n’est rattachée à votre compte.');
  if (!estTypeInscriptible(g.type)) throw new Error('Ce type d’entreprise n’a pas de dossier d’inscription.');
  return g;
}

/**
 * Dossier de l'entreprise de l'utilisateur connecté.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Record<string, any>}
 */
export function monDossier(ctx) {
  exiger(ctx, 'inscription.lire', { groupementId: ctx.groupementId });
  const brut = monGroupement(ctx);
  const pieces = depot('piece').brutOu((p) => p.groupementId === brut.id);
  const etat = etatInscription(brut);
  const def = typeInscription(brut.type);
  return {
    groupement: projeter(ctx, 'groupement', brut),
    // Sa propre fiche, coordonnées comprises : avant activation, la projection ne
    // lui libère pas encore le droit aux coordonnées, mais ce sont les siennes.
    fiche: Object.fromEntries([...CHAMPS_ENTREPRISE, ...def.champs].map((c) => [c.nom, brut[c.nom] ?? ''])),
    codeBfci: brut.codeBfci ?? null,
    activeLe: brut.activeLe ?? null,
    inscritLe: brut.inscritLe ?? brut.creeLe,
    motif: brut.inscriptionMotif ?? null,
    type: def,
    etat,
    pieces: projeterListe(ctx, 'piece', [...pieces].sort((a, b) => new Date(b.deposeLe) - new Date(a.deposeLe))),
    attendues: piecesDuType(brut.type),
    bilan: bilanDossier(brut.type, pieces),
    echanges: [...(brut.inscriptionEchanges ?? [])].reverse(),
    modificationProposee: brut.modificationProposee ?? null,
    peutDeposer: etat !== ETAT_INSCRIPTION.REFUSEE,
  };
}

/**
 * Dépose une pièce. **Seules les métadonnées du fichier sont enregistrées.**
 * Une pièce du même type déjà déposée est remplacée — elle reste à l'historique.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{typePiece: string, numero?: string, delivreeLe?: string, expireLe?: string,
 *   fichier: {nom: string, type: string, taille: number}}} saisie
 * @returns {Record<string, any>}
 */
export function deposerPiece(ctx, saisie) {
  exiger(ctx, 'inscription.deposer', { groupementId: ctx.groupementId });
  const g = monGroupement(ctx);
  if (etatInscription(g) === ETAT_INSCRIPTION.REFUSEE) {
    throw new Error('Votre inscription a été refusée : le dossier n’accepte plus de pièce.');
  }
  const attendue = piecesDuType(g.type).find((p) => p.code === saisie.typePiece);
  if (!attendue) throw new Error('Choisissez une pièce prévue pour votre type d’entreprise.');

  const f = saisie.fichier ?? {};
  const nom = texte(f.nom);
  const extension = nom.split('.').pop()?.toLowerCase() ?? '';
  if (!nom) throw new Error('Choisissez le fichier de la pièce.');
  if (!FICHIERS_ADMIS.types.includes(f.type) && !FICHIERS_ADMIS.extensions.includes(extension)) {
    throw new Error('Le fichier doit être un document PDF ou une image JPEG ou PNG.');
  }
  if (!(Number(f.taille) > 0)) throw new Error('Le fichier choisi est vide.');
  if (Number(f.taille) > FICHIERS_ADMIS.tailleMaxOctets) throw new Error('Le fichier dépasse la taille admise de 5 Mo.');
  if (attendue.echeance) {
    if (!saisie.expireLe) throw new Error('Indiquez la date de fin de validité de cette pièce.');
    if (new Date(`${saisie.expireLe}T23:59:59`) < new Date()) {
      throw new Error('Cette pièce est échue : déposez une pièce en cours de validité.');
    }
  }
  if (saisie.delivreeLe && new Date(`${saisie.delivreeLe}T00:00:00`) > new Date()) {
    throw new Error('La date de délivrance ne peut pas être dans le futur.');
  }

  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    for (const p of tx.lire('pieces_dossier').filter((x) => x.groupementId === g.id
      && x.typePiece === saisie.typePiece && x.etat !== ETAT_PIECE.REMPLACEE)) {
      depot('piece').modifier(p.id, { etat: ETAT_PIECE.REMPLACEE }, { tx });
    }
    const piece = depot('piece').creer({
      id: identifiant('pce'),
      groupementId: g.id,
      typePiece: saisie.typePiece,
      numero: texte(saisie.numero) || undefined,
      delivreeLe: saisie.delivreeLe || undefined,
      expireLe: saisie.expireLe || undefined,
      fichier: { nom: nom.slice(0, 200), type: texte(f.type) || extension, taille: Number(f.taille) },
      etat: ETAT_PIECE.DEPOSEE,
      deposeLe: maintenant,
      deposeParUtilisateurId: ctx.utilisateurId,
      demo: true,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.PIECE_DEPOSEE, {
      cibleType: 'piece',
      cibleId: piece.id,
      details: `Pièce déposée : ${attendue.libelle}.`,
      tx,
    });
    return piece;
  });
}

/**
 * Retire une pièce **pas encore contrôlée** — une erreur de fichier se corrige
 * sans attendre l'agent. Une pièce contrôlée reste au dossier.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} pieceId
 */
export function retirerPiece(ctx, pieceId) {
  const p = depot('piece').brutParId(pieceId);
  if (!p) throw new Error('Pièce introuvable.');
  exiger(ctx, 'inscription.deposer', { groupementId: p.groupementId });
  if (p.etat !== ETAT_PIECE.DEPOSEE) {
    throw new Error('Cette pièce a déjà été contrôlée : elle reste au dossier. Déposez une nouvelle pièce pour la remplacer.');
  }
  stockageInterne().transaction((tx) => {
    depot('piece').supprimer(pieceId, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.PIECE_RETIREE, {
      cibleType: 'groupement',
      cibleId: p.groupementId,
      details: 'Pièce non contrôlée retirée du dossier par l’entreprise.',
      tx,
    });
  });
}

/**
 * Met à jour la fiche de l'entreprise.
 *
 * - **Avant activation** : la fiche se corrige directement (le contrôle anti-
 *   doublon s'applique toujours).
 * - **Après activation** : les coordonnées s'appliquent directement ; les données
 *   d'identité forment une **demande de modification** soumise à l'agent
 *   d'activation. L'identité vérifiée reste en vigueur jusqu'à sa décision.
 * - **Inscription refusée** : plus aucune modification.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} modifs
 * @returns {{appliques: string[], soumis: string[]}}
 */
export function mettreAJourFiche(ctx, modifs) {
  exiger(ctx, 'inscription.deposer', { groupementId: ctx.groupementId });
  const g = monGroupement(ctx);
  const etat = etatInscription(g);
  if (etat === ETAT_INSCRIPTION.REFUSEE) throw new Error('Votre inscription a été refusée : la fiche n’est plus modifiable.');

  const def = typeInscription(g.type);
  const champs = [...CHAMPS_ENTREPRISE, ...def.champs];
  const identite = new Set(champsIdentite(g.type));
  /** @type {Record<string, string>} */
  const changes = {};
  for (const c of champs) {
    if (!(c.nom in modifs)) continue;
    const v = texte(modifs[c.nom]);
    if (c.requis && !v) throw new Error(`« ${c.libelle} » est obligatoire.`);
    if (v !== texte(g[c.nom])) changes[c.nom] = v;
  }
  if (changes.contactEmail && !COURRIEL.test(changes.contactEmail)) {
    throw new Error('L’adresse électronique de l’entreprise n’a pas un format valide.');
  }
  if (changes.localiteId && !depot('referentiel').brutParId(changes.localiteId)) {
    throw new Error('Choisissez la ville de l’entreprise.');
  }
  const doublon = motifDoublon({ rccm: changes.rccm, compteContribuable: changes.compteContribuable }, g.id);
  if (doublon) throw new Error(doublon);
  if (Object.keys(changes).length === 0) return { appliques: [], soumis: [] };

  const activee = etat === ETAT_INSCRIPTION.ACTIVEE;
  const appliques = Object.keys(changes).filter((n) => !activee || !identite.has(n));
  const soumis = Object.keys(changes).filter((n) => activee && identite.has(n));
  const libelles = (noms) => noms.map((n) => champs.find((c) => c.nom === n)?.libelle ?? n).join(', ');

  stockageInterne().transaction((tx) => {
    /** @type {Record<string, any>} */
    const maj = Object.fromEntries(appliques.map((n) => [n, changes[n]]));
    if (soumis.length) {
      maj.modificationProposee = {
        champs: { ...(g.modificationProposee?.champs ?? {}), ...Object.fromEntries(soumis.map((n) => [n, changes[n]])) },
        demandeeLe: new Date().toISOString(),
        demandeeParUtilisateurId: ctx.utilisateurId,
      };
    }
    depot('groupement').modifier(g.id, maj, { tx });
    if (appliques.length) {
      journaliser(ctx, EVENEMENT_AUDIT.FICHE_MODIFIEE, {
        cibleType: 'groupement', cibleId: g.id, details: `Fiche modifiée : ${libelles(appliques)}.`, tx,
      });
    }
    if (soumis.length) {
      journaliser(ctx, EVENEMENT_AUDIT.MODIFICATION_DEMANDEE, {
        cibleType: 'groupement', cibleId: g.id,
        details: `Modification soumise au contrôle : ${libelles(soumis)}.`, tx,
      });
    }
  });
  return { appliques, soumis };
}

/**
 * Transmet le dossier complété après une demande de complément. Le dossier
 * retourne dans la file de l'agent d'activation.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} reponse Message à l'agent (facultatif).
 */
export function transmettreComplement(ctx, reponse) {
  exiger(ctx, 'inscription.deposer', { groupementId: ctx.groupementId });
  const g = monGroupement(ctx);
  if (etatInscription(g) !== ETAT_INSCRIPTION.A_COMPLETER) {
    throw new Error('Aucun complément ne vous est demandé : votre dossier est déjà entre les mains de l’agent.');
  }
  const t = texte(reponse).slice(0, 1000);
  // L'agent ne reçoit aucune coordonnée : elles passent par la fiche, pas par un message.
  if (contientCoordonnees(t)) {
    throw new Error('Votre réponse ne peut pas contenir de numéro de téléphone, d’adresse électronique ' +
      'ni de lien : les coordonnées de l’entreprise se mettent à jour dans sa fiche.');
  }
  stockageInterne().transaction((tx) => {
    depot('groupement').modifier(g.id, {
      inscriptionEtat: ETAT_INSCRIPTION.EN_ATTENTE,
      inscriptionEchanges: [
        ...(g.inscriptionEchanges ?? []),
        { le: new Date().toISOString(), auteur: 'entreprise', nature: 'complement', texte: t || 'Dossier complété transmis.' },
      ],
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.COMPLEMENT_FOURNI, {
      cibleType: 'groupement', cibleId: g.id, details: 'Dossier complété transmis à l’agent d’activation.', tx,
    });
  });
}
