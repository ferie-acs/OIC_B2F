/**
 * Arborescence de navigation — **générée depuis la matrice des droits**.
 *
 * Garde-fou demandé par l'audit (§ 6.5) : « le menu et le routeur doivent être
 * générés depuis `droitsDuRole()`, sans aucune entrée écrite en dur — sinon un
 * écran d'administration apparaîtra pour `super_admin` hors matrice, et le
 * principe du refus par défaut sera mort sans que personne ne l'ait décidé. »
 *
 * Chaque page déclare donc le droit qui l'ouvre. Une page dont le droit n'est pas
 * accordé **n'existe pas** pour ce rôle : ni dans le menu, ni comme route.
 *
 * ## Deux niveaux réels (décision D30)
 *
 * Le rail porte les **zones**, la barre latérale les **pages** de la zone active.
 * Le POC DUT recopie chaque lien aux deux niveaux ; avec cinq rôles et une
 * trentaine d'écrans, cette duplication ne passe pas à l'échelle.
 *
 * @module core/nav
 */

import { decider } from '../domain/access.js';
import { ESPACE } from '../domain/roles.js';
import { espaceDe } from '../domain/access.js';
// Lot b2 : organisation interne
import { INTERMEDIAIRE, PAGES_ORGANISATION } from './nav-lot-b2.js';

/**
 * @typedef {object} Page
 * @property {string} route   Chemin sans le `#/espace/`.
 * @property {string} libelle
 * @property {string} [droit] Droit requis. Absent : toujours accessible.
 * @property {string} [jalon] Marque d'avancement affichée en démonstration.
 */

/**
 * @typedef {object} Zone
 * @property {string} id
 * @property {string} libelle
 * @property {string} icone
 * @property {Page[]} pages
 * @property {string} [droitZone]
 *   Droit sans lequel la zone entière disparaît, même si l'une de ses pages
 *   reste techniquement ouverte. Une zone « Marché » pour un rôle qui n'accède
 *   pas au marché n'a pas de sens, et une zone « Paramètres » sans droit
 *   d'administration non plus.
 */

/** Zones de l'espace Affréteur. @type {Zone[]} */
const AFFRETEUR = [
  {
    id: 'pilotage',
    libelle: 'Pilotage',
    icone: 'pilotage',
    pages: [
      { route: 'dashboard', libelle: 'Tableau de bord', droit: 'dashboard.perimetre' },
      { route: 'notifications', libelle: 'Notifications', droit: 'notification.lire' },
      // Lot b5 : incident applicatif.
      { route: 'incidents', libelle: 'Signaler un incident', droit: 'incident.declarer' },
    ],
  },
  {
    id: 'fret',
    libelle: 'Mon fret',
    icone: 'package',
    pages: [
      { route: 'declarations', libelle: 'Déclarations de fret', droit: 'declaration.lire' },
      { route: 'declarations/nouvelle', libelle: 'Nouvelle déclaration', droit: 'declaration.creer' },
      { route: 'demandes', libelle: 'Demandes de transport', droit: 'demande.lire' },
    ],
  },
  {
    id: 'marche',
    libelle: 'Marché',
    icone: 'market',
    droitZone: 'marche.offres',
    pages: [
      { route: 'marche', libelle: 'Rechercher un véhicule', droit: 'marche.offres' },
      { route: 'reservations', libelle: 'Mes réservations', droit: 'appariement.lire' },
    ],
  },
  {
    id: 'relations',
    libelle: 'Mises en relation',
    icone: 'handshake',
    pages: [
      { route: 'validation', libelle: 'À valider', droit: 'appariement.lire' },
      { route: 'relations', libelle: 'Mises en relation validées', droit: 'appariement.lire' },
      { route: 'suivi', libelle: 'Suivi des transports', droit: 'transport.lire' },
      { route: 'duts', libelle: 'Documents de transport', droit: 'dut.lire' },
    ],
  },
  {
    id: 'compte',
    libelle: 'Compte',
    icone: 'wallet',
    pages: [
      { route: 'compte', libelle: 'Solde et mouvements', droit: 'compte.lire' },
      { route: 'abonnement', libelle: 'Abonnement', droit: 'abonnement.lire' },
      // Lot b4 : paiements et reçus.
      { route: 'paiements', libelle: 'Paiements et reçus', droit: 'compte.lire' },
    ],
  },
  {
    id: 'parametres',
    libelle: 'Paramètres',
    icone: 'settings',
    droitZone: 'utilisateur.lire',
    pages: [
      { route: 'groupement', libelle: 'Fiche du groupement', droit: 'groupement.lire' },
      { route: 'utilisateurs', libelle: 'Utilisateurs et auxiliaires', droit: 'utilisateur.lire' },
      // Lot b2 : organisation interne
      ...PAGES_ORGANISATION,
    ],
  },
  /* --- Lot b1 : dossier, profil et messages de l'utilisateur --- */
  {
    id: 'moncompte',
    libelle: 'Mon compte',
    icone: 'user',
    pages: [
      { route: 'dossier', libelle: 'Mon dossier', droit: 'inscription.lire' },
      { route: 'profil', libelle: 'Mon profil' },
      { route: 'messages', libelle: 'Mes messages' },
    ],
  },
];

/** Zones de l'espace Transporteur. @type {Zone[]} */
const TRANSPORTEUR = [
  {
    id: 'pilotage',
    libelle: 'Pilotage',
    icone: 'pilotage',
    pages: [
      { route: 'dashboard', libelle: 'Tableau de bord', droit: 'dashboard.perimetre' },
      { route: 'notifications', libelle: 'Notifications', droit: 'notification.lire' },
      // Lot b5 : incident applicatif.
      { route: 'incidents', libelle: 'Signaler un incident', droit: 'incident.declarer' },
    ],
  },
  {
    id: 'flotte',
    libelle: 'Ma flotte',
    icone: 'truck',
    pages: [
      { route: 'vehicules', libelle: 'Véhicules', droit: 'vehicule.lire' },
      { route: 'chauffeurs', libelle: 'Chauffeurs', droit: 'chauffeur.lire' },
      { route: 'offres', libelle: 'Mes disponibilités', droit: 'offre.lire' },
      { route: 'offres/nouvelle', libelle: 'Publier une disponibilité', droit: 'offre.publier' },
    ],
  },
  {
    id: 'marche',
    libelle: 'Marché',
    icone: 'market',
    droitZone: 'marche.demandes',
    pages: [
      { route: 'marche', libelle: 'Demandes de transport', droit: 'marche.demandes' },
      { route: 'reservations', libelle: 'Réservations et propositions', droit: 'appariement.lire' },
    ],
  },
  {
    id: 'relations',
    libelle: 'Mises en relation',
    icone: 'handshake',
    pages: [
      { route: 'relations', libelle: 'Mises en relation validées', droit: 'appariement.lire' },
      { route: 'suivi', libelle: 'Suivi des transports', droit: 'transport.lire' },
      { route: 'dut', libelle: 'Documents de transport', droit: 'dut.lire' },
      /* Lot b3 : attestation de bourse de fret */
      { route: 'attestations', libelle: 'Attestations de bourse de fret', droit: 'attestation.lire' },
    ],
  },
  {
    id: 'compte',
    libelle: 'Compte',
    icone: 'wallet',
    pages: [
      { route: 'compte', libelle: 'Solde et mouvements', droit: 'compte.lire' },
      { route: 'abonnement', libelle: 'Abonnement', droit: 'abonnement.lire' },
      // Lot b4 : paiements et reçus.
      { route: 'paiements', libelle: 'Paiements et reçus', droit: 'compte.lire' },
    ],
  },
  {
    id: 'parametres',
    libelle: 'Paramètres',
    icone: 'settings',
    droitZone: 'utilisateur.lire',
    pages: [
      { route: 'groupement', libelle: 'Fiche du groupement', droit: 'groupement.lire' },
      { route: 'utilisateurs', libelle: 'Utilisateurs et auxiliaires', droit: 'utilisateur.lire' },
      // Lot b2 : organisation interne
      ...PAGES_ORGANISATION,
    ],
  },
  /* --- Lot b1 : dossier, profil et messages de l'utilisateur --- */
  {
    id: 'moncompte',
    libelle: 'Mon compte',
    icone: 'user',
    pages: [
      { route: 'dossier', libelle: 'Mon dossier', droit: 'inscription.lire' },
      { route: 'profil', libelle: 'Mon profil' },
      { route: 'messages', libelle: 'Mes messages' },
    ],
  },
];

/** Zones de l'espace Concessionnaire — l'exploitant. @type {Zone[]} */
const CONCESSIONNAIRE = [
  {
    id: 'pilotage',
    libelle: 'Pilotage',
    icone: 'pilotage',
    pages: [{ route: 'dashboard', libelle: "Tableau de bord d'activité", droit: 'dashboard.activite' }],
  },
  {
    id: 'acteurs',
    libelle: 'Acteurs',
    icone: 'building',
    pages: [
      { route: 'groupements', libelle: 'Groupements', droit: 'groupement.lire' },
      { route: 'roles', libelle: 'Profils et habilitations', droit: 'role.lire' },
    ],
  },
  {
    id: 'finances',
    libelle: 'Finances',
    icone: 'wallet',
    pages: [
      { route: 'comptes', libelle: 'Comptes et soldes', droit: 'compte.lire' },
      // Correctif anti-fraude n° 5 : la validation des crédits par une seconde personne.
      { route: 'credits', libelle: 'Crédits à valider', droit: 'compte.valider_credit' },
      { route: 'tarifs', libelle: 'Catalogue de tarifs', droit: 'tarif.lire' },
      { route: 'abonnements', libelle: 'Abonnements', droit: 'abonnement.lire' },
    ],
  },
  {
    id: 'marche',
    libelle: 'Marché',
    icone: 'market',
    pages: [
      { route: 'marche', libelle: 'Déclarations et offres', droit: 'declaration.lire' },
      { route: 'relations', libelle: 'Mises en relation', droit: 'appariement.lire' },
      { route: 'duts', libelle: 'Documents de transport', droit: 'dut.lire' },
    ],
  },
  {
    id: 'journal',
    libelle: 'Journal',
    icone: 'history',
    pages: [{ route: 'audit', libelle: "Journal d'audit", droit: 'audit.lire' }],
  },
  /* --- Lot b1 : messagerie sortante --- */
  {
    id: 'messagerie',
    libelle: 'Messagerie',
    icone: 'mail',
    pages: [{ route: 'messagerie', libelle: 'Messages envoyés', droit: 'message.journal' }],
  },
  /* --- Lot b4 : caisse, états financiers, contentieux --- */
  {
    id: 'caisse',
    libelle: 'Caisse',
    icone: 'receipt',
    pages: [
      { route: 'caisse', libelle: 'Encaissement au guichet', droit: 'caisse.encaisser' },
      { route: 'encaissements', libelle: 'Encaissements à valider', droit: 'caisse.valider' },
      { route: 'etats-financiers', libelle: 'États et exports', droit: 'rapport.financier' },
      { route: 'contentieux', libelle: 'Contentieux', droit: 'contentieux.lire' },
    ],
  },
  /* Lot b5 : administration OIC */
  {
    id: 'administration',
    libelle: 'Administration',
    icone: 'settings',
    pages: [
      { route: 'agents', libelle: 'Comptes des agents OIC', droit: 'agent.gerer' },
      { route: 'referentiels', libelle: 'Référentiels nationaux', droit: 'referentiel.gerer' },
      { route: 'incidents', libelle: 'Incidents applicatifs', droit: 'incident.traiter' },
      { route: 'flux', libelle: 'Flux public des offres', droit: 'flux.offres' },
    ],
  },
];

/**
 * Zones de l'espace DGTTC — le contrôle.
 * **Aucune zone « Finances ».** C'est l'arbitrage N3 rendu visible dans la
 * structure même de la navigation.
 * @type {Zone[]}
 */
const DGTTC = [
  {
    id: 'pilotage',
    libelle: 'Pilotage',
    icone: 'pilotage',
    pages: [
      { route: 'dashboard', libelle: 'Tableau de bord national', droit: 'dashboard.activite' },
      // Intégration : comme dans les autres espaces, l'incident se signale depuis le pilotage.
      { route: 'incidents', libelle: 'Signaler un incident', droit: 'incident.declarer' },
    ],
  },
  {
    id: 'controle',
    libelle: 'États de contrôle',
    icone: 'shield',
    pages: [
      { route: 'etats', libelle: 'Déclarations et offres', droit: 'controle.etats' },
      { route: 'relations', libelle: 'Mises en relation', droit: 'appariement.lire' },
    ],
  },
  {
    id: 'acteurs',
    libelle: 'Acteurs',
    icone: 'building',
    pages: [
      { route: 'acteurs', libelle: 'Transporteurs et affréteurs', droit: 'groupement.lire' },
      { route: 'parc', libelle: 'Parc de véhicules', droit: 'vehicule.lire' },
      // Lot b5 : compléments de consultation.
      { route: 'intermediaires', libelle: 'Intermédiaires', droit: 'groupement.lire' },
      { route: 'repartitions', libelle: 'Répartitions', droit: 'groupement.lire' },
    ],
  },
  {
    id: 'journal',
    libelle: 'Journal',
    icone: 'history',
    pages: [{ route: 'audit', libelle: "Journal d'audit", droit: 'audit.lire' }],
  },
  /* Lot b5 : exports, comptes de l'institution, incidents */
  {
    id: 'administration',
    libelle: 'Administration',
    icone: 'settings',
    pages: [
      { route: 'exports', libelle: 'Exports par période', droit: 'export.donnees' },
      { route: 'utilisateurs', libelle: 'Utilisateurs DGTTC', droit: 'institution.utilisateurs' },
    ],
  },
];

/**
 * Espace minimal des rôles de niveau 3. Leur menu est **entièrement généré** :
 * sans droit métier, il ne reste que le tableau de bord explicite.
 * @type {Zone[]}
 */
const MINIMAL = [
  {
    id: 'pilotage',
    libelle: 'Accueil',
    icone: 'dashboard',
    pages: [
      { route: 'dashboard', libelle: 'Accueil' },
      { route: 'groupements', libelle: 'Groupements', droit: 'groupement.lire' },
      // Correctif anti-fraude n° 3, étendu par le lot b1 à toutes les entreprises
      // inscrites : ouverte aux deux agents d'activation par la matrice.
      { route: 'verifications', libelle: 'Vérification et activation', droit: 'inscription.activer' },
      { route: 'duts', libelle: 'Documents de transport', droit: 'dut.lire' },
      /* Lot b3 : contrôle sur route */
      { route: 'controle', libelle: 'Vérifier une attestation', droit: 'controle.verifier' },
      { route: 'controles', libelle: 'Mes contrôles', droit: 'controle.historique' },
      // Lot b4 : service contentieux et supervision comptable.
      { route: 'contentieux', libelle: 'Contentieux', droit: 'contentieux.lire' },
      { route: 'etats-financiers', libelle: 'États financiers', droit: 'rapport.financier' },
    ],
  },
];

/** @type {Record<string, Zone[]>} */
const PAR_ESPACE = {
  [ESPACE.AFFRETEUR]: AFFRETEUR,
  [ESPACE.TRANSPORTEUR]: TRANSPORTEUR,
  [ESPACE.CONCESSIONNAIRE]: CONCESSIONNAIRE,
  [ESPACE.DGTTC]: DGTTC,
  [ESPACE.MINIMAL]: MINIMAL,
  // Lot b2 : organisation interne
  [ESPACE.INTERMEDIAIRE]: INTERMEDIAIRE,
};

/**
 * Arborescence effective d'un utilisateur : zones et pages que **ses droits**
 * lui ouvrent. Une zone dont toutes les pages sont fermées disparaît.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Zone[]}
 */
export function arborescenceDe(ctx) {
  const espace = espaceDe(ctx.roleId);
  const zones = PAR_ESPACE[espace] ?? MINIMAL;

  return zones
    .filter((z) => !z.droitZone || decider(ctx, z.droitZone).autorise)
    .map((z) => ({
      ...z,
      pages: z.pages.filter((p) => !p.droit || decider(ctx, p.droit).autorise),
    }))
    .filter((z) => z.pages.length > 0);
}

/**
 * Espace de routage d'un rôle — le segment d'URL.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {string}
 */
export function segmentEspace(ctx) {
  return espaceDe(ctx.roleId);
}

/**
 * Page d'accueil d'un utilisateur : la première page ouverte de sa première zone.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {string} Route complète, `#/espace/page`.
 */
export function routeAccueil(ctx) {
  const zones = arborescenceDe(ctx);
  const page = zones[0]?.pages[0]?.route ?? 'dashboard';
  return `#/${segmentEspace(ctx)}/${page}`;
}

/** Route de lecture des DUT réellement ouverte par la matrice de ce rôle. */
export function routeDut(ctx, appariementId) {
  const page = arborescenceDe(ctx).flatMap(zone => zone.pages).find(page => page.droit === 'dut.lire');
  if (!page) return null;
  const selection = appariementId ? `?selection=${encodeURIComponent(appariementId)}` : '';
  return `#/${segmentEspace(ctx)}/${page.route}${selection}`;
}

/**
 * Retrouve la page correspondant à une route, et le droit qui l'ouvre.
 *
 * Rend `null` si la route n'existe pas **pour ce rôle** : le routeur produit
 * alors un refus explicite nommant le rôle et le droit manquant, jamais une
 * redirection silencieuse vers l'accueil — qui laisserait croire à un bug.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} route
 * @returns {{zone: Zone, page: Page}|null}
 */
export function localiser(ctx, route) {
  for (const zone of arborescenceDe(ctx)) {
    for (const page of zone.pages) {
      if (page.route === route) return { zone, page };
    }
  }
  // Lot b1 : pages personnelles, ouvertes à tout utilisateur connecté.
  const personnelle = PAGES_PERSONNELLES.find((p) => p.route === route);
  if (personnelle) return { zone: { id: 'moncompte', libelle: 'Mon compte', icone: 'user', pages: [...PAGES_PERSONNELLES] }, page: personnelle };
  return null;
}

/**
 * Lot b1 — pages personnelles : le profil et les messages de l'utilisateur
 * connecté. Elles ne relèvent d'aucun droit métier (chacun n'y lit que ses
 * propres données) et ne figurent donc pas dans le menu des rôles qui n'en ont
 * aucun : on les atteint depuis le bloc d'identité de la barre supérieure.
 * @type {ReadonlyArray<Page>}
 */
export const PAGES_PERSONNELLES = Object.freeze([
  { route: 'profil', libelle: 'Mon profil' },
  { route: 'messages', libelle: 'Mes messages' },
]);

/**
 * Droit attaché à une route, même si le rôle ne l'a pas — pour formuler le refus.
 * @param {string} espace
 * @param {string} route
 * @returns {string|null}
 */
export function droitDeRoute(espace, route) {
  for (const zone of PAR_ESPACE[espace] ?? []) {
    for (const page of zone.pages) {
      if (page.route === route) return page.droit ?? null;
    }
  }
  return null;
}
