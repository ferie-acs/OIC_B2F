/**
 * Tests du moteur de décision.
 *
 * Le cas central est celui que l'ux-designer a signalé comme le point de
 * vigilance du POC : **les coordonnées du transporteur ne doivent jamais être
 * servies avant l'état `valider`**. Leur transmission est ce que la plateforme
 * vend.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { MOTIF_REFUS, decider, exiger, projeter } from '../js/domain/access.js';
import { PORTEE } from '../js/domain/permissions.js';

const G_AFFRETEUR = 'grp-affreteur-1';
const G_TRANSPORTEUR = 'grp-transporteur-1';
const G_TIERS = 'grp-transporteur-2';

/** @param {object} [surcharge] */
const ctxAffreteur = (surcharge = {}) => ({
  utilisateurId: 'u-1',
  roleId: 'affreteur',
  groupementId: G_AFFRETEUR,
  compteActif: true,
  abonnementActif: true,
  objetsLiberes: new Set(),
  ...surcharge,
});

/** @param {object} [surcharge] */
const ctxDgttc = (surcharge = {}) => ({
  utilisateurId: 'u-dgttc',
  roleId: 'dgttc',
  groupementId: null,
  compteActif: true,
  abonnementActif: true,
  objetsLiberes: new Set(),
  ...surcharge,
});

/** Groupement transporteur tiers, tel que stocké. */
const groupementTransporteur = {
  id: G_TRANSPORTEUR,
  raisonSociale: 'Transports Démo SARL',
  type: 'transporteur',
  rccm: 'CI-DEMO-0001',
  pays: 'Côte d’Ivoire',
  contactNom: 'Awa Démo',
  contactTelephone: '+225 00 00 00 00',
  contactEmail: 'contact@demo.invalid',
  adresse: '12 rue de la Démonstration',
  etat: 'actif',
  creeLe: '2026-01-01T00:00:00.000Z',
  demo: true,
};

describe('Décision — cloisonnement par groupement', () => {
  it('autorise sur son propre groupement', () => {
    const d = decider(ctxAffreteur(), 'declaration.lire', { groupementId: G_AFFRETEUR });
    assert.equal(d.autorise, true);
    assert.equal(d.portee, PORTEE.GROUPEMENT);
  });

  it("refuse sur le groupement d'autrui, avec un motif lisible", () => {
    const d = decider(ctxAffreteur(), 'declaration.lire', { groupementId: G_TIERS });
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.HORS_PERIMETRE);
    assert.match(d.explication, /autre groupement/);
  });

  it('autorise la lecture du marché sur un objet publié par un tiers', () => {
    const d = decider(ctxAffreteur(), 'marche.offres', { groupementId: G_TIERS, publie: true });
    assert.equal(d.autorise, true);
    assert.equal(d.portee, PORTEE.MARCHE);
  });

  it('autorise partout un rôle institutionnel doté de la portée TOUT', () => {
    const d = decider(ctxDgttc(), 'appariement.lire', { groupementId: G_TIERS });
    assert.equal(d.autorise, true);
    assert.equal(d.portee, PORTEE.TOUT);
  });
});

describe('Décision — portée « propre » : les notifications sont personnelles', () => {
  const notif = (destinataire) => ({ utilisateurId: destinataire, groupementId: G_AFFRETEUR });

  it('laisse lire ses propres notifications', () => {
    const d = decider(ctxAffreteur(), 'notification.lire', notif('u-1'));
    assert.equal(d.autorise, true);
    assert.equal(d.portee, PORTEE.PROPRE);
  });

  it("refuse celles d'un collègue du MÊME groupement", () => {
    const d = decider(ctxAffreteur(), 'notification.lire', notif('u-2'));
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.HORS_PERIMETRE);
    assert.match(d.explication, /ne vous est pas destiné/);
  });

  it('fonctionne pour un rôle institutionnel, qui n’a pourtant aucun groupement', () => {
    const d = decider(ctxDgttc(), 'notification.lire', {
      utilisateurId: 'u-dgttc',
      groupementId: null,
    });
    assert.equal(d.autorise, true, 'un rôle sans groupement doit lire ses notifications');
  });
});

describe('Décision — refus expliqués (D32 : on explique, on ne masque pas)', () => {
  it('explique la RAISON MÉTIER du refus, et nomme le rôle (QA-05)', () => {
    const d = decider(
      { ...ctxAffreteur(), roleId: 'auxiliaire_affreteur' },
      'appariement.valider',
    );
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.DROIT_ABSENT);
    // La conception UX (§ 2.2) exige d'expliquer POURQUOI, pas de nommer le
    // droit manquant : « le rôle ne dispose pas du droit Valider » décrit la
    // règle sans l'enseigner.
    assert.match(d.explication, /engage les finances/);
    assert.match(d.explication, /prévenez votre responsable/);
    assert.match(d.explication, /Auxiliaire d'affréteur/);
  });

  it('retombe sur le nom du droit quand aucune raison métier n’est déclarée', () => {
    const d = decider({ ...ctxAffreteur(), roleId: 'auxiliaire_affreteur' }, 'utilisateur.gerer');
    assert.equal(d.autorise, false);
    assert.match(d.explication, /ne dispose pas du droit/);
  });

  it('ferme l’accès si l’abonnement a expiré', () => {
    const d = decider(ctxAffreteur({ abonnementActif: false }), 'declaration.creer');
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.ABONNEMENT_EXPIRE);
  });

  it("laisse néanmoins consulter l'abonnement, pour pouvoir le renouveler", () => {
    const d = decider(ctxAffreteur({ abonnementActif: false }), 'abonnement.lire');
    assert.equal(d.autorise, true);
  });

  it("n'applique pas la règle d'abonnement aux rôles institutionnels", () => {
    const d = decider(ctxDgttc({ abonnementActif: false }), 'controle.etats');
    assert.equal(d.autorise, true);
  });

  it('ferme tout pour un compte suspendu', () => {
    const d = decider(ctxAffreteur({ compteActif: false }), 'abonnement.lire');
    assert.equal(d.autorise, false);
    assert.equal(d.motif, MOTIF_REFUS.COMPTE_SUSPENDU);
  });

  it('lève via exiger(), pour interrompre un service au lieu de le laisser continuer', () => {
    assert.throws(
      () => exiger(ctxAffreteur(), 'compte.crediter', { groupementId: G_AFFRETEUR }),
      /Accès refusé \(compte\.crediter\)/,
    );
  });
});

describe('Projection — les coordonnées ne sortent pas avant « valider »', () => {
  it('retire les coordonnées d’un transporteur tant qu’aucune validation ne lie les parties', () => {
    const vu = projeter(ctxAffreteur(), 'groupement', groupementTransporteur);

    assert.equal(vu.raisonSociale, 'Transports Démo SARL', 'l’identité reste visible');
    assert.equal(vu.rccm, 'CI-DEMO-0001');

    for (const champ of ['contactNom', 'contactTelephone', 'contactEmail', 'adresse']) {
      assert.equal(
        champ in vu,
        false,
        `Le champ « ${champ} » a fuité avant la validation de la mise en relation.`,
      );
    }
  });

  it('les libère une fois le groupement débloqué par une validation', () => {
    const ctx = ctxAffreteur({ objetsLiberes: new Set([`groupement:${G_TRANSPORTEUR}`]) });
    const vu = projeter(ctx, 'groupement', groupementTransporteur);

    assert.equal(vu.contactTelephone, '+225 00 00 00 00');
    assert.equal(vu.contactEmail, 'contact@demo.invalid');
    assert.equal(vu.contactNom, 'Awa Démo');
  });

  it('ne libère que le groupement concerné, pas les autres', () => {
    const ctx = ctxAffreteur({ objetsLiberes: new Set([`groupement:${G_TRANSPORTEUR}`]) });
    const autre = { ...groupementTransporteur, id: G_TIERS, groupementId: G_TIERS };
    const vu = projeter(ctx, 'groupement', autre, { proprietaireId: G_TIERS });

    assert.equal('contactTelephone' in vu, false);
  });

  it('laisse chacun voir ses propres coordonnées', () => {
    const sien = { ...groupementTransporteur, id: G_AFFRETEUR };
    const vu = projeter(ctxAffreteur(), 'groupement', sien, { proprietaireId: G_AFFRETEUR });
    assert.equal(vu.contactTelephone, '+225 00 00 00 00');
  });

  it('retire les coordonnées du chauffeur avant validation', () => {
    const chauffeur = {
      id: 'ch-1',
      groupementId: G_TRANSPORTEUR,
      nom: 'Kouadio Démo',
      permisNumero: 'P-DEMO-1',
      telephone: '+225 11 11 11 11',
      creeLe: '2026-01-01T00:00:00.000Z',
      demo: true,
    };
    const vu = projeter(ctxAffreteur(), 'chauffeur', chauffeur);

    assert.equal('nom' in vu, false, 'le nom du chauffeur est une coordonnée');
    assert.equal('permisNumero' in vu, false);
    assert.equal('telephone' in vu, false);
    assert.equal(vu.groupementId, G_TRANSPORTEUR, 'le rattachement reste lisible');
  });

  it('retire la carte grise du véhicule mais laisse l’immatriculation', () => {
    const vehicule = {
      id: 'v-1',
      groupementId: G_TRANSPORTEUR,
      immatriculation: '1234 AB 01',
      carteGrise: 'CG-DEMO-1',
      capaciteT: 25,
      ptacT: 38,
      carteTransportNumero: 'CT-DEMO-1',
      carteTransportEcheance: '2027-01-01',
      etat: 'disponible',
      creeLe: '2026-01-01T00:00:00.000Z',
      demo: true,
    };
    const vu = projeter(ctxAffreteur(), 'vehicule', vehicule);

    assert.equal(vu.immatriculation, '1234 AB 01', 'critère de choix sur le marché');
    assert.equal('carteGrise' in vu, false, 'pièce du dossier, transmise après validation');
  });
});

describe('Projection — la DGTTC ne reçoit aucune donnée financière', () => {
  const appariementValide = {
    id: 'ap-1',
    reference: 'MR-2026-0001',
    offreId: 'of-1',
    demandeId: 'dt-1',
    groupementAffreteurId: G_AFFRETEUR,
    groupementTransporteurId: G_TRANSPORTEUR,
    sens: 'offre_vers_demande',
    etat: 'valider',
    reserveLe: '2026-02-01T08:00:00.000Z',
    valideLe: '2026-02-02T10:00:00.000Z',
    fraisAffreteur: 15000,
    fraisTransporteur: 15000,
    operationAffreteurId: 'op-1',
    operationTransporteurId: 'op-2',
    demo: true,
  };

  it('retire les montants et les références d’écriture', () => {
    const vu = projeter(ctxDgttc(), 'appariement', appariementValide);

    assert.equal(vu.reference, 'MR-2026-0001', 'la mise en relation reste consultable');
    assert.equal(vu.etat, 'valider');
    assert.equal(vu.valideLe, '2026-02-02T10:00:00.000Z');

    for (const champ of [
      'fraisAffreteur',
      'fraisTransporteur',
      'operationAffreteurId',
      'operationTransporteurId',
    ]) {
      assert.equal(champ in vu, false, `La DGTTC reçoit « ${champ} », ce qu'interdit N3.`);
    }
  });

  it("les sert en revanche à l'affréteur partie à l'appariement", () => {
    const vu = projeter(ctxAffreteur(), 'appariement', appariementValide, {
      proprietaireId: G_AFFRETEUR,
    });
    assert.equal(vu.fraisAffreteur, 15000);
    assert.equal(vu.fraisTransporteur, 15000);
  });
});

describe('Projection — les données système ne sortent jamais', () => {
  const utilisateur = {
    id: 'u-1',
    email: 'demo@demo.invalid',
    nom: 'Démo',
    roleId: 'affreteur',
    groupementId: G_AFFRETEUR,
    motDePasse: { algo: 'PBKDF2-SHA256', iterations: 100000, sel: 'xxx', empreinte: 'yyy' },
    etat: 'actif',
    creeLe: '2026-01-01T00:00:00.000Z',
    demo: true,
  };

  for (const roleId of ['affreteur', 'concessionnaire', 'dgttc', 'super_admin']) {
    it(`« ${roleId} » ne reçoit pas l'empreinte de mot de passe`, () => {
      const ctx = { ...ctxAffreteur(), roleId, groupementId: G_AFFRETEUR };
      const vu = projeter(ctx, 'utilisateur', utilisateur, { proprietaireId: G_AFFRETEUR });
      assert.equal('motDePasse' in vu, false);
    });
  }

  it("ignore les champs absents du schéma, plutôt que de les recopier", () => {
    const pollue = { ...utilisateur, champInjecte: 'valeur inattendue' };
    const vu = projeter(ctxAffreteur(), 'utilisateur', pollue, { proprietaireId: G_AFFRETEUR });
    assert.equal('champInjecte' in vu, false);
  });
});

describe('Projection — propriétaire inconnu, rien n’est libéré', () => {
  it("ne libère aucune coordonnée d'une entité à deux parties sans propriétaire fourni", () => {
    // `appariement` ne déclare aucun propriétaire : il en a deux. Sans indication
    // de l'appelant, la projection doit se fermer, jamais deviner.
    const ctx = ctxAffreteur({ objetsLiberes: new Set(['offre:of-1']) });
    const offre = {
      id: 'of-1',
      reference: 'OV-2026-0001',
      groupementId: G_TRANSPORTEUR,
      vehiculeId: 'v-1',
      chauffeurPressentiId: 'ch-1',
      localiteDepartId: 'loc-1',
      localiteArriveeId: 'loc-2',
      disponibleDu: '2026-03-01T00:00:00.000Z',
      disponibleAu: '2026-03-05T00:00:00.000Z',
      etat: 'disponible',
      publieeLe: '2026-02-20T00:00:00.000Z',
      demo: true,
    };

    // Propriétaire explicitement inconnu : le chauffeur pressenti reste couvert.
    const aveugle = projeter(ctx, 'offre', offre, { proprietaireId: null });
    assert.equal('chauffeurPressentiId' in aveugle, false);

    // Propriétaire connu et libéré : il apparaît.
    const eclaire = projeter(ctx, 'offre', offre);
    assert.equal(eclaire.chauffeurPressentiId, 'ch-1');
  });

  it("garde couvert le chauffeur pressenti d'une offre non encore validée", () => {
    const offre = {
      id: 'of-2',
      reference: 'OV-2026-0002',
      groupementId: G_TIERS,
      vehiculeId: 'v-2',
      chauffeurPressentiId: 'ch-2',
      localiteDepartId: 'loc-1',
      localiteArriveeId: 'loc-2',
      disponibleDu: '2026-03-01T00:00:00.000Z',
      disponibleAu: '2026-03-05T00:00:00.000Z',
      etat: 'disponible',
      publieeLe: '2026-02-20T00:00:00.000Z',
      demo: true,
    };
    const vu = projeter(ctxAffreteur(), 'offre', offre);

    assert.equal(vu.reference, 'OV-2026-0002', "l'offre reste visible sur le marché");
    assert.equal('chauffeurPressentiId' in vu, false, 'le chauffeur pressenti a fuité');
  });
});
