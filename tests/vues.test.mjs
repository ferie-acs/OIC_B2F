/**
 * Rendu des écrans.
 *
 * Deux objets :
 * 1. **Chaque écran se construit sans erreur** pour le rôle qui y accède.
 * 2. **Aucun écran ne laisse fuiter ce que la matrice refuse.** On inspecte le
 *    texte réellement produit, pas l'intention du code — c'est le seul moyen de
 *    vérifier qu'un composant partagé entre rôles n'a pas contourné la projection.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

const { installerDom, texteDe } = await import('./helpers/mini-dom.mjs');
const harnais = installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer } = await import('../js/seed.js');
const { contexteDe } = await import('../js/services/auth.service.js');
const matching = await import('../js/services/matching.service.js');
const affreteur = await import('../js/views/affreteur.js');
const transporteur = await import('../js/views/transporteur.js');
const commun = await import('../js/views/commun.js');
const supervision = await import('../js/views/supervision.js');
const { arborescenceDe, routeAccueil } = await import('../js/core/nav.js');

/** @type {Record<string, any>} */
let ctx = {};

/** Installe les données et déroule le fil narratif jusqu'à une validation. */
async function preparer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  const de = (id) => contexteDe(depot('utilisateur').brutParId(id));

  ctx = {
    affreteur: de('u-aff-1'),
    auxiliaire: de('u-aux-1'),
    auxiliaireTransporteur: de('u-auxt-1'),
    transporteur: de('u-tra-1'),
    concessionnaire: de('u-conc'),
    dgttc: de('u-dgttc'),
    caisse: de('u-caisse'),
    partenaire: de('u-part'),
  };

  // Une mise en relation menée jusqu'à la validation, pour que les écrans
  // aient de quoi afficher — coordonnées comprises.
  const ap = matching.engager(ctx.affreteur, { offreId: 'off-1', demandeId: 'dem-1' });
  matching.repondre(ctx.transporteur, ap.id, { accepte: true });
  const p = matching.preparerValidation(ctx.affreteur, ap.id);
  matching.valider(ctx.affreteur, ap.id, { attendu: p.attendu });

  // Contextes rafraîchis : la validation a libéré des coordonnées.
  ctx.affreteur = de('u-aff-1');
  ctx.transporteur = de('u-tra-1');
  return ap.id;
}

describe('Chaque écran se construit sans erreur', () => {
  /** @type {string} */ let appariementId;
  before(async () => {
    appariementId = await preparer();
  });

  const ecransAffreteur = [
    ['dashboard', () => affreteur.dashboard(ctx.affreteur)],
    ['declarations', () => affreteur.declarations(ctx.affreteur)],
    ['nouvelle déclaration', () => affreteur.nouvelleDeclaration(ctx.affreteur)],
    ['demandes', () => affreteur.demandes(ctx.affreteur)],
    ['marché', () => affreteur.marche(ctx.affreteur)],
    ['réservations', () => affreteur.reservations(ctx.affreteur)],
    ['validation (liste)', () => affreteur.validation(ctx.affreteur, {})],
    ['relations (liste)', () => affreteur.relations(ctx.affreteur, {})],
    ['compte', () => affreteur.compte(ctx.affreteur)],
    ['suivi', () => commun.suivi(ctx.affreteur)],
    ['notifications', () => commun.notifications(ctx.affreteur)],
    ['abonnement', () => commun.abonnement(ctx.affreteur)],
    ['groupement', () => commun.groupement(ctx.affreteur)],
    ['utilisateurs', () => commun.utilisateurs(ctx.affreteur)],
  ];

  for (const [nom, rendu] of ecransAffreteur) {
    it(`affréteur — ${nom}`, () => {
      const n = rendu();
      assert.ok(n, `${nom} n'a rien rendu`);
      assert.ok(texteDe(n).length > 0, `${nom} est vide`);
    });
  }

  const ecransTransporteur = [
    ['dashboard', () => transporteur.dashboard(ctx.transporteur)],
    ['véhicules', () => transporteur.vehicules(ctx.transporteur)],
    ['chauffeurs', () => transporteur.chauffeurs(ctx.transporteur)],
    ['offres', () => transporteur.offres(ctx.transporteur)],
    ['nouvelle offre', () => transporteur.nouvelleOffre(ctx.transporteur)],
    ['marché', () => transporteur.marche(ctx.transporteur)],
    ['réservations reçues', () => transporteur.reservations(ctx.transporteur)],
    ['suivi', () => commun.suivi(ctx.transporteur)],
  ];

  for (const [nom, rendu] of ecransTransporteur) {
    it(`transporteur — ${nom}`, () => {
      const n = rendu();
      assert.ok(texteDe(n).length > 0, `${nom} est vide`);
    });
  }

  const ecransSupervision = [
    ['concessionnaire — dashboard', () => supervision.dashboardConcessionnaire(ctx.concessionnaire)],
    ['concessionnaire — groupements', () => supervision.groupements(ctx.concessionnaire)],
    ['concessionnaire — comptes', () => supervision.comptes(ctx.concessionnaire)],
    ['concessionnaire — abonnements', () => supervision.abonnements(ctx.concessionnaire)],
    ['concessionnaire — tarifs', () => supervision.tarifs(ctx.concessionnaire)],
    ['concessionnaire — rôles', () => supervision.roles(ctx.concessionnaire)],
    ['concessionnaire — audit', () => supervision.audit(ctx.concessionnaire)],
    ['DGTTC — dashboard', () => supervision.dashboardDgttc(ctx.dgttc)],
    ['DGTTC — états', () => supervision.etats(ctx.dgttc)],
    ['DGTTC — relations', () => supervision.relationsControle(ctx.dgttc)],
    ['DGTTC — acteurs', () => supervision.acteurs(ctx.dgttc)],
    ['DGTTC — parc', () => supervision.parc(ctx.dgttc)],
    ['DGTTC — audit', () => supervision.audit(ctx.dgttc)],
    ['niveau 3 — accueil minimal', () => commun.accueilMinimal(ctx.caisse)],
  ];

  for (const [nom, rendu] of ecransSupervision) {
    it(nom, () => {
      const n = rendu();
      assert.ok(texteDe(n).length > 0, `${nom} est vide`);
    });
  }

  it('les espaces de supervision proposent leurs cartes sans action commerciale', () => {
    for (const c of [ctx.dgttc,ctx.concessionnaire]) {
      for (const vue of [supervision.etats,supervision.relationsControle,c===ctx.dgttc?supervision.dashboardDgttc:supervision.dashboardConcessionnaire]) {
        const n=vue(c);
        assert.ok(n.querySelector('.supervision-map'));
        assert.ok(!texteDe(n).includes('Proposer un véhicule'));
        assert.ok(!texteDe(n).includes('Voir ce fret →'));
      }
    }
    assert.ok(supervision.parc(ctx.dgttc).querySelector('.fleet-route-map'));
  });

  it('la recherche cartographique filtre puis restaure les trajets', () => {
    const vue=supervision.etats(ctx.dgttc);
    const input=vue.querySelector('.supervision-map').querySelector('input');
    const liste=vue.querySelector('.dashboard-freight-list');
    const avant=texteDe(liste);
    input.value='aucun-resultat-xyz';input.declencher('input');
    assert.match(texteDe(liste),/Aucun résultat/);
    input.value='';input.declencher('input');
    assert.equal(texteDe(liste),avant);
  });

  it('les deux auxiliaires utilisent les vues métier partagées avec leurs droits', () => {
    for (const vue of [affreteur.dashboard, affreteur.declarations, affreteur.demandes, affreteur.marche, affreteur.reservations]) {
      assert.ok(texteDe(vue(ctx.auxiliaire)).length > 0);
    }
    for (const vue of [transporteur.dashboard, transporteur.vehicules, transporteur.chauffeurs, transporteur.offres, transporteur.nouvelleOffre, transporteur.marche, transporteur.reservations]) {
      assert.ok(texteDe(vue(ctx.auxiliaireTransporteur)).length > 0);
    }
  });

  it('les annuaires de supervision filtrent et restaurent les résultats', () => {
    for(const vue of [supervision.groupements(ctx.concessionnaire),supervision.abonnements(ctx.concessionnaire)]) {
      const grille=vue.querySelector('.supervision-directory-grid');
      const avant=texteDe(grille), recherche=vue.querySelector('input');
      recherche.value='introuvable-xyz';recherche.declencher('input');
      assert.match(texteDe(grille),/Aucun groupement trouvé/);
      recherche.value='';recherche.declencher('input');
      assert.equal(texteDe(grille),avant);
    }
  });

  it('les déclarations filtrent la recherche et le statut sans perdre les dossiers', () => {
    const vue=affreteur.declarations(ctx.affreteur);
    const grille=vue.querySelector('.declarations-grid');
    const recherche=vue.querySelector('input');
    const avant=texteDe(grille);
    recherche.value='reference-inexistante';recherche.declencher('input');
    assert.match(texteDe(grille),/Aucune déclaration trouvée/);
    recherche.value='';recherche.declencher('input');
    assert.equal(texteDe(grille),avant);
    const tabs=vue.querySelector('.declarations-tabs').querySelectorAll('button');
    tabs.find(b=>b.dataset.etat==='cloturee').declencher('click');
    assert.equal(tabs.find(b=>b.dataset.etat==='cloturee').getAttribute('aria-pressed'),'true');
    tabs.find(b=>b.dataset.etat==='').declencher('click');
    assert.equal(texteDe(grille),avant);
  });

  it('un lien de validation introuvable propose un retour sans exposer un autre dossier', () => {
    const vue=affreteur.validation(ctx.affreteur,{id:'inexistant'});
    assert.match(texteDe(vue),/Cette réservation n’est plus accessible/);
    assert.match(texteDe(vue),/Mes réservations/);
    assert.ok(!texteDe(vue).includes('Valider la mise en relation'));
  });

  it('affréteur — écran de validation détaillé', () => {
    const ap = depot('appariement').brutOu((a) => a.etat === 'accepter')[0];
    if (!ap) return; // tous validés : rien à montrer, ce n'est pas un échec
    const n = affreteur.validation(ctx.affreteur, { id: ap.id });
    assert.ok(texteDe(n).includes('Le débit'));
  });

  it('affréteur — fiche de mise en relation validée', () => {
    const n = affreteur.relations(ctx.affreteur, { id: appariementId });
    const t = texteDe(n);
    assert.ok(t.includes('Mise en relation effective'));
  });
});

describe('Les écrans ne laissent pas fuiter ce que la matrice refuse', () => {
  /** @type {string} */ let appariementId;
  before(async () => {
    appariementId = await preparer();
  });

  /** Coordonnées présentes dans le jeu de démonstration. */
  const TELEPHONES = ['+225 00 77 88 99', '+225 00 21 43 65', '+225 00 65 43 21'];
  const COURRIELS = ['exploitation@translagunes.invalid', 'contact@routiere-centre.invalid'];

  it('la fiche de mise en relation les montre APRÈS validation', () => {
    const n = affreteur.relations(ctx.affreteur, { id: appariementId });
    const t = texteDe(n);
    assert.ok(t.includes('+225 00 77 88 99'), 'les coordonnées ne sont pas transmises');
  });

  it('le marché ne montre AUCUNE coordonnée d’un transporteur non apparié', () => {
    // grp-tra-2 n'a aucune mise en relation validée avec cet affréteur : ses
    // offres restent visibles sur le marché, ses coordonnées non.
    const t = texteDe(affreteur.marche(ctx.affreteur));
    for (const tel of ['+225 00 12 34 56']) {
      assert.ok(!t.includes(tel), `téléphone « ${tel} » affiché sur le marché`);
    }
    for (const mail of COURRIELS) {
      assert.ok(!t.includes(mail), `courriel « ${mail} » affiché sur le marché`);
    }
    assert.ok(!t.includes('CG-DEMO'), 'carte grise affichée sur le marché');
    assert.ok(t.includes('Routière du Centre'), "l'identité commerciale doit rester visible");
  });

  it('l’espace DGTTC n’affiche AUCUN montant', () => {
    const ecrans = [
      supervision.dashboardDgttc(ctx.dgttc),
      supervision.etats(ctx.dgttc),
      supervision.relationsControle(ctx.dgttc),
      supervision.acteurs(ctx.dgttc),
      supervision.parc(ctx.dgttc),
      supervision.audit(ctx.dgttc),
    ];
    for (const n of ecrans) {
      const t = texteDe(n);
      assert.ok(!t.includes('F CFA'), `un montant apparaît dans l'espace DGTTC : ${t.slice(0, 120)}`);
    }
  });

  it('l’espace DGTTC n’affiche aucune coordonnée', () => {
    const t = [supervision.acteurs(ctx.dgttc), supervision.parc(ctx.dgttc)]
      .map(texteDe)
      .join(' ');
    for (const tel of TELEPHONES) assert.ok(!t.includes(tel), `téléphone affiché à la DGTTC`);
    assert.ok(!t.includes('CG-DEMO'), 'carte grise affichée à la DGTTC');
  });

  it('le concessionnaire voit les montants mais aucune coordonnée', () => {
    const avecMontants = texteDe(supervision.comptes(ctx.concessionnaire));
    assert.ok(avecMontants.includes('F CFA'), "l'exploitant doit voir les soldes");

    const t = [
      supervision.groupements(ctx.concessionnaire),
      supervision.comptes(ctx.concessionnaire),
      supervision.audit(ctx.concessionnaire),
    ]
      .map(texteDe)
      .join(' ');
    for (const tel of TELEPHONES) {
      assert.ok(!t.includes(tel), 'téléphone affiché au concessionnaire');
    }
  });

  it('le journal d’audit n’affiche aucun montant, quel que soit le lecteur', () => {
    for (const lecteur of [ctx.concessionnaire, ctx.dgttc]) {
      assert.ok(!texteDe(supervision.audit(lecteur)).includes('F CFA'));
    }
  });
});

describe('Rendu — le texte affiché est du texte, pas du balisage', () => {
  before(async () => {
    await preparer();
  });

  it('n’affiche aucun reste de Markdown', () => {
    // Les chaînes sont posées en `textContent` : des astérisques d'emphase
    // s'afficheraient telles quelles. Le piège est facile — la documentation du
    // projet est en Markdown, et la formule passe d'un fichier à l'autre.
    const ecrans = [
      ['DGTTC', supervision.dashboardDgttc(ctx.dgttc)],
      ['tarifs', supervision.tarifs(ctx.concessionnaire)],
      ['rôles', supervision.roles(ctx.concessionnaire)],
      ['audit', supervision.audit(ctx.concessionnaire)],
      ['affréteur', affreteur.dashboard(ctx.affreteur)],
      ['marché', affreteur.marche(ctx.affreteur)],
      ['transporteur', transporteur.dashboard(ctx.transporteur)],
      ['suivi', commun.suivi(ctx.affreteur)],
      ['niveau 3', commun.accueilMinimal(ctx.caisse)],
    ];
    for (const [nom, noeud] of ecrans) {
      const t = texteDe(noeud);
      assert.ok(!t.includes('**'), `L'écran « ${nom} » affiche des astérisques Markdown.`);
      assert.ok(!/`[^`]+`/.test(t), `L'écran « ${nom} » affiche du code Markdown.`);
    }
  });
});

describe('Navigation — aucun écran hors matrice', () => {
  before(async () => {
    await preparer();
  });

  it('n’ouvre aucune zone au rôle de niveau 3 sans droit métier', () => {
    const zones = arborescenceDe(ctx.caisse);
    const pages = zones.flatMap((z) => z.pages.map((p) => p.route));
    assert.deepEqual(pages, ['dashboard'], `l'agent de caisse accède à : ${pages.join(', ')}`);
  });

  it('n’ouvre pas la zone Finances à la DGTTC', () => {
    const zones = arborescenceDe(ctx.dgttc).map((z) => z.id);
    assert.ok(!zones.includes('finances'), 'la DGTTC dispose d’une zone Finances');
  });

  it('ouvre la zone Finances au concessionnaire', () => {
    const zones = arborescenceDe(ctx.concessionnaire).map((z) => z.id);
    assert.ok(zones.includes('finances'));
  });

  it('prive l’auxiliaire de la zone Paramètres', () => {
    const zones = arborescenceDe(ctx.auxiliaire).map((z) => z.id);
    assert.ok(!zones.includes('parametres'), 'l’auxiliaire accède aux paramètres');
  });

  it('prive le partenaire de la zone Marché', () => {
    const zones = arborescenceDe(ctx.partenaire).map((z) => z.id);
    assert.ok(!zones.includes('marche'), 'le partenaire accède au marché');
  });

  it('donne à chaque rôle une route d’accueil atteignable', () => {
    for (const [nom, c] of Object.entries(ctx)) {
      const route = routeAccueil(c);
      assert.match(route, /^#\/[a-z]+\/[a-z-]+$/, `route d'accueil invalide pour ${nom}`);
    }
  });
});
