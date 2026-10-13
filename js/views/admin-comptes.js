/**
 * Lot b5 : comptes du back-office (agents OIC) et utilisateurs de l'institution
 * (DGTTC), puis la page publique de saisie d'un code d'accès.
 *
 * Toutes les règles sont dans `services/agents.service.js` ; l'écran les
 * explique (D32 : une action interdite se désactive et s'explique).
 *
 * @module views/admin-comptes
 */

import { dateHeure, el, icone } from '../core/dom.js';
import { bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { ETAT_COMPTE } from '../domain/enums.js';
import { role } from '../domain/roles.js';
import * as agents from '../services/agents.service.js';
import { deconnecter } from '../services/auth.service.js';
import { agir, badgeEtat, cocheDe, valeurDe } from './admin-outils.js';

/**
 * Écran de gestion des comptes du périmètre de l'utilisateur connecté.
 * @param {any} ctx
 */
export function comptes(ctx) {
  const perimetre = agents.perimetreDe(ctx);
  const motifConsultation = agents.motifSansPerimetre(ctx);
  const liste = agents.comptesDuPerimetre(ctx);
  const institution = perimetre ? perimetre.type === 'institution' : true;
  const admins = liste.filter((u) => u.etat === ETAT_COMPTE.ACTIF && u.estAdministrateur).length;

  const recherche = el('input', { type: 'search', placeholder: 'Rechercher un nom, un rôle…', 'aria-label': 'Rechercher un compte', on: { input: () => rendre() } });
  const filtre = el('select', { 'aria-label': 'Filtrer par état', on: { change: () => rendre() } },
    [['', 'Tous les comptes'], [ETAT_COMPTE.ACTIF, 'Comptes actifs'], [ETAT_COMPTE.SUSPENDU, 'Comptes désactivés']].map(([value, text]) => el('option', { value, text })));
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });
  const zoneTableau = el('div');

  function rendre() {
    const q = (recherche.value || '').trim().toLocaleLowerCase('fr');
    const visibles = liste.filter((u) =>
      `${u.prenom ?? ''} ${u.nom ?? ''} ${role(u.roleId).libelle}`.toLocaleLowerCase('fr').includes(q) && (!filtre.value || u.etat === filtre.value));
    compteur.textContent = `${visibles.length} compte(s)`;
    zoneTableau.replaceChildren(tableau({
      colonnes: ['Nom', 'Adresse de connexion', 'Rôle', 'État', 'Dernier accès', perimetre ? 'Actions' : ''].filter(Boolean),
      lignes: visibles.map((u) => [
        el('span.cell-2line', {}, [
          el('strong', { text: `${u.prenom ?? ''} ${u.nom ?? ''}`.trim() }),
          u.soi ? el('span', { text: 'Votre compte' }) : u.estAdministrateur ? el('span', { text: 'Administrateur' }) : null,
        ]),
        u.adresse,
        role(u.roleId).libelle,
        el('div.lot-b5-pile', {}, [badgeEtat(u.etat), u.codeEnCours ? el('small', { text: 'Code d’accès en cours' }) : null]),
        u.dernierAccesLe ? dateHeure(u.dernierAccesLe) : 'Jamais',
        perimetre ? actions(u) : null,
      ].slice(0, perimetre ? 6 : 5)),
      vide: etatVide({ titre: 'Aucun compte', message: 'Aucun compte ne correspond à cette recherche.' }),
    }));
  }

  function actions(u) {
    if (u.soi) {
      return el('div.lot-b5-actions', {}, [
        bouton({ libelle: 'Modifier', variante: 'secondary', onClick: () => dialogueModification(u) }),
        el('small.motif-refus', { text: 'Votre compte : sa désactivation et la réinitialisation de son accès reviennent à un autre administrateur.' }),
      ]);
    }
    return el('div.lot-b5-actions', {}, [
      bouton({ libelle: 'Modifier', variante: 'secondary', onClick: () => dialogueModification(u) }),
      u.etat === ETAT_COMPTE.ACTIF
        ? bouton({ libelle: 'Réinitialiser l’accès', variante: 'secondary', onClick: () => dialogueMotif(u, 'reinitialiser') })
        : null,
      u.etat === ETAT_COMPTE.ACTIF
        ? bouton({ libelle: 'Désactiver', variante: 'ghost', onClick: () => dialogueMotif(u, 'desactiver') })
        : bouton({ libelle: 'Réactiver', variante: 'secondary', onClick: () => dialogueMotif(u, 'reactiver') }),
    ]);
  }

  function dialogueCreation() {
    const fermer = modale({
      titre: institution ? 'Créer un compte DGTTC' : 'Créer un compte d’agent OIC',
      corps: [
        el('p', { text: 'Aucun mot de passe n’est choisi pour la personne : un code d’accès à usage unique part à l’adresse saisie, pour qu’elle définisse le sien.' }),
        el('div.field-row', {}, [
          champ({ id: 'ag-nom', label: 'Nom', requis: true }),
          champ({ id: 'ag-prenom', label: 'Prénom' }),
        ]),
        champ({ id: 'ag-email', label: 'Adresse électronique professionnelle', type: 'email', requis: true, aide: 'Adresse de connexion. Le code d’accès y est adressé.' }),
        institution
          ? el('label.checkbox-row', {}, [el('input', { type: 'checkbox', id: 'ag-admin' }), ' Désigner administrateur des comptes de l’institution'])
          : champ({ id: 'ag-role', label: 'Rôle', requis: true, options: perimetre.roles.map((id) => ({ valeur: id, libelle: role(id).libelle })) }),
        champ({ id: 'ag-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Par exemple : prise de poste au service exploitation.' }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Créer le compte',
          variante: 'primary',
          onClick: async () => {
            const res = await agir(() => agents.creerCompte(ctx, {
              nom: valeurDe('ag-nom'), prenom: valeurDe('ag-prenom'), email: valeurDe('ag-email'),
              roleId: institution ? undefined : valeurDe('ag-role'), administrateur: cocheDe('ag-admin'), motif: valeurDe('ag-motif'),
            }), 'Compte créé.', fermer);
            if (res) afficherMessage(res.message);
          },
        }),
      ],
    });
  }

  function dialogueModification(u) {
    const fermer = modale({
      titre: `Modifier le compte — ${u.prenom ?? ''} ${u.nom}`.trim(),
      corps: [
        el('div.field-row', {}, [
          champ({ id: 'am-nom', label: 'Nom', requis: true, valeur: u.nom }),
          champ({ id: 'am-prenom', label: 'Prénom', valeur: u.prenom }),
        ]),
        institution
          ? el('label.checkbox-row', {}, [
            el('input', { type: 'checkbox', id: 'am-admin', checked: u.administrateur === true || undefined, disabled: u.soi || undefined }),
            u.soi ? ' Administrateur — vous ne pouvez pas retirer votre propre désignation' : ' Administrateur des comptes de l’institution',
          ])
          : champ({
            id: 'am-role', label: 'Rôle', requis: true, valeur: u.roleId,
            aide: u.soi ? 'Vous ne pouvez pas modifier votre propre rôle.' : 'Le nouveau rôle s’applique à la prochaine connexion.',
            options: perimetre.roles.map((id) => ({ valeur: id, libelle: role(id).libelle })),
            attrs: u.soi ? { disabled: true } : {},
          }),
        champ({ id: 'am-motif', label: 'Motif', type: 'textarea', requis: true }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Enregistrer',
          variante: 'primary',
          onClick: () => agir(() => agents.modifierCompte(ctx, u.id, {
            nom: valeurDe('am-nom'), prenom: valeurDe('am-prenom'),
            roleId: institution || u.soi ? undefined : valeurDe('am-role'),
            administrateur: institution && !u.soi ? cocheDe('am-admin') : undefined,
            motif: valeurDe('am-motif'),
          }), 'Compte modifié.', fermer),
        }),
      ],
    });
  }

  function dialogueMotif(u, action) {
    const textes = {
      desactiver: { titre: 'Désactiver le compte', intro: 'La personne ne pourra plus se connecter. Son historique et ses actions passées restent au journal.', bouton: 'Désactiver', ok: 'Compte désactivé.' },
      reactiver: { titre: 'Réactiver le compte', intro: 'La personne pourra de nouveau se connecter avec ses identifiants.', bouton: 'Réactiver', ok: 'Compte réactivé.' },
      reinitialiser: { titre: 'Réinitialiser l’accès', intro: 'Un code à usage unique, valable quinze minutes, part à l’adresse enregistrée du compte. Le mot de passe actuel reste valable tant que le nouveau n’est pas défini.', bouton: 'Envoyer le code', ok: '' },
    }[action];
    const fermer = modale({
      titre: `${textes.titre} — ${u.prenom ?? ''} ${u.nom}`.trim(),
      corps: [el('p', { text: textes.intro }), champ({ id: 'ad-motif', label: 'Motif', type: 'textarea', requis: true })],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: textes.bouton,
          variante: 'primary',
          onClick: async () => {
            const motif = valeurDe('ad-motif');
            const res = await agir(() => (action === 'desactiver'
              ? agents.desactiverCompte(ctx, u.id, motif)
              : action === 'reactiver' ? agents.reactiverCompte(ctx, u.id, motif) : agents.reinitialiserAcces(ctx, u.id, motif)), textes.ok, fermer);
            if (action === 'reinitialiser' && res) afficherMessage(res);
          },
        }),
      ],
    });
  }

  rendre();
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: institution ? 'Comptes de votre institution' : 'Comptes du back-office de l’OIC',
      message:
        'Un administrateur ne modifie pas son propre rôle et ne se désactive pas ; au moins un ' +
        'administrateur actif subsiste toujours. Chaque action est inscrite au journal d’audit avec son motif.',
    }),
    motifConsultation ? bandeau({ ton: 'warn', titre: 'Consultation seule', message: motifConsultation }) : null,
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Comptes', valeur: liste.length, icon: 'users' }),
      kpi({ libelle: 'Comptes actifs', valeur: liste.filter((u) => u.etat === ETAT_COMPTE.ACTIF).length, icon: 'check-circle' }),
      kpi({ libelle: 'Comptes désactivés', valeur: liste.filter((u) => u.etat !== ETAT_COMPTE.ACTIF).length, icon: 'alert' }),
      kpi({ libelle: 'Administrateurs actifs', valeur: admins, icon: 'shield' }),
    ]),
    carte({
      titre: perimetre?.libelle ?? 'Utilisateurs de l’institution',
      sousTitre: 'Les adresses sont masquées : le code d’accès part toujours à l’adresse enregistrée du compte.',
      actions: perimetre ? [bouton({ libelle: 'Créer un compte', variante: 'primary', icone: 'plus', onClick: dialogueCreation })] : [],
      corps: [el('div.declarations-toolbar', {}, [recherche, filtre]), compteur, zoneTableau],
    }),
  ]);
}

/**
 * Message simulé : ce qui partirait à l'adresse enregistrée du compte.
 * @param {{destinataire: string, objet: string, code: string, expireLe: string, texte: string}} m
 */
function afficherMessage(m) {
  const fermer = modale({
    titre: 'Message simulé — code d’accès envoyé',
    corps: [
      bandeau({
        ton: 'warn',
        titre: 'Simulation de démonstration',
        message:
          'Aucun courriel n’est réellement envoyé. En service, ce message part à l’adresse enregistrée du compte ' +
          'et le code n’est jamais affiché à l’administrateur. Il est reproduit ici pour permettre la démonstration.',
      }),
      el('div.recap-grid', {}, [
        el('div.recap-item', {}, [el('span', { text: 'Destinataire' }), el('strong', { text: m.destinataire })]),
        el('div.recap-item', {}, [el('span', { text: 'Code à usage unique' }), el('strong', { text: m.code })]),
        el('div.recap-item', {}, [el('span', { text: 'Valable jusqu’à' }), el('strong', { text: dateHeure(m.expireLe) })]),
      ]),
      el('p', { text: m.texte }),
    ],
    actions: [
      bouton({ libelle: 'Fermer', onClick: () => fermer() }),
      bouton({
        libelle: 'Se déconnecter et saisir le code',
        variante: 'primary',
        onClick: () => {
          fermer();
          deconnecter();
          globalThis.location.hash = '#/connexion/code';
        },
      }),
    ],
  });
}

/**
 * Page publique « Code d'accès » : définir son mot de passe avec un code reçu.
 * Calquée sur l'écran de connexion.
 * @param {() => void} surSucces
 */
export function saisieCodeAcces(surSucces) {
  const soumettre = async () => {
    try {
      await agents.utiliserCodeAcces({
        email: valeurDe('ca-mail'), code: valeurDe('ca-code'),
        motDePasse: valeurDe('ca-pwd'), confirmation: valeurDe('ca-pwd2'),
      });
      toast('Mot de passe défini. Connectez-vous avec votre nouveau mot de passe.');
      surSucces();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Code invalide ou expiré.', 'err');
    }
  };
  const formulaire = el('form.auth-card', { on: { submit: (e) => { e.preventDefault(); soumettre(); } } }, [
    el('div.auth-card-brand', {}, [el('img', { src: 'assets/oic.jpeg', alt: 'OIC — Office Ivoirien des Chargeurs', width: 88, height: 56 })]),
    el('span.auth-eyebrow', { text: 'CODE D’ACCÈS' }),
    el('h2', { text: 'Définir votre mot de passe' }),
    el('p.auth-sub', { text: 'Saisissez le code à usage unique reçu à votre adresse, puis choisissez votre mot de passe.' }),
    champ({ id: 'ca-mail', label: 'Adresse électronique', type: 'email', requis: true, attrs: { autocomplete: 'username' } }),
    champ({ id: 'ca-code', label: 'Code reçu', requis: true, aide: 'Valable quinze minutes. Cinq essais au plus.', attrs: { autocomplete: 'one-time-code', placeholder: 'XXXX-XXXX' } }),
    champ({ id: 'ca-pwd', label: 'Nouveau mot de passe', type: 'password', requis: true, aide: 'Au moins huit caractères, dont des lettres et des chiffres.', attrs: { autocomplete: 'new-password' } }),
    champ({ id: 'ca-pwd2', label: 'Confirmer le mot de passe', type: 'password', requis: true, attrs: { autocomplete: 'new-password' } }),
    el('button.btn.btn-primary.btn-block.btn-lg', { type: 'submit', text: 'Définir mon mot de passe' }),
    el('p.auth-public-link', {}, [el('span', { text: 'Vous connaissez votre mot de passe ? ' }), el('a', { href: '#/connexion', text: 'Se connecter' })]),
  ]);
  return el('div.auth-page.auth-refresh', {}, [
    el('header.auth-header', {}, [
      el('a.auth-brand-link', { href: '#/' }, [
        el('span.auth-brand-symbol', {}, [icone('truck', 24)]),
        el('span', {}, [el('strong', { text: 'Bourse de Fret' }), el('small', { text: 'Office Ivoirien des Chargeurs' })]),
      ]),
      el('a.auth-back', { href: '#/connexion' }, [icone('arrow-left', 16), el('span', { text: 'Revenir à la connexion' })]),
    ]),
    el('div.auth-content', {}, [
      el('section.auth-visual', { 'aria-labelledby': 'auth-title' }, [
        el('img.auth-illustration', { src: 'assets/connexion-fret.png', alt: '', width: 1536, height: 1024 }),
        el('span.auth-eyebrow', { text: 'ACCÈS SÉCURISÉ' }),
        el('h1', { id: 'auth-title', text: 'Un code, une seule fois.' }),
        el('p', { text: `Le code d’accès est émis par votre administrateur et adressé à l’adresse enregistrée de votre compte. Il expire au bout de quinze minutes et ne sert qu’une fois. Votre compte reste utilisable avec votre mot de passe actuel tant que le nouveau n’est pas défini.` }),
        el('div.auth-assurance', {}, [
          el('span', {}, [icone('shield', 16), el('span', { text: 'Code à usage unique' })]),
          el('span', {}, [icone('clock', 16), el('span', { text: 'Valable quinze minutes' })]),
        ]),
      ]),
      el('div.auth-form-column', {}, [formulaire,
        el('p.auth-footer-note', {}, [icone('shield', 14), el('span', { text: 'La plateforme de mise en relation de l’OIC' })]),
      ]),
    ]),
    el('footer.auth-footer', { text: 'B2F · Bourse de Fret — Office Ivoirien des Chargeurs' }),
  ]);
}
