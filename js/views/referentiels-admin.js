/**
 * Lot b5 : référentiels nationaux, administrés par l'exploitant OIC.
 *
 * @module views/referentiels-admin
 */

import { el } from '../core/dom.js';
import { bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau } from '../core/ui.js';
import * as referentiels from '../services/referentiels.service.js';
import { refDe } from './_donnees.js';
import { agir, valeurDe } from './admin-outils.js';

/** Famille affichée, conservée entre deux rafraîchissements. */
let familleCourante = 'localites';

/** @param {any} ctx */
export function referentielsVue(ctx) {
  const famille = referentiels.FAMILLES[familleCourante] ? familleCourante : 'localites';
  const def = referentiels.FAMILLES[famille];
  const valeurs = referentiels.valeursDe(ctx, famille);

  const onglets = el('div.declarations-tabs', { role: 'group', 'aria-label': 'Choisir un référentiel' },
    Object.entries(referentiels.FAMILLES).map(([id, f]) => el('button', {
      type: 'button', 'aria-pressed': String(id === famille), text: f.libelle,
      on: { click: () => { familleCourante = id; globalThis.dispatchEvent(new HashChangeEvent('hashchange')); } },
    })));

  const recherche = el('input', { type: 'search', placeholder: 'Rechercher une valeur…', 'aria-label': 'Rechercher une valeur', on: { input: () => rendre() } });
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });
  const zone = el('div');

  function rendre() {
    const q = (recherche.value || '').trim().toLocaleLowerCase('fr');
    const visibles = valeurs.filter((r) => `${r.libelle} ${r.code}`.toLocaleLowerCase('fr').includes(q));
    compteur.textContent = `${visibles.length} valeur(s) · ${valeurs.filter((r) => r.actif).length} active(s)`;
    zone.replaceChildren(tableau({
      colonnes: ['Libellé', 'Code', 'Rattachement', 'Usages', 'État', 'Actions'],
      lignes: visibles.map((r) => [
        r.libelle, r.code, r.parentId ? refDe(r.parentId) : '—', String(r.usages),
        r.actif ? el('span.badge.badge-success', { text: 'Active' }) : el('span.badge.badge-neutral', { text: 'Désactivée' }),
        el('div.lot-b5-actions', {}, [
          bouton({ libelle: 'Renommer', variante: 'secondary', onClick: () => dialogueRenommer(r) }),
          r.actif
            ? bouton({ libelle: 'Désactiver', variante: 'secondary', onClick: () => agir(() => referentiels.changerActivation(ctx, r.id, false), 'Valeur désactivée : elle n’est plus proposée dans les nouvelles saisies.') })
            : bouton({ libelle: 'Réactiver', variante: 'secondary', onClick: () => agir(() => referentiels.changerActivation(ctx, r.id, true), 'Valeur réactivée.') }),
          // Une valeur utilisée ne se supprime pas : l'action n'est offerte qu'à une valeur jamais employée.
          r.usages === 0 ? bouton({ libelle: 'Supprimer', variante: 'ghost', onClick: () => dialogueSuppression(r) }) : null,
        ]),
      ]),
      vide: etatVide({ titre: 'Aucune valeur', message: 'Aucune valeur ne correspond à cette recherche.' }),
    }));
  }

  function dialogueAjout() {
    const parents = valeurs.filter((r) => r.actif).map((r) => ({ valeur: r.id, libelle: r.libelle }));
    const fermer = modale({
      titre: `Ajouter une valeur — ${def.libelle}`,
      corps: [
        champ({ id: 'rf-libelle', label: 'Libellé', requis: true, aide: `Nom de la ${def.singulier}, tel qu’il s’affichera dans les listes.` }),
        el('div.field-row', {}, [
          champ({ id: 'rf-code', label: 'Code', aide: 'Facultatif : déduit du libellé. Il ne change plus ensuite.' }),
          famille === 'localites' ? champ({ id: 'rf-parent', label: 'Rattachement', options: parents, aide: 'Facultatif : localité de rattachement.' }) : null,
        ]),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Ajouter', variante: 'primary',
          onClick: () => agir(() => referentiels.ajouterValeur(ctx, { famille, libelle: valeurDe('rf-libelle'), code: valeurDe('rf-code'), parentId: valeurDe('rf-parent') }), 'Valeur ajoutée.', fermer),
        }),
      ],
    });
  }

  function dialogueRenommer(r) {
    const fermer = modale({
      titre: `Renommer — ${r.libelle}`,
      corps: [
        el('p', { text: r.usages ? `Cette valeur est utilisée ${r.usages} fois : le nouveau libellé s’affichera partout où elle apparaît.` : 'Cette valeur n’est encore utilisée nulle part.' }),
        champ({ id: 'rf-nouveau', label: 'Nouveau libellé', requis: true, valeur: r.libelle }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({ libelle: 'Enregistrer', variante: 'primary', onClick: () => agir(() => referentiels.modifierValeur(ctx, r.id, { libelle: valeurDe('rf-nouveau') }), 'Libellé modifié.', fermer) }),
      ],
    });
  }

  function dialogueSuppression(r) {
    const fermer = modale({
      titre: `Supprimer — ${r.libelle}`,
      corps: [el('p', { text: 'Cette valeur n’a jamais été utilisée : elle peut être supprimée. L’opération est inscrite au journal d’audit.' })],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({ libelle: 'Supprimer', variante: 'primary', onClick: () => agir(() => referentiels.supprimerValeur(ctx, r.id), 'Valeur supprimée.', fermer) }),
      ],
    });
  }

  rendre();
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Une valeur utilisée ne se supprime pas',
      message:
        'Désactiver une valeur la retire des nouvelles saisies sans toucher aux véhicules, demandes ou ' +
        'entreprises qui l’emploient déjà : l’historique reste lisible. Chaque changement est inscrit au journal d’audit.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Valeurs', valeur: valeurs.length, icon: 'settings' }),
      kpi({ libelle: 'Valeurs actives', valeur: valeurs.filter((r) => r.actif).length, icon: 'check-circle' }),
      kpi({ libelle: 'Valeurs utilisées', valeur: valeurs.filter((r) => r.usages > 0).length, icon: 'activity' }),
    ]),
    carte({
      titre: def.libelle,
      sousTitre: 'Choisissez un référentiel, puis ajoutez, renommez ou désactivez ses valeurs.',
      actions: [bouton({ libelle: 'Ajouter une valeur', variante: 'primary', icone: 'plus', onClick: dialogueAjout })],
      corps: [onglets, el('div.declarations-toolbar', {}, [recherche]), compteur, zone],
    }),
  ]);
}

