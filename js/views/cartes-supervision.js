import { el, icone } from '../core/dom.js';
import { badge } from '../core/ui.js';
import { carteOffres } from '../core/carte-offres.js?v=20261009-carte-2';
import { carteFlotte } from '../core/carte-flotte.js';
import { refDe } from './_donnees.js';

/** Données déjà projetées : aucune action commerciale ni lien vers un autre espace. */
export function carteSupervision(elements, { parc = false } = {}) {
  let selection = elements[0];
  const liste = el('div.dashboard-freight-list', {'aria-label':parc?'Véhicules à localiser':'Trajets à consulter'});
  const choisir = id => { selection = elements.find(e=>e.id===id); rendre(); };
  const carte = parc ? carteFlotte() : carteOffres(null,{onSelection:choisir});
  const recherche = el('input', {type:'search','aria-label':'Rechercher dans la carte',placeholder:'Référence, ville, véhicule…',on:{input:()=>rendre()}});
  const compte = el('p.supervision-map-count',{'aria-live':'polite'});
  function rendre() {
    const query=(recherche.value||'').trim().toLocaleLowerCase('fr');
    const visibles=elements.filter(e=>`${e.reference} ${e.titre} ${refDe(e.localiteDepartId)} ${refDe(e.localiteArriveeId)} ${refDe(e.stationnementId)}`.toLocaleLowerCase('fr').includes(query));
    if(!visibles.includes(selection)) selection=visibles[0];
    compte.textContent=`${visibles.length} ${parc?'véhicule(s)':'trajet(s)'} · consultation seule`;
    liste.replaceChildren(...visibles.map(e=>el('article.dashboard-freight-item',{class:e===selection?'selected':''},[
      el('button.dashboard-freight-select',{type:'button','aria-pressed':String(e===selection),on:{click:()=>choisir(e.id)}},[
        el('span.dashboard-freight-ref',{},[icone(e.type==='frets'?'package':'truck',28),e.reference]),
        el('strong',{text:e.titre}),
        el('span',{text:parc?(e.stationnementId?`Stationnement déclaré · ${refDe(e.stationnementId)}`:'Stationnement non renseigné'):`${refDe(e.localiteDepartId)} → ${refDe(e.localiteArriveeId)}`}),
        e.etat?badge(e.etat):null,
        e.detail?el('small',{text:e.detail}):null,
      ]),
    ])));
    if(!visibles.length) liste.append(el('p.empty-state',{text:'Aucun résultat pour cette recherche.'}));
    if(parc) carte.update(selection?{stationnementId:selection.stationnementId,immatriculation:selection.reference,enRoute:false}:{});
    else carte.update(visibles,selection);
  }
  rendre();
  return el('section.supervision-map',{},[
    el('div.supervision-map-toolbar',{},[recherche,compte]),
    el('div.dashboard-freight-workspace',{},[liste,carte.element]),
    el('p.dash-map-note',{text:parc?'Stationnements déclarés par les transporteurs, sans localisation GPS.':'Départs et itinéraires déclarés · sans suivi GPS · hors contraintes poids lourds.'}),
  ]);
}

export function trajetsSupervision(declarations, offres) {
  return [
    ...declarations.map(d=>({id:`fret-${d.id}`,type:'frets',reference:d.reference,titre:'Déclaration de fret',etat:d.etat,localiteDepartId:d.provenanceId,localiteArriveeId:d.destinationId})),
    ...offres.map(o=>({id:`offre-${o.id}`,type:'camions',reference:o.reference,titre:'Disponibilité de véhicule',etat:o.etat,localiteDepartId:o.localiteDepartId,localiteArriveeId:o.localiteArriveeId})),
  ];
}
