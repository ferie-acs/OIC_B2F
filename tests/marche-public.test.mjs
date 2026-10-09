import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { backendMemoire } from '../js/core/storage.js';
import { initialiserPersistance, depot, stockageInterne } from '../js/repositories/index.js';
import { amorcer } from '../js/seed.js';
import { contexteDe } from '../js/services/auth.service.js';
import { cataloguePublic, filtrerCatalogue, retourPublic, routeActionPublique, routePublication } from '../js/services/marche-public.service.js';
import { preparerRetour, publierOffre } from '../js/services/flotte.service.js';
import { avancer } from '../js/services/transport.service.js';

const contexte = id => contexteDe(depot('utilisateur').brutParId(id));
const alterer = (collection, id, changes) => stockageInterne().transaction(tx => {
  tx.ecrire(collection, tx.lire(collection).map(o => o.id === id ? {...o,...changes} : o));
});
beforeEach(async () => { initialiserPersistance({backend:backendMemoire()}); await amorcer(); });

describe('Marché anonyme — publication minimale et disponibilité', () => {
  it('ne révèle ni identité, ni contact, ni montant financier, ni texte libre', () => {
    alterer('declarations','dec-1',{libelle:'SECRET CONTACT +225 01',observation:'SECRET ADRESSE'});
    alterer('demandes','dem-1',{contraintes:'SECRET TÉLÉPHONE'});
    const annonces=cataloguePublic();
    assert.ok(annonces.some(o=>o.type==='frets'));
    assert.ok(annonces.some(o=>o.type==='camions'));
    const autorises=['type','id','departId','arriveeId','depart','arrivee','du','au','publieeLe','carrosserieId','carrosserie','tonnes','disponibilite','titre'];
    for (const o of annonces) assert.deepEqual(Object.keys(o).sort(),autorises.toSorted());
    const texte=JSON.stringify(annonces);
    for(const terme of ['SECRET','@','grp-','DEMO-CG','immatriculation','contactTelephone','solde','motDePasse']) {
      assert.ok(!texte.includes(terme),`Fuite : ${terme}`);
    }
  });
  it('écarte les offres échues, retirées, réservées et engagées', () => {
    for(const etat of ['retiree','reservee','engagee']) {
      alterer('offres','off-1',{etat});
      assert.ok(!cataloguePublic().some(o=>o.id==='off-1'));
    }
    alterer('offres','off-1',{etat:'disponible',disponibleAu:'2020-01-01T00:00:00Z'});
    assert.ok(!cataloguePublic().some(o=>o.id==='off-1'));
  });
  it('écarte le fret passé ou annulé', () => {
    alterer('demandes','dem-1',{departPrevu:'2020-01-01T00:00:00Z'});
    assert.ok(!cataloguePublic().some(o=>o.id==='dem-1'));
    alterer('demandes','dem-2',{etat:'annulee'});
    assert.ok(!cataloguePublic().some(o=>o.type==='frets'));
  });
  it('n’affiche pas un véhicule hors service ou dont la pièce a expiré', () => {
    alterer('vehicules','veh-1',{etat:'hors_service'});
    alterer('vehicules','veh-2',{carteTransportEcheance:'2020-01-01'});
    assert.ok(!cataloguePublic().some(o=>['off-1','off-2'].includes(o.id)));
  });
  it('combine trajet, carrosserie, capacité et date dans les filtres', () => {
    const catalogue=cataloguePublic(); const o=catalogue.find(o=>o.id==='off-2');
    const f={type:'camions',depart:o.departId,arrivee:o.arriveeId,carrosserie:o.carrosserieId,tonnes:40,date:o.du.slice(0,10)};
    assert.deepEqual(filtrerCatalogue(catalogue,f).map(o=>o.id),['off-2']);
    assert.equal(filtrerCatalogue(catalogue,{...f,tonnes:41}).length,0);
    assert.equal(filtrerCatalogue(catalogue,{...f,date:'2035-01-01'}).length,0);
  });
  it('distingue une fenêtre future d’une disponibilité déjà commencée', () => {
    const futur=cataloguePublic().find(o=>o.id==='off-1');
    assert.equal(futur.disponibilite,'prochainement');
    alterer('offres','off-1',{disponibleDu:new Date(Date.now()-3600000).toISOString()});
    assert.equal(cataloguePublic().find(o=>o.id==='off-1').disponibilite,'maintenant');
  });
});

describe('Connexion à l’action — reprise bornée aux droits', () => {
  it('oriente la publication selon les droits du compte, sans ouvrir de droit institutionnel', () => {
    assert.equal(routePublication(contexte('u-aff-1')),'#/affreteur/declarations/nouvelle');
    assert.equal(routePublication(contexte('u-tra-1')),'#/transporteur/offres/nouvelle');
    assert.throws(()=>routePublication(contexte('u-conc')));
    assert.throws(()=>routePublication(contexte('u-aff-2')));
  });
  it('retrouve exactement le camion ou le fret sélectionné', () => {
    assert.equal(routeActionPublique(contexte('u-aff-1'),'camions','off-2'),'#/affreteur/marche?selection=off-2');
    assert.equal(routeActionPublique(contexte('u-tra-1'),'frets','dem-2'),'#/transporteur/marche?selection=dem-2');
  });
  it('refuse au contrôleur et à l’exploitant d’utiliser le marché transactionnel', () => {
    for(const id of ['u-dgttc','u-conc']) for(const type of ['camions','frets']) {
      assert.throws(()=>routeActionPublique(contexte(id),type,type==='camions'?'off-1':'dem-1'));
    }
  });
  it('refuse un abonnement expiré, même après découverte publique', () => {
    assert.throws(()=>routeActionPublique(contexte('u-aff-2'),'camions','off-1'),/abonnement/i);
  });
  it('refuse une annonce retirée entre sa consultation et la connexion', () => {
    alterer('offres','off-1',{etat:'retiree'});
    assert.throws(()=>routeActionPublique(contexte('u-aff-1'),'camions','off-1'),/plus disponible/);
  });
  it('refuse les types arbitraires et les retours externes', () => {
    assert.throws(()=>routeActionPublique(contexte('u-aff-1'),'comptes','off-1'));
    for(const route of ['https://example.invalid','#/concessionnaire/comptes','#/explorer-malicious',undefined]) {
      assert.equal(retourPublic(route),'#/explorer');
    }
    assert.equal(retourPublic('#/explorer?type=frets&depart=loc-daloa'),'#/explorer?type=frets&depart=loc-daloa');
  });
});

describe('Retour après livraison — confirmation explicite', () => {
  it('interdit la préparation avant livraison et par un tiers', () => {
    const t=depot('transport').brutTous()[0];
    assert.throws(()=>preparerRetour(contexte('u-tra-1'),t.id));
    assert.throws(()=>preparerRetour(contexte('u-tra-2'),t.id),/livraison/);
  });
  it('ne republie rien automatiquement, puis publie une nouvelle annonce au départ de la livraison', () => {
    const t=depot('transport').brutTous()[0]; const ctx=contexte('u-tra-2');
    while(!['livre','cloture'].includes(depot('transport').brutParId(t.id).etape)) avancer(ctx,t.id);
    const avant=cataloguePublic().filter(o=>o.type==='camions').length;
    const retour=preparerRetour(ctx,t.id);
    assert.equal(retour.localiteDepartId,'loc-bouake');
    assert.equal(retour.vehiculeId,'veh-5');
    assert.equal(cataloguePublic().filter(o=>o.type==='camions').length,avant);
    const nouvelle=publierOffre(ctx,{...retour,localiteArriveeId:'loc-abidjan',
      disponibleDu:new Date().toISOString(),disponibleAu:new Date(Date.now()+3*86400000).toISOString()});
    const annonce=cataloguePublic().find(o=>o.id===nouvelle.id);
    assert.equal(annonce.depart,'Bouaké'); assert.equal(annonce.disponibilite,'maintenant');
    assert.equal(depot('offre').brutParId('off-4').etat,'engagee');
  });
});
