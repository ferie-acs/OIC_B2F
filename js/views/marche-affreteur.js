import { camion, libelleTrajet } from '../core/camion.js';
import { el, icone, date } from '../core/dom.js';
import { champ, bouton, etatVide, modale } from '../core/ui.js';
import { carteOffres } from '../core/carte-offres.js?v=20261009-carte-2';
import { depot } from '../repositories/index.js';
import { chercherVehicules } from '../services/flotte.service.js';
import * as preferences from '../services/preferences.service.js';
import { refDe } from './_donnees.js';
import { retourPublic } from '../services/marche-public.service.js';

export function marcheCarte(ctx, params, detailOffre) {
  let filtres = preferences.lire(ctx, 'recherche', {}), resultats = [], selection, ville = '';
  const liste = el('div.market-results');
  const count = el('h2', { 'aria-live': 'polite' });
  const zone = el('div.market-workspace');
  const carte = carteOffres(id => { ville = ville === id ? '' : id; rendre(); });
  const options = famille => depot('referentiel').brutOu(r => r.famille === famille && r.actif).map(r => ({ valeur: r.id, libelle: r.libelle }));
  const fields = el('div.market-fields', {}, [
    champ({ id:'q-depart', label:'Départ', options:options('localites'), valeur:filtres.departId }),
    champ({ id:'q-arrivee', label:'Destination', options:options('localites'), valeur:filtres.arriveeId }),
    champ({ id:'q-date', label:'À partir du', type:'date', valeur:filtres.aPartirDu }),
    champ({ id:'q-carrosserie', label:'Carrosserie', options:options('carrosseries'), valeur:filtres.carrosserieId }),
    champ({ id:'q-capacite', label:'Capacité minimale (t)', type:'number', valeur:filtres.capaciteMin, attrs:{min:0,step:'0.1'} }),
  ]);
  const reset = () => {
    filtres = {}; ville = ''; params = {}; selection = undefined; preferences.ecrire(ctx,'recherche',{});
    for (const id of ['q-depart','q-arrivee','q-date','q-carrosserie','q-capacite']) { const field = fields.querySelector(`#${id}`); if (field) field.value = ''; }
    rendre();
  };
  const form = el('form.market-filter-form', { on: { submit: e => {
    e.preventDefault(); const value = id => fields.querySelector(`#${id}`)?.value || undefined;
    filtres = { departId:value('q-depart'), arriveeId:value('q-arrivee'), aPartirDu:value('q-date'), carrosserieId:value('q-carrosserie'), capaciteMin:value('q-capacite') };
    preferences.ecrire(ctx,'recherche',filtres); params = {}; ville = ''; selection = undefined; rendre();
  } } }, [fields, el('div.market-filter-actions', {}, [el('button.btn.btn-primary', { type:'submit',text:'Rechercher' }), bouton({ libelle:'Réinitialiser', onClick:reset })])]);
  const filters = el('details.market-filters', {}, [el('summary', {}, [icone('search',16), 'Rechercher un véhicule']), form]);
  const cityReset = bouton({ libelle:'Toutes les villes', onClick:() => { ville=''; rendre(); } });
  const sidebar = el('section.market-sidebar', { 'aria-label':'Rechercher et comparer les véhicules' }, [filters, el('div.market-result-heading', {}, [count,cityReset]), liste]);
  const mobile = bouton({ libelle:'Réduire la liste', onClick:() => { const closed = zone.classList.toggle('list-collapsed'); mobile.textContent = closed ? 'Afficher les offres' : 'Réduire la liste'; mobile.setAttribute('aria-expanded', String(!closed)); } });
  mobile.classList.add('market-mobile-toggle'); mobile.setAttribute('aria-expanded','true');
  zone.append(carte.element, sidebar, mobile);
  function choisir(o) { selection = o.id; rendre(); }
  function voir(o) {
    choisir(o);
    const preview = carteOffres(() => {}, { compact: true });
    preview.update([o], o);
    const content = el('div.vehicle-detail', {}, [
      detailOffre(ctx, o, () => { selection=undefined; rendre(); }),
      el('div.vehicle-detail-map', {}, [preview.element, el('span.vehicle-availability', {}, [el('i', { 'aria-hidden':'true' }), 'Offre disponible'])]),
    ]);
    modale({ titre:'Détail du véhicule', corps:[content], actions:[], surFermeture:()=>preview.destroy() });
    // Also release WebGL when the reservation dialog replaces this dialog.
    const removal = new MutationObserver(() => {
      if (!content.isConnected) { preview.destroy(); removal.disconnect(); }
    });
    removal.observe(document.body, { childList:true });

  }
  function rendre() {
    resultats = chercherVehicules(ctx, params.selection ? {} : filtres).filter(o => !params.selection || o.id === params.selection);
    const visibles = resultats.filter(o => !ville || o.localiteDepartId === ville);
    if (!visibles.some(o => o.id === selection)) selection = undefined;
    count.textContent = `${visibles.length} véhicule${visibles.length > 1 ? 's' : ''} disponible${visibles.length > 1 ? 's' : ''}`;
    cityReset.hidden = !ville;
    liste.replaceChildren(...(visibles.length ? visibles.map(o => el('article.market-offer', { class:o.id===selection?'selected':'' }, [
      el('button.market-offer-select', { type:'button','aria-pressed':String(o.id===selection), 'aria-label':`Afficher le trajet ${refDe(o.localiteDepartId)} vers ${refDe(o.localiteArriveeId)}`, on:{click:()=>choisir(o)} }, [
        el('div.market-trip-date', { text: date(o.disponibleDu) }),
        el('span.truck-journey-label', {text:libelleTrajet(o)}),
        el('div.market-trip-chips', {}, [
          el('span', {}, [camion(o, 26), refDe(o.vehicule?.carrosserieId)]),
          el('span', {}, [icone('package', 14), `${o.vehicule?.capaciteT ?? '—'} tonnes`]),
        ]),
        el('div.market-trip-route', {}, [
          el('div.market-trip-stop', {}, [
            el('span.market-trip-dot', { 'aria-hidden': 'true' }),
            el('div', {}, [el('strong', { text: refDe(o.localiteDepartId) }), el('small', { text: 'Ville de disponibilité' })]),
          ]),
          el('span.market-trip-connector', { 'aria-hidden': 'true' }, [camion(o, 25)]),
          el('div.market-trip-stop', {}, [
            el('span.market-trip-dot.arrival', { 'aria-hidden': 'true' }),
            el('div', {}, [el('strong', { text: refDe(o.localiteArriveeId) }), el('small', { text: 'Destination proposée' })]),
          ]),
        ]),
        el('div.market-trip-carrier', { text: o.groupement?.raisonSociale ?? 'Transporteur' }),
        el('span.market-dates', { text: `Disponible jusqu’au ${date(o.disponibleAu)}` }),
      ]),
      el('div.market-offer-bottom',{},[el('span', {text:o.prixKmT ? `${o.prixKmT} F/km·t · indicatif`:'Tarif non renseigné'}),bouton({libelle:'Voir l’offre',onClick:()=>voir(o)})]),
    ])) : [etatVide({ titre:params.selection?'Cette annonce n’est plus disponible':'Aucun véhicule ne correspond', message:'Modifiez vos critères pour retrouver les véhicules disponibles.', action:{libelle:'Voir tout le marché',onClick:reset} })]));
    carte.update(resultats, visibles.find(o=>o.id===selection));
  }
  rendre();
  return el('div.page.market-page', {}, [
    el('div.market-page-heading', {}, [el('div', {}, [el('span.dash-eyebrow',{text:'LE BON VÉHICULE POUR VOTRE FRET'}),el('h1',{text:'Marché des véhicules'}),el('p',{text:'Comparez les disponibilités et trouvez votre prochain partenaire.'})]),el('a.btn',{href:'#/affreteur/reservations',text:'Mes réservations'})]),
    ...(params.selection?[el('a',{href:retourPublic(params.retour),text:'← Revenir à la carte'})]:[]),
    zone,
    el('p.market-disclaimer',{text:'Repères par ville de disponibilité · sans suivi GPS. Prix déclarés indicatifs : seuls les frais de mise en relation sont débités à la validation.'}),
  ]);
}
