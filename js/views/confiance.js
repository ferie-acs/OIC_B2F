/**
 * Rendu du profil de confiance — ce qui s'affiche **à la place du nom** de la
 * contrepartie tant que la mise en relation n'est pas validée (correctifs
 * anti-fraude n° 1 et n° 2).
 *
 * @module views/confiance
 */

import { date, el, icone } from '../core/dom.js';
import { confianceDe } from './_donnees.js';

/**
 * Résumé en une ligne : « Transporteur vérifié · 12 transports · 4,6/5 (8 avis) ».
 * @param {ReturnType<typeof confianceDe>} p
 * @returns {string}
 */
export function resumeConfiance(p) {
  const morceaux = [];
  if (p.verifie === true) morceaux.push('Transporteur vérifié');
  if (p.verifie === false) morceaux.push('Transporteur non vérifié');
  morceaux.push(`${p.transportsRealises} transport${p.transportsRealises > 1 ? 's' : ''} réalisé${p.transportsRealises > 1 ? 's' : ''}`);
  morceaux.push(p.note == null ? 'pas encore noté' : `${String(p.note).replace('.', ',')}/5 (${p.nombreAvis} avis)`);
  return morceaux.join(' · ');
}

/**
 * Bloc de confiance d'une contrepartie.
 * @param {string|null|undefined} groupementId
 * @param {{compact?: boolean}} [options]
 * @returns {HTMLElement}
 */
export function blocConfiance(groupementId, options = {}) {
  const p = confianceDe(groupementId);
  if (options.compact) {
    return el('span.confiance-ligne', {}, [
      p.verifie === true ? icone('shield', 14) : null,
      resumeConfiance(p),
    ]);
  }
  return el('div.confiance', { role: 'group', 'aria-label': 'Profil de confiance de la contrepartie' }, [
    el('div.confiance-tete', {}, [
      icone(p.verifie === false ? 'alert' : 'shield', 18),
      el('strong', {
        text:
          p.verifie === true
            ? 'Transporteur vérifié par la plateforme'
            : p.verifie === false
              ? 'Transporteur non vérifié'
              : 'Profil de la contrepartie',
      }),
    ]),
    el('ul.confiance-faits', {}, [
      el('li', { text: `${p.transportsRealises} transport${p.transportsRealises > 1 ? 's' : ''} réalisé${p.transportsRealises > 1 ? 's' : ''} sur la plateforme` }),
      el('li', { text: p.note == null ? 'Pas encore d’avis' : `Note moyenne ${String(p.note).replace('.', ',')}/5 sur ${p.nombreAvis} avis` }),
      p.membreDepuis ? el('li', { text: `Inscrit depuis le ${date(p.membreDepuis)}` }) : null,
    ]),
    options.soi ? null : el('p.confiance-note', {
      text:
        'Le nom et les coordonnées vous sont transmis à la validation, après règlement ' +
        'des frais par les deux parties.',
    }),
  ]);
}
