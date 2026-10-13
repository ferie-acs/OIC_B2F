# Matrice des rôles et des droits — POC B2F

> **Jalon J1 — conception technique.** Auteur : agent `senior-fullstack`,
> 24 septembre 2026.
> Code correspondant : `js/domain/roles.js`, `js/domain/permissions.js`,
> `js/domain/access.js`. **Les tableaux ci-dessous sont générés depuis le code**
> et ne peuvent donc pas diverger de lui.
>
> **Ce document est la porte bloquante du jalon J1** (`plan-suivi.md` § 6.3) :
> il doit être audité par `security-expert` **avant toute écriture de code
> d'écran**. Un défaut de conception des droits découvert en J4 coûterait une
> refonte.

---

## 1. Les principes

Le système existant disperse son contrôle d'accès dans le routage et dans les
vues, sans matrice centralisée (cadrage § 3.2). Le POC le centralise — écart
délibéré n° 2, et réponse directe à la recommandation « définir clairement les
rôles et droits d'accès » (§ 8.2 du rapport).

| # | Principe | Mise en œuvre |
|---|---|---|
| **P1** | **Refus par défaut.** | Un droit absent de la table d'un rôle vaut `AUCUNE`. Aucun rôle ne contourne la matrice — **y compris `super_admin`**, qui ne reçoit délibérément aucun droit métier. Un compte qui peut tout est exactement ce qu'une matrice sert à éviter. |
| **P2** | **Un droit est une portée, pas un booléen.** | `appariement.lire` en portée `GROUPEMENT` et le même droit en portée `TOUT` n'ont rien de commun. Réduire l'autorisation à « oui / non » en laissant chaque écran filtrer est la façon habituelle de fabriquer une fuite. |
| **P3** | **Second verrou indépendant : la classification.** | Même avec un droit en portée `TOUT`, un rôle ne reçoit que les classifications de données qui lui sont ouvertes. C'est ce qui rend l'interdit financier de la DGTTC structurel, et non affiché. |
| **P4** | **La matrice dit le principe, jamais l'instant.** | Abonnement expiré, coordonnées avant `valider`, solde insuffisant : ces règles dépendent de l'état et sont appliquées par `access.js`, qui combine matrice et contexte. |
| **P5** | **Un refus est motivé, jamais muet.** | `decider()` rend `{ autorise, portee, motif, explication }`. L'explication est affichable telle quelle : une action interdite se désactive **et s'explique**, elle ne se masque pas (décision D32). |
| **P6** | **Une erreur de nom échoue bruyamment.** | Un rôle ou un droit inconnu lève. Refusé en silence, il ferait croire à un cloisonnement qui n'existe pas. |

### Les cinq portées

| Symbole | Portée | Signification |
|:-:|---|---|
| `—` | `AUCUNE` | Droit refusé. **Valeur par défaut.** |
| `P` | `PROPRE` | Les objets dont l'utilisateur est personnellement destinataire. Un collègue du même groupement n'y accède pas. |
| `G` | `GROUPEMENT` | Les objets du groupement de l'utilisateur, et eux seuls. |
| `M` | `MARCHE` | Les objets qu'un tiers a **délibérément publiés** sur le marché, dans leur projection publique. La vitrine, rien au-delà. |
| `T` | `TOUT` | Toute la plateforme. Réservé aux rôles institutionnels. |

---

## 2. Le décompte des rôles — un écart avec le cadrage, à trancher

Le cadrage annonce « 8 macro-rôles + ~14 profils = **22** » et le plan de suivi
en fait un indicateur (« Rôles couverts par la matrice : 22 / 22 dès J1 »).
L'inventaire des menus de rôle en établit **19**, chacun attesté par un
fichier du système existant. L'écart est de trois, et il n'est pas comblé par
une hypothèse silencieuse.

**Ce qui explique l'écart**

1. Le dossier contient **huit menus supplémentaires** en `*_non_actif` et
   `*_reabonnement` (chargeur, transporteur, auxiliaire d'affréteur, auxiliaire
   de transporteur). Ce sont des **états d'abonnement**, pas des rôles : le même
   utilisateur bascule de l'un à l'autre selon que son groupement est à jour. Les
   compter comme des rôles serait une erreur de modélisation ; le POC les traite
   par `ETAT_ABONNEMENT` et par la règle d'accès de `access.js`. L'estimation
   « ~14 profils » du cadrage les incluait vraisemblablement.
2. L'**auxiliaire est dédoublé** : unique dans le système existant
   (un seul groupe d'utilisateurs plus un champ de type), il devient ici
   `auxiliaire_affreteur` et `auxiliaire_transporteur`. Leurs droits diffèrent
   réellement — l'un réserve et valide, l'autre publie et répond — et le principe
   P1 veut qu'aucun droit n'existe hors de la matrice. Un rôle unique dont les
   droits se calculeraient d'après le type du parent réintroduirait exactement la
   dispersion que le POC corrige.
3. La table `profil` du système existant porte des `id_profil` allant **au moins
   jusqu'à 13**, mais **ses libellés ne figurent pas dans le dump** : ils vivent
   en base de production. Trois profils supplémentaires y dorment peut-être.

**Question ouverte N8 — pour le chef de projet et le commanditaire.** Faut-il
obtenir un extrait de la table `profil` de production ? Si oui, chaque profil
manquant s'ajoute par **une entrée déclarative** dans `roles.js` et **une ligne**
dans la matrice : le mécanisme est dimensionné pour, rien n'est à réécrire. Si
non, l'indicateur du plan de suivi doit passer de « 22 / 22 » à « 19 / 19, tous
attestés », ce qui est un énoncé plus vrai qu'un compte rond.

### Répartition

| Niveau | Traitement | Rôles |
|---|---|---|
| **1 — Démontrés** (6) | Espace propre, écrans métier, parcours de démonstration, tests dédiés. | Affréteur · Transporteur · **Auxiliaire d'affréteur** · **Auxiliaire de transporteur** · Concessionnaire · DGTTC |
| **2 — Déclinés** (3) | Réutilisent l'espace Transporteur, variations déclaratives. | Transporteur privé · Transporteur étranger · Partenaire |
| **3 — Modélisés** (10) | Déclarés, administrables, menu généré. **Aucun écran métier**, à une exception près depuis le 13/10/2026 : la vérification des transporteurs par `activation_inscription` (§ 9). | super_admin · admin_compta · admin_superviseur_centre_tech · agent_caisse · superviseur_comptabilite · superviseur_cpte · contentieux_paie · dut_transport · activation_inscription · activation_inscription_affreteur |

Chaque rôle porte dans `roles.js` un champ `preuve` citant le fichier du système
existant qui l'atteste. **Aucun rôle n'est inventé ni déduit** — vérifié par test.

---

## 3. La matrice

Les libellés **en gras** désignent les droits faisant l'objet d'un test de
permission dédié. Un droit refusé à tous les rôles d'un tableau n'y figure pas.

### Niveau 1 — rôles démontrés

| Droit | Affr. | Transp. | Aux.A | Aux.T | Conc. | DGTTC |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| *Fret* |||||||
| Consulter les déclarations de fret | G | — | G | — | T | T |
| Déclarer un fret | G | — | G | — | — | — |
| Modifier une déclaration | G | — | G | — | — | — |
| Supprimer une déclaration | G | — | — | — | — | — |
| Consulter les demandes de transport | G | — | G | — | T | T |
| Créer une demande de transport | G | — | G | — | — | — |
| Publier une demande sur le marché | G | — | G | — | — | — |
| Annuler une demande | G | — | G | — | — | — |
| *Flotte* |||||||
| Consulter le parc de véhicules | — | G | — | G | T | T |
| Ajouter ou modifier un véhicule | — | G | — | G | — | — |
| Consulter les chauffeurs | — | G | — | G | — | — |
| Ajouter ou modifier un chauffeur | — | G | — | G | — | — |
| Consulter les offres de véhicule | — | G | — | G | T | T |
| Publier une offre de véhicule | — | G | — | G | — | — |
| Retirer une offre publiée | — | G | — | G | — | — |
| *Marché* |||||||
| Rechercher des véhicules disponibles | M | — | M | — | — | — |
| Consulter les demandes publiées | — | M | — | M | — | — |
| *Mise en relation* |||||||
| Consulter les mises en relation | G | G | G | G | T | T |
| Réserver un véhicule | G | — | G | — | — | — |
| Proposer un véhicule sur une demande | — | G | — | G | — | — |
| **Accepter ou rejeter une réservation** | G | G | — | — | — | — |
| **Annuler avant validation** | G | G | G | G | — | — |
| **Valider — déclenche le double débit** | G | — | — | — | — | — |
| **Accéder aux coordonnées de la contrepartie** | G | G | G | G | — | — |
| *Transport* |||||||
| Suivre les transports | G | G | G | G | T | T |
| Faire avancer une étape | — | G | — | G | — | — |
| Clôturer après livraison | G | — | G | — | — | — |
| Signaler un incident | — | G | — | G | — | — |
| Noter la contrepartie après clôture | G | G | G | G | — | — |
| *Compte* |||||||
| **Consulter le solde et les mouvements** | G | G | G | G | T | — |
| **Saisir un crédit de compte** | — | — | — | — | T | — |
| **Valider un crédit saisi par un autre agent** | — | — | — | — | T | — |
| Consulter le catalogue de tarifs | T | T | T | T | T | — |
| Modifier le catalogue de tarifs | — | — | — | — | T | — |
| Consulter l'abonnement | G | G | G | G | T | — |
| Prolonger un abonnement | — | — | — | — | T | — |
| *Acteurs* |||||||
| Consulter les groupements | G | G | G | G | T | T |
| Modifier la fiche du groupement | G | G | — | — | T | — |
| Consulter les utilisateurs | G | G | — | — | T | — |
| Créer ou modifier un utilisateur | G | G | — | — | T | — |
| Consulter la matrice des rôles | — | — | — | — | T | — |
| *Pilotage* |||||||
| Tableau de bord de son périmètre | G | G | G | G | — | — |
| Tableau de bord d'activité de la plateforme | — | — | — | — | T | T |
| Consulter les états de contrôle | — | — | — | — | — | T |
| Consulter le journal d'audit | — | — | — | — | T | T |
| *DUT* |||||||
| Consulter les DUT générés | G | G | G | G | T | — |
| Générer un DUT | — | G | — | G | — | — |
| *Annexes* |||||||
| Consulter ses notifications | P | P | P | P | P | P |

*Mise à jour du 13/10/2026 (correctifs anti-fraude, § 9).* « Saisir un crédit
de compte » est le droit `compte.crediter`, renommé : il ne crédite plus.
`compte.valider_credit` et `groupement.verifier` sont marqués `teste: true`
dans `permissions.js` ; leur refus à tout autre rôle est vérifié par
`tests/anti-fraude.test.mjs`.


### Niveau 2 — rôles déclinés

| Droit | T.privé | T.étr. | Part. |
|---|:-:|:-:|:-:|
| *Flotte* ||||
| Consulter le parc de véhicules | G | G | G |
| Ajouter ou modifier un véhicule | G | G | — |
| Consulter les chauffeurs | G | G | G |
| Ajouter ou modifier un chauffeur | G | G | — |
| Consulter les offres de véhicule | G | G | G |
| Publier une offre de véhicule | — | G | — |
| Retirer une offre publiée | G | G | — |
| *Marché* ||||
| Consulter les demandes publiées | M | M | — |
| *Mise en relation* ||||
| Consulter les mises en relation | G | G | G |
| Proposer un véhicule sur une demande | G | G | — |
| **Accepter ou rejeter une réservation** | G | G | — |
| **Annuler avant validation** | G | G | — |
| **Accéder aux coordonnées de la contrepartie** | G | G | G |
| *Transport* ||||
| Suivre les transports | G | G | G |
| Faire avancer une étape | G | G | — |
| Signaler un incident | G | G | — |
| Noter la contrepartie après clôture | G | G | — |
| *Compte* ||||
| **Consulter le solde et les mouvements** | G | G | G |
| Consulter le catalogue de tarifs | T | T | — |
| Consulter l'abonnement | G | G | G |
| *Acteurs* ||||
| Consulter les groupements | G | G | G |
| Modifier la fiche du groupement | G | G | — |
| Consulter les utilisateurs | G | G | — |
| Créer ou modifier un utilisateur | G | G | — |
| *Pilotage* ||||
| Tableau de bord de son périmètre | G | G | G |
| *DUT* ||||
| Consulter les DUT générés | G | G | G |
| Générer un DUT | G | G | G |
| *Annexes* ||||
| Consulter ses notifications | P | P | P |


### Niveau 3 — rôles modélisés

| Droit | sup.adm | adm.cpta | adm.ctech | caisse | sup.cpta | sup.cpte | cont. | dut | act.insc | act.aff |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| *Acteurs* |||||||||||
| Consulter les groupements | — | — | — | — | — | — | — | — | T | T |
| **Vérifier le dossier d'un transporteur** | — | — | — | — | — | — | — | — | T | — |
| *DUT* |||||||||||
| Consulter les DUT générés | — | — | — | — | — | — | — | T | — | — |

---

## 4. Les classifications lisibles — le second verrou

Indépendant de la matrice. Même avec `appariement.lire` en portée `TOUT`, un rôle
ne reçoit que ce que cette table lui ouvre.

| Rôle | `public` | `identite` | `contact` | `financier` | `systeme` |
|---|:-:|:-:|:-:|:-:|:-:|
| Acteurs du marché (7 rôles) | ✓ | ✓\*\* | ✓\* | ✓ | ✗ |
| Concessionnaire | ✓ | ✓ | **✗** | ✓ | ✗ |
| **DGTTC** | ✓ | ✓ | **✗** | **✗** | ✗ |
| Profils de niveau 3 | ✓ | selon | ✗ | ✗ | ✗ |

\* **Sous condition d'état.** Un champ `contact` d'un tiers n'est libéré que si le
groupement propriétaire figure parmi les groupements avec lesquels l'utilisateur
partage un appariement à l'état `valider`. Voir `02-modele-de-donnees.md` § 4.

\*\* **Sous condition d'état depuis le 13/10/2026** (correctif anti-fraude
n° 1). Un champ `identite` — raison sociale, RCCM, immatriculation — n'est servi
qu'au propriétaire de l'objet, aux rôles institutionnels, et aux deux parties
d'une mise en relation validée, objet par objet (`identiteLiberee`,
`access.js`). Jusque-là, il était lisible de tout acteur du marché.

**`systeme` ne figure dans aucune liste**, et ne doit jamais y figurer :
empreintes et sels ne sont projetés vers personne. Vérifié par test pour les
19 rôles.

---

## 5. Les quatre règles du plan, et leur test

`plan-suivi.md` § 3.5 désigne quatre lignes appelant un test automatisé dédié.
Toutes sont couvertes.

| # | Règle | Vérification |
|---|---|---|
| **1** | **Accès sans abonnement actif** — l'accès est fermé, la consultation de l'abonnement reste ouverte pour pouvoir le renouveler. Les rôles institutionnels n'y sont pas soumis. | `tests/access.test.mjs` |
| **2** | **L'auxiliaire ne valide pas.** Il agit pour un tiers sans engager les finances de ce tiers. L'auxiliaire de transporteur perd en outre la réponse aux réservations : accepter engage le parent sur un débit à venir. | `tests/permissions.test.mjs` |
| **3** | **La DGTTC ne transige pas.** Dix-sept actions vérifiées une par une, plus l'interdit financier au niveau de la donnée. | `tests/permissions.test.mjs`, `tests/access.test.mjs` |
| **4** | **Le concessionnaire ne transige pas non plus.** Il supervise, saisit et valide des crédits — jamais la même opération par la même personne depuis le 13/10/2026 ; il ne publie ni ne valide à la place d'un acteur du marché. | `tests/permissions.test.mjs` |

**État de la suite au 24/09/2026 : 264 tests, code de sortie 0.**

---

## 6. Six points soumis à l'audit de sécurité

Ce sont des décisions prises, pas des oublis. Chacune est défendable et chacune
est révocable. Elles sont listées ici parce qu'un auditeur doit les contester
s'il n'est pas d'accord, et non les découvrir dans le code.

### 6.1 Le concessionnaire n'accède pas aux coordonnées privées

`coordonnees.lire` lui est refusé, et la classification `contact` lui est fermée.
**Motif** : exploiter la plateforme — gérer des groupements, créditer des
comptes, tenir un catalogue de tarifs — ne demande pas de lire le téléphone d'un
chauffeur. Moindre privilège. Le seul motif plausible serait le traitement d'un
contentieux, explicitement hors périmètre (`plan-suivi.md` § 1.3).
**À contester si** l'exploitant réel a besoin de ces données pour une fonction que
le POC n'a pas identifiée.

### 6.2 `chauffeur.lire` et `coordonnees.lire` ne recouvrent pas la même chose

L'affréteur n'a **pas** `chauffeur.lire` et voit pourtant le chauffeur après
validation. Ce n'est pas une incohérence : `chauffeur.lire` ouvre l'écran
« Chauffeurs », c'est-à-dire la consultation de **son propre parc** ;
`coordonnees.lire` ouvre la fiche de mise en relation, qui affiche le chauffeur
de **la contrepartie**. **Le droit contrôle l'écran, la projection contrôle les
champs.** La règle est écrite dans la note du droit `coordonnees.lire`.
**Point d'attention** : deux mécanismes se croisent ici. C'est la subtilité la
plus susceptible d'être mal réimplémentée en J3.

### 6.3 L'auxiliaire peut annuler et clôturer

Annuler est tranché (question U3, décision D37) : cela n'engage aucune dépense.
**Clôturer après livraison n'a pas été soumis** ; c'est une déduction du principe
« l'auxiliaire n'engage pas les finances du parent » — le débit ayant déjà eu
lieu, la clôture ne coûte rien. **À contester si** la clôture est considérée comme
un acte de réception contractuelle, ce qui lui donnerait une portée que le POC ne
lui prête pas.

### 6.4 Le transporteur étranger a exactement les droits du transporteur

Sa variation est un **champ obligatoire** (`paysImmatriculation`, déclaré dans
`CHAMPS_REQUIS_PAR_ROLE`), pas une restriction de droits. **À contester si** le
régime particulier implique des limitations que le système existant porte
ailleurs que dans ses menus.

### 6.5 Les profils de niveau 3 ont des tables vides ou quasi vides

`super_admin` n'a **aucun** droit ; sept autres profils non plus. C'est délibéré :
caisse, contentieux et comptabilité sont hors périmètre, et leur accorder des
droits « en attendant » créerait le compte fourre-tout que le POC entend
proscrire. Conséquence assumée : ces rôles se connectent sur un espace minimal
disant explicitement pourquoi. **C'est à énoncer en démonstration, pas à masquer.**

*Mise à jour du 13/10/2026.* `activation_inscription` reçoit
`groupement.verifier` et l'écran « Vérification des transporteurs » (§ 9). C'est
le premier profil de niveau 3 doté d'un droit de mutation ; les huit profils sans
aucun droit restent sans droit.

### 6.6 Ce que la matrice ne protège pas

**LocalStorage n'est pas un mécanisme de sécurité.** La matrice empêche le code
applicatif de construire une réponse non autorisée ; elle ne protège rien contre
quiconque ouvre les outils de développement du navigateur, lit
`b2f_groupements` et y trouve les coordonnées de tout le monde. Le POC **simule**
un cloisonnement, il ne l'impose pas.

C'est écrit au `plan-suivi.md` § 8 et doit l'être au README. La valeur de
démonstration reste entière : ce qui est prouvé, c'est que **la règle métier est
exprimable en un point unique et vérifiable**, ce que le système existant ne
permet pas aujourd'hui. Transposé sur une architecture serveur, ce même fichier
devient la source d'une politique appliquée côté serveur.

---

## 7. Ce qui reste à faire

| Jalon | Objet |
|---|---|
| **J1** | **Revue de ce document par `security-expert`. Porte bloquante.** |
| **J2** | Génération du menu depuis `droitsDuRole()` ; refus de route explicite nommant rôle et droit manquant. |
| **J3** | Audit du cloisonnement effectif : un groupement peut-il voir les données d'un autre ? un auxiliaire peut-il valider ? la règle de solde est-elle contournable ? |
| **J4** | Écran « Utilisateurs et rôles » du concessionnaire — la matrice rendue visible et administrable (`M1.6`). Tests de permission sur les 19 rôles. |

---

## 8. Réponse à l'audit de sécurité du 24/09/2026

Verdict rendu : **GO avec réserves**
(`docs/securite/audit-matrice-roles.md`). Les quatre findings bloquants sont
corrigés, ainsi que sept des douze findings non bloquants. Chaque correction est
couverte par un test de `tests/audit-findings.test.mjs` qui rejoue **le scénario
exact reproduit par l'auditeur** — et dont il a été vérifié, en réintroduisant
temporairement chaque défaut, qu'il échoue alors réellement. Un test qui ne
rougit pas quand le défaut revient ne protège de rien.

### Bloquants

| # | Correction |
|---|---|
| **S1** | **Projection récursive.** `projeter()` descend dans les conteneurs ; chaque sous-champ porte sa classification. `schema.js` **refuse au chargement** tout champ `object`/`array` sans classification explicite : la régression n'est plus commissible en silence. `notification.corps` devient `{ code, params }` — ce qui ferme aussi la surface XSS de S13. |
| **S2** | **`contactLibere()` interroge la matrice** : `decider(ctx, 'coordonnees.lire')` est sa première condition. Décocher le droit dans l'écran M1.6 ferme désormais réellement, et l'abonnement expiré ou le compte suspendu referment aussi les coordonnées. |
| **S3** | **Libération bornée à l'objet.** `groupementsLiberes: Set<groupementId>` devient `objetsLiberes: Set<"entite:id">`. Une mise en relation validée libère la contrepartie, l'offre appariée, son véhicule et son chauffeur — **pas le reste du parc**. Le contournement du modèle économique est fermé. |
| **S4** | **Isolation par contrôle de concurrence optimiste.** Registre de versions par collection ; `versions()` capture un instantané avant la décision, `transaction(travail, { attendu })` le revérifie au commit. Le jeton que l'en-tête annonçait sans qu'il existe est implémenté — et le commentaire mensonger réécrit. |

### Non bloquants traités

| # | Correction |
|---|---|
| **S5** | `transaction()` **refuse de s'ouvrir** si un journal d'annulation traîne. Un mécanisme de récupération que l'usage normal détruit n'en est pas un. |
| **S6** | Messages de garde **dédoublés selon le destinataire**. Le solde d'un compte n'est chiffré qu'à son titulaire ; l'écart non plus, puisque l'écart plus le tarif public reconstitue le solde. |
| **S7** | `MARCHE` n'accorde que si `cible.publie === true`. Une cible muette **échoue** : ne pas savoir n'est pas une autorisation. |
| **S8** | Les droits mutants sont marqués `mutation: true` ; `exiger()` lève si leur cible est omise. `peutAfficher()` prend en charge le cas légitime du menu. |
| **S9** | `deciderSurAppariement()` croise **appartenance à l'une des deux parties**, `partieHabilitee()` selon le sens, et le droit. |
| **S10** | `peutLireClassification()` et `droitsDuRole()` lèvent sur un rôle inconnu, comme `porteeDe()`. C'est ce qui rend sûre la posture « ne rien inventer » de N8. |
| **S11** | `liberationsDe()` est **écrite dans le domaine**, pure et testée. Le verrou central ne dépend plus d'un calcul qui n'existait pas. |
| **S12** | `partenaire` reçoit `abonnement.lire` et `compte.lire` : l'impasse à l'expiration est levée. Un test le vérifie pour **tout** rôle soumis à abonnement. |
| **S14** | `champsRequisPour()` / `champsManquantsPourRole()` branchent `CHAMPS_REQUIS_PAR_ROLE` ; `aUnJournalEnAttente()` permet au bootstrap J2 d'imposer le rejeu. |
| **S15** | Le rejeu **valide la forme du journal** et refuse toute clé hors préfixe `b2f_`. Ne rend pas le mécanisme authentifié — impossible sans serveur — mais empêche qu'il serve à écrire hors du POC. |

### Recommandation retenue : le bris de glace

`coordonnees.exception` est **déclaré au catalogue et accordé à aucun rôle**, avec
un test qui le vérifie pour les 19. Le contentieux reste hors périmètre ; la place
de l'accès exceptionnel est prévue sans être ouverte. Son ouverture éventuelle
exigera un motif saisi et une écriture au journal d'audit : ce n'est pas un droit
qu'on coche.

### Un écart de méthode avec l'auditeur, et sa raison

L'audit proposait de classer **tout** `dut.donnees` en `contact`. Retenu
autrement : le conteneur reste `public` — explicitement — et chaque sous-champ
porte sa classe. Motif : un DUT est aussi un **document de contrôle**, et tout
fermer priverait la DGTTC du corridor et de l'immatriculation, qui sont l'objet
même de son espace. La classification d'un conteneur est le minimum requis pour
le voir ; la protection réelle est la récursion, plus le test « aucun rôle privé
de `contact` ne reçoit un sous-champ nominatif du DUT ». Si l'auditeur juge ce
raisonnement insuffisant, la bascule coûte une ligne.

### Un trou fonctionnel trouvé en corrigeant S9

En croisant partie et action, le sens B — l'affréteur publie sa demande, le
transporteur propose, l'affréteur accepte — s'est révélé **impraticable** :
l'affréteur n'avait pas `appariement.repondre`. Le droit lui est accordé ; c'est
`partieHabilitee()` qui tranche selon le sens. Ses auxiliaires en sont privés,
par symétrie avec l'auxiliaire de transporteur — accepter engage le parent sur un
débit à venir. Ce défaut n'était pas dans l'audit : il n'apparaît qu'en écrivant
le croisement que l'audit demandait.

### Réserves de démonstration, à inscrire au README

1. Le POC **simule** un cloisonnement ; il ne l'impose pas. LocalStorage est
   lisible en trois clics.
2. La transposition côté serveur n'a de valeur que si `decider()` y est **rejoué
   à chaque requête**. Laisser la décision au client reproduirait le défaut du
   legacy avec un code plus élégant.
3. La clôture par l'auxiliaire (A2) est admise dans le POC. **Dans la cible**,
   clôturer est un acte de réception, donc une délégation de responsabilité
   contractuelle : à réserver au titulaire ou à contresigner.
4. Les constats de sécurité relevés hors POC restent ouverts (N6) et
   **n'attendent rien du POC** ; leur suivi relève du cadrage, non versionné ici.

### Ce qui reste ouvert

| # | Point | État |
|---|---|---|
| **S13** | XSS par une raison sociale rendue en `innerHTML`. | Surface **devant nous** : aucune vue n'existe. Règle de revue J3 : `textContent` partout, `innerHTML` interdit sur toute chaîne issue du domaine. Les notifications passent déjà en `{ code, params }`. |
| **S16** | `node --test tests/` échoue, `node --test tests/*.test.mjs` passe. | Commande exacte fixée au README et à la future CI. |
| **N8** | 19 rôles attestés contre 22 annoncés. | Position de l'auditeur : **ne rien inventer**, corriger l'indicateur, demander l'extrait de `profil` comme action de projet et non comme blocage. Appliqué. |

**État de la suite : 329 tests, code de sortie 0.**

---

## 9. Correctifs anti-fraude du 13/10/2026 — incidence sur la matrice

Cinq correctifs anti-fraude (README, § *Lutte contre la fraude*) ajoutent quatre
droits au catalogue, qui passe de **47 à 51 droits**, et modifient un libellé.
Les tableaux du § 3 en tiennent compte ; `appariement.expirer`, refusé à tous,
n'y figure pas, conformément à leur convention.

### 9.1 Les droits ajoutés ou modifiés

| Droit | Catégorie | Accordé à | Portée | Objet |
|---|---|---|:-:|---|
| `groupement.verifier` | Acteurs | `activation_inscription` | `T` | **Correctif n° 3.** Contrôler le RCCM, la carte de transporteur et l'assurance d'un transporteur, puis la carte grise de chaque véhicule et le permis de chaque chauffeur. Les pièces ne sont servies que par `verification.service.js`, sous ce droit : ni téléphone, ni courriel, ni solde. |
| `compte.valider_credit` | Compte | `concessionnaire` | `T` | **Correctif n° 5.** Valider ou rejeter un crédit saisi par une autre personne, après rapprochement avec l'encaissement. |
| `avis.donner` | Transport | `affreteur`, `transporteur`, `auxiliaire_affreteur`, `auxiliaire_transporteur`, `transporteur_prive`, `transporteur_etranger` | `G` | **Correctif n° 2.** Noter la contrepartie d'un transport clôturé, une fois par groupement et par transport. `partenaire` ne l'a pas. |
| `appariement.expirer` | Mise en relation | **aucun rôle** | — | **Correctif n° 4.** Clore un appariement dont le délai est dépassé. Comme `coordonnees.exception`, il est déclaré au catalogue et accordé à personne : la transition `expirer` appartient à la partie `systeme`, et `deciderSurAppariement()` la refuse à toute partie — « Cette action est réservée à la plateforme ». |
| `compte.crediter` | Compte | `concessionnaire` | `T` | **Libellé modifié** : « Saisir un crédit de compte ». La saisie ne touche plus au solde. |

### 9.2 Ce que la matrice ne porte pas — conformément à P4

Les règles suivantes dépendent de l'état ou de la personne, non du rôle. Elles
sont appliquées hors de la matrice, et un auditeur doit les chercher là :

| Règle | Où elle est appliquée |
|---|---|
| **Quatre yeux** : celui qui a saisi un crédit ne le valide ni ne le rejette. Saisie et validation appartiennent au **même rôle** ; seule la personne diffère. | `compte.service.js` (`validerCredit`, `rejeterCredit`), doublé de l'invariant `quatreYeux` de l'entité `credit` dans `schema.js`. |
| **Identité retenue jusqu'à la validation** : la classification `identite` d'un tiers n'est servie qu'aux parties d'une mise en relation validée, objet par objet (§ 4, note \*\*). | `access.js` (`identiteLiberee`), appelé par la projection et par `views/_donnees.js` (`nomDe`, `immatriculationDe`). |
| **Transporteur vérifié** : un transporteur non vérifié conserve ses droits dans la matrice ; ce sont la publiabilité de ses véhicules et les gardes `transporteurVerifie` et `moyensVerifies` qui l'empêchent de publier, de proposer, d'accepter, et qui font échouer une validation. | `flotte.service.js` (`publiabilite`, `chercherVehicules`), `matching.state.js`. |
| **Délai d'attente** : une acceptation ou une validation hors délai est refusée. | Garde `delaiTenu`, `matching.state.js` ; clôture par `expirerEchus()`, `matching.service.js`. |

### 9.3 Deux points à soumettre à l'audit

- **L'auxiliaire note pour son groupement.** `avis.donner` est accordé aux
  auxiliaires ; la note engage la réputation de la contrepartie, pas les
  finances du parent, ce qui la distingue de la validation. Une seule note par
  groupement et par transport. **À contester si** la notation est tenue pour un
  acte réservé au titulaire.
- **Les rôles institutionnels échappent à la retenue de l'identité.**
  Concessionnaire, DGTTC et profils de niveau 3 lisent raison sociale et
  immatriculation sans condition d'état, dans la mesure où leur classification
  l'ouvre (§ 4) : ils supervisent sans transiger, et ne tirent aucun avantage
  d'un contournement des frais. Téléphone, courriel et adresse leur restent
  fermés ; l'agent d'activation reçoit en outre, par le seul service de
  vérification, la carte grise et le permis qu'il contrôle.

**Couverture de test.** `tests/anti-fraude.test.mjs` vérifie notamment que
`groupement.verifier` n'appartient qu'à `activation_inscription` et que
transporteur, concessionnaire, DGTTC et affréteur sont refusés ; qu'aucun rôle
sans `compte.valider_credit` ne valide un crédit, et que son auteur ne le
valide pas même avec le droit ; qu'aucun rôle ne détient `appariement.expirer`
et que la transition `expirer` appartient à la seule partie `systeme` ; qu'un
rôle institutionnel ne peut pas noter. Le masquage de l'identité est en outre
couvert par `tests/access.test.mjs` et `tests/vues.test.mjs`.
