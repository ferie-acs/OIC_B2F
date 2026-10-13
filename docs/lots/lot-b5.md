# Lot b5 — Administration OIC et espace DGTTC

Plateforme : **Bourse de Fret (B2F)**. Pour les démarches « Les deux », seul le côté Bourse de Fret est traité ici.

## 1. Démarches couvertes

| N° | Démarche | Statut à la livraison |
|----|----------|-----------------------|
| 85 | Gérer les comptes du back-office | Fait |
| 86 | Gérer les profils et habilitations | Fait (paramétrage encadré) |
| 87 | Gérer les groupements inscrits | Fait (création hors périmètre, voir § 6) |
| 92 | Gérer les référentiels nationaux | Fait |
| 98 | Déclarer, qualifier et attribuer un incident | Fait |
| 101 | Exposer les offres en service web | Fait (flux généré et téléchargé, sans serveur) |
| 128 | DGTTC : consulter acteurs, parc et répartitions | Fait (intermédiaires, carte des acteurs, répartitions) |
| 129 | DGTTC : consulter offres, déclarations et demandes | Fait (exports CSV par période, sans montant) |
| 131 | DGTTC : gérer les utilisateurs DGTTC | Fait |

## 2. Écrans ajoutés

| Route | Rôle | Entrée de menu | Droit |
|-------|------|----------------|-------|
| `#/concessionnaire/agents` | Concessionnaire | Administration › Comptes des agents OIC | `agent.gerer` |
| `#/concessionnaire/roles` (redéclarée) | Concessionnaire | Acteurs › Profils et habilitations | `role.lire`, `habilitation.parametrer` |
| `#/concessionnaire/groupements` (redéclarée) | Concessionnaire | Acteurs › Groupements | `groupement.lire`, `groupement.gerer`, `groupement.suspendre` |
| `#/concessionnaire/referentiels` | Concessionnaire | Administration › Référentiels nationaux | `referentiel.gerer` |
| `#/concessionnaire/incidents` | Concessionnaire | Administration › Incidents applicatifs | `incident.traiter` |
| `#/concessionnaire/flux` | Concessionnaire | Administration › Flux public des offres | `flux.offres` |
| `#/affreteur/incidents`, `#/transporteur/incidents` | Affréteur, transporteur et profils déclinés | Pilotage › Signaler un incident | `incident.declarer` |
| `#/dgttc/intermediaires` | DGTTC | Acteurs › Intermédiaires | `groupement.lire` |
| `#/dgttc/repartitions` | DGTTC | Acteurs › Répartitions (avec la carte des acteurs) | `groupement.lire`, `vehicule.lire` |
| `#/dgttc/exports` | DGTTC | Administration › Exports par période | `export.donnees` |
| `#/dgttc/utilisateurs` | DGTTC (administrateur de l'institution) | Administration › Utilisateurs DGTTC | `institution.utilisateurs` |
| `#/dgttc/incidents` | DGTTC | Administration › Signaler un incident | `incident.declarer` |
| `#/connexion/code` | Public | Lien du message simulé | — |

## 3. Règles métier

**Comptes du back-office et de l'institution** (`services/agents.service.js`)
- Création sans mot de passe connu de l'administrateur : un code à usage unique (15 minutes, 5 essais) part à l'adresse **enregistrée** du compte. Seule son empreinte est conservée. Le message est **simulé** et affiché comme tel.
- Le compte reste utilisable avec son ancien mot de passe tant que le nouveau n'est pas défini ; un nouveau code annule le précédent.
- Un administrateur ne modifie pas son propre rôle et ne se désactive pas ; au moins un administrateur actif subsiste toujours.
- Un compte désactivé ne se connecte plus (message servi seulement après un mot de passe exact).
- L'administrateur DGTTC n'agit que sur les comptes de son institution, avec le seul rôle `dgttc` ; un agent DGTTC non désigné administrateur consulte sans gérer.
- Chaque action exige un motif et est journalisée (sans adresse en clair).

**Profils et habilitations** (`domain/permissions.js`, bloc « Lot b5 », et `services/habilitations.service.js`)
- Consultation par profil, par droit, et historique en ajout seul.
- Seuls les droits listés dans `DROITS_PARAMETRABLES` (consultation pure, sans incidence financière) sont paramétrables, et seulement pour un profil institutionnel autre que le super administrateur.
- `DROITS_VERROUILLES` (validation, crédit et sa validation, vérification, suspension, coordonnées, expiration, gestion des comptes, paramétrage) ne peuvent être ni donnés ni retirés. Un garde-fou de chargement fait échouer le module si une entrée paramétrable devenait mutante ou financière.
- Le second verrou (classifications lisibles par rôle) n'est jamais paramétrable : la DGTTC dotée d'un droit de plus ne voit toujours aucun montant.
- Une décision non conforme glissée dans le stockage est ignorée au chargement.

**Groupements** (`services/groupements-admin.service.js`, `services/suspension.js`)
- Modification d'une fiche avec motif ; modifier une pièce contrôlée retire la vérification du transporteur.
- Suspension et réactivation en quatre yeux : demandée par un agent, confirmée ou rejetée par une autre personne (modèle de la validation des crédits).
- Une entreprise suspendue garde la consultation de son historique ; le moteur de droits refuse toute mutation (sauf signaler un incident), et ses annonces quittent le marché, le catalogue public et le flux ; aucune mise en relation ne peut être engagée, acceptée ou validée avec elle.
- Une institution ne se suspend pas. Export CSV de l'annuaire sans coordonnée ni montant, journalisé.

**Référentiels nationaux** (`services/referentiels.service.js`)
- Familles : villes et localités, catégories de marchandises (SH), carrosseries, capacités, essieux, conditionnements.
- Ajout, renommage, désactivation et réactivation ; une valeur désactivée disparaît des listes de saisie sans toucher aux données qui l'emploient.
- Suppression possible uniquement pour une valeur jamais utilisée ; la dernière localité active ne se désactive pas.

**Incidents applicatifs** (`services/incidents-app.service.js`, entité `incident_applicatif`)
- Distincts des incidents de transport. Catégorie, gravité, titre, description filtrée (aucune coordonnée), écran concerné, capture réduite à ses métadonnées (image uniquement).
- Cycle : nouveau → qualifié (gravité retenue, impact) → en traitement (attribué à un agent habilité) → résolu → clos, avec réouverture possible. Le déclarant ne voit que ses signalements et reçoit une notification à chaque étape.

**Flux public des offres** (`services/flux-offres.service.js`)
- JSON construit par liste positive de champs à partir du catalogue public : aucune raison sociale, identifiant d'entreprise, immatriculation, texte libre ni coordonnée. Identifiant d'annonce opaque.
- Contrôle final : la génération est refusée si une donnée d'identité connue de la plateforme apparaissait. Génération journalisée.

**DGTTC** (`services/dgttc.service.js`)
- Intermédiaires avec leur mandant, sans coordonnée. Répartitions par localité, carrosserie, taille de parc et état de vérification, filtrables par période d'inscription.
- Carte des acteurs (`core/carte-acteurs.js`) : même fond local que la carte du marché, sans tuiles ; un point par ville déclarée, aucune entreprise placée individuellement.
- Exports CSV par période (offres, déclarations, demandes, intermédiaires) en colonnes fixées à l'avance : ni prix, ni montant, ni solde, ni coordonnée ; cellules neutralisées contre les formules ; chaque export journalisé.

## 4. Comptes de démonstration

Mot de passe : `demo2026`.

| Compte | Usage dans ce lot |
|--------|-------------------|
| `concessionnaire@demo.invalid` | Administrateur OIC : comptes, habilitations, groupements, référentiels, incidents, flux |
| `concessionnaire2@demo.invalid` | Seconde personne : confirme une suspension demandée par le premier compte |
| `comptes.oic@demo.invalid` | Agent OIC **désactivé** (ajouté par ce lot) : à réactiver |
| `dgttc@demo.invalid` | DGTTC, **administrateur de son institution** |
| `dgttc2@demo.invalid` | DGTTC non administrateur (ajouté par ce lot) : consulte sans gérer les comptes |
| `transporteur@demo.invalid`, `affreteur@demo.invalid` | Signalent un incident |

Deux incidents de démonstration (`IA-2026-0001` nouveau, `IA-2026-0002` en traitement) sont semés par `js/seed-lot-b5.js` (idempotent).

## 5. Parcours de démonstration

1. **Incident** — `transporteur@demo.invalid` › Pilotage › Signaler un incident : choisir la nature, la gêne, un titre, une description, éventuellement une image ; envoyer. Le signalement apparaît dans « Mes signalements ».
2. `concessionnaire@demo.invalid` › Administration › Incidents applicatifs › Ouvrir : qualifier (gravité retenue, impact), puis attribuer, ajouter une note, déclarer résolu, clore.
3. **Compte d'agent** — Administration › Comptes des agents OIC › Créer un compte : le message simulé affiche le code. « Se déconnecter et saisir le code » ouvre la page Code d'accès ; définir le mot de passe, puis se connecter avec le nouveau compte.
4. Sur sa propre ligne, le concessionnaire ne peut ni se désactiver ni réinitialiser son accès ; réactiver `Rose BROU` avec un motif.
5. **Habilitations** — Acteurs › Profils et habilitations : profil DGTTC, « Activer » sur « Consulter les DUT générés » avec un motif ; l'onglet Historique montre la décision. Profil Affréteur : aucun droit n'est paramétrable. Onglet Par droit, « Valider une mise en relation » : verrouillé.
6. **Suspension** — Acteurs › Groupements › « Demander la suspension » sur une entreprise, avec motif. Se reconnecter en `concessionnaire2@demo.invalid` › Groupements › Décisions à confirmer › Confirmer. Ses annonces quittent le marché ; ses utilisateurs consultent leur historique mais ne peuvent plus opérer. Réactiver de la même manière. « Exporter la liste (CSV) ».
7. **Référentiels** — Administration › Référentiels nationaux : ajouter une carrosserie, la renommer, la désactiver ; une valeur utilisée n'offre pas la suppression.
8. **Flux** — Administration › Flux public des offres : lire la liste des champs publiés et jamais publiés, puis « Générer et télécharger (JSON) ».
9. **DGTTC** — `dgttc@demo.invalid` : Acteurs › Intermédiaires ; Acteurs › Répartitions (carte des acteurs, période) ; Administration › Exports par période (choisir une période, exporter) ; Administration › Utilisateurs DGTTC (créer un compte, désactiver `Ange KOUADIO`). En `dgttc2@demo.invalid`, l'écran des utilisateurs reste en consultation.

## 6. Limites assumées

- **Création d'une entreprise par l'OIC** : non ajoutée. L'inscription et l'activation des entreprises relèvent du lot b1 ; l'OIC consulte, modifie, suspend, réactive et exporte.
- **Flux public** : sans serveur, le POC ne publie pas le flux à une adresse ; il est généré à la demande et téléchargé. En service, le même service serait exposé tel quel.
- **Messages** : le code d'accès et les notifications sont simulés et affichés comme tels ; le code n'est montré à l'administrateur que pour la démonstration.
- **Capture d'écran d'un incident** : seules ses métadonnées (nom, type, taille) sont conservées ; le fichier n'est pas stocké.
- **Paramétrage des habilitations** : volontairement borné aux droits de consultation des profils institutionnels ; les droits des acteurs du marché suivent le modèle commercial et restent fixés par la conception.
- **Carte des acteurs** : les acteurs sont placés au centre de leur ville déclarée, pour les villes couvertes par le fond de carte ; les autres localités restent dans le tableau de répartition.

## 7. Fichiers partagés modifiés (blocs « Lot b5 »)

`index.html` (feuille `css/lot-b5.css`), `js/app.js` (routes, amorçage, page Code d'accès), `js/core/nav.js` (menus), `js/domain/access.js` (refus d'une entreprise suspendue), `js/domain/enums.js` (événements d'audit, énumérations), `js/domain/permissions.js` (droits, matrice, paramétrage encadré), `js/domain/schema.js` (entités `incident_applicatif`, `habilitation`, `decision_groupement`, `code_acces`, champ `administrateur`), `js/services/auth.service.js` (compte désactivé, entreprise suspendue), `flotte.service.js`, `fret.service.js`, `marche-public.service.js`, `matching.service.js` (effets de la suspension), `notification.service.js` (gabarits).

Tests : `tests/lot-b5.test.mjs` (45 cas, refus compris).
