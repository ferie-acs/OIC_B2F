/**
 * Inscription des entreprises — configuration pure (lot b1).
 *
 * **Le formulaire d'inscription est piloté par cette configuration** : une liste
 * de types d'entreprise, et pour chacun ses champs propres et ses pièces
 * requises. Ajouter un type (par exemple un commissionnaire en douane) revient à
 * ajouter une entrée ici, une valeur dans `TYPE_GROUPEMENT` et son libellé : ni
 * l'écran d'inscription, ni le dossier, ni la file de l'agent d'activation ne
 * sont à réécrire.
 *
 * Aucune entrée-sortie : ce module se teste par table et se transpose tel quel
 * côté serveur, comme le reste de `domain/`.
 *
 * @module domain/inscription
 */

import { ETAT_INSCRIPTION, ETAT_PIECE, PIECE_DOSSIER, TYPE_GROUPEMENT } from './enums.js';

/* ================================================================== *
 * 1. Pièces justificatives
 * ================================================================== */

/**
 * Catalogue des pièces. Les trois pièces du dossier transporteur reprennent les
 * codes de `PIECE_DOSSIER` : la vérification existante et l'inscription parlent
 * de la même chose.
 * @type {Readonly<Record<string, Readonly<{libelle: string, aide: string, echeance: boolean}>>>}
 */
export const PIECES = Object.freeze({
  [PIECE_DOSSIER.RCCM]: Object.freeze({
    libelle: 'Registre du commerce (RCCM)',
    aide: 'Extrait du registre du commerce et du crédit mobilier de l’entreprise.',
    echeance: false,
  }),
  attestation_fiscale: Object.freeze({
    libelle: 'Déclaration fiscale d’existence',
    aide: 'Document attestant le compte contribuable de l’entreprise.',
    echeance: false,
  }),
  carte_chargeur: Object.freeze({
    libelle: 'Carte de chargeur',
    aide: 'Carte de chargeur délivrée par l’Office Ivoirien des Chargeurs.',
    echeance: true,
  }),
  [PIECE_DOSSIER.CARTE_TRANSPORTEUR]: Object.freeze({
    libelle: 'Carte de transporteur',
    aide: 'Carte de transporteur en cours de validité.',
    echeance: true,
  }),
  [PIECE_DOSSIER.ASSURANCE]: Object.freeze({
    libelle: 'Attestation d’assurance des marchandises transportées',
    aide: 'Attestation d’assurance couvrant les marchandises transportées.',
    echeance: true,
  }),
  agrement_intermediaire: Object.freeze({
    libelle: 'Agrément d’intermédiaire de fret',
    aide: 'Agrément d’auxiliaire ou d’intermédiaire de transport en cours de validité.',
    echeance: true,
  }),
});

/* ================================================================== *
 * 2. Champs du formulaire
 * ================================================================== */

/**
 * @typedef {object} ChampInscription
 * @property {string} nom       Nom du champ, tel qu'enregistré.
 * @property {string} libelle
 * @property {string} [type]    Type de saisie (`text`, `email`, `tel`, `date`, `password`, `select`).
 * @property {boolean} [requis]
 * @property {string} [aide]
 * @property {string} [famille] Pour un `select` : famille de référentiel proposée.
 * @property {number} [max]
 * @property {'groupement'|'utilisateur'} cible  Où la valeur est enregistrée.
 * @property {boolean} [identite] Donnée d'identité : après activation, sa
 *   modification repasse par le contrôle de l'agent d'activation.
 */

/** Champs communs à toute entreprise, dans l'ordre d'affichage. @type {ReadonlyArray<ChampInscription>} */
export const CHAMPS_ENTREPRISE = Object.freeze([
  { nom: 'raisonSociale', libelle: 'Raison sociale', requis: true, max: 160, cible: 'groupement', identite: true },
  { nom: 'rccm', libelle: 'Numéro RCCM', requis: true, max: 40, cible: 'groupement', identite: true,
    aide: 'Tel qu’il figure sur l’extrait du registre du commerce.' },
  { nom: 'compteContribuable', libelle: 'Compte contribuable', requis: true, max: 40, cible: 'groupement', identite: true },
  { nom: 'pays', libelle: 'Pays', requis: true, max: 60, cible: 'groupement', identite: true },
  { nom: 'localiteId', libelle: 'Ville', type: 'select', famille: 'localites', requis: true, cible: 'groupement', identite: true },
  { nom: 'adresse', libelle: 'Adresse', requis: true, max: 300, cible: 'groupement' },
  { nom: 'contactTelephone', libelle: 'Téléphone de l’entreprise', type: 'tel', requis: true, max: 32, cible: 'groupement' },
  { nom: 'contactEmail', libelle: 'Adresse électronique de l’entreprise', type: 'email', requis: true, max: 160, cible: 'groupement' },
].map(Object.freeze));

/** Champs du responsable, qui devient le premier utilisateur du compte. @type {ReadonlyArray<ChampInscription>} */
export const CHAMPS_RESPONSABLE = Object.freeze([
  { nom: 'nom', libelle: 'Nom du responsable', requis: true, max: 80, cible: 'utilisateur' },
  { nom: 'prenom', libelle: 'Prénoms', requis: true, max: 80, cible: 'utilisateur' },
  { nom: 'fonction', libelle: 'Fonction', requis: false, max: 80, cible: 'utilisateur' },
  { nom: 'telephone', libelle: 'Téléphone mobile', type: 'tel', requis: true, max: 32, cible: 'utilisateur',
    aide: 'Il recevra les messages SMS de la plateforme.' },
  { nom: 'email', libelle: 'Adresse électronique de connexion', type: 'email', requis: true, max: 160, cible: 'utilisateur',
    aide: 'Elle sert d’identifiant. Le code de récupération du mot de passe y sera envoyé.' },
].map(Object.freeze));

/**
 * @typedef {object} TypeInscription
 * @property {string} type           Valeur de `TYPE_GROUPEMENT`.
 * @property {string} libelle
 * @property {string} pluriel
 * @property {string} description
 * @property {string} icone          Icône Lucide du sprite.
 * @property {string} role           Rôle attribué au responsable inscrit.
 * @property {string} roleAuxiliaire Rôle d'un sous-compte de ce type (requalification).
 * @property {ReadonlyArray<string>} agents Rôles d'agent d'activation qui traitent ce type.
 * @property {ReadonlyArray<ChampInscription>} champs Champs propres au type.
 * @property {ReadonlyArray<string>} piecesRequises
 * @property {ReadonlyArray<string>} piecesFacultatives
 */

/**
 * Les types d'entreprise ouverts à l'inscription.
 *
 * **Intermédiaire de fret.** Le système existant inscrit l'auxiliaire comme un
 * groupement dont l'utilisateur porte `id_user_grp = 3`. Son responsable reçoit
 * le rôle `intermediaire` (lot b2) : une entreprise à part entière, désignée par
 * des mandants au nom desquels elle agit dans le périmètre de chaque mandat, sans
 * jamais valider — la validation engage les finances du mandant.
 *
 * @type {ReadonlyArray<Readonly<TypeInscription>>}
 */
export const TYPES_INSCRIPTION = Object.freeze([
  {
    type: TYPE_GROUPEMENT.AFFRETEUR,
    libelle: 'Affréteur (chargeur)',
    pluriel: 'Affréteurs (chargeurs)',
    description: 'Vous avez des marchandises à faire transporter.',
    icone: 'package',
    role: 'affreteur',
    roleAuxiliaire: 'auxiliaire_affreteur',
    agents: ['activation_inscription_affreteur'],
    champs: [
      { nom: 'carteChargeurNumero', libelle: 'Numéro de carte de chargeur', requis: true, max: 40, cible: 'groupement', identite: true },
    ],
    piecesRequises: [PIECE_DOSSIER.RCCM, 'attestation_fiscale', 'carte_chargeur'],
    piecesFacultatives: [],
  },
  {
    type: TYPE_GROUPEMENT.TRANSPORTEUR,
    libelle: 'Transporteur',
    pluriel: 'Transporteurs',
    description: 'Vous disposez de véhicules et transportez des marchandises.',
    icone: 'truck',
    role: 'transporteur',
    roleAuxiliaire: 'auxiliaire_transporteur',
    agents: ['activation_inscription'],
    champs: [
      { nom: 'carteTransporteurNumero', libelle: 'Numéro de carte de transporteur', requis: true, max: 40, cible: 'groupement', identite: true },
      { nom: 'carteTransporteurEcheance', libelle: 'Carte de transporteur valable jusqu’au', type: 'date', requis: true, cible: 'groupement', identite: true },
    ],
    piecesRequises: [PIECE_DOSSIER.RCCM, PIECE_DOSSIER.CARTE_TRANSPORTEUR, PIECE_DOSSIER.ASSURANCE],
    piecesFacultatives: ['attestation_fiscale'],
  },
  {
    type: TYPE_GROUPEMENT.INTERMEDIAIRE,
    libelle: 'Intermédiaire de fret',
    pluriel: 'Intermédiaires de fret',
    description: 'Vous organisez le transport pour le compte de chargeurs.',
    icone: 'handshake',
    // Intégration b1 / b2 : rôles de l'entreprise intermédiaire.
    role: 'intermediaire',
    roleAuxiliaire: 'collaborateur_intermediaire',
    agents: ['activation_inscription_affreteur'],
    champs: [
      { nom: 'agrementNumero', libelle: 'Numéro d’agrément d’intermédiaire', requis: true, max: 40, cible: 'groupement', identite: true },
      { nom: 'agrementEcheance', libelle: 'Agrément valable jusqu’au', type: 'date', requis: true, cible: 'groupement', identite: true },
    ],
    piecesRequises: [PIECE_DOSSIER.RCCM, 'attestation_fiscale', 'agrement_intermediaire'],
    piecesFacultatives: [],
  },
].map((t) => Object.freeze({ ...t, champs: Object.freeze(t.champs.map(Object.freeze)) })));

/**
 * Définition d'un type d'inscription.
 * @param {string} type
 * @returns {Readonly<TypeInscription>}
 * @throws {Error} Si le type n'est pas ouvert à l'inscription.
 */
export function typeInscription(type) {
  const t = TYPES_INSCRIPTION.find((x) => x.type === type);
  if (!t) throw new Error('Ce type d’entreprise n’est pas ouvert à l’inscription.');
  return t;
}

/** Le type est-il ouvert à l'inscription ? @param {string} type */
export function estTypeInscriptible(type) {
  return TYPES_INSCRIPTION.some((x) => x.type === type);
}

/**
 * Pièces d'un type : obligatoires d'abord.
 * @param {string} type
 * @returns {Array<{code: string, requise: boolean, libelle: string, aide: string, echeance: boolean}>}
 */
export function piecesDuType(type) {
  const t = typeInscription(type);
  return [
    ...t.piecesRequises.map((code) => ({ code, requise: true, ...PIECES[code] })),
    ...t.piecesFacultatives.map((code) => ({ code, requise: false, ...PIECES[code] })),
  ];
}

/** Libellé d'une pièce. @param {string} code */
export function libellePiece(code) {
  return PIECES[code]?.libelle ?? 'Pièce';
}

/**
 * Noms des champs d'identité d'un type — ceux dont la modification après
 * activation repasse par le contrôle.
 * @param {string} type
 * @returns {string[]}
 */
export function champsIdentite(type) {
  return [...CHAMPS_ENTREPRISE, ...typeInscription(type).champs]
    .filter((c) => c.identite)
    .map((c) => c.nom);
}

/**
 * Tous les champs d'identité propres à un type, tous types confondus — ce qu'une
 * requalification doit compléter.
 * @returns {string[]}
 */
export function champsPropresDeTousLesTypes() {
  return TYPES_INSCRIPTION.flatMap((t) => t.champs.map((c) => c.nom));
}

/**
 * Le rôle d'agent traite-t-il ce type d'entreprise ?
 * @param {string} roleId
 * @param {string} type
 * @returns {boolean}
 */
export function agentTraiteType(roleId, type) {
  const t = TYPES_INSCRIPTION.find((x) => x.type === type);
  return Boolean(t?.agents.includes(roleId));
}

/**
 * Types qu'un agent d'activation traite.
 * @param {string} roleId
 * @returns {string[]}
 */
export function typesTraitesPar(roleId) {
  return TYPES_INSCRIPTION.filter((t) => t.agents.includes(roleId)).map((t) => t.type);
}

/**
 * Rôle d'un utilisateur après requalification de son entreprise : le responsable
 * prend le rôle principal du nouveau type, un sous-compte le rôle auxiliaire.
 * @param {string} roleId Rôle actuel.
 * @param {string} ancienType
 * @param {string} nouveauType
 * @returns {string}
 */
export function roleApresRequalification(roleId, ancienType, nouveauType) {
  const avant = typeInscription(ancienType);
  const apres = typeInscription(nouveauType);
  return roleId === avant.role ? apres.role : apres.roleAuxiliaire;
}

/* ================================================================== *
 * 3. État du dossier
 * ================================================================== */

/**
 * État d'inscription effectif d'un groupement. Absent vaut « activée » : un
 * groupement antérieur à l'inscription en ligne a été créé actif.
 * @param {Record<string, any>|null|undefined} groupement
 * @returns {string}
 */
export function etatInscription(groupement) {
  return groupement?.inscriptionEtat ?? ETAT_INSCRIPTION.ACTIVEE;
}

/**
 * Pièce courante de chaque type pour un dossier : la plus récente non remplacée.
 * @param {ReadonlyArray<Record<string, any>>} pieces Pièces du groupement.
 * @returns {Map<string, Record<string, any>>}
 */
export function piecesCourantes(pieces) {
  /** @type {Map<string, Record<string, any>>} */
  const parType = new Map();
  for (const p of [...pieces].sort((a, b) => new Date(a.deposeLe) - new Date(b.deposeLe))) {
    if (p.etat === ETAT_PIECE.REMPLACEE) continue;
    parType.set(p.typePiece, p);
  }
  return parType;
}

/**
 * Bilan du dossier : pièces obligatoires manquantes, à contrôler, non conformes.
 * **L'activation n'est possible que si ce bilan est vide** : chaque pièce
 * obligatoire est déposée et déclarée conforme.
 *
 * @param {string} type
 * @param {ReadonlyArray<Record<string, any>>} pieces
 * @returns {{manquantes: string[], aControler: string[], nonConformes: string[], conformes: string[], complet: boolean}}
 */
export function bilanDossier(type, pieces) {
  const courantes = piecesCourantes(pieces);
  const requises = typeInscription(type).piecesRequises;
  const manquantes = requises.filter((c) => !courantes.has(c));
  const aControler = requises.filter((c) => courantes.get(c)?.etat === ETAT_PIECE.DEPOSEE);
  const nonConformes = requises.filter((c) => courantes.get(c)?.etat === ETAT_PIECE.NON_CONFORME);
  const conformes = requises.filter((c) => courantes.get(c)?.etat === ETAT_PIECE.CONFORME);
  return { manquantes, aControler, nonConformes, conformes, complet: conformes.length === requises.length };
}

/* ================================================================== *
 * 4. Mot de passe et récupération
 * ================================================================== */

/** Règles de la récupération de mot de passe. */
export const RECUPERATION = Object.freeze({
  /** Durée de validité du code à usage unique. */
  VALIDITE_MINUTES: 15,
  /** Au-delà, le code est invalidé : il faut en redemander un. */
  TENTATIVES_MAX: 5,
  /** Longueur du code envoyé. */
  LONGUEUR_CODE: 6,
});

/** Longueur minimale d'un mot de passe (règle du système existant : 8). */
export const LONGUEUR_MIN_MOT_DE_PASSE = 8;

/**
 * Motif de refus d'un mot de passe, ou `null` s'il est acceptable.
 * @param {string} motDePasse
 * @param {string} [confirmation]
 * @returns {string|null}
 */
export function motifMotDePasse(motDePasse, confirmation) {
  const m = String(motDePasse ?? '');
  if (m.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return `Le mot de passe doit compter au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`;
  }
  if (!/[A-Za-zÀ-ÿ]/.test(m) || !/\d/.test(m)) {
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  }
  if (confirmation !== undefined && m !== String(confirmation)) {
    return 'La confirmation ne correspond pas au mot de passe saisi.';
  }
  return null;
}

/* ================================================================== *
 * 5. Code d'entreprise
 * ================================================================== */

/**
 * Code d'entreprise attribué à l'activation (« code BFCI » du système existant).
 * @param {number} annee
 * @param {number} rang Rang d'activation dans l'année, à partir de 1.
 * @returns {string} Ex. `BFCI-2026-00012`.
 */
export function codeBfci(annee, rang) {
  return `BFCI-${annee}-${String(rang).padStart(5, '0')}`;
}

/**
 * Période d'abonnement initiale : un an à compter du jour d'activation.
 * @param {Date} jour
 * @returns {{debuteLe: string, finitLe: string}} Dates ISO sans heure.
 */
export function periodeInitiale(jour) {
  const debut = new Date(Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate()));
  const fin = new Date(debut);
  fin.setUTCFullYear(fin.getUTCFullYear() + 1);
  fin.setUTCDate(fin.getUTCDate() - 1);
  return { debuteLe: debut.toISOString().slice(0, 10), finitLe: fin.toISOString().slice(0, 10) };
}
