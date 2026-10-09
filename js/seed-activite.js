/** Jeu additionnel DÉMO, idempotent et sans remplacement des données utilisateur. */
import { depot, stockageInterne } from './repositories/index.js';
import { contexteDe } from './services/auth.service.js';
import * as matching from './services/matching.service.js';
import { avancer } from './services/transport.service.js';

const VERSION = 'activite-v1';
const jour = n => new Date(Date.now() + n * 86400000).toISOString();
const routes = [
  ['abidjan','bouake','Cacao en fèves','1801','plateau',25],
  ['daloa','san-pedro','Café vert','0901','bache',40],
  ['korhogo','abidjan','Coton du Nord','5201','bache',25],
  ['san-pedro','yamoussoukro','Ciment en sacs','2523','plateau',40],
  ['man','abidjan','Caoutchouc naturel','4001','bache',25],
  ['abidjan','daloa','Huile de palme','1511','citerne',25],
  ['bouake','korhogo','Ciment en vrac','2523','benne',40],
  ['yamoussoukro','man','Café conditionné','0901','bache',10],
  ['san-pedro','bouake','Cacao conditionné','1801','bache',25],
];

export async function enrichirDemo() {
  if (!depot('utilisateur').brutParId('u-aff-1')?.demo) return;
  if (depot('audit').brutParId(`seed-${VERSION}-complete`)) return;
  const user = depot('utilisateur').brutParId('u-tra-1');
  const group = depot('groupement').brutParId('grp-tra-1');
  const veh = depot('vehicule').brutParId('veh-1');
  const driver = depot('chauffeur').brutParId('chf-1');
  stockageInterne().transaction(tx => {
    const add = (collection, record) => {
      const rows = tx.lire(collection);
      if (!rows.some(r=>r.id===record.id)) tx.ecrire(collection,[...rows,{...record,demo:true,seedVersion:VERSION}]);
    };
    const credit = (id,groupementId,montant) => add('operations',{id,groupementId,montant,sens:'credit',motif:'rechargement',libelle:'Provision du jeu de démonstration enrichi',referenceEncaissement:`ENC-DEMO-${id}`,horodatage:jour(-180),auteurUtilisateurId:'u-conc'});
    credit('seed-credit-aff-v1','grp-aff-1',1000000);
    ['Savane Logistique','Lagune Cargo','Ouest Transport','Éburnie Fret'].forEach((nom,i)=>{
      const id=`grp-demo-${i}`;
      add('groupements',{...group,id,raisonSociale:`${nom} DÉMO`,rccm:`CI-DEMO-2026-T-90${i}`,compteContribuable:`DEMO-90${i}`,carteTransporteurNumero:`CT-DEMO-90${i}`,carteTransporteurEcheance:jour(365).slice(0,10),contactNom:`Responsable ${i+1} DÉMO`,contactTelephone:`+225 00 00 90 0${i}`,contactEmail:`contact-${i}@transport.invalid`,adresse:'Zone logistique fictive DÉMO',creeLe:jour(-200)});
      add('users',{...user,id:`u-demo-${i}`,groupementId:id,email:`transport-${i}@b2f.invalid`,nom:`Transport ${i+1} DÉMO`,prenom:'Compte',creeLe:jour(-200)});
      add('abonnements',{id:`abo-demo-${i}`,groupementId:id,montant:150000,devise:'XOF',debuteLe:jour(-100).slice(0,10),finitLe:jour(265).slice(0,10),etat:'actif',creeLe:jour(-100)});
      credit(`seed-credit-tra-${i}`,id,1000000);
    });
    for(let i=0;i<36;i++){
      const key=`seed-v1-${i}`,g=`grp-demo-${i%4}`,u=`u-demo-${i%4}`;
      const [from,to,label,product,body,capacity]=routes[i%routes.length];
      const age=i<24 ? 2+(i%8) : 35+(i-24)*10;
      const travelling=i<24&&i%6>=4;
      const departure=travelling?(i%6===4?-1:-3):2+i%14;
      add('vehicules',{...veh,id:`veh-${key}`,groupementId:g,immatriculation:`DEMO ${String(100+i)} CI`,carteGrise:`CG-DEMO-${i}`,capaciteT:capacity,ptacT:capacity+12,carrosserieId:`car-${body}`,essieuxId:capacity===40?'ess-4':'ess-3',carteTransportNumero:`CT-DEMO-V${i}`,carteTransportEcheance:jour(300).slice(0,10),etat:'disponible',prixKmT:75+(i%9)*8,creeLe:jour(-age)});
      add('chauffeurs',{...driver,id:`chf-${key}`,groupementId:g,vehiculeId:`veh-${key}`,nom:`Chauffeur ${i+1} DÉMO`,permisNumero:`PERMIS-DEMO-${i}`,permisEcheance:jour(300).slice(0,10),telephone:`+225 00 00 ${String(i).padStart(2,'0')} 00`,creeLe:jour(-age)});
      add('declarations',{id:`dec-${key}`,reference:`DF-DEMO-${String(100+i)}`,groupementId:'grp-aff-1',libelle:`${label} — lot ${i+1} DÉMO`,provenanceId:`loc-${from}`,destinationId:`loc-${to}`,etat:'active',creeeLe:jour(-age),publieeLe:jour(-age),creeeParUtilisateurId:'u-aff-1'});
      add('demandes',{id:`dem-${key}`,reference:`DT-DEMO-${String(100+i)}`,declarationId:`dec-${key}`,groupementId:'grp-aff-1',departPrevu:jour(departure),arriveePrevue:jour(departure+2),capaciteId:`cap-${capacity}`,carrosserieId:`car-${body}`,essieuxId:capacity===40?'ess-4':'ess-3',lignes:[{id:`lig-${key}`,produitId:`sh-${product}`,poidsT:capacity-3,volumeM3:capacity*1.5,nombreColis:body==='citerne'||body==='benne'?1:(capacity-3)*20,emballageId:body==='citerne'||body==='benne'?'emb-vrac':'emb-sac'}],etat:'publiee',creeeLe:jour(-age),publieeLe:jour(-age),creeeParUtilisateurId:'u-aff-1'});
      add('offres',{id:`off-${key}`,reference:`OV-DEMO-${String(100+i)}`,groupementId:g,vehiculeId:`veh-${key}`,chauffeurPressentiId:`chf-${key}`,localiteDepartId:`loc-${from}`,localiteArriveeId:`loc-${to}`,disponibleDu:jour(-12),disponibleAu:jour(22+i%8),prixKmT:75+(i%9)*8,etat:'disponible',publieeLe:jour(-age),creeeParUtilisateurId:u});
    }
  });
  const aff = contexteDe(depot('utilisateur').brutParId('u-aff-1'));
  for(let i=0;i<24;i++){
    const key=`seed-v1-${i}`,tra=contexteDe(depot('utilisateur').brutParId(`u-demo-${i%4}`));
    let a=depot('appariement').brutOu(a=>a.demandeId===`dem-${key}`)[0];
    if(a?.seedScenarioComplete) continue;
    a ??= matching.engager(aff,{offreId:`off-${key}`,demandeId:`dem-${key}`});
    const kind=i%6;
    if(a.etat==='reserver'&&(kind===1||kind>=4)) matching.repondre(tra,a.id,{accepte:true});
    if(a.etat==='reserver'&&kind===2) matching.repondre(tra,a.id,{accepte:false,motif:'dates_incompatibles'});
    if(a.etat==='reserver'&&kind===3) matching.annuler(aff,a.id);
    if(kind>=4){
      let transport=depot('transport').brutOu(t=>t.appariementId===a.id)[0];
      if(!transport){
        const prepared=matching.preparerValidation(aff,a.id);
        transport=matching.valider(aff,a.id,{attendu:prepared.attendu}).transport;
      }
      const steps=['valide','a_quai','charge','en_route','livre'];
      for(let step=steps.indexOf(transport.etape);step<(kind===4?3:4);step++) avancer(tra,transport.id);
    }
    depot('appariement').modifier(a.id,{seedScenarioComplete:true,reserveLe:jour(-(2+i%8)),...(kind!==0?{reponduLe:jour(-1)}:{})});
  }
  stockageInterne().transaction(tx=>tx.ecrire('audit',[...tx.lire('audit'),{id:`seed-${VERSION}-complete`,demo:true,seedVersion:VERSION,horodatage:jour(0),evenement:'demo.enrichie',details:'36 dossiers et véhicules de démonstration ajoutés.'}]));
}


/** Variantes visuelles, appliquées une fois aux seules offres générées. */
export function enrichirSensDemo() {
  stockageInterne().transaction(tx => {
    const offers = tx.lire('offres');
    tx.ecrire('offres', offers.map(o => {
      const m = /^off-seed-v1-(\d+)$/.exec(o.id);
      if (!m || o.trajetRetour !== undefined || o.trajetVide !== undefined) return o;
      const i = Number(m[1]);
      return {...o, trajetRetour: i % 4 >= 2, trajetVide: i >= 24 && i % 2 === 1};
    }));
  });
}
