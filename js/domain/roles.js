/**
 * Les rôles du POC B2F — déclaration unique et exhaustive.
 *
 * Arbitrage N4 : **tous les rôles identifiés dans le système existant figurent au
 * POC**, aucun n'est écarté. Leur traitement se répartit sur trois niveaux
 * (`plan-suivi.md` § 1.4) : démontrés, déclinés, modélisés.
 *
 * ## Chaque rôle est attesté par une preuve
 *
 * Le champ `preuve` cite l'élément du système analysé qui établit l'existence du
 * rôle. Aucun rôle n'est inventé, aucun n'est déduit. Un rôle sans preuve n'entre
 * pas dans cette liste : le code analysé fait foi (décision D18).
 *
 * ## Écart avec le décompte du cadrage — à trancher
 *
 * Le cadrage annonce « 8 macro-rôles + ~14 profils = 22 ». L'inventaire des menus de rôle
 * en établit **19**, pas 22. L'écart s'explique :
 *
 * - Le dossier contient 8 menus supplémentaires en `*_non_actif` et
 *   `*_reabonnement` (chargeur, transporteur, auxiliaire ×2). Ce sont des **états
 *   d'abonnement**, pas des rôles : le même utilisateur bascule de l'un à l'autre
 *   selon que son groupement est à jour. Les compter comme des rôles serait une
 *   erreur de modélisation — ils sont traités ici par `ETAT_ABONNEMENT`.
 * - L'auxiliaire, unique dans le système existant (`id_user_grp = 3` + champ
 *   `typeauxiliaire`), est **dédoublé** ici en auxiliaire d'affréteur et
 *   auxiliaire de transporteur. Motif : leurs droits diffèrent réellement, et le
 *   principe de la matrice est qu'aucun droit n'existe hors d'elle. Un rôle unique
 *   dont les droits se calculeraient d'après le parent réintroduirait la dispersion
 *   que le POC corrige.
 * - La table `profil` du système existant porte des `id_profil` allant au moins
 *   jusqu'à 13, mais **ses libellés ne figurent pas dans le dump** : ils vivent en
 *   base de production. Si l'OIC fournit un extrait de cette table, chaque profil
 *   manquant s'ajoute par une entrée déclarative ici et une colonne dans la
 *   matrice — le mécanisme est dimensionné pour, rien n'est à réécrire.
 *
 * @module domain/roles
 */

/**
 * Niveau de traitement d'un rôle dans le POC.
 * @readonly
 * @enum {string}
 */
export const NIVEAU = Object.freeze({
  /** Espace propre, écrans métier, parcours de démonstration, tests dédiés. */
  DEMONTRE: 1,
  /** Réutilise l'espace d'un autre rôle, avec des variations déclaratives. */
  DECLINE: 2,
  /** Déclaré, administrable, menu généré. Aucun écran métier dédié. */
  MODELISE: 3,
});

/**
 * Espace applicatif — le jeu d'écrans servi au rôle.
 * Plusieurs rôles peuvent partager un espace : c'est le principe du niveau 2.
 * @readonly
 * @enum {string}
 */
export const ESPACE = Object.freeze({
  AFFRETEUR: 'affreteur',
  TRANSPORTEUR: 'transporteur',
  CONCESSIONNAIRE: 'concessionnaire',
  DGTTC: 'dgttc',
  /** Espace minimal : tableau de bord explicite + pages ouvertes par la matrice. */
  MINIMAL: 'minimal',
});

/**
 * @typedef {object} Role
 * @property {string} id          Code stable, utilisé partout (stockage compris).
 * @property {string} libelle     Nom affiché.
 * @property {number} niveau      Voir {@link NIVEAU}.
 * @property {string} espace      Voir {@link ESPACE}.
 * @property {number|null} legacyGroupe   `Groupe.id_user_grp` du système existant.
 * @property {boolean} institutionnel     Le rôle n'est rattaché à aucune entreprise du marché.
 * @property {boolean} soumisAbonnement   L'accès est bloqué si l'abonnement du groupement a expiré.
 * @property {string} preuve      Fichier du système existant attestant le rôle.
 * @property {string} description
 */

/**
 * Les rôles déclarés. **Seule source de vérité.** Toute addition passe ici.
 * @type {Readonly<Record<string, Readonly<Role>>>}
 */
export const ROLES = Object.freeze({
  /* ================================================================ *
   * Niveau 1 — démontrés (6)
   * ================================================================ */

  affreteur: Object.freeze({
    id: 'affreteur',
    libelle: 'Affréteur',
    niveau: NIVEAU.DEMONTRE,
    espace: ESPACE.AFFRETEUR,
    legacyGroupe: 1,
    institutionnel: false,
    soumisAbonnement: true,
    preuve: 'aiguillage de connexion (id_user_grp = 1 → affreteur/)',
    description:
      "Celui qui a du fret à faire transporter. Le « chargeur » des rapports " +
      "d'entretien, nommé « affréteur » dans le code. Déclare, publie, réserve, " +
      'et **valide** — la validation étant le seul acte qui engage ses finances.',
  }),

  transporteur: Object.freeze({
    id: 'transporteur',
    libelle: 'Transporteur',
    niveau: NIVEAU.DEMONTRE,
    espace: ESPACE.TRANSPORTEUR,
    legacyGroupe: 2,
    institutionnel: false,
    soumisAbonnement: true,
    preuve: 'aiguillage de connexion (id_user_grp = 2 → transporteur/)',
    description:
      'Celui qui dispose de véhicules. Publie ses disponibilités, répond aux ' +
      'réservations, fait avancer le transport.',
  }),

  auxiliaire_affreteur: Object.freeze({
    id: 'auxiliaire_affreteur',
    libelle: "Auxiliaire d'affréteur",
    niveau: NIVEAU.DEMONTRE,
    espace: ESPACE.AFFRETEUR,
    legacyGroupe: 3,
    institutionnel: false,
    soumisAbonnement: true,
    preuve:
      "aiguillage de connexion (id_user_grp = 3, typeauxiliaire = 'affreteur' → auxilaffret/), " +
      'menu de rôle inventorié au cadrage',
    description:
      "Sous-compte agissant pour le compte d'un affréteur. Prépare les dossiers, " +
      "**ne valide pas** : il agit pour un tiers sans engager les finances de ce " +
      'tiers. Cette limite est une proposition du POC — le système existant ne la ' +
      'pose pas (arbitrage N5, cible améliorée).',
  }),

  auxiliaire_transporteur: Object.freeze({
    id: 'auxiliaire_transporteur',
    libelle: 'Auxiliaire de transporteur',
    niveau: NIVEAU.DEMONTRE,
    espace: ESPACE.TRANSPORTEUR,
    legacyGroupe: 3,
    institutionnel: false,
    soumisAbonnement: true,
    preuve:
      "aiguillage de connexion (id_user_grp = 3, typeauxiliaire ≠ 'affreteur' → auxiltransp/), " +
      'menu de rôle inventorié au cadrage',
    description:
      "Sous-compte agissant pour le compte d'un transporteur. Prépare les offres et " +
      'suit les transports. **Ne répond pas aux réservations** : accepter engage ' +
      'un débit à venir sur le compte du parent.',
  }),

  concessionnaire: Object.freeze({
    id: 'concessionnaire',
    libelle: 'Concessionnaire',
    niveau: NIVEAU.DEMONTRE,
    espace: ESPACE.CONCESSIONNAIRE,
    legacyGroupe: 4,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'aiguillage de connexion (id_user_grp = 4 → concessionnaire/), espace dédié (~39 écrans)',
    description:
      "**L'exploitant de la plateforme.** Supervise les groupements, les comptes et " +
      'les soldes, crédite manuellement, tient le catalogue de tarifs. ' +
      '**Ne transige pas** : il ne publie ni ne valide à la place d\'un acteur du ' +
      'marché. Distinct de la DGTTC (arbitrage N3).',
  }),

  dgttc: Object.freeze({
    id: 'dgttc',
    libelle: 'DGTTC',
    niveau: NIVEAU.DEMONTRE,
    espace: ESPACE.DGTTC,
    legacyGroupe: 104,
    institutionnel: true,
    soumisAbonnement: false,
    preuve:
      'aiguillage de connexion (id_user_grp = 104 → dgttc/), ' +
      'menu de rôle inventorié au cadrage',
    description:
      "**L'autorité de contrôle** — Direction Générale des Transports Terrestres et " +
      "de la Circulation, entité étatique distincte de l'OIC. Consultation seule. " +
      '**Aucune donnée financière ne lui est servie** : un contrôleur qui verrait ' +
      "les comptes de ce qu'il contrôle n'en serait plus un (arbitrage N3).",
  }),

  /* ================================================================ *
   * Niveau 2 — déclinés de l'espace Transporteur (3)
   * ================================================================ */

  transporteur_prive: Object.freeze({
    id: 'transporteur_prive',
    libelle: 'Transporteur privé',
    niveau: NIVEAU.DECLINE,
    espace: ESPACE.TRANSPORTEUR,
    legacyGroupe: 105,
    institutionnel: false,
    soumisAbonnement: true,
    preuve: 'aiguillage de connexion (id_user_grp = 105 → transprive/)',
    description:
      "Transporteur pour compte propre. **Ne publie pas d'offre sur le marché " +
      "public** : il répond aux demandes. La restriction est portée par la matrice, " +
      "jamais par du code d'écran.",
  }),

  transporteur_etranger: Object.freeze({
    id: 'transporteur_etranger',
    libelle: 'Transporteur étranger',
    niveau: NIVEAU.DECLINE,
    espace: ESPACE.TRANSPORTEUR,
    legacyGroupe: 106,
    institutionnel: false,
    soumisAbonnement: true,
    preuve: 'aiguillage de connexion (id_user_grp = 106 → transpetranger/)',
    description:
      'Transporteur sous régime particulier. Le champ « pays d\'immatriculation » ' +
      'devient obligatoire sur ses véhicules, et un bandeau signale le régime.',
  }),

  partenaire: Object.freeze({
    id: 'partenaire',
    libelle: 'Partenaire',
    niveau: NIVEAU.DECLINE,
    espace: ESPACE.TRANSPORTEUR,
    legacyGroupe: 107,
    institutionnel: false,
    soumisAbonnement: true,
    preuve:
      'aiguillage de connexion (id_user_grp = 107 → partenaire/), ' +
      'menu de rôle inventorié au cadrage',
    description:
      'Accès en lecture à la flotte et aux mises en relation, plus la génération ' +
      "de DUT. **Aucun accès au marché** : ne publie pas, ne réserve pas.",
  }),

  /* ================================================================ *
   * Niveau 3 — modélisés : profils de back-office (10)
   *
   * Déclarés, administrables, menu généré depuis leurs permissions. Aucun écran
   * métier dédié : caisse, contentieux et comptabilité restent hors périmètre
   * (`plan-suivi.md` § 1.3). Leurs permissions sont donc volontairement pauvres,
   * et c'est un fait à énoncer en démonstration, pas à masquer.
   * ================================================================ */

  super_admin: Object.freeze({
    id: 'super_admin',
    libelle: 'Super administrateur',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage (id_profil = 8)',
    description:
      'Administration technique de la plateforme. **Volontairement dépourvu de ' +
      'droits métier dans le POC** : un compte qui peut tout est précisément ce ' +
      "qu'une matrice de droits sert à éviter. Ses écrans d'administration système " +
      'sont hors périmètre.',
  }),

  admin_compta: Object.freeze({
    id: 'admin_compta',
    libelle: 'Administrateur comptabilité',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage',
    description: 'Administration du module comptable. Module hors périmètre du POC.',
  }),

  admin_superviseur_centre_tech: Object.freeze({
    id: 'admin_superviseur_centre_tech',
    libelle: 'Administrateur superviseur de centre technique',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage (id_profil = 2)',
    description: 'Supervision des centres techniques. Module hors périmètre du POC.',
  }),

  agent_caisse: Object.freeze({
    id: 'agent_caisse',
    libelle: 'Agent de caisse',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage (id_profil = 3)',
    description:
      'Encaissement au guichet. **La caisse est explicitement hors périmètre** ' +
      "(`plan-suivi.md` § 1.3) : le rôle est déclaré, son écran n'existe pas.",
  }),

  superviseur_comptabilite: Object.freeze({
    id: 'superviseur_comptabilite',
    libelle: 'Superviseur comptabilité',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage (id_profil = 2)',
    description: 'Supervision comptable. Module hors périmètre du POC.',
  }),

  superviseur_cpte: Object.freeze({
    id: 'superviseur_cpte',
    libelle: 'Superviseur des comptes',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage (id_profil = 4)',
    description: 'Supervision des comptes clients. Module hors périmètre du POC.',
  }),

  contentieux_paie: Object.freeze({
    id: 'contentieux_paie',
    libelle: 'Contentieux et paiements',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage',
    description:
      'Traitement des litiges et des impayés. **Le contentieux est explicitement ' +
      'hors périmètre** : le rôle est déclaré, son écran n\'existe pas.',
  }),

  dut_transport: Object.freeze({
    id: 'dut_transport',
    libelle: 'Agent DUT transport',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage',
    description:
      'Traitement des Documents Uniques de Transport. Seul profil de niveau 3 à ' +
      'recevoir un droit métier dans le POC : la lecture des DUT générés.',
  }),

  activation_inscription: Object.freeze({
    id: 'activation_inscription',
    libelle: 'Agent d\'activation des inscriptions',
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage',
    description:
      "Activation des inscriptions de transporteurs. Reçoit la lecture des " +
      'groupements ; leur activation relève du concessionnaire dans le POC.',
  }),

  activation_inscription_affreteur: Object.freeze({
    id: 'activation_inscription_affreteur',
    libelle: "Agent d'activation des inscriptions affréteur",
    niveau: NIVEAU.MODELISE,
    espace: ESPACE.MINIMAL,
    legacyGroupe: null,
    institutionnel: true,
    soumisAbonnement: false,
    preuve: 'menu de rôle inventorié au cadrage',
    description:
      "Variante affréteur du profil précédent. Le système existant les distingue " +
      'par deux menus ; le POC conserve la distinction.',
  }),
});

/** Nombre de rôles déclarés. Vérifié par test. @type {number} */
export const NOMBRE_ROLES = Object.keys(ROLES).length;

/**
 * Rend la définition d'un rôle.
 * @param {string} id
 * @returns {Readonly<Role>}
 * @throws {Error} Si le rôle n'est pas déclaré — jamais de rôle implicite.
 */
export function role(id) {
  const r = ROLES[id];
  if (!r) {
    throw new Error(
      `Rôle inconnu : « ${id} ». Tout rôle doit être déclaré dans js/domain/roles.js.`,
    );
  }
  return r;
}

/**
 * Liste les rôles d'un niveau de traitement.
 * @param {number} niveau
 * @returns {Array<Readonly<Role>>}
 */
export function rolesDuNiveau(niveau) {
  return Object.values(ROLES).filter((r) => r.niveau === niveau);
}

/**
 * Indique si le rôle voit son accès conditionné par l'abonnement du groupement.
 * @param {string} id
 * @returns {boolean}
 */
export function soumisAbonnement(id) {
  return role(id).soumisAbonnement;
}
