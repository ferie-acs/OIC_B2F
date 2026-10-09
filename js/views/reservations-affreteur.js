import { camion, libelleTrajet } from '../core/camion.js';
import { el, icone, date, dateHeure, heuresDepuis } from '../core/dom.js';
import { badge, etatVide } from '../core/ui.js';
import { mesAppariements } from '../services/matching.service.js';
import { lire, nomDe, refDe } from './_donnees.js';
import { POV, labelOf } from '../domain/enums.js';
import { aller } from '../core/router.js';

export function reservationsVue(ctx, action) {
  const reservations = mesAppariements(ctx);
  let filtre = 'toutes';
  const groupes = [
    ['toutes', 'Toutes', () => true],
    ['reserver', 'En attente', a => a.etat === 'reserver'],
    ['accepter', 'À valider', a => a.etat === 'accepter'],
    ['valider', 'Validées', a => a.etat === 'valider'],
    ['terminees', 'Refusées / annulées', a => ['rejeter','annuler'].includes(a.etat)],
  ];
  const liste = el('div.reservation-list');
  const compteur = el('p.reservation-count', { 'aria-live':'polite' });
  const tabs = groupes.map(([id, label, test]) => el('button.reservation-filter', { type:'button','aria-pressed':String(id===filtre),on:{click:()=>{filtre=id;rendre();}} }, [label,el('span',{text:reservations.filter(test).length})]));
  const messages = {
    reserver:'Le transporteur doit encore répondre à votre demande.',
    accepter:'Le transporteur a accepté. Votre validation est attendue.',
    valider:'La mise en relation est validée. Retrouvez votre partenaire.',
    rejeter:'Le transporteur a décliné cette réservation.',
    annuler:'Cette réservation est clôturée.',
  };
  function fiche(a) {
    const demande = lire(ctx,'demande',a.demandeId) ?? {};
    const declaration = demande.declarationId ? lire(ctx,'declaration',demande.declarationId) ?? {} : {};
    const offre = lire(ctx,'offre',a.offreId) ?? {};
    const vehicule = offre.vehiculeId ? lire(ctx,'vehicule',offre.vehiculeId) ?? {} : {};
    const age = heuresDepuis(a.reserveLe);
    const stop = (label, id) => el('div.reservation-stop',{},[el('span',{text:label}),el('strong',{text:refDe(id)})]);
    const progression = a.etat === 'valider' ? 3 : a.etat === 'accepter' ? 2 : 1;
    const terminal = ['rejeter','annuler'].includes(a.etat);
    return el('article.reservation-card', {class:`state-${a.etat}`},[
      el('header.reservation-card-head',{},[
        el('div',{},[el('span.reservation-ref',{text:a.reference}),el('p',{text:nomDe(a.groupementTransporteurId)})]),
        badge(a.etat,POV.AFFRETEUR),
      ]),
      el('div.reservation-card-body',{},[
        el('div.reservation-corridor',{},[
          stop('DÉPART',declaration.provenanceId ?? offre.localiteDepartId),
          el('div.reservation-route-line.reservation-truck-direction',{},[camion(offre, 50),el('small',{text:libelleTrajet(offre)})]),
          stop('ARRIVÉE',declaration.destinationId ?? offre.localiteArriveeId),
        ]),
        el('div.reservation-facts',{},[
          el('div',{},[icone('calendar',16),el('span',{},[el('small',{text:'Départ prévu'}),el('strong',{text:date(demande.departPrevu)})])]),
          el('div',{},[camion(offre, 29),el('span',{},[el('small',{text:'Véhicule réservé'}),el('strong',{text:vehicule.immatriculation ?? 'Non renseigné'})])]),
          el('div',{},[icone('package',16),el('span',{},[el('small',{text:'Capacité'}),el('strong',{text:vehicule.capaciteT ? `${vehicule.capaciteT} t · ${refDe(vehicule.carrosserieId)}` : 'Non renseignée'})])]),
        ]),
        el('div.reservation-progress',{'aria-label':terminal?'Réservation clôturée':`Étape ${progression} sur 3`},['Réservée','Acceptée','Validée'].map((label,i)=>el('span',{class:!terminal&&i<progression?'done':'',text:label}))),
      ]),
      el('div.reservation-message',{},[
        el('p',{text:messages[a.etat] ?? labelOf(a.etat)}),
        a.motifRejet ? el('small',{text:`Motif : ${labelOf(a.motifRejet)}`}) : null,
        a.etat==='reserver'&&age>=48 ? el('span.badge.badge-warning',{text:`Sans réponse depuis ${Math.floor(age/24)} j`}) : null,
      ]),
      el('footer.reservation-card-foot',{},[el('span',{text:`Réservée le ${dateHeure(a.reserveLe)}`}),
        a.etat==='annuler' ? el('a.btn.btn-sm',{href:'#/affreteur/marche',text:'Explorer le marché'}) : action(ctx,a),
      ]),
    ]);
  }
  function rendre() {
    const visibles = reservations.filter(groupes.find(g=>g[0]===filtre)[2]);
    tabs.forEach((button,i)=>button.setAttribute('aria-pressed',String(groupes[i][0]===filtre)));
    compteur.textContent = `${visibles.length} réservation${visibles.length>1?'s':''}`;
    liste.replaceChildren(...(visibles.length ? visibles.map(fiche) : [etatVide({
      titre:reservations.length?'Aucune réservation dans cette catégorie':'Aucune réservation pour le moment',
      message:reservations.length?'Les réservations correspondant à ce statut apparaîtront ici.':'Trouvez un véhicule adapté à votre fret, puis envoyez votre réservation au transporteur.',
      action:reservations.length ? {libelle:'Voir toutes les réservations',onClick:()=>{filtre='toutes';rendre();}} : {libelle:'Rechercher un véhicule',onClick:()=>aller('#/affreteur/marche')},
    })]));
  }
  rendre();
  return el('div.page.reservations-page',{},[
    el('div.market-page-heading',{},[el('div',{},[el('span.dash-eyebrow',{text:'VOS PROCHAINS TRANSPORTS'}),el('h1',{text:'Mes réservations'}),el('p',{text:'Suivez les réponses de vos transporteurs et préparez vos mises en relation.'})]),el('a.btn.btn-primary',{href:'#/affreteur/marche'},[icone('search',17),'Trouver un véhicule'])]),
    el('div.reservation-summary',{},[
      ['reserver','En attente de réponse','clock'],['accepter','À valider','check'],['valider','Mises en relation validées','handshake'],
    ].map(([id,label,icon])=>el('button.reservation-summary-card',{type:'button',class:`summary-${id}`,on:{click:()=>{filtre=id;rendre();}}},[
      el('span.indicator-watermark',{'aria-hidden':'true'},[icone(icon,88)]),el('span.reservation-summary-icon',{},[icone(icon,22)]),el('span',{},[el('strong',{text:reservations.filter(a=>a.etat===id).length}),el('small',{text:label})]),icone('arrow-right',16),
    ]))),
    el('div.reservation-toolbar',{},[el('div.reservation-filters',{'aria-label':'Filtrer les réservations'},tabs),compteur]),
    liste,
    el('div.reservation-reassurance',{},[icone('info',18),el('span',{text:'Réserver est gratuit. Les frais de mise en relation sont débités uniquement lors de votre validation.'})]),
  ]);
}
