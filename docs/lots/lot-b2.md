# Lot b2 : organisation interne des entreprises et intermédiaires de fret

Plateforme : Bourse de Fret (B2F). Pour les démarches « Les deux », seul le côté Bourse de Fret est traité ici.

## Démarches couvertes

| N° | Acteur | Démarche | Résultat |
|----|--------|----------|----------|
| 4 | Affréteur | Gérer les utilisateurs de l'entreprise | Fait : création, modification, désactivation, réactivation, réinitialisation d'accès par code à usage unique. |
| 21 | Transporteur | Gérer les utilisateurs de l'entreprise | Fait (côté Bourse de Fret). |
| 3 | Affréteur | Créer et gérer ses sous-comptes (filiales) | Fait : entité rattachée, héritage des pièces, activité consolidée. |
| 20 | Transporteur | Créer une entité rattachée (filiale) | Fait (côté Bourse de Fret). |
| 15 | Affréteur | Désigner un intermédiaire de fret | Fait : désignation (périmètre, période), retrait, journal des actions faites en son nom. |
| 35 | Transporteur | Désigner un intermédiaire de transport | Fait. |
| 41 | Intermédiaire | Consulter ses mandants | Fait : liste multi-mandants, statut, ce que chacun attend. |
| 42 | Intermédiaire | Déclarer un fret pour un affréteur | Fait pour le choix du mandant, la déclaration et l'annulation. La modification d'une demande relève du lot b3 ; le droit `declaration.modifier` est déjà dans le rôle délégué et dans le périmètre « Déclarer du fret ». |
| 43 | Intermédiaire | Gérer les réservations pour un affréteur | Fait : recherche, réservation, annulation. La validation, qui engage les frais, reste au mandant (choix du POC conservé). |
| 44 | Intermédiaire | Répondre aux demandes pour ses transporteurs | Fait : proposer un véhicule sur une demande publiée, accepter ou rejeter une réservation reçue, si le mandat le prévoit. |
| 46 | Intermédiaire | Gérer ses sous-comptes et utilisateurs | Fait : zone Paramètres de l'espace Intermédiaire. |

## Écrans ajoutés

| Route | Rôles | Menu |
|-------|-------|------|
| `#/affreteur/utilisateurs`, `#/transporteur/utilisateurs` | `affreteur`, `transporteur` (et variantes) ; lecture seule si le rôle n'a pas `utilisateur.gerer` | Paramètres › Utilisateurs et auxiliaires (écran existant, devenu administrable) |
| `#/affreteur/filiales`, `#/transporteur/filiales` | responsables d'entreprise (`filiale.lire`) | Paramètres › Filiales et entités |
| `#/affreteur/intermediaires`, `#/transporteur/intermediaires` | responsables d'entreprise (`mandat.lire`, `mandat.gerer`) | Paramètres › Intermédiaires de fret |
| `#/intermediaire/dashboard` | `intermediaire`, `collaborateur_intermediaire` | Pilotage › Tableau de bord |
| `#/intermediaire/notifications` | idem | Pilotage › Notifications |
| `#/intermediaire/mandants` | idem | Mandants › Mes mandants |
| `#/intermediaire/abonnement` | idem | Compte › Abonnement |
| `#/intermediaire/groupement` | idem | Paramètres › Fiche de l'entreprise |
| `#/intermediaire/utilisateurs` | `intermediaire` | Paramètres › Utilisateurs |
| `#/intermediaire/filiales` | idem | Paramètres › Filiales et entités |
| « Activer mon compte » (fenêtre) | sans session | Écran de connexion |

Contexte délégué : quand l'intermédiaire clique « Agir en son nom », il ouvre les écrans habituels de l'affréteur ou du transporteur mandant, avec un bandeau « Au nom de … » sur chaque écran et le bouton « Revenir à mon espace ». Les zones Compte (solde, mouvements) et Paramètres n'y apparaissent pas.

## Modèle et règles métier

### Utilisateurs de l'entreprise (`services/utilisateurs-entreprise.service.js`)

- L'administrateur n'agit que sur les comptes de son entreprise et de ses entités rattachées ; jamais sur une autre entreprise ni sur un compte institutionnel.
- Le rôle se choisit parmi ceux du type d'entreprise (`ROLES_PAR_TYPE_ENTREPRISE`, `rolesAttribuables` dans `domain/roles.js`) : affréteur → `affreteur`, `auxiliaire_affreteur` ; transporteur → rôle de plein exercice de l'administrateur, `auxiliaire_transporteur`, `partenaire` ; intermédiaire → `intermediaire`, `collaborateur_intermediaire`. Aucun rôle OIC ni rôle de délégation n'est attribuable.
- Pas d'auto-administration : on ne change pas son propre rôle et on ne se désactive pas ; l'entreprise garde au moins un administrateur actif.
- Code d'activation : huit caractères sans caractère ambigu, affiché une seule fois à l'administrateur, stocké sous forme d'empreinte, valable 24 heures, à usage unique, invalidé après cinq essais erronés ; un nouveau code annule le précédent. L'ancien mot de passe reste valable tant que le nouveau n'est pas défini (le compte n'est pas bloqué). Le message d'échec ne dit jamais ce qui a échoué. Envoi par courriel simulé et annoncé comme tel.
- Journal : `utilisateur_cree`, `utilisateur_modifie`, `utilisateur_desactive`, `utilisateur_reactive`, `acces_reinitialise`, `compte_active`. Le journal nomme la personne, jamais son adresse.

### Filiales et entités rattachées (`services/filiale.service.js`, `domain/organisation.js`)

- Champ `groupement.parentId`. L'entité reprend le RCCM, le compte contribuable et, pour un transporteur, la carte de transporteur de sa mère.
- Elle hérite **dynamiquement** de la vérification de sa mère (`etatVerification`) : si la mère perd sa vérification, la filiale la perd aussi. Elle n'est active que si la mère est active et vérifiée ; sinon son compte est refusé avec le motif (« Cette entité sera active dès que le dossier de son entreprise mère aura été vérifié »).
- Elle est couverte par l'abonnement de sa mère, tient son propre compte et fait contrôler ses propres véhicules et chauffeurs.
- Une entité rattachée ne crée pas elle-même d'entité. Son responsable reçoit un compte et un code d'activation, dans la même transaction.
- La mère voit l'activité consolidée en agrégats (publications, mises en relation, transports, soldes), jamais l'identité des contreparties de ses filiales.
- Les écrans existants qui affichaient l'état de vérification brut (fiche du groupement, annuaire et supervision des groupements) affichent désormais l'état hérité.

### Intermédiaire de fret comme entreprise

- `TYPE_GROUPEMENT.INTERMEDIAIRE = 'intermediaire'`, libellé « Intermédiaire de fret » (même valeur que le lot b1).
- Nouvel espace `intermediaire` et deux rôles de compte : `intermediaire` (responsable) et `collaborateur_intermediaire` (sans administration des comptes ni création d'entité). Aucun droit de marché en propre.
- Les rôles existants `auxiliaire_affreteur` et `auxiliaire_transporteur` sont conservés tels quels (utilisateurs internes d'un groupement) ; seuls leur sont retirés les nouveaux droits d'organisation.

### Mandats (`services/mandat.service.js`, `domain/mandat.js`, entité `mandat`)

- Le mandant (responsable d'un affréteur ou d'un transporteur) choisit un intermédiaire dans l'annuaire des intermédiaires actifs (actifs, abonnés, dossier non refusé), coche le périmètre et fixe la période (366 jours au plus, pas de fin dans le passé, pas deux mandats actifs qui se recouvrent pour le même intermédiaire). Il peut retirer le mandat à tout moment : retrait définitif, motivé, notifié à l'intermédiaire.
- Périmètres : affréteur → « Déclarer du fret et publier des demandes », « Rechercher et réserver des véhicules » ; transporteur → « Proposer des véhicules sur les demandes publiées », « Accepter ou rejeter les réservations reçues ».
- Contexte délégué : `groupementId` du mandant, rôle `mandataire_affreteur` ou `mandataire_transporteur` (non attribuable à un compte), droits bornés par le périmètre et la période (`refusMandat`, appliqué par `access.js` à chaque décision, motif `hors_mandat`). Le mandat est relu à chaque décision : un retrait referme l'accès même à un écran déjà affiché.
- Ce que l'intermédiaire ne fait jamais : valider une mise en relation, répondre aux propositions faites à l'affréteur (lot b3, décision du mandant), voir les coordonnées ou l'identité des contreparties (`objetsLiberes` vide, `identiteLiberee` inchangé), voir le solde chiffré du mandant (il voit seulement « Provisionné » ou « À provisionner »), administrer les comptes ou les entités du mandant, ni répondre, au nom d'un transporteur, à une réservation que sa propre entreprise a préparée au nom d'un affréteur (refus dans `matching.service.js`).
- Traçabilité : chaque action du contexte délégué est journalisée avec `groupementId` du mandant, `mandatId` et `intermediaireGroupementId`, et la mention « Action d'un intermédiaire au nom du mandant (mandat MD-…) ». Le mandant la retrouve dans « Actions faites en votre nom ».
- Les appariements ne changent d'état que dans `matching.service.js` : l'intermédiaire passe par les mêmes fonctions avec son contexte délégué.

## Comptes de démonstration (mot de passe `demo2026`)

| Adresse | Rôle | Entreprise |
|---------|------|------------|
| `intermediaire@demo.invalid` | Intermédiaire de fret (responsable) | Fret Conseil Intermédiation DÉMO |
| `collaborateur.intermediaire@demo.invalid` | Collaborateur d'intermédiaire | Fret Conseil Intermédiation DÉMO |
| `agence.sanpedro@demo.invalid` | Transporteur | Trans Lagunes, agence de San-Pédro DÉMO (entité rattachée à Trans Lagunes) |
| `affreteur@demo.invalid` | Affréteur, mandant MD-2026-0001 | Cacao Lagunes Export DÉMO |
| `transporteur@demo.invalid` | Transporteur, mandant MD-2026-0002 | Trans Lagunes DÉMO |

Les données sont ajoutées par `js/seed-lot-b2.js` (idempotent, appelé au démarrage par une ligne).

## Parcours de démonstration

1. **Utilisateurs.** Connexion `affreteur@demo.invalid` › Paramètres › Utilisateurs et auxiliaires › « Ajouter un utilisateur ». Saisir un nom et une adresse, choisir « Auxiliaire d'affréteur », créer : le code s'affiche une seule fois. Se déconnecter, « Activer mon compte » sur l'écran de connexion, saisir l'adresse, le code et un mot de passe ; se connecter avec ce compte. Revenir en administrateur : désactiver puis réactiver le compte, réinitialiser son accès. Le rôle « Concessionnaire » n'est jamais proposé.
2. **Filiales.** Connexion `transporteur@demo.invalid` › Paramètres › Filiales et entités : l'agence de San-Pédro est active, avec une vérification héritée ; « Créer une entité rattachée » ouvre une nouvelle entité et le compte de son responsable.
3. **Désigner.** Connexion `affreteur@demo.invalid` › Paramètres › Intermédiaires de fret : le mandat MD-2026-0001 est en vigueur ; l'annuaire liste Fret Conseil Intermédiation ; « Retirer » ferme l'accès de l'intermédiaire.
4. **Agir au nom de l'affréteur.** Connexion `intermediaire@demo.invalid` › Mandants › Mes mandants › « Agir en son nom » sur Cacao Lagunes Export. Le bandeau rappelle le mandat. Déclarer un fret (Mon fret › Nouvelle déclaration), réserver un véhicule (Marché). Sur « À valider », les réservations acceptées sont visibles, l'identité du transporteur reste masquée et le bouton de validation est désactivé avec son motif. « Revenir à mon espace ».
5. **Agir au nom du transporteur.** « Agir en son nom » sur Trans Lagunes › Marché › Demandes de transport › « Proposer un véhicule ». Pour une réponse à une réservation : l'affréteur réserve d'abord une offre de Trans Lagunes depuis son propre compte, puis l'intermédiaire l'accepte ou la rejette dans « Réservations et propositions ».
6. **Traçabilité.** Revenir en `affreteur@demo.invalid` ou `transporteur@demo.invalid` › Paramètres › Intermédiaires de fret › « Actions faites en votre nom ».

## Fichiers partagés modifiés

`index.html` (feuille `css/lot-b2.css`, icônes Lucide `network`, `briefcase`, `user-plus`, `key-round`, `user-x`, `user-check`, `log-in`, `undo-2`, `pencil`, tracés exacts de `lucide-static@0.468.0`), `js/app.js` (routes, amorçage), `js/core/nav.js` (pages Paramètres, espace Intermédiaire), `js/core/layout.js` (bandeau du mandat, aide contextuelle, icônes des pages), `js/core/ui.js` (registre de débit sans solde chiffré), `js/domain/enums.js`, `roles.js`, `permissions.js`, `schema.js`, `access.js`, `js/seed.js` (compte de démonstration listé), `js/services/auth.service.js` (contexte délégué, filiale), `audit.service.js`, `matching.service.js`, `notification.service.js`, `verification.service.js`, `js/views/login.js`, `affreteur.js`, `dashboard-affreteur.js`, `transporteur.js`, `commun.js`, `supervision.js`, `annuaire-supervision.js`. Chaque ajout est repéré par un commentaire « Lot b2 ».

## Limites assumées

- Le contrôle du dossier d'un intermédiaire (pièces, décision) relève du lot b1 : l'annuaire exclut seulement un dossier refusé. De même, un affréteur ou un intermédiaire sans état de vérification écrit est tenu pour vérifié pour ses filiales, jusqu'à ce que le lot b1 écrive cet état.
- La validation par l'intermédiaire n'est pas proposée, même si le mandant le souhaitait : c'est le choix actuel du POC (l'acte qui engage les frais reste au mandant).
- La modification d'une demande publiée (démarche 42) attend le lot b3.
- Pas de rattachement d'une entreprise existante comme filiale : une entité rattachée se crée depuis l'entreprise mère.
- Côté DUT, rien n'est fait (hors périmètre de ce lot).
- Courriels et SMS simulés : le code d'activation est remis par l'administrateur, de la main à la main.
