# Contre-vérification des correctifs — POC B2F, J3 bis

> **Auteur : agent `qa-testeur`. 24 septembre 2026.**
> Fait suite à `01-rapport-campagne-adversariale.md` (21 défauts) et aux
> correctifs D61–D66 de `senior-fullstack`.
>
> **Principe : je n'ai pris la parole de personne.** Chaque correctif a été
> réattaqué avec les mêmes armes que la première campagne — application lancée,
> trois onglets Chrome réels, harnais Node, lecture du source.

---

## 1. Verdict

> ## GO pour la démonstration devant l'OIC.
> **Aucun bloquant, aucun majeur ne subsiste.** Deux défauts mineurs et quatre
> observations, dont aucune n'empêche la démonstration.

Les 21 défauts du premier rapport sont traités : **19 corrigés et vérifiés**,
2 reportés avec un motif que j'accepte (§ 5). Les correctifs ne se contentent pas
de faire passer mes tests : ils ferment la **cause** — c'est le point que j'ai
cherché à prendre en défaut, et il tient.

| Contrôle | Résultat |
|---|---|
| Mes 10 tests de bugs ouverts, non neutralisés ni affaiblis | ✅ **vérifié ligne à ligne** — assertions, messages et seuils identiques ; aucun `skip`, `todo` ni `only` dans tout `tests/` |
| Suite complète | 480 tests, 480 verts, code de sortie 0 |
| Barrière `_donnees.js` réattaquée | ✅ tient — et elle est **doublée** par un refus au niveau du service |
| Arbitrage D60 sur l'écran de validation | ✅ conforme à la résolution |
| Verrou anti-débit concurrent à 3 onglets et plus | ✅ éprouvé jusqu'à 7 |
| Accessibilité réelle du bouton refusé | ✅ focusable, décrit, sans effet |

---

## 2. Ce que j'ai réattaqué, et ce que j'ai observé

### 2.1 La barrière d'accès aux données (D61) — l'essentiel

C'était le point structurel à valider. Je l'ai attaquée par trois chemins.

**Par la vue partagée**, celui qui avait produit QA-01. Un transporteur étranger
au dossier ouvre `#/transporteur/relations/<id d'un dossier entre deux
concurrents>` :

```
Mise en relation inaccessible
Cette mise en relation ne concerne pas votre groupement.
```

J'ai cherché **sept marqueurs** dans la page rendue — référence du dossier, les
deux raisons sociales, le montant des frais, l'immatriculation, la carte grise, le
téléphone du transporteur. **Aucun ne sort**, pour aucun des quatre rôles testés
(transporteur tiers, affréteur tiers, agent de caisse, partenaire).

Meilleur que demandé : pour l'agent de caisse et l'affréteur tiers, **le refus
n'est même pas celui de la vue** — le service `mesAppariements()` lève avant, sur
`appariement.lire`. Deux verrous en série, pas un.

**Par les entités que le test d'architecture ne couvre pas.** La liste `sensibles`
de `tests/conformite.test.mjs` ne porte que cinq entités
(`utilisateur, chauffeur, operation, appariement, groupement`). J'ai donc visé ce
qu'elle ignore : `vehicule` (qui porte `carteGrise`, classé `contact`) et
`transport` (qui porte les observations du journal), sur les écrans
« Parc de véhicules » et « États » de la DGTTC et du concessionnaire.

**Rien ne fuit.** La lecture brute résiduelle de `supervision.js:523` sert
uniquement à calculer la publiabilité d'un véhicule ; toutes les colonnes affichées
viennent de l'objet projeté. C'est un usage légitime d'un objet brut — pour
décider, pas pour afficher.

**Par le source.** Il reste 26 appels `depot(...)` dans les vues. Je les ai tous
regardés : ce sont des `lisiblesPar()` (qui projettent), des `lire()` avec contexte,
ou des lectures de référentiels publics. **Aucune lecture brute d'entité classée à
des fins d'affichage.**

> **Conclusion sur le point de contrôle n° 1 de l'audit sécurité** (« toute lecture
> passe-t-elle par `decider()` puis `projeter()` ? »), dont ma première campagne
> répondait **non** : la réponse est désormais **oui** sur tous les chemins exercés.

### 2.2 L'arbitrage D60 — écran de validation

Rendu réel, affréteur connecté, dossier accepté :

```
Le débit — Les deux parties sont débitées à la validation.

Vous — Cacao Lagunes Export DÉMO
   Solde avant : 200 000 F CFA
   − 15 000 F CFA
   Solde après : 185 000 F CFA

Transporteur — Trans Lagunes DÉMO
   Compte provisionné
   − 15 000 F CFA
   Débité au même instant

Total prélevé par la plateforme    30 000 F CFA
Le solde du compte de la contrepartie ne vous […]
```

Conforme à la résolution, et sur trois plans :

| Contrôle | Résultat |
|---|---|
| `soldeTransporteur` dans le retour du service | ✅ **la clé n'existe plus** |
| Solde réel du transporteur (120 000) dans la page | ✅ absent |
| Mon propre solde, avant et après | ✅ chiffré |
| Contrepartie | ✅ « Compte provisionné », sans montant |
| **Transporteur à découvert** — le manque est-il déductible ? | ✅ **non chiffré** |

Ce dernier point est celui que j'attendais au tournant : un écran qui dirait
« il manque 10 000 F » livrerait le solde par soustraction. Il ne le dit pas. Et
une phrase explique au lecteur *pourquoi* ce chiffre lui est refusé — la
plateforme enseigne sa règle au lieu de la subir.

### 2.3 Le verrou de concurrence — trois onglets et plus

Signalé comme non éprouvé. Attaqué à deux niveaux.

**Sept écrans de validation ouverts avant toute validation** (harnais Node) :

```
onglet 1: ✅ VALIDÉ | onglets 2 à 7 : refusés (RefusMetier)
opérations : 2 (attendu 2) ✅   transports : 1 ✅   solde 200 000 → 185 000 ✅
validations réussies : 1
```

**Trois onglets Chrome réels**, tous chargés sur `#/affreteur/validation/<id>`
avant que le premier ne valide, puis **cinq clics au total** (double clic dans le
premier, triple dans le dernier) :

| | |
|---|---|
| Opérations | 2, de 15 000 chacune |
| Transports | 1 |
| Solde affréteur | 200 000 → 185 000 |
| Solde transporteur | 120 000 → 105 000 |
| État de l'appariement | `valider` |
| Journal d'annulation résiduel | aucun |

**Trois dossiers *indépendants*, trois écrans ouverts d'abord** — le scénario que
QA-07 dénonçait : deux passent, le troisième est refusé. J'ai vérifié que ce refus
n'est pas le verrou : le transporteur du troisième dossier a **5 000 F pour
15 000 F de frais**, et l'écran l'annonçait déjà avant le clic
(`contrepartieProvisionnee: false`). C'est un refus métier, pas un faux positif.
**QA-07 est bien corrigé.**

### 2.4 L'accessibilité du bouton refusé — restitution réelle

Signalée comme non éprouvée. Mesurée sur l'écran de validation ouvert par un
auxiliaire, dans Chrome :

```json
{ "disabled": false, "aria-disabled": "true",
  "aria-describedby": "motif-c2u89c2", "tabIndex": 0 }
```

| Contrôle | Résultat |
|---|---|
| Atteignable par `Tab` | ✅ `tabIndex: 0`, reçoit réellement le focus |
| `aria-describedby` pointe vers un élément **existant** | ✅ |
| Contenu de cet élément | « La validation engage les finances de votre groupement : elle débite ses frais de mise en relation, et ceux du transporteur. Un sous-compte prépare les… » |
| Motif **visible** à l'écran, pas seulement en `title` | ✅ |
| Le clic reste sans effet | ✅ aucune opération créée |

Le cas d'échec n° 2 de la conception UX est **enfin conforme** : il dit *pourquoi*
(D64), et il le dit à tout le monde (D65).

**Réserve que je maintiens** : je n'ai pas testé avec un lecteur d'écran réel
(VoiceOver, NVDA). J'ai vérifié que le nom accessible, l'état et la description
sont correctement calculés — ce qui est la condition nécessaire — mais la
restitution vocale effective reste non éprouvée. Pour une démonstration, c'est
suffisant ; pour une refonte, une passe avec un utilisateur de lecteur d'écran
reste due.

### 2.5 Les autres correctifs, revérifiés

| # | Correctif | Vérification |
|---|---|---|
| QA-03 | KPI cloisonné | Affréteur sans transport, un transport tiers en route → **KPI = 0** ✅ |
| QA-04 | Retrait d'offre réservée | Correction n° 2 retenue : offre `retiree`, **appariement `annuler`**, **demande rendue `publiee`**. Plus de zombie, plus d'immobilisation. Après acceptation, le bouton est bloqué et le service refuse ✅ |
| QA-05 | Motif métier | Servi, vérifié ci-dessus ✅ |
| QA-06 | Intégrité des sous-structures | Produit inexistant en ligne de marchandise : refusé ✅ |
| QA-09 | LocalStorage hors des vues | Plus aucune occurrence dans `js/views/` ✅ |
| QA-10 | Routes en dur | Plus aucune ✅ |
| **QA-BROUILLON** | Brouillon d'assistant | Changement de compte → **champ vide** ✅ ; navigation normale du même utilisateur → **brouillon conservé** ✅. Cloisonné sans casser la fonctionnalité |
| QA-INST | Rôles institutionnels | Concessionnaire et DGTTC voient **2 transports sur 2** ✅ |
| QA-TOAST | Notifications | Double clic sur l'onglet qui réussit → **un seul message** ✅ |
| QA-M5 | Nommage | `<main>` présent, **13 éléments interactifs sur 13 nommés**, **0 tableau sans nom accessible** ✅ |

---

## 3. Défauts résiduels — aucun bloquant

### R1 — Toasts empilés sur un écran périmé (mineur)

Trois clics sur le bouton d'un onglet dont l'écran est périmé produisent **trois
messages identiques** empilés. Le cas nominal est corrigé (un seul message) ; le
cas d'échec répété ne l'est pas. Cosmétique. Un verrou de réentrance sur le
gestionnaire, ou la déduplication des messages identiques, suffirait.

### R2 — QA-M3 inchangé, et son message de repli est hors sujet (mineur)

L'écran de blocage sur données corrompues est toujours sans issue :

```
La démonstration n'a pas pu démarrer
La collection « appariements » est illisible et n'a pas été interprétée.
Servez la page depuis http://localhost:8081 : les modules ES et Web Crypto
exigent un contexte sécurisé, qu'un fichier ouvert en file:// ne fournit pas.
```

Seul lien de la page : « Aller au contenu ».

**J'accepte le report** du parcours de reprise : il demande une conception (que
restaure-t-on ? avec quelle confirmation ?) et le déclencheur exige d'ouvrir la
console. **Mais le second paragraphe est faux dans ce cas** : il parle de `file://`
alors que la cause est une corruption de données, et il est affiché *sous* la vraie
cause. Corriger ce message n'est pas une conception, c'est une condition. À traiter
avant la démonstration, à la place du bouton.

### R3 — Les tests d'architecture ne couvrent pas le cas qui a produit le bug (observation)

Les deux garde-fous de D61 sont utiles, et je les veux conservés. Mais ils ne
tiendront pas tout ce que leur intitulé promet :

| Garde-fou | Angle mort |
|---|---|
| Lecture brute interdite | La liste `sensibles` ne porte que 5 entités. `vehicule` (carte grise), `transport` (journal), `dut`, `notification`, `abonnement` n'y sont pas. |
| — | Le motif `depot\('x'\)\.brut` se contourne sans le vouloir : `const d = depot('appariement'); d.brutTous()` passe, `depot("appariement")` aussi. |
| Route en dur interdite | La règle « une vue peut nommer **son** espace » exempte `affreteur.js` — **or c'est précisément `affreteur.js` qui est servi à l'espace transporteur** (`app.js:57` et `:59`). Le test n'aurait donc pas attrapé QA-02bis. |
| — | Seul `href:` est examiné ; `aller('#/affreteur/…')` ne l'est pas. |

**Aucun cas réel aujourd'hui** — je les ai tous cherchés. C'est une dette de
garde-fou, pas un défaut : à traiter quand la liste des vues partagées grandira
(J4/J5). La correction juste est d'exempter non pas « le fichier du même nom » mais
« les espaces où la vue est réellement routée ».

### R4 — Deux décisions portent le numéro D61 (observation)

`journal.md` attribue **D61** à la fois à la barrière `_donnees.js`
(`senior-fullstack`) et au support pédagogique `b2f-comprendre.html`
(`ux-designer`). Le journal est la référence partagée de l'équipe : une
référence ambiguë s'y propage. À renuméroter.

### R5 — Le seul dossier validé du jeu de démonstration appartient à un groupement suspendu (mineur)

Le second dossier ajouté par D66 remplit parfaitement son office : il donne aux
tests un « dossier d'autrui » à opposer à l'affréteur 1. Mais il appartient à
`grp-aff-2`, **dont l'abonnement est expiré** — c'est aussi le groupement qui
démontre le blocage M10.2.

Conséquence en démonstration : en se connectant à `affreteur2@demo.invalid`, on
tombe sur « Accès suspendu » et **on ne peut pas montrer la mise en relation
validée déjà présente au démarrage**. L'acte 6 (coordonnées révélées) suppose de
rejouer tout le parcours. Rattacher ce dossier à un troisième groupement, ou
donner à `grp-aff-2` un abonnement actif et déplacer le cas « expiré » ailleurs,
lèverait la gêne.

---

## 4. Ce que je n'ai pas pu prendre en défaut

Points attaqués sans succès — ils sont désormais figés par les tests :

- Le refus d'un dossier tiers, sur **sept marqueurs** et **quatre rôles**.
- L'écran de validation, y compris quand la contrepartie est à découvert.
- Le double débit, jusqu'à **7 écrans concurrents** et **5 clics réels**.
- Le brouillon d'assistant, dans les deux sens (cloisonné **et** conservé).
- Les entités hors de la liste `sensibles`, sur les écrans de contrôle.
- L'atomicité sous quota (réattaquée, inchangée).

---

## 5. Les deux reports — position

| Report | Position |
|---|---|
| **QA-M3, parcours de reprise** | **Accepté.** Le déclencheur exige la console ; le rollback transactionnel, lui, est propre (revérifié). Ce n'est pas un bricolage qu'il faut, c'est une conception. **Mais R2 doit être traité** : un message de repli qui parle de `file://` sur une corruption de données induit en erreur, et ça se corrige en une ligne. |
| **`reprendreSession()` non journalisé** | **Accepté, et bien traité.** Aucun contrôle côté client n'y résisterait : c'est exact. Le README porte désormais la mise en garde exacte — *« Si le journal est présenté comme preuve de traçabilité, il faut dire que celle-ci suppose un serveur »*. C'est la bonne réponse à une limite structurelle : la documenter avec sa conséquence sur le discours de démonstration, plutôt que simuler une protection. |

---

## 6. Ce qui reste non couvert

Inchangé depuis le § 11 du premier rapport, et toujours vrai :

- Aucun test avec un **lecteur d'écran réel** — seul l'arbre d'accessibilité a été
  vérifié (§ 2.4).
- Aucune mesure de **contraste** WCAG.
- Aucun test sur **mobile réel**, ni sous 400 px.
- Aucun test de **charge**.
- Les écrans **J4/J5** non réalisés, et les **rôles de niveau 3** au-delà de leur
  route d'accueil.
