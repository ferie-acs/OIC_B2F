# Smoke test du déploiement — POC B2F en ligne

> **Auteur : agent `qa-testeur`. 24 septembre 2026.**
> Cible : <https://oic-b2f-production.up.railway.app/> (déploiement `devops-sre`).
>
> **Portée volontairement étroite.** La campagne QA complète a été menée en local
> et conclue GO (`01-…` puis `02-…`). Cette note ne vérifie qu'une chose :
> **le comportement change-t-il entre `python3 -m http.server` et nginx + CSP
> stricte ?**

---

## Verdict

> ## GO en ligne. Aucune régression liée au déploiement.
> Une observation mineure d'exploitation (en-tête HSTS absent), aucun correctif
> bloquant.

Tout ce qui avait été validé en local se comporte à l'identique en ligne. Les
trois points de risque propres à un passage `http.server` → nginx — type MIME des
modules ES, CSP sans `'unsafe-inline'`, repli des routes — sont couverts.

---

## 1. Ce qui différait du poste de test, et qui tient

| Risque propre au déploiement | Vérification | Résultat |
|---|---|---|
| **CSP stricte** (`style-src 'self'`, sans `'unsafe-inline'`) | Écouteur `securitypolicyviolation` posé, puis **42 écrans** parcourus sur les 4 espaces + parcours transactionnel complet | **0 violation** |
| Un `style` inline résiduel | `grep` sur `js/` et `index.html` : `style=`, `.style.`, `setAttribute('style')`, `cssText` | **aucune occurrence** — les 2 conversions de `devops-sre` étaient les seules |
| Ressource distante bloquée | `@import`, `@font-face`, `url(http…)` dans `css/` | **aucune** ; le seul `url()` est un chevron SVG en `data:`, couvert par `img-src 'self' data:` |
| **Type MIME des modules ES** | `curl -I /js/app.js` | `application/javascript` ✅ — un mauvais type aurait cassé toute l'application |
| Feuilles de style servies | 7 fichiers CSS du POC, règles comptées dans le navigateur | **7/7 chargées** (tokens 2, base 40, layout 50, components 78, forms 49, b2f 127, responsive 6) |
| **Repli SPA** (`try_files`) | `GET /affreteur/dashboard` | `200 text/html` ✅ |
| Fichier `.js` absent | `GET /js/nexistepas.js` | `404` ✅ — et non un repli silencieux vers `index.html`, qui aurait produit une erreur de syntaxe incompréhensible |
| Compression | `Accept-Encoding: gzip` sur le CSS | `content-encoding: gzip` ✅ |
| **`crypto.subtle` en HTTPS** | `isSecureContext`, connexion réelle par bouton de démonstration | `true`, PBKDF2 opérationnel, **0 erreur console** |
| Console au chargement | Lecture après rechargement | **vide** (seuls 2 messages d'une extension du navigateur) |

**En-têtes servis** (vérifiés sur `/` et sur un module JS) :

```
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
  base-uri 'self'; form-action 'self'; frame-ancestors 'none'
x-content-type-options: nosniff
referrer-policy: no-referrer
cross-origin-opener-policy: same-origin
permissions-policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()
cache-control: no-cache, must-revalidate
```

La précaution du `Dockerfile` — isoler les en-têtes dans un fragment inclus par
chaque bloc `location`, parce qu'un `add_header` enfant annule tous ceux du parent
— est vérifiée dans les faits : **la CSP est bien présente sur les fichiers JS et
CSS**, pas seulement sur la page.

## 2. Les trois anciens bloquants, rejoués en ligne

| # | Contrôle en ligne | Résultat |
|---|---|---|
| **QA-01** | `transporteur2@demo.invalid` ouvre `#/transporteur/relations/<dossier entre grp-aff-1 et grp-tra-1>` — recherche du montant, de la référence, du téléphone et de l'immatriculation | « **Mise en relation inaccessible — Cette mise en relation ne concerne pas votre groupement.** » Bloc « Les écritures » absent, **aucun marqueur** |
| **QA-02bis** | Transporteur sur une mise en relation validée → clic « Suivre le transport » | `href="#/transporteur/suivi"`, **écran de suivi atteint** (plus de refus) |
| **QA-04** | Retrait d'une offre réservée non encore acceptée | offre `retiree`, appariement `annuler`, **demande rendue `publiee`** — plus de zombie |
| **QA-02 / D60** | Écran de validation de l'affréteur | conforme, voir ci-dessous |

Registre de débit servi en ligne :

```
Vous — Cacao Lagunes Export DÉMO      Solde avant : 200 000 F CFA
                                      − 15 000 F CFA
                                      Solde après : 185 000 F CFA
Transporteur — Trans Lagunes DÉMO     Compte provisionné
                                      − 15 000 F CFA · Débité au même instant
Total prélevé par la plateforme       30 000 F CFA
```

`soldeTransporteur` absent du retour du service, solde réel du tiers absent de la
page, mon propre solde chiffré. **Identique au local.**

**Double clic sur « Valider » en ligne** : 2 opérations de 15 000, 1 transport,
solde 200 000 → 185 000, **un seul message**.

## 3. Cloisonnement des rôles en ligne

| Tentative | Résultat |
|---|---|
| DGTTC sur `#/affreteur/dashboard` | ✅ « Cet écran ne vous est pas accessible » |
| Transporteur sur `#/concessionnaire/comptes` | ✅ refusé, **0 montant** dans la page |
| Transporteur étranger sur le dossier d'un concurrent | ✅ refus explicite, aucune donnée |
| 42 écrans des 4 espaces, chacun sous son propre rôle | ✅ tous rendus, **0 erreur, 0 refus indu** |

## 4. Isolation entre visiteurs — vérifié

Point qui méritait d'être levé avant une démonstration publique : **l'état vit
dans le `LocalStorage` de chaque navigateur, il n'y a aucun état serveur
partagé.** Purge complète puis rechargement : l'amorçage se refait proprement
(17 clés, 6 groupements, 10 utilisateurs, 3 offres disponibles, 2 demandes
publiées, 1 mise en relation), bandeau « PREUVE DE CONCEPT » présent, écran de
connexion servi.

**Conséquence : aucune démonstration ne peut être polluée par une précédente**, et
mes propres manipulations de test n'ont affecté que mon navigateur.

## 5. Observation

**O1 — `Strict-Transport-Security` absent (mineur).** Railway impose HTTPS au
bord, et la CSP porte déjà `frame-ancestors 'none'`. L'en-tête HSTS n'ajouterait
rien contre un risque réel pour ce POC ; il complèterait la panoplie si
l'application devait un jour servir sur un domaine propre à l'OIC. À traiter avec
`devops-sre` lors d'une éventuelle mise sur domaine dédié, pas avant.

**Non retenu :** la première connexion paraît lente (≈ 3 s), mais la mesure isole
la cause — c'est le **démarrage à froid** (import des modules ES + amorçage du jeu
de démonstration), une seule fois. Une connexion sur une page déjà chargée prend
**430 ms**. Pas de gêne en démonstration.

## 6. Ce que ce smoke test ne couvre pas

Il ne rejoue pas la campagne QA : voir `01-…` et `02-…` pour le fond. Ne sont pas
couverts ici — inchangé depuis le § 6 du rapport de contre-vérification : lecteur
d'écran réel, contraste WCAG, mobile réel, charge, écrans J4/J5.
