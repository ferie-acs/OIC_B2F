import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';
import { installerDom, texteDe } from './helpers/mini-dom.mjs';
import { backendMemoire } from '../js/core/storage.js';
import { initialiserPersistance, depot } from '../js/repositories/index.js';
import { amorcer } from '../js/seed.js';
import { contexteDe } from '../js/services/auth.service.js';
import { dashboard } from '../js/views/dashboard-affreteur.js';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
installerDom();
let ctx;
beforeEach(async () => {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  ctx = contexteDe(depot('utilisateur').brutParId('u-aff-1'));
});

describe('Tableau de bord affréteur — graphiques et filtres', () => {
  it('les filtres passent de la liste à un état vide puis restaurent la liste', () => {
    const vue = dashboard(ctx);
    const liste = vue.querySelector('.dash-demand-list');
    const boutons = vue.querySelector('.dash-filters').querySelectorAll('button');
    assert.ok(liste.querySelector('table'));
    boutons.find(b => b.dataset.etat === 'reservee').declencher('click');
    assert.equal(liste.querySelector('table'), null);
    assert.match(texteDe(liste), /Aucune demande/);
    boutons.find(b => b.dataset.etat === '').declencher('click');
    assert.ok(liste.querySelector('table'));
    assert.equal(boutons[0].getAttribute('aria-pressed'), 'true');
  });
  it('les nouvelles analyses excluent les demandes d’un autre groupement', () => {
    const avant = dashboard(ctx);
    const source = depot('demande').brutParId('dem-3');
    depot('demande').modifier(source.id, { reference: 'CONCURRENT-SECRET', creeeLe: new Date().toISOString() });
    const apres = dashboard(ctx);
    assert.equal(texteDe(apres.querySelector('.dash-analytics')), texteDe(avant.querySelector('.dash-analytics')));
    assert.ok(!texteDe(apres).includes('CONCURRENT-SECRET'));
  });
  it('une activité vide conserve une répartition valide et des compteurs nuls', () => {
    for (const demande of depot('demande').brutTous()) {
      if (demande.groupementId === ctx.groupementId) depot('demande').modifier(demande.id, { groupementId: 'grp-aff-2' });
    }
    const vue = dashboard(ctx);
    assert.match(texteDe(vue), /Préparez votre premier fret/);
    assert.ok(!vue.querySelector('.dash-donut').getAttribute('style').includes('NaN'));
    assert.match(vue.querySelector('.dash-donut').getAttribute('aria-label'), /^0 demande/);
  });
});

const { calculerTendance } = await import('../js/views/tendances-dashboard.js');
describe('Variations des indicateurs — périodes comparables', () => {
  const maintenant = Date.parse('2026-10-01T12:00:00Z');
  const ilYa = jours => new Date(maintenant - jours * 86400000).toISOString();
  it('calcule une hausse et une baisse sans inventer de valeurs', () => {
    const hausse = calculerTendance([ilYa(2), ilYa(6), ilYa(40)], maintenant);
    assert.equal(hausse.variation, 100);
    assert.equal(hausse.ton, 'up');
    const baisse = calculerTendance([ilYa(3), ilYa(32), ilYa(40)], maintenant);
    assert.equal(baisse.variation, -50);
    assert.equal(baisse.ton, 'down');
  });
  it('ne calcule pas de pourcentage sur une base nulle', () => {
    assert.equal(calculerTendance([ilYa(3)], maintenant).libelle, 'Nouveau');
    assert.equal(calculerTendance([], maintenant).variation, null);
    assert.equal(calculerTendance([], maintenant).ton, 'flat');
  });
  it('chaque événement récent entre dans une seule tranche de la courbe', () => {
    const t = calculerTendance([ilYa(30), ilYa(25), ilYa(5), ilYa(0), ilYa(31), ilYa(60), ilYa(61), ilYa(-1), 'invalide', null], maintenant);
    assert.equal(t.actuel, 4);
    assert.equal(t.precedent, 2);
    assert.equal(t.serie.reduce((a, b) => a+b, 0), 4);
  });
  it('une activité inchangée produit 0 % en ton neutre', () => {
    const t = calculerTendance([ilYa(2), ilYa(40)], maintenant);
    assert.equal(t.variation, 0);
    assert.equal(t.ton, 'flat');
  });
});

const { corridorsDe } = await import('../js/core/carte-corridors.js');
describe('Corridors géographiques', () => {
  it('regroupe les déclarations et écarte les lieux inconnus ou identiques', () => {
    const result = corridorsDe([
      { provenanceId: 'loc-abidjan', destinationId: 'loc-bouake' },
      { provenanceId: 'loc-abidjan', destinationId: 'loc-bouake' },
      { provenanceId: 'inconnu', destinationId: 'loc-bouake' },
      { provenanceId: 'loc-abidjan', destinationId: 'loc-abidjan' },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].nombre, 2);
    assert.equal(result[0].a.nom, 'Abidjan');
    assert.equal(result[0].b.nom, 'Bouaké');
    assert.deepEqual(corridorsDe([]), []);
  });
});

describe('Délégation — message de validation', () => {
  it('adresse la validation au responsable et non à son auxiliaire', async () => {
    const matching = await import('../js/services/matching.service.js');
    const tra = contexteDe(depot('utilisateur').brutParId('u-tra-1'));
    const aux = contexteDe(depot('utilisateur').brutParId('u-aux-1'));
    const ap = matching.engager(ctx, {offreId:'off-1',demandeId:'dem-1'});
    matching.repondre(tra,ap.id,{accepte:true});
    const texte = texteDe(dashboard(aux));
    assert.match(texte,/En attente de validation par votre responsable/);
    assert.ok(!texte.includes('Votre validation déclenche'));
    assert.match(texteDe(dashboard(ctx)),/Votre validation déclenche/);
  });
});
