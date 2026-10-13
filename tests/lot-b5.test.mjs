/**
 * Lot b5 : administration OIC et espace DGTTC.
 *
 * Comptes du back-office, paramétrage encadré des habilitations, gestion des
 * entreprises (quatre yeux, suspension), référentiels, incidents applicatifs,
 * flux public sans identité, exports DGTTC sans montant. Les refus sont
 * vérifiés autant que les réussites : mauvais rôle, autre périmètre, état
 * invalide, soi-même.
 */

import { strict as assert } from 'node:assert';
import { before, beforeEach, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const memoireSession = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoireSession.has(k) ? memoireSession.get(k) : null),
  setItem: (k, v) => void memoireSession.set(k, v),
  removeItem: (k) => void memoireSession.delete(k),
};

const { installerDom } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer, completerJeuAntiFraude } = await import('../js/seed.js');
const { amorcerLotB5 } = await import('../js/seed-lot-b5.js');
// Intégration b2 / b5 : les intermédiaires de fret sont les entreprises du lot b2.
const { completerJeuLotB2 } = await import('../js/seed-lot-b2.js');
const { connecter, contexteDe } = await import('../js/services/auth.service.js');
const agents = await import('../js/services/agents.service.js');
const habilitations = await import('../js/services/habilitations.service.js');
const gestion = await import('../js/services/groupements-admin.service.js');
const referentiels = await import('../js/services/referentiels.service.js');
const incidents = await import('../js/services/incidents-app.service.js');
const { construireFlux, genererFlux } = await import('../js/services/flux-offres.service.js');
const dgttc = await import('../js/services/dgttc.service.js');
const matching = await import('../js/services/matching.service.js');
const { cataloguePublic } = await import('../js/services/marche-public.service.js');
const { celluleCsv, versCsv } = await import('../js/services/export-csv.js');
const {
  DROITS, DROITS_PARAMETRABLES, DROITS_VERROUILLES, MATRICE, PORTEE,
  appliquerParametrage, controlerParametrage, porteeDe,
} = await import('../js/domain/permissions.js');
const { decider } = await import('../js/domain/access.js');
const { ROLES } = await import('../js/domain/roles.js');
const { arborescenceDe } = await import('../js/core/nav.js');

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));
// Intégration : le code d'accès part par la messagerie unique, à l'adresse
// enregistrée ; le test le lit là où le destinataire le lirait.
const codeRecu = (utilisateurId) => depot('message')
  .brutOu((m) => m.modele === 'acces.code' && m.destinataireUtilisateurId === utilisateurId)
  .sort((a, b) => String(a.envoyeLe).localeCompare(String(b.envoyeLe))).pop()?.code;

async function installer() {
  appliquerParametrage([]);
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  await completerJeuAntiFraude();
  await amorcerLotB5();
}

/* ------------------------------------------------------------------ */

describe('Lot b5 — matrice : nouveaux droits, sans affaiblir la conception', () => {
  it('accorde l’administration au seul concessionnaire', () => {
    for (const d of ['agent.gerer', 'habilitation.parametrer', 'groupement.suspendre', 'referentiel.gerer', 'incident.traiter', 'flux.offres']) {
      for (const r of Object.keys(ROLES)) {
        const attendu = r === 'concessionnaire' ? PORTEE.TOUT : PORTEE.AUCUNE;
        assert.equal(porteeDe(r, d), attendu, `${d} pour ${r}`);
      }
    }
  });

  it('borne la gestion des comptes DGTTC à son organisation', () => {
    assert.equal(porteeDe('dgttc', 'institution.utilisateurs'), PORTEE.GROUPEMENT);
    assert.equal(porteeDe('dgttc', 'utilisateur.gerer'), PORTEE.AUCUNE);
    assert.equal(porteeDe('concessionnaire', 'institution.utilisateurs'), PORTEE.AUCUNE);
  });

  it('laisse le super administrateur sans aucun droit', () => {
    assert.equal(Object.keys(MATRICE.super_admin).length, 0);
  });

  it('ne déclare paramétrable aucun droit mutant, financier ou verrouillé', () => {
    for (const d of DROITS_PARAMETRABLES) {
      assert.notEqual(DROITS[d].mutation, true, d);
      assert.ok(!DROITS_VERROUILLES[d], d);
      assert.ok(!/^(compte|tarif|abonnement|coordonnees)\./.test(d), d);
    }
  });
});

describe('Lot b5 — paramétrage encadré des habilitations', () => {
  before(installer);
  beforeEach(() => habilitations.chargerParametrage());

  it('refuse de donner un droit anti-fraude, quel que soit le profil', () => {
    for (const d of ['appariement.valider', 'compte.crediter', 'compte.valider_credit', 'groupement.verifier', 'groupement.suspendre', 'coordonnees.lire']) {
      for (const r of Object.keys(ROLES)) {
        assert.equal(controlerParametrage(r, d).autorise, false, `${d} / ${r}`);
      }
    }
  });

  it('refuse de paramétrer un acteur du marché ou le super administrateur', () => {
    assert.equal(controlerParametrage('affreteur', 'audit.lire').autorise, false);
    assert.equal(controlerParametrage('transporteur', 'declaration.lire').autorise, false);
    assert.equal(controlerParametrage('super_admin', 'dut.lire').autorise, false);
  });

  it('ignore une décision de paramétrage non conforme glissée dans le stockage', () => {
    const ecartees = appliquerParametrage([
      { roleId: 'dgttc', droit: 'compte.lire', accorde: true },
      { roleId: 'agent_caisse', droit: 'appariement.valider', accorde: true },
    ]);
    assert.equal(ecartees.length, 2);
    assert.equal(porteeDe('dgttc', 'compte.lire'), PORTEE.AUCUNE);
    assert.equal(porteeDe('agent_caisse', 'appariement.valider'), PORTEE.AUCUNE);
    appliquerParametrage([]);
  });

  it('active puis retire un droit de consultation, avec motif et historique', () => {
    const conc = ctxDe('u-conc');
    assert.equal(decider(ctxDe('u-activ'), 'dut.lire').autorise, false);
    habilitations.modifierHabilitation(conc, { roleId: 'activation_inscription', droit: 'dut.lire', accorder: true, motif: 'Contrôle des DUT lors des vérifications.' });
    assert.equal(porteeDe('activation_inscription', 'dut.lire'), PORTEE.TOUT);
    assert.ok(arborescenceDe(ctxDe('u-activ')).flatMap((z) => z.pages).some((p) => p.route === 'duts'), 'page des DUT au menu');

    habilitations.modifierHabilitation(conc, { roleId: 'activation_inscription', droit: 'dut.lire', accorder: false, motif: 'Fin de la mission de contrôle.' });
    assert.equal(porteeDe('activation_inscription', 'dut.lire'), PORTEE.AUCUNE);
    assert.equal(depot('habilitation').brutTous().length, 2);
    assert.ok(depot('audit').brutOu((e) => e.evenement === 'habilitation_modifiee').length >= 2);
  });

  it('retire à la DGTTC un droit de conception, puis y revient', () => {
    const conc = ctxDe('u-conc');
    habilitations.modifierHabilitation(conc, { roleId: 'dgttc', droit: 'audit.lire', accorder: false, motif: 'Journal réservé pendant l’audit interne.' });
    assert.equal(decider(ctxDe('u-dgttc'), 'audit.lire').autorise, false);
    habilitations.modifierHabilitation(conc, { roleId: 'dgttc', droit: 'audit.lire', accorder: true, motif: 'Audit interne terminé.' });
    assert.equal(porteeDe('dgttc', 'audit.lire'), PORTEE.TOUT);
  });

  it('refuse le paramétrage sans motif, sans droit, ou sans effet', () => {
    const conc = ctxDe('u-conc');
    assert.throws(() => habilitations.modifierHabilitation(conc, { roleId: 'dgttc', droit: 'dut.lire', accorder: true, motif: '' }), /Motif/);
    assert.throws(() => habilitations.modifierHabilitation(ctxDe('u-dgttc'), { roleId: 'dgttc', droit: 'dut.lire', accorder: true, motif: 'Je me donne ce droit.' }), /Accès refusé/);
    assert.throws(() => habilitations.modifierHabilitation(conc, { roleId: 'dgttc', droit: 'audit.lire', accorder: true, motif: 'Déjà accordé pourtant.' }), /déjà accordé/);
    assert.throws(() => habilitations.modifierHabilitation(conc, { roleId: 'dgttc', droit: 'compte.lire', accorder: true, motif: 'Voir les soldes.' }), /paramétrable|verrouillé|conception/);
  });

  it('ne sert jamais de montant à la DGTTC, même dotée d’un droit supplémentaire', async () => {
    const conc = ctxDe('u-conc');
    habilitations.modifierHabilitation(conc, { roleId: 'dgttc', droit: 'dut.lire', accorder: true, motif: 'Contrôle documentaire.' });
    const vu = depot('appariement').lisiblesPar(ctxDe('u-dgttc'), 'appariement.lire');
    assert.ok(vu.every((a) => !('fraisAffreteur' in a)));
    habilitations.modifierHabilitation(conc, { roleId: 'dgttc', droit: 'dut.lire', accorder: false, motif: 'Fin du contrôle.' });
  });
});

describe('Lot b5 — comptes du back-office OIC', () => {
  before(installer);

  it('crée un agent sans mot de passe connu et adresse un code à son adresse', async () => {
    const res = await agents.creerCompte(ctxDe('u-conc'), {
      nom: 'TANOH', prenom: 'Éric', email: 'Eric.Tanoh@demo.invalid', roleId: 'agent_caisse', motif: 'Prise de poste au guichet.',
    });
    const u = depot('utilisateur').brutParId(res.utilisateurId);
    assert.equal(u.email, 'eric.tanoh@demo.invalid');
    assert.equal(u.roleId, 'agent_caisse');
    assert.equal(res.message.simule, true);
    assert.match(res.message.destinataire, /^e•+@demo\.invalid$/);
    assert.equal(res.message.code, undefined, 'le code n’est pas rendu à l’administrateur');
    const msg = depot('message').brutOu((m) => m.modele === 'acces.code' && m.destinataireUtilisateurId === res.utilisateurId)[0];
    assert.equal(msg.adresse, 'eric.tanoh@demo.invalid');
    await assert.rejects(() => connecter('eric.tanoh@demo.invalid', 'demo2026'), /Identifiants incorrects/);
    await agents.utiliserCodeAcces({ email: 'eric.tanoh@demo.invalid', code: codeRecu(res.utilisateurId), motDePasse: 'Guichet2026', confirmation: 'Guichet2026' });
    const ctx = await connecter('eric.tanoh@demo.invalid', 'Guichet2026');
    assert.equal(ctx.roleId, 'agent_caisse');
  });

  it('refuse un rôle hors périmètre et une adresse déjà utilisée', async () => {
    await assert.rejects(() => agents.creerCompte(ctxDe('u-conc'), { nom: 'XAVIER', email: 'x1@demo.invalid', roleId: 'affreteur', motif: 'Essai de rôle marché.' }), /périmètre/);
    await assert.rejects(() => agents.creerCompte(ctxDe('u-conc'), { nom: 'Doublon', email: 'caisse@demo.invalid', roleId: 'agent_caisse', motif: 'Adresse déjà prise.' }), /déjà rattachée/);
  });

  it('refuse la gestion des comptes à qui n’en a pas le droit', async () => {
    assert.equal(agents.perimetreDe(ctxDe('u-tra-1')), null);
    await assert.rejects(() => agents.creerCompte(ctxDe('u-caisse'), { nom: 'Y', email: 'y@demo.invalid', roleId: 'agent_caisse', motif: 'Tentative non habilitée.' }));
    assert.throws(() => agents.desactiverCompte(ctxDe('u-activ'), 'u-caisse', 'Tentative non habilitée.'));
  });

  it('interdit de changer son propre rôle et de se désactiver', () => {
    assert.throws(() => agents.modifierCompte(ctxDe('u-conc'), 'u-conc', { roleId: 'super_admin', motif: 'Changer mon propre rôle.' }), /propre rôle/);
    assert.throws(() => agents.desactiverCompte(ctxDe('u-conc'), 'u-conc', 'Me désactiver moi-même.'), /propre compte/);
  });

  it('garde au moins un administrateur actif', () => {
    agents.desactiverCompte(ctxDe('u-conc'), 'u-conc-2', 'Départ en congé longue durée.');
    // Il ne reste que u-conc comme administrateur : on ne peut plus le retirer.
    assert.throws(() => agents.modifierCompte(ctxDe('u-conc'), 'u-conc', { roleId: 'agent_caisse', motif: 'Rétrogradation.' }), /propre rôle/);
    agents.reactiverCompte(ctxDe('u-conc'), 'u-conc-2', 'Retour de congé.');
    agents.modifierCompte(ctxDe('u-conc'), 'u-conc-2', { roleId: 'agent_caisse', motif: 'Affectation à la caisse.' });
    assert.throws(() => agents.modifierCompte(ctxDe('u-conc-2'), 'u-conc', { roleId: 'agent_caisse', motif: 'Tentative depuis la caisse.' }));
    agents.modifierCompte(ctxDe('u-conc'), 'u-conc-2', { roleId: 'concessionnaire', motif: 'Retour au service exploitation.' });
  });

  it('un compte désactivé ne se connecte plus ; réactivé, il se reconnecte', async () => {
    agents.desactiverCompte(ctxDe('u-conc'), 'u-caisse', 'Fin de contrat.');
    await assert.rejects(() => connecter('caisse@demo.invalid', 'demo2026'), /désactivé/);
    agents.reactiverCompte(ctxDe('u-conc'), 'u-caisse', 'Nouveau contrat.');
    const ctx = await connecter('caisse@demo.invalid', 'demo2026');
    assert.equal(ctx.roleId, 'agent_caisse');
  });

  it('réinitialise l’accès par un code unique, court, sans bloquer le compte', async () => {
    await agents.reinitialiserAcces(ctxDe('u-conc'), 'u-activ', 'Mot de passe oublié signalé par téléphone.'.replace('par téléphone', 'au service'));
    const m = { code: codeRecu('u-activ') };
    // Le compte reste utilisable tant que le nouveau mot de passe n'est pas défini.
    await connecter('activation@demo.invalid', 'demo2026');
    await assert.rejects(() => agents.utiliserCodeAcces({ email: 'activation@demo.invalid', code: 'AAAA-BBBB', motDePasse: 'Nouveau2026', confirmation: 'Nouveau2026' }), /Code invalide/);
    // Le code ne vaut que pour le compte auquel il a été adressé.
    await assert.rejects(() => agents.utiliserCodeAcces({ email: 'concessionnaire@demo.invalid', code: m.code, motDePasse: 'Nouveau2026', confirmation: 'Nouveau2026' }), /Code invalide/);
    await agents.utiliserCodeAcces({ email: 'activation@demo.invalid', code: m.code, motDePasse: 'Nouveau2026', confirmation: 'Nouveau2026' });
    // Usage unique.
    await assert.rejects(() => agents.utiliserCodeAcces({ email: 'activation@demo.invalid', code: m.code, motDePasse: 'Autre2026x', confirmation: 'Autre2026x' }), /Code invalide/);
    await connecter('activation@demo.invalid', 'Nouveau2026');
    assert.ok(depot('audit').brutOu((e) => e.evenement === 'acces_retabli' && e.cibleId === 'u-activ').length === 1);
  });

  it('refuse un code expiré et invalide le code après cinq essais', async () => {
    await agents.reinitialiserAcces(ctxDe('u-conc'), 'u-caisse', 'Réinitialisation demandée.');
    const m = { code: codeRecu('u-caisse') };
    const code = depot('code_acces').brutOu((c) => c.utilisateurId === 'u-caisse' && !c.utiliseLe && !c.annuleLe)[0];
    depot('code_acces').modifier(code.id, { expireLe: new Date(Date.now() - 1000).toISOString() });
    await assert.rejects(() => agents.utiliserCodeAcces({ email: 'caisse@demo.invalid', code: m.code, motDePasse: 'Caisse2026', confirmation: 'Caisse2026' }), /Code invalide/);

    await agents.reinitialiserAcces(ctxDe('u-conc'), 'u-caisse', 'Nouvelle demande.');
    const m2 = { code: codeRecu('u-caisse') };
    for (let i = 0; i < agents.ESSAIS_CODE_MAX; i += 1) {
      await assert.rejects(() => agents.utiliserCodeAcces({ email: 'caisse@demo.invalid', code: 'ZZZZ-ZZZZ', motDePasse: 'Caisse2026', confirmation: 'Caisse2026' }));
    }
    await assert.rejects(() => agents.utiliserCodeAcces({ email: 'caisse@demo.invalid', code: m2.code, motDePasse: 'Caisse2026', confirmation: 'Caisse2026' }), /Code invalide/);
  });

  it('journalise chaque action sans coordonnée', () => {
    const entrees = depot('audit').brutOu((e) => /^agent_|^acces_/.test(e.evenement));
    assert.ok(entrees.length >= 6);
    assert.ok(entrees.every((e) => !/@/.test(e.details)));
  });
});

describe('Lot b5 — comptes de l’institution DGTTC', () => {
  before(installer);

  it('l’administrateur DGTTC crée et désactive un compte de son institution', async () => {
    const res = await agents.creerCompte(ctxDe('u-dgttc'), { nom: 'YAPI', prenom: 'Joël', email: 'joel.yapi@demo.invalid', roleId: 'concessionnaire', motif: 'Renfort de la cellule de contrôle.' });
    const u = depot('utilisateur').brutParId(res.utilisateurId);
    assert.equal(u.roleId, 'dgttc', 'le rôle est forcé à celui de l’institution');
    assert.equal(u.groupementId, 'grp-dgttc');
    agents.desactiverCompte(ctxDe('u-dgttc'), u.id, 'Fin de la mission de renfort.');
  });

  it('un agent DGTTC non administrateur consulte sans gérer', async () => {
    assert.equal(agents.perimetreDe(ctxDe('u-dgttc-2')), null);
    assert.ok(agents.comptesDuPerimetre(ctxDe('u-dgttc-2')).length >= 2);
    await assert.rejects(() => agents.creerCompte(ctxDe('u-dgttc-2'), { nom: 'Z', email: 'z@demo.invalid', motif: 'Création non autorisée.' }), /administrateur/);
  });

  it('ne touche ni aux agents OIC ni à sa propre désignation', () => {
    assert.throws(() => agents.desactiverCompte(ctxDe('u-dgttc'), 'u-caisse', 'Hors de mon périmètre.'), /périmètre/);
    assert.throws(() => agents.modifierCompte(ctxDe('u-dgttc'), 'u-dgttc', { administrateur: false, motif: 'Je renonce.' }), /propre désignation/);
    assert.throws(() => agents.desactiverCompte(ctxDe('u-dgttc'), 'u-dgttc', 'Me désactiver.'), /propre compte/);
  });

  it('nomme un second administrateur, qui peut alors retirer la désignation du premier', () => {
    agents.modifierCompte(ctxDe('u-dgttc'), 'u-dgttc-2', { administrateur: true, motif: 'Suppléance pendant les congés.' });
    agents.modifierCompte(ctxDe('u-dgttc-2'), 'u-dgttc', { administrateur: false, motif: 'Passation de la fonction.' });
    assert.equal(agents.perimetreDe(ctxDe('u-dgttc')), null);
    assert.throws(() => agents.modifierCompte(ctxDe('u-dgttc-2'), 'u-dgttc-2', { administrateur: false, motif: 'Dernier administrateur.' }), /propre désignation/);
  });
});

describe('Lot b5 — entreprises : modification, suspension en quatre yeux, export', () => {
  before(installer);

  it('modifie la fiche avec motif ; une pièce contrôlée modifiée retire la vérification', () => {
    const r = gestion.modifierEntreprise(ctxDe('u-conc'), 'grp-tra-2', { rccm: 'CI-DEMO-2022-T-0089' }, 'Rectification du RCCM sur pièce.');
    assert.equal(r.verificationRetiree, true);
    assert.equal(depot('groupement').brutParId('grp-tra-2').verificationEtat, 'a_verifier');
    assert.throws(() => gestion.modifierEntreprise(ctxDe('u-conc'), 'grp-aff-1', { pays: 'Ghana' }, ''), /Motif/);
    assert.throws(() => gestion.modifierEntreprise(ctxDe('u-dgttc'), 'grp-aff-1', { pays: 'Ghana' }, 'Contrôleur qui modifie.'), /Accès refusé/);
  });

  it('la suspension exige une seconde personne', () => {
    const d = gestion.demanderDecision(ctxDe('u-conc'), 'grp-tra-1', 'suspendre', 'Signalement de fraude en cours d’instruction.');
    assert.equal(depot('groupement').brutParId('grp-tra-1').etat, 'actif', 'aucun effet avant confirmation');
    assert.throws(() => gestion.confirmerDecision(ctxDe('u-conc'), d.id), /autre personne/);
    assert.throws(() => gestion.demanderDecision(ctxDe('u-conc-2'), 'grp-tra-1', 'suspendre', 'Seconde demande.'), /attend déjà/);
    gestion.confirmerDecision(ctxDe('u-conc-2'), d.id);
    assert.equal(depot('groupement').brutParId('grp-tra-1').etat, 'suspendu');
  });

  it('une entreprise suspendue consulte son historique mais n’opère plus', () => {
    const ctx = ctxDe('u-tra-1');
    assert.equal(decider(ctx, 'appariement.lire').autorise, true);
    assert.equal(decider(ctx, 'offre.publier').autorise, false);
    assert.equal(decider(ctx, 'offre.publier').motif, 'groupement_suspendu');
    assert.ok(depot('offre').brutOu((o) => o.groupementId === 'grp-tra-1').length > 0, 'historique intact');
    assert.ok(!cataloguePublic().some((o) => depot('offre').brutParId(o.id)?.groupementId === 'grp-tra-1'), 'annonces retirées du marché');
    const offre = depot('offre').brutOu((o) => o.groupementId === 'grp-tra-1' && o.etat === 'disponible')[0];
    const demande = depot('demande').brutOu((d) => d.groupementId === 'grp-aff-1' && d.etat === 'publiee')[0];
    if (offre && demande) {
      assert.throws(() => matching.engager(ctxDe('u-aff-1'), { offreId: offre.id, demandeId: demande.id }), /suspendue/);
    }
  });

  it('la réactivation suit la même règle et rend les opérations', () => {
    const d = gestion.demanderDecision(ctxDe('u-conc-2'), 'grp-tra-1', 'reactiver', 'Dossier régularisé après contrôle.');
    assert.throws(() => gestion.rejeterDecision(ctxDe('u-conc-2'), d.id, 'Je rejette ma propre demande.'), /autre personne/);
    gestion.confirmerDecision(ctxDe('u-conc'), d.id);
    assert.equal(decider(ctxDe('u-tra-1'), 'offre.publier').autorise, true);
  });

  it('refuse de suspendre une institution, ou sans droit', () => {
    assert.throws(() => gestion.demanderDecision(ctxDe('u-conc'), 'grp-dgttc', 'suspendre', 'Institution.'), /institution/i);
    assert.throws(() => gestion.demanderDecision(ctxDe('u-dgttc'), 'grp-aff-1', 'suspendre', 'Contrôleur.'), /Accès refusé/);
  });

  it('exporte la liste sans coordonnée ni montant', () => {
    const f = gestion.exporterEntreprises(ctxDe('u-conc'));
    assert.ok(f.lignes >= 5);
    assert.ok(!/contact@|\+225|F CFA/.test(f.contenu));
    assert.ok(f.contenu.includes('Cacao Lagunes Export DÉMO'));
  });
});

describe('Lot b5 — référentiels nationaux', () => {
  before(installer);

  it('ajoute, renomme, désactive une valeur ; une valeur utilisée ne se supprime pas', () => {
    const conc = ctxDe('u-conc');
    const r = referentiels.ajouterValeur(conc, { famille: 'localites', libelle: 'Gagnoa' });
    assert.equal(r.id, 'loc-gagnoa');
    referentiels.modifierValeur(conc, r.id, { libelle: 'Gagnoa (Gôh)' });
    referentiels.changerActivation(conc, r.id, false);
    assert.equal(depot('referentiel').brutParId(r.id).actif, false);
    referentiels.supprimerValeur(conc, r.id);
    assert.throws(() => referentiels.supprimerValeur(conc, 'loc-abidjan'), /utilisée/);
    assert.throws(() => referentiels.ajouterValeur(conc, { famille: 'carrosseries', libelle: 'Plateau' }), /existe déjà/);
  });

  it('refuse la gestion à qui n’en a pas le droit', () => {
    assert.throws(() => referentiels.ajouterValeur(ctxDe('u-dgttc'), { famille: 'localites', libelle: 'Soubré' }), /Accès refusé/);
    assert.throws(() => referentiels.ajouterValeur(ctxDe('u-aff-1'), { famille: 'localites', libelle: 'Soubré' }), /Accès refusé/);
  });
});

describe('Lot b5 — incidents applicatifs', () => {
  before(installer);

  it('un transporteur signale, l’OIC qualifie, attribue, résout et clôt', () => {
    const tra = ctxDe('u-tra-1');
    const i = incidents.declarerIncident(tra, {
      categorie: 'acces_connexion', gravite: 'bloquante', titre: 'Connexion impossible ce matin', description: 'Le bouton de connexion reste sans effet depuis huit heures.',
      capture: { nom: 'ecran.png', type: 'image/png', taille: 120000 },
    });
    assert.equal(i.etat, 'nouveau');
    assert.equal(i.capture.tailleKo, 118);
    const conc = ctxDe('u-conc');
    assert.throws(() => incidents.attribuerIncident(conc, i.id, 'u-conc-2'), /Qualifiez/);
    incidents.qualifierIncident(conc, i.id, { graviteRetenue: 'majeure', impact: 'Un transporteur ne peut plus se connecter.' });
    assert.throws(() => incidents.attribuerIncident(conc, i.id, 'u-tra-1'), /habilité/);
    incidents.attribuerIncident(conc, i.id, 'u-conc-2');
    assert.throws(() => incidents.clore(conc, i.id), /résolution/);
    incidents.resoudreIncident(ctxDe('u-conc-2'), i.id, 'Session réinitialisée côté navigateur.');
    incidents.clore(conc, i.id);
    const fin = depot('incident_applicatif').brutParId(i.id);
    assert.equal(fin.etat, 'clos');
    assert.equal(fin.suivi.length, 5);
    assert.ok(depot('notification').brutOu((n) => n.message.code === 'incident.suivi' && n.destinataireUtilisateurId === 'u-tra-1').length >= 3);
  });

  it('le déclarant ne voit que ses signalements et ne les traite pas', () => {
    const vus = incidents.incidentsVisibles(ctxDe('u-aff-1'));
    assert.ok(vus.length >= 1 && vus.every((i) => i.declareParUtilisateurId === 'u-aff-1'));
    assert.throws(() => incidents.qualifierIncident(ctxDe('u-tra-1'), 'inc-demo-1', { graviteRetenue: 'mineure', impact: 'Je qualifie moi-même.' }), /Accès refusé/);
  });

  it('refuse une description porteuse de coordonnées et une capture non image', () => {
    assert.throws(() => incidents.declarerIncident(ctxDe('u-dgttc'), { categorie: 'autre_incident', gravite: 'mineure', titre: 'Rappelez-moi', description: 'Appelez-moi au +225 07 08 09 10 11 pour en parler.' }), /téléphone/);
    assert.throws(() => incidents.declarerIncident(ctxDe('u-dgttc'), { categorie: 'autre_incident', gravite: 'mineure', titre: 'Pièce jointe', description: 'Voici le document en pièce jointe.', capture: { nom: 'x.exe', type: 'application/octet-stream', taille: 10 } }), /image/);
  });

  it('n’est pas offert aux profils sans droit', () => {
    assert.throws(() => incidents.declarerIncident(ctxDe('u-caisse'), { categorie: 'autre_incident', gravite: 'mineure', titre: 'Essai caisse', description: 'Description suffisante pour le test.' }), /Accès refusé/);
  });
});

describe('Lot b5 — flux public des offres', () => {
  before(installer);

  it('ne contient aucune donnée d’identité ni de contact', () => {
    const flux = construireFlux();
    assert.ok(flux.nombre > 0);
    const texte = JSON.stringify(flux);
    for (const g of depot('groupement').brutTous()) {
      for (const v of [g.raisonSociale, g.contactTelephone, g.contactEmail, g.rccm, g.id]) {
        if (v) assert.ok(!texte.includes(v), `fuite : ${v}`);
      }
    }
    for (const v of depot('vehicule').brutTous()) assert.ok(!texte.includes(v.immatriculation));
    for (const a of flux.annonces) {
      assert.deepEqual(Object.keys(a).sort(), ['arrivee', 'carrosserie', 'debut', 'depart', 'description', 'disponibilite', 'fin', 'identifiant', 'publieeLe', 'tonnes', 'type']);
    }
  });

  it('se génère sous droit et s’inscrit au journal', () => {
    assert.throws(() => genererFlux(ctxDe('u-dgttc')), /Accès refusé/);
    const f = genererFlux(ctxDe('u-conc'));
    assert.match(f.nom, /^flux-offres-/);
    assert.ok(depot('audit').brutOu((e) => e.evenement === 'flux_offres_genere').length === 1);
  });
});

describe('Lot b5 — DGTTC : consultation et exports sans montant', () => {
  before(async () => { await installer(); await completerJeuLotB2(); });

  it('liste les intermédiaires avec leur mandant, sans coordonnée', () => {
    const liste = dgttc.intermediaires(ctxDe('u-dgttc'));
    assert.ok(liste.length >= 2);
    assert.ok(liste.every((i) => !('email' in i) && i.mandant !== '—'));
    // Intégration : une ligne par mandat de l'entreprise intermédiaire, de fret et de transport.
    assert.deepEqual([...new Set(liste.map((i) => i.role))].sort(), ['Intermédiaire de fret', 'Intermédiaire de transport']);
    assert.equal(new Set(liste.map((i) => i.groupementId)).size, 1);
    assert.equal(dgttc.repartitions(ctxDe('u-dgttc')).totaux.intermediaires, 1);
  });

  it('calcule les répartitions et filtre par période', () => {
    const r = dgttc.repartitions(ctxDe('u-dgttc'));
    assert.ok(r.totaux.transporteurs >= 3 && r.totaux.vehicules > 0);
    const vide = dgttc.repartitions(ctxDe('u-dgttc'), { du: '2001-01-01', au: '2001-12-31' });
    assert.equal(vide.totaux.transporteurs, 0);
    assert.throws(() => dgttc.repartitions(ctxDe('u-dgttc'), { du: '2026-12-31', au: '2026-01-01' }), /précède/);
  });

  it('rattache chaque ligne de la carte des acteurs à sa localité, sans nom d’entreprise', () => {
    const r = dgttc.repartitions(ctxDe('u-dgttc'));
    const abidjan = r.parLocalite.find((l) => l.localiteId === 'loc-abidjan');
    assert.ok(abidjan && abidjan.transporteurs + abidjan.affreteurs > 0);
    for (const l of r.parLocalite) {
      assert.deepEqual(Object.keys(l).sort(), ['affreteurs', 'intermediaires', 'localite', 'localiteId', 'transporteurs', 'vehicules']);
    }
  });

  it('exporte offres, déclarations et demandes sans aucun montant ni prix', () => {
    for (const type of ['offres', 'declarations', 'demandes', 'intermediaires']) {
      const f = dgttc.exporterCsv(ctxDe('u-dgttc'), type, {});
      assert.ok(f.lignes > 0, type);
      assert.ok(!/F CFA|Prix|Frais|Solde|Montant|@|\+225/i.test(f.contenu), `${type} contient une donnée interdite`);
    }
    assert.ok(depot('audit').brutOu((e) => e.evenement === 'export_csv').length === 4);
  });

  it('refuse l’export à un rôle du marché', () => {
    assert.throws(() => dgttc.exporterCsv(ctxDe('u-aff-1'), 'offres', {}), /Accès refusé/);
  });

  it('neutralise une formule dans une cellule CSV', () => {
    assert.equal(celluleCsv('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.ok(versCsv(['A'], [['a;b']]).includes('"a;b"'));
  });
});

describe('Lot b5 — données de démonstration', () => {
  it('s’amorce sans doublon', async () => {
    await installer();
    const avant = depot('utilisateur').brutTous().length;
    const inc = depot('incident_applicatif').brutTous().length;
    await amorcerLotB5();
    assert.equal(depot('utilisateur').brutTous().length, avant);
    assert.equal(depot('incident_applicatif').brutTous().length, inc);
    assert.equal(depot('utilisateur').brutParId('u-dgttc').administrateur, true);
  });
});
