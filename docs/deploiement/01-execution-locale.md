# Exécution locale de la démonstration

> Deux façons de lancer le POC : **avec Docker** (recommandé, reproductible) ou
> **sans Docker** (`python3 -m http.server`, pour un poste sans Docker installé).
> Les deux servent le même contenu ; elles ne se valent pas sur la sécurité.

---

## 1. Avec Docker — la voie recommandée

### 1.1 Les deux commandes

```bash
cd /Applications/MAMP/htdocs/POC_OIC/B2F
docker build -t b2f .
docker run --rm -p 8081:8081 b2f
```

Puis ouvrir **<http://localhost:8081>**.

Pour laisser tourner en arrière-plan et récupérer la main :

```bash
docker run -d --name b2f -p 8081:8081 b2f
docker logs -f b2f      # journal d'accès
docker stop b2f && docker rm b2f
```

### 1.2 Ce que fait l'image

| Aspect | Choix | Pourquoi |
|---|---|---|
| Base | `nginxinc/nginx-unprivileged:1.31-alpine` | Le processus maître tourne sous **UID 101**, pas root. `nginx:1.27-alpine`, retenu à la première livraison, était dépassé — la branche 1.31 est disponible. |
| Compilation | **Aucune** | Le POC est 100 % statique (écart E1). L'image ne fait que servir des fichiers. |
| Contenu copié | `index.html`, `css/`, `js/` | Rien d'autre. Ni `docs/`, ni `tests/`, ni les rapports d'entretien. |
| Port | `${PORT}`, défaut **8081** | Voir § 1.3. |
| Taille | **83,4 Mo** | À titre de comparaison, l'image du POC DUT pèse 177 Mo. |
| Construction à froid | **13,5 s** | Sans cache, `--no-cache`. |

### 1.3 Le port 8081 n'est pas décoratif

Le POC DUT occupe le **8080**. Deux applications servies sur la **même origine**
partagent le même LocalStorage : c'est le **risque R5** du cadrage, coté 9.

Deux barrières, indépendantes, sont en place :

1. **Le port** — `http://localhost:8080` et `http://localhost:8081` sont deux
   origines distinctes au sens du navigateur. Les stockages ne se voient pas.
2. **Le préfixe `b2f_`** — toutes les clés du POC le portent (`js/core/storage.js`).

**Vérifié le 24/09/2026** : les deux conteneurs lancés simultanément cohabitent
sans conflit.

```
dut-verif   0.0.0.0:8080->8080/tcp   Up
b2f-verif   0.0.0.0:8081->8081/tcp   Up (healthy)
```

Si le 8081 est déjà pris sur le poste, changer **le port hôte seulement** —
la seconde barrière reste active :

```bash
docker run --rm -p 8085:8081 b2f     # 8085 sur le poste, 8081 dans le conteneur
```

### 1.4 Ce que le serveur ajoute

Ces en-têtes sont servis sur **tous** les blocs, et ont été relevés sur la
réponse réelle :

| En-tête | Valeur | Effet |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'` + `object-src 'none'`, `frame-ancestors 'none'` | Le POC ne charge **aucune** ressource distante : la politique peut être stricte, **sans `'unsafe-inline'`**. |
| `X-Content-Type-Options` | `nosniff` | Pas d'interprétation d'un type deviné. |
| `Referrer-Policy` | `no-referrer` | L'URL de la démonstration ne fuit pas. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolation de la fenêtre. |
| `Permissions-Policy` | géoloc., caméra, micro, paiement, USB : **refusés** | Surface réduite. |
| `Cache-Control` | `no-cache, must-revalidate` | Les jeux de démonstration changent à chaque livraison. L'`ETag` évite de retransmettre l'inchangé. |
| `Server` | `nginx` (sans version) | `server_tokens off`. |

**Deux pièges de nginx ont été traités**, et méritent d'être connus de qui
modifiera ce fichier :

- Un bloc `location` qui déclare **un seul** `add_header` **annule tous** ceux
  hérités du bloc parent. Les en-têtes sont donc isolés dans un fragment,
  `/etc/nginx/b2f-securite.conf`, inclus par chaque bloc. Une source unique.
- `envsubst` remplacerait aussi les variables **de nginx** (`$uri`, `$host`) dans
  le gabarit. `NGINX_ENVSUBST_FILTER="PORT"` restreint la substitution à la seule
  variable voulue. Vérifié : `try_files $uri $uri/ /index.html` sort intact.

### 1.5 Compression

`gzip` est actif sur CSS, JS, SVG et JSON. Mesuré sur `js/app.js` :
**7 902 o → 2 678 o**, soit **−66 %**.

### 1.6 Sonde de disponibilité

`GET /healthz` renvoie `200` et le corps `ok`, sans journalisation et **sans
dépendre du contenu servi**. C'est la cible du `HEALTHCHECK` Docker et de la
sonde Railway.

```bash
curl -i http://localhost:8081/healthz    # 200, "ok"
docker inspect --format '{{.State.Health.Status}}' b2f   # healthy
```

### 1.7 Un fichier absent renvoie un vrai 404

Le bloc qui sert `.js`, `.css` et `.html` **ne porte pas** de `try_files`. Un
module manquant renvoie donc `404`, jamais du HTML sous un type MIME de script —
ce qui produirait une erreur de module illisible en console.

```
/js/app.js      -> 200
/js/absent.js   -> 404      (et non 200 text/html)
/route-spa      -> 200      (repli sur index.html : le routage est par fragment)
```

---

## 2. Sans Docker — `python3 -m http.server`

C'est la voie de repli, et celle qu'emploie le POC DUT dans son propre
`Dockerfile`. Elle demande **Python 3** et rien d'autre.

```bash
cd /Applications/MAMP/htdocs/POC_OIC/B2F
python3 -m http.server 8081
```

Puis ouvrir **<http://localhost:8081>**.

**Ce qu'on perd**, et il faut le savoir :

| Perdu | Conséquence |
|---|---|
| Tous les en-têtes de sécurité | Ni CSP, ni `nosniff`, ni `Referrer-Policy`. Acceptable sur un poste, **jamais en ligne**. |
| La compression | Les 504 Ko de JS partent non compressés. Sans effet sur `localhost`. |
| Le repli de page unique | Sans objet ici : le routage se fait par **fragment d'URL** (`#/...`), que le serveur ne voit jamais. |
| La sonde `/healthz` | Absente. |
| **Le cloisonnement du dossier** | **`http.server` sert le répertoire entier** — `docs/`, `tests/`, et **les deux rapports d'entretien nominatifs de la racine**. |

> **Le dernier point est le plus sérieux.** Lancée depuis la racine du projet,
> cette commande expose `http://localhost:8081/RAPPORT%20DE%20CAPTATION...md` à
> quiconque atteint le poste. Sur une machine personnelle, le risque est faible.
> **Sur un réseau d'entreprise ou en démonstration chez le client, ne pas
> l'utiliser** : préférer Docker, qui ne copie que trois répertoires.

---

## 3. Le point qui casse une démonstration : le contexte sécurisé

Le POC hache les mots de passe avec **Web Crypto** (`crypto.subtle`,
`js/core/crypto.js`), à la place d'un condensat rapide sans sel. Or
`crypto.subtle` **n'existe que dans un contexte sécurisé**.

| Adresse d'accès | Contexte sécurisé ? | La démonstration |
|---|---|---|
| `http://localhost:8081` | **Oui** (exception loopback) | fonctionne |
| `http://127.0.0.1:8081` | **Oui** (exception loopback) | fonctionne |
| `https://…up.railway.app` | **Oui** (TLS) | fonctionne |
| **`http://192.168.x.x:8081`** | **NON** | **échoue au démarrage** |
| `file:///…/index.html` | Non | échoue au démarrage |

> **Conséquence pratique.** Montrer le POC depuis un autre poste du réseau local,
> en tapant l'adresse IP de la machine hôte, **ne marchera pas**. C'est le piège
> le plus probable d'une démonstration OIC. Deux issues : projeter depuis la
> machine qui héberge (`localhost`), ou passer par l'URL Railway en HTTPS.

L'application ne tombe pas en silence : elle affiche un écran de refus explicite
qui nomme la cause et indique l'adresse à utiliser (`js/app.js`).

---

## 4. Tests

Le verdict est le **code de sortie**, jamais une lecture de la sortie.

```bash
node --experimental-default-type=module --test tests/*.test.mjs
```

Au 24/09/2026, après les modifications de déploiement : **480 tests, 480 verts,
0 échec, code de sortie 0.** La commande exacte importe — `node --test tests/`
sur le répertoire échoue (finding S16 de l'audit de sécurité).
