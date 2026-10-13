# Lot b4 — Abonnements, paiements, caisse et finances (B2F)

Ce lot rend utilisables dans le POC le réabonnement, le rechargement du compte,
la caisse au guichet avec reçu imprimable, les états financiers et exports, le
contentieux et la modification des tarifs. **Tous les paiements sont simulés** :
aucun opérateur n'est appelé, et l'écran comme le reçu le disent.

## Démarches traitées

| N° | Acteur | Démarche | Résultat |
|---|---|---|---|
| 5, 22 | Affréteur, transporteur | Renouveler son abonnement | Fait : formule du catalogue, mobile money, carte ou débit du compte prépayé (simulés) ; ou paiement au guichet |
| 6, 23 | Affréteur, transporteur | Recharger son compte et suivre son solde | Fait : mobile money simulé, crédit direct ; solde, mouvements, paiements et reçus |
| 91 | Exploitant OIC | Modifier les tarifs | Fait : montant et durée, date d'effet, historique, annulation d'une programmation |
| 103 | Caisse | Enregistrer un paiement au guichet | Fait pour abonnement, rechargement et règlement de contentieux. Le service SMS n'est pas traité (voir limites) |
| 104 | Caisse | Enregistrer un réabonnement payé | Fait : saisie, puis validation par une autre personne qui prolonge l'abonnement |
| 106 | Caisse | Imprimer un reçu | Fait : PDF numéroté, original puis duplicatas numérotés |
| 107 | Caisse, comptabilité | Consulter paiements, abonnements et dépôts | Fait : état par période, mode, objet et canal |
| 108 | Contentieux | Enregistrer et suivre les contentieux | Fait : dossier, pièces (métadonnées), étapes, clôture, règlements imputés |
| 109 | Comptabilité | Rapports financiers et exports | Fait : export CSV et PDF, projection sans identité pour la comptabilité |

## Écrans ajoutés ou remplacés

| Route | Rôles | Entrée de menu | Contenu |
|---|---|---|---|
| `affreteur/abonnement`, `transporteur/abonnement` | Titulaire (paie), sous-compte (consulte) | Compte › Abonnement | Échéance, renouvellement, historique des périodes avec reçu |
| `affreteur/compte`, `transporteur/compte` | Titulaire (recharge), sous-compte (consulte) | Compte › Solde et mouvements | Solde, mouvements, rechargement mobile money |
| `affreteur/paiements`, `transporteur/paiements` | Affréteur, transporteur et leurs sous-comptes | Compte › Paiements et reçus | Paiements de l'entreprise et réédition des reçus |
| `concessionnaire/caisse` | Concessionnaire | Caisse › Encaissement au guichet | Saisie, reçu, encaissements du jour |
| `concessionnaire/encaissements` | Concessionnaire (seconde personne) | Caisse › Encaissements à valider | Validation après rapprochement, ou rejet motivé |
| `concessionnaire/etats-financiers`, `minimal/etats-financiers` | Concessionnaire, superviseur comptabilité | Caisse › États et exports ; États financiers | Totaux, répartitions, détail, export CSV et PDF |
| `concessionnaire/contentieux`, `minimal/contentieux` | Concessionnaire (consulte), contentieux (instruit) | Caisse › Contentieux ; Contentieux | Liste, ouverture, dossier, étapes, clôture |
| `concessionnaire/tarifs` | Concessionnaire | Finances › Catalogue de tarifs | Catalogue modifiable, historique des modifications |

Les écrans d'abonnement et de compte de l'entreprise remplacent, sous la même route,
ceux qui annonçaient le paiement en ligne hors périmètre (déclarés à la fin de
`declarerRoutes()` : le routeur garde la dernière déclaration).

## Droits

- Nouveaux droits : `compte.recharger`, `caisse.encaisser`, `caisse.valider`,
  `caisse.lire`, `rapport.financier`, `contentieux.lire`, `contentieux.gerer`.
- Droits existants enfin utilisés : `abonnement.prolonger` (titulaire, et
  concessionnaire à la validation d'un encaissement) et `tarif.modifier`
  (concessionnaire).
- `abonnement.prolonger` est accessible à un abonnement expiré, au même titre que
  `abonnement.lire` : renouveler est précisément ce qu'il doit permettre.
- Les sous-comptes (auxiliaires) n'ont ni `abonnement.prolonger` ni
  `compte.recharger` : payer engage les moyens de l'entreprise. Le bouton reste
  visible avec son motif.
- `superviseur_comptabilite` reçoit `rapport.financier` et la classification
  FINANCIER, **sans** IDENTITE : il lit les montants, jamais les noms. La colonne
  « Client » de l'écran et des exports porte « Non communiqué ».
- `contentieux_paie` reçoit `contentieux.lire` et `contentieux.gerer`, avec
  IDENTITE et FINANCIER mais sans CONTACT. Il n'encaisse pas.
- La DGTTC n'a aucun de ces droits : aucun montant ne lui est servi.

**Choix retenu pour la caisse.** Dans le système existant, l'écran de caisse se
trouve dans l'espace du concessionnaire (`vue/concessionnaire/recupaie.php`). Le
POC suit ce modèle : le concessionnaire saisit, **un autre** concessionnaire
valide. Le profil `agent_caisse` reste déclaré sans droit ; lui ouvrir la saisie
est une décision à prendre par l'OIC (une ligne dans la matrice).

## Règles métier

- **Une seule fonction ouvre une période d'abonnement** :
  `prolongerAbonnement(ctx, { groupementId, tarifId, montant?, dureeMois?, reference? }, { tx? })`
  dans `js/services/abonnement.service.js`. Elle sert au paiement en ligne et à la
  caisse, et peut servir à l'activation initiale (lot b1). Un abonnement en cours
  est prolongé à partir du lendemain de son échéance ; un abonnement expiré ou
  absent repart du jour du paiement. Chaque prolongation crée une nouvelle période,
  qui garde sa formule, son montant et l'auteur.
- **Paiement en ligne** : la transaction de l'opérateur fait foi, le paiement est
  encaissé et produit son effet immédiatement. Une référence de transaction ne
  sert qu'une fois (comparée sans casse ni séparateurs, y compris contre les
  crédits et mouvements existants). Un refus simulé est journalisé et notifié,
  sans rien débiter ni créditer.
- **Rechargement** : nombre de mises en relation × frais unitaire du catalogue
  (affréteur ou transporteur), 1 à 50 par paiement.
- **Guichet, quatre yeux** : la saisie émet le reçu mais ne produit aucun effet.
  La validation, par une autre personne et après attestation de rapprochement,
  crédite le compte, prolonge l'abonnement ou impute le règlement. Un rechargement
  au guichet passe par `saisirCredit` / `validerCredit` dans la même transaction que
  le reçu : il apparaît aussi dans « Crédits à valider », et le valider à l'un ou
  l'autre endroit produit le même effet. Hors espèces, la référence de la pièce est
  obligatoire et ne sert qu'une fois. Le prix d'un réabonnement est celui du
  catalogue au jour de la saisie : il ne se saisit pas.
- **Reçu** : numéro `RC-AAAA-NNNN` séquentiel dans l'année, mentions de l'OIC,
  montant en lettres, état, empreinte SHA-256, mention « Paiement simulé » et
  filigrane de démonstration. Chaque édition est comptée et journalisée ; à partir
  de la deuxième, le reçu porte « Duplicata n° N ». Le numéro du payeur n'apparaît
  que masqué, et jamais pour l'exploitant.
- **Tarifs** : date d'effet jamais antérieure au jour ; le jour même, effet
  immédiat ; plus tard, modification programmée, appliquée au démarrage et à chaque
  lecture du catalogue une fois sa date atteinte. Une seule programmation par tarif.
  Motif obligatoire. Aucune période déjà payée n'est modifiée.
- **Contentieux** : référence `CT-AAAA-NNNN` ; étapes Ouvert → En instruction → En
  conciliation, une à la fois, sans retour, avec commentaire obligatoire ; clôture
  possible à toute étape avec son issue. Les pièces ne sont décrites que par leur
  nom, type et taille. Un règlement encaissé au guichet est imputé au dossier à sa
  validation, sans dépasser le reste dû.
- **Exports** : CSV (séparateur point-virgule, formules neutralisées) et PDF,
  journalisés. Le journal ne porte ni montant ni nom d'entreprise.

## Journal d'audit

Nouveaux événements : paiement en ligne, paiement refusé, encaissement saisi /
validé / rejeté, reçu édité, tarif programmé, programmation annulée, contentieux
ouvert / étape / pièce / clos, export financier. Les événements existants
`tarif_modifie` et `abonnement_prolonge` sont désormais émis.

## Notifications internes et points d'envoi pour le lot b1

Notifications internes ajoutées : abonnement prolongé, paiement enregistré,
paiement non abouti, encaissement rejeté (et « compte crédité » existant pour un
rechargement en ligne). Points où un courriel ou un SMS devrait partir, à brancher
par le lot b1 : `prolongerAbonnement` (abonnement prolongé), `validerEncaissement`
(reçu validé), `rejeterEncaissement`, `rechargerEnLigne`, `signalerEchec`, et
l'approche de l'échéance (`situationAbonnement().procheEcheance`, 30 jours).

## Comptes de démonstration (mot de passe `demo2026`)

| Compte | Rôle | Usage |
|---|---|---|
| `affreteur@demo.invalid` | Affréteur | Renouvellement en avance, rechargement, reçus |
| `affreteur2@demo.invalid` | Affréteur, abonnement expiré | Renouvellement qui rouvre l'accès |
| `auxiliaire@demo.invalid` | Sous-compte | Consulte, ne paie pas |
| `transporteur2@demo.invalid` | Transporteur, solde faible | Débit du compte refusé (solde insuffisant) |
| `concessionnaire@demo.invalid` | Concessionnaire, agent n° 1 | Saisie au guichet, tarifs, états |
| `concessionnaire2@demo.invalid` | Concessionnaire, agent n° 2 | Validation des encaissements |
| `contentieux@demo.invalid` | Contentieux (nouveau) | Instruction des dossiers |
| `comptabilite@demo.invalid` | Supervision comptable (nouveau) | États sans identité |

Données ajoutées par `js/seed-lot-b4.js` (idempotent) : les deux comptes
ci-dessus, la durée de 12 mois de la formule annuelle, un reçu de guichet pour
chaque abonnement initial, un réabonnement en espèces saisi par l'agent n° 1 et
en attente de l'agent n° 2, deux contentieux (un impayé en instruction, un
litige sur la marchandise ouvert).

## Parcours de démonstration

1. `affreteur2@demo.invalid` › Abonnement : bandeau « Abonnement expiré ». Choisir
   Wave, saisir `05 05 05 05 05`, « Payer et renouveler », puis « Simuler la
   confirmation ». L'accès est rouvert ; « Imprimer le reçu » télécharge l'original.
2. `affreteur@demo.invalid` › Solde et mouvements : 4 mises en relation, Orange
   Money, « Payer par mobile money », confirmer : le solde augmente aussitôt.
   Paiements et reçus : rééditer un reçu produit « Duplicata n° 1 ».
3. `concessionnaire@demo.invalid` › Caisse › Encaissement au guichet : client
   Trans Lagunes, objet « Rechargement du compte », 45 000 F, chèque, pièce
   `CHQ-0001`. Le reçu sort « En attente de validation ». Dans « Encaissements à
   valider », le bouton est refusé avec son motif : c'est sa propre saisie.
4. `concessionnaire2@demo.invalid` › Encaissements à valider : cocher le
   rapprochement et valider ; le compte est crédité. Valider aussi le réabonnement
   de Routière du Centre saisi par l'agent n° 1.
5. Concessionnaire › Catalogue de tarifs : modifier l'abonnement annuel avec une
   date d'effet future ; l'historique affiche « Programmée », les abonnements en
   cours ne changent pas.
6. `contentieux@demo.invalid` › Contentieux : ouvrir un dossier avec une pièce,
   le passer en instruction, puis le clore avec son issue.
7. `comptabilite@demo.invalid` › États financiers : montants sans noms ;
   l'export CSV porte « Non communiqué » dans la colonne Client.

## Limites assumées

- Paiements simulés : pas d'appel CinetPay ni d'opérateur ; l'utilisateur choisit
  l'issue de la transaction. Le paiement par carte ne saisit aucune donnée de carte.
- Le service SMS au guichet (inventaire n° 106) n'est pas traité : le POC n'a pas
  de service SMS, et les messages sortants relèvent du lot b1.
- Pas de clôture de caisse journalière : les inventaires ne la décrivent pas. La
  caisse affiche la synthèse du jour (saisi, validé, en attente).
- Une seule formule d'abonnement au catalogue (annuelle) ; l'écran et le service
  en gèrent plusieurs, l'OIC n'ayant pas communiqué d'autres formules.
- Les pièces d'un contentieux ne sont pas conservées, seules leurs métadonnées.
- Les modifications de tarif programmées s'appliquent au démarrage ou à la lecture
  du catalogue (pas de tâche planifiée dans un POC statique).
- Propagation aux sous-comptes : ils n'ont pas d'abonnement propre, l'abonnement
  de l'entreprise les couvre.

## Fichiers

Nouveaux : `js/domain/finances.js`, `js/services/{abonnement,paiement,caisse,tarif,contentieux,rapport-financier,recu}.service.js`,
`js/services/recu-pdf-gabarit.js`, `js/views/{finances-entreprise,caisse,contentieux,tarifs-admin,_finances-ui}.js`,
`js/seed-lot-b4.js`, `css/lot-b4.css`, `tests/lot-b4.test.mjs`.

Fichiers partagés modifiés (blocs « Lot b4 ») : `index.html` (feuille de style,
quatre icônes Lucide), `js/app.js` (routes, amorçage), `js/core/nav.js`,
`js/core/layout.js` (icônes de page, notes de la barre latérale),
`js/domain/{permissions,roles,access,enums,schema}.js`,
`js/services/compte.service.js` (export de `referenceDejaUtilisee`, option `tx`),
`js/services/notification.service.js` (gabarits), `js/views/commun.js` (accueil
des profils contentieux et comptabilité).
