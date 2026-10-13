/**
 * Lot b4 — abonnements, paiements, caisse et finances.
 *
 * Chaque bloc pose le cas nominal **et** les refus : mauvais rôle, autre
 * entreprise, état invalide, personne seule qui saisit et valide. Les services
 * tournent sous Node, en mémoire ; les écrans sur le mini-DOM ; les gabarits PDF
 * sous jsPDF.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const memoireSession = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoireSession.has(k) ? memoireSession.get(k) : null),
  setItem: (k, v) => void memoireSession.set(k, v),
  removeItem: (k) => void memoireSession.delete(k),
};

const require = createRequire(import.meta.url);
const { jsPDF } = require('../js/vendor/jspdf.umd.min.js');

const { installerDom, texteDe } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer, completerJeuAntiFraude } = await import('../js/seed.js');
const { amorcerLotB4 } = await import('../js/seed-lot-b4.js');
const { contexteDe, abonnementDe } = await import('../js/services/auth.service.js');
const compte = await import('../js/services/compte.service.js');
const abo = await import('../js/services/abonnement.service.js');
const paiement = await import('../js/services/paiement.service.js');
const caisse = await import('../js/services/caisse.service.js');
const tarif = await import('../js/services/tarif.service.js');
const contentieux = await import('../js/services/contentieux.service.js');
const rapport = await import('../js/services/rapport-financier.service.js');
const recu = await import('../js/services/recu.service.js');
const { construireRecuPdf, construireEtatPdf } = await import('../js/services/recu-pdf-gabarit.js');
const { decider } = await import('../js/domain/access.js');
const { arborescenceDe } = await import('../js/core/nav.js');
const { CODE_TARIF, ETAT_CREDIT, EVENEMENT_AUDIT } = await import('../js/domain/enums.js');
const F = await import('../js/domain/finances.js');
const vuesEntreprise = await import('../js/views/finances-entreprise.js');
const vuesCaisse = await import('../js/views/caisse.js');
const { contentieux: vueContentieux } = await import('../js/views/contentieux.js');
const { tarifs: vueTarifs } = await import('../js/views/tarifs-admin.js');

const { CANAL_PAIEMENT, ETAPE_CONTENTIEUX, ETAT_PAIEMENT, ETAT_REVISION, MODE_PAIEMENT, OBJET_PAIEMENT, OPERATEUR_MOBILE } = F;

/* ------------------------------------------------------------------ *
 * Outillage
 * ------------------------------------------------------------------ */

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));
const ANNUEL = CODE_TARIF.ABONNEMENT_ANNUEL;
const NOM_AFF_1 = 'Cacao Lagunes Export DÉMO';

async function installer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  await completerJeuAntiFraude();
  await amorcerLotB4();
}

let compteur = 0;
const refUnique = (prefixe = 'OM') => `${prefixe}TEST${String((compteur += 1)).padStart(6, '0')}`;

const mobile = (ref = refUnique()) => ({
  mode: MODE_PAIEMENT.MOBILE_MONEY,
  operateur: OPERATEUR_MOBILE.ORANGE,
  numero: '07 01 02 03 04',
  referenceTransaction: ref,
});

const finDe = (groupementId) => String(abonnementDe(groupementId).finitLe).slice(0, 10);
const evenements = (type) => depot('audit').brutOu((a) => a.evenement === type);

function erreurDe(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  assert.fail('une erreur était attendue');
}

/* ================================================================== *
 * Domaine pur
 * ================================================================== */

describe('Lot b4 — règles de calcul du domaine', () => {
  it('prolonge un abonnement en cours à partir du lendemain de son échéance', () => {
    const p = F.periodeProlongation({ finActuelle: '2026-11-30', dureeMois: 12, jour: '2026-10-13' });
    assert.deepEqual(p, { debuteLe: '2026-12-01', finitLe: '2027-11-30', enAvance: true });
  });

  it('fait repartir un abonnement expiré ou absent du jour du paiement', () => {
    assert.deepEqual(F.periodeProlongation({ finActuelle: '2026-01-31', dureeMois: 1, jour: '2026-10-13' }), {
      debuteLe: '2026-10-13',
      finitLe: '2026-11-12',
      enAvance: false,
    });
    assert.equal(F.periodeProlongation({ finActuelle: null, dureeMois: 6, jour: '2026-03-01' }).finitLe, '2026-08-31');
  });

  it('ramène au dernier jour du mois, sans déborder sur le suivant', () => {
    assert.equal(F.ajouterMois('2027-01-31', 1), '2027-02-28');
    assert.equal(F.ajouterMois('2028-01-31', 1), '2028-02-29');
    assert.equal(F.ajouterMois('2026-11-15', 3), '2027-02-15');
  });

  it('refuse une durée qui n’est pas un nombre entier de mois', () => {
    assert.throws(() => F.periodeProlongation({ finActuelle: null, dureeMois: 0 }), /nombre entier de mois/);
    assert.throws(() => F.periodeProlongation({ finActuelle: null, dureeMois: 1.5 }), /nombre entier de mois/);
  });

  it('numérote les reçus sans trou, par année', () => {
    const an = new Date('2026-06-01T00:00:00Z');
    assert.equal(F.numeroSuivant('RC', [], an), 'RC-2026-0001');
    assert.equal(F.numeroSuivant('RC', ['RC-2026-0001', 'RC-2026-0007', 'RC-2025-0099', 'XX'], an), 'RC-2026-0008');
    assert.equal(F.numeroSuivant('RC', ['RC-2025-0099'], an), 'RC-2026-0001');
  });

  it('écrit les montants en toutes lettres', () => {
    assert.equal(F.enLettres(150000), 'cent cinquante mille');
    assert.equal(F.enLettres(80), 'quatre-vingts');
    assert.equal(F.enLettres(80000), 'quatre-vingt mille');
    assert.equal(F.enLettres(71), 'soixante et onze');
    assert.equal(F.enLettres(200), 'deux cents');
    assert.equal(F.enLettres(2_000_000), 'deux millions');
    assert.throws(() => F.enLettres(-1));
  });

  it('neutralise les formules dans un export CSV', () => {
    assert.equal(F.celluleCsv('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(F.celluleCsv('+225'), "'+225");
    assert.equal(F.celluleCsv(-5000), '-5000');
    assert.equal(F.celluleCsv('a;b'), '"a;b"');
    assert.ok(F.documentCsv(['A'], [[1]]).startsWith('﻿A\r\n1'));
  });

  it('fait avancer un contentieux d’une étape à la fois, sans retour', () => {
    const E = ETAPE_CONTENTIEUX;
    assert.equal(F.transitionContentieuxPermise(E.OUVERT, E.INSTRUCTION), true);
    assert.equal(F.transitionContentieuxPermise(E.OUVERT, E.CONCILIATION), false);
    assert.equal(F.transitionContentieuxPermise(E.CONCILIATION, E.INSTRUCTION), false);
    assert.equal(F.transitionContentieuxPermise(E.OUVERT, E.CLOS), true);
    assert.equal(F.transitionContentieuxPermise(E.CLOS, E.INSTRUCTION), false);
  });

  it('n’accepte que les numéros de mobile money ivoiriens', () => {
    assert.equal(F.normaliserNumeroMobile('+225 07 01 02 03 04'), '0701020304');
    assert.equal(F.normaliserNumeroMobile('0201020304'), null);
    assert.equal(F.normaliserNumeroMobile('07010203'), null);
    assert.equal(F.masquerNumero('0701020304'), '07 •• •• •• 04');
  });

  it('refuse une modification de tarif rétroactive, sans motif ou à montant nul', () => {
    const d = F.defautsRevision({ montant: 0, dureeMois: 40, effetLe: '2026-01-01', motif: ' ' }, { estFormule: true, jour: '2026-10-13' });
    assert.equal(d.length, 4);
  });
});

/* ================================================================== *
 * Données de démonstration
 * ================================================================== */

describe('Lot b4 — données de démonstration', () => {
  before(installer);

  it('est idempotent : une seconde exécution n’ajoute rien', async () => {
    const avant = ['paiement', 'contentieux', 'utilisateur', 'abonnement'].map((e) => depot(e).brutTous().length);
    await amorcerLotB4();
    const apres = ['paiement', 'contentieux', 'utilisateur', 'abonnement'].map((e) => depot(e).brutTous().length);
    assert.deepEqual(apres, avant);
  });

  it('donne une durée à la formule annuelle et un reçu à chaque abonnement initial', () => {
    assert.equal(depot('tarif').brutParId(ANNUEL).dureeMois, 12);
    const initiaux = depot('abonnement').brutTous();
    for (const a of initiaux) {
      assert.ok(depot('paiement').brutOu((p) => p.abonnementId === a.id).length === 1, `abonnement ${a.id} sans reçu`);
    }
  });

  it('respecte les invariants du schéma (quatre yeux, pièce, formule)', () => {
    for (const p of depot('paiement').brutTous()) {
      if (p.canal === CANAL_PAIEMENT.GUICHET && p.etat === ETAT_PAIEMENT.ENCAISSE) {
        assert.notEqual(p.valideParUtilisateurId, p.saisiParUtilisateurId);
      }
    }
    const numeros = depot('paiement').brutTous().map((p) => p.numero);
    assert.equal(new Set(numeros).size, numeros.length, 'numéros de reçu en double');
  });
});

/* ================================================================== *
 * Réabonnement en ligne
 * ================================================================== */

describe('Lot b4 — réabonnement en ligne (simulé)', () => {
  before(installer);

  it('prolonge un abonnement en cours à partir du lendemain de l’échéance, et émet un reçu', () => {
    const fin = finDe('grp-aff-1');
    const { paiement: p, abonnement: a } = paiement.renouvelerEnLigne(ctxDe('u-aff-1'), { tarifId: ANNUEL, ...mobile() });
    assert.equal(a.debuteLe, F.ajouterJours(fin, 1));
    assert.equal(finDe('grp-aff-1'), a.finitLe);
    assert.equal(p.etat, ETAT_PAIEMENT.ENCAISSE);
    assert.equal(p.canal, CANAL_PAIEMENT.EN_LIGNE);
    assert.match(p.numero, /^RC-\d{4}-\d{4}$/);
    assert.equal(p.montant, depot('tarif').brutParId(ANNUEL).montant);
    assert.ok(evenements(EVENEMENT_AUDIT.PAIEMENT_EN_LIGNE).some((e) => e.cibleId === p.id));
    assert.ok(evenements(EVENEMENT_AUDIT.ABONNEMENT_PROLONGE).length > 0);
  });

  it('rouvre l’accès d’une entreprise dont l’abonnement a expiré', () => {
    const ctx = ctxDe('u-aff-2');
    assert.equal(ctx.abonnementActif, false);
    assert.equal(decider(ctx, 'abonnement.prolonger', { groupementId: 'grp-aff-2' }).autorise, true);
    const { abonnement: a } = paiement.renouvelerEnLigne(ctx, { tarifId: ANNUEL, mode: MODE_PAIEMENT.CARTE, referenceTransaction: refUnique('CB') });
    assert.equal(a.debuteLe, F.aujourdhui());
    assert.equal(ctxDe('u-aff-2').abonnementActif, true);
  });

  it('refuse le paiement à un sous-compte', () => {
    assert.throws(() => paiement.renouvelerEnLigne(ctxDe('u-aux-1'), { tarifId: ANNUEL, ...mobile() }));
  });

  it('refuse à l’autorité de contrôle et à l’exploitant de payer en ligne pour une entreprise', () => {
    assert.throws(() => paiement.renouvelerEnLigne(ctxDe('u-dgttc'), { tarifId: ANNUEL, ...mobile() }));
    assert.throws(() => paiement.renouvelerEnLigne(ctxDe('u-conc'), { tarifId: ANNUEL, ...mobile() }));
  });

  it('refuse une transaction déjà enregistrée, quels que soient les séparateurs', () => {
    const ref = refUnique();
    paiement.renouvelerEnLigne(ctxDe('u-tra-1'), { tarifId: ANNUEL, ...mobile(ref) });
    const variante = `${ref.slice(0, 4)}-${ref.slice(4).toLowerCase()}`;
    assert.throws(() => paiement.renouvelerEnLigne(ctxDe('u-tra-1'), { tarifId: ANNUEL, ...mobile(variante) }), /déjà été enregistrée/);
  });

  it('refuse un débit du compte quand le solde ne suffit pas, sans rien écrire', () => {
    const avant = depot('abonnement').brutTous().length;
    assert.throws(
      () => paiement.renouvelerEnLigne(ctxDe('u-tra-2'), { tarifId: ANNUEL, mode: MODE_PAIEMENT.DEBIT_COMPTE }),
      /Solde insuffisant/,
    );
    assert.equal(depot('abonnement').brutTous().length, avant);
  });

  it('débite le compte et prolonge dans la même opération quand le solde suffit', () => {
    const ctxConc = ctxDe('u-conc');
    const montantAbo = depot('tarif').brutParId(ANNUEL).montant;
    const c = compte.saisirCredit(ctxConc, { groupementId: 'grp-tra-1', montant: montantAbo, referenceEncaissement: 'ENC-B4-DEBIT' });
    compte.validerCredit(ctxDe('u-conc-2'), c.id, { rapprochementConfirme: true });
    const solde = compte.soldeDe('grp-tra-1');
    const { paiement: p } = paiement.renouvelerEnLigne(ctxDe('u-tra-1'), { tarifId: ANNUEL, mode: MODE_PAIEMENT.DEBIT_COMPTE });
    assert.equal(compte.soldeDe('grp-tra-1'), solde - montantAbo);
    assert.ok(p.operationId);
  });

  it('refuse un numéro de mobile money invalide et un tarif qui n’est pas une formule', () => {
    assert.throws(() => paiement.renouvelerEnLigne(ctxDe('u-aff-1'), { tarifId: ANNUEL, ...mobile(), numero: '12345' }), /dix chiffres/);
    assert.throws(() => paiement.renouvelerEnLigne(ctxDe('u-aff-1'), { tarifId: CODE_TARIF.FRAIS_AFFRETEUR, ...mobile() }), /formule/);
  });

  it('trace un paiement refusé sans rien débiter ni créditer', () => {
    const avant = depot('paiement').brutTous().length;
    paiement.signalerEchec(ctxDe('u-aff-1'), { objet: OBJET_PAIEMENT.ABONNEMENT, mode: MODE_PAIEMENT.MOBILE_MONEY });
    assert.equal(depot('paiement').brutTous().length, avant);
    assert.ok(evenements(EVENEMENT_AUDIT.PAIEMENT_REFUSE).length > 0);
  });
});

/* ================================================================== *
 * Rechargement en ligne
 * ================================================================== */

describe('Lot b4 — rechargement du compte par mobile money (simulé)', () => {
  before(installer);

  it('crédite directement : la transaction de l’opérateur fait foi', () => {
    const avant = compte.soldeDe('grp-aff-1');
    const unitaire = paiement.fraisUnitaire('grp-aff-1');
    const { paiement: p, operation } = paiement.rechargerEnLigne(ctxDe('u-aff-1'), { nombre: 3, ...mobile() });
    assert.equal(compte.soldeDe('grp-aff-1'), avant + 3 * unitaire);
    assert.equal(p.etat, ETAT_PAIEMENT.ENCAISSE);
    assert.equal(operation.referenceEncaissement, p.referenceTransaction);
    assert.equal(paiement.mesPaiements(ctxDe('u-aff-1'))[0].id, p.id);
  });

  it('refuse un sous-compte, un nombre hors bornes et une transaction rejouée', () => {
    assert.throws(() => paiement.rechargerEnLigne(ctxDe('u-aux-1'), { nombre: 1, ...mobile() }));
    assert.throws(() => paiement.rechargerEnLigne(ctxDe('u-aff-1'), { nombre: 0, ...mobile() }), /entre 1 et/);
    assert.throws(() => paiement.rechargerEnLigne(ctxDe('u-aff-1'), { nombre: 999, ...mobile() }), /entre 1 et/);
    const ref = refUnique();
    paiement.rechargerEnLigne(ctxDe('u-tra-1'), { nombre: 1, ...mobile(ref) });
    assert.throws(() => paiement.rechargerEnLigne(ctxDe('u-aff-1'), { nombre: 1, ...mobile(ref) }), /déjà été enregistrée/);
  });

  it('ne sert à une entreprise que ses propres paiements', () => {
    const autres = paiement.mesPaiements(ctxDe('u-aff-1')).filter((p) => p.groupementId !== 'grp-aff-1');
    assert.equal(autres.length, 0);
    const etranger = depot('paiement').brutOu((p) => p.groupementId === 'grp-tra-1')[0];
    assert.throws(() => paiement.paiementDetaille(ctxDe('u-aff-1'), etranger.id));
  });
});

/* ================================================================== *
 * Caisse : quatre yeux
 * ================================================================== */

describe('Lot b4 — caisse : saisie au guichet puis validation par une autre personne', () => {
  before(installer);

  it('n’a aucun effet à la saisie d’un réabonnement, et prolonge à la validation', () => {
    const fin = finDe('grp-aff-1');
    const p = caisse.encaisser(ctxDe('u-conc'), {
      groupementId: 'grp-aff-1',
      objet: OBJET_PAIEMENT.ABONNEMENT,
      mode: MODE_PAIEMENT.ESPECES,
      tarifId: ANNUEL,
    });
    assert.equal(p.etat, ETAT_PAIEMENT.EN_ATTENTE);
    assert.equal(finDe('grp-aff-1'), fin, 'la saisie a prolongé l’abonnement');

    assert.throws(() => caisse.validerEncaissement(ctxDe('u-conc'), p.id, { rapprochementConfirme: true }), /autre personne/);
    assert.throws(() => caisse.validerEncaissement(ctxDe('u-conc-2'), p.id, { rapprochementConfirme: false }), /rapproché/);
    const v = caisse.validerEncaissement(ctxDe('u-conc-2'), p.id, { rapprochementConfirme: true });
    assert.equal(v.etat, ETAT_PAIEMENT.ENCAISSE);
    assert.equal(finDe('grp-aff-1') > fin, true);
    assert.throws(() => caisse.validerEncaissement(ctxDe('u-conc-2'), p.id, { rapprochementConfirme: true }), /déjà été traité/);
  });

  it('garde le prix du jour de la saisie si le tarif change avant la validation', () => {
    const prix = depot('tarif').brutParId(ANNUEL).montant;
    const p = caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-tra-1', objet: OBJET_PAIEMENT.ABONNEMENT, mode: MODE_PAIEMENT.ESPECES, tarifId: ANNUEL });
    tarif.modifierTarif(ctxDe('u-conc'), ANNUEL, { montant: prix + 10000, dureeMois: 12, effetLe: F.aujourdhui(), motif: 'Révision test' });
    const v = caisse.validerEncaissement(ctxDe('u-conc-2'), p.id, { rapprochementConfirme: true });
    assert.equal(depot('abonnement').brutParId(v.abonnementId).montant, prix);
  });

  it('passe un rechargement au guichet par un crédit en quatre yeux', () => {
    const solde = compte.soldeDe('grp-aff-1');
    const p = caisse.encaisser(ctxDe('u-conc'), {
      groupementId: 'grp-aff-1',
      objet: OBJET_PAIEMENT.RECHARGEMENT,
      mode: MODE_PAIEMENT.CHEQUE,
      montant: 40000,
      referencePiece: 'CHQ-B4-0001',
    });
    const credit = depot('credit').brutParId(p.creditId);
    assert.equal(credit.etat, ETAT_CREDIT.EN_ATTENTE);
    assert.equal(credit.referenceEncaissement, p.numero);
    assert.equal(compte.soldeDe('grp-aff-1'), solde);
    caisse.validerEncaissement(ctxDe('u-conc-2'), p.id, { rapprochementConfirme: true });
    assert.equal(compte.soldeDe('grp-aff-1'), solde + 40000);
    assert.equal(depot('credit').brutParId(p.creditId).etat, ETAT_CREDIT.CREDITE);
  });

  it('suit le crédit validé depuis « Crédits à valider »', () => {
    const p = caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-tra-1', objet: OBJET_PAIEMENT.RECHARGEMENT, mode: MODE_PAIEMENT.ESPECES, montant: 5000 });
    compte.validerCredit(ctxDe('u-conc-2'), p.creditId, { rapprochementConfirme: true });
    assert.equal(paiement.etatEffectif(depot('paiement').brutParId(p.id)), ETAT_PAIEMENT.ENCAISSE);
  });

  it('rejette avec motif, sans créditer, et rejette le crédit lié', () => {
    const solde = compte.soldeDe('grp-tra-1');
    const p = caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-tra-1', objet: OBJET_PAIEMENT.RECHARGEMENT, mode: MODE_PAIEMENT.ESPECES, montant: 7000 });
    assert.throws(() => caisse.rejeterEncaissement(ctxDe('u-conc-2'), p.id, '  '), /motif/);
    assert.throws(() => caisse.rejeterEncaissement(ctxDe('u-conc'), p.id, 'Absent'), /autre personne/);
    const r = caisse.rejeterEncaissement(ctxDe('u-conc-2'), p.id, 'Montant absent de la caisse.');
    assert.equal(r.etat, ETAT_PAIEMENT.REJETE);
    assert.equal(depot('credit').brutParId(p.creditId).etat, ETAT_CREDIT.REJETE);
    assert.equal(compte.soldeDe('grp-tra-1'), solde);
  });

  it('exige la pièce hors espèces et refuse une pièce déjà servie', () => {
    const base = { groupementId: 'grp-aff-1', objet: OBJET_PAIEMENT.RECHARGEMENT, montant: 1000 };
    assert.throws(() => caisse.encaisser(ctxDe('u-conc'), { ...base, mode: MODE_PAIEMENT.VIREMENT }), /référence de la pièce/);
    caisse.encaisser(ctxDe('u-conc'), { ...base, mode: MODE_PAIEMENT.VIREMENT, referencePiece: 'VIR-B4-77' });
    assert.throws(() => caisse.encaisser(ctxDe('u-conc'), { ...base, mode: MODE_PAIEMENT.VIREMENT, referencePiece: 'vir b4 77' }), /déjà servi/);
  });

  it('refuse la caisse aux entreprises, à la DGTTC et au service contentieux', () => {
    const d = { groupementId: 'grp-aff-1', objet: OBJET_PAIEMENT.RECHARGEMENT, mode: MODE_PAIEMENT.ESPECES, montant: 1000 };
    for (const id of ['u-aff-1', 'u-tra-1', 'u-dgttc', 'u-cont', 'u-compta', 'u-caisse']) {
      assert.throws(() => caisse.encaisser(ctxDe(id), d), undefined, `${id} encaisse`);
    }
    const attente = depot('paiement').brutParId('pai-demo-attente');
    assert.throws(() => caisse.validerEncaissement(ctxDe('u-dgttc'), attente.id, { rapprochementConfirme: true }));
  });

  it('valide le réabonnement de démonstration saisi par l’agent n° 1', () => {
    const v = caisse.validerEncaissement(ctxDe('u-conc-2'), 'pai-demo-attente', { rapprochementConfirme: true });
    assert.equal(v.etat, ETAT_PAIEMENT.ENCAISSE);
    assert.equal(ctxDe('u-tra-2').abonnementActif, true);
  });

  it('ne fixe pas le prix d’un réabonnement à la main', () => {
    const p = caisse.encaisser(ctxDe('u-conc'), {
      groupementId: 'grp-aff-1',
      objet: OBJET_PAIEMENT.ABONNEMENT,
      mode: MODE_PAIEMENT.ESPECES,
      tarifId: ANNUEL,
      montant: 1,
    });
    assert.equal(p.montant, depot('tarif').brutParId(ANNUEL).montant);
  });
});

/* ================================================================== *
 * Tarifs
 * ================================================================== */

describe('Lot b4 — modification des tarifs', () => {
  before(installer);

  it('applique immédiatement une modification du jour, sans toucher aux abonnements en cours', () => {
    const avant = depot('abonnement').brutTous().map((a) => [a.id, a.montant, a.finitLe]);
    const r = tarif.modifierTarif(ctxDe('u-conc'), ANNUEL, { montant: 175000, dureeMois: 12, effetLe: F.aujourdhui(), motif: 'Révision annuelle' });
    assert.equal(r.etat, ETAT_REVISION.APPLIQUEE);
    assert.equal(depot('tarif').brutParId(ANNUEL).montant, 175000);
    assert.deepEqual(depot('abonnement').brutTous().map((a) => [a.id, a.montant, a.finitLe]), avant);
    assert.ok(evenements(EVENEMENT_AUDIT.TARIF_MODIFIE).some((e) => e.cibleId === ANNUEL));
  });

  it('programme une modification future et l’applique à sa date', () => {
    const effet = F.ajouterJours(F.aujourdhui(), 10);
    const r = tarif.modifierTarif(ctxDe('u-conc'), CODE_TARIF.FRAIS_AFFRETEUR, { montant: 12000, effetLe: effet, motif: 'Ajustement' });
    assert.equal(r.etat, ETAT_REVISION.PROGRAMMEE);
    const prix = depot('tarif').brutParId(CODE_TARIF.FRAIS_AFFRETEUR).montant;
    assert.notEqual(prix, 12000);
    assert.throws(
      () => tarif.modifierTarif(ctxDe('u-conc'), CODE_TARIF.FRAIS_AFFRETEUR, { montant: 13000, effetLe: effet, motif: 'Doublon' }),
      /déjà programmée/,
    );
    assert.equal(tarif.appliquerRevisionsEchues(new Date(`${effet}T08:00:00Z`)), 1);
    assert.equal(depot('tarif').brutParId(CODE_TARIF.FRAIS_AFFRETEUR).montant, 12000);
    assert.equal(depot('revisionTarif').brutParId(r.id).etat, ETAT_REVISION.APPLIQUEE);
  });

  it('annule une modification programmée, puis refuse de l’annuler deux fois', () => {
    const r = tarif.modifierTarif(ctxDe('u-conc'), CODE_TARIF.FRAIS_TRANSPORTEUR, { montant: 9000, effetLe: F.ajouterJours(F.aujourdhui(), 5), motif: 'Essai' });
    tarif.annulerProgrammation(ctxDe('u-conc'), r.id);
    assert.equal(depot('revisionTarif').brutParId(r.id).etat, ETAT_REVISION.ANNULEE);
    assert.throws(() => tarif.annulerProgrammation(ctxDe('u-conc'), r.id), /encore programmée/);
  });

  it('refuse une modification rétroactive, sans motif ou inchangée', () => {
    const t = depot('tarif').brutParId(ANNUEL);
    assert.throws(() => tarif.modifierTarif(ctxDe('u-conc'), ANNUEL, { montant: 1000, dureeMois: 12, effetLe: '2020-01-01', motif: 'x' }), /rétroactive/);
    assert.throws(() => tarif.modifierTarif(ctxDe('u-conc'), ANNUEL, { montant: 1000, dureeMois: 12, effetLe: F.aujourdhui(), motif: '' }), /motif/);
    assert.throws(() => tarif.modifierTarif(ctxDe('u-conc'), ANNUEL, { montant: t.montant, dureeMois: t.dureeMois, effetLe: F.aujourdhui(), motif: 'x' }), /inchangés/);
  });

  it('refuse la modification à tout autre rôle que l’exploitant', () => {
    for (const id of ['u-aff-1', 'u-dgttc', 'u-compta', 'u-cont', 'u-caisse']) {
      assert.throws(() => tarif.modifierTarif(ctxDe(id), ANNUEL, { montant: 1000, dureeMois: 12, effetLe: F.aujourdhui(), motif: 'x' }), undefined, id);
    }
  });
});

/* ================================================================== *
 * Contentieux
 * ================================================================== */

describe('Lot b4 — contentieux', () => {
  before(installer);

  it('ouvre un dossier avec ses pièces, numéroté et journalisé', () => {
    const c = contentieux.ouvrirContentieux(ctxDe('u-cont'), {
      groupementId: 'grp-tra-1',
      partieAdverseGroupementId: 'grp-aff-1',
      nature: F.NATURE_CONTENTIEUX.LITIGE_TRANSPORT,
      objet: 'Retard de livraison contesté.',
      montant: 30000,
      pieces: [{ nom: 'Constat.pdf', type: 'application/pdf', taille: 1000 }],
    });
    assert.match(c.reference, /^CT-\d{4}-\d{4}$/);
    assert.equal(c.etape, ETAPE_CONTENTIEUX.OUVERT);
    assert.equal(c.pieces.length, 1);
    assert.ok(evenements(EVENEMENT_AUDIT.CONTENTIEUX_OUVERT).some((e) => e.cibleId === c.id));
  });

  it('avance d’une étape à la fois, avec commentaire, puis se clôt avec son issue', () => {
    const [c] = contentieux.listeContentieux(ctxDe('u-cont'), (x) => x.objet === 'Retard de livraison contesté.');
    assert.throws(() => contentieux.avancerContentieux(ctxDe('u-cont'), c.id, { vers: ETAPE_CONTENTIEUX.CONCILIATION, commentaire: 'x' }), /se suivent/);
    assert.throws(() => contentieux.avancerContentieux(ctxDe('u-cont'), c.id, { vers: ETAPE_CONTENTIEUX.INSTRUCTION, commentaire: '' }), /justifie/);
    contentieux.avancerContentieux(ctxDe('u-cont'), c.id, { vers: ETAPE_CONTENTIEUX.INSTRUCTION, commentaire: 'Pièces reçues.' });
    contentieux.ajouterPiece(ctxDe('u-cont'), c.id, { nom: 'Courrier.pdf' });
    assert.throws(() => contentieux.cloreContentieux(ctxDe('u-cont'), c.id, { issue: '', commentaire: 'x' }), /issue/);
    const clos = contentieux.cloreContentieux(ctxDe('u-cont'), c.id, { issue: F.ISSUE_CONTENTIEUX.REGLE_AMIABLE, commentaire: 'Accord trouvé.' });
    assert.equal(clos.etape, ETAPE_CONTENTIEUX.CLOS);
    assert.equal(clos.historique.length, 4);
    assert.throws(() => contentieux.ajouterPiece(ctxDe('u-cont'), c.id, { nom: 'Tard.pdf' }), /clos/);
  });

  it('laisse l’exploitant consulter sans instruire, et ferme le contentieux aux entreprises', () => {
    assert.ok(contentieux.listeContentieux(ctxDe('u-conc')).length >= 2);
    assert.throws(() => contentieux.avancerContentieux(ctxDe('u-conc'), 'ctx-demo-2', { vers: ETAPE_CONTENTIEUX.INSTRUCTION, commentaire: 'x' }));
    assert.throws(() => contentieux.listeContentieux(ctxDe('u-aff-1')));
    assert.throws(() => contentieux.listeContentieux(ctxDe('u-dgttc')));
  });

  it('refuse une mise en relation qui ne concerne pas l’entreprise', () => {
    const ap = depot('appariement').brutOu((a) => a.groupementAffreteurId !== 'grp-tra-2' && a.groupementTransporteurId !== 'grp-tra-2')[0];
    if (!ap) return;
    assert.throws(
      () => contentieux.ouvrirContentieux(ctxDe('u-cont'), { groupementId: 'grp-tra-2', appariementId: ap.id, nature: 'autre', objet: 'x', montant: 0 }),
      /ne concerne pas/,
    );
  });

  it('impute un règlement encaissé à la caisse seulement à sa validation, sans dépasser le dû', () => {
    assert.throws(
      () => caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-aff-2', objet: OBJET_PAIEMENT.CONTENTIEUX, contentieuxId: 'ctx-demo-1', mode: MODE_PAIEMENT.ESPECES, montant: 60000 }),
      /restant dû/,
    );
    const p = caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-aff-2', objet: OBJET_PAIEMENT.CONTENTIEUX, contentieuxId: 'ctx-demo-1', mode: MODE_PAIEMENT.ESPECES, montant: 30000 });
    assert.equal(depot('contentieux').brutParId('ctx-demo-1').montantRegle, 0);
    assert.equal(caisse.contentieuxReglables(ctxDe('u-conc'), 'grp-aff-2')[0].restant, 20000);
    caisse.validerEncaissement(ctxDe('u-conc-2'), p.id, { rapprochementConfirme: true });
    assert.equal(depot('contentieux').brutParId('ctx-demo-1').montantRegle, 30000);
    assert.throws(
      () => caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-tra-1', objet: OBJET_PAIEMENT.CONTENTIEUX, contentieuxId: 'ctx-demo-1', mode: MODE_PAIEMENT.ESPECES, montant: 100 }),
      /contentieux réglé par ce client/,
    );
  });
});

/* ================================================================== *
 * États financiers et exports
 * ================================================================== */

describe('Lot b4 — états financiers et exports', () => {
  before(installer);

  it('totalise par période, par mode et par objet', () => {
    const e = rapport.etatFinancier(ctxDe('u-conc'), { du: '2000-01-01', au: F.aujourdhui() });
    const encaisses = depot('paiement').brutOu((p) => paiement.etatEffectif(p) === ETAT_PAIEMENT.ENCAISSE);
    assert.equal(e.totaux.nombre, encaisses.length);
    assert.equal(e.parMode.reduce((n, m) => n + m.montant, 0), e.totaux.encaisse);
    assert.equal(e.totaux.abonnements + e.totaux.depots + e.totaux.contentieux, e.totaux.encaisse);
    assert.equal(e.identiteVisible, true);
    assert.ok(e.lignes.some((l) => l.client === NOM_AFF_1));
  });

  it('filtre par mode de paiement et refuse une période inversée', () => {
    const e = rapport.etatFinancier(ctxDe('u-conc'), { du: '2000-01-01', au: F.aujourdhui(), mode: MODE_PAIEMENT.CHEQUE });
    assert.ok(e.lignes.length > 0 && e.lignes.every((l) => l.mode === MODE_PAIEMENT.CHEQUE));
    assert.throws(() => rapport.etatFinancier(ctxDe('u-conc'), { du: '2026-12-01', au: '2026-01-01' }), /précéder/);
  });

  it('sert les montants sans l’identité des entreprises à la supervision comptable', () => {
    const e = rapport.etatFinancier(ctxDe('u-compta'), { du: '2000-01-01', au: F.aujourdhui() });
    assert.equal(e.identiteVisible, false);
    assert.ok(e.totaux.encaisse > 0);
    assert.ok(e.lignes.every((l) => l.client === null));
    const { contenu } = rapport.exporterCsv(ctxDe('u-compta'), { du: '2000-01-01', au: F.aujourdhui() });
    assert.ok(!contenu.includes('DÉMO'), 'une raison sociale figure dans l’export');
    assert.ok(contenu.includes('Non communiqué'));
    assert.ok(evenements(EVENEMENT_AUDIT.EXPORT_FINANCIER).length > 0);
  });

  it('refuse les états financiers à la DGTTC, aux entreprises et au contentieux', () => {
    for (const id of ['u-dgttc', 'u-aff-1', 'u-tra-1', 'u-cont', 'u-caisse']) {
      assert.throws(() => rapport.etatFinancier(ctxDe(id)), undefined, id);
    }
  });

  it('ne met ni montant ni nom d’entreprise dans le journal', () => {
    for (const e of depot('audit').brutOu((a) => String(a.evenement).match(/paiement|encaissement|tarif|export|recu/))) {
      assert.ok(!/\d{1,3}(?:[\s ]\d{3})+|F CFA/.test(e.details ?? ''), `montant au journal : ${e.details}`);
      assert.ok(!/DÉMO/.test(e.details ?? ''), `nom au journal : ${e.details}`);
    }
  });
});

/* ================================================================== *
 * Reçus et documents PDF
 * ================================================================== */

describe('Lot b4 — reçu de paiement et état PDF', () => {
  before(installer);

  it('rend un reçu original puis un duplicata numéroté', () => {
    const { paiement: p } = paiement.renouvelerEnLigne(ctxDe('u-aff-1'), { tarifId: ANNUEL, ...mobile() });
    const donnees = recu.donneesRecu(ctxDe('u-aff-1'), p.id);
    assert.equal(donnees.numeroPayeur, undefined);
    assert.equal(donnees.numeroPayeurMasque, '07 •• •• •• 04');
    const doc = construireRecuPdf(jsPDF, donnees, { empreinte: 'a'.repeat(64), rang: 1 });
    assert.ok(doc.getNumberOfPages() >= 1);
    assert.equal(paiement.noterEditionRecu(ctxDe('u-aff-1'), p.id), 1);
    assert.equal(paiement.noterEditionRecu(ctxDe('u-aff-1'), p.id), 2);
    // Flux non compressé, pour lire le texte du document.
    class JsPdfLisible extends jsPDF {
      constructor(o) {
        super({ ...o, compress: false });
      }
    }
    const sortie = construireRecuPdf(JsPdfLisible, donnees, { empreinte: 'b'.repeat(64), rang: 2 }).output();
    assert.match(sortie, /DUPLICATA/);
    assert.match(construireRecuPdf(JsPdfLisible, donnees, { empreinte: 'b'.repeat(64), rang: 1 }).output(), /ORIGINAL/);
    assert.equal(evenements(EVENEMENT_AUDIT.RECU_EDITE).filter((e) => e.cibleId === p.id).length, 2);
  });

  it('ne sert pas le numéro du payeur à l’exploitant', () => {
    const p = depot('paiement').brutOu((x) => x.numeroPayeur)[0];
    assert.ok(p, 'aucun paiement avec numéro de payeur');
    assert.equal(recu.donneesRecu(ctxDe('u-conc'), p.id).numeroPayeurMasque, null);
  });

  it('refuse le reçu d’une autre entreprise', () => {
    const p = depot('paiement').brutOu((x) => x.groupementId === 'grp-tra-1')[0];
    assert.throws(() => recu.donneesRecu(ctxDe('u-aff-1'), p.id));
    assert.throws(() => recu.donneesRecu(ctxDe('u-dgttc'), p.id));
  });

  it('rend l’état financier PDF sur plusieurs pages si besoin', () => {
    const e = rapport.etatFinancier(ctxDe('u-compta'), { du: '2000-01-01', au: F.aujourdhui() });
    const doc = construireEtatPdf(
      jsPDF,
      {
        titre: 'État',
        periode: 'Période',
        identiteVisible: e.identiteVisible,
        totaux: e.totaux,
        parMode: e.parMode,
        colonnes: [...rapport.COLONNES_EXPORT],
        lignes: Array.from({ length: 80 }, () => rapport.lignesExport(e)[0]),
        auteur: 'Test',
      },
      { empreinte: 'c'.repeat(64) },
    );
    assert.ok(doc.getNumberOfPages() >= 2);
  });
});

/* ================================================================== *
 * Droits, menus et écrans
 * ================================================================== */

describe('Lot b4 — menus et écrans', () => {
  before(installer);

  const routes = (id) => arborescenceDe(ctxDe(id)).flatMap((z) => z.pages.map((p) => p.route));

  it('ouvre à chaque rôle les seuls écrans de son métier', () => {
    assert.ok(routes('u-aff-1').includes('paiements'));
    assert.ok(routes('u-tra-1').includes('paiements'));
    for (const r of ['caisse', 'encaissements', 'etats-financiers', 'contentieux', 'tarifs']) assert.ok(routes('u-conc').includes(r), r);
    assert.deepEqual(routes('u-cont').filter((r) => r !== 'dashboard'), ['contentieux']);
    assert.deepEqual(routes('u-compta').filter((r) => r !== 'dashboard'), ['etats-financiers']);
    for (const r of ['caisse', 'encaissements', 'etats-financiers', 'contentieux']) assert.ok(!routes('u-dgttc').includes(r), r);
  });

  it('rend les écrans de l’entreprise, y compris pour un sous-compte', () => {
    for (const id of ['u-aff-1', 'u-aux-1', 'u-tra-2']) {
      const ctx = ctxDe(id);
      for (const vue of [vuesEntreprise.abonnement, vuesEntreprise.compte, vuesEntreprise.paiements]) {
        const t = texteDe(vue(ctx));
        assert.ok(t.length > 0);
      }
    }
    // Abonnement expiré : seul l'écran d'abonnement reste ouvert, et il permet de renouveler.
    const expire = ctxDe('u-aff-2');
    const ouvertes = arborescenceDe(expire).flatMap((z) => z.pages.map((p) => p.route));
    assert.ok(ouvertes.includes('abonnement'), JSON.stringify(ouvertes));
    assert.match(texteDe(vuesEntreprise.abonnement(expire)), /Abonnement expiré/);
    assert.match(texteDe(vuesEntreprise.abonnement(expire)), /Payer et renouveler/);
    assert.match(texteDe(vuesEntreprise.compte(ctxDe('u-aff-1'))), /simulé/);
  });

  it('rend la caisse, la validation, les états, le contentieux et les tarifs', () => {
    assert.match(texteDe(vuesCaisse.caisse(ctxDe('u-conc'))), /quatre yeux/);
    assert.match(texteDe(vuesCaisse.encaissements(ctxDe('u-conc-2'))), /RC-/);
    assert.match(texteDe(vuesCaisse.etatsFinanciers(ctxDe('u-conc'))), new RegExp(NOM_AFF_1));
    const compta = texteDe(vuesCaisse.etatsFinanciers(ctxDe('u-compta')));
    assert.match(compta, /Montants sans identité/);
    assert.ok(!compta.includes(NOM_AFF_1));
    assert.match(texteDe(vueContentieux(ctxDe('u-cont'))), /CT-/);
    assert.match(texteDe(vueTarifs(ctxDe('u-conc'))), /Historique des modifications/);
  });
});
