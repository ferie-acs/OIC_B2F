/**
 * Lot b5 : petits outils partagés par les écrans d'administration.
 *
 * @module views/admin-outils
 */

import { afficherErreur, el, icone, toast } from '../core/ui.js';

/** Réaffiche l'écran courant après une action. */
export const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/** Valeur d'un champ de formulaire de la modale ou de la page. */
export const valeurDe = (id) => document.getElementById(id)?.value ?? '';

/** Case cochée ? */
export const cocheDe = (id) => document.getElementById(id)?.checked === true;

/**
 * Exécute une action, ferme la modale, annonce le résultat et rafraîchit.
 * Une erreur est affichée explicitement, jamais avalée.
 * @param {() => any} action
 * @param {string} message
 * @param {(() => void)|null} [fermer]
 */
export async function agir(action, message, fermer = null) {
  try {
    const resultat = await action();
    fermer?.();
    if (message) toast(message);
    rafraichir();
    return resultat;
  } catch (e) {
    afficherErreur(e);
    return undefined;
  }
}

/**
 * Propose un fichier au téléchargement, construit dans le navigateur.
 * @param {string} nom
 * @param {string} contenu
 * @param {string} type Type MIME.
 */
export function telecharger(nom, contenu, type) {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Badge de l'état d'un compte ou d'une entreprise. `badge()` lirait la valeur
 * `actif` comme un abonnement : le libellé est donc posé ici.
 * @param {string} etat
 * @param {{actif?: string, inactif?: string}} [libelles]
 */
export function badgeEtat(etat, { actif = 'Actif', inactif = 'Désactivé' } = {}) {
  const ok = etat === 'actif';
  return el('span', { class: `badge ${ok ? 'badge-success' : 'badge-error'}` }, [
    icone(ok ? 'check-circle' : 'alert', 13),
    el('span', { text: ok ? actif : inactif }),
  ]);
}
