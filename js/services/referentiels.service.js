/**
 * Référentiels nationaux : les nomenclatures que le schéma déclare (localités,
 * nomenclature SH des marchandises, capacités, carrosseries, essieux,
 * emballages), jusqu'ici seulement semées.
 *
 * L'exploitant ajoute, modifie, désactive et réactive une valeur. **Aucune
 * suppression** : une valeur utilisée par un véhicule, une demande ou une
 * entreprise doit rester lisible dans l'historique. Désactiver la retire des
 * nouvelles saisies sans toucher à ce qui existe.
 *
 * @module services/referentiels.service
 */

import { identifiant } from '../core/crypto.js';
import { exiger } from '../domain/access.js';
import { EVENEMENT_AUDIT } from '../domain/enums.js';
import { ENTITES, entite } from '../domain/schema.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { RefusAdministration, texteControle } from './admin-commun.js';

/** Familles déclarées au schéma, avec leur libellé d'écran. */
export const FAMILLES = Object.freeze({
  localites: { libelle: 'Villes et localités', singulier: 'localité', prefixe: 'loc' },
  produits_sh: { libelle: 'Catégories de marchandises (SH)', singulier: 'catégorie de marchandise', prefixe: 'sh' },
  carrosseries: { libelle: 'Carrosseries', singulier: 'carrosserie', prefixe: 'car' },
  capacites: { libelle: 'Capacités de véhicule', singulier: 'capacité', prefixe: 'cap' },
  essieux: { libelle: 'Nombre d’essieux', singulier: 'configuration d’essieux', prefixe: 'ess' },
  emballages: { libelle: 'Conditionnements', singulier: 'conditionnement', prefixe: 'emb' },
});

// Garde-fou : les familles de l'écran sont exactement celles du schéma.
{
  const schema = entite('referentiel').champs.famille.valeurs;
  for (const f of schema) if (!FAMILLES[f]) throw new Error(`Famille de référentiel sans écran : « ${f} ».`);
}

/**
 * Nombre d'usages d'une valeur dans les autres entités, sous-structures comprises.
 * @param {string} id
 * @returns {number}
 */
export function usagesDe(id) {
  let n = 0;
  for (const [nom, def] of Object.entries(ENTITES)) {
    if (nom === 'referentiel') {
      n += depot('referentiel').brutOu((r) => r.parentId === id).length;
      continue;
    }
    const directs = Object.entries(def.champs).filter(([, c]) => c.ref === 'referentiel').map(([k]) => k);
    const imbriques = Object.entries(def.champs)
      .filter(([, c]) => c.elements)
      .map(([k, c]) => [k, Object.entries(c.elements).filter(([, e]) => e.ref === 'referentiel').map(([s]) => s)])
      .filter(([, s]) => s.length);
    if (!directs.length && !imbriques.length) continue;
    for (const o of depot(nom).brutTous()) {
      if (directs.some((k) => o[k] === id)) n += 1;
      for (const [k, sous] of imbriques) {
        if ((o[k] ?? []).some((e) => sous.some((s) => e?.[s] === id))) n += 1;
      }
    }
  }
  return n;
}

/**
 * Valeurs d'une famille, avec leur nombre d'usages.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} famille
 */
export function valeursDe(ctx, famille) {
  exiger(ctx, 'referentiel.gerer', { groupementId: ctx.groupementId ?? null });
  if (!FAMILLES[famille]) throw new RefusAdministration('Référentiel inconnu.');
  return depot('referentiel')
    .brutOu((r) => r.famille === famille)
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
    .map((r) => ({ ...r, usages: usagesDe(r.id) }));
}

/** Code normalisé : minuscules, chiffres et tirets. */
function codeDe(valeur) {
  return String(valeur ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Ajoute une valeur à une famille.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{famille: string, code?: string, libelle: string, parentId?: string}} saisie
 */
export function ajouterValeur(ctx, { famille, code, libelle, parentId }) {
  exiger(ctx, 'referentiel.gerer', { groupementId: ctx.groupementId ?? null });
  if (!FAMILLES[famille]) throw new RefusAdministration('Référentiel inconnu.');
  const texte = texteControle(libelle, 'Libellé', { min: 2, max: 160 });
  const c = codeDe(code || texte);
  if (!c || c.length > 40) throw new RefusAdministration('Le code compte de 1 à 40 lettres, chiffres ou tirets.');
  const memes = depot('referentiel').brutOu((r) => r.famille === famille);
  if (memes.some((r) => r.code === c)) throw new RefusAdministration('Ce code existe déjà dans ce référentiel.');
  if (memes.some((r) => r.libelle.toLocaleLowerCase('fr') === texte.toLocaleLowerCase('fr'))) {
    throw new RefusAdministration('Ce libellé existe déjà dans ce référentiel.');
  }
  if (parentId) {
    const p = depot('referentiel').brutParId(parentId);
    if (!p || p.famille !== famille) throw new RefusAdministration('Le rattachement doit appartenir au même référentiel.');
  }
  let id = `${FAMILLES[famille].prefixe}-${c}`;
  if (depot('referentiel').brutParId(id)) id = identifiant(FAMILLES[famille].prefixe);
  return stockageInterne().transaction((tx) => {
    const r = depot('referentiel').creer({ id, famille, code: c, libelle: texte, parentId: parentId || undefined, actif: true }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.REFERENTIEL_AJOUTE, {
      cibleType: 'referentiel', cibleId: id, details: `${FAMILLES[famille].libelle} : « ${texte} » ajouté.`, tx,
    });
    return r;
  });
}

/**
 * Modifie le libellé d'une valeur. Le code, clé stable, ne change pas.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {{libelle: string}} saisie
 */
export function modifierValeur(ctx, id, { libelle }) {
  exiger(ctx, 'referentiel.gerer', { groupementId: ctx.groupementId ?? null });
  const r = depot('referentiel').brutParId(id);
  if (!r) throw new RefusAdministration('Valeur introuvable.');
  const texte = texteControle(libelle, 'Libellé', { min: 2, max: 160 });
  if (texte === r.libelle) throw new RefusAdministration('Aucune modification à enregistrer.');
  if (depot('referentiel').brutOu((x) => x.famille === r.famille && x.id !== id && x.libelle.toLocaleLowerCase('fr') === texte.toLocaleLowerCase('fr')).length) {
    throw new RefusAdministration('Ce libellé existe déjà dans ce référentiel.');
  }
  stockageInterne().transaction((tx) => {
    depot('referentiel').modifier(id, { libelle: texte }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.REFERENTIEL_MODIFIE, {
      cibleType: 'referentiel', cibleId: id, details: `${FAMILLES[r.famille].libelle} : « ${r.libelle} » renommé « ${texte} ».`, tx,
    });
  });
}

/**
 * Désactive ou réactive une valeur. Une valeur désactivée reste lisible là où
 * elle est employée, mais n'est plus proposée dans les nouvelles saisies.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 * @param {boolean} actif
 */
export function changerActivation(ctx, id, actif) {
  exiger(ctx, 'referentiel.gerer', { groupementId: ctx.groupementId ?? null });
  const r = depot('referentiel').brutParId(id);
  if (!r) throw new RefusAdministration('Valeur introuvable.');
  if (r.actif === actif) throw new RefusAdministration(actif ? 'Cette valeur est déjà active.' : 'Cette valeur est déjà désactivée.');
  if (!actif && r.famille === 'localites') {
    const restantes = depot('referentiel').brutOu((x) => x.famille === 'localites' && x.actif && x.id !== id).length;
    if (restantes < 2) throw new RefusAdministration('Au moins deux localités actives sont nécessaires pour déclarer un trajet.');
  }
  stockageInterne().transaction((tx) => {
    depot('referentiel').modifier(id, { actif }, { tx });
    journaliser(ctx, actif ? EVENEMENT_AUDIT.REFERENTIEL_REACTIVE : EVENEMENT_AUDIT.REFERENTIEL_DESACTIVE, {
      cibleType: 'referentiel', cibleId: id,
      details: `${FAMILLES[r.famille].libelle} : « ${r.libelle} » ${actif ? 'réactivé' : 'désactivé'}.`, tx,
    });
  });
}

/**
 * Suppression : refusée dès qu'une valeur est employée. Offerte seulement pour
 * une valeur saisie par erreur et jamais utilisée.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} id
 */
export function supprimerValeur(ctx, id) {
  exiger(ctx, 'referentiel.gerer', { groupementId: ctx.groupementId ?? null });
  const r = depot('referentiel').brutParId(id);
  if (!r) throw new RefusAdministration('Valeur introuvable.');
  const n = usagesDe(id);
  if (n > 0) {
    throw new RefusAdministration(`Cette valeur est utilisée (${n} fois) : elle ne peut pas être supprimée. Désactivez-la pour la retirer des nouvelles saisies.`);
  }
  stockageInterne().transaction((tx) => {
    depot('referentiel').supprimer(id, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.REFERENTIEL_SUPPRIME, {
      cibleType: 'referentiel', cibleId: id, details: `${FAMILLES[r.famille].libelle} : « ${r.libelle} » supprimé (jamais utilisé).`, tx,
    });
  });
}
