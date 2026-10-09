# Marché public, carte et refonte visuelle

Décisions du commanditaire du 24 septembre 2026, conservées pour les reprises du projet.

## Mise à jour du 26 septembre 2026

L’accueil présente désormais la Bourse de Fret sur `#/accueil` ; le marché sans connexion reste sur `#/explorer`. À la demande du commanditaire, la palette OIC (bleu, orange et vert du logo fourni) remplace le violet. La landing page s’inspire de la composition Hexus et utilise la carte locale ainsi que des aperçus illustratifs des vues métier. Le fichier du logo est conservé sans modification.

## Intention validée

- Voir le fret et les camions avant de se connecter. La connexion intervient pour agir.
- Explorer une carte de Côte d’Ivoire, sélectionner une ville ou un trajet, puis retrouver une annonce après connexion.
- Rechercher le prochain chargement à partir de la ville où le camion sera disponible. Une livraison terminée n’est pas une confirmation de disponibilité.
- Moderniser le POC avec une expérience simple, inspirée visuellement de [Nexlink](https://nexlink.layoutdrop.com/demo/index.html) : surfaces claires, cartes, bordures discrètes, accent violet, navigation lisible.
- Garder un produit compréhensible ; ne pas reproduire tous les modules CRM de la référence.

## Réalisé

L’accueil sans session ouvre le marché public. `#/explorer` est accessible avec ou sans session ; `#/connexion` ouvre les comptes de démonstration existants.

Deux modes : chercher un camion / chercher du fret. Carte et liste utilisent le même catalogue et les mêmes filtres (villes, date, carrosserie, disponibilité, capacité minimum du camion ou poids maximum du fret). Les filtres et la sélection sont dans le fragment URL, conservés au rechargement et lors du retour depuis la connexion. La recherche par date signifie : fenêtre incluant le jour pour un camion, jour de départ pour un fret.

La connexion depuis une annonce retrouve cette annonce dans le marché privé et conserve la réservation/proposition existante. Le rôle, l’abonnement et la disponibilité sont vérifiés avant l’orientation. Le bouton Publier oriente vers le formulaire correspondant aux droits du compte. Les espaces institutionnels ne reçoivent aucun droit de transaction supplémentaire.

Après livraison, le transporteur peut préparer une nouvelle offre depuis le suivi. Le véhicule et la ville de livraison sont préremplis. Le transporteur choisit la destination et les dates puis publie explicitement. L’ancien transport et l’ancienne offre sont conservés.

Le style commun est appliqué aux espaces privés. Les frais et les étapes métier existants ne sont pas modifiés.

## Frontière de publication

Le service `marche-public.service.js` construit une liste positive de champs : identifiant de l’annonce, type, villes, dates, carrosserie, tonnage, catégorie de marchandise et date de publication. Il ne retourne ni raison sociale, ni identifiant de groupement, ni immatriculation, ni téléphone, ni identité de chauffeur, ni documents, ni données financières. Les textes libres de déclaration et de contraintes sont exclus pour éviter d’y publier des coordonnées saisies par un opérateur.

Les annonces retirées, réservées/engagées, échues ou sans références valides ne sont pas proposées. Les véhicules hors service ou à carte échue sont exclus. Un camion encore en transport ne devient pas disponible par déduction de sa date d’arrivée prévue. « À venir » désigne une offre explicitement publiée avec une date future, pas une prédiction GPS. La date affichée est celle de publication, pas une fausse confirmation récente.

Ces protections démontrent la séparation des données dans les services du POC. Elles ne constituent pas une sécurité serveur : toutes les données du POC restent fictives et stockées dans le navigateur.

## Carte et provenance

Fond géographique issu de [Natural Earth via geo-countries](https://github.com/datasets/geo-countries), données Natural Earth du domaine public. Contour Côte d’Ivoire simplifié, intégré localement dans `js/core/carte-geographie.js`. Les points correspondent aux coordonnées approximatives des centres de sept villes ivoiriennes du référentiel. Les annonces hors de ce périmètre restent visibles dans la liste ; aucun point étranger n’est placé artificiellement sur la carte.

Les traits relient les villes ; ce ne sont ni des routes calculées, ni des positions de camions. Aucun appel réseau, GPS ou service cartographique externe à l’exécution. Zoom borné, villes utilisables au clavier, alternative liste, mise en page mobile et respect du mouvement réduit.

## Lecture de l’état des lieux fourni

Le document « Bourse de Fret de Côte d’Ivoire — État des lieux fonctionnel pour la refonte », daté du 24/09/2026, décrit une observation de l’environnement de formation. Il enrichit la connaissance du projet, mais ne constitue pas une instruction de migration de pile technique.

Les 11 profils paramétrés observés ne se substituent pas automatiquement aux 19 rôles du POC : les axes groupe/profil doivent être rapprochés. Les tarifs de formation (dont l’abonnement à 100 F et le DUT à 2 500 F) ne sont pas des tarifs de production confirmés. Le circuit validation/abonnement, le groupage, la preuve de livraison et le lien avec le portail DUT restent des arbitrages métier. Aucune donnée nominative du document n’a été importée.

## Suite du cadrage, sans promesse de fonctionnalité livrée

À arbitrer séparément : publication confidentielle, habilitation documentaire réelle, preuve de livraison opposable, contrats de transport et prix négocié, paiement réel, garantie de paiement, intégration DUT et suivi GPS. Le benchmark international sert d’inspiration et non de déclaration de conformité ou de certification.

Pour mesurer la pertinence : temps pour trouver une annonce compatible, passage découverte → connexion → proposition, annonces périmées, transports conclus et réutilisation après livraison. Ces mesures ne sont pas simulées par des chiffres marketing dans le POC.
