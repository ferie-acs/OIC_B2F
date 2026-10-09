# Design system B2F — alignement sur le POC DUT

> **Jalon J1 — conception.** Auteur : agent `ux-designer`, 24 septembre 2026.
> Source de vérité du rendu : `maquettes/b2f-maquette.css`, directement
> réutilisable comme base de `css/` dans l'implémentation.

---

## 1. Ce que porte réellement le POC DUT en production

Relevé sur <https://oic-dut-production.up.railway.app/> (fichiers servis, non
reconstitués), recoupé avec `/Applications/MAMP/htdocs/POC_OIC/DUT/`.

**Point important pour l'implémentation.** Le DUT charge onze feuilles de style en
cascade, et **les trois dernières redéfinissent `:root` en entier**. Lire
`css/variables.css` seul conduit à une palette fausse : ce fichier déclare un
accent orange `#F17D0C` et une police *Public Sans*, tous deux **écrasés** ensuite
par `nexlink.css` puis `blue-refinement.css`. La palette effective est celle
ci-dessous.

### 1.1 Jetons effectifs — à reprendre tels quels

```css
/* Surfaces */        --bg:#f6f8fc; --surface:#fff; --surface-2:#f7f8fb; --surface-sunken:#eef0f6;
/* Texte */           --text:#122b46; --text-secondary:#52657c; --text-muted:#65768a;
/* Bordures */        --border:#e9ebf2; --border-strong:#d9dce7; --border-hairline:#f0f1f6;
/* Accent — bleu OIC */
                      --accent:#155a9c; --accent-hover:#104b85;
                      --accent-soft:#e9f2fb; --accent-soft-border:#cee1f5; --accent-ring:#155a9c30;
/* Marine */          --navy:#163f6e; --navy-2:#245887; --navy-soft:#e9f2fb;
/* États */           --success:#168766 / #e4f6ee   --warning:#a86b13 / #fff3db
                      --error:#d64e67 / #fdebf0     --info:#5273dc / #eef2ff
/* Rayons */          --r-sm:6px --r-md:8px --r-lg:12px --r-xl:16px --r-control:7px --r-pill:999px
/* Ombres */          --sh-1:0 3px 12px #25283903   --sh-2:0 8px 28px #25283908
                      --sh-3:0 12px 40px rgba(18,43,70,.14)
/* Espacements */     --s1:4 --s2:8 --s3:16 --s4:24 --s5:32 --s6:48 (px)
/* Layout */          --side-w:318px --top-h:78px  (dont un rail de 70px)
/* Typo */            --font:'Instrument Sans'  ·  body 15px/500  ·  h1 29px/700
/* Thème sombre */    :root[data-theme="dark"]  (attribut sur <html>)
```

### 1.2 Trois défauts du DUT que B2F corrige

| # | Constat | Correction dans B2F |
|---|---|---|
| **C1** | **La police déclarée n'est pas celle chargée.** `--font` vaut `'Instrument Sans'` dans `nexlink.css`, mais `variables.css` déclare `'Public Sans'` et rien ne charge cette dernière. Onze feuilles se contredisent. | Un seul fichier de jetons. Une seule déclaration de police. |
| **C2** | **Les polices et bibliothèques viennent de CDN** (Google Fonts, cdnjs), sans contrôle d'intégrité. | **Instrument Sans vendorisée** en `assets/fonts/` avec `@font-face` local et `font-display:swap`. Conforme à l'écart E1 du plan de suivi, et la démonstration fonctionne sans connexion. |
| **C3** | **Le rail duplique la barre latérale** — même liens aux deux niveaux. | Le rail porte les zones, la barre latérale les pages de la zone. Voir `01-parcours-et-navigation.md` § 3. |

---

## 2. Identité visuelle B2F — la question laissée ouverte par le cadrage

Le plan de suivi (§ 3.1) prévoit « Bleu OIC `#155A9C` **+ une couleur d'accent
secondaire distincte** — écart assumé ». Voici la proposition et son raisonnement.

### 2.1 Ce qu'il ne faut pas faire

Changer la couleur d'action. Si le bouton primaire du DUT est bleu et celui de B2F
orange, l'utilisateur qui passe d'une application à l'autre doit **réapprendre où
cliquer**. La couleur d'action est un élément de comportement, pas de marque : elle
doit rester identique entre deux applications du même émetteur.

### 2.2 Proposition retenue — deux marqueurs, aucun changement d'action

| Marqueur | Ce que c'est | Pourquoi ça marche |
|---|---|---|
| **1 — Le rail en marine plein** (`--navy:#163f6e`) | Le DUT porte un rail blanc. B2F porte un rail marine sur toute la hauteur de l'écran. | C'est la seule surface **permanente et périphérique** de l'interface. On la perçoit sans la regarder — exactement ce qu'on demande à un marqueur d'identité. Et c'est une couleur déjà dans la charte OIC : rien d'inventé. |
| **2 — Une couleur de signature teal** (`--signature:#0f766e`) | Réservée aux marqueurs du domaine « marché » : badge d'état *accepté*, jalons franchis du suivi, bandeau de délégation, encadré des coordonnées révélées, étiquette produit. | Le bleu dit « l'OIC », le teal dit « la mise en relation ». Il n'entre jamais en concurrence avec le bleu d'action car il ne se pose jamais sur un bouton d'action primaire. |

```css
--signature:#0f766e;         --signature-hover:#0b5d57;
--signature-soft:#e4f3f1;    --signature-soft-border:#c3e3df;
/* thème sombre */
--signature:#5ecfc0;         --signature-soft:#153b37;   --signature-on:#08322e;
```

**Contrastes vérifiés** : `#0f766e` sur `#ffffff` = **5,1:1** (AA texte normal) ;
`#0f766e` sur `--signature-soft #e4f3f1` = **4,6:1** (AA) ; en thème sombre
`#5ecfc0` sur `#1d1d1d` = **9,8:1**.

### 2.3 Règles d'emploi — à faire respecter en revue

| Le teal **sert à** | Le teal **ne sert jamais à** |
|---|---|
| Badge d'état « acceptée » | Un bouton primaire |
| Pastille des jalons franchis du suivi | Un lien de navigation |
| Bandeau de délégation de l'auxiliaire | Un message d'erreur, de succès ou d'alerte (couleurs d'état réservées) |
| Encadré des coordonnées révélées | Un aplat de fond de page |
| Étiquette « Mise en relation » sous le nom du produit | Plus de deux éléments visibles dans un même écran |

### 2.4 Option de repli

Si la double signature est jugée trop bavarde : **conserver le rail marine seul** et
supprimer le teal, les états acceptés repassant en bleu d'accent. On perd la
distinction visuelle entre « action de la plateforme » et « domaine du marché »,
on garde la reconnaissance immédiate de l'application. C'est une ligne de CSS à
retirer, pas une refonte.

> **Ce point est soumis à l'utilisateur — question U1.** Il se juge sur la maquette,
> pas sur ce document.

### 2.5 Tics visuels proscrits

Règle du client, applicable sans exception :

- **Aucun liseré coloré sur un seul côté** d'une carte, d'un encadré ou d'un
  bandeau (`border-left: 3px solid …`). Les bandeaux d'alerte de B2F portent une
  bordure **uniforme** sur les quatre côtés et un fond teinté. *Le rail de
  navigation n'est pas concerné : c'est une surface structurelle pleine, pas une
  décoration de bloc.*
- Aucun dégradé violet ou indigo, aucun glassmorphism, aucun emoji décoratif.
- Aucun relief 3D : le système est plat, à bordures et fonds teintés.

---

## 3. Composants — inventaire et usage

Tous sont implémentés dans `maquettes/b2f-maquette.css`. Les noms de classes sont
**identiques à ceux du DUT** partout où le composant existe déjà : la réutilisation
doit être littérale, pas approximative.

### 3.1 Repris du DUT sans modification

`.btn` (+`-primary`, `-secondary`, `-danger`, `-success`, `-ghost`, `-sm`, `-lg`,
`-block`) · `.badge` (+ variantes d'état) · `.card` / `.card-header` · `.kpi-grid`
/ `.kpi-card` / `.kpi-value` · `.data-table` / `.table-wrap` / `.table-toolbar` ·
`.tabs-underline` / `.tab-btn` · `.field` / `.input` / `.select` / `.textarea` /
`.checkbox-row` · `.stepper-h` (wizard) / `.live-recap` · `.timeline` ·
`.alert-banner` · `.empty-state` · `.modal-overlay` / `.modal-card` · `.chip-btn` ·
`.recap-section` / `.recap-grid` · `.corridor` · `.volume-chart` · `.pagination`.

### 3.2 Ajoutés pour B2F

| Classe | Rôle | Pourquoi il n'existait pas dans le DUT |
|---|---|---|
| `.ledger` / `.ledger-row` / `.ledger-party` / `.ledger-amount` | Présentation du double débit : deux parties, deux montants, un total. | Le DUT n'a pas de transaction financière. C'est **le composant central de B2F**. |
| `.offer-card` / `.offer-meta` / `.offer-foot` | Carte d'offre de véhicule sur le marché. | Une offre se compare en un coup d'œil : la carte bat le tableau pour un objet à six attributs et une action. |
| `.corridor-cell` | Cellule « origine → destination » avec flèche. | Motif répété dans chaque tableau de B2F. |
| `.delegation-bar` | Bandeau permanent de l'auxiliaire. | Le DUT n'a pas de sous-comptes. |
| `.contact-reveal` | Encadré des coordonnées transmises après validation. | C'est **l'objet de la transaction** : il doit se distinguer d'une fiche ordinaire. |
| `.matrix-table` | Matrice des droits, première colonne figée. | 13 lignes × 5 rôles, en défilement horizontal sur mobile. |
| `.brand-tag` | Étiquette « Mise en relation » sous le nom du produit. | Marqueur d'identité B2F. |
| `.demo-bar` | Bandeau de démonstration. | Parade du risque R7 — ne pas laisser croire à un produit fini. |

### 3.3 Le composant qui mérite une attention particulière

`.ledger` porte à lui seul la démonstration du modèle économique. Exigences :

1. Les **deux** parties sont toujours affichées, même si une seule est en défaut.
2. Le solde **après** débit est calculé et montré, pas seulement le solde avant.
3. Le total prélevé par la plateforme apparaît sur une ligne distincte.
4. En cas d'insuffisance, la ligne fautive passe en rouge **et** le bandeau d'erreur
   en tête d'écran nomme la partie et chiffre le manque.
5. Les montants sont en chiffres tabulaires (`font-variant-numeric: tabular-nums`)
   pour que les colonnes s'alignent.

---

## 4. Accessibilité

Le POC DUT n'a pas de section accessibilité dans son README. B2F en fait une
exigence explicite, vérifiable par la QA.

| Exigence | Mise en œuvre |
|---|---|
| **Contraste** | Tous les couples texte/fond ≥ 4,5:1 en thème clair et sombre. Les couples ajoutés (teal) sont vérifiés en § 2.2. Les badges d'état reposent sur fond teinté + texte coloré, jamais sur la couleur seule. |
| **Couleur jamais seule porteuse de sens** | Chaque badge d'état porte **une icône et un libellé**, pas seulement une teinte. Un daltonien lit « Acceptée ✓ » et pas un rectangle vert. |
| **Navigation clavier** | Toute action est un `<button>` ou un `<a>` réel — jamais un `<div>` cliquable. Ordre de tabulation = ordre de lecture. `:focus-visible` à 2 px sur l'accent, jamais supprimé. |
| **Modales** | `role="dialog"` + `aria-modal="true"`, fermeture par `Échap`, focus placé à l'ouverture et **rendu à l'élément déclencheur** à la fermeture. Piège de focus à implémenter (absent de la maquette, qui n'est pas le produit). |
| **Cibles tactiles** | Minimum 44 × 44 px pour toute action sur mobile. Les liens d'action en tableau reçoivent une zone de clic élargie. |
| **Sémantique** | Un seul `<h1>` par écran. Tableaux avec `<thead>`/`<th scope>`. Barre latérale et rail en `<nav>` avec `aria-label` distincts. Page active en `aria-current="page"`, zone active en `aria-current="true"`. |
| **Formulaires** | Chaque champ a un `<label>` associé. Erreur liée par `aria-describedby` + `aria-invalid="true"`. L'astérisque de champ requis est `aria-hidden` (l'information passe par `required`). |
| **Contenu dynamique** | Les listes de résultats et le centre de notifications sont en `aria-live="polite"`. |
| **Boutons désactivés** | Un bouton désactivé porte **toujours** un `title` expliquant pourquoi, et la raison est également écrite en clair à l'écran. Ne jamais masquer une action interdite : l'expliquer. |
| **Mouvement** | `@media (prefers-reduced-motion: reduce)` neutralise transitions et animations. Règle déjà présente dans le DUT, reprise et étendue aux animations. |
| **Zoom et réduction** | Interface utilisable à 200 % de zoom sans défilement horizontal, hors tableaux (en `overflow-x:auto` dédié). |

---

## 5. Motion

Sobre, fonctionnel, et intégralement neutralisable.

| Usage | Traitement |
|---|---|
| Survol de bouton, de carte, de lien | Transition 150–200 ms sur `background`, `border-color`, `box-shadow`. Jamais sur `transform`. |
| Ouverture de modale | Fondu + translation de 6 px, 160 ms. |
| Apparition de toast | Glissement latéral de 12 px, 180 ms. |
| Ouverture de la barre latérale sur mobile | Translation, 200 ms. |
| Graphiques | Tracé progressif des courbes, ≤ 1,15 s, **une seule fois** au montage. |

`anime.js v4` reste la bibliothèque du système (plan de suivi § 3.1), **vendorisée
en local** (build IIFE, global `anime`) conformément à l'écart E1 — jamais un CDN.
L'API v4 s'utilise via `anime.animate`, `stagger`, `createSpring`, `onScroll` ; ne
pas retomber sur l'API v3 `anime({targets})`. Aucune animation n'est requise pour
que l'interface soit utilisable : toute animation est décorative par construction.

---

## 6. Conventions d'implémentation

À l'attention de `senior-fullstack`.

| Règle | Détail |
|---|---|
| **Structure CSS** | `css/tokens.css` (jetons uniquement) · `base.css` · `layout.css` · `components.css` · `forms.css` · `b2f.css` (composants propres à B2F) · `responsive.css`. **Un seul fichier déclare `:root`** — la cascade contradictoire du DUT ne doit pas être reproduite. |
| **Thème** | `document.documentElement.dataset.theme`, persisté sous la clé **`b2f_theme`** (jamais `dut_theme` — risque R5). |
| **Icônes** | Sous-ensemble Lucide local, sur le modèle de `js/core/icons.js` du DUT, avec la licence ISC conservée. Aucun CDN. La maquette utilise un sprite `<symbol>` inline : mêmes tracés, mêmes noms. |
| **Police** | `assets/fonts/instrument-sans-*.woff2` + `@font-face`, `font-display:swap`, pile de repli système complète. |
| **Échappement** | La maquette écrit du HTML par gabarits littéraux sans échapper — c'est acceptable pour des données figées, **pas dans le produit**. Toute donnée saisie par un utilisateur passe par `escapeHtml` avant insertion, comme dans le DUT. |
| **Pas de style en ligne** | La maquette en contient quelques-uns par commodité. Le produit n'en admet aucun (Definition of Done, point 6). |
| **Pas de `onclick` en ligne** | Idem : la maquette en utilise pour rester lisible, le produit passe par `addEventListener`. |
| **Largeurs** | `--side-w:318px` dont `--rail-w:70px`. `--top-h:78px`. Contenu `max-width:1700px`, centré. |
| **Points de rupture** | 1200 px (masquage du profil en barre supérieure) · 960 px (barre latérale en tiroir) · 700 px (deux colonnes de KPI, colonne unique). |

---

## 7. Écarts assumés par rapport au DUT

| # | Écart | Motif |
|---|---|---|
| **V1** | Rail marine plein au lieu d'un rail blanc. | Marqueur d'identité de l'application — § 2.2. |
| **V2** | Couleur de signature teal. | Distinguer le domaine « marché » du bleu institutionnel — § 2.2. Répond à la ligne « accent secondaire distinct » du plan. |
| **V3** | Le rail porte les zones, pas une copie des liens. | Corrige une duplication qui ne passe pas à l'échelle de cinq rôles — § 1.2 C3. |
| **V4** | Jetons dans un fichier unique. | Corrige la cascade contradictoire à onze feuilles — § 1.2 C1. |
| **V5** | Police et bibliothèques vendorisées. | Écart E1 du plan de suivi — § 1.2 C2. |
| **V6** | Composants financiers (`.ledger`) et de marché (`.offer-card`) ajoutés. | Le DUT n'a ni transaction ni marché. |

Aucun de ces écarts ne touche la palette d'action, la typographie, les rayons, les
ombres, l'espacement ni les composants communs : **un utilisateur qui connaît le
DUT sait se servir de B2F sans réapprentissage.** C'est le critère qu'il fallait
tenir.
