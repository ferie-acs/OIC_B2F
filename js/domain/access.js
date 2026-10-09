/**
 * Moteur de décision d'accès — combine la matrice des droits et le contexte.
 *
 * La matrice (`permissions.js`) dit ce qui est permis **en principe**. Ce module
 * dit ce qui est permis **maintenant**, pour cet utilisateur, sur cet objet. Il
 * porte les trois règles qui dépendent de l'état et qu'aucune table statique ne
 * peut exprimer :
 *
 * 1. Un abonnement expiré ferme l'accès (M10.2).
 * 2. Les coordonnées d'un tiers ne sont libérées qu'après `valider`.
 * 3. Le cloisonnement par groupement s'applique à chaque objet lu.
 *
 * ## Une décision, jamais un booléen
 *
 * `decider()` rend toujours un objet motivé. Deux exigences s'en servent, et
 * c'est ce qui justifie de ne pas rendre un simple `true`/`false` :
 *
 * - **Sécurité** : la décision est prise en un point unique, traçable, testable.
 * - **Interface** : une action interdite est désactivée **et expliquée**, jamais
 *   masquée (décision D32). Un bouton absent se lit comme un défaut du logiciel ;
 *   un bouton désactivé avec son motif enseigne la règle — ce qu'un POC dont
 *   l'objet est de démontrer un cloisonnement doit précisément faire.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il empêche le code applicatif de construire une réponse non autorisée. Dans un
 * POC sans serveur, il ne protège rien contre l'ouverture des outils de
 * développement : LocalStorage reste lisible par le porteur du navigateur. Cette
 * limite est écrite au README et rappelée en démonstration — voir
 * `plan-suivi.md` § 8.
 *
 * @module domain/access
 */

import { ETAT_APPARIEMENT } from './enums.js';
import { CLASSIFICATION, entite } from './schema.js';
import { ROLES, role } from './roles.js';
import {
  ACTION,
  PARTIE,
  TRANSITIONS,
  droitPourEngager,
  partieHabilitee,
} from './matching.state.js';
import {
  DROITS,
  PORTEE,
  peutLireClassification,
  porteeDe,
} from './permissions.js';

/**
 * Motifs de refus. Le code sert aux tests et au journal ; le message va à l'écran.
 * @readonly
 * @enum {string}
 */
export const MOTIF_REFUS = Object.freeze({
  DROIT_ABSENT: 'droit_absent',
  HORS_PERIMETRE: 'hors_perimetre',
  NON_PUBLIE: 'non_publie',
  ABONNEMENT_EXPIRE: 'abonnement_expire',
  COMPTE_SUSPENDU: 'compte_suspendu',
  COORDONNEES_NON_LIBEREES: 'coordonnees_non_liberees',
  PARTIE_NON_HABILITEE: 'partie_non_habilitee',
});

/**
 * @typedef {object} Contexte
 * @property {string} utilisateurId
 * @property {string} roleId
 * @property {string|null} groupementId      `null` pour un rôle institutionnel.
 * @property {boolean} compteActif
 * @property {boolean} abonnementActif       Sans objet si le rôle n'y est pas soumis.
 * @property {ReadonlySet<string>} [objetsLiberes]
 *   Clés `entite:id` des objets tiers précis dont les coordonnées sont libérées,
 *   parce qu'un appariement à l'état `valider` les met en relation avec cet
 *   utilisateur. Produit par {@link liberationsDe} — une fonction pure de ce
 *   module, et non une responsabilité laissée à l'appelant (finding S11).
 */

/**
 * @typedef {object} Decision
 * @property {boolean} autorise
 * @property {string} portee           Portée retenue ; `PORTEE.AUCUNE` si refus.
 * @property {string|null} motif       Voir {@link MOTIF_REFUS}. `null` si autorisé.
 * @property {string} explication      Phrase affichable telle quelle.
 */

/** @type {Decision} */
const AUTORISE = Object.freeze({
  autorise: true,
  portee: PORTEE.AUCUNE,
  motif: null,
  explication: '',
});

/**
 * @param {string} motif
 * @param {string} explication
 * @returns {Decision}
 */
const refus = (motif, explication) =>
  Object.freeze({ autorise: false, portee: PORTEE.AUCUNE, motif, explication });

/**
 * @param {string} portee
 * @returns {Decision}
 */
const accord = (portee) => Object.freeze({ ...AUTORISE, portee });

/**
 * Droits qui restent accessibles à un utilisateur dont l'abonnement a expiré.
 * Le système existant redirige vers le réabonnement et ferme tout le reste ; le
 * POC reproduit ce comportement, en laissant de quoi comprendre et agir.
 */
const DROITS_HORS_ABONNEMENT = Object.freeze(
  new Set(['abonnement.lire', 'notification.lire', 'groupement.lire']),
);

/**
 * Décide si un utilisateur peut exercer un droit, éventuellement sur un objet.
 *
 * @param {Contexte} ctx
 * @param {string} droit Clé du catalogue `DROITS`.
 * @param {{groupementId?: string|null, utilisateurId?: string|null}} [cible]
 *   Objet visé, confronté à la portée accordée : `groupementId` pour la portée
 *   `GROUPEMENT`, `utilisateurId` (le destinataire) pour la portée `PROPRE`.
 *   Omis, la décision ne porte que sur le droit lui-même — utile pour afficher ou
 *   non une entrée de menu.
 * @returns {Decision}
 * @throws {Error} Si le rôle ou le droit n'est pas déclaré.
 */
export function decider(ctx, droit, cible = undefined) {
  const r = role(ctx.roleId); // lève si le rôle est inconnu
  if (!DROITS[droit]) {
    throw new Error(`Droit inconnu : « ${droit} ». Voir js/domain/permissions.js.`);
  }

  if (!ctx.compteActif) {
    return refus(
      MOTIF_REFUS.COMPTE_SUSPENDU,
      'Votre compte est suspendu. Contactez le concessionnaire pour le rétablir.',
    );
  }

  if (r.soumisAbonnement && !ctx.abonnementActif && !DROITS_HORS_ABONNEMENT.has(droit)) {
    return refus(
      MOTIF_REFUS.ABONNEMENT_EXPIRE,
      "L'abonnement de votre groupement a expiré. Renouvelez-le pour retrouver " +
        "l'accès à cette fonctionnalité.",
    );
  }

  const portee = porteeDe(ctx.roleId, droit);
  if (portee === PORTEE.AUCUNE) {
    // Correctif QA-05. Le message nommait le droit manquant — exact, mais
    // inutile : l'utilisateur sait ce qu'il vient de tenter, pas pourquoi on le
    // lui refuse. Quand le catalogue porte une raison métier, c'est elle qu'on
    // sert ; le nom du droit reste en repli pour les cas qui n'en ont pas.
    const raison = DROITS[droit].refus;
    return refus(
      MOTIF_REFUS.DROIT_ABSENT,
      raison
        ? `${raison} (Rôle « ${r.libelle} ».)`
        : `Le rôle « ${r.libelle} » ne dispose pas du droit « ${DROITS[droit].libelle} ».`,
    );
  }

  if (cible === undefined) return accord(portee);

  if (portee === PORTEE.TOUT) return accord(portee);

  if (portee === PORTEE.PROPRE) {
    // Le rattachement personnel prime : un rôle institutionnel n'a pas de
    // groupement, et un collègue du même groupement n'est pas le destinataire.
    return cible.utilisateurId != null && cible.utilisateurId === ctx.utilisateurId
      ? accord(portee)
      : refus(MOTIF_REFUS.HORS_PERIMETRE, "Cet élément ne vous est pas destiné.");
  }

  const memeGroupement = cible.groupementId != null && cible.groupementId === ctx.groupementId;
  if (memeGroupement) return accord(portee);

  if (portee === PORTEE.MARCHE) {
    // Finding S7. La portée accordait auparavant sur TOUT objet d'un tiers, sans
    // jamais consulter d'état de publication : `MARCHE` valait « tous les objets
    // de tout le monde », et le cloisonnement reposait sur un filtrage que chaque
    // écran devait refaire — la façon habituelle de fabriquer une fuite.
    // Une cible qui ne porte pas l'information échoue, comme les gardes de
    // `matching.state.js` : ne pas savoir n'est pas une autorisation.
    if (cible.publie === true) return accord(portee);
    return refus(
      MOTIF_REFUS.NON_PUBLIE,
      cible.publie === undefined
        ? "L'état de publication de cet élément n'a pas été fourni : il ne peut pas " +
          'être servi au titre du marché.'
        : "Cet élément n'est pas publié sur le marché.",
    );
  }

  return refus(
    MOTIF_REFUS.HORS_PERIMETRE,
    'Cet élément appartient à un autre groupement que le vôtre.',
  );
}

/**
 * Variante levante, pour les services. Un refus non traité doit interrompre le
 * traitement, jamais le laisser continuer sur des données partielles.
 *
 * **La cible est obligatoire sur un droit mutant** (finding S8). Elle était
 * facultative, et `exiger(ctx, 'appariement.valider')` sans cible rendait un feu
 * vert sur le droit qui déclenche deux écritures financières et la transmission
 * des coordonnées. L'oubli était silencieux — le genre d'oubli qu'on fait à 18 h.
 * Pour le cas légitime « puis-je afficher cette entrée de menu ? », utiliser
 * {@link peutAfficher}, dont le nom dit qu'on ne va rien écrire.
 *
 * @param {Contexte} ctx
 * @param {string} droit
 * @param {{groupementId?: string|null, utilisateurId?: string|null, publie?: boolean}} cible
 * @returns {Decision}
 * @throws {Error} Enrichie du motif, pour le journal d'audit.
 */
export function exiger(ctx, droit, cible = undefined) {
  if (DROITS[droit]?.mutation === true && cible === undefined) {
    throw new Error(
      `Appel incorrect : « ${droit} » modifie des données, sa cible est obligatoire. ` +
        'Sans cible, le cloisonnement par groupement n’est pas vérifié. ' +
        'Pour un test d’affichage, utilisez peutAfficher().',
    );
  }
  const d = decider(ctx, droit, cible);
  if (!d.autorise) {
    const err = new Error(`Accès refusé (${droit}) : ${d.explication}`);
    // @ts-expect-error propriétés de diagnostic attachées volontairement
    err.motif = d.motif;
    // @ts-expect-error
    err.droit = droit;
    throw err;
  }
  return d;
}

/**
 * Le rôle dispose-t-il de ce droit, en principe ? Sert à construire menus et
 * boutons — y compris ceux qui seront désactivés avec leur explication (D32).
 *
 * Ne vérifie **aucun** cloisonnement par objet : son nom le dit, et c'est ce qui
 * la rend impropre à autoriser une écriture.
 *
 * @param {Contexte} ctx
 * @param {string} droit
 * @returns {Decision}
 */
export function peutAfficher(ctx, droit) {
  return decider(ctx, droit);
}

/**
 * Décide d'une action sur un appariement — l'entité centrale du POC.
 *
 * Finding S9. Le contrat générique ne savait pas exprimer un objet à **deux
 * propriétaires** : `decider()` compare un unique `cible.groupementId` à celui du
 * contexte, si bien que l'appelant passait « le sien » et que le contrôle devenait
 * tautologique. Par ailleurs `partieHabilitee()` savait qui a le droit d'agir selon
 * le sens du flux, mais personne ne l'appelait : rien ne vérifiait qu'un
 * transporteur ne valide pas à la place de l'affréteur — seule la matrice l'en
 * empêchait, ce qui est une protection et non un contrôle.
 *
 * Trois vérifications, dans cet ordre :
 * 1. l'utilisateur est **l'une des deux parties** de cet appariement ;
 * 2. sa partie est celle que la machine à états habilite pour cette action ;
 * 3. son rôle détient le droit correspondant.
 *
 * @param {Contexte} ctx
 * @param {string} action Voir `ACTION` de `matching.state.js`.
 * @param {{id?: string, sens: string, groupementAffreteurId: string, groupementTransporteurId: string}} appariement
 * @returns {Decision}
 */
export function deciderSurAppariement(ctx, action, appariement) {
  const estAffreteur = appariement.groupementAffreteurId === ctx.groupementId;
  const estTransporteur = appariement.groupementTransporteurId === ctx.groupementId;

  if (!estAffreteur && !estTransporteur) {
    return refus(
      MOTIF_REFUS.HORS_PERIMETRE,
      "Cette mise en relation ne concerne pas votre groupement.",
    );
  }

  const habilitee = partieHabilitee(action, appariement.sens);
  if (habilitee === null) {
    return refus(
      MOTIF_REFUS.PARTIE_NON_HABILITEE,
      `L'action « ${action} » n'existe pas sur une mise en relation.`,
    );
  }

  const maPartie = estAffreteur ? PARTIE.AFFRETEUR : PARTIE.TRANSPORTEUR;
  if (habilitee !== PARTIE.LES_DEUX && habilitee !== maPartie) {
    return refus(
      MOTIF_REFUS.PARTIE_NON_HABILITEE,
      estAffreteur
        ? "Cette action revient au transporteur. Vous serez averti de sa réponse."
        : "Cette action revient à l'affréteur.",
    );
  }

  const droit = action === ACTION.ENGAGER ? droitPourEngager(appariement.sens) : droitDe(action);
  return decider(ctx, droit, { groupementId: ctx.groupementId });
}

/**
 * Droit requis par une action d'appariement, lu dans la table des transitions.
 * @param {string} action
 * @returns {string}
 */
function droitDe(action) {
  const t = TRANSITIONS.find((x) => x.action === action);
  if (!t) throw new Error(`Action d'appariement inconnue : « ${action} ».`);
  return t.droit;
}

/* ================================================================== *
 * Projection — le verrou des coordonnées et des montants
 * ================================================================== */

/**
 * Décide si un champ de classification `contact` peut être servi.
 *
 * Quatre conditions cumulatives. Deux d'entre elles corrigent des findings de
 * l'audit de sécurité du 24/09 et méritent qu'on dise ce qu'elles changent :
 *
 * - **Le droit `coordonnees.lire` est réellement consulté** (finding S2). Il ne
 *   l'était pas : la fonction ne regardait que la classification. Les sept rôles
 *   ayant `contact` ouvert ayant aussi ce droit, la coïncidence masquait le
 *   découplage — et décocher la case dans l'écran « Utilisateurs et rôles » (M1.6)
 *   n'aurait rien fermé. Une matrice administrable qui ne gouverne pas est pire
 *   qu'une matrice figée.
 * - **La libération est bornée à l'objet précis** (finding S3), et non au
 *   groupement entier. Auparavant, une seule mise en relation validée avec le
 *   transporteur T libérait *tout* objet de T — véhicules jamais proposés,
 *   chauffeurs jamais affectés, offres futures. C'était une fuite de données
 *   personnelles et un contournement du modèle économique : la plateforme vend
 *   une mise en relation, pas l'annuaire d'un transporteur.
 *
 * **La transmission des coordonnées EST la mise en relation** : c'est ce que la
 * plateforme vend. Les servir plus tôt, ou plus largement, revient à la donner.
 *
 * @param {Contexte} ctx
 * @param {string} cleObjet Clé `entite:id` de l'objet racine porteur du champ.
 * @param {string|null|undefined} groupementProprietaire
 * @returns {boolean}
 */
function contactLibere(ctx, cleObjet, groupementProprietaire) {
  // 1. Le droit, réellement interrogé — finding S2.
  if (!decider(ctx, 'coordonnees.lire').autorise) return false;
  // 2. La classification, second verrou indépendant de la matrice.
  if (!peutLireClassification(ctx.roleId, CLASSIFICATION.CONTACT)) return false;
  // 3. Propriétaire inconnu : rien n'est libéré. Deviner ici serait une fuite.
  if (groupementProprietaire == null) return false;
  // 4. Ses propres coordonnées, toujours ; celles d'un tiers, objet par objet.
  if (groupementProprietaire === ctx.groupementId) return true;
  return Boolean(ctx.objetsLiberes?.has(cleObjet));
}

/**
 * Projette une entité selon ce que le rôle a le droit de recevoir.
 *
 * Les champs non autorisés sont **absents de l'objet rendu**, pas mis à `null` et
 * pas masqués en CSS : une valeur présente dans la mémoire d'une vue est une
 * valeur qui finira par s'afficher, dans un export, un journal ou une infobulle.
 *
 * @param {Contexte} ctx
 * @param {string} nomEntite   Nom déclaré dans `schema.js`.
 * @param {Record<string, unknown>} objet
 * @param {{proprietaireId?: string|null}} [options]
 *   Groupement propriétaire des coordonnées portées par l'objet. À défaut, il est
 *   lu dans le champ que l'entité **déclare** comme porteur du propriétaire
 *   (`proprietaire` dans `schema.js`) — `id` pour un groupement, `groupementId`
 *   pour ce qui lui appartient. Une entité qui n'en déclare aucun (un appariement,
 *   qui a deux parties ; un transport, qui n'en porte pas) exige que l'appelant
 *   le fournisse : **sans propriétaire connu, aucune coordonnée n'est libérée.**
 *   Deviner ici, et deviner mal, serait une fuite silencieuse.
 * @returns {Record<string, unknown>} Nouvel objet, sans les champs refusés.
 */
export function projeter(ctx, nomEntite, objet, options = {}) {
  const def = entite(nomEntite);
  const proprietaire =
    options.proprietaireId !== undefined
      ? options.proprietaireId
      : def.proprietaire
        ? /** @type {string|null|undefined} */ (objet[def.proprietaire])
        : null;

  const cleObjet = `${nomEntite}:${objet.id ?? ''}`;
  return projeterStructure(ctx, def.champs, objet, cleObjet, proprietaire);
}

/**
 * Projette une structure, en descendant dans les conteneurs.
 *
 * **La récursion est le correctif du finding S1.** La projection filtrait au
 * premier niveau seulement : trois champs conteneurs (`dut.donnees`,
 * `transport.journal`, `notification.corps`) traversaient donc les deux verrous
 * sans être examinés, livrant au concessionnaire et à la DGTTC les coordonnées
 * que la matrice leur refuse. Une règle appliquée à un champ sur quatre n'est pas
 * une règle.
 *
 * Un conteneur qui ne déclare pas de sous-structure est servi tel quel : c'est
 * pourquoi `schema.js` **refuse au chargement** tout conteneur sans classification
 * explicite. Les deux garde-fous sont complémentaires.
 *
 * @param {Contexte} ctx
 * @param {Record<string, any>} champs Définition des champs de ce niveau.
 * @param {Record<string, unknown>} objet
 * @param {string} cleObjet Clé de l'objet racine — la libération se juge sur lui.
 * @param {string|null|undefined} proprietaire
 * @returns {Record<string, unknown>}
 */
function projeterStructure(ctx, champs, objet, cleObjet, proprietaire) {
  /** @type {Record<string, unknown>} */
  const sortie = {};

  for (const [nom, valeur] of Object.entries(objet)) {
    const d = champs[nom];
    // Un champ absent du schéma n'est jamais servi : ce qui n'est pas déclaré
    // n'est pas modélisé, et ne doit pas se glisser dans une réponse.
    if (!d) continue;

    const c = d.classification;
    if (c === CLASSIFICATION.SYSTEME) continue;
    if (c === CLASSIFICATION.CONTACT && !contactLibere(ctx, cleObjet, proprietaire)) continue;
    if (!peutLireClassification(ctx.roleId, c)) continue;

    if (d.champs && valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)) {
      const sousProprietaire = d.proprietaire
        ? /** @type {any} */ (valeur)[d.proprietaire]
        : proprietaire;
      sortie[nom] = projeterStructure(
        ctx,
        d.champs,
        /** @type {Record<string, unknown>} */ (valeur),
        cleObjet,
        sousProprietaire,
      );
      continue;
    }

    if (d.elements && Array.isArray(valeur)) {
      // Chaque élément peut appartenir à un groupement différent — un journal de
      // transport mêle les événements des deux parties. L'observation de l'un ne
      // se libère donc pas parce que l'autre a validé.
      sortie[nom] = valeur.map((el) =>
        el !== null && typeof el === 'object'
          ? projeterStructure(
              ctx,
              d.elements,
              el,
              cleObjet,
              d.proprietaire ? el[d.proprietaire] : proprietaire,
            )
          : el,
      );
      continue;
    }

    sortie[nom] = valeur;
  }

  return sortie;
}

/**
 * Calcule les objets dont les coordonnées sont libérées pour un groupement.
 *
 * **Cette fonction est le verrou le plus sensible du POC, et elle vit ici.**
 * Le contrat initial laissait ce calcul à l'appelant : seuls les tests
 * fabriquaient l'ensemble à la main, et le code réel aurait fini dans le service
 * d'appariement, hors du périmètre audité (finding S11). Une règle dont personne
 * ne possède l'implémentation est une règle qui n'existe pas.
 *
 * **Ce qui est libéré, et rien de plus** — pour chaque appariement à l'état
 * `valider` impliquant ce groupement :
 *
 * | Objet | Motif |
 * |---|---|
 * | le groupement de la contrepartie | ses coordonnées commerciales |
 * | l'offre appariée | le chauffeur pressenti qu'elle porte |
 * | le véhicule de cette offre | carte grise |
 * | le chauffeur pressenti de cette offre | nom, permis, téléphone |
 * | l'appariement et son transport | observations du journal |
 *
 * Tout le reste du parc et du personnel de la contrepartie reste fermé. La
 * plateforme vend une mise en relation, pas un annuaire (finding S3).
 *
 * @param {object} entrees
 * @param {string|null} entrees.groupementId Groupement de l'utilisateur.
 * @param {ReadonlyArray<Record<string, any>>} entrees.appariements
 * @param {ReadonlyArray<Record<string, any>>} [entrees.offres]
 *   Offres connues, pour remonter au véhicule et au chauffeur. Une offre absente
 *   ne libère que ce qui est déductible de l'appariement seul — jamais davantage.
 * @param {ReadonlyArray<Record<string, any>>} [entrees.transports]
 * @returns {ReadonlySet<string>} Clés `entite:id`.
 */
export function liberationsDe({ groupementId, appariements, offres = [], transports = [] }) {
  /** @type {Set<string>} */
  const liberes = new Set();
  if (groupementId == null) return liberes;

  const offreParId = new Map(offres.map((o) => [o.id, o]));
  const transportParAppariement = new Map(transports.map((t) => [t.appariementId, t]));

  for (const a of appariements) {
    if (a.etat !== ETAT_APPARIEMENT.VALIDER) continue;

    const estAffreteur = a.groupementAffreteurId === groupementId;
    const estTransporteur = a.groupementTransporteurId === groupementId;
    if (!estAffreteur && !estTransporteur) continue;

    const contrepartie = estAffreteur ? a.groupementTransporteurId : a.groupementAffreteurId;
    liberes.add(`groupement:${contrepartie}`);
    liberes.add(`appariement:${a.id}`);

    const transport = transportParAppariement.get(a.id);
    if (transport) liberes.add(`transport:${transport.id}`);

    // Le DUT d'un appariement validé porte les mêmes coordonnées que celui-ci.
    liberes.add(`dut:${a.id}`);

    const offre = offreParId.get(a.offreId);
    if (!offre) continue;
    liberes.add(`offre:${offre.id}`);
    if (offre.vehiculeId) liberes.add(`vehicule:${offre.vehiculeId}`);
    if (offre.chauffeurPressentiId) liberes.add(`chauffeur:${offre.chauffeurPressentiId}`);
  }

  return liberes;
}

/**
 * Projette une liste. Raccourci de lisibilité pour les dépôts.
 * @param {Contexte} ctx
 * @param {string} nomEntite
 * @param {Array<Record<string, unknown>>} objets
 * @param {{proprietaireId?: string|null}} [options]
 * @returns {Array<Record<string, unknown>>}
 */
export function projeterListe(ctx, nomEntite, objets, options = {}) {
  return objets.map((o) => projeter(ctx, nomEntite, o, options));
}

/**
 * Indique si un rôle peut, en principe, accéder aux coordonnées d'un tiers.
 * Sert à afficher l'encadré « coordonnées » désactivé avec son explication,
 * plutôt qu'à le faire disparaître (décision D32).
 *
 * @param {Contexte} ctx
 * @returns {Decision}
 */
export function deciderCoordonnees(ctx) {
  const base = decider(ctx, 'coordonnees.lire');
  if (!base.autorise) return base;
  return Object.freeze({
    ...base,
    explication:
      'Les coordonnées du transporteur vous seront transmises dès la validation ' +
      'de la mise en relation et le règlement des frais par les deux parties.',
  });
}

/* ================================================================== *
 * Espace applicatif
 * ================================================================== */

/**
 * Rend l'espace applicatif servi à un rôle. Aucun écran n'est atteint par une
 * route devinée : une route hors de l'espace du rôle produit un refus explicite
 * nommant le rôle et le droit manquant, jamais une redirection silencieuse vers
 * l'accueil — qui laisserait l'utilisateur croire à un défaut du logiciel.
 *
 * @param {string} roleId
 * @returns {string}
 */
export function espaceDe(roleId) {
  return role(roleId).espace;
}

/**
 * Rôles déclarés, pour l'écran « Utilisateurs et rôles » du concessionnaire.
 * @returns {string[]}
 */
export function tousLesRoles() {
  return Object.keys(ROLES);
}
