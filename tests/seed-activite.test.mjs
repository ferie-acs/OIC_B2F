import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initialiserPersistance, depot } from '../js/repositories/index.js';
import { backendMemoire } from '../js/core/storage.js';
import { amorcer } from '../js/seed.js';
import { enrichirDemo } from '../js/seed-activite.js';

test('Le jeu enrichi conserve les données initiales et ne se duplique pas', async()=>{
  initialiserPersistance({backend:backendMemoire()}); await amorcer();
  const original=structuredClone(depot('demande').brutParId('dem-1'));
  await enrichirDemo();
  assert.deepEqual(depot('demande').brutParId('dem-1'),original);
  const dossiers=depot('appariement').brutTous().filter(a=>a.seedScenarioComplete);
  assert.equal(dossiers.length,24);
  for(const [state,count] of [['reserver',4],['accepter',4],['rejeter',4],['annuler',4],['valider',8]]) assert.equal(dossiers.filter(a=>a.etat===state).length,count);
  const transports=depot('transport').brutTous().filter(t=>dossiers.some(a=>a.id===t.appariementId));
  assert.equal(transports.length,8);
  assert.equal(transports.filter(t=>t.etape==='en_route').length,4);
  assert.equal(transports.filter(t=>t.etape==='livre').length,4);
  for(const a of dossiers){
    const d=depot('demande').brutParId(a.demandeId),o=depot('offre').brutParId(a.offreId),dec=depot('declaration').brutParId(d.declarationId);
    assert.equal(dec.provenanceId,o.localiteDepartId);assert.equal(dec.destinationId,o.localiteArriveeId);
    assert.ok(new Date(d.departPrevu)>=new Date(o.disponibleDu));assert.ok(new Date(d.arriveePrevue)<=new Date(o.disponibleAu));
  }
  const counts=['appariement','operation','vehicule','offre','transport','notification'].map(n=>depot(n).brutTous().length);
  await enrichirDemo();
  assert.deepEqual(['appariement','operation','vehicule','offre','transport','notification'].map(n=>depot(n).brutTous().length),counts);
});
