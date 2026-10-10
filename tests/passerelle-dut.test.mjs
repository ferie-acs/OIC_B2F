/**
 * Passerelle vers la plateforme DUT, lot B : la règle « pas de départ sans DUT
 * validé » et son inactivité hors navigateur (aucune plateforme DUT joignable).
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

const { motifDepartSansDut, exigenceDut, statutDut } = await import('../js/services/passerelle-dut.service.js');

describe('Passerelle DUT — départ et statut du DUT', () => {
  it('autorise le départ quand le DUT est validé', () => {
    assert.equal(motifDepartSansDut({ statut: 'VALIDE' }), null);
  });

  it('refuse le départ sans DUT connu, en l’expliquant', () => {
    assert.match(motifDepartSansDut(null), /Aucun DUT validé/);
    assert.match(motifDepartSansDut({ statut: null }), /Aucun DUT validé/);
  });

  it('refuse le départ pour tout autre statut, en le nommant', () => {
    for (const [statut, libelle] of [['EN_EDITION', 'en préparation'], ['TERMINE', 'soumis'], ['REJETE', 'rejeté'], ['SUSPENDU', 'suspendu'], ['RETIRE', 'retiré']]) {
      assert.match(motifDepartSansDut({ statut }), new RegExp(libelle));
    }
  });

  it('reste inactive hors navigateur : aucune règle, aucun statut', () => {
    assert.deepEqual(exigenceDut('mr-1'), { active: false, motif: null });
    assert.equal(typeof statutDut, 'function');
  });
});
