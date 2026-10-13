/**
 * États financiers et exports — paiements, abonnements et dépôts par période,
 * par mode de paiement, par objet et par canal.
 *
 * Lot b4. Ouvert sous `rapport.financier` (exploitant, superviseur comptabilité).
 * **Tout passe par la projection** : un profil qui lit la classification
 * `financier` sans la classification `identite` reçoit les montants, les numéros
 * de reçu et les modes, mais pas le nom des entreprises — la colonne « Client »
 * lui arrive vide, et l'export CSV aussi. La DGTTC n'a pas ce droit : aucun
 * montant ne lui est servi (arbitrage N3).
 *
 * @module services/rapport-financier.service
 */

import { EVENEMENT_AUDIT, MOTIF_OPERATION, SENS_OPERATION } from '../domain/enums.js';
import { CLASSIFICATION } from '../domain/schema.js';
import { peutLireClassification } from '../domain/permissions.js';
import {
  ETAT_PAIEMENT,
  aujourdhui,
  documentCsv,
  estDate,
  libelleFinance,
  totauxPar,
} from '../domain/finances.js';
import { exiger, projeter } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { nomProjete } from './contentieux.service.js';
import { etatEffectif } from './paiement.service.js';
import { dateFr } from './tarif.service.js';

/** Période par défaut : l'exercice en cours, du 1er janvier à aujourd'hui. */
export function periodeParDefaut(jour = aujourdhui()) {
  return { du: `${jour.slice(0, 4)}-01-01`, au: jour };
}

function filtresValides(f = {}) {
  const defaut = periodeParDefaut();
  const du = estDate(f.du) ? f.du : defaut.du;
  const au = estDate(f.au) ? f.au : defaut.au;
  if (du > au) throw new Error('La date de début de la période doit précéder sa date de fin.');
  return { du, au, mode: f.mode || '', objet: f.objet || '', canal: f.canal || '' };
}

/**
 * État financier d'une période.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{du?: string, au?: string, mode?: string, objet?: string, canal?: string}} [filtres]
 */
export function etatFinancier(ctx, filtres = {}) {
  exiger(ctx, 'rapport.financier');
  const f = filtresValides(filtres);
  const dansPeriode = (iso) => {
    const j = String(iso).slice(0, 10);
    return j >= f.du && j <= f.au;
  };

  const lignes = depot('paiement')
    .brutOu((p) => dansPeriode(p.saisiLe))
    .filter((p) => (!f.mode || p.mode === f.mode) && (!f.objet || p.objet === f.objet) && (!f.canal || p.canal === f.canal))
    .sort((a, b) => String(a.saisiLe).localeCompare(String(b.saisiLe)))
    .map((p) => {
      const v = projeter(ctx, 'paiement', p);
      return {
        id: p.id,
        numero: v.numero,
        date: v.saisiLe,
        client: nomProjete(ctx, p.groupementId),
        objet: v.objet,
        canal: v.canal,
        mode: v.mode,
        reference: v.referenceTransaction ?? null,
        montant: v.montant,
        etat: etatEffectif(p),
      };
    });

  const encaisses = lignes.filter((l) => l.etat === ETAT_PAIEMENT.ENCAISSE);
  const enAttente = lignes.filter((l) => l.etat === ETAT_PAIEMENT.EN_ATTENTE);
  const somme = (l) => l.reduce((n, x) => n + (x.montant ?? 0), 0);

  // Mouvements de compte de la période, agrégés : aucun groupement n'y figure.
  const operations = depot('operation')
    .brutOu((o) => dansPeriode(o.horodatage))
    .map((o) => projeter(ctx, 'operation', o))
    .filter((o) => typeof o.montant === 'number');
  const parMotif = (sens, motifs) =>
    operations.filter((o) => o.sens === sens && motifs.includes(o.motif)).reduce((n, o) => n + o.montant, 0);

  return {
    filtres: f,
    identiteVisible: peutLireClassification(ctx.roleId, CLASSIFICATION.IDENTITE),
    lignes,
    totaux: {
      encaisse: somme(encaisses),
      nombre: encaisses.length,
      enAttente: somme(enAttente),
      nombreEnAttente: enAttente.length,
      abonnements: somme(encaisses.filter((l) => l.objet === 'abonnement')),
      depots: somme(encaisses.filter((l) => l.objet === 'rechargement')),
      contentieux: somme(encaisses.filter((l) => l.objet === 'contentieux')),
    },
    parMode: totauxPar(encaisses, 'mode'),
    parObjet: totauxPar(encaisses, 'objet'),
    parCanal: totauxPar(encaisses, 'canal'),
    comptes: {
      credits: parMotif(SENS_OPERATION.CREDIT, [MOTIF_OPERATION.RECHARGEMENT]),
      fraisMiseEnRelation: parMotif(SENS_OPERATION.DEBIT, [
        MOTIF_OPERATION.FRAIS_MISE_EN_RELATION_AFFRETEUR,
        MOTIF_OPERATION.FRAIS_MISE_EN_RELATION_TRANSPORTEUR,
      ]),
      abonnementsDebites: parMotif(SENS_OPERATION.DEBIT, [MOTIF_OPERATION.ABONNEMENT]),
    },
  };
}

/** Libellé de la période, pour les titres et le journal. */
export const libellePeriode = (f) => `du ${dateFr(f.du)} au ${dateFr(f.au)}`;

/** Colonnes de l'export détaillé. */
export const COLONNES_EXPORT = Object.freeze([
  'N° de reçu', 'Date', 'Client', 'Objet', 'Canal', 'Mode', 'Référence', 'Montant (F CFA)', 'État',
]);

/** Lignes d'un état mises en forme pour l'export (CSV ou PDF). */
export function lignesExport(etat) {
  return etat.lignes.map((l) => [
    l.numero ?? '',
    String(l.date ?? '').slice(0, 10),
    etat.identiteVisible ? (l.client ?? '') : 'Non communiqué',
    l.objet ? libelleFinance(l.objet) : '',
    l.canal ? libelleFinance(l.canal) : '',
    l.mode ? libelleFinance(l.mode) : '',
    l.reference ?? '',
    l.montant ?? '',
    libelleFinance(l.etat),
  ]);
}

/**
 * Note un export au journal. Ni montant ni nom : le journal est lisible par la DGTTC.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} etat
 * @param {'CSV'|'PDF'} format
 */
export function journaliserExport(ctx, etat, format) {
  exiger(ctx, 'rapport.financier');
  stockageInterne().transaction((tx) => {
    journaliser(ctx, EVENEMENT_AUDIT.EXPORT_FINANCIER, {
      cibleType: 'rapport',
      details: `Export ${format} de l’état financier ${libellePeriode(etat.filtres)} — ${etat.lignes.length} ligne(s).`,
      tx,
    });
  });
}

/**
 * Export CSV de l'état, journalisé.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} [filtres]
 * @returns {{nomFichier: string, contenu: string}}
 */
export function exporterCsv(ctx, filtres = {}) {
  const etat = etatFinancier(ctx, filtres);
  const contenu = documentCsv(COLONNES_EXPORT, lignesExport(etat));
  journaliserExport(ctx, etat, 'CSV');
  return { nomFichier: `etat-financier-${etat.filtres.du}-${etat.filtres.au}.csv`, contenu };
}
