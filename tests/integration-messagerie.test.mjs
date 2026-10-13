/**
 * Intégration : la messagerie unique (lot b1) reçoit les points d'envoi des
 * lots b2 (code d'activation), b4 (abonnement, paiements, caisse, échéance) et
 * b5 (code d'accès des agents). Toujours à l'adresse enregistrée du compte,
 * jamais un code rendu à l'administrateur.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const memoireSession = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoireSession.has(k) ? memoireSession.get(k) : null),
  setItem: (k, v) => void memoireSession.set(k, v),
  removeItem: (k) => void memoireSession.delete(k),
};

const { installerDom } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer, completerJeuAntiFraude } = await import('../js/seed.js');
const { amorcerLotB1 } = await import('../js/seed-lot-b1.js');
const { completerJeuLotB2 } = await import('../js/seed-lot-b2.js');
const { amorcerLotB4 } = await import('../js/seed-lot-b4.js');
const { amorcerLotB5 } = await import('../js/seed-lot-b5.js');
const { contexteDe } = await import('../js/services/auth.service.js');
const abonnement = await import('../js/services/abonnement.service.js');
const paiement = await import('../js/services/paiement.service.js');
const caisse = await import('../js/services/caisse.service.js');
const comptes = await import('../js/services/utilisateurs-entreprise.service.js');
const filiales = await import('../js/services/filiale.service.js');
const agents = await import('../js/services/agents.service.js');
const messagerie = await import('../js/services/messagerie.service.js');
const { CODE_TARIF, STATUT_MESSAGE } = await import('../js/domain/enums.js');
const { MODE_PAIEMENT, OBJET_PAIEMENT, OPERATEUR_MOBILE } = await import('../js/domain/finances.js');

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));
const messages = (modele, filtre = () => true) => depot('message').brutOu((m) => m.modele === modele && filtre(m));
let n = 0;
const mobile = () => ({
  mode: MODE_PAIEMENT.MOBILE_MONEY,
  operateur: OPERATEUR_MOBILE.ORANGE,
  numero: '07 01 02 03 04',
  referenceTransaction: `OMINTEG${String((n += 1)).padStart(6, '0')}`,
});

describe('Intégration — messagerie unique', () => {
  before(async () => {
    memoireSession.clear();
    initialiserPersistance({ backend: backendMemoire() });
    await amorcer();
    await completerJeuAntiFraude();
    await amorcerLotB1();
    await completerJeuLotB2();
    await amorcerLotB5();
    await amorcerLotB4();
  });

  it('b4 : un réabonnement en ligne écrit aux utilisateurs actifs de l’entreprise, à leur adresse enregistrée', () => {
    const { paiement: p } = paiement.renouvelerEnLigne(ctxDe('u-aff-1'), { tarifId: CODE_TARIF.ABONNEMENT_ANNUEL, ...mobile() });
    const envoyes = messages('abonnement.prolonge', (m) => m.destinataireGroupementId === 'grp-aff-1');
    assert.ok(envoyes.length >= 1);
    for (const m of envoyes) {
      const u = depot('utilisateur').brutParId(m.destinataireUtilisateurId);
      assert.equal(m.adresse, u.email);
      assert.equal(m.statut, STATUT_MESSAGE.SIMULE);
      assert.ok(m.corps.includes(p.numero));
      assert.ok(!/F CFA|\d{2} ?\d{3} F/.test(m.corps), 'aucun montant dans le message');
    }
  });

  it('b4 : rechargement en ligne et paiement non abouti', () => {
    const { paiement: p } = paiement.rechargerEnLigne(ctxDe('u-aff-1'), { nombre: 2, ...mobile() });
    assert.ok(messages('paiement.enregistre', (m) => m.corps.includes(p.numero)).length >= 1);
    paiement.signalerEchec(ctxDe('u-aff-1'), { objet: OBJET_PAIEMENT.ABONNEMENT, mode: MODE_PAIEMENT.MOBILE_MONEY });
    const echecs = messages('paiement.non_abouti');
    assert.equal(echecs.length, 1);
    assert.equal(echecs[0].destinataireUtilisateurId, 'u-aff-1', 'au seul payeur');
  });

  it('b4 : encaissement au guichet validé, puis rejeté, sans motif interne dans le message', () => {
    const p = caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-tra-1', objet: OBJET_PAIEMENT.ABONNEMENT, mode: MODE_PAIEMENT.ESPECES, tarifId: CODE_TARIF.ABONNEMENT_ANNUEL });
    assert.equal(messages('encaissement.valide', (m) => m.corps.includes(p.numero)).length, 0, 'rien à la saisie');
    caisse.validerEncaissement(ctxDe('u-conc-2'), p.id, { rapprochementConfirme: true });
    assert.ok(messages('encaissement.valide', (m) => m.corps.includes(p.numero)).length >= 1);
    assert.ok(messages('abonnement.prolonge', (m) => m.destinataireGroupementId === 'grp-tra-1').length >= 1);

    const r = caisse.encaisser(ctxDe('u-conc'), { groupementId: 'grp-tra-1', objet: OBJET_PAIEMENT.ABONNEMENT, mode: MODE_PAIEMENT.ESPECES, tarifId: CODE_TARIF.ABONNEMENT_ANNUEL });
    caisse.rejeterEncaissement(ctxDe('u-conc-2'), r.id, 'Billets non rapprochés du bordereau interne');
    const rejets = messages('encaissement.rejete', (m) => m.corps.includes(r.numero));
    assert.ok(rejets.length >= 1);
    assert.ok(rejets.every((m) => !m.corps.includes('bordereau interne')));
  });

  it('b4 : rappel d’échéance à 30 jours, une seule fois par période, courriel et SMS', () => {
    const dans20 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    // Toutes les périodes de l'entreprise s'achèvent dans 20 jours.
    for (const a of depot('abonnement').brutOu((x) => x.groupementId === 'grp-tra-2')) {
      depot('abonnement').modifier(a.id, { debuteLe: '2026-01-01', finitLe: dans20 });
    }
    abonnement.rappelerEcheances();
    const premiers = messages('abonnement.echeance', (m) => m.destinataireGroupementId === 'grp-tra-2');
    assert.ok(premiers.some((m) => m.canal === 'courriel') && premiers.some((m) => m.canal === 'sms'));
    abonnement.rappelerEcheances();
    assert.equal(messages('abonnement.echeance', (m) => m.destinataireGroupementId === 'grp-tra-2').length, premiers.length);
  });

  it('b2 : le code d’activation part à l’adresse enregistrée du nouveau compte, pas à l’administrateur', async () => {
    const r = await comptes.creerUtilisateur(ctxDe('u-aff-1'), {
      prenom: 'Awa', nom: 'TOURÉ', email: 'awa.toure@cacao-lagunes.invalid', roleId: 'auxiliaire_affreteur',
    });
    assert.equal(r.code, undefined);
    assert.match(r.destinataire, /^a•+@cacao-lagunes\.invalid$/);
    const m = messages('compte.code', (x) => x.destinataireUtilisateurId === r.utilisateurId);
    assert.equal(m.length, 1);
    assert.equal(m[0].adresse, 'awa.toure@cacao-lagunes.invalid');
    assert.match(m[0].code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await comptes.activerCompte({ email: 'awa.toure@cacao-lagunes.invalid', code: m[0].code, motDePasse: 'Lagune2026', confirmation: 'Lagune2026' });
    // Le journal des messages de l'exploitant ne montre ni l'adresse ni le code.
    const journal = messagerie.journalMessages(ctxDe('u-conc')).filter((x) => x.modele === 'compte.code');
    assert.ok(journal.length >= 1 && journal.every((x) => !x.adresse && !x.code));
  });

  it('b2 : le responsable d’une filiale reçoit son code par la messagerie', async () => {
    const r = await filiales.creerFiliale(ctxDe('u-tra-1'), {
      raisonSociale: 'Trans Lagunes, agence de Bouaké DÉMO',
      localiteId: 'loc-bouake',
      responsable: { prenom: 'Issa', nom: 'KONÉ', email: 'issa.kone@trans-lagunes.invalid' },
    });
    assert.equal(r.code, undefined);
    assert.equal(messages('compte.code', (x) => x.destinataireUtilisateurId === r.utilisateurId).length, 1);
  });

  it('b5 : le code d’accès d’un agent passe par la messagerie unique', async () => {
    const res = await agents.creerCompte(ctxDe('u-conc'), {
      nom: 'YAO', prenom: 'Koffi', email: 'koffi.yao@demo.invalid', roleId: 'agent_caisse', motif: 'Renfort du guichet.',
    });
    assert.equal(res.message.code, undefined);
    const m = messages('acces.code', (x) => x.destinataireUtilisateurId === res.utilisateurId);
    assert.equal(m.length, 1);
    assert.equal(m[0].adresse, 'koffi.yao@demo.invalid');
    await agents.utiliserCodeAcces({ email: 'koffi.yao@demo.invalid', code: m[0].code, motDePasse: 'Guichet2026', confirmation: 'Guichet2026' });
    // Il figure dans la boîte simulée, seul substitut de la messagerie du destinataire.
    assert.ok(messagerie.boiteSimulee({ limite: 200 }).some((x) => x.id === m[0].id));
  });
});
