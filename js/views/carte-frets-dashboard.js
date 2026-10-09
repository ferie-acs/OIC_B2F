import { el, icone, date } from '../core/dom.js';
import { carteOffres } from '../core/carte-offres.js?v=20261009-carte-2';
import { refDe } from './_donnees.js';

/** Reçoit uniquement les demandes projetées par le service métier. */
export function carteFretsDashboard(demandes, {action} = {}) {
  if (!demandes.length) return { destroy: () => {}, element: el('div.empty-state', {}, [icone('package',28),el('h3',{text:'Aucune demande publiée'}),el('p',{text:'Les demandes des affréteurs apparaîtront ici dès qu’elles seront publiées.'})]) };
  const offres = demandes.map(d => ({id:d.id,type:'frets',localiteDepartId:d.provenanceId,localiteArriveeId:d.destinationId,titre:d.libelleFret,reference:d.reference}));
  let selection = offres[0];
  const liste = el('div.dashboard-freight-list', {'aria-label':'Frets disponibles'});
  const choisir = id => { selection = offres.find(o=>o.id===id) ?? selection; rendre(); };
  const map = carteOffres(null, {onSelection:choisir});
  function rendre() {
    liste.replaceChildren(...demandes.map(d=>el('article.dashboard-freight-item',{class:d.id===selection.id?'selected':''},[
      el('button.dashboard-freight-select',{type:'button','aria-pressed':String(d.id===selection.id),on:{click:()=>choisir(d.id)}},[
        el('span.dashboard-freight-ref',{},[icone('package',24),d.reference]),
        el('strong',{text:`${refDe(d.provenanceId)} → ${refDe(d.destinationId)}`}),
        el('span',{text:d.libelleFret}),el('small',{text:`Départ · ${date(d.departPrevu)}`}),
      ]),
      action ? action(d) : el('a',{href:`#/transporteur/marche?selection=${encodeURIComponent(d.id)}`,text:'Voir ce fret →'}),
    ])));
    map.update(offres,selection);
  }
  rendre();
  return { element: el('div.dashboard-freight-workspace',{},[liste,map.element]), destroy: map.destroy };
}
