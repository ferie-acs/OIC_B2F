# Vérification locale — marché public et carte

24 septembre 2026. Refonte locale, non déployée.

## Automatisation

Commande : `node --experimental-default-type=module --test tests/*.test.mjs`.
Résultat : **494 tests, 71 suites, 494 réussis, aucun échec, aucun test ignoré**. Les 480 tests précédents sont conservés ; 14 tests couvrent le catalogue public, l’exclusion d’annonces indisponibles, les champs publiés, les filtres, les droits, les redirections internes et la republication explicite après livraison.

## Parcours dans le navigateur

- Sans session : marché visible, bascule camions/frets, sélection d’annonce, filtrage et réinitialisation après résultat vide.
- Depuis une annonce : connexion affréteur, reprise du camion sélectionné, réservation réussie ; annonce retirée du catalogue public après réservation.
- Transporteur : avancement du transport fictif à Livré, accès à « Confirmer une nouvelle disponibilité », véhicule et Bouaké préremplis, choix explicite d’Abidjan et des dates, publication réussie sous une nouvelle référence. L’ancienne offre reste engagée dans l’historique.
- Vérification visuelle sur ordinateur et à 390/320 px : pas de débordement horizontal sur le marché public.
- Aucun avertissement ou erreur console observé pendant la recette.

## Portée

Données fictives uniquement, stockage local au navigateur. Carte de villes et liaisons schématiques, sans localisation GPS ni itinéraire routier. Cette recette n’est ni un audit de sécurité serveur, ni une certification d’accessibilité ; pas de test avec lecteur d’écran. Aucun déploiement effectué.
