import { el, icone } from './dom.js';

/** Les acteurs de la bourse, réunis progressivement par le défilement. */
export function ecosystemeAccueil() {
  const section=el('section.lp-assembly',{id:'lp-actors','aria-labelledby':'lp-actors-title'});
  const links=document.createElementNS('http://www.w3.org/2000/svg','svg');
  links.setAttribute('viewBox','0 0 1000 500');links.setAttribute('preserveAspectRatio','none');
  links.setAttribute('class','lp-assembly-lines');links.setAttribute('aria-hidden','true');
  ['M220 100 C310 100 275 210 340 210','M220 250 H340','M220 400 C310 400 275 290 340 290',
   'M780 100 C690 100 725 210 660 210','M780 250 H660','M780 400 C690 400 725 290 660 290'].forEach((d,i)=>{
    const path=document.createElementNS(links.namespaceURI,'path');path.setAttribute('d',d);path.setAttribute('pathLength','1');path.setAttribute('class',`assembly-link link-${i}`);links.append(path);
  });
  const actors=[
    ['Affréteurs','Des marchandises à expédier','package','#/explorer?type=camions'],
    ['Transporteurs','Des camions à proposer','truck','#/explorer?type=frets'],
    ['Auxiliaires','Préparer et accompagner','users','comprendre.html#acteurs'],
    ['Gestion OIC','Organiser le service','building','#/connexion'],
    ['DGTTC','Consulter et contrôler','shield','#/connexion'],
    ['Suivi partagé','Du départ à la livraison','handshake','comprendre.html#parcours']
  ];
  section.append(el('div.lp-assembly-sticky',{},[
    el('div.lp-assembly-heading',{},[el('span.lp-kicker',{text:'TOUT UN ÉCOSYSTÈME, UNE MÊME DYNAMIQUE'}),el('p',{text:'Faites défiler. Les connexions prennent forme.'})]),
    el('div.lp-assembly-stage',{},[
      links,
      ...actors.map(([title,desc,icon,href],i)=>el('a',{class:`lp-actor-tile tile-${i}`,href},[
        el('span.lp-actor-symbol',{},[icone(icon,32)]),el('strong',{text:title}),el('small',{text:desc})])),
      el('div.lp-assembly-hub',{},[
        el('img.oic-logo',{src:'assets/oic.jpeg',alt:'Office Ivoirien des Chargeurs'}),
        el('span.lp-kicker',{text:'BOURSE DE FRET'}),
        el('h2',{id:'lp-actors-title',text:'Chacun son rôle. Ensemble, on avance.'}),
        el('p',{text:'Les besoins, les disponibilités et les acteurs réunis au même endroit.'}),
        el('a.btn.lp-orange',{href:'#/explorer',text:'Explorer le marché ↗'})
      ])
    ]),
    el('div.lp-assembly-caption',{},[
      el('span', {text:'Des acteurs complémentaires'}),el('div.lp-assembly-meter',{'aria-hidden':'true'},[el('i')]),el('span',{text:'Une plateforme qui les relie'})
    ])
  ]));
  return section;
}
