# Observabilité et fiabilité

> **Le principe qui gouverne ce document : ne pas construire d'appareillage pour
> un POC statique.** Une pile de métriques, un agent de traces ou un service de
> collecte d'erreurs sur une démonstration sans serveur coûteraient plus en
> complexité qu'ils ne rapporteraient en information. Ce qui suit est donc
> volontairement court — et chaque renoncement est motivé.

---

## 1. Ce qu'on peut observer, et ce qu'on ne peut pas

L'architecture décide de l'observabilité avant nous. Zéro serveur applicatif,
zéro base, zéro appel réseau : il ne reste que deux sources.

| Source | Ce qu'elle donne | Où |
|---|---|---|
| **Journal d'accès nginx** | Requêtes, codes de retour, volumétrie, agent utilisateur | `docker logs b2f` en local ; onglet *Logs* de Railway en ligne |
| **Console du navigateur** | Erreurs JavaScript, avertissements de l'application | Poste du visiteur, **et nulle part ailleurs** |

**Ce qui est structurellement invisible**, et qu'aucun outillage ne rendra
visible sans changer l'architecture :

- **Ce que fait l'utilisateur.** Tout se passe dans son navigateur. Aucune action
  métier — déclaration, réservation, validation — ne produit la moindre requête.
  Le journal nginx montre le chargement de la page, puis plus rien.
- **Les erreurs des visiteurs.** Sans collecteur distant, une erreur survenue
  chez le commanditaire reste chez lui.
- **L'état des données.** Le LocalStorage de chaque visiteur est hors de portée.

> **C'est un choix d'architecture, pas un manque.** Y remédier supposerait un
> serveur de collecte, donc un traitement de données d'usage, donc une base
> juridique — pour une démonstration. Hors de proportion.

---

## 2. Ce qui a été mis en place

### 2.1 Un filet contre les erreurs silencieuses

**Le problème constaté.** Le démarrage de l'application était déjà protégé :
`demarrerApplication().catch(...)` affiche un écran de refus explicite si
l'amorçage échoue. En revanche, **aucun gestionnaire global** ne couvrait ce qui
survient **après** : un clic, une navigation, une promesse rejetée. Une exception
à ce moment laisse l'interface figée, sans message. Devant un commanditaire,
« l'écran ne répond plus » est le pire des diagnostics.

**Ce qui a été ajouté** — `js/core/sentinelle.js`, installé au tout début de
`demarrerApplication()` :

| Comportement | Détail |
|---|---|
| Capte les erreurs non rattrapées | `window.addEventListener('error', …, true)` |
| Capte les rejets de promesse | `window.addEventListener('unhandledrejection', …)` |
| Distingue les ressources manquantes | Un module ou une feuille de style qui ne se charge pas est nommé explicitement |
| Journalise | Préfixe `[B2F]` en console, repérable |
| Avertit sans bloquer | Bandeau en bas d'écran, `role="alert"`, compteur d'incidents, bouton **Recharger la page** |

**Ce qu'il ne fait pas, volontairement** : aucun envoi réseau, aucune télémétrie,
aucun service tiers. Le POC ne parle à personne — une sonde distante
contredirait sa politique de sécurité du contenu autant que la confidentialité
de la démonstration.

**Vérifié le 24/09/2026**, par deux pannes simulées dans un navigateur réel :

```
[B2F] Promesse rejetée sans traitement : Error: Panne simulee de promesse
[B2F] Erreur non rattrapée : Error: Panne simulee synchrone
```

→ bandeau affiché, compteur à 2, bouton de rechargement présent. Et sur le
parcours normal, **le bandeau ne se déclenche pas** : aucun faux positif.

### 2.2 Une sonde de disponibilité

`GET /healthz` → `200`, corps `ok`, sans journalisation, **sans dépendance au
contenu servi**. Elle répond même si `index.html` venait à manquer, ce qui est
précisément l'intérêt : elle teste le serveur, pas l'application.

Elle sert à deux choses : le `HEALTHCHECK` Docker en local (état `healthy`
constaté) et le contrôle de santé de Railway (`healthcheckPath` dans
`railway.json`).

### 2.3 Un échec franc plutôt qu'une dégradation confuse

Trois décisions vont dans le même sens — préférer une erreur lisible à un
fonctionnement approximatif :

| Décision | Sans elle |
|---|---|
| Un `.js` absent renvoie **404**, pas `index.html` | Le navigateur recevrait du HTML sous un type de script et signalerait une erreur de module incompréhensible |
| L'écran de refus au démarrage **nomme la cause** | Page blanche |
| Le bandeau d'incident propose **de recharger** | Interface figée sans issue |

---

## 3. Ce qu'il faut surveiller, et ce qui doit alerter

Pour une démonstration, la seule alerte qui mérite d'exister est **« le site ne
répond pas »**. Railway la fournit par son contrôle de santé et redémarre seul
(`ON_FAILURE`, dix tentatives).

| Signal | Où le lire | Seuil qui doit inquiéter |
|---|---|---|
| Disponibilité | Contrôle de santé Railway | Échec répété : le conteneur boucle au redémarrage |
| `404` dans le journal | Logs Railway | Un `404` sur un `.js` ou un `.css` = **livraison incomplète**, l'application est cassée pour tout le monde |
| `5xx` | Logs Railway | Anormal sur du statique. Signale un problème de plateforme |
| Redémarrages | Onglet Deployments | Plus de deux d'affilée : ne pas laisser en ligne |

**Aucune alerte par courriel ou messagerie n'est proposée**, et c'est délibéré.
Une démonstration n'a pas d'astreinte. Une alerte que personne ne traite à 3 h du
matin est du bruit, pas de l'observabilité. Le contrôle à faire est **avant**
chaque démonstration, pas en continu : ouvrir l'URL, vérifier que la console est
vierge.

---

## 4. Sauvegarde, restauration, reprise

| Question | Réponse |
|---|---|
| Que sauvegarder ? | **Rien côté serveur.** Aucune donnée n'y réside. |
| Comment restaurer ? | Redéployer. Le POC est reconstruit à l'identique depuis le `Dockerfile`, sans état à reprendre. |
| Et les données du visiteur ? | Elles sont dans son navigateur. Le jeu de démonstration se réamorce seul si le stockage est vide (`seed.js`). |
| Perte de données possible ? | Oui, **chez le visiteur** : vider le stockage du navigateur efface sa session de démonstration. Sans conséquence — rien de réel n'y est consigné. |

C'est le seul avantage d'exploitation réel de cette architecture, et il est
considérable : **il n'existe aucun scénario de perte de données en production.**

---

## 5. Risques d'exploitation — énoncés sans les adoucir

| # | Risque | Gravité | Traitement |
|---|---|---|---|
| **O1** | **Une démonstration lancée depuis une adresse IP en `http://` ne démarre pas.** `crypto.subtle` exige un contexte sécurisé. C'est le piège le plus probable. | **Élevée** | Documenté en `01-execution-locale.md` § 3. Écran de refus explicite. **Démontrer depuis `localhost` ou l'URL HTTPS.** |
| **O2** | **`python3 -m http.server` lancé à la racine sert les rapports d'entretien nominatifs.** | **Élevée** | Documenté. Préférer Docker, qui ne copie que trois répertoires. |
| **O3** | **Un dépôt Git public exposerait les documents de cadrage**, qui portent des constats sur un système tiers encore en service. | **Élevée** | Cadrage, journal de projet et rapports d'audit **hors du dépôt publié** ; garde-fou automatique avant chaque publication. Voir `02-deploiement-railway.md` § 2. |
| **O4** | **Une livraison incomplète casse l'application pour tous.** Un `.js` oublié → 404 → écran de refus. | Moyenne | `404` visible dans les journaux. Vérification après déploiement (§ 3 du document Railway). |
| **O5** | **Le POC est pris pour un produit fini** (risque R7 du cadrage), aggravé par une URL publique. | Moyenne | Bandeau de démonstration, données marquées, section « limites assumées ». |
| **O6** | **`js/vendor/` est un répertoire vide.** La documentation de projet annonce `anime.js` vendorisé ; l'application livrée **ne l'utilise pas** — seules les maquettes UX (`docs/ux/maquettes/vendor/`) l'embarquent. | Faible | **Constat, pas défaut** : l'application n'a aucune dépendance à l'exécution, ce qui est mieux. Le répertoire vide est un résidu à supprimer, et la mention à corriger dans les documents qui l'affirment. |
| **O7** | **Aucune visibilité sur les erreurs des visiteurs.** | Faible | Assumé (§ 1). Le filet de la § 2.1 rend l'erreur visible **au visiteur**, ce qui suffit pour une démonstration accompagnée. |

---

## 6. Ce qui serait nécessaire si le POC devenait un produit

À ne **pas** faire maintenant. Consigné pour que la question ne se repose pas à
zéro le jour où la refonte sera arbitrée.

| Besoin | Ce que cela suppose |
|---|---|
| Savoir ce que font les utilisateurs | Un serveur, donc une base, donc un traitement de données d'usage et sa base juridique |
| Collecter les erreurs | Un collecteur distant, une politique de rétention, et un assouplissement de la politique de sécurité du contenu |
| Métriques de latence et de saturation | N'a de sens qu'avec un serveur applicatif. Sur du statique servi par un CDN, la question ne se pose pas |
| Intégration continue | Un dépôt Git, puis un workflow exécutant `node --test tests/*.test.mjs` avant tout déploiement. **C'est la première chose à faire** le jour où le projet dépasse le POC : les 480 tests existent déjà, rien ne les exécute automatiquement |
| Traçabilité des actions | Le service d'audit existe déjà (`js/services/audit.service.js`) mais n'écrit qu'en LocalStorage |

**La seule de ces cinq lignes qui mériterait d'être avancée**, si le POC vit plus
de quelques semaines, est l'**intégration continue** : une suite de 480 tests que
personne n'exécute automatiquement finit par diverger du code qu'elle vérifie.
