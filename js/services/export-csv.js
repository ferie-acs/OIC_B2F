/**
 * Construction d'un fichier CSV — pure, sans entrée-sortie.
 *
 * Séparateur point-virgule et marque d'ordre des octets : le fichier s'ouvre
 * tel quel dans un tableur réglé en français. Une cellule qui commencerait par
 * `=`, `+`, `-` ou `@` est neutralisée : ouverte dans un tableur, elle serait
 * sinon interprétée comme une formule (injection de formule).
 *
 * @module services/export-csv
 */

const SEPARATEUR = ';';

/** @param {unknown} valeur @returns {string} */
export function celluleCsv(valeur) {
  let texte = valeur === null || valeur === undefined ? '' : String(valeur);
  if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  if (/[";\n\r]/.test(texte)) texte = `"${texte.replace(/"/g, '""')}"`;
  return texte;
}

/**
 * @param {string[]} colonnes
 * @param {Array<Array<unknown>>} lignes
 * @returns {string}
 */
export function versCsv(colonnes, lignes) {
  const corps = [colonnes, ...lignes].map((l) => l.map(celluleCsv).join(SEPARATEUR)).join('\r\n');
  return `﻿${corps}\r\n`;
}

/**
 * Période d'export : bornes incluses, au jour près. Une borne absente est ouverte.
 * @param {{du?: string, au?: string}} periode
 * @returns {(iso: string|undefined) => boolean}
 */
export function dansPeriode({ du, au } = {}) {
  const debut = du ? new Date(`${du}T00:00:00`) : null;
  const fin = au ? new Date(`${au}T23:59:59.999`) : null;
  if (debut && fin && fin < debut) throw new Error('La fin de la période précède son début.');
  return (iso) => {
    if (!iso) return false;
    const t = new Date(iso);
    return (!debut || t >= debut) && (!fin || t <= fin);
  };
}

/** Date courte JJ/MM/AAAA, pour les cellules. */
export function dateCsv(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
}
