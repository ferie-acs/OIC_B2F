# Déploiement — POC Bourse de Fret (B2F)

> **Version 1.0 — 24 septembre 2026.** Auteur : ingénieur DevOps / SRE, ACS GROUP.
> Jalon **J5**, ligne « `devops-sre` — `Dockerfile`, reproductibilité, commande
> unique de lancement » du `plan-suivi.md` § 6.2.

## État en une ligne

Le POC se lance **en une commande**, tourne **sans privilège**, se sert **sans
aucune ressource distante**, et son image est **prête pour Railway**. **Rien n'a
été mis en ligne.**

## Les trois documents

| Document | Objet |
|---|---|
| [`01-execution-locale.md`](01-execution-locale.md) | Lancer la démonstration sur un poste : Docker, ou `python3 -m http.server` sans Docker. Vérifications faites, sorties réelles. |
| [`02-deploiement-railway.md`](02-deploiement-railway.md) | La procédure de mise en ligne, **préparée et non exécutée**. Ce qui reste à faire par une personne, et dans quel ordre. |
| [`03-observabilite-et-fiabilite.md`](03-observabilite-et-fiabilite.md) | Ce qui est surveillable sur un POC sans serveur, ce qui ne l'est pas, et les risques d'exploitation assumés. |

## Ce qui a été vérifié, et comment

Aucune affirmation de ces documents ne repose sur une lecture de fichier seule.
Tout ce qui suit a été **exécuté** le 24/09/2026.

| Vérification | Résultat |
|---|---|
| `docker build` puis `docker run` | Image construite, conteneur démarré, `HTTP 200` sur `/`. |
| Cohabitation avec le POC DUT | **DUT sur 8080 et B2F sur 8081 tournent simultanément.** Aucun conflit. |
| Port dynamique (contrainte Railway) | `PORT=3000` injecté → nginx écoute réellement `listen 3000`. |
| Types MIME des modules ES | `js/app.js` servi en `application/javascript`. |
| Politique de sécurité du contenu | **Aucune violation** en navigateur ; un script en ligne de test a bien été **bloqué**. |
| Suite de tests après modifications | **480 tests, 480 verts, code de sortie 0.** |
| Filet d'erreurs d'exécution | Deux pannes simulées captées, journalisées, bandeau affiché. |
| Utilisateur du conteneur | `uid=101(nginx)` — **pas root**. |
| Sonde de disponibilité | `/healthz` → `200 ok`, état Docker `healthy`. |

## Fichiers de déploiement, à la racine du projet

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Image nginx non privilégiée. Port piloté par `PORT`, défaut 8081. |
| `.dockerignore` | Seconde barrière : rien d'autre que `index.html`, `css/`, `js/` n'entre dans l'image. |
| `railway.json` | Constructeur, chemin de la sonde, politique de redémarrage. |

## Avertissement de confidentialité

Des rapports d'entretien **nominatifs** et les documents de cadrage se trouvent
dans le dossier de travail. Ils ne sont **pas** dans l'image Docker — le
`Dockerfile` ne les copie pas et le `.dockerignore` les exclut — et ils
**partiraient dans un dépôt Git non filtré**. Le dépôt publié est donc construit
par extraction, depuis le poste, avec un garde-fou qui refuse la
publication si un motif interdit subsiste. Voir `02-deploiement-railway.md` § 2.
