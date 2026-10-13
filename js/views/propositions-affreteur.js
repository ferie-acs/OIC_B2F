/**
 * Affréteur : répondre aux propositions des transporteurs — le « sens B » (lot b3).
 *
 * Le transporteur propose un véhicule sur une demande publiée ; l'affréteur
 * accepte ou refuse, puis valide comme en sens A. Le droit existait
 * (`appariement.repondre`, décision documentée dans `permissions.js`) mais aucun
 * bouton ne l'exerçait : le sens B restait bloqué.
 *
 * **Aucun état n'est changé ici** : les deux gestes appellent
 * `matching.repondre()`, seul service autorisé à faire évoluer un appariement, et
 * les boutons interdits sont désactivés avec le motif rendu par
 * `deciderSurAppariement()` (décision D32) — un auxiliaire voit pourquoi il ne
 * peut pas accepter.
 *
 * @module views/propositions-affreteur
 */

import { camion, libelleTrajet } from '../core/camion.js';
import { date, dateHeure, el, icone } from '../core/dom.js';
import { afficherErreur, bandeau, bouton, champ, modale, toast } from '../core/ui.js';
import { aller } from '../core/router.js';
import { segmentEspace } from '../core/nav.js';
import { deciderSurAppariement } from '../domain/access.js';
import { ETAT_APPARIEMENT, MOTIFS_REJET_PAR_PARTIE, SENS_APPARIEMENT, labelOf } from '../domain/enums.js';
import { ACTION, echeanceDe } from '../domain/matching.state.js';
import * as matching from '../services/matching.service.js';
import { lire, refDe } from './_donnees.js';
import { blocConfiance } from './confiance.js';

/** L'appariement est-il une proposition reçue, en attente de la réponse de l'affréteur ? */
export function estPropositionRecue(a) {
  return a.sens === SENS_APPARIEMENT.DEMANDE_VERS_OFFRE && a.etat === ETAT_APPARIEMENT.RESERVER;
}

/** Badge d'une proposition reçue : le libellé générique dirait « en attente du transporteur ». */
export function badgeProposition() {
  return el('span', { class: 'badge badge-warning' }, [icone('inbox', 13), el('span', { text: 'Proposition reçue — à vous de répondre' })]);
}

/**
 * Boutons Accepter / Refuser d'une proposition reçue.
 * @param {any} ctx
 * @param {Record<string, any>} a Appariement projeté.
 */
export function actionsProposition(ctx, a) {
  const accepter = deciderSurAppariement(ctx, ACTION.ACCEPTER, a);
  const refuser = deciderSurAppariement(ctx, ACTION.REJETER, a);
  const annuler = deciderSurAppariement(ctx, ACTION.ANNULER, a);
  return el('div.table-toolbar', {}, [
    bouton({ libelle: 'Accepter', icone: 'check', variante: 'primary', motif: accepter.autorise ? null : accepter.explication, onClick: () => dialogueAcceptation(ctx, a) }),
    bouton({ libelle: 'Refuser', icone: 'x', variante: 'ghost', motif: refuser.autorise ? null : refuser.explication, onClick: () => dialogueRefus(ctx, a) }),
    // Un auxiliaire ne répond pas, mais peut écarter la proposition : l'annulation n'engage rien (D37).
    !accepter.autorise && annuler.autorise
      ? bouton({ libelle: 'Écarter', variante: 'ghost', onClick: () => dialogueEcarter(ctx, a) })
      : null,
  ]);
}

/** Résumé de l'offre proposée : ce que l'affréteur accepte, sans identité avant validation. */
function resumeOffre(ctx, a) {
  const offre = lire(ctx, 'offre', a.offreId) ?? {};
  const vehicule = offre.vehiculeId ? lire(ctx, 'vehicule', offre.vehiculeId) ?? {} : {};
  const demande = lire(ctx, 'demande', a.demandeId) ?? {};
  return el('div', {}, [
    el('div.validation-truck', {}, [
      camion(offre, 120),
      el('div', {}, [
        el('strong', { text: `${refDe(vehicule.carrosserieId)} · ${vehicule.capaciteT ?? '—'} t` }),
        el('span', { text: libelleTrajet(offre) }),
      ]),
    ]),
    blocConfiance(a.groupementTransporteurId, { compact: true }),
    el('div.recap-grid', {}, [
      el('div.recap-item', {}, [el('span', { text: 'Votre demande' }), el('strong', { text: `${demande.reference ?? '—'} · départ ${date(demande.departPrevu)}` })]),
      el('div.recap-item', {}, [el('span', { text: 'Trajet proposé' }), el('strong', { text: `${refDe(offre.localiteDepartId)} → ${refDe(offre.localiteArriveeId)}` })]),
      el('div.recap-item', {}, [el('span', { text: 'Disponibilité' }), el('strong', { text: `${date(offre.disponibleDu)} — ${date(offre.disponibleAu)}` })]),
      el('div.recap-item', {}, [el('span', { text: 'Prix indicatif' }), el('strong', { text: offre.prixKmT ? `${offre.prixKmT} F/km·t` : 'Non renseigné' })]),
    ]),
    echeanceDe(a) ? el('p.subtitle', { text: `Répondez avant le ${dateHeure(echeanceDe(a))}. Passé ce délai, la proposition expire et le véhicule revient sur le marché.` }) : null,
  ]);
}

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

function dialogueAcceptation(ctx, a) {
  const fermer = modale({
    titre: `Accepter la proposition ${a.reference}`,
    corps: [
      bandeau({
        ton: 'info',
        message:
          'Accepter ne débite rien. Vous validerez ensuite la mise en relation : les frais sont ' +
          'débités à ce moment-là, et le nom et les coordonnées du transporteur vous sont transmis.',
      }),
      resumeOffre(ctx, a),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Accepter la proposition', variante: 'primary', icone: 'check',
        onClick: () => {
          try {
            matching.repondre(ctx, a.id, { accepte: true });
            fermer();
            toast('Proposition acceptée. Il vous reste à valider la mise en relation.');
            aller(`#/${segmentEspace(ctx)}/validation/${a.id}`);
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
  return fermer;
}

function dialogueRefus(ctx, a) {
  const fermer = modale({
    titre: `Refuser la proposition ${a.reference}`,
    corps: [
      el('p', { text: 'Le motif est transmis au transporteur. Votre demande reste publiée et le véhicule redevient disponible.' }),
      champ({
        id: 'pr-motif', label: 'Motif', requis: true,
        options: MOTIFS_REJET_PAR_PARTIE.affreteur.map((m) => ({ valeur: m, libelle: labelOf(m) })),
      }),
      champ({ id: 'pr-precision', label: 'Précision', type: 'textarea', aide: 'Facultative. Aucun numéro de téléphone ni adresse : la précision est lue avant toute validation.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Refuser la proposition', variante: 'primary',
        onClick: () => {
          const motif = document.getElementById('pr-motif')?.value;
          if (!motif) {
            toast('Le motif est obligatoire.', 'err');
            return;
          }
          try {
            matching.repondre(ctx, a.id, { accepte: false, motif, precision: document.getElementById('pr-precision')?.value || undefined });
            fermer();
            toast('Proposition refusée. Le transporteur en est informé.');
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

function dialogueEcarter(ctx, a) {
  const fermer = modale({
    titre: `Écarter la proposition ${a.reference}`,
    corps: [el('p', { text: 'La proposition est close sans réponse sur le fond ; le véhicule et votre demande redeviennent disponibles. Rien n’est débité.' })],
    actions: [
      bouton({ libelle: 'Conserver', onClick: () => fermer() }),
      bouton({
        libelle: 'Écarter', variante: 'primary',
        onClick: () => {
          try {
            matching.annuler(ctx, a.id);
            fermer();
            toast('Proposition écartée.');
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
