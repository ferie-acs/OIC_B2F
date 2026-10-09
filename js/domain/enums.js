/**
 * Valeurs énumérées du domaine B2F.
 *
 * Règle D34 (journal de projet) : les valeurs stockées sont celles du système
 * existant — `reserver`, `accepter`, `rejeter`, `annuler`, `valider` — afin qu'une
 * reprise de données reste possible. Elles ne sont JAMAIS affichées brutes : chaque
 * valeur porte ici son libellé, et ce libellé diffère selon le rôle qui lit.
 *
 * Aucun libellé ne doit être écrit en dur dans une vue. Une valeur sans libellé est
 * une erreur de programmation, pas un cas à contourner : `labelOf()` lève.
 *
 * @module domain/enums
 */

/**
 * Point de vue du lecteur. Détermine le libellé servi pour un même état stocké.
 * @readonly
 * @enum {string}
 */
export const POV = Object.freeze({
  AFFRETEUR: 'affreteur',
  TRANSPORTEUR: 'transporteur',
  NEUTRE: 'neutre',
});

/* ------------------------------------------------------------------ *
 * Déclaration de fret
 * ------------------------------------------------------------------ */

/**
 * États d'une déclaration de fret.
 * @readonly
 * @enum {string}
 */
export const ETAT_DECLARATION = Object.freeze({
  BROUILLON: 'brouillon',
  ACTIVE: 'active',
  CLOTUREE: 'cloturee',
});

/* ------------------------------------------------------------------ *
 * Demande de transport
 * ------------------------------------------------------------------ */

/**
 * États d'une demande de transport.
 *
 * `reservee` n'est pas un état saisi : il est dérivé de l'existence d'un
 * appariement actif. Il est stocké pour éviter un parcours de collection à chaque
 * affichage, et recalculé par l'invariant `demandeEtatCoherent` (voir schema.js).
 * @readonly
 * @enum {string}
 */
export const ETAT_DEMANDE = Object.freeze({
  BROUILLON: 'brouillon',
  PUBLIEE: 'publiee',
  RESERVEE: 'reservee',
  VALIDEE: 'validee',
  ANNULEE: 'annulee',
});

/* ------------------------------------------------------------------ *
 * Offre de véhicule
 * ------------------------------------------------------------------ */

/**
 * États d'une offre de véhicule publiée sur le marché.
 * @readonly
 * @enum {string}
 */
export const ETAT_OFFRE = Object.freeze({
  DISPONIBLE: 'disponible',
  RESERVEE: 'reservee',
  ENGAGEE: 'engagee',
  RETIREE: 'retiree',
});

/* ------------------------------------------------------------------ *
 * Appariement — le cœur du POC
 * ------------------------------------------------------------------ */

/**
 * État d'un appariement offre × demande.
 *
 * Valeurs reprises du système existant (`reponse_affeteur` / `reponse_transporteur`,
 * colonnes `nchar(15)`). Le POC les porte sur une entité d'appariement de premier
 * ordre au lieu de deux colonnes sur l'offre — voir `docs/architecture/`.
 * @readonly
 * @enum {string}
 */
export const ETAT_APPARIEMENT = Object.freeze({
  /** L'affréteur a réservé l'offre. En attente de la réponse du transporteur. */
  RESERVER: 'reserver',
  /** Le transporteur a accepté. En attente de la validation de l'affréteur. */
  ACCEPTER: 'accepter',
  /** Le transporteur a refusé. Terminal. Un motif est obligatoire. */
  REJETER: 'rejeter',
  /** L'une des parties s'est retirée avant validation. Terminal. */
  ANNULER: 'annuler',
  /** Double débit enregistré, coordonnées transmises. Terminal et irréversible. */
  VALIDER: 'valider',
});

/**
 * Sens du flux à l'origine de l'appariement.
 *
 * Les deux sens existent dans le système actuel et convergent ici sur la même
 * machine à états — c'est l'écart délibéré n° 1 (un seul mécanisme d'appariement).
 * Le sens n'est conservé que pour la restitution et les statistiques.
 * @readonly
 * @enum {string}
 */
export const SENS_APPARIEMENT = Object.freeze({
  /** Le transporteur publie une offre, l'affréteur la réserve. */
  OFFRE_VERS_DEMANDE: 'offre_vers_demande',
  /** L'affréteur publie une demande, le transporteur propose un véhicule. */
  DEMANDE_VERS_OFFRE: 'demande_vers_offre',
});

/**
 * Motifs de rejet prédéfinis (spécification d'écran C.7).
 * La précision libre est un champ distinct, elle ne remplace pas le motif.
 * @readonly
 * @enum {string}
 */
export const MOTIF_REJET = Object.freeze({
  VEHICULE_ENGAGE: 'vehicule_engage',
  DATES_INCOMPATIBLES: 'dates_incompatibles',
  MARCHANDISE_NON_TRANSPORTABLE: 'marchandise_non_transportable',
  DESTINATION_NON_DESSERVIE: 'destination_non_desservie',
});

/* ------------------------------------------------------------------ *
 * Suivi du transport — question U2, tranchée
 * ------------------------------------------------------------------ */

/**
 * Étapes du transport, dans l'ordre strict. Aucun saut, aucun retour en arrière.
 *
 * Question U2 tranchée par l'utilisateur le 24/09/2026 (décision D36) : ces six
 * étapes sont le modèle de statuts du transport. Le système existant ne les
 * formalise pas (`etat_dmde` y est flou) — c'est un apport du POC, à signaler en
 * démonstration.
 * @readonly
 * @enum {string}
 */
export const ETAPE_TRANSPORT = Object.freeze({
  VALIDE: 'valide',
  A_QUAI: 'a_quai',
  CHARGE: 'charge',
  EN_ROUTE: 'en_route',
  LIVRE: 'livre',
  CLOTURE: 'cloture',
});

/**
 * Ordre des étapes. L'index fait foi pour interdire saut et retour arrière.
 * @type {ReadonlyArray<string>}
 */
export const ORDRE_ETAPES = Object.freeze([
  ETAPE_TRANSPORT.VALIDE,
  ETAPE_TRANSPORT.A_QUAI,
  ETAPE_TRANSPORT.CHARGE,
  ETAPE_TRANSPORT.EN_ROUTE,
  ETAPE_TRANSPORT.LIVRE,
  ETAPE_TRANSPORT.CLOTURE,
]);

/**
 * Nature d'un incident. Un incident s'inscrit au journal du transport
 * SANS changer l'étape en cours (spécification C.8).
 * @readonly
 * @enum {string}
 */
export const NATURE_INCIDENT = Object.freeze({
  PANNE: 'panne',
  RETARD: 'retard',
  BARRAGE: 'barrage',
  LITIGE_CHARGEMENT: 'litige_chargement',
});

/* ------------------------------------------------------------------ *
 * Comptes et finances
 * ------------------------------------------------------------------ */

/**
 * Sens d'un mouvement de compte.
 *
 * Le système existant porte deux colonnes `credit` et `debit` sur la même ligne.
 * Le POC n'en garde qu'une, avec un sens explicite : une ligne portant les deux
 * n'aurait aucun sens et rien, dans le système existant, ne l'interdit.
 * @readonly
 * @enum {string}
 */
export const SENS_OPERATION = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
});

/**
 * Nature d'un mouvement de compte. Sert à libeller et à filtrer.
 * @readonly
 * @enum {string}
 */
export const MOTIF_OPERATION = Object.freeze({
  /** Crédit saisi par le concessionnaire (remplace le paiement en ligne — N2). */
  RECHARGEMENT: 'rechargement',
  /** Débit des frais de mise en relation, côté affréteur. */
  FRAIS_MISE_EN_RELATION_AFFRETEUR: 'frais_mise_en_relation_affreteur',
  /** Débit des frais de mise en relation, côté transporteur. */
  FRAIS_MISE_EN_RELATION_TRANSPORTEUR: 'frais_mise_en_relation_transporteur',
  /** Débit d'un abonnement. */
  ABONNEMENT: 'abonnement',
});

/**
 * Codes du catalogue de tarifs (`b2f_tarifs`).
 *
 * Ce catalogue est le prix du SERVICE de la plateforme, jamais une grille
 * tarifaire du fret (cadrage § 3.4). Les identifiants numériques en dur du système
 * existant (1, 2, 10002…) sont remplacés par des codes lisibles.
 * @readonly
 * @enum {string}
 */
export const CODE_TARIF = Object.freeze({
  ABONNEMENT_ANNUEL: 'abonnement_annuel',
  FRAIS_AFFRETEUR: 'frais_affreteur',
  FRAIS_TRANSPORTEUR: 'frais_transporteur',
});

/**
 * État d'un abonnement de groupement. Conditionne l'accès (M10.2).
 * @readonly
 * @enum {string}
 */
export const ETAT_ABONNEMENT = Object.freeze({
  ACTIF: 'actif',
  EXPIRE: 'expire',
});

/* ------------------------------------------------------------------ *
 * Acteurs
 * ------------------------------------------------------------------ */

/**
 * Type d'un groupement — l'entreprise inscrite sur la plateforme.
 * @readonly
 * @enum {string}
 */
export const TYPE_GROUPEMENT = Object.freeze({
  AFFRETEUR: 'affreteur',
  TRANSPORTEUR: 'transporteur',
  INSTITUTION: 'institution',
});

/**
 * État administratif d'un groupement ou d'un utilisateur.
 * @readonly
 * @enum {string}
 */
export const ETAT_COMPTE = Object.freeze({
  ACTIF: 'actif',
  SUSPENDU: 'suspendu',
});

/**
 * État d'un véhicule au parc.
 *
 * `non_publiable` n'est pas saisi : il est dérivé de l'échéance de la carte de
 * transport, recalculé à la lecture. Voir l'invariant `vehiculePubliable`.
 * @readonly
 * @enum {string}
 */
export const ETAT_VEHICULE = Object.freeze({
  DISPONIBLE: 'disponible',
  ENGAGE: 'engage',
  HORS_SERVICE: 'hors_service',
});

/* ------------------------------------------------------------------ *
 * Journal d'audit
 * ------------------------------------------------------------------ */

/**
 * Types d'événements du journal d'audit.
 *
 * Ajout du POC : le système existant n'a aucune piste d'audit unifiée. Le journal
 * est en ajout seul — aucune fonction d'édition ni de suppression n'est développée.
 * @readonly
 * @enum {string}
 */
export const EVENEMENT_AUDIT = Object.freeze({
  CONNEXION: 'connexion',
  CONNEXION_REFUSEE: 'connexion_refusee',
  ACCES_REFUSE: 'acces_refuse',
  DECLARATION_PUBLIEE: 'declaration_publiee',
  DEMANDE_ANNULEE: 'demande_annulee',
  OFFRE_PUBLIEE: 'offre_publiee',
  OFFRE_RETIREE: 'offre_retiree',
  APPARIEMENT_RESERVE: 'appariement_reserve',
  APPARIEMENT_ACCEPTE: 'appariement_accepte',
  APPARIEMENT_REJETE: 'appariement_rejete',
  APPARIEMENT_ANNULE: 'appariement_annule',
  APPARIEMENT_VALIDE: 'appariement_valide',
  COORDONNEES_TRANSMISES: 'coordonnees_transmises',
  COMPTE_CREDITE: 'compte_credite',
  TARIF_MODIFIE: 'tarif_modifie',
  ABONNEMENT_PROLONGE: 'abonnement_prolonge',
  TRANSPORT_ETAPE: 'transport_etape',
  TRANSPORT_INCIDENT: 'transport_incident',
  DUT_GENERE: 'dut_genere',
});

/* ------------------------------------------------------------------ *
 * Libellés — aucun statut ne s'affiche brut (D34)
 * ------------------------------------------------------------------ */

/**
 * Table de correspondance valeur stockée → libellé, par point de vue.
 *
 * Un même état porte deux libellés selon le rôle qui le lit : `reserver` se lit
 * « en attente de votre réponse » côté transporteur et « en attente de la réponse
 * du transporteur » côté affréteur. C'est voulu : un statut doit dire au lecteur
 * ce qu'il a à faire.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
export const LIBELLES = Object.freeze({
  [ETAT_DEMANDE.PUBLIEE]: Object.freeze({
    [POV.AFFRETEUR]: "Publiée — en attente d'un véhicule",
    [POV.TRANSPORTEUR]: 'Demande ouverte',
    [POV.NEUTRE]: 'Publiée',
  }),
  [ETAT_OFFRE.DISPONIBLE]: Object.freeze({
    [POV.AFFRETEUR]: 'Véhicule disponible',
    [POV.TRANSPORTEUR]: 'Offre publiée',
    [POV.NEUTRE]: 'Disponible',
  }),
  [ETAT_APPARIEMENT.RESERVER]: Object.freeze({
    [POV.AFFRETEUR]: 'Réservée — en attente de la réponse du transporteur',
    [POV.TRANSPORTEUR]: 'En attente de votre réponse',
    [POV.NEUTRE]: 'Réservée',
  }),
  [ETAT_APPARIEMENT.ACCEPTER]: Object.freeze({
    [POV.AFFRETEUR]: 'Acceptée — à vous de valider',
    [POV.TRANSPORTEUR]: "Acceptée — en attente de validation de l'affréteur",
    [POV.NEUTRE]: 'Acceptée',
  }),
  [ETAT_APPARIEMENT.REJETER]: Object.freeze({
    [POV.AFFRETEUR]: 'Rejetée',
    [POV.TRANSPORTEUR]: 'Rejetée par vous',
    [POV.NEUTRE]: 'Rejetée',
  }),
  [ETAT_APPARIEMENT.ANNULER]: Object.freeze({
    [POV.AFFRETEUR]: 'Annulée',
    [POV.TRANSPORTEUR]: 'Annulée',
    [POV.NEUTRE]: 'Annulée',
  }),
  [ETAT_APPARIEMENT.VALIDER]: Object.freeze({
    [POV.AFFRETEUR]: 'Validée — mise en relation effective',
    [POV.TRANSPORTEUR]: 'Validée — mise en relation effective',
    [POV.NEUTRE]: 'Validée',
  }),
  [ETAPE_TRANSPORT.VALIDE]: Object.freeze({ [POV.NEUTRE]: 'Validé' }),
  [ETAPE_TRANSPORT.A_QUAI]: Object.freeze({ [POV.NEUTRE]: 'À quai' }),
  [ETAPE_TRANSPORT.CHARGE]: Object.freeze({ [POV.NEUTRE]: 'Chargé' }),
  [ETAPE_TRANSPORT.EN_ROUTE]: Object.freeze({ [POV.NEUTRE]: 'En route' }),
  [ETAPE_TRANSPORT.LIVRE]: Object.freeze({ [POV.NEUTRE]: 'Livré' }),
  [ETAPE_TRANSPORT.CLOTURE]: Object.freeze({ [POV.NEUTRE]: 'Clôturé' }),
  /* --- États des entités. Ils étaient absents : `badge()` retombait alors sur
         la valeur stockée, et l'écran affichait « validee » en minuscules —
         précisément ce que la décision D34 interdit. --- */
  [ETAT_DECLARATION.BROUILLON]: Object.freeze({ [POV.NEUTRE]: 'Brouillon' }),
  [ETAT_DECLARATION.ACTIVE]: Object.freeze({ [POV.NEUTRE]: 'Active' }),
  [ETAT_DECLARATION.CLOTUREE]: Object.freeze({ [POV.NEUTRE]: 'Clôturée' }),
  [ETAT_DEMANDE.RESERVEE]: Object.freeze({
    [POV.AFFRETEUR]: 'Réservée — en attente de la réponse du transporteur',
    [POV.TRANSPORTEUR]: 'Réservée par un affréteur',
    [POV.NEUTRE]: 'Réservée',
  }),
  [ETAT_DEMANDE.VALIDEE]: Object.freeze({
    [POV.AFFRETEUR]: 'Validée — mise en relation effective',
    [POV.TRANSPORTEUR]: 'Validée — mise en relation effective',
    [POV.NEUTRE]: 'Validée',
  }),
  [ETAT_DEMANDE.ANNULEE]: Object.freeze({ [POV.NEUTRE]: 'Annulée' }),
  [ETAT_OFFRE.RESERVEE]: Object.freeze({
    [POV.AFFRETEUR]: 'Réservée par vous',
    [POV.TRANSPORTEUR]: 'Réservée — en attente de votre réponse',
    [POV.NEUTRE]: 'Réservée',
  }),
  [ETAT_OFFRE.ENGAGEE]: Object.freeze({ [POV.NEUTRE]: 'Engagée sur un transport' }),
  [ETAT_OFFRE.RETIREE]: Object.freeze({ [POV.NEUTRE]: 'Retirée du marché' }),
  [ETAT_VEHICULE.DISPONIBLE]: Object.freeze({ [POV.NEUTRE]: 'Disponible' }),
  [ETAT_VEHICULE.ENGAGE]: Object.freeze({ [POV.NEUTRE]: 'Engagé' }),
  [ETAT_VEHICULE.HORS_SERVICE]: Object.freeze({ [POV.NEUTRE]: 'Hors service' }),
  [ETAT_COMPTE.ACTIF]: Object.freeze({ [POV.NEUTRE]: 'Actif' }),
  [ETAT_COMPTE.SUSPENDU]: Object.freeze({ [POV.NEUTRE]: 'Suspendu' }),
  [ETAT_ABONNEMENT.ACTIF]: Object.freeze({ [POV.NEUTRE]: 'Abonnement actif' }),
  [ETAT_ABONNEMENT.EXPIRE]: Object.freeze({ [POV.NEUTRE]: 'Abonnement expiré' }),
  [TYPE_GROUPEMENT.AFFRETEUR]: Object.freeze({ [POV.NEUTRE]: 'Affréteur' }),
  [TYPE_GROUPEMENT.TRANSPORTEUR]: Object.freeze({ [POV.NEUTRE]: 'Transporteur' }),
  [TYPE_GROUPEMENT.INSTITUTION]: Object.freeze({ [POV.NEUTRE]: 'Institution' }),
  [NATURE_INCIDENT.PANNE]: Object.freeze({ [POV.NEUTRE]: 'Panne' }),
  [NATURE_INCIDENT.RETARD]: Object.freeze({ [POV.NEUTRE]: 'Retard' }),
  [NATURE_INCIDENT.BARRAGE]: Object.freeze({ [POV.NEUTRE]: 'Barrage' }),
  [NATURE_INCIDENT.LITIGE_CHARGEMENT]: Object.freeze({ [POV.NEUTRE]: 'Litige au chargement' }),
  [MOTIF_REJET.VEHICULE_ENGAGE]: Object.freeze({ [POV.NEUTRE]: 'Véhicule déjà engagé' }),
  [MOTIF_REJET.DATES_INCOMPATIBLES]: Object.freeze({ [POV.NEUTRE]: 'Dates incompatibles' }),
  [MOTIF_REJET.MARCHANDISE_NON_TRANSPORTABLE]: Object.freeze({
    [POV.NEUTRE]: 'Marchandise non transportable',
  }),
  [MOTIF_REJET.DESTINATION_NON_DESSERVIE]: Object.freeze({
    [POV.NEUTRE]: 'Destination non desservie',
  }),
});

/**
 * Rend le libellé d'une valeur stockée pour un point de vue donné.
 *
 * Lève si la valeur n'a pas de libellé : un statut affiché brut est un défaut que
 * l'on veut voir en développement, pas en démonstration.
 *
 * @param {string} valeur Valeur stockée (ex. `'reserver'`).
 * @param {string} [pov=POV.NEUTRE] Point de vue du lecteur.
 * @returns {string} Le libellé à afficher.
 * @throws {Error} Si la valeur n'est pas répertoriée.
 */
export function labelOf(valeur, pov = POV.NEUTRE) {
  const entree = LIBELLES[valeur];
  if (!entree) {
    throw new Error(
      `Aucun libellé déclaré pour la valeur « ${valeur} ». ` +
        'Un statut ne doit jamais être affiché brut (décision D34) : ' +
        'ajoutez son libellé dans js/domain/enums.js.',
    );
  }
  return entree[pov] ?? entree[POV.NEUTRE];
}

/**
 * Indique si une étape de transport peut succéder à une autre.
 * Aucun saut, aucun retour en arrière.
 *
 * @param {string} depuis Étape actuelle.
 * @param {string} vers Étape visée.
 * @returns {boolean}
 */
export function etapeSuivanteValide(depuis, vers) {
  const i = ORDRE_ETAPES.indexOf(depuis);
  const j = ORDRE_ETAPES.indexOf(vers);
  return i !== -1 && j === i + 1;
}
