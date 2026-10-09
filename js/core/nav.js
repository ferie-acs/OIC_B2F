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
    ],
  },
  {
    id: 'compte',
    libelle: 'Compte',
    icone: 'wallet',
    pages: [
      { route: 'compte', libelle: 'Solde et mouvements', droit: 'compte.lire' },
      { route: 'abonnement', libelle: 'Abonnement', droit: 'abonnement.lire' },
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
      { route: 'roles', libelle: 'Utilisateurs et rôles', droit: 'role.lire' },
    ],
  },
  {
    id: 'finances',
    libelle: 'Finances',
    icone: 'wallet',
    pages: [
      { route: 'comptes', libelle: 'Comptes et soldes', droit: 'compte.lire' },
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
    pages: [{ route: 'dashboard', libelle: 'Tableau de bord national', droit: 'dashboard.activite' }],
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
    ],
  },
  {
    id: 'journal',
    libelle: 'Journal',
    icone: 'history',
    pages: [{ route: 'audit', libelle: "Journal d'audit", droit: 'audit.lire' }],
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
      { route: 'duts', libelle: 'Documents de transport', droit: 'dut.lire' },
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
  return null;
}

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
