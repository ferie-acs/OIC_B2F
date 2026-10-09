# Parcours utilisateur et navigation — POC B2F

> **Jalon J1 — conception.** Auteur : agent `ux-designer`, 24 septembre 2026.
> Documents liés : `02-design-system-b2f.md`, `03-specifications-ecrans.md`,
> maquette exécutable `maquettes/b2f-maquette.html`.
>
> Ce document décrit **ce que fait l'utilisateur**. Le rendu visuel se juge dans
> la maquette, pas ici.

---

## 1. Principe directeur

Le fil narratif du cadrage (`cadrage.md` § 5) n'est pas une suite d'écrans : c'est
une **négociation entre deux entreprises, arbitrée par une plateforme payante**.
La conception en tire trois conséquences.

| Principe | Traduction à l'écran |
|---|---|
| **La validation est une transaction, pas une confirmation.** | L'écran de validation montre les deux débits, les deux soldes et le solde résultant **avant** l'action. Aucune fenêtre « Êtes-vous sûr ? » qui cacherait le montant. |
| **Chaque partie doit savoir ce qu'attend l'autre.** | Tout état d'appariement est formulé du point de vue du lecteur : « en attente de votre réponse » côté transporteur, « en attente de la réponse du transporteur » côté affréteur. Jamais un statut brut. |
| **Un rôle de contrôle ne doit pas voir ce qu'il ne contrôle pas.** | L'espace DGTTC ne comporte aucune colonne « solde ». Ce n'est pas un masquage d'affichage : la donnée n'est pas servie à ce rôle. |

---

## 2. Le fil narratif, écran par écran

Le parcours de démonstration se déroule en sept actes. La maquette permet de les
rejouer dans l'ordre via le sélecteur de rôle.

| # | Acteur | Écran | Ce qui se passe | Statut produit |
|---|---|---|---|---|
| 1 | Affréteur | `Déclarer un fret` (3 étapes) | Déclaration du fret, puis demande de transport, puis lignes de marchandise. | `publiee` |
| 2 | Transporteur | `Publier une offre de véhicule` | Un véhicule disponible est annoncé sur un corridor et une fenêtre de dates. | `disponible` |
| 3 | Affréteur | `Rechercher un véhicule` → `Réserver` | L'affréteur filtre, compare, réserve pour **une** de ses demandes. | `reserver` |
| 4 | Transporteur | `Réservations reçues` → `Accepter` / `Rejeter` | Réponse du transporteur. Le rejet exige un motif. | `accepter` / `rejeter` |
| 5 | Affréteur | `À valider` | **Acte pivot.** Vérification des deux soldes, double débit, transmission des coordonnées. | `valider` |
| 6 | Les deux | `Mise en relation validée` | Coordonnées du transporteur, du véhicule et du chauffeur révélées à l'affréteur. | — |
| 7 | Transporteur puis affréteur | `Suivi du transport` | Étapes déclaratives horodatées, clôture par l'affréteur. | `cloture` |

### 2.1 Les deux sens du flux

Le système existant implémente les deux sens ; le POC les conserve, avec **un seul
mécanisme d'appariement** (écart délibéré n° 1).

```
SENS A — le transporteur publie, l'affréteur réserve   ← parcours de démonstration
  OffreVehicule (disponible) → réservation affréteur → réponse transporteur → validation affréteur

SENS B — l'affréteur publie, le transporteur propose
  DemandeTransport (publiée) → proposition transporteur → réservation affréteur → validation affréteur
```

Les deux convergent sur **le même écran de validation** et la même règle de double
débit. C'est le point qui rend l'unification tenable : la divergence du système
existant tenait à des chemins d'écran séparés, pas à une différence métier.

### 2.2 Les cinq cas d'échec à démontrer

Un POC qui ne montre que le chemin heureux ne prouve rien. Ces cinq situations
sont **maquettées** et doivent être implémentées :

| Cas | Écran | Message attendu |
|---|---|---|
| **Solde insuffisant** | `À valider` | Nomme la partie en défaut, chiffre le manque, indique la marche à suivre, précise que la réservation reste acquise. |
| **Auxiliaire tentant de valider** | `À valider` | Explique *pourquoi* c'est refusé (engagement financier du parent), pas seulement *que* c'est refusé. |
| **Rejet par le transporteur** | `Mes réservations` | Motif affiché à l'affréteur, action de repli proposée (« chercher un autre véhicule »). |
| **Retrait d'offre impossible** | `Mes offres publiées` | Bouton désactivé avec explication au survol, pas masqué. |
| **Véhicule non publiable** | `Véhicules` | Carte de transport expirée : le véhicule reste au parc mais n'apparaît pas sur le marché. Contrôle fait **à la publication**. |

### 2.3 Dates et fenêtres — règle de validation

| Règle | Comportement |
|---|---|
| Arrivée postérieure au départ | Erreur bloquante à la saisie, message sous le champ. |
| Départ dans le passé | Erreur bloquante à la publication, pas à la saisie du brouillon. |
| Demande dont la date de départ est dépassée | Signalée à l'affichage (calcul à la lecture, aucune tâche planifiée). |
| Fenêtre d'offre recouvrant la fenêtre de demande | Condition d'appariement — une offre hors fenêtre n'est pas proposée à la réservation. |

---

## 3. Navigation — deux niveaux

La structure reprend celle du POC DUT, avec **une correction**.

```
┌────┬───────────────────────┬──────────────────────────────────────────┐
│RAIL│      SIDEBAR          │              TOPBAR                      │
│70px│      248px utiles     ├──────────────────────────────────────────┤
│    │                       │                                          │
│ 🏠 │  Section              │              CONTENU                     │
│ 📦 │   · Page              │                                          │
│ 🔍 │   · Page              │                                          │
│ 🤝 │                       │                                          │
│ 💰 │  Section              │                                          │
│ ⚙️  │   · Page              │                                          │
└────┴───────────────────────┴──────────────────────────────────────────┘
        largeur totale 318 px
```

**La correction apportée au DUT.** Dans le POC DUT, le rail recopie chaque lien de
la barre latérale : les deux niveaux affichent la même chose, le rail ne sert
qu'à l'état replié. Avec cinq rôles et une trentaine d'écrans, cette duplication
ne tient plus.

**Dans B2F, le rail porte les *zones*, la barre latérale porte les *pages* de la
zone active.** Cliquer une icône du rail change de zone et ouvre sa première page.
C'est une navigation à deux niveaux réelle, et elle réduit la barre latérale à
trois à cinq entrées par zone — lisible sans repli.

### 3.1 Arborescence par rôle

Les mentions `J4` / `J5` désignent le jalon de réalisation ; tout le reste est J2–J3.

#### Affréteur

| Zone (rail) | Pages (barre latérale) |
|---|---|
| **Pilotage** | Tableau de bord · Notifications `J5` |
| **Mon fret** | Déclarations de fret · Nouvelle déclaration · Demandes de transport |
| **Marché** | Rechercher un véhicule · Mes réservations |
| **Mises en relation** | À valider · Mises en relation validées · Suivi des transports |
| **Compte** | Solde et mouvements · Abonnement `J5` |
| **Paramètres** | Fiche du groupement · Utilisateurs et auxiliaires |

#### Transporteur

| Zone (rail) | Pages |
|---|---|
| **Pilotage** | Tableau de bord · Notifications `J5` |
| **Ma flotte** | Véhicules · Chauffeurs · Mes offres publiées · Publier une offre |
| **Marché** | Demandes de transport · Réservations reçues |
| **Mises en relation** | Mises en relation validées · Suivi des transports · Générer un DUT `J5` |
| **Compte** | Solde et mouvements · Abonnement `J5` |
| **Paramètres** | Fiche du groupement · Utilisateurs et auxiliaires |

#### Auxiliaire

Hérite de l'espace du **groupement parent** — affréteur ou transporteur — privé
des actions engageant les finances. Signalé en permanence par un bandeau de
délégation en tête de contenu.

| Zone | Différence avec le parent |
|---|---|
| **Pilotage** | Tableau de bord recentré sur les dossiers préparés + tableau explicite du périmètre de délégation. |
| **Mon fret / Marché** | Identiques. |
| **Mises en relation** | `À valider` accessible en **lecture** ; l'action de validation est présente mais désactivée avec explication. |
| **Compte** | Solde du parent en consultation. Aucun crédit. |
| **Paramètres** | Absente. |

#### Concessionnaire — exploitant `J4`

| Zone | Pages |
|---|---|
| **Pilotage** | Tableau de bord d'activité |
| **Acteurs** | Groupements · Utilisateurs et rôles (matrice des 22 rôles) |
| **Finances** | Comptes et soldes · Catalogue de tarifs · Abonnements `J5` |
| **Marché** | Déclarations et offres · Mises en relation |
| **Journal** | Journal d'audit |

#### DGTTC — contrôle `J4`

| Zone | Pages |
|---|---|
| **Pilotage** | Tableau de bord national |
| **États de contrôle** | Déclarations et offres · Mises en relation |
| **Acteurs** | Transporteurs et affréteurs · Parc de véhicules |
| **Journal** | Journal d'audit (lecture) |

**Aucune zone « Finances ».** Le contrôleur n'accède pas aux soldes. C'est
l'arbitrage N3 rendu visible dans la structure même de la navigation.

### 3.2 Rôles de niveau 2 — déclinés

`Transporteur privé`, `Transporteur étranger` et `Partenaires` réutilisent
**l'espace Transporteur**. Les variations sont déclaratives et pilotées par la
matrice des droits, jamais par du code d'écran :

| Rôle | Variation |
|---|---|
| Transporteur privé | Zone `Marché` restreinte : pas de publication d'offre publique. Répond uniquement aux demandes. |
| Transporteur étranger | Champ « pays d'immatriculation » obligatoire sur les véhicules ; bandeau signalant le régime particulier. |
| Partenaires | Zones `Ma flotte` et `Mises en relation` en lecture ; accès à `Générer un DUT`. Aucune zone `Marché`. |

### 3.3 Rôles de niveau 3 — modélisés

Les ~14 profils de back-office sont déclarés dans la matrice et **leur menu est
généré à partir de leurs permissions**. Sans permission métier attribuée, un tel
rôle se connecte sur un espace minimal : tableau de bord vide explicite, plus les
pages auxquelles sa matrice lui donne droit. C'est volontaire et doit être dit en
démonstration : *« le rôle existe, il est administrable, son écran métier n'est pas
au périmètre du POC. »*

### 3.4 Routes

Convention de routage, alignée sur le POC DUT (`#/espace/page`).

```
#/login
#/affreteur/dashboard        #/affreteur/declarations     #/affreteur/declarations/nouvelle/:etape
#/affreteur/demandes         #/affreteur/marche           #/affreteur/reservations
#/affreteur/validation/:id   #/affreteur/relations/:id    #/affreteur/suivi
#/affreteur/compte           #/affreteur/abonnement
#/affreteur/groupement       #/affreteur/utilisateurs

#/transporteur/dashboard     #/transporteur/vehicules     #/transporteur/chauffeurs
#/transporteur/offres        #/transporteur/offres/nouvelle
#/transporteur/marche        #/transporteur/reservations
#/transporteur/relations/:id #/transporteur/suivi         #/transporteur/dut/:id

#/concessionnaire/dashboard  #/concessionnaire/groupements #/concessionnaire/roles
#/concessionnaire/comptes    #/concessionnaire/tarifs      #/concessionnaire/abonnements
#/concessionnaire/marche     #/concessionnaire/relations   #/concessionnaire/audit

#/dgttc/dashboard            #/dgttc/etats                #/dgttc/relations
#/dgttc/acteurs              #/dgttc/parc                 #/dgttc/audit
```

L'auxiliaire emprunte les routes de son parent (`#/affreteur/*` ou
`#/transporteur/*`) : c'est la matrice des droits qui restreint, pas le chemin.
Une route non autorisée renvoie un **refus explicite** nommant le rôle et le droit
manquant — jamais une redirection silencieuse vers l'accueil, qui laisse
l'utilisateur croire à un bug.

---

## 4. États et micro-copie

### 4.1 Vocabulaire des statuts

Les statuts du système existant sont conservés comme **valeurs stockées** (fidélité
au legacy) mais **jamais affichés bruts**. Correspondance obligatoire :

| Valeur stockée | Affiché à l'affréteur | Affiché au transporteur |
|---|---|---|
| `publiee` | Publiée — en attente d'un véhicule | Demande ouverte |
| `disponible` | Véhicule disponible | Offre publiée |
| `reserver` | Réservée — en attente de la réponse du transporteur | **En attente de votre réponse** |
| `accepter` | **Acceptée — à vous de valider** | Acceptée — en attente de validation de l'affréteur |
| `rejeter` | Rejetée — *motif* | Rejetée par vous — *motif* |
| `annuler` | Annulée | Annulée |
| `valider` | Validée — mise en relation effective | Validée — mise en relation effective |

**Règle** : un statut se lit toujours comme *ce que le lecteur doit faire ou
attendre*. Le même état porte deux libellés selon le rôle ; c'est voulu.

### 4.2 États du transport (M6)

Le système existant ne formalise pas ces étapes (`etat_dmde` est flou). Le POC les
**propose** — c'est un écart à signaler en démonstration.

```
Validé → À quai → Chargé → En route → Livré → Clôturé
```

| Étape | Qui la déclare | Règle |
|---|---|---|
| À quai, Chargé, En route, Livré | Transporteur | Aucun saut d'étape, aucun retour en arrière. |
| Clôturé | **Affréteur** | Impossible avant « Livré ». |
| Incident | Transporteur | S'ajoute au journal sans changer l'étape en cours. |

### 4.3 États vides

Chaque liste a un état vide **rédigé**, jamais un tableau vide :

| Écran | Message |
|---|---|
| Recherche de véhicules, 0 résultat | « Aucun véhicule ne correspond à ces critères sur cette période. Élargissez la fenêtre de dates ou publiez votre demande : les transporteurs la verront. » + action. |
| Réservations reçues, 0 | « Aucune réservation en attente. Publiez des offres sur les corridors que vous desservez pour être trouvé. » |
| Mouvements de compte, 0 | « Aucun mouvement. Votre compte doit être crédité par le concessionnaire avant de pouvoir valider une mise en relation. » |
| Journal d'audit filtré, 0 | « Aucun événement sur cette période. » |

### 4.4 Messages d'erreur

Règle reprise du POC DUT : **explicites et bloquants, jamais silencieux**. Un
message d'erreur contient trois choses — ce qui ne va pas, pourquoi, et ce qu'il
faut faire.

> ❌ « Solde insuffisant. »
> ✅ « Validation impossible — solde insuffisant. Le compte d'Ivoire Cacao Export
> affiche 8 000 F CFA et les frais s'élèvent à 15 000 F CFA. Il manque 7 000 F CFA.
> Faites créditer le compte auprès du concessionnaire, puis revenez valider. La
> réservation reste acquise jusqu'au 02/10/2026. »

---

## 5. Ce qui reste ouvert

| # | Question | Pourquoi elle n'est pas tranchée ici |
|---|---|---|
| **U1** | La signature visuelle retenue (rail marine + teal) est-elle validée&nbsp;? | Décision d'identité — voir `02-design-system-b2f.md` § 2. Une option de repli est proposée. |
| **U2** | Les six étapes du suivi de transport correspondent-elles à la pratique&nbsp;? | Le système existant ne les formalise pas. Ce sont des **propositions**, à confronter au métier. |
| **U3** | L'auxiliaire doit-il aussi être privé du **retrait d'offre** et de l'**annulation**&nbsp;? | Le plan ne tranche que la validation. Proposition retenue : il peut annuler avant validation, car cela n'engage rien. À confirmer. |
| **U4** | La durée de réservation d'une offre est-elle bornée&nbsp;? | Rien dans le système existant. Sans borne, une réservation sans réponse bloque un véhicule indéfiniment. Proposition : signalement visuel après 48 h, sans expiration automatique. |
