/**
 * Campagne QA adversariale — J3.
 *
 * Deux blocs, volontairement séparés :
 *
 * 1. **Non-régression** — ce que la campagne a éprouvé et trouvé sain. Ces tests
 *    passent aujourd'hui. Ils figent des garanties que la suite existante ne
 *    couvrait pas : double clic réel, deux onglets, saturation du stockage,
 *    cloisonnement par URL devinée.
 * 2. **Bugs ouverts** — ces tests **échouent**, et c'est leur rôle. Chacun est le
 *    test qui aurait attrapé le défaut. Ils deviennent verts quand
 *    `senior-fullstack` corrige. Ne pas les neutraliser pour « avoir du vert ».
 *
 * Exécution ciblée :
 *   node --test tests/qa-adversarial.test.mjs
 *
 * @see docs/qa/01-rapport-campagne-adversariale.md
 */

import { strict as assert } from 'node:assert';
import { before, beforeEach, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const memoireSession = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoireSession.has(k) ? memoireSession.get(k) : null),
  setItem: (k, v) => void memoireSession.set(k, v),
  removeItem: (k) => void memoireSession.delete(k),
};

const { installerDom, texteDe, parClasse } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot, stockageInterne } = await import(
  '../js/repositories/index.js'
);
const { amorcer } = await import('../js/seed.js');
const { contexteDe } = await import('../js/services/auth.service.js');
const matching = await import('../js/services/matching.service.js');
const compte = await import('../js/services/compte.service.js');
const flotte = await import('../js/services/flotte.service.js');
const fret = await import('../js/services/fret.service.js');
const transportSvc = await import('../js/services/transport.service.js');
const affreteurV = await import('../js/views/affreteur.js');
const { ETAT_APPARIEMENT, ETAT_DEMANDE, ETAT_OFFRE } = await import('../js/domain/enums.js');

/* ------------------------------------------------------------------ *
 * Outillage
 * ------------------------------------------------------------------ */

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));
const ctxTransporteurDe = (groupementId) =>
  contexteDe(
    depot('utilisateur').brutOu(
      (u) => u.groupementId === groupementId && u.roleId === 'transporteur',
    )[0],
  );
const refs = (famille) => depot('referentiel').brutOu((r) => r.famille === famille && r.actif);
const dansNJours = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 16);

async function installer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
}

/** Monte un dossier jusqu'à l'état `accepter`, prêt à valider. */
function dossierAccepte(ctxAffreteur = ctxDe('u-aff-1')) {
  const demande = depot('demande').brutOu(
    (d) => d.groupementId === ctxAffreteur.groupementId && d.etat === ETAT_DEMANDE.PUBLIEE,
  )[0];
  assert.ok(demande, 'le jeu de démonstration doit offrir une demande publiée');
  const offre = depot('offre').brutOu(
    (o) => o.etat === ETAT_OFFRE.DISPONIBLE && matching.fenetresSeRecouvrent(o, demande),
  )[0];
  assert.ok(offre, 'le jeu de démonstration doit offrir un véhicule compatible');

  const appariement = matching.engager(ctxAffreteur, {
    offreId: offre.id,
    demandeId: demande.id,
  });
  matching.repondre(ctxTransporteurDe(offre.groupementId), appariement.id, { accepte: true });
  return { appariement, offre, demande };
}

/** Monte un dossier jusqu'à `valider` et rend le transport créé. */
function dossierValide(ctxAffreteur = ctxDe('u-aff-1')) {
  const { appariement, offre, demande } = dossierAccepte(ctxAffreteur);
  const prepare = matching.preparerValidation(ctxAffreteur, appariement.id);
  const resultat = matching.valider(ctxAffreteur, appariement.id, { attendu: prepare.attendu });
  return { ...resultat, offre, demande };
}

const texte = (noeud) => texteDe(noeud);

/* ================================================================== *
 * BLOC 1 — Non-régression : éprouvé, sain
 * ================================================================== */

describe('QA — concurrence sur l’acte financier (finding S4)', () => {
  beforeEach(installer);

  it('un double clic sur « Valider » ne produit qu’un seul double débit', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement } = dossierAccepte(aff);
    const prepare = matching.preparerValidation(aff, appariement.id);
    const soldeAvant = compte.soldeDe('grp-aff-1');

    matching.valider(aff, appariement.id, { attendu: prepare.attendu });
    // Le second clic arrive sur le même bouton : la vue ne le désactive pas.
    assert.throws(
      () => matching.valider(aff, appariement.id, { attendu: prepare.attendu }),
      /plus en attente de validation/,
    );

    const operations = depot('operation').brutOu((o) => o.appariementId === appariement.id);
    assert.equal(operations.length, 2, 'exactement deux écritures, une par partie');
    assert.equal(compte.soldeDe('grp-aff-1'), soldeAvant - prepare.fraisAffreteur);
    assert.equal(
      depot('transport').brutOu((t) => t.appariementId === appariement.id).length,
      1,
      'un seul transport créé',
    );
  });

  it('deux onglets ouverts sur le même écran : le second est refusé, rien n’est écrit deux fois', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement } = dossierAccepte(aff);
    // Les deux écrans sont construits AVANT toute validation : deux instantanés
    // de versions identiques, pris au même état du monde.
    const ongletA = matching.preparerValidation(aff, appariement.id);
    const ongletB = matching.preparerValidation(aff, appariement.id);
    const soldeAvant = compte.soldeDe('grp-aff-1');

    matching.valider(aff, appariement.id, { attendu: ongletA.attendu });
    assert.throws(() => matching.valider(aff, appariement.id, { attendu: ongletB.attendu }));

    assert.equal(depot('operation').brutOu((o) => o.appariementId === appariement.id).length, 2);
    assert.equal(compte.soldeDe('grp-aff-1'), soldeAvant - ongletA.fraisAffreteur);
  });

  it('un tiers ne peut pas valider la mise en relation d’autrui', () => {
    const { appariement } = dossierAccepte(ctxDe('u-aff-1'));
    assert.throws(
      () => matching.valider(ctxDe('u-tra-2'), appariement.id, {}),
      /ne concerne pas votre groupement/,
    );
  });

  it('le refus pour solde insuffisant de la contrepartie ne chiffre aucun montant tiers', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement, offre } = dossierAccepte(aff);
    const solde = compte.soldeDe(offre.groupementId);
    depot('operation').creer({
      id: 'ope-qa-vidage',
      groupementId: offre.groupementId,
      sens: 'debit',
      montant: solde,
      motif: 'abonnement',
      libelle: 'Vidage QA',
      horodatage: new Date().toISOString(),
      auteurUtilisateurId: 'u-conc',
      demo: true,
    });

    const prepare = matching.preparerValidation(aff, appariement.id);
    assert.equal(prepare.possible, false);
    const message = prepare.refus.join(' ');
    assert.match(message, /contrepartie/);
    assert.doesNotMatch(message, /\d[\d\s  ]{2,}/, 'aucun montant dans le motif de refus');
  });
});

describe('QA — atomicité sous saturation du stockage', () => {
  it('un quota dépassé n’écrit rien du tout et ne laisse aucun journal résiduel', async () => {
    await installer();
    const aff = ctxDe('u-aff-1');
    const { appariement } = dossierAccepte(aff);

    // On rejoue l'état courant sur un backend qui refuse de grossir.
    const memoire = new Map();
    const source = stockageInterne();
    const collections = [
      'referentiels', 'tarifs', 'groupements', 'users', 'abonnements', 'vehicules',
      'chauffeurs', 'declarations', 'demandes', 'offres', 'appariements', 'operations',
      'transports', 'audit', 'notifications',
    ];
    for (const c of collections) {
      try {
        memoire.set(`b2f_${c}`, JSON.stringify(source.lire(c)));
      } catch {
        /* collection absente : rien à recopier */
      }
    }
    let quota = Infinity;
    const taille = () => [...memoire.values()].reduce((n, v) => n + v.length, 0);
    const backend = {
      getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
      setItem: (k, v) => {
        const delta = v.length - (memoire.get(k)?.length ?? 0);
        if (taille() + delta > quota) {
          const e = new Error('The quota has been exceeded.');
          e.name = 'QuotaExceededError';
          throw e;
        }
        memoire.set(k, v);
      },
      removeItem: (k) => void memoire.delete(k),
    };
    initialiserPersistance({ backend });

    const aff2 = ctxDe('u-aff-1');
    const soldeAvant = compte.soldeDe('grp-aff-1');
    const operationsAvant = depot('operation').brutTous().length;
    // Le jeu de démonstration porte désormais un second dossier complet
    // appartenant à un autre groupement (note de rétro QA) : ce qui doit être
    // nul, c'est le DELTA, pas le total.
    const transportsAvant = depot('transport').brutTous().length;
    const prepare = matching.preparerValidation(aff2, appariement.id);

    quota = taille() + 200; // il ne reste pas de quoi écrire le lot
    assert.throws(() => matching.valider(aff2, appariement.id, { attendu: prepare.attendu }));
    quota = Infinity;

    assert.equal(compte.soldeDe('grp-aff-1'), soldeAvant, 'aucun débit conservé');
    assert.equal(depot('operation').brutTous().length, operationsAvant);
    assert.equal(depot('appariement').brutParId(appariement.id).etat, ETAT_APPARIEMENT.ACCEPTER);
    assert.equal(depot('transport').brutTous().length, transportsAvant, 'aucun transport créé');
    assert.equal(memoire.has('b2f_tx_journal'), false, 'aucun journal d’annulation résiduel');
  });
});

describe('QA — cloisonnement des coordonnées et du journal de transport', () => {
  beforeEach(installer);

  it('les observations du journal restent fermées aux tiers et aux rôles de contrôle', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement, transport } = dossierValide(aff);
    const ctxT = ctxTransporteurDe(appariement.groupementTransporteurId);
    transportSvc.avancer(ctxT, transport.id, { observation: 'MARQUEUR-OBSERVATION-QA' });
    transportSvc.signalerIncident(ctxT, transport.id, {
      nature: 'panne',
      description: 'MARQUEUR-INCIDENT-QA',
    });

    // La partie prenante lit : c'est ce que la plateforme a vendu.
    const partie = transportSvc
      .transportsVisibles(ctxDe('u-aff-1'))
      .find((t) => t.id === transport.id);
    assert.match(JSON.stringify(partie.journal), /MARQUEUR-OBSERVATION-QA/);

    // Personne d'autre.
    for (const id of ['u-tra-2', 'u-conc', 'u-dgttc']) {
      let servis = [];
      try {
        servis = transportSvc.transportsVisibles(ctxDe(id));
      } catch {
        servis = [];
      }
      const vu = servis.find((t) => t.id === transport.id);
      if (vu) {
        assert.doesNotMatch(
          JSON.stringify(vu.journal ?? []),
          /MARQUEUR-/,
          `le rôle ${id} ne doit lire aucune observation de ce dossier`,
        );
      }
    }
  });

  it('une mise en relation validée ne libère pas les coordonnées d’un AUTRE dossier', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement } = dossierValide(aff);
    const ctxFrais = ctxDe('u-aff-1');

    // Tout objet du transporteur qui n'est pas celui de ce dossier reste fermé.
    const autresVehicules = depot('vehicule').brutOu(
      (v) => v.groupementId === appariement.groupementTransporteurId,
    );
    const offreDuDossier = depot('offre').brutParId(appariement.offreId);
    for (const v of autresVehicules) {
      if (v.id === offreDuDossier.vehiculeId) continue;
      const projete = depot('vehicule').lire(ctxFrais, v.id);
      assert.equal(
        projete.carteGrise,
        undefined,
        `la carte grise du véhicule ${v.id}, étranger au dossier, ne doit pas être servie`,
      );
    }
  });

  it('les coordonnées d’une contrepartie ne sortent pas avant validation', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement } = dossierAccepte(aff);
    const vue = affreteurV.relations(ctxDe('u-aff-1'), { id: appariement.id });
    const groupement = depot('groupement').brutParId(appariement.groupementTransporteurId);
    assert.equal(
      texte(vue).includes(groupement.contactTelephone),
      false,
      'aucune coordonnée ne doit être servie avant la validation',
    );
  });
});

describe('QA — validation des saisies de l’assistant de déclaration', () => {
  beforeEach(installer);

  const base = () => ({
    fret: {
      libelle: 'Fret QA',
      provenanceId: refs('localites')[0].id,
      destinationId: refs('localites')[1].id,
    },
    besoin: {
      departPrevu: dansNJours(3),
      arriveePrevue: dansNJours(5),
      capaciteId: refs('capacites')[0].id,
      carrosserieId: refs('carrosseries')[0].id,
    },
    lignes: [{ produitId: refs('produits_sh')[0].id, poidsT: 10 }],
  });

  const refuse = (nom, modifier) =>
    it(`refuse : ${nom}`, () => {
      const saisie = base();
      modifier(saisie);
      assert.throws(() => fret.publierFret(ctxDe('u-aff-1'), saisie));
    });

  refuse('poids négatif', (s) => void (s.lignes[0].poidsT = -10));
  refuse('poids nul', (s) => void (s.lignes[0].poidsT = 0));
  refuse('poids NaN', (s) => void (s.lignes[0].poidsT = NaN));
  refuse('volume négatif', (s) => void (s.lignes[0].volumeM3 = -5));
  refuse('nombre de colis nul', (s) => void (s.lignes[0].nombreColis = 0));
  refuse('nombre de colis décimal', (s) => void (s.lignes[0].nombreColis = 2.5));
  refuse('aucune ligne de marchandise', (s) => void (s.lignes = []));
  refuse('départ déjà passé', (s) => void (s.besoin.departPrevu = dansNJours(-5)));
  refuse('arrivée antérieure au départ', (s) => {
    s.besoin.departPrevu = dansNJours(9);
    s.besoin.arriveePrevue = dansNJours(3);
  });
  refuse('arrivée égale au départ', (s) => {
    s.besoin.departPrevu = dansNJours(9);
    s.besoin.arriveePrevue = dansNJours(9);
  });
  refuse('date illisible', (s) => void (s.besoin.departPrevu = 'pas-une-date'));
  refuse('libellé au-delà de 120 caractères', (s) => void (s.fret.libelle = 'A'.repeat(500)));
  refuse('destination identique à la provenance', (s) => {
    s.fret.destinationId = s.fret.provenanceId;
  });
});

describe('QA — cas d’échec spécifiés par la conception UX (§ 2.2)', () => {
  beforeEach(installer);

  it('cas 1 — solde insuffisant : nomme la partie, chiffre le manque, rassure sur la réservation', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement } = dossierAccepte(aff);
    const solde = compte.soldeDe('grp-aff-1');
    depot('operation').creer({
      id: 'ope-qa-vidage-aff',
      groupementId: 'grp-aff-1',
      sens: 'debit',
      montant: solde,
      motif: 'abonnement',
      libelle: 'Vidage QA',
      horodatage: new Date().toISOString(),
      auteurUtilisateurId: 'u-conc',
      demo: true,
    });
    const t = texte(affreteurV.validation(ctxDe('u-aff-1'), { id: appariement.id }));
    assert.match(t, /Validation impossible/);
    assert.match(t, /il manque/i, 'le manque doit être chiffré');
    assert.match(t, /acquise/i, 'la réservation doit être dite acquise');
  });

  it('cas 3 — rejet motivé : le motif est affiché et l’offre retourne au marché', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement, offre } = dossierAccepte(aff);
    // dossierAccepte a accepté : on refait un rejet propre.
    initialiserPersistanceEtRejet();
    function initialiserPersistanceEtRejet() {}
    matching.annuler(ctxDe('u-aff-1'), appariement.id);
    const second = matching.engager(ctxDe('u-aff-1'), {
      offreId: offre.id,
      demandeId: appariement.demandeId,
    });
    matching.repondre(ctxTransporteurDe(offre.groupementId), second.id, {
      accepte: false,
      motif: 'dates_incompatibles',
      precision: 'Camion déjà pris',
    });
    const t = texte(affreteurV.reservations(ctxDe('u-aff-1')));
    assert.match(t, /Dates incompatibles/, 'le motif traduit doit être affiché');
    assert.match(t, /Chercher un autre véhicule/, 'une action de repli doit être proposée');
    assert.equal(depot('offre').brutParId(offre.id).etat, ETAT_OFFRE.DISPONIBLE);
  });

  it('cas 5 — véhicule à carte de transport échue : reste au parc, refusé à la publication', () => {
    const ctx = ctxDe('u-tra-1');
    const nonPubliables = flotte.mesVehicules(ctx).filter((v) => !v.publiable);
    assert.ok(nonPubliables.length > 0, 'le jeu de démonstration doit porter ce cas');
    assert.throws(
      () =>
        flotte.publierOffre(ctx, {
          vehiculeId: nonPubliables[0].id,
          localiteDepartId: refs('localites')[0].id,
          localiteArriveeId: refs('localites')[1].id,
          disponibleDu: dansNJours(1).slice(0, 10),
          disponibleAu: dansNJours(5).slice(0, 10),
          prixKmT: 100,
        }),
      /carte de transport/i,
    );
  });
});

/* ================================================================== *
 * BLOC 2 — Bugs ouverts. CES TESTS DOIVENT ÉCHOUER.
 * Ils passent au vert quand le défaut est corrigé. Ne pas les désactiver.
 * ================================================================== */

describe('QA — BUGS OUVERTS (rouges attendus jusqu’à correction)', () => {
  beforeEach(installer);

  it('QA-01 — un tiers ne doit pas lire les montants d’une mise en relation d’autrui', () => {
    const { appariement } = dossierValide(ctxDe('u-aff-1'));
    // Le transporteur 2 est étranger au dossier, mais sa route
    // #/transporteur/relations/:id sert la même vue.
    const t = texte(affreteurV.relations(ctxDe('u-tra-2'), { id: appariement.id }));
    assert.doesNotMatch(
      t,
      /Les écritures/,
      'js/views/affreteur.js:905 lit l’appariement en brut, sans contrôle de partie ni projection',
    );
  });

  it('QA-02 — l’écran de validation ne doit pas chiffrer le solde de la contrepartie', () => {
    const aff = ctxDe('u-aff-1');
    const { appariement, offre } = dossierAccepte(aff);
    const soldeTransporteur = compte.soldeDe(offre.groupementId);
    const prepare = matching.preparerValidation(aff, appariement.id);
    assert.equal(
      prepare.soldeTransporteur,
      undefined,
      'le service sert à l’affréteur la trésorerie exacte du transporteur ' +
        `(${soldeTransporteur}) — le motif de refus, lui, prend soin de l’anonymiser`,
    );
  });

  it('QA-03 — le KPI « Transports en route » doit être borné au groupement', () => {
    const aff1 = ctxDe('u-aff-1');
    // Un dossier pour l'affréteur 2 uniquement.
    const abo = depot('abonnement').brutOu((a) => a.groupementId === 'grp-aff-2')[0];
    depot('abonnement').modifier(abo.id, {
      finitLe: new Date(Date.now() + 300 * 864e5).toISOString(),
      etat: 'actif',
    });
    depot('operation').creer({
      id: 'ope-qa-c1', groupementId: 'grp-aff-2', sens: 'credit', montant: 500000,
      motif: 'rechargement', referenceEncaissement: 'QA-1', libelle: 'Crédit QA',
      horodatage: new Date().toISOString(), auteurUtilisateurId: 'u-conc', demo: true,
    });
    depot('operation').creer({
      id: 'ope-qa-c2', groupementId: 'grp-tra-2', sens: 'credit', montant: 500000,
      motif: 'rechargement', referenceEncaissement: 'QA-2', libelle: 'Crédit QA',
      horodatage: new Date().toISOString(), auteurUtilisateurId: 'u-conc', demo: true,
    });
    const offre2 = depot('offre').brutOu(
      (o) => o.etat === ETAT_OFFRE.DISPONIBLE && o.groupementId === 'grp-tra-2',
    )[0];
    const r = fret.publierFret(ctxDe('u-aff-2'), {
      fret: {
        libelle: 'Fret affréteur 2',
        provenanceId: refs('localites')[0].id,
        destinationId: refs('localites')[1].id,
      },
      besoin: {
        departPrevu: new Date(new Date(offre2.disponibleDu).getTime() + 36e5)
          .toISOString()
          .slice(0, 16),
        arriveePrevue: new Date(offre2.disponibleAu).toISOString().slice(0, 16),
        capaciteId: refs('capacites')[0].id,
        carrosserieId: refs('carrosseries')[0].id,
      },
      lignes: [{ produitId: refs('produits_sh')[0].id, poidsT: 5 }],
    });
    const a2 = matching.engager(ctxDe('u-aff-2'), {
      offreId: offre2.id,
      demandeId: r.demande.id,
    });
    matching.repondre(ctxTransporteurDe('grp-tra-2'), a2.id, { accepte: true });
    const p = matching.preparerValidation(ctxDe('u-aff-2'), a2.id);
    const v = matching.valider(ctxDe('u-aff-2'), a2.id, { attendu: p.attendu });
    for (let i = 0; i < 3; i++) transportSvc.avancer(ctxTransporteurDe('grp-tra-2'), v.transport.id);

    // L'affréteur 1 n'a aucun transport. Son KPI doit afficher 0.
    const t = texte(affreteurV.dashboard(ctxDe('u-aff-1')));
    const valeur = t.slice(t.indexOf('Transports en route') + 19).match(/^\s*(\d+)/)?.[1];
    assert.equal(
      valeur,
      '0',
      'js/views/affreteur.js:84 compte les transports de toute la plateforme',
    );
  });

  it('QA-04 — retirer une offre réservée doit être refusé, ou clore la réservation', () => {
    const aff = ctxDe('u-aff-1');
    const demande = depot('demande').brutOu(
      (d) => d.groupementId === 'grp-aff-1' && d.etat === ETAT_DEMANDE.PUBLIEE,
    )[0];
    const offre = depot('offre').brutOu(
      (o) => o.etat === ETAT_OFFRE.DISPONIBLE && matching.fenetresSeRecouvrent(o, demande),
    )[0];
    const app = matching.engager(aff, { offreId: offre.id, demandeId: demande.id });

    let refuse = false;
    try {
      flotte.retirerOffre(ctxTransporteurDe(offre.groupementId), offre.id);
    } catch {
      refuse = true;
    }
    if (refuse) return; // correction possible n° 1 : interdire le retrait

    // correction possible n° 2 : retirer, mais clore proprement le dossier
    assert.notEqual(
      depot('appariement').brutParId(app.id).etat,
      ETAT_APPARIEMENT.RESERVER,
      'appariement zombie : réservation active sur une offre retirée ' +
        '(js/services/flotte.service.js:167 n’examine pas l’état « reserver »)',
    );
    assert.notEqual(
      depot('demande').brutParId(demande.id).etat,
      ETAT_DEMANDE.RESERVEE,
      'la demande reste immobilisée hors du marché',
    );
  });

  it('QA-05 — le refus opposé à un auxiliaire doit expliquer POURQUOI', () => {
    const { appariement } = dossierAccepte(ctxDe('u-aff-1'));
    const prepare = matching.preparerValidation(ctxDe('u-aux-1'), appariement.id);
    assert.equal(prepare.possible, false);
    assert.match(
      prepare.refus.join(' '),
      /engage|financi|parent|groupement/i,
      'la conception UX (§ 2.2) exige le motif métier, pas le nom du droit manquant',
    );
  });

  it('QA-06 — l’intégrité référentielle doit descendre dans les lignes de marchandise', () => {
    assert.throws(
      () =>
        fret.publierFret(ctxDe('u-aff-1'), {
          fret: {
            libelle: 'Fret QA',
            provenanceId: refs('localites')[0].id,
            destinationId: refs('localites')[1].id,
          },
          besoin: {
            departPrevu: dansNJours(3),
            arriveePrevue: dansNJours(5),
            capaciteId: refs('capacites')[0].id,
            carrosserieId: refs('carrosseries')[0].id,
          },
          lignes: [{ produitId: 'produit-qui-n-existe-pas', poidsT: 10 }],
        }),
      /inexistant|référence/i,
      'repository.js:136 ne parcourt que les champs de premier niveau',
    );
  });

  it('QA-07 — deux dossiers indépendants doivent pouvoir être validés depuis deux onglets', () => {
    const aff = ctxDe('u-aff-1');
    const demandes = depot('demande').brutOu(
      (d) => d.groupementId === 'grp-aff-1' && d.etat === ETAT_DEMANDE.PUBLIEE,
    );
    const offres = depot('offre').brutOu((o) => o.etat === ETAT_OFFRE.DISPONIBLE);
    const o1 = offres.find((o) => matching.fenetresSeRecouvrent(o, demandes[0]));
    const d2 =
      demandes[1] ??
      depot('demande').brutParId(
        fret.publierFret(aff, {
          fret: {
            libelle: 'Second fret QA',
            provenanceId: refs('localites')[0].id,
            destinationId: refs('localites')[1].id,
          },
          besoin: {
            departPrevu: dansNJours(4),
            arriveePrevue: dansNJours(8),
            capaciteId: refs('capacites')[0].id,
            carrosserieId: refs('carrosseries')[0].id,
          },
          lignes: [{ produitId: refs('produits_sh')[0].id, poidsT: 4 }],
        }).demande.id,
      );
    const o2 = offres.find((o) => o.id !== o1.id && matching.fenetresSeRecouvrent(o, d2));
    assert.ok(o2, 'deux offres compatibles sont nécessaires à ce test');

    const a1 = matching.engager(aff, { offreId: o1.id, demandeId: demandes[0].id });
    const a2 = matching.engager(aff, { offreId: o2.id, demandeId: d2.id });
    matching.repondre(ctxTransporteurDe(o1.groupementId), a1.id, { accepte: true });
    matching.repondre(ctxTransporteurDe(o2.groupementId), a2.id, { accepte: true });

    const ongletA = matching.preparerValidation(aff, a1.id);
    const ongletB = matching.preparerValidation(aff, a2.id);
    assert.ok(compte.soldeDe('grp-aff-1') >= ongletA.fraisAffreteur * 2, 'solde suffisant');

    matching.valider(aff, a1.id, { attendu: ongletA.attendu });
    // Le second dossier n'a rien à voir avec le premier : il doit passer.
    matching.valider(aff, a2.id, { attendu: ongletB.attendu });
  });

  it('QA-08 — un bouton refusé doit rester atteignable au clavier avec son motif', () => {
    const { appariement } = dossierAccepte(ctxDe('u-aff-1'));
    const vue = affreteurV.validation(ctxDe('u-aux-1'), { id: appariement.id });
    const bouton = parClasse(vue, 'btn').find((b) =>
      texteDe(b).includes('Valider la mise en relation'),
    );
    assert.ok(bouton, 'le bouton doit être présent, jamais masqué');
    assert.equal(
      bouton.attributs.disabled,
      undefined,
      'core/ui.js:184 pose `disabled` : le motif, porté par `title`, devient ' +
        'inatteignable au clavier et au lecteur d’écran. Utiliser aria-disabled ' +
        'seul + aria-describedby vers le motif visible.',
    );
  });

  it('QA-09 — la vue ne doit pas écrire directement dans LocalStorage', async () => {
    const source = await import('node:fs/promises');
    const contenu = await source.readFile(
      new URL('../js/views/affreteur.js', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(
      contenu,
      /\blocalStorage\b/,
      'js/views/affreteur.js:452-493 contourne la règle VUE → SERVICE → REPOSITORY → ' +
        'LOCALSTORAGE ; la clé b2f_search_prefs échappe en outre à la réinitialisation ' +
        'et est partagée entre tous les utilisateurs de la même origine',
    );
  });

  it('QA-10 — aucune route d’un autre espace ne doit être écrite en dur dans une vue', async () => {
    const source = await import('node:fs/promises');
    const contenu = await source.readFile(
      new URL('../js/views/affreteur.js', import.meta.url),
      'utf8',
    );
    const ficheRelation = contenu.slice(contenu.indexOf('function ficheRelation'));
    assert.doesNotMatch(
      ficheRelation.slice(0, 3000),
      /#\/affreteur\/suivi/,
      'la fiche est partagée avec l’espace transporteur (app.js:57) : le lien ' +
        '« Suivre le transport » renvoie le transporteur sur un écran de refus',
    );
  });
});
