# Lot b3 — Marché, flotte, attestation et contrôle sur route (Bourse de Fret)

Ce lot rend utilisables, de bout en bout dans le POC, huit démarches que l'audit avait classées
« Absent » ou « Partiel ». Pour la démarche commune aux deux plateformes (journaliser chaque
vérification), seul le côté Bourse de Fret est traité ici.

## Démarches traitées

| N° | Acteur | Démarche | Résultat |
|---|---|---|---|
| 8 | Affréteur | Publier, modifier, annuler une demande de transport | Fait : modification et republication ajoutées |
| 12 | Affréteur | Répondre aux propositions des transporteurs (sens B) | Fait |
| 26 | Transporteur | Enregistrer et modifier ses chauffeurs | Fait : fiche complète |
| 27 | Transporteur | Retirer un chauffeur parti | Fait |
| 28 | Transporteur | Publier une offre de transport | Fait : modification et duplication ajoutées |
| 32 | Transporteur | Imprimer l'attestation de bourse de fret | Fait (PDF à QR code) |
| 133 | Contrôle sur route | Vérifier une attestation par QR code | Fait |
| 135 | Contrôle sur route | Journaliser chaque vérification | Fait (côté Bourse de Fret) |

## Écrans ajoutés ou modifiés

| Route | Rôle | Entrée de menu | Contenu |
|---|---|---|---|
| `#/affreteur/demandes` | Affréteur | Mon fret › Demandes de transport | Boutons **Modifier** et **Republier**. Une action impossible reste visible, avec son motif |
| `#/affreteur/demandes/<id>` | Affréteur | — | Formulaire de modification (fret, besoin, marchandises) et historique de la demande |
| `#/affreteur/reservations` | Affréteur, auxiliaire | Mises en relation › Mes réservations | Filtre « Propositions reçues », bandeau d'alerte, boutons **Accepter** / **Refuser** (motif obligatoire), **Écarter** pour l'auxiliaire |
| `#/affreteur/validation/<id>` | Affréteur | — | Écran existant ; les libellés s'adaptent au sens B (« Proposition reçue », « Vous avez accepté ») |
| `#/transporteur/chauffeurs` | Transporteur | Ma flotte › Chauffeurs | Onglets « En activité » et « Retirés », alertes de fiche, **Ouvrir la fiche**, **Retirer**, **Réactiver** |
| `#/transporteur/offres` | Transporteur | Ma flotte › Mes disponibilités | Boutons **Modifier** et **Dupliquer** sur chaque carte |
| `#/transporteur/offres/nouvelle?modifier=<id>` et `?dupliquer=<id>` | Transporteur | — | Formulaire existant, prérempli |
| `#/transporteur/attestations` | Transporteur (le partenaire peut consulter) | Mises en relation › Attestations de bourse de fret | Transports conclus, aperçu du document, **Émettre**, **Télécharger le PDF**, **Annuler l'attestation** |
| `#/minimal/controle` | Agent de contrôle sur route | Accueil › Vérifier une attestation | Saisie du code (ou scan par la caméra si le navigateur le permet), lieu, observation, verdict |
| `#/minimal/controles` | Agent de contrôle sur route | Accueil › Mes contrôles | Indicateurs et historique des contrôles de l'agent connecté, avec filtres |
| `#/verifier/<jeton>` | Public (sans connexion) | — | Page ouverte par le QR code : verdict et strict nécessaire au contrôle |

Nouveau rôle : `agent_controle_route` (niveau 3, espace minimal). Il ne reçoit que deux droits :
`controle.verifier` et `controle.historique` (portée « propre »). Il n'a aucun droit sur le marché,
les comptes ou les coordonnées.

Nouveaux droits : `demande.modifier` (affréteur), `attestation.lire` (transporteur, partenaire),
`attestation.generer` (transporteur), `controle.verifier` et `controle.historique` (agent de contrôle).

## Règles métier

**Propositions des transporteurs (sens B).** Seul `matching.service.js` change l'état d'un
appariement. La vue appelle `matching.repondre()`, qui passe par la machine à états
`matching.state.js`. Les boutons interdits sont désactivés et le motif fourni par
`deciderSurAppariement()` est affiché. Un refus exige un motif, pris dans la liste propre à
l'affréteur : véhicule inadapté, dates incompatibles, autre véhicule retenu, prix trop élevé.
La précision passe par le filtre de coordonnées. La réponse est notifiée au transporteur qui a fait
la proposition. Après acceptation, la validation et le débit suivent le parcours du sens A.

**Demandes.**
- Modification possible tant que la demande est publiée et qu'aucune réservation ni proposition
  n'est engagée. Ce contrôle est refait dans la transaction.
- Le libellé et le corridor d'un fret qui porte plusieurs demandes ne se modifient pas depuis
  l'une d'elles.
- Republication d'une demande annulée, ou publiée dont le départ est passé, avec de nouvelles dates.
- Chaque modification et chaque republication est inscrite dans `historique`. Seuls la nature des
  champs changés, l'auteur et la date y sont conservés, jamais les valeurs. Elle est aussi
  inscrite au journal d'audit (`demande_modifiee`, `demande_republiee`).
- Le filtre de coordonnées (`texte.js`) s'applique au libellé, à l'observation et aux contraintes.

**Offres.**
- La modification n'est possible que pour une offre disponible sans réservation en cours.
  Elle passe par les mêmes contrôles que la publication (`preparerOffre`).
- « Partager » une offre, c'est publier une copie ajustable sous une nouvelle référence, avec un
  lien vers l'offre d'origine (`dupliqueeDeOffreId`). Cette copie est journalisée
  (`offre_dupliquee`).

**Chauffeurs.**
- Fiche exigée à la création :
  - pièce d'identité : type, numéro, dates de délivrance et d'expiration ;
  - nationalité et date de naissance (âge minimal de 18 ans) ;
  - catégories de permis (A à E) et échéance du permis.
- Facultatifs : téléphone, CACR, et une photo dont seules les métadonnées sont conservées.
- Tous ces champs sont classés `IDENTITE` dans `schema.js`.
- Une pièce modifiée après contrôle perd sa vérification (correctif anti-fraude n° 3).
  L'agent d'activation refuse d'attester une pièce expirée ou un chauffeur retiré.
- Un chauffeur ne peut pas être désigné pour une mission si son permis est échu, si sa pièce est
  expirée, ou si sa catégorie de permis est incompatible avec le véhicule. Par hypothèse du POC,
  C est exigée au-delà de 3,5 t de PTAC, et E s'y ajoute à partir de 4 essieux.
- **Retrait** : désactivation avec une date de départ et un motif.
  - Il est refusé tant que le chauffeur est désigné sur une réservation ou sur un transport non
    livré.
  - Les disponibilités ouvertes perdent leur chauffeur pressenti. L'écran le dit avant de
    confirmer.
  - Le chauffeur n'est jamais supprimé. Ses mouvements (retrait, réactivation) sont conservés et
    journalisés.

**Attestation de bourse de fret.**
- Émise par le transporteur pour une mise en relation **validée et payée par les deux parties**.
- Une seule attestation en vigueur par transport. L'annulation exige un motif. Une nouvelle
  attestation porte un nouveau code.
- Référence `ABF-AAAA-NNNN`.
- Le QR code pointe vers `#/verifier/<jeton>` :
  - le jeton est tiré au hasard (120 bits, alphabet sans caractères ambigus) et classé `SYSTEME` ;
  - il n'est jamais projeté : seul le transporteur titulaire le reçoit, pour l'impression ;
  - l'identifiant et la référence ne figurent pas dans le lien.
- Validité (hypothèse du POC, à confirmer par l'OIC) : de l'émission jusqu'à l'arrivée prévue
  plus 72 heures. L'expiration est calculée à la lecture.
- Le PDF (`attestation-pdf.js`) reprend la mise en page de la fiche DUT imprimable.

**Contrôle sur route.**
- Chaque vérification est enregistrée dans la collection `controles`, en ajout seul, et inscrite
  au journal d'audit (`attestation_verifiee`), quel que soit le verdict :
  valide, expirée, annulée ou code inconnu.
- La fiche affichée se limite à : référence, immatriculation, trajet, dates, et état de la carte de
  transport, calculé par le service de contrôle existant (`controle.service.js`). Aucune
  coordonnée des parties n'y figure, ni aucun montant.
- La page publique reste ouverte à tout porteur du QR, comme dans le système existant. Ses
  vérifications sont journalisées au nom de la plateforme. Un agent connecté qui ouvre le QR voit
  le contrôle à son nom.

## Comptes de démonstration (mot de passe `demo2026`)

| Compte | Rôle | Utilité |
|---|---|---|
| `affreteur@demo.invalid` | Affréteur | Propositions reçues, modification et republication de demandes |
| `auxiliaire@demo.invalid` | Auxiliaire d'affréteur | Ne peut pas accepter une proposition, peut l'écarter |
| `transporteur@demo.invalid` | Transporteur | Chauffeurs, offres, attestation |
| `controle@demo.invalid` | Agent de contrôle sur route (nouveau) | Vérification et historique |

Données ajoutées par `js/seed-lot-b3.js` (idempotent, tout est marqué DÉMO) :
- l'agent de contrôle ;
- les fiches d'identité des chauffeurs existants ;
- un chauffeur retiré ;
- deux camions contrôlés ;
- une proposition de transporteur sur `DT-B3-0001` ;
- une demande expirée `DT-B3-0002` ;
- une mise en relation validée et payée sur `DT-B3-0003`, avec un transport en route et
  l'attestation `ABF-…-0001`.

Les scénarios sont déroulés par les services, sans écriture d'état à la main.

## Démonstration pas à pas

1. **Transporteur** — Ouvrir *Mises en relation › Attestations de bourse de fret*. Télécharger le
   PDF et noter le code de vérification imprimé sous le QR code.
2. **Transporteur** — Ouvrir *Ma flotte › Chauffeurs*, puis *Ajouter un chauffeur*. Enregistrer
   une fiche incomplète : elle est refusée avec la liste des champs manquants.
3. **Transporteur** — Sur DIALLO Amadou, cliquer *Retirer* : les disponibilités concernées sont
   annoncées. Saisir une date et un motif. Le chauffeur passe dans l'onglet « Retirés » et ne
   figure plus dans le formulaire de disponibilité. Le réactiver.
4. **Transporteur** — Ouvrir *Mes disponibilités*. Cliquer *Dupliquer* sur une offre, ajuster les
   dates, publier la copie. Cliquer *Modifier* sur une offre disponible. Sur une offre réservée, le
   bouton reste grisé et son motif est affiché.
5. **Agent de contrôle** (`controle@demo.invalid`) — Ouvrir *Vérifier une attestation*. Saisir le
   code : le verdict est « authentique et en vigueur ». Saisir un code inventé : le verdict est
   « code inconnu ». Ouvrir *Mes contrôles* : les deux vérifications y figurent.
6. **Sans connexion** — Ouvrir l'adresse du QR code (`#/verifier/<code sans tirets>`) : même
   verdict, sans aucune coordonnée.
7. **Transporteur** — Annuler l'attestation avec un motif. **Agent** — Vérifier de nouveau : le
   verdict est « annulée ».
8. **Affréteur** — Ouvrir *Mes réservations* : le bandeau signale une proposition. Ouvrir
   *Voir les propositions*.
   - *Refuser* demande un motif ; une précision contenant un numéro de téléphone est refusée.
   - *Accepter* conduit à l'écran de validation, puis au débit.
9. **Affréteur** — Ouvrir *Mon fret › Demandes de transport*.
   - *Modifier* une demande publiée sans réservation ; l'historique apparaît sous le formulaire.
   - *Republier* `DT-B3-0002`, dont la date est dépassée, avec de nouvelles dates.

## Fichiers

Nouveaux fichiers :
- `js/domain/attestation.regles.js`, `js/domain/chauffeur.regles.js` ;
- `js/core/qr.js` (encodeur QR local, sans dépendance) ;
- `js/services/attestation.service.js`, `attestation-pdf.js`, `controle-route.service.js`,
  `chauffeur.service.js`, `demande.service.js`, `offre-gestion.service.js` ;
- `js/views/attestations.js`, `controle-route.js`, `chauffeurs-transporteur.js`,
  `chauffeur-formulaire.js`, `demandes-affreteur.js`, `propositions-affreteur.js` ;
- `js/seed-lot-b3.js`, `css/lot-b3.css`, `tests/lot-b3.test.mjs`.

Fichiers partagés modifiés : chaque ajout est placé dans un bloc commenté « Lot b3 », en fin de
liste.

| Fichier | Ajout |
|---|---|
| `index.html` | Feuille de style et 10 icônes Lucide 0.468.0 |
| `js/app.js` | Routes et appel d'amorçage |
| `js/core/router.js` | Pages publiques |
| `js/core/nav.js` | Entrées de menu |
| `js/core/layout.js` | Note latérale du nouveau rôle |
| `js/domain/enums.js` | Constantes et libellés du lot |
| `js/domain/permissions.js` | Droits et matrice |
| `js/domain/roles.js` | Rôle `agent_controle_route` |
| `js/domain/schema.js` | Entités `attestation` et `controle`, champs des demandes, offres et chauffeurs |
| `js/seed.js` | Compte de démonstration de l'agent |

Points de branchement dans des fichiers existants :
- `matching.service.js` : notification de la réponse à l'initiateur en sens B ;
- `notification.service.js` : trois gabarits ;
- `verification.service.js` : pièce d'identité contrôlée ;
- `flotte.service.js` : contrôles de préparation d'offre partagés, aptitude du chauffeur ;
- `affreteur.js`, `transporteur.js`, `reservations-affreteur.js`, `flotte-formulaires.js`,
  `commun.js` : renvois vers les nouvelles vues.

## Limites assumées

- **Paiement.** Il est simulé, comme dans tout le POC. L'attestation vérifie seulement que les deux
  opérations de frais existent.
- **Hypothèses à confirmer par l'OIC.** La durée de validité de l'attestation (arrivée prévue plus
  72 heures) et la règle de correspondance entre catégorie de permis et véhicule sont des
  hypothèses du POC.
- **Scan par la caméra.** Il n'est proposé que si le navigateur dispose de `BarcodeDetector`.
  Sinon le code se saisit, ou une douchette de lecture remplit le champ.
- **Adresse du QR code.** Elle reprend l'adresse du site en cours. Imprimée depuis `localhost`, elle
  n'est lisible que sur ce poste.
- **Photo du chauffeur.** Seules ses métadonnées (nom, type, taille) sont conservées : aucun fichier
  n'est stocké dans le navigateur.
- **Supervision.** La supervision des contrôles par l'OIC et la DGTTC lit le journal d'audit
  existant. Aucun nouvel écran de supervision n'a été ajouté : il relève du lot b5.
- **Statut d'une offre proposée.** Sur la carte d'une offre proposée par le transporteur (sens B),
  le statut générique de l'offre reste « Réservée — en attente de votre réponse ». Le libellé
  exact figure côté affréteur et dans les notifications.

## Intégration du 13 octobre 2026

Cette fiche décrit le lot tel qu'il a été livré. À l'intégration :

- Défaut levé : la carte d'une offre proposée par son transporteur (sens B) lit « Proposée — en attente de la réponse de l'affréteur » (`STATUT_OFFRE_PROPOSEE`, statut affiché ; l'état stocké reste `reservee`).
- Les pages « Attestations », « Vérifier une attestation » et « Mes contrôles » ont leurs icônes propres (`qr-code`, `scan-line`, `history`).
