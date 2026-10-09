# Note d'architecture — POC B2F

> **Jalon J1 — conception technique.** Auteur : agent `senior-fullstack`,
> 24 septembre 2026.
> Entrées : `docs/gestion-projet/*`, `docs/ux/*`, code de l'application existante.
> Documents liés : `02-modele-de-donnees.md`, `03-matrice-des-roles.md`.

---

## 1. Ce qui était déjà décidé, et qui n'est pas rouvert

Le cadrage et le plan de suivi ont tranché la pile technique (décisions D2 à D4)
et la conception UX a tranché l'interface. Cette note ne les rediscute pas :

- HTML5 / CSS3 / JavaScript vanilla, ES Modules natifs, **aucune compilation** ;
- LocalStorage, **préfixe `b2f_` obligatoire**, port 8081 (risque R5) ;
- **toutes les dépendances vendorisées**, aucun CDN à l'exécution (écart E1) ;
- architecture stricte `VUE → SERVICE → REPOSITORY → LOCALSTORAGE` ;
- un seul mécanisme d'appariement, confiné à un service dédié.

Ce que cette note ajoute, ce sont les décisions que ces contraintes laissaient
ouvertes — et qu'il fallait prendre avant d'écrire une ligne d'écran.

---

## 2. La structure retenue

```
B2F/
├── js/
│   ├── core/
│   │   └── storage.js          SEUL module touchant LocalStorage. Préfixe,
│   │                           transactions, reprise après interruption.
│   ├── domain/                 ★ Couche nouvelle, sans effet de bord
│   │   ├── enums.js            Valeurs stockées + libellés par point de vue
│   │   ├── schema.js           Entités, classification, contraintes, invariants
│   │   ├── roles.js            Les 19 rôles, leurs niveaux, leurs preuves
│   │   ├── permissions.js      Catalogue des droits + matrice rôle → portée
│   │   ├── access.js           Moteur de décision + projection des données
│   │   └── matching.state.js   Machine à états de l'appariement (pure)
│   ├── repositories/           J2 — un fichier par collection
│   ├── services/               J2–J3 — logique métier, dont matching.service.js
│   └── views/                  J2–J5 — un fichier par écran
└── tests/                      264 tests, code de sortie 0
```

### La décision de structure : une couche `domain/` sans effet de bord

Le plan de suivi prévoyait `core · repositories · services · views`. **Une couche
a été ajoutée.** Motif :

Les règles les plus sensibles du POC — qui peut valider, quand les coordonnées
sont libérées, quelles transitions existent — sont des **fonctions pures**. Les
placer dans `services/`, à côté du code qui lit et écrit LocalStorage, aurait eu
deux conséquences fâcheuses :

1. **Elles deviennent difficiles à tester exhaustivement.** Il faut monter un
   stockage, peupler des données, pour vérifier qu'un auxiliaire ne valide pas.
   Isolées, ces règles se testent par table de vérité — d'où les 264 tests
   produits en J1, avant tout écran.
2. **Elles deviennent difficiles à auditer.** Le `security-expert` doit pouvoir
   lire la règle sans traverser du code de persistance. `permissions.js` se lit
   d'un bout à l'autre ; il n'importe rien qui fasse d'entrée-sortie.

Le partage est net : **`domain/` décide, `services/` orchestre, `repositories/`
persiste.**

---

## 3. Les six décisions d'architecture

### D-A1 — L'appariement devient une entité de premier ordre

Le système existant porte les réponses des deux parties en colonnes sur l'offre,
plus une table `OffreDemande` concurrente : trois mécanismes pour une seule règle
(cadrage § 3.3). Cette structure ne sait pas représenter une offre rejetée puis
réservée à nouveau — la seconde tentative écrase la première.

Le POC crée `b2f_appariements`. Chaque tentative est un enregistrement distinct.
C'est l'écart délibéré n° 1 rendu **structurel** plutôt que promis.

*Détail : `02-modele-de-donnees.md` § 2.*

### D-A2 — La classification des données, plutôt que la vigilance

Deux exigences avaient été posées séparément par la conception UX : les
coordonnées ne sortent pas avant `valider` ; la DGTTC ne voit aucun montant. Les
traiter écran par écran aurait supposé de ne jamais se tromper, sur une trentaine
d'écrans, pendant quatre jalons.

Chaque champ du schéma porte une classification (`public`, `identite`, `contact`,
`financier`, `systeme`). Une fonction unique, `projeter()`, décide. Les champs
refusés sont **absents de l'objet rendu** — pas `null`, pas masqués en CSS : une
valeur présente dans la mémoire d'une vue finit par s'afficher quelque part.

*Détail : `02-modele-de-donnees.md` § 4.*

### D-A3 — Un droit est une portée, pas un booléen

`can('appariement.lire')` renvoyant `true` laisserait à chaque écran le soin de
filtrer. C'est la façon habituelle de fabriquer une fuite. La matrice associe à
chaque couple (rôle, droit) une **portée** : `AUCUNE`, `PROPRE`, `GROUPEMENT`,
`MARCHE`, `TOUT`.

Et `decider()` ne rend jamais un booléen nu, mais `{ autorise, portee, motif,
explication }`. Le même objet sert la sécurité (décision unique, traçable) et
l'interface (décision D32 : une action interdite s'explique, elle ne se masque
pas). Faire servir un seul mécanisme à ces deux fins n'est pas une économie : ce
qui est affiché à l'utilisateur est alors, par construction, ce qui a été décidé.

*Détail : `03-matrice-des-roles.md` § 1.*

### D-A4 — L'atomicité se fabrique sur la seule garantie disponible

LocalStorage n'a pas de transaction, mais garantit l'atomicité **par clé**. Le
module de stockage construit sur cette garantie un journal d'annulation écrit en
une seule clé, appliqué puis effacé, et rejoué au démarrage s'il subsiste.

Ce mécanisme existe pour une raison précise : **le double débit doit être tout ou
rien**. Le système existant n'a aucune contrainte d'intégrité en base (constat
A5) ; un débit isolé y passerait inaperçu.

*Détail : `02-modele-de-donnees.md` § 5.*

### D-A5 — La règle d'appariement est pure, l'orchestration ne l'est pas

`matching.state.js` porte la table des transitions, les gardes et les motifs de
refus. Il ne lit ni n'écrit rien. `matching.service.js` (J3) lira les soldes et
les tarifs, écrira les deux mouvements dans une transaction, alimentera le
journal d'audit et les notifications.

Ce découpage permet de tester en J1 ce que la démonstration ne jouera jamais :
les chemins interdits. Et il tient l'exigence `M4.5` — aucune vue, aucun autre
service ne modifie un état d'appariement.

### D-A6 — L'auxiliaire est dédoublé en deux rôles

Le système existant n'a qu'un rôle auxiliaire, avec un champ `typeauxiliaire`.
Le POC déclare `auxiliaire_affreteur` et `auxiliaire_transporteur`. Motif : leurs
droits diffèrent réellement, et le principe de la matrice est qu'aucun droit
n'existe hors d'elle. Un rôle unique dont les droits se calculeraient d'après le
type du parent réintroduirait la dispersion que le POC corrige.

*Détail et conséquence sur le décompte : `03-matrice-des-roles.md` § 2.*

---

## 4. Ce que les tests ont trouvé

Deux défauts réels, dans du code écrit ce jour, trouvés par la suite de tests
avant toute utilisation. Ils sont consignés parce qu'ils disent quelque chose de
la nature des risques de ce POC.

### Le premier : une fuite de coordonnées en puissance

`projeter()` devinait le groupement propriétaire en lisant `objet.groupementId`.
Pour l'entité `groupement` elle-même, ce champ n'existe pas — le propriétaire est
`id`. Le test « les coordonnées sont retirées avant validation » **passait pour
la mauvaise raison** : propriétaire indéterminé, donc refus. C'est le test
symétrique — « elles sont libérées après validation » — qui a échoué et révélé le
problème.

Un test vert pour la mauvaise raison est plus dangereux qu'un test rouge.

**Correction** : chaque entité déclare son champ propriétaire (`proprietaire`
dans `schema.js`). Une entité qui n'en a pas — un appariement a deux parties —
exige que l'appelant le fournisse. **Sans propriétaire connu, rien n'est libéré.**

### Le second : un rollback qui ne rollbackait pas

Le test « restaure tout si la seconde écriture échoue » simulait un quota
dépassé. La restauration tentait de réécrire **toutes** les clés du journal, y
compris celle qui venait d'échouer ; elle échouait donc à son tour, l'exception
de restauration remplaçait l'erreur d'origine, et **la transaction restait à
moitié appliquée** — exactement le double débit corrompu que le mécanisme existe
pour empêcher.

**Correction** : on ne restaure que les clés effectivement écrites, et une
restauration incomplète **conserve le journal** au lieu de l'effacer, pour que le
rattrapage reste possible au démarrage suivant. Détruire la seule trace d'une
écriture partielle serait le pire des choix.

---

## 5. Les limites, énoncées

| Limite | Portée |
|---|---|
| **LocalStorage n'est pas un mécanisme de sécurité.** | La matrice et la classification empêchent le code applicatif de construire une réponse non autorisée. Elles ne protègent rien contre l'ouverture des outils de développement. Le POC **simule** un cloisonnement. |
| **Pas de protection contre la concurrence entre onglets.** | Deux transactions simultanées sur la même origine peuvent s'entrelacer. Sans conséquence pour une démonstration mono-utilisateur ; à ne pas transposer tel quel. |
| **PBKDF2 ne rend pas les mots de passe sûrs ici.** | Les empreintes restent dans LocalStorage, donc lisibles. L'intérêt est de démontrer la pratique correcte, à la place d'un condensat rapide sans sel. |
| **Le modèle est construit sur le code, pas sur un schéma.** | Le dump de 2023 est périmé (décision D18). Des champs peuvent manquer, que seule la base de production révélerait. |
| **Trois rôles manquent peut-être.** | Voir la question ouverte N8, `03-matrice-des-roles.md` § 2. |

---

## 6. Suite

| Jalon | Ce qui vient |
|---|---|
| **J1** | **`security-expert` : revue de la matrice des rôles. Porte bloquante — aucun écran avant.** |
| **J2** | Dépôts appliquant schéma et invariants ; hachage PBKDF2 ; jeux de démonstration marqués DÉMO ; M1, M2, M3. |
| **J3** | `matching.service.js` — orchestration du double débit. M4, M5, M6. Audit de sécurité intermédiaire. |

**La porte de sécurité du jalon J1 est franchie** : audit rendu le 24/09 (**GO
avec réserves**), quatre findings bloquants corrigés et couverts par des tests de
non-régression — voir `03-matrice-des-roles.md` § 8. L'implémentation des écrans
peut démarrer.
