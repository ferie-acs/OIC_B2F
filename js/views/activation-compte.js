/**
 * Lot b2 : organisation interne — activer son compte avec un code.
 *
 * Le code est émis par l'administrateur de l'entreprise (création d'un compte,
 * réinitialisation d'un accès) et part à l'adresse enregistrée du compte par la
 * messagerie unique (intégration). Il ne sert qu'une fois, expire au bout de
 * 24 heures, et le message d'échec ne dit jamais ce qui a échoué.
 *
 * @module views/activation-compte
 */

import { el } from '../core/dom.js';
import { afficherErreur, bandeau, bouton, champ, modale, toast } from '../core/ui.js';
import { activerCompte } from '../services/utilisateurs-entreprise.service.js';

const valeurDe = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.value ?? '';

/** Ouvre le formulaire d'activation. */
export function ouvrirActivation() {
  const fermer = modale({
    titre: 'Activer mon compte',
    corps: [
      el('p', {
        text:
          'Saisissez l’adresse de votre compte, le code reçu à cette adresse, puis le mot de ' +
          'passe de votre choix.',
      }),
      champ({ id: 'ac-mail', label: 'Adresse électronique', type: 'email', requis: true, attrs: { autocomplete: 'username' } }),
      champ({ id: 'ac-code', label: 'Code d’activation', requis: true, attrs: { autocomplete: 'one-time-code', placeholder: 'XXXX-XXXX' } }),
      el('div.field-row', {}, [
        champ({ id: 'ac-mdp', label: 'Nouveau mot de passe', type: 'password', requis: true, aide: 'Au moins 8 caractères, dont une lettre et un chiffre.', attrs: { autocomplete: 'new-password' } }),
        champ({ id: 'ac-mdp2', label: 'Confirmation', type: 'password', requis: true, attrs: { autocomplete: 'new-password' } }),
      ]),
      bandeau({
        ton: 'info',
        message: 'Le code ne sert qu’une fois. Tant que vous n’avez pas défini un nouveau mot de passe, l’ancien reste valable.',
      }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Enregistrer mon mot de passe',
        variante: 'primary',
        onClick: async () => {
          try {
            await activerCompte({
              email: valeurDe('ac-mail'),
              code: valeurDe('ac-code'),
              motDePasse: valeurDe('ac-mdp'),
              confirmation: valeurDe('ac-mdp2'),
            });
            const email = valeurDe('ac-mail');
            fermer();
            const champMail = /** @type {HTMLInputElement|null} */ (document.getElementById('login-mail'));
            if (champMail) champMail.value = email;
            toast('Votre mot de passe est enregistré. Vous pouvez vous connecter.');
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

/** Lien de l'écran de connexion. */
export function lienActivation() {
  return el('p.auth-public-link.auth-activation-link', {}, [
    el('span', { text: 'Vous avez reçu un code d’activation ? ' }),
    el('a', {
      href: '#/connexion',
      on: {
        click: (e) => {
          e.preventDefault();
          ouvrirActivation();
        },
      },
      text: 'Activer mon compte',
    }),
  ]);
}
