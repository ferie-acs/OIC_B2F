# État du projet et journal des livraisons — POC B2F

> **Auteur** : agent `redacteur-technique`, 24 septembre 2026.
> **Source** : `docs/gestion-projet/plan-suivi.md` (périmètre et jalons),
> `docs/gestion-projet/journal.md` (décisions et entrées datées), et le code
> réel du dépôt. **Rien ici n'est une projection** : ce document résume ce qui
> est constaté, jalon par jalon.
>
> Les décisions sont référencées `D<n>`, les findings de sécurité `S<n>`, les
> défauts de qualité `QA-<n>` et `R<n>`. Leur texte intégral est dans les
> documents d'origine.

---

## État au 24 septembre 2026

| | |
|---|---|
| **Jalons franchis** | J0 (cadrage) · J1 (conception + porte sécurité) · **J2–J3 (MVP transactionnel)** |
| **Verdict qualité** | **GO pour la démonstration devant l'OIC.** Aucun bloquant, aucun majeur. |
| **Verdict sécurité** | **GO avec réserves**, réserves levées : S1 à S4 corrigés et couverts par des tests de non-régression. |
| **Tests** | **480 tests, 480 verts, code de sortie 0** (vérifié le 24/09) |
| **Code** | ~12 400 lignes de JS · 727 de CSS · ~4 300 de tests · 50 routes · 19 rôles · 47 droits · 16 entités |
| **Reste à produire** | J4 (M8) et J5 (M7, M9, M10) |

### Modules — ce qui est fait, ce qui ne l'est pas

| Réf. | Module | État |
|---|---|---|
| **M1** | Acteurs, comptes et accès | **Livré** — 19 rôles déclarés et attestés, matrice centralisée, menu généré depuis les droits, PBKDF2-SHA256 |
| **M2** | Déclaration de fret et demande de transport | **Livré** — assistant en 3 étapes, lignes de marchandise, annulation |
| **M3** | Offre de véhicule et recherche | **Livré** — publication, marché filtrable, les deux sens du flux |
| **M4** | Appariement à double validation | **Livré** — entité de premier ordre, machine à états pure, 5 états / 6 transitions / 6 gardes |
| **M5** | Compte prépayé et validation financière | **Livré** — double débit atomique et isolé, gardes de solde, libération des coordonnées bornée à l'objet |
| **M6** | Suivi du transport | **Livré** — six étapes, journal horodaté et attribué, clôture |
| **M7** | Notifications | **Livré** — écran de notifications dans l'application (M7.1) et indicateur de non-lues visible depuis tous les écrans (M7.2, `core/layout.js`). Aucun envoi externe : le système existant délègue courriel et SMS à une procédure du serveur SQL, non reproductible sans backend — l'écran le dit. |
| **M8** | Tableaux de bord et historique | **Livré pour l'essentiel** — tableau de bord par rôle (M8.2), tableaux de bord d'activité Concessionnaire et DGTTC (M8.1), historique des mouvements de compte (M8.3). **L'export CSV (M8.4) n'est pas réalisé** — priorité `C` au backlog. |
| **M9** | Génération du DUT | **Non réalisé — reporté à J5.** Les entrées de menu « Générer un DUT » et « Documents de transport » existent et affichent un écran « prévu au périmètre, non réalisé à ce jalon » plutôt qu'une page vide (`core/router.js`, fonction `enChantier`). |
| **M10** | Abonnement | **Partiel** — consultation de l'état d'abonnement (M10.1) et **blocage d'accès à l'expiration** (M10.2, le point prioritaire) livrés et testés. **La prolongation par le concessionnaire (M10.3) n'est pas réalisée** : le droit `abonnement.prolonger` est déclaré dans la matrice, mais aucun écran ne l'exerce. |

---

## J2–J3 — MVP fonctionnel *(24/09/2026)*

**Le jalon où le concept est prouvé.** Le fil narratif se déroule de bout en
bout : réservation → acceptation → validation → double débit → coordonnées
transmises → suivi → clôture.

### Livré

- **Persistance** — dépôt générique appliquant schéma, contraintes, unicité,
  intégrité référentielle entrante et sortante, invariants locaux.
- **Mots de passe** — PBKDF2-SHA256, 120 000 itérations, sel par compte,
  comparaison à temps constant, paramètre de coût stocké avec l'empreinte pour
  permettre une migration future.
- **Services** — appariement, compte prépayé, fret, flotte, transport,
  notifications, audit, authentification.
- **Interface** — 30 écrans sur 5 espaces, shell à deux niveaux, modale avec
  piège de focus, registre de débit, refus d'accès explicite.
- **Jeux de démonstration** entièrement inventés, marqués DÉMO, **avec les cas
  d'échec préinstallés** : abonnement expiré, solde insuffisant, carte de
  transport échue.
- `Dockerfile` (nginx:1.27-alpine, port 8081), `README.md`.
- **Parcours joué de bout en bout dans Chrome**, pas seulement en test.

### Campagne de qualité adversariale — puis correctifs — puis contre-vérification

C'est la séquence qui a décidé du GO. Elle mérite d'être lue dans l'ordre.

| Étape | Résultat |
|---|---|
| **1. Campagne adversariale** (`qa-testeur`) | **21 défauts** : 3 bloquants, 4 majeurs, 6 moyens, 8 mineurs. **Verdict : GO interne, NO-GO devant l'OIC.** 34 tests ajoutés, dont **10 écrits rouges**, figeant chacun un bug ouvert. |
| **2. Correctifs** (`senior-fullstack`) | 19 défauts corrigés (D61–D66). Les 10 tests rouges passent au vert **sans qu'aucun n'ait été neutralisé ni affaibli**. Suite portée de 443 à **480 tests**. |
| **3. Contre-vérification** (`qa-testeur`) | Les 19 correctifs **réattaqués** — pas relus — par des chemins que les tests du développeur ne couvraient pas. **Verdict : GO pour la démonstration devant l'OIC.** |

**Le constat qui a orienté les correctifs** : « le domaine est rigoureux, les
vues le contournent ». Corriger les trois cas signalés aurait rendu les tests
verts en laissant la cause intacte. La réponse a été structurelle — la barrière
`js/views/_donnees.js`, par laquelle seule les vues accèdent aux dépôts, plus
deux tests d'architecture (D61).

**Trois défauts corrigés qui valent d'être connus :**

- **QA-01** *(bloquant)* — un transporteur étranger à un dossier lisait les
  montants d'une mise en relation entre deux concurrents, par URL devinée.
- **QA-02** *(majeur)* — l'écran de validation chiffrait à l'affréteur la
  trésorerie du transporteur, alors que le message de refus du même service
  prenait soin de ne pas la nommer. Arbitrage D60/D62 : les **frais du dossier**
  restent affichés, le solde de la contrepartie devient « compte provisionné ».
- **QA-07** *(majeur)* — le verrou anti-concurrence refusait la validation de
  deux dossiers **indépendants** ouverts dans deux onglets. Corrigé en
  comprenant que ce n'est pas le solde qu'il faut verrouiller (D63).

### Défauts résiduels — aucun bloquant

| # | Gravité | Défaut |
|---|---|---|
| **R1** | mineur | Trois clics sur le bouton d'un écran périmé empilent trois messages identiques. Cosmétique. |
| **R2** | mineur | L'écran de blocage sur données corrompues affiche un paragraphe hors sujet, qui parle de `file://` alors que la cause est une corruption de données (`js/app.js:205`). **À traiter avant la démonstration** — c'est une ligne. |
| **R5** | mineur | Le second dossier validé préinstallé appartient au groupement dont l'abonnement est expiré : `affreteur2@demo.invalid` ouvre « Accès suspendu » au lieu du dossier. Gêne de démonstration, contournée en jouant le parcours avec `affreteur@demo.invalid`. |
| **R3** | observation | Les deux tests d'architecture de D61 ne couvrent pas le cas qui a produit le bug qu'ils préviennent. Dette inscrite en **D69**. |
| **R4** | observation | Deux décisions portaient le numéro D61 dans le journal. **Corrigé** par renumérotation en D67. |

> **Note de cohérence** : le § 1 du rapport de contre-vérification annonce
> « deux défauts mineurs et quatre observations », tandis que son § 3 en détaille
> **trois mineurs (R1, R2, R5) et deux observations (R3, R4)**. C'est le détail
> qui fait foi. Le tableau d'état du `journal.md`, qui reprend « 2 mineurs (R1,
> R2) et 4 observations », propage l'erreur de décompte et **omet R5** — le seul
> des trois qui ait un effet visible en démonstration.

**Deux reports assumés** : le parcours de reprise sur données corrompues (QA-M3)
— il demande une conception, pas un bricolage — et l'absence de journalisation de
la reprise de session, qu'aucun contrôle côté client ne pourrait tenir et qui est
**documentée comme limite** plutôt que faussement corrigée.

---

## J1 — Conception validée, porte de sécurité franchie *(24/09/2026)*

### Conception technique (`senior-fullstack`)

Six décisions d'architecture (D39 à D45, détaillées dans
`docs/architecture/01-note-architecture.md`), dont l'ajout d'une **couche
`js/domain/` sans effet de bord** — non prévue au plan initial, et justifiée :
les règles les plus sensibles du POC sont des fonctions pures, donc testables par
table de vérité et auditables sans traverser du code de persistance.

Livré : 16 entités, 22 invariants locaux, 10 invariants croisés, 19 rôles avec
leur preuve, 47 droits, la matrice complète et la machine à états — **avant tout
écran**.

### Audit de sécurité (`security-expert`) — porte bloquante

**Verdict : GO avec réserves.** 16 findings — **0 critique**, 4 élevés (S1–S4),
5 moyens, 7 faibles.

| # | Finding bloquant | Correction |
|---|---|---|
| **S1** | La projection ne filtrait qu'au premier niveau : trois conteneurs classés `public` par défaut livraient au concessionnaire et à la DGTTC les coordonnées que la matrice leur refuse. | Projection **récursive** ; `schema.js` refuse désormais de se charger si un conteneur n'a pas de classification explicite. |
| **S2** | La libération des coordonnées n'interrogeait pas la matrice. | `decider(ctx, 'coordonnees.lire')` devient sa première condition. |
| **S3** | Une mise en relation validée libérait **tout** le parc de la contrepartie — véhicules jamais proposés, chauffeurs jamais affectés. Contournement du modèle économique. | Libération **bornée à l'objet** : `objetsLiberes: Set<"entite:id">`. |
| **S4** | TOCTOU sur le double débit : l'audit a reproduit deux validations concurrentes aboutissant à un solde faux, **un débit ayant disparu**. Le commentaire annonçait un jeton de session qui n'existait pas. | Contrôle de concurrence optimiste : registre de versions, instantané avant décision, revérification au commit. |

Sept des douze findings non bloquants ont également été traités (S5–S12, S14,
S15). **Chaque correction est couverte par un test qui rejoue le scénario exact
de l'auditeur**, et dont il a été vérifié — en réintroduisant temporairement le
défaut — qu'il échoue alors réellement. Un test qui ne rougit pas quand le défaut
revient ne protège de rien.

**Deux trouvailles nées de la correction, absentes de l'audit :**

- **D53** — le « sens B » du flux (l'affréteur publie, le transporteur propose,
  l'affréteur accepte) était **impraticable** : l'affréteur n'avait pas le droit
  de répondre. Le défaut n'apparaît qu'en écrivant le croisement partie/action
  que l'audit demandait.
- **D48** — le décompte des rôles passe de « 22 » à **19 attestés**. Ne rien
  inventer : un rôle fictif dans une matrice RBAC est plus dangereux qu'un rôle
  manquant. Le trou était dans l'indicateur, pas dans la matrice.

### Conception d'expérience (`ux-designer`)

Parcours par rôle, arborescence à deux niveaux réels (D30), design system,
maquettes. Décisions structurantes : l'écran de validation affiche les montants
**avant** l'action et non derrière une confirmation générique (D31) ; une action
interdite est **désactivée et expliquée, jamais masquée** (D32) ; les statuts du
système existant sont conservés comme valeurs stockées mais **jamais affichés
bruts** (D34).

Trois défauts du POC DUT ont été délibérément **non reproduits** (D33) : cascade
CSS contradictoire, dépendances servies par CDN, rail de navigation redondant.

### Livrable transverse

`docs/ux/maquettes/b2f-comprendre.html` (D67) — support pédagogique pour un
public **n'ayant aucune connaissance du métier** de la bourse de fret. Démontrer
un logiciel à qui ignore le métier ne prouve rien.

---

## J0 — Cadrage *(24/09/2026)*

### Révision majeure : découverte de l'application existante

Le cadrage initial reposait sur les orientations d'un rapport. La découverte du
code de l'application existante (~250 écrans) l'a **réécrit** : le POC ne conçoit plus un produit hypothétique, il
démontre la cible de refonte d'un système existant. **Le code fait foi ; le dump
SQL de 2023 est périmé** (D18).

Cinq questions ont été **closes par preuve**, en citant le fichier qui tranche :

| # | Conclusion |
|---|---|
| **D10** | Le modèle d'appariement est une **double validation asymétrique**, confirmée par un débit des deux comptes. Aucun tour de rôle syndical n'existe dans le code. |
| **D11** | La plateforme porte un **modèle économique complet** : abonnement bloquant, compte prépayé par groupement, frais fixes débités aux deux parties. `prix_km_t` est déclaratif et ne sert à aucune facturation. |
| **D12** | Le chauffeur **n'est pas un utilisateur connecté** : c'est une entité de données, transmise lors de la mise en relation. |
| **D13** | **Le rapport est contredit** : DUT et Bourse de Fret partagent une **base unique**, avec jointure directe. Ce n'est pas une passerelle, c'est une application unique à deux métiers. |
| **D14** | L'application distingue un **Concessionnaire** (exploitant) et une **DGTTC** (autorité de contrôle, entité étatique distincte de l'OIC). |

### Sept arbitrages rendus par le commanditaire

| # | Arbitrage | Conséquence |
|---|---|---|
| **N1** | Statut réel du legacy : hors mission | Informatif |
| **N2** | Modèle économique reproduit, sans paiement réel | **M5 non optionnel** |
| **N3** | Concessionnaire et DGTTC restent **distincts** | La notion d'« administrateur OIC » disparaît du plan |
| **N4** | **Tous les rôles identifiés** figurent au POC | **+30 à 40 % d'effort, jalon J4 ajouté** ; traitement en trois niveaux |
| **N5** | Cible améliorée, écarts documentés | Les 4 écarts délibérés deviennent des engagements |
| **N6** | Sécurité du legacy : **traitement reporté** | Les 7 constats restent ouverts. **Report ≠ résolution.** |
| **N7** | Pas d'export de schéma | Le modèle est construit depuis le code PHP |

### Décisions techniques fondatrices

- **D2** — alignement technique intégral sur le POC DUT : même pile, mêmes
  conventions, aucune compilation.
- **D3** — **aucune dépendance chargée depuis le réseau**. Le POC DUT charge des
  CDN sans contrôle d'intégrité : on corrige au lieu de reproduire. *Constat au
  24/09 : l'application finale n'a **aucune** dépendance tierce — il n'y a rien à
  vendoriser.*
- **D4** — **préfixe `b2f_` et port 8081.** Deux applications sur la même origine
  partagent le même LocalStorage : sans cette double barrière, le B2F écraserait
  les données du POC DUT.
- **D9** — **aucune date inscrite** tant que la contrainte de délai est inconnue.
  Inventer une date produirait une fausse précision.

---

## Ce qui reste — J4 et J5

Périmètre défini par `plan-suivi.md` § 2. **Aucune date n'est avancée ici**,
conformément à D9.

| Jalon | Contenu prévu |
|---|---|
| **J4 — Supervision** | Complément des espaces Concessionnaire et DGTTC : historique filtrable par période et **export CSV** (M8.4), écran « Utilisateurs et rôles » rendant la matrice réellement **administrable** et non seulement consultable (M1.6). Tests de permission sur les 19 rôles. |
| **J5 — Livrable** | **M9** génération du DUT depuis une mise en relation validée, reproduisant le rattachement réel DUT ↔ offre de véhicule · **M10.3** prolongation d'abonnement par le concessionnaire · audit de sécurité complet et revue finale · campagne de recette de bout en bout · documentation. |

> **Écart avec le plan de suivi** : le plan situait M7 (notifications) et
> l'essentiel de M8 (tableaux de bord) en « second incrément ». Ils ont été
> livrés par anticipation en J2–J3. Ce qui reste de J4 et J5 est donc plus
> étroit que ne le laisse penser le découpage initial du plan.

**Dettes à traiter dans ce périmètre**, dans l'ordre de priorité constaté :

1. **R2** — le message de repli trompeur de l'écran de blocage. Une ligne, à
   faire avant la démonstration.
2. **R5** — rattacher le second dossier validé à un groupement à l'abonnement
   actif, pour que la démonstration ne bute pas sur « Accès suspendu ».
3. **D69** — les deux tests d'architecture de D61, à corriger quand la liste des
   vues partagées grandira : exempter « les espaces où la vue est réellement
   routée », et non « le fichier du même nom ».
4. **R1** — déduplication des messages éphémères.
5. **QA-M3** — le parcours de reprise sur données corrompues, à **concevoir**.

**Hors périmètre du POC, et indépendant de lui** : les constats de sécurité
relevés sur l'existant lors du cadrage. Leur report est une décision datée (D25),
pas un oubli, et leur traitement **n'attend rien de ce POC**. Le détail relève du
cadrage, qui n'est pas versionné ici.

**Non couvert par la qualité, à ce jour** : aucun test avec un lecteur d'écran
réel, aucune mesure de contraste WCAG, aucun test sur mobile réel ni sous 400 px,
aucun test de charge.

---

## Question ouverte

| # | Question | Position |
|---|---|---|
| **N8 bis** | Obtenir de l'OIC un extrait de la table `profil` de production, dont les libellés ne figurent pas dans le dump. Trois rôles y dorment peut-être. | **Action de projet, pas un blocage** (D48). Chaque profil manquant coûte une entrée déclarative dans `roles.js` et une ligne de matrice : le mécanisme est dimensionné pour, rien n'est à réécrire. |
