/**
 * Tests de la machine à états de l'appariement.
 *
 * On vérifie ici ce qu'une démonstration ne joue jamais : les chemins interdits.
 * Un mécanisme d'appariement qui laisserait sauter de `reserver` à `valider`
 * transformerait une réservation non acceptée en débit — et le système existant,
 * qui porte trois mécanismes concurrents, n'a rien pour s'en prémunir.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { ETAT_APPARIEMENT, SENS_APPARIEMENT } from '../js/domain/enums.js';
import {
  ACTION,
  ETATS_TERMINAUX,
  PARTIE,
  TRANSITIONS,
  actionsDepuis,
  droitPourEngager,
  estTerminal,
  evaluerTransition,
  partieHabilitee,
} from '../js/domain/matching.state.js';

/** Contexte métier où toutes les gardes passent. */
const ctxNominal = {
  offreDisponible: true,
  demandeOuverte: true,
  fenetreRecouvrante: true,
  soldeAffreteur: 50000,
  soldeTransporteur: 50000,
  fraisAffreteur: 15000,
  fraisTransporteur: 15000,
  nomAffreteur: 'Ivoire Démo Export',
  nomTransporteur: 'Transports Démo SARL',
  motifRejet: 'dates_incompatibles',
  // Correctifs anti-fraude n° 3 et n° 4 (13/10/2026).
  transporteurVerifie: true,
  moyensVerifies: true,
  delaiDepasse: false,
};

describe('Le chemin nominal', () => {
  it('engage un appariement depuis rien', () => {
    const e = evaluerTransition(null, ACTION.ENGAGER, ctxNominal);
    assert.equal(e.possible, true);
    assert.equal(e.vers, ETAT_APPARIEMENT.RESERVER);
    assert.equal(e.financiere, false);
  });

  it('accepte depuis « reserver »', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.RESERVER, ACTION.ACCEPTER, ctxNominal);
    assert.equal(e.possible, true);
    assert.equal(e.vers, ETAT_APPARIEMENT.ACCEPTER);
    assert.equal(e.financiere, false, "accepter n'entraîne aucun débit");
  });

  it('valide depuis « accepter », et c’est la seule transition financière', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, ctxNominal);
    assert.equal(e.possible, true);
    assert.equal(e.vers, ETAT_APPARIEMENT.VALIDER);
    assert.equal(e.financiere, true);
    assert.equal(e.droitRequis, 'appariement.valider');

    const financieres = TRANSITIONS.filter((t) => t.financiere === true);
    assert.equal(financieres.length, 1);
  });
});

describe('Les chemins interdits', () => {
  it('refuse de valider directement depuis « reserver »', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.RESERVER, ACTION.VALIDER, ctxNominal);
    assert.equal(e.possible, false);
    assert.match(e.refus[0], /qu'après l'acceptation du transporteur/);
  });

  it('refuse de valider depuis rien', () => {
    assert.equal(evaluerTransition(null, ACTION.VALIDER, ctxNominal).possible, false);
  });

  it('refuse toute transition depuis un état terminal', () => {
    for (const terminal of ETATS_TERMINAUX) {
      assert.equal(actionsDepuis(terminal).length, 0, `« ${terminal} » offre encore des actions.`);
      for (const action of Object.values(ACTION)) {
        assert.equal(
          evaluerTransition(terminal, action, ctxNominal).possible,
          false,
          `« ${action} » reste possible depuis « ${terminal} ».`,
        );
      }
    }
  });

  it('explique qu’un appariement validé ne se défait pas, débit à l’appui', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.VALIDER, ACTION.ANNULER, ctxNominal);
    assert.equal(e.possible, false);
    assert.match(e.refus[0], /débités/);
  });

  it('refuse de réaccepter un appariement déjà accepté', () => {
    assert.equal(
      evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.ACCEPTER, ctxNominal).possible,
      false,
    );
  });

  it('marque les trois états terminaux, et eux seuls', () => {
    assert.equal(estTerminal(ETAT_APPARIEMENT.VALIDER), true);
    assert.equal(estTerminal(ETAT_APPARIEMENT.REJETER), true);
    assert.equal(estTerminal(ETAT_APPARIEMENT.ANNULER), true);
    assert.equal(estTerminal(ETAT_APPARIEMENT.RESERVER), false);
    assert.equal(estTerminal(ETAT_APPARIEMENT.ACCEPTER), false);
  });
});

describe('Les gardes de solde', () => {
  it('refuse la validation si le solde de l’affréteur est insuffisant', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      soldeAffreteur: 8000,
    });
    assert.equal(e.possible, false);
    assert.deepEqual(e.gardesEnEchec, ['soldeAffreteurSuffisant']);
    assert.match(e.refus[0], /Ivoire Démo Export/);
    // Le séparateur de milliers dépend de l'ICU du moteur : espace fine
    // insécable, insécable ou ordinaire selon les versions.
    assert.match(e.refus[0], /Il manque 7[\s  ]000 F CFA/);
    assert.match(e.refus[0], /affiche 8[\s  ]000 F CFA/);
  });

  it('refuse aussi si c’est le transporteur qui est en défaut', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      soldeTransporteur: 0,
    });
    assert.equal(e.possible, false);
    assert.deepEqual(e.gardesEnEchec, ['soldeTransporteurSuffisant']);
  });

  // Finding S6 de l'audit : le message unique livrait à l'affréteur le solde
  // exact du compte prépayé du transporteur — un compte sur lequel la matrice
  // lui refuse pourtant tout droit.
  it('S6 — ne révèle à l’affréteur NI le solde NI l’écart du transporteur', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      soldeTransporteur: 3000,
      fraisTransporteur: 25000,
      destinataire: 'affreteur',
    });
    assert.equal(e.possible, false);
    const message = e.refus[0];

    assert.doesNotMatch(message, /3[\s  ]000/, 'le solde du tiers est révélé');
    assert.doesNotMatch(message, /22[\s  ]000/, "l'écart reconstitue le solde");
    assert.doesNotMatch(message, /Transports Démo SARL/, 'la contrepartie est nommée');
    assert.match(message, /contrepartie/);
    assert.match(message, /aucun montant ne vous a été débité/);
  });

  it('S6 — chiffre en revanche le détail au transporteur, qui est chez lui', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      soldeTransporteur: 3000,
      fraisTransporteur: 25000,
      destinataire: 'transporteur',
    });
    assert.match(e.refus[0], /votre solde est insuffisant/);
    assert.match(e.refus[0], /3[\s  ]000 F CFA/);
    assert.match(e.refus[0], /Il manque 22[\s  ]000 F CFA/);
  });

  it('S6 — sans destinataire connu, sert le message le plus discret', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      soldeTransporteur: 3000,
      fraisTransporteur: 25000,
    });
    assert.doesNotMatch(e.refus[0], /3[\s  ]000/);
  });

  it('S6 — ne révèle pas non plus le solde de l’affréteur au transporteur', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      soldeAffreteur: 1000,
      destinataire: 'transporteur',
    });
    assert.equal(e.possible, false);
    assert.doesNotMatch(e.refus[0], /1[\s  ]000/);
    assert.match(e.refus[0], /votre véhicule reste engagé|reste engagé/);
  });

  it('signale les DEUX défauts d’un coup, et non l’un après l’autre', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      soldeAffreteur: 0,
      soldeTransporteur: 0,
    });
    assert.equal(e.refus.length, 2);
    assert.deepEqual(e.gardesEnEchec, ['soldeAffreteurSuffisant', 'soldeTransporteurSuffisant']);
  });

  it('échoue plutôt que de passer si un solde est absent du contexte', () => {
    const { soldeAffreteur, ...sansSolde } = ctxNominal;
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, sansSolde);
    assert.equal(e.possible, false, 'une garde non évaluable ne doit jamais passer');
    assert.ok(e.gardesEnEchec.includes('soldeAffreteurSuffisant'));
  });

  it('refuse la validation si l’offre n’est plus tenable', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      ...ctxNominal,
      offreDisponible: false,
    });
    assert.equal(e.possible, false);
    assert.ok(e.gardesEnEchec.includes('offreTenable'));
  });
});

describe('Le rejet exige un motif', () => {
  it('refuse un rejet sans motif', () => {
    const { motifRejet, ...sansMotif } = ctxNominal;
    const e = evaluerTransition(ETAT_APPARIEMENT.RESERVER, ACTION.REJETER, sansMotif);
    assert.equal(e.possible, false);
    assert.deepEqual(e.gardesEnEchec, ['motifFourni']);
  });

  it('accepte un rejet motivé', () => {
    const e = evaluerTransition(ETAT_APPARIEMENT.RESERVER, ACTION.REJETER, ctxNominal);
    assert.equal(e.possible, true);
    assert.equal(e.vers, ETAT_APPARIEMENT.REJETER);
  });
});

describe('L’annulation reste ouverte avant validation, et à elle seule', () => {
  for (const depuis of [ETAT_APPARIEMENT.RESERVER, ETAT_APPARIEMENT.ACCEPTER]) {
    it(`est possible depuis « ${depuis} » sans garde`, () => {
      const e = evaluerTransition(depuis, ACTION.ANNULER, {});
      assert.equal(e.possible, true);
      assert.equal(e.financiere, false);
    });
  }

  it('est ouverte aux deux parties', () => {
    assert.equal(partieHabilitee(ACTION.ANNULER, SENS_APPARIEMENT.OFFRE_VERS_DEMANDE), PARTIE.LES_DEUX);
  });
});

describe('Les deux sens du flux convergent sur une seule machine', () => {
  it('sens A : l’affréteur engage, le transporteur répond', () => {
    const s = SENS_APPARIEMENT.OFFRE_VERS_DEMANDE;
    assert.equal(partieHabilitee(ACTION.ENGAGER, s), PARTIE.AFFRETEUR);
    assert.equal(partieHabilitee(ACTION.ACCEPTER, s), PARTIE.TRANSPORTEUR);
    assert.equal(droitPourEngager(s), 'appariement.reserver');
  });

  it('sens B : le transporteur engage, l’affréteur répond', () => {
    const s = SENS_APPARIEMENT.DEMANDE_VERS_OFFRE;
    assert.equal(partieHabilitee(ACTION.ENGAGER, s), PARTIE.TRANSPORTEUR);
    assert.equal(partieHabilitee(ACTION.ACCEPTER, s), PARTIE.AFFRETEUR);
    assert.equal(droitPourEngager(s), 'appariement.proposer');
  });

  it('la validation revient à l’affréteur dans les DEUX sens', () => {
    for (const s of Object.values(SENS_APPARIEMENT)) {
      assert.equal(
        partieHabilitee(ACTION.VALIDER, s),
        PARTIE.AFFRETEUR,
        `Le sens « ${s} » déplace la validation hors de l'affréteur.`,
      );
    }
  });
});

describe('Intégrité de la table de transitions', () => {
  it('ne déclare aucune transition en double', () => {
    const vues = new Set();
    for (const t of TRANSITIONS) {
      const cle = `${t.depuis}→${t.action}`;
      assert.equal(vues.has(cle), false, `Transition en double : ${cle}`);
      vues.add(cle);
    }
  });

  it('rattache chaque transition à un droit de la matrice', () => {
    for (const t of TRANSITIONS) {
      assert.ok(typeof t.droit === 'string' && t.droit.includes('.'), `Droit absent : ${t.action}`);
    }
  });

  it('n’offre aucun chemin de retour vers un état antérieur', () => {
    for (const t of TRANSITIONS) {
      if (t.depuis === null) continue;
      assert.equal(
        estTerminal(t.depuis),
        false,
        `Transition au départ de l'état terminal « ${t.depuis} ».`,
      );
    }
  });
});
