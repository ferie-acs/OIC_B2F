/**
 * Messagerie sortante — courriels et SMS **simulés** (lot b1).
 *
 * **Service unique de messagerie de l'application.** Tout message qui part vers
 * l'adresse ou le téléphone d'un utilisateur passe par ici : accusé
 * d'inscription, demande de complément, activation, code de récupération du mot
 * de passe, message libre de l'exploitant ou de l'agent d'activation. Les autres
 * lots qui doivent écrire à un utilisateur appellent {@link envoyerModele} ou
 * {@link envoyerAuGroupement} — ils ne créent pas de seconde messagerie.
 *
 * ## Ce qui est simulé, et comment on le voit
 *
 * Aucun courriel, aucun SMS ne quitte le navigateur. Le message est enregistré
 * avec l'adresse **enregistrée sur le compte** (jamais une adresse saisie dans
 * une demande), puis déposé dans la boîte de réception simulée de la
 * démonstration. Les écrans le disent : « message simulé ».
 *
 * ## Cloisonnement
 *
 * - Le destinataire retrouve ses messages (« Mes messages »).
 * - L'exploitant consulte le journal (`message.journal`) **sans les adresses** :
 *   elles sont de classification `contact`, que sa projection ne reçoit pas.
 * - Le code d'une récupération de mot de passe est de classification `systeme` :
 *   servi à personne, ni au destinataire connecté, ni à l'exploitant.
 *
 * @module services/messagerie.service
 */

import { identifiant } from '../core/crypto.js';
import { exiger, projeter, projeterListe } from '../domain/access.js';
import {
  CANAL_MESSAGE,
  ETAT_COMPTE,
  ETAT_INSCRIPTION,
  EVENEMENT_AUDIT,
  STATUT_MESSAGE,
  labelOf,
} from '../domain/enums.js';
import { TYPES_INSCRIPTION, etatInscription } from '../domain/inscription.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

/** Auteur des messages que la plateforme envoie seule. */
const PLATEFORME = 'plateforme';

/** Longueurs admises d'un message libre. */
const LIMITES = Object.freeze({ objetMin: 3, objetMax: 160, corpsMin: 3, corpsMax: 2000, smsMax: 320 });

/**
 * Gabarits des messages envoyés par la plateforme. Ils ne portent **aucun
 * montant ni aucune coordonnée** : le corps est lisible de l'exploitant.
 * @type {Readonly<Record<string, {objet: (p: any) => string, corps: (p: any) => string}>>}
 */
export const MODELES = Object.freeze({
  'inscription.recue': {
    objet: () => 'Votre inscription à la Bourse de Fret est enregistrée',
    corps: (p) =>
      `Bonjour,\n\nL’inscription de ${p.raisonSociale} (${p.type}) est enregistrée. ` +
      'Connectez-vous pour déposer les pièces de votre dossier dans l’espace « Mon dossier ». ' +
      'L’agent d’activation de l’OIC les contrôlera avant d’activer votre compte.\n\n' +
      'Bourse de Fret — Office Ivoirien des Chargeurs',
  },
  'complement.demande': {
    objet: () => 'Votre dossier d’inscription est à compléter',
    corps: (p) =>
      `Bonjour,\n\nL’agent d’activation a examiné le dossier de ${p.raisonSociale}. ` +
      `Il vous demande le complément suivant : ${p.motif}\n\n` +
      'Déposez les pièces demandées dans « Mon dossier », puis transmettez votre dossier complété.',
  },
  'inscription.refusee': {
    objet: () => 'Votre inscription n’a pas été retenue',
    corps: (p) =>
      `Bonjour,\n\nL’inscription de ${p.raisonSociale} n’a pas été retenue. Motif : ${p.motif}\n\n` +
      'Pour toute question, adressez-vous à l’Office Ivoirien des Chargeurs.',
  },
  'entreprise.activee': {
    objet: () => 'Votre compte Bourse de Fret est activé',
    corps: (p) =>
      `Bonjour,\n\nLe compte de ${p.raisonSociale} est activé. Votre code d’entreprise est ${p.code}. ` +
      `Votre période d’abonnement court du ${p.debut} au ${p.fin}.\n\n` +
      'Connectez-vous pour accéder à l’ensemble des services de la plateforme.',
  },
  'entreprise.requalifiee': {
    objet: () => 'Le type de votre entreprise a été modifié',
    corps: (p) =>
      `Bonjour,\n\nL’agent d’activation a requalifié ${p.raisonSociale} : ${p.avant} → ${p.apres}. ` +
      `Motif : ${p.motif}\n\nVos accès sont adaptés à votre nouveau type d’entreprise dès votre prochaine connexion.`,
  },
  'modification.acceptee': {
    objet: () => 'La modification de votre fiche est acceptée',
    corps: (p) => `Bonjour,\n\nLa modification de la fiche de ${p.raisonSociale} a été contrôlée et appliquée.`,
  },
  'modification.refusee': {
    objet: () => 'La modification de votre fiche n’est pas acceptée',
    corps: (p) =>
      `Bonjour,\n\nLa modification demandée pour ${p.raisonSociale} n’a pas été acceptée. Motif : ${p.motif}`,
  },
  'motdepasse.code': {
    objet: () => 'Code de récupération de votre mot de passe',
    corps: (p) =>
      'Bonjour,\n\nUne récupération de mot de passe a été demandée pour votre compte. ' +
      `Saisissez le code ci-dessous dans les ${p.minutes} minutes. Il ne sert qu’une fois.\n\n` +
      'Votre mot de passe actuel reste valable tant que vous n’en avez pas défini un nouveau. ' +
      'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
  },
  'motdepasse.modifie': {
    objet: () => 'Votre mot de passe a été modifié',
    corps: () =>
      'Bonjour,\n\nLe mot de passe de votre compte Bourse de Fret vient d’être modifié. ' +
      'Si vous n’êtes pas à l’origine de ce changement, prévenez immédiatement l’OIC.',
  },
});

/* ================================================================== *
 * Dépôt d'un message
 * ================================================================== */

/**
 * Enregistre un message pour un utilisateur, sur un canal. L'adresse est **lue
 * sur le compte**, jamais reçue de l'appelant.
 *
 * @param {Record<string, any>} utilisateur Enregistrement brut du destinataire.
 * @param {string} canal
 * @param {{objet: string, corps: string, code?: string, modele?: string, envoiId?: string,
 *   expediteurUtilisateurId?: string|null, expediteurRoleId?: string, tx?: any}} m
 * @returns {Record<string, any>}
 */
function deposer(utilisateur, canal, m) {
  const adresse = canal === CANAL_MESSAGE.SMS ? utilisateur.telephone : utilisateur.email;
  return depot('message').creer(
    {
      id: identifiant('msg'),
      canal,
      statut: adresse ? STATUT_MESSAGE.SIMULE : STATUT_MESSAGE.NON_REMIS,
      destinataireUtilisateurId: utilisateur.id,
      destinataireGroupementId: utilisateur.groupementId ?? null,
      adresse: adresse || null,
      objet: m.objet,
      corps: canal === CANAL_MESSAGE.SMS ? versSms(m.objet, m.corps) : m.corps,
      code: m.code ?? null,
      modele: m.modele ?? 'libre',
      envoiId: m.envoiId ?? null,
      expediteurUtilisateurId: m.expediteurUtilisateurId ?? null,
      expediteurRoleId: m.expediteurRoleId ?? PLATEFORME,
      envoyeLe: new Date().toISOString(),
      demo: true,
    },
    { tx: m.tx },
  );
}

/** Un SMS est court : l'objet, puis le début du texte. */
function versSms(objet, corps) {
  const texte = `${objet} — ${String(corps).replace(/\s+/g, ' ').trim()}`;
  return texte.length > LIMITES.smsMax ? `${texte.slice(0, LIMITES.smsMax - 1)}…` : texte;
}

/**
 * Envoie un message de la plateforme, composé depuis un gabarit, à des
 * utilisateurs désignés. **Point d'entrée des autres services et lots.**
 *
 * @param {{modele: string, params?: Record<string, any>, utilisateurIds?: string[],
 *   groupementId?: string, canaux?: string[], code?: string, tx?: any,
 *   expediteur?: {utilisateurId?: string|null, roleId?: string}}} p
 * @returns {Array<Record<string, any>>} Messages déposés.
 */
export function envoyerModele({ modele, params = {}, utilisateurIds, groupementId, canaux = [CANAL_MESSAGE.COURRIEL], code, tx, expediteur }) {
  const g = MODELES[modele];
  if (!g) throw new Error(`Gabarit de message inconnu : « ${modele} ».`);
  const lecteur = tx ? tx.lire('users') : depot('utilisateur').brutTous();
  const destinataires = utilisateurIds
    ? lecteur.filter((u) => utilisateurIds.includes(u.id))
    : lecteur.filter((u) => u.groupementId === groupementId && u.etat === ETAT_COMPTE.ACTIF);
  const envoiId = identifiant('env');
  return destinataires.flatMap((u) =>
    canaux.map((canal) =>
      deposer(u, canal, {
        objet: g.objet(params),
        corps: g.corps(params),
        code,
        modele,
        envoiId,
        expediteurUtilisateurId: expediteur?.utilisateurId ?? null,
        expediteurRoleId: expediteur?.roleId ?? PLATEFORME,
        tx,
      }),
    ),
  );
}

/* ================================================================== *
 * Envois libres — exploitant et agent d'activation
 * ================================================================== */

/**
 * Catégories d'entreprises destinataires d'un envoi groupé. Générées depuis la
 * configuration des types d'inscription : un type ajouté y figure d'office.
 * @type {ReadonlyArray<{id: string, libelle: string, retient: (g: Record<string, any>) => boolean}>}
 */
export const CATEGORIES = Object.freeze([
  {
    id: 'toutes',
    libelle: 'Toutes les entreprises inscrites',
    retient: (g) => TYPES_INSCRIPTION.some((t) => t.type === g.type),
  },
  ...TYPES_INSCRIPTION.map((t) => ({
    id: `type:${t.type}`,
    libelle: t.pluriel,
    retient: (g) => g.type === t.type,
  })),
  {
    id: 'en_attente',
    libelle: 'Entreprises en attente d’activation',
    retient: (g) =>
      [ETAT_INSCRIPTION.EN_ATTENTE, ETAT_INSCRIPTION.A_COMPLETER].includes(etatInscription(g)),
  },
  {
    id: 'activees',
    libelle: 'Entreprises activées',
    retient: (g) =>
      TYPES_INSCRIPTION.some((t) => t.type === g.type) && etatInscription(g) === ETAT_INSCRIPTION.ACTIVEE,
  },
]);

/**
 * Contrôle un message libre et ses canaux.
 * @returns {{objet: string, corps: string, canaux: string[]}}
 */
function messageLibre({ objet, corps, canaux }) {
  const o = String(objet ?? '').trim();
  const c = String(corps ?? '').trim();
  const liste = [...new Set((canaux ?? []).filter((x) => Object.values(CANAL_MESSAGE).includes(x)))];
  if (o.length < LIMITES.objetMin || o.length > LIMITES.objetMax) {
    throw new Error(`L’objet du message doit compter entre ${LIMITES.objetMin} et ${LIMITES.objetMax} caractères.`);
  }
  if (c.length < LIMITES.corpsMin || c.length > LIMITES.corpsMax) {
    throw new Error(`Le texte du message doit compter entre ${LIMITES.corpsMin} et ${LIMITES.corpsMax} caractères.`);
  }
  if (liste.length === 0) throw new Error('Choisissez au moins un canal : courriel ou SMS.');
  return { objet: o, corps: c, canaux: liste };
}

/**
 * Envoie un message libre à tous les utilisateurs actifs d'une entreprise.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} groupementId
 * @param {{objet: string, corps: string, canaux: string[]}} saisie
 * @returns {{envoyes: number, nonRemis: number}}
 */
export function envoyerAuGroupement(ctx, groupementId, saisie) {
  exiger(ctx, 'message.envoyer', { groupementId });
  const g = depot('groupement').brutParId(groupementId);
  if (!g) throw new Error('Entreprise introuvable.');
  const m = messageLibre(saisie);
  return envoyerA(ctx, [g], m, `Message adressé à une entreprise (${m.canaux.map((c) => labelOf(c)).join(', ')}).`, groupementId);
}

/**
 * Envoie un message libre à une catégorie d'entreprises. Réservé à qui consulte
 * aussi le journal des messages : l'envoi de masse est un acte d'exploitation.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{categorie: string, objet: string, corps: string, canaux: string[]}} saisie
 * @returns {{envoyes: number, nonRemis: number, entreprises: number}}
 */
export function envoyerACategorie(ctx, saisie) {
  exiger(ctx, 'message.envoyer', { groupementId: null });
  exiger(ctx, 'message.journal', undefined);
  const categorie = CATEGORIES.find((c) => c.id === saisie.categorie);
  if (!categorie) throw new Error('Choisissez la catégorie d’entreprises destinataire.');
  const m = messageLibre(saisie);
  const groupements = depot('groupement').brutOu(categorie.retient);
  if (groupements.length === 0) throw new Error('Aucune entreprise ne correspond à cette catégorie.');
  const bilan = envoyerA(
    ctx,
    groupements,
    m,
    `Envoi groupé « ${categorie.libelle} » à ${groupements.length} entreprise(s).`,
    null,
  );
  return { ...bilan, entreprises: groupements.length };
}

function envoyerA(ctx, groupements, m, details, cibleId) {
  const envoiId = identifiant('env');
  return stockageInterne().transaction((tx) => {
    let envoyes = 0;
    let nonRemis = 0;
    for (const g of groupements) {
      for (const u of tx.lire('users').filter((x) => x.groupementId === g.id && x.etat === ETAT_COMPTE.ACTIF)) {
        for (const canal of m.canaux) {
          const msg = deposer(u, canal, {
            objet: m.objet,
            corps: m.corps,
            modele: 'libre',
            envoiId,
            expediteurUtilisateurId: ctx.utilisateurId,
            expediteurRoleId: ctx.roleId,
            tx,
          });
          if (msg.statut === STATUT_MESSAGE.SIMULE) envoyes += 1;
          else nonRemis += 1;
        }
      }
    }
    journaliser(ctx, EVENEMENT_AUDIT.MESSAGE_ENVOYE, {
      cibleType: cibleId ? 'groupement' : 'message',
      cibleId: cibleId ?? envoiId,
      details,
      tx,
    });
    return { envoyes, nonRemis };
  });
}

/* ================================================================== *
 * Lecture
 * ================================================================== */

/**
 * Journal des messages sortants, du plus récent au plus ancien.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{canal?: string, destinataire?: string, depuis?: string, jusqua?: string}} [filtres]
 *   `destinataire` : texte cherché dans le nom du destinataire ou de son entreprise.
 * @returns {Array<Record<string, any>>} Messages projetés — sans adresse ni code.
 */
export function journalMessages(ctx, filtres = {}) {
  exiger(ctx, 'message.journal', undefined);
  const q = String(filtres.destinataire ?? '').trim().toLocaleLowerCase('fr');
  const utilisateurs = new Map(depot('utilisateur').brutTous().map((u) => [u.id, u]));
  const groupements = new Map(depot('groupement').brutTous().map((g) => [g.id, g]));
  const fin = filtres.jusqua ? new Date(`${filtres.jusqua}T23:59:59`) : null;
  const debut = filtres.depuis ? new Date(`${filtres.depuis}T00:00:00`) : null;

  return depot('message')
    .brutTous()
    .filter((m) => {
      if (filtres.canal && m.canal !== filtres.canal) return false;
      if (debut && new Date(m.envoyeLe) < debut) return false;
      if (fin && new Date(m.envoyeLe) > fin) return false;
      if (q) {
        const u = utilisateurs.get(m.destinataireUtilisateurId);
        const g = groupements.get(m.destinataireGroupementId);
        const texte = `${u?.prenom ?? ''} ${u?.nom ?? ''} ${g?.raisonSociale ?? ''}`.toLocaleLowerCase('fr');
        if (!texte.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.envoyeLe) - new Date(a.envoyeLe))
    .map((m) => projeter(ctx, 'message', m));
}

/**
 * Messages adressés à l'utilisateur connecté. Personne d'autre — pas même un
 * collègue du même groupement — ne les lit ici.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function mesMessages(ctx) {
  const miens = depot('message')
    .brutOu((m) => m.destinataireUtilisateurId === ctx.utilisateurId)
    .sort((a, b) => new Date(b.envoyeLe) - new Date(a.envoyeLe));
  // Ses propres messages lui appartiennent : l'adresse enregistrée lui est rendue,
  // le code d'une récupération jamais (classification système).
  return miens.map((m) => {
    const p = projeterListe(ctx, 'message', [m])[0];
    return { ...p, adresse: m.adresse ?? null };
  });
}

/**
 * Nombre de messages non lus de l'utilisateur connecté.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {number}
 */
export function messagesNonLus(ctx) {
  return depot('message').brutOu((m) => m.destinataireUtilisateurId === ctx.utilisateurId && !m.luLe).length;
}

/**
 * Marque un message comme lu — par son seul destinataire.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 */
export function marquerMessageLu(ctx, id) {
  const m = depot('message').brutParId(id);
  if (!m || m.destinataireUtilisateurId !== ctx.utilisateurId || m.luLe) return;
  depot('message').modifier(id, { luLe: new Date().toISOString() });
}

/* ================================================================== *
 * Boîte de réception simulée — outil de démonstration
 * ================================================================== */

/** Durée pendant laquelle un message reste visible dans la boîte simulée. */
const RETENTION_BOITE_JOURS = 7;

/**
 * Contenu de la boîte de réception simulée : **ce qu'un serveur de messagerie
 * aurait remis**. Elle remplace, pour la démonstration, la messagerie de chaque
 * destinataire — c'est par elle qu'on lit un code de récupération sans compte
 * connecté. Elle liste tous les messages remis récemment, sans dépendre d'une
 * adresse saisie : la réponse au formulaire « mot de passe oublié » reste ainsi
 * identique, que l'adresse existe ou non.
 *
 * **N'existerait pas en production.** L'écran qui la sert le dit.
 *
 * @param {{limite?: number}} [options]
 * @returns {Array<{id: string, canal: string, adresse: string, objet: string, corps: string, code: string|null, envoyeLe: string}>}
 */
export function boiteSimulee({ limite = 30 } = {}) {
  const depuis = Date.now() - RETENTION_BOITE_JOURS * 86400000;
  return depot('message')
    .brutOu((m) => m.statut === STATUT_MESSAGE.SIMULE && new Date(m.envoyeLe).getTime() >= depuis)
    .sort((a, b) => new Date(b.envoyeLe) - new Date(a.envoyeLe))
    .slice(0, limite)
    .map((m) => ({
      id: m.id,
      canal: m.canal,
      adresse: m.adresse,
      objet: m.objet,
      corps: m.corps,
      code: m.code ?? null,
      envoyeLe: m.envoyeLe,
    }));
}
