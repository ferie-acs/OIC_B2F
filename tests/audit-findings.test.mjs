/**
 * Tests de non-régression des findings de l'audit de sécurité du 24/09/2026.
 *
 * Chaque test rejoue **le scénario exact que l'auditeur a reproduit par
 * exécution**, et non une approximation. C'est la condition pour qu'une
 * régression future se signale au lieu de repasser inaperçue.
 *
 * Référence : `docs/securite/audit-matrice-roles.md`.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { ETAT_APPARIEMENT, SENS_APPARIEMENT } from '../js/domain/enums.js';
import { CLASSIFICATION, ENTITES, entite } from '../js/domain/schema.js';
import { ROLES } from '../js/domain/roles.js';
import {
  DROITS,
  MATRICE,
  PORTEE,
  champsManquantsPourRole,
  droitsDuRole,
  peutLireClassification,
  porteeDe,
} from '../js/domain/permissions.js';
import {
  MOTIF_REFUS,
  decider,
  deciderSurAppariement,
  exiger,
  liberationsDe,
  peutAfficher,
  projeter,
} from '../js/domain/access.js';
import { ACTION } from '../js/domain/matching.state.js';
import { backendMemoire, creerStockage } from '../js/core/storage.js';

const G_AFF = 'grp-affreteur-1';
const G_TRA = 'grp-transporteur-1';

/** @param {object} [s] */
const ctx = (s = {}) => ({
  utilisateurId: 'u-1',
  roleId: 'affreteur',
  groupementId: G_AFF,
  compteActif: true,
  abonnementActif: true,
  objetsLiberes: new Set(),
  ...s,
});

/* ================================================================== *
 * S1 — les conteneurs contournaient les deux verrous
 * ================================================================== */

describe('S1 — un conteneur ne traverse plus la projection sans être examiné', () => {
  it('refuse au chargement tout conteneur sans classification explicite', () => {
    // C'est le garde-fou structurel : la régression est impossible à commettre
    // en silence, puisque le module ne se charge plus.
    for (const [nom, def] of Object.entries(ENTITES)) {
      for (const [champ, d] of Object.entries(def.champs)) {
        if (d.type === 'object' || d.type === 'array') {
          assert.ok(
            d.classification !== undefined,
            `${nom}.${champ} est un conteneur sans classification explicite.`,
          );
        }
      }
    }
  });

  it('déclare une sous-structure pour tout conteneur qui en porte une', () => {
    for (const nomEntite of ['dut', 'transport', 'demande', 'notification']) {
      const def = entite(nomEntite);
      const conteneurs = Object.entries(def.champs).filter(
        ([, d]) => d.type === 'object' || d.type === 'array',
      );
      for (const [champ, d] of conteneurs) {
        if (champ === 'motDePasse' || champ === 'params') continue;
        assert.ok(
          d.champs || d.elements,
          `${nomEntite}.${champ} ne déclare pas de sous-structure : ` +
            'son contenu échapperait à la projection.',
        );
      }
    }
  });

  const dut = {
    id: 'dut-1',
    reference: 'DUT-2026-0001',
    appariementId: 'ap-1',
    offreId: 'of-1',
    donnees: {
      corridor: 'Abidjan → Bouaké',
      transporteurRaisonSociale: 'TRANSCI SARL',
      immatriculation: '1234 AB 01',
      carteTransportNumero: 'CT-1',
      carteGrise: 'CG-98765',
      chauffeurNom: 'KOUASSI Yao',
      chauffeurTelephone: '+225 07 00 00 00',
      transporteurEmail: 'yao@transp.invalid',
    },
    genereLe: '2026-03-01T10:00:00.000Z',
    demo: true,
  };

  for (const roleId of ['concessionnaire', 'dut_transport', 'dgttc']) {
    it(`« ${roleId} » ne reçoit AUCUN sous-champ nominatif du DUT`, () => {
      const vu = projeter(
        ctx({ roleId, groupementId: null }),
        'dut',
        dut,
        { proprietaireId: G_TRA },
      );
      const d = vu.donnees ?? {};
      for (const champ of [
        'carteGrise',
        'chauffeurNom',
        'chauffeurTelephone',
        'transporteurEmail',
      ]) {
        assert.equal(
          champ in d,
          false,
          `« ${roleId} » obtient « donnees.${champ} », que la matrice lui refuse.`,
        );
      }
    });
  }

  it('laisse toutefois le DUT consultable administrativement — c’est un document de contrôle', () => {
    const vu = projeter(ctx({ roleId: 'dgttc', groupementId: null }), 'dut', dut, {
      proprietaireId: G_TRA,
    });
    assert.equal(vu.donnees.corridor, 'Abidjan → Bouaké');
    assert.equal(vu.donnees.immatriculation, '1234 AB 01');
  });

  it('sert les coordonnées du DUT à la partie dont la mise en relation est validée', () => {
    const vu = projeter(
      ctx({ objetsLiberes: new Set(['dut:dut-1']) }),
      'dut',
      dut,
      { proprietaireId: G_TRA },
    );
    assert.equal(vu.donnees.chauffeurTelephone, '+225 07 00 00 00');
  });

  const transport = {
    id: 't-1',
    appariementId: 'ap-1',
    etape: 'en_route',
    journal: [
      {
        id: 'e-1',
        type: 'etape',
        valeur: 'charge',
        observation: 'Chauffeur KOUASSI 0700000000 - frais 25000 F',
        auteurUtilisateurId: 'u-t',
        auteurGroupementId: G_TRA,
        horodatage: '2026-03-01T12:00:00.000Z',
      },
    ],
    demarreLe: '2026-03-01T10:00:00.000Z',
    demo: true,
  };

  it('retire l’observation du journal de transport à la DGTTC', () => {
    const vu = projeter(ctx({ roleId: 'dgttc', groupementId: null }), 'transport', transport);
    assert.equal(vu.journal.length, 1, 'la chronologie reste lisible');
    assert.equal(vu.journal[0].valeur, 'charge');
    assert.equal(
      'observation' in vu.journal[0],
      false,
      'la DGTTC lit une observation en texte libre',
    );
  });

  it('libère l’observation à l’auteur de l’événement', () => {
    const vu = projeter(ctx({ groupementId: G_TRA, roleId: 'transporteur' }), 'transport', transport);
    assert.match(vu.journal[0].observation, /KOUASSI/);
  });

  it('interdit aux paramètres d’une notification de cacher une structure', () => {
    const inv = entite('notification').invariants.find(
      (i) => i.nom === 'notificationSansDonneeSensible',
    );
    assert.equal(
      inv.verifier({ message: { code: 'reservation', params: { reference: 'MR-1' } } }),
      true,
    );
    assert.equal(
      inv.verifier({
        message: { code: 'x', params: { contact: { telephone: '+225 07' } } },
      }),
      false,
    );
  });
});

/* ================================================================== *
 * S2 — le droit ne gouvernait pas le verrou
 * ================================================================== */

describe('S2 — `coordonnees.lire` gouverne réellement la projection', () => {
  const chauffeur = {
    id: 'ch-1',
    groupementId: G_TRA,
    nom: 'DIALLO',
    permisNumero: 'P-999',
    telephone: '+225 05 00 00 00',
    creeLe: '2026-01-01T00:00:00.000Z',
    demo: true,
  };

  // Honnêteté de test : aucun rôle réel n'a aujourd'hui `contact` ouvert SANS
  // `coordonnees.lire`, si bien qu'un test par les rôles ne peut pas isoler ce
  // verrou — il passerait grâce au second. Ce sont les deux tests suivants, qui
  // passent par l'état du contexte, qui prouvent réellement que `decider()` est
  // consulté : vérifié en rejouant le défaut, eux seuls échouent alors.
  it('ferme les coordonnées à un rôle privé du droit, même sur un objet libéré', () => {
    assert.equal(porteeDe('concessionnaire', 'coordonnees.lire'), PORTEE.AUCUNE);

    const vu = projeter(
      ctx({
        roleId: 'concessionnaire',
        groupementId: null,
        objetsLiberes: new Set(['chauffeur:ch-1']),
      }),
      'chauffeur',
      chauffeur,
    );
    assert.equal('telephone' in vu, false);
    assert.equal('nom' in vu, false);
  });

  it('le droit et la classification sont deux verrous distincts, chacun suffisant à fermer', () => {
    // Le concessionnaire cumule les deux refus : ni le droit, ni la
    // classification. Vérifier qu'ils ne se confondent pas est ce qui garantit
    // qu'en retirer un ne rouvre pas la porte.
    assert.equal(porteeDe('concessionnaire', 'coordonnees.lire'), PORTEE.AUCUNE);
    assert.equal(peutLireClassification('concessionnaire', CLASSIFICATION.CONTACT), false);

    // Les acteurs du marché cumulent les deux accords.
    for (const id of ['affreteur', 'transporteur', 'partenaire']) {
      assert.notEqual(porteeDe(id, 'coordonnees.lire'), PORTEE.AUCUNE, id);
      assert.equal(peutLireClassification(id, CLASSIFICATION.CONTACT), true, id);
    }
  });

  it('ferme aussi les coordonnées quand l’abonnement a expiré', () => {
    // `decider()` étant désormais consulté, l'état du contexte se répercute.
    const vu = projeter(
      ctx({ abonnementActif: false, objetsLiberes: new Set(['chauffeur:ch-1']) }),
      'chauffeur',
      chauffeur,
    );
    assert.equal('telephone' in vu, false, 'un abonnement expiré laisse passer les coordonnées');
  });

  it('les ferme également pour un compte suspendu', () => {
    const vu = projeter(
      ctx({ compteActif: false, objetsLiberes: new Set(['chauffeur:ch-1']) }),
      'chauffeur',
      chauffeur,
    );
    assert.equal('telephone' in vu, false);
  });
});

/* ================================================================== *
 * S3 — la libération était au niveau du groupement entier
 * ================================================================== */

describe('S3 — la libération est bornée à l’objet apparié', () => {
  const chauffeurApparie = {
    id: 'ch-apparie',
    groupementId: G_TRA,
    nom: 'KOUASSI',
    permisNumero: 'P-001',
    telephone: '+225 07 00 00 00',
    creeLe: '2026-01-01T00:00:00.000Z',
    demo: true,
  };
  const chauffeurSansLien = {
    id: 'ch-sans-lien',
    groupementId: G_TRA,
    nom: 'DIALLO',
    permisNumero: 'P-999',
    telephone: '+225 05 00 00 00',
    creeLe: '2026-01-01T00:00:00.000Z',
    demo: true,
  };

  const appariements = [
    {
      id: 'ap-1',
      etat: ETAT_APPARIEMENT.VALIDER,
      offreId: 'of-1',
      demandeId: 'dt-1',
      groupementAffreteurId: G_AFF,
      groupementTransporteurId: G_TRA,
      sens: SENS_APPARIEMENT.OFFRE_VERS_DEMANDE,
    },
  ];
  const offres = [
    { id: 'of-1', groupementId: G_TRA, vehiculeId: 'v-1', chauffeurPressentiId: 'ch-apparie' },
    { id: 'of-2', groupementId: G_TRA, vehiculeId: 'v-2', chauffeurPressentiId: 'ch-sans-lien' },
  ];

  const liberes = liberationsDe({ groupementId: G_AFF, appariements, offres });
  const ctxLibere = ctx({ objetsLiberes: liberes });

  it('libère le chauffeur de l’offre apparié', () => {
    const vu = projeter(ctxLibere, 'chauffeur', chauffeurApparie);
    assert.equal(vu.telephone, '+225 07 00 00 00');
  });

  it('SCÉNARIO DE L’AUDIT : ne libère pas un chauffeur tiers du même transporteur', () => {
    const vu = projeter(ctxLibere, 'chauffeur', chauffeurSansLien);
    assert.equal(
      'telephone' in vu,
      false,
      "une seule mise en relation livrait l'annuaire complet du transporteur",
    );
    assert.equal('nom' in vu, false);
    assert.equal('permisNumero' in vu, false);
  });

  it('ne libère pas une offre non appariée du même transporteur', () => {
    assert.equal(liberes.has('offre:of-1'), true);
    assert.equal(liberes.has('offre:of-2'), false);
    assert.equal(liberes.has('vehicule:v-1'), true);
    assert.equal(liberes.has('vehicule:v-2'), false);
  });

  it('libère le groupement de la contrepartie, ses coordonnées commerciales', () => {
    assert.equal(liberes.has(`groupement:${G_TRA}`), true);
  });

  it('ne libère rien tant qu’aucun appariement n’est validé', () => {
    const enCours = [{ ...appariements[0], etat: ETAT_APPARIEMENT.ACCEPTER }];
    const rien = liberationsDe({ groupementId: G_AFF, appariements: enCours, offres });
    assert.equal(rien.size, 0, "« accepter » n'est pas « valider »");
  });

  it('ne libère rien pour un groupement étranger à l’appariement', () => {
    const rien = liberationsDe({ groupementId: 'grp-tiers', appariements, offres });
    assert.equal(rien.size, 0);
  });

  it('ne libère rien pour un rôle institutionnel, qui n’a pas de groupement', () => {
    const rien = liberationsDe({ groupementId: null, appariements, offres });
    assert.equal(rien.size, 0);
  });

  it('libère symétriquement côté transporteur', () => {
    const cote = liberationsDe({ groupementId: G_TRA, appariements, offres });
    assert.equal(cote.has(`groupement:${G_AFF}`), true);
  });

  it('ne libère que le déductible si l’offre est inconnue', () => {
    const partiel = liberationsDe({ groupementId: G_AFF, appariements, offres: [] });
    assert.equal(partiel.has(`groupement:${G_TRA}`), true);
    assert.equal(partiel.has('chauffeur:ch-apparie'), false, 'libération devinée');
  });
});

/* ================================================================== *
 * S4 — atomique mais non isolé : une écriture se perdait
 * ================================================================== */

describe('S4 — deux validations concurrentes ne peuvent plus écraser un débit', () => {
  /** Prépare un compte crédité de 30 000 et un appariement accepté. */
  function socleInitial() {
    const socle = backendMemoire();
    const s = creerStockage(socle);
    s.transaction((tx) => {
      tx.ecrire('operations', [{ id: 'c1', sens: 'credit', montant: 30000 }]);
      tx.ecrire('appariements', [{ id: 'ap-1', etat: 'accepter' }]);
    });
    return { socle, s };
  }

  const solde = (ops) =>
    ops.reduce((n, o) => n + (o.sens === 'credit' ? o.montant : -o.montant), 0);

  it('SCÉNARIO DE L’AUDIT : le second onglet est refusé, pas appliqué par-dessus', () => {
    const { socle } = socleInitial();
    const onglet1 = creerStockage(socle);
    const onglet2 = creerStockage(socle);

    // Les deux onglets construisent leur écran de validation : ils lisent le
    // solde et capturent l'instantané de versions sur lequel leur décision
    // « les 30 000 couvrent les 25 000 de frais » repose.
    const vuParA = onglet1.versions(['operations', 'appariements']);
    const vuParB = onglet2.versions(['operations', 'appariements']);
    assert.equal(solde(onglet1.lire('operations')), 30000);
    assert.equal(solde(onglet2.lire('operations')), 30000);

    // A valide.
    onglet1.transaction(
      (tx) => {
        tx.ecrire('operations', [
          ...tx.lire('operations'),
          { id: 'd1', sens: 'debit', montant: 25000 },
        ]);
        tx.ecrire('appariements', [{ id: 'ap-1', etat: 'valider' }]);
      },
      { attendu: vuParA },
    );

    // B valide sur son état périmé — doit être refusé.
    assert.throws(
      () =>
        onglet2.transaction(
          (tx) => {
            tx.ecrire('operations', [
              ...tx.lire('operations'),
              { id: 'd2', sens: 'debit', montant: 25000 },
            ]);
            tx.ecrire('appariements', [{ id: 'ap-2', etat: 'valider' }]);
          },
          { attendu: vuParB },
        ),
      /modifiées ailleurs pendant votre saisie/,
    );

    const final = onglet1.lire('operations');
    assert.equal(solde(final), 5000);
    assert.equal(final.length, 2, 'le débit de A doit survivre');
    assert.ok(
      final.some((o) => o.id === 'd1'),
      "le débit du premier onglet a été écrasé — c'est le défaut reproduit par l'audit",
    );
    assert.equal(
      final.some((o) => o.id === 'd2'),
      false,
      'le second débit a été appliqué alors qu’il devait être refusé',
    );
  });

  it('n’écrit rien du tout quand le conflit est détecté', () => {
    const { socle } = socleInitial();
    const a = creerStockage(socle);
    const b = creerStockage(socle);

    const vuParB = b.versions(['appariements']);
    a.transaction((tx) => tx.ecrire('appariements', [{ id: 'ap-1', etat: 'valider' }]));

    assert.throws(() =>
      b.transaction(
        (tx) => {
          tx.ecrire('appariements', [{ id: 'ap-1', etat: 'annuler' }]);
          tx.ecrire('operations', [{ id: 'x' }]);
        },
        { attendu: vuParB },
      ),
    );

    assert.equal(a.lire('appariements')[0].etat, 'valider');
    assert.equal(
      a.lire('operations').length,
      1,
      'une collection non conflictuelle du même lot a tout de même été écrite',
    );
  });

  it('laisse passer deux transactions sur des collections disjointes', () => {
    const { socle } = socleInitial();
    const a = creerStockage(socle);
    const b = creerStockage(socle);

    a.transaction((tx) => tx.ecrire('declarations', [{ id: 'df-1' }]));
    b.transaction((tx) => tx.ecrire('vehicules', [{ id: 'v-1' }]));

    assert.equal(a.lire('declarations').length, 1);
    assert.equal(a.lire('vehicules').length, 1);
  });

  it('permet de retenter après avoir relu l’état', () => {
    const { socle } = socleInitial();
    const a = creerStockage(socle);
    const b = creerStockage(socle);

    const vuParB = b.versions(['operations']);
    a.transaction((tx) => tx.ecrire('operations', [...tx.lire('operations'), { id: 'd1' }]));

    assert.throws(() =>
      b.transaction((tx) => tx.ecrire('operations', [...tx.lire('operations'), { id: 'd2' }]), {
        attendu: vuParB,
      }),
    );

    // L'utilisateur recharge : nouvel instantané, plus de conflit.
    const relu = b.versions(['operations']);
    b.transaction((tx) => tx.ecrire('operations', [...tx.lire('operations'), { id: 'd2' }]), {
      attendu: relu,
    });
    assert.equal(b.lire('operations').length, 3);
  });

  it('protège aussi sans instantané, quand la transaction relit elle-même', () => {
    // Cas d'un service asynchrone : la lecture se fait dans la transaction, mais
    // un `await` peut s'intercaler avant l'écriture.
    const { socle } = socleInitial();
    const s = creerStockage(socle);
    const autre = creerStockage(socle);

    assert.throws(
      () =>
        s.transaction((tx) => {
          tx.lire('operations'); // version notée ici
          autre.transaction((t2) => t2.ecrire('operations', [{ id: 'intrus' }]));
          tx.ecrire('operations', [{ id: 'tardif' }]);
        }),
      /modifiées ailleurs/,
    );

    assert.equal(s.lire('operations')[0].id, 'intrus');
  });

  it('S5 — refuse d’ouvrir une transaction tant qu’un journal traîne', () => {
    const socle = backendMemoire();
    socle.setItem(
      'b2f_tx_journal',
      JSON.stringify({ horodatage: Date.now(), avant: { b2f_operations: null } }),
    );
    const s = creerStockage(socle);

    assert.equal(s.aUnJournalEnAttente(), true);
    assert.throws(
      () => s.transaction((tx) => tx.ecrire('operations', [{ id: 'x' }])),
      /Rechargez la page/,
      "le journal aurait été écrasé, et la promesse de rétablissement rendue fausse",
    );
  });

  it('S15 — refuse un journal visant une clé hors du préfixe b2f_', () => {
    const socle = backendMemoire();
    socle.setItem(
      'b2f_tx_journal',
      JSON.stringify({ horodatage: Date.now(), avant: { dut_theme: 'dark' } }),
    );
    const s = creerStockage(socle);
    assert.throws(() => s.restaurerSiInterrompu(), /clé inattendue/);
    assert.equal(socle.getItem('dut_theme'), null, 'le POC DUT a été touché');
  });
});

/* ================================================================== *
 * S7 à S12 — findings de gravité moyenne et faible
 * ================================================================== */

describe('S7 — la portée MARCHE exige un état de publication', () => {
  it('refuse un objet tiers non publié', () => {
    const d = decider(ctx(), 'marche.offres', { groupementId: 'grp-x', publie: false });
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.NON_PUBLIE);
  });

  it('refuse une cible qui ne porte pas l’information — ne pas savoir n’autorise pas', () => {
    const d = decider(ctx(), 'marche.offres', { groupementId: 'grp-x' });
    assert.equal(d.autorise, false);
    assert.match(d.explication, /n'a pas été fourni/);
  });

  it('accorde sur un objet publié', () => {
    const d = decider(ctx(), 'marche.offres', { groupementId: 'grp-x', publie: true });
    assert.equal(d.autorise, true);
  });
});

describe('S8 — un droit mutant exige sa cible', () => {
  it('lève si la cible est omise sur le droit de validation', () => {
    assert.throws(
      () => exiger(ctx(), 'appariement.valider'),
      /sa cible est obligatoire/,
      'un service pouvait valider sans vérifier le cloisonnement',
    );
  });

  it('marque comme mutantes toutes les actions financières', () => {
    for (const d of ['appariement.valider', 'compte.crediter', 'tarif.modifier']) {
      assert.equal(DROITS[d].mutation, true, `« ${d} » n'est pas marqué mutant.`);
    }
  });

  it('ne marque pas mutants les droits de lecture', () => {
    for (const d of ['appariement.lire', 'compte.lire', 'audit.lire', 'coordonnees.lire']) {
      assert.notEqual(DROITS[d].mutation, true, `« ${d} » est marqué mutant à tort.`);
    }
  });

  it('laisse peutAfficher() répondre sans cible, pour les menus', () => {
    assert.equal(peutAfficher(ctx(), 'appariement.valider').autorise, true);
  });
});

describe('S9 — la décision sur un appariement croise partie, action et droit', () => {
  const appariement = {
    id: 'ap-1',
    sens: SENS_APPARIEMENT.OFFRE_VERS_DEMANDE,
    groupementAffreteurId: G_AFF,
    groupementTransporteurId: G_TRA,
  };

  it('refuse un groupement étranger aux deux parties', () => {
    const d = deciderSurAppariement(ctx({ groupementId: 'grp-x' }), ACTION.VALIDER, appariement);
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.HORS_PERIMETRE);
  });

  it('autorise l’affréteur à valider', () => {
    assert.equal(deciderSurAppariement(ctx(), ACTION.VALIDER, appariement).autorise, true);
  });

  it('refuse au transporteur de valider à la place de l’affréteur', () => {
    const d = deciderSurAppariement(
      ctx({ roleId: 'transporteur', groupementId: G_TRA }),
      ACTION.VALIDER,
      appariement,
    );
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.PARTIE_NON_HABILITEE);
  });

  it('refuse à l’affréteur de répondre à sa propre réservation', () => {
    const d = deciderSurAppariement(ctx(), ACTION.ACCEPTER, appariement);
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.PARTIE_NON_HABILITEE);
  });

  it('inverse les rôles en sens B, sauf la validation', () => {
    const sensB = { ...appariement, sens: SENS_APPARIEMENT.DEMANDE_VERS_OFFRE };
    assert.equal(deciderSurAppariement(ctx(), ACTION.ACCEPTER, sensB).autorise, true);
    assert.equal(deciderSurAppariement(ctx(), ACTION.VALIDER, sensB).autorise, true);
  });

  it('ouvre l’annulation aux deux parties', () => {
    assert.equal(deciderSurAppariement(ctx(), ACTION.ANNULER, appariement).autorise, true);
    assert.equal(
      deciderSurAppariement(
        ctx({ roleId: 'transporteur', groupementId: G_TRA }),
        ACTION.ANNULER,
        appariement,
      ).autorise,
      true,
    );
  });

  it('refuse la validation à l’auxiliaire, partie pourtant légitime', () => {
    const d = deciderSurAppariement(
      ctx({ roleId: 'auxiliaire_affreteur' }),
      ACTION.VALIDER,
      appariement,
    );
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.DROIT_ABSENT);
  });
});

describe('S10 — un rôle inconnu fait échouer toute fonction de la matrice', () => {
  const fonctions = [
    ['porteeDe', () => porteeDe('role_forge', 'compte.lire')],
    ['peutLireClassification', () => peutLireClassification('role_forge', CLASSIFICATION.PUBLIC)],
    ['droitsDuRole', () => droitsDuRole('role_forge')],
    ['champsManquantsPourRole', () => champsManquantsPourRole('role_forge', 'vehicule', {})],
  ];

  for (const [nom, appel] of fonctions) {
    it(`${nom}() lève`, () => {
      assert.throws(appel, /Rôle inconnu/);
    });
  }

  it('projeter() échoue plutôt que de servir les champs publics', () => {
    assert.throws(
      () => projeter(ctx({ roleId: 'role_forge' }), 'groupement', { id: G_TRA, pays: 'CI' }),
      /Rôle inconnu/,
    );
  });
});

describe('S12 — aucun rôle soumis à abonnement n’est enfermé', () => {
  for (const [id, r] of Object.entries(ROLES)) {
    if (!r.soumisAbonnement) continue;
    it(`« ${id} » peut consulter son abonnement pour le renouveler`, () => {
      assert.notEqual(
        porteeDe(id, 'abonnement.lire'),
        PORTEE.AUCUNE,
        'abonnement expiré + droit absent = impasse sans issue',
      );
      const d = decider(ctx({ roleId: id, abonnementActif: false }), 'abonnement.lire');
      assert.equal(d.autorise, true);
    });
  }
});

describe('S14 — les mécanismes déclarés sont branchés', () => {
  it('CHAMPS_REQUIS_PAR_ROLE est lisible par une fonction du domaine', () => {
    assert.deepEqual(
      champsManquantsPourRole('transporteur_etranger', 'vehicule', { immatriculation: 'X' }),
      ['paysImmatriculation'],
    );
    assert.deepEqual(
      champsManquantsPourRole('transporteur_etranger', 'vehicule', {
        paysImmatriculation: 'Mali',
      }),
      [],
    );
  });

  it('n’impose rien de plus au transporteur national', () => {
    assert.deepEqual(champsManquantsPourRole('transporteur', 'vehicule', {}), []);
  });
});

describe('Bris de glace — déclaré, accordé à personne', () => {
  it('existe au catalogue', () => {
    assert.ok(DROITS['coordonnees.exception']);
  });

  it('n’est accordé à AUCUN des rôles déclarés', () => {
    for (const id of Object.keys(ROLES)) {
      assert.equal(
        porteeDe(id, 'coordonnees.exception'),
        PORTEE.AUCUNE,
        `« ${id} » dispose du bris de glace : il doit rester fermé dans le POC.`,
      );
    }
  });
});
