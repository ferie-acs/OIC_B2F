# Mise en ligne sur Railway — procédure préparée

> ## ⚠️ AUCUN DÉPLOIEMENT N'A ÉTÉ EFFECTUÉ
>
> Tout ce qui suit est **prêt et vérifié localement**. Rien n'a été poussé,
> publié ni rendu accessible en ligne. Mettre ce POC en ligne crée une **URL
> publique** portant le nom de l'OIC : c'est une action à conséquence, qui
> appartient au commanditaire, pas à l'outillage.
>
> **Les commandes de la § 3 sont à exécuter par une personne, après accord.**

---

## 1. Ce qui a été aligné sur le POC DUT

Le POC frère est en ligne à <https://oic-dut-production.up.railway.app/>. Sa
démarche a été reprise, et les écarts sont justifiés ci-dessous.

| Point | DUT | B2F | Motif de l'écart |
|---|---|---|---|
| Plateforme | Railway | Railway | — |
| Construction | `Dockerfile` à la racine, détecté par Railway | Idem | — |
| Dépôt | GitHub, dépôt dédié | GitHub `ferie-acs/OIC_B2F`, **documents internes exclus** (§ 2) | Le POC est publiable ; le cadrage et les rapports d'entretien ne le sont pas. |
| Port | `python3 -m http.server ${PORT:-8080}` | nginx, `listen ${PORT}`, défaut 8081 | **Même principe, serveur différent.** `http.server` est un serveur de développement : il ne pose aucun en-tête de sécurité et sert le répertoire entier. Pour une URL publique au nom de l'OIC, nginx est le choix défendable. |
| Image | `python:3.12-alpine`, 177 Mo | `nginx-unprivileged:1.31-alpine`, **83,4 Mo** | Plus petite, non root. |
| Fichier `railway.json` | Absent (tout est réglé dans l'interface) | **Présent** | Le réglage de la sonde et de la politique de redémarrage devient versionné et relisible, au lieu de vivre uniquement dans une console web. |
| Secrets | Aucun | **Aucun** (§ 4) | — |

### La contrainte qui aurait fait échouer le déploiement

Le `Dockerfile` livré au jalon J5 écoutait **8081 en dur**. Railway **injecte la
variable `PORT`** à l'exécution et attend que l'application écoute dessus — c'est
exactement ce que fait le DUT avec `${PORT:-8080}`. Une directive `listen` figée
aurait produit un conteneur sain en apparence et un **contrôle de santé en échec**,
donc un déploiement en boucle de redémarrage.

**Corrigé et vérifié** : `PORT=3000` injecté → nginx écoute réellement
`listen 3000;`, et la page répond.

---

## 2. Avant toute mise en ligne — ce qui ne quitte jamais le poste

Le dossier de travail contient trois catégories de documents qui **ne doivent
figurer dans aucun dépôt publié** :

| Document | Nature |
|---|---|
| Rapports d'entretien (racine, `.docx.md`) | **Nominatifs** — données personnelles d'agents identifiés |
| `docs/gestion-projet/` (cadrage, journal) | Constats de sécurité sur un système tiers **encore en service** |
| `docs/securite/` | Audit de la matrice des rôles, reprenant ces constats |

Ces fichiers **n'entrent pas dans l'image Docker** : le `Dockerfile` ne copie que
`index.html`, `css/`, `js/` et `assets/`, et le `.dockerignore` les exclut en
seconde barrière. **Mais ils partiraient dans un dépôt Git non filtré.**

> **Règle.** Le dépôt publié est construit par extraction, jamais par poussée du
> dossier entier. Les rapports nominatifs sont dans `.gitignore` ; le cadrage, le
> journal et l'audit sont exclus à la construction ; un garde-fou refuse la
> publication si un motif interdit subsiste dans l'arborescence produite.

Deux voies pour Railway, au choix :

- **Dépôt GitHub** — déploiement à chaque poussée. La visibilité et le filtrage
  se vérifient **avant** la première poussée, pas après.
- **Sans dépôt** — `railway up` téléverse le dossier courant depuis le poste. Le
  `.dockerignore` s'applique, donc les documents internes ne montent pas. Pas
  d'historique, pas de déploiement continu : acceptable pour un POC.

---

## 3. La procédure, à exécuter après accord

La CLI Railway est présente sur le poste (`railway 5.58.0`).

```bash
cd /Applications/MAMP/htdocs/POC_OIC/B2F

railway login                 # ouvre le navigateur
railway init                  # nommer le projet, p. ex. « oic-b2f »
railway up                    # construit le Dockerfile et déploie
railway domain                # génère l'URL publique en .up.railway.app
```

L'URL attendue est de la forme `https://oic-b2f-production.up.railway.app/`,
par symétrie avec celle du DUT.

### Ce que `railway.json` règle sans intervention

```json
{
  "build":  { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "numReplicas": 1,
    "sleepApplication": false
  }
}
```

| Réglage | Raison |
|---|---|
| `healthcheckPath: /healthz` | Railway attend une réponse avant de basculer le trafic. La sonde ne dépend pas du contenu servi. |
| `restartPolicyType: ON_FAILURE` | Un conteneur qui tombe redémarre, au plus dix fois. Au-delà, c'est un défaut à corriger, pas à masquer. |
| `numReplicas: 1` | Un POC de démonstration. Aucune raison d'en payer deux. |
| `sleepApplication: false` | Une démonstration OIC ne doit pas répondre en plusieurs secondes parce que l'instance dormait. À rebasculer sur `true` si le coût devient un sujet — voir § 5. |

### Vérifications à faire juste après le déploiement

```bash
curl -I  https://<URL>/                 # 200, et les en-têtes de sécurité
curl -i  https://<URL>/healthz          # 200, "ok"
curl -I  https://<URL>/js/app.js        # application/javascript
```

Puis, dans un navigateur : ouvrir la console, se connecter avec un compte de
démonstration, dérouler le fil narratif. **Zéro erreur en console** est le
critère — c'est ce qui a été constaté en local.

---

## 4. Secrets et variables : il n'y en a pas

| Question | Réponse |
|---|---|
| Variables d'environnement à définir ? | **Aucune.** `PORT` est fournie par Railway. |
| Secrets, clés d'API, jetons ? | **Aucun.** Le POC n'a pas de serveur, pas de base, pas d'appel réseau. |
| Base de données à provisionner ? | **Aucune.** Les données vivent dans le LocalStorage du visiteur. |
| Certificat TLS ? | Fourni par Railway sur le domaine `.up.railway.app`. |

**Vérification indépendante.** Une recherche exhaustive a été menée sur
l'intégralité du dossier B2F pour détecter toute reprise de secret ou de donnée
réelle depuis le système analysé au cadrage : identifiants de base, adresses de
serveur, comptes de messagerie, empreintes de mots de passe, adresses et
téléphones réels, chemins en dur.

> **Résultat : aucune fuite.** Aucun secret dans le code. Les adresses de
> démonstration utilisent des domaines réservés (`.invalid`, RFC 2606) et les
> téléphones des préfixes non attribués. Les références au système analysé
> n'existent qu'en **commentaires de traçabilité** et dans les documents
> d'analyse non publiés — jamais comme données.

---

## 5. Ce qu'il faut savoir avant de publier

Quatre points qui ne sont pas des défauts, mais des conséquences de la mise en
ligne. Ils appellent une décision, pas un correctif.

### 5.1 L'URL sera publique et sans authentification réelle

Les comptes de démonstration et leur mot de passe sont **affichés sur l'écran de
connexion** — c'est voulu pour une démonstration. En ligne, cela signifie que
**quiconque connaît l'URL utilise le POC**. Il n'y a rien à voler : les données
sont fictives et locales au navigateur du visiteur. Mais l'application porte le
nom de l'OIC.

Si une restriction est souhaitée, la trancher **avant** publication : Railway
n'offre pas de protection par mot de passe en standard sur un service statique.
La voie simple est de ne pas diffuser l'URL au-delà du cercle prévu.

### 5.2 Chaque visiteur a ses propres données

Le LocalStorage est **propre à chaque navigateur**. Deux conséquences :

- Ce qu'un présentateur saisit pendant une démonstration **n'est visible que sur
  sa machine**. Une session partagée à plusieurs postes n'est pas une session
  commune.
- Un visiteur en navigation privée repart d'un jeu vierge à chaque ouverture.

Ce n'est pas un défaut du déploiement : c'est l'architecture du POC (aucun
serveur). Cela doit être **dit en démonstration**, sans quoi le commanditaire
peut croire à une perte de données.

### 5.3 Le bandeau « démonstration » doit rester

Le risque **R7** du cadrage — « le POC est pris pour un produit fini » — devient
nettement plus concret avec une URL publique qu'avec un conteneur local.

### 5.4 Coût

Un service statique, une réplique, pas de base de données : c'est le poste le
moins coûteux de Railway, facturé à la consommation. `sleepApplication: false`
maintient l'instance éveillée — c'est un choix de confort de démonstration. Si le
POC doit rester en ligne des mois sans usage, basculer sur `true` et accepter
quelques secondes au premier accès.

---

## 6. Retour arrière

| Situation | Geste |
|---|---|
| La version déployée est mauvaise | Railway conserve les déploiements précédents : **redéployer la version antérieure** depuis l'onglet Deployments. C'est immédiat, aucune reconstruction. |
| Le service doit disparaître | Supprimer le service dans Railway. L'URL cesse de répondre. |
| Doute sur ce qui est en ligne | `railway status`, puis comparer l'empreinte du commit ou du téléversement. |

Le retour arrière ne comporte **aucun risque de perte de données** : il n'y a pas
de données côté serveur. C'est le seul avantage réel de cette architecture en
exploitation, et il est considérable.
