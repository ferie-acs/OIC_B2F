/**
 * Écran de l'agent d'activation des inscriptions — correctif anti-fraude n° 3.
 *
 * L'agent contrôle les pièces d'un transporteur avant qu'il puisse s'engager sur
 * le marché : son dossier (RCCM, carte de transporteur, assurance), puis la carte
 * grise de chaque véhicule et le permis de chaque chauffeur. Les pièces lui sont
 * servies par le service de vérification, sous le droit `groupement.verifier` —
 * ni téléphone, ni courriel, ni solde.
 *
 * @module views/verifications
 */

import { date, el, icone } from '../core/dom.js';
import { afficherErreur, badge, bandeau, bouton, carte, champ, etatVide, modale, tableau, toast } from '../core/ui.js';
import { ETAT_VERIFICATION, PIECE_DOSSIER, labelOf } from '../domain/enums.js';
import * as verification from '../services/verification.service.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/** @param {any} ctx */
export function verifications(ctx) {
  const dossiers = verification.dossiersTransporteurs(ctx);
  const aTraiter = dossiers.filter((d) => d.etat !== ETAT_VERIFICATION.VERIFIE
    || d.vehicules.some((v) => !v.verifieLe) || d.chauffeurs.some((c) => !c.verifieLe));

  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Aucun transporteur ne s’engage sans contrôle',
      message:
        'Tant que son dossier n’est pas vérifié, un transporteur ne publie pas, ne propose ' +
        'pas et n’accepte pas. Un véhicule ou un chauffeur non contrôlé ne peut pas être ' +
        'proposé. Une pièce modifiée après contrôle perd sa vérification.',
    }),
    el('p.declarations-count', { text: `${aTraiter.length} dossier(s) avec des pièces à contrôler · ${dossiers.length} transporteur(s) inscrit(s)` }),
    ...(dossiers.length ? dossiers.map((d) => ficheDossier(d)) : [etatVide({ titre: 'Aucun transporteur inscrit', message: 'Les dossiers apparaîtront ici.' })]),
  ]);

  function ficheDossier(d) {
    return carte({
      titre: d.raisonSociale,
      sousTitre: `Inscrit le ${date(d.creeLe)} · ${d.pays}`,
      actions: [
        d.etat !== ETAT_VERIFICATION.VERIFIE
          ? bouton({ libelle: 'Vérifier le dossier', variante: 'primary', icone: 'shield', onClick: () => dialogueVerification(d) })
          : null,
        bouton({
          libelle: d.etat === ETAT_VERIFICATION.VERIFIE ? 'Retirer la vérification' : 'Refuser',
          variante: 'ghost',
          onClick: () => dialogueRefus(d),
        }),
      ],
      corps: [
        el('div.recap-grid', {}, [
          el('div.recap-item', {}, [el('span', { text: 'État du dossier' }), el('strong', {}, [badge(d.etat)])]),
          el('div.recap-item', {}, [el('span', { text: 'RCCM' }), el('strong', { text: d.rccm ?? 'Non renseigné' })]),
          el('div.recap-item', {}, [el('span', { text: 'Carte de transporteur' }), el('strong', { text: d.carteTransporteurNumero ? `${d.carteTransporteurNumero} — échéance ${date(d.carteTransporteurEcheance)}` : 'Non renseignée' })]),
          d.verifieLe ? el('div.recap-item', {}, [el('span', { text: 'Vérifié le' }), el('strong', { text: date(d.verifieLe) })]) : null,
          d.motif ? el('div.recap-item', {}, [el('span', { text: 'Motif du refus' }), el('strong', { text: d.motif })]) : null,
        ]),
        el('h3', {}, [icone('truck', 18), ' Véhicules — carte grise et carte de transport']),
        tableau({
          colonnes: ['Immatriculation', 'Carte grise', 'Carte de transport', 'Contrôle', ''],
          lignes: d.vehicules.map((v) => [
            v.immatriculation,
            v.carteGrise ?? 'Non renseignée',
            `${v.carteTransportNumero} — échéance ${date(v.carteTransportEcheance)}`,
            v.verifieLe ? el('span.badge.badge-success', { text: `Contrôlé le ${date(v.verifieLe)}` }) : el('span.badge.badge-warning', { text: 'À contrôler' }),
            v.verifieLe ? null : bouton({ libelle: 'Attester le contrôle', variante: 'secondary', onClick: () => agir(() => verification.verifierVehicule(ctx, v.id), 'Véhicule contrôlé.') }),
          ]),
          vide: etatVide({ titre: 'Aucun véhicule', message: 'Ce transporteur n’a pas encore déclaré de véhicule.' }),
        }),
        el('h3', {}, [icone('users', 18), ' Chauffeurs — permis de conduire']),
        tableau({
          colonnes: ['Nom', 'Permis', 'Validité', 'Contrôle', ''],
          lignes: d.chauffeurs.map((c) => [
            c.nom,
            c.permisNumero,
            c.permisEcheance ? date(c.permisEcheance) : '—',
            c.verifieLe ? el('span.badge.badge-success', { text: `Contrôlé le ${date(c.verifieLe)}` }) : el('span.badge.badge-warning', { text: 'À contrôler' }),
            c.verifieLe ? null : bouton({ libelle: 'Attester le contrôle', variante: 'secondary', onClick: () => agir(() => verification.verifierChauffeur(ctx, c.id), 'Chauffeur contrôlé.') }),
          ]),
          vide: etatVide({ titre: 'Aucun chauffeur', message: 'Ce transporteur n’a pas encore déclaré de chauffeur.' }),
        }),
      ],
    });
  }

  function dialogueVerification(d) {
    const pieces = Object.values(PIECE_DOSSIER);
    const fermer = modale({
      titre: `Vérifier le dossier — ${d.raisonSociale}`,
      corps: [
        el('p', { text: 'Cochez chaque pièce effectivement contrôlée. Les trois sont exigées : un contrôle partiel n’est pas un contrôle.' }),
        ...pieces.map((p) => el('label.checkbox-row', {}, [el('input', { type: 'checkbox', id: `vp-${p}` }), ` ${labelOf(p)}`])),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Prononcer la vérification',
          variante: 'primary',
          onClick: () => {
            const coches = pieces.filter((p) => document.getElementById(`vp-${p}`)?.checked === true);
            agir(() => verification.verifierTransporteur(ctx, d.id, { pieces: coches }), 'Dossier vérifié.', fermer);
          },
        }),
      ],
    });
  }

  function dialogueRefus(d) {
    const fermer = modale({
      titre: `${d.etat === ETAT_VERIFICATION.VERIFIE ? 'Retirer la vérification' : 'Refuser le dossier'} — ${d.raisonSociale}`,
      corps: [
        el('p', { text: 'Le transporteur ne pourra plus publier ni accepter, et ses offres quittent le marché. Le motif lui est communiqué.' }),
        champ({ id: 'vr-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Par exemple : attestation d’assurance expirée.' }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Confirmer',
          variante: 'primary',
          onClick: () => agir(() => verification.refuserTransporteur(ctx, d.id, document.getElementById('vr-motif')?.value), 'Décision enregistrée.', fermer),
        }),
      ],
    });
  }
}

function agir(action, message, fermer = null) {
  try {
    action();
    fermer?.();
    toast(message);
    rafraichir();
  } catch (e) {
    afficherErreur(e);
  }
}
