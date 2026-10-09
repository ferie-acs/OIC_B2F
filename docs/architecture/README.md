# Conception technique — POC B2F (Bourse de Fret OIC)

> **Jalon J1.** Agent `senior-fullstack`, 24 septembre 2026.
> Entrées : `docs/gestion-projet/*` (cadrage, méthodologie, plan de suivi,
> journal), `docs/ux/*` (parcours, design system, spécification d'écrans,
> maquette), et le code de l'application existante analysée au cadrage.

---

## Par où commencer

**Si vous auditez la sécurité** — `03-matrice-des-roles.md` § 8 (réponse à
l'audit du 24/09, findings S1–S4 corrigés), puis § 6 (les six points soumis à
contestation). L'audit a rendu **GO avec réserves** ; les réserves sont levées.

**Si vous allez implémenter** — `01-note-architecture.md`, puis
`02-modele-de-donnees.md`, puis le code de `js/domain/`, qui est commenté pour
être lu.

**Si vous rejoignez le projet et voulez coder** — `04-guide-du-developpeur.md`.
Il décrit le code **tel qu'il est aujourd'hui** ; les trois autres documents
décrivent la conception au moment où elle a été arrêtée.

**Si vous voulez le résultat en une ligne** — modèle de données et matrice des
droits écrits, audités, corrigés ; MVP transactionnel livré ; **480 tests au
vert** ; GO qualité et sécurité pour la démonstration.

## Contenu

| Fichier | Contenu | Pour qui |
|---|---|---|
| `01-note-architecture.md` | Les six décisions d'architecture et leur justification. Les deux défauts trouvés par les tests. Les limites. | Tous |
| `02-modele-de-donnees.md` | Les seize entités, le cycle de vie de l'appariement, la classification des données, l'atomicité, l'intégrité explicite. | `senior-fullstack`, `qa-testeur` |
| `03-matrice-des-roles.md` | Les 19 rôles, le catalogue des droits, la matrice complète **générée depuis le code**, les six points d'audit, et la **réponse à l'audit de sécurité** (§ 8). | **`security-expert`**, `qa-testeur` |
| `04-guide-du-developpeur.md` | **Carte des dossiers, chemin d'une donnée, comment ajouter un écran ou un rôle, où se trouve la matrice et comment la lire, dettes connues.** | Tout développeur qui rejoint le projet |

> **Les chiffres de tests cités dans les trois premiers documents sont ceux de
> leur date de rédaction** (264 puis 329 tests, jalon J1). L'état courant est de
> **480 tests, code de sortie 0** — vérifié le 24/09/2026 après les correctifs
> de la campagne de qualité adversariale.

## Code produit

| Fichier | Rôle | Lignes |
|---|---|---|
| `js/domain/enums.js` | Valeurs stockées et leurs libellés par point de vue | 415 |
| `js/domain/schema.js` | Entités, classification, contraintes, invariants | 1 023 |
| `js/domain/roles.js` | Les 19 rôles, niveaux, espaces, preuves | 416 |
| `js/domain/permissions.js` | Catalogue des droits, matrice, classifications lisibles | 566 |
| `js/domain/access.js` | Moteur de décision et projection des données | 325 |
| `js/domain/matching.state.js` | Machine à états de l'appariement (pure) | 394 |
| `js/core/storage.js` | Accès LocalStorage, préfixe, transactions | 353 |
| `tests/*.test.mjs` | **329 tests à ce jalon**, dont `audit-findings.test.mjs` (non-régression de l’audit) | 2 108 |

> Le tableau ci-dessus décrit le **code produit au jalon J1**. Depuis, les
> couches `repositories/`, `services/` et `views/` ont été écrites : l'état
> courant est de ~12 400 lignes de JS et ~4 300 lignes de tests.

**Vérification** — le verdict est le code de sortie, jamais une lecture de la
sortie :

```
node --experimental-default-type=module --test tests/*.test.mjs
```

Au 24/09/2026, après correction des findings de l’audit **et** des défauts de la
campagne de qualité adversariale : **480 tests, 0 échec, code de sortie 0.**

## Les quatre écarts délibérés du cadrage, et où ils sont tenus

| Écart (`cadrage.md` § 5) | Où |
|---|---|
| **Un seul mécanisme d'appariement** | Entité `appariement` + `matching.state.js`. Rendu structurel, pas seulement promis. |
| **Droits centralisés dans une matrice** | `permissions.js` + `access.js`. Refus par défaut, aucun rôle ne contourne. |
| **Vocabulaire unifié et corrigé** | `enums.js` — valeurs du système existant conservées, libellés imposés par rôle. |
| **Intégrité des données explicite** | `schema.js` — contraintes de champ, 22 invariants locaux, 10 invariants croisés déclarés. |

## Ce qui reste ouvert

| # | Question | Position |
|---|---|---|
| **N8** | Le décompte des rôles : **19 attestés** contre « 22 » annoncés au cadrage. Faut-il un extrait de la table `profil` de production ? | Détail et explication de l'écart : `03-matrice-des-roles.md` § 2. Chaque profil manquant coûte une entrée déclarative. |
| **A1** | Le concessionnaire doit-il accéder aux coordonnées privées ? | Position : non — moindre privilège. Soumis à l'audit. |
| **A2** | L'auxiliaire peut-il clôturer un transport après livraison ? | Position : oui — le débit a déjà eu lieu, la clôture ne coûte rien. Déduit du principe, non soumis à l'utilisateur. |

## Limite à ne pas oublier

**Ce POC ne prouve pas la sécurité.** LocalStorage est lisible et modifiable par
quiconque ouvre les outils de développement du navigateur. Ce qui est démontré,
c'est que la règle métier est **exprimable en un point unique et vérifiable** —
ce que le système existant ne permet pas aujourd'hui. Transposé sur une
architecture serveur, `permissions.js` devient la source d'une politique
appliquée côté serveur.
