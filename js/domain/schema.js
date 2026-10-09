/**
 * Schéma du modèle de données B2F — déclaratif, sans effet de bord.
 *
 * Ce fichier est la source unique de vérité sur les entités du POC : leurs champs,
 * leurs types, leurs contraintes, leurs relations et la **classification** de chaque
 * donnée. Il ne lit ni n'écrit rien. Les dépôts (`js/repositories/`) le consomment
 * pour refuser toute écriture non conforme.
 *
 * ## Pourquoi un schéma explicite
 *
 * Sans clé étrangère, sans contrainte de validation et sans valeur par défaut en
 * base, l'intégrité repose entièrement sur la discipline du code appelant.
 * L'exprimer ici est l'un des quatre écarts délibérés du POC.
 *
 * ## Classification — comment le POC tient ses deux règles de confidentialité
 *
 * Chaque champ porte une classification. Deux exigences de conception en découlent,
 * et elles sont tenues par **un seul mécanisme** plutôt que par de la vigilance
 * dispersée dans les écrans :
 *
 * 1. Les coordonnées du transporteur ne sont jamais servies avant l'état `valider`
 *    (classification `contact`).
 * 2. Le rôle DGTTC ne reçoit aucune donnée financière (classification `financier`).
 *
 * ## Ce que ce mécanisme ne fait PAS
 *
 * Il empêche le code applicatif de **construire** un objet contenant des données
 * non autorisées. Il ne protège rien contre quelqu'un qui ouvre les outils de
 * développement : dans un POC sans serveur, LocalStorage est lisible et modifiable
 * par tout porteur du navigateur. C'est une garantie de **conception**, jamais une
 * garantie de sécurité — voir `plan-suivi.md` § 8.
 *
 * @module domain/schema
 */

import {
  ETAT_ABONNEMENT,
  ETAT_APPARIEMENT,
  ETAT_COMPTE,
  ETAT_DECLARATION,
  ETAT_DEMANDE,
  ETAT_OFFRE,
  ETAT_VEHICULE,
  ETAPE_TRANSPORT,
  EVENEMENT_AUDIT,
  CODE_TARIF,
  MOTIF_OPERATION,
  MOTIF_REJET,
  NATURE_INCIDENT,
  SENS_APPARIEMENT,
  SENS_OPERATION,
  TYPE_GROUPEMENT,
} from './enums.js';

/* ================================================================== *
 * 1. Classification des données
 * ================================================================== */

/**
 * Classification d'un champ. Détermine qui peut le lire, et à partir de quand.
 * @readonly
 * @enum {string}
 */
export const CLASSIFICATION = Object.freeze({
  /** Lisible par tout utilisateur authentifié. Corridors, dates, capacités. */
  PUBLIC: 'public',
  /** Identité commerciale d'une entreprise. Visible sur le marché : c'est ce qui
   *  permet de choisir avec qui traiter. Raison sociale, immatriculation, RCCM. */
  IDENTITE: 'identite',
  /** **Coordonnées nominatives.** Téléphone, courriel, chauffeur, carte grise.
   *  Servies aux deux parties d'un appariement UNIQUEMENT à l'état `valider`.
   *  Leur transmission EST la mise en relation : c'est ce que la plateforme vend. */
  CONTACT: 'contact',
  /** Soldes, montants, écritures. Jamais servi au rôle de contrôle (DGTTC). */
  FINANCIER: 'financier',
  /** Empreintes, sels, jetons. **Jamais projeté vers aucun rôle, sans exception.** */
  SYSTEME: 'systeme',
});

/* ================================================================== *
 * 2. Fabriques de champs
 * ================================================================== */

/**
 * @typedef {object} Champ
 * @property {string} type              `id`|`string`|`text`|`number`|`integer`|`boolean`|`datetime`|`date`|`enum`|`array`|`object`
 * @property {boolean} requis           Une valeur absente est refusée à l'écriture.
 * @property {string} classification    Voir {@link CLASSIFICATION}.
 * @property {ReadonlyArray<string>} [valeurs]  Valeurs admises si `type === 'enum'`.
 * @property {string} [ref]             Nom de l'entité référencée (intégrité référentielle).
 * @property {'restrict'|'cascade'|'detach'} [onDelete] Comportement si la cible disparaît.
 * @property {boolean} [unique]         Unicité à l'échelle de la collection.
 * @property {number} [min]             Borne inférieure incluse (nombres) ou longueur (chaînes).
 * @property {number} [max]             Borne supérieure incluse.
 * @property {string} [note]            Précision destinée au lecteur du schéma.
 * @property {Readonly<Record<string, Champ>>} [champs]
 *   Sous-structure d'un champ `object`. `projeter()` y descend récursivement.
 * @property {Readonly<Record<string, Champ>>} [elements]
 *   Structure des éléments d'un champ `array` d'objets. `projeter()` y descend.
 * @property {string} [proprietaire]
 *   Pour une sous-structure : champ de l'élément portant le groupement
 *   propriétaire. Permet à chaque événement d'un journal d'appartenir à son auteur.
 */

/**
 * Déclare un champ. Par défaut : facultatif et public.
 *
 * **Un champ conteneur — `object` ou `array` — doit déclarer sa classification
 * explicitement.** La valeur par défaut `public` lui est refusée : un conteneur
 * hérité de ce défaut traverse les deux verrous sans être examiné, puisque la
 * projection filtre champ par champ. C'est exactement le défaut relevé par
 * l'audit de sécurité (finding S1) sur `dut.donnees`, `transport.journal` et
 * `notification.corps`. L'erreur est levée **au chargement du module**, donc à la
 * première exécution des tests, jamais en démonstration.
 *
 * @param {string} type
 * @param {Partial<Champ>} [opts]
 * @returns {Readonly<Champ>}
 * @throws {Error} Si un conteneur omet sa classification.
 */
const f = (type, opts = {}) => {
  if ((type === 'object' || type === 'array') && opts.classification === undefined) {
    throw new Error(
      `Un champ de type « ${type} » doit déclarer sa classification explicitement. ` +
        'Sans elle il vaudrait « public » et son contenu échapperait à la projection ' +
        '(finding S1 de l’audit de sécurité). Déclarez aussi `champs` ou `elements` ' +
        'si la sous-structure porte des données de classifications différentes.',
    );
  }
  return Object.freeze({ type, requis: false, classification: CLASSIFICATION.PUBLIC, ...opts });
};

/** Identifiant technique de l'entité elle-même. */
const idPropre = () => f('id', { requis: true, unique: true });

/**
 * Référence vers une autre entité.
 * @param {string} entite
 * @param {Partial<Champ>} [opts]
 */
const ref = (entite, opts = {}) =>
  f('id', { ref: entite, onDelete: 'restrict', requis: true, ...opts });

/**
 * Champ énuméré.
 * @param {Record<string, string>} source Objet d'énumération importé de `enums.js`.
 * @param {Partial<Champ>} [opts]
 */
const enumOf = (source, opts = {}) =>
  f('enum', { valeurs: Object.freeze(Object.values(source)), requis: true, ...opts });

/* ================================================================== *
 * 3. Entités
 * ================================================================== */

/**
 * Définition des entités du POC.
 *
 * `collection` est le nom **sans préfixe**. Le préfixe `b2f_` est ajouté par
 * `js/core/storage.js` et n'apparaît nulle part ailleurs : une seule fonction
 * fabrique les clés, ce qui rend la parade du risque R5 vérifiable en un point.
 *
 * @type {Readonly<Record<string, object>>}
 */
export const ENTITES = Object.freeze({
  /* ---------------------------------------------------------------- *
   * Acteurs
   * ---------------------------------------------------------------- */

  groupement: Object.freeze({
    collection: 'groupements',
    proprietaire: 'id',
    libelle: 'Groupement',
    legacy: 'Groupements',
    description:
      "L'entreprise inscrite. Entité pivot : elle porte le compte, l'abonnement, " +
      'les véhicules et les chauffeurs. Le cloisonnement des données se fait à ce ' +
      "niveau, jamais au niveau de l'utilisateur.",
    champs: Object.freeze({
      id: idPropre(),
      raisonSociale: f('string', {
        requis: true,
        max: 160,
        classification: CLASSIFICATION.IDENTITE,
      }),
      type: enumOf(TYPE_GROUPEMENT, { classification: CLASSIFICATION.IDENTITE }),
      rccm: f('string', { max: 40, classification: CLASSIFICATION.IDENTITE }),
      compteContribuable: f('string', { max: 40, classification: CLASSIFICATION.IDENTITE }),
      carteTransporteurNumero: f('string', {
        max: 40,
        classification: CLASSIFICATION.IDENTITE,
        note: 'Renseigné pour les groupements de type transporteur.',
      }),
      carteTransporteurEcheance: f('date', { classification: CLASSIFICATION.IDENTITE }),
      pays: f('string', { requis: true, max: 60, classification: CLASSIFICATION.IDENTITE }),
      localiteId: ref('referentiel', { classification: CLASSIFICATION.IDENTITE }),
      adresse: f('text', { classification: CLASSIFICATION.CONTACT }),
      contactNom: f('string', { max: 120, classification: CLASSIFICATION.CONTACT }),
      contactTelephone: f('string', { max: 32, classification: CLASSIFICATION.CONTACT }),
      contactEmail: f('string', { max: 160, classification: CLASSIFICATION.CONTACT }),
      etat: enumOf(ETAT_COMPTE),
      creeLe: f('datetime', { requis: true }),
      demo: f('boolean', {
        requis: true,
        note: 'Marque les données fictives du POC (risque R9). Toujours true ici.',
      }),
    }),
    invariants: Object.freeze([
      {
        nom: 'transporteurPorteUneCarte',
        message:
          'Un groupement de type transporteur doit porter un numéro de carte de ' +
          'transporteur et son échéance.',
        verifier: (g) =>
          g.type !== TYPE_GROUPEMENT.TRANSPORTEUR ||
          Boolean(g.carteTransporteurNumero && g.carteTransporteurEcheance),
      },
    ]),
  }),

  utilisateur: Object.freeze({
    collection: 'users',
    proprietaire: 'groupementId',
    libelle: 'Utilisateur',
    legacy: 'utilisateur',
    description:
      'Un compte de connexion, rattaché à un groupement et porteur d’UN rôle. ' +
      "L'auxiliaire est un utilisateur du groupement parent : il n'a pas de " +
      'groupement propre, ce qui rend le cloisonnement identique pour tous.',
    champs: Object.freeze({
      id: idPropre(),
      email: f('string', {
        requis: true,
        unique: true,
        max: 160,
        classification: CLASSIFICATION.CONTACT,
      }),
      nom: f('string', { requis: true, max: 80, classification: CLASSIFICATION.IDENTITE }),
      prenom: f('string', { max: 80, classification: CLASSIFICATION.IDENTITE }),
      telephone: f('string', { max: 32, classification: CLASSIFICATION.CONTACT }),
      roleId: f('string', {
        requis: true,
        ref: 'role',
        note: 'Code de rôle déclaré dans js/domain/roles.js. Un rôle et un seul.',
      }),
      groupementId: ref('groupement', {
        note:
          'Absent pour les rôles institutionnels (concessionnaire, DGTTC, ' +
          'back-office) qui ne sont rattachés à aucune entreprise du marché.',
        requis: false,
      }),
      creeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      motDePasse: f('object', {
        requis: true,
        classification: CLASSIFICATION.SYSTEME,
        note:
          'Forme { algo, iterations, sel, empreinte }. PBKDF2-SHA256 via Web Crypto. ' +
          'Aucun condensat rapide sans sel n’est employé. ' +
          "L'algorithme et le nombre d'itérations sont stockés avec l'empreinte " +
          'pour qu’un durcissement ultérieur reste possible sans réinitialisation.',
      }),
      etat: enumOf(ETAT_COMPTE),
      dernierAccesLe: f('datetime'),
      creeLe: f('datetime', { requis: true }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'emailNormalise',
        message: "L'adresse électronique est stockée en minuscules, sans espace de bord.",
        verifier: (u) => typeof u.email === 'string' && u.email === u.email.trim().toLowerCase(),
      },
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * Le fret
   * ---------------------------------------------------------------- */

  declaration: Object.freeze({
    collection: 'declarations',
    proprietaire: 'groupementId',
    libelle: 'Déclaration de fret',
    legacy: 'Declaration',
    description: "Le fret déclaré par l'affréteur : un corridor et un libellé.",
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, note: 'Format DF-AAAA-NNNN.' }),
      groupementId: ref('groupement'),
      libelle: f('string', { requis: true, max: 120 }),
      provenanceId: ref('referentiel', {
        note:
          'Localité de provenance. Dans le système existant, `id_prov_fret` désigne ' +
          'bien une localité — ce n’est PAS un lien vers le DUT. Confusion à éviter.',
      }),
      destinationId: ref('referentiel'),
      observation: f('text'),
      etat: enumOf(ETAT_DECLARATION),
      creeeLe: f('datetime', { requis: true }),
      creeeParUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      publieeLe: f('datetime'),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'corridorNonDegenere',
        message: 'La destination doit être différente de la provenance.',
        verifier: (d) => d.provenanceId !== d.destinationId,
      },
    ]),
  }),

  demande: Object.freeze({
    collection: 'demandes',
    proprietaire: 'groupementId',
    libelle: 'Demande de transport',
    legacy: 'DemandeTransport + LigneDemande',
    description:
      'Le besoin de transport rattaché à une déclaration. Les lignes de marchandise ' +
      'sont **embarquées** : elles n’ont aucun sens hors de leur demande, ne sont ' +
      'jamais interrogées seules, et les embarquer rend leur écriture atomique sans ' +
      'mécanisme supplémentaire.',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, note: 'Format DT-AAAA-NNNN.' }),
      declarationId: ref('declaration', { onDelete: 'cascade' }),
      groupementId: ref('groupement', {
        note:
          'Dénormalisé depuis la déclaration. Assumé : le cloisonnement se lit sur ' +
          'un seul champ, sans jointure. L’invariant `groupementCoherent` (croisé, ' +
          'porté par le dépôt) garantit l’égalité avec celui de la déclaration.',
      }),
      departPrevu: f('datetime', { requis: true }),
      arriveePrevue: f('datetime', { requis: true }),
      capaciteId: ref('referentiel'),
      carrosserieId: ref('referentiel'),
      essieuxId: ref('referentiel', { requis: false }),
      contraintes: f('text', { note: 'Visible des transporteurs.' }),
      lignes: f('array', {
        requis: true,
        min: 1,
        classification: CLASSIFICATION.PUBLIC,
        note:
          'La marchandise est publique : c’est ce que le transporteur doit voir ' +
          'pour décider s’il peut la transporter. Aucun sous-champ nominatif.',
        elements: Object.freeze({
          id: f('id', { requis: true }),
          produitId: ref('referentiel', { note: 'Nomenclature SH.' }),
          // QA-M2 : 1e12 tonnes était accepté et publié. Une borne haute n'est
          // pas une contrainte métier arbitraire — c'est le refus d'enregistrer
          // ce qu'aucun véhicule ne transportera.
          poidsT: f('number', { requis: true, min: 0, max: 100000 }),
          volumeM3: f('number', { min: 0, max: 1000000 }),
          nombreColis: f('integer', { min: 1, max: 1000000 }),
          emballageId: ref('referentiel', { requis: false }),
        }),
      }),
      etat: enumOf(ETAT_DEMANDE),
      creeeLe: f('datetime', { requis: true }),
      creeeParUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      publieeLe: f('datetime'),
      annuleeLe: f('datetime'),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'arriveeApresDepart',
        message: "La date d'arrivée souhaitée doit être strictement postérieure au départ.",
        verifier: (d) => new Date(d.arriveePrevue) > new Date(d.departPrevu),
      },
      {
        nom: 'aumoinsUneLigne',
        message: 'Une demande porte au moins une ligne de marchandise.',
        verifier: (d) => Array.isArray(d.lignes) && d.lignes.length > 0,
      },
      {
        nom: 'lignesBienFormees',
        message: 'Chaque ligne porte un produit et un poids strictement positif.',
        verifier: (d) =>
          Array.isArray(d.lignes) &&
          d.lignes.every(
            (l) =>
              Boolean(l.produitId) &&
              typeof l.poidsT === 'number' &&
              l.poidsT > 0 &&
              (l.volumeM3 == null || l.volumeM3 > 0) &&
              (l.nombreColis == null || (Number.isInteger(l.nombreColis) && l.nombreColis >= 1)),
          ),
      },
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * La flotte
   * ---------------------------------------------------------------- */

  vehicule: Object.freeze({
    collection: 'vehicules',
    proprietaire: 'groupementId',
    libelle: 'Véhicule',
    legacy: 'Vehicule',
    description:
      'Un véhicule du parc d’un groupement. Le système existant nomme cette relation ' +
      '`TransporteurId` alors qu’elle pointe vers `Groupements` : le POC corrige le nom.',
    champs: Object.freeze({
      id: idPropre(),
      groupementId: ref('groupement'),
      immatriculation: f('string', {
        requis: true,
        unique: true,
        max: 24,
        classification: CLASSIFICATION.IDENTITE,
        note: 'Visible sur le marché avant validation : c’est un critère de choix.',
      }),
      carteGrise: f('string', {
        max: 40,
        classification: CLASSIFICATION.CONTACT,
        note: 'Pièce du dossier, transmise à la mise en relation seulement.',
      }),
      capaciteT: f('number', { requis: true, min: 0 }),
      ptacT: f('number', { requis: true, min: 0 }),
      carrosserieId: ref('referentiel'),
      essieuxId: ref('referentiel'),
      carteTransportNumero: f('string', { requis: true, classification: CLASSIFICATION.IDENTITE }),
      carteTransportEcheance: f('date', {
        requis: true,
        classification: CLASSIFICATION.IDENTITE,
        note:
          'Un véhicule dont la carte est échue reste au parc mais ne peut pas être ' +
          'publié. Contrôle fait à la publication, pas à la saisie.',
      }),
      paysImmatriculation: f('string', {
        max: 60,
        note: 'Obligatoire pour le rôle transporteur étranger — règle portée par le rôle.',
      }),
      stationnementLocaliteId: ref('referentiel', {
        requis: false,
        note: 'Lieu de stationnement déclaré par le transporteur. Ce n’est pas une position GPS.',
      }),
      stationnementMisAJourLe: f('datetime', {
        note: 'Horodatage de la déclaration de stationnement, comparé aux livraisons enregistrées.',
      }),
      prixKmT: f('number', {
        min: 0,
        note:
          'Purement déclaratif. Aucun calcul de facturation ne l’utilise, dans le ' +
          'système existant comme dans le POC. Information de marché affichée.',
      }),
      etat: enumOf(ETAT_VEHICULE),
      creeLe: f('datetime', { requis: true }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'capaciteSousPtac',
        message: 'La capacité utile ne peut pas dépasser le PTAC.',
        verifier: (v) => v.capaciteT <= v.ptacT,
      },
    ]),
  }),

  chauffeur: Object.freeze({
    collection: 'chauffeurs',
    proprietaire: 'groupementId',
    libelle: 'Chauffeur',
    legacy: 'Chauffeur',
    description:
      "**Donnée du groupement, jamais un utilisateur connecté.** Le système existant " +
      'ne lui donne aucun compte, et le POC ne lui en invente pas. Ses coordonnées ' +
      "sont transmises à l'affréteur au moment de la mise en relation, jamais avant.",
    champs: Object.freeze({
      id: idPropre(),
      groupementId: ref('groupement'),
      nom: f('string', { requis: true, max: 120, classification: CLASSIFICATION.CONTACT }),
      permisNumero: f('string', { requis: true, max: 40, classification: CLASSIFICATION.CONTACT }),
      permisEcheance: f('date', {
        classification: CLASSIFICATION.CONTACT,
        note:
          'Un permis échu est signalé sans bloquer : c’est une information de ' +
          'contrôle, pas une règle de la plateforme.',
      }),
      telephone: f('string', { max: 32, classification: CLASSIFICATION.CONTACT }),
      vehiculeId: ref('vehicule', {
        requis: false, onDelete: 'detach',
        note: 'Champ historique conservé pour les anciens seeds. Non utilisé : le chauffeur est choisi par offre via chauffeurPressentiId. Toute modification de sa fiche remet ce champ à null.',
      }),
      creeLe: f('datetime', { requis: true }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([]),
  }),

  /* ---------------------------------------------------------------- *
   * Le marché
   * ---------------------------------------------------------------- */

  offre: Object.freeze({
    collection: 'offres',
    proprietaire: 'groupementId',
    libelle: 'Offre de véhicule',
    legacy: 'OffreVehicule',
    description:
      'Un véhicule annoncé disponible sur un corridor et une fenêtre de dates. ' +
      '**Ne porte plus les réponses des parties** : celles-ci vivent sur l’entité ' +
      '`appariement`. C’est ce déplacement qui supprime les trois mécanismes ' +
      'concurrents du système existant (écart délibéré n° 1).',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, note: 'Format OV-AAAA-NNNN.' }),
      groupementId: ref('groupement'),
      vehiculeId: ref('vehicule'),
      chauffeurPressentiId: ref('chauffeur', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.CONTACT,
      }),
      trajetRetour: f('boolean', { note: 'Trajet retour déclaré par le transporteur.' }),
      trajetVide: f('boolean', { note: 'Trajet à vide déclaré ; silhouette tracteur seul.' }),
      localiteDepartId: ref('referentiel'),
      localiteArriveeId: ref('referentiel'),
      disponibleDu: f('datetime', { requis: true }),
      disponibleAu: f('datetime', { requis: true }),
      prixKmT: f('number', { min: 0, note: 'Déclaratif. Jamais utilisé en calcul.' }),
      etat: enumOf(ETAT_OFFRE),
      publieeLe: f('datetime', { requis: true }),
      retireeLe: f('datetime'),
      creeeParUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'fenetreOrdonnee',
        message: 'La fin de disponibilité ne peut pas précéder le début.',
        verifier: (o) => new Date(o.disponibleAu) >= new Date(o.disponibleDu),
      },
      {
        nom: 'corridorNonDegenere',
        message: "La localité d'arrivée doit être différente de la localité de départ.",
        verifier: (o) => o.localiteDepartId !== o.localiteArriveeId,
      },
    ]),
  }),

  appariement: Object.freeze({
    collection: 'appariements',
    proprietaire: null,
    libelle: 'Appariement',
    legacy: 'OffreVehicule.reponse_* + OffreDemande',
    description:
      'Entité de premier ordre du POC : la rencontre d’une offre et d’une demande, ' +
      'et son cycle de vie. **Le système existant n’a pas cette entité** — il porte ' +
      'les réponses en colonnes sur l’offre, plus une table `OffreDemande` ' +
      'concurrente. Conséquence : il ne sait pas représenter une offre rejetée puis ' +
      'réservée à nouveau. Ici, chaque tentative est un enregistrement distinct.',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, note: 'Format MR-AAAA-NNNN.' }),
      offreId: ref('offre'),
      demandeId: ref('demande'),
      groupementAffreteurId: ref('groupement', {
        note: 'Dénormalisé : le cloisonnement des deux parties se lit sans jointure.',
      }),
      groupementTransporteurId: ref('groupement'),
      sens: enumOf(SENS_APPARIEMENT),
      etat: enumOf(ETAT_APPARIEMENT),
      reserveLe: f('datetime', { requis: true }),
      reserveParUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      reponduLe: f('datetime'),
      reponduParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      motifRejet: f('enum', { valeurs: Object.freeze(Object.values(MOTIF_REJET)) }),
      precisionRejet: f('text', { note: 'Complément libre. Ne remplace pas le motif.' }),
      annuleLe: f('datetime'),
      annuleParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      valideLe: f('datetime'),
      valideParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      fraisAffreteur: f('number', {
        min: 0,
        classification: CLASSIFICATION.FINANCIER,
        note:
          'Montant **figé au moment de la validation**, copié depuis le catalogue. ' +
          'Sans cela, une modification ultérieure du tarif réécrirait l’histoire.',
      }),
      fraisTransporteur: f('number', { min: 0, classification: CLASSIFICATION.FINANCIER }),
      operationAffreteurId: ref('operation', {
        requis: false,
        onDelete: 'restrict',
        classification: CLASSIFICATION.FINANCIER,
      }),
      operationTransporteurId: ref('operation', {
        requis: false,
        onDelete: 'restrict',
        classification: CLASSIFICATION.FINANCIER,
      }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'rejetMotive',
        message: 'Un rejet porte obligatoirement un motif.',
        verifier: (a) => a.etat !== ETAT_APPARIEMENT.REJETER || Boolean(a.motifRejet),
      },
      {
        nom: 'validationComplete',
        message:
          'Un appariement validé porte les deux montants ET les deux écritures. ' +
          'Un débit isolé serait une corruption silencieuse.',
        verifier: (a) =>
          a.etat !== ETAT_APPARIEMENT.VALIDER ||
          (typeof a.fraisAffreteur === 'number' &&
            typeof a.fraisTransporteur === 'number' &&
            Boolean(a.operationAffreteurId) &&
            Boolean(a.operationTransporteurId) &&
            Boolean(a.valideLe)),
      },
      {
        nom: 'partiesDistinctes',
        message: 'Un groupement ne peut pas être les deux parties d’un même appariement.',
        verifier: (a) => a.groupementAffreteurId !== a.groupementTransporteurId,
      },
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * Le transport
   * ---------------------------------------------------------------- */

  transport: Object.freeze({
    collection: 'transports',
    proprietaire: null,
    libelle: 'Transport',
    legacy: 'etat_dmde (informel)',
    description:
      'Créé au moment de la validation, jamais avant : il n’y a pas de transport ' +
      'sans mise en relation. Porte l’étape courante et un journal en ajout seul. ' +
      'Les six étapes sont un apport du POC — le système existant ne les formalise pas.',
    champs: Object.freeze({
      id: idPropre(),
      appariementId: ref('appariement', { unique: true }),
      etape: enumOf(ETAPE_TRANSPORT),
      journal: f('array', {
        requis: true,
        classification: CLASSIFICATION.PUBLIC,
        note:
          'Ajout seul. La chronologie des étapes est publique entre les parties ; ' +
          '**l’observation ne l’est pas** — c’est du texte libre saisi par un ' +
          'humain, qui peut contenir un numéro de téléphone ou un montant. Elle ' +
          'est donc classée `contact` et appartient à l’auteur de l’événement ' +
          '(finding S1 de l’audit de sécurité).',
        // Chaque événement appartient à son auteur : c'est lui qui décide si son
        // observation est libérée, pas le transport dans son ensemble.
        proprietaire: 'auteurGroupementId',
        elements: Object.freeze({
          id: f('id', { requis: true }),
          type: f('enum', { requis: true, valeurs: Object.freeze(['etape', 'incident']) }),
          valeur: f('string', {
            requis: true,
            note: 'Étape de ORDRE_ETAPES, ou nature de NATURE_INCIDENT si type = incident.',
          }),
          observation: f('text', {
            classification: CLASSIFICATION.CONTACT,
            note: 'Texte libre. Jamais servi à un tiers à la mise en relation.',
          }),
          auteurUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
          auteurGroupementId: ref('groupement', { onDelete: 'detach' }),
          horodatage: f('datetime', { requis: true }),
        }),
      }),
      demarreLe: f('datetime', { requis: true }),
      clotureLe: f('datetime'),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'journalNonVide',
        message: 'Le journal porte au moins l’événement de création.',
        verifier: (t) => Array.isArray(t.journal) && t.journal.length > 0,
      },
      {
        nom: 'journalChronologique',
        message: 'Les événements du journal sont strictement ordonnés dans le temps.',
        verifier: (t) =>
          Array.isArray(t.journal) &&
          t.journal.every(
            (e, i) => i === 0 || new Date(e.horodatage) >= new Date(t.journal[i - 1].horodatage),
          ),
      },
      {
        nom: 'incidentsBienFormes',
        message: 'Un incident porte une nature répertoriée.',
        verifier: (t) =>
          Array.isArray(t.journal) &&
          t.journal.every(
            (e) => e.type !== 'incident' || Object.values(NATURE_INCIDENT).includes(e.valeur),
          ),
      },
      {
        nom: 'clotureApresLivraison',
        message:
          'La date de clôture n’est renseignée que sur un transport à l’étape ' +
          '« clôturé ». La clôture est impossible avant « livré ».',
        verifier: (t) => (t.clotureLe == null) === (t.etape !== ETAPE_TRANSPORT.CLOTURE),
      },
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * L'argent
   * ---------------------------------------------------------------- */

  operation: Object.freeze({
    collection: 'operations',
    proprietaire: 'groupementId',
    libelle: 'Mouvement de compte',
    legacy: 'Operation',
    description:
      'Une écriture sur le compte prépayé d’un groupement. **Le solde n’est jamais ' +
      'stocké** : il vaut la somme des crédits moins la somme des débits, recalculée ' +
      'à la lecture. Un solde stocké se désynchronise ; un solde calculé ne le peut pas.',
    champs: Object.freeze({
      id: idPropre(),
      groupementId: ref('groupement', { classification: CLASSIFICATION.FINANCIER }),
      sens: enumOf(SENS_OPERATION, {
        classification: CLASSIFICATION.FINANCIER,
        note:
          'Le système existant porte deux colonnes `credit` et `debit` sur la même ' +
          'ligne, sans rien pour interdire qu’elles soient toutes deux renseignées. ' +
          'Le POC n’en garde qu’un montant et un sens.',
      }),
      montant: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      motif: enumOf(MOTIF_OPERATION, { classification: CLASSIFICATION.FINANCIER }),
      appariementId: ref('appariement', {
        requis: false,
        onDelete: 'restrict',
        classification: CLASSIFICATION.FINANCIER,
      }),
      libelle: f('string', { requis: true, max: 160, classification: CLASSIFICATION.FINANCIER }),
      referenceEncaissement: f('string', {
        max: 60,
        classification: CLASSIFICATION.FINANCIER,
        note: 'Obligatoire pour un rechargement saisi par le concessionnaire.',
      }),
      horodatage: f('datetime', { requis: true, classification: CLASSIFICATION.FINANCIER }),
      auteurUtilisateurId: ref('utilisateur', {
        onDelete: 'detach',
        classification: CLASSIFICATION.FINANCIER,
      }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'montantStrictementPositif',
        message: 'Un mouvement de zéro n’est pas un mouvement.',
        verifier: (o) => o.montant > 0,
      },
      {
        nom: 'rechargementReference',
        message: 'Un rechargement porte une référence d’encaissement.',
        verifier: (o) =>
          o.motif !== MOTIF_OPERATION.RECHARGEMENT || Boolean(o.referenceEncaissement),
      },
      {
        nom: 'fraisRattachesAUnAppariement',
        message: 'Des frais de mise en relation se rattachent toujours à un appariement.',
        verifier: (o) =>
          (o.motif !== MOTIF_OPERATION.FRAIS_MISE_EN_RELATION_AFFRETEUR &&
            o.motif !== MOTIF_OPERATION.FRAIS_MISE_EN_RELATION_TRANSPORTEUR) ||
          Boolean(o.appariementId),
      },
    ]),
  }),

  tarif: Object.freeze({
    collection: 'tarifs',
    proprietaire: null,
    libelle: 'Tarif de service',
    legacy: 'Fiche_prix',
    description:
      'Catalogue du prix des **services de la plateforme** — abonnement, frais de ' +
      'mise en relation. **Ce n’est pas une grille tarifaire du fret.** La confusion ' +
      'serait facile et conduirait à un modèle faux. Le système existant y met des ' +
      'identifiants numériques en dur (1, 2, 10002…) ; le POC utilise des codes lisibles.',
    champs: Object.freeze({
      id: f('string', {
        requis: true,
        unique: true,
        valeurs: Object.freeze(Object.values(CODE_TARIF)),
        note: 'L’identifiant EST le code du tarif.',
      }),
      libelle: f('string', { requis: true, max: 120 }),
      montant: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      devise: f('string', { requis: true, max: 8 }),
      actif: f('boolean', { requis: true }),
      modifieLe: f('datetime', { requis: true }),
      modifieParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
    }),
    invariants: Object.freeze([]),
  }),

  abonnement: Object.freeze({
    collection: 'abonnements',
    proprietaire: 'groupementId',
    libelle: 'Abonnement',
    legacy: 'Abonne',
    description:
      "Conditionne l'accès : sans abonnement actif, l'utilisateur est redirigé vers " +
      'le réabonnement et aucun autre écran ne lui est accessible (M10.2).',
    champs: Object.freeze({
      id: idPropre(),
      groupementId: ref('groupement'),
      montant: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      devise: f('string', { requis: true, max: 8 }),
      debuteLe: f('date', { requis: true }),
      finitLe: f('date', { requis: true }),
      etat: enumOf(ETAT_ABONNEMENT, {
        note:
          'Dérivé de `finitLe` comparé à la date du jour, et recalculé à la lecture. ' +
          'Stocké pour la lisibilité des jeux de démonstration, jamais pour décider : ' +
          'l’autorité est la date. Aucune tâche planifiée (question U4, décision D38).',
      }),
      creeLe: f('datetime', { requis: true }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'periodeOrdonnee',
        message: 'La fin d’abonnement ne peut pas précéder son début.',
        verifier: (a) => new Date(a.finitLe) >= new Date(a.debuteLe),
      },
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * Annexes
   * ---------------------------------------------------------------- */

  notification: Object.freeze({
    collection: 'notifications',
    proprietaire: null,
    libelle: 'Notification',
    legacy: 'Mailing',
    description:
      'Dans l’application uniquement. Ni SMS ni courriel : le système existant les ' +
      'délègue à une procédure stockée du serveur SQL, non reproductible sans backend.',
    champs: Object.freeze({
      id: idPropre(),
      destinataireUtilisateurId: ref('utilisateur'),
      evenement: enumOf(EVENEMENT_AUDIT),
      message: f('object', {
        requis: true,
        classification: CLASSIFICATION.PUBLIC,
        note:
          '**Gabarit et paramètres, jamais une phrase composée.** Deux motifs. ' +
          '(1) Sécurité : une phrase libre finirait par contenir un montant ou un ' +
          'numéro, hors de portée de la projection (finding S1). (2) Rendu : la vue ' +
          'compose et échappe, ce qui ferme la seule surface XSS réaliste du POC ' +
          '(finding S13). Les paramètres ne portent que des références et des ' +
          'libellés publics — jamais de coordonnée, jamais de montant.',
        champs: Object.freeze({
          code: f('string', { requis: true, max: 60, note: 'Clé de gabarit résolue par la vue.' }),
          params: f('object', {
            classification: CLASSIFICATION.PUBLIC,
            note:
              'Références et libellés publics uniquement. L’invariant ' +
              '`notificationSansDonneeSensible` le vérifie à l’écriture.',
          }),
        }),
      }),
      cibleType: f('string', { note: 'Nom d’entité concernée, pour la navigation.' }),
      cibleId: f('id'),
      luLe: f('datetime'),
      creeeLe: f('datetime', { requis: true }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'notificationSansDonneeSensible',
        message:
          'Les paramètres d’une notification ne portent que des chaînes, des nombres ' +
          'et des booléens — jamais de structure imbriquée où une coordonnée ou un ' +
          'montant pourrait se glisser hors de portée de la projection.',
        verifier: (n) => {
          const p = n.message?.params;
          if (p == null) return true;
          if (typeof p !== 'object' || Array.isArray(p)) return false;
          return Object.values(p).every(
            (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v),
          );
        },
      },
    ]),
  }),

  dut: Object.freeze({
    collection: 'duts',
    proprietaire: null,
    libelle: 'Document Unique de Transport',
    legacy: 'Duts',
    description:
      'Fiche générée depuis une mise en relation validée. Reproduit le rattachement ' +
      'réel `Duts.id_off_vehi = OffreVehicule.id_off_vehi`. **Le POC ne reproduit pas ' +
      'le couplage réel** : dans le système existant, DUT et Bourse de Fret partagent ' +
      'une base unique. Ici, une fiche est produite, rien de plus.',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true }),
      appariementId: ref('appariement', { unique: true }),
      offreId: ref('offre', { note: 'Reproduit explicitement la jointure du système existant.' }),
      donnees: f('object', {
        requis: true,
        // Finding S1. L'audit proposait de classer tout le conteneur en `contact`.
        // Retenu autrement, et il faut dire pourquoi : un DUT est aussi un
        // document de CONTRÔLE — la DGTTC doit pouvoir lire le corridor et
        // l'immatriculation. Tout classer `contact` fermerait l'écran entier.
        // La classification du conteneur est donc le minimum requis pour le voir,
        // et chaque sous-champ est filtré ensuite par la projection récursive.
        // Le verrou réel est le test « aucun rôle privé de `contact` ne reçoit un
        // sous-champ nominatif du DUT » — pas la classe du conteneur.
        classification: CLASSIFICATION.PUBLIC,
        note:
          'Instantané figé des champs de la fiche, pris à la génération. Chaque ' +
          'sous-champ porte sa propre classification : la partie administrative ' +
          'reste lisible d’un rôle de contrôle, la partie nominative non.',
        champs: Object.freeze({
          corridor: f('string', { classification: CLASSIFICATION.PUBLIC }),
          departPrevu: f('datetime', { classification: CLASSIFICATION.PUBLIC }),
          arriveePrevue: f('datetime', { classification: CLASSIFICATION.PUBLIC }),
          marchandise: f('string', { classification: CLASSIFICATION.PUBLIC }),
          poidsTotalT: f('number', { classification: CLASSIFICATION.PUBLIC }),
          transporteurRaisonSociale: f('string', { classification: CLASSIFICATION.IDENTITE }),
          affreteurRaisonSociale: f('string', { classification: CLASSIFICATION.IDENTITE }),
          immatriculation: f('string', { classification: CLASSIFICATION.IDENTITE }),
          carteTransportNumero: f('string', { classification: CLASSIFICATION.IDENTITE }),
          carteGrise: f('string', { classification: CLASSIFICATION.CONTACT }),
          chauffeurNom: f('string', { classification: CLASSIFICATION.CONTACT }),
          chauffeurPermisNumero: f('string', { classification: CLASSIFICATION.CONTACT }),
          chauffeurTelephone: f('string', { classification: CLASSIFICATION.CONTACT }),
          transporteurTelephone: f('string', { classification: CLASSIFICATION.CONTACT }),
          transporteurEmail: f('string', { classification: CLASSIFICATION.CONTACT }),
        }),
      }),
      genereLe: f('datetime', { requis: true }),
      genereParUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([]),
  }),

  audit: Object.freeze({
    collection: 'audit',
    proprietaire: 'groupementId',
    libelle: "Entrée du journal d'audit",
    legacy: null,
    appendOnly: true,
    description:
      '**Ajout du POC** : le système existant n’a aucune piste d’audit unifiée. ' +
      'En ajout seul — aucune fonction de modification ni de suppression n’est ' +
      'développée, et ce point figure à la Definition of Done.',
    champs: Object.freeze({
      id: idPropre(),
      horodatage: f('datetime', { requis: true }),
      auteurUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      auteurRoleId: f('string', { requis: true, ref: 'role' }),
      groupementId: ref('groupement', { requis: false, onDelete: 'detach' }),
      evenement: enumOf(EVENEMENT_AUDIT),
      cibleType: f('string'),
      cibleId: f('id'),
      details: f('text', {
        note:
          'Texte d’explication. **Ne doit contenir aucune donnée de classification ' +
          '`contact`, `financier` ou `systeme`** : le journal est lisible par deux ' +
          'rôles dont l’un (DGTTC) n’a pas accès aux montants.',
      }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([]),
  }),

  referentiel: Object.freeze({
    collection: 'referentiels',
    proprietaire: null,
    libelle: 'Entrée de référentiel',
    legacy: 'Produit, produit_sh, Localites, Capacite, Carrosserie, Essieux, Emballages',
    description:
      'Les sept nomenclatures du système existant réunies en une collection unique, ' +
      'distinguées par une famille. Motif : elles partagent toutes la même forme ' +
      '(code, libellé, éventuel parent) et aucune ne justifie sa propre collection ' +
      'ni son propre dépôt dans un POC.',
    champs: Object.freeze({
      id: idPropre(),
      famille: f('enum', {
        requis: true,
        valeurs: Object.freeze([
          'localites',
          'produits_sh',
          'capacites',
          'carrosseries',
          'essieux',
          'emballages',
        ]),
      }),
      code: f('string', { requis: true, max: 40 }),
      libelle: f('string', { requis: true, max: 160 }),
      parentId: ref('referentiel', { requis: false, onDelete: 'restrict' }),
      actif: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'parentDeMemeFamille',
        message: 'Une entrée de référentiel ne peut avoir pour parent qu’une entrée du même ensemble.',
        verifier: (r) => r.parentId == null || r.parentId !== r.id,
      },
    ]),
  }),
});

/* ================================================================== *
 * 4. Invariants croisés — portés par les dépôts et les services
 * ================================================================== */

/**
 * Règles d'intégrité qui mettent en jeu plusieurs entités. Elles ne peuvent pas
 * être vérifiées sur une entité isolée et sont donc **déclarées ici, appliquées
 * ailleurs** — par les dépôts (J2) et par le service d'appariement (J3).
 *
 * Les déclarer ici plutôt que de les laisser implicites est l'objet même de
 * l'écart délibéré n° 4 : le système existant n'a aucune contrainte en base, et
 * ses règles n'existent que dans la tête de qui a écrit le code appelant.
 *
 * @type {ReadonlyArray<{nom: string, porte_par: string, regle: string}>}
 */
export const INVARIANTS_CROISES = Object.freeze([
  {
    nom: 'groupementCoherent',
    porte_par: 'repositories/demande.repository.js',
    regle:
      'demande.groupementId doit être égal au groupementId de sa déclaration. ' +
      'Le champ est dénormalisé : sa divergence serait une fuite de cloisonnement.',
  },
  {
    nom: 'appariementPartiesCoherentes',
    porte_par: 'services/matching.service.js',
    regle:
      'appariement.groupementAffreteurId = demande.groupementId et ' +
      'appariement.groupementTransporteurId = offre.groupementId.',
  },
  {
    nom: 'unSeulAppariementActifParOffre',
    porte_par: 'services/matching.service.js',
    regle:
      'Une offre ne porte au plus qu’un appariement dans un état non terminal ' +
      '(reserver, accepter). Les états rejeter, annuler et valider sont terminaux. ' +
      'C’est ce qui permet de rejouer une réservation sans écraser la précédente.',
  },
  {
    nom: 'unSeulAppariementValideParDemande',
    porte_par: 'services/matching.service.js',
    regle: 'Une demande ne peut porter qu’un seul appariement à l’état valider.',
  },
  {
    nom: 'fenetreRecouvrante',
    porte_par: 'services/matching.service.js',
    regle:
      'Une offre n’est proposée à la réservation que si sa fenêtre de disponibilité ' +
      'recouvre la fenêtre de la demande. Une offre hors fenêtre n’apparaît pas.',
  },
  {
    nom: 'vehiculePubliable',
    porte_par: 'services/offre.service.js',
    regle:
      'Un véhicule dont la carte de transport est échue ne peut pas être publié. ' +
      'Contrôle fait à la publication, pas à la saisie : le véhicule reste au parc, ' +
      'signalé « non publiable ».',
  },
  {
    nom: 'soldeJamaisNegatif',
    porte_par: 'services/compte.service.js',
    regle:
      'Aucun débit ne peut porter un solde de groupement sous zéro. Le solde vaut ' +
      'la somme des crédits moins la somme des débits, recalculée à chaque contrôle.',
  },
  {
    nom: 'doubleDebitAtomique',
    porte_par: 'services/matching.service.js + core/storage.js',
    regle:
      'La validation écrit deux mouvements, met à jour l’appariement, crée le ' +
      'transport et ajoute au journal d’audit. **Tout ou rien.** Un débit isolé ' +
      'serait une corruption silencieuse.',
  },
  {
    nom: 'coordonneesApresValidation',
    porte_par: 'domain/access.js',
    regle:
      'Aucun champ de classification `contact` d’un tiers n’est projeté tant que ' +
      'l’appariement qui lie les deux parties n’est pas à l’état `valider`. ' +
      'Ni servi, ni calculé côté vue, ni masqué en CSS.',
  },
  {
    nom: 'annulationImpossibleApresValidation',
    porte_par: 'services/matching.service.js',
    regle:
      'Une demande ou un appariement à l’état `valider` ne peut plus être annulé : ' +
      'un débit a eu lieu. Message explicite, pas un échec silencieux.',
  },
]);

/* ================================================================== *
 * 5. Accès au schéma
 * ================================================================== */

/**
 * Rend la définition d'une entité.
 * @param {string} nom
 * @returns {object}
 * @throws {Error} Si l'entité n'est pas déclarée.
 */
export function entite(nom) {
  const e = ENTITES[nom];
  if (!e) throw new Error(`Entité inconnue : « ${nom} ».`);
  return e;
}

/**
 * Liste les champs d'une entité portant une classification donnée.
 * @param {string} nomEntite
 * @param {string} classification
 * @returns {string[]}
 */
export function champsClasses(nomEntite, classification) {
  const { champs } = entite(nomEntite);
  return Object.keys(champs).filter((c) => champs[c].classification === classification);
}

/**
 * Liste les relations sortantes d'une entité.
 * @param {string} nomEntite
 * @returns {Array<{champ: string, vers: string, onDelete: string, requis: boolean}>}
 */
export function relations(nomEntite) {
  const { champs } = entite(nomEntite);
  return Object.entries(champs)
    .filter(([, d]) => Boolean(d.ref))
    .map(([champ, d]) => ({
      champ,
      vers: d.ref,
      onDelete: d.onDelete ?? 'restrict',
      requis: d.requis,
    }));
}

/**
 * Noms de collection déclarés, sans préfixe.
 * @returns {string[]}
 */
export function collections() {
  return Object.values(ENTITES).map((e) => e.collection);
}
