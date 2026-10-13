import { annuaireSupervision } from './annuaire-supervision.js?v=20261009-carte-2';
import { carteSupervision, trajetsSupervision } from './cartes-supervision.js';
/**
 * Espaces de supervision : Concessionnaire (exploitant) et DGTTC (contrôle).
 *
 * Arbitrage N3 rendu visible : **l'espace DGTTC ne comporte aucune colonne
 * « solde »**, et ce n'est pas un masquage d'affichage — la donnée ne lui est pas
 * servie. `projeter()` retire les champs financiers avant qu'ils n'atteignent
 * ces écrans ; si une colonne de montant y apparaissait, ce serait la preuve que
 * le verrou a été contourné.
 *
 * @module views/supervision
 */

import { date, dateHeure, el, icone, montant } from '../core/dom.js';
import {
  afficherErreur,
  badge,
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
import { POV, ETAT_APPARIEMENT, labelOf } from '../domain/enums.js';
import { NIVEAU, ROLES, rolesDuNiveau } from '../domain/roles.js';
import { DROITS, MATRICE, PORTEE } from '../domain/permissions.js';
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
import { creditsSaisis, rejeterCredit, saisirCredit, soldeDe, validerCredit } from '../services/compte.service.js';
import { decider } from '../domain/access.js';
import { lireJournal } from '../services/audit.service.js';
import { abonnementDe } from '../services/auth.service.js';
import { etatCarteTransport } from '../services/controle.service.js';

/* ================================================================== *
 * Concessionnaire — l'exploitant
 * ================================================================== */

/** @param {any} ctx */
export function dashboardConcessionnaire(ctx) {
  const groupements = projeterOu(ctx, 'groupement', (g) => g.type !== 'institution');
  // Portée TOUT, mais projeté : la classification `financier` reste fermée à
  // la DGTTC, et un champ classé ajouté demain ne sortira pas par cet écran
  // (QA-M8 — même motif que QA-01, sans le défaut).
  const appariements = projeterOu(ctx, 'appariement', () => true);
  const validees = appariements.filter((a) => a.etat === ETAT_APPARIEMENT.VALIDER);
  const encours = groupements.reduce((n, g) => n + soldeDe(g.id), 0);
  const expires = groupements.filter((g) => !abonnementDe(g.id).actif);

  const delais = validees
    .filter((a) => a.reserveLe && a.valideLe)
    .map((a) => (new Date(a.valideLe) - new Date(a.reserveLe)) / 3600000);
  const delaiMoyen = delais.length
    ? `${Math.round(delais.reduce((n, d) => n + d, 0) / delais.length)} h`
    : '—';

  return el('div.page.supervision-page', {}, [
    carte({titre:'Carte des frets et des véhicules',sousTitre:'Sélectionnez un départ pour consulter son trajet.',corps:[carteSupervision(trajetsSupervision(projeterOu(ctx,'declaration',()=>true),projeterOu(ctx,'offre',()=>true)))]}),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Groupements actifs', valeur: groupements.filter(g => g.etat === 'actif').length }),
      kpi({ libelle: 'Déclarations', valeur: depot('declaration').brutTous().length }),
      kpi({ libelle: 'Offres disponibles', valeur: compter('offre', o => o.etat === 'disponible') }),
      kpi({ libelle: 'Mises en relation validées', valeur: validees.length }),
      kpi({ libelle: 'Encours des comptes', valeur: montant(encours) }),
      kpi({
        libelle: 'Abonnements expirés',
        valeur: expires.length,
        ton: expires.length ? 'warn' : undefined,
      }),
      kpi({ libelle: 'Délai moyen réservation → validation', valeur: delaiMoyen }),
    ]),
    expires.length
      ? bandeau({
          ton: 'warn',
          titre: `${expires.length} abonnement(s) expiré(s)`,
          message: expires.map((g) => g.raisonSociale).join(' · '),
        })
      : null,
    carte({
      titre: 'Activité récente',
      corps: [
        tableau({
          colonnes: ['Référence', 'Affréteur', 'Transporteur', 'État', 'Validée le'],
          lignes: appariements
            .sort((a, b) => new Date(b.reserveLe) - new Date(a.reserveLe))
            .slice(0, 10)
            .map((a) => [
              a.reference,
              nomDe(ctx, a.groupementAffreteurId),
              nomDe(ctx, a.groupementTransporteurId),
              badge(a.etat, POV.NEUTRE),
              a.valideLe ? dateHeure(a.valideLe) : '—',
            ]),
          vide: etatVide({ titre: 'Aucune activité', message: 'Aucune mise en relation enregistrée.' }),
        }),
      ],
    }),
  ]);
}

/** @param {any} ctx */
export function groupements(ctx) { return annuaireSupervision(ctx); }

/** @param {any} ctx */
export function comptes(ctx) {
  const liste = projeterOu(ctx, 'groupement', (g) => g.type !== 'institution');
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Crédit en deux temps — principe des quatre yeux',
      message:
        'Un crédit saisi ne touche pas au solde : il doit être validé par une autre ' +
        'personne, après rapprochement avec l’encaissement réel. Une même référence ' +
        'd’encaissement ne sert qu’une fois. Le crédit manuel remplace l’intégration de ' +
        'paiement, écartée du périmètre.',
    }),
    carte({
      titre: 'Comptes et soldes',
      corps: [
        el('div.supervision-grid',{},liste.map(g=>{
          const dernier=depot('operation').brutOu(o=>o.groupementId===g.id).sort((a,b)=>new Date(b.horodatage)-new Date(a.horodatage))[0];
          return el('article.supervision-tile',{},[
            el('div.supervision-tile-title',{},[icone('wallet',32),el('h3',{text:g.raisonSociale})]),
            el('small',{text:'Solde du compte'}),el('strong.supervision-amount',{text:montant(soldeDe(g.id))}),
            el('p',{text:`Dernier mouvement · ${dernier?dateHeure(dernier.horodatage):'Aucun mouvement'}`}),
            bouton({libelle:'Saisir un crédit',icone:'credits',variante:'primary',motif:decider(ctx,'compte.crediter',{groupementId:g.id}).autorise?null:decider(ctx,'compte.crediter',{groupementId:g.id}).explication,onClick:()=>dialogueCredit(ctx,g)}),
            el('span.indicator-watermark',{'aria-hidden':'true'},[icone('wallet',88)]),
          ]);
        })),
      ],
    }),
  ]);
}

function dialogueCredit(ctx, g) {
  const fermer = modale({
    titre: `Saisir un crédit — ${g.raisonSociale}`,
    corps: [
      el('p', {
        text:
          'La saisie ne crédite pas encore le compte : une autre personne devra la ' +
          'valider après rapprochement avec l’encaissement. Elle est inscrite au journal ' +
          'd’audit avec votre identité.',
      }),
      champ({ id: 'c-montant', label: 'Montant (F CFA)', type: 'number', requis: true, attrs: { min: '1', step: '1' } }),
      champ({
        id: 'c-ref',
        label: 'Référence d’encaissement',
        requis: true,
        aide: 'Trace du paiement reçu hors de la plateforme.',
      }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Enregistrer la saisie',
        variante: 'primary',
        onClick: () => {
          try {
            saisirCredit(ctx, {
              groupementId: g.id,
              montant: Number(document.getElementById('c-montant')?.value),
              referenceEncaissement: document.getElementById('c-ref')?.value,
            });
            fermer();
            toast('Crédit saisi. Il attend la validation d’une autre personne.');
            globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

/**
 * Crédits à valider — correctif anti-fraude n° 5.
 *
 * Le bouton de validation est désactivé, avec son motif, sur les saisies de
 * l'utilisateur connecté : on ne valide pas son propre crédit (D32 : une action
 * interdite s'explique, elle ne disparaît pas).
 * @param {any} ctx
 */
export function credits(ctx) {
  const tous = creditsSaisis(ctx);
  const enAttente = tous.filter((c) => c.etat === 'en_attente');
  const traites = tous.filter((c) => c.etat !== 'en_attente').slice(0, 20);
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Principe des quatre yeux',
      message:
        'Vous validez les crédits saisis par un autre agent, après avoir rapproché la ' +
        'saisie de l’encaissement réel : relevé bancaire, reçu de caisse ou avis de ' +
        'paiement mobile. Seule la validation crédite le compte.',
    }),
    carte({
      titre: 'Crédits en attente de validation',
      corps: [
        tableau({
          colonnes: ['Référence', 'Groupement', 'Montant', 'Encaissement', 'Saisi par', 'Saisi le', ''],
          lignes: enAttente.map((c) => {
            const soi = c.saisiParUtilisateurId === ctx.utilisateurId;
            const motif = soi ? 'Vous avez saisi ce crédit : sa validation revient à une autre personne.' : null;
            return [
              c.reference,
              nomDe(ctx, c.groupementId),
              montant(c.montant),
              c.referenceEncaissement,
              nomUtilisateur(c.saisiParUtilisateurId),
              dateHeure(c.saisiLe),
              el('div.table-toolbar', {}, [
                bouton({ libelle: 'Valider', variante: 'primary', motif, onClick: () => dialogueValidationCredit(ctx, c) }),
                bouton({ libelle: 'Rejeter', variante: 'ghost', motif, onClick: () => dialogueRejetCredit(ctx, c) }),
              ]),
            ];
          }),
          vide: etatVide({ titre: 'Aucun crédit en attente', message: 'Les saisies des agents apparaîtront ici.' }),
        }),
      ],
    }),
    carte({
      titre: 'Derniers crédits traités',
      corps: [
        tableau({
          colonnes: ['Référence', 'Groupement', 'Montant', 'Encaissement', 'Saisi par', 'Traité par', 'État'],
          lignes: traites.map((c) => [
            c.reference,
            nomDe(ctx, c.groupementId),
            montant(c.montant),
            c.referenceEncaissement,
            nomUtilisateur(c.saisiParUtilisateurId),
            nomUtilisateur(c.valideParUtilisateurId),
            el('span', {}, [badge(c.etat), c.motifRejet ? el('small', { text: ` ${c.motifRejet}` }) : null]),
          ]),
          vide: etatVide({ titre: 'Aucun crédit traité', message: 'L’historique des validations apparaîtra ici.' }),
        }),
      ],
    }),
  ]);
}

function dialogueValidationCredit(ctx, c) {
  const fermer = modale({
    titre: `Valider le crédit ${c.reference}`,
    corps: [
      el('div.recap-grid', {}, [
        el('div.recap-item', {}, [el('span', { text: 'Groupement' }), el('strong', { text: nomDe(ctx, c.groupementId) })]),
        el('div.recap-item', {}, [el('span', { text: 'Montant' }), el('strong', { text: montant(c.montant) })]),
        el('div.recap-item', {}, [el('span', { text: 'Encaissement' }), el('strong', { text: c.referenceEncaissement })]),
        el('div.recap-item', {}, [el('span', { text: 'Saisi par' }), el('strong', { text: nomUtilisateur(c.saisiParUtilisateurId) })]),
      ]),
      el('label.checkbox-row', {}, [
        el('input', { type: 'checkbox', id: 'cv-rappro' }),
        ' J’ai rapproché cette saisie de l’encaissement réel : même référence, même montant.',
      ]),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Valider et créditer',
        variante: 'primary',
        onClick: () => {
          try {
            validerCredit(ctx, c.id, { rapprochementConfirme: document.getElementById('cv-rappro')?.checked === true });
            fermer();
            toast('Crédit validé : le compte est crédité.');
            globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

function dialogueRejetCredit(ctx, c) {
  const fermer = modale({
    titre: `Rejeter le crédit ${c.reference}`,
    corps: [
      el('p', { text: 'Le compte n’est pas crédité. La référence d’encaissement redevient disponible pour une saisie corrigée.' }),
      champ({ id: 'cr-motif', label: 'Motif du rejet', type: 'textarea', requis: true, aide: 'Par exemple : encaissement introuvable, montant différent.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Rejeter',
        variante: 'primary',
        onClick: () => {
          try {
            rejeterCredit(ctx, c.id, document.getElementById('cr-motif')?.value);
            fermer();
            toast('Crédit rejeté.');
            globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ],
  });
}

/** @param {any} ctx */
export function tarifs(ctx) {
  const liste = depot('tarif').brutTous();
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'warn',
      titre: 'Ce n’est pas une grille tarifaire du fret',
      message:
        'Ce catalogue fixe le prix des services de la plateforme : abonnement et ' +
        'frais de mise en relation. Le prix du transport lui-même se négocie entre les ' +
        'parties et n’est pas géré ici.',
    }),
    carte({
      titre: 'Catalogue de tarifs',
      corps: [
        el('div.supervision-grid',{},liste.map(t=>el('article.supervision-tile',{},[
          el('div.supervision-tile-title',{},[icone('wallet',30),el('h3',{text:t.libelle})]),
          el('small',{text:t.id}),el('strong.supervision-amount',{text:montant(t.montant)}),
          el('p',{text:`${t.actif?'Actif':'Inactif'} · ${t.devise}`}),
          el('small',{text:`Modifié le ${dateHeure(t.modifieLe)}`}),
          el('span.indicator-watermark',{'aria-hidden':'true'},[icone('wallet',88)]),
        ]))),
      ],
    }),
  ]);
}

/**
 * Matrice des 19 rôles, rendue visible (M1.6).
 * **Générée depuis `MATRICE`** : aucun droit n'existe hors d'elle.
 * @param {any} ctx
 */
export function roles(ctx) {
  const conteneur = el('div.page.supervision-page', {});
  let niveau = NIVEAU.DEMONTRE;

  const rendre = () => {
    const liste = rolesDuNiveau(niveau);
    const droits = Object.keys(DROITS);
    const symboles = { aucune: '—', propre: 'P', groupement: 'G', marche: 'M', tout: 'T' };

    conteneur.replaceChildren(
      bandeau({
        ton: 'info',
        titre: `${Object.keys(ROLES).length} rôles déclarés, chacun attesté par le système existant`,
        message:
          'Aucun droit n’existe hors de cette matrice. Un droit absent vaut « refusé » : ' +
          'il n’y a pas de rôle qui la contourne, y compris le super administrateur. ' +
          'Portées : P = personnel, G = groupement, M = marché, T = plateforme entière.',
      }),
      el('div.tabs-underline', {}, [
        onglet('Démontrés', NIVEAU.DEMONTRE),
        onglet('Déclinés', NIVEAU.DECLINE),
        onglet('Modélisés', NIVEAU.MODELISE),
      ]),
      el('div.supervision-role-grid',{},liste.map(r=>el('article.supervision-role-card',{},[
        el('div.supervision-tile-title',{},[icone(r.espace==='dgttc'?'shield':r.espace==='concessionnaire'?'settings':'users',32),el('h3',{text:r.libelle})]),
        el('p',{text:({
          affreteur:'Déclare le fret, recherche un véhicule et valide les mises en relation.',
          transporteur:'Gère sa flotte, publie les disponibilités et suit ses transports.',
          auxiliaire_affreteur:'Prépare les dossiers du groupement. La validation financière revient au responsable.',
          auxiliaire_transporteur:'Prépare les offres et suit les transports. Les réponses aux réservations reviennent au responsable.',
          concessionnaire:'Supervise les acteurs, les comptes et les abonnements de la plateforme.',
          dgttc:'Consulte les flux et le parc national, sans accès aux finances ni aux actions commerciales.',
        })[r.id] || r.description.replace(/\*\*/g,'')}),
        el('div.supervision-role-tags',{},[el('span',{text:`Espace ${r.espace}`}),el('span',{text:r.soumisAbonnement?'Abonnement requis':'Sans abonnement'})]),
        el('details',{},[el('summary',{text:`Consulter les droits (${droits.filter(d=>(MATRICE[r.id]?.[d]??PORTEE.AUCUNE)!==PORTEE.AUCUNE).length})`}),
          el('ul.supervision-rights',{},droits.filter(d=>(MATRICE[r.id]?.[d]??PORTEE.AUCUNE)!==PORTEE.AUCUNE).map(d=>el('li',{},[el('span',{text:DROITS[d].libelle}),el('strong',{text:({propre:'Personnel',groupement:'Groupement',marche:'Marché',tout:'Plateforme'})[MATRICE[r.id][d]]})])))]),
      ]))),
      carte({
        titre: 'Matrice des droits',
        corps: [
          tableau({
            colonnes: ['Droit', ...liste.map((r) => r.libelle)],
            lignes: droits
              .filter((d) => liste.some((r) => (MATRICE[r.id]?.[d] ?? PORTEE.AUCUNE) !== PORTEE.AUCUNE))
              .map((d) => [
                el('span', {}, [
                  el('span', { text: DROITS[d].libelle }),
                  DROITS[d].teste ? el('span.badge.badge-warning', { text: ' · testé' }) : null,
                ]),
                ...liste.map((r) =>
                  el('span', { class: 'cell-portee', text: symboles[MATRICE[r.id]?.[d] ?? PORTEE.AUCUNE] }),
                ),
              ]),
            vide: etatVide({
              titre: 'Aucun droit métier à ce niveau',
              message:
                'Ces rôles sont déclarés, mais leur module — caisse, ' +
                'contentieux, comptabilité — est hors du périmètre du POC. C’est voulu.',
            }),
          }),
        ],
      }),

    );
  };

  function onglet(libelle, valeur) {
    return el('button', {
      type: 'button',
      class: `tab-btn${niveau === valeur ? ' active' : ''}`,
      'aria-pressed':String(niveau===valeur),
      text: `${libelle} (${rolesDuNiveau(valeur).length})`,
      on: {
        click: () => {
          niveau = valeur;
          rendre();
        },
      },
    });
  }

  rendre();
  return conteneur;
}

/** @param {any} ctx */
export function audit(ctx) {
  const entrees = lireJournal(ctx);
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      message:
        'Le journal est en ajout seul : aucune fonction de modification ni de ' +
        'suppression n’est développée. C’est un apport du POC — le système existant ' +
        'n’a pas de piste d’audit unifiée.',
    }),
    carte({
      titre: 'Journal d’audit',
      corps: [
        tableau({
          colonnes: ['Horodatage', 'Auteur', 'Rôle', 'Groupement', 'Événement', 'Détail'],
          lignes: entrees.slice(0, 200).map((e) => [
            dateHeure(e.horodatage),
            nomUtilisateur(e.auteurUtilisateurId),
            e.auteurRoleId === 'plateforme' ? 'Plateforme (automatique)' : ROLES[e.auteurRoleId]?.libelle ?? e.auteurRoleId,
            e.groupementId ? nomDe(ctx, e.groupementId) : '—',
            e.evenement,
            e.details ?? '—',
          ]),
          vide: etatVide({ titre: 'Aucun événement', message: 'Aucun événement sur cette période.' }),
        }),
      ],
    }),
  ]);
}

/* ================================================================== *
 * DGTTC — le contrôle. Aucune donnée financière.
 * ================================================================== */

/** @param {any} ctx */
export function dashboardDgttc(ctx) {
  // Comptés, pas rendus : l'indicateur n'a pas besoin des objets.
  const transporteurs = compter('groupement', (g) => g.type === 'transporteur');
  const affreteurs = compter('groupement', (g) => g.type === 'affreteur');
  const vehicules = projeterOu(ctx, 'vehicule', () => true);
  const echues = vehicules.filter(v => etatCarteTransport(v) === 'expiree');
  const transports = depot('transport').brutOu((t) => t.etape !== 'cloture');

  return el('div.page.supervision-page', {}, [
    carte({titre:'Carte des frets et des véhicules',sousTitre:'Sélectionnez un départ pour consulter son trajet.',corps:[carteSupervision(trajetsSupervision(projeterOu(ctx,'declaration',()=>true),projeterOu(ctx,'offre',()=>true)))]}),
    bandeau({
      ton: 'signature',
      titre: 'Espace de contrôle',
      message:
        'Le contrôleur ne transige pas sur ce qu’il contrôle. Aucune action ' +
        'transactionnelle n’existe dans cet espace, et aucune donnée financière ne ' +
        'vous est servie — ni solde, ni montant, ni écriture.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Transporteurs', valeur: transporteurs }),
      kpi({ libelle: 'Affréteurs', valeur: affreteurs }),
      kpi({ libelle: 'Véhicules au parc', valeur: vehicules.length }),
      kpi({
        libelle: 'Cartes de transport expirées',
        valeur: echues.length,
        ton: echues.length ? 'warn' : undefined,
      }),
      kpi({ libelle: 'Déclarations', valeur: depot('declaration').brutTous().length }),
      kpi({ libelle: 'Transports en cours', valeur: transports.length }),
    ]),
    echues.length
      ? bandeau({
          ton: 'warn',
          titre: 'Points d’attention',
          message: `${echues.length} véhicule(s) du parc ont une carte de transport échue : ${echues
            .map((v) => v.immatriculation)
            .join(' · ')}`,
        })
      : null,
    carte({
      titre: 'Flux par corridor',
      corps: [
        tableau({
          colonnes: ['Corridor', 'Déclarations', 'Offres'],
          lignes: corridors(),
          vide: etatVide({ titre: 'Aucun flux', message: 'Aucun corridor actif.' }),
        }),
      ],
    }),
  ]);
}

function corridors() {
  const compte = new Map();
  for (const d of depot('declaration').brutTous()) {
    const cle = `${refDe(d.provenanceId)} → ${refDe(d.destinationId)}`;
    compte.set(cle, { ...(compte.get(cle) ?? { dec: 0, off: 0 }), dec: (compte.get(cle)?.dec ?? 0) + 1 });
  }
  for (const o of depot('offre').brutTous()) {
    const cle = `${refDe(o.localiteDepartId)} → ${refDe(o.localiteArriveeId)}`;
    compte.set(cle, { ...(compte.get(cle) ?? { dec: 0, off: 0 }), off: (compte.get(cle)?.off ?? 0) + 1 });
  }
  return [...compte.entries()].map(([cle, v]) => [cle, v.dec, v.off]);
}

/** @param {any} ctx */
export function etats(ctx) {
  const declarations = depot('declaration').lisiblesPar(ctx, 'declaration.lire');
  const offres = depot('offre').lisiblesPar(ctx, 'offre.lire');

  return el('div.page.supervision-page', {}, [
    carte({titre:'Carte des frets et des véhicules',sousTitre:'Sélectionnez un départ pour consulter son trajet.',corps:[carteSupervision(trajetsSupervision(projeterOu(ctx,'declaration',()=>true),projeterOu(ctx,'offre',()=>true)))]}),
    carte({
      titre: 'Déclarations de fret',
      corps: [
        tableau({
          colonnes: ['Référence', 'Groupement', 'Corridor', 'État'],
          lignes: declarations.map((d) => [
            d.reference,
            nomDe(ctx, d.groupementId),
            `${refDe(d.provenanceId)} → ${refDe(d.destinationId)}`,
            badge(d.etat),
          ]),
          vide: etatVide({ titre: 'Aucune déclaration', message: 'Aucun fret déclaré.' }),
        }),
      ],
    }),
    carte({
      titre: 'Offres de véhicule',
      corps: [
        tableau({
          colonnes: ['Référence', 'Transporteur', 'Corridor', 'Disponibilité', 'État'],
          lignes: offres.map((o) => [
            o.reference,
            nomDe(ctx, o.groupementId),
            `${refDe(o.localiteDepartId)} → ${refDe(o.localiteArriveeId)}`,
            `${date(o.disponibleDu)} → ${date(o.disponibleAu)}`,
            badge(o.etat),
          ]),
          vide: etatVide({ titre: 'Aucune offre', message: 'Aucun véhicule publié.' }),
        }),
      ],
    }),
  ]);
}

/** @param {any} ctx */
export function relationsControle(ctx) {
  const liste = depot('appariement').lisiblesPar(ctx, 'appariement.lire');
  const offresParId = new Map(projeterOu(ctx,'offre',()=>true).map(o=>[o.id,o]));
  return el('div.page.supervision-page', {}, [
    carte({titre:'Carte des mises en relation',corps:[carteSupervision(liste.map(a=>{const o=offresParId.get(a.offreId);return {id:a.id,type:'camions',reference:a.reference,titre:`${nomDe(ctx, a.groupementAffreteurId)} · ${nomDe(ctx, a.groupementTransporteurId)}`,etat:a.etat,localiteDepartId:o?.localiteDepartId,localiteArriveeId:o?.localiteArriveeId};}))]}),
    carte({
      titre: 'Mises en relation',
      sousTitre: 'Suivi des mises en relation, en lecture seule.',
      corps: [
        tableau({
          colonnes: ['Référence', 'Affréteur', 'Transporteur', 'État', 'Validée le'],
          lignes: liste.map((a) => [
            a.reference,
            nomDe(ctx, a.groupementAffreteurId),
            nomDe(ctx, a.groupementTransporteurId),
            badge(a.etat),
            a.valideLe ? dateHeure(a.valideLe) : '—',
          ]),
          vide: etatVide({ titre: 'Aucune mise en relation', message: 'Aucune opération enregistrée.' }),
        }),
      ],
    }),
  ]);
}

/** @param {any} ctx */
export function acteurs(ctx) {
  const liste = depot('groupement').lisiblesPar(ctx, 'groupement.lire');
  return el('div.page.supervision-page', {}, [
    carte({
      titre: 'Transporteurs et affréteurs',
      corps: [
        tableau({
          colonnes: ['Raison sociale', 'Type', 'RCCM', 'Carte de transporteur', 'Vérification', 'Localité', 'Véhicules'],
          lignes: liste.map((g) => [
            g.raisonSociale,
            g.type,
            g.rccm ?? '—',
            g.carteTransporteurNumero
              ? `${g.carteTransporteurNumero} — ${date(g.carteTransporteurEcheance)}`
              : '—',
            // Correctif anti-fraude n° 3 : le contrôleur voit l'état du contrôle des pièces.
            g.type === 'transporteur' ? badge(g.verificationEtat || 'a_verifier') : '—',
            refDe(g.localiteId),
            compter('vehicule', (v) => v.groupementId === g.id),
          ]),
        }),
      ],
    }),
  ]);
}

/** @param {any} ctx */
export function parc(ctx) {
  const liste = depot('vehicule').lisiblesPar(ctx, 'vehicule.lire');

  return el('div.page.supervision-page', {}, [
    carte({titre:'Carte du parc national',corps:[carteSupervision(liste.map(v=>({id:v.id,type:'camions',reference:v.immatriculation,titre:nomDe(ctx, v.groupementId),stationnementId:v.stationnementLocaliteId,detail:`${refDe(v.carrosserieId)} · PTAC ${v.ptacT} t`})),{parc:true})]}),
    carte({
      titre: 'Parc de véhicules',
      corps: [
        tableau({
          colonnes: ['Immatriculation', 'Transporteur', 'Carrosserie', 'PTAC', 'Carte de transport'],
          lignes: liste.map((v) => {
            const validite = etatCarteTransport(v);
            return [
              v.immatriculation,
              nomDe(ctx, v.groupementId),
              refDe(v.carrosserieId),
              `${v.ptacT} t`,
              el('span', {}, [
                date(v.carteTransportEcheance),
                validite === 'valide' ? null : el('span.badge.badge-warning', { text: validite === 'expiree' ? ' · échue' : ' · à renseigner' }),
              ]),
            ];
          }),
          vide: etatVide({ titre: 'Aucun véhicule', message: 'Aucun véhicule déclaré.' }),
        }),
      ],
    }),
  ]);
}

/** Suivi des abonnements de tous les groupements, sans renouvellement implicite. */
export function abonnements(ctx) { return annuaireSupervision(ctx,{abonnements:true}); }
