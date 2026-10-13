/**
 * Pages publiques du lot b1 : inscription d'une entreprise, mot de passe
 * oublié, boîte de réception simulée.
 *
 * Elles reprennent le gabarit de l'écran de connexion (`views/login.js`) : même
 * en-tête, même colonne de formulaire, même pied de page.
 *
 * @module views/acces-public
 */

import { dateHeure, el, icone } from '../core/dom.js';
import { bandeau, bouton, champ, etatVide, toast } from '../core/ui.js';
import { aller } from '../core/router.js';
import { routeAccueil } from '../core/nav.js';
import { labelOf } from '../domain/enums.js';
import {
  CHAMPS_ENTREPRISE,
  CHAMPS_RESPONSABLE,
  LONGUEUR_MIN_MOT_DE_PASSE,
  TYPES_INSCRIPTION,
  piecesDuType,
  typeInscription,
} from '../domain/inscription.js';
import { depot } from '../repositories/index.js';
import { connecter } from '../services/auth.service.js';
import { inscrire } from '../services/inscription.service.js';
import { boiteSimulee as lireBoite } from '../services/messagerie.service.js';
import { demanderReinitialisation, reinitialiserMotDePasse } from '../services/profil.service.js';

/* ================================================================== *
 * Gabarit commun — celui de la connexion
 * ================================================================== */

function pageAcces({ eyebrow, titre, texte, carte }) {
  return el('div.auth-page.auth-refresh', {}, [
    el('header.auth-header', {}, [
      el('a.auth-brand-link', { href: '#/' }, [
        el('span.auth-brand-symbol', {}, [icone('truck', 24)]),
        el('span', {}, [el('strong', { text: 'Bourse de Fret' }), el('small', { text: 'Office Ivoirien des Chargeurs' })]),
      ]),
      el('a.auth-back', { href: '#/connexion' }, [icone('arrow-left', 16), el('span', { text: 'Revenir à la connexion' })]),
    ]),
    el('div.auth-content', {}, [
      el('section.auth-visual', { 'aria-labelledby': 'acces-titre' }, [
        el('img.auth-illustration', {
          src: 'assets/connexion-fret.png',
          alt: 'Un professionnel de la logistique organise le transport de marchandises.',
          width: 1536, height: 1024,
        }),
        el('span.auth-eyebrow', { text: eyebrow }),
        el('h1', { id: 'acces-titre', text: titre }),
        el('p', { text: texte }),
      ]),
      el('div.auth-form-column', {}, [carte,
        el('p.auth-footer-note', {}, [icone('shield', 14), el('span', { text: 'La plateforme de mise en relation de l’OIC' })]),
      ]),
    ]),
    el('footer.auth-footer', { text: 'B2F · Bourse de Fret — Office Ivoirien des Chargeurs' }),
  ]);
}

/** Bandeau honnête : rien ne part réellement. */
function noteSimulation(texte) {
  return el('p.auth-note', {}, [
    el('span', { text: `${texte} ` }),
    el('a', { href: '#/boite-simulee', text: 'Ouvrir la boîte de réception simulée' }),
  ]);
}

/** Champ décrit par la configuration de l'inscription. */
function champConfig(c, valeur) {
  if (c.type === 'select') {
    return champ({
      id: `insc-${c.nom}`, label: c.libelle, requis: c.requis, aide: c.aide, valeur,
      options: depot('referentiel').brutOu((r) => r.famille === c.famille && r.actif)
        .map((r) => ({ valeur: r.id, libelle: r.libelle })),
      attrs: { name: c.nom },
    });
  }
  return champ({
    id: `insc-${c.nom}`, label: c.libelle, type: c.type ?? 'text', requis: c.requis, aide: c.aide, valeur,
    attrs: { name: c.nom, maxlength: c.max, autocomplete: c.type === 'email' ? 'email' : c.type === 'tel' ? 'tel' : 'off' },
  });
}

function stepper(etapes, courante) {
  return el('div.stepper-h', {}, etapes.flatMap((t, i) => [
    i > 0 ? el('span', { class: `stepper-h-connector${i < courante ? ' done' : ''}` }) : null,
    el('div', { class: `stepper-h-step${i + 1 < courante ? ' done' : ''}${i + 1 === courante ? ' current' : ''}` }, [
      el('span.dot', {}, [i + 1 < courante ? icone('check', 12) : el('span', { text: String(i + 1) })]),
      el('span.label', { text: t }),
    ]),
  ].filter(Boolean)));
}

/* ================================================================== *
 * Inscription d'une entreprise
 * ================================================================== */

const ETAPES = ['Activité', 'Entreprise', 'Responsable'];

/**
 * @param {{type?: string}} [params] `type` : type présélectionné (depuis une annonce du marché).
 * @returns {HTMLElement}
 */
export function inscription(params = {}) {
  /** @type {Record<string, any>} */
  const saisie = { type: TYPES_INSCRIPTION.some((t) => t.type === params.type) ? params.type : '', pays: 'Côte d’Ivoire' };
  const carte = el('div.auth-card.b1-inscription');

  const rendre = (etape) => {
    const erreurs = el('div', { role: 'alert', 'aria-live': 'polite' });
    const corps = etape === 1 ? etapeType() : etape === 2 ? etapeEntreprise() : etapeResponsable();
    const form = el('form', { novalidate: false }, [
      stepper(ETAPES, etape),
      ...corps,
      erreurs,
      el('div.b1-auth-actions', {}, [
        etape > 1 ? bouton({ libelle: 'Précédent', icone: 'arrow-left', onClick: () => { collecter(form); rendre(etape - 1); } }) : null,
        bouton({ libelle: etape < 3 ? 'Continuer' : 'Créer le compte de mon entreprise', variante: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      collecter(form);
      if (etape === 1 && !saisie.type) {
        erreurs.replaceChildren(bandeau({ ton: 'err', message: 'Choisissez le type de votre entreprise.' }));
        return;
      }
      if (etape < 3) { rendre(etape + 1); return; }
      try {
        const { email } = await inscrire(saisie);
        const ctx = await connecter(email, saisie.motDePasse);
        toast('Inscription enregistrée. Déposez maintenant les pièces de votre dossier.');
        aller(routeAccueil(ctx));
      } catch (err) {
        erreurs.replaceChildren(bandeau({ ton: 'err', message: err instanceof Error ? err.message : 'L’inscription a échoué.' }));
        erreurs.querySelector('.alert-banner')?.scrollIntoView?.({ block: 'center' });
      }
    });
    carte.replaceChildren(
      el('div.auth-card-brand', {}, [el('img', { src: 'assets/oic.jpeg', alt: 'OIC — Office Ivoirien des Chargeurs', width: 88, height: 56 })]),
      el('span.auth-eyebrow', { text: 'INSCRIPTION DE VOTRE ENTREPRISE' }),
      el('h2', { text: ['Votre activité', 'Votre entreprise', 'Responsable et accès'][etape - 1] }),
      el('p.auth-sub', { text: [
        'Choisissez le type d’entreprise que vous inscrivez.',
        'Ces informations figurent sur vos documents officiels.',
        'Le responsable devient le premier utilisateur du compte.',
      ][etape - 1] }),
      form,
      el('p.auth-public-link', {}, [el('span', { text: 'Votre entreprise est déjà inscrite ? ' }), el('a', { href: '#/connexion', text: 'Se connecter' })]),
    );
    carte.querySelector('input, select')?.focus({ preventScroll: true });
  };

  function collecter(form) {
    for (const [cle, valeur] of new FormData(form).entries()) saisie[cle] = valeur;
    if (form.querySelector('#insc-attestation')) saisie.attestation = form.querySelector('#insc-attestation').checked;
  }

  function etapeType() {
    return [
      el('fieldset.b1-choix', {}, [
        el('legend.sr-only', { text: 'Type d’entreprise' }),
        ...TYPES_INSCRIPTION.map((t) => el('label.radio-row', {}, [
          el('input', { type: 'radio', name: 'type', value: t.type, required: true, checked: saisie.type === t.type || undefined }),
          el('span.label-body', {}, [el('strong', { text: t.libelle }), el('span', { text: t.description })]),
        ])),
      ]),
      saisie.type ? piecesAPrevoir(saisie.type) : null,
    ];
  }

  function etapeEntreprise() {
    const def = typeInscription(saisie.type);
    return [
      ...CHAMPS_ENTREPRISE.map((c) => champConfig(c, saisie[c.nom])),
      el('p.wizard-section-label', { text: def.libelle }),
      ...def.champs.map((c) => champConfig(c, saisie[c.nom])),
      piecesAPrevoir(saisie.type),
    ];
  }

  function etapeResponsable() {
    return [
      ...CHAMPS_RESPONSABLE.map((c) => champConfig(c, saisie[c.nom])),
      champ({
        id: 'insc-motDePasse', label: 'Mot de passe', type: 'password', requis: true,
        aide: `Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères, dont une lettre et un chiffre.`,
        attrs: { name: 'motDePasse', autocomplete: 'new-password', minlength: LONGUEUR_MIN_MOT_DE_PASSE },
      }),
      champ({
        id: 'insc-confirmation', label: 'Confirmation du mot de passe', type: 'password', requis: true,
        attrs: { name: 'confirmation', autocomplete: 'new-password' },
      }),
      el('label.checkbox-row', {}, [
        el('input', { type: 'checkbox', id: 'insc-attestation', required: true, checked: saisie.attestation === true || undefined }),
        el('span.label-body', {}, [
          el('strong', { text: 'J’atteste l’exactitude des informations transmises' }),
          el('span', { text: 'Elles seront contrôlées par l’OIC sur la base des pièces de votre dossier.' }),
        ]),
      ]),
      noteSimulation('Un courriel d’accusé de réception vous sera envoyé. Dans cette démonstration, il est simulé.'),
    ];
  }

  rendre(1);
  return pageAcces({
    eyebrow: 'REJOIGNEZ LA BOURSE DE FRET',
    titre: 'Inscrivez votre entreprise.',
    texte:
      'Affréteurs, transporteurs et intermédiaires de fret : créez votre compte, déposez les pièces de ' +
      'votre dossier, et l’OIC active votre accès après contrôle.',
    carte,
  });
}

/** Rappel des pièces à préparer, tiré de la configuration du type. */
function piecesAPrevoir(type) {
  const pieces = piecesDuType(type);
  return el('div.b1-pieces-prevues', {}, [
    el('strong', { text: 'Pièces à préparer' }),
    el('ul', {}, pieces.map((p) => el('li', { text: `${p.libelle}${p.requise ? '' : ' (facultative)'}` }))),
    el('small', { text: 'Vous les déposerez après la création du compte, dans l’espace « Mon dossier ».' }),
  ]);
}

/* ================================================================== *
 * Mot de passe oublié
 * ================================================================== */

/** @returns {HTMLElement} */
export function motDePasseOublie() {
  const carte = el('div.auth-card');
  let adresse = '';

  const enTete = (titre, sous) => [
    el('div.auth-card-brand', {}, [el('img', { src: 'assets/oic.jpeg', alt: 'OIC — Office Ivoirien des Chargeurs', width: 88, height: 56 })]),
    el('span.auth-eyebrow', { text: 'RÉCUPÉRATION DE VOTRE ACCÈS' }),
    el('h2', { text: titre }),
    el('p.auth-sub', { text: sous }),
  ];

  const etapeDemande = () => {
    const form = el('form', {}, [
      champ({
        id: 'mdp-adresse', label: 'Adresse électronique de connexion', type: 'email', requis: true, valeur: adresse,
        attrs: { name: 'adresse', autocomplete: 'username', placeholder: 'vous@entreprise.ci' },
      }),
      bouton({ libelle: 'Recevoir un code', variante: 'primary', type: 'submit' }),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      adresse = String(new FormData(form).get('adresse') ?? '');
      const reponse = await demanderReinitialisation(adresse);
      etapeCode(reponse);
    });
    carte.replaceChildren(
      ...enTete('Mot de passe oublié', 'Saisissez l’adresse de connexion de votre compte. Le code est envoyé à l’adresse enregistrée sur ce compte.'),
      form,
      noteSimulation('Dans cette démonstration, le courriel est simulé.'),
      el('p.auth-public-link', {}, [el('a', { href: '#/connexion', text: 'Revenir à la connexion' })]),
    );
  };

  const etapeCode = (reponse) => {
    const erreurs = el('div', { role: 'alert', 'aria-live': 'polite' });
    const form = el('form', {}, [
      bandeau({ ton: 'info', message: reponse }),
      champ({ id: 'mdp-code', label: 'Code reçu', requis: true, attrs: { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6 } }),
      champ({
        id: 'mdp-nouveau', label: 'Nouveau mot de passe', type: 'password', requis: true,
        aide: `Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères, dont une lettre et un chiffre.`,
        attrs: { name: 'motDePasse', autocomplete: 'new-password' },
      }),
      champ({ id: 'mdp-confirmation', label: 'Confirmation', type: 'password', requis: true, attrs: { name: 'confirmation', autocomplete: 'new-password' } }),
      erreurs,
      bouton({ libelle: 'Définir mon nouveau mot de passe', variante: 'primary', type: 'submit' }),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const d = Object.fromEntries(new FormData(form));
      try {
        await reinitialiserMotDePasse({ adresse, code: d.code, motDePasse: d.motDePasse, confirmation: d.confirmation });
        toast('Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.');
        aller('#/connexion');
      } catch (err) {
        erreurs.replaceChildren(bandeau({ ton: 'err', message: err instanceof Error ? err.message : 'Code refusé.' }));
      }
    });
    carte.replaceChildren(
      ...enTete('Saisissez votre code', 'Le code est à usage unique. Votre mot de passe actuel reste valable tant que vous n’en avez pas défini un nouveau.'),
      form,
      noteSimulation('Dans cette démonstration, le code est déposé dans la boîte de réception simulée.'),
      el('p.auth-public-link', {}, [
        el('a', { href: '#/mot-de-passe-oublie', text: 'Demander un nouveau code', on: { click: (e) => { e.preventDefault(); etapeDemande(); } } }),
      ]),
    );
  };

  etapeDemande();
  return pageAcces({
    eyebrow: 'VOTRE ACCÈS, EN SÉCURITÉ',
    titre: 'Retrouvez l’accès à votre compte.',
    texte:
      'Le code de récupération part uniquement à l’adresse enregistrée sur votre compte. Il ne sert qu’une ' +
      'fois et expire rapidement.',
    carte,
  });
}

/* ================================================================== *
 * Boîte de réception simulée — outil de démonstration
 * ================================================================== */

/** @returns {HTMLElement} */
export function boiteSimulee() {
  const messages = lireBoite();
  return el('div.auth-page.auth-refresh', {}, [
    el('header.auth-header', {}, [
      el('a.auth-brand-link', { href: '#/' }, [
        el('span.auth-brand-symbol', {}, [icone('mail', 24)]),
        el('span', {}, [el('strong', { text: 'Boîte de réception simulée' }), el('small', { text: 'Démonstration — Bourse de Fret' })]),
      ]),
      el('a.auth-back', { href: '#/connexion' }, [icone('arrow-left', 16), el('span', { text: 'Revenir à la connexion' })]),
    ]),
    el('main.b1-boite', {}, [
      bandeau({
        ton: 'warn',
        titre: 'Outil de démonstration — courriels et SMS simulés',
        message:
          'Aucun courriel ni SMS ne quitte la plateforme de démonstration. Cette page montre ce que chaque ' +
          'destinataire aurait reçu dans sa propre messagerie, à son adresse enregistrée. Elle n’existerait pas ' +
          'en production.',
      }),
      messages.length === 0
        ? etatVide({ titre: 'Aucun message', message: 'Les messages envoyés ces sept derniers jours apparaîtront ici.' })
        : el('ul.b1-boite-liste', {}, messages.map((m) => el('li.b1-boite-message', {}, [
            el('div.b1-boite-entete', {}, [
              el('span.badge.badge-info', {}, [icone(m.canal === 'sms' ? 'phone' : 'mail', 13), el('span', { text: labelOf(m.canal) })]),
              el('span', { text: `À : ${m.adresse}` }),
              el('small', { text: dateHeure(m.envoyeLe) }),
            ]),
            el('strong', { text: m.objet }),
            el('p.b1-texte-long', { text: m.corps }),
            m.code ? el('p.b1-code', {}, [el('span', { text: 'Code : ' }), el('strong', { text: m.code })]) : null,
          ]))),
    ]),
    el('footer.auth-footer', { text: 'B2F · Bourse de Fret — Office Ivoirien des Chargeurs' }),
  ]);
}

