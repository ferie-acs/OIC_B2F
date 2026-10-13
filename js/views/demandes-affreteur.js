/**
 * Affréteur — demandes de transport : liste, modification, republication (lot b3).
 *
 * La liste reprend l'écran existant (carte et tableau) et y ajoute deux gestes :
 * **Modifier** tant qu'aucune réservation n'est engagée, **Republier** une
 * demande annulée ou dont la date de départ est dépassée. Le formulaire de
 * modification reprend les sections du formulaire de disponibilité du
 * transporteur.
 *
 * @module views/demandes-affreteur
 */

import { date, dateHeure, el, icone } from '../core/dom.js';
import { afficherErreur, badge, bandeau, bouton, carte, champ, etatVide, modale, tableau, toast } from '../core/ui.js';
import { aller } from '../core/router.js';
import { segmentEspace } from '../core/nav.js';
import { decider } from '../domain/access.js';
import { ETAT_DEMANDE, POV } from '../domain/enums.js';
import { depot } from '../repositories/index.js';
import * as fret from '../services/fret.service.js';
import {
  demandePourModification,
  modifiabiliteDemande,
  modifierDemande,
  republiabilite,
  republierDemande,
} from '../services/demande.service.js';
import { lire, nomUtilisateur, refDe } from './_donnees.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/** ISO → valeur d'un champ `datetime-local`, à l'heure locale. */
function versLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const optionsDe = (famille, selection) =>
  depot('referentiel')
    .brutOu((r) => r.famille === famille && (r.actif || r.id === selection))
    .map((r) => ({ valeur: r.id, libelle: r.libelle }));

/**
 * @param {any} ctx
 * @param {Record<string, string>} [params]
 */
export function vueDemandes(ctx, params = {}) {
  if (params.id) return formulaireModification(ctx, params.id);
  const liste = fret.mesDemandes(ctx);
  const espace = segmentEspace(ctx);

  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      message:
        'Une demande se modifie tant qu’aucune réservation ni proposition n’est engagée. ' +
        'Une demande annulée, ou dont la date de départ est passée, peut être republiée avec de nouvelles dates. ' +
        'Chaque modification est conservée dans son historique.',
    }),
    carte({
      titre: 'Demandes de transport',
      corps: [
        tableau({
          colonnes: ['Référence', 'Corridor', 'Départ', 'État', ''],
          lignes: liste.map((d) => {
            const dec = lire(ctx, 'declaration', d.declarationId);
            const annulable = decider(ctx, 'demande.annuler', { groupementId: d.groupementId });
            const modifiable = decider(ctx, 'demande.modifier', { groupementId: d.groupementId });
            const publiable = decider(ctx, 'demande.publier', { groupementId: d.groupementId });
            const figee = d.etat === ETAT_DEMANDE.VALIDEE || d.etat === ETAT_DEMANDE.ANNULEE;
            const m = modifiabiliteDemande(d);
            const r = republiabilite(d);
            return [
              el('span.demande-reference', {}, [
                el('strong', { text: d.reference }),
                d.republieeLe ? el('small', { text: `Republiée le ${date(d.republieeLe)}` })
                  : d.modifieeLe ? el('small', { text: `Modifiée le ${date(d.modifieeLe)}` }) : null,
              ]),
              `${refDe(dec?.provenanceId)} → ${refDe(dec?.destinationId)}`,
              el('span', {}, [
                date(d.departPrevu),
                d.departDepasse ? el('span.badge.badge-warning', { text: ' · date dépassée' }) : null,
              ]),
              badge(d.etat, POV.AFFRETEUR),
              // Une demande validée est close : un seul motif, plutôt que deux boutons refusés.
              d.etat === ETAT_DEMANDE.VALIDEE ? bouton({ libelle: 'Modifier', icone: 'pencil', variante: 'secondary', motif: 'Mise en relation validée : la demande ne se modifie ni ne s’annule plus.' }) :
              el('div.table-toolbar', {}, [
                r.republiable
                  ? bouton({ libelle: 'Republier', icone: 'rotate-ccw', variante: 'primary', motif: publiable.autorise ? null : publiable.explication, onClick: () => dialogueRepublication(ctx, d) })
                  : bouton({ libelle: 'Modifier', icone: 'pencil', variante: 'secondary', motif: !modifiable.autorise ? modifiable.explication : m.modifiable ? null : m.motif, onClick: () => aller(`#/${espace}/demandes/${d.id}`) }),
                bouton({
                  libelle: 'Annuler',
                  variante: 'ghost',
                  motif: figee
                    ? 'Cette demande est déjà annulée.'
                    : !annulable.autorise ? annulable.explication : null,
                  onClick: () => {
                    try {
                      fret.annulerDemande(ctx, d.id);
                      toast('Demande annulée. Vous pourrez la republier.');
                      rafraichir();
                    } catch (e) {
                      afficherErreur(e);
                    }
                  },
                }),
              ]),
            ];
          }),
          vide: etatVide({
            titre: 'Aucune demande',
            message: 'Déclarez un fret pour créer votre première demande de transport.',
          }),
        }),
      ],
    }),
  ]);
}

/** Republication : de nouvelles dates, puis retour au marché. */
function dialogueRepublication(ctx, d) {
  const demain = new Date(Date.now() + 86400000);
  const fermer = modale({
    titre: `Republier la demande ${d.reference}`,
    corps: [
      el('p', { text: d.etat === ETAT_DEMANDE.ANNULEE
        ? 'Cette demande a été annulée. Elle redeviendra visible des transporteurs avec les dates choisies.'
        : 'La date de départ de cette demande est dépassée. Choisissez de nouvelles dates pour la rendre de nouveau visible.' }),
      champ({ id: 'rp-depart', label: 'Nouvelle date de départ', type: 'datetime-local', requis: true, valeur: versLocal(demain.toISOString()) }),
      champ({ id: 'rp-arrivee', label: 'Nouvelle date d’arrivée souhaitée', type: 'datetime-local', requis: true, valeur: versLocal(new Date(demain.getTime() + 86400000).toISOString()), aide: 'Strictement postérieure au départ.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Republier', variante: 'primary', icone: 'rotate-ccw',
        onClick: () => {
          try {
            republierDemande(ctx, d.id, {
              departPrevu: document.getElementById('rp-depart')?.value,
              arriveePrevue: document.getElementById('rp-arrivee')?.value,
            });
            fermer();
            toast(`Demande ${d.reference} republiée.`);
            rafraichir();
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
  return fermer;
}

/** Formulaire de modification d'une demande. */
function formulaireModification(ctx, demandeId) {
  const espace = segmentEspace(ctx);
  let dossier;
  try {
    dossier = demandePourModification(ctx, demandeId);
  } catch (e) {
    return el('div.page', {}, [etatVide({ titre: 'Demande inaccessible', message: e.message, action: { libelle: 'Revenir aux demandes', onClick: () => aller(`#/${espace}/demandes`) } })]);
  }
  const { demande: d, declaration: dec, corridorModifiable } = dossier;
  if (!dossier.modifiable) {
    return el('div.page', {}, [etatVide({ titre: 'Cette demande ne peut pas être modifiée', message: dossier.motif, action: { libelle: 'Revenir aux demandes', onClick: () => aller(`#/${espace}/demandes`) } })]);
  }

  const lignes = (d.lignes ?? []).map((l) => ({ ...l }));
  const zoneLignes = el('div.demande-lignes');
  const erreur = el('div', { role: 'alert', hidden: true, tabindex: '-1' });
  const verrou = corridorModifiable ? {} : { disabled: true };
  const aideVerrou = corridorModifiable ? undefined : 'Ce fret porte plusieurs demandes : son libellé et son corridor se modifient depuis la déclaration.';

  function rendreLignes() {
    zoneLignes.replaceChildren(...lignes.map((l, i) => el('div.demande-ligne', {}, [
      el('div.field-row', {}, [
        champ({ id: `ml-produit-${i}`, label: 'Produit', requis: true, valeur: l.produitId, options: optionsDe('produits_sh', l.produitId), attrs: { 'data-ligne': i, 'data-champ': 'produitId' } }),
        champ({ id: `ml-poids-${i}`, label: 'Poids (t)', requis: true, type: 'number', valeur: l.poidsT, attrs: { min: '0.1', step: '0.1', 'data-ligne': i, 'data-champ': 'poidsT' } }),
        champ({ id: `ml-volume-${i}`, label: 'Volume (m³)', type: 'number', valeur: l.volumeM3, attrs: { min: '0', step: '0.1', 'data-ligne': i, 'data-champ': 'volumeM3' } }),
        champ({ id: `ml-colis-${i}`, label: 'Nombre de colis', type: 'number', valeur: l.nombreColis, attrs: { min: '1', step: '1', 'data-ligne': i, 'data-champ': 'nombreColis' } }),
        champ({ id: `ml-emballage-${i}`, label: 'Emballage', valeur: l.emballageId, options: optionsDe('emballages', l.emballageId), attrs: { 'data-ligne': i, 'data-champ': 'emballageId' } }),
      ]),
      lignes.length > 1 ? bouton({ libelle: 'Retirer cette marchandise', variante: 'ghost', icone: 'x', onClick: () => { lignes.splice(i, 1); rendreLignes(); } }) : null,
    ])));
    for (const controle of zoneLignes.querySelectorAll('[data-ligne]')) {
      controle.addEventListener('change', () => {
        lignes[Number(controle.dataset.ligne)][controle.dataset.champ] = controle.value;
      });
    }
  }
  rendreLignes();

  const formulaire = el('form.transport-offer-form', {}, [
    el('section.carrier-form-section', {}, [el('h3', {}, [icone('package', 26), 'Le fret']), el('div.field-row', {}, [
      champ({ id: 'md-libelle', label: 'Libellé du fret', requis: true, valeur: dec.libelle, aide: aideVerrou, attrs: { name: 'libelle', maxlength: 120, ...verrou } }),
      champ({ id: 'md-observation', label: 'Observation', type: 'textarea', valeur: dec.observation, attrs: { name: 'observation', ...verrou } }),
      champ({ id: 'md-provenance', label: 'Provenance', requis: true, valeur: dec.provenanceId, options: optionsDe('localites', dec.provenanceId), attrs: { name: 'provenanceId', ...verrou } }),
      champ({ id: 'md-destination', label: 'Destination', requis: true, valeur: dec.destinationId, options: optionsDe('localites', dec.destinationId), aide: 'Différente de la provenance.', attrs: { name: 'destinationId', ...verrou } }),
    ])]),
    el('section.carrier-form-section', {}, [el('h3', {}, [icone('calendar', 26), 'Le besoin de transport']), el('div.field-row', {}, [
      champ({ id: 'md-depart', label: 'Date et heure de départ', type: 'datetime-local', requis: true, valeur: versLocal(d.departPrevu), attrs: { name: 'departPrevu' } }),
      champ({ id: 'md-arrivee', label: 'Date et heure d’arrivée souhaitée', type: 'datetime-local', requis: true, valeur: versLocal(d.arriveePrevue), aide: 'Strictement postérieure au départ.', attrs: { name: 'arriveePrevue' } }),
      champ({ id: 'md-capacite', label: 'Capacité', requis: true, valeur: d.capaciteId, options: optionsDe('capacites', d.capaciteId), attrs: { name: 'capaciteId' } }),
      champ({ id: 'md-carrosserie', label: 'Carrosserie', requis: true, valeur: d.carrosserieId, options: optionsDe('carrosseries', d.carrosserieId), attrs: { name: 'carrosserieId' } }),
      champ({ id: 'md-essieux', label: 'Nombre d’essieux', valeur: d.essieuxId, options: optionsDe('essieux', d.essieuxId), attrs: { name: 'essieuxId' } }),
      champ({ id: 'md-contraintes', label: 'Contraintes particulières', type: 'textarea', valeur: d.contraintes, aide: 'Visible des transporteurs. Aucun numéro de téléphone ni adresse.', attrs: { name: 'contraintes' } }),
    ])]),
    el('section.carrier-form-section', {}, [
      el('h3', {}, [icone('package', 26), 'Les marchandises']),
      zoneLignes,
      bouton({ libelle: 'Ajouter une marchandise', icone: 'plus', onClick: () => { lignes.push({ produitId: '', poidsT: '' }); rendreLignes(); } }),
    ]),
    erreur,
    el('div.transport-form-actions', {}, [
      bouton({ libelle: 'Annuler', onClick: () => aller(`#/${espace}/demandes`) }),
      bouton({ libelle: 'Enregistrer les modifications', icone: 'check', type: 'submit', variante: 'primary' }),
    ]),
  ]);

  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!formulaire.reportValidity()) return;
    const v = Object.fromEntries(new FormData(formulaire));
    try {
      modifierDemande(ctx, demandeId, {
        fret: corridorModifiable
          ? { libelle: v.libelle, observation: v.observation, provenanceId: v.provenanceId, destinationId: v.destinationId }
          : {},
        besoin: {
          departPrevu: v.departPrevu, arriveePrevue: v.arriveePrevue, capaciteId: v.capaciteId,
          carrosserieId: v.carrosserieId, essieuxId: v.essieuxId || undefined, contraintes: v.contraintes,
        },
        lignes,
      });
      toast(`Demande ${d.reference} modifiée.`);
      aller(`#/${espace}/demandes`);
    } catch (err) {
      erreur.hidden = false;
      erreur.replaceChildren(bandeau({ ton: 'err', message: err.message }));
      erreur.focus();
    }
  });

  const historique = d.historique ?? [];
  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      titre: `Modifier la demande ${d.reference}`,
      message:
        'La demande reste publiée sous la même référence. Les transporteurs voient la version modifiée ; ' +
        'la modification est inscrite au journal et dans l’historique ci-dessous.',
    }),
    formulaire,
    carte({
      titre: 'Historique de la demande',
      corps: [
        historique.length
          ? el('ul.timeline', {}, [...historique].reverse().map((h) => el('li.timeline-item', {}, [
              el('span.timeline-dot.done'),
              el('div.timeline-content', {}, [
                el('strong', { text: `${h.action === 'republication' ? 'Republication' : 'Modification'} — ${dateHeure(h.le)}` }),
                el('span.meta', { text: `${h.resume ?? ''} Par ${nomUtilisateur(h.parUtilisateurId)}.` }),
              ]),
            ])))
          : el('p.subtitle', { text: `Publiée le ${dateHeure(d.publieeLe ?? d.creeeLe)}. Aucune modification depuis.` }),
      ],
    }),
  ]);
}
