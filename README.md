# B2F — Bourse de Fret (preuve de concept)

Démonstration exécutable de la cible de refonte de la **Bourse de Fret de
l'Office Ivoirien des Chargeurs**. Aucun serveur, aucune donnée réelle.

**→ [Ouvrir la démonstration](https://ferie-acs.github.io/OIC_B2F/)**

> **Preuve de concept.** Toutes les données sont **fictives** et marquées
> « DÉMO ». Les documents de transport produits portent le filigrane
> « SANS VALEUR » : ils ne sont ni attribués, ni transmis au système officiel.
> L'application s'exécute entièrement dans le navigateur ; les données vivent
> dans le stockage local de l'onglet et ne sont transmises nulle part.

## Lutte contre la fraude — 13 octobre 2026

Cinq correctifs ferment des contournements du modèle économique et de la
confiance entre parties : traiter en direct pour ne pas payer les frais, se
faire passer pour un transporteur, immobiliser des camions sans s'engager,
créditer un compte sans encaissement. Chacun est signalé dans le code par la
mention « correctif anti-fraude n° *N* ».

| N° | Risque traité | Ce que fait le POC | Limite assumée |
|:-:|---|---|---|
| **1** | **Contournement des frais.** La raison sociale, le RCCM et l'immatriculation étaient visibles sur le marché avant tout paiement : ils suffisaient à retrouver le transporteur hors plateforme. | L'identité commerciale suit désormais la règle des coordonnées : elle n'est servie qu'au propriétaire, aux rôles institutionnels et aux deux parties d'une mise en relation **validée**, objet par objet (`identiteLiberee`, `js/domain/access.js`). À sa place, un **profil de confiance** — transporteur vérifié, transports réalisés, note, ancienneté — et un **alias stable** (« Transporteur T-XXXX », « Affréteur A-XXXX »), dans les deux sens. Les textes libres lus par la contrepartie avant validation — libellé du fret, observation, contraintes de la demande, précision d'un rejet — refusent un numéro de téléphone, une adresse électronique ou un lien de messagerie (`js/domain/texte.js`). | Un numéro écrit en toutes lettres passe, de même qu'une suite de moins de huit chiffres. Le filtre arrête le contournement par réflexe, pas le contournement déterminé. **Deux défauts connus**, consignés en `todo` dans `tests/anti-fraude.test.mjs` : un numéro séparé par des points ou des barres obliques (« 07.07.07.07.07 ») passe, pris pour une date ; une référence de la plateforme (« DT-2026-0001 ») est refusée à tort, prise pour un numéro. |
| **2** | **Fuite après la première affaire.** Une fois les coordonnées échangées, rien ne ramenait les parties sur la plateforme. | Après la clôture d'un transport, chaque partie note l'autre **une fois**, de 1 à 5, **sans commentaire libre** — il deviendrait un canal pour des coordonnées (`js/services/avis.service.js`). La réputation affichée à la place du nom ne se constitue que sur des transports conclus par la plateforme : c'est une raison de revenir plutôt que de traiter en direct. | Une incitation, pas un verrou. Deux parties qui se connaissent peuvent traiter en direct dès la seconde affaire (voir la question de modèle économique ci-dessous). |
| **3** | **Faux transporteur.** Rien ne prouvait qu'un transporteur était celui qu'il prétendait être : il pouvait accepter un chargement et disparaître avec la marchandise. | L'**agent d'activation des inscriptions** (`activation_inscription`, droit `groupement.verifier`, écran « Vérification des transporteurs ») contrôle le RCCM, la carte de transporteur et l'attestation d'assurance — les trois sont exigées —, puis la carte grise et la carte de transport de chaque véhicule et le permis de chaque chauffeur. Un transporteur non vérifié ne publie pas, ne propose pas, n'accepte pas, et aucune validation n'aboutit sur des moyens non contrôlés. Modifier une pièce contrôlée (immatriculation, carte grise, carte de transport ; nom ou permis du chauffeur) fait perdre le contrôle. Refuser ou retirer la vérification retire les offres du transporteur du marché. | L'agent **atteste** un contrôle : le POC ne vérifie aucune pièce auprès d'un registre, et aucun justificatif n'est téléversé. |
| **4** | **Immobilisation gratuite.** Réserver ne coûte rien : sans délai, un abonné pouvait bloquer les camions d'un transporteur — ou d'un concurrent — sans jamais valider. | Une réservation sans réponse sous **48 h**, ou une acceptation sans validation sous **48 h**, expire. L'état stocké reste `annuler` (fidélité au système existant, D34) avec `motifCloture = expiration` ; le véhicule revient sur le marché, la demande redevient publiée, les deux parties sont notifiées, **rien n'est débité**. Le journal d'audit impute l'expiration à « Plateforme (automatique) », jamais à l'utilisateur dont l'affichage l'a déclenchée. L'échéance est affichée aux deux parties. | **Aucune tâche planifiée** : l'expiration est constatée à chaque affichage et avant chaque réservation ou proposition ; une acceptation ou une validation hors délai est refusée. Un dossier échu reste en l'état tant que personne n'ouvre l'application. Les durées sont une proposition du POC, **à confirmer par l'OIC**. |
| **5** | **Fraude interne au crédit.** Une seule personne créditait un compte, sur une référence d'encaissement que personne ne rapprochait d'un paiement réel. | **Principe des quatre yeux.** La saisie d'un crédit par le concessionnaire **ne touche pas au solde** ; une **autre personne** (droit `compte.valider_credit`, écran « Crédits à valider ») le valide après rapprochement avec l'encaissement réel. L'auteur d'une saisie ne peut ni la valider ni la rejeter — règle du service, doublée de l'invariant `quatreYeux` du schéma. Une référence d'encaissement ne sert qu'une fois ; un rejet est motivé et rend la référence disponible pour une saisie corrigée. | Le rapprochement est une attestation cochée par le validateur, pas une confrontation automatique avec un relevé. Deux personnes complices restent possibles ; le journal les nomme toutes deux. Saisie et validation appartiennent au même rôle : la séparation des personnes repose sur le service, pas sur la matrice. |

La matrice compte quatre droits de plus — `groupement.verifier`,
`compte.valider_credit`, `avis.donner` et `appariement.expirer`, ce dernier
**accordé à personne** : seule la plateforme l'exerce. Elle passe de 47 à
**51 droits**.

**Ce que ces correctifs ne changent pas.**

- **Le POC ne prouve toujours pas la sécurité.** Tout s'exécute dans le
  navigateur et les données vivent dans le stockage local : quiconque ouvre les
  outils de développement y lit raisons sociales et coordonnées, se déclare
  vérifié ou se crédite un compte. Ces correctifs montrent **où et comment** la
  règle s'écrit ; ils ne l'appliquent pas. En production, chacune doit être
  rejouée côté serveur à chaque requête, et l'expiration confiée à une tâche du
  serveur.
- **Une question de modèle économique, qui appartient à l'OIC.** Les frais de
  mise en relation — 15 000 F par partie, reproduits du système existant (D11,
  arbitrage N2) — sont précisément ce que les parties ont intérêt à éviter.
  Masquer l'identité et récompenser la fidélité réduisent cette incitation sans
  la supprimer. Un abonnement seul, sans frais par mise en relation, la
  supprimerait, mais modifierait le modèle reproduit. Le POC présente ce choix
  comme une limite ; il ne le tranche pas.
- **Des tests qui rejouent la fraude, pas qui la rendent impossible.**
  `tests/anti-fraude.test.mjs` couvre les cinq correctifs, dont de nombreux
  « cas de fraude » rejoués un à un. Il consigne aussi, en `todo`, les deux
  défauts du filtre des textes libres décrits ci-dessus : ils sont connus et
  non corrigés.

**Démonstration** : comptes `activation@demo.invalid`,
`concessionnaire2@demo.invalid` et `transporteur3@demo.invalid` (§ *Comptes de
démonstration*), et § 5 du
[guide de démonstration](docs/guide-demo/guide-demonstration-oic.md).

## Accueil et identité OIC — 26 septembre 2026

La racine ouvre la nouvelle landing page `#/accueil`, inspirée de Hexus, avec logo OIC et palette bleu/orange/vert appliquée aux vues du POC. Le marché reste directement accessible sur `#/explorer`, sans connexion.

## Refonte du 24 septembre 2026 — version locale

Marché accessible **avant connexion**, carte interactive de Côte d’Ivoire, liste synchronisée, filtres simples et sélection conservée après identification. Interface inspirée de Nexlink, avec surfaces claires et accents violets. Après livraison, le transporteur peut préparer puis confirmer une nouvelle disponibilité.

Décisions : [marché public et carte](docs/ux/04-marche-public.md). Vérification : [recette locale](docs/qa/04-refonte-marche-public.md). Cette refonte n’a pas été déployée ; les rapports en ligne antérieurs concernent la version précédente.

Le POC suit un même dossier de bout en bout :

```
AFFRÉTEUR → DÉCLARATION DE FRET → DEMANDE DE TRANSPORT → MARCHÉ (identité et coordonnées masquées)
→ RÉSERVATION → ACCEPTATION PAR LE TRANSPORTEUR → VALIDATION → DOUBLE DÉBIT
→ IDENTITÉ ET COORDONNÉES TRANSMISES → SUIVI EN SIX ÉTAPES → CLÔTURE → NOTATION MUTUELLE
→ JOURNAL D'AUDIT
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

**Huit comptes supplémentaires**, à saisir à la main — ils servent les cas
d'échec, les rôles de niveaux 2 et 3 et les correctifs anti-fraude :

| Adresse | Rôle | Intérêt en démonstration |
|---|---|---|
| `auxtransport@demo.invalid` | `auxiliaire_transporteur` | Le second auxiliaire : publie et répond, n'accepte pas |
| `affreteur2@demo.invalid` | `affreteur` (Coton Nord Négoce) | **Abonnement expiré** — démontre le blocage d'accès (M10.2) |
| `transporteur2@demo.invalid` | `transporteur` (Routière du Centre) | **Solde de 5 000 F pour 15 000 F de frais** — refus de validation |
| `partenaire@demo.invalid` | `partenaire` (niveau 2) | Décliné de l'espace Transporteur |
| `caisse@demo.invalid` | `agent_caisse` (niveau 3) | Espace minimal, menu généré depuis ses seuls droits |
| `activation@demo.invalid` | `activation_inscription` (niveau 3) | **Contrôle les pièces des transporteurs** (correctif n° 3) |
| `concessionnaire2@demo.invalid` | `concessionnaire` | **Seconde personne** : valide les crédits saisis par `concessionnaire@demo.invalid` (correctif n° 5) |
| `transporteur3@demo.invalid` | `transporteur` (Nouvelle Route Transport DÉMO) | **Dossier non vérifié** : ne publie, ne propose ni n'accepte avant contrôle (correctif n° 3) |

Les trois derniers comptes sont aussi ajoutés à un navigateur déjà amorcé par
une version antérieure, sans rien réécrire de ce qui existe
(`completerJeuAntiFraude`, `js/seed.js`).

**Jeu de données** — cinq groupements commerciaux, crédités à l'amorçage de
200 000 / 50 000 / 120 000 / 5 000 / 60 000 F CFA (le dernier pour Nouvelle
Route Transport). Tarifs : abonnement annuel 150 000 F, frais de mise en
relation **15 000 F pour chaque partie**. Deux dossiers complets sont
préinstallés, ce qui mouvemente ces soldes dès le premier affichage. **Un crédit
attend sa validation** : `CR-2026-0001`, 50 000 F pour Routière du Centre,
encaissement `ENC-DEMO-2001`, saisi par `concessionnaire@demo.invalid`. Tant
qu'il n'est pas validé, le solde de Routière du Centre n'en tient pas compte.

## Vérifier

Le verdict est le **code de sortie**, jamais une lecture de la sortie :

```bash
node --experimental-default-type=module --test tests/*.test.mjs
```

Au 24/09/2026 : **494 tests, 494 verts, 0 échec, code de sortie 0** (vérifié).
La commande exacte importe : `node --test tests/` (le répertoire) échoue —
c'est le finding S16 de l'audit de sécurité, fixé ici et pour la future CI.

Au 13/10/2026 : **680 tests, 670 verts, 8 en échec, 2 en `todo`, code de
sortie 1** (vérifié). Les deux `todo` sont les défauts connus du filtre des
textes libres (§ *Lutte contre la fraude*). Les huit échecs se trouvent tous
dans `conformite.test.mjs` et
existaient déjà, avec les mêmes messages, sur la version antérieure aux
correctifs anti-fraude : stockage local et clé `b2f_` hors de la couche de
persistance (`js/core/accueil-offres.js`), lecture brute d'une entité classée
dans `js/views/supervision.js`, route d'un autre espace en dur, style en ligne,
URL distante (`js/core/carte-corridors.js`), redéfinition de `:root` hors de
`tokens.css`, modification d'un appariement hors de `matching.service.js` par
`js/seed-activite.js`. Chacun de ces tests s'arrête à la première violation
trouvée : leur stabilité ne prouve pas que les correctifs n'en ajoutent aucune.

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
| `anti-fraude.test.mjs` | Les cinq correctifs anti-fraude du 13/10/2026, cas de fraude rejoués | 1 360 l. |

## Le parcours à jouer

1. **Affréteur** — `Mon fret` → déclarer un fret (assistant en 3 étapes).
2. **Affréteur** — `Marché` → rechercher un véhicule. *Ni coordonnée, ni raison
   sociale, ni immatriculation ne sont visibles : un profil de confiance en
   tient lieu. La mise en relation est ce que la plateforme vend.*
3. **Affréteur** — `Réserver` (gratuit). Le transporteur a 48 h pour répondre.
4. **Transporteur** — `Réservations reçues` → `Accepter`. L'affréteur a 48 h
   pour valider.
5. **Affréteur** — `À valider`. **L'écran pivot** : les deux débits du dossier et
   le solde de **son** compte sont affichés **avant** l'action ; de la
   contrepartie, l'écran ne dit que « compte provisionné » ou non.
6. **Affréteur** — `Valider` → double débit atomique, **identité et coordonnées
   transmises**.
7. **Transporteur** — `Suivi` → faire avancer les six étapes.
8. **Affréteur** — `Clôturer` après livraison. Chaque partie peut alors noter
   l'autre, une fois.

Cas d'échec à montrer aussi : réserver l'offre Abidjan → Bouaké à 88 F/km·t,
qui appartient à *Routière du Centre* — son nom n'apparaît plus sur le marché —
(solde insuffisant côté transporteur, **avant** de valider le crédit en attente
`CR-2026-0001`), se connecter en **Auxiliaire** et tenter de valider, se
connecter en `affreteur2@demo.invalid` (abonnement expiré), se connecter en
`transporteur3@demo.invalid` (dossier non vérifié), ou saisir l'adresse d'un
autre espace dans l'URL.

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
| **3 — Modélisés** (10) | Déclarés, administrables, **menu généré depuis leurs seuls droits**. Consultation des DUT pour `dut_transport` ; contrôle des pièces des transporteurs pour `activation_inscription` (depuis le 13/10/2026) ; caisse, contentieux et comptabilité restent hors périmètre. | `super_admin` · `admin_compta` · `admin_superviseur_centre_tech` · `agent_caisse` · `superviseur_comptabilite` · `superviseur_cpte` · `contentieux_paie` · `dut_transport` · `activation_inscription` · `activation_inscription_affreteur` |

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

La matrice complète vit dans `js/domain/permissions.js` (**51 droits × 19 rôles**) ;
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
| `avis.donner` — noter la contrepartie après clôture | G | G | G | — | — |
| `appariement.expirer` — clore une attente échue | — | — | — | — | — |
| `compte.lire` — solde du groupement | G | G | G | **T** | **—** |
| `compte.crediter` — **saisir** un crédit, sans effet sur le solde | — | — | — | **T** | — |
| `compte.valider_credit` — valider le crédit saisi par **un autre** agent | — | — | — | **T** | — |
| `groupement.verifier` — vérifier le dossier d'un transporteur | — | — | — | — | — |
| `controle.etats` — états de contrôle | — | — | — | — | **T** |
| `audit.lire` — journal d'audit | — | — | — | T | T |

`appariement.expirer` n'est accordé à **aucun** rôle : seule la plateforme
l'exerce. `groupement.verifier` n'appartient qu'à l'agent d'activation des
inscriptions (`activation_inscription`, portée `T`), hors de cet extrait.

Trois points que ce tableau rend visibles et qui se commentent en
démonstration : le concessionnaire **n'a aucun accès au marché** (il exploite,
il ne transige pas) ; la DGTTC **n'a aucun droit financier** — ni `compte.lire`,
ni montant, au niveau des données et pas seulement de l'affichage ; et le
concessionnaire détient à la fois la saisie et la validation d'un crédit, mais
**jamais sur la même opération** — c'est le service, et non la matrice, qui
refuse qu'une même personne fasse les deux.

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
- **Il ne prouve pas que la fraude est empêchée.** Les cinq correctifs du
  13/10/2026 réduisent des contournements identifiés ; chacun a ses limites,
  écrites au § *Lutte contre la fraude*, et tous reposent sur un contrôle
  exécuté dans le navigateur.
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
