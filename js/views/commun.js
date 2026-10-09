/**
 * Écrans partagés entre les espaces : suivi du transport, notifications,
 * abonnement, fiche du groupement, utilisateurs.
 *
 * Partagés **entre rôles**, donc le lieu où une faille se propagerait le plus
 * vite : tout y passe par `core/dom.js`, aucune chaîne n'est interprétée comme
 * du HTML (finding S13).
 *
 * @module views/commun
 */

import { date, dateHeure, el, montant } from '../core/dom.js';
import {
  afficherErreur,
  badge,
  bandeau,
  bouton,
  carte,
  champ,
  etatVide,
  icone,
  kpi,
  modale,
  tableau,
  toast,
} from '../core/ui.js';
import { POV, NATURE_INCIDENT, ORDRE_ETAPES, ETAT_APPARIEMENT, labelOf } from '../domain/enums.js';
import { decider, espaceDe } from '../domain/access.js';
import { routeDut, segmentEspace } from '../core/nav.js';
import { role } from '../domain/roles.js';
import { droitsDuRole } from '../domain/permissions.js';
import {
  compter,
  immatriculationDe,
  lire as lireProjete,
  nomDe,
  nomUtilisateur,
  projeterOu,
  refDe,
  tarifDe,
} from './_donnees.js';
import { depot } from '../repositories/index.js';
import { abonnementDe } from '../services/auth.service.js';
import { soldeDe } from '../services/compte.service.js';
import * as transportSvc from '../services/transport.service.js';
import { composer, marquerLue, mesNotifications } from '../services/notification.service.js';

/* ================================================================== *
 * Suivi du transport — six étapes (U2, décision D36)
 * ================================================================== */

/** @param {any} ctx */
export function suivi(ctx) {
  const transports = transportSvc.transportsVisibles(ctx);

  if (transports.length === 0) {
    return el('div.page', {}, [
      etatVide({
        titre: 'Aucun transport en cours',
        message:
          'Un transport est créé dès qu’une mise en relation est validée. Il n’y a ' +
          'pas de transport sans mise en relation.',
      }),
    ]);
  }

  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      message:
        'Les six étapes du suivi sont une proposition du POC : le système existant ne ' +
        'les formalise pas. Aucun saut, aucun retour en arrière ; un incident ' +
        's’inscrit au journal sans changer l’étape en cours.',
    }),
    ...transports.map((t) => ficheTransport(ctx, t)),
  ]);
}

function ficheTransport(ctx, t) {
  const a = t.appariement ?? {};
  const documentDut = a.etat === ETAT_APPARIEMENT.VALIDER ? routeDut(ctx, t.appariementId) : null;
  const preparationDut = segmentEspace(ctx) === 'transporteur' && decider(ctx, 'dut.generer', { groupementId: a.groupementTransporteurId }).autorise;
  const contrepartie =
    a.groupementAffreteurId === ctx.groupementId
      ? a.groupementTransporteurId
      : a.groupementAffreteurId;

  return carte({
    titre: `Transport ${a.reference ?? ''}`,
    sousTitre: `Avec ${nomDe(contrepartie)}`,
    actions: [
      documentDut ? el('a.btn', { href: documentDut, text: preparationDut ? 'Préparer le DUT' : 'Consulter le DUT' }) : null,
      ['livre', 'cloture'].includes(t.etape) && a.groupementTransporteurId === ctx.groupementId
        ? el('a.btn.btn-primary', {
            href: `#/${segmentEspace(ctx)}/offres/nouvelle?retour=${encodeURIComponent(t.id)}`,
            text: 'Confirmer une nouvelle disponibilité',
          }) : null,
      t.avancement?.vers
        ? bouton({
            libelle:
              t.avancement.vers === 'cloture'
                ? 'Clôturer'
                : `Passer à « ${labelOf(t.avancement.vers)} »`,
            variante: 'primary',
            motif: t.avancement.possible ? null : t.avancement.motif,
            onClick: () => dialogueAvancement(ctx, t),
          })
        : null,
      bouton({
        libelle: 'Signaler un incident',
        variante: 'ghost',
        icone: 'alert',
        onClick: () => dialogueIncident(ctx, t),
      }),
    ],
    corps: [
      chronologieEtapes(t.etape),
      el('h3', { text: 'Journal des événements' }),
      tableau({
        colonnes: ['Horodatage', 'Type', 'Étape ou nature', 'Auteur', 'Observation'],
        lignes: (t.journal ?? []).map((e) => [
          dateHeure(e.horodatage),
          e.type === 'incident' ? el('span.badge.badge-warning', { text: 'Incident' }) : 'Étape',
          // QA-M7 : `labelOf` lève sur une valeur non répertoriée — voulu en
          // développement, mais une donnée corrompue faisait tomber TOUT
          // l'écran de suivi. Ici, la valeur brute est préférable à la page
          // blanche ; elle se voit et se diagnostique.
          libelleTolerant(e.valeur),
          nomDe(e.auteurGroupementId),
          // Trois cas distincts, à ne pas confondre : l'auteur est le lecteur
          // (rien à cacher), le champ a été retiré par la projection (tiers non
          // apparié), ou il n'y avait simplement pas d'observation.
          observationLisible(ctx, e),
        ]),
      }),
    ],
  });
}

/**
 * Libellé d'une valeur de journal, sans faire tomber l'écran si elle est
 * inconnue. Le reste de l'application utilise `labelOf`, qui lève : c'est la
 * garantie D34. Ici, la donnée peut avoir été corrompue hors de l'application.
 * @param {string} valeur
 * @returns {string}
 */
function libelleTolerant(valeur) {
  try {
    return labelOf(valeur);
  } catch {
    return String(valeur);
  }
}

/** Chronologie des six étapes, avec celles franchies marquées. */
function chronologieEtapes(etapeCourante) {
  const etapes = ORDRE_ETAPES;
  const index = etapes.indexOf(etapeCourante);

  /** @type {Array<Node>} */
  const noeuds = [];
  etapes.forEach((e, i) => {
    if (i > 0) {
      noeuds.push(el('span', { class: `stepper-h-connector${i <= index ? ' done' : ''}` }));
    }
    noeuds.push(
      el('div', { class: `stepper-h-step${i < index ? ' done' : ''}${i === index ? ' current' : ''}` }, [
        el('span.dot', {}, [i < index ? icone('check', 12) : el('span', { text: String(i + 1) })]),
        el('span.label', { text: labelOf(e) }),
      ]),
    );
  });
  return el('div.stepper-h', {}, noeuds);
}

/**
 * Rend l'observation d'un événement, ou dit pourquoi elle est absente.
 * @param {any} ctx
 * @param {Record<string, any>} evenement
 */
function observationLisible(ctx, evenement) {
  if ('observation' in evenement) return evenement.observation || '—';

  // Le champ est absent. Deux causes opposées, qu'il serait trompeur de
  // confondre : soit l'auteur est le lecteur lui-même et il n'a rien saisi,
  // soit la projection l'a retiré parce que l'auteur est un tiers dont les
  // coordonnées ne sont pas libérées. Dire « non communiquée » sur sa propre
  // ligne laisserait croire à une rétention qui n'existe pas.
  if (evenement.auteurGroupementId === ctx.groupementId) return '—';
  return el('span.subtitle', { text: 'non communiquée' });
}

function dialogueAvancement(ctx, t) {
  const fermer = modale({
    titre: `Passer à « ${labelOf(t.avancement.vers)} »`,
    corps: [
      el('p', {
        text:
          'Cet avancement est définitif : aucun retour en arrière n’est possible. ' +
          'L’autre partie en sera informée.',
      }),
      champ({ id: 'av-obs', label: 'Observation', type: 'textarea' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Confirmer',
        variante: 'primary',
        onClick: () => {
          try {
            transportSvc.avancer(ctx, t.id, {
              observation: document.getElementById('av-obs')?.value || undefined,
            });
            fermer();
            toast('Étape enregistrée.');
            globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

function dialogueIncident(ctx, t) {
  const fermer = modale({
    titre: 'Signaler un incident',
    corps: [
      el('p', { text: 'L’incident s’inscrit au journal sans changer l’étape en cours.' }),
      champ({
        id: 'in-nature',
        label: 'Nature',
        requis: true,
        options: [
          { valeur: NATURE_INCIDENT.PANNE, libelle: 'Panne' },
          { valeur: NATURE_INCIDENT.RETARD, libelle: 'Retard' },
          { valeur: NATURE_INCIDENT.BARRAGE, libelle: 'Barrage' },
          { valeur: NATURE_INCIDENT.LITIGE_CHARGEMENT, libelle: 'Litige au chargement' },
        ],
      }),
      champ({ id: 'in-desc', label: 'Description', type: 'textarea', requis: true }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Signaler',
        variante: 'primary',
        onClick: () => {
          try {
            transportSvc.signalerIncident(ctx, t.id, {
              nature: document.getElementById('in-nature')?.value,
              description: document.getElementById('in-desc')?.value,
            });
            fermer();
            toast('Incident inscrit au journal.');
            globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

/* ================================================================== *
 * Notifications
 * ================================================================== */

/** @param {any} ctx */
export function notifications(ctx) {
  const liste = mesNotifications(ctx);

  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      message:
        'Les notifications sont dans l’application uniquement. Le système existant ' +
        'double chaque courriel d’un SMS via une procédure du serveur SQL : non ' +
        'reproductible sans backend.',
    }),
    carte({
      titre: 'Mes notifications',
      corps: [
        liste.length === 0
          ? etatVide({ titre: 'Aucune notification', message: 'Vous êtes à jour.' })
          : el('div.card-grid', {}, liste.map((n) => {
              // La vue COMPOSE le message depuis { code, params } et le pose en
              // texte : le domaine ne fabrique jamais de phrase (S1 + S13).
              const { objet, texte } = composer(n.message ?? {});
              return el('li', { class: `notif${n.luLe ? '' : ' is-unread'}` }, [
                el('div', {}, [
                  el('strong', { text: objet }),
                  el('p', { text: texte }),
                  el('small', { text: dateHeure(n.creeeLe) }),
                ]),
                n.luLe
                  ? null
                  : bouton({
                      libelle: 'Marquer lue',
                      variante: 'ghost',
                      onClick: () => {
                        marquerLue(ctx, n.id);
                        globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
                      },
                    }),
              ]);
            })),
      ],
    }),
  ]);
}

/* ================================================================== *
 * Abonnement
 * ================================================================== */

/** @param {any} ctx */
export function abonnement(ctx) {
  const abo = abonnementDe(ctx.groupementId);
  const enregistrement = depot('abonnement').brutOu((a) => a.groupementId === ctx.groupementId)[0];

  return el('div.page', {}, [
    abo.actif
      ? bandeau({ ton: 'ok', message: `Votre abonnement est actif jusqu’au ${date(abo.finitLe)}.` })
      : bandeau({
          ton: 'err',
          titre: 'Abonnement expiré',
          message:
            `L’abonnement de votre groupement a expiré le ${date(abo.finitLe)}. ` +
            'Tant qu’il n’est pas renouvelé, les fonctionnalités du marché vous sont ' +
            'fermées. Le renouvellement est saisi par le concessionnaire : le paiement ' +
            'en ligne est hors du périmètre de cette démonstration.',
        }),
    carte({
      titre: 'Abonnement',
      corps: [
        el('div.recap-grid', {}, [
          el('div.recap-item', {}, [el('span', { text: 'Groupement' }), el('strong', { text: nomDe(ctx.groupementId) })]),
          el('div.recap-item', {}, [el('span', { text: 'Montant' }), el('strong', { text: enregistrement ? montant(enregistrement.montant) : '—' })]),
          el('div.recap-item', {}, [el('span', { text: 'Période' }), el('strong', {
            text: enregistrement
              ? `${date(enregistrement.debuteLe)} → ${date(enregistrement.finitLe)}`
              : '—',
          })]),
          el('div.recap-item', {}, [el('span', { text: 'État' }), el('strong', {}, [badge(abo.actif ? 'actif' : 'expire')])]),
        ]),
      ],
    }),
  ]);
}

/* ================================================================== *
 * Fiche du groupement et utilisateurs
 * ================================================================== */

/** @param {any} ctx */
export function groupement(ctx) {
  const g = depot('groupement').lire(ctx, ctx.groupementId, { proprietaireId: ctx.groupementId });
  if (!g) return etatVide({ message: 'Aucun groupement rattaché à votre compte.' });

  return el('div.page', {}, [
    carte({
      titre: 'Fiche du groupement',
      corps: [
        el('div.recap-grid', {}, [
          el('div.recap-item', {}, [el('span', { text: 'Raison sociale' }), el('strong', { text: g.raisonSociale })]),
          el('div.recap-item', {}, [el('span', { text: 'Type' }), el('strong', { text: g.type })]),
          el('div.recap-item', {}, [el('span', { text: 'RCCM' }), el('strong', { text: g.rccm ?? '—' })]),
          el('div.recap-item', {}, [el('span', { text: 'Compte contribuable' }), el('strong', { text: g.compteContribuable ?? '—' })]),
          g.carteTransporteurNumero
            ? el('div.recap-item', {}, [el('span', { text: 'Carte de transporteur' }), el('strong', { text: `${g.carteTransporteurNumero} — échéance ${date(g.carteTransporteurEcheance)}` })])
            : null,
          el('div.recap-item', {}, [el('span', { text: 'Pays' }), el('strong', { text: g.pays })]),
          el('div.recap-item', {}, [el('span', { text: 'Solde du compte' }), el('strong', { text: montant(soldeDe(ctx.groupementId)) })]),
        ]),
      ],
    }),
  ]);
}

/** @param {any} ctx */
export function utilisateurs(ctx) {
  const liste = depot('utilisateur').lisiblesPar(ctx, 'utilisateur.lire');
  return el('div.page', {}, [
    carte({
      titre: 'Utilisateurs et auxiliaires',
      corps: [
        tableau({
          colonnes: ['Nom', 'Adresse', 'Rôle', 'État', 'Dernier accès'],
          lignes: liste.map((u) => [
            `${u.prenom ?? ''} ${u.nom}`.trim(),
            u.email ?? '—',
            role(u.roleId).libelle,
            badge(u.etat),
            u.dernierAccesLe ? dateHeure(u.dernierAccesLe) : 'Jamais',
          ]),
          vide: etatVide({ titre: 'Aucun utilisateur', message: 'Aucun compte rattaché.' }),
        }),
        bandeau({
          ton: 'info',
          message:
            'Un auxiliaire agit pour le compte du groupement sans engager ses finances : ' +
            'il ne valide pas de mise en relation et ne répond pas aux réservations.',
        }),
      ],
    }),
  ]);
}

/* ================================================================== *
 * Espace minimal — rôles de niveau 3
 * ================================================================== */

/**
 * Accueil des profils de back-office.
 *
 * Ouvre la consultation des DUT quand elle est autorisée. Pour les autres
 * profils, explique les limites de leur espace sans leur ajouter de droits.
 *
 * @param {any} ctx
 */
export function accueilMinimal(ctx) {
  const r = role(ctx.roleId);
  const droits = droitsDuRole(ctx.roleId);
  const nb = Object.values(droits).reduce((n, l) => n + l.length, 0);
  const documents = routeDut(ctx);

  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      titre: documents ? 'Votre espace de consultation des DUT' : `Rôle « ${r.libelle} » — modélisé, sans écran métier`,
      message: documents
        ? 'Retrouvez les Documents Uniques de Transport générés sur la plateforme. Votre rôle permet leur consultation ; leur préparation reste réservée aux acteurs habilités.'
        : 'Ce rôle est déclaré dans la matrice des droits et administrable, mais son ' +
          'module n’est pas au périmètre du POC : caisse, contentieux et comptabilité ' +
          'sont explicitement écartés. Ce n’est pas un défaut d’affichage — c’est le ' +
          'refus par défaut qui s’applique.',
    }),
    documents ? carte({
      titre: 'Documents de transport',
      sousTitre: 'Consultez les DUT et les informations de transport accessibles à votre rôle.',
      actions: [el('a.btn.btn-primary', { href: documents, text: 'Consulter les DUT' })],
      corps: [el('p', { text: 'Recherchez un document par sa référence et ouvrez sa fiche pour en consulter le détail.' })],
    }) : null,
    carte({
      titre: 'Droits effectivement accordés',
      sousTitre: nb === 0 ? 'Aucun droit métier.' : `${nb} droit(s).`,
      corps: [
        nb === 0
          ? el('p', {
              text:
                'Aucun droit métier n’est accordé à ce rôle. Lui en accorder « en ' +
                'attendant » créerait le compte fourre-tout qu’une matrice de droits ' +
                'sert précisément à éviter.',
            })
          : el('div', {}, Object.entries(droits).map(([categorie, lignes]) =>
              el('div.recap-section', {}, [
                el('h3', { text: categorie }),
                el('ul', {}, lignes.map((d) =>
                  el('li', { text: `${d.libelle} — portée : ${d.portee}` }),
                )),
              ]),
            )),
      ],
    }),
    el('p.subtitle', { text: `Espace applicatif : ${espaceDe(ctx.roleId)}.` }),
  ]);
}
