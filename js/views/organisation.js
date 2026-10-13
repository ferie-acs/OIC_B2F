/**
 * Lot b2 : organisation interne — écrans de l'entreprise.
 *
 * - « Utilisateurs » : l'administrateur crée, modifie, désactive, réactive ses
 *   utilisateurs et réinitialise un accès (code à usage unique, affiché une fois).
 * - « Filiales et entités » : entités rattachées et activité consolidée.
 * - « Intermédiaires de fret » : désigner, retirer, suivre les actions faites
 *   en son nom.
 *
 * Servis aux espaces Affréteur, Transporteur et Intermédiaire. Les droits
 * viennent de la matrice ; les refus sont expliqués, jamais masqués (D32).
 *
 * @module views/organisation
 */

import { date, dateHeure, el, icone, montant } from '../core/dom.js';
import {
  afficherErreur,
  bandeau,
  bouton,
  carte,
  champ,
  etatVide,
  kpi,
  modale,
  tableau,
  toast,
} from '../core/ui.js';
import { decider } from '../domain/access.js';
import { ETAT_COMPTE, STATUT_MANDAT, TYPE_GROUPEMENT, labelOf } from '../domain/enums.js';
import { depot } from '../repositories/index.js';
import { refDe } from './_donnees.js';
import * as comptes from '../services/utilisateurs-entreprise.service.js';
import * as filiales from '../services/filiale.service.js';
import * as mandats from '../services/mandat.service.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
const valeurDe = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.value ?? '';

/** Badge de texte, sur les classes existantes. */
function pastille(ton, texte, ic) {
  return el('span', { class: `badge badge-${ton}` }, [ic ? icone(ic, 13) : null, el('span', { text: texte })]);
}

/** Exécute une action, rafraîchit, explique l'échec. */
function agir(action, message, fermer = null) {
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

/* ================================================================== *
 * Code d'activation — affiché une seule fois
 * ================================================================== */

/**
 * Intégration : accusé d'envoi du code d'activation. Le code part par la
 * messagerie unique à l'adresse enregistrée du compte ; il n'est pas affiché ici.
 * @param {{titre: string, personne: string, destinataire: string, expireLe: string, note?: string}} p
 */
function afficherCode({ titre, personne, destinataire, expireLe, note }) {
  const fermer = modale({
    titre,
    corps: [
      bandeau({
        ton: 'info',
        titre: 'Code d’activation envoyé',
        message:
          `Un code à usage unique est parti à l’adresse enregistrée de ${personne} (${destinataire}), ` +
          `valable jusqu’au ${dateHeure(expireLe)}. Il ne sert qu’une fois ; un nouveau code annule le précédent.`,
      }),
      el('p', {
        text:
          'La personne choisit « Activer mon compte » sur l’écran de connexion, puis saisit ' +
          'son adresse, ce code et le mot de passe de son choix.',
      }),
      note ? el('p', { text: note }) : null,
      bandeau({
        ton: 'info',
        message:
          'Envoi simulé : aucun courriel ne quitte la plateforme. Le message est déposé dans la boîte ' +
          'de réception simulée de la démonstration.',
      }),
    ],
    actions: [
      el('a.btn.btn-secondary', { href: '#/boite-simulee', target: '_blank', rel: 'noopener' }, [
        icone('mail', 16), el('span', { text: 'Boîte de réception simulée' }),
      ]),
      bouton({ libelle: 'Fermer', variante: 'primary', onClick: () => fermer() }),
    ],
    surFermeture: rafraichir,
  });
}

/* ================================================================== *
 * Utilisateurs de l'entreprise
 * ================================================================== */

/** @param {any} ctx */
export function utilisateurs(ctx) {
  const liste = comptes.utilisateursEntreprise(ctx);
  const gestion = decider(ctx, 'utilisateur.gerer', { groupementId: ctx.groupementId });
  const motif = gestion.autorise ? null : gestion.explication;
  const entites = comptes.entitesGerees(ctx);
  const avecFiliales = entites.length > 1;

  const recherche = el('input', {
    type: 'search',
    placeholder: 'Rechercher un nom, une adresse…',
    'aria-label': 'Rechercher un utilisateur',
    on: { input: rendre },
  });
  const filtre = el('select', { 'aria-label': 'Filtrer les utilisateurs', on: { change: rendre } }, [
    ['', 'Tous les comptes'],
    ['actif', 'Comptes actifs'],
    ['suspendu', 'Comptes désactivés'],
    ['activation', 'Activation en attente'],
  ].map(([value, text]) => el('option', { value, text })));
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });
  const zone = el('div');

  function rendre() {
    const q = (recherche.value || '').trim().toLocaleLowerCase('fr');
    const visibles = liste.filter((u) =>
      `${u.prenom} ${u.nom} ${u.email ?? ''} ${u.roleLibelle} ${u.entite}`.toLocaleLowerCase('fr').includes(q) &&
      (!filtre.value
        || (filtre.value === 'activation' ? Boolean(u.activationEnAttente) : u.etat === filtre.value)));
    compteur.textContent = `${visibles.length} compte(s)`;
    zone.replaceChildren(tableau({
      colonnes: ['Utilisateur', 'Rôle', avecFiliales ? 'Entité' : null, 'État', 'Dernier accès', 'Actions'].filter(Boolean),
      lignes: visibles.map((u) => [
        el('span.user-cell', {}, [
          el('strong', { text: `${u.prenom} ${u.nom}`.trim() }),
          u.email ? el('small', { text: u.email }) : null,
          u.soiMeme ? el('small', { text: 'Vous' }) : null,
        ]),
        u.roleLibelle,
        ...(avecFiliales ? [u.entite] : []),
        el('span.badge-stack', {}, [
          u.etat === ETAT_COMPTE.ACTIF ? pastille('success', 'Actif', 'check-circle') : pastille('error', 'Désactivé', 'alert'),
          u.activationEnAttente
            ? pastille('warning', `Code en attente · ${dateHeure(u.activationEnAttente.expireLe)}`, 'key-round')
            : null,
        ]),
        u.dernierAccesLe ? dateHeure(u.dernierAccesLe) : 'Jamais',
        actionsCompte(u),
      ]),
      vide: etatVide({ titre: 'Aucun compte trouvé', message: 'Essayez un autre nom ou un autre filtre.' }),
    }));
  }

  function actionsCompte(u) {
    const refusSoi = u.soiMeme ? 'Vous ne pouvez pas désactiver votre propre compte.' : null;
    return el('div.table-toolbar.org-actions', {}, [
      bouton({ libelle: 'Modifier', variante: 'ghost', icone: 'pencil', motif, onClick: () => dialogueCompte(u) }),
      bouton({
        libelle: 'Réinitialiser l’accès',
        variante: 'ghost',
        icone: 'key-round',
        motif: motif ?? (u.etat !== ETAT_COMPTE.ACTIF ? 'Réactivez d’abord ce compte.' : null),
        onClick: () => dialogueReinitialisation(u),
      }),
      u.etat === ETAT_COMPTE.ACTIF
        ? bouton({ libelle: 'Désactiver', variante: 'ghost', icone: 'user-x', motif: motif ?? refusSoi, onClick: () => dialogueDesactivation(u) })
        : bouton({
            libelle: 'Réactiver',
            variante: 'secondary',
            icone: 'user-check',
            motif,
            onClick: () => agir(() => comptes.reactiverUtilisateur(ctx, u.id), 'Compte réactivé.'),
          }),
    ]);
  }

  function dialogueCompte(existant = null) {
    const roles = comptes.rolesProposes(ctx, existant?.groupementId ?? ctx.groupementId);
    const fermer = modale({
      titre: existant ? `Modifier le compte de ${`${existant.prenom} ${existant.nom}`.trim()}` : 'Ajouter un utilisateur',
      corps: [
        el('div.field-row', {}, [
          champ({ id: 'uc-prenom', label: 'Prénom', valeur: existant?.prenom }),
          champ({ id: 'uc-nom', label: 'Nom', requis: true, valeur: existant?.nom }),
        ]),
        el('div.field-row', {}, [
          champ({ id: 'uc-email', label: 'Adresse électronique', type: 'email', requis: true, valeur: existant?.email ?? '', aide: 'Elle sert d’identifiant de connexion.' }),
          champ({ id: 'uc-tel', label: 'Téléphone', type: 'tel', valeur: existant?.telephone ?? '' }),
        ]),
        existant?.soiMeme
          ? el('p.subtitle', { text: `Rôle : ${existant.roleLibelle}. Vous ne pouvez pas modifier votre propre rôle.` })
          : champ({
              id: 'uc-role',
              label: 'Rôle',
              requis: true,
              valeur: existant?.roleId ?? roles[0]?.valeur,
              options: roles,
              aide: 'Seuls les rôles de votre type d’entreprise sont proposés.',
            }),
        !existant && avecFiliales
          ? champ({
              id: 'uc-entite',
              label: 'Entité de rattachement',
              requis: true,
              valeur: ctx.groupementId,
              options: entites.map((e) => ({ valeur: e.id, libelle: e.estMere ? `${e.raisonSociale} (entreprise mère)` : e.raisonSociale })),
            })
          : null,
        existant ? null : bandeau({
          ton: 'info',
          message: 'Un code d’activation à usage unique vous sera affiché : la personne s’en sert pour choisir son mot de passe.',
        }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: existant ? 'Enregistrer' : 'Créer le compte',
          variante: 'primary',
          onClick: async () => {
            const saisie = {
              prenom: valeurDe('uc-prenom'),
              nom: valeurDe('uc-nom'),
              email: valeurDe('uc-email'),
              telephone: valeurDe('uc-tel'),
              roleId: existant?.soiMeme ? existant.roleId : valeurDe('uc-role'),
            };
            try {
              if (existant) {
                comptes.modifierUtilisateur(ctx, existant.id, saisie);
                fermer();
                toast('Compte modifié.');
                rafraichir();
                return;
              }
              const r = await comptes.creerUtilisateur(ctx, { ...saisie, groupementId: valeurDe('uc-entite') || ctx.groupementId });
              fermer();
              afficherCode({
                titre: 'Compte créé',
                personne: `${saisie.prenom} ${saisie.nom}`.trim(),
                destinataire: r.destinataire,
                expireLe: r.expireLe,
              });
            } catch (e) {
              afficherErreur(e);
            }
          },
        }),
      ],
    });
  }

  function dialogueReinitialisation(u) {
    const fermer = modale({
      titre: `Réinitialiser l’accès de ${`${u.prenom} ${u.nom}`.trim()}`,
      corps: [
        el('p', {
          text:
            'Un nouveau code à usage unique va être émis ; il remplace tout code précédent. ' +
            'Le mot de passe actuel reste valable jusqu’à ce que la personne en choisisse un ' +
            'nouveau : son compte n’est pas bloqué.',
        }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Émettre un code',
          variante: 'primary',
          icone: 'key-round',
          onClick: async () => {
            try {
              const r = await comptes.reinitialiserAcces(ctx, u.id);
              fermer();
              afficherCode({ titre: 'Accès réinitialisé', personne: `${u.prenom} ${u.nom}`.trim(), destinataire: r.destinataire, expireLe: r.expireLe });
            } catch (e) {
              afficherErreur(e);
            }
          },
        }),
      ],
    });
  }

  function dialogueDesactivation(u) {
    const fermer = modale({
      titre: `Désactiver le compte de ${`${u.prenom} ${u.nom}`.trim()}`,
      corps: [
        el('p', {
          text:
            'La personne ne pourra plus se connecter. Ses actions passées restent au journal. ' +
            'Vous pourrez réactiver le compte à tout moment.',
        }),
        champ({ id: 'ud-motif', label: 'Motif', type: 'textarea', aide: 'Par exemple : départ de l’entreprise.' }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Désactiver',
          variante: 'primary',
          icone: 'user-x',
          onClick: () => agir(() => comptes.desactiverUtilisateur(ctx, u.id, valeurDe('ud-motif')), 'Compte désactivé.', fermer),
        }),
      ],
    });
  }

  rendre();
  const actifs = liste.filter((u) => u.etat === ETAT_COMPTE.ACTIF).length;
  return el('div.page.supervision-page.organisation-page', {}, [
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Utilisateurs actifs', valeur: actifs, icon: 'users' }),
      kpi({ libelle: 'Comptes désactivés', valeur: liste.length - actifs, icon: 'user-x' }),
      kpi({ libelle: 'Codes d’activation en attente', valeur: liste.filter((u) => u.activationEnAttente).length, icon: 'key-round' }),
    ]),
    bandeau({
      ton: 'info',
      message:
        'Chaque compte reçoit un rôle de votre type d’entreprise. Un auxiliaire prépare et ' +
        'publie sans engager les finances de l’entreprise. Les rôles de l’OIC ne s’attribuent ' +
        'pas ici, et chaque modification est inscrite au journal.',
    }),
    carte({
      titre: 'Utilisateurs de l’entreprise',
      sousTitre: avecFiliales
        ? 'Les comptes de votre entreprise et de ses entités rattachées.'
        : 'Les comptes rattachés à votre entreprise.',
      actions: [bouton({ libelle: 'Ajouter un utilisateur', variante: 'primary', icone: 'user-plus', motif, onClick: () => dialogueCompte() })],
      corps: [el('div.declarations-toolbar', {}, [recherche, filtre]), compteur, zone],
    }),
  ]);
}

/* ================================================================== *
 * Filiales et entités rattachées
 * ================================================================== */

/** @param {any} ctx */
export function filialesEtEntites(ctx) {
  const a = filiales.activiteConsolidee(ctx);
  const creation = decider(ctx, 'filiale.creer', { groupementId: ctx.groupementId });
  const motifCreation = !creation.autorise
    ? creation.explication
    : a.estFiliale
      ? 'Une entité rattachée ne crée pas elle-même d’entité.'
      : null;
  const type = a.mere.type;
  const libellePublications = type === TYPE_GROUPEMENT.AFFRETEUR
    ? 'Demandes publiées'
    : type === TYPE_GROUPEMENT.TRANSPORTEUR ? 'Offres publiées' : 'Mandats en vigueur';

  const etatEntite = (e) => {
    const ton = e.verification === 'verifie' ? 'success' : e.verification === 'refuse' ? 'error' : 'warning';
    return el('span.badge-stack', {}, [
      e.active ? pastille('success', 'Active', 'check-circle') : pastille('warning', 'En attente', 'clock'),
      e.verification ? pastille(ton, labelOf(e.verification), 'shield') : null,
      e.verification && e.verificationHeritee ? el('small', { text: 'Vérification héritée de l’entreprise mère' }) : null,
      e.motifInactivite ? el('small', { text: e.motifInactivite }) : null,
    ]);
  };

  return el('div.page.supervision-page.organisation-page', {}, [
    a.estFiliale
      ? bandeau({
          ton: 'info',
          titre: 'Votre entreprise est une entité rattachée',
          message:
            `Elle hérite des pièces et de la vérification de « ${a.rattacheeA ?? 'son entreprise mère'} ». ` +
            'Son activité est consolidée chez l’entreprise mère.',
        })
      : null,
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Entités', valeur: a.totaux.entites, icon: 'network' }),
      kpi({ libelle: libellePublications, valeur: a.totaux.publications }),
      kpi({ libelle: 'Mises en relation en cours', valeur: a.totaux.enCours, icon: 'handshake' }),
      kpi({ libelle: 'Transports en cours', valeur: a.totaux.transportsEnCours, icon: 'truck' }),
    ]),
    bandeau({
      ton: 'info',
      message:
        'Une entité rattachée hérite de vos pièces déjà vérifiées et de votre abonnement. Elle ' +
        'tient son propre compte et fait contrôler ses propres véhicules et chauffeurs. Elle ' +
        'n’est active que si votre dossier est vérifié.',
    }),
    carte({
      titre: 'Activité consolidée',
      sousTitre: 'Volumes par entité. Les contreparties de vos entités ne sont pas nommées ici.',
      actions: [bouton({ libelle: 'Créer une entité rattachée', variante: 'primary', icone: 'plus', motif: motifCreation, onClick: () => dialogueFiliale(ctx) })],
      corps: [
        tableau({
          colonnes: ['Entité', 'État', libellePublications, 'En cours', 'Validées', 'Transports en cours', 'Solde'],
          lignes: [
            ...a.entites.map((e) => [
              el('span.user-cell', {}, [
                el('strong', { text: e.raisonSociale }),
                el('small', { text: `${refDe(e.localiteId)} · ${e.estMere ? 'entreprise mère' : `rattachée depuis le ${date(e.creeLe)}`}` }),
                el('small', { text: `${e.utilisateursActifs} utilisateur(s) actif(s)` }),
              ]),
              etatEntite(e),
              e.publications,
              e.enCours,
              e.validees,
              e.transportsEnCours,
              el('span.cellule-montant', { text: montant(e.solde) }),
            ]),
            a.entites.length > 1
              ? [el('strong', { text: 'Total' }), '', a.totaux.publications, a.totaux.enCours, a.totaux.validees, a.totaux.transportsEnCours, el('strong.cellule-montant', { text: montant(a.totaux.solde) })]
              : null,
          ].filter(Boolean),
        }),
        a.entites.length === 1
          ? etatVide({
              titre: 'Aucune entité rattachée',
              message: 'Créez une entité pour une agence ou une filiale : elle reprendra vos pièces vérifiées.',
            })
          : null,
      ],
    }),
  ]);
}

function dialogueFiliale(ctx) {
  const localites = depot('referentiel')
    .brutOu((r) => r.famille === 'localites' && r.actif)
    .map((r) => ({ valeur: r.id, libelle: r.libelle }))
    .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr'));
  const fermer = modale({
    titre: 'Créer une entité rattachée',
    corps: [
      el('p', {
        text:
          'L’entité reprend votre RCCM, votre compte contribuable et, pour un transporteur, votre ' +
          'carte de transporteur. Son responsable reçoit un compte et un code d’activation.',
      }),
      el('h3', { text: 'L’entité' }),
      champ({ id: 'fi-nom', label: 'Nom de l’entité', requis: true, attrs: { placeholder: 'Par exemple : agence de San-Pédro' } }),
      el('div.field-row', {}, [
        champ({ id: 'fi-localite', label: 'Localité', requis: true, options: localites }),
        champ({ id: 'fi-adresse', label: 'Adresse' }),
      ]),
      el('div.field-row', {}, [
        champ({ id: 'fi-tel', label: 'Téléphone de l’entité', type: 'tel' }),
        champ({ id: 'fi-mail', label: 'Courriel de l’entité', type: 'email' }),
      ]),
      el('h3', { text: 'Son responsable' }),
      el('div.field-row', {}, [
        champ({ id: 'fi-prenom', label: 'Prénom' }),
        champ({ id: 'fi-rnom', label: 'Nom', requis: true }),
      ]),
      el('div.field-row', {}, [
        champ({ id: 'fi-remail', label: 'Adresse électronique', type: 'email', requis: true }),
        champ({ id: 'fi-rtel', label: 'Téléphone', type: 'tel' }),
      ]),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Créer l’entité',
        variante: 'primary',
        onClick: async () => {
          try {
            const r = await filiales.creerFiliale(ctx, {
              raisonSociale: valeurDe('fi-nom'),
              localiteId: valeurDe('fi-localite'),
              adresse: valeurDe('fi-adresse'),
              contactTelephone: valeurDe('fi-tel'),
              contactEmail: valeurDe('fi-mail'),
              responsable: {
                prenom: valeurDe('fi-prenom'),
                nom: valeurDe('fi-rnom'),
                email: valeurDe('fi-remail'),
                telephone: valeurDe('fi-rtel'),
              },
            });
            fermer();
            afficherCode({
              titre: 'Entité créée',
              personne: `${valeurDe('fi-prenom')} ${valeurDe('fi-rnom')}`.trim() || 'son responsable',
              destinataire: r.destinataire,
              expireLe: r.expireLe,
              note: r.active
                ? 'L’entité est active : elle hérite de votre vérification.'
                : `L’entité est en attente. ${r.motifInactivite ?? ''}`.trim(),
            });
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

/* ================================================================== *
 * Intermédiaires de fret — côté mandant
 * ================================================================== */

/** Badge d'un statut de mandat. */
export function badgeMandat(statut) {
  const tons = {
    [STATUT_MANDAT.EN_VIGUEUR]: ['success', 'check-circle'],
    [STATUT_MANDAT.A_VENIR]: ['info', 'calendar'],
    [STATUT_MANDAT.ECHU]: ['neutral', 'clock'],
    [STATUT_MANDAT.RETIRE]: ['neutral', 'x'],
  };
  const [ton, ic] = tons[statut] ?? ['neutral', 'info'];
  return pastille(ton, labelOf(statut), ic);
}

/** Liste du périmètre confié. */
export function listePerimetre(perimetre) {
  return el('ul.perimetre-liste', {}, mandats.libellesPerimetre(perimetre).map((l) => el('li', { text: l })));
}

/** Période lisible. */
export const periode = (m) => `Du ${date(m.debuteLe)} au ${date(m.finitLe)}`;

/** @param {any} ctx */
export function intermediaires(ctx) {
  const liste = mandats.mandatsDuMandant(ctx);
  const annuaire = mandats.annuaireIntermediaires(ctx);
  const actions = mandats.actionsAuNomDe(ctx);
  const gestion = decider(ctx, 'mandat.gerer', { groupementId: ctx.groupementId });
  const motif = gestion.autorise ? null : gestion.explication;
  const estTransporteur = depot('groupement').lire(ctx, ctx.groupementId, { proprietaireId: ctx.groupementId })?.type === TYPE_GROUPEMENT.TRANSPORTEUR;
  const enVigueur = liste.filter((m) => m.statut === STATUT_MANDAT.EN_VIGUEUR);

  return el('div.page.supervision-page.organisation-page', {}, [
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Mandats en vigueur', valeur: enVigueur.length, icon: 'briefcase' }),
      kpi({ libelle: 'Intermédiaires disponibles', valeur: annuaire.length, icon: 'users' }),
      kpi({ libelle: 'Actions faites en votre nom', valeur: actions.length, icon: 'history' }),
    ]),
    bandeau({
      ton: 'info',
      message: estTransporteur
        ? 'Un intermédiaire agit en votre nom dans le périmètre et la période que vous choisissez. ' +
          'Accepter une réservation engage un débit à venir sur votre compte : ne confiez les ' +
          'réponses qu’à un intermédiaire de confiance. Les coordonnées des affréteurs ne sont ' +
          'transmises qu’à vous.'
        : 'Un intermédiaire agit en votre nom dans le périmètre et la période que vous choisissez. ' +
          'Il prépare vos dossiers ; la validation, qui débite vos frais de mise en relation, vous ' +
          'reste réservée, et les coordonnées des transporteurs ne sont transmises qu’à vous.',
    }),
    carte({
      titre: 'Mes mandats',
      sousTitre: 'Vous pouvez retirer un mandat à tout moment : l’intermédiaire perd aussitôt l’accès.',
      actions: [bouton({ libelle: 'Désigner un intermédiaire', variante: 'primary', icone: 'plus', motif: motif ?? (annuaire.length ? null : 'Aucun intermédiaire actif n’est inscrit pour le moment.'), onClick: () => dialogueDesignation(ctx, annuaire) })],
      corps: [
        tableau({
          colonnes: ['Intermédiaire', 'Périmètre confié', 'Période', ''],
          lignes: liste.map((m) => [
            el('span.user-cell', {}, [el('strong', { text: m.intermediaire }), el('small', { text: `Mandat ${m.reference}` })]),
            listePerimetre(m.perimetre),
            el('span.badge-stack', {}, [
              badgeMandat(m.statut),
              el('small', { text: periode(m) }),
              m.retireLe ? el('small', { text: `Retiré le ${date(m.retireLe)}${m.motifRetrait ? ` — ${m.motifRetrait}` : ''}` }) : null,
            ]),
            m.statut === STATUT_MANDAT.RETIRE
              ? null
              : bouton({ libelle: 'Retirer', variante: 'ghost', icone: 'x', motif, onClick: () => dialogueRetrait(ctx, m) }),
          ]),
          vide: etatVide({
            titre: 'Aucun mandat',
            message: 'Désignez un intermédiaire pour qu’il prépare vos dossiers en votre nom.',
          }),
        }),
      ],
    }),
    carte({
      titre: 'Annuaire des intermédiaires actifs',
      sousTitre: 'Entreprises inscrites, vérifiées et à jour de leur abonnement.',
      corps: [
        tableau({
          colonnes: ['Intermédiaire', 'Localité', 'Inscrit depuis', ''],
          lignes: annuaire.map((i) => [
            el('strong', { text: i.raisonSociale }),
            refDe(i.localiteId),
            date(i.inscritLe),
            bouton({ libelle: 'Désigner', variante: 'secondary', icone: 'briefcase', motif, onClick: () => dialogueDesignation(ctx, annuaire, i.id) }),
          ]),
          vide: etatVide({ titre: 'Aucun intermédiaire actif', message: 'Les intermédiaires apparaîtront ici après la vérification de leur dossier.' }),
        }),
      ],
    }),
    carte({
      titre: 'Actions faites en votre nom',
      sousTitre: 'Extrait du journal d’audit : chaque action d’un intermédiaire y est inscrite à votre nom.',
      corps: [
        tableau({
          colonnes: ['Date', 'Intermédiaire', 'Par', 'Action', 'Mandat'],
          lignes: actions.map((x) => [dateHeure(x.horodatage), x.intermediaire, x.auteur, x.details, x.mandat]),
          vide: etatVide({ titre: 'Aucune action', message: 'Aucun intermédiaire n’a encore agi en votre nom.' }),
        }),
      ],
    }),
  ]);
}

function dialogueDesignation(ctx, annuaire, preselection = '') {
  const perimetres = mandats.perimetresProposes(ctx);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dans90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const fermer = modale({
    titre: 'Désigner un intermédiaire',
    corps: [
      champ({
        id: 'md-inter',
        label: 'Intermédiaire',
        requis: true,
        valeur: preselection,
        options: annuaire.map((i) => ({ valeur: i.id, libelle: i.raisonSociale })),
      }),
      el('fieldset.mandat-perimetre', {}, [
        el('legend', { text: 'Ce que vous lui confiez' }),
        ...perimetres.map((p) => el('label.checkbox-row', {}, [
          el('input', { type: 'checkbox', id: `md-p-${p.valeur}`, value: p.valeur }),
          el('span.label-body', {}, [el('strong', { text: p.libelle })]),
        ])),
      ]),
      el('div.field-row', {}, [
        champ({ id: 'md-debut', label: 'Début', type: 'date', requis: true, valeur: aujourdhui }),
        champ({ id: 'md-fin', label: 'Fin', type: 'date', requis: true, valeur: dans90 }),
      ]),
      el('p.subtitle', { text: 'La validation des mises en relation, qui débite vos frais, n’est jamais confiée.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Désigner',
        variante: 'primary',
        onClick: () => agir(() => mandats.designerIntermediaire(ctx, {
          intermediaireId: valeurDe('md-inter'),
          perimetre: perimetres.map((p) => p.valeur).filter((v) => document.getElementById(`md-p-${v}`)?.checked === true),
          debuteLe: valeurDe('md-debut'),
          finitLe: valeurDe('md-fin'),
        }), 'Intermédiaire désigné. Il en est informé.', fermer),
      }),
    ],
  });
}

function dialogueRetrait(ctx, m) {
  const fermer = modale({
    titre: `Retirer le mandat ${m.reference}`,
    corps: [
      el('p', {
        text:
          `« ${m.intermediaire} » ne pourra plus agir en votre nom, dès maintenant. Les dossiers ` +
          'qu’il a préparés restent les vôtres. Le retrait est définitif ; vous pourrez désigner ' +
          'un nouveau mandat.',
      }),
      champ({ id: 'mr-motif', label: 'Motif', type: 'textarea' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Retirer le mandat',
        variante: 'primary',
        onClick: () => agir(() => mandats.retirerMandat(ctx, m.id, valeurDe('mr-motif')), 'Mandat retiré.', fermer),
      }),
    ],
  });
}
