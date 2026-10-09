# Spécification des écrans — POC B2F

> **Jalon J1 — conception.** Auteur : agent `ux-designer`, 24 septembre 2026.
> Le rendu se juge sur `maquettes/b2f-maquette.html`. Ce document fixe **les
> champs, les règles et les messages** — ce qu'une maquette ne peut pas porter.
>
> Portée : écrans **J2–J3** spécifiés en détail ; écrans **J4** spécifiés au
> niveau du contenu ; écrans **J5** cadrés seulement.

Convention : `M2.1` renvoie au récit utilisateur du `plan-suivi.md` § 4.

---

## A — Écrans communs

### A.1 Connexion · `#/login`

| Élément | Détail |
|---|---|
| Structure | Deux colonnes : panneau d'identité à gauche, carte de connexion à droite. Sous 800 px, colonne unique, panneau d'identité réduit. |
| Champs | Adresse électronique (`type=email`, `autocomplete=username`), mot de passe (`autocomplete=current-password`, bouton afficher/masquer). |
| Comptes de démonstration | Cinq boutons, un par rôle de niveau 1, chacun marqué « DÉMO ». Ils **remplissent et soumettent** le formulaire — ils ne contournent pas l'authentification. |
| Abonnement expiré (`M10.2`) | À la connexion, si l'abonnement du groupement est échu : redirection vers `#/{espace}/abonnement` avec bandeau d'erreur nommant la date d'expiration. **Aucun autre écran n'est accessible.** Test automatisé requis. |
| Erreur d'identifiants | Message unique et non discriminant : « Identifiants incorrects. » Ne jamais indiquer si l'adresse existe. |

### A.2 Shell applicatif

| Élément | Détail |
|---|---|
| Rail (70 px) | Zones du rôle. Pastille active en `aria-current="true"`, marqueur teal à gauche de l'icône active. Dernière icône : logotype du produit, non cliquable, `title` explicite. |
| Barre latérale (248 px utiles) | Nom du produit, étiquette « Mise en relation », sections et pages de la zone active, encadré d'aide contextuel au rôle, pied avec identité et déconnexion. |
| Barre supérieure (78 px) | Fil d'Ariane · recherche globale (raccourci `/`) · étiquette de rôle · bascule de thème · notifications · profil. |
| Bandeau de délégation | Affiché en tête de contenu **sur tous les écrans** pour un auxiliaire. |
| Bandeau de démonstration | Présent dans le produit sous forme réduite (parade R7), sans les sélecteurs de la maquette. |
| Pied de page | Mention « Preuve de concept » et « données fictives ». |

---

## B — Affréteur

### B.1 Tableau de bord · `#/affreteur/dashboard`

| Bloc | Contenu | Règle |
|---|---|---|
| Alerte d'action | Bandeau teal si au moins une mise en relation est acceptée et en attente de validation. | Disparaît quand la file est vide. C'est le seul appel à l'action affiché en tête. |
| Indicateurs | Déclarations actives · demandes publiées · réservations en cours · transports en route · **solde du compte**. | Le solde porte la mention « suffisant » ou « insuffisant pour une validation » selon le tarif en vigueur. |
| Demandes de transport | Les 5 plus récentes : référence, corridor, date de départ, marchandise, état, action contextuelle. | L'action dépend de l'état : *Valider* si acceptée, *Suivre* si réservée, *Chercher* si publiée, *Suivi* si validée. |
| Corridors | Barres de répartition sur 90 jours + taux d'appariement. | Aucune donnée hors du périmètre du groupement. |

### B.2 Déclarations de fret · `#/affreteur/declarations` — `M2.1`

Liste filtrable (toutes / actives / clôturées), export CSV (`M8.4`, `C`).

| Colonne | Source |
|---|---|
| Référence `DF-AAAA-NNNN` · Libellé · Provenance · Destination · Nombre de demandes · État | `b2f_declarations` |

**Règles.** Provenance et destination proviennent du référentiel des localités —
saisie libre interdite. Un brouillon est reprenable. Une déclaration portant une
demande validée ne peut plus être supprimée.

### B.3 Nouvelle déclaration · `#/affreteur/declarations/nouvelle/:etape` — `M2.1` à `M2.3`

Assistant en trois étapes, avec récapitulatif permanent en colonne droite
(`position:sticky`), qui passe au-dessus du formulaire sous 960 px.

**Étape 1 — Le fret**

| Champ | Type | Obligatoire | Règle |
|---|---|---|---|
| Libellé du fret | texte, 120 car. | oui | — |
| Provenance | référentiel localités | oui | — |
| Destination | référentiel localités | oui | Différente de la provenance. |
| Observation | texte long | non | — |

**Étape 2 — Le besoin de transport**

| Champ | Type | Obligatoire | Règle |
|---|---|---|---|
| Date et heure de départ | `datetime-local` | oui | Non antérieure à maintenant **à la publication** (pas au brouillon). |
| Date et heure d'arrivée souhaitée | `datetime-local` | oui | **Strictement postérieure au départ.** Erreur bloquante sous le champ. |
| Capacité | référentiel | oui | — |
| Carrosserie | référentiel | oui | — |
| Nombre d'essieux | référentiel | non | — |
| Contraintes particulières | texte long | non | Visible des transporteurs. |

**Étape 3 — Les marchandises** (une à plusieurs lignes)

| Champ | Type | Obligatoire | Règle |
|---|---|---|---|
| Produit | référentiel nomenclature SH | oui | Recherche par libellé ou par code. |
| Poids (t) | nombre | oui | > 0. Somme comparée à la capacité demandée : **avertissement** si dépassement, pas blocage — l'affréteur peut viser plusieurs véhicules. |
| Volume (m³) | nombre | non | > 0 si renseigné. |
| Nombre de colis | entier | non | ≥ 1 si renseigné. |
| Emballage | référentiel | non | — |

**Sortie.** Bouton *Enregistrer en brouillon* à toute étape. *Publier la demande* à
l'étape 3 : crée la déclaration, la demande et les lignes en une seule transaction
applicative. Message de succès nommant la référence produite et proposant
« Rechercher un véhicule ».

**Message d'accompagnement permanent** : « Publier une demande ne coûte rien. Les
frais de mise en relation ne sont débités qu'à la validation finale. » Il lève
l'inquiétude qui, sans lui, freine l'usage d'une plateforme payante.

### B.4 Demandes de transport · `#/affreteur/demandes` — `M2.4`, `M2.5`

Onglets : toutes / publiées / réservées / validées / annulées, avec compteurs.

**Règles.** L'annulation est possible tant que l'état est `publiee` ou `reserver`
— **impossible après `valider`**, avec message explicite : « Cette demande a donné
lieu à une mise en relation validée et à un débit. Elle ne peut plus être annulée.
Pour interrompre le transport, contactez le transporteur et signalez un incident. »
Une demande dont la date de départ est dépassée porte un signalement calculé à
l'affichage.

### B.5 Rechercher un véhicule · `#/affreteur/marche` — `M3.2`, `M3.4`

| Élément | Détail |
|---|---|
| Filtres | Localité de départ · destination · à partir du · capacité · carrosserie · essieux. Conservés d'une session à l'autre (`M3.6`, `C`) sous la clé `b2f_search_prefs`. |
| Résultats | Cartes `.offer-card` — groupement, immatriculation, corridor, fenêtre de disponibilité, capacité, carrosserie, essieux, prix indicatif, bouton *Réserver*. |
| Tri | Date de disponibilité (défaut) · prix au km·tonne · capacité. |
| Mention obligatoire | « Le prix au km/tonne est indicatif : déclaré par le transporteur, il ne sert à aucune facturation. Seuls les frais de mise en relation de la plateforme sont débités. » |
| État vide | Rédigé — voir `01-parcours-et-navigation.md` § 4.3. |

**Ne sont proposées à la réservation** que les offres `disponible` dont la fenêtre
recouvre celle de la demande sélectionnée, et dont le véhicule est à jour de carte
de transport.

### B.6 Réserver — dialogue modal — `M4.1`

| Élément | Détail |
|---|---|
| Contenu | Sélection de **la demande de transport** à rattacher (obligatoire) + rappel que la réservation est gratuite. |
| Effet | `reponseAffreteur = 'reserver'`, rattachement `id_demande`, horodatage et auteur enregistrés, notification au transporteur (`M7`), écriture au journal d'audit. |
| Si aucune demande éligible | Le dialogue le dit et propose de créer une demande, plutôt que d'afficher une liste vide. |

### B.7 Mes réservations · `#/affreteur/reservations`

Tableau : demande · transporteur · véhicule · date de réservation · **réponse du
transporteur** · action.

| Réponse | Libellé | Action offerte |
|---|---|---|
| aucune | « En attente de réponse » | Annuler la réservation |
| `accepter` | « Acceptée le JJ/MM · HH:MM » | **Valider** (bouton primaire) |
| `rejeter` | « Rejetée — *motif* » | Chercher un autre véhicule |

**Proposition (question U4)** : au-delà de 48 h sans réponse, la ligne porte un
signalement visuel. Aucune expiration automatique — elle serait une règle métier
qui n'existe pas dans le système actuel.

### B.8 Valider la mise en relation · `#/affreteur/validation/:id` — `M4.3`, `M5.2` à `M5.4`

**L'écran pivot du POC.** Trois blocs de récapitulatif puis le registre de débit.

| Bloc | Contenu |
|---|---|
| Le transport | Corridor · départ · arrivée prévue · marchandise (produit, poids, volume) |
| Le véhicule retenu | Transporteur · immatriculation · capacité, carrosserie, essieux · prix déclaré (mention « indicatif ») |
| **Le débit** | Composant `.ledger` : ligne affréteur, ligne transporteur, ligne de total |

**Règles de validation** — toutes portées par `matching.service.js`, jamais par la vue :

1. La validation est **impossible** tant que `reponseTransporteur ≠ 'accepter'`.
2. Les **deux** soldes sont vérifiés. Le tarif provient de `b2f_tarifs`, jamais codé en dur.
3. Si un solde est insuffisant : bouton désactivé, bandeau d'erreur nommant la
   partie en défaut, le montant manquant et la marche à suivre. **Test automatisé** (`M5.3`).
4. Si l'utilisateur est un **auxiliaire** : bouton désactivé, explication du motif.
   **Test automatisé** (`M4.6`).
5. En cas de succès : deux écritures distinctes dans `b2f_operations`, passage à
   `valider`, écriture au journal d'audit, notifications aux deux parties,
   redirection vers l'écran de mise en relation.
6. **Atomicité** : si la seconde écriture échoue, la première est annulée. Un débit
   isolé serait une corruption — sans garantie d'intégrité en base, rien ne la
   signalerait : c'est précisément ce que le POC traite.

Colonne droite : chronologie de ce qui s'est passé et de ce qui va suivre, pour que
l'utilisateur sache **ce qu'il achète** avant de cliquer.

### B.9 Mise en relation validée · `#/affreteur/relations/:id` — `M5.4`

| Bloc | Contenu |
|---|---|
| Bandeau de succès | Rappelle que les coordonnées sont transmises parce que la validation a été enregistrée et les frais réglés de part et d'autre. |
| `.contact-reveal` | Groupement · contact · téléphone · courriel · immatriculation · carte grise · chauffeur · numéro de permis · téléphone du chauffeur · PTAC. |
| Écritures | Les deux débits avec leur horodatage. |
| Actions | *Suivre le transport* · *Exporter la fiche*. |

**Règle absolue.** Aucune de ces coordonnées n'est servie avant l'état `valider` —
ni dans une API, ni dans une réponse partielle, ni masquée en CSS. **La
transmission des coordonnées *est* la mise en relation** : c'est ce que la
plateforme vend. À vérifier en audit de sécurité au jalon J3.

### B.10 Suivi des transports · `#/affreteur/suivi` — `M6.1`, `M6.3`, `M6.4`

Chronologie des étapes avec auteur et horodatage. L'affréteur **constate** ; seule
la clôture lui appartient, et elle est impossible avant « Livré » (bouton désactivé
avec explication). Le journal est chronologique et non modifiable.

### B.11 Solde et mouvements · `#/affreteur/compte` — `M5.1`

Indicateurs (solde, crédits cumulés, débits cumulés, mises en relation payées) puis
tableau des mouvements : date · libellé · référence · crédit · débit · **solde
après opération**. Onglets tous / crédits / débits. Export CSV.

**Solde = somme des crédits − somme des débits**, recalculé, jamais stocké.
Mention explicite du fait que le crédit est saisi par le concessionnaire, le
paiement en ligne étant hors périmètre.

---

## C — Transporteur

### C.1 Tableau de bord · `#/transporteur/dashboard`

Bandeau d'alerte si des réservations sont en attente de réponse, avec la phrase qui
explique l'enjeu : « Une réservation sans réponse bloque l'affréteur : il ne peut
pas valider tant que vous n'avez pas accepté. » Indicateurs, histogramme des mises
en relation validées par mois, taux d'acceptation, demandes publiées sur ses
corridors.

### C.2 Véhicules · `#/transporteur/vehicules` — `M1.4`

| Champ | Obligatoire | Règle |
|---|---|---|
| Immatriculation | oui | Unique dans la plateforme. |
| Carte grise | oui | — |
| Capacité (t) / PTAC (t) | oui | Capacité ≤ PTAC. |
| Carrosserie, essieux | oui | Référentiels. |
| Carte de transport + échéance | oui | **Un véhicule à carte échue ne peut pas être publié.** Contrôle à la publication. Le véhicule reste au parc, signalé « Non publiable ». |
| Prix au km·tonne | non | Déclaratif. |

Le rattachement se fait au **groupement**, pas à l'utilisateur — le système existant
nomme mal cette colonne (`TransporteurId` pointe vers `Groupements`) ; le POC corrige.

### C.3 Chauffeurs · `#/transporteur/chauffeurs` — `M1.4`

Nom · permis · validité · téléphone · affectation véhicule.

**Mention obligatoire à l'écran** : « Un chauffeur n'est pas un utilisateur de la
plateforme. C'est une donnée de votre groupement. Ses coordonnées sont transmises à
l'affréteur au moment de la mise en relation, jamais avant. » Un permis échu est
signalé sans bloquer — c'est une information de contrôle, pas une règle de la
plateforme.

### C.4 Publier une offre · `#/transporteur/offres/nouvelle` — `M3.1`

| Champ | Obligatoire | Règle |
|---|---|---|
| Véhicule | oui | Seuls les véhicules `disponible` et à carte valide sont listés. |
| Chauffeur pressenti | non | Transmis après validation seulement. |
| Localité de départ / d'arrivée | oui | Référentiel. Différentes. |
| Disponible du / au | oui | `au` ≥ `du`, `du` non antérieur à aujourd'hui. |
| Prix au km·tonne | non | Déclaratif, jamais utilisé en calcul. |

Colonne droite : **aperçu de la carte telle que la verra l'affréteur**. Un
transporteur qui voit ce que voit son client publie mieux.

### C.5 Mes offres publiées · `#/transporteur/offres` — `M3.5`

**Règle de retrait.** Retrait possible tant qu'aucune réservation n'a été acceptée.
Après acceptation : bouton désactivé, `title` explicite, et explication à l'écran.
Ne jamais masquer le bouton — un bouton absent se lit comme un défaut.

### C.6 Demandes de transport · `#/transporteur/marche` — `M3.3`

Le second sens du flux. Filtres par corridor, période et carrosserie. Action
*Proposer un véhicule* ouvrant un dialogue (véhicule + prix indicatif).

### C.7 Réservations reçues · `#/transporteur/reservations` — `M4.2`

Onglets à traiter / acceptées / rejetées.

| Action | Dialogue | Effet |
|---|---|---|
| **Accepter** | Rappelle l'engagement (l'offre ne pourra plus être retirée) et **affiche le solde du transporteur et les frais à venir**. | `reponseTransporteur = 'accepter'`, notification, journal. |
| **Rejeter** | **Motif obligatoire** : quatre motifs prédéfinis (véhicule déjà engagé, dates incompatibles, marchandise non transportable, destination non desservie) + précision libre. | `reponseTransporteur = 'rejeter'`, motif transmis à l'affréteur, journal. |

**Mention obligatoire** : « Accepter n'engage pas encore vos finances. Les frais
sont débités à la validation de l'affréteur. Vérifiez néanmoins votre solde : une
validation refusée pour solde insuffisant de votre côté bloque la mise en
relation. » Sans cette phrase, un transporteur au solde nul accepte des
réservations qui échoueront — et en blâmera la plateforme.

### C.8 Suivi des transports · `#/transporteur/suivi` — `M6.2`

Le transporteur **fait avancer** les étapes, dans l'ordre, sans retour arrière.
Dialogue de confirmation à chaque avancement, avec champ d'observation. Action
*Signaler un incident* : nature (panne, retard, barrage, litige au chargement) +
description ; s'inscrit au journal **sans changer l'étape**.

---

## D — Auxiliaire

L'espace est celui du parent. Trois différences seulement :

1. **Bandeau de délégation** permanent en tête de contenu, nommant le parent.
2. **Tableau de bord dédié** portant un tableau explicite du périmètre : ce qui est
   autorisé, ce qui ne l'est pas, et pourquoi.
3. **Validation refusée** avec un message qui explique le motif et indique la
   marche à suivre — « le dossier est prêt, prévenez votre responsable » — plutôt
   qu'un simple refus.

**Proposition à confirmer (U3)** : l'auxiliaire peut annuler une réservation avant
validation, puisque cela n'engage aucune dépense. Il ne peut ni créditer un compte,
ni gérer les utilisateurs.

Cette limitation est une **proposition du POC** : le système existant ne la pose
pas. À présenter comme telle en démonstration, et révocable.

---

## E — Concessionnaire `J4`

| Écran | Contenu | Règle |
|---|---|---|
| **Tableau de bord** | Groupements actifs · déclarations du mois · offres · mises en relation · encours des comptes · abonnements expirés. Volume mensuel, corridors, délai moyen réservation → validation. | Vue agrégée de toute la plateforme. |
| **Groupements** (`M1.2`) | Raison sociale · type · RCCM · localité · solde · abonnement · état. Filtres par type et par état. | — |
| **Utilisateurs et rôles** (`M1.6`) | **Matrice des 22 rôles**, onglets par niveau (5 démontrés / 3 déclinés / 14 modélisés). Première colonne figée, défilement horizontal. | Aucun droit n'existe hors de cette matrice. Quatre lignes font l'objet d'un test dédié. |
| **Comptes et soldes** (`M5.5`) | Crédits, débits, solde, dernier mouvement, action *Créditer*. Dialogue : montant + référence d'encaissement. | Tracé au journal d'audit avec le nom de l'opérateur. Remplace l'intégration de paiement (arbitrage N2). |
| **Catalogue de tarifs** | Abonnement annuel · frais affréteur · frais transporteur. | **Mention obligatoire** : ce n'est pas une grille tarifaire du fret mais le prix des services de la plateforme. |
| **Marché** | Déclarations, offres et mises en relation de toute la plateforme, en consultation. | Le concessionnaire ne publie ni ne valide à la place d'un acteur. Test dédié. |
| **Journal d'audit** | Horodatage · auteur · groupement · événement · objet. Filtres par type et par période, export CSV. | **En ajout seul.** Aucune fonction d'édition ni de suppression n'est développée. Ajout du POC : le système existant n'a pas de piste d'audit unifiée. |

---

## F — DGTTC `J4`

| Écran | Contenu |
|---|---|
| **Tableau de bord national** | Transporteurs · véhicules au parc · cartes de transport expirées · déclarations du mois · mises en relation · transports en cours. Flux par corridor. Points d'attention (pièces échues, groupements suspendus). |
| **Déclarations et offres** | État consolidé, onglets déclarations / offres, export CSV. |
| **Mises en relation** | Référence, parties, corridor, date de validation, état du transport. |
| **Transporteurs et affréteurs** | Raison sociale, type, RCCM, carte de transporteur, localité, nombre de véhicules, conformité. |
| **Parc de véhicules** | Immatriculation, transporteur, carrosserie, PTAC, essieux, carte de transport et échéance. Onglet « carte échue ». |
| **Journal d'audit** | En lecture. |

**Règle structurante, à vérifier en audit** : aucune donnée financière n'est servie
au rôle DGTTC. Pas de colonne « solde », pas de montants, pas d'écritures — **au
niveau des données, pas de l'affichage**. Aucune action transactionnelle n'existe
dans cet espace. Test automatisé (`M1.7`).

Un bandeau permanent rappelle la nature de l'espace : « Le contrôleur ne transige
pas sur ce qu'il contrôle. »

---

## G — Second incrément `J5`

Cadrés, non maquetés — la priorité de conception va au cœur transactionnel.

| Écran | Contenu attendu |
|---|---|
| **Notifications** (`M7`) | Centre dans l'application sur les événements réels : réservation, acceptation, rejet, annulation, validation, retrait d'offre. Indicateur de non-lus visible depuis tous les écrans. Ni SMS ni courriel (hors périmètre). |
| **Abonnement** (`M10`) | Période de validité, montant, échéance. Blocage d'accès à l'expiration avec redirection. Sans paiement. |
| **Génération du DUT** (`M9`, livré dans le POC le 01/10/2026) | Liste filtrable des dossiers, aperçu prérempli, génération unique après validation, consultation et impression/PDF. Camion et chauffeur repris de l’offre du trajet. Fiche locale de démonstration sans valeur administrative ; aucun couplage au système officiel. |
| **Fiche du groupement / Utilisateurs** (`M1.3`) | Raison sociale, RCCM, compte contribuable, carte de transporteur, pays, localité. Création de sous-comptes auxiliaires identifiés comme tels. Prévus dès J2 côté données ; écrans de faible complexité. |

---

## H — Points de vigilance pour l'implémentation

1. **La règle d'appariement ne vit qu'à un seul endroit.** Toute transition
   `reserver` → `accepter`/`rejeter` → `valider` passe par `matching.service.js`.
   Aucune vue ne modifie un statut. Vérifié en revue d'architecture (`M4.5`).
2. **Les tarifs viennent du catalogue.** Aucun montant codé en dur dans une vue ou
   un service. Le catalogue est modifiable par le concessionnaire, et un changement
   doit se voir immédiatement sur l'écran de validation.
3. **Le double débit est atomique.** Deux écritures ou aucune.
4. **Les coordonnées ne fuient pas.** Avant `valider`, elles ne sont ni servies ni
   calculées côté vue. Point d'audit J3.
5. **Préfixe `b2f_` sur toutes les clés**, thème compris (`b2f_theme`). Le POC DUT
   utilise `dut_theme` : une collision effacerait son thème (risque R5).
6. **Un statut ne s'affiche jamais brut.** Table de correspondance obligatoire —
   `01-parcours-et-navigation.md` § 4.1.
7. **Une action interdite s'explique, elle ne se masque pas.** Bouton désactivé +
   `title` + explication à l'écran.
8. **Aucune donnée réelle.** Tous les groupements, personnes, immatriculations et
   RCCM des jeux de démonstration sont inventés et marqués « DÉMO » (risque R9).
