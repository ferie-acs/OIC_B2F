# Conception UX/UI — POC B2F (Bourse de Fret OIC)

**Actualisation :** [refonte du marché public](04-marche-public.md). La maquette et les choix de palette ci-dessous représentent le jalon précédent.

> **Jalon J1.** Agent `ux-designer`, 24 septembre 2026.
> Entrées : `docs/gestion-projet/{cadrage,methodologie,plan-suivi,journal}.md`,
> POC DUT en production et code local.

---

## Par où commencer

**Ouvrez d'abord la maquette**, pas les documents.

```
docs/ux/maquettes/b2f-maquette.html
```

Elle s'ouvre par double-clic, sans serveur ni connexion Internet. Le bandeau jaune
en haut permet de changer de rôle et d'écran ; la bascule clair/sombre est dans la
barre supérieure.

## Contenu du livrable

| Fichier | Ce qu'il contient | Pour qui |
|---|---|---|
| **`maquettes/b2f-maquette.html`** + `.css` + `.js` | Maquette cliquable : 5 rôles, 40 écrans, thèmes clair et sombre, responsive, cas d'échec jouables. | **Tout le monde — à regarder en premier.** |
| **`maquettes/b2f-comprendre.html`** + `.js` | **Page pédagogique interactive** : explique le métier de la bourse de fret à qui n'en a jamais entendu parler. Simulation du parcours en 7 étapes, cartes acteurs, glossaire de 13 termes, 6 idées reçues, quiz de 5 questions. ~10 min de lecture. | **Décideurs, comité, parties prenantes non initiées.** Support d'ouverture de démonstration. |
| `01-parcours-et-navigation.md` | Fil narratif en sept actes, cas d'échec, arborescence et routes par rôle, vocabulaire des statuts, états vides, règles de micro-copie. | `senior-fullstack`, `qa-testeur` |
| `02-design-system-b2f.md` | Jetons effectifs du DUT en production, identité visuelle B2F et sa justification, inventaire des composants, accessibilité, motion, conventions d'implémentation. | `senior-fullstack` |
| `03-specifications-ecrans.md` | Écran par écran : champs, obligations, règles de validation, messages, effets. | `senior-fullstack`, `qa-testeur` |

Le fichier CSS de la maquette est **directement réutilisable** comme base de `css/`
dans l'implémentation : ce ne sont pas des styles jetables.

---

## Les six décisions de conception

| # | Décision | Motif |
|---|---|---|
| **1** | **La couleur d'action reste le bleu OIC `#155a9c`**, identique au DUT. | La couleur d'action est un comportement, pas une marque. La changer obligerait l'utilisateur à réapprendre où cliquer en passant d'une application à l'autre. |
| **2** | **L'identité B2F passe par le rail de navigation en marine plein** (`#163f6e`), là où le DUT porte un rail blanc. | Seule surface permanente et périphérique de l'écran : on la perçoit sans la regarder. Couleur déjà dans la charte OIC — rien d'inventé. |
| **3** | **Une couleur de signature teal `#0f766e`** pour les marqueurs du domaine « marché » — état accepté, jalons franchis, délégation, coordonnées révélées. | Répond à la ligne « accent secondaire distinct » du plan de suivi § 3.1, sans jamais concurrencer le bleu d'action. Contrastes vérifiés AA. **Soumis à validation — question U1.** |
| **4** | **Le rail porte les zones, la barre latérale les pages de la zone.** | Le DUT recopie chaque lien aux deux niveaux ; avec 5 rôles et ~30 écrans, cette duplication ne passe pas à l'échelle. |
| **5** | **L'écran de validation montre les deux débits avant d'agir** (composant `.ledger`). | Dans ce métier, valider *est* une transaction. Une fenêtre « Êtes-vous sûr ? » qui masque les montants serait un défaut de conception, pas une simplification. |
| **6** | **Une action interdite s'explique, elle ne se masque pas.** | Un bouton absent se lit comme un bug. Un bouton désactivé avec son motif enseigne la règle — et c'est précisément ce qu'un POC doit démontrer. |

---

## Trois défauts du POC DUT que B2F corrige

Relevés en étudiant la version en production. Ce ne sont pas des critiques : ce
sont des points à ne pas reproduire.

1. **Cascade CSS contradictoire.** Onze feuilles de style, dont trois redéfinissent
   `:root` en entier. `variables.css` déclare un accent orange et la police
   *Public Sans* — tous deux écrasés ensuite, et *Public Sans* n'est jamais chargée.
   Quiconque lit ce fichier pour retrouver la palette se trompe. **B2F : un seul
   fichier de jetons.**
2. **Dépendances et polices servies depuis des CDN** sans contrôle d'intégrité.
   **B2F : tout vendorisé** — écart E1 du plan, et la démonstration fonctionne hors
   connexion.
3. **Rail de navigation redondant.** Corrigé, voir décision 4.

---

## Ce qui reste à trancher

| # | Question | Position proposée |
|---|---|---|
| **U1** | La signature visuelle (rail marine + teal) est-elle retenue&nbsp;? | Oui. Repli disponible : rail marine seul, suppression du teal — une ligne de CSS. **Se juge sur la maquette.** |
| **U2** | Les six étapes du suivi de transport — *à quai, chargé, en route, livré, clôturé* — correspondent-elles à la pratique&nbsp;? | Ce sont des propositions : le système existant ne formalise pas ces étapes. À confronter au métier. |
| **U3** | L'auxiliaire peut-il annuler une réservation&nbsp;? | Oui : cela n'engage aucune dépense. Le plan ne tranche que la validation. |
| **U4** | Une réservation sans réponse expire-t-elle&nbsp;? | Non. Signalement visuel après 48 h, sans expiration automatique — inventer une expiration créerait une règle métier absente du système actuel. |

---

## Périmètre couvert

| Jalon | Traitement |
|---|---|
| **J2 — M1, M2, M3** | Maquetté et spécifié en détail. |
| **J3 — M4, M5, M6** | Maquetté et spécifié en détail, cas d'échec compris. |
| **J4 — Concessionnaire, DGTTC, M8** | Maquetté ; spécifié au niveau du contenu et des règles d'accès. |
| **J5 — M7, M9, M10** | Cadré seulement, écrans volontairement non maquetés. Le POC doit d'abord prouver son noyau. |

Les rôles de **niveau 2** (transporteur privé, étranger, partenaires) sont traités
comme des variations déclaratives de l'espace Transporteur ; ceux de **niveau 3**
(~14 profils) reçoivent un menu généré à partir de leur matrice de droits, sans
écran métier. Conforme à `plan-suivi.md` § 1.4.

---

## Limites de ce livrable

- **La maquette n'est pas le produit.** Elle contient des styles en ligne, des
  `onclick` et des gabarits HTML non échappés — tous proscrits par la Definition
  of Done. Elle sert à voir et à décider, pas à être copiée telle quelle.
- **Elle n'a pas été testée en lecteur d'écran.** Les exigences d'accessibilité
  sont spécifiées (`02-design-system-b2f.md` § 4) et restent à vérifier par
  `qa-testeur` sur le produit.
- **Aucune donnée réelle.** Tous les groupements, personnes, immatriculations et
  numéros RCCM sont inventés et marqués « DÉMO » (risque R9).
- **Le piège de focus des modales n'est pas implémenté** dans la maquette. Il est
  exigé dans le produit.
