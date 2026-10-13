/**
 * « Mon dossier » — l'espace de l'entreprise inscrite (lot b1).
 *
 * Avant activation, c'est le seul écran ouvert : dépôt des pièces, suivi de leur
 * contrôle, réponse à une demande de complément, correction de la fiche. Après
 * activation, il reste accessible pour renouveler une pièce ou demander la
 * modification d'une donnée d'identité, soumise au contrôle.
 *
 * @module views/dossier
 */

import { date, dateHeure, el } from '../core/dom.js';
import { afficherErreur, badge, bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { ETAT_INSCRIPTION, ETAT_PIECE } from '../domain/enums.js';
import { CHAMPS_ENTREPRISE, champsIdentite, libellePiece } from '../domain/inscription.js';
import { refDe } from './_donnees.js';
import { depot } from '../repositories/index.js';
import {
  FICHIERS_ADMIS,
  deposerPiece,
  mettreAJourFiche,
  monDossier,
  retirerPiece,
  transmettreComplement,
} from '../services/inscription.service.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/** Taille lisible. */
export function taille(octets) {
  const n = Number(octets) || 0;
  return n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;
}

/** @param {any} ctx */
export function dossier(ctx) {
  const d = monDossier(ctx);
  const ecriture = decider(ctx, 'inscription.deposer', { groupementId: ctx.groupementId });
  const motifEcriture = !d.peutDeposer
    ? 'Votre inscription a été refusée : le dossier est en lecture seule.'
    : ecriture.autorise ? null : ecriture.explication;
  const courantes = new Map(d.pieces.filter((p) => p.etat !== ETAT_PIECE.REMPLACEE).map((p) => [p.typePiece, p]));
  const historique = d.pieces.filter((p) => p.etat === ETAT_PIECE.REMPLACEE);

  return el('div.page', {}, [
    bandeauEtat(ctx, d, motifEcriture),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Pièces obligatoires conformes', valeur: `${d.bilan.conformes.length} / ${d.type.piecesRequises.length}`, icon: 'check-circle' }),
      kpi({ libelle: 'Pièces en cours de contrôle', valeur: d.bilan.aControler.length, icon: 'clock' }),
      kpi({ libelle: 'Pièces à reprendre', valeur: d.bilan.manquantes.length + d.bilan.nonConformes.length, icon: 'alert' }),
    ]),
    carte({
      titre: 'Pièces du dossier',
      sousTitre: `${d.type.libelle} — pièces demandées par l’OIC. Seules les caractéristiques du fichier sont enregistrées dans cette démonstration.`,
      corps: [
        tableau({
          colonnes: ['Pièce', 'Fichier déposé', 'Validité', 'Contrôle', 'Commentaire du contrôle', ''],
          lignes: d.attendues.map((a) => {
            const p = courantes.get(a.code);
            return [
              el('span.b1-cellule', {}, [el('strong', { text: a.libelle }), el('small', { text: a.requise ? 'Obligatoire' : 'Facultative' })]),
              p ? el('span.b1-cellule', {}, [el('span', { text: p.fichier?.nom ?? '—' }), el('small', { text: `${taille(p.fichier?.taille)} · déposée le ${date(p.deposeLe)}` })]) : 'Non déposée',
              p?.expireLe ? `Jusqu’au ${date(p.expireLe)}` : '—',
              p ? badge(p.etat) : el('span.badge.badge-neutral', { text: 'À déposer' }),
              p?.motif ?? '—',
              el('div.table-toolbar', {}, [
                bouton({
                  libelle: p ? 'Remplacer' : 'Déposer',
                  variante: p ? 'secondary' : 'primary',
                  icone: 'upload',
                  motif: motifEcriture,
                  onClick: () => dialogueDepot(ctx, a),
                }),
                p?.etat === ETAT_PIECE.DEPOSEE && !motifEcriture
                  ? bouton({ libelle: 'Retirer', variante: 'ghost', onClick: () => agir(() => retirerPiece(ctx, p.id), 'Pièce retirée du dossier.') })
                  : null,
              ]),
            ];
          }),
        }),
      ],
    }),
    carte({
      titre: 'Fiche de l’entreprise',
      sousTitre: d.etat === ETAT_INSCRIPTION.ACTIVEE
        ? 'Les coordonnées se mettent à jour directement. Une donnée d’identité modifiée est contrôlée par l’OIC avant d’être appliquée.'
        : 'Corrigez votre fiche tant que le compte n’est pas activé.',
      actions: [bouton({ libelle: 'Modifier la fiche', icone: 'settings', motif: motifEcriture, onClick: () => dialogueFiche(ctx, d) })],
      corps: [
        d.modificationProposee
          ? bandeau({
              ton: 'info',
              titre: 'Modification en attente de contrôle',
              message: `Demandée le ${date(d.modificationProposee.demandeeLe)} : ${Object.entries(d.modificationProposee.champs)
                .map(([n, v]) => `${libelleChamp(d, n)} → ${n === 'localiteId' ? refDe(v) : v}`).join(' ; ')}. ` +
                'Les valeurs vérifiées restent en vigueur jusqu’à la décision de l’agent.',
            })
          : null,
        el('div.recap-grid', {}, [
          ...[...CHAMPS_ENTREPRISE, ...d.type.champs].map((c) => el('div.recap-item', {}, [
            el('span', { text: c.libelle }),
            el('strong', { text: valeurAffichee(c, d.fiche[c.nom]) }),
          ])),
          el('div.recap-item', {}, [el('span', { text: 'Type d’entreprise' }), el('strong', { text: d.type.libelle })]),
          el('div.recap-item', {}, [el('span', { text: 'Code d’entreprise' }), el('strong', { text: d.codeBfci ?? 'Attribué à l’activation' })]),
        ]),
      ],
    }),
    carte({
      titre: 'Échanges avec l’OIC',
      corps: [
        d.echanges.length
          ? el('ul.b1-echanges', {}, d.echanges.map((x) => el('li', {}, [
              el('span.b1-cellule', {}, [
                el('strong', { text: x.auteur === 'oic' ? 'Agent d’activation de l’OIC' : 'Votre entreprise' }),
                el('small', { text: dateHeure(x.le) }),
              ]),
              el('p', { text: x.texte }),
            ])))
          : etatVide({ titre: 'Aucun échange', message: 'Les demandes de l’agent d’activation et vos réponses apparaîtront ici.' }),
      ],
    }),
    historique.length
      ? carte({
          titre: 'Pièces remplacées',
          corps: [tableau({
            colonnes: ['Pièce', 'Fichier', 'Déposée le', 'Contrôle à l’époque'],
            lignes: historique.map((p) => [libellePiece(p.typePiece), p.fichier?.nom ?? '—', date(p.deposeLe), p.motif ?? '—']),
          })],
        })
      : null,
  ]);
}

function libelleChamp(d, nom) {
  return [...CHAMPS_ENTREPRISE, ...d.type.champs].find((c) => c.nom === nom)?.libelle ?? nom;
}

function valeurAffichee(c, v) {
  if (!v) return '—';
  if (c.type === 'select') return refDe(v);
  if (c.type === 'date') return date(v);
  return String(v);
}

function bandeauEtat(ctx, d, motifEcriture) {
  const manque = [...d.bilan.manquantes, ...d.bilan.nonConformes].map(libellePiece);
  switch (d.etat) {
    case ETAT_INSCRIPTION.EN_ATTENTE:
      return bandeau({
        ton: 'warn',
        titre: 'Compte en attente d’activation',
        message: manque.length
          ? `Déposez les pièces obligatoires restantes : ${manque.join(', ')}. L’agent d’activation de l’OIC contrôle ensuite chaque pièce avant d’activer votre compte.`
          : 'Votre dossier est complet et en cours de vérification par l’agent d’activation de l’OIC. Vous serez prévenu par message dès son activation.',
      });
    case ETAT_INSCRIPTION.A_COMPLETER:
      return bandeau({
        ton: 'warn',
        titre: 'Complément demandé par l’OIC',
        message: `${d.motif ?? 'Consultez les commentaires du contrôle.'} Une fois les pièces déposées, transmettez votre dossier complété.`,
        actions: [bouton({ libelle: 'Transmettre mon dossier complété', variante: 'primary', icone: 'send', motif: motifEcriture, onClick: () => dialogueComplement(ctx) })],
      });
    case ETAT_INSCRIPTION.REFUSEE:
      return bandeau({ ton: 'err', titre: 'Inscription refusée', message: `Motif : ${d.motif ?? 'non précisé'}. Pour toute question, adressez-vous à l’OIC.` });
    default:
      return bandeau({
        ton: 'ok',
        titre: 'Compte activé',
        message: d.activeLe
          ? `Votre compte est activé depuis le ${date(d.activeLe)}. Code d’entreprise : ${d.codeBfci}. Renouvelez ici une pièce arrivée à échéance.`
          : 'Votre compte est actif. Renouvelez ici une pièce arrivée à échéance.',
      });
  }
}

/* ------------------------------------------------------------------ */

function dialogueDepot(ctx, attendue) {
  const erreurs = el('div', { role: 'alert', 'aria-live': 'polite' });
  const fichier = el('input', { id: 'dep-fichier', type: 'file', class: 'input', accept: FICHIERS_ADMIS.extensions.map((e) => `.${e}`).join(','), required: true });
  const form = el('form', {}, [
    el('div.field-row.form-grid', {}, [
      champ({ id: 'dep-numero', label: 'Numéro de la pièce', attrs: { name: 'numero', maxlength: 60 } }),
      champ({ id: 'dep-delivree', label: 'Délivrée le', type: 'date', attrs: { name: 'delivreeLe' } }),
      attendue.echeance
        ? champ({ id: 'dep-expire', label: 'Valable jusqu’au', type: 'date', requis: true, attrs: { name: 'expireLe' } })
        : null,
    ]),
    el('div.field', {}, [
      el('label', { for: 'dep-fichier' }, [el('span', { text: 'Fichier' }), el('span', { class: 'req', 'aria-hidden': 'true', text: ' *' })]),
      fichier,
      el('small', { text: 'Document PDF, JPEG ou PNG de 5 Mo au plus. Démonstration : le fichier n’est pas transmis, seuls son nom, son type et sa taille sont enregistrés.' }),
    ]),
    erreurs,
    el('footer.modal-footer', {}, [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({ libelle: 'Déposer la pièce', variante: 'primary', icone: 'upload', type: 'submit' }),
    ]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const f = fichier.files?.[0];
    const d = Object.fromEntries(new FormData(form));
    try {
      deposerPiece(ctx, {
        typePiece: attendue.code,
        numero: d.numero,
        delivreeLe: d.delivreeLe,
        expireLe: d.expireLe,
        fichier: { nom: f?.name ?? '', type: f?.type ?? '', taille: f?.size ?? 0 },
      });
      fermer();
      toast('Pièce déposée. Elle sera contrôlée par l’agent d’activation.');
      rafraichir();
    } catch (err) {
      erreurs.replaceChildren(bandeau({ ton: 'err', message: err instanceof Error ? err.message : 'Le dépôt a échoué.' }));
    }
  });
  const fermer = modale({ titre: `Déposer : ${attendue.libelle}`, corps: [el('p', { text: attendue.aide }), form] });
}

function dialogueFiche(ctx, d) {
  const identite = new Set(champsIdentite(d.type.type));
  const activee = d.etat === ETAT_INSCRIPTION.ACTIVEE;
  const erreurs = el('div', { role: 'alert', 'aria-live': 'polite' });
  const champs = [...CHAMPS_ENTREPRISE, ...d.type.champs].map((c) => champ({
    id: `fiche-${c.nom}`,
    label: c.libelle,
    type: c.type === 'select' ? 'text' : c.type ?? 'text',
    requis: c.requis,
    valeur: c.type === 'date' ? String(d.fiche[c.nom] ?? '').slice(0, 10) : d.fiche[c.nom],
    aide: activee && identite.has(c.nom) ? 'Donnée d’identité : soumise au contrôle de l’OIC.' : undefined,
    options: c.type === 'select' ? optionsLocalites() : undefined,
    attrs: { name: c.nom, maxlength: c.max },
  }));
  const form = el('form', {}, [
    el('div.field-row.form-grid', {}, champs),
    erreurs,
    el('footer.modal-footer', {}, [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({ libelle: 'Enregistrer', variante: 'primary', icone: 'check', type: 'submit' }),
    ]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    try {
      const { appliques, soumis } = mettreAJourFiche(ctx, Object.fromEntries(new FormData(form)));
      fermer();
      toast(soumis.length
        ? 'Modification transmise à l’OIC : elle s’appliquera après contrôle.'
        : appliques.length ? 'Fiche mise à jour.' : 'Aucune modification.');
      rafraichir();
    } catch (err) {
      erreurs.replaceChildren(bandeau({ ton: 'err', message: err instanceof Error ? err.message : 'L’enregistrement a échoué.' }));
    }
  });
  const fermer = modale({ titre: 'Modifier la fiche de l’entreprise', corps: [form] });
  form.closest('.modal-card')?.classList.add('modal-lg');
}

/** Villes du référentiel, pour la fiche. */
function optionsLocalites() {
  return localites().map((r) => ({ valeur: r.id, libelle: r.libelle }));
}

function dialogueComplement(ctx) {
  const fermer = modale({
    titre: 'Transmettre mon dossier complété',
    corps: [
      el('p', { text: 'Votre dossier retourne à l’agent d’activation. Précisez, si besoin, ce que vous avez complété.' }),
      champ({ id: 'cpl-reponse', label: 'Message à l’agent (facultatif)', type: 'textarea', attrs: { maxlength: 1000 } }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Transmettre',
        variante: 'primary',
        icone: 'send',
        onClick: () => agir(() => transmettreComplement(ctx, document.getElementById('cpl-reponse')?.value), 'Dossier transmis à l’agent d’activation.', fermer),
      }),
    ],
  });
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

function localites() {
  return depot('referentiel').brutOu((r) => r.famille === 'localites' && r.actif);
}
