# Modèle de données — POC B2F

> **Jalon J1 — conception technique.** Auteur : agent `senior-fullstack`,
> 24 septembre 2026.
> Code correspondant : `js/domain/schema.js`, `js/domain/enums.js`,
> `js/core/storage.js`. **Le code fait foi ; ce document l'explique.**
>
> Entrées : `docs/gestion-projet/{cadrage,plan-suivi}.md`, `docs/ux/*`, et le
> code de l'application existante analysée au cadrage.
> Le dump `script.sql` (2023) est périmé et n'a **pas** servi de référence
> (décision D18).

---

## 1. Les seize entités

Toutes les collections sont préfixées `b2f_` — le préfixe est appliqué par
`cleDe()` dans `js/core/storage.js` et **nulle part ailleurs**, ce qui rend la
parade du risque R5 vérifiable en lisant une seule fonction.

| Collection | Entité existante | Rôle dans le POC |
|---|---|---|
| `b2f_groupements` | `Groupements` | L'entreprise. **Entité pivot** : porte le compte, l'abonnement, les véhicules, les chauffeurs. Le cloisonnement se fait ici. |
| `b2f_users` | `utilisateur` | Un compte de connexion, un rôle, un rattachement. |
| `b2f_declarations` | `Declaration` | Le fret déclaré : un corridor, un libellé. |
| `b2f_demandes` | `DemandeTransport` + `LigneDemande` | Le besoin de transport. **Lignes embarquées.** |
| `b2f_vehicules` | `Vehicule` | Le parc d'un groupement. |
| `b2f_chauffeurs` | `Chauffeur` | Donnée du groupement, **jamais un compte**. |
| `b2f_offres` | `OffreVehicule` | Un véhicule annoncé disponible. **Ne porte plus les réponses.** |
| `b2f_appariements` | *(sans équivalent direct)* | **Entité nouvelle.** La rencontre offre × demande et son cycle de vie. |
| `b2f_transports` | `etat_dmde` (informel) | Le suivi en six étapes, avec journal en ajout seul. |
| `b2f_operations` | `Operation` | Les mouvements de compte. |
| `b2f_tarifs` | `Fiche_prix` | Le prix des **services de la plateforme**. |
| `b2f_abonnements` | `Abonne` | Conditionne l'accès. |
| `b2f_notifications` | `Mailing` | Dans l'application uniquement. |
| `b2f_duts` | `Duts` | Fiche générée depuis une mise en relation validée. |
| `b2f_audit` | *(absent)* | **Ajout du POC.** Journal en ajout seul. |
| `b2f_referentiels` | 7 tables de nomenclature | Localités, SH, capacités, carrosseries, essieux, emballages. |

**Clés techniques, hors schéma métier** : `b2f_theme` (préférence d'affichage),
`b2f_search_prefs` (critères de recherche conservés, `M3.6`),
`b2f_tx_journal` (journal d'annulation, § 5), `b2f_session`.

### Les six écarts de structure par rapport au système existant

Chacun est une proposition, pas une correction gratuite. Chacun est réversible.

| # | Écart | Motif |
|---|---|---|
| **S1** | **`appariement` devient une entité de premier ordre.** | § 2 — c'est l'écart structurant. |
| **S2** | **Les lignes de marchandise sont embarquées dans la demande.** | Elles n'ont aucun sens hors de leur demande et ne sont jamais interrogées seules. Les embarquer rend leur écriture atomique sans mécanisme supplémentaire. |
| **S3** | **Le solde n'est jamais stocké.** Il vaut la somme des crédits moins celle des débits, recalculée à la lecture. | Un solde stocké se désynchronise ; un solde calculé ne le peut pas. Le système existant procède déjà ainsi — on le confirme plutôt qu'on ne l'invente. |
| **S4** | **Un mouvement porte un montant et un sens**, au lieu de deux colonnes `credit` et `debit`. | Rien, dans le système existant, n'interdit qu'une ligne porte les deux. Une ligne qui serait à la fois un crédit et un débit n'a pas de sens métier. |
| **S5** | **Les sept nomenclatures sont réunies en une collection à famille.** | Elles partagent la même forme (code, libellé, parent). Sept dépôts pour sept listes de référence serait de la cérémonie. |
| **S6** | **Les montants sont figés dans l'appariement à la validation.** | Sans cela, une modification ultérieure du catalogue de tarifs réécrirait l'histoire des transactions passées. |

---

## 2. L'écart structurant : l'entité `appariement`

### Ce que fait le système existant

Il porte les réponses des deux parties **en colonnes sur l'offre de véhicule** —
`reponse_affeteur`, `reponse_transporteur`, `id_dmde_trans` — et maintient **en
parallèle** une table `OffreDemande` avec son propre `etat`. Le cadrage relève
trois mécanismes d'appariement concurrents, vestiges d'une refonte non terminée
(§ 3.3).

### Ce que cette structure ne sait pas représenter

Une offre rejetée puis réservée à nouveau. Les colonnes n'ayant qu'un jeu de
valeurs, la seconde tentative **écrase** la première : l'historique du rejet
disparaît, et avec lui le motif qui aurait permis de comprendre pourquoi.

### Ce que fait le POC

```
Declaration ──< DemandeTransport ──┐
                                   ├──< Appariement >── OffreVehicule >── Vehicule
Groupement ──< OffreVehicule ──────┘         │                             │
                                             │                             └─ Chauffeur
                                             ├──> Transport (1:1, créé à la validation)
                                             ├──> Operation (débit affréteur)
                                             └──> Operation (débit transporteur)
```

Chaque tentative d'appariement est un enregistrement distinct, avec son état, ses
horodatages, ses auteurs et son motif de rejet le cas échéant. L'offre redevient
ce qu'elle est : une annonce. C'est l'écart délibéré n° 1 — « un seul mécanisme
d'appariement » — rendu structurel plutôt que promis.

**Contrainte associée** (`INVARIANTS_CROISES.unSeulAppariementActifParOffre`) :
une offre ne porte au plus qu'un appariement dans un état non terminal. C'est
cette règle, et non la structure des colonnes, qui empêche la double réservation.

---

## 3. Le cycle de vie de l'appariement

Les valeurs stockées sont **celles du système existant** — `reserver`,
`accepter`, `rejeter`, `annuler`, `valider` — pour qu'une reprise de données
reste possible. Elles ne sont jamais affichées brutes (décision D34).

```
            ┌──────────── annuler ◄─────────────┐
            │                                   │
  (rien) ──engager──► reserver ──accepter──► accepter ──valider──► valider ✦
                          │                                         (terminal)
                          └──rejeter──► rejeter (terminal)
```

| Transition | Qui | Gardes | Financière |
|---|---|---|---|
| → `reserver` | l'initiateur | offre tenable, demande ouverte, fenêtres recouvrantes | non |
| `reserver` → `accepter` | le répondeur | offre tenable, demande ouverte | non |
| `reserver` → `rejeter` | le répondeur | **motif obligatoire** | non |
| `reserver`/`accepter` → `annuler` | l'une ou l'autre partie | aucune | non |
| `accepter` → `valider` | **l'affréteur, toujours** | offre tenable, demande ouverte, **les deux soldes** | **oui** |

**Les deux sens du flux convergent sur cette machine unique.** En sens A, le
transporteur publie et l'affréteur engage ; en sens B, l'affréteur publie et le
transporteur engage. Seul change qui est l'initiateur. La validation revient à
l'affréteur dans les deux cas — c'est ce que porte `reponse_affeteur` dans le
système existant, et c'est lui qui engage la relation.

Trois points tenus par le code (`js/domain/matching.state.js`) :

1. **Aucun chemin de retour.** Rien ne sort d'un état terminal.
2. **Aucun saut.** `reserver` → `valider` est refusé, avec un message qui
   enseigne la règle plutôt que de constater l'échec.
3. **Une garde non évaluable échoue.** Un solde absent du contexte ne laisse pas
   passer : une vérification qu'on ne sait pas faire n'est pas une vérification
   réussie.

**Une seule transition est financière.** C'est vérifié par un test, et c'est ce
qui rend le périmètre du double débit lisible d'un coup d'œil.

---

## 4. La classification des données

Chaque champ du schéma porte une classification. C'est **un seul mécanisme** pour
deux exigences que la conception avait posées séparément.

| Classification | Contenu | Qui la reçoit |
|---|---|---|
| `public` | Corridors, dates, capacités, états | Tout utilisateur authentifié |
| `identite` | Raison sociale, RCCM, immatriculation | Tout acteur du marché — c'est ce qui permet de choisir avec qui traiter |
| **`contact`** | Téléphone, courriel, adresse, **chauffeur entier**, carte grise | **Les deux parties, et seulement après `valider`** |
| **`financier`** | Soldes, montants, écritures | Les acteurs sur leur propre périmètre, le concessionnaire sur tout. **Jamais la DGTTC.** |
| `systeme` | Empreinte et sel de mot de passe | **Personne.** Ne figure dans aucune liste de lecture. |

### La règle des coordonnées, telle qu'elle est tenue

`projeter()` (`js/domain/access.js`) libère un champ `contact` si et seulement si
les trois conditions sont réunies :

1. le rôle peut, en principe, lire la classification `contact` ;
2. le groupement propriétaire du champ est connu ;
3. **ce groupement figure parmi les groupements libérés** — ceux avec lesquels
   l'utilisateur partage un appariement à l'état `valider`.

Les champs refusés sont **absents de l'objet rendu**, pas mis à `null` et pas
masqués en CSS. Motif : une valeur présente dans la mémoire d'une vue finit par
s'afficher quelque part — un export, une infobulle, un journal.

> **Un défaut réel, trouvé par les tests.** La première version devinait le
> groupement propriétaire en lisant `objet.groupementId`. Pour l'entité
> `groupement` elle-même, ce champ n'existe pas : le propriétaire est `id`. Le
> test « les coordonnées sont retirées avant validation » passait donc **pour la
> mauvaise raison** — propriétaire indéterminé, donc refus — et le test
> symétrique « elles sont libérées après validation » a échoué, révélant le
> problème. Chaque entité déclare désormais son champ propriétaire
> (`proprietaire` dans `schema.js`), et une entité qui n'en a pas — un
> appariement a deux parties — **exige que l'appelant le fournisse**. Sans
> propriétaire connu, rien n'est libéré. Test de non-régression :
> `tests/schema.test.mjs`, « déclare explicitement le champ portant le groupement
> propriétaire ».

### Ce que cette classification ne fait pas

Elle empêche le code applicatif de **construire** une réponse non autorisée. Elle
ne protège rien contre l'ouverture des outils de développement : LocalStorage
reste lisible et modifiable par le porteur du navigateur. C'est une garantie de
**conception**, jamais une garantie de sécurité (`plan-suivi.md` § 8).

---

## 5. L'atomicité du double débit

### Le problème

La validation écrit dans **quatre collections** : deux mouvements dans
`b2f_operations`, la mise à jour de `b2f_appariements`, la création du transport
dans `b2f_transports`, l'entrée dans `b2f_audit`. LocalStorage n'a pas de
transaction. Un débit isolé serait une corruption — et sans contrainte d'intégrité en
base, rien ne viendrait la signaler.

### Le mécanisme

LocalStorage garantit l'atomicité **par clé** : un `setItem` aboutit ou échoue,
jamais à moitié. On construit sur cette seule garantie :

1. l'état antérieur des clés touchées est écrit dans **une seule clé**,
   `b2f_tx_journal` — atomique par construction ;
2. les écritures sont appliquées ;
3. le journal est effacé.

Une interruption entre 2 et 3 laisse le journal : au démarrage suivant,
`restaurerSiInterrompu()` rétablit l'état antérieur. Une interruption pendant 1
ne laisse rien.

> **Second défaut réel, trouvé par les tests.** Le test « restaure tout si la
> seconde écriture échoue » simulait un quota dépassé. La restauration tentait de
> réécrire **toutes** les clés du journal, y compris celle qui venait d'échouer ;
> elle échouait donc à son tour, l'exception de restauration remplaçait l'erreur
> d'origine, et **la transaction restait à moitié appliquée** — exactement le
> double débit corrompu que le mécanisme existe pour empêcher. Deux corrections :
> on ne restaure que les clés **effectivement écrites**, et une restauration
> incomplète **conserve le journal** au lieu de l'effacer, pour que le rattrapage
> reste possible au démarrage suivant. Détruire la seule trace d'une écriture
> partielle serait le pire des choix.

### Ce que ce mécanisme ne fait pas

Il ne protège pas d'un accès concurrent entre deux onglets de la même origine :
deux transactions simultanées peuvent s'entrelacer. La limite est documentée
plutôt que niée ; pour un POC mono-utilisateur en démonstration, elle est sans
conséquence pratique.

---

## 6. L'intégrité explicite

Un schéma sans **clé étrangère, sans contrainte de validation et sans valeur
par défaut** fait reposer l'intégrité entièrement sur la discipline du code
appelant. Le POC l'exprime à trois niveaux.

### 6.1 Contraintes de champ

Déclarées sur chaque champ : `requis`, `type`, `enum`, `unique`, bornes,
`ref` (entité cible) et `onDelete` (`restrict` | `cascade` | `detach`).

### 6.2 Invariants locaux — vérifiables sur une entité seule

Vingt et une règles, portées par `schema.js` et appliquées par les dépôts. Les plus
notables :

| Invariant | Règle |
|---|---|
| `validationComplete` | Un appariement validé porte **les deux montants ET les deux écritures**. Le cas « un seul débit » est refusé au niveau de la donnée. |
| `arriveeApresDepart` | L'arrivée souhaitée est strictement postérieure au départ. |
| `capaciteSousPtac` | La capacité utile ne dépasse pas le PTAC. |
| `rejetMotive` | Un rejet porte obligatoirement un motif. |
| `partiesDistinctes` | Un groupement ne peut pas être ses deux propres parties. |
| `journalChronologique` | Les événements d'un transport sont strictement ordonnés. |
| `clotureApresLivraison` | La date de clôture et l'étape « clôturé » vont ensemble, **dans les deux sens**. |
| `montantStrictementPositif` | Un mouvement de zéro n'est pas un mouvement. |

### 6.3 Invariants croisés — déclarés ici, appliqués ailleurs

Dix règles mettant en jeu plusieurs entités. Elles ne peuvent pas être vérifiées
sur une entité isolée : elles sont **déclarées** dans `INVARIANTS_CROISES` avec le
module qui les porte, et appliquées en J2–J3. Les déclarer plutôt que de les
laisser implicites est l'objet même de l'écart n° 4.

`doubleDebitAtomique` · `coordonneesApresValidation` · `soldeJamaisNegatif` ·
`unSeulAppariementActifParOffre` · `unSeulAppariementValideParDemande` ·
`fenetreRecouvrante` · `vehiculePubliable` · `groupementCoherent` ·
`appariementPartiesCoherentes` · `annulationImpossibleApresValidation`

---

## 7. Le suivi du transport — six étapes (U2 tranchée)

```
Validé → À quai → Chargé → En route → Livré → Clôturé
```

| Étape | Déclarée par | Règle |
|---|---|---|
| Validé | le système | Créé automatiquement à la validation. Il n'y a pas de transport sans mise en relation. |
| À quai, Chargé, En route, Livré | le transporteur | **Aucun saut, aucun retour en arrière.** L'index dans `ORDRE_ETAPES` fait foi. |
| Clôturé | **l'affréteur** | Impossible avant « Livré ». |
| *Incident* | le transporteur | S'inscrit au journal **sans changer l'étape** : panne, retard, barrage, litige au chargement. |

Confirmé par l'utilisateur le 24/09/2026 (décision D36). Le système existant ne
formalise pas ces étapes — `etat_dmde` y est flou. **C'est un apport du POC, à
signaler en démonstration.**

---

## 8. Les mots de passe

| | À écarter | POC |
|---|---|---|
| Algorithme | **condensat rapide sans sel** | **PBKDF2-SHA256**, 100 000 itérations, sel aléatoire par compte |
| Stockage | empreinte seule | `{ algo, iterations, sel, empreinte }` |
| Classification | — | `systeme` — **projetée vers personne** |

L'algorithme et le nombre d'itérations sont stockés **avec** l'empreinte pour
qu'un durcissement ultérieur reste possible sans réinitialiser les comptes.
Implémentation via Web Crypto (`crypto.subtle.deriveBits`), disponible en
contexte sécurisé — `localhost` en fait partie. Écriture prévue en J2.

**Cela ne rend pas le POC sûr** : les empreintes restent dans LocalStorage, donc
lisibles. L'intérêt est de démontrer la pratique correcte et de ne pas reproduire
un défaut critique relevé sur le système existant.

---

## 9. Ce qui reste à faire

| Jalon | Objet |
|---|---|
| **J2** | Dépôts (`js/repositories/`) appliquant schéma et invariants locaux ; jeux de démonstration marqués DÉMO ; hachage PBKDF2. |
| **J3** | `js/services/matching.service.js` — orchestrateur du double débit, consommant `matching.state.js` et la transaction du stockage. Invariants croisés. |
| **J3** | Audit de sécurité intermédiaire : cloisonnement effectif, non-fuite des coordonnées, contournabilité de la règle de solde. |

Le partage est volontaire : **la règle d'appariement est pure et testable**
(`matching.state.js`), **l'orchestration touche au stockage**
(`matching.service.js`). Aucune vue, aucun autre service ne modifie un état
d'appariement (`M4.5`).
