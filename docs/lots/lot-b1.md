# Lot b1 — Entrée dans la plateforme (B2F)

Inscription en ligne, dépôt du dossier, vérification et activation, mot de passe,
messages sortants (courriels et SMS simulés). Pour les démarches « Les deux »,
seul le côté Bourse de Fret est traité.

## 1. Écrans ajoutés

| Écran | Route | Rôles | Accès |
|---|---|---|---|
| Inscription d'une entreprise (3 étapes) | `#/inscription` (`?type=affreteur\|transporteur\|intermediaire`) | public | lien « Inscrire mon entreprise » de la connexion, entrée « S'inscrire » du menu public, fenêtre « Inscrivez-vous » d'une annonce du marché |
| Mot de passe oublié (demande, puis code) | `#/mot-de-passe-oublie` | public | lien « Mot de passe oublié ? » de la connexion |
| Boîte de réception simulée | `#/boite-simulee` | public (outil de démonstration) | note de la connexion, pages publiques |
| Mon dossier | `#/affreteur/dossier`, `#/transporteur/dossier` | affréteur, transporteur et leurs auxiliaires, intermédiaire de fret (`inscription.lire`) | menu « Mon compte » |
| Mon profil | `#/<espace>/profil` (5 espaces) | tout utilisateur connecté | menu « Mon compte », bloc d'identité de la barre supérieure, icône de la barre latérale |
| Mes messages | `#/<espace>/messages` (5 espaces) | tout utilisateur connecté | menu « Mon compte », icône enveloppe de la barre supérieure |
| Vérification et activation : file | `#/minimal/verifications` | `activation_inscription` (transporteurs), `activation_inscription_affreteur` (affréteurs, intermédiaires) — droit `inscription.activer` | menu « Accueil » de l'espace minimal |
| Vérification et activation : dossier d'une entreprise | `#/minimal/verifications/<groupementId>` | idem | bouton « Ouvrir le dossier » |
| Messages envoyés (journal et envoi) | `#/concessionnaire/messagerie` | `concessionnaire` (`message.journal`, `message.envoyer`) | zone « Messagerie » |

L'écran existant de vérification des transporteurs (`js/views/verifications.js`,
`js/services/verification.service.js`) est **étendu**, pas doublé : la même file
sert les trois types, et le contrôle des véhicules et chauffeurs y reste.

## 2. Règles métier

**Inscription** (`js/domain/inscription.js`, `js/services/inscription.service.js`)
- Formulaire piloté par configuration : `TYPES_INSCRIPTION` (type, rôle du
  responsable, agents compétents, champs propres, pièces requises et facultatives),
  `CHAMPS_ENTREPRISE`, `CHAMPS_RESPONSABLE`. Ajouter un type = une entrée de
  configuration + une valeur de `TYPE_GROUPEMENT` et son libellé.
- Types : affréteur (carte de chargeur), transporteur (carte de transporteur et
  échéance), intermédiaire de fret `TYPE_GROUPEMENT.INTERMEDIAIRE = 'intermediaire'`,
  libellé « Intermédiaire de fret » (agrément et échéance). Le responsable d'un
  intermédiaire reçoit le rôle existant `auxiliaire_affreteur` (comportement du
  système en service) ; le bandeau et l'aide le présentent comme intermédiaire,
  pas comme sous-compte.
- Anti-doublon : adresse de connexion, RCCM ou compte contribuable déjà connus
  (comparaison normalisée) = refus avec message clair, tentative journalisée.
- Mot de passe : 8 caractères au moins, une lettre et un chiffre. Pièce ou carte
  échue refusée. Attestation d'exactitude obligatoire.

**Compte en attente d'activation** (`decider()` dans `js/domain/access.js`)
- Tant que l'inscription n'est pas activée, seuls `inscription.lire` et
  `inscription.deposer` sont accordés ; tout autre droit est refusé avec le motif
  `inscription_en_attente`. Le menu ne montre que « Mon compte ». Les groupements
  antérieurs (sans `inscriptionEtat`) sont réputés activés : rien ne change pour eux.
- Mon dossier : dépôt par pièce (métadonnées seulement : nom, type, taille, date ;
  PDF, JPEG ou PNG, 5 Mo au plus ; échéance exigée pour les pièces qui en ont),
  remplacement avec historique, retrait d'une pièce non contrôlée, commentaires du
  contrôle, échanges avec l'OIC, transmission du dossier complété.
- Fiche : modifiable librement avant activation ; **après activation**, les
  coordonnées s'appliquent, les données d'identité forment une demande soumise à
  l'agent (l'identité vérifiée reste en vigueur jusqu'à sa décision). Inscription
  refusée : dossier en lecture seule.

**Agent d'activation** (`js/services/verification.service.js`, bloc « Lot b1 »)
- Chaque agent ne voit et ne traite que les types que la configuration lui
  attribue ; lecture sans téléphone, courriel ni adresse.
- Décision pièce par pièce (conforme / non conforme avec motif obligatoire ; pièce
  échue jamais conforme), demande de complément, refus motivé, décision sur une
  modification d'identité (un numéro d'une autre entreprise n'est jamais accepté).
- **Activation** impossible tant qu'une pièce obligatoire n'est pas conforme, et
  **par une autre personne que celle qui a déclaré les pièces conformes** (quatre
  yeux, modèle de `saisirCredit` / `validerCredit`). Elle attribue le code
  `BFCI-AAAA-NNNNN`, ouvre une période d'abonnement d'un an au tarif
  `ABONNEMENT_ANNUEL` du catalogue, envoie le message d'activation (courriel et
  SMS) ; pour un transporteur, elle prononce aussi la vérification du dossier.
  Le contrôle des véhicules et chauffeurs s'affiche après l'activation.
- Requalification (nouveau type, champs propres exigés, motif, rôles des
  utilisateurs adaptés, trace et message) ; contact de l'entreprise depuis son
  dossier, à l'adresse enregistrée de chaque utilisateur.

**Mot de passe** (`js/services/profil.service.js`)
- Code à 6 chiffres envoyé **à l'adresse enregistrée du compte**, jamais à une
  adresse saisie ; seule son empreinte est conservée ; valable 15 minutes ; usage
  unique ; invalidé après 5 essais ; un seul code valable à la fois ; 3 demandes au
  plus par période. **Le compte n'est pas bloqué** : l'ancien mot de passe reste
  valable jusqu'à la définition du nouveau. Réponse et coût de calcul identiques
  que l'adresse existe ou non ; message d'échec unique.
- Mon profil : changement de mot de passe avec mot de passe actuel exigé
  (message de confirmation envoyé) ; nom, prénoms, fonction, téléphone. L'adresse
  de connexion n'y est pas modifiable (elle reçoit les codes de récupération).

**Messagerie** (`js/services/messagerie.service.js`) — service unique de l'application
- `envoyerModele()` (gabarits de la plateforme) et `envoyerAuGroupement()` sont les
  points d'entrée des autres lots. Adresse toujours lue sur le compte ; sans
  adresse ou numéro : « Non remis ». Rien ne quitte le navigateur ; les écrans le
  disent (« envoi simulé »).
- Journal de l'administrateur OIC : filtres canal, destinataire, période ; sans les
  adresses (classification `contact`), sans le code de récupération (`systeme`).
- Envoi libre à une entreprise ou à une catégorie (toutes, par type, en attente,
  activées) ; l'agent d'activation n'envoie qu'à une entreprise, depuis son dossier.
- Chaque utilisateur retrouve ses propres messages (« Mes messages »).
- Toutes ces actions sont journalisées (17 événements d'audit ajoutés).

## 3. Comptes de démonstration (mot de passe `demo2026`)

| Compte | Rôle | Situation |
|---|---|---|
| `inscrit.affreteur@demo.invalid` | affréteur | Négoce Atlantique DÉMO, en attente : 2 pièces conformes, carte de chargeur à contrôler |
| `inscrit.transporteur@demo.invalid` | transporteur | Savane Express Transport DÉMO, complément demandé (assurance non conforme) |
| `inscrit.intermediaire@demo.invalid` | auxiliaire d'affréteur | Lagune Transit Services DÉMO (intermédiaire), 3 pièces à contrôler |
| `activation.affreteur@demo.invalid` | agent d'activation affréteur | a déclaré conformes les pièces de Négoce Atlantique |
| `activation.affreteur2@demo.invalid` | agent d'activation affréteur | second agent (quatre yeux) |
| `activation@demo.invalid`, `activation2@demo.invalid` | agent d'activation (transporteurs) | |
| `concessionnaire@demo.invalid` | administrateur OIC | journal et envois |

Données : `js/seed-lot-b1.js`, appelé par une ligne de `js/app.js`, idempotent.

## 4. Parcours de démonstration

1. Connexion → « Inscrire mon entreprise » → choisir « Intermédiaire de fret »,
   remplir les trois étapes → la session s'ouvre sur « Mon dossier », seul
   espace accessible. Déposer une pièce (n'importe quel PDF : seules ses
   caractéristiques sont enregistrées). Réessayer avec le même RCCM : refus.
2. `activation.affreteur` → « Vérification et activation » → Négoce Atlantique →
   « Conforme » sur la carte de chargeur : le bandeau indique que l'activation
   revient à un autre agent.
3. `activation.affreteur2` → même dossier → « Activer le compte » : code BFCI,
   abonnement d'un an, message parti.
4. `inscrit.affreteur` → accès complet ; « Mes messages » montre l'activation.
5. `inscrit.transporteur` → déposer une nouvelle attestation d'assurance →
   « Transmettre mon dossier complété ». `activation@demo.invalid` reprend le dossier.
6. Connexion → « Mot de passe oublié ? » → `affreteur@demo.invalid` → ouvrir la
   boîte de réception simulée dans un autre onglet, lire le code → définir le
   nouveau mot de passe → se connecter avec lui.
7. `concessionnaire` → « Messagerie » → filtrer, puis « Envoyer un message » à la
   catégorie « Intermédiaires de fret ».

## 5. Fichiers partagés modifiés (blocs « Lot b1 »)

`index.html` (feuille `css/lot-b1.css`, 7 icônes Lucide 0.468.0), `js/app.js`
(routes, amorçage), `js/core/router.js` (`declarerPublique`), `js/core/nav.js`
(zones « Mon compte » et « Messagerie », pages personnelles), `js/core/layout.js`
(liens profil et messages, aides et bandeau de l'intermédiaire),
`js/core/menu-public.js`, `js/core/accueil-offres.js` (la demande simulée en
LocalStorage cède la place à l'inscription réelle), `js/core/ui.js` (tons des
badges), `js/domain/enums.js`, `permissions.js` (5 droits, matrice des agents et
du concessionnaire), `access.js`, `schema.js` (champs du groupement, entités
`piece`, `message`, `reinitialisation`), `js/services/auth.service.js`,
`js/views/login.js`, `js/views/commun.js`.

## 6. Limites assumées

- Les fichiers ne sont ni transmis ni conservés ; l'agent contrôle sur la foi des
  caractéristiques déclarées.
- La **boîte de réception simulée** est publique et montre les codes de
  récupération des sept derniers jours : c'est le substitut de la messagerie de
  chaque destinataire, signalé comme tel à l'écran ; elle n'existerait pas en
  production.
- L'intermédiaire de fret activé n'a pas encore de chargeur mandant : les mandats
  relèvent du lot b2. Les utilisateurs internes et filiales (b2), le réabonnement
  et les paiements (b4), l'administration des groupements (b5) ne sont pas traités.
- Le changement de l'adresse de connexion n'est pas proposé (il exigerait une
  confirmation par l'ancienne et la nouvelle adresse).
- Côté DUT, rien n'est fait dans ce lot.
