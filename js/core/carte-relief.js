import { el } from './dom.js';
import { VILLES } from './carte-geographie.js';
import { carteMarche } from './carte-marche.js';

let library;
/**
 * Charge le moteur cartographique **depuis le site**, jamais depuis un CDN.
 *
 * Deux raisons. D'abord la disponibilité : la carte est le cœur de l'accueil,
 * et la faire dépendre d'un tiers, c'est accepter qu'elle soit vide quand ce
 * tiers répond mal. Ensuite la sécurité : autoriser un CDN entier dans
 * `script-src` revient à autoriser n'importe quel paquet qu'il héberge, ce qui
 * vide la politique de sécurité du contenu de son sens. Le fichier est donc
 * figé dans `js/vendor/`, à une version inventoriée.
 *
 * La branche 6 ne publie plus que des modules ES — aucun paquet classique à
 * charger par balise `script`. D'où l'import dynamique. Elle est indispensable :
 * tout ce qui précède 6.4.1 est exposé à CVE-2026-85061.
 */
export function charger(){
  if(!library){
    const css=document.createElement('link');css.rel='stylesheet';css.href='css/vendor/maplibre-gl.css';document.head.append(css);
    library=import('../vendor/maplibre-gl.mjs')
      .catch(e=>{library=null;throw new Error(`Moteur cartographique illisible : ${e.message}`);});
  }
  return library;
}
/**
 * Carte réelle OpenStreetMap ; les liaisons restent indicatives.
 *
 * ## Pourquoi il n'y a plus de relief
 *
 * Le relief s'appuyait sur les tuiles d'élévation Mapzen/AWS. Elles se
 * téléchargent, mais **sans en-tête `Access-Control-Allow-Origin`** : un
 * navigateur n'a donc pas le droit d'en lire les pixels, ce qu'exige une source
 * `raster-dem`. MapLibre attendait alors une tuile exploitable qui n'arrivait
 * jamais, l'événement `load` ne partait pas, et la carte restait **grise** —
 * exactement le symptôme observé. Le fond OpenStreetMap, lui, est une simple
 * image : il s'affiche.
 *
 * Mieux vaut la vraie carte sans relief qu'un relief qui empêche la carte.
 * L'inclinaison reste disponible : elle ne dépend pas des données d'élévation.
 */
export function carteRelief(surVille){
  const canvas=el('div.th-relief-canvas',{'aria-label':'Carte géographique 3D de Côte d’Ivoire'});
  const status=el('p.th-relief-status',{'aria-live':'polite',text:'Chargement de la carte…'});
  const fallback=el('div.th-relief-fallback');
  const controls=el('div.th-relief-toolbar');
  const element=el('div.th-relief',{},[canvas,controls,status,fallback]);
  let state={offres:[]},map,lib,ready=false,dead=false,started=false,markers=[],previous='',timer;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration=()=>reduced()?0:700;
  const button=(text,fn)=>el('button',{type:'button',text,on:{click:fn}});
  function overview(){map?.easeTo({center:[-5.6,7.45],zoom:6.25,pitch:52,bearing:-10,duration:duration()});}
  const flat=button('Vue 2D',()=>{const is3D=map.getPitch()>10;map.easeTo({pitch:is3D?0:55,bearing:is3D?0:-10,duration:duration()});flat.textContent=is3D?'Vue 3D':'Vue 2D';});
  controls.append(button('Vue pays',overview),flat,button('Région de Man',()=>map?.flyTo({center:[-7.58,7.43],zoom:10.5,pitch:65,bearing:-25,duration:duration()})));
  controls.hidden=true;
  function local(){fallback.replaceChildren(carteMarche({...state,surVille}));}
  // La carte simplifiée est affichée d'emblée. Le relief la remplace quand il
  // est prêt : à aucun moment l'écran ne reste vide, même sur un réseau lent.
  // Le repli se superpose au canevas, il ne le remplace pas : MapLibre a besoin
  // d'un conteneur mesurable pour s'initialiser. Un conteneur masqué a une
  // taille nulle, et la carte ne finit jamais de charger.
  function attendre(){ if(ready||dead)return; fallback.hidden=false; local(); }
  function paint(){
    if(!ready)return;
    markers.forEach(m=>m.remove());markers=[];
    for(const [id,v] of Object.entries(VILLES)){
      const count=state.offres.filter(o=>o.departId===id).length;
      const active=id===state.depart||id===state.selection?.departId||id===state.selection?.arriveeId;
      const node=el('button',{type:'button',class:`th-relief-pin${active?' active':''}`,'aria-label':`${v.nom}, ${count} annonces au départ`,'aria-pressed':String(id===state.depart),on:{click:()=>surVille(id===state.depart?'':id)}},[el('span',{text:v.nom}),...(count?[el('b',{text:String(count)})]:[])]);
      markers.push(new lib.Marker({element:node,anchor:'bottom'}).setLngLat([v.lon,v.lat]).addTo(map));
    }
    const a=VILLES[state.selection?.departId],b=VILLES[state.selection?.arriveeId];
    map.getSource('b2f-route').setData({type:'FeatureCollection',features:a&&b?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[a.lon,a.lat],[b.lon,b.lat]]}}]:[]});
    if(previous&&previous!==state.selection?.id&&a&&b){map.fitBounds([[Math.min(a.lon,b.lon),Math.min(a.lat,b.lat)],[Math.max(a.lon,b.lon),Math.max(a.lat,b.lat)]],{padding:{top:120,bottom:160,left:65,right:65},maxZoom:8,pitch:52,duration:duration()});}
    previous=state.selection?.id||'';
  }
  function fail(){if(dead)return;clearTimeout(timer);ready=false;map?.remove();map=null;canvas.hidden=true;controls.hidden=true;fallback.hidden=false;status.textContent='Carte détaillée indisponible : carte simplifiée affichée. Vérifiez votre connexion ou la prise en charge WebGL.';local();}
  async function start(){
    if(started||dead)return;started=true;
    attendre();
    try{
      lib=await charger();if(dead)return;
      map=new lib.Map({container:canvas,center:[-5.6,7.45],zoom:6.25,pitch:52,bearing:-10,maxPitch:75,minZoom:5,maxZoom:16,cooperativeGestures:true,
        style:{version:8,sources:{
          osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
        },layers:[{id:'basemap',type:'raster',source:'osm',paint:{'raster-saturation':-.22}}]}
      });
      map.on('pitchend',()=>{flat.textContent=map.getPitch()>10?'Vue 2D':'Vue 3D';});
      map.addControl(new lib.NavigationControl({visualizePitch:true}),'top-right');
      map.addControl(new lib.ScaleControl({unit:'metric'}),'bottom-left');
      // Au-delà de quelques secondes sans relief, on cesse d'attendre : mieux
      // vaut une carte simple affichée qu'une belle carte absente.
      // Au-delà de quelques secondes, on cesse d'attendre : mieux vaut la carte
      // simplifiée affichée qu'une carte réelle absente.
      timer=setTimeout(()=>{if(!ready)fail();},8000);
      map.on('error',e=>{if(e.sourceId==='osm')status.textContent='Fond de carte incomplet · certaines tuiles n’ont pas répondu.';});
      map.on('load',()=>{
        if(dead||!map)return;clearTimeout(timer);
        map.addSource('b2f-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        map.addLayer({id:'b2f-route-halo',type:'line',source:'b2f-route',paint:{'line-color':'#fff','line-width':8,'line-opacity':.85}});
        map.addLayer({id:'b2f-route',type:'line',source:'b2f-route',paint:{'line-color':'#f38a0b','line-width':4,'line-dasharray':[2,1]}});
        ready=true;fallback.hidden=true;canvas.hidden=false;controls.hidden=false;status.textContent='Carte OpenStreetMap · liaison indicative, sans suivi GPS. Faites glisser pour explorer.';paint();map.resize();
      });
    }catch(e){console.warn('Carte 3D :',e);fail();}
  }
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}},{rootMargin:'250px'});observer.observe(element);
  const resize=new ResizeObserver(()=>map?.resize());resize.observe(element);
  function destroy(){dead=true;clearTimeout(timer);clearTimeout(controle);observer.disconnect();resize.disconnect();detache?.disconnect();markers.forEach(m=>m.remove());map?.remove();}
  // On suit le détachement réel de la carte, pas « hashchange » : une ancre
  // interne change le fragment sans changer d'écran, et détruisait la carte.
  //
  // La vérification est différée : un re-rendu du panneau détache puis rattache
  // la carte en une poignée de millisecondes. Détruire au premier détachement
  // revenait à tuer la carte à la première frappe dans le filtre des villes.
  let controle=0;
  const detache='MutationObserver' in window
    ? new MutationObserver(()=>{
        clearTimeout(controle);
        controle=setTimeout(()=>{if(!element.isConnected)destroy();},2000);
      })
    : null;
  setTimeout(()=>{if(element.parentNode)detache?.observe(element.parentNode,{childList:true});},0);
  return {element,update(next){state=next;if(ready)paint();else if(started&&!map)local();},destroy};
}
