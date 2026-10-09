/**
 * Dépôt générique — applique le schéma, refuse ce qui ne s'y conforme pas.
 *
 * C'est ici que l'écart délibéré n° 4 devient effectif. Quand l'intégrité repose
 * seulement sur la discipline du code appelant, toute anomalie applicative
 * corrompt silencieusement les données. Ici, une écriture non conforme **lève**.
 *
 * ## Position dans l'architecture
 *
 * `VUE → SERVICE → REPOSITORY → LOCALSTORAGE`. Ce module est le seul à appeler
 * `core/storage.js`, lui-même seul à toucher LocalStorage. Aucune vue, aucun
 * service ne lit le stockage directement.
 *
 * ## Lecture : rien ne sort sans être projeté
 *
 * Les méthodes de lecture prennent un contexte et rendent des objets **projetés**
 * par `access.js`. C'est le point de contrôle n° 1 demandé par l'audit pour J3 :
 * un dépôt ne rend jamais un objet brut à un appelant. Les méthodes `brut*` sont
 * réservées aux services qui doivent lire pour décider — jamais pour afficher.
 *
 * @module repositories/repository
 */

import { exiger, projeter } from '../domain/access.js';
import { champsManquantsPourRole } from '../domain/permissions.js';
import { ENTITES, entite } from '../domain/schema.js';
import { identifiant } from '../core/crypto.js';

/**
 * Erreur de validation. Porte la liste des manquements, pour que l'interface
 * puisse les afficher champ par champ au lieu d'un « formulaire invalide ».
 */
export class ErreurValidation extends Error {
  /**
   * @param {string} nomEntite
   * @param {string[]} manquements
   */
  constructor(nomEntite, manquements) {
    super(
      `« ${nomEntite} » refusé : ${manquements.length} manquement(s). ` +
        manquements.join(' · '),
    );
    this.name = 'ErreurValidation';
    this.entite = nomEntite;
    this.manquements = manquements;
  }
}

/**
 * Vérifie un objet contre la définition de son entité.
 *
 * @param {string} nomEntite
 * @param {Record<string, any>} objet
 * @param {{ partiel?: boolean }} [options] `partiel` ignore les champs requis
 *   absents — pour une mise à jour de quelques champs.
 * @returns {string[]} Manquements. Vide si conforme.
 */
export function valider(nomEntite, objet, options = {}) {
  const def = entite(nomEntite);
  /** @type {string[]} */
  const manquements = [];

  for (const [nom, d] of Object.entries(def.champs)) {
    const v = objet[nom];
    const absent = v === undefined || v === null || v === '';

    if (absent) {
      if (d.requis && !options.partiel) manquements.push(`« ${nom} » est obligatoire`);
      continue;
    }

    if (d.valeurs && !d.valeurs.includes(v)) {
      manquements.push(`« ${nom} » vaut « ${v} », hors des valeurs admises`);
    }
    if ((d.type === 'number' || d.type === 'integer') && typeof v !== 'number') {
      manquements.push(`« ${nom} » doit être un nombre`);
    }
    if (d.type === 'integer' && typeof v === 'number' && !Number.isInteger(v)) {
      manquements.push(`« ${nom} » doit être un entier`);
    }
    if (d.type === 'boolean' && typeof v !== 'boolean') {
      manquements.push(`« ${nom} » doit être un booléen`);
    }
    if (d.type === 'array' && !Array.isArray(v)) {
      manquements.push(`« ${nom} » doit être une liste`);
    }
    // Les bornes déclarées sur les éléments d'un tableau s'appliquent aussi :
    // sans cela, `lignes[].poidsT` échappait au schéma (QA-M2).
    if (d.elements && Array.isArray(v)) {
      v.forEach((element, i) => {
        for (const [sousNom, sd] of Object.entries(d.elements)) {
          const sv = element?.[sousNom];
          if (sv === undefined || sv === null || sv === '') continue;
          if (typeof sd.max === 'number' && typeof sv === 'number' && sv > sd.max) {
            manquements.push(`« ${nom}[${i + 1}].${sousNom} » dépasse le maximum (${sd.max})`);
          }
          if (typeof sd.min === 'number' && typeof sv === 'number' && sv < sd.min) {
            manquements.push(`« ${nom}[${i + 1}].${sousNom} » est en deçà du minimum (${sd.min})`);
          }
        }
      });
    }
    if (typeof d.min === 'number') {
      const mesure = Array.isArray(v) ? v.length : typeof v === 'number' ? v : String(v).length;
      if (mesure < d.min) manquements.push(`« ${nom} » est en deçà du minimum (${d.min})`);
    }
    if (typeof d.max === 'number' && typeof v === 'string' && v.length > d.max) {
      manquements.push(`« ${nom} » dépasse ${d.max} caractères`);
    }
    if (typeof d.max === 'number' && typeof v === 'number' && v > d.max) {
      manquements.push(`« ${nom} » dépasse le maximum admis (${d.max})`);
    }
  }

  // Invariants locaux, déclarés au schéma. On ne s'arrête pas au premier : un
  // formulaire doit pouvoir signaler tous ses défauts d'un coup.
  if (!options.partiel) {
    for (const inv of def.invariants) {
      let ok = false;
      try {
        ok = inv.verifier(objet);
      } catch {
        ok = false; // un invariant qui ne sait pas s'évaluer échoue.
      }
      if (!ok) manquements.push(inv.message);
    }
  }

  return manquements;
}

/**
 * Crée un dépôt pour une entité.
 *
 * @param {string} nomEntite
 * @param {ReturnType<import('../core/storage.js').creerStockage>} stockage
 */
export function creerDepot(nomEntite, stockage) {
  const def = entite(nomEntite);
  const collection = def.collection;

  /** @returns {Array<Record<string, any>>} */
  const brutTous = () => stockage.lire(collection);

  /**
   * Vérifie l'intégrité référentielle d'un objet contre les autres collections.
   * Le système existant n'a aucune clé étrangère : c'est ici qu'elles existent.
   *
   * @param {Record<string, any>} objet
   * @param {(c: string) => Array<Record<string, any>>} lecteur
   * @returns {string[]}
   */
  function validerReferences(objet, lecteur) {
    /** @type {string[]} */
    const manquements = [];
    verifierNiveau(def.champs, objet, '', manquements, lecteur);
    return manquements;
  }

  /**
   * Vérifie les références d'un niveau, puis **descend dans les sous-structures**.
   *
   * Correctif QA-06. La vérification ne parcourait que les champs de premier
   * niveau : une ligne de marchandise référençant un produit SH inexistant
   * était acceptée, et l'écran affichait ensuite « — ». C'était un trou dans
   * l'écart délibéré n° 4 — « intégrité des données explicite » — qui est
   * précisément un argument de la refonte face au système existant, lequel n'a
   * aucune clé étrangère.
   *
   * @param {Record<string, any>} champs
   * @param {Record<string, any>} valeurs
   * @param {string} prefixe Chemin lisible, pour que le message désigne la ligne.
   * @param {string[]} manquements
   * @param {(c: string) => Array<Record<string, any>>} lecteur
   */
  function verifierNiveau(champs, valeurs, prefixe, manquements, lecteur) {
    for (const [nom, d] of Object.entries(champs)) {
      const v = valeurs?.[nom];
      const chemin = prefixe ? `${prefixe}.${nom}` : nom;

      if (d.ref && d.ref !== 'role' && v !== undefined && v !== null && v !== '') {
        const cible = ENTITES[d.ref];
        if (cible && !lecteur(cible.collection).some((o) => o.id === v)) {
          manquements.push(`« ${chemin} » référence un ${d.ref} inexistant (${v})`);
        }
      }

      if (d.champs && v && typeof v === 'object' && !Array.isArray(v)) {
        verifierNiveau(d.champs, v, chemin, manquements, lecteur);
      }
      if (d.elements && Array.isArray(v)) {
        v.forEach((el, i) => {
          if (el && typeof el === 'object') {
            verifierNiveau(d.elements, el, `${chemin}[${i + 1}]`, manquements, lecteur);
          }
        });
      }
    }
  }

  /**
   * Vérifie l'unicité des champs qui la déclarent.
   * @param {Record<string, any>} objet
   * @param {Array<Record<string, any>>} existants
   * @returns {string[]}
   */
  function validerUnicite(objet, existants) {
    /** @type {string[]} */
    const manquements = [];
    for (const [nom, d] of Object.entries(def.champs)) {
      if (!d.unique || nom === 'id') continue;
      const v = objet[nom];
      if (v === undefined || v === null || v === '') continue;
      if (existants.some((o) => o.id !== objet.id && o[nom] === v)) {
        manquements.push(`« ${nom} » doit être unique : « ${v} » existe déjà`);
      }
    }
    return manquements;
  }

  return Object.freeze({
    nomEntite,
    collection,

    /* -------------------------------------------------------------- *
     * Lecture projetée — ce que les vues consomment
     * -------------------------------------------------------------- */

    /**
     * Objets visibles du contexte, projetés.
     * @param {import('../domain/access.js').Contexte} ctx
     * @param {string} droit Droit de lecture exigé, ex. `'declaration.lire'`.
     * @param {(o: Record<string, any>) => boolean} [filtre]
     * @returns {Array<Record<string, any>>}
     */
    lisiblesPar(ctx, droit, filtre = () => true) {
      const { portee } = exiger(ctx, droit, undefined);
      const proprietaire = def.proprietaire;

      return brutTous()
        .filter(filtre)
        .filter((o) => {
          if (portee === 'tout') return true;
          const g = proprietaire ? o[proprietaire] : o.groupementId;
          return g != null && g === ctx.groupementId;
        })
        .map((o) => projeter(ctx, nomEntite, o));
    },

    /**
     * Un objet par identifiant, projeté, ou `null`.
     * @param {import('../domain/access.js').Contexte} ctx
     * @param {string} id
     * @param {{proprietaireId?: string|null}} [options]
     * @returns {Record<string, any>|null}
     */
    lire(ctx, id, options = {}) {
      const o = brutTous().find((x) => x.id === id);
      return o ? projeter(ctx, nomEntite, o, options) : null;
    },

    /* -------------------------------------------------------------- *
     * Lecture brute — pour les services qui décident, jamais pour afficher
     * -------------------------------------------------------------- */

    /** @returns {Array<Record<string, any>>} */
    brutTous,

    /**
     * @param {string} id
     * @returns {Record<string, any>|undefined}
     */
    brutParId: (id) => brutTous().find((o) => o.id === id),

    /**
     * @param {(o: Record<string, any>) => boolean} predicat
     * @returns {Array<Record<string, any>>}
     */
    brutOu: (predicat) => brutTous().filter(predicat),

    /* -------------------------------------------------------------- *
     * Écriture
     * -------------------------------------------------------------- */

    /**
     * Insère un objet après validation complète.
     *
     * @param {Record<string, any>} objet
     * @param {{roleAuteur?: string, tx?: any}} [options] `tx` : contexte de
     *   transaction, pour joindre cette écriture à un lot atomique.
     * @returns {Record<string, any>} L'objet inséré, avec son identifiant.
     * @throws {ErreurValidation}
     */
    creer(objet, options = {}) {
      const lecteur = options.tx ? (c) => options.tx.lire(c) : (c) => stockage.lire(c);
      const complet = { id: objet.id ?? identifiant(nomEntite.slice(0, 3)), ...objet };

      const manquements = [
        ...valider(nomEntite, complet),
        ...validerReferences(complet, lecteur),
        ...validerUnicite(complet, lecteur(collection)),
        ...(options.roleAuteur
          ? champsManquantsPourRole(options.roleAuteur, nomEntite, complet).map(
              (c) => `« ${c} » est obligatoire pour votre rôle`,
            )
          : []),
      ];
      if (manquements.length) throw new ErreurValidation(nomEntite, manquements);

      const liste = [...lecteur(collection), complet];
      if (options.tx) options.tx.ecrire(collection, liste);
      else stockage.ecrire(collection, liste);
      return complet;
    },

    /**
     * Met à jour un objet. Les champs absents de `modifs` sont conservés.
     *
     * @param {string} id
     * @param {Record<string, any>} modifs
     * @param {{tx?: any}} [options]
     * @returns {Record<string, any>}
     */
    modifier(id, modifs, options = {}) {
      const lecteur = options.tx ? (c) => options.tx.lire(c) : (c) => stockage.lire(c);
      const liste = lecteur(collection);
      const i = liste.findIndex((o) => o.id === id);
      if (i === -1) throw new ErreurValidation(nomEntite, [`Objet introuvable : ${id}`]);

      if (def.appendOnly) {
        throw new Error(
          `« ${nomEntite} » est en ajout seul : aucune modification n'est développée. ` +
            "C'est une garantie du POC, pas une limitation à contourner.",
        );
      }

      const fusionne = { ...liste[i], ...modifs };
      const manquements = [
        ...valider(nomEntite, fusionne),
        ...validerReferences(fusionne, lecteur),
        ...validerUnicite(fusionne, liste),
      ];
      if (manquements.length) throw new ErreurValidation(nomEntite, manquements);

      const suivante = [...liste];
      suivante[i] = fusionne;
      if (options.tx) options.tx.ecrire(collection, suivante);
      else stockage.ecrire(collection, suivante);
      return fusionne;
    },

    /**
     * Supprime un objet, si rien ne le référence en `restrict`.
     * @param {string} id
     * @param {{tx?: any}} [options]
     */
    supprimer(id, options = {}) {
      if (def.appendOnly) {
        throw new Error(`« ${nomEntite} » est en ajout seul : aucune suppression.`);
      }
      const lecteur = options.tx ? (c) => options.tx.lire(c) : (c) => stockage.lire(c);

      // Intégrité référentielle entrante : on refuse d'orpheliner.
      for (const [autreNom, autre] of Object.entries(ENTITES)) {
        for (const [champ, d] of Object.entries(autre.champs)) {
          if (d.ref !== nomEntite || (d.onDelete ?? 'restrict') !== 'restrict') continue;
          const bloquant = lecteur(autre.collection).find((o) => o[champ] === id);
          if (bloquant) {
            throw new ErreurValidation(nomEntite, [
              `Suppression refusée : un ${autreNom} (${bloquant.id}) y fait référence.`,
            ]);
          }
        }
      }

      const suivante = lecteur(collection).filter((o) => o.id !== id);
      if (options.tx) options.tx.ecrire(collection, suivante);
      else stockage.ecrire(collection, suivante);
    },
  });
}
