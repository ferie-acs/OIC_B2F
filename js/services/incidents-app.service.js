/**
 * Incidents applicatifs : un défaut de la plateforme signalé par un
 * utilisateur, qualifié, attribué et suivi par l'OIC jusqu'à sa clôture.
 *
 * À ne pas confondre avec les incidents de transport (panne, retard, barrage),
 * qui vivent dans le journal du transport et relèvent des parties.
 *
 * Cycle : nouveau → qualifié (gravité retenue, impact) → en traitement
 * (attribué à un agent habilité) → résolu (description de la résolution) → clos.
 * Chaque passage est ajouté au suivi de l'incident et au journal d'audit, et le
 * groupement du déclarant en est notifié.
 *
 * @module services/incidents-app.service
 */

import { identifiant } from '../core/crypto.js';
import { decider, exiger } from '../domain/access.js';
import {
  CATEGORIE_INCIDENT_APP,
  ETAT_COMPTE,
  ETAT_INCIDENT_APP,
  EVENEMENT_AUDIT,
  GRAVITE_INCIDENT_APP,
  labelOf,
} from '../domain/enums.js';
import { PORTEE, porteeDe } from '../domain/permissions.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { notifier } from './notification.service.js';
import { RefusAdministration, maintenantIso, referenceSuivante, texteControle } from './admin-commun.js';

const TYPES_CAPTURE = /^image\/(png|jpeg|webp|gif)$/;
const TAILLE_CAPTURE_MAX_KO = 5120;

/**
 * Signale un incident. La capture d'écran n'est pas conservée : seules ses
 * métadonnées (nom, type, taille) le sont, faute de stockage de fichiers.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{categorie: string, gravite: string, titre: string, description: string, ecran?: string, capture?: {nom: string, type: string, taille: number}|null}} saisie
 */
export function declarerIncident(ctx, saisie) {
  exiger(ctx, 'incident.declarer', { utilisateurId: ctx.utilisateurId, groupementId: ctx.groupementId ?? null });
  if (!Object.values(CATEGORIE_INCIDENT_APP).includes(saisie.categorie)) throw new RefusAdministration('Choisissez une catégorie.');
  if (!Object.values(GRAVITE_INCIDENT_APP).includes(saisie.gravite)) throw new RefusAdministration('Indiquez la gêne ressentie.');
  const titre = texteControle(saisie.titre, 'Titre', { min: 5, max: 120 });
  const description = texteControle(saisie.description, 'Description', { min: 10, max: 2000 });
  const ecran = texteControle(saisie.ecran, 'Écran concerné', { min: 2, max: 160, requis: false });
  let capture;
  if (saisie.capture) {
    const { nom, type, taille } = saisie.capture;
    if (!TYPES_CAPTURE.test(String(type))) throw new RefusAdministration('La capture doit être une image (PNG, JPEG, WebP ou GIF).');
    const tailleKo = Math.ceil(Number(taille) / 1024);
    if (!(tailleKo > 0) || tailleKo > TAILLE_CAPTURE_MAX_KO) throw new RefusAdministration('La capture dépasse 5 Mo.');
    capture = { nom: String(nom ?? 'capture').slice(0, 160), type: String(type), tailleKo };
  }
  const maintenant = maintenantIso();
  return stockageInterne().transaction((tx) => {
    const incident = depot('incident_applicatif').creer({
      id: identifiant('inc'),
      reference: referenceSuivante('incident_applicatif', 'IA'),
      categorie: saisie.categorie,
      gravite: saisie.gravite,
      etat: ETAT_INCIDENT_APP.NOUVEAU,
      titre,
      description,
      ecran: ecran || undefined,
      capture,
      groupementId: ctx.groupementId ?? undefined,
      declareParUtilisateurId: ctx.utilisateurId,
      declareParRoleId: ctx.roleId,
      declareLe: maintenant,
      suivi: [{ id: identifiant('sui'), horodatage: maintenant, auteurUtilisateurId: ctx.utilisateurId, etat: ETAT_INCIDENT_APP.NOUVEAU, commentaire: 'Signalement enregistré.' }],
      demo: true,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.INCIDENT_DECLARE, {
      cibleType: 'incident_applicatif',
      cibleId: incident.id,
      details: `Incident ${incident.reference} signalé — ${labelOf(saisie.categorie)}, gêne ${labelOf(saisie.gravite).toLowerCase()}.`,
      tx,
    });
    return incident;
  });
}

/**
 * Incidents visibles : tous pour qui les traite, les siens pour les autres.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function incidentsVisibles(ctx) {
  const traiter = decider(ctx, 'incident.traiter');
  if (!traiter.autorise) exiger(ctx, 'incident.declarer', { utilisateurId: ctx.utilisateurId, groupementId: ctx.groupementId ?? null });
  return depot('incident_applicatif')
    .brutOu((i) => traiter.autorise || i.declareParUtilisateurId === ctx.utilisateurId)
    .sort((a, b) => new Date(b.declareLe) - new Date(a.declareLe));
}

/**
 * Agents auxquels un incident peut être attribué : comptes actifs dont le rôle
 * détient le droit de traiter les incidents.
 */
export function agentsHabilites() {
  return depot('utilisateur')
    .brutOu((u) => u.etat === ETAT_COMPTE.ACTIF && porteeDe(u.roleId, 'incident.traiter') !== PORTEE.AUCUNE)
    .map((u) => ({ id: u.id, nom: `${u.prenom ?? ''} ${u.nom}`.trim() }));
}

/** @param {string} id */
function charger(id) {
  const i = depot('incident_applicatif').brutParId(id);
  if (!i) throw new RefusAdministration('Incident introuvable.');
  return i;
}

/** Écrit une étape : incident, journal d'audit, notification du déclarant. */
function avancer(ctx, incident, modifs, { etat, commentaire, evenement, details }) {
  const maintenant = maintenantIso();
  stockageInterne().transaction((tx) => {
    depot('incident_applicatif').modifier(incident.id, {
      ...modifs,
      etat,
      suivi: [...incident.suivi, { id: identifiant('sui'), horodatage: maintenant, auteurUtilisateurId: ctx.utilisateurId, etat, commentaire }],
    }, { tx });
    journaliser(ctx, evenement, { cibleType: 'incident_applicatif', cibleId: incident.id, details, tx });
    if (incident.groupementId && etat !== incident.etat) {
      notifier(incident.groupementId, evenement, {
        code: 'incident.suivi',
        params: { reference: incident.reference, etat: labelOf(etat) },
        cibleType: 'incident_applicatif',
        cibleId: incident.id,
        tx,
      });
    }
  });
}

/**
 * Qualifie un incident : gravité retenue et impact.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{graviteRetenue: string, impact: string}} saisie
 */
export function qualifierIncident(ctx, id, { graviteRetenue, impact }) {
  const i = charger(id);
  exiger(ctx, 'incident.traiter', { groupementId: i.groupementId ?? null });
  if (![ETAT_INCIDENT_APP.NOUVEAU, ETAT_INCIDENT_APP.QUALIFIE].includes(i.etat)) {
    throw new RefusAdministration('Cet incident est déjà en traitement : sa qualification est arrêtée.');
  }
  if (!Object.values(GRAVITE_INCIDENT_APP).includes(graviteRetenue)) throw new RefusAdministration('Choisissez la gravité retenue.');
  const texte = texteControle(impact, 'Impact', { min: 5, max: 600 });
  avancer(ctx, i, { graviteRetenue, impact: texte, qualifieParUtilisateurId: ctx.utilisateurId, qualifieLe: maintenantIso() }, {
    etat: ETAT_INCIDENT_APP.QUALIFIE,
    commentaire: `Gravité retenue : ${labelOf(graviteRetenue).toLowerCase()}. ${texte}`,
    evenement: EVENEMENT_AUDIT.INCIDENT_QUALIFIE,
    details: `Incident ${i.reference} qualifié — gravité ${labelOf(graviteRetenue).toLowerCase()}.`,
  });
}

/**
 * Attribue un incident qualifié à un agent habilité : il passe en traitement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} agentId
 */
export function attribuerIncident(ctx, id, agentId) {
  const i = charger(id);
  exiger(ctx, 'incident.traiter', { groupementId: i.groupementId ?? null });
  if (![ETAT_INCIDENT_APP.QUALIFIE, ETAT_INCIDENT_APP.EN_COURS].includes(i.etat)) {
    throw new RefusAdministration('Qualifiez l’incident avant de l’attribuer.');
  }
  const agent = agentsHabilites().find((a) => a.id === agentId);
  if (!agent) throw new RefusAdministration('Choisissez un agent actif habilité à traiter les incidents.');
  if (i.attribueAUtilisateurId === agentId) throw new RefusAdministration('L’incident est déjà attribué à cet agent.');
  avancer(ctx, i, { attribueAUtilisateurId: agentId, attribueLe: maintenantIso() }, {
    etat: ETAT_INCIDENT_APP.EN_COURS,
    commentaire: `Attribué à ${agent.nom}.`,
    evenement: EVENEMENT_AUDIT.INCIDENT_ATTRIBUE,
    details: `Incident ${i.reference} attribué à ${agent.nom}.`,
  });
}

/**
 * Ajoute une note de suivi à un incident en traitement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} commentaire
 */
export function commenterIncident(ctx, id, commentaire) {
  const i = charger(id);
  exiger(ctx, 'incident.traiter', { groupementId: i.groupementId ?? null });
  if (i.etat === ETAT_INCIDENT_APP.CLOS) throw new RefusAdministration('Cet incident est clos.');
  const texte = texteControle(commentaire, 'Note de suivi', { min: 5, max: 600 });
  avancer(ctx, i, {}, {
    etat: i.etat,
    commentaire: texte,
    evenement: EVENEMENT_AUDIT.INCIDENT_SUIVI,
    details: `Incident ${i.reference} : note de suivi ajoutée.`,
  });
}

/**
 * Déclare la résolution d'un incident en traitement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} resolution
 */
export function resoudreIncident(ctx, id, resolution) {
  const i = charger(id);
  exiger(ctx, 'incident.traiter', { groupementId: i.groupementId ?? null });
  if (i.etat !== ETAT_INCIDENT_APP.EN_COURS) throw new RefusAdministration('Seul un incident attribué et en traitement peut être résolu.');
  const texte = texteControle(resolution, 'Résolution', { min: 5, max: 1000 });
  avancer(ctx, i, { resolution: texte, resoluLe: maintenantIso() }, {
    etat: ETAT_INCIDENT_APP.RESOLU,
    commentaire: texte,
    evenement: EVENEMENT_AUDIT.INCIDENT_SUIVI,
    details: `Incident ${i.reference} résolu.`,
  });
}

/**
 * Clôt un incident résolu.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 */
export function clore(ctx, id) {
  const i = charger(id);
  exiger(ctx, 'incident.traiter', { groupementId: i.groupementId ?? null });
  if (i.etat !== ETAT_INCIDENT_APP.RESOLU) throw new RefusAdministration('Un incident n’est clos qu’après sa résolution.');
  avancer(ctx, i, { closLe: maintenantIso() }, {
    etat: ETAT_INCIDENT_APP.CLOS,
    commentaire: 'Incident clos.',
    evenement: EVENEMENT_AUDIT.INCIDENT_CLOS,
    details: `Incident ${i.reference} clos.`,
  });
}

/**
 * Rouvre un incident résolu dont la correction ne tient pas.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {string} motif
 */
export function rouvrir(ctx, id, motif) {
  const i = charger(id);
  exiger(ctx, 'incident.traiter', { groupementId: i.groupementId ?? null });
  if (i.etat !== ETAT_INCIDENT_APP.RESOLU) throw new RefusAdministration('Seul un incident résolu peut être rouvert.');
  const texte = texteControle(motif, 'Motif', { min: 5, max: 600 });
  avancer(ctx, i, { resolution: undefined, resoluLe: undefined }, {
    etat: ETAT_INCIDENT_APP.EN_COURS,
    commentaire: `Rouvert : ${texte}`,
    evenement: EVENEMENT_AUDIT.INCIDENT_SUIVI,
    details: `Incident ${i.reference} rouvert.`,
  });
}
