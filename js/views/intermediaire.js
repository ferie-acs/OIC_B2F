/**
 * Lot b2 : organisation interne — l'espace de l'entreprise intermédiaire.
 *
 * L'intermédiaire voit ses mandants et ce que chacun attend, puis **agit au nom
 * de l'un d'eux** : la session bascule dans le contexte délégué du mandat, et
 * les écrans habituels de l'affréteur ou du transporteur s'ouvrent, bornés par
 * le périmètre confié. Un bandeau, sur chaque écran, rappelle au nom de qui il
 * agit et ramène à cet espace.
 *
 * @module views/intermediaire
 */

import { date, el } from '../core/dom.js';
import { afficherErreur, badge, bandeau, bouton, carte, etatVide, kpi, tableau, toast } from '../core/ui.js';
import { aller } from '../core/router.js';
import { routeAccueil } from '../core/nav.js';
import { STATUT_MANDAT, TYPE_GROUPEMENT, labelOf } from '../domain/enums.js';
import { depot } from '../repositories/index.js';
import { refDe } from './_donnees.js';
import { abonnementDe } from '../services/auth.service.js';
import * as mandats from '../services/mandat.service.js';
import { badgeMandat, listePerimetre, periode } from './organisation.js';

/**
 * Ouvre le contexte délégué et conduit à l'accueil de l'espace du mandant.
 * @param {any} ctx
 * @param {{id: string, mandant: string}} m
 */
function agirPour(ctx, m) {
  try {
    const delegue = mandats.agirPourMandant(ctx, m.id);
    toast(`Vous agissez au nom de ${m.mandant}.`);
    aller(routeAccueil(delegue));
  } catch (e) {
    afficherErreur(e);
  }
}

/** Ce que le mandant attend, en une phrase. */
function aTraiter(m) {
  if (m.statut !== STATUT_MANDAT.EN_VIGUEUR) return '—';
  const parts = [];
  if (m.aRepondre) parts.push(`${m.aRepondre} réservation(s) à examiner`);
  if (m.demandesOuvertes) parts.push(`${m.demandesOuvertes} demande(s) publiée(s)`);
  if (m.aValider) parts.push(`${m.aValider} acceptée(s), à valider par le mandant`);
  if (!parts.length && m.enCours) parts.push(`${m.enCours} mise(s) en relation en cours`);
  return parts.join(' · ') || 'Rien en attente';
}

/** Bouton d'action d'un mandat, désactivé et expliqué quand il ne peut pas servir. */
function boutonAgir(ctx, m, variante = 'primary') {
  return bouton({
    libelle: 'Agir en son nom',
    variante,
    icone: 'log-in',
    motif: m.peutAgir ? null : m.motifRefus,
    onClick: () => agirPour(ctx, m),
  });
}

/* ================================================================== *
 * Tableau de bord
 * ================================================================== */

/** @param {any} ctx */
export function dashboard(ctx) {
  const liste = mandats.mesMandants(ctx);
  const enVigueur = liste.filter((m) => m.statut === STATUT_MANDAT.EN_VIGUEUR);
  const somme = (cle) => enVigueur.reduce((n, m) => n + (m[cle] ?? 0), 0);
  const entreprise = depot('groupement').lire(ctx, ctx.groupementId, { proprietaireId: ctx.groupementId });

  return el('div.page.transport-dashboard', {}, [
    el('header.dash-page-heading', {}, [
      el('div', {}, [
        el('span.dash-eyebrow', { text: 'ESPACE INTERMÉDIAIRE' }),
        el('h1', { text: 'Tableau de bord' }),
        el('p', { text: `Agissez pour vos mandants, dans le périmètre que chacun vous confie · ${entreprise?.raisonSociale ?? ''}` }),
      ]),
    ]),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Mandants en vigueur', valeur: enVigueur.length, icon: 'briefcase' }),
      kpi({ libelle: 'Réservations à examiner', valeur: somme('aRepondre'), icon: 'inbox' }),
      kpi({ libelle: 'Mises en relation en cours', valeur: somme('enCours'), icon: 'handshake' }),
      kpi({ libelle: 'À valider par les mandants', valeur: somme('aValider'), icon: 'check-circle' }),
    ]),
    somme('aRepondre') > 0
      ? bandeau({
          ton: 'warn',
          titre: `${somme('aRepondre')} réservation(s) attendent une réponse`,
          message:
            'Sans réponse sous 48 heures, une réservation expire et le véhicule revient sur le ' +
            'marché. Ouvrez l’espace du transporteur concerné pour répondre.',
        })
      : null,
    bandeau({
      ton: 'info',
      message:
        'Vous préparez et vous répondez au nom de vos mandants. La validation des mises en ' +
        'relation, qui débite leurs frais, leur reste réservée ; les coordonnées des ' +
        'contreparties ne sont transmises qu’à eux.',
    }),
    carte({
      titre: 'Vos mandants en vigueur',
      sousTitre: 'Choisissez un mandant pour ouvrir son espace, dans la limite de son mandat.',
      corps: [
        tableau({
          colonnes: ['Mandant', 'Périmètre confié', 'À traiter', ''],
          lignes: enVigueur.map((m) => [
            el('span.user-cell', {}, [
              el('strong', { text: m.mandant }),
              el('small', { text: `${labelOf(m.typeMandant)} · mandat ${m.reference}` }),
              el('small', { text: `Jusqu’au ${date(m.finitLe)}` }),
            ]),
            listePerimetre(m.perimetre),
            aTraiter(m),
            boutonAgir(ctx, m),
          ]),
          vide: etatVide({
            titre: 'Aucun mandat en vigueur',
            message: 'Un affréteur ou un transporteur vous désigne depuis son espace : son mandat apparaîtra ici.',
          }),
        }),
      ],
    }),
  ]);
}

/* ================================================================== *
 * Mandants
 * ================================================================== */

/** @param {any} ctx */
export function mandants(ctx) {
  const liste = mandats.mesMandants(ctx);
  const filtre = el('select', { 'aria-label': 'Filtrer les mandats', on: { change: rendre } }, [
    ['', 'Tous les mandats'],
    [STATUT_MANDAT.EN_VIGUEUR, 'En vigueur'],
    [STATUT_MANDAT.A_VENIR, 'À venir'],
    [STATUT_MANDAT.ECHU, 'Échus'],
    [STATUT_MANDAT.RETIRE, 'Retirés'],
  ].map(([value, text]) => el('option', { value, text })));
  const recherche = el('input', {
    type: 'search',
    placeholder: 'Rechercher un mandant…',
    'aria-label': 'Rechercher un mandant',
    on: { input: rendre },
  });
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });
  const zone = el('div');

  function rendre() {
    const q = (recherche.value || '').trim().toLocaleLowerCase('fr');
    const visibles = liste.filter((m) =>
      `${m.mandant} ${m.reference}`.toLocaleLowerCase('fr').includes(q) && (!filtre.value || m.statut === filtre.value));
    compteur.textContent = `${visibles.length} mandat(s)`;
    zone.replaceChildren(tableau({
      colonnes: ['Mandant', 'Périmètre confié', 'Période', 'À traiter', ''],
      lignes: visibles.map((m) => [
        el('span.user-cell', {}, [
          el('strong', { text: m.mandant }),
          el('small', { text: `${labelOf(m.typeMandant)} · ${refDe(m.mandantLocaliteId)}` }),
          el('small', { text: `Mandat ${m.reference}` }),
        ]),
        listePerimetre(m.perimetre),
        el('span.badge-stack', {}, [badgeMandat(m.statut), el('small', { text: periode(m) })]),
        aTraiter(m),
        boutonAgir(ctx, m, 'secondary'),
      ]),
      vide: etatVide({ titre: 'Aucun mandat', message: 'Aucun mandat ne correspond à votre recherche.' }),
    }));
  }
  rendre();

  const affreteurs = liste.filter((m) => m.statut === STATUT_MANDAT.EN_VIGUEUR && m.typeMandant === TYPE_GROUPEMENT.AFFRETEUR).length;
  const transporteurs = liste.filter((m) => m.statut === STATUT_MANDAT.EN_VIGUEUR && m.typeMandant === TYPE_GROUPEMENT.TRANSPORTEUR).length;
  return el('div.page.supervision-page.organisation-page', {}, [
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Affréteurs mandants', valeur: affreteurs, icon: 'package' }),
      kpi({ libelle: 'Transporteurs mandants', valeur: transporteurs, icon: 'truck' }),
      kpi({ libelle: 'Mandats retirés ou échus', valeur: liste.filter((m) => [STATUT_MANDAT.RETIRE, STATUT_MANDAT.ECHU].includes(m.statut)).length, icon: 'history' }),
    ]),
    bandeau({
      ton: 'info',
      message:
        'Chaque mandant choisit ce qu’il vous confie et pour quelle période. Il peut retirer son ' +
        'mandat à tout moment : vous perdez alors aussitôt l’accès à son espace.',
    }),
    carte({
      titre: 'Mes mandants',
      sousTitre: 'Les entreprises qui vous ont désigné comme intermédiaire de fret.',
      corps: [el('div.declarations-toolbar', {}, [recherche, filtre]), compteur, zone],
    }),
  ]);
}

/* ================================================================== *
 * Fiche de l'entreprise intermédiaire
 * ================================================================== */

/** @param {any} ctx */
export function ficheEntreprise(ctx) {
  const g = depot('groupement').lire(ctx, ctx.groupementId, { proprietaireId: ctx.groupementId });
  if (!g) return etatVide({ message: 'Aucune entreprise rattachée à votre compte.' });
  const abo = abonnementDe(ctx.groupementId);
  const item = (libelle, valeur) => el('div.recap-item', {}, [el('span', { text: libelle }), typeof valeur === 'string' ? el('strong', { text: valeur }) : el('strong', {}, [valeur])]);

  return el('div.page', {}, [
    carte({
      titre: 'Fiche de l’entreprise',
      sousTitre: 'Les informations de votre entreprise sur la plateforme.',
      corps: [
        el('div.recap-grid', {}, [
          item('Raison sociale', g.raisonSociale ?? '—'),
          item('Type', labelOf(g.type)),
          item('RCCM', g.rccm ?? '—'),
          item('Compte contribuable', g.compteContribuable ?? '—'),
          item('Pays', g.pays ?? '—'),
          item('Localité', refDe(g.localiteId)),
          item('État', badge(g.etat)),
          item('Abonnement', abo.finitLe ? `${abo.actif ? 'Actif' : 'Expiré'} — échéance ${date(abo.finitLe)}` : 'Aucun'),
        ]),
      ],
    }),
    bandeau({
      ton: 'info',
      message:
        'La vérification du dossier d’un intermédiaire et la mise à jour de sa fiche relèvent de ' +
        'l’agent d’activation des inscriptions.',
    }),
  ]);
}
