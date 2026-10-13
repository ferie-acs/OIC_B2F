/**
 * Écran « Chauffeurs » de l'espace Transporteur (lot b3) : fiches complètes,
 * alertes de contrôle, retrait d'un chauffeur parti et réactivation.
 *
 * Calqué sur l'écran existant (cartes `carrier-person-card`) ; les données
 * viennent du service de flotte, déjà projetées.
 *
 * @module views/chauffeurs-transporteur
 */

import { date, el, icone } from '../core/dom.js';
import { bandeau, bouton, carte, etatVide } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { labelOf } from '../domain/enums.js';
import * as flotte from '../services/flotte.service.js';
import { ouvrirFicheChauffeur, ouvrirReactivation, ouvrirRetrait } from './chauffeur-formulaire.js';

const initiales = (nom) => String(nom ?? '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('');

/** @param {any} ctx */
export function vueChauffeurs(ctx) {
  const liste = flotte.mesChauffeurs(ctx);
  const gerer = decider(ctx, 'chauffeur.gerer', { groupementId: ctx.groupementId });
  let filtre = 'actifs';
  const grille = el('div.carrier-card-grid');
  const onglets = el('div.declarations-tabs', { role: 'group', 'aria-label': 'Filtrer les chauffeurs' });
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });

  const ligne = (icon, libelle, valeur) => el('div', {}, [el('dt', {}, [icone(icon, 18), libelle]), el('dd', { text: valeur || 'Non renseigné' })]);

  function fiche(c) {
    const retire = c.actif === false;
    const alertes = (c.alertes ?? []).filter((a) => a !== 'Chauffeur retiré de l’équipe');
    return el('article.carrier-person-card', { class: retire ? 'is-retire' : '' }, [
      el('div.carrier-card-top', {}, [
        el('span.carrier-avatar', { text: initiales(c.nom) }),
        el('div', {}, [
          el('h3', { text: c.nom }),
          retire
            ? el('span.carrier-status.warning', { text: `Retiré le ${date(c.retireLe)}` })
            : el('span', { class: c.permisEchu ? 'carrier-status warning' : 'carrier-status', text: c.permisEchu ? 'Permis échu' : 'Permis en cours de validité' }),
          el('span', { class: c.verifieLe ? 'carrier-status' : 'carrier-status warning', text: c.verifieLe ? 'Pièces contrôlées par la plateforme' : 'Pièces à faire contrôler' }),
        ]),
      ]),
      el('dl.carrier-details', {}, [
        ligne('file', 'Permis', c.permisNumero),
        ligne('check', 'Catégories', (c.permisCategories ?? []).join(', ')),
        ligne('calendar', 'Permis valable jusqu’au', c.permisEcheance ? date(c.permisEcheance) : null),
        ligne('id-card', 'Pièce d’identité', c.pieceType ? `${labelOf(c.pieceType)} · ${c.pieceNumero ?? ''}` : null),
        ligne('calendar', 'Pièce valable jusqu’au', c.pieceExpireLe ? date(c.pieceExpireLe) : null),
        ligne('users', 'Nationalité', c.nationalite),
        ligne('phone', 'Téléphone', c.telephone),
      ]),
      alertes.length ? el('ul.fiche-alertes', {}, alertes.map((a) => el('li', {}, [icone('alert', 15), a]))) : null,
      retire
        ? el('p.fiche-retrait', {}, [icone('history', 16), `Départ le ${date(c.dateDepart)} — ${c.motifRetrait ?? ''}`])
        : null,
      el('div.carrier-card-footer', {}, [
        bouton({ libelle: 'Ouvrir la fiche', icone: 'pencil', variante: 'ghost', onClick: () => ouvrirFicheChauffeur(ctx, c) }),
        retire
          ? bouton({ libelle: 'Réactiver', icone: 'rotate-ccw', variante: 'secondary', motif: gerer.autorise ? null : gerer.explication, onClick: () => ouvrirReactivation(ctx, c) })
          : bouton({ libelle: 'Retirer', icone: 'user-x', variante: 'ghost', motif: gerer.autorise ? null : gerer.explication, onClick: () => ouvrirRetrait(ctx, c) }),
      ]),
    ]);
  }

  function rendre() {
    const groupes = [
      ['actifs', 'En activité', (c) => c.actif !== false],
      ['retires', 'Retirés', (c) => c.actif === false],
    ];
    onglets.replaceChildren(...groupes.map(([id, libelle, test]) => el('button', {
      type: 'button', 'aria-pressed': String(filtre === id),
      on: { click: () => { filtre = id; rendre(); } },
    }, [`${libelle} (${liste.filter(test).length})`])));
    const visibles = liste.filter(groupes.find(([id]) => id === filtre)[2]);
    compteur.textContent = `${visibles.length} chauffeur${visibles.length > 1 ? 's' : ''}`;
    grille.replaceChildren(...(visibles.length ? visibles.map(fiche) : [etatVide({
      titre: filtre === 'actifs' ? 'Aucun chauffeur en activité' : 'Aucun chauffeur retiré',
      message: filtre === 'actifs'
        ? 'Déclarez vos chauffeurs avec leur pièce d’identité et leur permis.'
        : 'Les chauffeurs partis apparaîtront ici, avec leur historique.',
    })]));
  }
  rendre();

  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      message:
        'Les chauffeurs appartiennent à votre équipe, sans être rattachés à un camion. ' +
        'Choisissez le chauffeur adapté à chaque trajet lors de la publication d’une disponibilité : ' +
        'seuls les chauffeurs en activité, au permis et à la pièce valides, sont proposés. ' +
        'Ses coordonnées sont partagées avec l’affréteur après validation de la mise en relation.',
    }),
    carte({
      titre: 'Chauffeurs',
      actions: [bouton({ libelle: 'Ajouter un chauffeur', icone: 'plus', variante: 'primary', motif: gerer.autorise ? null : gerer.explication, onClick: () => ouvrirFicheChauffeur(ctx) })],
      corps: [el('div.declarations-toolbar', {}, [onglets, compteur]), grille],
    }),
  ]);
}
