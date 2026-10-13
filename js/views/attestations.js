/**
 * Transporteur — attestations de bourse de fret (lot b3).
 *
 * Même poste de travail que les documents de transport (`dut.js`) : liste des
 * dossiers à gauche, document à droite, tirage PDF dans la barre d'outils. Le
 * document porte un QR code réel qui ouvre la page publique de vérification.
 *
 * @module views/attestations
 */

import { date, dateHeure, el, icone } from '../core/dom.js';
import { afficherErreur, bandeau, bouton, champ, etatVide, kpi, modale, toast } from '../core/ui.js';
import { segmentEspace } from '../core/nav.js';
import { qrSvg } from '../core/qr.js';
import { ETAT_ATTESTATION, labelOf } from '../domain/enums.js';
import {
  annulerAttestation,
  attestationPourImpression,
  dossiersAttestation,
  emettreAttestation,
} from '../services/attestation.service.js';
import { adresseVerification, genererPdfAttestation } from '../services/attestation-pdf.js';

const TONS = { [ETAT_ATTESTATION.EN_VIGUEUR]: 'ok', [ETAT_ATTESTATION.EXPIREE]: 'warn', [ETAT_ATTESTATION.ANNULEE]: 'warn' };

function statut(dossier) {
  if (dossier.attestation) {
    const e = dossier.attestation.etatCourant;
    return el('span.dut-status', { class: `is-${TONS[e]}`, text: labelOf(e) });
  }
  return el('span.dut-status', { class: dossier.emettable ? 'is-info' : 'is-warn', text: dossier.emettable ? 'À émettre' : 'Non disponible' });
}

const champDoc = (nom, valeur) => el('div', {}, [el('dt', { text: nom }), el('dd', { text: valeur || 'Non renseigné' })]);
const section = (numero, titre, champs) => el('section.dut-document-section', {}, [
  el('h3', {}, [el('span', { text: numero }), titre]), el('dl.dut-document-fields', {}, champs),
]);

/** Aperçu à l'écran du document imprimé. */
function feuille(impression) {
  const d = impression.document;
  const url = adresseVerification(impression.chemin);
  return el('article.dut-sheet.attestation-sheet', { 'aria-label': `Attestation ${d.reference}` }, [
    el('div.dut-sheet-top', {}, [
      el('div', {}, [el('span.dut-sheet-brand', { text: 'BOURSE DE FRET' }), el('small', { text: 'CÔTE D’IVOIRE · OIC' })]),
      el('span.dut-demo-stamp', { text: 'DÉMONSTRATION' }),
    ]),
    el('div.attestation-entete', {}, [
      el('header.dut-document-title', {}, [
        el('span', { text: 'ABF' }),
        el('div', {}, [el('h2', { text: 'Attestation de bourse de fret' }), el('p', { text: `${d.reference} · ${labelOf(d.etat)}` })]),
      ]),
      el('figure.attestation-qr', {}, [
        qrSvg(url, { taille: 132, libelle: `QR code de vérification de l’attestation ${d.reference}` }),
        el('figcaption', {}, [el('small', { text: 'CODE DE VÉRIFICATION' }), el('strong', { text: impression.code })]),
      ]),
    ]),
    el('div.dut-document-route', {}, [
      el('small', { text: 'TRAJET ATTESTÉ' }),
      el('strong', { text: `${d.depart} → ${d.arrivee}` }),
      el('span', { text: `Départ prévu le ${date(d.departPrevu)} · arrivée prévue le ${date(d.arriveePrevue)}` }),
    ]),
    section('01', 'La mise en relation', [
      champDoc('Référence', d.appariementReference),
      champDoc('Validée le', d.valideLe ? dateHeure(d.valideLe) : null),
      champDoc('Frais de mise en relation', 'Réglés par les deux parties'),
      champDoc('Valable jusqu’au', dateHeure(d.valableJusquau)),
    ]),
    section('02', 'Les parties', [champDoc('Transporteur', d.transporteur), champDoc('Affréteur', d.affreteur)]),
    section('03', 'Le véhicule', [
      champDoc('Immatriculation', d.immatriculation),
      champDoc('Carte de transport', d.carteTransportNumero),
      champDoc('Chauffeur prévu', d.chauffeur),
      champDoc('Marchandise', d.poidsT ? `${d.marchandise} · ${String(d.poidsT).replace('.', ',')} t` : d.marchandise),
    ]),
    el('footer.dut-document-footer', {}, [
      el('p', { text: `Émise le ${dateHeure(d.genereeLe)}. Le QR code ouvre la page de vérification ; l’agent peut aussi saisir le code ci-dessus.` }),
      el('strong', { text: 'Attestation de démonstration · données fictives' }),
    ]),
  ]);
}

/** @param {any} ctx @param {Record<string, string>} [params] */
export function vueAttestations(ctx, params = {}) {
  let dossiers = dossiersAttestation(ctx);
  let selection = (params.selection && dossiers.find((d) => d.appariement.id === params.selection)) || dossiers[0] || null;
  const espace = segmentEspace(ctx);
  const page = el('div.page.dut-page.attestations-page');
  const liste = el('div.dut-dossier-list', { 'aria-label': 'Mises en relation validées' });
  const detail = el('section.dut-detail', { 'aria-label': 'Attestation sélectionnée' });
  const indicateurs = el('div.dut-kpis');
  const compteur = el('span');

  function recharger(id) {
    dossiers = dossiersAttestation(ctx);
    selection = dossiers.find((d) => d.appariement.id === id) ?? dossiers[0] ?? null;
    statistiques();
    afficherListe();
    afficherDetail();
  }

  function statistiques() {
    compteur.textContent = String(dossiers.length);
    const n = (e) => dossiers.filter((d) => d.attestation?.etatCourant === e).length;
    indicateurs.replaceChildren(
      kpi({ libelle: 'Attestations en vigueur', valeur: n(ETAT_ATTESTATION.EN_VIGUEUR), icon: 'shield-check', ton: 'ok', note: 'Vérifiables sur route' }),
      kpi({ libelle: 'À émettre', valeur: dossiers.filter((d) => d.emettable).length, icon: 'file', note: 'Mises en relation validées et payées' }),
      kpi({ libelle: 'Expirées ou annulées', valeur: n(ETAT_ATTESTATION.EXPIREE) + n(ETAT_ATTESTATION.ANNULEE), icon: 'clock', ton: 'warn', note: 'Le contrôle le signale' }),
    );
  }

  function afficherListe() {
    liste.replaceChildren(...dossiers.map((d) => el('button.dut-dossier', {
      type: 'button',
      class: d.appariement.id === selection?.appariement.id ? 'selected' : '',
      'aria-pressed': String(d.appariement.id === selection?.appariement.id),
      on: { click: () => {
        selection = d;
        history.replaceState(null, '', `#/${espace}/attestations?selection=${encodeURIComponent(d.appariement.id)}`);
        afficherListe();
        afficherDetail();
        liste.querySelector('.selected')?.focus({ preventScroll: true });
      } },
    }, [
      el('span.dut-dossier-top', {}, [el('strong', { text: d.attestation?.reference || d.appariement.reference }), statut(d)]),
      el('strong.dut-dossier-route', { text: `${d.trajet.depart} → ${d.trajet.arrivee}` }),
      el('span.dut-dossier-meta', {}, [icone('truck', 22), d.immatriculation, el('span', { text: d.appariement.reference })]),
      el('span.dut-dossier-bottom', {}, [icone('calendar', 14), d.trajet.departPrevu ? date(d.trajet.departPrevu) : 'Date à préciser', icone('chevron-right', 15)]),
    ])));
    if (!dossiers.length) {
      liste.append(etatVide({ titre: 'Aucune mise en relation validée', message: 'L’attestation s’émet pour un transport conclu sur la plateforme : validé par l’affréteur et payé par les deux parties.' }));
    }
  }

  function afficherDetail() {
    if (!selection) {
      detail.replaceChildren(el('div.dut-empty-panel', {}, [etatVide({
        titre: 'Votre première attestation suit votre première mise en relation',
        message: 'Dès qu’un affréteur valide une mise en relation avec vous, émettez ici l’attestation à conserver à bord du véhicule.',
      })]));
      return;
    }
    const d = selection;
    const att = d.attestation;
    const enVigueur = att?.etatCourant === ETAT_ATTESTATION.EN_VIGUEUR;
    let impression = null;
    if (att) {
      try { impression = attestationPourImpression(ctx, att.id); } catch (e) { afficherErreur(e); }
    }
    const telecharger = bouton({
      libelle: 'Télécharger le PDF', icone: 'download', variante: enVigueur ? 'primary' : 'secondary',
      onClick: async () => {
        if (telecharger.getAttribute('aria-busy') === 'true') return;
        telecharger.setAttribute('aria-busy', 'true');
        try {
          const { nomFichier } = await genererPdfAttestation(impression);
          toast(`${nomFichier} téléchargé.`);
        } catch (e) {
          toast(e.message, 'err');
        } finally {
          telecharger.removeAttribute('aria-busy');
        }
      },
    });
    // `replaceChildren` écrirait « null » pour un bloc absent : on ne garde que les nœuds.
    detail.replaceChildren(...[
      el('div.dut-detail-toolbar', {}, [
        el('div', {}, [el('span.dut-eyebrow', { text: att ? 'ATTESTATION DE BOURSE DE FRET' : 'MISE EN RELATION VALIDÉE' }), el('h2', { text: att?.reference || d.appariement.reference })]),
        el('div.dut-toolbar-actions', {}, [
          att && impression ? telecharger : null,
          enVigueur ? bouton({ libelle: 'Annuler l’attestation', icone: 'x', variante: 'ghost', onClick: () => dialogueAnnulation(att) }) : null,
          !enVigueur ? bouton({
            libelle: att ? 'Émettre une nouvelle attestation' : 'Émettre l’attestation', icone: 'qr-code', variante: 'primary',
            motif: d.emettable ? null : d.motif,
            onClick: () => {
              try {
                const nouvelle = emettreAttestation(ctx, d.appariement.id);
                toast(`Attestation ${nouvelle.reference} émise. Téléchargez-la pour l’imprimer.`);
                recharger(d.appariement.id);
              } catch (e) { afficherErreur(e); }
            },
          }) : null,
        ]),
      ]),
      el('ol.dut-steps', { 'aria-label': 'Émission de l’attestation' }, [
        ['Mise en relation validée', true], ['Frais réglés', true], ['Attestation en vigueur', enVigueur],
      ].map(([titre, fait], i) => el('li', { class: fait ? 'done' : '' }, [el('span', {}, fait ? [icone('check', 14)] : [String(i + 1)]), titre]))),
      att && att.etatCourant !== ETAT_ATTESTATION.EN_VIGUEUR
        ? bandeau({
            ton: 'warn',
            titre: att.etatCourant === ETAT_ATTESTATION.ANNULEE ? 'Attestation annulée' : 'Attestation expirée',
            message: att.etatCourant === ETAT_ATTESTATION.ANNULEE
              ? `Annulée le ${dateHeure(att.annuleeLe)} — ${att.motifAnnulation ?? ''}. Un contrôle sur route l’affichera comme annulée.`
              : `Sa validité a pris fin le ${dateHeure(att.valableJusquau)}. Un contrôle sur route l’affichera comme expirée.`,
          })
        : null,
      impression ? feuille(impression) : el('div.dut-empty-panel', {}, [etatVide({
        titre: 'Aucune attestation émise pour ce transport',
        message: d.emettable
          ? 'Émettez l’attestation : elle porte un QR code que les agents de contrôle vérifient sur route.'
          : d.motif,
      })]),
      d.historique.length > 1 ? el('div.dut-related', {}, [
        el('span', {}, [icone('history', 18), `Attestations précédentes : ${d.historique.slice(1).map((h) => `${h.reference} (${labelOf(h.etatCourant).toLowerCase()})`).join(', ')}`]),
      ]) : null,
    ].filter(Boolean));
  }

  function dialogueAnnulation(att) {
    const fermer = modale({
      titre: `Annuler l’attestation ${att.reference}`,
      corps: [
        el('p', { text: 'Une attestation annulée reste vérifiable : le contrôle sur route l’affichera comme annulée. Vous pourrez en émettre une nouvelle, avec un nouveau code.' }),
        champ({ id: 'aa-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Par exemple : transport interrompu, véhicule remplacé.' }),
      ],
      actions: [
        bouton({ libelle: 'Conserver', onClick: () => fermer() }),
        bouton({
          libelle: 'Annuler l’attestation', variante: 'primary',
          onClick: () => {
            try {
              annulerAttestation(ctx, att.id, document.getElementById('aa-motif')?.value);
              fermer();
              toast('Attestation annulée.');
              recharger(selection?.appariement.id);
            } catch (e) { afficherErreur(e); }
          },
        }),
      ],
    });
  }

  page.append(
    el('header.dut-page-header', {}, [
      el('div', {}, [
        el('span.dash-eyebrow', { text: 'VOS DOCUMENTS DE BORD' }),
        el('h1', { text: 'Attestations de bourse de fret' }),
        el('p', { text: 'L’attestation prouve qu’un transport a été conclu sur la plateforme. Imprimez-la et gardez-la à bord : elle se vérifie sur route par son QR code.' }),
      ]),
      el('span.dut-header-icon', { 'aria-hidden': 'true' }, [icone('qr-code', 30)]),
    ]),
    indicateurs,
    el('div.dut-workspace', {}, [
      el('aside.dut-panel.dut-sidebar', {}, [
        el('div.dut-list-heading', {}, [el('h2', { text: 'Transports conclus' }), compteur]),
        liste,
        el('p.dut-sidebar-note', {}, [icone('info', 17), 'Une attestation en vigueur par transport. L’annuler la rend invalide au contrôle.']),
      ]),
      detail,
    ]),
    el('p.dut-poc-note', { text: 'POC · L’attestation et ses vérifications sont conservées dans cette démonstration. Le QR code fonctionne avec n’importe quel lecteur.' }),
  );
  statistiques();
  afficherListe();
  afficherDetail();
  return page;
}
