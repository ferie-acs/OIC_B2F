/**
 * Écran de connexion — il porte l'identité B2F.
 *
 * @module views/login
 */

import { el, icone } from '../core/dom.js';
import { champ, toast } from '../core/ui.js';
import { COMPTES_DEMO, MOT_DE_PASSE_DEMO } from '../seed.js';

/**
 * @param {(email: string, motDePasse: string) => Promise<void>} surConnexion
 * @returns {HTMLElement}
 */
export function login(surConnexion, { retour = '#/explorer', intention } = {}) {
  const soumettre = async () => {
    const email = /** @type {HTMLInputElement} */ (document.getElementById('login-mail'))?.value;
    const mdp = /** @type {HTMLInputElement} */ (document.getElementById('login-pwd'))?.value;
    if (!email || !mdp) {
      toast('Renseignez votre adresse et votre mot de passe.', 'err');
      return;
    }
    try {
      await surConnexion(email, mdp);
    } catch (e) {
      // Message unique et non discriminant : ne jamais révéler si une adresse
      // existe (spécification A.1).
      toast(e instanceof Error ? e.message : 'Identifiants incorrects.', 'err');
    }
  };

  const motDePasse = champ({
    id: 'login-pwd', label: 'Mot de passe', type: 'password', requis: true,
    attrs: { autocomplete: 'current-password', placeholder: 'Votre mot de passe' },
  });
  const bascule = el('button.auth-password-toggle', {
    type: 'button', text: 'Afficher', 'aria-label': 'Afficher le mot de passe',
    'aria-controls': 'login-pwd', 'aria-pressed': 'false',
    on: { click: () => {
      const input = motDePasse.querySelector('input');
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      bascule.textContent = visible ? 'Masquer' : 'Afficher';
      bascule.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      bascule.setAttribute('aria-pressed', String(visible));
    } },
  });
  motDePasse.classList.add('auth-password');
  motDePasse.append(bascule);

  const formulaire = el('form.auth-card', {
    on: {
      submit: (e) => {
        e.preventDefault();
        soumettre();
      },
    },
  }, [
    el('div.auth-card-brand', {}, [
      el('img', { src: 'assets/oic.jpeg', alt: 'OIC — Office Ivoirien des Chargeurs', width: 88, height: 56 }),
    ]),
    el('span.auth-eyebrow', { text: 'VOTRE ESPACE BOURSE DE FRET' }),
    el('h2', { text: 'Heureux de vous retrouver' }),
    el('p.auth-sub', { text: intention === 'camions'
      ? 'Connectez-vous comme affréteur pour retrouver le camion sélectionné.'
      : intention === 'frets' ? 'Connectez-vous comme transporteur pour retrouver le fret sélectionné.'
        : 'Accédez à l’espace de votre groupement.' }),
    champ({
      id: 'login-mail',
      label: 'Adresse électronique',
      type: 'email',
      requis: true,
      attrs: { autocomplete: 'username', placeholder: 'vous@entreprise.ci' },
    }),
    motDePasse,
    el('button.btn.btn-primary.btn-block.btn-lg', { type: 'submit', text: 'Se connecter' }),

    el('p.auth-public-link', {}, [
      el('span', { text: 'Envie de découvrir les offres ? ' }),
      el('a', { href: retour, text: 'Explorer le marché' }),
    ]),
    el('details.auth-demo', {}, [
    el('summary', {}, [icone('users', 17), el('span', { text: 'Essayer un compte de démonstration' })]),
    el('div.auth-demo-accounts', {}, [

    // Ces boutons **remplissent et soumettent** le formulaire : ils ne
    // contournent pas l'authentification (spécification A.1).
    ...COMPTES_DEMO.map((c) =>
      el('button.demo-account-btn', {
        type: 'button',
        on: {
          click: () => {
            document.getElementById('login-mail').value = c.email;
            document.getElementById('login-pwd').value = MOT_DE_PASSE_DEMO;
            soumettre();
          },
        },
      }, [
        el('span', {}, [el('strong', { text: c.titre }), el('small', { text: c.sous })]),
        icone('arrow-right', 16),
      ]),
    ),

    el('p.auth-note', {
      text:
        'Les comptes de démonstration partagent le mot de passe « ' +
        `${MOT_DE_PASSE_DEMO} ». Toutes les données sont fictives.`,
    }),
    ]),
    ]),
  ]);

  return el('div.auth-page.auth-refresh', {}, [
    el('header.auth-header', {}, [
      el('a.auth-brand-link', { href: '#/' }, [
        el('span.auth-brand-symbol', {}, [icone('truck', 24)]),
        el('span', {}, [el('strong', { text: 'Bourse de Fret' }), el('small', { text: 'Office Ivoirien des Chargeurs' })]),
      ]),
      el('a.auth-back', { href: retour }, [icone('arrow-left', 16), el('span', { text: 'Revenir au marché' })]),
    ]),
    el('div.auth-content', {}, [
      el('section.auth-visual', { 'aria-labelledby': 'auth-title' }, [
        el('img.auth-illustration', {
          src: 'assets/connexion-fret.png',
          alt: 'Un professionnel de la logistique organise le transport de marchandises avec un camion et des outils de mise en relation.',
          width: 1536, height: 1024, fetchpriority: 'high',
        }),
        el('span.auth-eyebrow', { text: 'LE BON FRET. LE BON TRANSPORTEUR.' }),
        el('h1', { id: 'auth-title' }, [
          'Ensemble, faisons', el('br'), 'avancer vos marchandises.',
        ]),
        el('p', { text: 'Chargeurs et transporteurs, retrouvez-vous au même endroit pour donner une nouvelle destination à vos activités.' }),
        el('div.auth-assurance', {}, [
          el('span', {}, [icone('package', 16), el('span', { text: 'Publiez votre fret' })]),
          el('span', {}, [icone('handshake', 16), el('span', { text: 'Trouvez votre partenaire' })]),
        ]),
      ]),
      el('div.auth-form-column', {}, [formulaire,
        el('p.auth-footer-note', {}, [icone('shield', 14), el('span', { text: 'La plateforme de mise en relation de l’OIC' })]),
      ]),
    ]),
    el('footer.auth-footer', { text: 'B2F · Bourse de Fret — Office Ivoirien des Chargeurs' }),
  ]);
}
