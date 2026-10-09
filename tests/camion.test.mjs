import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { installerDom } from './helpers/mini-dom.mjs';
import { camion, libelleTrajet } from '../js/core/camion.js';
installerDom();
test('Le sens et la silhouette sont indépendants du statut',()=>{
  for(const retour of [false,true]) for(const vide of [false,true]) {
    const offre={trajetRetour:retour,trajetVide:vide,etat:'disponible'};
    const icon=camion(offre);
    assert.equal(icon.getAttribute('src'),vide?'assets/tracteur-b2f.png':'assets/camion-b2f.png');
    assert.equal(icon.classList.contains('is-return'),retour);
    assert.equal(libelleTrajet(offre),`${retour?'Retour':'Départ'}${vide?' · À vide':''}`);
  }
  assert.equal(camion({etat:'disponible'}).getAttribute('src'),'assets/camion-b2f.png');
});
