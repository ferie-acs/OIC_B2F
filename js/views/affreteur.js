import { declarationsVue } from './declarations-affreteur.js';
import { carteOffres } from '../core/carte-offres.js?v=20261009-carte-2';
import { camion, libelleTrajet } from '../core/camion.js';
import { reservationsVue } from './reservations-affreteur.js?v=20261009-carte-2';
import { marcheCarte } from './marche-affreteur.js?v=20261009-carte-2';
/**
 * Écrans de l'espace Affréteur — et de ses auxiliaires, qui l'empruntent.
 *
 * C'est la matrice des droits qui restreint, jamais le chemin
 * (`01-parcours-et-navigation.md` § 3.4).
 *
 * @module views/affreteur
 */

import { retourPublic } from '../services/marche-public.service.js';
import { date, dateHeure, el, heuresDepuis, icone, montant } from '../core/dom.js';
import {
  badge,
  bandeau,
  bouton,
  carte,
  champ,
  etatVide,
  kpi,
  modale,
  registreDebit,
  tableau,
  toast,
  afficherErreur,
} from '../core/ui.js';
import { aller } from '../core/router.js';
import { localiser, routeDut, segmentEspace } from '../core/nav.js';
import { POV, CODE_TARIF, ETAPE_TRANSPORT, ETAT_APPARIEMENT, ETAT_DEMANDE, labelOf } from '../domain/enums.js';
import { decider } from '../domain/access.js';
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
import { couverture, mouvementsDe, soldeDe } from '../services/compte.service.js';
import * as fret from '../services/fret.service.js';
import * as flotte from '../services/flotte.service.js';
import * as matching from '../services/matching.service.js';
import * as preferences from '../services/preferences.service.js';
import * as transportSvc from '../services/transport.service.js';
import { rafraichirContexte } from '../services/auth.service.js';
import { echeanceDe } from '../domain/matching.state.js';
import { blocConfiance, resumeConfiance } from './confiance.js';
/* Lot b3 : demandes (modification, republication) et propositions reçues (sens B) */
import { vueDemandes } from './demandes-affreteur.js';
import { actionsProposition, estPropositionRecue } from './propositions-affreteur.js';

/** Libellé d'une entrée de référentiel. */

/** Raison sociale d'un groupement. */

/* ================================================================== *
 * Tableau de bord
 * ================================================================== */

export { dashboard } from './dashboard-affreteur.js?v=20261009-carte-2';

/* ================================================================== *
 * Déclarations de fret
 * ================================================================== */

/** @param {any} ctx */
export function declarations(ctx) {
  return declarationsVue(ctx);
}

/* ================================================================== *
 * Nouvelle déclaration — assistant en trois étapes
 * ================================================================== */

/**
 * État de saisie de l'assistant, conservé entre les trois étapes.
 *
 * **Rattaché à l'utilisateur** (correctif QA-BROUILLON). Au niveau module, il
 * survivait à un changement de compte : l'affréteur 2 retrouvait le libellé,
 * les dates et le corridor saisis par l'affréteur 1, et « Publier » les aurait
 * publiés sous son propre groupement. Or changer de compte sans recharger est
 * le geste le plus fréquent d'une démonstration multi-rôles.
 */
let brouillon = null;
/** Utilisateur auquel le brouillon appartient. */
let brouillonPour = null;

/** Abandonne l'état de saisie. Appelé à la déconnexion. */
export function oublierBrouillon() {
  brouillon = null;
  brouillonPour = null;
}

/** @param {any} ctx */
export function nouvelleDeclaration(ctx) {
  if (brouillonPour !== ctx.utilisateurId) oublierBrouillon();
  brouillonPour = ctx.utilisateurId;
  brouillon ??= { fret: {}, besoin: {}, lignes: [] };

  const optionsDe = (famille) =>
    depot('referentiel')
      .brutOu((r) => r.famille === famille && r.actif)
      .map((r) => ({ valeur: r.id, libelle: r.libelle }));

  // Le conteneur portait `.wizard` (grille 2 colonnes) : les quatre blocs de
  // l'assistant — étapes, rappel, formulaire, actions — se rangeaient en zigzag
  // sur deux colonnes. L'empilement de page suffit ; seules les deux colonnes
  // « formulaire / récapitulatif » sont volontaires, elles sont plus bas.
  const conteneur = el('div.page', {});

  const rendre = (etape) => {
    const corps =
      etape === 1
        ? etape1(optionsDe)
        : etape === 2
          ? etape2(optionsDe)
          : etape3(optionsDe, rendre);

    conteneur.replaceChildren(
      // Les classes `wizard-step` / `wizard-num` n'existaient nulle part dans la
      // feuille de style : l'assistant affichait « 1Le fret2Le besoin… » en texte
      // brut. On reprend le balisage du stepper commun, qui lui est stylé.
      el('div.stepper-h', {}, [
        ...['Le fret', 'Le besoin de transport', 'Les marchandises'].flatMap((t, i) =>
          [
            i > 0 ? el('span', { class: `stepper-h-connector${i < etape ? ' done' : ''}` }) : null,
            el('div', { class: `stepper-h-step${i + 1 < etape ? ' done' : ''}${i + 1 === etape ? ' current' : ''}` }, [
              el('span.dot', {}, [
                i + 1 < etape ? icone('check', 12) : el('span', { text: String(i + 1) }),
              ]),
              el('span.label', { text: t }),
            ]),
          ].filter(Boolean),
        ),
      ]),
      bandeau({
        ton: 'info',
        message:
          'Publier une demande ne coûte rien. Les frais de mise en relation ne sont ' +
          'débités qu’à la validation finale, et seulement si vous validez.',
      }),
      el('div.ops-grid', {}, [
        carte({ titre: ['Le fret', 'Le besoin de transport', 'Les marchandises'][etape - 1], corps: [corps] }),
        recapitulatif(),
      ]),
      el('div.wizard-footer', {}, [
        etape > 1
          ? bouton({ libelle: 'Précédent', icone: 'arrow-left', onClick: () => rendre(etape - 1) })
          : null,
        etape < 3
          ? bouton({
              libelle: 'Suivant',
              variante: 'primary',
              onClick: () => {
                if (collecter(etape)) rendre(etape + 1);
              },
            })
          : bouton({
              libelle: 'Publier la demande',
              variante: 'primary',
              icone: 'check',
              onClick: () => publier(ctx),
            }),
      ]),
    );
  };

  /** Lit les champs de l'étape courante dans le brouillon. */
  function collecter(etape) {
    const v = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id))?.value ?? '';
    if (etape === 1) {
      brouillon.fret = {
        libelle: v('f-libelle'),
        provenanceId: v('f-prov'),
        destinationId: v('f-dest'),
        observation: v('f-obs'),
      };
      if (!brouillon.fret.libelle || !brouillon.fret.provenanceId || !brouillon.fret.destinationId) {
        toast('Renseignez le libellé, la provenance et la destination.', 'err');
        return false;
      }
      if (brouillon.fret.provenanceId === brouillon.fret.destinationId) {
        toast('La destination doit être différente de la provenance.', 'err');
        return false;
      }
    }
    if (etape === 2) {
      brouillon.besoin = {
        departPrevu: v('b-depart'),
        arriveePrevue: v('b-arrivee'),
        capaciteId: v('b-capacite'),
        carrosserieId: v('b-carrosserie'),
        essieuxId: v('b-essieux') || undefined,
        contraintes: v('b-contraintes'),
      };
      const { departPrevu, arriveePrevue, capaciteId, carrosserieId } = brouillon.besoin;
      if (!departPrevu || !arriveePrevue || !capaciteId || !carrosserieId) {
        toast('Dates, capacité et carrosserie sont obligatoires.', 'err');
        return false;
      }
      if (new Date(arriveePrevue) <= new Date(departPrevu)) {
        toast('L’arrivée doit être strictement postérieure au départ.', 'err');
        return false;
      }
    }
    return true;
  }

  function etape1(options) {
    return el('div', {}, [
      champ({ id: 'f-libelle', label: 'Libellé du fret', requis: true, valeur: brouillon.fret.libelle, attrs: { maxlength: 120 } }),
      champ({ id: 'f-prov', label: 'Provenance', requis: true, options: options('localites'), valeur: brouillon.fret.provenanceId }),
      champ({ id: 'f-dest', label: 'Destination', requis: true, options: options('localites'), valeur: brouillon.fret.destinationId, aide: 'Différente de la provenance.' }),
      champ({ id: 'f-obs', label: 'Observation', type: 'textarea', valeur: brouillon.fret.observation }),
    ]);
  }

  function etape2(options) {
    return el('div', {}, [
      champ({ id: 'b-depart', label: 'Date et heure de départ', type: 'datetime-local', requis: true, valeur: brouillon.besoin.departPrevu }),
      champ({ id: 'b-arrivee', label: 'Date et heure d’arrivée souhaitée', type: 'datetime-local', requis: true, valeur: brouillon.besoin.arriveePrevue, aide: 'Strictement postérieure au départ.' }),
      champ({ id: 'b-capacite', label: 'Capacité', requis: true, options: options('capacites'), valeur: brouillon.besoin.capaciteId }),
      champ({ id: 'b-carrosserie', label: 'Carrosserie', requis: true, options: options('carrosseries'), valeur: brouillon.besoin.carrosserieId }),
      champ({ id: 'b-essieux', label: 'Nombre d’essieux', options: options('essieux'), valeur: brouillon.besoin.essieuxId }),
      champ({ id: 'b-contraintes', label: 'Contraintes particulières', type: 'textarea', valeur: brouillon.besoin.contraintes, aide: 'Visible des transporteurs.' }),
    ]);
  }

  function etape3(options, redessiner) {
    return el('div', {}, [
      el('div.recap-section', {}, brouillon.lignes.map((l, i) =>
        el('div.recap-item', {}, [
          el('span', { text: `${refDe(l.produitId)} — ${l.poidsT} t` }),
          bouton({
            libelle: 'Retirer',
            variante: 'ghost',
            onClick: () => {
              brouillon.lignes.splice(i, 1);
              redessiner(3);
            },
          }),
        ]),
      )),
      champ({ id: 'l-produit', label: 'Produit', options: options('produits_sh'), aide: 'Nomenclature douanière SH.' }),
      champ({ id: 'l-poids', label: 'Poids (t)', type: 'number', attrs: { min: '0.1', step: '0.1' } }),
      champ({ id: 'l-volume', label: 'Volume (m³)', type: 'number', attrs: { min: '0', step: '0.1' } }),
      champ({ id: 'l-colis', label: 'Nombre de colis', type: 'number', attrs: { min: '1', step: '1' } }),
      champ({ id: 'l-emballage', label: 'Emballage', options: options('emballages') }),
      bouton({
        libelle: 'Ajouter cette marchandise',
        icone: 'plus',
        onClick: () => {
          const v = (id) => document.getElementById(id)?.value ?? '';
          const produitId = v('l-produit');
          const poidsT = Number(v('l-poids'));
          if (!produitId || !(poidsT > 0)) {
            toast('Un produit et un poids strictement positif sont obligatoires.', 'err');
            return;
          }
          brouillon.lignes.push({
            produitId,
            poidsT,
            volumeM3: v('l-volume') ? Number(v('l-volume')) : undefined,
            nombreColis: v('l-colis') ? Number(v('l-colis')) : undefined,
            emballageId: v('l-emballage') || undefined,
          });
          redessiner(3);
        },
      }),
    ]);
  }

  function recapitulatif() {
    const poids = brouillon.lignes.reduce((n, l) => n + l.poidsT, 0);
    return el('aside.live-recap', {}, [
      el('h3', { text: 'Récapitulatif' }),
      // Le récapitulatif mélangeait `dt`/`dd` nus et `.recap-item` : deux moitiés
      // sur quatre n'étaient pas stylées. Une seule forme, celle qui l'est.
      el('dl.live-recap-list', {}, [
        ['Fret', brouillon.fret.libelle || '—'],
        [
          'Corridor',
          brouillon.fret.provenanceId
            ? `${refDe(brouillon.fret.provenanceId)} → ${refDe(brouillon.fret.destinationId)}`
            : '—',
        ],
        ['Départ', brouillon.besoin.departPrevu ? dateHeure(brouillon.besoin.departPrevu) : '—'],
        ['Marchandises', brouillon.lignes.length ? `${brouillon.lignes.length} ligne(s) · ${poids} t` : '—'],
      ].map(([libelle, valeur]) =>
        el('div.live-recap-item', {}, [
          el('dt', {}, [el('span', { text: libelle })]),
          el('dd', {}, [el('strong', { text: valeur })]),
        ]),
      )),
    ]);
  }

  function publier(contexte) {
    if (brouillon.lignes.length === 0) {
      toast('Ajoutez au moins une ligne de marchandise.', 'err');
      return;
    }
    try {
      // QA-M1 : un double clic trouvait `brouillon` à null et levait un
      // TypeError en console, sans rien dire à l'utilisateur.
      if (!brouillon) return;
      const aPublier = brouillon;
      oublierBrouillon();
      const { demande } = fret.publierFret(contexte, aPublier);
      toast(`Demande ${demande.reference} publiée.`);
      aller('#/affreteur/marche');
    } catch (e) {
      brouillon = aPublier;
      brouillonPour = contexte.utilisateurId;
      afficherErreur(e);
    }
  }

  rendre(1);
  return conteneur;
}

/* ================================================================== *
 * Demandes de transport
 * ================================================================== */

/** @param {any} ctx */
export function demandes(ctx, params = {}) {
  // Lot b3 : modification et republication des demandes, avec trace.
  return vueDemandes(ctx, params);
}

/** Ancienne liste des demandes, conservée pour mémoire. @param {any} ctx */
export function demandesListeSimple(ctx) {
  const liste = fret.mesDemandes(ctx);
  return el('div.page', {}, [
    carte({
      titre: 'Demandes de transport',
      corps: [
        tableau({
          colonnes: ['Référence', 'Corridor', 'Départ', 'État', ''],
          lignes: liste.map((d) => {
            const dec = depot('declaration').brutParId(d.declarationId);
            const annulable = decider(ctx, 'demande.annuler', { groupementId: d.groupementId });
            const figee = d.etat === ETAT_DEMANDE.VALIDEE || d.etat === ETAT_DEMANDE.ANNULEE;
            return [
              d.reference,
              `${refDe(dec?.provenanceId)} → ${refDe(dec?.destinationId)}`,
              el('span', {}, [
                date(d.departPrevu),
                d.departDepasse ? el('span.badge.badge-warning', { text: ' · date dépassée' }) : null,
              ]),
              badge(d.etat, POV.AFFRETEUR),
              bouton({
                libelle: 'Annuler',
                variante: 'ghost',
                motif: figee
                  ? 'Cette demande a donné lieu à une mise en relation validée et à un débit. Elle ne peut plus être annulée.'
                  : !annulable.autorise
                    ? annulable.explication
                    : null,
                onClick: () => {
                  try {
                    fret.annulerDemande(ctx, d.id);
                    toast('Demande annulée.');
                    aller('#/affreteur/demandes');
                    globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
                  } catch (e) {
                    afficherErreur(e);
                  }
                },
              }),
            ];
          }),
          vide: etatVide({
            titre: 'Aucune demande',
            message: 'Déclarez un fret pour créer votre première demande de transport.',
          }),
        }),
      ],
    }),
  ]);
}

/* ================================================================== *
 * Marché — rechercher un véhicule
 * ================================================================== */

/** @param {any} ctx */
export function marche(ctx, params = {}) {
  return marcheCarte(ctx, params, carteOffre);
}

/** Carte d'offre du marché. Les coordonnées n'y figurent pas — et ne peuvent pas. */
function carteOffre(ctx, offre, apresAction) {
  const v = offre.vehicule ?? {};
  const ligne = (icon, label, value) => el('div.vehicle-detail-row', {}, [
    icone(icon, 19), el('div', {}, [el('span', {text:label}), el('strong', {text:value})]),
  ]);
  return el('article.vehicle-detail-info', {}, [
    el('div.vehicle-detail-identity', {}, [
      el('span.vehicle-detail-truck', {}, [camion(offre, 42)]),
      // Correctif anti-fraude n° 1 : ni plaque ni raison sociale avant validation.
      el('div', {}, [el('h2', {text:`${refDe(v.carrosserieId)} · ${v.capaciteT ?? '—'} t`}), el('p', {text: offre.confiance ? resumeConfiance(offre.confiance) : 'Transporteur'})]),
    ]),
    blocConfiance(offre.groupementId),
    el('span.truck-journey-label', {text:libelleTrajet(offre)}),
    ligne('map-pin', 'Trajet proposé', `${refDe(offre.localiteDepartId)} → ${refDe(offre.localiteArriveeId)}`),
    ligne('package', 'Véhicule et capacité', `${refDe(v.carrosserieId)} · ${v.capaciteT ?? '—'} t · ${refDe(v.essieuxId)}`),
    ligne('calendar', 'Disponibilité', `${date(offre.disponibleDu)} — ${date(offre.disponibleAu)}`),
    el('div.vehicle-detail-price', {}, [el('span', {text:'Prix indicatif'}), el('strong', {text:offre.prixKmT ? `${offre.prixKmT} F/km·t` : 'Non renseigné'})]),
    el('div.vehicle-detail-action', {}, [
      el('p', {text:'Réservation gratuite. Frais de mise en relation à la validation.'}),
      bouton({libelle:'Réserver ce véhicule',variante:'primary',onClick:()=>dialogueReservation(ctx,offre,apresAction)}),
    ]),
  ]);
}

/** Dialogue de réservation : il faut choisir LA demande à rattacher. */
function dialogueReservation(ctx, offre, apresAction) {
  const eligibles = fret
    .mesDemandes(ctx, ETAT_DEMANDE.PUBLIEE)
    .filter((d) => matching.fenetresSeRecouvrent(offre, d));

  if (eligibles.length === 0) {
    modale({
      titre: 'Aucune demande éligible',
      corps: [
        el('p', {
          text:
            'Aucune de vos demandes publiées ne tombe dans la fenêtre de ' +
            'disponibilité de ce véhicule. Créez une demande adaptée, ou choisissez ' +
            'un autre véhicule.',
        }),
      ],
      actions: [
        bouton({
          libelle: 'Déclarer un fret',
          variante: 'primary',
          onClick: () => aller('#/affreteur/declarations/nouvelle'),
        }),
      ],
    });
    return;
  }

  const fermer = modale({
    titre: 'Réserver ce véhicule',
    corps: [
      bandeau({ ton: 'info', message: 'La réservation est gratuite. Rien n’est débité à cette étape.' }),
      champ({
        id: 'r-demande',
        label: 'Demande de transport à rattacher',
        requis: true,
        options: eligibles.map((d) => ({ valeur: d.id, libelle: `${d.reference} — ${date(d.departPrevu)}` })),
      }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Réserver',
        variante: 'primary',
        onClick: () => {
          const demandeId = document.getElementById('r-demande')?.value;
          if (!demandeId) {
            toast('Choisissez une demande.', 'err');
            return;
          }
          try {
            matching.engager(ctx, { offreId: offre.id, demandeId });
            fermer();
            toast('Réservation transmise au transporteur.');
            apresAction();
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

/* ================================================================== *
 * Mes réservations
 * ================================================================== */

/** @param {any} ctx */
export function reservations(ctx) {
  return reservationsVue(ctx, actionsReservation);
}

function actionsReservation(ctx, a) {
  // Lot b3 : sens B — l'affréteur accepte ou refuse la proposition du transporteur.
  if (estPropositionRecue(a)) return actionsProposition(ctx, a);
  if (a.etat === ETAT_APPARIEMENT.ACCEPTER) {
    return el('a', { class: 'btn btn-primary btn-sm', href: `#/affreteur/validation/${a.id}`, text: 'Valider' });
  }
  if (a.etat === ETAT_APPARIEMENT.REJETER) {
    return el('a', { class: 'link', href: '#/affreteur/marche', text: 'Chercher un autre véhicule' });
  }
  if (a.etat === ETAT_APPARIEMENT.VALIDER) {
    return el('a', { class: 'link', href: `#/affreteur/relations/${a.id}`, text: 'Voir la mise en relation' });
  }
  const annulable = decider(ctx, 'appariement.annuler', { groupementId: ctx.groupementId });
  return bouton({
    libelle: 'Annuler',
    variante: 'ghost',
    motif: annulable.autorise ? null : annulable.explication,
    onClick: () => {
      try {
        matching.annuler(ctx, a.id);
        toast('Réservation annulée.');
        globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) {
        afficherErreur(e);
      }
    },
  });
}

/* ================================================================== *
 * Validation — l'écran pivot du POC
 * ================================================================== */

/** @param {any} ctx @param {Record<string, string>} params */
export function validation(ctx, params = {}) {
  const visibles = matching.mesAppariements(ctx);
  const enAttente = visibles.filter(a => a.etat === ETAT_APPARIEMENT.ACCEPTER);
  const introuvable = params.id && !visibles.some(a => a.id === params.id);
  if (params.id && !introuvable) return ecranValidation(ctx, params.id);
  if (!params.id && enAttente.length === 1) return ecranValidation(ctx, enAttente[0].id);
  return el('div.page.validation-fresh', {}, [
    introuvable ? carte({titre:'Cette réservation n’est plus accessible',corps:[
      el('p',{text:'Le lien ne correspond à aucune mise en relation accessible dans votre espace. Retrouvez ci-dessous vos dossiers en attente de validation.'}),
      el('a.btn.btn-secondary',{href:`#/${segmentEspace(ctx)}/reservations`},[icone('arrow-left',18),'Mes réservations']),
    ]}) : null,
    enAttente.length ? carte({titre:'Mises en relation à valider',sousTitre:'Consultez le transport et les frais avant de confirmer.',corps:[
      el('div.carrier-card-grid',{},enAttente.map(a=>el('article.carrier-person-card',{},[
        el('div.carrier-card-top',{},[icone('handshake',36),el('strong',{text:a.reference})]),
        el('h3',{text:nomDe(ctx, a.groupementTransporteurId)}),
        blocConfiance(a.groupementTransporteurId,{compact:true}),
        el('p.carrier-dates',{},[icone('calendar',18),`Acceptée le ${dateHeure(a.reponduLe)}`]),
        echeanceDe(a) ? el('p.carrier-dates',{},[icone('clock',18),`À valider avant le ${dateHeure(echeanceDe(a))}`]) : null,
        badge(a.etat),
        el('a.btn.btn-primary',{href:`#/${segmentEspace(ctx)}/validation/${a.id}`,text:'Examiner la réservation'}),
      ]))),
    ]}) : etatVide({titre:'Rien à valider',message:'Les réservations acceptées apparaîtront ici.',action:{libelle:'Voir mes réservations',onClick:()=>aller(`#/${segmentEspace(ctx)}/reservations`)}}),
  ]);
}

function ecranValidation(ctx, appariementId) {
  const p = matching.preparerValidation(ctx, appariementId);
  const a = p.appariement;
  const offre = depot('offre').brutParId(a.offreId);
  const demande = depot('demande').brutParId(a.demandeId);
  const dec = depot('declaration').brutParId(demande.declarationId);
  const vehicule = lireProjete(ctx, 'vehicule', offre.vehiculeId);

  const trajet = carteOffres(null, {compact:true});
  const annonce = {id:offre.id,type:'camions',localiteDepartId:dec.provenanceId,localiteArriveeId:dec.destinationId,reference:a.reference};
  trajet.update([annonce],annonce);
  return el('div.page.validation.validation-fresh', {}, [
    el('div.validation-heading',{},[
      el('div',{},[el('a.validation-back',{href:`#/${segmentEspace(ctx)}/reservations`,text:'← Mes réservations'}),el('h2',{text:a.reference}),el('p',{text:'Vérifiez le transport et les frais avant de confirmer la mise en relation.'})]),
      badge(a.etat, POV.AFFRETEUR),
    ]),
    el('div.validation-progress',{},[
      // Lot b3 : en sens B, le transporteur a proposé et l'affréteur a accepté.
      el('span',{},[icone('check-circle',20),a.sens==='demande_vers_offre'?'Proposition reçue':'Réservation envoyée']),
      el('span',{},[icone('check-circle',20),a.sens==='demande_vers_offre'?'Vous avez accepté':'Transporteur d’accord']),
      el('strong',{},[icone('handshake',24),'Votre validation']),
    ]),
    p.possible
      ? null
      : bandeau({
          ton: 'err',
          titre: 'Validation impossible',
          message: el('div', {}, p.refus.map((m) => el('p', { text: m }))),
        }),
    // Correctif anti-fraude n° 4 : l'acceptation du transporteur n'immobilise
    // pas son camion indéfiniment.
    p.possible && p.echeance
      ? bandeau({
          ton: 'info',
          message:
            `Validez avant le ${dateHeure(p.echeance)}. Passé ce délai, la mise en relation ` +
            'expire et le véhicule revient sur le marché ; rien n’est débité.',
        })
      : null,

    el('div.validation-layout', {}, [
      el('div.validation-main', {}, [
        carte({
          titre: 'Votre trajet',
          corps: [
            el('div.validation-route',{},[
              el('div',{},[el('small',{text:'DÉPART'}),el('strong',{text:refDe(dec.provenanceId)}),el('span',{text:dateHeure(demande.departPrevu)})]),
              icone('arrow-right',24),
              el('div',{},[el('small',{text:'ARRIVÉE PRÉVUE'}),el('strong',{text:refDe(dec.destinationId)}),el('span',{text:dateHeure(demande.arriveePrevue)})]),
            ]),
            el('div.validation-map',{},[trajet.element]),
            el('p.subtitle',{text:'Itinéraire indicatif entre villes · sans suivi GPS · hors contraintes poids lourds.'}),
            el('div.validation-cargo',{},[icone('package',40),el('div',{},[el('small',{text:'Marchandise à transporter'}),el('strong',{text:demande.lignes.map(l=>`${refDe(l.produitId)} · ${l.poidsT} t`).join(' / ')})])]),
          ],
        }),
        carte({
          titre: 'Le véhicule retenu',
          corps: [
            el('div.validation-truck',{},[camion(offre,160),el('div',{},[el('strong',{text:`${refDe(vehicule.carrosserieId)} · ${vehicule.capaciteT} t`}),el('span',{text:libelleTrajet(offre)})])]),
            // Correctif anti-fraude n° 1 : le nom et la plaque sont ce que la
            // validation achète. Avant, l'affréteur choisit sur la confiance.
            blocConfiance(a.groupementTransporteurId),
            el('div.recap-grid', {}, [
              el('div.recap-item', {}, [el('span', { text: 'Transporteur' }), el('strong', { text: nomDe(ctx, a.groupementTransporteurId) })]),
              el('div.recap-item', {}, [el('span', { text: 'Immatriculation' }), el('strong', { text: immatriculationDe(ctx, offre.vehiculeId) })]),
              el('dt', { text: 'Capacité' }),
              el('dd', { text: `${vehicule.capaciteT} t · ${refDe(vehicule.carrosserieId)} · ${refDe(vehicule.essieuxId)}` }),
              el('dt', { text: 'Prix déclaré' }),
              el('dd', { text: offre.prixKmT ? `${offre.prixKmT} F/km·t (indicatif)` : '—' }),
            ]),
          ],
        }),

      ]),

      // Chronologie : savoir ce qu'on achète avant de cliquer.
      el('aside.validation-aside', {}, [
        carte({
          titre: 'Le débit',
          sousTitre: 'Les deux parties sont débitées à la validation.',
          corps: [
            // Décision D60. L'écran montrait « Solde avant : 105 000 F CFA »
            // pour la contrepartie : la trésorerie exacte d'un partenaire,
            // parfois fournisseur d'un concurrent, alors que la matrice refuse
            // `compte.lire` sur le compte d'autrui.
            //
            // L'exigence D31 — montrer ce qui va se passer avant d'agir — est
            // tenue autrement : les DEUX montants de cette transaction sont
            // affichés (ce sont des frais, pas des soldes), avec le solde
            // résultant du seul compte de l'utilisateur. De la contrepartie, on
            // ne dit que ce dont l'utilisateur a besoin : sa capacité à payer.
            registreDebit({
              lignes: [
                {
                  partie: `${ctx.mandat ? 'Votre mandant' : 'Vous'} — ${nomDe(ctx, a.groupementAffreteurId)}`,
                  // Lot b2 : le solde exact ne va qu'à qui détient `compte.lire`.
                  solde: decider(ctx, 'compte.lire', { groupementId: ctx.groupementId }).autorise ? p.soldeUtilisateur : null,
                  frais: p.montantUtilisateur,
                  suffisant: p.utilisateurProvisionne,
                },
              ],
              contrepartie: {
                // Avant validation, nomDe rend l'alias « Transporteur T-XXXX » : ne pas le préfixer deux fois.
                partie: nomDe(ctx, a.groupementTransporteurId).startsWith('Transporteur ')
                  ? nomDe(ctx, a.groupementTransporteurId)
                  : `Transporteur — ${nomDe(ctx, a.groupementTransporteurId)}`,
                frais: p.fraisTransporteur,
                provisionnee: p.contrepartieProvisionnee,
              },
            }),
            el('p.subtitle', {
              text:
                'Le solde du compte de la contrepartie ne vous est pas communiqué : ' +
                'seule sa capacité à régler ces frais vous concerne.',
            }),
            bouton({
              libelle: 'Valider la mise en relation',
              variante: 'primary',
              icone: 'handshake',
              motif: p.possible ? null : p.refus.join(' '),
              onClick: (e) => {
                // QA-TOAST : le bouton se verrouille dès la première soumission.
                // Un double clic produisait « validée » puis deux messages
                // rouges — l'opération avait réussi, l'utilisateur voyait deux
                // erreurs.
                const bouton = e?.target?.closest?.('button');
                if (bouton?.dataset.enCours === '1') return;
                if (bouton) bouton.dataset.enCours = '1';
                try {
                  matching.valider(ctx, appariementId, { attendu: p.attendu });
                  rafraichirContexte();
                  toast('Mise en relation validée. Les coordonnées vous sont transmises.');
                  aller(`#/${segmentEspace(ctx)}/relations/${appariementId}`);
                } catch (err) {
                  if (bouton) delete bouton.dataset.enCours;
                  afficherErreur(err);
                }
              },
            }),
          ],
        }),
        el('div.validation-timeline',{},[
        el('h3', { text: 'Ce qui s’est passé, ce qui va suivre' }),
        el('ul.timeline', {}, [
          etapeChrono(a.sens==='demande_vers_offre'?'Le transporteur a proposé son véhicule':'Vous avez réservé', dateHeure(a.reserveLe), true),
          etapeChrono(a.sens==='demande_vers_offre'?'Vous avez accepté sa proposition':'Le transporteur a accepté', dateHeure(a.reponduLe), true),
          etapeChrono('Vous validez', 'Maintenant', false, true),
          etapeChrono('Les deux comptes sont débités', `${montant(p.fraisAffreteur + p.fraisTransporteur)} au total`, false),
          etapeChrono('Le nom et les coordonnées vous sont transmis', 'Transporteur, véhicule, chauffeur, contacts', false),
          etapeChrono('Le suivi du transport commence', 'Six étapes déclaratives', false),
        ]),
        ]),
      ]),
    ]),
  ]);
}

function etapeChrono(titre, note, fait, courant = false) {
  // Les classes `is-done` / `is-current` et le `small` n'avaient aucune règle :
  // la chronologie s'affichait sans pastilles colorées ni méta atténuée.
  return el('li.timeline-item', {}, [
    el('span', { class: `timeline-dot${fait ? ' done' : ''}${courant ? ' current' : ''}` }),
    el('div.timeline-content', {}, [
      el('strong', { text: titre }),
      el('span.meta', { text: note }),
    ]),
  ]);
}

/* ================================================================== *
 * Mise en relation validée — les coordonnées
 * ================================================================== */

/** @param {any} ctx @param {Record<string, string>} params */
export function relations(ctx, params) {
  const validees = matching.mesAppariements(ctx, (a) => a.etat === ETAT_APPARIEMENT.VALIDER);
  const espace = segmentEspace(ctx);

  if (!params.id) {
    return el('div.page', {}, [
      carte({
        titre: 'Mises en relation validées',
        corps: [
          tableau({
            colonnes: ['Référence', 'Contrepartie', 'Validée le', ''],
            lignes: validees.map((a) => [
              a.reference,
              nomDe(ctx, 
                a.groupementAffreteurId === ctx.groupementId
                  ? a.groupementTransporteurId
                  : a.groupementAffreteurId,
              ),
              dateHeure(a.valideLe),
              el('a', { class: 'link', href: `#/${espace}/relations/${a.id}`, text: 'Coordonnées' }),
            ]),
            vide: etatVide({
              titre: 'Aucune mise en relation validée',
              message:
                'Les mises en relation validées apparaissent ici, avec les coordonnées ' +
                'de la contrepartie.',
            }),
          }),
        ],
      }),
    ]);
  }
  return ficheRelation(ctx, params.id);
}

function ficheRelation(ctx, appariementId) {
  // Correctif QA-01. Cette vue lisait l'appariement en brut : un transporteur
  // étranger au dossier, en devinant son identifiant dans la barre d'adresse,
  // lisait les montants d'une transaction entre deux de ses concurrents. Le
  // contrôle de partie prenante et la projection vivent désormais dans le
  // service — une vue ne décide pas qui a le droit de lire quoi.
  const fiche = matching.ficheRelation(ctx, appariementId);

  if (!fiche.autorise) {
    return el('div.empty-state', { role: 'alert' }, [
      icone('shield', 28),
      el('h3', { text: 'Mise en relation inaccessible' }),
      el('p', { text: fiche.motif }),
    ]);
  }

  const { appariement: a, contrepartie: g, vehicule, chauffeur } = fiche;
  const revelees = fiche.coordonneesTransmises && Boolean(g?.contactTelephone);
  // Correctif QA-02bis / QA-10 : la route se dérive du rôle, jamais d'une
  // chaîne littérale. Cette fiche est servie aux deux espaces (app.js).
  const espace = segmentEspace(ctx);
  const documentDut = a.etat === ETAT_APPARIEMENT.VALIDER ? routeDut(ctx, a.id) : null;
  const preparationDut = espace === 'transporteur' && decider(ctx, 'dut.generer', { groupementId: a.groupementTransporteurId }).autorise;

  return el('div.page', {}, [
    bandeau({
      ton: revelees ? 'ok' : 'warn',
      titre: revelees ? 'Mise en relation effective' : 'Coordonnées non transmises',
      message: revelees
        ? 'Les coordonnées ci-dessous vous sont transmises parce que la validation a ' +
          'été enregistrée et les frais réglés de part et d’autre.'
        : 'Les coordonnées seront transmises dès la validation de la mise en relation ' +
          'et le règlement des frais par les deux parties.',
    }),

    carte({
      titre: 'Coordonnées de la contrepartie',
      corps: [
        revelees
          ? el('div.contact-reveal', {}, [
              el('div.recap-grid', {}, [
                paire('Groupement', g.raisonSociale),
                paire('Contact', g.contactNom),
                paire('Téléphone', g.contactTelephone),
                paire('Courriel', g.contactEmail),
                paire('Adresse', g.adresse),
                paire('Immatriculation', vehicule?.immatriculation),
                paire('Carte grise', vehicule?.carteGrise),
                chauffeur ? paire('Chauffeur', chauffeur.nom) : null,
                chauffeur ? paire('Permis', chauffeur.permisNumero) : null,
                chauffeur ? paire('Téléphone du chauffeur', chauffeur.telephone) : null,
                paire('PTAC', vehicule?.ptacT ? `${vehicule.ptacT} t` : null),
              ]),
            ])
          : el('p', { text: 'Aucune coordonnée n’est servie à ce stade.' }),
      ],
    }),

    // Les montants ne sont rendus que si la projection les a servis : un rôle
    // dont la classification `financier` est fermée n'en voit aucun.
    typeof a.fraisAffreteur === 'number'
      ? carte({
          titre: 'Les écritures',
          corps: [
            tableau({
              colonnes: ['Partie', 'Montant', 'Horodatage'],
              lignes: [
                ['Affréteur', montant(a.fraisAffreteur), dateHeure(a.valideLe)],
                ['Transporteur', montant(a.fraisTransporteur), dateHeure(a.valideLe)],
              ],
            }),
          ],
        })
      : null,

    el('div.table-toolbar', {}, [
      el('a', { class: 'btn btn-primary', href: `#/${espace}/suivi`, text: 'Suivre le transport' }),
      documentDut ? el('a.btn', { href: documentDut, text: preparationDut ? 'Préparer le DUT' : 'Consulter le DUT' }) : null,
      // Lot b3 : l'attestation de bourse de fret, côté transporteur.
      a.etat === ETAT_APPARIEMENT.VALIDER && localiser(ctx, 'attestations')
        ? el('a.btn', { href: `#/${espace}/attestations?selection=${encodeURIComponent(a.id)}`, text: 'Attestation de bourse de fret' })
        : null,
    ]),
  ]);
}

function paire(cle, valeur) {
  if (!valeur) return null;
  return el('div.recap-item', {}, [
    el('span', { text: cle }),
    el('strong', { text: String(valeur) }),
  ]);
}

/* ================================================================== *
 * Compte
 * ================================================================== */

/** @param {any} ctx */
export function compte(ctx) {
  const mouvements = mouvementsDe(ctx, ctx.groupementId);
  const credits = mouvements.filter((m) => m.sens === 'credit').reduce((n, m) => n + m.montant, 0);
  const debits = mouvements.filter((m) => m.sens === 'debit').reduce((n, m) => n + m.montant, 0);

  return el('div.page', {}, [
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Solde', valeur: montant(soldeDe(ctx.groupementId)) }),
      kpi({ libelle: 'Crédits cumulés', valeur: montant(credits) }),
      kpi({ libelle: 'Débits cumulés', valeur: montant(debits) }),
      kpi({
        libelle: 'Mises en relation payées',
        valeur: mouvements.filter((m) => m.appariementId).length,
      }),
    ]),
    bandeau({
      ton: 'info',
      message:
        'Le crédit de votre compte est saisi par le concessionnaire. Le paiement en ' +
        'ligne est hors du périmètre de cette démonstration.',
    }),
    carte({
      titre: 'Mouvements',
      corps: [
        tableau({
          colonnes: ['Date', 'Libellé', 'Référence', 'Crédit', 'Débit', 'Solde après'],
          lignes: mouvements.map((m) => [
            dateHeure(m.horodatage),
            m.libelle,
            m.referenceEncaissement ?? '—',
            m.sens === 'credit' ? montant(m.montant) : '—',
            m.sens === 'debit' ? montant(m.montant) : '—',
            montant(m.soldeApres),
          ]),
          vide: etatVide({
            titre: 'Aucun mouvement',
            message:
              'Votre compte doit être crédité par le concessionnaire avant de pouvoir ' +
              'valider une mise en relation.',
          }),
        }),
      ],
    }),
  ]);
}
