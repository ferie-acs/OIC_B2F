/**
 * Espace de l'entreprise (affréteur, transporteur) — abonnement, compte, paiements.
 *
 * Lot b4. Remplace, sous les mêmes routes, les écrans « Abonnement » et « Solde et
 * mouvements » qui annonçaient le paiement en ligne hors périmètre, et ajoute
 * « Paiements et reçus ». Les paiements sont **simulés** et le disent.
 *
 * Les actions de paiement suivent la matrice : un sous-compte voit son échéance
 * et son solde, mais le bouton de paiement lui est refusé avec son motif (D32 :
 * une action interdite s'explique, elle ne disparaît pas).
 *
 * @module views/finances-entreprise
 */

import { date, dateHeure, el, montant } from '../core/dom.js';
import { afficherErreur, badge, bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { MODE_PAIEMENT, OBJET_PAIEMENT, OPERATEUR_MOBILE, libelleFinance } from '../domain/finances.js';
import { rafraichirContexte } from '../services/auth.service.js';
import { apercuProlongation, formulesAbonnement, situationAbonnement } from '../services/abonnement.service.js';
import { mouvementsDe, soldeDe } from '../services/compte.service.js';
import {
  RECHARGEMENT_MAX_OPERATIONS,
  fraisUnitaire,
  mesPaiements,
  rechargerEnLigne,
  renouvelerEnLigne,
  signalerEchec,
} from '../services/paiement.service.js';
import { nomDe, nomUtilisateur } from './_donnees.js';
import {
  boutonRecu,
  dialoguePaiementAccepte,
  dialogueSimulation,
  lireMobile,
  pastille,
  rafraichir,
  recap,
  valeur,
} from './_finances-ui.js';

const OPTIONS_OPERATEURS = Object.values(OPERATEUR_MOBILE).map((o) => ({ valeur: o, libelle: libelleFinance(o) }));

/** Champs mobile money : opérateur et numéro. */
function champsMobile(prefixe) {
  return el('div.field-row', {}, [
    champ({ id: `${prefixe}-operateur`, label: 'Opérateur', options: OPTIONS_OPERATEURS, requis: true }),
    champ({
      id: `${prefixe}-numero`,
      label: 'Numéro de mobile money',
      type: 'tel',
      requis: true,
      aide: 'Dix chiffres, commençant par 01, 05 ou 07.',
      attrs: { inputmode: 'tel', autocomplete: 'tel', placeholder: '07 00 00 00 00' },
    }),
  ]);
}

/** Paiement refusé (simulation) : tracé, annoncé, rien n'a bougé. */
function echec(ctx, objet, mode) {
  try {
    signalerEchec(ctx, { objet, mode });
  } catch (e) {
    afficherErreur(e);
    return;
  }
  toast('Paiement non abouti : rien n’a été débité ni crédité.', 'err');
  rafraichir();
}

/* ================================================================== *
 * Abonnement
 * ================================================================== */

/** @param {any} ctx */
export function abonnement(ctx) {
  const s = situationAbonnement(ctx);
  const formules = formulesAbonnement(ctx);
  const droit = decider(ctx, 'abonnement.prolonger', { groupementId: ctx.groupementId });
  const courant = s.periodes[0] ?? null;

  const etatBandeau = !s.actif
    ? bandeau({
        ton: 'err',
        titre: 'Abonnement expiré',
        message:
          `L’abonnement de votre entreprise ${s.finitLe ? `a expiré le ${date(s.finitLe)}` : 'n’est pas encore souscrit'}. ` +
          'Les fonctionnalités du marché vous sont fermées jusqu’au renouvellement. Renouvelez-le ci-dessous : ' +
          'l’accès est rétabli dès que le paiement est accepté, pour vous et pour vos sous-comptes.',
      })
    : s.procheEcheance
      ? bandeau({
          ton: 'warn',
          titre: `Échéance dans ${s.joursRestants} jour(s)`,
          message: `Votre abonnement prend fin le ${date(s.finitLe)}. En le renouvelant dès maintenant, la nouvelle période commence le lendemain de l’échéance : vous ne perdez aucun jour.`,
        })
      : bandeau({ ton: 'ok', message: `Votre abonnement est actif jusqu’au ${date(s.finitLe)}.` });

  return el('div.page', {}, [
    etatBandeau,
    carte({
      titre: 'Abonnement en cours',
      corps: [
        recap([
          ['Entreprise', nomDe(ctx, ctx.groupementId)],
          ['Formule', courant?.formule ?? '—'],
          ['Période', courant ? `${date(courant.debuteLe)} → ${date(courant.finitLe)}` : '—'],
          ['Jours restants', s.actif && s.joursRestants !== null ? String(s.joursRestants) : '—'],
          ['État', badge(s.actif ? 'actif' : 'expire')],
        ]),
      ],
    }),
    carte({
      titre: 'Renouveler l’abonnement',
      sousTitre: 'Choisissez une formule du catalogue et votre mode de paiement. Le paiement est simulé dans cette démonstration.',
      corps: [formulaireRenouvellement(ctx, formules, droit)],
    }),
    carte({
      titre: 'Historique des abonnements',
      corps: [
        tableau({
          colonnes: ['Période', 'Formule', 'Montant', 'Paiement', 'Enregistré par', ''],
          lignes: s.periodes.map((p) => [
            `${date(p.debuteLe)} → ${date(p.finitLe)}`,
            p.formule,
            montant(p.montant),
            p.paiement ? `${p.paiement.numero} · ${libelleFinance(p.paiement.canal)}, ${libelleFinance(p.paiement.mode).toLowerCase()}` : '—',
            nomUtilisateur(p.prolongeParUtilisateurId),
            p.paiement && decider(ctx, 'compte.lire', { groupementId: ctx.groupementId }).autorise ? boutonRecu(ctx, p.paiement.id) : null,
          ]),
          vide: etatVide({ titre: 'Aucun abonnement', message: 'Les périodes d’abonnement de votre entreprise apparaîtront ici.' }),
        }),
      ],
    }),
  ]);
}

function formulaireRenouvellement(ctx, formules, droit) {
  if (formules.length === 0) {
    return etatVide({ titre: 'Aucune formule proposée', message: 'Le catalogue ne comporte aucune formule d’abonnement active. Contactez l’OIC.' });
  }
  const solde = droit.autorise ? soldeDe(ctx.groupementId) : null;
  let formuleId = formules[0].id;
  let mode = MODE_PAIEMENT.MOBILE_MONEY;

  const zoneApercu = el('div', {});
  const zoneMobile = champsMobile('ra');
  const rendreApercu = () => {
    const a = apercuProlongation(ctx.groupementId, formuleId);
    zoneApercu.replaceChildren(
      recap([
        ['Nouvelle période', `${date(a.debuteLe)} → ${date(a.finitLe)}`],
        ['Durée', `${a.dureeMois} mois`],
        ['Montant à payer', montant(a.montant)],
        ['Départ', a.enAvance ? 'Lendemain de l’échéance actuelle' : 'Jour du paiement'],
      ]),
    );
    zoneMobile.hidden = mode !== MODE_PAIEMENT.MOBILE_MONEY;
  };

  const choixFormules = formules.map((f, i) =>
    el('label.radio-row', {}, [
      el('input', { type: 'radio', name: 'ra-formule', value: f.id, checked: i === 0 || undefined, on: { change: () => { formuleId = f.id; rendreApercu(); } } }),
      el('span.label-body', {}, [
        el('strong', { text: f.libelle }),
        el('span', {
          text:
            `${f.dureeMois} mois — ${montant(f.montant)}` +
            (f.prochainEffet ? ` · passera à ${montant(f.prochainMontant)} le ${date(f.prochainEffet)}` : ''),
        }),
      ]),
    ]),
  );

  const modes = [
    [MODE_PAIEMENT.MOBILE_MONEY, 'Orange Money, MTN Mobile Money, Moov Money ou Wave.'],
    [MODE_PAIEMENT.CARTE, 'Paiement sur la page sécurisée de votre banque.'],
    [MODE_PAIEMENT.DEBIT_COMPTE, solde === null ? 'Débit de votre solde prépayé.' : `Solde disponible : ${montant(solde)}.`],
  ];
  const choixModes = modes.map(([m, aide], i) =>
    el('label.radio-row', {}, [
      el('input', { type: 'radio', name: 'ra-mode', value: m, checked: i === 0 || undefined, on: { change: () => { mode = m; rendreApercu(); } } }),
      el('span.label-body', {}, [el('strong', { text: libelleFinance(m) }), el('span', { text: aide })]),
    ]),
  );

  rendreApercu();

  const payer = () => {
    const f = formules.find((x) => x.id === formuleId);
    const a = apercuProlongation(ctx.groupementId, formuleId);
    const conclure = (demande) => {
      try {
        const { paiement, abonnement: periode } = renouvelerEnLigne(ctx, demande);
        // Un abonnement qui était expiré rouvre ses droits : le reçu s'édite avec le
        // contexte recalculé, pas avec celui d'avant le paiement.
        const apres = rafraichirContexte() ?? ctx;
        dialoguePaiementAccepte(apres, paiement, `Votre abonnement est prolongé jusqu’au ${date(periode.finitLe)}.`);
      } catch (e) {
        afficherErreur(e);
      }
    };
    if (mode === MODE_PAIEMENT.DEBIT_COMPTE) {
      const fermer = modale({
        titre: 'Payer par débit du compte',
        corps: [
          recap([
            ['Formule', f.libelle],
            ['Montant débité', montant(a.montant)],
            ['Solde avant', montant(solde)],
            ['Solde après', solde >= a.montant ? montant(solde - a.montant) : 'Insuffisant'],
          ]),
          el('p', { text: 'Le compte prépayé est débité immédiatement et l’abonnement prolongé dans la même opération.' }),
        ],
        actions: [
          bouton({ libelle: 'Annuler', onClick: () => fermer() }),
          bouton({ libelle: 'Confirmer le paiement', variante: 'primary', onClick: () => { fermer(); conclure({ tarifId: formuleId, mode }); } }),
        ],
      });
      return;
    }
    let mobile = {};
    if (mode === MODE_PAIEMENT.MOBILE_MONEY) {
      try {
        mobile = lireMobile('ra');
      } catch (e) {
        afficherErreur(e);
        return;
      }
    }
    dialogueSimulation({
      titre: 'Paiement du réabonnement',
      objet: f.libelle,
      montant: a.montant,
      mode,
      ...mobile,
      surSucces: (referenceTransaction) => conclure({ tarifId: formuleId, mode, ...mobile, referenceTransaction }),
      surEchec: () => echec(ctx, OBJET_PAIEMENT.ABONNEMENT, mode),
    });
  };

  return el('div.b4-formulaire', {}, [
    el('fieldset.b4-choix', {}, [el('legend', { text: 'Formule' }), ...choixFormules]),
    zoneApercu,
    el('fieldset.b4-choix', {}, [el('legend', { text: 'Mode de paiement' }), ...choixModes]),
    zoneMobile,
    el('div.table-toolbar', {}, [
      bouton({
        libelle: 'Payer et renouveler',
        variante: 'primary',
        icone: 'wallet',
        motif: droit.autorise ? null : droit.explication,
        onClick: payer,
      }),
    ]),
  ]);
}

/* ================================================================== *
 * Solde, mouvements et rechargement
 * ================================================================== */

/** @param {any} ctx */
export function compte(ctx) {
  const mouvements = mouvementsDe(ctx, ctx.groupementId);
  const credits = mouvements.filter((m) => m.sens === 'credit').reduce((n, m) => n + m.montant, 0);
  const debits = mouvements.filter((m) => m.sens === 'debit').reduce((n, m) => n + m.montant, 0);
  const droit = decider(ctx, 'compte.recharger', { groupementId: ctx.groupementId });

  return el('div.page', {}, [
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Solde', valeur: montant(soldeDe(ctx.groupementId)) }),
      kpi({ libelle: 'Crédits cumulés', valeur: montant(credits) }),
      kpi({ libelle: 'Débits cumulés', valeur: montant(debits) }),
      kpi({ libelle: 'Mises en relation payées', valeur: mouvements.filter((m) => m.appariementId).length }),
    ]),
    bandeau({
      ton: 'info',
      titre: 'Deux façons de recharger',
      message:
        'En ligne, par mobile money : le compte est crédité dès que l’opérateur confirme le paiement (simulé dans cette ' +
        'démonstration). Au guichet de l’OIC : l’agent enregistre l’encaissement et vous remet un reçu ; le compte est ' +
        'crédité après la validation d’un second agent.',
    }),
    carte({
      titre: 'Recharger le compte',
      sousTitre: 'Provisionnez le nombre de mises en relation que vous prévoyez de valider.',
      corps: [formulaireRechargement(ctx, droit)],
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
          vide: etatVide({ titre: 'Aucun mouvement', message: 'Rechargez votre compte avant de valider une mise en relation.' }),
        }),
      ],
    }),
  ]);
}

function formulaireRechargement(ctx, droit) {
  const unitaire = fraisUnitaire(ctx.groupementId);
  const zoneMontant = el('div', {});
  const nombre = () => Number(valeur('rc-nombre'));
  const rendreMontant = () => {
    const n = nombre();
    zoneMontant.replaceChildren(
      recap([
        ['Frais par mise en relation', montant(unitaire)],
        ['Montant à payer', Number.isInteger(n) && n > 0 && unitaire ? montant(n * unitaire) : '—'],
      ]),
    );
  };
  const champNombre = champ({
    id: 'rc-nombre',
    label: 'Nombre de mises en relation',
    type: 'number',
    valeur: 2,
    requis: true,
    aide: `Entre 1 et ${RECHARGEMENT_MAX_OPERATIONS}.`,
    attrs: { min: '1', max: String(RECHARGEMENT_MAX_OPERATIONS), step: '1' },
  });
  champNombre.querySelector('input')?.addEventListener('input', rendreMontant);
  queueMicrotask(rendreMontant);

  const payer = () => {
    let mobile;
    try {
      mobile = lireMobile('rc');
      const n = nombre();
      if (!(Number.isInteger(n) && n >= 1 && n <= RECHARGEMENT_MAX_OPERATIONS)) {
        throw new Error(`Indiquez un nombre de mises en relation entre 1 et ${RECHARGEMENT_MAX_OPERATIONS}.`);
      }
    } catch (e) {
      afficherErreur(e);
      return;
    }
    const n = nombre();
    dialogueSimulation({
      titre: 'Rechargement par mobile money',
      objet: `Rechargement — ${n} mise${n > 1 ? 's' : ''} en relation`,
      montant: n * unitaire,
      mode: MODE_PAIEMENT.MOBILE_MONEY,
      ...mobile,
      surSucces: (referenceTransaction) => {
        try {
          const { paiement } = rechargerEnLigne(ctx, { nombre: n, ...mobile, referenceTransaction });
          dialoguePaiementAccepte(ctx, paiement, 'Votre compte est crédité : la transaction de l’opérateur fait foi.');
        } catch (e) {
          afficherErreur(e);
        }
      },
      surEchec: () => echec(ctx, OBJET_PAIEMENT.RECHARGEMENT, MODE_PAIEMENT.MOBILE_MONEY),
    });
  };

  return el('div.b4-formulaire', {}, [
    el('div.field-row', {}, [champNombre]),
    zoneMontant,
    champsMobile('rc'),
    el('div.table-toolbar', {}, [
      bouton({ libelle: 'Payer par mobile money', variante: 'primary', icone: 'credits', motif: droit.autorise ? null : droit.explication, onClick: payer }),
    ]),
  ]);
}

/* ================================================================== *
 * Paiements et reçus
 * ================================================================== */

/** @param {any} ctx */
export function paiements(ctx) {
  const liste = mesPaiements(ctx);
  const encaisses = liste.filter((p) => p.etat === 'encaisse');
  return el('div.page', {}, [
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Paiements encaissés', valeur: encaisses.length, icon: 'receipt' }),
      kpi({ libelle: 'Montant réglé', valeur: montant(encaisses.reduce((n, p) => n + p.montant, 0)) }),
      kpi({ libelle: 'En attente de validation', valeur: liste.filter((p) => p.etat === 'en_attente').length, icon: 'clock' }),
    ]),
    carte({
      titre: 'Paiements et reçus',
      sousTitre: 'Paiements en ligne et encaissements au guichet de votre entreprise. Chaque reçu se réédite en duplicata numéroté.',
      corps: [
        tableau({
          colonnes: ['N° de reçu', 'Date', 'Objet', 'Moyen', 'Référence', 'Montant', 'État', ''],
          lignes: liste.map((p) => [
            p.numero,
            dateHeure(p.saisiLe),
            p.detail ?? libelleFinance(p.objet),
            `${libelleFinance(p.canal)} · ${libelleFinance(p.operateur ?? p.mode)}`,
            p.referenceTransaction ?? '—',
            montant(p.montant),
            pastille(p.etat),
            boutonRecu(ctx, p.id),
          ]),
          vide: etatVide({ titre: 'Aucun paiement', message: 'Vos paiements et leurs reçus apparaîtront ici.' }),
        }),
      ],
    }),
  ]);
}
