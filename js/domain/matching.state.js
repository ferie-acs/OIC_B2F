/**
 * Machine à états de l'appariement — **le mécanisme unique**.
 *
 * ## Pourquoi ce fichier existe
 *
 * Le système existant porte **trois mécanismes d'appariement concurrents**
 * (cadrage § 3.3) : `OffreVehicule.reponse_affeteur`, `OffreVehicule.
 * reponse_transporteur` et la table `OffreDemande` avec son propre `etat` —
 * vestiges d'une refonte non terminée. Le POC n'en implémente qu'un, et c'est
 * l'écart délibéré n° 1 du cadrage.
 *
 * Ce module est **pur** : aucune lecture, aucune écriture, aucune dépendance au
 * stockage. Il prend un état et un contexte métier, il rend une décision. Cette
 * pureté n'est pas une élégance gratuite : c'est ce qui permet de tester la règle
 * exhaustivement, y compris les combinaisons qu'une démonstration ne joue jamais.
 *
 * ## Le partage des responsabilités
 *
 * | Ici (`matching.state.js`)        | Là (`services/matching.service.js`, J3) |
 * |----------------------------------|-----------------------------------------|
 * | Transitions autorisées           | Lecture des soldes et des tarifs        |
 * | Qui a le droit d'agir            | Écriture des deux mouvements            |
 * | Gardes et motifs de refus        | Atomicité du commit                     |
 * | Aucun effet de bord              | Journal d'audit, notifications          |
 *
 * Aucune vue, aucun autre service ne modifie un état d'appariement (`M4.5`).
 *
 * @module domain/matching.state
 */

import { ETAT_APPARIEMENT, SENS_APPARIEMENT } from './enums.js';

/**
 * Les actions possibles sur un appariement.
 * @readonly
 * @enum {string}
 */
export const ACTION = Object.freeze({
  /** Crée l'appariement. Sens A : l'affréteur réserve. Sens B : le transporteur propose. */
  ENGAGER: 'engager',
  /** Le répondeur accepte. Aucun débit à ce stade. */
  ACCEPTER: 'accepter',
  /** Le répondeur refuse. Motif obligatoire. Terminal. */
  REJETER: 'rejeter',
  /** L'une des parties se retire avant validation. Terminal. */
  ANNULER: 'annuler',
  /** L'affréteur valide. **Déclenche le double débit.** Terminal et irréversible. */
  VALIDER: 'valider',
});

/**
 * Rôle fonctionnel d'une partie dans un appariement — distinct du rôle applicatif.
 * @readonly
 * @enum {string}
 */
export const PARTIE = Object.freeze({
  AFFRETEUR: 'affreteur',
  TRANSPORTEUR: 'transporteur',
  /** L'une ou l'autre des deux parties. */
  LES_DEUX: 'les_deux',
  /** Celle qui a créé l'appariement — dépend du sens. */
  INITIATEUR: 'initiateur',
  /** Celle qui doit répondre — dépend du sens. */
  REPONDEUR: 'repondeur',
});

/**
 * Gardes déclaratives. Chacune porte son message : un refus doit expliquer, pas
 * seulement refuser (décision D32).
 *
 * Chaque garde est une fonction pure du contexte métier fourni par le service.
 * Une garde qui ne peut pas être évaluée — donnée manquante dans le contexte —
 * **échoue**. Elle ne passe jamais par défaut : une vérification de solde qu'on
 * ne sait pas faire n'est pas une vérification réussie.
 *
 * @type {Readonly<Record<string, {message: (c: ContexteMetier) => string, verifier: (c: ContexteMetier) => boolean}>>}
 */
export const GARDES = Object.freeze({
  motifFourni: {
    message: () =>
      "Un rejet doit porter un motif : l'affréteur a besoin de savoir pourquoi " +
      'pour chercher un autre véhicule.',
    verifier: (c) => Boolean(c.motifRejet),
  },

  offreTenable: {
    message: () =>
      "L'offre de véhicule n'est plus disponible : elle a été retirée ou engagée " +
      'sur un autre transport.',
    verifier: (c) => c.offreDisponible === true,
  },

  demandeTenable: {
    message: () => "La demande de transport a été annulée ou a déjà donné lieu à une validation.",
    verifier: (c) => c.demandeOuverte === true,
  },

  fenetreRecouvrante: {
    message: () =>
      "La fenêtre de disponibilité du véhicule ne recouvre plus la fenêtre de la " +
      'demande de transport.',
    verifier: (c) => c.fenetreRecouvrante === true,
  },

  soldeAffreteurSuffisant: {
    // Symétrique de la garde ci-dessous (finding S6) : le solde de l'affréteur
    // n'est chiffré qu'à l'affréteur. La validation étant son acte, c'est le cas
    // courant — mais le transporteur consulte les mêmes états depuis son espace.
    message: (c) =>
      c.destinataire === POV_TRANSPORTEUR
        ? `La mise en relation est en attente : le compte de l'affréteur n'est pas ` +
          `suffisamment provisionné. Votre acceptation reste valable et votre ` +
          `véhicule reste engagé jusqu'à sa régularisation.`
        : `Validation impossible — solde insuffisant. Votre compte` +
          `${c.nomAffreteur ? ` (${c.nomAffreteur})` : ''} affiche ` +
          `${fmt(c.soldeAffreteur)} et les frais s'élèvent à ${fmt(c.fraisAffreteur)}. ` +
          `Il manque ${fmt(manque(c.soldeAffreteur, c.fraisAffreteur))}. Faites ` +
          `créditer le compte auprès du concessionnaire, puis revenez valider. ` +
          `La réservation reste acquise.`,
    verifier: (c) =>
      typeof c.soldeAffreteur === 'number' &&
      typeof c.fraisAffreteur === 'number' &&
      c.soldeAffreteur >= c.fraisAffreteur,
  },

  soldeTransporteurSuffisant: {
    // Finding S6. Le message unique livrait à l'affréteur le solde exact du
    // compte prépayé du transporteur, sa raison sociale et son déficit — alors
    // que `compte.lire` est accordé en portée GROUPEMENT et lui refuse ce compte.
    // La matrice refusait, le message de refus accordait.
    //
    // Le détail chiffré n'est servi qu'au transporteur, qui est chez lui. Côté
    // affréteur, ni montant ni écart : l'écart, ajouté au tarif public du
    // catalogue, reconstituerait le solde.
    message: (c) =>
      c.destinataire === POV_TRANSPORTEUR
        ? `Validation bloquée — votre solde est insuffisant. Votre compte affiche ` +
          `${fmt(c.soldeTransporteur)} et les frais s'élèvent à ` +
          `${fmt(c.fraisTransporteur)}. Il manque ` +
          `${fmt(manque(c.soldeTransporteur, c.fraisTransporteur))}. Faites créditer ` +
          `votre compte auprès du concessionnaire : l'affréteur ne peut pas valider ` +
          `tant que ce n'est pas fait.`
        : `Validation impossible — le compte de la contrepartie n'est pas ` +
          `suffisamment provisionné. La mise en relation reprendra dès qu'il le ` +
          `sera ; le transporteur en a été informé. Votre réservation reste acquise ` +
          `et aucun montant ne vous a été débité.`,
    verifier: (c) =>
      typeof c.soldeTransporteur === 'number' &&
      typeof c.fraisTransporteur === 'number' &&
      c.soldeTransporteur >= c.fraisTransporteur,
  },
});

/** Point de vue du transporteur, pour le choix des messages. Voir `enums.js`. */
const POV_TRANSPORTEUR = 'transporteur';

/**
 * @typedef {object} ContexteMetier
 * @property {string} [motifRejet]
 * @property {boolean} [offreDisponible]
 * @property {boolean} [demandeOuverte]
 * @property {boolean} [fenetreRecouvrante]
 * @property {number} [soldeAffreteur]
 * @property {number} [soldeTransporteur]
 * @property {number} [fraisAffreteur]
 * @property {number} [fraisTransporteur]
 * @property {string} [nomAffreteur]
 * @property {string} [nomTransporteur]
 * @property {string} [devise]
 * @property {string} [destinataire]
 *   Point de vue à qui le refus sera montré (`POV` de `enums.js`). Détermine le
 *   niveau de détail financier : un solde n'est chiffré qu'à son titulaire
 *   (finding S6). Absent, le message le plus discret est servi — ne pas savoir à
 *   qui l'on parle n'autorise pas à tout dire.
 */

/**
 * @typedef {object} Transition
 * @property {string|null} depuis   `null` = création de l'appariement.
 * @property {string} action
 * @property {string} vers
 * @property {string} partie        Qui a le droit d'agir. Voir {@link PARTIE}.
 * @property {string} droit         Droit requis dans la matrice.
 * @property {string[]} gardes      Clés de {@link GARDES}, toutes exigées.
 * @property {boolean} [financiere] La transition entraîne des écritures de compte.
 */

/**
 * Table des transitions. **Rien d'autre ne fait autorité.**
 *
 * Ce qui n'y figure pas est interdit : il n'existe aucun chemin de retour depuis
 * un état terminal, aucune réouverture d'un appariement validé, aucun saut de
 * `reserver` à `valider`.
 *
 * @type {ReadonlyArray<Readonly<Transition>>}
 */
export const TRANSITIONS = Object.freeze([
  Object.freeze({
    depuis: null,
    action: ACTION.ENGAGER,
    vers: ETAT_APPARIEMENT.RESERVER,
    partie: PARTIE.INITIATEUR,
    droit: 'appariement.reserver',
    gardes: ['offreTenable', 'demandeTenable', 'fenetreRecouvrante'],
  }),
  Object.freeze({
    depuis: ETAT_APPARIEMENT.RESERVER,
    action: ACTION.ACCEPTER,
    vers: ETAT_APPARIEMENT.ACCEPTER,
    partie: PARTIE.REPONDEUR,
    droit: 'appariement.repondre',
    gardes: ['offreTenable', 'demandeTenable'],
  }),
  Object.freeze({
    depuis: ETAT_APPARIEMENT.RESERVER,
    action: ACTION.REJETER,
    vers: ETAT_APPARIEMENT.REJETER,
    partie: PARTIE.REPONDEUR,
    droit: 'appariement.repondre',
    gardes: ['motifFourni'],
  }),
  Object.freeze({
    depuis: ETAT_APPARIEMENT.RESERVER,
    action: ACTION.ANNULER,
    vers: ETAT_APPARIEMENT.ANNULER,
    partie: PARTIE.LES_DEUX,
    droit: 'appariement.annuler',
    gardes: [],
  }),
  Object.freeze({
    depuis: ETAT_APPARIEMENT.ACCEPTER,
    action: ACTION.ANNULER,
    vers: ETAT_APPARIEMENT.ANNULER,
    partie: PARTIE.LES_DEUX,
    droit: 'appariement.annuler',
    gardes: [],
  }),
  Object.freeze({
    depuis: ETAT_APPARIEMENT.ACCEPTER,
    action: ACTION.VALIDER,
    vers: ETAT_APPARIEMENT.VALIDER,
    // **Toujours l'affréteur**, quel que soit le sens du flux. Le système existant
    // porte cette valeur dans `reponse_affeteur` : c'est lui qui engage la relation.
    partie: PARTIE.AFFRETEUR,
    droit: 'appariement.valider',
    gardes: [
      'offreTenable',
      'demandeTenable',
      'soldeAffreteurSuffisant',
      'soldeTransporteurSuffisant',
    ],
    financiere: true,
  }),
]);

/** États depuis lesquels plus aucune transition n'est possible. */
export const ETATS_TERMINAUX = Object.freeze([
  ETAT_APPARIEMENT.REJETER,
  ETAT_APPARIEMENT.ANNULER,
  ETAT_APPARIEMENT.VALIDER,
]);

/**
 * @typedef {object} Evaluation
 * @property {boolean} possible
 * @property {string|null} vers          État atteint si la transition est appliquée.
 * @property {boolean} financiere        La transition entraîne des écritures de compte.
 * @property {string|null} droitRequis
 * @property {string[]} refus            Messages affichables. Vide si `possible`.
 * @property {string[]} gardesEnEchec    Noms des gardes, pour les tests et le journal.
 */

/**
 * Évalue une transition. Ne l'applique pas : ce module n'écrit rien.
 *
 * Les gardes sont **toutes** évaluées, même après un premier échec. Motif : le
 * cas « les deux soldes sont insuffisants » doit se lire d'un coup à l'écran, et
 * non se découvrir une partie après l'autre — voir la spécification B.8, qui
 * impose d'afficher les deux lignes du registre dans tous les cas.
 *
 * @param {string|null} etatCourant  `null` pour une création.
 * @param {string} action            Voir {@link ACTION}.
 * @param {ContexteMetier} [contexte]
 * @returns {Evaluation}
 */
export function evaluerTransition(etatCourant, action, contexte = {}) {
  const t = TRANSITIONS.find((x) => x.depuis === etatCourant && x.action === action);

  if (!t) {
    return Object.freeze({
      possible: false,
      vers: null,
      financiere: false,
      droitRequis: null,
      refus: [messageTransitionImpossible(etatCourant, action)],
      gardesEnEchec: [],
    });
  }

  const gardesEnEchec = t.gardes.filter((nom) => !GARDES[nom].verifier(contexte));
  const refus = gardesEnEchec.map((nom) => GARDES[nom].message(contexte));

  return Object.freeze({
    possible: gardesEnEchec.length === 0,
    vers: t.vers,
    financiere: t.financiere === true,
    droitRequis: t.droit,
    refus: Object.freeze(refus),
    gardesEnEchec: Object.freeze(gardesEnEchec),
  });
}

/**
 * Indique quelle partie a le droit d'exercer une action, le sens étant connu.
 *
 * @param {string} action
 * @param {string} sens Voir `SENS_APPARIEMENT`.
 * @returns {string|null} `PARTIE.AFFRETEUR`, `PARTIE.TRANSPORTEUR`, `PARTIE.LES_DEUX`, ou `null`.
 */
export function partieHabilitee(action, sens) {
  const t = TRANSITIONS.find((x) => x.action === action);
  if (!t) return null;

  const sensA = sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE;
  switch (t.partie) {
    case PARTIE.INITIATEUR:
      return sensA ? PARTIE.AFFRETEUR : PARTIE.TRANSPORTEUR;
    case PARTIE.REPONDEUR:
      return sensA ? PARTIE.TRANSPORTEUR : PARTIE.AFFRETEUR;
    default:
      return t.partie;
  }
}

/**
 * Droit requis pour engager un appariement dans un sens donné.
 *
 * En sens A l'affréteur réserve une offre publiée ; en sens B le transporteur
 * propose un véhicule sur une demande publiée. Deux droits distincts, pour que
 * la matrice puisse ouvrir l'un sans l'autre — c'est ainsi que le transporteur
 * privé, qui ne publie pas d'offre, peut néanmoins répondre aux demandes.
 *
 * @param {string} sens
 * @returns {string}
 */
export function droitPourEngager(sens) {
  return sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE
    ? 'appariement.reserver'
    : 'appariement.proposer';
}

/**
 * Actions offertes depuis un état donné. Sert à construire les boutons — y compris
 * ceux qui seront désactivés avec leur explication (décision D32).
 * @param {string|null} etatCourant
 * @returns {string[]}
 */
export function actionsDepuis(etatCourant) {
  return TRANSITIONS.filter((t) => t.depuis === etatCourant).map((t) => t.action);
}

/**
 * Indique si un état n'admet plus aucune transition.
 * @param {string} etat
 * @returns {boolean}
 */
export function estTerminal(etat) {
  return ETATS_TERMINAUX.includes(etat);
}

/* ------------------------------------------------------------------ *
 * Utilitaires internes
 * ------------------------------------------------------------------ */

/**
 * Message d'une transition inexistante. Il doit apprendre la règle, pas seulement
 * constater l'échec.
 * @param {string|null} etat
 * @param {string} action
 * @returns {string}
 */
function messageTransitionImpossible(etat, action) {
  if (etat === ETAT_APPARIEMENT.VALIDER) {
    return (
      'Cette mise en relation a été validée : les deux comptes ont été débités et ' +
      'les coordonnées transmises. Elle ne peut plus être modifiée. Pour ' +
      'interrompre le transport, signalez un incident.'
    );
  }
  if (etat === ETAT_APPARIEMENT.REJETER) {
    return 'Cette réservation a été rejetée par le transporteur. Cherchez un autre véhicule.';
  }
  if (etat === ETAT_APPARIEMENT.ANNULER) {
    return 'Cette réservation a été annulée.';
  }
  if (etat === ETAT_APPARIEMENT.RESERVER && action === ACTION.VALIDER) {
    return (
      "La validation n'est possible qu'après l'acceptation du transporteur. " +
      "Votre réservation lui a été transmise ; vous serez averti de sa réponse."
    );
  }
  return `L'action « ${action} » n'est pas possible sur une mise en relation à l'état « ${etat ?? 'initial'} ».`;
}

/**
 * Formate un montant. Le POC travaille en franc CFA, sans décimale.
 * @param {number|undefined} n
 * @returns {string}
 */
function fmt(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'un montant indéterminé';
  return `${n.toLocaleString('fr-FR')} F CFA`;
}

/**
 * Écart entre des frais et un solde.
 * @param {number|undefined} solde
 * @param {number|undefined} frais
 * @returns {number|undefined}
 */
function manque(solde, frais) {
  if (typeof solde !== 'number' || typeof frais !== 'number') return undefined;
  return Math.max(0, frais - solde);
}
