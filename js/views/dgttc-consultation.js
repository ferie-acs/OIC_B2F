/**
 * Lot b5 : compléments de consultation de la DGTTC — intermédiaires,
 * carte des acteurs, répartitions et exports par période. Aucune donnée financière : tout passe
 * par la projection du rôle et par des colonnes en liste positive.
 *
 * @module views/dgttc-consultation
 */

import { date, el } from '../core/dom.js';
import { bandeau, bouton, carte, champ, etatVide, kpi, tableau, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import * as dgttc from '../services/dgttc.service.js';
import { refDe } from './_donnees.js';
import { carteActeurs } from '../core/carte-acteurs.js';
import { badgeEtat, telecharger, valeurDe } from './admin-outils.js';

/** Période conservée entre deux rafraîchissements. */
const periode = { du: '', au: '' };

/** @param {any} ctx */
export function intermediairesVue(ctx) {
  const liste = dgttc.intermediaires(ctx);
  const recherche = el('input', { type: 'search', placeholder: 'Rechercher un nom, une entreprise…', 'aria-label': 'Rechercher un intermédiaire', on: { input: () => rendre() } });
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });
  const zone = el('div');
  function rendre() {
    const q = (recherche.value || '').trim().toLocaleLowerCase('fr');
    const visibles = liste.filter((i) => `${i.nom} ${i.mandant} ${i.role}`.toLocaleLowerCase('fr').includes(q));
    compteur.textContent = `${visibles.length} ligne(s)`;
    zone.replaceChildren(tableau({
      colonnes: ['Nom', 'Qualité', 'Pour le compte de', 'Localité', 'État', 'Inscrit le'],
      lignes: visibles.map((i) => [i.nom, i.role, i.mandant, refDe(i.localiteId), badgeEtat(i.etat), date(i.creeLe)]),
      vide: etatVide({ titre: 'Aucun intermédiaire', message: 'Aucun intermédiaire ne correspond à cette recherche.' }),
    }));
  }
  rendre();
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'signature',
      titre: 'Intermédiaires de fret et de transport',
      message:
        'Un intermédiaire agit pour le compte d’une entreprise inscrite, sans engager ses finances. ' +
        'Son identité vous est servie ; ses coordonnées ne le sont pas.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Intermédiaires', valeur: new Set(liste.map((i) => i.groupementId)).size, icon: 'users' }), // Intégration : entreprises distinctes
      kpi({ libelle: 'Intermédiaires de fret', valeur: liste.filter((i) => i.mandantType === 'affreteur').length, icon: 'package' }),
      kpi({ libelle: 'Intermédiaires de transport', valeur: liste.filter((i) => i.mandantType === 'transporteur').length, icon: 'truck' }),
    ]),
    carte({ titre: 'Liste des intermédiaires', corps: [el('div.declarations-toolbar', {}, [recherche]), compteur, zone] }),
  ]);
}

/** Barre de période commune aux deux écrans. */
function barrePeriode(apres) {
  return el('div.field-row', {}, [
    champ({ id: 'per-du', label: 'Du', type: 'date', valeur: periode.du }),
    champ({ id: 'per-au', label: 'Au', type: 'date', valeur: periode.au }),
    bouton({
      libelle: 'Appliquer la période', variante: 'secondary',
      onClick: () => {
        periode.du = valeurDe('per-du');
        periode.au = valeurDe('per-au');
        apres();
      },
    }),
  ]);
}

const pourcent = (n, total) => (total ? `${Math.round((n / total) * 100)} %` : '—');

/** @param {any} ctx */
export function repartitionsVue(ctx) {
  let r;
  try {
    r = dgttc.repartitions(ctx, periode);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Période invalide.', 'err');
    periode.du = ''; periode.au = '';
    r = dgttc.repartitions(ctx, periode);
  }
  const t = r.totaux;
  const acteurs = t.transporteurs + t.affreteurs + t.intermediaires;
  const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
  const carteGeo = carteActeurs(r.parLocalite);
  return el('div.page.supervision-page', {}, [
    carte({
      titre: 'Période d’inscription',
      sousTitre: periode.du || periode.au
        ? `Acteurs et véhicules inscrits du ${periode.du ? date(periode.du) : 'début'} au ${periode.au ? date(periode.au) : 'jour'}.`
        : 'Toutes les inscriptions. Choisissez une période pour restreindre.',
      corps: [barrePeriode(rafraichir)],
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Transporteurs', valeur: t.transporteurs, icon: 'truck' }),
      kpi({ libelle: 'Affréteurs', valeur: t.affreteurs, icon: 'package' }),
      kpi({ libelle: 'Intermédiaires', valeur: t.intermediaires, icon: 'users' }),
      kpi({ libelle: 'Véhicules au parc', valeur: t.vehicules, icon: 'truck' }),
    ]),
    carte({
      titre: 'Carte des acteurs',
      sousTitre: 'Entreprises et intermédiaires, regroupés au centre de la ville qu’ils ont déclarée.',
      corps: [
        carteGeo.element,
        el('p.dash-map-note', {
          text: 'Localisation à la ville, sans adresse ni position GPS. ' + (carteGeo.horsCarte
            ? `${carteGeo.horsCarte} acteur(s) déclarés dans une localité hors du fond de carte figurent dans le tableau ci-dessous.`
            : 'Toutes les localités déclarées figurent sur la carte.'),
        }),
      ],
    }),
    carte({
      titre: 'Répartition géographique des acteurs',
      sousTitre: 'Localité déclarée de l’entreprise ; pour un véhicule, son lieu de stationnement déclaré.',
      corps: [tableau({
        colonnes: ['Localité', 'Transporteurs', 'Affréteurs', 'Intermédiaires', 'Véhicules', 'Part des acteurs'],
        lignes: r.parLocalite.map((l) => [l.localite, String(l.transporteurs), String(l.affreteurs), String(l.intermediaires), String(l.vehicules),
          pourcent(l.transporteurs + l.affreteurs + l.intermediaires, acteurs)]),
        vide: etatVide({ titre: 'Aucun acteur', message: 'Aucune inscription sur cette période.' }),
      })],
    }),
    el('div.card-grid.grid-2', {}, [
      carte({
        titre: 'Parc par carrosserie',
        corps: [tableau({
          colonnes: ['Carrosserie', 'Véhicules', 'Part'],
          lignes: r.parCarrosserie.map((c) => [c.libelle, String(c.nombre), pourcent(c.nombre, t.vehicules)]),
          vide: etatVide({ titre: 'Aucun véhicule', message: 'Aucun véhicule sur cette période.' }),
        })],
      }),
      carte({
        titre: 'Transporteurs par taille de parc',
        corps: [tableau({
          colonnes: ['Taille du parc', 'Transporteurs', 'Part'],
          lignes: r.parTailleDeParc.map((c) => [c.libelle, String(c.nombre), pourcent(c.nombre, t.transporteurs)]),
        })],
      }),
    ]),
    carte({
      titre: 'Contrôle des dossiers de transporteur',
      corps: [tableau({
        colonnes: ['État du dossier', 'Transporteurs', 'Part'],
        lignes: r.parVerification.map((c) => [c.libelle, String(c.nombre), pourcent(c.nombre, t.transporteurs)]),
        vide: etatVide({ titre: 'Aucun transporteur', message: 'Aucun transporteur sur cette période.' }),
      })],
    }),
  ]);
}

/** @param {any} ctx */
export function exportsVue(ctx) {
  const droit = decider(ctx, 'export.donnees');
  const disponibles = Object.entries(dgttc.EXPORTS).filter(([, d]) => decider(ctx, d.droit).autorise);
  const exporter = (type) => {
    try {
      periode.du = valeurDe('per-du');
      periode.au = valeurDe('per-au');
      const f = dgttc.exporterCsv(ctx, type, periode);
      telecharger(f.nom, f.contenu, 'text/csv;charset=utf-8');
      toast(`Export prêt : ${f.lignes} ligne(s).`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export impossible.', 'err');
    }
  };
  const apercu = (type) => {
    try { return String(dgttc.donneesExport(ctx, type, periode).lignes.length); } catch { return '—'; }
  };
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'signature',
      titre: 'Exports sans donnée financière',
      message:
        'Chaque export reprend des colonnes fixées à l’avance : ni solde, ni montant, ni prix déclaré, ni coordonnée. ' +
        'Le fichier s’ouvre dans un tableur. Chaque export est inscrit au journal d’audit.',
    }),
    carte({
      titre: 'Période',
      sousTitre: 'Bornes incluses. Laissez une borne vide pour ne pas la limiter.',
      corps: [barrePeriode(() => globalThis.dispatchEvent(new HashChangeEvent('hashchange')))],
    }),
    carte({
      titre: 'Exports disponibles',
      corps: [tableau({
        colonnes: ['Liste', 'Filtrée sur', 'Lignes sur la période', ''],
        lignes: disponibles.map(([type, d]) => [
          d.libelle, d.libelleDate, apercu(type),
          bouton({ libelle: 'Exporter (CSV)', variante: 'secondary', icone: 'download', motif: droit.autorise ? null : droit.explication, onClick: () => exporter(type) }),
        ]),
        vide: etatVide({ titre: 'Aucun export', message: 'Votre rôle ne dispose d’aucune liste exportable.' }),
      })],
    }),
  ]);
}
