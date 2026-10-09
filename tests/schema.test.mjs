/**
 * Tests du schéma.
 *
 * Deux objets distincts :
 * 1. La cohérence du schéma lui-même — une référence pointant vers une entité
 *    inexistante est une contrainte qui ne contraindra jamais rien.
 * 2. Les invariants métier, qui expriment l'intégrité que le système existant
 *    n'a nulle part sans clé étrangère ni contrainte de validation.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  CLASSIFICATION,
  ENTITES,
  INVARIANTS_CROISES,
  champsClasses,
  collections,
  entite,
  relations,
} from '../js/domain/schema.js';
import {
  ETAT_ABONNEMENT,
  ETAT_APPARIEMENT,
  ETAT_COMPTE,
  ETAT_DECLARATION,
  ETAT_DEMANDE,
  ETAT_OFFRE,
  ETAT_VEHICULE,
  ETAPE_TRANSPORT,
  LIBELLES,
  MOTIF_REJET,
  NATURE_INCIDENT,
  POV,
  TYPE_GROUPEMENT,
  labelOf,
} from '../js/domain/enums.js';

describe('Cohérence du schéma', () => {
  const nomsEntites = new Set(Object.keys(ENTITES));

  it('fait pointer chaque référence vers une entité déclarée', () => {
    for (const nom of nomsEntites) {
      for (const r of relations(nom)) {
        if (r.vers === 'role') continue; // rôles déclarés dans roles.js, pas une collection
        assert.ok(
          nomsEntites.has(r.vers),
          `${nom}.${r.champ} référence « ${r.vers} », qui n'existe pas.`,
        );
      }
    }
  });

  it('donne à chaque entité une collection unique', () => {
    const vues = new Set();
    for (const c of collections()) {
      assert.equal(vues.has(c), false, `Collection en double : « ${c} ».`);
      vues.add(c);
    }
  });

  it('classe chaque champ dans une classification connue', () => {
    const connues = new Set(Object.values(CLASSIFICATION));
    for (const [nom, def] of Object.entries(ENTITES)) {
      for (const [champ, d] of Object.entries(def.champs)) {
        assert.ok(
          connues.has(d.classification),
          `${nom}.${champ} porte une classification inconnue : « ${d.classification} ».`,
        );
      }
    }
  });

  it('marque toute entité de démonstration par un champ « demo »', () => {
    for (const [nom, def] of Object.entries(ENTITES)) {
      if (nom === 'tarif' || nom === 'referentiel') continue; // données de paramétrage
      assert.ok(def.champs.demo, `L'entité « ${nom} » ne porte pas de marque « demo ».`);
    }
  });

  it('lève sur une entité inconnue', () => {
    assert.throws(() => entite('inexistante'), /Entité inconnue/);
  });

  it('déclare explicitement le champ portant le groupement propriétaire', () => {
    for (const [nom, def] of Object.entries(ENTITES)) {
      assert.ok(
        'proprietaire' in def,
        `L'entité « ${nom} » ne déclare pas de champ propriétaire. La projection ` +
          'devrait alors le deviner — et une fuite de coordonnées commence là.',
      );
      if (def.proprietaire !== null) {
        assert.ok(
          def.champs[def.proprietaire],
          `« ${nom} » désigne « ${def.proprietaire} » comme propriétaire, champ inexistant.`,
        );
      }
    }
  });

  it('désigne « id » comme propriétaire du groupement lui-même', () => {
    assert.equal(entite('groupement').proprietaire, 'id');
  });

  it('laisse sans propriétaire les entités à deux parties ou sans rattachement', () => {
    for (const nom of ['appariement', 'transport', 'dut']) {
      assert.equal(
        entite(nom).proprietaire,
        null,
        `« ${nom} » ne doit pas désigner de propriétaire unique : l'appelant le fournit.`,
      );
    }
  });
});

describe('Classification — les champs sensibles sont bien marqués', () => {
  it('classe les coordonnées du groupement en « contact »', () => {
    const contacts = champsClasses('groupement', CLASSIFICATION.CONTACT);
    for (const c of ['contactNom', 'contactTelephone', 'contactEmail', 'adresse']) {
      assert.ok(contacts.includes(c), `groupement.${c} n'est pas classé « contact ».`);
    }
  });

  it('classe tout le chauffeur en « contact » — c’est une donnée transmise, pas publique', () => {
    const contacts = champsClasses('chauffeur', CLASSIFICATION.CONTACT);
    for (const c of ['nom', 'permisNumero', 'telephone']) {
      assert.ok(contacts.includes(c), `chauffeur.${c} n'est pas classé « contact ».`);
    }
  });

  it('classe l’empreinte de mot de passe en « systeme », et elle seule', () => {
    assert.deepEqual(champsClasses('utilisateur', CLASSIFICATION.SYSTEME), ['motDePasse']);
  });

  it('classe les montants de l’appariement en « financier »', () => {
    const fin = champsClasses('appariement', CLASSIFICATION.FINANCIER);
    for (const c of ['fraisAffreteur', 'fraisTransporteur']) {
      assert.ok(fin.includes(c), `appariement.${c} n'est pas classé « financier ».`);
    }
  });

  it('ne stocke aucun solde : il se recalcule', () => {
    for (const [nom, def] of Object.entries(ENTITES)) {
      assert.equal(
        'solde' in def.champs,
        false,
        `L'entité « ${nom} » stocke un solde, qui se désynchronisera.`,
      );
    }
  });
});

describe('Invariants — déclaration de fret', () => {
  const base = {
    id: 'df-1',
    reference: 'DF-2026-0001',
    groupementId: 'g-1',
    libelle: 'Cacao en sacs',
    provenanceId: 'loc-abidjan',
    destinationId: 'loc-bouake',
    etat: 'active',
    creeeLe: '2026-01-01T00:00:00.000Z',
    demo: true,
  };
  const inv = (n) => entite('declaration').invariants.find((i) => i.nom === n);

  it('accepte un corridor valide', () => {
    assert.equal(inv('corridorNonDegenere').verifier(base), true);
  });

  it('refuse une destination identique à la provenance', () => {
    assert.equal(
      inv('corridorNonDegenere').verifier({ ...base, destinationId: 'loc-abidjan' }),
      false,
    );
  });
});

describe('Invariants — demande de transport', () => {
  const base = {
    departPrevu: '2026-03-01T08:00:00.000Z',
    arriveePrevue: '2026-03-02T18:00:00.000Z',
    lignes: [{ id: 'l-1', produitId: 'sh-1801', poidsT: 22, volumeM3: 40, nombreColis: 400 }],
  };
  const inv = (n) => entite('demande').invariants.find((i) => i.nom === n);

  it('accepte une arrivée postérieure au départ', () => {
    assert.equal(inv('arriveeApresDepart').verifier(base), true);
  });

  it('refuse une arrivée antérieure ou simultanée', () => {
    assert.equal(
      inv('arriveeApresDepart').verifier({ ...base, arriveePrevue: base.departPrevu }),
      false,
    );
  });

  it('refuse une demande sans ligne de marchandise', () => {
    assert.equal(inv('aumoinsUneLigne').verifier({ ...base, lignes: [] }), false);
  });

  it('refuse un poids nul ou négatif', () => {
    assert.equal(
      inv('lignesBienFormees').verifier({ ...base, lignes: [{ produitId: 'sh-1', poidsT: 0 }] }),
      false,
    );
  });

  it('refuse une ligne sans produit', () => {
    assert.equal(
      inv('lignesBienFormees').verifier({ ...base, lignes: [{ poidsT: 10 }] }),
      false,
    );
  });
});

describe('Invariants — véhicule', () => {
  const inv = entite('vehicule').invariants.find((i) => i.nom === 'capaciteSousPtac');

  it('accepte une capacité inférieure au PTAC', () => {
    assert.equal(inv.verifier({ capaciteT: 25, ptacT: 38 }), true);
  });

  it('refuse une capacité supérieure au PTAC', () => {
    assert.equal(inv.verifier({ capaciteT: 40, ptacT: 38 }), false);
  });
});

describe('Invariants — appariement : le cœur de l’intégrité', () => {
  const inv = (n) => entite('appariement').invariants.find((i) => i.nom === n);

  const valide = {
    etat: ETAT_APPARIEMENT.VALIDER,
    groupementAffreteurId: 'g-a',
    groupementTransporteurId: 'g-t',
    fraisAffreteur: 15000,
    fraisTransporteur: 15000,
    operationAffreteurId: 'op-1',
    operationTransporteurId: 'op-2',
    valideLe: '2026-03-01T10:00:00.000Z',
  };

  it('accepte un appariement validé complet', () => {
    assert.equal(inv('validationComplete').verifier(valide), true);
  });

  it('REFUSE un appariement validé avec un seul débit — le défaut à ne pas reproduire', () => {
    const { operationTransporteurId, ...unSeulDebit } = valide;
    assert.equal(inv('validationComplete').verifier(unSeulDebit), false);
  });

  it('refuse un appariement validé sans montant figé', () => {
    const { fraisAffreteur, ...sansMontant } = valide;
    assert.equal(inv('validationComplete').verifier(sansMontant), false);
  });

  it('n’impose rien aux états non validés', () => {
    assert.equal(
      inv('validationComplete').verifier({ ...valide, etat: ETAT_APPARIEMENT.RESERVER }),
      true,
    );
  });

  it('exige un motif sur un rejet', () => {
    assert.equal(
      inv('rejetMotive').verifier({ etat: ETAT_APPARIEMENT.REJETER, motifRejet: undefined }),
      false,
    );
    assert.equal(
      inv('rejetMotive').verifier({ etat: ETAT_APPARIEMENT.REJETER, motifRejet: 'vehicule_engage' }),
      true,
    );
  });

  it('refuse qu’un groupement soit ses deux propres parties', () => {
    assert.equal(
      inv('partiesDistinctes').verifier({ ...valide, groupementTransporteurId: 'g-a' }),
      false,
    );
  });
});

describe('Invariants — transport', () => {
  const inv = (n) => entite('transport').invariants.find((i) => i.nom === n);
  const journal = [
    { id: 'e-1', type: 'etape', valeur: 'valide', horodatage: '2026-03-01T10:00:00.000Z' },
    { id: 'e-2', type: 'etape', valeur: 'a_quai', horodatage: '2026-03-01T12:00:00.000Z' },
  ];

  it('refuse un journal vide', () => {
    assert.equal(inv('journalNonVide').verifier({ journal: [] }), false);
  });

  it('refuse un journal dans le désordre', () => {
    const desordre = [journal[1], journal[0]];
    assert.equal(inv('journalChronologique').verifier({ journal: desordre }), false);
  });

  it('accepte un journal ordonné', () => {
    assert.equal(inv('journalChronologique').verifier({ journal }), true);
  });

  it('refuse un incident de nature inconnue', () => {
    const avecIncident = [
      ...journal,
      { id: 'e-3', type: 'incident', valeur: 'météo', horodatage: '2026-03-01T13:00:00.000Z' },
    ];
    assert.equal(inv('incidentsBienFormes').verifier({ journal: avecIncident }), false);
  });

  it('lie la date de clôture à l’étape « clôturé », dans les deux sens', () => {
    const i = inv('clotureApresLivraison');
    assert.equal(i.verifier({ etape: ETAPE_TRANSPORT.LIVRE, clotureLe: null }), true);
    assert.equal(i.verifier({ etape: ETAPE_TRANSPORT.CLOTURE, clotureLe: '2026-03-05' }), true);
    assert.equal(
      i.verifier({ etape: ETAPE_TRANSPORT.LIVRE, clotureLe: '2026-03-05' }),
      false,
      'un transport non clôturé porte une date de clôture',
    );
    assert.equal(
      i.verifier({ etape: ETAPE_TRANSPORT.CLOTURE, clotureLe: null }),
      false,
      'un transport clôturé sans date',
    );
  });
});

describe('Invariants — mouvement de compte', () => {
  const inv = (n) => entite('operation').invariants.find((i) => i.nom === n);

  it('refuse un montant nul', () => {
    assert.equal(inv('montantStrictementPositif').verifier({ montant: 0 }), false);
  });

  it('exige une référence d’encaissement sur un rechargement', () => {
    assert.equal(inv('rechargementReference').verifier({ motif: 'rechargement' }), false);
    assert.equal(
      inv('rechargementReference').verifier({ motif: 'rechargement', referenceEncaissement: 'R-1' }),
      true,
    );
  });

  it('rattache des frais de mise en relation à un appariement', () => {
    assert.equal(
      inv('fraisRattachesAUnAppariement').verifier({
        motif: 'frais_mise_en_relation_affreteur',
      }),
      false,
    );
  });
});

describe('Invariants croisés — déclarés même s’ils sont appliqués ailleurs', () => {
  it('déclare les dix règles nommées par la conception', () => {
    const noms = INVARIANTS_CROISES.map((i) => i.nom);
    for (const attendu of [
      'doubleDebitAtomique',
      'coordonneesApresValidation',
      'soldeJamaisNegatif',
      'unSeulAppariementActifParOffre',
      'annulationImpossibleApresValidation',
    ]) {
      assert.ok(noms.includes(attendu), `Invariant croisé manquant : « ${attendu} ».`);
    }
  });

  it('désigne pour chacun le module qui le porte', () => {
    for (const i of INVARIANTS_CROISES) {
      assert.ok(i.porte_par && i.regle, `L'invariant « ${i.nom} » n'indique pas qui l'applique.`);
    }
  });
});

describe('Libellés — aucun statut ne s’affiche brut (D34)', () => {
  it('sert deux libellés différents pour « reserver » selon le lecteur', () => {
    const cote = labelOf(ETAT_APPARIEMENT.RESERVER, POV.TRANSPORTEUR);
    const autre = labelOf(ETAT_APPARIEMENT.RESERVER, POV.AFFRETEUR);
    assert.notEqual(cote, autre);
    assert.match(cote, /votre réponse/);
    assert.match(autre, /réponse du transporteur/);
  });

  it('dit à l’affréteur que c’est à lui d’agir quand l’offre est acceptée', () => {
    assert.match(labelOf(ETAT_APPARIEMENT.ACCEPTER, POV.AFFRETEUR), /à vous de valider/);
  });

  it('retombe sur le libellé neutre si le point de vue n’en a pas', () => {
    assert.equal(labelOf(ETAPE_TRANSPORT.EN_ROUTE, POV.AFFRETEUR), 'En route');
  });

  it('lève sur une valeur sans libellé, plutôt que d’afficher le code brut', () => {
    assert.throws(() => labelOf('etat_non_declare'), /jamais être affiché brut/);
  });

  it('D34 — TOUTE valeur stockée affichable porte un libellé', () => {
    // La règle ne vaut que si elle couvre tous les états, pas seulement ceux du
    // fil narratif : `badge()` lève désormais sur une valeur non libellée, donc
    // un état oublié casse un écran au lieu d'afficher « validee » en minuscules.
    const aLibeller = [
      ...Object.values(ETAT_APPARIEMENT),
      ...Object.values(ETAPE_TRANSPORT),
      ...Object.values(ETAT_DECLARATION),
      ...Object.values(ETAT_DEMANDE),
      ...Object.values(ETAT_OFFRE),
      ...Object.values(ETAT_VEHICULE),
      ...Object.values(ETAT_COMPTE),
      ...Object.values(ETAT_ABONNEMENT),
      ...Object.values(TYPE_GROUPEMENT),
      ...Object.values(NATURE_INCIDENT),
      ...Object.values(MOTIF_REJET),
    ];
    for (const v of aLibeller) {
      assert.doesNotThrow(() => labelOf(v), `La valeur « ${v} » s'afficherait brute.`);
    }
  });

  it('libelle chaque état d’appariement et chaque étape de transport', () => {
    for (const v of [
      ...Object.values(ETAT_APPARIEMENT),
      ...Object.values(ETAPE_TRANSPORT),
    ]) {
      assert.ok(LIBELLES[v], `La valeur « ${v} » n'a pas de libellé.`);
    }
  });
});
