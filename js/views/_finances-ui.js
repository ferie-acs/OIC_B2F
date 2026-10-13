/**
 * Éléments d'écran partagés par les vues du lot b4 (finances).
 *
 * Rien de neuf dans la charte : badges, bandeaux, modales, récapitulatifs et
 * boutons de `core/ui.js`, classes CSS existantes. Ce module ne lit aucun dépôt.
 *
 * @module views/_finances-ui
 */

import { el, icone, montant } from '../core/dom.js';
import { afficherErreur, bandeau, bouton, fermerModale, modale, toast } from '../core/ui.js';
import {
  MODE_PAIEMENT,
  libelleFinance,
  masquerNumero,
  normaliserNumeroMobile,
  referenceTransactionSimulee,
  tonFinance,
} from '../domain/finances.js';
import { editerRecu } from '../services/recu.service.js';

/** Relance le rendu de la page courante. */
export const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/** Valeur d'un champ de formulaire de la page ou de la modale ouverte. */
export const valeur = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.value ?? '';

/** Badge d'un état du domaine des finances. */
export function pastille(etat) {
  const icones = { encaisse: 'check-circle', en_attente: 'clock', rejete: 'x', programmee: 'clock', appliquee: 'check', annulee: 'x', clos: 'check-circle' };
  return el('span', { class: `badge badge-${tonFinance(etat)}` }, [
    icone(icones[etat] ?? 'info', 13),
    el('span', { text: libelleFinance(etat) }),
  ]);
}

/** Grille de récapitulatif : `[libellé, valeur]`. */
export function recap(items) {
  return el(
    'div.recap-grid',
    {},
    items.filter(Boolean).map(([libelle, v]) =>
      el('div.recap-item', {}, [el('span', { text: libelle }), typeof v === 'object' && v ? el('strong', {}, [v]) : el('strong', { text: v ?? '—' })]),
    ),
  );
}

/**
 * Exécute une action, ferme la modale, annonce, rafraîchit — ou affiche l'erreur.
 * @param {() => any} action
 * @param {string} message
 * @param {(() => void)|null} [fermer]
 */
export function agir(action, message, fermer = null) {
  try {
    const r = action();
    fermer?.();
    if (message) toast(message);
    rafraichir();
    return r;
  } catch (e) {
    afficherErreur(e);
    return null;
  }
}

/** Bouton d'édition du reçu d'un paiement (original, puis duplicatas). */
export function boutonRecu(ctx, paiementId, libelle = 'Reçu') {
  return bouton({
    libelle,
    icone: 'printer',
    variante: 'ghost',
    onClick: async () => {
      try {
        const { rang } = await editerRecu(ctx, paiementId);
        toast(rang > 1 ? `Duplicata n° ${rang - 1} du reçu téléchargé.` : 'Reçu téléchargé.');
      } catch (e) {
        afficherErreur(e);
      }
    },
  });
}

/**
 * Propose un fichier texte au téléchargement.
 * @param {string} nom
 * @param {string} contenu
 * @param {string} type
 */
export function telechargerTexte(nom, contenu, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const lien = el('a', { href: url, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Lit et contrôle les champs mobile money d'un formulaire.
 * @param {string} prefixe Préfixe des identifiants (`<prefixe>-operateur`, `<prefixe>-numero`).
 * @returns {{operateur: string, numero: string}}
 */
export function lireMobile(prefixe) {
  const operateur = valeur(`${prefixe}-operateur`);
  const numero = valeur(`${prefixe}-numero`);
  if (!operateur) throw new Error('Choisissez l’opérateur de mobile money.');
  if (!normaliserNumeroMobile(numero)) throw new Error('Le numéro de mobile money doit compter dix chiffres et commencer par 01, 05 ou 07.');
  return { operateur, numero };
}

/**
 * Fenêtre de **paiement simulé**. Dit honnêtement ce qui se passerait dans le
 * service réel, et laisse choisir l'issue : confirmation ou refus du payeur.
 *
 * @param {{titre: string, objet: string, montant: number, mode: string, operateur?: string,
 *   numero?: string, surSucces: (reference: string) => void, surEchec: () => void}} p
 */
export function dialogueSimulation({ titre, objet, montant: somme, mode, operateur, numero, surSucces, surEchec }) {
  const mobile = mode === MODE_PAIEMENT.MOBILE_MONEY;
  const fermer = modale({
    titre,
    corps: [
      bandeau({
        ton: 'warn',
        titre: 'Paiement simulé',
        message: 'Aucun opérateur de paiement n’est appelé dans cette démonstration et aucune somme ne circule.',
      }),
      recap([
        ['Objet', objet],
        ['Montant', montant(somme)],
        ['Moyen', mobile ? libelleFinance(operateur) : libelleFinance(mode)],
        mobile ? ['Numéro débité', masquerNumero(normaliserNumeroMobile(numero))] : null,
      ]),
      el('p', {
        text: mobile
          ? 'Dans le service réel, le payeur reçoit une demande de paiement sur son téléphone et la confirme avec son code secret. Choisissez ce que fait le payeur :'
          : 'Dans le service réel, vous seriez dirigé vers la page sécurisée de votre banque : aucune donnée de carte n’est saisie sur la plateforme. Choisissez l’issue de la transaction :',
      }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Simuler un refus',
        variante: 'ghost',
        onClick: () => {
          fermer();
          surEchec();
        },
      }),
      bouton({
        libelle: 'Simuler la confirmation',
        variante: 'primary',
        icone: 'check',
        onClick: () => {
          const reference = referenceTransactionSimulee(mobile ? operateur : 'carte');
          fermerModale();
          surSucces(reference);
        },
      }),
    ],
  });
}

/**
 * Fenêtre de confirmation d'un paiement accepté, avec l'édition du reçu.
 * @param {any} ctx
 * @param {Record<string, any>} paiement
 * @param {string} message
 */
export function dialoguePaiementAccepte(ctx, paiement, message) {
  const fermer = modale({
    titre: 'Paiement accepté',
    corps: [
      bandeau({ ton: 'ok', message }),
      recap([
        ['Reçu n°', paiement.numero],
        ['Montant', montant(paiement.montant)],
        ['Référence de transaction', paiement.referenceTransaction ?? 'Débit du compte prépayé'],
        ['État', pastille(paiement.etat)],
      ]),
    ],
    actions: [boutonRecu(ctx, paiement.id, 'Imprimer le reçu'), bouton({ libelle: 'Fermer', variante: 'primary', onClick: () => fermer() })],
    surFermeture: rafraichir,
  });
}
