/**
 * Tests de la matrice des droits.
 *
 * Les quatre règles que `plan-suivi.md` § 3.5 désigne comme devant faire l'objet
 * d'un test dédié y sont, plus les vérifications de cohérence de la matrice
 * elle-même — un rôle oublié dans une table est une faille silencieuse.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { NIVEAU, NOMBRE_ROLES, ROLES, rolesDuNiveau } from '../js/domain/roles.js';
import {
  CLASSIFICATIONS_LISIBLES,
  DROITS,
  MATRICE,
  PORTEE,
  droitsSensibles,
  peutLireClassification,
  porteeDe,
} from '../js/domain/permissions.js';
import { CLASSIFICATION } from '../js/domain/schema.js';

describe('Cohérence de la matrice', () => {
  it('déclare chaque rôle dans la matrice ET dans les classifications lisibles', () => {
    for (const id of Object.keys(ROLES)) {
      assert.ok(MATRICE[id] !== undefined, `Rôle « ${id} » absent de MATRICE.`);
      assert.ok(
        CLASSIFICATIONS_LISIBLES[id] !== undefined,
        `Rôle « ${id} » absent de CLASSIFICATIONS_LISIBLES.`,
      );
    }
  });

  it("n'accorde aucun droit hors du catalogue", () => {
    for (const [roleId, table] of Object.entries(MATRICE)) {
      for (const droit of Object.keys(table)) {
        assert.ok(DROITS[droit], `Droit « ${droit} » accordé à « ${roleId} » mais non catalogué.`);
      }
    }
  });

  it("n'autorise la classification systeme pour aucun rôle", () => {
    for (const id of Object.keys(ROLES)) {
      assert.equal(
        peutLireClassification(id, CLASSIFICATION.SYSTEME),
        false,
        `Le rôle « ${id} » pourrait lire des données système.`,
      );
    }
  });

  it('refuse par défaut un droit non déclaré', () => {
    assert.equal(porteeDe('agent_caisse', 'appariement.valider'), PORTEE.AUCUNE);
    assert.equal(porteeDe('super_admin', 'compte.crediter'), PORTEE.AUCUNE);
  });

  it('lève sur un rôle ou un droit inconnu, au lieu de refuser en silence', () => {
    assert.throws(() => porteeDe('role_inexistant', 'compte.lire'), /Rôle inconnu/);
    assert.throws(() => porteeDe('affreteur', 'droit.inexistant'), /Droit inconnu/);
  });

  it('répartit les rôles sur les trois niveaux, sans reste', () => {
    const total =
      rolesDuNiveau(NIVEAU.DEMONTRE).length +
      rolesDuNiveau(NIVEAU.DECLINE).length +
      rolesDuNiveau(NIVEAU.MODELISE).length;
    assert.equal(total, NOMBRE_ROLES);
  });

  it('attribue une preuve à chaque rôle — aucun rôle inventé', () => {
    for (const [id, r] of Object.entries(ROLES)) {
      assert.ok(
        typeof r.preuve === 'string' && r.preuve.length > 0,
        `Le rôle « ${id} » ne cite aucune preuve dans le système existant.`,
      );
    }
  });

  it('marque comme testés les droits sensibles annoncés au plan', () => {
    const sensibles = droitsSensibles();
    for (const d of [
      'appariement.valider',
      'appariement.repondre',
      'appariement.annuler',
      'coordonnees.lire',
      'compte.lire',
      'compte.crediter',
    ]) {
      assert.ok(sensibles.includes(d), `Le droit « ${d} » devrait être marqué testé.`);
    }
  });
});

describe("Règle 1 — l'auxiliaire ne valide pas", () => {
  it("refuse la validation à l'auxiliaire d'affréteur", () => {
    assert.equal(porteeDe('auxiliaire_affreteur', 'appariement.valider'), PORTEE.AUCUNE);
  });

  it("l'accorde en revanche à l'affréteur de plein exercice", () => {
    assert.equal(porteeDe('affreteur', 'appariement.valider'), PORTEE.GROUPEMENT);
  });

  it("laisse l'annulation à l'auxiliaire — elle n'engage aucune dépense (D37)", () => {
    assert.equal(porteeDe('auxiliaire_affreteur', 'appariement.annuler'), PORTEE.GROUPEMENT);
  });

  it("refuse à l'auxiliaire de transporteur la réponse aux réservations", () => {
    assert.equal(porteeDe('auxiliaire_transporteur', 'appariement.repondre'), PORTEE.AUCUNE);
    assert.equal(porteeDe('transporteur', 'appariement.repondre'), PORTEE.GROUPEMENT);
  });

  it("refuse la réponse aux DEUX auxiliaires — accepter engage un débit à venir", () => {
    // L'affréteur détient `appariement.repondre` pour le sens B (il répond aux
    // propositions reçues sur sa demande). Ses auxiliaires, non.
    assert.equal(porteeDe('affreteur', 'appariement.repondre'), PORTEE.GROUPEMENT);
    for (const id of ['auxiliaire_affreteur', 'auxiliaire_transporteur']) {
      assert.equal(porteeDe(id, 'appariement.repondre'), PORTEE.AUCUNE, id);
    }
  });

  it('prive les auxiliaires de la gestion des utilisateurs', () => {
    for (const id of ['auxiliaire_affreteur', 'auxiliaire_transporteur']) {
      assert.equal(porteeDe(id, 'utilisateur.gerer'), PORTEE.AUCUNE);
    }
  });
});

describe('Règle 2 — la DGTTC ne transige pas et ne voit pas les comptes', () => {
  const actions = [
    'declaration.creer',
    'demande.creer',
    'demande.publier',
    'offre.publier',
    'offre.retirer',
    'appariement.reserver',
    'appariement.proposer',
    'appariement.repondre',
    'appariement.valider',
    'appariement.annuler',
    'transport.avancer',
    'transport.cloturer',
    'compte.crediter',
    'tarif.modifier',
    'abonnement.prolonger',
    'groupement.gerer',
    'utilisateur.gerer',
  ];

  for (const droit of actions) {
    it(`refuse « ${droit} »`, () => {
      assert.equal(porteeDe('dgttc', droit), PORTEE.AUCUNE);
    });
  }

  it('refuse tout accès aux soldes et aux mouvements', () => {
    assert.equal(porteeDe('dgttc', 'compte.lire'), PORTEE.AUCUNE);
    assert.equal(porteeDe('dgttc', 'tarif.lire'), PORTEE.AUCUNE);
  });

  it('refuse la classification financière au niveau des données, pas seulement à l’écran', () => {
    assert.equal(peutLireClassification('dgttc', CLASSIFICATION.FINANCIER), false);
  });

  it('refuse également les coordonnées privées', () => {
    assert.equal(porteeDe('dgttc', 'coordonnees.lire'), PORTEE.AUCUNE);
    assert.equal(peutLireClassification('dgttc', CLASSIFICATION.CONTACT), false);
  });

  it('lui laisse en revanche la consultation et le journal d’audit', () => {
    assert.equal(porteeDe('dgttc', 'controle.etats'), PORTEE.TOUT);
    assert.equal(porteeDe('dgttc', 'audit.lire'), PORTEE.TOUT);
    assert.equal(porteeDe('dgttc', 'appariement.lire'), PORTEE.TOUT);
  });
});

describe('Règle 3 — le concessionnaire supervise sans transiger', () => {
  const actionsDeMarche = [
    'declaration.creer',
    'demande.creer',
    'demande.publier',
    'offre.publier',
    'offre.retirer',
    'appariement.reserver',
    'appariement.proposer',
    'appariement.repondre',
    'appariement.valider',
    'appariement.annuler',
    'transport.avancer',
    'transport.cloturer',
  ];

  for (const droit of actionsDeMarche) {
    it(`refuse « ${droit} »`, () => {
      assert.equal(porteeDe('concessionnaire', droit), PORTEE.AUCUNE);
    });
  }

  it('lui accorde le crédit manuel et le catalogue de tarifs', () => {
    assert.equal(porteeDe('concessionnaire', 'compte.crediter'), PORTEE.TOUT);
    assert.equal(porteeDe('concessionnaire', 'tarif.modifier'), PORTEE.TOUT);
  });

  it('lui refuse les coordonnées privées — moindre privilège', () => {
    assert.equal(porteeDe('concessionnaire', 'coordonnees.lire'), PORTEE.AUCUNE);
    assert.equal(peutLireClassification('concessionnaire', CLASSIFICATION.CONTACT), false);
  });
});

describe('Règle 4 — les rôles de niveau 3 n’ouvrent aucune porte métier', () => {
  const dangereux = [
    'appariement.valider',
    'appariement.reserver',
    'appariement.repondre',
    'compte.crediter',
    'compte.lire',
    'tarif.modifier',
    'coordonnees.lire',
    'utilisateur.gerer',
  ];

  for (const r of rolesDuNiveau(NIVEAU.MODELISE)) {
    for (const droit of dangereux) {
      it(`« ${r.id} » n'obtient pas « ${droit} »`, () => {
        assert.equal(porteeDe(r.id, droit), PORTEE.AUCUNE);
      });
    }
  }

  it('laisse le super administrateur sans aucun droit métier, délibérément', () => {
    assert.equal(Object.keys(MATRICE.super_admin).length, 0);
  });
});

describe('Niveau 2 — les déclinaisons varient par déclaration, pas par du code d’écran', () => {
  it('prive le transporteur privé de la publication d’offre', () => {
    assert.equal(porteeDe('transporteur_prive', 'offre.publier'), PORTEE.AUCUNE);
    assert.equal(porteeDe('transporteur_prive', 'appariement.proposer'), PORTEE.GROUPEMENT);
  });

  it('prive le partenaire de tout accès au marché', () => {
    assert.equal(porteeDe('partenaire', 'marche.offres'), PORTEE.AUCUNE);
    assert.equal(porteeDe('partenaire', 'marche.demandes'), PORTEE.AUCUNE);
    assert.equal(porteeDe('partenaire', 'offre.publier'), PORTEE.AUCUNE);
    assert.equal(porteeDe('partenaire', 'dut.generer'), PORTEE.GROUPEMENT);
  });

  it('laisse au transporteur étranger les droits du transporteur', () => {
    assert.equal(porteeDe('transporteur_etranger', 'offre.publier'), PORTEE.GROUPEMENT);
  });
});

describe('Cloisonnement — personne ne lit les données d’autrui par défaut', () => {
  const acteursDuMarche = [
    'affreteur',
    'transporteur',
    'auxiliaire_affreteur',
    'auxiliaire_transporteur',
    'transporteur_prive',
    'transporteur_etranger',
    'partenaire',
  ];

  for (const id of acteursDuMarche) {
    it(`« ${id} » ne lit les comptes qu'au niveau de son groupement`, () => {
      const p = porteeDe(id, 'compte.lire');
      assert.ok(
        p === PORTEE.AUCUNE || p === PORTEE.GROUPEMENT,
        `Portée trop large sur compte.lire : ${p}`,
      );
    });

    it(`« ${id} » n'accède pas au journal d'audit`, () => {
      assert.equal(porteeDe(id, 'audit.lire'), PORTEE.AUCUNE);
    });

    it(`« ${id} » n'accède pas au tableau de bord d'activité de la plateforme`, () => {
      assert.equal(porteeDe(id, 'dashboard.activite'), PORTEE.AUCUNE);
    });
  }
});
