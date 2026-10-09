# B2F — Bourse de Fret (preuve de concept)

Démonstration exécutable de la cible de refonte de la **Bourse de Fret de
l'Office Ivoirien des Chargeurs**. Aucun serveur, aucune donnée réelle.

**→ [Ouvrir la démonstration](https://ferie-acs.github.io/OIC_B2F/)**

> **Preuve de concept.** Toutes les données sont **fictives** et marquées
> « DÉMO ». Les documents de transport produits portent le filigrane
> « SANS VALEUR » : ils ne sont ni attribués, ni transmis au système officiel.
> L'application s'exécute entièrement dans le navigateur ; les données vivent
> dans le stockage local de l'onglet et ne sont transmises nulle part.

## Accueil et identité OIC — 26 septembre 2026

La racine ouvre la nouvelle landing page `#/accueil`, inspirée de Hexus, avec logo OIC et palette bleu/orange/vert appliquée aux vues du POC. Le marché reste directement accessible sur `#/explorer`, sans connexion.

## Refonte du 24 septembre 2026 — version locale

Marché accessible **avant connexion**, carte interactive de Côte d’Ivoire, liste synchronisée, filtres simples et sélection conservée après identification. Interface inspirée de Nexlink, avec surfaces claires et accents violets. Après livraison, le transporteur peut préparer puis confirmer une nouvelle disponibilité.

Décisions : [marché public et carte](docs/ux/04-marche-public.md). Vérification : [recette locale](docs/qa/04-refonte-marche-public.md). Cette refonte n’a pas été déployée ; les rapports en ligne antérieurs concernent la version précédente.

Le POC suit un même dossier de bout en bout :

```
AFFRÉTEUR → DÉCLARATION DE FRET → DEMANDE DE TRANSPORT → MARCHÉ (coordonnées masquées)
→ RÉSERVATION → ACCEPTATION PAR LE TRANSPORTEUR → VALIDATION → DOUBLE DÉBIT
→ COORDONNÉES TRANSMISES → SUIVI EN SIX ÉTAPES → CLÔTURE → JOURNAL D'AUDIT
```

**Ce POC n'invente pas un produit.** Il démontre la refonte d'une application
métier existante (~250 écrans) dont le code fait foi. Les statuts, les entités et le modèle économique lui sont
fidèles ; quatre écarts sont délibérés et documentés (§ *Écarts assumés*).

---

## Lancer la démonstration

```bash
cd /Applications/MAMP/htdocs/POC_OIC/B2F
python3 -m http.server 8081
```

Puis ouvrir **<http://localhost:8081/>**.

Ou avec Docker (image `nginx:1.27-alpine`, aucune compilation) :

```bash
docker build -t b2f . && docker run --rm -p 8081:8081 b2f
```

> **Le port 8081 n'est pas un détail.** Le POC DUT occupe le 8080, et deux
> applications servies sur la même origine partagent le même LocalStorage.
> Le préfixe `b2f_` sur toutes les clés est la seconde barrière.

> **Ouvrir `index.html` par double-clic ne fonctionne pas.** Les modules ES et
> Web Crypto exigent un contexte sécurisé ; `localhost` en est un, `file://`
> non. L'application le dit explicitement si le cas se présente.

## Stack technique

100 % statique, zéro backend, zéro build — et, contrairement au POC DUT,
**zéro dépendance tierce** :

- HTML5 / CSS3 / JavaScript vanilla, **ES Modules natifs**
- LocalStorage comme unique source de données, **toutes les clés préfixées `b2f_`**
- `crypto.subtle` (Web Crypto) — PBKDF2-SHA256, 120 000 itérations, sel par compte
- 8 feuilles CSS (`css/tokens · base · layout · components · forms · b2f · explorer · responsive`)
- Tests : `node:test`, aucun harnais tiers

`index.html` ne charge **aucun script externe** : pas de CDN, pas de
`js/vendor/`, pas de Chart.js ni d'anime.js. L'écart E1 du plan de suivi
(« toutes les dépendances vendorisées ») est tenu de la manière la plus forte
possible — il n'y a pas de dépendance à vendoriser. La démonstration fonctionne
sans aucune connexion Internet.

Le POC conserve ses 19 rôles et ajoute les routes publiques `#/explorer` et `#/connexion`.

### Comptes de démonstration

Tous partagent le mot de passe **`demo2026`** (`js/seed.js`). Les boutons de
l'écran de connexion remplissent et soumettent le formulaire — ils ne
contournent pas l'authentification.

**Les cinq comptes proposés à l'écran de connexion :**

| Rôle | Adresse | Ce qu'il démontre |
|---|---|---|
| Affréteur | `affreteur@demo.invalid` | Déclare, réserve, **valide** |
| Transporteur | `transporteur@demo.invalid` | Publie, accepte, fait avancer le transport |
| Auxiliaire d'affréteur | `auxiliaire@demo.invalid` | Agit par délégation, **ne valide pas** |
| Concessionnaire | `concessionnaire@demo.invalid` | Exploite : comptes, tarifs, matrice des rôles |
| DGTTC | `dgttc@demo.invalid` | Contrôle, **sans aucune donnée financière** |

**Cinq comptes supplémentaires**, à saisir à la main — ils servent les cas
d'échec et les rôles de niveaux 2 et 3 :

| Adresse | Rôle | Intérêt en démonstration |
|---|---|---|
| `auxtransport@demo.invalid` | `auxiliaire_transporteur` | Le second auxiliaire : publie et répond, n'accepte pas |
| `affreteur2@demo.invalid` | `affreteur` (Coton Nord Négoce) | **Abonnement expiré** — démontre le blocage d'accès (M10.2) |
| `transporteur2@demo.invalid` | `transporteur` (Routière du Centre) | **Solde de 5 000 F pour 15 000 F de frais** — refus de validation |
| `partenaire@demo.invalid` | `partenaire` (niveau 2) | Décliné de l'espace Transporteur |
| `caisse@demo.invalid` | `agent_caisse` (niveau 3) | Espace minimal, menu généré depuis ses seuls droits |

**Jeu de données** — quatre groupements commerciaux, crédités à l'amorçage de
200 000 / 50 000 / 120 000 / 5 000 F CFA. Tarifs : abonnement annuel 150 000 F,
frais de mise en relation **15 000 F pour chaque partie**. Deux dossiers
complets sont préinstallés, ce qui mouvemente ces soldes dès le premier
affichage.

## Vérifier

Le verdict est le **code de sortie**, jamais une lecture de la sortie :

```bash
node --experimental-default-type=module --test tests/*.test.mjs
```

Au 24/09/2026 : **494 tests, 494 verts, 0 échec, code de sortie 0** (vérifié).
La commande exacte importe : `node --test tests/` (le répertoire) échoue —
c'est le finding S16 de l'audit de sécurité, fixé ici et pour la future CI.

| Suite | Objet | Tests |
|---|---|---|
| `parcours.test.mjs` | Le fil narratif complet, sans interface | 519 l. |
| `audit-findings.test.mjs` | Non-régression des 16 findings de l'audit de sécurité | 734 l. |
| `permissions.test.mjs` · `access.test.mjs` | Matrice des droits et cloisonnement | 281 + 362 l. |
| `matching-state.test.mjs` | Machine à états de l'appariement | 297 l. |
| `schema.test.mjs` · `storage.test.mjs` | Intégrité, invariants et atomicité | 426 + 217 l. |
| `vues.test.mjs` | Rendu des écrans, et ce qu'ils ne laissent pas fuiter | 290 l. |
| `conformite.test.mjs` | Règles non négociables de la *Definition of Done* et d'architecture | 270 l. |
| `qa-adversarial.test.mjs` | Campagne adversariale : double clic, sept onglets, quota saturé, URL devinées | 660 l. |

## Le parcours à jouer

1. **Affréteur** — `Mon fret` → déclarer un fret (assistant en 3 étapes).
2. **Affréteur** — `Marché` → rechercher un véhicule. *Aucune coordonnée n'est
   visible : c'est ce que la plateforme vend.*
3. **Affréteur** — `Réserver` (gratuit).
4. **Transporteur** — `Réservations reçues` → `Accepter`.
5. **Affréteur** — `À valider`. **L'écran pivot** : les deux débits du dossier et
   le solde de **son** compte sont affichés **avant** l'action ; de la
   contrepartie, l'écran ne dit que « compte provisionné » ou non.
6. **Affréteur** — `Valider` → double débit atomique, **coordonnées transmises**.
7. **Transporteur** — `Suivi` → faire avancer les six étapes.
8. **Affréteur** — `Clôturer` après livraison.

Cas d'échec à montrer aussi : réserver le véhicule de *Routière du Centre*
(solde insuffisant côté transporteur), se connecter en **Auxiliaire** et tenter
de valider, se connecter en `affreteur2@demo.invalid` (abonnement expiré), ou
saisir l'adresse d'un autre espace dans l'URL.

Un guide de démonstration pas à pas, écrit pour la personne qui présente et non
pour un développeur, se trouve dans
[`docs/guide-demo/guide-demonstration-oic.md`](docs/guide-demo/guide-demonstration-oic.md).
Une page pédagogique pour public non initié au métier est disponible dans
[`docs/ux/maquettes/b2f-comprendre.html`](docs/ux/maquettes/b2f-comprendre.html).

## Les rôles — 19 attestés, traités sur trois niveaux

L'arbitrage N4 impose que **tous les rôles identifiés figurent au POC**. Aucun
n'est écarté, aucun n'est inventé : chaque rôle porte dans `js/domain/roles.js`
un champ `preuve` citant le fichier du système existant qui l'atteste, et un
test échoue si un identifiant non déclaré atteint la matrice.

| Niveau | Traitement | Rôles |
|---|---|---|
| **1 — Démontrés** (6) | Espace propre, écrans métier, parcours de démonstration, tests de permission dédiés. | `affreteur` · `transporteur` · `auxiliaire_affreteur` · `auxiliaire_transporteur` · `concessionnaire` · `dgttc` |
| **2 — Déclinés** (3) | Réutilisent l'espace Transporteur, variations déclaratives. Comptes accessibles et testés, sans parcours dédié. | `transporteur_prive` · `transporteur_etranger` · `partenaire` |
| **3 — Modélisés** (10) | Déclarés, administrables, **menu généré depuis leurs seuls droits**. Consultation des DUT pour `dut_transport` ; caisse, contentieux et comptabilité restent hors périmètre. | `super_admin` · `admin_compta` · `admin_superviseur_centre_tech` · `agent_caisse` · `superviseur_comptabilite` · `superviseur_cpte` · `contentieux_paie` · `dut_transport` · `activation_inscription` · `activation_inscription_affreteur` |

**19 rôles, pas 22.** Le cadrage annonçait « 8 macro-rôles + ~14 profils ».
L'inventaire réel en établit 19 : les huit menus `*_non_actif` et
`*_reabonnement` du système existant sont des **états d'abonnement**, pas des
rôles, et l'auxiliaire a été dédoublé parce que ses droits diffèrent réellement
selon le parent. Trois profils dorment peut-être dans la table `profil` de
production, dont les libellés ne figurent pas dans le dump. **L'écart est
documenté, pas comblé par une hypothèse** — un rôle fictif dans une matrice RBAC
est plus dangereux qu'un rôle manquant (décision D48).
Détail : `docs/architecture/03-matrice-des-roles.md` § 2.

### Extrait de la matrice des droits

La matrice complète vit dans `js/domain/permissions.js` (**47 droits × 19 rôles**) ;
elle est **la seule source** de ce qu'un rôle peut faire, menu compris. Un droit
n'y est pas un booléen mais une **portée** : `—` aucune · `P` propre · `G`
groupement · `M` marché · `T` tout.

| Droit | Affréteur | Transporteur | Aux. affréteur | Concessionnaire | DGTTC |
|---|:-:|:-:|:-:|:-:|:-:|
| `declaration.creer` — déclarer un fret | G | — | G | — | — |
| `declaration.supprimer` | G | — | **—** | — | — |
| `offre.publier` — publier un véhicule | — | G | — | — | — |
| `marche.offres` / `marche.demandes` — **chercher sur le marché** | M | M | M | **—** | **—** |
| `offre.lire` / `vehicule.lire` — consulter offres et parc | — | G | — | T | T |
| `appariement.reserver` | G | — | G | — | — |
| `appariement.repondre` — accepter ou rejeter | G | G | **—** | — | — |
| **`appariement.valider`** — déclenche le double débit | **G** | — | **—** | — | — |
| `appariement.annuler` — avant validation | G | G | G | — | — |
| `coordonnees.lire` — après mise en relation | G | G | G | **—** | **—** |
| `transport.avancer` — faire avancer le suivi | — | G | — | — | — |
| `transport.cloturer` — après livraison | G | — | G | — | — |
| `compte.lire` — solde du groupement | G | G | G | **T** | **—** |
| `compte.crediter` — créditer manuellement | — | — | — | **T** | — |
| `controle.etats` — états de contrôle | — | — | — | — | **T** |
| `audit.lire` — journal d'audit | — | — | — | T | T |

Deux points que ce tableau rend visibles et qui se commentent en démonstration :
le concessionnaire **n'a aucun accès au marché** (il exploite, il ne transige
pas), et la DGTTC **n'a aucun droit financier** — ni `compte.lire`, ni montant,
au niveau des données et pas seulement de l'affichage.

Quatre lignes sont couvertes par un test de permission dédié : **l'auxiliaire ne
valide pas**, **la DGTTC ne transige pas et ne voit aucun montant**, **le
concessionnaire ne lit pas les coordonnées privées**, et **l'accès est bloqué
sans abonnement actif**.

## Architecture

```
VUE → SERVICE → REPOSITORY → LOCALSTORAGE
```

| Couche | Rôle |
|---|---|
| `js/domain/` | **Pure, sans entrée-sortie.** Schéma, rôles, matrice des droits, moteur de décision, machine à états. Transposable telle quelle côté serveur. |
| `js/core/` | `storage.js` (seul module à toucher LocalStorage), `dom.js`, `router.js`, `nav.js`, `layout.js`, `ui.js`, `crypto.js`. |
| `js/repositories/` | Applique le schéma ; refuse toute écriture non conforme. |
| `js/services/` | Logique métier. `matching.service.js` est **le seul** à changer un état d'appariement. |
| `js/views/` | Écrans. Aucun accès direct au stockage : tout passe par `js/views/_donnees.js`, qui ne rend que des objets **projetés**. |

Trois garde-fous sont exécutables plutôt que déclaratifs :

- `core/dom.js` **ne sait pas** produire du HTML depuis une chaîne — `el()` lève
  si on lui passe `html` ou `innerHTML`. Un test interdit `innerHTML`,
  `outerHTML`, `insertAdjacentHTML`, `eval` et `new Function` dans tout le dépôt.
- Deux tests d'architecture interdisent à une vue de lire une entité classée en
  brut et de coder en dur la route d'un autre espace (dette connue : voir D69).
- Un test de conformité vérifie qu'aucun état d'appariement n'est modifié hors
  de `matching.service.js`.

Documentation : `docs/architecture/` (dont le
[guide du développeur](docs/architecture/04-guide-du-developpeur.md)),
`docs/ux/`, `docs/gestion-projet/`, `docs/securite/`, `docs/qa/`,
`docs/guide-demo/`. État des livraisons : [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Écarts assumés par rapport au système existant

Quatre écarts délibérés, présentés comme des **propositions** et non comme des
reproductions. Ils sont devenus des engagements par l'arbitrage N5.

| Écart | Ce que fait le système existant | Ce que fait le POC |
|---|---|---|
| **Un seul mécanisme d'appariement** | Trois mécanismes concurrents (`OffreVehicule.reponse_*` dans les deux sens, plus `OffreDemande.etat`), vestiges d'une refonte inachevée. Une offre rejetée puis réservée à nouveau écrase la première tentative, motif compris. | L'appariement est une **entité de premier ordre** (`b2f_appariements`) ; chaque tentative est un enregistrement distinct. |
| **Droits centralisés** | Contrôle d'accès dispersé dans le routage et les vues, sans matrice. | Une matrice unique, **refus par défaut**, menu généré depuis elle. Aucun rôle — `super_admin` compris — ne la contourne. |
| **Vocabulaire unifié** | Fautes de frappe en base (`reponse_affeteur`), statuts affichés bruts. | Valeurs stockées conservées par fidélité, **libellés imposés par rôle** : `reserver` se lit « en attente de votre réponse » côté transporteur et « en attente de la réponse du transporteur » côté affréteur. |
| **Intégrité explicite** | **Aucune clé étrangère ni contrainte de validation** en base. | Contraintes de champ, 22 invariants locaux et 10 invariants croisés déclarés dans `schema.js` et appliqués par les dépôts. |

**Deux apports revendiqués du POC, absents du système existant** — à signaler en
démonstration plutôt qu'à laisser passer pour de la fidélité :

- **Les six étapes du suivi** (`valide → a_quai → charge → en_route → livre →
  cloture`). Le système existant ne les formalise pas — son `etat_dmde` est flou
  (question U2, tranchée le 24/09).
- **Le journal d'audit append-only.** Le système existant n'a aucune piste
  d'audit unifiée.

## Ce que ce POC ne prouve pas

À dire en démonstration. Un POC qui laisse croire davantage qu'il ne démontre
est un passif.

- **Il ne prouve pas la sécurité.** LocalStorage n'est pas un mécanisme de
  sécurité : il est lisible et modifiable en trois clics dans les outils de
  développement. Ce qui est démontré, c'est que la règle d'autorisation est
  **écrite en un point unique, lisible et testée** — pas qu'elle est *appliquée*.
  Sa valeur tient à ce que les fonctions du domaine sont pures : elles se
  transposent côté serveur telles quelles. **Ce portage n'a de valeur que si la
  décision y est rejouée à chaque requête.**
- **Il ne prouve rien sur l'authentification.** PBKDF2 remplace un condensat
  rapide sans sel, mais les empreintes restent dans le navigateur : c'est la
  pratique qui est démontrée, pas une protection.
- **Il ne prouve pas l'adoption.** Une bourse de fret vit de sa liquidité ;
  aucun logiciel ne résout le problème de la poule et de l'œuf.
- **Il ne prouve pas l'adéquation au terrain.** Le workflow reproduit est celui
  du logiciel existant. Qu'il corresponde aux pratiques réelles reste à établir.
- **Il ne prouve pas la tenue à l'échelle.** Aucune volumétrie n'est connue,
  aucune charge n'est simulée.
- **Il ne reproduit pas le couplage DUT réel.** Le système existant partage une
  base unique avec le DUT (`Duts.id_off_vehi = OffreVehicule.id_off_vehi`) : ce
  n'est pas une passerelle, c'est une application unique à deux métiers.

### Limites techniques connues

- **Aucune protection entre onglets au-delà du conflit détecté.** Le contrôle de
  version refuse une écriture concurrente sur le même dossier ; il ne sérialise
  pas les accès. Éprouvé jusqu'à sept écrans de validation concurrents par la QA.
- **Le journal d'audit ne trace pas la reprise de session.** `sessionStorage`
  étant modifiable, une session forgée n'y laisse aucune trace. Si le journal est
  présenté comme preuve de traçabilité, il faut dire que celle-ci suppose un
  serveur pour avoir une valeur probante.
- **Dette de garde-fou inscrite (D69).** Les deux tests d'architecture de D61
  sont conservés, mais ils ne tiennent pas tout ce que leur intitulé promet : la
  liste `sensibles` ne couvre que 5 entités, le motif de détection se contourne
  sans le vouloir, et la règle « une vue peut nommer son espace » exempte
  `affreteur.js` — **qui est précisément la vue servie à l'espace
  transporteur**. Aucun cas réel aujourd'hui ; à reprendre quand la liste des
  vues partagées grandira en J4/J5.
- **Deux défauts mineurs restent ouverts après la contre-vérification QA** :
  trois clics sur le bouton d'un écran périmé empilent trois messages identiques
  (R1) ; et l'écran de blocage sur données corrompues affiche un second
  paragraphe hors sujet, qui parle de `file://` alors que la cause est une
  corruption de données (R2, `js/app.js:205`). Le parcours de reprise lui-même
  est reporté : il demande une conception, pas un bricolage.
- **Gêne de démonstration (R5)** : le second dossier validé préinstallé
  appartient à `grp-aff-2`, dont l'abonnement est expiré par conception — c'est
  aussi le groupement qui démontre le blocage M10.2. Se connecter en
  `affreteur2@demo.invalid` ouvre donc « Accès suspendu », et non la mise en
  relation validée. Le parcours de démonstration se joue avec
  `affreteur@demo.invalid`.
- **Non couvert par la QA** : aucun test avec un lecteur d'écran réel (seul
  l'arbre d'accessibilité a été vérifié), aucune mesure de contraste WCAG, aucun
  test sur mobile réel ni sous 400 px, aucun test de charge.


## Données

**Tout est inventé et marqué « DÉMO ».** Aucune donnée n'est extraite du système
analysé, qui porte des données d'exploitation réelles. Les adresses
électroniques utilisent le domaine réservé `.invalid`, les numéros un préfixe
non attribué. Un test le vérifie.

Pour repartir de zéro : vider le stockage du site dans les outils de
développement, ou ouvrir la page en navigation privée.

## État du projet

**DUT — intégré le 01/10/2026 :** sélection d’une mise en relation, aperçu, génération unique enregistrée et impression/PDF via le navigateur. L’instantané reste local au POC et sans valeur administrative. Consultation selon les droits existants pour les parties, le concessionnaire et l’agent DUT. Un exemple facultatif est proposé au compte transporteur DÉMO initial.

**MVP livré et validé** (jalons J0 à J3) : les six modules du cœur transactionnel
sont fonctionnels, audités et testés. Portes de sécurité et de qualité franchies.

Les notifications (M7) et les tableaux de bord (M8) ont été livrés par
anticipation. Restent à produire, en J4 et J5 : l'export CSV de l'historique
(M8.4), l'administration effective de la matrice depuis l'écran « Utilisateurs
et rôles » (M1.6) et la prolongation d'abonnement
par le concessionnaire (M10.3). Les entrées de menu correspondantes existent et
affichent « prévu au périmètre, non réalisé à ce jalon » plutôt qu'une page
vide. Détail et historique daté : [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

L'architecture cible de production — Angular, NestJS, PostgreSQL, Keycloak et les
autres briques documentées dans le README du POC DUT — **reste à définir pour la
Bourse de Fret** et fera l'objet d'un cadrage distinct.
