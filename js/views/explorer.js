/** Découverte publique : ne reçoit que le catalogue explicitement anonymisé. */
import { el, icone, date } from '../core/dom.js';
import { carteOffres } from '../core/carte-offres.js?v=20261009-carte-2';
import { VILLES } from '../core/carte-geographie.js';
import { cataloguePublic, filtrerCatalogue, routeActionPublique, routePublication } from '../services/marche-public.service.js';
import { aller } from '../core/router.js';
import { routeAccueil } from '../core/nav.js';
import { toast } from '../core/ui.js';

export function explorer(ctx, params = {}) {
  const type = ['frets', 'camions'].includes(params.type) ? params.type : 'tous';
  const catalogue = cataloguePublic();
  const filtres = { ...params, type: type === 'tous' ? '' : type };
  const resultats = filtrerCatalogue(catalogue, filtres);
  const selection = resultats.find(o => o.id === params.selection);
  const route = changements => {
    const p = new URLSearchParams({ ...params, type, ...changements });
    // Les anciens liens « vue=liste » ouvrent désormais la carte et sa liste associée.
    for (const [k,v] of [...p]) if (!v || ['id','segment','vue'].includes(k)) p.delete(k);
    return `#/explorer?${p}`;
  };
  const changer = changements => aller(route(changements));
  const action = o => {
    if (!ctx) {
      aller(`#/connexion?${new URLSearchParams({type:o.type, selection:o.id, retour:route({selection:o.id})})}`);
      return;
    }
    try { aller(routeActionPublique(ctx, o.type, o.id, route({selection:o.id}))); }
    catch(e) { toast(e.message, 'err'); }
  };
  const lienConnexion = ctx ? routeAccueil(ctx) : '#/connexion';
  const publier = () => {
    if (!ctx) return aller(`#/connexion?${new URLSearchParams({action:'publier',retour:route({})})}`);
    try { aller(routePublication(ctx)); } catch(e) { toast(e.message,'err'); }
  };
  const nav = (label, icon, href, actif=false) => el('a', {
    href, class:`explore-nav-link${actif?' active':''}`, 'aria-current':actif?'page':null,
  }, [icone(icon,19), el('span',{text:label})]);
  const stat = (label, value, note, icon, ton) => el('div.explore-stat', {}, [
    el(`span.stat-icon.${ton}`, {}, [icone(icon,22)]),
    el('div', {}, [el('span',{text:label}), el('strong',{text:value}), el('small',{text:note})]),
    el('span.indicator-watermark',{'aria-hidden':'true'},[icone(icon,76)]),
  ]);
  const villesDesservies = new Set(catalogue.flatMap(o => [o.departId,o.arriveeId]));
  const villes = new Map([...Object.entries(VILLES).map(([id,v]) => [id,v.nom]),
    ...catalogue.flatMap(o => [[o.departId,o.depart],[o.arriveeId,o.arrivee]])]);
  const carrosseries = new Map(catalogue.map(o=>[o.carrosserieId,o.carrosserie]));
  const select = (cle, label, options, vide) => el('label.explore-field', {}, [
    el('span',{text:label}), el('select', {name:cle, id:`explore-${cle}`, 'aria-label':label}, [
      el('option',{value:'',text:vide}), ...[...options].map(([value,text])=>el('option',{
        value,text,selected:params[cle]===value,
      })),
    ]),
  ]);
  const champDate = el('label.explore-field',{},[el('span',{text:'Date de départ'}),
    el('input',{type:'date', name:'date', value:params.date ?? ''})]);
  const recherche = el('form.explore-filters', {on:{submit:e=>{
    e.preventDefault(); const values=Object.fromEntries(new FormData(e.currentTarget));
    changer({...values,selection:''});
  }}}, [select('depart','Départ',villes,'Toutes les villes'), select('arrivee','Destination',villes,'Toutes les villes'),
    champDate, select('carrosserie','Type de camion',carrosseries,'Tous les types'),
    el('button.btn.btn-primary.search-market',{type:'submit'},[icone('search',18),'Rechercher']),
    el('details.explore-advanced', { open: Boolean(params.disponibilite || params.tonnes) }, [
      el('summary', { text: 'Plus de filtres · disponibilité et capacité' }),
      el('div.explore-filter-extra',{},[
      select('disponibilite','Disponibilité',new Map([['maintenant','Dès maintenant'],['prochainement','Prochainement']]),'Toutes'),
      el('label.explore-field',{},[el('span',{text:type==='camions'?'Capacité minimale (t)':type==='frets'?'Poids maximal (t)':'Chargement (t)'}),
        el('input',{name:'tonnes',type:'number',min:0,max:100000,step:1,value:params.tonnes??'',placeholder:'Toutes capacités'}),
        type==='tous'?el('small',{text:'Camions : capacité minimale · frets : poids maximal'}):null]),
      el('a.reset-filters',{href:`#/explorer?type=${type}`,text:'Effacer les filtres'}),
      ]),
    ]),
  ]);
  const carteOffre = o => el('article', {id:`annonce-${o.id}`,class:`public-offer ${o.type}${o.id===selection?.id?' selected':''}`},[
    el('div.public-offer-top',{},[
      el('span.offer-category',{},[icone(o.type==='camions'?'truck':'package',15),o.type==='camions'?'CAMION DISPONIBLE':'FRET À TRANSPORTER']),
      el('span.availability-tag',{text:o.disponibilite==='maintenant'?'Dès maintenant':'À venir'}),
    ]),
    el('button.offer-route-button',{type:'button','aria-pressed':String(o.id===selection?.id),
      dataset:{focus:`annonce-${o.id}`},
      'aria-label':`Voir le trajet ${o.depart} vers ${o.arrivee}`,on:{click:()=>changer({selection:o.id})}},[
      el('span.explore-route-stop',{},[icone('map-pin',18),el('span',{},[el('small',{text:'Départ'}),el('strong',{text:o.depart})])]),
      el('span.explore-route-stop.arrival',{},[icone('map-pin',18),el('span',{},[el('small',{text:'Destination'}),el('strong',{text:o.arrivee})])]),
    ]),
    el('p.offer-cargo',{text:o.titre}),
    el('div.public-offer-info',{},[
      el('span',{},[icone('calendar',14),date(o.du)]),
      el('span',{},[icone('package',14),`${o.tonnes} t`]),
      el('span',{text:o.carrosserie}),
    ]),
    o.id===selection?.id ? el('div.public-offer-detail',{},[
      el('p',{text:o.type==='camions'?`Fenêtre annoncée : du ${date(o.du)} au ${date(o.au)}.`:`Arrivée prévue : ${date(o.au)}.`}),
      el('p',{text:`Publication du ${date(o.publieeLe)} · disponibilité déclarée.`}),
      el('p',{text:'Identité et coordonnées privées. Aucun paiement à cette étape.'}),
      el('button.btn.btn-primary.btn-block',{type:'button',on:{click:()=>action(o)}},[
        ctx ? (o.type==='camions'?'Réserver ce camion':'Proposer mon camion') : 'Se connecter pour '+(o.type==='camions'?'réserver':'proposer'),icone('arrow-right',16),
      ]),
    ]) : el('button.offer-details-link',{type:'button',on:{click:()=>changer({selection:o.id})},text:'Voir le trajet et les détails →'}),
  ]);
  const totalCamions=catalogue.filter(o=>o.type==='camions').length;
  const totalFrets=catalogue.filter(o=>o.type==='frets').length;
  const map = carteOffres(id=>changer({depart:id,selection:''}), {
    onSelection: id=>changer({selection:id}),
  });
  const mapOffer = o => o && ({...o,localiteDepartId:o.departId,localiteArriveeId:o.arriveeId});
  map.update(resultats.map(mapOffer), mapOffer(selection));
  const listeOffres = el('section.public-results',{'aria-label':'Annonces disponibles'},resultats.length?resultats.map(carteOffre):[
    el('div.public-empty',{},[icone('search',30),el('h3',{text:'Aucune annonce pour ces critères'}),
      el('p',{text:'Essayez une autre ville ou élargissez vos dates.'}),
      el('a.btn.btn-secondary',{href:`#/explorer?type=${type}`,text:'Voir toutes les annonces'})]),
  ]);
  // Garder le détail choisi visible dans la liste lors d’un clic sur la carte.
  requestAnimationFrame(() => {
    const choisie = listeOffres.querySelector('.selected');
    if (choisie && listeOffres.isConnected && listeOffres.scrollHeight > listeOffres.clientHeight) {
      listeOffres.scrollTop = choisie.getBoundingClientRect().top - listeOffres.getBoundingClientRect().top;
    }
  });
  return el('div.explore-shell',{},[
    el('aside.explore-sidebar',{},[
      el('a.explore-brand',{href:'#/accueil'},[el('img.oic-logo',{src:'assets/oic.jpeg',alt:'OIC — Office Ivoirien des Chargeurs'}),
        el('div',{},[el('strong',{text:'Bourse de Fret'}),el('small',{text:'CÔTE D’IVOIRE · OIC'})])]),
      el('p.nav-caption',{text:'LE MARCHÉ'}),
      el('nav',{'aria-label':'Navigation du marché'},[
        nav('Toutes les offres','market',route({type:'tous',selection:''}),type==='tous'),
        nav('Trouver un camion','truck',route({type:'camions',selection:''}),type==='camions'),
        nav('Trouver du fret','package',route({type:'frets',selection:''}),type==='frets'),
        nav('Mon espace','dashboard',lienConnexion),
      ]),
      el('div.explore-sidebar-help',{},[
        el('span.help-icon',{},[icone('handshake',24)]),el('h3',{text:'Votre prochain trajet commence ici.'}),
        el('p',{text:'Explorez librement. Connectez-vous seulement pour publier ou prendre contact.'}),
        el('a',{href:'#/explorer?type=frets',text:'Découvrir les frets →'}),
      ]),
      el('div.explore-sidebar-bottom',{},[icone('shield',18),el('span',{text:'Office Ivoirien des Chargeurs'})]),
    ]),
    el('div.explore-workspace',{},[
      el('header.explore-topbar',{},[
        el('div.explore-breadcrumb',{},[icone('market',17),el('span',{text:'Le marché'}),icone('chevron-right',13),el('strong',{text:'Explorer'})]),
        el('div.explore-top-actions',{},[
          el('span.public-access',{},[el('span.status-dot'), 'Accès libre']),
          el('a.btn.btn-primary',{href:lienConnexion,text:ctx?'Mon espace':'Se connecter'}),
        ]),
      ]),
      el('main.explore-main',{id:'contenu',tabindex:'-1'},[
        el('div.explore-heading',{},[
          el('div',{},[el('p.eyebrow',{text:'CONNECTONS LE FRET ET LA ROUTE'}),
            el('h1',{},['Explorez les ',el('span',{text:'opportunités de transport.'})]),
            el('p',{text:'Des camions, du fret et de nouvelles opportunités en Côte d’Ivoire.'})]),
          el('button.btn.btn-secondary',{type:'button',on:{click:publier}},[icone('plus',17),'Publier une annonce']),
        ]),
        el('div.explore-stats',{},[
          stat('Camions disponibles',totalCamions,'Offres ouvertes à la réservation','truck','violet'),
          stat('Frets à transporter',totalFrets,'Demandes ouvertes aux propositions','package','teal'),
          stat('Villes desservies',villesDesservies.size,'Départs et destinations du catalogue','map-pin','amber'),
        ]),
        el('section.search-panel',{'aria-label':'Rechercher dans le marché'},[
          el('div.market-tabs',{'aria-label':'Type de recherche'},[
            el('a',{href:route({type:'tous',selection:''}),class:type==='tous'?'active':'','aria-current':type==='tous'?'page':null},[icone('market',18),'Toutes les offres']),
            el('a',{href:route({type:'camions',selection:''}),class:type==='camions'?'active':'','aria-current':type==='camions'?'page':null},[icone('truck',18),'Camions']),
            el('a',{href:route({type:'frets',selection:''}),class:type==='frets'?'active':'','aria-current':type==='frets'?'page':null},[icone('package',18),'Frets']),
          ]),recherche,
        ]),
        el('div.market-result-heading',{},[
          el('div',{},[el('h2',{text:`${resultats.length} ${type==='camions'?'camion':type==='frets'?'fret':'annonce'}${resultats.length>1?'s':''} à découvrir`}),
            el('p',{text:'Cliquez sur un camion, un fret ou une annonce pour afficher son trajet.'})]),
          el('div.explore-map-legend',{'aria-label':'Légende de la carte'},[
            el('span.camions',{},[icone('truck',17),'Camions']),
            el('span.frets',{},[icone('package',17),'Frets']),
          ]),
        ]),
        el('div.market-workbench',{},[
          el('section.explore-map-panel',{'aria-label':'Carte des opportunités'},[
            el('div.explore-map-heading',{},[
              el('div',{},[el('span.eyebrow',{text:'LES ROUTES DU FRET'}),el('h3',{text:selection?`${selection.depart} → ${selection.arrivee}`:'Les opportunités en Côte d’Ivoire'})]),
              selection?el('button.explore-map-overview',{type:'button',on:{click:()=>changer({selection:''})}},[icone('map-pin',16),'Vue d’ensemble']):icone('map-pin',22),
            ]),
            map.element,
            el('p.explore-map-note',{text:'Les repères indiquent les villes de départ des annonces, pas la position GPS des véhicules.'}),
          ]),
          listeOffres,
        ]),
        el('section.explore-how',{},[
          el('div',{},[icone('search',21),el('h3',{text:'1. Trouvez votre trajet'}),el('p',{text:'Explorez la carte et comparez les disponibilités sans compte.'})]),
          el('div',{},[icone('handshake',21),el('h3',{text:'2. Confirmez la mise en relation'}),el('p',{text:'Connectez-vous pour proposer ou réserver. Les frais sont présentés avant validation.'})]),
          el('div',{},[icone('truck',21),el('h3',{text:'3. Préparez le prochain départ'}),el('p',{text:'Après livraison, le transporteur confirme une nouvelle disponibilité pour trouver du fret retour.'})]),
        ]),
        el('footer.explore-footer',{},[el('span',{text:'B2F · Office Ivoirien des Chargeurs'}),el('span',{text:'Démonstration · données fictives · aucun transport réel'})]),
      ]),
    ]),
  ]);
}
