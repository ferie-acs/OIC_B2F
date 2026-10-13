/**
 * Lot b2 : organisation interne — zones et pages de navigation.
 *
 * Déclarées ici et rattachées par `nav.js` en fin de liste, pour que les lots
 * travaillant en parallèle ne se disputent pas les mêmes lignes. Comme partout,
 * chaque page porte le droit qui l'ouvre : sans ce droit, elle n'existe pas.
 *
 * @module core/nav-lot-b2
 */

/**
 * Pages ajoutées à la zone « Paramètres » des espaces Affréteur et Transporteur,
 * comme dans le système existant (vue/param/souscompte.php, vue/param/utilisateur.php).
 * Les auxiliaires et les contextes délégués n'en ont aucun droit : elles
 * disparaissent pour eux.
 */
export const PAGES_ORGANISATION = Object.freeze([
  { route: 'filiales', libelle: 'Filiales et entités', droit: 'filiale.lire' },
  { route: 'intermediaires', libelle: 'Intermédiaires de fret', droit: 'mandat.lire' },
]);

/** Icône de chaque page du lot, dans les menus et les titres. */
export const ICONES_PAGES_LOT_B2 = Object.freeze({
  filiales: 'network',
  intermediaires: 'briefcase',
  mandants: 'briefcase',
});

/** Zones de l'espace Intermédiaire, sur le modèle de l'espace Affréteur. */
export const INTERMEDIAIRE = Object.freeze([
  {
    id: 'pilotage',
    libelle: 'Pilotage',
    icone: 'pilotage',
    pages: [
      { route: 'dashboard', libelle: 'Tableau de bord', droit: 'dashboard.perimetre' },
      { route: 'notifications', libelle: 'Notifications', droit: 'notification.lire' },
      // Intégration : incident applicatif (lot b5), comme les autres espaces du marché.
      { route: 'incidents', libelle: 'Signaler un incident', droit: 'incident.declarer' },
    ],
  },
  {
    id: 'mandants',
    libelle: 'Mandants',
    icone: 'handshake',
    pages: [{ route: 'mandants', libelle: 'Mes mandants', droit: 'mandat.lire' }],
  },
  {
    id: 'compte',
    libelle: 'Compte',
    icone: 'wallet',
    pages: [{ route: 'abonnement', libelle: 'Abonnement', droit: 'abonnement.lire' }],
  },
  {
    id: 'parametres',
    libelle: 'Paramètres',
    icone: 'settings',
    pages: [
      { route: 'groupement', libelle: 'Fiche de l’entreprise', droit: 'groupement.lire' },
      { route: 'utilisateurs', libelle: 'Utilisateurs', droit: 'utilisateur.lire' },
      { route: 'filiales', libelle: 'Filiales et entités', droit: 'filiale.lire' },
    ],
  },
  /* --- Intégration b1 : dossier, profil et messages, comme les autres espaces --- */
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
]);
