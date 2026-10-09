# Guide de démonstration — Bourse de Fret (B2F) devant l'OIC

> **Pour qui** : la personne qui présente le POC — pas un développeur. Aucune
> connaissance du code n'est nécessaire.
> **Durée** : environ 25 minutes de démonstration, 10 minutes de questions.
> **Auteur** : agent `redacteur-technique`, 24 septembre 2026.
>
> Tout ce qui figure ici a été vérifié dans le code et dans les rapports de
> qualité et de sécurité du projet. Les phrases en encadré sont des **propositions
> de formulation**, pas des obligations.

---

## 0. Avant d'entrer dans la salle — préparation (5 minutes)

**Lancer l'application :**

```bash
cd /Applications/MAMP/htdocs/POC_OIC/B2F
python3 -m http.server 8081
```

Puis ouvrir **<http://localhost:8081/>**.

**Liste de contrôle :**

- [ ] L'écran de connexion s'affiche avec ses cinq boutons de rôle.
- [ ] **Repartir d'un stockage vierge** : ouvrir la page en navigation privée,
      ou vider le stockage du site dans les outils de développement. Une
      démonstration jouée deux fois sur le même stockage part d'un état déjà
      consommé.
- [ ] Ne **pas** servir l'application sur le port 8080 : c'est celui du POC DUT,
      et les deux se marcheraient dessus.
- [ ] Ne **pas** ouvrir `index.html` par double-clic — l'application refusera de
      démarrer, et c'est normal.
- [ ] Prévoir un second onglet déjà ouvert : les changements de rôle sont
      fréquents.

**Aucune connexion Internet n'est nécessaire.** L'application n'a aucune
dépendance externe : pas de CDN, pas de bibliothèque tierce. C'est un argument à
mentionner si la salle a un réseau capricieux — et un point de sécurité à
revendiquer.

**Mot de passe unique de tous les comptes : `demo2026`.**
Les boutons de l'écran de connexion remplissent et soumettent le formulaire ;
ils ne contournent pas l'authentification. Si on vous le demande : les mots de
passe sont hachés en PBKDF2-SHA256, 120 000 itérations, avec un sel par compte.

---

## 1. Ouvrir — ce qu'on démontre, et ce qu'on ne démontre pas (2 min)

> « Ce que vous allez voir n'est pas une maquette : c'est une application qui
> fonctionne, avec des règles métier réelles et 480 tests automatisés qui les
> vérifient. Ce n'est pas non plus un produit : il n'y a pas de serveur, les
> données vivent dans le navigateur, et il n'y a aucune donnée réelle de la
> Bourse de Fret — tout est inventé et marqué DÉMO. »

> « Ce POC ne conçoit pas un produit à partir de rien. Il démontre la **refonte
> d'une application qui existe déjà** et qui compte environ 250 écrans. Les
> statuts, les entités, le modèle économique lui sont fidèles. Quatre écarts sont
> délibérés, et je vous les signalerai au passage. »

**Si le public n'est pas familier du métier de la bourse de fret**, commencer par
la page pédagogique `docs/ux/maquettes/b2f-comprendre.html` (environ 10 minutes) :
le problème du retour à vide, les acteurs, une simulation du parcours en sept
étapes, le modèle économique, six idées reçues, un quiz. Démontrer un logiciel à
qui ignore le métier ne prouve rien.

---

## 2. Le parcours principal — le fil narratif (12 min)

C'est le cœur de la démonstration. Il se joue avec **`affreteur@demo.invalid`** et
**`transporteur@demo.invalid`**.

> ⚠️ **Ne jouez pas le parcours avec `affreteur2@demo.invalid`.** Ce compte
> appartient au groupement dont l'abonnement est expiré : il ouvre sur « Accès
> suspendu ». C'est voulu — il sert le cas d'échec du § 3 — mais ce n'est pas le
> compte du parcours nominal.

### Acte 1 — L'affréteur déclare son fret (2 min)

Connexion **Affréteur** → `Mon fret` → `Nouvelle déclaration` → assistant en
3 étapes : provenance et destination, dates et caractéristiques du véhicule
souhaité, lignes de marchandise.

> « L'affréteur a du fret à faire transporter. Il déclare d'où il part, où il va,
> ce qu'il transporte, et quel type de véhicule il lui faut : capacité,
> carrosserie, nombre d'essieux. Ce sont exactement les champs de l'application
> existante. »

### Acte 2 — Le marché, et ce que la plateforme vend (2 min)

`Marché` → `Rechercher un véhicule` → filtrer → ouvrir le détail d'une offre.

> **C'est le point le plus important à faire remarquer.**
> « Regardez ce que l'écran ne montre pas : aucun numéro de téléphone, aucun nom
> de chauffeur, aucune coordonnée. On voit le trajet, la capacité, la
> disponibilité, le prix déclaré — mais pas comment joindre le transporteur.
> **C'est précisément ce que la plateforme vend** : la mise en relation. Si les
> coordonnées étaient visibles ici, la plateforme n'aurait aucun modèle
> économique. »

### Acte 3 — La réservation (1 min)

`Réserver` sur l'offre, rattachée à une de ses demandes.

> « La réservation est **gratuite**. Rien n'est débité à cette étape, et rien
> n'est encore transmis. »

### Acte 4 — Le transporteur répond (1 min)

Se déconnecter → connexion **Transporteur** → `Réservations reçues` → `Accepter`.

> « Deuxième acteur, deuxième décision. Personne ne se voit imposer un partenaire :
> c'est une **double validation**. Le transporteur peut aussi rejeter — et dans ce
> cas le motif est obligatoire. »

À faire remarquer au passage :

> « Notez le libellé du statut : côté transporteur, il lit "en attente de votre
> réponse". Côté affréteur, le même statut lisait "en attente de la réponse du
> transporteur". La valeur stockée est la même — nous sommes fidèles au système
> existant — mais un statut doit dire au lecteur **ce qu'il a à faire**. »

### Acte 5 — L'écran pivot : la validation (3 min)

Reconnexion **Affréteur** → `Mises en relation` → `À valider`.

**Ne cliquez pas tout de suite. Montrez l'écran.**

> « C'est l'écran le plus important du POC. Avant de valider, l'affréteur voit :
> les deux montants qui seront débités — 15 000 F pour lui, 15 000 F pour le
> transporteur — le solde de **son** compte, et ce qu'il deviendra après
> l'opération. Il n'y a pas de boîte "Êtes-vous sûr ?" qui masquerait les
> montants : dans ce métier, valider *est* une transaction. »

**Puis le point de cloisonnement, à souligner :**

> « De la contrepartie, l'écran ne dit que "compte provisionné" — jamais un
> montant. Le transporteur est souvent un fournisseur, parfois le partenaire d'un
> concurrent : sa trésorerie ne regarde pas l'affréteur. L'affréteur a besoin de
> savoir si la validation aboutira, pas de connaître le solde d'un tiers. »

> **Si on vous demande pourquoi** : c'est un arbitrage explicite du projet. La
> conception initiale demandait d'afficher les deux soldes ; la matrice de droits
> l'interdisait. Les deux ne pouvaient pas être justes en même temps. La
> résolution retenue affiche les **frais du dossier** — qui ne sont pas des
> soldes — et remplace le solde de la contrepartie par un indicateur binaire.

### Acte 6 — Valider : le double débit et la mise en relation (2 min)

`Valider`.

> « Trois choses viennent de se passer en une seule opération indivisible : les
> deux comptes sont débités, le transport est créé, et **les coordonnées sont
> transmises**. »

Montrer la fiche : véhicule, chauffeur, contacts, désormais visibles.

> « La mise en relation est effective. C'est le moment précis où la plateforme
> rend son service et où elle se rémunère. »

**Le point technique qui vaut d'être dit :**

> « Ce double débit est **atomique** : soit les deux écritures passent, soit
> aucune. L'audit de sécurité avait reproduit un cas où deux validations
> simultanées faisaient disparaître un débit. C'est corrigé, et la qualité l'a
> réattaqué jusqu'à sept écrans de validation ouverts en même temps et trois
> onglets réels : une seule validation aboutit. »

### Acte 7 — Le suivi et la clôture (1 min)

Connexion **Transporteur** → `Suivi` → faire avancer les étapes.
Puis reconnexion **Affréteur** → `Clôturer` après livraison.

> « Le transport avance en six étapes : validé, à quai, chargé, en route, livré,
> clôturé. Aucun saut d'étape, aucun retour en arrière, et chaque événement porte
> son auteur et sa date. »

> **À signaler honnêtement** : « Ces six étapes sont un **apport de ce POC**. Le
> système existant ne les formalise pas — son champ d'état est flou. C'est une
> proposition, pas une reproduction. »

---

## 3. Les cas d'échec — c'est là que le cloisonnement se voit (6 min)

Un POC qui ne montre que le chemin heureux ne prouve rien. Ces quatre cas sont
préinstallés dans le jeu de démonstration : **ils ne sont pas simulés**.

### 3.1 L'auxiliaire ne valide pas (2 min) — *le plus parlant*

Connexion **`auxiliaire@demo.invalid`** → aller sur `À valider` → le bouton
`Valider`.

> « Cet utilisateur est un sous-compte : il agit pour le compte de son entreprise.
> Il peut déclarer, réserver, annuler — mais il ne peut pas valider. Regardez le
> bouton : il n'est **pas caché**, il est désactivé, et l'écran **écrit pourquoi**.
> Un bouton absent se lit comme un défaut du logiciel ; un bouton désactivé avec
> son motif enseigne la règle. »

**Et le point de fond :**

> « Le message ne dit pas "il vous manque le droit appariement.valider". Il donne
> la **raison métier** : valider engage les finances de l'entreprise, et un
> auxiliaire n'engage pas les finances de son parent. »

> **Honnêteté** : « Cette limite est une **proposition de ce POC**. Le système
> existant ne la pose pas. »

### 3.2 Le solde insuffisant (1 min)

Avec l'**Affréteur**, réserver un véhicule de **Routière du Centre** (`grp-tra-2`),
puis aller jusqu'à l'écran de validation.

> « Ce transporteur a 5 000 F sur son compte, et la mise en relation lui coûte
> 15 000 F. La validation est refusée — et elle est refusée **avant** le clic :
> l'écran annonçait que la contrepartie n'était pas provisionnée. Notez qu'il ne
> chiffre pas le manque : le dire livrerait le solde par soustraction. »

### 3.3 L'abonnement expiré (1 min)

Se déconnecter → connexion **`affreteur2@demo.invalid`**.

> « Accès suspendu. Le groupement n'est plus à jour de son abonnement, et aucun
> écran métier ne lui est accessible — c'est le comportement du système existant,
> reproduit fidèlement. Un seul écran reste ouvert : celui de l'abonnement,
> sinon l'utilisateur serait enfermé sans pouvoir comprendre ni agir. »

### 3.4 L'URL devinée (2 min) — *le cloisonnement rendu visible*

Rester connecté en **DGTTC** (ou en Auxiliaire) et saisir dans la barre d'adresse
une route d'un autre espace, par exemple `#/concessionnaire/comptes`.

> « L'écran nomme le rôle, le droit manquant, et explique pourquoi l'accès est
> refusé. Le cloisonnement ne se devine pas par l'absence d'un menu : il se
> **voit**. »

> « Ce cas a été attaqué par la qualité en adversarial : sept marqueurs de
> données cherchés sur quatre rôles différents. Rien ne sort. Et pour deux rôles,
> le refus est posé par le service **avant même** que l'écran ne s'exécute : deux
> verrous en série, pas un. »

---

## 4. Les rôles d'autorité — Concessionnaire et DGTTC (4 min)

### 4.1 Le Concessionnaire — l'exploitant (2 min)

Connexion **`concessionnaire@demo.invalid`** → `Groupements`, `Comptes`,
`Tarifs`, `Utilisateurs et rôles`, `Journal d'audit`.

> « L'exploitant de la plateforme voit les groupements inscrits, les soldes de
> tous les comptes, et peut créditer manuellement — ce qui remplace ici
> l'intégration de paiement mobile, hors périmètre du POC. Il fixe aussi les
> tarifs du service. »

**L'écran `Utilisateurs et rôles` mérite un arrêt :**

> « C'est la matrice des droits rendue visible. 19 rôles, 47 droits. Et surtout :
> **c'est la seule source** de ce que chacun peut faire. Dans l'application
> existante, le contrôle d'accès est dispersé dans le routage et dans les écrans,
> sans table centrale — c'est l'un des quatre écarts que nous proposons. »

**Le point de moindre privilège, à mentionner :**

> « Notez ce que le concessionnaire **ne peut pas** faire : il n'a aucun accès au
> marché — il ne cherche pas, ne publie pas, ne réserve pas — et il ne lit pas
> les coordonnées privées des transporteurs. Un exploitant qui lirait l'annuaire
> complet de son propre marché pourrait le concurrencer. »

### 4.2 La DGTTC — le contrôleur (2 min)

Connexion **`dgttc@demo.invalid`** → `États de contrôle`, `Acteurs`, `Parc`,
`Journal d'audit`.

> « La DGTTC est une autorité de contrôle, distincte de l'OIC. Elle voit
> l'activité : les acteurs, le parc, les mises en relation, les corridors. »

**Puis le point fort :**

> « Et elle ne voit **aucun montant**. Ni solde, ni tarif, ni frais. Pas parce
> qu'on les a masqués à l'affichage, mais parce que les champs financiers sont
> **absents des données qui lui sont servies**. Un contrôleur qui pourrait agir
> sur ce qu'il contrôle — ou lire la trésorerie de ceux qu'il contrôle — n'en
> serait plus un. Exploitant et contrôleur ne sont jamais fusionnés en un
> "administrateur OIC" générique : c'est un arbitrage explicite du projet. »

### 4.3 Si le temps le permet — les rôles de niveaux 2 et 3 (1 min)

Connexion **`caisse@demo.invalid`** (rôle `agent_caisse`, niveau 3).

> « Les 19 rôles sont tous dans le POC, sur trois niveaux. Six sont pleinement
> démontrés, trois sont déclinés de l'espace Transporteur, et dix — les profils
> de back-office : caisse, comptabilité, contentieux, supervision — sont
> déclarés dans la matrice et administrables, **avec leur menu généré depuis
> leurs seuls droits**, mais sans écran métier : la caisse et le contentieux sont
> hors du périmètre de cette démonstration. »

---

## 5. Les questions qui viendront — et les réponses honnêtes

**Ne minimisez rien.** Un POC qui laisse croire davantage qu'il ne démontre est
un passif, pas un actif. Chacune de ces réponses est vérifiée.

### « Est-ce que c'est sécurisé ? »

> « Non, et ce n'est pas ce que ce POC démontre. Il n'y a pas de serveur : les
> données vivent dans le navigateur, où elles sont lisibles et modifiables en
> trois clics dans les outils de développement. Ce que nous démontrons, c'est que
> la règle d'autorisation est **écrite en un point unique, lisible et testée** —
> pas qu'elle est appliquée. »

> « Sa valeur tient à ce que ces règles sont des fonctions pures, sans accès aux
> données : elles se transposent côté serveur telles quelles. Mais — et c'est la
> condition — **ce portage n'a de valeur que si la décision est rejouée à chaque
> requête serveur**. Laisser la décision au client reproduirait le défaut de
> l'application actuelle avec un code plus élégant. »

### « Et les mots de passe ? »

> « Le POC utilise PBKDF2 avec sel, là où un condensat rapide sans sel se casse
> par table précalculée. Mais les empreintes restent dans le navigateur : c'est
> une démonstration de la bonne pratique, pas une protection. »


### « Est-ce que ça marchera vraiment ? Est-ce que les transporteurs l'utiliseront ? »

> « Ce POC ne le prouve pas, et aucun logiciel ne le prouverait. Une bourse de
> fret vit de sa **liquidité** : s'il n'y a pas de fret, les transporteurs ne
> viennent pas ; s'il n'y a pas de transporteurs, les chargeurs ne viennent pas.
> C'est un problème d'animation de marché et de mobilisation de la profession,
> pas un problème logiciel. »

### « Est-ce que ça tiendra la charge ? »

> « Aucune volumétrie n'est connue, aucune charge n'a été simulée. Nous ne
> pouvons pas répondre, et nous ne l'affirmerons pas. »

### « Est-ce que c'est le workflow réel des transporteurs ? »

> « C'est le workflow **réellement implémenté dans l'application existante** —
> nous l'avons lu dans le code, qui fait foi. Que ce workflow corresponde aux
> pratiques effectives de la profession, et qu'il soit réellement utilisé
> aujourd'hui, reste à établir. C'est une question de terrain, pas de logiciel. »

### « Et le lien avec le DUT ? »

> « Il n'est pas reproduit ici. Et il faut corriger une idée répandue : dans le
> système existant, le DUT et la Bourse de Fret **partagent une seule base de
> données**, avec une jointure directe entre les deux. Ce n'est pas une
> passerelle entre deux applications : c'est une application unique à deux
> métiers. Les rapports d'entretien affirment l'inverse ; le code dit autre
> chose. La génération du DUT depuis une mise en relation est prévue au jalon
> suivant. »

### « Qu'est-ce qui reste à faire ? »

> « Le cœur transactionnel est livré et validé. Restent les tableaux de bord de
> supervision étendus, les notifications, la génération du DUT et l'abonnement
> complet — c'est le périmètre des jalons 4 et 5. »

### « Est-ce que ça a été testé ? »

> « 480 tests automatisés, tous verts. Mais surtout : le code a été attaqué par
> une campagne de qualité **adversariale**, dont l'objet était de le casser, pas
> de confirmer qu'il marche. Elle a trouvé 21 défauts, dont 3 bloquants — et elle
> a rendu un NO-GO. Les défauts ont été corrigés, puis **réattaqués** par des
> chemins que les tests du développeur ne couvraient pas. C'est cette seconde
> campagne qui a rendu le GO. Deux défauts mineurs restent ouverts, et ils sont
> écrits dans la documentation. »

### « Et si on me demande de montrer un bug ? »

Deux sont connus, documentés, et vous pouvez les montrer sans gêne :

- Trois clics sur le bouton d'un écran devenu périmé empilent trois messages
  identiques au lieu d'un (cosmétique).
- L'écran de blocage sur données corrompues affiche un paragraphe hors sujet.

> « Ils sont inscrits au README avec leur cause. Nous préférons une liste de
> défauts connus à une démonstration qui prétend n'en avoir aucun. »

---

## 6. Aide-mémoire — tous les comptes

Mot de passe unique : **`demo2026`**

| Adresse | Rôle | Usage en démonstration |
|---|---|---|
| `affreteur@demo.invalid` | Affréteur | **Parcours principal** |
| `transporteur@demo.invalid` | Transporteur | **Parcours principal** |
| `auxiliaire@demo.invalid` | Auxiliaire d'affréteur | Cas d'échec : ne valide pas |
| `concessionnaire@demo.invalid` | Concessionnaire | Exploitation, matrice des rôles |
| `dgttc@demo.invalid` | DGTTC | Contrôle sans donnée financière |
| `auxtransport@demo.invalid` | Auxiliaire de transporteur | Le second auxiliaire : n'accepte pas |
| `affreteur2@demo.invalid` | Affréteur (Coton Nord) | **Abonnement expiré** — accès suspendu |
| `transporteur2@demo.invalid` | Transporteur (Routière du Centre) | Solde insuffisant : 5 000 F pour 15 000 F |
| `partenaire@demo.invalid` | Partenaire (niveau 2) | Décliné de l'espace Transporteur |
| `caisse@demo.invalid` | Agent de caisse (niveau 3) | Espace minimal, menu généré |

**Montants du jeu de démonstration :** frais de mise en relation **15 000 F CFA
par partie**, abonnement annuel **150 000 F CFA**. Crédits initiaux : 200 000 F
(Cacao Lagunes), 50 000 F (Coton Nord), 120 000 F (Trans Lagunes), 5 000 F
(Routière du Centre). Deux dossiers complets sont préinstallés : les soldes
affichés en tiennent déjà compte.

**Toutes ces données sont inventées et marquées DÉMO.** Aucune n'est extraite du
système existant, qui contient des données d'exploitation réelles. Les adresses
utilisent le domaine réservé `.invalid`, les numéros un préfixe non attribué —
et un test le vérifie.

---

## 7. En cas de problème pendant la démonstration

| Symptôme | Cause probable | Geste |
|---|---|---|
| « La démonstration n'a pas pu démarrer » | Page ouverte en `file://`, ou stockage corrompu | Servir depuis `http://localhost:8081`. Si le message parle de `file://` alors que vous êtes bien sur localhost, la cause est une donnée corrompue : **vider le stockage du site** et recharger. *(Ce message trompeur est le défaut R2, connu et documenté.)* |
| L'application s'affiche sans style | Fichiers CSS non servis | Vérifier que vous servez bien depuis la racine du dossier `B2F/` |
| Les données sont déjà consommées | Démonstration déjà jouée sur ce navigateur | Vider le stockage du site, ou passer en navigation privée |
| Un écran semble vide | Le rôle connecté n'y a pas droit | C'est probablement le comportement attendu — profitez-en pour montrer le refus explicite |
| Une action reste sans effet | Étape du workflow non atteinte | Vérifier l'état du dossier : on ne valide pas avant acceptation, on ne clôture pas avant livraison |

---

## 8. Pour aller plus loin

| Document | Contenu |
|---|---|
| [`../../README.md`](../../README.md) | Vue d'ensemble, lancement, limites assumées |
| [`../ux/maquettes/b2f-comprendre.html`](../ux/maquettes/b2f-comprendre.html) | Page pédagogique pour public non initié au métier |
| [`../architecture/03-matrice-des-roles.md`](../architecture/03-matrice-des-roles.md) | Les 19 rôles et la matrice complète des droits |
| [`../securite/audit-matrice-roles.md`](../securite/audit-matrice-roles.md) | L'audit de sécurité et ses 16 findings |
| [`../qa/02-contre-verification-correctifs.md`](../qa/02-contre-verification-correctifs.md) | La contre-vérification qui a rendu le GO |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Ce qui est livré, ce qui reste |
