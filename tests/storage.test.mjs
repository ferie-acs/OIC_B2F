/**
 * Tests du stockage : le préfixe et l'atomicité.
 *
 * L'atomicité n'est pas une élégance : elle existe pour que le double débit de la
 * validation soit tout ou rien. Le système existant n'a aucune contrainte
 * d'intégrité en base ; un débit isolé passerait inaperçu.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  ErreurStockage,
  PREFIXE,
  backendMemoire,
  cleDe,
  creerStockage,
} from '../js/core/storage.js';

/**
 * Backend qui échoue à l'écriture d'une clé donnée — simule un quota dépassé.
 * @param {string} cleQuiEchoue
 */
function backendCassant(cleQuiEchoue) {
  const m = new Map();
  return {
    brut: m,
    getItem: (c) => (m.has(c) ? m.get(c) : null),
    setItem: (c, v) => {
      if (c === cleQuiEchoue) throw new Error('QuotaExceededError (simulé)');
      m.set(c, v);
    },
    removeItem: (c) => void m.delete(c),
  };
}

describe('Le préfixe b2f_ — parade du risque R5', () => {
  it('préfixe toute clé', () => {
    assert.equal(cleDe('operations'), 'b2f_operations');
    assert.equal(PREFIXE, 'b2f_');
  });

  it('refuse un nom déjà préfixé, pour éviter le double préfixe', () => {
    assert.throws(() => cleDe('b2f_operations'), /invalide/);
  });

  it('n’écrit que des clés préfixées', () => {
    const socle = backendMemoire();
    const s = creerStockage(socle);
    s.ecrire('operations', [{ id: 'op-1' }]);
    s.transaction((tx) => tx.ecrire('appariements', [{ id: 'ap-1' }]));

    // Le backend mémoire n'expose pas ses clés : on vérifie par la lecture directe.
    assert.notEqual(socle.getItem('b2f_operations'), null);
    assert.equal(socle.getItem('operations'), null, 'une clé non préfixée a été écrite');
  });

  it('ne réinitialise que les collections du POC', () => {
    const socle = backendMemoire();
    socle.setItem('dut_theme', 'dark'); // appartient au POC DUT, même origine
    const s = creerStockage(socle);
    s.ecrire('operations', [{ id: 'op-1' }]);

    s.reinitialiser(['operations', 'appariements']);

    assert.deepEqual(s.lire('operations'), []);
    assert.equal(socle.getItem('dut_theme'), 'dark', 'le POC DUT a été touché');
  });
});

describe('Lecture', () => {
  it('rend une liste vide pour une collection absente', () => {
    const s = creerStockage(backendMemoire());
    assert.deepEqual(s.lire('operations'), []);
  });

  it('lève sur un contenu illisible au lieu de rendre une liste vide', () => {
    const socle = backendMemoire();
    socle.setItem('b2f_operations', '{ ceci n’est pas du JSON');
    const s = creerStockage(socle);
    assert.throws(() => s.lire('operations'), ErreurStockage);
  });

  it('lève si le contenu n’est pas une liste', () => {
    const socle = backendMemoire();
    socle.setItem('b2f_operations', '{"id":"op-1"}');
    const s = creerStockage(socle);
    assert.throws(() => s.lire('operations'), /ne contient pas une liste/);
  });
});

describe('Transaction — tout ou rien', () => {
  it('applique plusieurs collections en un lot', () => {
    const s = creerStockage(backendMemoire());
    s.transaction((tx) => {
      tx.ecrire('operations', [{ id: 'op-1' }, { id: 'op-2' }]);
      tx.ecrire('appariements', [{ id: 'ap-1', etat: 'valider' }]);
    });

    assert.equal(s.lire('operations').length, 2);
    assert.equal(s.lire('appariements')[0].etat, 'valider');
  });

  it('laisse les lectures du lot voir ses propres écritures', () => {
    const s = creerStockage(backendMemoire());
    s.ecrire('operations', [{ id: 'op-1', montant: 10 }]);

    const total = s.transaction((tx) => {
      tx.ecrire('operations', [...tx.lire('operations'), { id: 'op-2', montant: 5 }]);
      return tx.lire('operations').reduce((n, o) => n + o.montant, 0);
    });

    assert.equal(total, 15);
    assert.equal(s.lire('operations').length, 2);
  });

  it('n’écrit rien si le travail lève avant le commit', () => {
    const s = creerStockage(backendMemoire());
    s.ecrire('operations', [{ id: 'op-0' }]);

    assert.throws(() =>
      s.transaction((tx) => {
        tx.ecrire('operations', [{ id: 'op-1' }]);
        throw new Error('solde insuffisant');
      }),
    );

    assert.deepEqual(s.lire('operations'), [{ id: 'op-0' }]);
  });

  it('DOUBLE DÉBIT : restaure tout si la seconde écriture échoue', () => {
    const socle = backendCassant('b2f_appariements');
    const s = creerStockage(socle);

    // État initial : un mouvement, un appariement accepté.
    s.ecrire('operations', [{ id: 'op-0' }]);
    socle.brut.set('b2f_appariements', JSON.stringify([{ id: 'ap-1', etat: 'accepter' }]));

    assert.throws(
      () =>
        s.transaction((tx) => {
          tx.ecrire('operations', [
            { id: 'op-0' },
            { id: 'op-affreteur', sens: 'debit', montant: 15000 },
            { id: 'op-transporteur', sens: 'debit', montant: 15000 },
          ]);
          tx.ecrire('appariements', [{ id: 'ap-1', etat: 'valider' }]);
        }),
      /annulée intégralement/,
    );

    // Aucun débit isolé n'a survécu.
    assert.deepEqual(s.lire('operations'), [{ id: 'op-0' }], 'un débit isolé a été conservé');
    assert.equal(s.lire('appariements')[0].etat, 'accepter');
  });

  it('efface le journal d’annulation après un commit réussi', () => {
    const socle = backendMemoire();
    const s = creerStockage(socle);
    s.transaction((tx) => tx.ecrire('operations', [{ id: 'op-1' }]));

    assert.equal(socle.getItem('b2f_tx_journal'), null);
    assert.deepEqual(s.restaurerSiInterrompu(), { restauree: false, collections: [] });
  });
});

describe('Reprise après interruption', () => {
  it('défait les écritures d’une transaction restée en cours', () => {
    const socle = backendMemoire();

    // On simule l'état laissé par une interruption entre l'application et
    // l'effacement du journal : les collections portent les nouvelles valeurs,
    // le journal porte encore les anciennes.
    socle.setItem('b2f_operations', JSON.stringify([{ id: 'op-0' }, { id: 'op-partiel' }]));
    socle.setItem('b2f_appariements', JSON.stringify([{ id: 'ap-1', etat: 'valider' }]));
    socle.setItem(
      'b2f_tx_journal',
      JSON.stringify({
        horodatage: Date.now(),
        avant: {
          b2f_operations: JSON.stringify([{ id: 'op-0' }]),
          b2f_appariements: JSON.stringify([{ id: 'ap-1', etat: 'accepter' }]),
        },
      }),
    );

    const s = creerStockage(socle);
    const bilan = s.restaurerSiInterrompu();

    assert.equal(bilan.restauree, true);
    assert.deepEqual(bilan.collections.sort(), ['b2f_appariements', 'b2f_operations']);
    assert.deepEqual(s.lire('operations'), [{ id: 'op-0' }]);
    assert.equal(s.lire('appariements')[0].etat, 'accepter');
    assert.equal(socle.getItem('b2f_tx_journal'), null);
  });

  it('supprime une collection qui n’existait pas avant la transaction', () => {
    const socle = backendMemoire();
    socle.setItem('b2f_transports', JSON.stringify([{ id: 't-1' }]));
    socle.setItem(
      'b2f_tx_journal',
      JSON.stringify({ horodatage: Date.now(), avant: { b2f_transports: null } }),
    );

    const s = creerStockage(socle);
    s.restaurerSiInterrompu();

    assert.equal(socle.getItem('b2f_transports'), null);
  });

  it('lève sur un journal illisible plutôt que de l’effacer en silence', () => {
    const socle = backendMemoire();
    socle.setItem('b2f_tx_journal', 'illisible');
    const s = creerStockage(socle);
    assert.throws(() => s.restaurerSiInterrompu(), /incohérentes/);
  });
});
