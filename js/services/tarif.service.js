/**
 * Catalogue de tarifs — modification avec date d'effet, historique et trace.
 *
 * Lot b4. Le droit `tarif.modifier` existait sans écran ni service. Une
 * modification :
 * - prend effet **à sa date** : le jour même, elle s'applique tout de suite ;
 *   plus tard, elle est programmée et s'applique à sa date ;
 * - n'est **jamais rétroactive** : une période d'abonnement déjà payée garde son
 *   montant et son échéance, un encaissement saisi garde le prix du jour de la
 *   saisie ;
 * - est **historisée** (montant et durée avant / après, auteur, motif) et
 *   **journalisée** — sans montant dans le journal, lisible par la DGTTC.
 *
 * Sans tâche planifiée, les modifications échues sont appliquées au démarrage et
 * à chaque lecture du catalogue par ce lot (`appliquerRevisionsEchues`).
 *
 * @module services/tarif.service
 */

import { identifiant } from '../core/crypto.js';
import { EVENEMENT_AUDIT } from '../domain/enums.js';
import { ETAT_REVISION, aujourdhui, defautsRevision, revisionEchue } from '../domain/finances.js';
import { exiger, projeter, projeterListe } from '../domain/access.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { CONTEXTE_PLATEFORME, journaliser } from './audit.service.js';

/** Un tarif est une formule d'abonnement s'il porte une durée. */
export const estFormule = (t) => Number.isInteger(t?.dureeMois) && t.dureeMois > 0;

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`, pour les libellés et le journal. */
export const dateFr = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '—');

/**
 * Applique les modifications programmées dont la date d'effet est atteinte.
 * Action de la plateforme, journalisée comme telle.
 * @param {Date} [maintenant]
 * @returns {number} Nombre de modifications appliquées.
 */
export function appliquerRevisionsEchues(maintenant = new Date()) {
  const jour = aujourdhui(maintenant);
  const echues = depot('revisionTarif')
    .brutOu((r) => revisionEchue(r, jour))
    .sort((a, b) => (a.effetLe === b.effetLe ? a.creeLe.localeCompare(b.creeLe) : a.effetLe.localeCompare(b.effetLe)));
  if (echues.length === 0) return 0;

  const horodatage = new Date(maintenant).toISOString();
  stockageInterne().transaction((tx) => {
    for (const r of echues) {
      const t = depot('tarif').brutParId(r.tarifId);
      if (!t) continue;
      depot('tarif').modifier(
        t.id,
        {
          montant: r.montantApres,
          ...(r.dureeMoisApres ? { dureeMois: r.dureeMoisApres } : {}),
          modifieLe: horodatage,
          modifieParUtilisateurId: r.auteurUtilisateurId ?? undefined,
        },
        { tx },
      );
      depot('revisionTarif').modifier(r.id, { etat: ETAT_REVISION.APPLIQUEE, appliqueeLe: horodatage }, { tx });
      journaliser(CONTEXTE_PLATEFORME, EVENEMENT_AUDIT.TARIF_MODIFIE, {
        cibleType: 'tarif',
        cibleId: t.id,
        details: `Tarif « ${t.libelle} » : modification programmée appliquée à sa date d’effet (${dateFr(r.effetLe)}).`,
        tx,
      });
    }
  });
  return echues.length;
}

/**
 * Catalogue projeté, à jour des modifications échues.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function catalogue(ctx) {
  appliquerRevisionsEchues();
  const revisions = depot('revisionTarif').brutOu((r) => r.etat === ETAT_REVISION.PROGRAMMEE);
  return depot('tarif')
    .lisiblesPar(ctx, 'tarif.lire')
    .map((t) => ({
      ...t,
      formule: estFormule(t),
      programmee: projeterOuNul(ctx, revisions.find((r) => r.tarifId === t.id)),
    }));
}

const projeterOuNul = (ctx, r) => (r ? projeter(ctx, 'revisionTarif', r) : null);

/**
 * Historique des modifications, des plus récentes aux plus anciennes.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function historiqueTarifs(ctx) {
  exiger(ctx, 'tarif.lire');
  const liste = depot('revisionTarif')
    .brutTous()
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  return projeterListe(ctx, 'revisionTarif', liste);
}

/**
 * Modifie un tarif à une date d'effet.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} tarifId
 * @param {{montant: number, dureeMois?: number|null, effetLe: string, motif: string}} demande
 * @param {{maintenant?: Date}} [options]
 * @returns {Record<string, any>} La modification, appliquée ou programmée.
 */
export function modifierTarif(ctx, tarifId, demande, { maintenant = new Date() } = {}) {
  exiger(ctx, 'tarif.modifier', {});
  const t = depot('tarif').brutParId(tarifId);
  if (!t) throw new Error('Tarif introuvable.');
  const jour = aujourdhui(maintenant);
  const formule = estFormule(t);
  const m = {
    montant: Number(demande.montant),
    dureeMois: formule ? Number(demande.dureeMois) : null,
    effetLe: String(demande.effetLe ?? ''),
    motif: String(demande.motif ?? '').trim(),
  };
  const defauts = defautsRevision(m, { estFormule: formule, jour });
  if (defauts.length) throw new Error(defauts.join(' '));
  if (m.montant === t.montant && (!formule || m.dureeMois === t.dureeMois)) {
    throw new Error('Le montant et la durée sont inchangés : il n’y a rien à modifier.');
  }
  if (depot('revisionTarif').brutOu((r) => r.tarifId === t.id && r.etat === ETAT_REVISION.PROGRAMMEE).length) {
    throw new Error(
      'Une modification de ce tarif est déjà programmée. Annulez-la d’abord : deux ' +
        'modifications en attente sur le même tarif rendraient le prix à venir ambigu.',
    );
  }

  const immediate = m.effetLe === jour;
  const horodatage = new Date(maintenant).toISOString();
  return stockageInterne().transaction((tx) => {
    const revision = depot('revisionTarif').creer(
      {
        id: identifiant('rvt'),
        tarifId: t.id,
        montantAvant: t.montant,
        montantApres: m.montant,
        ...(formule ? { dureeMoisAvant: t.dureeMois, dureeMoisApres: m.dureeMois } : {}),
        effetLe: m.effetLe,
        motif: m.motif.slice(0, 300),
        etat: immediate ? ETAT_REVISION.APPLIQUEE : ETAT_REVISION.PROGRAMMEE,
        creeLe: horodatage,
        auteurUtilisateurId: ctx.utilisateurId,
        ...(immediate ? { appliqueeLe: horodatage } : {}),
        demo: true,
      },
      { tx },
    );
    if (immediate) {
      depot('tarif').modifier(
        t.id,
        {
          montant: m.montant,
          ...(formule ? { dureeMois: m.dureeMois } : {}),
          modifieLe: horodatage,
          modifieParUtilisateurId: ctx.utilisateurId,
        },
        { tx },
      );
    }
    // Ni montant ni motif au journal : il est lisible par la DGTTC, et un motif
    // libre finirait par porter un chiffre.
    journaliser(ctx, immediate ? EVENEMENT_AUDIT.TARIF_MODIFIE : EVENEMENT_AUDIT.TARIF_PROGRAMME, {
      cibleType: 'tarif',
      cibleId: t.id,
      details: immediate
        ? `Tarif « ${t.libelle} » modifié avec effet immédiat. Les abonnements en cours ne sont pas modifiés.`
        : `Modification du tarif « ${t.libelle} » programmée au ${dateFr(m.effetLe)}.`,
      tx,
    });
    return revision;
  });
}

/**
 * Annule une modification programmée, avant sa date d'effet.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} revisionId
 */
export function annulerProgrammation(ctx, revisionId) {
  exiger(ctx, 'tarif.modifier', {});
  const r = depot('revisionTarif').brutParId(revisionId);
  if (!r) throw new Error('Modification introuvable.');
  if (r.etat !== ETAT_REVISION.PROGRAMMEE) {
    throw new Error('Seule une modification encore programmée peut être annulée : celle-ci est déjà en vigueur ou annulée.');
  }
  const t = depot('tarif').brutParId(r.tarifId);
  return stockageInterne().transaction((tx) => {
    const annulee = depot('revisionTarif').modifier(
      r.id,
      { etat: ETAT_REVISION.ANNULEE, annuleeLe: new Date().toISOString(), annuleeParUtilisateurId: ctx.utilisateurId },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.TARIF_PROGRAMMATION_ANNULEE, {
      cibleType: 'tarif',
      cibleId: r.tarifId,
      details: `Modification programmée du tarif « ${t?.libelle ?? r.tarifId} » annulée avant sa date d’effet.`,
      tx,
    });
    return annulee;
  });
}
