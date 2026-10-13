# Lot b0 — Recherche intégrée à toutes les listes de choix

Exigence : « toute liste de choix, quel que soit son format, doit contenir un champ de recherche ».

## Principe

Amélioration progressive, globale et idempotente, sans modification des vues :

- Le `<select>` natif **reste dans le document** (même `id`, `name`, `value`, écouteurs `change`,
  `required`, `<label for>`). Il est masqué à l'œil (classe `lr-natif`) et continue d'être lu par les
  vues, `FormData`, `reportValidity()` et les tests.
- À sa place visuelle, un **déclencheur** (bouton, rôle `combobox`) affiche le libellé choisi et un
  chevron Lucide. Il reprend les classes du select (`.select` par défaut) : la charte du contexte
  s'applique telle quelle.
- Le **panneau** s'ouvre avec, en tête, un champ « Rechercher… » (icône Lucide `search`), puis la
  liste filtrée. Filtrage insensible à la casse et aux accents, mot à mot (« port abidjan » retrouve
  « Abidjan — Port autonome »). État « Aucun résultat ». Options désactivées et `optgroup` respectés
  (un titre de groupe qui correspond garde toutes ses options). `select[multiple]` : le panneau reste
  ouvert, chaque Entrée ou clic bascule l'option, le déclencheur affiche « n éléments sélectionnés ».
- Choisir une option écrit dans le select natif puis émet `input` et `change`, comme le navigateur.

## Clavier et accessibilité

Motif ARIA combobox / listbox (`aria-expanded`, `aria-controls`, `aria-activedescendant`,
`aria-selected`, `aria-disabled`, groupes `role="group"`), annonce du nombre de résultats.

| Touche | Effet |
| --- | --- |
| Flèche bas / haut, F4 (fermé) | Ouvre sur l'option choisie |
| Début / Fin (fermé) | Ouvre sur la première / dernière option |
| Lettre (fermé) | Ouvre et commence la recherche |
| Flèches, Page préc. / suiv., Début / Fin (ouvert) | Déplacent la sélection, options désactivées sautées |
| Entrée | Choisit (jamais de soumission implicite du formulaire) |
| Échap, Alt + flèche haut | Ferment ; le focus revient au déclencheur |
| Tab, Maj + Tab | Ferment et passent au champ suivant / précédent |

Clic extérieur : fermeture. Dans une modale, Échap ferme la liste sans fermer la modale. Un clic sur
l'étiquette ou une validation native qui vise le select masqué renvoie le focus au déclencheur.

## Synchronisation

- `select.value = …` et `select.selectedIndex = …` : interceptés sur l'instance (comportement natif
  conservé), le libellé est rafraîchi.
- `MutationObserver` par liste : options ajoutées, retirées, renommées ; attributs `disabled`,
  `required`, `hidden`, `aria-invalid`, `aria-describedby`.
- Formulaire remis à zéro (`reset`) : libellés rafraîchis.

## Application automatique

`installerListesRecherche()` (une ligne dans `demarrerApplication()` de `js/app.js`) améliore les
selects présents puis pose un observateur unique sur `body` : pages, modales, filtres, pages publiques.
Un registre `WeakMap` garantit une seule amélioration par select.

La page autonome `comprendre.html` charge le même module et la même feuille (liste « Rythme »).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `js/core/liste-recherche.js` | Module (nouveau). Construction exclusivement par `el()` / `icone()` |
| `css/lot-b0.css` | Styles (nouveau), jetons de `tokens.css` uniquement, thème sombre compris |
| `js/app.js` | Import et une ligne d'amorçage, bloc `Lot b0` |
| `index.html` | Feuille `lot-b0.css` ; symbole Lucide `chevron-down` (lucide-static 0.468.0) ajouté au sprite |
| `comprendre.html` | Feuille, symboles `ic-search`, `ic-chevron-down`, `ic-check` et amorçage du module |
| `tests/lot-b0.test.mjs` | 18 tests : filtrage (accents, casse, ligatures, groupes), conservation du select natif |

Aucune route, aucun rôle, aucun droit, aucune donnée de démonstration ajoutés.

## Charte

Le déclencheur hérite des règles existantes (`.select`, `.input` : bordure, rayon, anneau de focus,
typographie). Les contextes où le select était habillé par sa balise et non par une classe
(filtres de l'explorateur public, filtre de l'annuaire de supervision, filtre « Ville de départ » de
l'accueil, rythme de `comprendre.html`) reçoivent les mêmes valeurs dans `lot-b0.css`. Panneau :
`--surface`, `--border`, `--r-md`, `--sh-3` ; champ de recherche avec l'anneau `--accent-ring`.
Aucune couleur littérale, aucune bordure gauche. À 390 px le panneau est contenu dans l'écran
(gouttière de 16 px), s'ouvre au-dessus s'il manque de place et la saisie passe à 16 px (pas de zoom iOS).

## Parcours de vérification

Mot de passe `demo2026`.

1. `affreteur@demo.invalid` → Nouvelle déclaration (`#/affreteur/declarations/nouvelle`) → Provenance :
   taper « bouake » → « Bouaké » ; Entrée → le récapitulatif suit comme avant.
2. Sans connexion → `#/explorer` → Départ : taper « SAN PEDRO » → « San-Pédro ».
3. `concessionnaire@demo.invalid` → Groupements → filtre : taper « TRANSPORT » → « Transporteurs ».
4. `affreteur@demo.invalid` → Documents de transport → Exemplaire : taper « EXPEDITEUR ».
5. `transporteur@demo.invalid` → Véhicules → Ajouter un camion (modale) → Carrosserie : taper « pla ».

## Limites assumées

- Les listes natives du navigateur (sélecteur de date, `datalist`) ne sont pas des `<select>` et ne sont
  pas concernées ; l'application n'emploie pas de `datalist`.
- Aucun `select[multiple]` n'existe aujourd'hui dans l'application ; le cas est géré et vérifié dans le
  navigateur sur une liste insérée pour l'essai.
- Quelques règles existantes habillaient des selects avec des couleurs littérales (`#f8faff`,
  `#e2e9f3`, `#193a61`) ; le déclencheur utilise les jetons les plus proches (`--surface-2`,
  `--border`, `--navy`), l'écart est imperceptible.
