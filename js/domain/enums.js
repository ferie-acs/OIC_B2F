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
  /* --- Lot b3 : motifs de l'affréteur qui refuse une proposition (sens B) --- */
  VEHICULE_INADAPTE: 'vehicule_inadapte',
  AUTRE_VEHICULE_RETENU: 'autre_vehicule_retenu',
  PRIX_TROP_ELEVE: 'prix_trop_eleve',
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
  /* --- Lot b1 : inscription — l'intermédiaire de fret (auxiliaire) devient une
         entreprise inscrite. Même valeur que celle du lot b2 (mandats). --- */
  INTERMEDIAIRE: 'intermediaire',
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
 * Lutte contre la fraude — ajouts du 13/10/2026
 * ------------------------------------------------------------------ */

/**
 * État de vérification du dossier d'un transporteur.
 *
 * **Correctif anti-fraude n° 3.** Rien ne prouvait qu'un transporteur était
 * celui qu'il prétendait être : un faux transporteur pouvait s'inscrire,
 * accepter un chargement et disparaître avec la marchandise. Un transporteur
 * dont le dossier n'est pas `verifie` ne publie pas, ne propose pas, n'accepte
 * pas, et son offre ne peut pas être validée. Un état absent vaut « à vérifier ».
 * @readonly
 * @enum {string}
 */
export const ETAT_VERIFICATION = Object.freeze({
  A_VERIFIER: 'a_verifier',
  VERIFIE: 'verifie',
  REFUSE: 'refuse',
});

/**
 * Pièces contrôlées par l'agent d'activation sur le dossier d'un transporteur.
 * Les trois sont exigées pour prononcer la vérification.
 * @readonly
 * @enum {string}
 */
export const PIECE_DOSSIER = Object.freeze({
  RCCM: 'rccm',
  CARTE_TRANSPORTEUR: 'carte_transporteur',
  ASSURANCE: 'assurance',
});

/**
 * État d'un crédit de compte saisi.
 *
 * **Correctif anti-fraude n° 5.** Une seule personne pouvait créditer un compte
 * sur une simple référence que personne ne contrôlait. Le crédit est désormais
 * saisi par un agent, puis validé par une autre personne après rapprochement
 * avec l'encaissement. Seule la validation touche au solde.
 * @readonly
 * @enum {string}
 */
export const ETAT_CREDIT = Object.freeze({
  EN_ATTENTE: 'en_attente',
  CREDITE: 'credite',
  REJETE: 'rejete',
});

/**
 * Motif de fin d'un appariement non abouti, quand ce n'est pas une partie qui
 * l'a décidée. La valeur stockée de l'état reste `annuler` (fidélité au système
 * existant, D34) ; ce champ dit pourquoi.
 * @readonly
 * @enum {string}
 */
export const MOTIF_CLOTURE = Object.freeze({
  /** Délai de réponse ou de validation dépassé. Correctif anti-fraude n° 4. */
  EXPIRATION: 'expiration',
});

/**
 * Délais au-delà desquels un appariement en attente expire.
 *
 * **Correctif anti-fraude n° 4.** Réserver est gratuit : sans délai, un abonné
 * pouvait immobiliser des camions sans jamais valider. Durées proposées par le
 * POC, **à confirmer par l'OIC**.
 * @readonly
 */
export const DELAIS_APPARIEMENT = Object.freeze({
  /** Le répondeur dispose de ce délai pour accepter ou rejeter. */
  REPONSE_HEURES: 48,
  /** L'affréteur dispose de ce délai, après acceptation, pour valider. */
  VALIDATION_HEURES: 48,
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
  /* --- Lutte contre la fraude (13/10/2026) --- */
  APPARIEMENT_EXPIRE: 'appariement_expire',
  TRANSPORTEUR_VERIFIE: 'transporteur_verifie',
  TRANSPORTEUR_REFUSE: 'transporteur_refuse',
  VEHICULE_VERIFIE: 'vehicule_verifie',
  CHAUFFEUR_VERIFIE: 'chauffeur_verifie',
  CREDIT_SAISI: 'credit_saisi',
  CREDIT_REJETE: 'credit_rejete',
  AVIS_DONNE: 'avis_donne',
  /* --- Lot b1 : inscription, activation, mot de passe, messagerie --- */
  INSCRIPTION_RECUE: 'inscription_recue',
  PIECE_DEPOSEE: 'piece_deposee',
  PIECE_RETIREE: 'piece_retiree',
  PIECE_CONTROLEE: 'piece_controlee',
  COMPLEMENT_DEMANDE: 'complement_demande',
  COMPLEMENT_FOURNI: 'complement_fourni',
  INSCRIPTION_REFUSEE: 'inscription_refusee',
  ENTREPRISE_ACTIVEE: 'entreprise_activee',
  ENTREPRISE_REQUALIFIEE: 'entreprise_requalifiee',
  FICHE_MODIFIEE: 'fiche_modifiee',
  MODIFICATION_DEMANDEE: 'modification_demandee',
  MODIFICATION_DECIDEE: 'modification_decidee',
  MOT_DE_PASSE_DEMANDE: 'mot_de_passe_demande',
  MOT_DE_PASSE_REINITIALISE: 'mot_de_passe_reinitialise',
  MOT_DE_PASSE_CHANGE: 'mot_de_passe_change',
  PROFIL_MODIFIE: 'profil_modifie',
  MESSAGE_ENVOYE: 'message_envoye',
  /* --- Lot b2 : organisation interne --- */
  UTILISATEUR_CREE: 'utilisateur_cree',
  UTILISATEUR_MODIFIE: 'utilisateur_modifie',
  UTILISATEUR_DESACTIVE: 'utilisateur_desactive',
  UTILISATEUR_REACTIVE: 'utilisateur_reactive',
  ACCES_REINITIALISE: 'acces_reinitialise',
  COMPTE_ACTIVE: 'compte_active',
  FILIALE_CREEE: 'filiale_creee',
  MANDAT_DESIGNE: 'mandat_designe',
  MANDAT_RETIRE: 'mandat_retire',
  MANDAT_OUVERT: 'mandat_ouvert',
  /* --- Lot b3 : marché, flotte, attestation et contrôle sur route --- */
  DEMANDE_MODIFIEE: 'demande_modifiee',
  DEMANDE_REPUBLIEE: 'demande_republiee',
  OFFRE_MODIFIEE: 'offre_modifiee',
  OFFRE_DUPLIQUEE: 'offre_dupliquee',
  CHAUFFEUR_ENREGISTRE: 'chauffeur_enregistre',
  CHAUFFEUR_MODIFIE: 'chauffeur_modifie',
  CHAUFFEUR_RETIRE: 'chauffeur_retire',
  CHAUFFEUR_REACTIVE: 'chauffeur_reactive',
  ATTESTATION_GENEREE: 'attestation_generee',
  ATTESTATION_ANNULEE: 'attestation_annulee',
  ATTESTATION_VERIFIEE: 'attestation_verifiee',
});

/* ------------------------------------------------------------------ *
 * Lot b1 : inscription, dossier, messagerie
 * ------------------------------------------------------------------ */

/**
 * État de l'inscription d'une entreprise. **Absent vaut « activée »** : les
 * groupements antérieurs à l'inscription en ligne ont été créés actifs.
 * Les valeurs sont préfixées pour ne pas se confondre, dans la table des
 * libellés, avec les états d'autres entités (`en_attente` d'un crédit).
 * @readonly
 * @enum {string}
 */
export const ETAT_INSCRIPTION = Object.freeze({
  EN_ATTENTE: 'inscription_en_attente',
  A_COMPLETER: 'inscription_a_completer',
  REFUSEE: 'inscription_refusee',
  ACTIVEE: 'inscription_activee',
});

/**
 * État d'une pièce déposée au dossier d'inscription.
 * @readonly
 * @enum {string}
 */
export const ETAT_PIECE = Object.freeze({
  DEPOSEE: 'piece_deposee',
  CONFORME: 'piece_conforme',
  NON_CONFORME: 'piece_non_conforme',
  REMPLACEE: 'piece_remplacee',
});

/**
 * Canal d'un message sortant. **Simulé** dans le POC : aucun courriel ni SMS ne
 * quitte le navigateur.
 * @readonly
 * @enum {string}
 */
export const CANAL_MESSAGE = Object.freeze({
  COURRIEL: 'courriel',
  SMS: 'sms',
});

/**
 * Sort d'un message sortant simulé.
 * @readonly
 * @enum {string}
 */
export const STATUT_MESSAGE = Object.freeze({
  /** Déposé dans la boîte de réception simulée. */
  SIMULE: 'message_simule',
  /** Aucune adresse ni aucun numéro enregistré pour ce canal. */
  NON_REMIS: 'message_non_remis',
});

/* ------------------------------------------------------------------ *
 * Lot b2 : organisation interne — mandats d'intermédiaire
 * ------------------------------------------------------------------ */

/**
 * État enregistré d'un mandat. Le retrait est définitif : un nouveau mandat se
 * désigne, un mandat retiré ne se réactive pas (la trace reste lisible).
 * @readonly
 * @enum {string}
 */
export const ETAT_MANDAT = Object.freeze({
  ACTIF: 'actif',
  RETIRE: 'retire',
});

/**
 * Statut d'un mandat **à une date donnée**, dérivé de son état et de sa période.
 * Jamais stocké : l'autorité est la date (comme pour l'abonnement).
 * @readonly
 * @enum {string}
 */
export const STATUT_MANDAT = Object.freeze({
  EN_VIGUEUR: 'mandat_en_vigueur',
  A_VENIR: 'mandat_a_venir',
  ECHU: 'mandat_echu',
  RETIRE: 'mandat_retire',
});

/**
 * Périmètre d'un mandat : ce que le mandant confie à son intermédiaire.
 * Les deux premiers valent pour un affréteur, les deux suivants pour un
 * transporteur. Les droits correspondants sont dans `domain/mandat.js`.
 * @readonly
 * @enum {string}
 */
export const PERIMETRE_MANDAT = Object.freeze({
  DECLARER_FRET: 'declarer_fret',
  GERER_RESERVATIONS: 'gerer_reservations',
  PROPOSER_VEHICULES: 'proposer_vehicules',
  REPONDRE_RESERVATIONS: 'repondre_reservations',
});

/* ------------------------------------------------------------------ *
 * Lot b3 : marché, flotte, attestation et contrôle sur route
 * ------------------------------------------------------------------ */

/**
 * Motifs de rejet proposés à chaque partie. Le transporteur qui décline une
 * réservation et l'affréteur qui refuse une proposition (sens B) n'ont pas les
 * mêmes raisons ; la valeur stockée reste une valeur de `MOTIF_REJET`.
 * @readonly
 */
export const MOTIFS_REJET_PAR_PARTIE = Object.freeze({
  transporteur: Object.freeze([
    MOTIF_REJET.VEHICULE_ENGAGE,
    MOTIF_REJET.DATES_INCOMPATIBLES,
    MOTIF_REJET.MARCHANDISE_NON_TRANSPORTABLE,
    MOTIF_REJET.DESTINATION_NON_DESSERVIE,
  ]),
  affreteur: Object.freeze([
    MOTIF_REJET.VEHICULE_INADAPTE,
    MOTIF_REJET.DATES_INCOMPATIBLES,
    MOTIF_REJET.AUTRE_VEHICULE_RETENU,
    MOTIF_REJET.PRIX_TROP_ELEVE,
  ]),
});

/**
 * Pièce d'identité d'un chauffeur.
 * @readonly
 * @enum {string}
 */
export const TYPE_PIECE_IDENTITE = Object.freeze({
  CNI: 'cni',
  PASSEPORT: 'passeport',
  CARTE_SEJOUR: 'carte_sejour',
  CARTE_CONSULAIRE: 'carte_consulaire',
});

/**
 * Catégories du permis de conduire ivoirien retenues par le POC.
 * @readonly
 * @enum {string}
 */
export const CATEGORIE_PERMIS = Object.freeze({
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
});

/**
 * Nationalités proposées à la saisie d'un chauffeur. Liste courte, centrée sur
 * les corridors desservis ; « Autre nationalité » couvre le reste.
 * @readonly
 */
export const NATIONALITES = Object.freeze([
  'Ivoirienne', 'Burkinabè', 'Malienne', 'Guinéenne', 'Ghanéenne', 'Libérienne',
  'Nigérienne', 'Sénégalaise', 'Togolaise', 'Béninoise', 'Nigériane', 'Autre nationalité',
]);

/**
 * État d'une attestation de bourse de fret. « En vigueur » se calcule à la
 * lecture (D38) : l'échéance fait autorité, aucune tâche planifiée.
 * @readonly
 * @enum {string}
 */
export const ETAT_ATTESTATION = Object.freeze({
  EN_VIGUEUR: 'en_vigueur',
  EXPIREE: 'expiree',
  ANNULEE: 'annulee',
});

/**
 * Verdict d'une vérification sur route, tel qu'il est journalisé.
 * @readonly
 * @enum {string}
 */
export const RESULTAT_CONTROLE = Object.freeze({
  VALIDE: 'controle_valide',
  EXPIREE: 'controle_expiree',
  ANNULEE: 'controle_annulee',
  INCONNUE: 'controle_inconnu',
});

/**
 * Manière dont le code a été lu.
 * @readonly
 * @enum {string}
 */
export const MODE_CONTROLE = Object.freeze({
  QR: 'qr',
  SAISIE: 'saisie',
  PUBLIC: 'public',
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
  [ETAT_VERIFICATION.A_VERIFIER]: Object.freeze({ [POV.NEUTRE]: 'Dossier à vérifier' }),
  [ETAT_VERIFICATION.VERIFIE]: Object.freeze({ [POV.NEUTRE]: 'Transporteur vérifié' }),
  [ETAT_VERIFICATION.REFUSE]: Object.freeze({ [POV.NEUTRE]: 'Vérification refusée' }),
  [PIECE_DOSSIER.RCCM]: Object.freeze({ [POV.NEUTRE]: 'Registre du commerce (RCCM)' }),
  [PIECE_DOSSIER.CARTE_TRANSPORTEUR]: Object.freeze({ [POV.NEUTRE]: 'Carte de transporteur en cours de validité' }),
  [PIECE_DOSSIER.ASSURANCE]: Object.freeze({ [POV.NEUTRE]: 'Attestation d’assurance marchandises transportées' }),
  [ETAT_CREDIT.EN_ATTENTE]: Object.freeze({ [POV.NEUTRE]: 'En attente de validation' }),
  [ETAT_CREDIT.CREDITE]: Object.freeze({ [POV.NEUTRE]: 'Validé — compte crédité' }),
  [ETAT_CREDIT.REJETE]: Object.freeze({ [POV.NEUTRE]: 'Rejeté' }),
  [MOTIF_CLOTURE.EXPIRATION]: Object.freeze({ [POV.NEUTRE]: 'Expirée — délai dépassé' }),
  /* --- Lot b1 : inscription, dossier, messagerie --- */
  [TYPE_GROUPEMENT.INTERMEDIAIRE]: Object.freeze({ [POV.NEUTRE]: 'Intermédiaire de fret' }),
  [ETAT_INSCRIPTION.EN_ATTENTE]: Object.freeze({ [POV.NEUTRE]: 'En attente de vérification' }),
  [ETAT_INSCRIPTION.A_COMPLETER]: Object.freeze({ [POV.NEUTRE]: 'Complément demandé' }),
  [ETAT_INSCRIPTION.REFUSEE]: Object.freeze({ [POV.NEUTRE]: 'Inscription refusée' }),
  [ETAT_INSCRIPTION.ACTIVEE]: Object.freeze({ [POV.NEUTRE]: 'Compte activé' }),
  [ETAT_PIECE.DEPOSEE]: Object.freeze({ [POV.NEUTRE]: 'À contrôler' }),
  [ETAT_PIECE.CONFORME]: Object.freeze({ [POV.NEUTRE]: 'Conforme' }),
  [ETAT_PIECE.NON_CONFORME]: Object.freeze({ [POV.NEUTRE]: 'Non conforme' }),
  [ETAT_PIECE.REMPLACEE]: Object.freeze({ [POV.NEUTRE]: 'Remplacée' }),
  [CANAL_MESSAGE.COURRIEL]: Object.freeze({ [POV.NEUTRE]: 'Courriel' }),
  [CANAL_MESSAGE.SMS]: Object.freeze({ [POV.NEUTRE]: 'SMS' }),
  [STATUT_MESSAGE.SIMULE]: Object.freeze({ [POV.NEUTRE]: 'Remis — envoi simulé' }),
  [STATUT_MESSAGE.NON_REMIS]: Object.freeze({ [POV.NEUTRE]: 'Non remis' }),
  /* --- Lot b2 : organisation interne --- */
  [STATUT_MANDAT.EN_VIGUEUR]: Object.freeze({ [POV.NEUTRE]: 'En vigueur' }),
  [STATUT_MANDAT.A_VENIR]: Object.freeze({ [POV.NEUTRE]: 'À venir' }),
  [STATUT_MANDAT.ECHU]: Object.freeze({ [POV.NEUTRE]: 'Échu' }),
  [STATUT_MANDAT.RETIRE]: Object.freeze({ [POV.NEUTRE]: 'Retiré' }),
  [PERIMETRE_MANDAT.DECLARER_FRET]: Object.freeze({ [POV.NEUTRE]: 'Déclarer du fret et publier des demandes' }),
  [PERIMETRE_MANDAT.GERER_RESERVATIONS]: Object.freeze({ [POV.NEUTRE]: 'Rechercher et réserver des véhicules' }),
  [PERIMETRE_MANDAT.PROPOSER_VEHICULES]: Object.freeze({ [POV.NEUTRE]: 'Proposer des véhicules sur les demandes publiées' }),
  [PERIMETRE_MANDAT.REPONDRE_RESERVATIONS]: Object.freeze({ [POV.NEUTRE]: 'Accepter ou rejeter les réservations reçues' }),
  /* --- Lot b3 : marché, flotte, attestation et contrôle sur route --- */
  [MOTIF_REJET.VEHICULE_INADAPTE]: Object.freeze({ [POV.NEUTRE]: 'Véhicule inadapté au fret' }),
  [MOTIF_REJET.AUTRE_VEHICULE_RETENU]: Object.freeze({ [POV.NEUTRE]: 'Un autre véhicule a été retenu' }),
  [MOTIF_REJET.PRIX_TROP_ELEVE]: Object.freeze({ [POV.NEUTRE]: 'Prix indicatif trop élevé' }),
  [TYPE_PIECE_IDENTITE.CNI]: Object.freeze({ [POV.NEUTRE]: 'Carte nationale d’identité' }),
  [TYPE_PIECE_IDENTITE.PASSEPORT]: Object.freeze({ [POV.NEUTRE]: 'Passeport' }),
  [TYPE_PIECE_IDENTITE.CARTE_SEJOUR]: Object.freeze({ [POV.NEUTRE]: 'Carte de séjour' }),
  [TYPE_PIECE_IDENTITE.CARTE_CONSULAIRE]: Object.freeze({ [POV.NEUTRE]: 'Carte consulaire' }),
  [CATEGORIE_PERMIS.A]: Object.freeze({ [POV.NEUTRE]: 'A — motocyclettes' }),
  [CATEGORIE_PERMIS.B]: Object.freeze({ [POV.NEUTRE]: 'B — véhicules légers' }),
  [CATEGORIE_PERMIS.C]: Object.freeze({ [POV.NEUTRE]: 'C — poids lourds' }),
  [CATEGORIE_PERMIS.D]: Object.freeze({ [POV.NEUTRE]: 'D — transport de personnes' }),
  [CATEGORIE_PERMIS.E]: Object.freeze({ [POV.NEUTRE]: 'E — ensembles articulés et remorques' }),
  [ETAT_ATTESTATION.EN_VIGUEUR]: Object.freeze({ [POV.NEUTRE]: 'En vigueur' }),
  [ETAT_ATTESTATION.EXPIREE]: Object.freeze({ [POV.NEUTRE]: 'Expirée' }),
  [RESULTAT_CONTROLE.VALIDE]: Object.freeze({ [POV.NEUTRE]: 'Authentique et valide' }),
  [RESULTAT_CONTROLE.EXPIREE]: Object.freeze({ [POV.NEUTRE]: 'Authentique mais expirée' }),
  [RESULTAT_CONTROLE.ANNULEE]: Object.freeze({ [POV.NEUTRE]: 'Authentique mais annulée' }),
  [RESULTAT_CONTROLE.INCONNUE]: Object.freeze({ [POV.NEUTRE]: 'Code inconnu' }),
  [MODE_CONTROLE.QR]: Object.freeze({ [POV.NEUTRE]: 'QR code scanné' }),
  [MODE_CONTROLE.SAISIE]: Object.freeze({ [POV.NEUTRE]: 'Code saisi' }),
  [MODE_CONTROLE.PUBLIC]: Object.freeze({ [POV.NEUTRE]: 'Page publique' }),
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
