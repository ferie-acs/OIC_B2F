# Guide du développeur — POC B2F

> **Pour qui** : un développeur qui rejoint le projet et n'a suivi ni le cadrage,
> ni la conception. Objectif : savoir où se trouve quoi, et comment ajouter un
> écran ou un rôle sans casser les règles que le POC existe pour démontrer.
>
> **Auteur** : agent `redacteur-technique`, 24 septembre 2026.
> **Ce document décrit le code tel qu'il est**, vérifié fichier par fichier. Il
> ne rediscute aucune décision : celles-ci sont dans `01-note-architecture.md`
> (les six décisions d'architecture), `02-modele-de-donnees.md` (les entités) et
> `03-matrice-des-roles.md` (les rôles et les droits).

---

## 1. Avant de toucher au code : trois règles non négociables

Elles ne sont pas des conventions de style. Chacune est **vérifiée par un test**
qui échoue si vous l'enfreignez.

1. **`VUE → SERVICE → REPOSITORY → LOCALSTORAGE`.** Aucune vue, aucun service ne
   lit ou n'écrit LocalStorage directement. `js/core/storage.js` est le seul
   module qui y touche.
2. **Toutes les clés LocalStorage sont préfixées `b2f_`.** Le POC DUT tourne sur
   la même machine, et deux applications servies sur la même origine partagent le
   même stockage. Avec le port 8081, c'est la parade du risque R5.
3. **Un seul service change un état d'appariement** : `js/services/matching.service.js`.
   Le système existant porte trois mécanismes concurrents pour cette même règle —
   c'est le défaut principal que le POC corrige. Recréer un second chemin, même
   « juste pour clôturer », fait rougir `tests/conformite.test.mjs`.

S'y ajoutent trois interdits que le code rend **impossibles** plutôt que
déconseillés :

- `core/dom.js` ne sait pas fabriquer du HTML depuis une chaîne : `el()` lève si
  on lui passe `html` ou `innerHTML`. `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `eval` et `new Function` sont interdits dans tout le
  dépôt par un test (finding S13 — une raison sociale piégée s'exécuterait chez
  la contrepartie).
- Une vue ne lit pas une entité classée en brut : elle passe par
  `js/views/_donnees.js`.
- Une vue ne code pas en dur la route d'un autre espace.

## 2. Carte des dossiers

```
B2F/
├── index.html              Aucun script externe. 7 feuilles CSS + js/app.js (module).
├── Dockerfile              nginx:1.27-alpine, port 8081, aucune compilation.
├── css/                    tokens · base · layout · components · forms · b2f · responsive
├── js/
│   ├── app.js              Amorçage + déclaration des 50 routes. Point d'entrée unique.
│   ├── seed.js             Jeu de démonstration (fictif, marqué DÉMO). Une seule transaction.
│   ├── domain/             ★ PUR — aucune entrée-sortie, aucun import de core/ ni de repositories/
│   │   ├── enums.js        Valeurs stockées + libellés par point de vue
│   │   ├── schema.js       16 entités, classification des champs, contraintes,
│   │   │                   22 invariants locaux, 10 invariants croisés
│   │   ├── roles.js        Les 19 rôles, leur niveau, leur espace, leur preuve
│   │   ├── permissions.js  Catalogue de 47 droits + MATRICE rôle → portée
│   │   ├── access.js       decider() / projeter() — le moteur de décision
│   │   └── matching.state.js  Machine à états de l'appariement (pure)
│   ├── core/
│   │   ├── storage.js      SEUL module touchant LocalStorage. Préfixe, transactions,
│   │   │                   registre de versions, rejeu du journal d'annulation.
│   │   ├── dom.js          el(), remplacer() — construction DOM sans HTML-chaîne
│   │   ├── router.js       Routage par fragment d'URL (#/espace/page)
│   │   ├── nav.js          Arborescence générée depuis la matrice des droits
│   │   ├── layout.js       Shell à deux niveaux, thème, bandeau de démonstration
│   │   ├── ui.js           bandeau(), bouton(), badge(), toast(), modale()
│   │   └── crypto.js       PBKDF2-SHA256, 120 000 itérations, sel par compte
│   ├── repositories/
│   │   ├── repository.js   creerDepot(), valider(), ErreurValidation
│   │   └── index.js        initialiserPersistance(), depot(), reinitialiser()
│   ├── services/           audit · auth · compte · flotte · fret · matching ·
│   │                       notification · preferences · transport
│   └── views/
│       ├── _donnees.js     ★ LA BARRIÈRE — seul accès des vues aux dépôts
│       ├── login.js        Écran de connexion
│       ├── affreteur.js    Espace Affréteur (+ 2 écrans servis au Transporteur)
│       ├── transporteur.js Espace Transporteur
│       ├── commun.js       Écrans partagés : suivi, abonnement, groupement,
│       │                   utilisateurs, notifications, accueil minimal
│       └── supervision.js  Espaces Concessionnaire et DGTTC
└── tests/                  10 suites + helpers/mini-dom.mjs — 480 tests
```

**La couche `domain/` est la plus importante du projet.** Elle ne fait aucune
entrée-sortie, donc elle se teste par table de vérité et se lit sans traverser du
code de persistance. C'est aussi ce qui la rend **transposable telle quelle côté
serveur** — argument central de la démonstration. Ne lui faites jamais importer
`core/`, `repositories/` ou `services/`.

## 3. Le chemin d'une donnée, de bout en bout

Suivons une lecture, puis une écriture.

### Lecture — pourquoi une vue ne lit jamais un dépôt

```
vue  →  _donnees.lire(ctx, 'appariement', id)
          →  decider(ctx, droit)        // la matrice : autorisé ? avec quelle portée ?
          →  depot('appariement').brutParId(id)
          →  projeter(ctx, 'appariement', objet)   // retire les champs interdits
        ←  objet PROJETÉ (les champs refusés sont ABSENTS, pas null)
```

`projeter()` est **récursive** : chaque sous-champ d'un conteneur porte sa propre
classification (`public`, `identite`, `contact`, `financier`, `systeme`), et
`schema.js` **refuse de se charger** si un champ `object` ou `array` n'en déclare
pas. C'est le correctif du finding S1 : sans la récursion, `dut.donnees`,
`transport.journal` et `notification.corps` livraient au concessionnaire et à la
DGTTC les coordonnées que la matrice leur refuse.

Les champs refusés sont **absents de l'objet rendu** — pas masqués en CSS, pas
mis à `null`. Une valeur présente dans la mémoire d'une vue finit par s'afficher
quelque part.

### Écriture — pourquoi tout passe par un service

```
vue  →  service (ex. matching.valider)
          →  decider() / la machine à états : l'action est-elle permise ?
          →  gardes métier (solde suffisant, fenêtre recouvrante…)
          →  storage.transaction(travail, { attendu })   // atomique + isolé
                →  depot(...).creer / modifier            // schéma + invariants
          →  audit.service : écriture append-only
```

Deux mécanismes méritent d'être compris avant d'écrire une transaction :

- **Atomicité** (`D-A4`) — LocalStorage n'a pas de transaction, mais garantit
  l'atomicité *par clé*. `storage.js` construit un journal d'annulation écrit en
  une seule clé, appliqué puis effacé, et **rejoué au démarrage** s'il subsiste.
  Le double débit doit être tout ou rien.
- **Isolation** (finding S4) — un registre de versions par collection.
  `versions()` capture un instantané **avant** la décision,
  `transaction(travail, { attendu })` le revérifie **au commit**. Sans cela, le
  cycle « je lis, je vérifie, j'écris » est un TOCTOU : l'audit a reproduit deux
  validations concurrentes aboutissant à un solde faux, un débit ayant disparu.
  Le verrou porte sur **l'appariement concerné et le catalogue de tarifs**, pas
  sur les soldes (décision D63 : un verrou qui refuse ce qu'il devrait laisser
  passer finit par être désactivé).

## 4. Où se trouve la matrice des droits, et comment la lire

**Fichier : `js/domain/permissions.js`.** C'est la seule source de ce qu'un rôle
peut faire — menu compris. Rien n'est codé en dur ailleurs.

### Les trois objets à connaître

| Objet | Contenu |
|---|---|
| `DROITS` | Le **catalogue** : 47 droits, chacun avec son libellé et sa description. 25 portent `mutation: true` (leur cible est alors obligatoire, `exiger()` lève sinon) ; `droitsSensibles()` en rend 7, dont trois portent un champ `refus` — la **raison métier** servie à l'utilisateur quand l'accès est refusé, et non le nom du droit manquant (décision D64). |
| `MATRICE` | 19 entrées, une par rôle. Chaque entrée associe un droit à une **portée**. Un droit absent de l'entrée = refusé. |
| `CLASSIFICATIONS_LISIBLES` | Le **second verrou** : quelles classes de champs un rôle peut lire. C'est ce qui prive la DGTTC de tout montant au niveau des données, et pas seulement de l'affichage. |

### Un droit est une portée, pas un booléen

```js
AUCUNE      // refusé
PROPRE      // ses propres objets
GROUPEMENT  // les objets de son groupement
MARCHE      // les objets publiés sur le marché — et seulement si cible.publie === true
TOUT        // tout le parc
```

`can('appariement.lire') === true` laisserait chaque écran filtrer lui-même :
c'est la façon habituelle de fabriquer une fuite. `decider()` ne rend donc jamais
un booléen nu mais `{ autorise, portee, motif, explication }` — le même objet
sert la décision de sécurité **et** l'affichage du refus (« expliquer, ne pas
masquer », décision D32).

### Comment la matrice est écrite

Trois gabarits, puis des retraits explicites :

```js
const SOCLE_MARCHE = { 'dashboard.perimetre': GROUPEMENT, 'compte.lire': GROUPEMENT, ... };
const AFFRETEUR    = { ...SOCLE_MARCHE, 'declaration.creer': GROUPEMENT, ... };

auxiliaire_affreteur: sans(AFFRETEUR, [
  'appariement.valider',   // l'acte qui engage les finances du parent
  'appariement.repondre',  // accepter engage le parent sur un débit à venir
  'utilisateur.lire', 'utilisateur.gerer', 'groupement.gerer',
  'declaration.supprimer',
]),
```

`sans()` rend explicite ce qu'un rôle **perd** par rapport à son modèle. Une
table recopiée à la main cacherait un oubli ; ici il se voit.

### Règles de fond

- **Refus par défaut.** Un droit absent est refusé. Aucun rôle, `super_admin`
  compris, ne contourne la matrice.
- **Un rôle inconnu fait lever**, il n'est jamais traité comme « sans droit » :
  `porteeDe()`, `peutLireClassification()` et `droitsDuRole()` lèvent toutes les
  trois. C'est ce qui rend sûre la posture « ne rien inventer » sur le décompte
  des rôles (finding S10, décision D48).
- **`coordonnees.exception`** est déclaré au catalogue et **accordé à aucun
  rôle** — un test le vérifie pour les 19. C'est la place réservée du bris de
  glace : son ouverture exigera un motif saisi et une écriture au journal
  d'audit. Ce n'est pas un droit qu'on coche.

## 5. Ajouter un écran

Cinq étapes. La troisième est celle qu'on oublie.

1. **Écrire la fonction de vue** dans le fichier de l'espace concerné
   (`views/affreteur.js`, `transporteur.js`, `commun.js`, `supervision.js`).
   Elle reçoit le contexte et rend un nœud DOM construit avec `el()`.
   **Elle ne lit aucun dépôt** : tout passe par `_donnees.js`.

2. **Déclarer la route** dans `js/app.js`, sous la forme `espace/page` :

   ```js
   declarer('affreteur/mon-ecran', affreteur.monEcran);
   ```

3. **Déclarer la page dans `js/core/nav.js`**, dans la zone qui convient, **avec
   le droit qui l'ouvre** :

   ```js
   { route: 'mon-ecran', libelle: 'Mon écran', droit: 'declaration.lire' }
   ```

   C'est l'étape structurante : `arborescenceDe()` filtre zones et pages par
   `decider()`. **Une page dont le droit n'est pas accordé n'existe pas pour ce
   rôle** — ni dans le menu, ni comme route. Une page sans champ `droit` est
   ouverte à tous : ne l'employez que pour un écran réellement neutre.
   Si la zone entière n'a pas de sens sans un droit, posez `droitZone` : une zone
   « Marché » pour un rôle sans accès au marché disparaît alors complètement.

4. **Si l'écran affiche une entité classée**, vérifier que ses champs portent
   bien une classification dans `schema.js`. Un conteneur sans classification
   explicite fait **échouer le chargement du schéma** — c'est voulu.

5. **Écrire le test.** `tests/vues.test.mjs` pour le rendu et ce qui ne doit pas
   fuiter ; `tests/permissions.test.mjs` ou `access.test.mjs` si l'écran
   introduit une règle d'accès. Puis relancer **la suite entière**, pas seulement
   le test ciblé : c'est un test d'architecture écrit pour un autre motif qui a
   rattrapé la dernière régression en date.

## 6. Ajouter un rôle

Le mécanisme est dimensionné pour : un rôle coûte **une entrée déclarative et
une entrée de matrice**, rien n'est à réécrire.

1. **`js/domain/roles.js`** — ajouter l'entrée avec son `id`, son `libelle`, son
   `niveau` (`DEMONTRE` / `DECLINE` / `MODELISE`), son `espace`
   (`affreteur`, `transporteur`, `concessionnaire`, `dgttc`, `minimal`) et
   surtout son champ **`preuve`** : le fichier du système existant qui atteste
   son existence. **Aucun rôle n'est inventé ni déduit** — un test le vérifie.

2. **`js/domain/permissions.js`** — ajouter l'entrée correspondante dans
   `MATRICE`. Partir d'un gabarit et retirer avec `sans()` plutôt que recopier.
   Si le rôle lit des données classées, compléter `CLASSIFICATIONS_LISIBLES`.

3. **Rien d'autre, si le rôle réutilise un espace existant.** Le menu est généré
   depuis ses droits ; les routes de l'espace lui sont ouvertes par la matrice.
   C'est exactement ce que sont les rôles de niveau 2, déclinés de l'espace
   Transporteur, et ceux de niveau 3, qui atterrissent dans l'espace `minimal`.

4. **Si le rôle exige un espace propre** (niveau 1) : ajouter la valeur dans
   `ESPACE` (`roles.js`), l'arborescence dans `PAR_ESPACE` (`nav.js`), le fichier
   de vues, et les routes dans `app.js`.

5. **Ajouter un compte de démonstration** dans `js/seed.js` (`UTILISATEURS`), et
   dans `COMPTES_DEMO` seulement si le rôle doit apparaître sur l'écran de
   connexion.

6. **Tests.** `tests/permissions.test.mjs` couvre la matrice pour tous les rôles
   déclarés : plusieurs de ses assertions itèrent sur l'ensemble des rôles, et un
   rôle nouveau y entre automatiquement. Vérifier en particulier qu'il ne reçoit
   ni `coordonnees.exception`, ni un droit financier s'il est un contrôleur.

## 7. La machine à états de l'appariement

`js/domain/matching.state.js` — pure, sans entrée-sortie. Cinq états, six
transitions, six gardes.

```
(néant) --ENGAGER(initiateur)--> RESERVER --ACCEPTER(répondeur)--> ACCEPTER
                                     |                                |
                                     |--REJETER(répondeur)--> REJETER |
                                     |--ANNULER(les deux)---> ANNULER <-- ANNULER(les deux)
                                                                        |
                                            ACCEPTER --VALIDER(affréteur, financière)--> VALIDER
```

États terminaux : `REJETER`, `ANNULER`, `VALIDER`.
Gardes : `motifFourni`, `offreTenable`, `demandeTenable`, `fenetreRecouvrante`,
`soldeAffreteurSuffisant`, `soldeTransporteurSuffisant`.

**`VALIDER` est la seule transition financière** : elle déclenche le double débit
de 15 000 F CFA à chaque partie et la libération des coordonnées. Elle est
réservée à l'affréteur — jamais à ses auxiliaires.

La libération des coordonnées est calculée par `liberationsDe()`, fonction pure
du domaine, et **bornée à l'objet** : `objetsLiberes: Set<"entite:id">`. Une mise
en relation validée libère la contrepartie, l'offre appariée, son véhicule et son
chauffeur — **pas le reste du parc**. Avant le correctif S3, elle libérait tout
le groupement : l'affréteur obtenait pour un tarif unique l'annuaire complet d'un
transporteur, alors que la plateforme vend une mise en relation à la fois.

## 8. Lancer, tester, déboguer

```bash
# Servir (le port 8081 est obligatoire — voir README)
python3 -m http.server 8081

# Tester — le verdict est le code de sortie, jamais la lecture de la sortie
node --experimental-default-type=module --test tests/*.test.mjs
```

**La commande exacte importe** : `node --test tests/` (le répertoire) échoue,
`node --test tests/*.test.mjs` passe. C'est le finding S16, fixé ici et pour la
future CI.

Points de repère utiles :

- **L'application démarre sans style** → vous avez inventé des noms de classes.
  Le CSS livré fait foi (décision D55) : inventoriez ses classes
  (`grep -oE '^\.[a-z0-9-]+' css/*.css`) et conformez-vous-y.
- **Repartir d'un stockage vierge** → vider le stockage du site dans les outils
  de développement, ou ouvrir la page en navigation privée. `seed.js` ne
  réamorce que si `dejaAmorce()` est faux.
- **Une transaction interrompue** est rejouée au démarrage et signalée en console
  (`[B2F] Transaction interrompue annulée : …`).
- **Vérifier dans un navigateur, pas par lecture du code.** C'est le point 1 de
  la *Definition of Done*, et il a déjà rattrapé trois défauts qu'aucun test ne
  pouvait voir : messages d'erreur invisibles faute de style `.toast`, barre
  latérale débordant sous le bandeau de démonstration, statuts affichés bruts.

## 9. Dettes connues et angles morts

À lire avant de croire qu'un garde-fou vous protège.

| # | Dette | Où |
|---|---|---|
| **D69** | Les deux tests d'architecture de D61 ne tiennent pas tout ce que leur intitulé promet : la liste `sensibles` ne couvre que 5 entités des 16 ; le motif de détection se contourne sans le vouloir (`const d = depot('x'); d.brutTous()` passe) ; et la règle « une vue peut nommer **son** espace » exempte `affreteur.js`, **qui est précisément la vue servie à l'espace transporteur** (`app.js:57` et `:59`). La correction juste est d'exempter non pas « le fichier du même nom » mais « les espaces où la vue est réellement routée ». | `tests/conformite.test.mjs` |
| **R1** | Trois clics sur le bouton d'un écran périmé empilent trois messages identiques. Un verrou de réentrance ou la déduplication suffirait. | vues |
| **R2** | L'écran de blocage sur données corrompues affiche un paragraphe hors sujet parlant de `file://` alors que la cause est une corruption de données — et il est affiché *sous* la vraie cause. | `js/app.js:205` |
| **QA-M3** | Cet écran de blocage n'offre aucune issue : pas de bouton de réinitialisation. Reporté volontairement — c'est une conception qu'il faut, pas un bricolage. | `js/app.js:196` |
| **R5** | Le seul second dossier validé du jeu de démonstration appartient à `grp-aff-2`, dont l'abonnement est expiré par conception. Gêne la démonstration : `affreteur2@demo.invalid` ouvre « Accès suspendu ». | `js/seed.js:277` |
| **S13** | La surface XSS est fermée par `core/dom.js` et un test, non par une règle de revue. Si vous ajoutez un module de rendu, il doit hériter de la même incapacité. | `js/core/dom.js` |
| — | **Le journal d'audit ne trace pas la reprise de session.** `sessionStorage` étant modifiable, une session forgée n'y laisse aucune trace. Aucun contrôle côté client n'y résisterait : c'est documenté, pas corrigé. | `services/auth.service.js` |

## 10. Ce qui n'est pas encore écrit

Périmètre J4 et J5. **Attention au plan de suivi** : il situe M7 (notifications)
et M8 (tableaux de bord) en second incrément, alors qu'ils ont été livrés en
J2–J3. Ce qui reste réellement :

| Réf. | À écrire |
|---|---|
| **M8.4** | Export CSV de l'historique (priorité `C` au backlog) |
| **M1.6** | Écran « Utilisateurs et rôles » du concessionnaire **réellement administrable** — aujourd'hui la matrice y est consultable, pas modifiable |
| **M10.3** | Prolongation d'abonnement par le concessionnaire. Le droit `abonnement.prolonger` est **déjà déclaré dans la matrice** ; aucun écran ne l'exerce |

M9 a été intégré le 01/10/2026 : `views/dut.js`, `services/dut.service.js` et
`css/dut.css` proposent aperçu, génération idempotente et impression/PDF via le
navigateur. L’identifiant du DUT reprend celui de l’appariement afin de respecter
la clé de libération `dut:APP_ID`. L’instantané est projeté selon le rôle et
conservé avec un événement d’audit ; aucun paiement ni appel au système DUT
externe n’est déclenché par sa génération.

Routes : `transporteur/dut`, `affreteur/duts`, `concessionnaire/duts` et
`minimal/duts`, toutes soumises à `dut.lire`. La DGTTC n’a pas ce droit dans la
matrice actuelle. Le service réserve `dut.generer` à l’équipe du transporteur
concerné après validation de la mise en relation.

`services/dut-demo.js` ajoute sur clic un dossier fictif dédié au compte
transporteur initial. Il passe par le matching existant et ses débits fictifs,
provisionne uniquement un manque éventuel, et ne remplace aucun dossier.

Les rôles de niveau 3 ne sont testés qu'au-delà de leur route d'accueil ; les
écrans J4/J5 ne le sont pas du tout.
