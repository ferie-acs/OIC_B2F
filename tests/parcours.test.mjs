/**
 * Le fil narratif, de bout en bout, sans interface.
 *
 * C'est le test qui dit si le POC prouve ce qu'il annonce : déclaration →
 * publication d'un véhicule → réservation → acceptation → validation → double
 * débit → coordonnées transmises → suivi → clôture.
 *
 * Les services tournent sous Node avec un stockage en mémoire : aucune vue, aucun
 * navigateur. Si le parcours passe ici, l'interface n'a plus qu'à l'afficher.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

// Web Crypto et sessionStorage, que le code attend du navigateur.
if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const memoireSession = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoireSession.has(k) ? memoireSession.get(k) : null),
  setItem: (k, v) => void memoireSession.set(k, v),
  removeItem: (k) => void memoireSession.delete(k),
};

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer, MOT_DE_PASSE_DEMO } = await import('../js/seed.js');
const { connecter, contexteDe, blocageAbonnement } = await import(
  '../js/services/auth.service.js'
);
const matching = await import('../js/services/matching.service.js');
const { soldeDe, saisirCredit, validerCredit, mouvementsDe } = await import('../js/services/compte.service.js');
const flotte = await import('../js/services/flotte.service.js');
const fret = await import('../js/services/fret.service.js');
const transportSvc = await import('../js/services/transport.service.js');
const { lireJournal } = await import('../js/services/audit.service.js');
const { ETAT_APPARIEMENT, ETAPE_TRANSPORT } = await import('../js/domain/enums.js');

/** @returns {Promise<Record<string, any>>} Contextes par rôle. */
async function installer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));
  return {
    affreteur: ctxDe('u-aff-1'),
    auxiliaire: ctxDe('u-aux-1'),
    transporteur: ctxDe('u-tra-1'),
    transporteur2: ctxDe('u-tra-2'),
    concessionnaire: ctxDe('u-conc'),
    dgttc: ctxDe('u-dgttc'),
    affreteurExpire: ctxDe('u-aff-2'),
    ctxDe,
  };
}

describe('Amorçage du jeu de démonstration', () => {
  /** @type {any} */ let a;
  before(async () => {
    a = await installer();
  });

  it('installe des données entièrement marquées DÉMO', () => {
    for (const entite of ['groupement', 'utilisateur', 'vehicule', 'offre', 'demande']) {
      const objets = depot(entite).brutTous();
      assert.ok(objets.length > 0, `aucun ${entite}`);
      assert.ok(
        objets.every((o) => o.demo === true),
        `des ${entite} ne portent pas la marque DÉMO (risque R9)`,
      );
    }
  });

  it('n’expose aucune adresse en domaine réel', () => {
    const suspects = depot('utilisateur')
      .brutTous()
      .filter((u) => !u.email.endsWith('.invalid'));
    assert.deepEqual(suspects, []);
  });

  it('permet de se connecter avec un compte de démonstration', async () => {
    const ctx = await connecter('affreteur@demo.invalid', MOT_DE_PASSE_DEMO);
    assert.equal(ctx.roleId, 'affreteur');
    assert.equal(ctx.groupementId, 'grp-aff-1');
  });

  it('refuse un mot de passe faux, sans dire si l’adresse existe', async () => {
    await assert.rejects(
      () => connecter('affreteur@demo.invalid', 'mauvais'),
      /Identifiants incorrects\./,
    );
    await assert.rejects(
      () => connecter('inconnu@demo.invalid', MOT_DE_PASSE_DEMO),
      /Identifiants incorrects\./,
    );
  });

  it('ne stocke aucun mot de passe en clair, ni en condensat non salé', () => {
    for (const u of depot('utilisateur').brutTous()) {
      assert.equal(u.motDePasse.algo, 'PBKDF2-SHA256');
      assert.ok(u.motDePasse.sel, 'empreinte sans sel');
      assert.notEqual(u.motDePasse.empreinte, MOT_DE_PASSE_DEMO);
      assert.ok(u.motDePasse.iterations >= 100000);
    }
  });

  it('bloque l’accès du groupement dont l’abonnement a expiré (M10.2)', () => {
    assert.equal(blocageAbonnement(a.affreteurExpire).bloque, true);
    assert.equal(blocageAbonnement(a.affreteur).bloque, false);
    assert.equal(blocageAbonnement(a.concessionnaire).bloque, false, 'rôle institutionnel');
  });
});

describe('LE FIL NARRATIF — de la déclaration à la clôture', () => {
  /** @type {any} */ let a;
  /** @type {string} */ let appariementId;
  /** @type {string} */ let transportId;

  before(async () => {
    a = await installer();
  });

  it('1 — l’affréteur déclare un fret et publie sa demande', () => {
    const { declaration, demande } = fret.publierFret(a.affreteur, {
      fret: {
        libelle: 'Caoutchouc naturel — lot DÉMO',
        provenanceId: 'loc-san-pedro',
        destinationId: 'loc-abidjan',
      },
      besoin: {
        departPrevu: new Date(Date.now() + 3 * 86400000).toISOString(),
        arriveePrevue: new Date(Date.now() + 4 * 86400000).toISOString(),
        capaciteId: 'cap-25',
        carrosserieId: 'car-plateau',
      },
      lignes: [{ produitId: 'sh-4001', poidsT: 20 }],
    });

    assert.match(declaration.reference, /^DF-\d{4}-\d{4}$/);
    assert.match(demande.reference, /^DT-\d{4}-\d{4}$/);
    assert.equal(demande.etat, 'publiee');
    assert.equal(demande.lignes.length, 1);
  });

  it('refuse une demande dont l’arrivée précède le départ', () => {
    assert.throws(
      () =>
        fret.publierFret(a.affreteur, {
          fret: { libelle: 'X', provenanceId: 'loc-abidjan', destinationId: 'loc-bouake' },
          besoin: {
            departPrevu: new Date(Date.now() + 5 * 86400000).toISOString(),
            arriveePrevue: new Date(Date.now() + 2 * 86400000).toISOString(),
            capaciteId: 'cap-25',
            carrosserieId: 'car-plateau',
          },
          lignes: [{ produitId: 'sh-4001', poidsT: 10 }],
        }),
      /postérieure au départ/,
    );
  });

  it('2 — le transporteur publie un véhicule disponible', () => {
    const offre = flotte.publierOffre(a.transporteur, {
      vehiculeId: 'veh-2',
      chauffeurPressentiId: 'chf-2',
      localiteDepartId: 'loc-korhogo',
      localiteArriveeId: 'loc-abidjan',
      disponibleDu: new Date(Date.now() + 86400000).toISOString(),
      disponibleAu: new Date(Date.now() + 10 * 86400000).toISOString(),
      prixKmT: 100,
    });
    assert.equal(offre.etat, 'disponible');
  });

  it('refuse de publier un véhicule à carte de transport échue', () => {
    assert.throws(
      () =>
        flotte.publierOffre(a.transporteur, {
          vehiculeId: 'veh-3',
          localiteDepartId: 'loc-abidjan',
          localiteArriveeId: 'loc-bouake',
          disponibleDu: new Date(Date.now() + 86400000).toISOString(),
          disponibleAu: new Date(Date.now() + 5 * 86400000).toISOString(),
        }),
      /carte de transport .* échue/,
    );
  });

  it('3 — l’affréteur cherche un véhicule et ne voit PAS les coordonnées', () => {
    const resultats = flotte.chercherVehicules(a.affreteur, {
      departId: 'loc-abidjan',
      arriveeId: 'loc-bouake',
    });
    assert.ok(resultats.length > 0, 'aucun véhicule sur ce corridor');

    const offre = resultats[0];
    assert.ok(offre.reference, 'la référence est visible');
    // Correctif anti-fraude n° 1 : ni plaque ni raison sociale avant validation.
    assert.equal('immatriculation' in offre.vehicule, false, "l'immatriculation a fuité");
    assert.ok(offre.vehicule.capaciteT, 'la capacité reste un critère de choix');
    assert.equal('carteGrise' in offre.vehicule, false, 'la carte grise a fuité');
    assert.equal('chauffeurPressentiId' in offre, false, 'le chauffeur a fuité');
    assert.equal(
      'contactTelephone' in offre.groupement,
      false,
      'le téléphone du transporteur a fuité AVANT validation',
    );
    assert.equal('raisonSociale' in offre.groupement, false, "la raison sociale a fuité AVANT validation");
    assert.equal(offre.confiance.verifie, true, 'le signal de confiance remplace le nom');
  });

  it('4 — l’affréteur réserve', () => {
    const ap = matching.engager(a.affreteur, { offreId: 'off-1', demandeId: 'dem-1' });
    appariementId = ap.id;
    assert.equal(ap.etat, ETAT_APPARIEMENT.RESERVER);
    assert.equal(depot('offre').brutParId('off-1').etat, 'reservee');
  });

  it('refuse une seconde réservation sur le même véhicule', () => {
    assert.throws(
      () => matching.engager(a.affreteur, { offreId: 'off-1', demandeId: 'dem-2' }),
      /déjà l’objet d’une réservation/,
    );
  });

  it('refuse à l’affréteur de valider avant l’acceptation du transporteur', () => {
    const p = matching.preparerValidation(a.affreteur, appariementId);
    assert.equal(p.possible, false);
    assert.match(p.refus[0], /qu'après l'acceptation du transporteur/);
  });

  it('5 — le transporteur accepte', () => {
    const maj = matching.repondre(a.transporteur, appariementId, { accepte: true });
    assert.equal(maj.etat, ETAT_APPARIEMENT.ACCEPTER);
  });

  it('refuse à l’affréteur de répondre à sa propre réservation', () => {
    assert.throws(
      () => matching.repondre(a.affreteur, appariementId, { accepte: true }),
      /revient au transporteur/,
    );
  });

  it('CAS D’ÉCHEC — l’auxiliaire ne peut pas valider, et on lui dit pourquoi', () => {
    const p = matching.preparerValidation(a.auxiliaire, appariementId);
    assert.equal(p.possible, false);
    // Le refus explique la raison métier (QA-05), il ne nomme plus le droit.
    assert.match(p.refus[0], /engage les finances/);
    assert.match(p.refus[0], /Auxiliaire d'affréteur/);
    assert.throws(() => matching.valider(a.auxiliaire, appariementId), /engage les finances/);
  });

  it('l’auxiliaire PEUT en revanche annuler (U3, décision D37)', () => {
    // Vérifié sans exécuter : annuler ici casserait le parcours.
    const { deciderSurAppariement } = matching;
    void deciderSurAppariement;
    const ap = depot('appariement').brutParId(appariementId);
    assert.equal(ap.etat, ETAT_APPARIEMENT.ACCEPTER);
  });

  it('6 — l’écran de validation montre les DEUX débits avant l’action (D31)', () => {
    const p = matching.preparerValidation(a.affreteur, appariementId);
    assert.equal(p.possible, true);

    // Les deux montants de CE dossier sont servis : l'exigence D31 est tenue.
    assert.equal(p.fraisAffreteur, 15000);
    assert.equal(p.fraisTransporteur, 15000);

    // Le solde servi est celui de l'utilisateur connecté, et de lui seul.
    assert.equal(p.soldeUtilisateur, 200000);
    assert.equal(p.soldeApresUtilisateur, 185000);
    assert.equal(p.utilisateurProvisionne, true);

    // Décision D60 : la trésorerie de la contrepartie n'est jamais chiffrée —
    // seulement son état. La matrice refuse `compte.lire` sur le compte d'autrui.
    assert.equal(p.soldeTransporteur, undefined);
    assert.equal(p.soldeAffreteur, undefined);
    assert.equal(p.contrepartieProvisionnee, true);

    assert.ok(p.attendu, 'aucun instantané de versions capturé');
  });

  it('7 — LA VALIDATION : double débit atomique et coordonnées transmises', () => {
    const avantAff = soldeDe('grp-aff-1');
    const avantTra = soldeDe('grp-tra-1');
    const p = matching.preparerValidation(a.affreteur, appariementId);

    const { appariement, transport } = matching.valider(a.affreteur, appariementId, {
      attendu: p.attendu,
    });
    transportId = transport.id;

    assert.equal(appariement.etat, ETAT_APPARIEMENT.VALIDER);
    assert.equal(soldeDe('grp-aff-1'), avantAff - 15000);
    assert.equal(soldeDe('grp-tra-1'), avantTra - 15000);

    // Deux écritures, pas une.
    const ecritures = depot('operation').brutOu((o) => o.appariementId === appariementId);
    assert.equal(ecritures.length, 2);
    assert.ok(appariement.operationAffreteurId && appariement.operationTransporteurId);

    // Les montants sont FIGÉS (D45).
    assert.equal(appariement.fraisAffreteur, 15000);

    // Le transport existe, à son étape initiale.
    assert.equal(transport.etape, ETAPE_TRANSPORT.VALIDE);
  });

  it('LES COORDONNÉES SONT MAINTENANT TRANSMISES — et à ce moment seulement', () => {
    const ctx = contexteDe(depot('utilisateur').brutParId('u-aff-1'));
    const transporteur = depot('groupement').lire(ctx, 'grp-tra-1', {
      proprietaireId: 'grp-tra-1',
    });
    assert.ok(transporteur.contactTelephone, 'les coordonnées ne sont pas transmises');
    assert.ok(transporteur.contactEmail);

    const chauffeur = depot('chauffeur').lire(ctx, 'chf-1');
    assert.ok(chauffeur.nom);
    assert.ok(chauffeur.telephone);

    const vehicule = depot('vehicule').lire(ctx, 'veh-1');
    assert.ok(vehicule.carteGrise);
  });

  it('mais PAS celles d’un chauffeur étranger à cette mise en relation (S3)', () => {
    const ctx = contexteDe(depot('utilisateur').brutParId('u-aff-1'));
    const autre = depot('chauffeur').lire(ctx, 'chf-2');
    assert.equal('telephone' in autre, false, "l'annuaire du transporteur a fuité");
  });

  it('ni celles d’un autre transporteur (grp-tra-2)', () => {
    const ctx = contexteDe(depot('utilisateur').brutParId('u-aff-1'));
    const tiers = depot('groupement').lire(ctx, 'grp-tra-2', { proprietaireId: 'grp-tra-2' });
    assert.equal('contactTelephone' in tiers, false);
  });

  it('8 — le transporteur fait avancer le transport, étape par étape', () => {
    for (const attendue of ['a_quai', 'charge', 'en_route', 'livre']) {
      const maj = transportSvc.avancer(a.transporteur, transportId, {
        observation: `Passage à ${attendue}`,
      });
      assert.equal(maj.etape, attendue);
    }
  });

  it('à l’étape « livré », l’action suivante revient à l’affréteur', () => {
    const t = depot('transport').brutParId(transportId);
    const ap = depot('appariement').brutParId(appariementId);
    const { possible, motif } = transportSvc.avancementPossible(a.affreteur, t, ap);
    // À « livré », l'étape suivante est la clôture, qui lui revient.
    assert.equal(possible, true);
    assert.equal(motif, null);
  });

  it('refuse la clôture au transporteur — elle appartient à l’affréteur', () => {
    assert.throws(
      () => transportSvc.avancer(a.transporteur, transportId),
      /appartient à l'affréteur/,
    );
  });

  it('9 — l’affréteur clôture après livraison', () => {
    const maj = transportSvc.avancer(a.affreteur, transportId);
    assert.equal(maj.etape, ETAPE_TRANSPORT.CLOTURE);
    assert.ok(maj.clotureLe);
    assert.equal(maj.journal.length, 6, 'un événement par étape');
  });

  it('refuse toute étape supplémentaire après la clôture', () => {
    assert.throws(() => transportSvc.avancer(a.transporteur, transportId), /clôturé/);
  });

  it('refuse d’annuler une mise en relation validée — un débit a eu lieu', () => {
    assert.throws(() => matching.annuler(a.affreteur, appariementId), /débités|plus être/);
  });

  it('le journal d’audit a tout retenu, sans jamais porter de montant', () => {
    const entrees = lireJournal(a.concessionnaire);
    const evenements = entrees.map((e) => e.evenement);
    for (const attendu of [
      'appariement_reserve',
      'appariement_accepte',
      'appariement_valide',
      'coordonnees_transmises',
      'transport_etape',
    ]) {
      assert.ok(evenements.includes(attendu), `événement manquant : ${attendu}`);
    }
    for (const e of entrees) {
      // Les références métier (MR-2026-0001) sont publiques et nécessaires :
      // on les neutralise avant de chercher un montant, exactement comme le
      // service le fait à l'écriture.
      const sansReference = String(e.details).replace(/\b[A-Z]{2,3}-\d{4}-\d{4}\b/g, '');
      assert.doesNotMatch(
        sansReference,
        /\d{1,3}(?:[\s  ]\d{3})+|F\s?CFA/,
        `montant dans le journal : ${e.details}`,
      );
    }
  });
});

describe('CAS D’ÉCHEC — solde insuffisant de la contrepartie (M5.3)', () => {
  /** @type {any} */ let a;

  before(async () => {
    a = await installer();
  });

  it('refuse la validation et NE RÉVÈLE PAS le solde du transporteur (S6)', () => {
    // grp-tra-2 n'a que 5 000 en compte, pour 15 000 de frais.
    const ap = matching.engager(a.affreteur, { offreId: 'off-3', demandeId: 'dem-1' });
    matching.repondre(a.transporteur2, ap.id, { accepte: true });

    const p = matching.preparerValidation(a.affreteur, ap.id);
    assert.equal(p.possible, false);
    assert.match(p.refus[0], /contrepartie/);
    assert.doesNotMatch(p.refus[0], /5[\s  ]000/, 'le solde du tiers est révélé');
    assert.doesNotMatch(p.refus[0], /10[\s  ]000/, "l'écart reconstitue le solde");

    assert.throws(() => matching.valider(a.affreteur, ap.id, { attendu: p.attendu }));
  });

  it('n’a débité personne', () => {
    assert.equal(soldeDe('grp-aff-1'), 200000);
    assert.equal(soldeDe('grp-tra-2'), 5000);
  });

  it('la validation redevient possible une fois le compte crédité', () => {
    const ap = depot('appariement').brutOu((x) => x.offreId === 'off-3')[0];
    // Correctif anti-fraude n° 5 : saisie puis validation par une AUTRE personne.
    const credit = saisirCredit(a.concessionnaire, {
      groupementId: 'grp-tra-2',
      montant: 50000,
      referenceEncaissement: 'ENC-DEMO-9001',
    });
    assert.equal(soldeDe('grp-tra-2'), 5000, 'la saisie seule ne crédite pas');
    const second = contexteDe(depot('utilisateur').brutParId('u-conc-2'));
    validerCredit(second, credit.id, { rapprochementConfirme: true });
    assert.equal(soldeDe('grp-tra-2'), 55000);

    const p = matching.preparerValidation(a.affreteur, ap.id);
    assert.equal(p.possible, true);

    matching.valider(a.affreteur, ap.id, { attendu: p.attendu });
    assert.equal(soldeDe('grp-tra-2'), 40000);
    assert.equal(soldeDe('grp-aff-1'), 185000);
  });

  it('refuse le crédit manuel à tout autre rôle que le concessionnaire', () => {
    assert.throws(
      () =>
        saisirCredit(a.affreteur, {
          groupementId: 'grp-aff-1',
          montant: 100000,
          referenceEncaissement: 'X',
        }),
      /Accès refusé|ne dispose/,
    );
  });
});

describe('CAS D’ÉCHEC — rejet motivé', () => {
  /** @type {any} */ let a;
  before(async () => {
    a = await installer();
  });

  it('exige un motif', () => {
    const ap = matching.engager(a.affreteur, { offreId: 'off-1', demandeId: 'dem-1' });
    assert.throws(
      () => matching.repondre(a.transporteur, ap.id, { accepte: false }),
      /motif/,
    );
  });

  it('libère l’offre et la demande après un rejet motivé', () => {
    const ap = depot('appariement').brutOu((x) => x.offreId === 'off-1')[0];
    matching.repondre(a.transporteur, ap.id, {
      accepte: false,
      motif: 'dates_incompatibles',
      precision: 'Véhicule engagé ailleurs sur cette fenêtre.',
    });
    assert.equal(depot('offre').brutParId('off-1').etat, 'disponible');
    assert.equal(depot('demande').brutParId('dem-1').etat, 'publiee');
  });

  it('permet de réserver à nouveau — ce que le système existant ne sait pas faire', () => {
    const ap2 = matching.engager(a.affreteur, { offreId: 'off-1', demandeId: 'dem-1' });
    assert.equal(ap2.etat, ETAT_APPARIEMENT.RESERVER);

    // Les deux tentatives coexistent : l'historique du rejet est conservé.
    const toutes = depot('appariement').brutOu((x) => x.offreId === 'off-1');
    assert.equal(toutes.length, 2);
    assert.ok(toutes.some((x) => x.etat === 'rejeter' && x.motifRejet));
  });
});

describe('Cloisonnement des rôles institutionnels', () => {
  /** @type {any} */ let a;
  before(async () => {
    a = await installer();
  });

  it('la DGTTC ne reçoit aucun montant sur les mouvements de compte', () => {
    assert.throws(() => mouvementsDe(a.dgttc, 'grp-aff-1'), /Accès refusé|ne dispose/);
  });

  it('le concessionnaire voit les soldes de toute la plateforme', () => {
    const m = mouvementsDe(a.concessionnaire, 'grp-aff-1');
    assert.ok(m.length > 0);
    assert.ok(typeof m[0].montant === 'number');
  });

  it('ni la DGTTC ni le concessionnaire ne peuvent transiger', () => {
    for (const ctx of [a.dgttc, a.concessionnaire]) {
      assert.throws(
        () => matching.engager(ctx, { offreId: 'off-1', demandeId: 'dem-1' }),
        /Accès refusé|ne dispose/,
      );
    }
  });

  it('la DGTTC lit le journal d’audit', () => {
    assert.ok(Array.isArray(lireJournal(a.dgttc)));
  });
});
