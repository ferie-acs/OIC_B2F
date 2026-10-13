/**
 * Intégration — défaut connu du lot b3 : sur la carte d'une offre que le
 * transporteur a lui-même proposée (sens B), le statut lu par le transporteur
 * dit qu'il attend la réponse de l'affréteur, pas « en attente de votre réponse ».
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

const { installerDom, texteDe } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer } = await import('../js/seed.js');
const { completerLotB3 } = await import('../js/seed-lot-b3.js');
const { contexteDe } = await import('../js/services/auth.service.js');
const flotte = await import('../js/services/flotte.service.js');
const transporteur = await import('../js/views/transporteur.js');
const { ETAT_APPARIEMENT, ETAT_OFFRE, POV, SENS_APPARIEMENT, STATUT_OFFRE_PROPOSEE, labelOf } = await import('../js/domain/enums.js');

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));

describe('Intégration — statut d’une offre proposée par le transporteur (sens B)', () => {
  /** @type {Record<string, any>} */
  let proposition;

  before(async () => {
    memoireSession.clear();
    initialiserPersistance({ backend: backendMemoire() });
    await amorcer();
    await completerLotB3();
    proposition = depot('appariement').brutOu((a) => a.sens === SENS_APPARIEMENT.DEMANDE_VERS_OFFRE && a.etat === ETAT_APPARIEMENT.RESERVER)[0];
  });

  it('le jeu de démonstration porte une proposition en attente sur une offre réservée', () => {
    assert.ok(proposition);
    assert.equal(depot('offre').brutParId(proposition.offreId).etat, ETAT_OFFRE.RESERVEE);
  });

  it('le service rend le statut « proposée » et un avertissement de retrait adapté', () => {
    const o = flotte.mesOffres(ctxDe('u-tra-1')).find((x) => x.id === proposition.offreId);
    assert.equal(o.statutAffiche, STATUT_OFFRE_PROPOSEE);
    assert.match(o.avertissement, /attend la réponse de l’affréteur/);
    // Une offre réservée par un affréteur (sens A) garde son statut d'origine.
    for (const autre of flotte.mesOffres(ctxDe('u-tra-1')).filter((x) => x.id !== proposition.offreId)) {
      assert.notEqual(autre.statutAffiche, STATUT_OFFRE_PROPOSEE);
    }
  });

  it('la carte de l’offre dit que la réponse est attendue de l’affréteur', () => {
    const page = texteDe(transporteur.offres(ctxDe('u-tra-1')));
    assert.ok(page.includes(labelOf(STATUT_OFFRE_PROPOSEE, POV.TRANSPORTEUR)));
    assert.equal(labelOf(STATUT_OFFRE_PROPOSEE, POV.TRANSPORTEUR), 'Proposée — en attente de la réponse de l’affréteur');
    // Aucune offre de ce jeu n'est réservée par un affréteur : le libellé du sens A n'apparaît pas.
    const sensA = depot('appariement').brutOu((a) => a.sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE && a.etat === ETAT_APPARIEMENT.RESERVER
      && depot('offre').brutParId(a.offreId)?.groupementId === 'grp-tra-1');
    if (sensA.length === 0) assert.ok(!page.includes('Réservée — en attente de votre réponse'));
  });
});
