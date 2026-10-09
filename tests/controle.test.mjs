import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { etatCarteTransport } from '../js/services/controle.service.js';
const maintenant = new Date('2026-10-01T12:00:00').getTime();
test('un véhicule occupé ou hors service ne possède pas nécessairement une carte expirée', () => {
  for (const etat of ['engage', 'hors_service', 'disponible']) {
    assert.equal(etatCarteTransport({etat,carteTransportEcheance:'2027-01-01'}, maintenant),'valide');
  }
});
test('la carte reste valide toute sa journée d’échéance', () => {
  assert.equal(etatCarteTransport({carteTransportEcheance:'2026-10-01'}, maintenant),'valide');
  assert.equal(etatCarteTransport({carteTransportEcheance:'2026-09-30'}, maintenant),'expiree');
});
test('une date manquante ou invalide reste distincte d’une expiration', () => {
  for (const carteTransportEcheance of [null,'','invalide','2026-02-30']) {
    assert.equal(etatCarteTransport({carteTransportEcheance}, maintenant),'inconnue');
  }
});
