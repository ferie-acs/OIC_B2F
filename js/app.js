import { initialiserStationnementDemo } from './services/stationnement-demo.js';
import { enrichirDemo, enrichirSensDemo } from './seed-activite.js?v=20261009-carte-2';
import { accueil } from './views/accueil.js?v=20261009-carte-2';
/**
 * Amorçage de l'application et déclaration des routes.
 *
 * @module app
 */

import { el, remplacer } from './core/dom.js';
import { appliquerTheme, monter, shell } from './core/layout.js?v=20261009-carte-2';
import { aller, declarer, demarrer, routeCourante } from './core/router.js';
import { routeAccueil } from './core/nav.js';
import { installerSentinelle } from './core/sentinelle.js';
import { bandeau, bouton, toast } from './core/ui.js';
import { initialiserPersistance } from './repositories/index.js';
import { amorcer, completerJeuAntiFraude, dejaAmorce } from './seed.js';
import { expirerEchus } from './services/matching.service.js';
import { verifications } from './views/verifications.js';
import {
  blocageAbonnement,
  connecter,
  contexteCourant,
  deconnecter,
  reprendreSession,
} from './services/auth.service.js';

import * as affreteur from './views/affreteur.js';
import * as transporteur from './views/transporteur.js';
import * as commun from './views/commun.js?v=20261010-passerelle-dut';
import * as supervision from './views/supervision.js';
import { login } from './views/login.js?v=20261009-carte-2';
import { explorer } from './views/explorer.js';
import { documentsDut } from './views/dut.js';
import { retourPublic, routeActionPublique, routePublication } from './services/marche-public.service.js';
import { reprendreFileDut } from './services/passerelle-dut.service.js';
// Lot b0 : recherche intégrée à toutes les listes de choix.
import { installerListesRecherche } from './core/liste-recherche.js';
/* Lot b1 : inscription, dossier, profil, messagerie */
import { amorcerLotB1 } from './seed-lot-b1.js';
import { declarerPublique, declarerPubliqueRoute } from './core/router.js';
import * as lotB1 from './views/lot-b1.js';
// Lot b2 : organisation interne
import * as organisation from './views/organisation.js';
import * as intermediaire from './views/intermediaire.js';
import { completerJeuLotB2 } from './seed-lot-b2.js';
/* Lot b3 : marché, flotte, attestation et contrôle sur route */
import { vueAttestations } from './views/attestations.js';
import { controleRoute, historiqueControles, verificationPublique } from './views/controle-route.js';
import { completerLotB3 } from './seed-lot-b3.js';
// Lot b4 : abonnements, paiements, caisse et finances.
import * as financesEntreprise from './views/finances-entreprise.js';
import * as caisseB4 from './views/caisse.js';
import { contentieux as contentieuxB4 } from './views/contentieux.js';
import { tarifs as tarifsB4 } from './views/tarifs-admin.js';
import { amorcerLotB4 } from './seed-lot-b4.js';
// Lot b5 : administration OIC et espace DGTTC.
import { amorcerLotB5 } from './seed-lot-b5.js';
import { chargerParametrage } from './services/habilitations.service.js';
import { comptes as comptesAdmin, saisieCodeAcces } from './views/admin-comptes.js';
import { habilitationsVue } from './views/habilitations.js';
import { entreprisesVue } from './views/entreprises-admin.js';
import { referentielsVue } from './views/referentiels-admin.js';
import { incidentsVue } from './views/incidents-app.js';
import { fluxOffresVue } from './views/flux-offres.js';
import { exportsVue, intermediairesVue, repartitionsVue } from './views/dgttc-consultation.js';

/* ------------------------------------------------------------------ *
 * Routes — la clé est `espace/page`, telle que `nav.js` la déclare.
 * ------------------------------------------------------------------ */

function declarerRoutes() {
  // --- Affréteur (et ses auxiliaires, qui empruntent ses routes) ----
  declarer('affreteur/dashboard', affreteur.dashboard);
  declarer('affreteur/declarations', affreteur.declarations);
  declarer('affreteur/declarations/nouvelle', affreteur.nouvelleDeclaration);
  declarer('affreteur/demandes', affreteur.demandes);
  declarer('affreteur/marche', affreteur.marche);
  declarer('affreteur/reservations', affreteur.reservations);
  declarer('affreteur/validation', affreteur.validation);
  declarer('affreteur/relations', affreteur.relations);
  declarer('affreteur/suivi', commun.suivi);
  declarer('affreteur/duts', documentsDut);
  declarer('affreteur/compte', affreteur.compte);
  declarer('affreteur/abonnement', commun.abonnement);
  declarer('affreteur/groupement', commun.groupement);
  declarer('affreteur/utilisateurs', commun.utilisateurs);
  declarer('affreteur/notifications', commun.notifications);

  // --- Transporteur (et ses déclinaisons de niveau 2) ---------------
  declarer('transporteur/dashboard', transporteur.dashboard);
  declarer('transporteur/vehicules', transporteur.vehicules);
  declarer('transporteur/chauffeurs', transporteur.chauffeurs);
  declarer('transporteur/offres', transporteur.offres);
  declarer('transporteur/offres/nouvelle', transporteur.nouvelleOffre);
  declarer('transporteur/marche', transporteur.marche);
  declarer('transporteur/reservations', transporteur.reservations);
  declarer('transporteur/relations', affreteur.relations); // même fiche, deux lectures
  declarer('transporteur/suivi', commun.suivi);
  declarer('transporteur/dut', documentsDut);
  declarer('transporteur/compte', affreteur.compte);
  declarer('transporteur/abonnement', commun.abonnement);
  declarer('transporteur/groupement', commun.groupement);
  declarer('transporteur/utilisateurs', commun.utilisateurs);
  declarer('transporteur/notifications', commun.notifications);

  // --- Concessionnaire ----------------------------------------------
  declarer('concessionnaire/dashboard', supervision.dashboardConcessionnaire);
  declarer('concessionnaire/groupements', supervision.groupements);
  declarer('concessionnaire/roles', supervision.roles);
  declarer('concessionnaire/comptes', supervision.comptes);
  declarer('concessionnaire/credits', supervision.credits);
  declarer('concessionnaire/tarifs', supervision.tarifs);
  declarer('concessionnaire/abonnements', supervision.abonnements);
  declarer('concessionnaire/marche', supervision.etats);
  declarer('concessionnaire/relations', supervision.relationsControle);
  declarer('concessionnaire/duts', documentsDut);
  declarer('concessionnaire/audit', supervision.audit);

  // --- DGTTC ---------------------------------------------------------
  declarer('dgttc/dashboard', supervision.dashboardDgttc);
  declarer('dgttc/etats', supervision.etats);
  declarer('dgttc/relations', supervision.relationsControle);
  declarer('dgttc/acteurs', supervision.acteurs);
  declarer('dgttc/parc', supervision.parc);
  declarer('dgttc/audit', supervision.audit);

  // --- Espace minimal, rôles de niveau 3 -----------------------------
  declarer('minimal/dashboard', commun.accueilMinimal);
  declarer('minimal/groupements', supervision.groupements);
  declarer('minimal/verifications', verifications);
  declarer('minimal/duts', documentsDut);

  // --- Lot b1 : dossier, profil, messages, messagerie sortante ------
  for (const espace of ['affreteur', 'transporteur']) declarer(`${espace}/dossier`, lotB1.dossier);
  for (const espace of ['affreteur', 'transporteur', 'concessionnaire', 'dgttc', 'minimal']) {
    declarer(`${espace}/profil`, lotB1.profil);
    declarer(`${espace}/messages`, lotB1.messages);
  }
  declarer('concessionnaire/messagerie', lotB1.messagerie);
  declarerPublique('inscription', (_ctx, params) => { monter(lotB1.inscription(params)); window.scrollTo(0, 0); });
  declarerPublique('mot-de-passe-oublie', () => { monter(lotB1.motDePasseOublie()); window.scrollTo(0, 0); });
  declarerPublique('boite-simulee', () => { monter(lotB1.boiteSimulee()); window.scrollTo(0, 0); });

  // --- Lot b2 : organisation interne ---------------------------------
  // Les écrans « Utilisateurs » deviennent administrables (même route).
  declarer('affreteur/utilisateurs', organisation.utilisateurs);
  declarer('transporteur/utilisateurs', organisation.utilisateurs);
  declarer('affreteur/filiales', organisation.filialesEtEntites);
  declarer('transporteur/filiales', organisation.filialesEtEntites);
  declarer('affreteur/intermediaires', organisation.intermediaires);
  declarer('transporteur/intermediaires', organisation.intermediaires);
  declarer('intermediaire/dashboard', intermediaire.dashboard);
  declarer('intermediaire/notifications', commun.notifications);
  declarer('intermediaire/mandants', intermediaire.mandants);
  declarer('intermediaire/abonnement', commun.abonnement);
  declarer('intermediaire/groupement', intermediaire.ficheEntreprise);
  declarer('intermediaire/filiales', organisation.filialesEtEntites);
  declarer('intermediaire/utilisateurs', organisation.utilisateurs);

  // --- Lot b3 : attestation de bourse de fret et contrôle sur route ---
  declarer('transporteur/attestations', vueAttestations);
  declarer('minimal/controle', controleRoute);
  declarer('minimal/controles', historiqueControles);
  declarerPubliqueRoute('verifier', (ctx, route) => {
    monter(verificationPublique(ctx, route.page));
    window.scrollTo(0, 0);
  });

  // --- Lot b4 : abonnements, paiements, caisse et finances ------------
  // Les trois premiers écrans de chaque espace remplacent, sous la même route,
  // ceux qui annonçaient le paiement en ligne hors périmètre (le routeur garde
  // la dernière déclaration).
  for (const espace of ['affreteur', 'transporteur']) {
    declarer(`${espace}/abonnement`, financesEntreprise.abonnement);
    declarer(`${espace}/compte`, financesEntreprise.compte);
    declarer(`${espace}/paiements`, financesEntreprise.paiements);
  }
  declarer('concessionnaire/tarifs', tarifsB4);
  declarer('concessionnaire/caisse', caisseB4.caisse);
  declarer('concessionnaire/encaissements', caisseB4.encaissements);
  declarer('concessionnaire/etats-financiers', caisseB4.etatsFinanciers);
  declarer('concessionnaire/contentieux', contentieuxB4);
  declarer('minimal/contentieux', contentieuxB4);
  declarer('minimal/etats-financiers', caisseB4.etatsFinanciers);

  // --- Lot b5 : administration OIC et espace DGTTC --------------------
  // Les écrans « Groupements » et « Profils et habilitations » du
  // concessionnaire deviennent administrables : leur route est redéclarée.
  declarer('concessionnaire/groupements', entreprisesVue);
  declarer('concessionnaire/roles', habilitationsVue);
  declarer('concessionnaire/agents', comptesAdmin);
  declarer('concessionnaire/referentiels', referentielsVue);
  declarer('concessionnaire/incidents', incidentsVue);
  declarer('concessionnaire/flux', fluxOffresVue);
  declarer('affreteur/incidents', incidentsVue);
  declarer('transporteur/incidents', incidentsVue);
  declarer('dgttc/intermediaires', intermediairesVue);
  declarer('dgttc/repartitions', repartitionsVue);
  declarer('dgttc/exports', exportsVue);
  declarer('dgttc/utilisateurs', comptesAdmin);
  declarer('dgttc/incidents', incidentsVue);
}

/* ------------------------------------------------------------------ *
 * Rendu
 * ------------------------------------------------------------------ */

/**
 * @param {any} ctx
 * @param {{zone: any, page: any}} vue
 * @param {Node} contenu
 */
function rendre(ctx, vue, contenu) {
  // Abonnement expiré : aucun autre écran n'est accessible (M10.2). Le blocage
  // laisse néanmoins voir l'abonnement — sans quoi l'utilisateur serait enfermé
  // sans pouvoir comprendre ni agir (finding S12).
  const blocage = blocageAbonnement(ctx);
  const surAbonnement = vue.page?.route === 'abonnement';

  const corps = blocage.bloque && !surAbonnement
    ? el('div.page', {}, [
        bandeau({
          ton: 'err',
          titre: 'Accès suspendu — abonnement expiré',
          message:
            `L’abonnement de votre groupement a expiré. Aucun autre écran ne vous est ` +
            'accessible tant qu’il n’est pas renouvelé.',
          actions: [
            bouton({
              libelle: 'Voir mon abonnement',
              variante: 'primary',
              onClick: () => aller(`#/${vue.zone ? routeCourante().espace : ''}/abonnement`),
            }),
          ],
        }),
      ])
    : contenu;

  monter(
    el('div', {}, [
      shell({
        ctx,
        zoneActive: vue.zone?.id ?? '',
        pageActive: vue.page?.route ?? '',
        titre: vue.page?.libelle ?? '',
        contenu: corps,
        surDeconnexion: () => {
          // L'état de saisie ne doit pas survivre au changement de compte
          // (correctif QA-BROUILLON) : c'est le geste le plus fréquent d'une
          // démonstration multi-rôles.
          affreteur.oublierBrouillon();
          deconnecter();
          aller('#/');
          globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
        },
      }),
    ]),
  );
}

/** Affiche l'écran de connexion. */
function afficherLogin(traiter) {
  // Lot b5 : page publique de saisie d'un code d'accès à usage unique.
  if (routeCourante().espace === 'connexion' && routeCourante().page === 'code') {
    monter(el('div', {}, [saisieCodeAcces(() => aller('#/connexion'))]));
    return;
  }
  const intention = routeCourante().params;
  monter(
    el('div', {}, [
      login(async (email, mdp) => {
        const ctx = await connecter(email, mdp);
        toast(`Bienvenue. Espace ouvert.`);
        if (intention.selection && intention.type) {
          try { aller(routeActionPublique(ctx, intention.type, intention.selection, intention.retour)); }
          catch (e) {
            aller(retourPublic(intention.retour));
            toast(e.message, 'err');
          }
        } else if (intention.action === 'publier') {
          try { aller(routePublication(ctx)); }
          catch(e) { aller(retourPublic(intention.retour)); toast(e.message, 'err'); }
        } else aller(routeAccueil(ctx));
        traiter();
      }, { retour: retourPublic(intention.retour), intention: intention.type }),
    ]),
  );
}

/* ------------------------------------------------------------------ *
 * Démarrage
 * ------------------------------------------------------------------ */

async function demarrerApplication() {
  appliquerTheme();
  installerListesRecherche(); // Lot b0 : tout <select> inséré reçoit sa recherche.
  document.querySelector('.skip-link')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('contenu')?.focus();
  });

  // Le filet d'abord : une erreur survenue pendant l'amorcage doit etre vue,
  // pas seulement celles qui suivent le demarrage.
  installerSentinelle();

  let degradation = null;
  const bilan = initialiserPersistance({
    onDegradation: (raison) => {
      degradation = raison;
    },
  });

  // Une transaction interrompue a été rejouée : on le dit, plutôt que de laisser
  // croire à une perte de données.
  if (bilan.restauree) {
    console.warn('[B2F] Transaction interrompue annulée :', bilan.collections.join(', '));
  }

  if (!dejaAmorce()) await amorcer();
  await completerJeuAntiFraude();
  await amorcerLotB1();
  await completerJeuLotB2(); // Lot b2 : intermédiaire, mandats, filiale de démonstration
  await completerLotB3();
  await amorcerLotB5(); // Lot b5
  chargerParametrage(); // Lot b5 : habilitations paramétrées
  await enrichirDemo();
  enrichirSensDemo();
  initialiserStationnementDemo();
  await amorcerLotB4(); // Lot b4

  // Messages non encore remis à la plateforme DUT : renvoyés dès que le relais répond.
  reprendreFileDut();

  declarerRoutes();

  const traiter = demarrer({
    contexte: () => {
      // Correctif anti-fraude n° 4 : les attentes échues sont closes avant tout
      // affichage. Sans tâche planifiée, c'est le moment où le code s'exécute.
      try { expirerEchus(); } catch (e) { console.warn('[B2F] Expiration non appliquée :', e); }
      return contexteCourant() ?? reprendreSession();
    },
    surLogin: () => afficherLogin(() => traiter()),
    surAccueil: ctx => { monter(accueil(ctx)); window.scrollTo(0,0); },
    surPublic: (ctx, params) => {
      const focus = document.activeElement?.dataset?.focus;
      const vue = explorer(ctx, params);
      monter(vue);
      if (focus) [...vue.querySelectorAll('[data-focus]')]
        .find(n => n.dataset.focus === focus)?.focus({ preventScroll:true });
    },
    rendre,
  });

  await traiter();

  if (degradation) toast(degradation, 'err');
}

demarrerApplication().catch((erreur) => {
  console.error('[B2F] Démarrage impossible :', erreur);
  const app = document.getElementById('app');
  if (app) {
    remplacer(
      app,
      el('div.refus', { role: 'alert' }, [
        el('h1', { text: 'La démonstration n’a pas pu démarrer' }),
        el('p', { text: erreur instanceof Error ? erreur.message : String(erreur) }),
        location.protocol === 'file:'
          ? el('p.refus-note', {
              text:
                'Servez la page depuis http://localhost:8081 : les modules ES et Web ' +
                'Crypto exigent un contexte sécurisé, qu’un fichier ouvert en file:// ' +
                'ne fournit pas.',
            })
          : null,
      ]),
    );
  }
});
