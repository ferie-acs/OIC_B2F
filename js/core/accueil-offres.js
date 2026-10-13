import { carteRelief } from './carte-relief.js';
import { VILLES } from './carte-geographie.js';
import { el, icone } from './dom.js';
import { routeActionPublique, cataloguePublic } from '../services/marche-public.service.js';
import { toast } from './ui.js';

function choisir(o,ctx){
  const retour=`#/explorer?${new URLSearchParams({type:o.type,selection:o.id})}`;
  if(!cataloguePublic().some(x=>x.type===o.type&&x.id===o.id)){toast('Cette annonce n’est plus disponible. Consultez le marché actualisé.','err');return;}
  if(ctx){try{location.hash=routeActionPublique(ctx,o.type,o.id,retour);}catch(e){toast(e.message,'err');}return;}
  const connexion=`#/connexion?${new URLSearchParams({type:o.type,selection:o.id,retour})}`;
  const dialog=el('dialog.th-signup',{'aria-labelledby':'offer-signup-title'});
  const close=()=>dialog.close();
  // Lot b1 : l'inscription simulée dans ce navigateur cède la place à l'inscription
  // réelle du POC, le type d'entreprise présélectionné selon l'annonce choisie.
  const profil=o.type==='camions'?'affreteur':'transporteur';
  const form=el('div.th-signup-form',{},[
    el('p',{text:'Créez le compte de votre entreprise : l’OIC l’active après contrôle des pièces de votre dossier.'}),
    el('a.th-button',{href:`#/inscription?type=${profil}`,text:'Inscrire mon entreprise',on:{click:close}}),
  ]);
  dialog.append(el('button.th-signup-close',{type:'button','aria-label':'Fermer',text:'×',on:{click:close}}),el('span.th-label',{text:'VOTRE CHOIX EST CONSERVÉ'}),el('h2',{id:'offer-signup-title',text:'Inscrivez-vous pour continuer'}),el('p',{text:`${o.depart} → ${o.arrivee} · ${o.titre} · ${o.tonnes} t`}),el('p',{text:o.type==='camions'?'Vous recherchez un camion : poursuivez en tant qu’affréteur.':'Vous recherchez du fret : poursuivez en tant que transporteur.'}),form,el('a.th-signin',{href:connexion,text:'Déjà inscrit ? Se connecter →',on:{click:close}}));
  const trigger=document.activeElement;
  const cleanup=()=>{dialog.remove();window.removeEventListener('hashchange',close);trigger?.focus();};
  dialog.addEventListener('close',cleanup,{once:true});
  window.addEventListener('hashchange',close,{once:true});
  document.body.append(dialog);dialog.showModal();
}

export function offresAccueil(catalogue,ctx){
  const section=el('section.th-section.th-offers.th-map-offers',{id:'th-offers'});
  let type='',depart='',selected='';
  const mapHost=el('div.th-offer-map.th-offer-map-3d');
  const relief=carteRelief(id=>{depart=id;selected='';render();});
  mapHost.append(relief.element);
  const list=el('div.th-map-list');
  /** Nombre d'annonces montrées dans le panneau ; le reste est dans le marché. */
  const VISIBLES=6;
  const all=el('a.th-map-all',{href:'#/explorer',text:'Ouvrir le marché complet ↗'});
  const count=el('p.th-map-count',{'aria-live':'polite'});
  const routeNote=el('div.th-route-note',{'aria-live':'polite'});
  const tabs=el('div.th-offer-tabs',{'aria-label':'Catégories d’annonces'});
  const date=value=>new Intl.DateTimeFormat('fr-CI',{day:'numeric',month:'short'}).format(new Date(value));
  const dateLongue=value=>new Intl.DateTimeFormat('fr-CI',{weekday:'short',day:'numeric',month:'short'}).format(new Date(value));
  const options=[['','Tout'],['camions','Camions & trajets'],['frets','Fret']];
  const city=el('select',{'aria-label':'Ville de départ',on:{change:e=>{depart=e.target.value;selected='';render();}}},[
    el('option',{value:'',text:'Toutes les villes de départ'}),...Object.entries(VILLES).map(([id,v])=>el('option',{value:id,text:v.nom}))
  ]);
  function render(focus){
    const listScroll = list.scrollTop;
    [...tabs.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(options[i][0]===type)));
    city.value=depart;
    const category=catalogue.filter(o=>!type||o.type===type);
    const offers=category.filter(o=>!depart||o.departId===depart);
    if(!offers.some(o=>o.id===selected))selected=offers[0]?.id||'';
    const current=offers.find(o=>o.id===selected);
    count.textContent=`${offers.length} offre${offers.length>1?'s':''}${depart?' au départ de '+VILLES[depart].nom:' à découvrir'}`;
    all.textContent=offers.length>VISIBLES
      ? `Ouvrir le marché complet — ${offers.length} annonces ↗`
      : 'Ouvrir le marché complet ↗';
    relief.update({offres:category,selection:current,depart});
    routeNote.replaceChildren(...(current?[el('span',{text:current.type==='camions'?'CAMION DISPONIBLE':'FRET À TRANSPORTER'}),el('strong',{text:`${current.depart} → ${current.arrivee}`}),el('small',{text:`${current.tonnes} t · ${date(current.du)} · liaison indicative`})]:[el('strong',{text:'Explorez les départs'}),el('small',{text:'Cliquez sur une ville ou changez les filtres.'})]));
    // Le panneau ne fait que donner envie d'ouvrir le marché. Au-delà d'une
    // poignée d'annonces, la liste devient un défilement dans un défilement —
    // injouable au doigt. L'offre sélectionnée reste toujours affichée, même si
    // elle a été choisie sur la carte au-delà de la tranche visible.
    const tranche=offers.slice(0,VISIBLES);
    if(current&&!tranche.includes(current))tranche.unshift(current);
    list.replaceChildren(...tranche.map(o=>el('article',{class:`th-map-offer${o.id===selected?' is-selected':''}`,dataset:{offerType:o.type}},[
      el('button.th-map-offer-select',{type:'button','aria-label':`Afficher sur la carte : ${o.type==='camions'?'camion':'fret'} de ${o.depart} à ${o.arrivee}, ${o.tonnes} tonnes, ${dateLongue(o.du)}`,'aria-pressed':String(o.id===selected),dataset:{offerFocus:o.id},on:{click:()=>{selected=o.id;render(o.id);}}},[
        el('span.th-journey-date',{},[
          el('small',{text:o.type==='camions'?'Disponible dès le':'Départ prévu le'}),
          el('time',{datetime:o.du,text:dateLongue(o.du)})
        ]),
        el('span.th-journey-pills',{},[
          el('span.th-journey-kind',{},[icone(o.type==='camions'?'truck':'package',14),o.type==='camions'?'Camion':'Fret']),
          el('span.th-journey-capacity',{text:`${o.tonnes} t${o.type==='camions'?' disponibles':''}`})
        ]),
        el('span.th-journey-route',{},[
          el('span.th-journey-stop.th-journey-origin',{},[
            el('span.th-journey-dot',{'aria-hidden':'true'}),
            el('span.th-journey-place',{},[el('strong',{text:o.depart}),el('small',{text:o.type==='camions'?'Point de départ':'Marchandise à charger'})])
          ]),
          el('span.th-journey-stop.th-journey-destination',{},[
            el('span.th-journey-dot',{'aria-hidden':'true'},[icone('arrow-right',11)]),
            el('span.th-journey-place',{},[el('strong',{text:o.arrivee}),el('small',{text:o.type==='camions'?'Destination du trajet':'Destination du fret'})])
          ])
        ]),
        el('span.th-journey-summary',{},[
          el('span',{text:o.carrosserie}),
          el('span.th-journey-map-state',{},[icone('map-pin',12),o.id===selected?'Sur la carte':'Voir le trajet'])
        ])
      ]),
      ...(o.id===selected?[el('div.th-map-offer-detail',{},[
        el('p',{text:o.type==='camions'?`Disponible jusqu’au ${date(o.au)}`:o.titre}),el('small',{text:(o.type==='camions'?'Transporteur inscrit':'Affréteur inscrit')+' · démonstration'}),
        el('div.th-offer-actions',{},[el('a',{href:`#/explorer?${new URLSearchParams({type:o.type,selection:o.id})}`,text:'Détails'}),el('button.th-button',{type:'button',text:'Choisir cette offre',on:{click:()=>choisir(o,ctx)}})])
      ])]:[])
    ])));
    if(!offers.length)list.append(el('div.th-map-empty',{},[icone('search',28),el('strong',{text:'Aucune offre pour ce départ'}),el('p',{text:'Essayez une autre ville ou consultez toutes les annonces.'}),el('button',{type:'button',text:'Effacer les filtres',on:{click:()=>{type='';depart='';render();city.focus();}}})]));
    if(focus){list.scrollTop=listScroll;const target=[...section.querySelectorAll('[data-offer-focus],[data-focus]')].find(n=>n.dataset.offerFocus===focus||n.dataset.focus===focus);target?.focus({preventScroll:true});}
  }
  options.forEach(([value,text])=>tabs.append(el('button',{type:'button',text,'aria-pressed':'false',on:{click:()=>{type=value;selected='';render();}}})));
  section.append(el('div.th-heading',{},[el('span.th-label',{text:'LES OPPORTUNITÉS SUR LA CARTE'}),el('h2',{text:'Le bon trajet commence par une rencontre.'}),el('p',{text:'Explorez la Côte d’Ivoire, repérez un départ et sélectionnez une annonce pour voir sa liaison. L’inscription intervient seulement lorsque vous choisissez une offre.'})]),
    el('div.th-map-workspace',{},[mapHost,
      el('aside.th-map-floating',{'aria-label':'Offres sur la carte'},[el('div.th-map-panel-head',{},[el('h3',{text:'Trouvez votre prochain trajet'}),count]),tabs,el('label.th-city-filter',{},[icone('map-pin',18),city]),list,all]),
      el('div.th-map-badge',{},[icone('map-pin',17),'CÔTE D’IVOIRE']),routeNote
    ]),el('p.th-map-footnote',{text:'POC · annonces fictives des comptes de démonstration. Localisation à la ville, sans position de véhicule en temps réel.'}));
  render();return section;
}
