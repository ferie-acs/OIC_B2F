# Campagne QA adversariale — POC B2F, jalon J3

> **Auteur : agent `qa-testeur`. 24 septembre 2026.**
> Périmètre : livraison J2–J3 (443 tests passants), après audit `security-expert`
> (GO avec réserves, réserves levées).
>
> Méthode : **chercher ce qui casse, pas confirmer ce qui marche.** Application
> réellement exécutée (`python3 -m http.server 8081`, Chrome), plus un harnais
> Node exerçant services et vues hors navigateur.

---

## 1. Verdict

> **GO pour la démonstration interne, NO-GO pour une démonstration devant l'OIC
> tant que les trois bugs bloquants ne sont pas corrigés.**

Le noyau que le développeur avait signalé comme fragile — l'isolation contre les
débits concurrents (correctif S4) — **tient**. Double clic réel, triple clic,
deux onglets ouverts simultanément sur le même écran de validation, saturation du
stockage en plein double débit : aucun double débit, aucune écriture partielle,
aucun journal d'annulation résiduel. C'est le point le plus sensible du POC et
c'est le mieux tenu.

Les défauts trouvés sont ailleurs, et ils suivent tous **le même motif** : le
domaine est rigoureux, **les vues le contournent**. Là où un service passe par
`decider()` puis `projeter()`, une vue lit l'objet brut et l'affiche. C'est
exactement le point de contrôle n° 1 que l'audit de sécurité demandait de rejouer
en J3 (`docs/securite/audit-matrice-roles.md` § 8.1) :

> « Toute lecture de dépôt passe-t-elle par `decider()` **par objet** puis
> `projeter()` ? Rien ne l'impose aujourd'hui — un service peut renvoyer un objet
> brut. »

**Réponse : non.** Trois cas concrets, dont deux exploitables par un utilisateur
ordinaire depuis la barre d'adresse.

| | |
|---|---|
| Bugs **bloquants** | 3 |
| Bugs **majeurs** | 4 |
| Bugs **moyens** | 6 |
| Bugs **mineurs** | 8 |
| Comportements éprouvés **sains** | 14 familles |
| Tests ajoutés | 34 (24 verts, 10 rouges — un par bug ouvert) |

---

## 2. Ce qui a été réellement exercé

| Axe | Comment | Résultat |
|---|---|---|
| Double clic sur « Valider » | Chrome, trois clics consécutifs sur le bouton réel, sans laisser respirer la boucle d'événements | ✅ un seul débit |
| Deux onglets simultanés | Deux onglets Chrome sur `#/affreteur/validation/<id>`, écrans construits avant toute validation, puis clic dans chacun | ✅ le second refusé, message explicite |
| Deux dossiers concurrents | Deux écrans de validation sur deux dossiers **indépendants** | ❌ le second refusé à tort (QA-07) |
| Stockage saturé | Backend à quota, échec en plein lot de cinq collections | ✅ rien écrit, pas de journal résiduel |
| Données corrompues | `localStorage.setItem('b2f_appariements', '{…')` puis rechargement | ✅ refus explicite, pas de page blanche |
| Saisies hostiles | 16 combinaisons sur l'assistant en 3 étapes | ✅ 14 refusées, ❌ 2 acceptées |
| Cloisonnement par URL | Cinq rôles, routes devinées avec l'identifiant d'un dossier tiers | ⚠ coordonnées closes, **montants ouverts** |
| Changement de compte en session | Déconnexion / reconnexion sans rechargement | ❌ brouillon de l'assistant hérité |
| Accessibilité | Arbre ARIA réel, focus, `disabled`, nommage des tableaux | ⚠ socle bon, boutons refusés inaccessibles |
| Cas d'échec UX | Les cinq de `docs/ux/01-parcours-et-navigation.md` § 2.2 | ✅ 3 conformes, ⚠ 1 partiel, ❌ 1 non conforme |

**Sur les « 6 cas d'échec » de la commande.** La conception UX en spécifie **cinq**
(§ 2.2). Un sixième contrôle, distinct, figure au § 2.3 — *départ dans le passé,
bloquant à la publication et non au brouillon* : il est **implémenté et vérifié**
(`js/services/fret.service.js:41`). Le décompte est donc 6 contrôles attendus,
5 conformes, 1 non conforme (cas auxiliaire).

---

## 3. Bugs bloquants

### QA-01 — Un tiers lit les montants d'une mise en relation d'autrui

**Sévérité : bloquant.** Fuite de données d'affaires entre locataires.

| | |
|---|---|
| Emplacement | `js/views/affreteur.js:905` (lecture brute) et `:957-969` (affichage) |
| Route | `#/transporteur/relations/<id>` — servie par `affreteur.relations` (`js/app.js:57`) |

**Reproduction — vérifiée dans Chrome.**

1. Se connecter en `affreteur@demo.invalid` / `demo2026`, mener une mise en
   relation jusqu'à validation. Noter son identifiant (`app-0452667f`).
2. Se déconnecter, se connecter en `transporteur2@demo.invalid` — **étranger au
   dossier** (groupement `grp-tra-2`, alors que le dossier lie `grp-aff-1` à
   `grp-tra-1`).
3. Saisir `#/transporteur/relations/app-0452667f`.

**Observé :**

```
Les écritures
Partie          Montant         Horodatage
Affréteur       15 000 F CFA    24/09/2026 · 14:30
Transporteur    15 000 F CFA    24/09/2026 · 14:30
```

**Attendu :** un refus explicite, ou au minimum aucun montant.

**Cause.** `ficheRelation()` fait `depot('appariement').brutParId(id)` — objet
brut, sans contrôle de partie prenante et sans `projeter()`. Les coordonnées sont
correctement closes (la projection les gouverne bien, `:914-919`), mais les
montants, lus sur l'objet brut, échappent à tout verrou. La classification
`financier` que la matrice ferme à la DGTTC (`js/domain/permissions.js:511`) est
contournée par construction.

**Aggravant.** Le bandeau affiche à ce tiers « **Coordonnées non transmises — Les
coordonnées seront transmises dès la validation de la mise en relation** ». Le
dossier *est* validé. Le message est faux, et il suggère à un curieux qu'il lui
suffirait d'attendre.

**Correctif attendu.** Vérifier que le contexte est l'une des deux parties avant
tout rendu, puis servir un objet projeté. Un refus explicite pour un non-partie.

---

### QA-02bis — « Suivre le transport » renvoie le transporteur sur un écran de refus

**Sévérité : bloquant.** Rompt l'acte 7 du fil narratif de démonstration.

| | |
|---|---|
| Emplacement | `js/views/affreteur.js:973` — `href: '#/affreteur/suivi'` écrit en dur |

**Reproduction — vérifiée dans Chrome.**

1. `transporteur@demo.invalid` / `demo2026`, sur une mise en relation validée.
2. `#/transporteur/relations/<id>` → la fiche s'affiche correctement.
3. Cliquer **« Suivre le transport »**.

**Observé :** `#/affreteur/suivi` → « **Cet écran ne vous est pas accessible.**
L'adresse demandée appartient à l'espace « affreteur ». »

**Attendu :** `#/transporteur/suivi`.

**Cause.** La fiche est délibérément partagée entre les deux espaces
(`js/app.js:57`, « même fiche, deux lectures ») mais elle contient une route
codée en dur vers l'espace affréteur. Le même fichier fabrique ailleurs la route
par `ctx.roleId.includes('transporteur')` (`:888`) — heuristique par sous-chaîne
qui enverra un rôle `partenaire` vers l'espace affréteur.

**Correctif attendu.** Dériver le segment d'espace de `nav.segmentEspace(ctx)`,
comme le routeur, jamais d'une chaîne littérale ni d'un `includes`.

---

### QA-04 — Retirer une offre réservée laisse un appariement zombie

**Sévérité : bloquant.** Impasse fonctionnelle silencieuse + incohérence de données.

| | |
|---|---|
| Emplacement | `js/services/flotte.service.js:167` — `retirabilite()` n'examine que `accepter` et `valider` |

**Reproduction.**

1. Affréteur : réserver un véhicule. L'appariement passe à `reserver`, l'offre à
   `reservee`, la demande à `reservee`.
2. Transporteur, **sans répondre** : « Mes offres publiées » → **Retirer**. Le
   bouton est actif, le retrait passe.

**Observé :**

```
offre : retiree | appariement : reserver | demande : reservee
```

- L'affréteur voit toujours « **Réservée — en attente de la réponse du
  transporteur** » : il attend une réponse qui ne viendra jamais.
- Le transporteur ne *peut plus* répondre : « L'offre de véhicule n'est plus
  disponible ».
- La demande reste immobilisée hors du marché, à l'état `reservee`.
- Seule issue : que l'affréteur devine qu'il doit annuler lui-même.

**Attendu :** soit le retrait est refusé tant qu'une réservation est en attente
(le cas d'échec n° 4 de la conception UX le laisse entendre), soit il est autorisé
mais **clôt le dossier** — appariement à `annuler`, demande rendue au marché,
affréteur notifié dans un état lisible. Aujourd'hui la notification part
(`flotte.service.js:145`) mais **aucun état n'est corrigé**.

---

## 4. Bugs majeurs

### QA-02 — L'écran de validation chiffre à l'affréteur la trésorerie du transporteur

| | |
|---|---|
| Emplacement | `js/services/matching.service.js:337-361` (objet fabriqué à la main) → `js/views/affreteur.js:810-814` |

**Reproduction — vérifiée dans Chrome.** Écran `#/affreteur/validation/<id>` :

```
Transporteur — Trans Lagunes DÉMO
Solde avant : 105 000 F CFA
− 15 000 F CFA
Solde après : 90 000 F CFA
```

Le solde exact du compte de la contrepartie est affiché à l'affréteur.

**Pourquoi c'est un bug et pas une spécification.** La conception UX demande
« les deux débits, les deux soldes » (§ 1). Mais le domaine, lui, **prend soin de
ne pas chiffrer le compte du tiers** : quand le transporteur est à découvert, le
motif de refus dit « *le compte de la contrepartie n'est pas suffisamment
provisionné* », sans montant — contrôlé, aucun chiffre ne fuit (finding S6,
respecté). **Le service anonymise, l'écran chiffre.** Les deux ne peuvent pas être
justes en même temps.

`preparerValidation()` construit son résultat à la main, sans passer par
`projeter()` : la classification `financier` ne s'y applique pas.

**Arbitrage requis** avant correction. Ma recommandation : afficher **son propre**
solde chiffré et, pour la contrepartie, un indicateur binaire (« provisionné » /
« non provisionné »). L'affréteur a besoin de savoir si la validation aboutira,
pas de connaître la trésorerie d'un partenaire. À trancher avec `ux-designer` et
`security-expert`.

---

### QA-03 — Le KPI « Transports en route » compte toute la plateforme

| | |
|---|---|
| Emplacement | `js/views/affreteur.js:84` |

```js
valeur: depot('transport').brutOu((t) => t.etape === 'en_route').length,
```

Aucun filtre sur `ctx.groupementId`. **Mesuré :** un affréteur qui n'a **aucun**
transport en route voit `1` — le transport d'un concurrent. Fuite d'agrégat :
faible en volume, mais elle contredit frontalement ce que le POC démontre, et
elle est visible sur le premier écran de la démonstration. Le littéral
`'en_route'` y est en outre codé en dur au lieu de `ETAPE_TRANSPORT.EN_ROUTE`.

---

### QA-BROUILLON — Le brouillon de l'assistant passe d'un utilisateur à l'autre

| | |
|---|---|
| Emplacement | `js/views/affreteur.js:186` — `let brouillon = null;` au niveau module |

**Reproduction — vérifiée dans Chrome, sans aucun outil de développement.**

1. `affreteur@demo.invalid` → « Nouvelle déclaration » → saisir le libellé
   `SECRET-COMMERCIAL-AFFRETEUR-1`, provenance, destination → **Suivant**.
2. Se déconnecter (bouton de l'interface), se reconnecter en
   `affreteur2@demo.invalid` — **autre groupement**.
3. « Nouvelle déclaration ».

**Observé :** le champ « Libellé du fret » contient
`SECRET-COMMERCIAL-AFFRETEUR-1`. Les dates et le corridor de l'affréteur 1 sont
également hérités, et « Publier » les publierait sous le groupement de
l'affréteur 2.

C'est le geste le plus fréquent d'une démonstration multi-rôles : on change de
compte en permanence. `deconnecter()` (`js/services/auth.service.js:150`) ne remet
à zéro aucun état de vue.

---

### QA-07 — Deux dossiers indépendants ne peuvent pas être validés depuis deux onglets

| | |
|---|---|
| Emplacement | `js/core/storage.js:286` — le contrôle de version est **par collection** |

**Reproduction.** Deux mises en relation distinctes, deux écrans de validation
ouverts, solde largement suffisant pour les deux. Valider la première : succès.
Valider la seconde :

> « L'opération a été refusée : les données de **operations, appariements** ont
> été modifiées ailleurs pendant votre saisie (un autre onglet, ou une double
> soumission). Rien n'a été écrit. »

Le refus est **correct sur le principe** (l'instantané est périmé) mais **faux sur
le fond** : rien de ce dont dépendait la seconde décision n'a bougé. Le grain du
verrou est la collection, pas l'objet. Le message accuse en outre l'utilisateur
d'une « double soumission » qu'il n'a pas faite.

**Correctif attendu.** Affiner le contrôle : versionner par objet, ou revérifier
la garde réellement portante (l'état de *cet* appariement et le solde de *ces*
deux groupements) plutôt que l'horodatage global des collections. La relecture en
transaction (`matching.service.js:392`) fait déjà ce travail correctement ; c'est
le second verrou qui est trop large.

---

## 5. Bugs moyens

| # | Défaut | Emplacement | Détail |
|---|---|---|---|
| **QA-05** | Le refus opposé à l'auxiliaire dit *que*, pas *pourquoi* | `js/domain/permissions.js` (libellé du droit) | La conception UX (§ 2.2) exige : « Explique *pourquoi* c'est refusé (engagement financier du parent) ». Servi : « Le rôle « Auxiliaire d'affréteur » ne dispose pas du droit « Valider — déclenche le double débit ». » C'est le nom du droit, pas la raison métier. **Cas d'échec spécifié, non conforme.** |
| **QA-06** | L'intégrité référentielle ne descend pas dans les sous-structures | `js/repositories/repository.js:136` | `validerReferences()` ne parcourt que `def.champs` de premier niveau. Une ligne de marchandise référençant un produit SH inexistant est **acceptée** ; l'écran affiche ensuite « — ». Trou dans l'écart délibéré n° 4 (« intégrité explicite »), qui est un argument de la refonte. |
| **QA-08** | Un bouton refusé est inatteignable au clavier | `js/core/ui.js:184` | `disabled` + `title`. Un bouton `disabled` n'est pas focusable : le motif du refus n'existe **que pour la souris**. La décision D32 (« désactivé **et** expliqué ») n'est donc tenue que pour les voyants à la souris. Attendu : `aria-disabled="true"` seul, sans `disabled`, + `aria-describedby` vers le motif rendu visible. |
| **QA-09** | Une vue écrit directement dans LocalStorage | `js/views/affreteur.js:452-458, 493` | Viole la règle « `VUE → SERVICE → REPOSITORY → LOCALSTORAGE`, toute infraction est un rejet en revue » (`js/core/storage.js:4`). Trois conséquences : la clé `b2f_search_prefs` **échappe à `reinitialiser()`** (elle survit à une remise à zéro de la démonstration), elle n'est **rattachée à aucun utilisateur** (les critères de recherche d'un affréteur sont servis au suivant), et la parade du risque R5 cesse d'être vérifiable en un point. |
| **QA-INST** | Branche morte trompeuse sur les rôles institutionnels | `js/services/transport.service.js:248` | `if (ctx.groupementId == null) return true; // rôle institutionnel, portée TOUT`. Or concessionnaire et DGTTC **ont** un `groupementId` (`grp-oic`, `grp-dgttc`) : la branche n'est jamais vraie et ces rôles reçoivent **zéro transport**. Sans effet visible aujourd'hui (aucun écran de suivi ne leur est routé), mais le piège se referme dès qu'on leur en ouvre un en J4/J5. |
| **QA-TOAST** | Trois notifications contradictoires après un double clic | `js/views/affreteur.js:817-832` | Mesuré dans Chrome : « Mise en relation validée » puis **deux messages rouges** « Cette mise en relation n'est plus en attente de validation ». L'opération a réussi ; l'utilisateur voit deux erreurs. Le bouton n'est jamais désactivé pendant le traitement. |

---

## 6. Bugs mineurs

| # | Défaut | Emplacement |
|---|---|---|
| QA-M1 | Double clic sur « Publier la demande » → `TypeError: Cannot read properties of null (reading 'lignes')` en console. Aucun doublon créé, mais exception non gérée et silencieuse pour l'utilisateur. | `js/views/affreteur.js:373` |
| QA-M2 | Aucune borne haute sur le poids : `poidsT: 1e12` (mille milliards de tonnes) est accepté et publié. | `js/domain/schema.js` (champ `poidsT`) |
| QA-M3 | L'écran « La démonstration n'a pas pu démarrer » n'offre **aucun bouton de réinitialisation** : sur données corrompues, l'utilisateur est bloqué sans console. Son message de repli parle de `file://`, hors sujet pour cette cause. | `js/app.js:192-209` |
| QA-M4 | `fenetresSeRecouvrent(offre, undefined)` lève un `TypeError` au lieu de rendre `false`. | `js/services/matching.service.js:87` |
| QA-M5 | Les tableaux de données n'ont pas de nom accessible (`aria-label` existe en paramètre mais n'est jamais passé). Mesuré : 1 tableau sur 1 sur le tableau de bord. | `js/core/ui.js:96` |
| QA-M6 | Statuts en dur au lieu des énumérations : `'en_route'` (`affreteur.js:84`), `'disponible'` (`transporteur.js:91, 392`), tableau des six étapes (`commun.js:121`). | — |
| QA-M7 | `labelOf(e.valeur)` sur un élément de journal, sans garde : une valeur non répertoriée fait tomber **tout l'écran** de suivi. Non atteignable par l'interface (champs fermés), atteignable par donnée corrompue. | `js/views/commun.js:107` |
| QA-M8 | `commun.js` et `supervision.js` lisent des collections en brut sans projection (`supervision.js:362, 409, 413`). Légitime pour une portée `TOUT`, mais c'est le même motif que QA-01 : si un champ classé y était ajouté, il sortirait. | — |

---

## 7. Ce qui a été éprouvé et tenu

Ces points ont été **attaqués** et n'ont pas cédé. Ils sont figés par les 24 tests
verts de `tests/qa-adversarial.test.mjs`.

| Sujet | Épreuve | Résultat |
|---|---|---|
| **Double débit — double clic** | 3 clics consécutifs sur le bouton réel, Chrome | 2 opérations, 1 transport, −15 000 une seule fois |
| **Double débit — deux onglets** | Deux onglets réels, écrans construits avant toute validation | Le second refusé : « Cette mise en relation n'est plus en attente de validation » |
| **Atomicité sous quota** | Saturation en plein lot de 5 collections | Solde, opérations, état d'appariement et transports **inchangés**, aucun journal résiduel, message exact |
| **Journal du transport** | Marqueurs déposés par le transporteur, relus par 4 autres rôles | Seule la partie prenante lit. **Le point que `security-expert` demandait de rejouer est conforme** : la projection descend par élément (`access.js:443-458`) et une observation ne se libère pas parce qu'un autre dossier a été validé |
| **Coordonnées avant validation** | Fiche de relation sur un dossier à l'état `accepter` | Aucune coordonnée servie |
| **Coordonnées d'un dossier tiers** | 4 rôles, URL devinée | Aucune coordonnée servie à aucun |
| **Libération bornée à l'objet (S3)** | Véhicules du transporteur étrangers au dossier | Carte grise non servie |
| **Refus financiers (S6)** | Solde insuffisant de la contrepartie | Aucun montant, aucun solde tiers dans le motif |
| **Validation par un tiers** | `matching.valider` avec un contexte étranger | « Cette mise en relation ne concerne pas votre groupement. » |
| **Saisies hostiles** | Poids négatif / nul / NaN, volume négatif, colis nul ou décimal, aucune ligne, départ passé, arrivée ≤ départ, date illisible, libellé 500 car., provenance = destination | 14 refusées avec un message champ par champ |
| **XSS** | `<script>alert(1)</script>` en libellé | Stocké, **rendu inerte** : `innerHTML` est absent du code et le harnais de test ne l'implémente pas — une vue qui l'utiliserait échouerait (finding S13 tenu) |
| **Données corrompues** | JSON invalide injecté dans une collection | Refus explicite nommant la collection, pas de page blanche, pas de perte silencieuse |
| **Statuts bruts (D34)** | Rendu de tous les écrans des 5 rôles | Aucun statut brut. `labelOf()` lève sur valeur non répertoriée — le défaut se voit en développement, pas en démonstration |
| **Accessibilité — socle** | Arbre ARIA réel dans Chrome | Lien « Aller au contenu » présent, `lang="fr"`, rail `role="navigation"` + `aria-label="Zones"`, `aria-current` posé, 15 SVG sur 15 en `aria-hidden`, conteneur de contenu focusable, piège de focus et restauration dans les modales |
| **Préfixage LocalStorage (R5)** | Inventaire des clés après parcours complet | 17 clés, **toutes** en `b2f_` |

---

## 8. Réponses aux six points d'audit du § 8 sécurité

| # | Question de `security-expert` | Réponse mesurée |
|---|---|---|
| 1 | Toute lecture passe-t-elle par `decider()` par objet puis `projeter()` ? | **Non.** Trois contournements : QA-01 (montants d'un dossier tiers), QA-02 (solde de la contrepartie), QA-03 (agrégat de transports). Motif commun : objet brut rendu par une vue ou fabriqué à la main par un service. |
| 2 | Un affréteur ayant validé une mise en relation peut-il lire un contact non lié à celle-ci ? (S3) | **Non.** Vérifié sur les véhicules du transporteur étrangers au dossier : carte grise non servie. Correctif S3 tenu. |
| 3 | Concessionnaire et DGTTC reçoivent-ils un `contact` par un DUT, un journal, une notification, un tableau de bord ou un export ? | **Non.** Aucune coordonnée servie sur tous les chemins exercés. L'écran de contrôle affiche même « Aucun montant n'est servi à ce rôle. » **Mais** ils lisent les montants d'un appariement par la route `relations/:id` si elle leur est un jour ouverte (QA-01). |
| 4 | Deux onglets validant simultanément produisent-ils deux débits corrects, ou un refus ? | **Un refus**, propre et explicite. Éprouvé dans deux onglets Chrome réels. **Correctif S4 tenu.** Réserve : le refus est trop large sur deux dossiers indépendants (QA-07). |
| 5 | Un refus d'accès contient-il un montant, un solde ou une coordonnée d'un tiers ? | **Non pour les refus.** Mais l'écran de validation, lui, affiche le solde du tiers (QA-02) — le service anonymise, la vue chiffre. |
| 6 | Existe-t-il un seul `innerHTML` recevant une chaîne du domaine ? | **Aucun.** Absent du code et absent du harnais de test, ce qui rend la garantie vérifiable mécaniquement. |

---

## 9. Limite assumée, revérifiée — et une nuance

Le POC n'a pas de serveur : `sessionStorage` est lisible et modifiable. Vérifié :

```js
sessionStorage.setItem('b2f_session', 'u-conc');   // puis F5
```

L'affréteur devient concessionnaire et atteint « Comptes et soldes ». **C'est une
limite documentée** (`js/domain/access.js:24-30`, README), pas un bug — aucun
contrôle côté client ne peut y résister.

**La nuance à connaître pour la démonstration :** `reprendreSession()`
(`js/services/auth.service.js:126`) **ne journalise rien**. Une reprise de session
forgée ne laisse donc aucune trace dans le journal d'audit. Si le journal est
présenté comme preuve de traçabilité devant l'OIC, il faut dire que la traçabilité
est celle d'une application de démonstration, et qu'elle suppose un serveur pour
avoir une valeur probante.

---

## 10. Ordre de traitement recommandé

| Priorité | Bugs | Pourquoi d'abord |
|---|---|---|
| **1 — avant toute démonstration externe** | QA-01, QA-02bis, QA-04 | Une fuite entre locataires, un parcours de démonstration rompu, une impasse silencieuse |
| **2 — avant J4** | QA-02 (après arbitrage UX/sécurité), QA-03, QA-BROUILLON, QA-07 | Visibles en démonstration, contredisent le discours du POC |
| **3 — au fil de J4** | QA-05, QA-06, QA-08, QA-09, QA-INST, QA-TOAST | Conformité aux spécifications et aux règles d'architecture |
| **4 — adossés à un autre chantier** | QA-M1 à QA-M8 | Robustesse et finition |

QA-01, QA-02bis, QA-03, QA-09 et QA-INST partagent **une seule cause** : une vue
qui lit brut ou code une route en dur. Une passe unique sur `js/views/` les traite
ensemble ; un test d'architecture (comme QA-09, qui lit le source) empêchera la
récidive.

---

## 11. Ce qui n'a pas été couvert

Par honnêteté, ce que cette campagne **n'a pas** fait :

- **Aucun test sur un vrai lecteur d'écran** (VoiceOver, NVDA). L'analyse porte
  sur l'arbre ARIA et le comportement du focus, pas sur la restitution vocale.
- **Aucun test de contraste mesuré.** Les couleurs n'ont pas été passées au
  ratio WCAG.
- **Aucun test sur mobile réel** ni aucune vérification de la responsivité en
  dessous de 400 px.
- **Aucun test de charge** (10 000 offres, 100 000 mouvements) : le POC n'est pas
  dimensionné pour, mais la question se posera à la refonte.
- **Les écrans J4/J5 non réalisés** (notifications, abonnement, DUT, caisse) n'ont
  pas été testés : ils affichent « Cet écran est prévu au périmètre mais n'est pas
  réalisé à ce jalon », ce qui est le comportement attendu.
- **Les rôles de niveau 3** (les ~14 profils de back-office) n'ont été vérifiés
  que par leur route d'accueil, pas par un parcours.
