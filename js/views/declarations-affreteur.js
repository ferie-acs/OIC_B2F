import { el, icone, date } from '../core/dom.js';
import { badge, bouton, carte, etatVide, kpi, modale } from '../core/ui.js';
import { carteOffres } from '../core/carte-offres.js?v=20261009-carte-2';
import { segmentEspace } from '../core/nav.js';
import { aller } from '../core/router.js';
import { decider } from '../domain/access.js';
import { mesDeclarations, mesDemandes } from '../services/fret.service.js';
import { refDe } from './_donnees.js';

export function declarationsVue(ctx) {
  const declarations=mesDeclarations(ctx), demandes=mesDemandes(ctx), espace=segmentEspace(ctx);
  const droit=decider(ctx,'declaration.creer',{groupementId:ctx.groupementId});
  let statut='', page=0;
  const taille=9;
  const grille=el('div.declarations-grid');
  const pagination=el('div.declarations-pagination');
  const compteur=el('p.declarations-count',{'aria-live':'polite'});
  const recherche=el('input',{type:'search',placeholder:'Référence, marchandise ou ville…','aria-label':'Rechercher une déclaration',on:{input:()=>{page=0;rendre();}}});
  const onglets=el('div.declarations-tabs',{'aria-label':'Filtrer les déclarations'});
  const nouvelle=()=>aller(`#/${espace}/declarations/nouvelle`);
  const choix=[['','Toutes'],['active','Actives'],['brouillon','Brouillons'],['cloturee','Clôturées']];
  for(const [valeur,libelle] of choix) onglets.append(el('button',{type:'button',text:libelle,dataset:{etat:valeur},'aria-pressed':String(statut===valeur),on:{click:()=>{statut=valeur;page=0;rendre();}}}));
  function ouvrir(d) {
    const map=carteOffres(null,{compact:true});
    const annonce={id:d.id,type:'frets',reference:d.reference,titre:d.libelle,localiteDepartId:d.provenanceId,localiteArriveeId:d.destinationId};
    map.update([annonce],annonce);
    const liees=demandes.filter(x=>x.declarationId===d.id);
    const fermer=modale({titre:d.reference,corps:[
      el('div.declaration-detail',{},[
        el('div.declaration-title',{},[icone('package',48),el('h3',{text:d.libelle})]),
        badge(d.etat),
        el('p',{text:`${refDe(d.provenanceId)} → ${refDe(d.destinationId)}`}),
        el('div.validation-map',{},[map.element]),
        el('p.subtitle',{text:'Itinéraire indicatif entre villes · sans suivi GPS · hors contraintes poids lourds.'}),
        el('h3',{text:`${liees.length} demande(s) de transport associée(s)`}),
        ...liees.map(x=>el('div.declaration-related',{},[el('div',{},[el('strong',{text:x.reference}),el('small',{text:`Départ · ${date(x.departPrevu)}`})]),badge(x.etat)])),
        !liees.length?el('p',{text:'Aucune demande associée à cette déclaration.'}):null,
      ]),
    ],surFermeture:()=>{map.destroy();window.removeEventListener('hashchange',fermer);}});
    window.addEventListener('hashchange',fermer,{once:true});
  }
  function rendre() {
    const q=(recherche.value||'').trim().toLocaleLowerCase('fr');
    const visibles=declarations.filter(d=>(!statut||d.etat===statut)&&`${d.reference} ${d.libelle} ${refDe(d.provenanceId)} ${refDe(d.destinationId)}`.toLocaleLowerCase('fr').includes(q));
    const pages=Math.max(1,Math.ceil(visibles.length/taille));page=Math.min(page,pages-1);
    for(const b of onglets.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.etat===statut));
    compteur.textContent=`${visibles.length} déclaration(s)`;
    grille.replaceChildren(...visibles.slice(page*taille,(page+1)*taille).map(d=>el('article.declaration-card',{},[
      el('div.declaration-card-top',{},[el('span',{},[icone('package',38),el('strong',{text:d.reference})]),badge(d.etat)]),
      el('h3',{text:d.libelle}),
      el('div.declaration-route',{},[
        el('div',{},[el('small',{text:'PROVENANCE'}),el('strong',{text:refDe(d.provenanceId)})]),
        icone('arrow-right',20),
        el('div',{},[el('small',{text:'DESTINATION'}),el('strong',{text:refDe(d.destinationId)})]),
      ]),
      el('div.declaration-meta',{},[el('span',{},[icone('calendar',17),date(d.creeeLe)]),el('span',{},[icone('published',22),`${d.nbDemandes} demande(s)`])]),
      bouton({libelle:'Voir le fret et le trajet',icone:'map-pin',variante:'secondary',onClick:()=>ouvrir(d)}),
    ])));
    if(!visibles.length) grille.append(etatVide({titre:declarations.length?'Aucune déclaration trouvée':'Votre premier fret commence ici',message:declarations.length?'Modifiez votre recherche ou le statut sélectionné.':'Déclarez les marchandises que vous souhaitez faire transporter.'}));
    pagination.replaceChildren();
    if(pages>1) pagination.append(
      bouton({libelle:'Précédent',motif:page===0?'Vous êtes sur la première page.':null,onClick:()=>{page--;rendre();}}),
      el('span',{text:`Page ${page+1} sur ${pages}`}),
      bouton({libelle:'Suivant',motif:page===pages-1?'Vous êtes sur la dernière page.':null,onClick:()=>{page++;rendre();}}),
    );
  }
  rendre();
  return el('div.page.declarations-page',{},[
    el('div.kpi-grid',{},[
      kpi({libelle:'Déclarations',valeur:declarations.length,icon:'package'}),
      kpi({libelle:'Déclarations actives',valeur:declarations.filter(d=>d.etat==='active').length,icon:'package'}),
      kpi({libelle:'Demandes associées',valeur:declarations.reduce((n,d)=>n+d.nbDemandes,0),icon:'published'}),
    ]),
    carte({titre:'Mes déclarations de fret',sousTitre:'Retrouvez vos marchandises et consultez leurs trajets.',actions:[bouton({libelle:'Nouvelle déclaration',icone:'plus',variante:'primary',motif:droit.autorise?null:droit.explication,onClick:nouvelle})],corps:[
      el('div.declarations-toolbar',{},[recherche,onglets]),compteur,grille,pagination,
    ]}),
  ]);
}
