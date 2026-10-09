/**
 * Matrice des droits — source unique et exclusive du contrôle d'accès.
 *
 * Le système existant disperse son contrôle d'accès dans le routage et dans les
 * vues, sans matrice centralisée (cadrage § 3.2). Centraliser est l'écart délibéré
 * n° 2 du POC, et la réponse directe à la recommandation « définir clairement les
 * rôles et droits d'accès ».
 *
 * ## Trois règles de lecture
 *
 * 1. **Refus par défaut.** Un droit absent de la table d'un rôle vaut `AUCUNE`.
 *    Il n'existe aucune notion de rôle « administrateur » qui contournerait la
 *    matrice : un rôle qui peut tout est précisément ce qu'une matrice sert à
 *    éviter.
 * 2. **Un droit n'est pas un booléen, c'est une portée.** `appariement.lire` avec
 *    la portée `GROUPEMENT` et le même droit avec la portée `TOUT` n'ont rien de
 *    commun. Réduire l'autorisation à « oui / non » en laissant chaque écran
 *    filtrer est la façon habituelle de fabriquer une fuite.
 * 3. **La matrice dit ce qui est permis en principe, jamais ce qui l'est
 *    maintenant.** Les règles dépendant de l'état — les coordonnées avant
 *    `valider`, l'abonnement expiré, le solde insuffisant — sont appliquées par
 *    `js/domain/access.js`, qui combine la matrice et le contexte.
 *
 * @module domain/permissions
 */

import { CLASSIFICATION } from './schema.js';
import { ROLES } from './roles.js';

/* ================================================================== *
 * 1. Portées
 * ================================================================== */

/**
 * Étendue d'un droit. C'est ce qui fait le cloisonnement réel.
 * @readonly
 * @enum {string}
 */
export const PORTEE = Object.freeze({
  /** Droit refusé. Valeur par défaut de tout droit non déclaré. */
  AUCUNE: 'aucune',
  /**
   * Les objets dont l'utilisateur est **personnellement** le destinataire ou
   * l'auteur — ses notifications, et rien d'autre. Distincte de `GROUPEMENT` :
   * un collègue du même groupement ne lit pas les notifications d'un autre, et
   * un rôle institutionnel sans groupement lit tout de même les siennes.
   */
  PROPRE: 'propre',
  /** Les objets du groupement de l'utilisateur, et eux seuls. */
  GROUPEMENT: 'groupement',
  /**
   * Les objets que d'autres groupements ont **délibérément publiés** sur le
   * marché, dans leur projection publique. Ce n'est pas une lecture générale des
   * données d'autrui : c'est la vitrine, et rien au-delà.
   */
  MARCHE: 'marche',
  /** Toute la plateforme. Réservé aux rôles institutionnels. */
  TOUT: 'tout',
});

/* ================================================================== *
 * 2. Catalogue des droits
 * ================================================================== */

/**
 * @typedef {object} Droit
 * @property {string} categorie   Regroupement d'affichage.
 * @property {string} libelle     Formulation destinée à l'écran « Utilisateurs et rôles ».
 * @property {boolean} [teste]    Le droit fait l'objet d'un test automatisé dédié.
 * @property {boolean} [mutation] Le droit modifie des données : sa cible est obligatoire.
 * @property {string} [refus]
 *   **Raison métier** opposée à qui ne détient pas ce droit. Correctif QA-05 :
 *   le refus servait le nom du droit manquant — « ne dispose pas du droit
 *   Valider » — là où la conception UX exige d'expliquer *pourquoi*
 *   (`01-parcours-et-navigation.md` § 2.2). Nommer la règle n'est pas
 *   l'enseigner, et le POC prétend précisément enseigner son cloisonnement.
 * @property {string} [note]
 */

/**
 * Tous les droits du POC. Un droit utilisé ailleurs sans figurer ici est une
 * erreur de programmation : `access.js` lève plutôt que de refuser silencieusement.
 * @type {Readonly<Record<string, Readonly<Droit>>>}
 */
export const DROITS = Object.freeze({
  /* --- Le fret ------------------------------------------------- */
  'declaration.lire': { categorie: 'Fret', libelle: 'Consulter les déclarations de fret' },
  'declaration.creer': { categorie: 'Fret', libelle: 'Déclarer un fret' , mutation: true },
  'declaration.modifier': { categorie: 'Fret', libelle: 'Modifier une déclaration' , mutation: true },
  'declaration.supprimer': { categorie: 'Fret', libelle: 'Supprimer une déclaration' , mutation: true },
  'demande.lire': { categorie: 'Fret', libelle: 'Consulter les demandes de transport' },
  'demande.creer': { categorie: 'Fret', libelle: 'Créer une demande de transport' , mutation: true },
  'demande.publier': { categorie: 'Fret', libelle: 'Publier une demande sur le marché' , mutation: true },
  'demande.annuler': { categorie: 'Fret', libelle: 'Annuler une demande' , mutation: true },

  /* --- La flotte ----------------------------------------------- */
  'vehicule.lire': { categorie: 'Flotte', libelle: 'Consulter le parc de véhicules' },
  'vehicule.gerer': { categorie: 'Flotte', libelle: 'Ajouter ou modifier un véhicule' , mutation: true },
  'chauffeur.lire': { categorie: 'Flotte', libelle: 'Consulter les chauffeurs' },
  'chauffeur.gerer': { categorie: 'Flotte', libelle: 'Ajouter ou modifier un chauffeur' , mutation: true },
  'offre.lire': { categorie: 'Flotte', libelle: 'Consulter les offres de véhicule' },
  'offre.publier': { categorie: 'Flotte', libelle: 'Publier une offre de véhicule' , mutation: true },
  'offre.retirer': { categorie: 'Flotte', libelle: 'Retirer une offre publiée' , mutation: true },

  /* --- Le marché ----------------------------------------------- */
  'marche.offres': { categorie: 'Marché', libelle: 'Rechercher des véhicules disponibles' },
  'marche.demandes': { categorie: 'Marché', libelle: 'Consulter les demandes publiées' },

  /* --- L'appariement ------------------------------------------- */
  'appariement.lire': { categorie: 'Mise en relation', libelle: 'Consulter les mises en relation' },
  'appariement.reserver': {
    mutation: true,
    categorie: 'Mise en relation',
    libelle: 'Réserver un véhicule',
    note: "Sens A : l'affréteur réserve une offre publiée.",
  },
  'appariement.proposer': {
    mutation: true,
    categorie: 'Mise en relation',
    libelle: 'Proposer un véhicule sur une demande',
    note: 'Sens B : le transporteur répond à une demande publiée.',
  },
  'appariement.repondre': {
    mutation: true,
    categorie: 'Mise en relation',
    libelle: 'Accepter ou rejeter une réservation',
    teste: true,
    refus:
      'Accepter une réservation engage votre groupement sur un débit à venir : ' +
      'les frais seront prélevés dès que l’affréteur validera. Un sous-compte ' +
      'prépare et publie, il n’engage pas la trésorerie de son parent.',
    note:
      "Accepter n'entraîne aucun débit immédiat, mais engage le transporteur sur " +
      'un débit à venir. Retiré aux auxiliaires pour ce motif.',
  },
  'appariement.annuler': {
    mutation: true,
    categorie: 'Mise en relation',
    libelle: 'Annuler avant validation',
    teste: true,
    note:
      "Ouvert aux auxiliaires (question U3, décision D37) : l'annulation " +
      "n'engage aucune dépense. Impossible après validation, pour tout le monde.",
  },
  'appariement.valider': {
    mutation: true,
    categorie: 'Mise en relation',
    libelle: 'Valider — déclenche le double débit',
    teste: true,
    refus:
      'La validation engage les finances de votre groupement : elle débite ses ' +
      'frais de mise en relation, et ceux du transporteur. Un sous-compte prépare ' +
      'les dossiers, il n’engage pas la trésorerie de son parent. Le dossier est ' +
      'prêt — prévenez votre responsable, il n’aura qu’à valider.',
    note:
      '**Le droit le plus sensible du POC.** Il déclenche deux écritures ' +
      'financières et la transmission des coordonnées. Refusé aux auxiliaires, ' +
      'aux rôles institutionnels et à tout rôle de niveau 3.',
  },
  'coordonnees.lire': {
    categorie: 'Mise en relation',
    libelle: 'Accéder aux coordonnées de la contrepartie',
    teste: true,
    refus:
      'La transmission des coordonnées est ce que la plateforme vend : elle ' +
      'n’intervient qu’entre les deux parties d’une mise en relation validée.',
    note:
      "**Ce droit ne suffit jamais à lui seul.** `access.js` exige en plus que " +
      "l'appariement liant les deux parties soit à l'état `valider`. La " +
      'transmission des coordonnées EST la mise en relation : c\'est ce que la ' +
      "plateforme vend.\n\n" +
      "**Articulation avec `chauffeur.lire` — règle explicite, à auditer.** Les " +
      'deux droits ne recouvrent pas la même chose et ne doivent pas être ' +
      "confondus : `chauffeur.lire` ouvre l'écran « Chauffeurs », c'est-à-dire la " +
      'consultation de SON propre parc ; `coordonnees.lire` ouvre la fiche de mise ' +
      "en relation, qui affiche le chauffeur de LA CONTREPARTIE. C'est pourquoi " +
      "l'affréteur n'a pas `chauffeur.lire` et voit pourtant le chauffeur après " +
      'validation. La lecture est alors servie par le service de mise en relation, ' +
      'qui exige ce droit-ci et l\'état `valider`, puis laisse `projeter()` ' +
      'découvrir les champs. Le droit contrôle l\'écran, la projection contrôle ' +
      'les champs.',
  },

  'coordonnees.exception': {
    categorie: 'Mise en relation',
    mutation: true,
    libelle: 'Accès exceptionnel aux coordonnées (bris de glace)',
    teste: true,
    note:
      "**Déclaré, accordé à personne.** Recommandation de l'audit de sécurité " +
      '(§ 6.1). Le contentieux est hors périmètre du POC, mais l\'OIC posera la ' +
      "question au premier litige — et la réponse « on ajoutera le droit » " +
      'produirait un concessionnaire omniscient en permanence. Le modéliser ' +
      "maintenant montre que la place du bris de glace est prévue sans être " +
      'ouverte. Son ouverture éventuelle exigera un motif saisi et une écriture ' +
      "au journal d'audit : ce n'est pas un droit qu'on coche.",
  },

  /* --- Le transport -------------------------------------------- */
  'transport.lire': { categorie: 'Transport', libelle: 'Suivre les transports' },
  'transport.avancer': { categorie: 'Transport', libelle: 'Faire avancer une étape' , mutation: true },
  'transport.cloturer': {
    mutation: true,
    categorie: 'Transport',
    libelle: 'Clôturer après livraison',
    note: "Appartient à l'affréteur. Impossible avant l'étape « livré ».",
  },
  'transport.incident': { categorie: 'Transport', libelle: 'Signaler un incident' , mutation: true },

  /* --- L'argent ------------------------------------------------ */
  'compte.lire': {
    categorie: 'Compte',
    libelle: 'Consulter le solde et les mouvements',
    teste: true,
    note: 'Refusé à la DGTTC : un contrôleur ne voit pas les comptes de ce qu\'il contrôle.',
  },
  'compte.crediter': {
    mutation: true,
    categorie: 'Compte',
    libelle: 'Créditer manuellement un compte',
    teste: true,
    note: "Réservé au concessionnaire. Remplace l'intégration de paiement (arbitrage N2).",
  },
  'tarif.lire': { categorie: 'Compte', libelle: 'Consulter le catalogue de tarifs' },
  'tarif.modifier': { categorie: 'Compte', libelle: 'Modifier le catalogue de tarifs' , mutation: true },
  'abonnement.lire': { categorie: 'Compte', libelle: "Consulter l'abonnement" },
  'abonnement.prolonger': { categorie: 'Compte', libelle: 'Prolonger un abonnement' , mutation: true },

  /* --- Les acteurs --------------------------------------------- */
  'groupement.lire': { categorie: 'Acteurs', libelle: 'Consulter les groupements' },
  'groupement.gerer': { categorie: 'Acteurs', libelle: 'Modifier la fiche du groupement' , mutation: true },
  'utilisateur.lire': { categorie: 'Acteurs', libelle: 'Consulter les utilisateurs' },
  'utilisateur.gerer': { categorie: 'Acteurs', libelle: 'Créer ou modifier un utilisateur' , mutation: true },
  'role.lire': { categorie: 'Acteurs', libelle: 'Consulter la matrice des rôles' },

  /* --- Supervision --------------------------------------------- */
  'dashboard.perimetre': { categorie: 'Pilotage', libelle: 'Tableau de bord de son périmètre' },
  'dashboard.activite': {
    categorie: 'Pilotage',
    libelle: "Tableau de bord d'activité de la plateforme",
  },
  'controle.etats': { categorie: 'Pilotage', libelle: 'Consulter les états de contrôle' },
  'audit.lire': { categorie: 'Pilotage', libelle: "Consulter le journal d'audit" },

  /* --- Annexes ------------------------------------------------- */
  'dut.lire': { categorie: 'DUT', libelle: 'Consulter les DUT générés' },
  'dut.generer': { categorie: 'DUT', libelle: 'Générer un DUT' , mutation: true },
  'notification.lire': { categorie: 'Annexes', libelle: 'Consulter ses notifications' },
});

/* ================================================================== *
 * 3. Gabarits — pour que la matrice reste lisible
 * ================================================================== */

const { AUCUNE, PROPRE, GROUPEMENT, MARCHE, TOUT } = PORTEE;

/** Socle commun à tout rôle du marché : voir son propre périmètre. */
const SOCLE_MARCHE = Object.freeze({
  'dashboard.perimetre': GROUPEMENT,
  'notification.lire': PROPRE,
  'compte.lire': GROUPEMENT,
  'tarif.lire': TOUT,
  'abonnement.lire': GROUPEMENT,
  'groupement.lire': GROUPEMENT,
});

/** Droits de l'affréteur de plein exercice. */
const AFFRETEUR = Object.freeze({
  ...SOCLE_MARCHE,
  'declaration.lire': GROUPEMENT,
  'declaration.creer': GROUPEMENT,
  'declaration.modifier': GROUPEMENT,
  'declaration.supprimer': GROUPEMENT,
  'demande.lire': GROUPEMENT,
  'demande.creer': GROUPEMENT,
  'demande.publier': GROUPEMENT,
  'demande.annuler': GROUPEMENT,
  'marche.offres': MARCHE,
  'appariement.lire': GROUPEMENT,
  'appariement.reserver': GROUPEMENT,
  // Sens B : l'affréteur publie sa demande, le transporteur propose un véhicule,
  // et c'est alors l'affréteur qui accepte ou rejette. Le droit couvre donc les
  // deux parties ; c'est `partieHabilitee()`, croisée par `deciderSurAppariement()`,
  // qui tranche selon le sens du flux. Sans cette ligne, le sens B — pourtant
  // réellement implémenté dans le système existant — était impraticable.
  'appariement.repondre': GROUPEMENT,
  'appariement.annuler': GROUPEMENT,
  'appariement.valider': GROUPEMENT,
  'coordonnees.lire': GROUPEMENT,
  'transport.lire': GROUPEMENT,
  'transport.cloturer': GROUPEMENT,
  'dut.lire': GROUPEMENT,
  'groupement.gerer': GROUPEMENT,
  'utilisateur.lire': GROUPEMENT,
  'utilisateur.gerer': GROUPEMENT,
});

/** Droits du transporteur de plein exercice. */
const TRANSPORTEUR = Object.freeze({
  ...SOCLE_MARCHE,
  'vehicule.lire': GROUPEMENT,
  'vehicule.gerer': GROUPEMENT,
  'chauffeur.lire': GROUPEMENT,
  'chauffeur.gerer': GROUPEMENT,
  'offre.lire': GROUPEMENT,
  'offre.publier': GROUPEMENT,
  'offre.retirer': GROUPEMENT,
  'marche.demandes': MARCHE,
  'appariement.lire': GROUPEMENT,
  'appariement.proposer': GROUPEMENT,
  'appariement.repondre': GROUPEMENT,
  'appariement.annuler': GROUPEMENT,
  'coordonnees.lire': GROUPEMENT,
  'transport.lire': GROUPEMENT,
  'transport.avancer': GROUPEMENT,
  'transport.incident': GROUPEMENT,
  'dut.lire': GROUPEMENT,
  'dut.generer': GROUPEMENT,
  'groupement.gerer': GROUPEMENT,
  'utilisateur.lire': GROUPEMENT,
  'utilisateur.gerer': GROUPEMENT,
});

/**
 * Retire des droits d'un gabarit. Rend explicite ce qu'un rôle **perd** par
 * rapport à son modèle — c'est plus lisible et plus auditable qu'une table
 * recopiée à la main, où un oubli passe inaperçu.
 * @param {Record<string, string>} base
 * @param {string[]} retires
 * @returns {Readonly<Record<string, string>>}
 */
function sans(base, retires) {
  const copie = { ...base };
  for (const d of retires) delete copie[d];
  return Object.freeze(copie);
}

/* ================================================================== *
 * 4. La matrice
 * ================================================================== */

/**
 * Droits accordés à chaque rôle. Tout droit absent vaut `PORTEE.AUCUNE`.
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
export const MATRICE = Object.freeze({
  /* ---- Niveau 1 — démontrés ---------------------------------- */

  affreteur: AFFRETEUR,
  transporteur: TRANSPORTEUR,

  /**
   * L'auxiliaire d'affréteur perd la validation — l'acte qui engage les finances
   * de son parent — et la gestion des utilisateurs. Il conserve l'annulation
   * (décision D37) et la clôture, qui ne coûtent rien.
   */
  auxiliaire_affreteur: sans(AFFRETEUR, [
    'appariement.valider',
    // Symétrique du retrait consenti à l'auxiliaire de transporteur : accepter
    // une proposition engage le parent sur un débit à venir.
    'appariement.repondre',
    'utilisateur.lire',
    'utilisateur.gerer',
    'groupement.gerer',
    'declaration.supprimer',
  ]),

  /**
   * L'auxiliaire de transporteur perd la réponse aux réservations : accepter
   * engage le parent sur un débit à venir. Il prépare et publie, il n'engage pas.
   */
  auxiliaire_transporteur: sans(TRANSPORTEUR, [
    'appariement.repondre',
    'utilisateur.lire',
    'utilisateur.gerer',
    'groupement.gerer',
  ]),

  /**
   * **L'exploitant.** Supervise et crédite ; ne transige jamais à la place d'un
   * acteur du marché. Aucun droit de publication, de réservation ni de validation.
   *
   * `coordonnees.lire` lui est **refusé** : exploiter la plateforme ne demande pas
   * de lire les coordonnées privées des transporteurs. Moindre privilège. Le
   * contentieux, qui serait le seul motif plausible, est hors périmètre.
   */
  concessionnaire: Object.freeze({
    'declaration.lire': TOUT,
    'demande.lire': TOUT,
    'vehicule.lire': TOUT,
    'offre.lire': TOUT,
    'appariement.lire': TOUT,
    'transport.lire': TOUT,
    'compte.lire': TOUT,
    'compte.crediter': TOUT,
    'tarif.lire': TOUT,
    'tarif.modifier': TOUT,
    'abonnement.lire': TOUT,
    'abonnement.prolonger': TOUT,
    'groupement.lire': TOUT,
    'groupement.gerer': TOUT,
    'utilisateur.lire': TOUT,
    'utilisateur.gerer': TOUT,
    'role.lire': TOUT,
    'dashboard.activite': TOUT,
    'audit.lire': TOUT,
    'dut.lire': TOUT,
    'notification.lire': PROPRE,
  }),

  /**
   * **Le contrôleur.** Consultation seule, et **aucune donnée financière** — ni
   * solde, ni montant, ni écriture, au niveau des données et pas seulement de
   * l'affichage (voir `CLASSIFICATIONS_LISIBLES`). Aucun droit d'action, aucun
   * accès aux coordonnées privées. C'est l'arbitrage N3 rendu exécutable.
   */
  dgttc: Object.freeze({
    'declaration.lire': TOUT,
    'demande.lire': TOUT,
    'vehicule.lire': TOUT,
    'offre.lire': TOUT,
    'appariement.lire': TOUT,
    'transport.lire': TOUT,
    'groupement.lire': TOUT,
    'controle.etats': TOUT,
    'dashboard.activite': TOUT,
    'audit.lire': TOUT,
    'notification.lire': PROPRE,
  }),

  /* ---- Niveau 2 — déclinés de l'espace Transporteur ----------- */

  /** Transporte pour compte propre : ne publie pas sur le marché public. */
  transporteur_prive: sans(TRANSPORTEUR, ['offre.publier']),

  /** Identique au transporteur ; la variation porte sur les champs, pas les droits. */
  transporteur_etranger: TRANSPORTEUR,

  /**
   * Lecture de la flotte et des mises en relation, plus la génération de DUT.
   * **Aucun accès au marché** : ne cherche pas, ne publie pas, ne réserve pas.
   */
  partenaire: Object.freeze({
    'dashboard.perimetre': GROUPEMENT,
    'notification.lire': PROPRE,
    'groupement.lire': GROUPEMENT,
    // Finding S12 : le rôle est `soumisAbonnement`, et sans ces deux droits un
    // abonnement expiré l'enfermait — plus rien d'accessible, pas même l'écran
    // permettant de comprendre pourquoi et de renouveler. Une impasse.
    'abonnement.lire': GROUPEMENT,
    'compte.lire': GROUPEMENT,
    'vehicule.lire': GROUPEMENT,
    'chauffeur.lire': GROUPEMENT,
    'offre.lire': GROUPEMENT,
    'appariement.lire': GROUPEMENT,
    'transport.lire': GROUPEMENT,
    'coordonnees.lire': GROUPEMENT,
    'dut.lire': GROUPEMENT,
    'dut.generer': GROUPEMENT,
  }),

  /* ---- Niveau 3 — modélisés ----------------------------------- *
   *
   * Tables volontairement pauvres. Caisse, contentieux et comptabilité sont hors
   * périmètre (`plan-suivi.md` § 1.3) : ces rôles existent, sont administrables,
   * et leur menu se génère depuis ces lignes. Un rôle sans droit métier ouvre un
   * espace minimal disant explicitement pourquoi — c'est voulu, et c'est à
   * énoncer en démonstration plutôt qu'à masquer.
   * ------------------------------------------------------------- */

  /**
   * **Aucun droit métier, délibérément.** Un compte qui peut tout est exactement
   * ce qu'une matrice de droits sert à empêcher. Ses écrans d'administration
   * technique sont hors périmètre du POC ; lui accorder ici des droits « en
   * attendant » créerait le compte fourre-tout que le POC entend proscrire.
   */
  super_admin: Object.freeze({}),

  admin_compta: Object.freeze({}),
  admin_superviseur_centre_tech: Object.freeze({}),
  agent_caisse: Object.freeze({}),
  superviseur_comptabilite: Object.freeze({}),
  superviseur_cpte: Object.freeze({}),
  contentieux_paie: Object.freeze({}),

  /** Seul profil de niveau 3 à recevoir un droit métier : la lecture des DUT. */
  dut_transport: Object.freeze({ 'dut.lire': TOUT }),

  activation_inscription: Object.freeze({ 'groupement.lire': TOUT }),
  activation_inscription_affreteur: Object.freeze({ 'groupement.lire': TOUT }),
});

/* ================================================================== *
 * 5. Classifications lisibles par rôle
 * ================================================================== */

const { PUBLIC, IDENTITE, CONTACT, FINANCIER } = CLASSIFICATION;

/** Ce que voit un acteur du marché sur son propre périmètre. */
const LECTURE_MARCHE = Object.freeze([PUBLIC, IDENTITE, CONTACT, FINANCIER]);

/**
 * Classifications de données qu'un rôle peut recevoir, **quelle que soit la
 * portée de ses droits**. Second verrou, indépendant de la matrice : même avec
 * `appariement.lire` en portée `TOUT`, la DGTTC ne reçoit aucun montant.
 *
 * `CLASSIFICATION.SYSTEME` ne figure dans aucune liste, et ne doit jamais y
 * figurer : empreintes et sels ne sont projetés vers personne.
 *
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const CLASSIFICATIONS_LISIBLES = Object.freeze({
  affreteur: LECTURE_MARCHE,
  transporteur: LECTURE_MARCHE,
  auxiliaire_affreteur: LECTURE_MARCHE,
  auxiliaire_transporteur: LECTURE_MARCHE,
  transporteur_prive: LECTURE_MARCHE,
  transporteur_etranger: LECTURE_MARCHE,
  partenaire: LECTURE_MARCHE,

  /** L'exploitant voit les montants, pas les coordonnées privées. */
  concessionnaire: Object.freeze([PUBLIC, IDENTITE, FINANCIER]),

  /**
   * **Le contrôleur ne voit ni les montants ni les coordonnées.** C'est la règle
   * structurante de l'arbitrage N3, exprimée au niveau des données. Une colonne
   * « solde » dans l'espace DGTTC ne serait pas un défaut d'affichage : ce serait
   * la preuve que ce verrou a été contourné.
   */
  dgttc: Object.freeze([PUBLIC, IDENTITE]),

  super_admin: Object.freeze([PUBLIC]),
  admin_compta: Object.freeze([PUBLIC]),
  admin_superviseur_centre_tech: Object.freeze([PUBLIC]),
  agent_caisse: Object.freeze([PUBLIC]),
  superviseur_comptabilite: Object.freeze([PUBLIC]),
  superviseur_cpte: Object.freeze([PUBLIC]),
  contentieux_paie: Object.freeze([PUBLIC]),
  dut_transport: Object.freeze([PUBLIC, IDENTITE]),
  activation_inscription: Object.freeze([PUBLIC, IDENTITE]),
  activation_inscription_affreteur: Object.freeze([PUBLIC, IDENTITE]),
});

/* ================================================================== *
 * 6. Contraintes de saisie propres à un rôle
 * ================================================================== */

/**
 * Champs rendus obligatoires par le rôle de l'utilisateur, au-delà de ce que le
 * schéma exige. Permet de traiter les rôles de niveau 2 par déclaration plutôt
 * que par du code d'écran (`01-parcours-et-navigation.md` § 3.2).
 *
 * @type {Readonly<Record<string, Readonly<Record<string, string[]>>>>}
 */
export const CHAMPS_REQUIS_PAR_ROLE = Object.freeze({
  transporteur_etranger: Object.freeze({
    vehicule: ['paysImmatriculation'],
  }),
});

/**
 * Champs qu'un rôle rend obligatoires sur une entité, au-delà du schéma.
 *
 * Finding S14 : la table existait mais **n'était lue nulle part**. La seule
 * variation du transporteur étranger — décision § 6.4, jugée juste par l'audit —
 * était donc inerte. Une décision dont l'implémentation est vide n'est pas une
 * décision. Ce point d'entrée est consommé par le valideur des dépôts (J2).
 *
 * @param {string} roleId
 * @param {string} nomEntite
 * @returns {ReadonlyArray<string>}
 */
export function champsRequisPour(roleId, nomEntite) {
  if (!ROLES[roleId]) {
    throw new Error(`Rôle inconnu : « ${roleId} ». Voir js/domain/roles.js.`);
  }
  return CHAMPS_REQUIS_PAR_ROLE[roleId]?.[nomEntite] ?? [];
}

/**
 * Liste les champs manquants qu'impose le rôle de l'auteur de l'écriture.
 *
 * @param {string} roleId
 * @param {string} nomEntite
 * @param {Record<string, unknown>} objet
 * @returns {string[]} Vide si l'objet est conforme.
 */
export function champsManquantsPourRole(roleId, nomEntite, objet) {
  return champsRequisPour(roleId, nomEntite).filter(
    (c) => objet[c] == null || objet[c] === '',
  );
}

/* ================================================================== *
 * 7. Lecture de la matrice
 * ================================================================== */

/**
 * Portée accordée à un rôle pour un droit. Refus par défaut.
 *
 * @param {string} roleId
 * @param {string} droit
 * @returns {string} Une valeur de {@link PORTEE}.
 * @throws {Error} Si le rôle ou le droit n'est pas déclaré. Un droit mal
 *   orthographié doit échouer bruyamment : refusé silencieusement, il ferait
 *   croire à un cloisonnement qui n'existe pas.
 */
export function porteeDe(roleId, droit) {
  if (!ROLES[roleId]) {
    throw new Error(`Rôle inconnu : « ${roleId} ». Voir js/domain/roles.js.`);
  }
  if (!DROITS[droit]) {
    throw new Error(`Droit inconnu : « ${droit} ». Voir le catalogue DROITS.`);
  }
  return MATRICE[roleId]?.[droit] ?? PORTEE.AUCUNE;
}

/**
 * Indique si un rôle peut recevoir des données d'une classification donnée.
 * @param {string} roleId
 * @param {string} classification
 * @returns {boolean}
 */
export function peutLireClassification(roleId, classification) {
  // La classification système se referme avant toute consultation de table :
  // aucune erreur future dans CLASSIFICATIONS_LISIBLES ne peut l'ouvrir.
  if (classification === CLASSIFICATION.SYSTEME) return false;
  // Finding S10 : un rôle inconnu rendait `[PUBLIC]` au lieu de lever, si bien
  // qu'une projection avec un `roleId` falsifié servait les champs publics
  // plutôt que d'échouer. Fail-closed, mais silencieux — contraire au principe
  // P6, et contraire à ce qui rend sûre la posture « ne rien inventer » sur N8.
  if (!ROLES[roleId]) {
    throw new Error(`Rôle inconnu : « ${roleId} ». Voir js/domain/roles.js.`);
  }
  return (CLASSIFICATIONS_LISIBLES[roleId] ?? [CLASSIFICATION.PUBLIC]).includes(classification);
}

/**
 * Droits effectivement accordés à un rôle, groupés par catégorie.
 * Sert à générer le menu des rôles de niveau 3 et l'écran « Utilisateurs et rôles ».
 *
 * @param {string} roleId
 * @returns {Record<string, Array<{droit: string, portee: string, libelle: string}>>}
 */
export function droitsDuRole(roleId) {
  // Finding S10 : rendait `{}` sur un rôle inconnu — un menu vide se confond
  // avec celui d'un rôle de niveau 3 légitime, et l'anomalie passait inaperçue.
  if (!ROLES[roleId]) {
    throw new Error(`Rôle inconnu : « ${roleId} ». Voir js/domain/roles.js.`);
  }
  const table = MATRICE[roleId] ?? {};
  /** @type {Record<string, Array<object>>} */
  const parCategorie = {};
  for (const [droit, portee] of Object.entries(table)) {
    if (portee === PORTEE.AUCUNE) continue;
    const { categorie, libelle } = DROITS[droit];
    (parCategorie[categorie] ??= []).push({ droit, portee, libelle });
  }
  return parCategorie;
}

/**
 * Droits appelant un test de permission dédié (`plan-suivi.md` § 3.5).
 * @returns {string[]}
 */
export function droitsSensibles() {
  return Object.keys(DROITS).filter((d) => DROITS[d].teste === true);
}
