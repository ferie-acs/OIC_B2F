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
  ETAT_CREDIT,
  ETAT_DECLARATION,
  ETAT_DEMANDE,
  ETAT_OFFRE,
  ETAT_VEHICULE,
  ETAT_VERIFICATION,
  ETAPE_TRANSPORT,
  EVENEMENT_AUDIT,
  CODE_TARIF,
  MOTIF_CLOTURE,
  MOTIF_OPERATION,
  MOTIF_REJET,
  NATURE_INCIDENT,
  SENS_APPARIEMENT,
  SENS_OPERATION,
  TYPE_GROUPEMENT,
  /* Lot b1 : inscription, dossier, messagerie */
  CANAL_MESSAGE,
  ETAT_INSCRIPTION,
  ETAT_PIECE,
  STATUT_MESSAGE,
  // Lot b2 : organisation interne
  ETAT_MANDAT,
  PERIMETRE_MANDAT,
  /* Lot b3 : marché, flotte, attestation et contrôle sur route */
  CATEGORIE_PERMIS,
  ETAT_ATTESTATION,
  MODE_CONTROLE,
  RESULTAT_CONTROLE,
  TYPE_PIECE_IDENTITE,
} from './enums.js';
import { PIECES } from './inscription.js';
// Lot b4 : abonnements, paiements, caisse et finances.
import {
  CANAL_PAIEMENT,
  ETAPE_CONTENTIEUX,
  ETAT_PAIEMENT,
  ETAT_REVISION,
  ISSUE_CONTENTIEUX,
  MODES_PAR_CANAL,
  MODE_PAIEMENT,
  NATURE_CONTENTIEUX,
  OBJET_PAIEMENT,
  OPERATEUR_MOBILE,
} from './finances.js';

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
  /** Identité commerciale d'une entreprise. Raison sociale, immatriculation, RCCM.
   *  **Correctif anti-fraude n° 1 (13/10/2026)** : elle n'est plus servie à la
   *  contrepartie avant la validation. Connaître le nom d'un transporteur avant
   *  de payer suffisait à le joindre hors plateforme et à contourner les frais.
   *  Elle reste lisible du propriétaire, des rôles institutionnels, et des deux
   *  parties d'une mise en relation validée (`access.js`, `identiteLiberee`). */
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
      // --- Correctif anti-fraude n° 3 : vérification du dossier transporteur ---
      verificationEtat: f('enum', {
        valeurs: Object.freeze(Object.values(ETAT_VERIFICATION)),
        note:
          'Absent = à vérifier. Seul `verifie` ouvre la publication, la proposition, ' +
          'l’acceptation et la validation. Public : c’est le signal de confiance ' +
          'affiché sur le marché à la place de la raison sociale.',
      }),
      verificationPieces: f('array', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Pièces contrôlées par l’agent d’activation (PIECE_DOSSIER).',
      }),
      verifieLe: f('datetime'),
      verifieParUtilisateurId: ref('utilisateur', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.IDENTITE,
      }),
      verificationMotif: f('text', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Motif d’un refus, transmis au transporteur.',
      }),
      creeLe: f('datetime', { requis: true }),
      demo: f('boolean', {
        requis: true,
        note: 'Marque les données fictives du POC (risque R9). Toujours true ici.',
      }),
      // --- Lot b1 : inscription en ligne et activation ---------------------
      carteChargeurNumero: f('string', { max: 40, classification: CLASSIFICATION.IDENTITE }),
      agrementNumero: f('string', {
        max: 40,
        classification: CLASSIFICATION.IDENTITE,
        note: 'Agrément d’intermédiaire de fret.',
      }),
      agrementEcheance: f('date', { classification: CLASSIFICATION.IDENTITE }),
      inscriptionEtat: f('enum', {
        valeurs: Object.freeze(Object.values(ETAT_INSCRIPTION)),
        note: 'Absent = activée (groupements antérieurs à l’inscription en ligne).',
      }),
      inscritLe: f('datetime'),
      codeBfci: f('string', {
        unique: true,
        max: 20,
        classification: CLASSIFICATION.IDENTITE,
        note: 'Code d’entreprise attribué à l’activation.',
      }),
      activeLe: f('datetime'),
      activeParUtilisateurId: ref('utilisateur', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.IDENTITE,
      }),
      inscriptionMotif: f('text', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Dernier motif de complément ou de refus, transmis à l’entreprise.',
      }),
      inscriptionEchanges: f('array', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Échanges entre l’agent d’activation et l’entreprise sur le dossier.',
        elements: Object.freeze({
          le: f('datetime', { classification: CLASSIFICATION.IDENTITE }),
          auteur: f('string', { classification: CLASSIFICATION.IDENTITE, note: '`oic` ou `entreprise`.' }),
          nature: f('string', { classification: CLASSIFICATION.IDENTITE }),
          texte: f('text', { classification: CLASSIFICATION.IDENTITE }),
        }),
      }),
      modificationProposee: f('object', {
        classification: CLASSIFICATION.IDENTITE,
        note:
          'Modification de données d’identité demandée après activation : ' +
          '{ champs, demandeeLe, demandeeParUtilisateurId }. Elle ne s’applique ' +
          'qu’après contrôle de l’agent d’activation.',
      }),
      // --- Lot b2 : organisation interne — filiale ou entité rattachée ---
      parentId: ref('groupement', {
        requis: false,
        classification: CLASSIFICATION.IDENTITE,
        note:
          'Entreprise mère d’une filiale. La filiale hérite de ses pièces (RCCM, carte ' +
          'de transporteur), de sa vérification et de son abonnement ; elle tient son ' +
          'propre compte. Elle n’est active que si la mère est vérifiée.',
      }),
      creeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
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
      // Lot b1 : fonction du responsable déclarée à l'inscription.
      fonction: f('string', { max: 80, classification: CLASSIFICATION.IDENTITE }),
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
      // --- Lot b2 : organisation interne ---
      // Le code d'activation à usage unique est rangé DANS `motDePasse`
      // (`motDePasse.activation` : { empreinte, sel, expireLe, motif, echecs… }),
      // seul champ « systeme » de l'entité : un secret de plus n'ouvre pas un
      // second champ jamais projeté. Le code n'est jamais stocké en clair.
      modifieLe: f('datetime'),
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
      /* --- Lot b3 : modification et republication, avec trace --- */
      modifieeLe: f('datetime'),
      modifieeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      republieeLe: f('datetime'),
      historique: f('array', {
        classification: CLASSIFICATION.IDENTITE,
        note:
          'Trace des modifications et republications : date, action, auteur et ' +
          'nature des champs changés — jamais leurs valeurs. Servie au seul ' +
          'propriétaire et aux rôles institutionnels.',
        elements: Object.freeze({
          id: f('id', { requis: true }),
          le: f('datetime', { requis: true }),
          action: f('enum', { valeurs: Object.freeze(['modification', 'republication']) }),
          parUtilisateurId: f('id'),
          resume: f('text', { max: 300 }),
        }),
      }),
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
        note:
          'Masquée à la contrepartie avant validation (correctif anti-fraude n° 1) : ' +
          'une plaque suffit à retrouver son propriétaire hors plateforme.',
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
      verifieLe: f('datetime', {
        note:
          'Carte grise et carte de transport contrôlées par l’agent d’activation ' +
          '(correctif anti-fraude n° 3). Remis à vide dès que l’immatriculation, la ' +
          'carte grise ou la carte de transport changent : une plaque ne se ' +
          'substitue pas après contrôle.',
      }),
      verifieParUtilisateurId: ref('utilisateur', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.IDENTITE,
      }),
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
      verifieLe: f('datetime', {
        note:
          'Permis contrôlé par l’agent d’activation (correctif anti-fraude n° 3). ' +
          'Remis à vide si le nom ou le numéro de permis change.',
      }),
      verifieParUtilisateurId: ref('utilisateur', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.IDENTITE,
      }),
      creeLe: f('datetime', { requis: true }),
      /* --- Lot b3 : fiche complète du chauffeur et retrait d'un chauffeur parti --- */
      pieceType: f('enum', {
        valeurs: Object.freeze(Object.values(TYPE_PIECE_IDENTITE)),
        classification: CLASSIFICATION.IDENTITE,
      }),
      pieceNumero: f('string', { max: 40, classification: CLASSIFICATION.IDENTITE }),
      pieceDelivreeLe: f('date', { classification: CLASSIFICATION.IDENTITE }),
      pieceExpireLe: f('date', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Contrôlée par l’agent d’activation avec le permis (correctif anti-fraude n° 3).',
      }),
      nationalite: f('string', { max: 60, classification: CLASSIFICATION.IDENTITE }),
      dateNaissance: f('date', { classification: CLASSIFICATION.IDENTITE }),
      permisCategories: f('array', {
        classification: CLASSIFICATION.IDENTITE,
        note: `Valeurs admises : ${Object.values(CATEGORIE_PERMIS).join(', ')}.`,
      }),
      cacrNumero: f('string', { max: 40, classification: CLASSIFICATION.IDENTITE }),
      cacrDelivreLe: f('date', { classification: CLASSIFICATION.IDENTITE }),
      photo: f('object', {
        classification: CLASSIFICATION.IDENTITE,
        note:
          'Métadonnées seulement (nom, type, taille) : le POC ne conserve aucun ' +
          'fichier dans le navigateur.',
        champs: Object.freeze({
          nom: f('string', { max: 160, classification: CLASSIFICATION.IDENTITE }),
          type: f('string', { max: 60, classification: CLASSIFICATION.IDENTITE }),
          taille: f('integer', { min: 0, classification: CLASSIFICATION.IDENTITE }),
        }),
      }),
      actif: f('boolean', {
        note:
          'Absent ou vrai : le chauffeur fait partie de l’équipe. Faux : il est ' +
          'retiré, n’est plus proposé pour une nouvelle mission, et son historique ' +
          'est conservé.',
      }),
      retireLe: f('datetime'),
      dateDepart: f('date', { classification: CLASSIFICATION.IDENTITE }),
      motifRetrait: f('text', { max: 300, classification: CLASSIFICATION.IDENTITE }),
      mouvements: f('array', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Historique des retraits et réactivations, en ajout seul.',
        elements: Object.freeze({
          id: f('id', { requis: true }),
          type: f('enum', { valeurs: Object.freeze(['retrait', 'reactivation']) }),
          le: f('datetime', { requis: true }),
          dateEffet: f('date'),
          motif: f('text', { max: 300 }),
          parUtilisateurId: f('id'),
        }),
      }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      /* Lot b3 */
      {
        nom: 'retraitMotive',
        message: 'Le retrait d’un chauffeur porte une date de départ et un motif.',
        verifier: (c) => c.actif !== false || (Boolean(c.dateDepart) && Boolean(c.motifRetrait)),
      },
      {
        nom: 'categoriesPermisConnues',
        message: 'Les catégories de permis doivent appartenir à la liste A, B, C, D, E.',
        verifier: (c) =>
          c.permisCategories == null ||
          (Array.isArray(c.permisCategories) &&
            c.permisCategories.every((x) => Object.values(CATEGORIE_PERMIS).includes(x))),
      },
    ]),
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
      /* --- Lot b3 : modification et duplication (« partage ») d'une offre --- */
      modifieeLe: f('datetime'),
      modifieeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      dupliqueeDeOffreId: ref('offre', {
        requis: false,
        onDelete: 'detach',
        note: 'Offre d’origine quand celle-ci en est une copie ajustée.',
      }),
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
      motifCloture: f('enum', {
        valeurs: Object.freeze(Object.values(MOTIF_CLOTURE)),
        note:
          'Renseigné quand la plateforme, et non une partie, a clos l’appariement — ' +
          'aujourd’hui la seule expiration du délai (correctif anti-fraude n° 4).',
      }),
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

  credit: Object.freeze({
    collection: 'credits',
    proprietaire: 'groupementId',
    libelle: 'Crédit de compte saisi',
    legacy: 'RefOperation (paiement hors plateforme)',
    description:
      '**Correctif anti-fraude n° 5 — principe des quatre yeux.** Un crédit est ' +
      'd’abord saisi, sans effet sur le solde ; il ne devient un mouvement de compte ' +
      'qu’après validation par une AUTRE personne, qui confirme le rapprochement ' +
      'avec l’encaissement réel. Une même référence d’encaissement ne peut servir ' +
      'qu’une fois.',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, note: 'Format CR-AAAA-NNNN.' }),
      groupementId: ref('groupement', { classification: CLASSIFICATION.FINANCIER }),
      montant: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      referenceEncaissement: f('string', {
        requis: true,
        max: 60,
        classification: CLASSIFICATION.FINANCIER,
        note: 'Trace du paiement reçu hors plateforme. Unique parmi les crédits non rejetés.',
      }),
      etat: enumOf(ETAT_CREDIT, { classification: CLASSIFICATION.FINANCIER }),
      saisiLe: f('datetime', { requis: true, classification: CLASSIFICATION.FINANCIER }),
      saisiParUtilisateurId: ref('utilisateur', {
        onDelete: 'detach',
        classification: CLASSIFICATION.FINANCIER,
      }),
      valideLe: f('datetime', { classification: CLASSIFICATION.FINANCIER }),
      valideParUtilisateurId: ref('utilisateur', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.FINANCIER,
      }),
      rejeteLe: f('datetime', { classification: CLASSIFICATION.FINANCIER }),
      motifRejet: f('text', { classification: CLASSIFICATION.FINANCIER }),
      operationId: ref('operation', {
        requis: false,
        onDelete: 'restrict',
        classification: CLASSIFICATION.FINANCIER,
      }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'quatreYeux',
        message:
          'Un crédit est validé par une autre personne que celle qui l’a saisi : ' +
          'c’est ce qui empêche une personne seule de créditer un compte.',
        verifier: (c) =>
          c.etat !== ETAT_CREDIT.CREDITE ||
          (Boolean(c.valideParUtilisateurId) && c.valideParUtilisateurId !== c.saisiParUtilisateurId),
      },
      {
        nom: 'creditValideComptabilise',
        message: 'Un crédit validé porte le mouvement de compte qu’il a créé.',
        verifier: (c) => c.etat !== ETAT_CREDIT.CREDITE || Boolean(c.operationId && c.valideLe),
      },
      {
        nom: 'rejetCreditMotive',
        message: 'Un crédit rejeté porte son motif.',
        verifier: (c) => c.etat !== ETAT_CREDIT.REJETE || Boolean(c.motifRejet),
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
      // Lot b4 : une formule d'abonnement porte sa durée. Absente : service à l'acte.
      dureeMois: f('integer', {
        min: 1,
        max: 36,
        note: 'Durée ouverte par la formule. Seuls les tarifs qui la portent sont des formules d’abonnement.',
      }),
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
      // Lot b4 : chaque prolongation crée une nouvelle période, qui garde la
      // formule et le prix du jour où elle a été payée (aucune rétroactivité).
      tarifId: ref('tarif', { requis: false, onDelete: 'detach' }),
      dureeMois: f('integer', { min: 1, max: 36 }),
      prolongeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
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

  avis: Object.freeze({
    collection: 'avis',
    proprietaire: 'auteurGroupementId',
    libelle: 'Avis après transport',
    legacy: null,
    description:
      '**Correctif anti-fraude n° 2 — ajout du POC.** Après la clôture d’un ' +
      'transport, chaque partie note l’autre, une fois. Les avis ne se constituent ' +
      'que sur des transports conclus par la plateforme : c’est ce qui donne à un ' +
      'transporteur une raison de revenir plutôt que de traiter en direct. Aucun ' +
      'commentaire libre : il deviendrait un canal pour des coordonnées.',
    champs: Object.freeze({
      id: idPropre(),
      appariementId: ref('appariement'),
      auteurGroupementId: ref('groupement'),
      cibleGroupementId: ref('groupement'),
      note: f('integer', { requis: true, min: 1, max: 5 }),
      donneLe: f('datetime', { requis: true }),
      auteurUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'avisEntreDeuxParties',
        message: 'Un groupement ne se note pas lui-même.',
        verifier: (a) => a.auteurGroupementId !== a.cibleGroupementId,
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
      // --- Lot b2 : action d'un intermédiaire au nom de son mandant ---
      mandatId: ref('mandat', {
        requis: false,
        onDelete: 'detach',
        note:
          'Renseigné quand l’auteur est un intermédiaire agissant au nom du mandant : ' +
          '`groupementId` est alors celui du mandant.',
      }),
      intermediaireGroupementId: ref('groupement', { requis: false, onDelete: 'detach' }),
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

  /* ---------------------------------------------------------------- *
   * Lot b1 : dossier d'inscription, messagerie, récupération d'accès
   * ---------------------------------------------------------------- */

  piece: Object.freeze({
    collection: 'pieces_dossier',
    proprietaire: 'groupementId',
    libelle: 'Pièce du dossier d’inscription',
    legacy: 'document_compte',
    description:
      'Pièce justificative déposée par l’entreprise et contrôlée par l’agent ' +
      'd’activation. **Le POC ne stocke pas le fichier** : seules ses métadonnées ' +
      '(nom, type, taille, date) sont enregistrées.',
    champs: Object.freeze({
      id: idPropre(),
      groupementId: ref('groupement'),
      typePiece: f('enum', { requis: true, valeurs: Object.freeze(Object.keys(PIECES)) }),
      numero: f('string', { max: 60, classification: CLASSIFICATION.IDENTITE }),
      delivreeLe: f('date', { classification: CLASSIFICATION.IDENTITE }),
      expireLe: f('date', { classification: CLASSIFICATION.IDENTITE }),
      fichier: f('object', {
        requis: true,
        classification: CLASSIFICATION.IDENTITE,
        champs: Object.freeze({
          nom: f('string', { requis: true, max: 200, classification: CLASSIFICATION.IDENTITE }),
          type: f('string', { max: 100, classification: CLASSIFICATION.IDENTITE }),
          taille: f('number', { min: 0, classification: CLASSIFICATION.IDENTITE }),
        }),
      }),
      etat: enumOf(ETAT_PIECE),
      motif: f('text', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Commentaire du contrôle, visible de l’entreprise.',
      }),
      deposeLe: f('datetime', { requis: true }),
      deposeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      decideLe: f('datetime'),
      decideParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'nonConformeMotivee',
        message: 'Une pièce déclarée non conforme porte son motif.',
        verifier: (p) => p.etat !== ETAT_PIECE.NON_CONFORME || Boolean(p.motif),
      },
    ]),
  }),

  message: Object.freeze({
    collection: 'messages',
    proprietaire: 'destinataireGroupementId',
    libelle: 'Message sortant',
    legacy: 'mailing',
    description:
      'Courriel ou SMS adressé par la plateforme. **Simulé** : rien ne quitte le ' +
      'navigateur. Le message est déposé dans la boîte de réception simulée et ' +
      'reste consultable du destinataire et, sans l’adresse, de l’exploitant.',
    champs: Object.freeze({
      id: idPropre(),
      canal: enumOf(CANAL_MESSAGE),
      statut: enumOf(STATUT_MESSAGE),
      destinataireUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      destinataireGroupementId: ref('groupement', { requis: false, onDelete: 'detach' }),
      adresse: f('string', {
        max: 160,
        classification: CLASSIFICATION.CONTACT,
        note: 'Adresse ou numéro **enregistré** sur le compte, jamais une saisie de la demande.',
      }),
      objet: f('string', { requis: true, max: 160, classification: CLASSIFICATION.IDENTITE }),
      corps: f('text', { requis: true, classification: CLASSIFICATION.IDENTITE }),
      code: f('string', {
        classification: CLASSIFICATION.SYSTEME,
        note: 'Code à usage unique d’une récupération : servi à personne par la projection.',
      }),
      modele: f('string', { max: 60, note: 'Gabarit à l’origine du message.' }),
      envoiId: f('string', { max: 40, note: 'Regroupe les messages d’un même envoi groupé.' }),
      expediteurUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      expediteurRoleId: f('string', { max: 60 }),
      envoyeLe: f('datetime', { requis: true }),
      luLe: f('datetime'),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'messageRemisAdresse',
        message: 'Un message remis porte l’adresse ou le numéro enregistré du destinataire.',
        verifier: (m) => m.statut !== STATUT_MESSAGE.SIMULE || Boolean(m.adresse),
      },
    ]),
  }),

  reinitialisation: Object.freeze({
    collection: 'reinitialisations',
    proprietaire: null,
    libelle: 'Demande de récupération du mot de passe',
    legacy: 'jeton de forget_pwd',
    description:
      'Code à usage unique, de validité courte, envoyé à l’adresse enregistrée. ' +
      'Seule son empreinte est conservée. **La demande ne bloque pas le compte** : ' +
      'l’ancien mot de passe reste valable tant que le nouveau n’est pas défini.',
    champs: Object.freeze({
      id: idPropre(),
      utilisateurId: ref('utilisateur', { onDelete: 'cascade', classification: CLASSIFICATION.SYSTEME }),
      empreinte: f('object', { requis: true, classification: CLASSIFICATION.SYSTEME }),
      creeeLe: f('datetime', { requis: true }),
      expireLe: f('datetime', { requis: true }),
      tentatives: f('integer', { requis: true, min: 0 }),
      utiliseeLe: f('datetime'),
      invalideeLe: f('datetime'),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([]),
  }),

  /* ---------------------------------------------------------------- *
   * Lot b2 : organisation interne — le mandat d'intermédiaire
   * ---------------------------------------------------------------- */

  mandat: Object.freeze({
    collection: 'mandats',
    proprietaire: null,
    libelle: 'Mandat d’intermédiaire',
    legacy: 'rattachement auxiliaire (register_auxiliaire)',
    description:
      'Un affréteur ou un transporteur confie à une entreprise intermédiaire un ' +
      'périmètre d’actions, pour une période. Deux parties, comme l’appariement : ' +
      'le mandant désigne et retire, l’intermédiaire agit au nom du mandant.',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, note: 'Format MD-AAAA-NNNN.' }),
      mandantGroupementId: ref('groupement'),
      intermediaireGroupementId: ref('groupement'),
      typeMandant: enumOf(
        { AFFRETEUR: TYPE_GROUPEMENT.AFFRETEUR, TRANSPORTEUR: TYPE_GROUPEMENT.TRANSPORTEUR },
      ),
      perimetre: f('array', {
        requis: true,
        min: 1,
        classification: CLASSIFICATION.PUBLIC,
        note: 'Valeurs de PERIMETRE_MANDAT. Aucun sous-champ nominatif.',
      }),
      debuteLe: f('date', { requis: true }),
      finitLe: f('date', { requis: true }),
      etat: enumOf(ETAT_MANDAT),
      creeLe: f('datetime', { requis: true }),
      creeParUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      retireLe: f('datetime'),
      retireParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      motifRetrait: f('text'),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'mandatPartiesDistinctes',
        message: 'Une entreprise ne se désigne pas elle-même comme intermédiaire.',
        verifier: (m) => m.mandantGroupementId !== m.intermediaireGroupementId,
      },
      {
        nom: 'mandatPeriodeOrdonnee',
        message: 'La fin du mandat doit suivre son début.',
        verifier: (m) => String(m.finitLe) >= String(m.debuteLe),
      },
      {
        nom: 'mandatPerimetreConnu',
        message: 'Le périmètre d’un mandat ne porte que des valeurs connues.',
        verifier: (m) =>
          Array.isArray(m.perimetre) &&
          m.perimetre.length > 0 &&
          m.perimetre.every((p) => Object.values(PERIMETRE_MANDAT).includes(p)),
      },
      {
        nom: 'mandatRetraitDate',
        message: 'Un mandat retiré porte la date de son retrait.',
        verifier: (m) => m.etat !== ETAT_MANDAT.RETIRE || Boolean(m.retireLe),
      },
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * Lot b3 : attestation de bourse de fret et contrôle sur route
   * ---------------------------------------------------------------- */

  attestation: Object.freeze({
    collection: 'attestations',
    proprietaire: 'groupementTransporteurId',
    libelle: 'Attestation de bourse de fret',
    legacy: 'vue/transporteur/docattbdefret.php (PDF à QR code)',
    description:
      'Document imprimable émis pour une mise en relation validée et payée. Le QR ' +
      'code pointe vers une page publique de vérification par un **jeton non ' +
      'devinable**, jamais par l’identifiant ni la référence. Les données de contrôle ' +
      'sont figées à l’émission.',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, note: 'Format ABF-AAAA-NNNN.' }),
      appariementId: ref('appariement'),
      groupementTransporteurId: ref('groupement'),
      groupementAffreteurId: ref('groupement'),
      jeton: f('string', {
        requis: true,
        unique: true,
        classification: CLASSIFICATION.SYSTEME,
        note:
          'Aléa de 120 bits. Jamais projeté : seul le service le rend au ' +
          'transporteur titulaire, pour l’impression.',
      }),
      immatriculation: f('string', { requis: true, max: 24, classification: CLASSIFICATION.IDENTITE }),
      localiteDepartId: ref('referentiel'),
      localiteArriveeId: ref('referentiel'),
      departPrevu: f('datetime', { requis: true }),
      arriveePrevue: f('datetime', { requis: true }),
      valableJusquau: f('datetime', { requis: true }),
      etat: f('enum', {
        requis: true,
        valeurs: Object.freeze([ETAT_ATTESTATION.EN_VIGUEUR, ETAT_ATTESTATION.ANNULEE]),
        note: 'L’expiration se calcule à la lecture, d’après `valableJusquau`.',
      }),
      genereeLe: f('datetime', { requis: true }),
      genereeParUtilisateurId: ref('utilisateur', { onDelete: 'detach' }),
      annuleeLe: f('datetime'),
      annuleeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      motifAnnulation: f('text', { max: 300 }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'validiteApresDepart',
        message: 'La fin de validité de l’attestation doit suivre le départ prévu.',
        verifier: (a) => new Date(a.valableJusquau) > new Date(a.departPrevu),
      },
      {
        nom: 'annulationMotivee',
        message: 'Une attestation annulée porte un motif.',
        verifier: (a) => a.etat !== ETAT_ATTESTATION.ANNULEE || Boolean(a.motifAnnulation),
      },
    ]),
  }),

  controle: Object.freeze({
    collection: 'controles',
    proprietaire: null,
    libelle: 'Vérification sur route',
    legacy: 'vue/check/document.php (journalisation des vérifications)',
    appendOnly: true,
    description:
      'Une ligne par vérification d’attestation, quel qu’en soit le verdict — code ' +
      'inconnu compris. **En ajout seul.** L’agent retrouve les siennes ; le journal ' +
      'd’audit en garde une copie pour la supervision.',
    champs: Object.freeze({
      id: idPropre(),
      horodatage: f('datetime', { requis: true }),
      agentUtilisateurId: ref('utilisateur', {
        requis: false,
        onDelete: 'detach',
        note: 'Absent pour une vérification faite depuis la page publique.',
      }),
      mode: enumOf(MODE_CONTROLE),
      resultat: enumOf(RESULTAT_CONTROLE),
      attestationId: ref('attestation', { requis: false, onDelete: 'detach' }),
      attestationReference: f('string', { max: 24 }),
      immatriculation: f('string', { max: 24, classification: CLASSIFICATION.IDENTITE }),
      lieu: f('string', { max: 120 }),
      observation: f('text', { max: 300 }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([]),
  }),

  /* ---------------------------------------------------------------- *
   * Lot b4 : abonnements, paiements, caisse et finances
   * ---------------------------------------------------------------- */

  paiement: Object.freeze({
    collection: 'paiements',
    proprietaire: 'groupementId',
    libelle: 'Paiement',
    legacy: 'Paiement en ligne (CinetPay) et opération de caisse',
    description:
      'Tout argent reçu par la plateforme, quel qu’en soit le canal : paiement en ligne ' +
      '(mobile money ou carte, **simulés**), débit du compte prépayé, ou encaissement au ' +
      'guichet. Chaque paiement porte un numéro de reçu séquentiel. Un paiement en ligne ' +
      'réussi est encaissé d’emblée — la transaction de l’opérateur fait foi ; un ' +
      'encaissement au guichet est saisi par un agent puis validé par une autre personne.',
    champs: Object.freeze({
      id: idPropre(),
      numero: f('string', {
        requis: true,
        unique: true,
        max: 20,
        classification: CLASSIFICATION.FINANCIER,
        note: 'Numéro de reçu RC-AAAA-NNNN, séquentiel dans l’année.',
      }),
      groupementId: ref('groupement', { classification: CLASSIFICATION.FINANCIER }),
      objet: enumOf(OBJET_PAIEMENT, { classification: CLASSIFICATION.FINANCIER }),
      canal: enumOf(CANAL_PAIEMENT, { classification: CLASSIFICATION.FINANCIER }),
      mode: enumOf(MODE_PAIEMENT, { classification: CLASSIFICATION.FINANCIER }),
      operateur: f('enum', {
        valeurs: Object.freeze(Object.values(OPERATEUR_MOBILE)),
        classification: CLASSIFICATION.FINANCIER,
      }),
      numeroPayeur: f('string', {
        max: 20,
        classification: CLASSIFICATION.CONTACT,
        note: 'Numéro de mobile money débité. Coordonnée : jamais servie à l’exploitant.',
      }),
      referenceTransaction: f('string', {
        max: 60,
        classification: CLASSIFICATION.FINANCIER,
        note: 'Référence rendue par l’opérateur, ou numéro de chèque ou de virement.',
      }),
      montant: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      devise: f('string', { requis: true, max: 8 }),
      detail: f('string', { requis: true, max: 160, classification: CLASSIFICATION.FINANCIER }),
      tarifId: ref('tarif', { requis: false, onDelete: 'detach', classification: CLASSIFICATION.FINANCIER }),
      dureeMois: f('integer', { min: 1, max: 36, classification: CLASSIFICATION.FINANCIER }),
      abonnementId: ref('abonnement', { requis: false, onDelete: 'detach', classification: CLASSIFICATION.FINANCIER }),
      operationId: ref('operation', { requis: false, onDelete: 'restrict', classification: CLASSIFICATION.FINANCIER }),
      creditId: ref('credit', { requis: false, onDelete: 'restrict', classification: CLASSIFICATION.FINANCIER }),
      contentieuxId: ref('contentieux', { requis: false, onDelete: 'restrict', classification: CLASSIFICATION.FINANCIER }),
      etat: enumOf(ETAT_PAIEMENT, { classification: CLASSIFICATION.FINANCIER }),
      saisiLe: f('datetime', { requis: true, classification: CLASSIFICATION.FINANCIER }),
      saisiParUtilisateurId: ref('utilisateur', { onDelete: 'detach', classification: CLASSIFICATION.FINANCIER }),
      valideLe: f('datetime', { classification: CLASSIFICATION.FINANCIER }),
      valideParUtilisateurId: ref('utilisateur', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.FINANCIER,
      }),
      rejeteLe: f('datetime', { classification: CLASSIFICATION.FINANCIER }),
      motifRejet: f('text', { classification: CLASSIFICATION.FINANCIER }),
      impressions: f('integer', {
        min: 0,
        classification: CLASSIFICATION.FINANCIER,
        note: 'Nombre de reçus édités : à partir du deuxième, le reçu porte « Duplicata ».',
      }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'montantPaiementPositif',
        message: 'Un paiement de zéro n’est pas un paiement.',
        verifier: (p) => p.montant > 0,
      },
      {
        nom: 'modeCompatibleAvecLeCanal',
        message: 'Ce mode de paiement n’est pas ouvert à ce canal.',
        verifier: (p) => (MODES_PAR_CANAL[p.canal] ?? []).includes(p.mode),
      },
      {
        nom: 'quatreYeuxAuGuichet',
        message:
          'Un encaissement au guichet est validé par une autre personne que celle qui l’a saisi.',
        verifier: (p) =>
          p.canal !== CANAL_PAIEMENT.GUICHET ||
          p.etat !== ETAT_PAIEMENT.ENCAISSE ||
          (Boolean(p.valideParUtilisateurId) && p.valideParUtilisateurId !== p.saisiParUtilisateurId),
      },
      {
        nom: 'paiementEnLigneTrace',
        message:
          'Un paiement en ligne porte la référence de transaction de l’opérateur, ou le mouvement de compte qu’il a débité.',
        verifier: (p) =>
          p.canal !== CANAL_PAIEMENT.EN_LIGNE ||
          (p.mode === MODE_PAIEMENT.DEBIT_COMPTE ? Boolean(p.operationId) : Boolean(p.referenceTransaction)),
      },
      {
        nom: 'pieceDeReglement',
        message: 'Hors espèces, un encaissement au guichet porte la référence de sa pièce (chèque, virement, transaction).',
        verifier: (p) =>
          p.canal !== CANAL_PAIEMENT.GUICHET || p.mode === MODE_PAIEMENT.ESPECES || Boolean(p.referenceTransaction),
      },
      {
        nom: 'abonnementPorteSaFormule',
        message: 'Le paiement d’un abonnement porte la formule choisie et sa durée.',
        verifier: (p) => p.objet !== OBJET_PAIEMENT.ABONNEMENT || Boolean(p.tarifId && p.dureeMois),
      },
      {
        nom: 'rechargementAuGuichetPorteSonCredit',
        message: 'Un rechargement au guichet passe par un crédit saisi, validé en quatre yeux.',
        verifier: (p) =>
          p.objet !== OBJET_PAIEMENT.RECHARGEMENT || p.canal !== CANAL_PAIEMENT.GUICHET || Boolean(p.creditId),
      },
      {
        nom: 'reglementRattacheAUnContentieux',
        message: 'Le règlement d’un contentieux se rattache à son dossier.',
        verifier: (p) => p.objet !== OBJET_PAIEMENT.CONTENTIEUX || Boolean(p.contentieuxId),
      },
      {
        nom: 'rejetPaiementMotive',
        message: 'Un encaissement rejeté porte son motif.',
        verifier: (p) => p.etat !== ETAT_PAIEMENT.REJETE || Boolean(p.motifRejet),
      },
    ]),
  }),

  revisionTarif: Object.freeze({
    collection: 'revisions_tarifs',
    proprietaire: null,
    libelle: 'Modification de tarif',
    legacy: 'Historisation de Fiche_prix (register_tarif_modif)',
    description:
      'Historique des modifications du catalogue, avec leur **date d’effet**. Une ' +
      'modification future est programmée et s’applique à sa date ; elle ne touche ' +
      'jamais une période d’abonnement déjà payée, qui garde son montant et sa durée.',
    champs: Object.freeze({
      id: idPropre(),
      tarifId: ref('tarif'),
      montantAvant: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      montantApres: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      dureeMoisAvant: f('integer', { min: 1, max: 36 }),
      dureeMoisApres: f('integer', { min: 1, max: 36 }),
      effetLe: f('date', { requis: true }),
      motif: f('text', { requis: true, max: 300 }),
      etat: enumOf(ETAT_REVISION),
      creeLe: f('datetime', { requis: true }),
      auteurUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      appliqueeLe: f('datetime'),
      annuleeLe: f('datetime'),
      annuleeParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'revisionAppliqueeDatee',
        message: 'Une modification en vigueur porte la date à laquelle elle a été appliquée.',
        verifier: (r) => r.etat !== ETAT_REVISION.APPLIQUEE || Boolean(r.appliqueeLe),
      },
    ]),
  }),

  contentieux: Object.freeze({
    collection: 'contentieux',
    proprietaire: 'groupementId',
    libelle: 'Contentieux',
    legacy: 'Contentieux (allcontentieux.php, listeContentieux.php)',
    description:
      'Litige ou impayé suivi par le service contentieux : parties, objet, montant en ' +
      'jeu, pièces (métadonnées seulement) et étapes jusqu’à la clôture. Chaque étape ' +
      'est datée, signée et journalisée ; les règlements encaissés à la caisse s’y imputent.',
    champs: Object.freeze({
      id: idPropre(),
      reference: f('string', { requis: true, unique: true, max: 20, note: 'Format CT-AAAA-NNNN.' }),
      groupementId: ref('groupement', { classification: CLASSIFICATION.IDENTITE }),
      partieAdverseGroupementId: ref('groupement', {
        requis: false,
        onDelete: 'detach',
        classification: CLASSIFICATION.IDENTITE,
      }),
      appariementId: ref('appariement', { requis: false, onDelete: 'detach' }),
      nature: enumOf(NATURE_CONTENTIEUX),
      objet: f('text', { requis: true, max: 600, classification: CLASSIFICATION.IDENTITE }),
      montant: f('number', { requis: true, min: 0, classification: CLASSIFICATION.FINANCIER }),
      montantRegle: f('number', { min: 0, classification: CLASSIFICATION.FINANCIER }),
      etape: enumOf(ETAPE_CONTENTIEUX),
      issue: f('enum', { valeurs: Object.freeze(Object.values(ISSUE_CONTENTIEUX)) }),
      pieces: f('array', {
        classification: CLASSIFICATION.IDENTITE,
        note: 'Métadonnées des pièces versées au dossier : le fichier lui-même n’est pas conservé.',
        elements: Object.freeze({
          nom: f('string', { requis: true, max: 160, classification: CLASSIFICATION.IDENTITE }),
          type: f('string', { max: 80 }),
          taille: f('integer', { min: 0 }),
          ajouteLe: f('datetime'),
          ajouteParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
        }),
      }),
      historique: f('array', {
        classification: CLASSIFICATION.IDENTITE,
        elements: Object.freeze({
          etape: enumOf(ETAPE_CONTENTIEUX),
          le: f('datetime', { requis: true }),
          parUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
          commentaire: f('text', { max: 600, classification: CLASSIFICATION.IDENTITE }),
        }),
      }),
      ouvertLe: f('datetime', { requis: true }),
      ouvertParUtilisateurId: ref('utilisateur', { requis: false, onDelete: 'detach' }),
      closLe: f('datetime'),
      demo: f('boolean', { requis: true }),
    }),
    invariants: Object.freeze([
      {
        nom: 'contentieuxClosPorteSonIssue',
        message: 'Un contentieux clos porte son issue et sa date de clôture.',
        verifier: (c) => c.etape !== ETAPE_CONTENTIEUX.CLOS || Boolean(c.issue && c.closLe),
      },
      {
        nom: 'contentieuxHistorise',
        message: 'Un contentieux porte l’historique de ses étapes, à commencer par son ouverture.',
        verifier: (c) => Array.isArray(c.historique) && c.historique.length > 0,
      },
      {
        nom: 'reglementSansExces',
        message: 'Les règlements imputés ne dépassent pas le montant en jeu.',
        verifier: (c) => (c.montantRegle ?? 0) <= c.montant,
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
