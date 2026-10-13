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
/* Lot b1 : inscription, dossier, profil, messagerie */
import { amorcerLotB1 } from './seed-lot-b1.js';
import { declarerPublique } from './core/router.js';
import * as lotB1 from './views/lot-b1.js';

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
  await enrichirDemo();
  enrichirSensDemo();
  initialiserStationnementDemo();

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
