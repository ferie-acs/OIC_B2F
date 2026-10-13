/** Tableau de bord affréteur : données limitées au groupement courant. */
import { indicateurCourbe } from './tendances-dashboard.js';
import { el, icone, date, montant, remplacer } from '../core/dom.js';
import { badge, bandeau, bouton, carte, etatVide, tableau } from '../core/ui.js';
import { segmentEspace } from '../core/nav.js';
import { aller } from '../core/router.js';
import { carteCorridors } from '../core/carte-corridors.js?v=20261009-carte-2';
import { decider } from '../domain/access.js';
import { CODE_TARIF, ETAPE_TRANSPORT, ETAT_APPARIEMENT, ETAT_DEMANDE, POV } from '../domain/enums.js';
import { mesDeclarations, mesDemandes } from '../services/fret.service.js';
import { mesAppariements } from '../services/matching.service.js';
import { transportsVisibles } from '../services/transport.service.js';
import { couverture } from '../services/compte.service.js';
import { nomDe, refDe, tarifDe } from './_donnees.js';


/** Répartition et volumes calculés sur les demandes visibles du groupement. */
function analysesDemandes(demandes) {
  const maintenant = new Date();
  const periodes = Array.from({ length: 6 }, (_, i) => {
    const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - 5 + i, 1);
    const fin = new Date(debut.getFullYear(), debut.getMonth() + 1, 1);
    return { debut, fin, nombre: demandes.filter(d => new Date(d.creeeLe) >= debut && new Date(d.creeeLe) < fin).length };
  });
  const max = Math.max(1, ...periodes.map(p => p.nombre));
  const total = periodes.reduce((n, p) => n + p.nombre, 0);
  const categories = [
    ['Publiées', '#3265af', demandes.filter(d => d.etat === 'publiee').length],
    ['Réservées', '#ed9b45', demandes.filter(d => d.etat === 'reservee').length],
    ['Validées', '#619b77', demandes.filter(d => d.etat === 'validee').length],
    ['Autres', '#bdc9dc', demandes.filter(d => !['publiee', 'reservee', 'validee'].includes(d.etat)).length],
  ];
  let angle = 0;
  const secteurs = categories.filter(c => c[2]).map(([, couleur, nombre]) => {
    const precedent = angle; angle += nombre / demandes.length * 360;
    return `${couleur} ${precedent}deg ${angle}deg`;
  });
  return el('div.dash-analytics', {}, [
    el('section.dash-panel.dash-volume', {}, [
      el('div.dash-panel-head', {}, [el('h2.indicator-title', {}, [icone('request-activity', 20), el('span', { text: 'Activité des demandes' })]), el('span.dash-period', { text: '6 derniers mois' })]),
      el('div.dash-chart-total', {}, [el('strong', { text: total }), el('span', { text: 'demande(s) créée(s) sur la période' }), el('span.indicator-watermark', { 'aria-hidden': 'true' }, [icone('request-activity', 88)])]),
      el('div.dash-bars', { role: 'list', 'aria-label': 'Nombre de demandes créées par mois' }, periodes.map(p => {
        const mois = p.debut.toLocaleDateString('fr-FR', { month: 'short' });
        return el('div.dash-bar-column', { role: 'listitem', 'aria-label': `${p.debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} : ${p.nombre} demande(s)` }, [
          el('div.dash-bar-track', {}, [el('div.dash-bar-fill', { style: `height:${p.nombre / max * 100}%` }, [el('span', { text: p.nombre })])]),
          el('span.dash-bar-month', { text: mois }),
        ]);
      })),
      el('p.dash-chart-note', { text: 'Nombre de demandes créées · périmètre de votre groupement' }),
    ]),
    el('section.dash-panel.dash-distribution', {}, [
      el('div.dash-panel-head.indicator-analysis-head', {}, [el('h2.indicator-title', {}, [icone('dashboard', 20), el('span', { text: 'Répartition des demandes' })]), el('span.indicator-watermark', { 'aria-hidden': 'true' }, [icone('dashboard', 88)])]),
      el('div.dash-donut', { style: `background:${secteurs.length ? `conic-gradient(${secteurs.join(',')})` : 'var(--border)'}`, role: 'img', 'aria-label': `${demandes.length} demande(s) : ${categories.map(c => `${c[2]} ${c[0].toLowerCase()}`).join(', ')}` }, [el('div', {}, [el('strong', { text: demandes.length }), el('span', { text: 'demandes' })])]),
      el('div.dash-chart-legend', {}, categories.map(([label, couleur, n]) => el('div', {}, [el('i', { style: `background:${couleur}`, 'aria-hidden': 'true' }), el('span', { text: label }), el('strong', { text: n })]))),
    ]),
  ]);
}

/** Actions de suivi issues des seuls dossiers visibles par le groupement. */
function prochainesEtapes({ espace, publiees, enAttente, aValider, transports, demandes, parId, peutCreer, peutValider }) {
  const enCours = transports.filter(t => [ETAPE_TRANSPORT.VALIDE, ETAPE_TRANSPORT.A_QUAI, ETAPE_TRANSPORT.CHARGE, ETAPE_TRANSPORT.EN_ROUTE].includes(t.etape));
  const livres = transports.filter(t => t.etape === ETAPE_TRANSPORT.LIVRE);
  const reservation = [...aValider].sort((a, b) => new Date(a.reponduLe ?? a.reserveLe) - new Date(b.reponduLe ?? b.reserveLe))[0];
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const prochainDepart = [...publiees]
    .filter(d => Number.isFinite(new Date(d.departPrevu).getTime()) && new Date(d.departPrevu) >= debutJour)
    .sort((a, b) => new Date(a.departPrevu) - new Date(b.departPrevu))[0];
  let focus;
  if (reservation) {
    focus = {
      titre: 'Une réservation à examiner',
      reference: reservation.reference,
      demande: demandes.find(d => d.id === reservation.demandeId),
      message: peutValider ? 'Cette réservation est acceptée. Examinez les conditions et les frais avant la validation.' : 'Cette réservation est acceptée. La validation revient au responsable de votre groupement.',
      action: 'Examiner la réservation', route: `validation/${reservation.id}`, icon: 'check-circle',
    };
  } else if (livres.length) {
    focus = {
      titre: 'Une livraison à vérifier',
      reference: livres[0].appariement?.reference,
      demande: demandes.find(d => d.id === livres[0].appariement?.demandeId),
      message: 'Le transporteur a déclaré la livraison. Vérifiez la réception des marchandises avant de clôturer le dossier.',
      action: 'Ouvrir le suivi', route: 'suivi', icon: 'check-circle',
    };
  } else if (prochainDepart) {
    focus = {
      titre: 'Votre prochain départ à organiser', reference: prochainDepart.reference, demande: prochainDepart,
      message: `Départ prévu le ${date(prochainDepart.departPrevu)}. Recherchez un véhicule adapté à ce fret.`,
      action: 'Trouver un véhicule', route: 'marche', icon: 'calendar',
    };
  } else if (publiees.length) {
    focus = {
      titre: 'Des demandes à actualiser', reference: publiees[0].reference, demande: publiees[0],
      message: 'Vérifiez les dates de vos demandes publiées avant de rechercher un véhicule.',
      action: 'Consulter mes demandes', route: 'demandes', icon: 'calendar',
    };
  } else {
    focus = {
      titre: 'Préparez votre prochain transport',
      message: 'Retrouvez les véhicules disponibles et organisez vos prochains départs.',
      action: peutCreer ? 'Déclarer un fret' : 'Explorer les véhicules',
      route: peutCreer ? 'declarations/nouvelle' : 'marche', icon: 'package',
    };
  }
  const declaration = focus.demande && parId.get(focus.demande.declarationId);
  return el('section.dash-panel.dash-next', {}, [
    el('div.dash-panel-head', {}, [el('div', {}, [el('h2', { text: 'Vos prochaines étapes' }), el('p.dash-next-intro', { text: 'Du rapprochement à la livraison, gardez le fil.' })]), icone('activity', 20)]),
    el('div.dash-next-list', {}, [
      [publiees.length, 'Demandes à rapprocher', 'Trouvez un véhicule pour vos frets publiés.', 'marche', 'search', 'blue'],
      [enAttente.length, 'Réponses à suivre', 'Consultez les réponses aux réservations en attente.', 'reservations', 'clock', 'orange'],
      [aValider.length, 'Mises en relation à valider', 'Examinez les réservations acceptées.', 'validation', 'check-circle', 'green'],
      [enCours.length, 'Transports en cours', 'Consultez les étapes déclarées par les transporteurs.', 'suivi', 'truck', 'blue'],
      [livres.length, 'Livraisons à clôturer', 'Vérifiez la réception avant de clôturer vos dossiers.', 'suivi', 'check', 'green'],
    ].map(([n, titre, sous, route, icon, ton]) => el('a.dash-next-row', { href: `#/${espace}/${route}` }, [
      el('span.dash-next-icon', { class: `dash-tone-${ton}` }, [icone(icon, 20)]),
      el('span.dash-next-label', {}, [el('strong', { text: titre }), el('small', { text: sous })]),
      el('span.dash-next-count', { text: n }), icone('chevron-right', 16),
    ]))),
    el('div.dash-next-focus', {}, [
      el('span.dash-next-eyebrow', {}, [icone(focus.icon, 16), 'VOTRE PROCHAINE ACTION']),
      el('h3', { text: focus.titre }),
      focus.reference ? el('span.dash-next-reference', { text: focus.reference }) : null,
      declaration ? el('p.dash-next-corridor', {}, [icone('map-pin', 16), `${refDe(declaration.provenanceId)} → ${refDe(declaration.destinationId)}`]) : null,
      el('p.dash-next-description', { text: focus.message }),
      el('a.btn.btn-secondary.dash-next-cta', { href: `#/${espace}/${focus.route}` }, [focus.action, icone('arrow-right', 16)]),
    ]),
  ]);
}

export function dashboard(ctx) {
  const espace = segmentEspace(ctx);
  const lien = (texte, route, classe = 'dash-link') => el(`a.${classe}`, { href: `#/${espace}/${route}` }, [texte, icone('arrow-right', 15)]);
  const declarations = mesDeclarations(ctx);
  const demandes = mesDemandes(ctx);
  const appariements = mesAppariements(ctx);
  const aValider = appariements.filter(a => a.etat === ETAT_APPARIEMENT.ACCEPTER);
  const enAttente = appariements.filter(a => a.etat === ETAT_APPARIEMENT.RESERVER);
  const publiees = demandes.filter(d => d.etat === ETAT_DEMANDE.PUBLIEE);
  const transports = transportsVisibles(ctx);
  const enRoute = transports.filter(t => t.etape === ETAPE_TRANSPORT.EN_ROUTE);
  const { solde, suffisant } = couverture(ctx.groupementId, tarifDe(CODE_TARIF.FRAIS_AFFRETEUR) ?? 0);
  const peutValider = decider(ctx, 'appariement.valider', { groupementId: ctx.groupementId }).autorise;
  const peutCreer = decider(ctx, 'declaration.creer', { groupementId: ctx.groupementId }).autorise;
  const parId = new Map(declarations.map(d => [d.id, d]));
  const derniere = demandes[0];
  const declaration = derniere && parId.get(derniere.declarationId);
  const routes = { publiee: ['Chercher un véhicule', 'marche'], reservee: ['Voir la réservation', 'reservations'], validee: ['Suivre le transport', 'suivi'] };
  const action = d => routes[d.etat] ? lien(...routes[d.etat]) : el('span', { text: '—' });

  const liste = el('div.dash-demand-list');
  const onglets = el('div.dash-filters', { role: 'group', 'aria-label': 'Filtrer mes demandes de transport' });
  const boutonsFiltres = [];
  const afficher = (filtre = '') => {
    const resultat = demandes.filter(d => !filtre || d.etat === filtre);
    remplacer(liste, tableau({
      colonnes: ['Référence / marchandise', 'Corridor', 'Départ prévu', 'État', ''],
      lignes: resultat.slice(0, 5).map(d => {
        const dec = parId.get(d.declarationId);
        return [el('div.dash-table-ref', {}, [el('strong', { text: d.reference }), el('small', { text: d.lignes?.map(l => refDe(l.produitId)).join(', ') || '—' })]), `${refDe(dec?.provenanceId)} → ${refDe(dec?.destinationId)}`, date(d.departPrevu), badge(d.etat, POV.AFFRETEUR), action(d)];
      }),
      vide: etatVide({ titre: 'Aucune demande dans cette sélection', message: 'Vos demandes de transport apparaîtront ici une fois publiées.' }),
    }));
    for (const button of boutonsFiltres) button.setAttribute('aria-pressed', String(button.dataset.etat === filtre));
  };
  for (const [etat, label] of [['', 'Toutes'], ['publiee', 'Publiées'], ['reservee', 'Réservées'], ['validee', 'Validées']]) {
    const button = el('button', { type: 'button', text: label, dataset: { etat }, 'aria-pressed': String(!etat), on: { click: () => afficher(etat) } });
    boutonsFiltres.push(button);
    onglets.append(button);
  }
  afficher();

  return el('div.page.aff-dashboard', {}, [
    el('header.dash-page-heading', {}, [
      el('div', {}, [el('span.dash-eyebrow', { text: 'ESPACE AFFRÉTEUR' }), el('h1', { text: 'Tableau de bord' }), el('p', { text: `Une vue d’ensemble de votre activité · ${nomDe(ctx, ctx.groupementId)}` })]),
      peutCreer ? el('a.btn.btn-primary', { href: `#/${espace}/declarations/nouvelle` }, [icone('plus', 17), 'Déclarer un fret']) : null,
    ]),
    aValider.length ? el('section.dash-validation-notice', { 'aria-label':'Validations en attente' }, [
      el('div.dash-validation-count', {}, [icone('handshake', 21), el('strong', {text:aValider.length})]),
      el('div.dash-validation-copy', {}, [
        el('h2', {text:peutValider ? (aValider.length === 1 ? 'Une réservation attend votre validation' : 'Des réservations attendent votre validation') : 'En attente de validation par votre responsable'}),
        el('p', {text:peutValider ? 'Le transporteur a accepté. Votre validation déclenche les frais des deux parties et le partage de ses coordonnées.' : 'Le transporteur a accepté. Seul le responsable peut valider la mise en relation et engager les frais.'}),
      ]),
      el('a.btn.dash-validation-action', {href:`#/${espace}/validation`}, ['Examiner', icone('arrow-right',16)]),
    ]) : null,
    el('section.dash-welcome', {}, [
      el('div.dash-welcome-copy', {}, [el('span.dash-eyebrow', { text: 'LE BON FRET. LE BON TRANSPORTEUR.' }), el('h2', {}, ['Votre prochain transport', el('br'), 'commence ici.']), el('p', { text: 'Publiez votre fret, trouvez le bon véhicule et avancez avec vos partenaires.' }), lien('Trouver un véhicule', 'marche')]),
      el('img', { src: 'assets/connexion-fret.png', alt: '', width: 1536, height: 1024 }),
    ]),
    el('div.kpi-grid.dash-kpis', {}, [
      ...[
        ['Déclarations actives', declarations.filter(d => d.etat === 'active').length, 'package', 'declarations', declarations.map(d => d.creeeLe), 'Créations'],
        ['Demandes publiées', publiees.length, 'published', 'demandes', demandes.map(d => d.publieeLe), 'Publications'],
        ['Réservations en cours', enAttente.length, 'reservation', 'reservations', appariements.map(a => a.reserveLe), 'Réservations créées'],
        ['Transports en route', enRoute.length, 'truck', 'suivi', transports.flatMap(t => (t.journal ?? []).filter(e => e.type === 'etape' && e.valeur === ETAPE_TRANSPORT.EN_ROUTE).map(e => e.horodatage)), 'Départs en route'],
      ].map(([libelle, valeur, icon, route, dates, activite]) => indicateurCourbe({ libelle, valeur, icon, href: `#/${espace}/${route}`, dates, activite })),
    ]),
    analysesDemandes(demandes),
    el('div.dash-workspace', {}, [
      el('div.dash-main-column', {}, [
        el('section.dash-panel.dash-freight', {}, [
          el('div.dash-panel-head', {}, [el('div', {}, [el('span.dash-eyebrow', { text: 'VOTRE DERNIÈRE DEMANDE' }), el('h2', { text: derniere?.reference ?? 'Préparez votre premier fret' })]), derniere ? badge(derniere.etat, POV.AFFRETEUR) : icone('package', 22)]),
          derniere ? el('div', {}, [
            el('h3.dash-freight-title', { text: declaration?.libelle ?? 'Demande de transport' }),
            el('div.dash-route', {}, [el('div', {}, [el('small', { text: 'DÉPART' }), el('strong', { text: refDe(declaration?.provenanceId) })]), el('span.dash-route-line', {}, [icone('truck', 20)]), el('div', {}, [el('small', { text: 'ARRIVÉE' }), el('strong', { text: refDe(declaration?.destinationId) })])]),
            el('div.dash-freight-facts', {}, [
              el('div', {}, [icone('package', 17), el('span', {}, [el('small', { text: 'Marchandise' }), el('strong', { text: derniere.lignes?.map(l => refDe(l.produitId)).join(', ') || '—' })])]),
              el('div', {}, [icone('calendar', 17), el('span', {}, [el('small', { text: 'Départ prévu' }), el('strong', { text: date(derniere.departPrevu) })])]),
            ]),
            el('div.dash-freight-bottom', {}, [el('span', { text: 'Retrouvez les véhicules adaptés à votre besoin.' }), action(derniere)]),
          ]) : etatVide({ titre: 'Votre activité commence ici', message: 'Déclarez vos marchandises et publiez votre besoin de transport.' }),
        ]),
        prochainesEtapes({ espace, publiees, enAttente, aValider, transports, demandes, parId, peutCreer, peutValider }),
      ]),
      el('div.dash-side-column', {}, [
        carteCorridors(declarations),
        el('section.dash-panel.dash-balance', {}, [
          el('span.indicator-watermark', {'aria-hidden':'true'}, [icone('wallet',104)]),
          el('div.dash-panel-head', {}, [el('h2', { text: 'Solde du compte' }), icone('wallet', 20)]),
          el('strong.dash-balance-value', { text: montant(solde) }),
          el('p', { class: suffisant ? 'dash-balance-ok' : 'dash-balance-low' }, [icone(suffisant ? 'check-circle' : 'alert', 14), suffisant ? 'Suffisant pour une validation' : 'Insuffisant pour une validation']),
          lien('Voir les mouvements', 'compte'),
        ]),
      ]),
    ]),
    carte({ titre: 'Mes demandes de transport', sousTitre: 'Les cinq plus récentes de la sélection', actions: [lien('Tout voir', 'demandes')], corps: [onglets, liste] }),
  ]);
}
