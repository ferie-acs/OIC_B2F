import {el,icone,date,montant} from '../core/dom.js';
import {carte,kpi,badge} from '../core/ui.js';
import {depot} from '../repositories/index.js';
import {abonnementDe} from '../services/auth.service.js';
import {soldeDe} from '../services/compte.service.js';
import {decider} from '../domain/access.js';
import {refDe} from './_donnees.js';

export function annuaireSupervision(ctx,{abonnements=false}={}) {
  const liste=depot('groupement').lisiblesPar(ctx,'groupement.lire').filter(g=>!abonnements||g.type!=='institution');
  const maintenant=new Date();maintenant.setHours(0,0,0,0);
  const infos=new Map(liste.map(g=>{
    const abo=abonnementDe(g.id);
    const jours=abo.finitLe?Math.round((new Date(abo.finitLe)-maintenant)/86400000):null;
    const etat=!abo.finitLe?'absent':!abo.actif?'expire':jours<=30?'proche':'actif';
    return [g.id,{...abo,jours,etat}];
  }));
  const grille=el('div.supervision-directory-grid');
  const compteur=el('p.declarations-count',{'aria-live':'polite'});
  const recherche=el('input',{type:'search',placeholder:'Rechercher un groupement, une ville…','aria-label':'Rechercher un groupement',on:{input:rendre}});
  const filtre=el('select',{'aria-label':abonnements?'Filtrer les abonnements':'Filtrer les groupements',on:{change:rendre}},
    (abonnements?[['','Tous les abonnements'],['actif','Actifs'],['proche','Échéance sous 30 jours'],['expire','Expirés'],['absent','Sans abonnement']]:[['','Tous les groupements'],['affreteur','Affréteurs'],['transporteur','Transporteurs'],['institution','Institutions']]).map(([value,text])=>el('option',{value,text})));
  function rendre(){
    const q=(recherche.value||'').trim().toLocaleLowerCase('fr');
    const visibles=liste.filter(g=>`${g.raisonSociale} ${g.rccm||''} ${refDe(g.localiteId)}`.toLocaleLowerCase('fr').includes(q)&&(!filtre.value||(abonnements?(filtre.value==='actif'?infos.get(g.id).actif:infos.get(g.id).etat===filtre.value):g.type===filtre.value)));
    compteur.textContent=`${visibles.length} groupement(s)`;
    grille.replaceChildren(...visibles.map(g=>{
      const abo=infos.get(g.id), institution=g.type==='institution';
      const statut=abo.etat==='proche'?'Échéance proche':abo.etat==='absent'?'Sans abonnement':abo.actif?'Abonnement actif':'Abonnement expiré';
      return el('article.supervision-directory-card',{},[
        el('div.supervision-directory-head',{},[el('span.supervision-directory-symbol',{},[icone(abonnements?'calendar':g.type==='transporteur'?'truck':g.type==='affreteur'?'package':'building',42)]),el('div',{},[el('small',{text:{affreteur:'AFFRÉTEUR',transporteur:'TRANSPORTEUR',institution:'INSTITUTION'}[g.type]||g.type}),el('h3',{text:g.raisonSociale})])]),
        el('p.supervision-locality',{},[icone('map-pin',17),refDe(g.localiteId)]),
        abonnements?el('div.supervision-subscription', {dataset:{etat:abo.etat}},[
          el('span',{text:statut}),el('strong',{text:abo.finitLe?date(abo.finitLe):'À souscrire'}),
          el('small',{text:abo.jours===null?'Aucune période enregistrée':abo.jours<0?`Échu depuis ${Math.abs(abo.jours)} jour(s)`:abo.jours===0?'Échéance aujourd’hui':`${abo.jours} jour(s) restants`}),
        ]):el('dl.supervision-directory-info',{},[
          el('div',{},[el('dt',{text:'RCCM'}),el('dd',{text:g.rccm||'Non renseigné'})]),
          el('div',{},[el('dt',{text:'État du groupement'}),el('dd',{},[el('span',{class:`badge ${g.etat==='actif'?'badge-success':'badge-warning'}`,text:g.etat==='actif'?'Actif':g.etat==='suspendu'?'Suspendu':g.etat})])]),
          !institution&&decider(ctx,'compte.lire',{groupementId:g.id}).autorise?el('div',{},[el('dt',{text:'Solde du compte'}),el('dd',{text:montant(soldeDe(g.id))})]):null,
        ]),
        !abonnements?el('div.supervision-directory-foot',{},[icone('calendar',18),el('span',{text:institution?'Abonnement non requis':`${statut}${abo.finitLe?' · '+date(abo.finitLe):''}`})]):null,
      ]);
    }));
    if(!visibles.length)grille.append(el('div.empty-state',{},[icone('search',30),el('h3',{text:'Aucun groupement trouvé'}),el('p',{text:'Essayez un autre nom ou un autre filtre.'})]));
  }
  rendre();
  const valeurs=[...infos.values()];
  return el('div.page.supervision-page',{},[
    el('div.kpi-grid',{},abonnements?[
      kpi({libelle:'Abonnements actifs',valeur:valeurs.filter(a=>a.actif).length,icon:'check-circle'}),
      kpi({libelle:'Échéances sous 30 jours',valeur:valeurs.filter(a=>a.etat==='proche').length,icon:'calendar'}),
      kpi({libelle:'Expirés ou absents',valeur:valeurs.filter(a=>!a.actif).length,icon:'alert'}),
    ]:[kpi({libelle:'Groupements inscrits',valeur:liste.length,icon:'building'}),kpi({libelle:'Affréteurs',valeur:liste.filter(g=>g.type==='affreteur').length,icon:'package'}),kpi({libelle:'Transporteurs',valeur:liste.filter(g=>g.type==='transporteur').length,icon:'truck'})]),
    carte({titre:abonnements?'Suivi des abonnements':'Annuaire des groupements',sousTitre:abonnements?'Identifiez les échéances à venir et les accès à régulariser.':'Retrouvez les acteurs inscrits et les informations de leur groupement.',corps:[el('div.declarations-toolbar',{},[recherche,filtre]),compteur,grille]}),
  ]);
}
