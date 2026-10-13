/**
 * Catalogue de tarifs — consultation et modification datée.
 *
 * Lot b4. Remplace, sous la même route, l'écran en lecture seule : mêmes tuiles,
 * plus le bouton « Modifier » ouvert par `tarif.modifier`, et l'historique des
 * modifications. La mention obligatoire (« ce n'est pas une grille tarifaire du
 * fret », spécification H.2) est conservée.
 *
 * @module views/tarifs-admin
 */

import { date, dateHeure, el, icone, montant } from '../core/dom.js';
import { bandeau, bouton, carte, champ, etatVide, modale, tableau } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { aujourdhui } from '../domain/finances.js';
import { annulerProgrammation, catalogue, historiqueTarifs, modifierTarif } from '../services/tarif.service.js';
import { nomUtilisateur } from './_donnees.js';
import { agir, pastille, recap, valeur } from './_finances-ui.js';

/** @param {any} ctx */
export function tarifs(ctx) {
  const liste = catalogue(ctx);
  const historique = historiqueTarifs(ctx);
  const droit = decider(ctx, 'tarif.modifier');
  const libelleDe = (id) => liste.find((t) => t.id === id)?.libelle ?? id;

  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'warn',
      titre: 'Ce n’est pas une grille tarifaire du fret',
      message:
        'Ce catalogue fixe le prix des services de la plateforme : abonnement et frais de mise en relation. Le prix ' +
        'du transport lui-même se négocie entre les parties et n’est pas géré ici.',
    }),
    bandeau({
      ton: 'info',
      titre: 'Une modification n’est jamais rétroactive',
      message:
        'Elle prend effet à sa date : le jour même, immédiatement ; plus tard, elle est programmée. Les abonnements en ' +
        'cours gardent leur montant et leur échéance, et un encaissement déjà saisi garde le prix du jour de la saisie.',
    }),
    carte({
      titre: 'Catalogue de tarifs',
      corps: [
        el(
          'div.supervision-grid',
          {},
          liste.map((t) =>
            el('article.supervision-tile', {}, [
              el('div.supervision-tile-title', {}, [icone('wallet', 30), el('h3', { text: t.libelle })]),
              el('small', { text: t.formule ? `Formule d’abonnement · ${t.dureeMois} mois` : 'Service à l’acte' }),
              el('strong.supervision-amount', { text: montant(t.montant) }),
              el('p', { text: `${t.actif ? 'Actif' : 'Inactif'} · modifié le ${dateHeure(t.modifieLe)}` }),
              t.programmee
                ? el('p', { text: `Passera à ${montant(t.programmee.montantApres)}${t.programmee.dureeMoisApres ? `, ${t.programmee.dureeMoisApres} mois,` : ''} le ${date(t.programmee.effetLe)}.` })
                : null,
              bouton({
                libelle: 'Modifier',
                icone: 'settings',
                variante: 'primary',
                motif: droit.autorise ? null : droit.explication,
                onClick: () => dialogueModification(ctx, t),
              }),
              el('span.indicator-watermark', { 'aria-hidden': 'true' }, [icone('wallet', 88)]),
            ]),
          ),
        ),
      ],
    }),
    carte({
      titre: 'Historique des modifications',
      corps: [
        tableau({
          colonnes: ['Enregistrée le', 'Tarif', 'Avant', 'Après', 'Date d’effet', 'État', 'Par', 'Motif', ''],
          lignes: historique.map((r) => [
            dateHeure(r.creeLe),
            libelleDe(r.tarifId),
            `${montant(r.montantAvant)}${r.dureeMoisAvant ? ` · ${r.dureeMoisAvant} mois` : ''}`,
            `${montant(r.montantApres)}${r.dureeMoisApres ? ` · ${r.dureeMoisApres} mois` : ''}`,
            date(r.effetLe),
            pastille(r.etat),
            nomUtilisateur(r.auteurUtilisateurId),
            r.motif,
            r.etat === 'programmee'
              ? bouton({
                  libelle: 'Annuler',
                  variante: 'ghost',
                  motif: droit.autorise ? null : droit.explication,
                  onClick: () => agir(() => annulerProgrammation(ctx, r.id), 'Modification programmée annulée.'),
                })
              : null,
          ]),
          vide: etatVide({ titre: 'Aucune modification', message: 'Les modifications du catalogue apparaîtront ici, avec leur auteur et leur motif.' }),
        }),
      ],
    }),
  ]);
}

function dialogueModification(ctx, t) {
  const fermer = modale({
    titre: `Modifier « ${t.libelle} »`,
    corps: [
      recap([
        ['Montant actuel', montant(t.montant)],
        t.formule ? ['Durée actuelle', `${t.dureeMois} mois`] : null,
      ]),
      el('div.field-row', {}, [
        champ({ id: 'tm-montant', label: 'Nouveau montant (F CFA)', type: 'number', valeur: t.montant, requis: true, attrs: { min: '1', step: '1' } }),
        t.formule
          ? champ({ id: 'tm-duree', label: 'Durée (mois)', type: 'number', valeur: t.dureeMois, requis: true, attrs: { min: '1', max: '36', step: '1' } })
          : null,
        champ({ id: 'tm-effet', label: 'Date d’effet', type: 'date', valeur: aujourdhui(), requis: true, attrs: { min: aujourdhui() } }),
      ]),
      champ({ id: 'tm-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Il figure à l’historique du catalogue.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Enregistrer la modification',
        variante: 'primary',
        onClick: () =>
          agir(
            () =>
              modifierTarif(ctx, t.id, {
                montant: Number(valeur('tm-montant')),
                dureeMois: t.formule ? Number(valeur('tm-duree')) : null,
                effetLe: valeur('tm-effet'),
                motif: valeur('tm-motif'),
              }),
            valeur('tm-effet') === aujourdhui() ? 'Tarif modifié avec effet immédiat.' : 'Modification programmée à sa date d’effet.',
            fermer,
          ),
      }),
    ],
  });
}
