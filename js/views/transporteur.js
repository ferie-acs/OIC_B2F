/**
 * Écrans de l'espace Transporteur — et de ses déclinaisons de niveau 2
 * (transporteur privé, étranger, partenaire), qui l'empruntent.
 *
 * Les variations sont **déclaratives** : elles viennent de la matrice des droits
 * et de `CHAMPS_REQUIS_PAR_ROLE`, jamais d'un `if (role === ...)` dans un écran.
 *
 * @module views/transporteur
 */

import { camion, libelleTrajet } from '../core/camion.js';
import { vueFlotte } from './flotte.js';
import { carteFretsDashboard } from './carte-frets-dashboard.js?v=20261009-carte-2';
import { retourPublic } from '../services/marche-public.service.js';
import { ouvrirVehicule } from './flotte-formulaires.js?v=20261009-carte-2';
/* Lot b3 : chauffeurs (fiche complète, retrait), offres (modification, copie) */
import { vueChauffeurs } from './chauffeurs-transporteur.js';
import { modifiabilite, modifierOffre, offrePourFormulaire } from '../services/offre-gestion.service.js';
import { motifInaptitude } from '../domain/chauffeur.regles.js';
import { MOTIFS_REJET_PAR_PARTIE } from '../domain/enums.js';
import { date, dateHeure, el, icone, montant } from '../core/dom.js';
import {
  afficherErreur,
  badge,
  bandeau,
  bouton,
  carte,
  champ,
  etatVide,
  fermerModale,
  kpi,
  modale,
  tableau,
  toast,
} from '../core/ui.js';
import { aller } from '../core/router.js';
import { localiser } from '../core/nav.js';
import { POV, CODE_TARIF, ETAT_APPARIEMENT, SENS_APPARIEMENT, MOTIF_REJET, labelOf } from '../domain/enums.js';
import { ACTION } from '../domain/matching.state.js';
import { decider, deciderSurAppariement } from '../domain/access.js';
import {
  compter,
  immatriculationDe,
  lire as lireProjete,
  nomDe,
  nomUtilisateur,
  projeterOu,
  refDe,
  tarifDe,
} from './_donnees.js';
import { depot } from '../repositories/index.js';
import { couverture, soldeDe } from '../services/compte.service.js';
import * as flotte from '../services/flotte.service.js';
import * as fret from '../services/fret.service.js';
import * as matching from '../services/matching.service.js';
import { transportsVisibles } from '../services/transport.service.js';
import { echeanceDe } from '../domain/matching.state.js';
import { etatVerification } from '../services/verification.service.js';
import { blocConfiance } from './confiance.js';

/* ================================================================== *
 * Tableau de bord
 * ================================================================== */

/** @param {any} ctx */
export function dashboard(ctx) {
  const aRepondre = matching.mesAppariements(ctx, (a) => a.etat === ETAT_APPARIEMENT.RESERVER && a.sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE);
  const vehicules = flotte.mesVehicules(ctx);
  const chauffeurs = flotte.mesChauffeurs(ctx);
  const suivis = transportsVisibles(ctx).filter(t => !['livre', 'cloture'].includes(t.etape));
  const droit = nom => decider(ctx, nom, { groupementId: ctx.groupementId });
  const commande = (libelle, permission, onClick, icon = 'plus', variante = 'secondary') => bouton({ libelle, icone: icon, variante, motif: droit(permission).autorise ? null : droit(permission).explication, onClick });
  const offres = flotte.mesOffres(ctx);
  const frais = tarifDe(CODE_TARIF.FRAIS_TRANSPORTEUR) ?? 0;
  const { solde, suffisant } = couverture(ctx.groupementId, frais);
  const validees = matching.mesAppariements(ctx, (a) => a.etat === ETAT_APPARIEMENT.VALIDER);
  const repondus = matching.mesAppariements(ctx, (a) =>
    a.sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE && [ETAT_APPARIEMENT.ACCEPTER, ETAT_APPARIEMENT.REJETER, ETAT_APPARIEMENT.VALIDER].includes(a.etat),
  );
  const acceptes = repondus.filter((a) => a.etat !== ETAT_APPARIEMENT.REJETER).length;

  return el('div.page.transport-dashboard', {}, [
    el('header.dash-page-heading', {}, [
      el('div', {}, [el('span.dash-eyebrow', { text: 'ESPACE TRANSPORTEUR' }), el('h1', { text: 'Tableau de bord' }), el('p', { text: `Gérez votre flotte et préparez vos prochains transports · ${nomDe(ctx, ctx.groupementId)}` })]),
    ]),
    el('div.transport-dashboard-actions', { 'aria-label': 'Actions rapides du transporteur' }, [
      commande('Ajouter un camion', 'vehicule.gerer', () => ouvrirVehicule(ctx), 'plus', 'primary'),
    ]),
    el('section.transport-workflow', { 'aria-label': 'Votre parcours de transport' }, [
      ['01', 'Préparer ma flotte', `${vehicules.length} véhicule(s) · ${chauffeurs.length} chauffeur(s)`, 'vehicules', 'truck'],
      ['02', 'Mes disponibilités', 'Annoncez un corridor et une période.', 'offres', 'calendar'],
      ['03', 'Trouver du fret', 'Proposez un véhicule sur une demande.', 'marche', 'package'],
      ['04', 'Réservations et propositions', 'Suivez les réponses des deux parties.', 'reservations', 'handshake'],
      ['05', 'Suivre les transports', `${suivis.length} transport(s) en cours`, 'suivi', 'map-pin'],
    ].map(([n, titre, texte, route, icon]) => el('a.transport-workflow-step', { href: `#/transporteur/${route}` }, [
      el('span.transport-workflow-number', { text: n }), icone(icon, 23), el('strong', { text: titre }), el('small', { text: texte }),
    ]))),
    // Correctif anti-fraude n° 3 : un dossier non vérifié bloque tout engagement.
    etatVerification(ctx.groupementId) !== 'verifie'
      ? bandeau({
          ton: etatVerification(ctx.groupementId) === 'refuse' ? 'err' : 'warn',
          titre: etatVerification(ctx.groupementId) === 'refuse' ? 'Vérification de votre dossier refusée' : 'Dossier transporteur en attente de vérification',
          message:
            'Tant que l’agent d’activation n’a pas contrôlé vos pièces (RCCM, carte de ' +
            'transporteur, assurance, cartes grises, permis), vous ne pouvez ni publier, ni ' +
            'proposer, ni accepter un transport.',
          // La fiche du groupement n'est pas ouverte à tous les rôles de l'espace
          // (auxiliaire) : le bouton n'apparaît que si la page existe pour ce rôle.
          actions: localiser(ctx, 'groupement') ? [bouton({ libelle: 'Voir mon dossier', onClick: () => aller('#/transporteur/groupement') })] : [],
        })
      : null,
    aRepondre.length > 0
      ? bandeau({
          ton: 'warn',
          titre: `${aRepondre.length} réservation(s) à examiner`,
          message:
            'Une réservation sans réponse bloque l’affréteur : il ne peut pas valider ' +
            'tant que vous n’avez pas accepté.',
          actions: [
            bouton({
              libelle: droit('appariement.repondre').autorise ? 'Répondre' : 'Consulter',
              variante: 'primary',
              onClick: () => aller('#/transporteur/reservations'),
            }),
          ],
        })
      : null,

    suffisant
      ? null
      : bandeau({
          ton: 'err',
          titre: 'Votre solde ne couvre pas les frais de mise en relation',
          message:
            `Les frais s’élèvent à ${montant(frais)} et votre compte affiche ` +
            `${montant(solde)}. Une validation d’affréteur échouera tant que votre ` +
            'compte n’est pas provisionné. Faites-le créditer par le concessionnaire.',
        }),

    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Véhicules au parc', valeur: flotte.mesVehicules(ctx).length }),
      kpi({ libelle: 'Offres publiées', valeur: offres.filter((o) => o.etat === 'disponible').length }),
      kpi({ libelle: 'À répondre', valeur: aRepondre.length, ton: aRepondre.length ? 'warn' : undefined }),
      kpi({ libelle: 'Mises en relation validées', valeur: validees.length }),
      kpi({
        libelle: "Taux d'acceptation",
        valeur: repondus.length ? `${Math.round((acceptes / repondus.length) * 100)} %` : '—',
      }),
      kpi({
        libelle: 'Solde du compte',
        valeur: montant(solde),
        ton: suffisant ? 'ok' : 'err',
        note: suffisant ? 'Suffisant' : 'Insuffisant',
      }),
    ]),

    carte({
      titre: 'Frets disponibles sur le marché',
      actions: [bouton({ libelle: 'Trouver du fret', icone: 'search', onClick: () => aller('#/transporteur/marche') })],
      corps: [
        el('div.dashboard-freight-launch', {}, [
          icone('package',48),
          el('div', {}, [el('strong',{text:`${fret.marcheDesDemandes(ctx).length} frets à découvrir`}),el('p',{text:'Explorez les départs et les trajets sur la carte, puis choisissez un fret.'})]),
          bouton({libelle:'Voir les frets sur la carte',icone:'map-pin',variante:'primary',onClick:()=>{
            const vue = carteFretsDashboard(fret.marcheDesDemandes(ctx));
            const fermer = modale({titre:'Frets disponibles sur le marché',corps:[el('div.dashboard-freight-modal',{},[vue.element])],surFermeture:()=>{vue.destroy();window.removeEventListener('hashchange',fermer);}});
            window.addEventListener('hashchange',fermer,{once:true});
          }}),
        ]),
      ],
    }),
  ]);
}

/* ================================================================== *
 * Véhicules
 * ================================================================== */

/** @param {any} ctx */
export function vehicules(ctx, params = {}) {
  return vueFlotte(ctx, params);
}

/** @param {any} ctx */
export function chauffeurs(ctx) {
  // Lot b3 : fiche complète, alertes de contrôle, retrait et réactivation.
  return vueChauffeurs(ctx);
}

/* ================================================================== *
 * Offres
 * ================================================================== */

/** @param {any} ctx */
export function offres(ctx) {
  const liste = flotte.mesOffres(ctx);
  return el('div.page', {}, [
    carte({
      titre: 'Mes disponibilités',
      actions: [
        decider(ctx, 'offre.publier').autorise
          ? bouton({
              libelle: 'Publier une disponibilité',
              variante: 'primary',
              icone: 'plus',
              onClick: () => aller('#/transporteur/offres/nouvelle'),
            })
          : bouton({
              libelle: 'Publier une disponibilité',
              motif:
                'Votre rôle ne publie pas d’offre sur le marché public. Vous répondez ' +
                'aux demandes publiées par les affréteurs.',
            }),
      ],
      corps: [
        el('div.carrier-card-grid',{},liste.length ? liste.map(o=>el('article.carrier-offer-card',{},[
          el('div.carrier-card-top',{},[el('strong',{text:o.reference}),badge(o.etat,POV.TRANSPORTEUR)]),
          el('div.carrier-vehicle',{},[camion(o,100),el('div',{},[el('h3',{text:immatriculationDe(ctx, o.vehiculeId)}),el('span',{text:libelleTrajet(o)})])]),
          el('div.carrier-route',{},[el('div',{},[el('small',{text:'DÉPART'}),el('strong',{text:refDe(o.localiteDepartId)})]),icone('arrow-right',22),el('div',{},[el('small',{text:'ARRIVÉE'}),el('strong',{text:refDe(o.localiteArriveeId)})])]),
          el('p.carrier-dates',{},[icone('calendar',18),`${date(o.disponibleDu)} → ${date(o.disponibleAu)}`]),
          el('div.carrier-card-footer',{},[el('span',{text:o.prixKmT ? `${o.prixKmT} F/km·t · indicatif` : 'Tarif à convenir'}),bouton({libelle:'Retirer',variante:'ghost',motif:!decider(ctx,'offre.retirer',{groupementId:o.groupementId}).autorise?decider(ctx,'offre.retirer',{groupementId:o.groupementId}).explication:!['disponible','reservee'].includes(o.etat)?'Cette offre n’est plus disponible.':o.retirable?null:o.motif,onClick:()=>dialogueRetrait(ctx,o)})]),
          // Lot b3 : modifier une offre disponible ; la « partager », c'est en publier une copie ajustée.
          actionsOffre(ctx, o),
        ])) : [etatVide({titre:'Aucune offre publiée',message:'Publiez des offres sur les corridors que vous desservez pour être trouvé par les affréteurs.'})]),
      ],
    }),
  ]);
}

/** Lot b3 : boutons Modifier et Dupliquer d'une carte d'offre. */
function actionsOffre(ctx, o) {
  const droit = decider(ctx, 'offre.publier', { groupementId: o.groupementId });
  const { modifiable, motif } = modifiabilite(o);
  return el('div.offre-actions', {}, [
    bouton({ libelle: 'Modifier', icone: 'pencil', variante: 'secondary', motif: !droit.autorise ? droit.explication : modifiable ? null : motif, onClick: () => aller(`#/transporteur/offres/nouvelle?modifier=${encodeURIComponent(o.id)}`) }),
    bouton({ libelle: 'Dupliquer', icone: 'copy', variante: 'ghost', motif: droit.autorise ? null : droit.explication, onClick: () => aller(`#/transporteur/offres/nouvelle?dupliquer=${encodeURIComponent(o.id)}`) }),
  ]);
}

function dialogueRetrait(ctx, offre) {
  const fermer = modale({
    titre: 'Retirer cette disponibilité',
    corps: [el('p', { text: offre.avertissement || 'Cette disponibilité ne sera plus visible sur le marché. Votre véhicule restera dans votre parc.' })],
    actions: [
      bouton({ libelle: 'Conserver', onClick: () => fermer() }),
      bouton({ libelle: 'Retirer du marché', variante: 'primary', onClick: () => {
        try {
          flotte.retirerOffre(ctx, offre.id);
          fermer();
          toast('Disponibilité retirée du marché.');
          globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (e) { afficherErreur(e); }
      } }),
    ],
  });
}

/** @param {any} ctx */
export function nouvelleOffre(ctx, params = {}) {
  // Lot b3 : le même formulaire sert à modifier une offre et à en publier une copie.
  const sourceId = params.modifier || params.dupliquer || null;
  const source = sourceId ? offrePourFormulaire(ctx, sourceId) : null;
  const enModification = Boolean(params.modifier);
  if (enModification && !source.modifiable) {
    return el('div.page', {}, [etatVide({
      titre: 'Cette offre ne peut plus être modifiée',
      message: source.motif,
      action: { libelle: 'Revenir à mes disponibilités', onClick: () => aller('#/transporteur/offres') },
    })]);
  }
  const retour = params.retour ? flotte.preparerRetour(ctx, params.retour) : null;
  const demande = params.demande ? fret.marcheDesDemandes(ctx).find(d => d.id === params.demande) : null;
  const optionsDe = famille => depot('referentiel').brutOu(r => r.famille === famille && r.actif).map(r => ({ valeur: r.id, libelle: r.libelle }));
  const vehicules = flotte.mesVehicules(ctx);
  const publiables = vehicules.filter(v => v.publiable);
  const essieuxDe = id => depot('referentiel').brutParId(id)?.code;
  const cible = { groupementId: ctx.groupementId };
  if (!publiables.length) {
    return el('div.page', {}, [etatVide({
      titre: vehicules.length ? 'Aucun véhicule disponible pour publication' : 'Ajoutez votre premier véhicule',
      message: vehicules.length ? 'Consultez le parc : renouvelez les pièces échues ou attendez la fin des transports en cours.' : 'Enregistrez votre camion avant de publier sa disponibilité.',
      action: { libelle: vehicules.length ? 'Gérer mes véhicules' : 'Ajouter un véhicule', onClick: () => vehicules.length ? aller('#/transporteur/vehicules') : ouvrirVehicule(ctx) },
    })]);
  }
  const formulaire = el('form.transport-offer-form');
  const erreur = el('div', { role: 'alert', hidden: true });
  const champOffre = (id, label, options = {}) => champ({ id: `o-${id}`, label, ...options, attrs: { name: id, ...options.attrs } });
  const decision = decider(ctx, 'offre.publier', cible);
  formulaire.append(
    el('section.carrier-form-section', {}, [el('h3', {}, [icone('truck',26), 'Véhicule et chauffeur']),el('div.field-row', {}, [
champOffre('vehicule', 'Véhicule', { requis: true, valeur: retour?.vehiculeId ?? source?.vehiculeId ?? params.vehicule, options: publiables.map(v => ({ valeur: v.id, libelle: `${v.immatriculation} — ${v.capaciteT} t` })), aide: 'Véhicules disponibles avec une carte de transport valide.' }),
champOffre('chauffeur', 'Chauffeur pressenti', { valeur: source?.chauffeurPressentiId, options: flotte.mesChauffeurs(ctx).filter(c => c.actif !== false && !motifInaptitude(c)).map(c => ({ valeur: c.id, libelle: c.nom + ((c.permisCategories ?? []).length ? ` · permis ${c.permisCategories.join(', ')}` : '') })), aide: 'Facultatif. Seuls les chauffeurs en activité, au permis et à la pièce valides, sont proposés ; la catégorie du permis est contrôlée selon le véhicule.' }),
    ])]),
    el('section.carrier-form-section', {}, [el('h3', {}, [icone('map-pin',26), 'Trajet proposé']),el('div.field-row', {}, [
champOffre('depart', 'Localité de départ', { requis: true, valeur: retour?.localiteDepartId ?? demande?.provenanceId ?? source?.localiteDepartId, options: optionsDe('localites') }),
champOffre('arrivee', 'Localité d’arrivée', { requis: true, valeur: demande?.destinationId ?? source?.localiteArriveeId, options: optionsDe('localites') }),
champOffre('sens', 'Sens du trajet', { valeur: retour || source?.trajetRetour ? 'retour' : 'depart', options: [{ valeur: 'depart', libelle: 'Départ' }, { valeur: 'retour', libelle: 'Retour' }] }),
champOffre('vide', 'Trajet à vide', { valeur: source?.trajetVide ? 'oui' : 'non', options: [{ valeur: 'non', libelle: 'Non' }, { valeur: 'oui', libelle: 'Oui' }] }),
    ])]),
    el('section.carrier-form-section', {}, [el('h3', {}, [icone('calendar',26), 'Disponibilité et tarif']),el('div.field-row', {}, [
champOffre('du', 'Disponible du', { requis: true, type: 'date', valeur: demande?.departPrevu?.slice(0, 10) ?? (enModification ? source?.disponibleDu?.slice(0, 10) : undefined) }),
champOffre('au', 'Disponible au', { requis: true, type: 'date', valeur: demande?.arriveePrevue?.slice(0, 10) ?? demande?.departPrevu?.slice(0, 10) ?? (enModification ? source?.disponibleAu?.slice(0, 10) : undefined) }),
champOffre('prix', 'Prix indicatif (F CFA / km·tonne)', { type: 'number', valeur: source?.prixKmT, attrs: { min: 0, step: 'any' }, aide: 'Facultatif, sans effet sur les frais de mise en relation.' }),
    ])]),
    erreur,
    el('div.transport-form-actions', {}, [
      bouton({ libelle: 'Annuler', onClick: () => aller(demande ? `#/transporteur/marche?selection=${encodeURIComponent(demande.id)}` : '#/transporteur/offres') }),
      bouton({ libelle: enModification ? 'Enregistrer les modifications' : demande ? 'Publier et revenir au fret' : source ? 'Publier la copie' : 'Publier la disponibilité', icone: 'check', type: 'submit', variante: 'primary', motif: decision.autorise ? null : decision.explication }),
    ]),
  );
  formulaire.addEventListener('submit', e => {
    e.preventDefault();
    if (!decision.autorise || !formulaire.reportValidity()) return;
    const valeurs = Object.fromEntries(new FormData(formulaire));
    try {
      const saisie = {
        trajetRetour: valeurs.sens === 'retour', trajetVide: valeurs.vide === 'oui',
        vehiculeId: valeurs.vehicule, chauffeurPressentiId: valeurs.chauffeur || undefined,
        localiteDepartId: valeurs.depart, localiteArriveeId: valeurs.arrivee,
        disponibleDu: valeurs.du, disponibleAu: valeurs.au,
        prixKmT: valeurs.prix ? Number(valeurs.prix) : undefined,
      };
      // Lot b3 : modification, ou copie rattachée à l'offre d'origine.
      if (enModification) {
        const maj = modifierOffre(ctx, source.id, saisie);
        toast(`Offre ${maj.reference} modifiée.`);
        aller('#/transporteur/offres');
        return;
      }
      const offre = flotte.publierOffre(ctx, { ...saisie, dupliqueeDeOffreId: params.dupliquer || undefined });
      toast(`Offre ${offre.reference} publiée.${demande ? ' Vous pouvez maintenant proposer ce véhicule au fret sélectionné.' : ''}`);
      aller(demande ? `#/transporteur/marche?selection=${encodeURIComponent(demande.id)}` : '#/transporteur/offres');
    } catch (e) {
      erreur.hidden = false;
      erreur.replaceChildren(bandeau({ ton: 'err', message: e.message }));
    }
  });
  return el('div.page', {}, [
    retour ? bandeau({ ton: 'info', titre: 'Préparer le prochain départ', message: 'Le véhicule et la ville de livraison sont repris. Confirmez la destination et les dates avant publication.' }) : null,
    demande ? bandeau({ ton: 'info', titre: `Disponibilité pour ${demande.reference}`, message: 'Le corridor et les dates du fret sont repris. Après publication, vous reviendrez à ce fret pour envoyer votre proposition.' }) : null,
    enModification ? bandeau({ ton: 'info', titre: `Modifier ${source.reference}`, message: 'L’offre reste au marché sous la même référence. La modification est inscrite au journal.' }) : null,
    params.dupliquer && source ? bandeau({ ton: 'info', titre: `Copie de ${source.reference}`, message: 'Le véhicule, le trajet et le tarif sont repris. Ajustez le trajet et les dates : la copie sera publiée comme une nouvelle disponibilité, l’offre d’origine reste inchangée.' }) : null,
    carte({ titre: enModification ? 'Modifier la disponibilité' : params.dupliquer ? 'Dupliquer une disponibilité' : 'Publier une disponibilité', sousTitre: 'Renseignez votre véhicule, son trajet et sa période de disponibilité.', corps: [formulaire] }),
  ]);
}

/* ================================================================== *
 * Marché — demandes publiées (second sens du flux)
 * ================================================================== */

/** @param {any} ctx */
export function marche(ctx, params = {}) {
  const liste = fret.marcheDesDemandes(ctx).filter(d => !params.selection || d.id === params.selection);
  return el('div.page', {}, [
    params.selection ? el('div.selection-notice', {}, [
      el('strong', { text: 'Votre fret sélectionné' }),
      el('a', { href: retourPublic(params.retour ?? '#/explorer?type=frets'), text: '← Revenir à la carte' }),
      el('a', { href: '#/transporteur/marche', text: 'Voir tout le marché' }),
    ]) : null,
    carte({
      titre: 'Demandes de transport publiées',
      sousTitre: 'Choisissez un fret et proposez une disponibilité compatible.',
      corps: [
        carteFretsDashboard(liste, {action:d=>bouton({libelle:'Proposer un véhicule',icone:'truck',variante:'primary',motif:decider(ctx,'appariement.proposer',{groupementId:ctx.groupementId}).explication||null,onClick:()=>dialogueProposition(ctx,d)})}).element,
      ],
    }),
  ]);
}

function dialogueProposition(ctx, demande) {
  const vehicules = new Map(flotte.mesVehicules(ctx).map(v => [v.id, v]));
  const poids = (demande.lignes ?? []).reduce((n, ligne) => n + ligne.poidsT, 0);
  const publiables = flotte.mesOffres(ctx).filter(o => {
    const v = vehicules.get(o.vehiculeId);
    return o.etat === 'disponible' && v?.publiable && matching.fenetresSeRecouvrent(o, demande)
      && o.localiteDepartId === demande.provenanceId && o.localiteArriveeId === demande.destinationId
      && (!demande.carrosserieId || v.carrosserieId === demande.carrosserieId) && v.capaciteT >= poids;
  });

  if (publiables.length === 0) {
    modale({
      titre: 'Aucune offre compatible',
      corps: [
        el('p', {
          text:
            'Aucune disponibilité ne correspond au trajet, à la date, à la carrosserie et au poids de ce fret. ' +
            'Préparez une disponibilité adaptée, puis revenez envoyer votre proposition.',
        }),
      ],
      actions: [
        bouton({
          libelle: 'Préparer une disponibilité',
          variante: 'primary',
          motif: decider(ctx, 'offre.publier', { groupementId: ctx.groupementId }).explication || null,
          onClick: () => { fermerModale(); aller(`#/transporteur/offres/nouvelle?demande=${encodeURIComponent(demande.id)}`); },
        }),
      ],
    });
    return;
  }

  const fermer = modale({
    titre: 'Proposer un véhicule',
    corps: [
      bandeau({ ton: 'info', message: 'La proposition est gratuite. Rien n’est débité à cette étape.' }),
      champ({
        id: 'p-offre',
        label: 'Offre à proposer',
        requis: true,
        options: publiables.map((o) => ({ valeur: o.id, libelle: `${immatriculationDe(ctx, o.vehiculeId)} · ${o.reference} · ${date(o.disponibleDu)}` })),
      }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Proposer',
        variante: 'primary',
        onClick: () => {
          const offreId = document.getElementById('p-offre')?.value;
          try {
            matching.engager(ctx, {
              offreId,
              demandeId: demande.id,
              sens: 'demande_vers_offre',
            });
            fermer();
            toast('Proposition transmise à l’affréteur.');
            aller('#/transporteur/reservations');
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

/* ================================================================== *
 * Réservations reçues et propositions envoyées
 * ================================================================== */

/** @param {any} ctx */
export function reservations(ctx) {
  const liste = matching.mesAppariements(ctx);

  const frais = tarifDe(CODE_TARIF.FRAIS_TRANSPORTEUR) ?? 0;

  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      message:
        `Accepter n’engage pas encore vos finances. Les frais (${montant(frais)}) sont ` +
        'débités à la validation de l’affréteur. Vérifiez néanmoins votre solde : une ' +
        'validation refusée pour solde insuffisant de votre côté bloque la mise en relation.',
    }),
    carte({
      titre: 'Réservations et propositions',
      corps: [
        tableau({
          colonnes: ['Référence', 'Affréteur', 'Origine', 'Créée le', 'État', 'Suite du dossier'],
          lignes: liste.map((a) => [
            a.reference,
            el('span', {}, [
              nomDe(ctx, a.groupementAffreteurId),
              a.etat !== ETAT_APPARIEMENT.VALIDER ? blocConfiance(a.groupementAffreteurId, { compact: true }) : null,
            ]),
            a.sens === SENS_APPARIEMENT.DEMANDE_VERS_OFFRE ? 'Proposition envoyée' : 'Réservation reçue',
            dateHeure(a.reserveLe),
            el('span', {}, [
              badge(a.etat, POV.TRANSPORTEUR),
              a.motifRejet ? el('small', { text: ` ${labelOf(a.motifRejet)}` }) : null,
              a.motifCloture ? el('small', { text: ` ${labelOf(a.motifCloture)}` }) : null,
              // Correctif anti-fraude n° 4 : l'attente a une fin.
              echeanceDe(a) ? el('small', { text: ` · échéance ${dateHeure(echeanceDe(a))}` }) : null,
            ]),
            suiteDossier(ctx, a, frais),
          ]),
          vide: etatVide({
            titre: 'Aucune réservation ni proposition',
            message: 'Consultez les frets disponibles pour préparer votre prochain transport.',
            action: { libelle: 'Trouver du fret', onClick: () => aller('#/transporteur/marche') },
          }),
        }),
      ],
    }),
  ]);
}

function suiteDossier(ctx, a, frais) {
  if (a.etat === ETAT_APPARIEMENT.VALIDER) return el('div.table-toolbar', {}, [
    el('a.link', { href: `#/transporteur/relations/${a.id}`, text: 'Coordonnées' }),
    el('a.link', { href: '#/transporteur/suivi', text: 'Suivre le transport' }),
  ]);
  if (![ETAT_APPARIEMENT.RESERVER, ETAT_APPARIEMENT.ACCEPTER].includes(a.etat)) return el('span', { text: 'Dossier terminé' });
  if (a.etat === ETAT_APPARIEMENT.RESERVER && a.sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE) return actionsReponse(ctx, a, frais);
  const peutAnnuler = deciderSurAppariement(ctx, ACTION.ANNULER, a);
  return el('div', {}, [
    el('p', { text: a.etat === ETAT_APPARIEMENT.ACCEPTER ? 'En attente de validation par l’affréteur.' : 'En attente de la réponse de l’affréteur.' }),
    bouton({ libelle: 'Annuler', variante: 'ghost', motif: peutAnnuler.autorise ? null : peutAnnuler.explication, onClick: () => {
      const fermer = modale({
        titre: 'Annuler ce rapprochement',
        corps: [el('p', { text: 'Le fret et le camion redeviendront disponibles. Aucun frais de mise en relation ne sera débité.' })],
        actions: [
          bouton({ libelle: 'Conserver', onClick: () => fermer() }),
          bouton({ libelle: 'Confirmer l’annulation', variante: 'primary', onClick: () => {
            try {
              matching.annuler(ctx, a.id);
              fermer();
              toast('Rapprochement annulé.');
              globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
            } catch (e) { afficherErreur(e); }
          } }),
        ],
      });
    } }),
  ]);
}

function actionsReponse(ctx, a, frais) {
  const peut = deciderSurAppariement(ctx, ACTION.ACCEPTER, a);
  return el('div.table-toolbar', {}, [
    bouton({
      libelle: 'Accepter',
      variante: 'primary',
      motif: peut.autorise ? null : peut.explication,
      onClick: () => dialogueAcceptation(ctx, a, frais),
    }),
    bouton({
      libelle: 'Rejeter',
      variante: 'ghost',
      motif: peut.autorise ? null : peut.explication,
      onClick: () => dialogueRejet(ctx, a),
    }),
  ]);
}

function dialogueAcceptation(ctx, a, frais) {
  const solde = soldeDe(ctx.groupementId);
  const fermer = modale({
    titre: 'Accepter cette réservation',
    corps: [
      el('p', {
        text:
          'En acceptant, vous vous engagez : l’offre ne pourra plus être retirée tant ' +
          'que l’affréteur n’a pas validé ou annulé.',
      }),
      el('div.recap-grid', {}, [
        el('div.recap-item', {}, [el('span', { text: 'Votre solde' }), el('strong', { text: montant(solde) })]),
        el('div.recap-item', {}, [el('span', { text: 'Frais à venir' }), el('strong', { text: montant(frais) })]),
      ]),
      solde < frais
        ? bandeau({
            ton: 'warn',
            message:
              'Votre solde ne couvre pas les frais. Vous pouvez accepter, mais la ' +
              'validation de l’affréteur échouera tant que votre compte n’est pas crédité.',
          })
        : null,
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Accepter',
        variante: 'primary',
        onClick: () => {
          try {
            matching.repondre(ctx, a.id, { accepte: true });
            fermer();
            toast('Réservation acceptée. L’affréteur peut maintenant valider.');
            globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

function dialogueRejet(ctx, a) {
  const fermer = modale({
    titre: 'Rejeter cette réservation',
    corps: [
      el('p', { text: 'Le motif est transmis à l’affréteur : il lui permet de chercher ailleurs.' }),
      champ({
        id: 'j-motif',
        label: 'Motif',
        requis: true,
        options: MOTIFS_REJET_PAR_PARTIE.transporteur.map((m) => ({ valeur: m, libelle: labelOf(m) })),
      }),
      champ({ id: 'j-precision', label: 'Précision', type: 'textarea' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Rejeter',
        variante: 'primary',
        onClick: () => {
          const motif = document.getElementById('j-motif')?.value;
          if (!motif) {
            toast('Le motif est obligatoire.', 'err');
            return;
          }
          try {
            matching.repondre(ctx, a.id, {
              accepte: false,
              motif,
              precision: document.getElementById('j-precision')?.value || undefined,
            });
            fermer();
            toast('Réservation rejetée. Le véhicule redevient disponible.');
            globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}
