/**
 * Lot b2 : organisation interne des entreprises et intermédiaires de fret.
 *
 * Utilisateurs de l'entreprise, filiales, intermédiaire de fret comme
 * entreprise, mandats et contexte délégué. Chaque bloc pose le cas nominal ET
 * les refus : mauvais rôle, autre entreprise, état invalide.
 */

import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const memoireSession = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoireSession.has(k) ? memoireSession.get(k) : null),
  setItem: (k, v) => void memoireSession.set(k, v),
  removeItem: (k) => void memoireSession.delete(k),
};

const { installerDom, texteDe } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer, completerJeuAntiFraude, MOT_DE_PASSE_DEMO } = await import('../js/seed.js');
const { completerJeuLotB2 } = await import('../js/seed-lot-b2.js');
const auth = await import('../js/services/auth.service.js');
const comptes = await import('../js/services/utilisateurs-entreprise.service.js');
const filiales = await import('../js/services/filiale.service.js');
const mandats = await import('../js/services/mandat.service.js');
const matching = await import('../js/services/matching.service.js');
const fret = await import('../js/services/fret.service.js');
const verification = await import('../js/services/verification.service.js');
const { decider, deciderSurAppariement, MOTIF_REFUS } = await import('../js/domain/access.js');
const { MATRICE, PORTEE, porteeDe } = await import('../js/domain/permissions.js');
const { ROLES, rolesAttribuables, ROLES_PAR_TYPE_ENTREPRISE } = await import('../js/domain/roles.js');
const { refusMandat, statutMandat, controlerDesignation, DROITS_PAR_PERIMETRE } = await import('../js/domain/mandat.js');
const { entiteOperationnelle } = await import('../js/domain/organisation.js');
const {
  ETAT_COMPTE, ETAT_MANDAT, EVENEMENT_AUDIT, PERIMETRE_MANDAT, STATUT_MANDAT, TYPE_GROUPEMENT, ETAT_APPARIEMENT, labelOf,
} = await import('../js/domain/enums.js');
const { ACTION } = await import('../js/domain/matching.state.js');
const { nomDe } = await import('../js/views/_donnees.js');
const { arborescenceDe } = await import('../js/core/nav.js');
const vuesOrganisation = await import('../js/views/organisation.js');
const vuesIntermediaire = await import('../js/views/intermediaire.js');
const affreteur = await import('../js/views/affreteur.js');
const transporteur = await import('../js/views/transporteur.js');
const commun = await import('../js/views/commun.js');

/* ------------------------------------------------------------------ *
 * Outillage
 * ------------------------------------------------------------------ */

const ctxDe = (id) => auth.contexteDe(depot('utilisateur').brutParId(id));
const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function preparer() {
  memoireSession.clear();
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  await completerJeuAntiFraude();
  await completerJeuLotB2();
}

const audits = (evenement) => depot('audit').brutOu((e) => e.evenement === evenement);
// Intégration : le code d'activation part par la messagerie unique, à l'adresse
// enregistrée du compte ; le test le lit là où le destinataire le lirait.
const codeRecu = (utilisateurId) => depot('message')
  .brutOu((m) => m.modele === 'compte.code' && m.destinataireUtilisateurId === utilisateurId)
  .sort((a, b) => String(a.envoyeLe).localeCompare(String(b.envoyeLe))).pop()?.code;

const saisieFret = () => ({
  fret: { libelle: 'Cacao — lot préparé par l’intermédiaire DÉMO', provenanceId: 'loc-abidjan', destinationId: 'loc-bouake' },
  besoin: {
    departPrevu: new Date(Date.now() + 2 * 86400000).toISOString(),
    arriveePrevue: new Date(Date.now() + 4 * 86400000).toISOString(),
    capaciteId: 'cap-25',
    carrosserieId: 'car-plateau',
  },
  lignes: [{ produitId: 'sh-1801', poidsT: 20 }],
});

/* ================================================================== *
 * Domaine
 * ================================================================== */

describe('Lot b2 — rôles attribuables par une entreprise', () => {
  it('propose les rôles du type d’entreprise, le plein exercice en tête', () => {
    assert.deepEqual(rolesAttribuables('affreteur', 'affreteur'), ['affreteur', 'auxiliaire_affreteur']);
    assert.deepEqual(rolesAttribuables('intermediaire', 'intermediaire'), ['intermediaire', 'collaborateur_intermediaire']);
    assert.equal(rolesAttribuables('transporteur', 'transporteur_prive')[0], 'transporteur_prive');
  });

  it('ne propose jamais un rôle institutionnel ni un rôle de délégation', () => {
    for (const [type, liste] of Object.entries(ROLES_PAR_TYPE_ENTREPRISE)) {
      for (const id of liste) {
        assert.equal(ROLES[id].institutionnel, false, `${type} : ${id}`);
        assert.notEqual(ROLES[id].delegation, true, `${type} : ${id}`);
      }
    }
    assert.deepEqual(rolesAttribuables('institution', 'concessionnaire'), []);
    assert.deepEqual(rolesAttribuables('inconnu'), []);
  });

  it('ajoute le type « intermédiaire de fret », libellé', () => {
    assert.equal(TYPE_GROUPEMENT.INTERMEDIAIRE, 'intermediaire');
    assert.equal(labelOf(TYPE_GROUPEMENT.INTERMEDIAIRE), 'Intermédiaire de fret');
  });
});

describe('Lot b2 — matrice : les auxiliaires restent tels quels, la délégation ne valide pas', () => {
  it('conserve les restrictions des auxiliaires et leur refuse l’organisation', () => {
    for (const id of ['auxiliaire_affreteur', 'auxiliaire_transporteur']) {
      for (const d of ['filiale.lire', 'filiale.creer', 'mandat.lire', 'mandat.gerer', 'utilisateur.gerer', 'appariement.repondre']) {
        assert.equal(porteeDe(id, d), PORTEE.AUCUNE, `${id} : ${d}`);
      }
    }
    assert.equal(porteeDe('auxiliaire_affreteur', 'appariement.valider'), PORTEE.AUCUNE);
  });

  it('accorde l’organisation aux responsables d’entreprise', () => {
    for (const id of ['affreteur', 'transporteur', 'transporteur_prive', 'transporteur_etranger']) {
      for (const d of ['filiale.lire', 'filiale.creer', 'mandat.lire', 'mandat.gerer']) {
        assert.equal(porteeDe(id, d), PORTEE.GROUPEMENT, `${id} : ${d}`);
      }
    }
  });

  it('ne donne aux rôles délégués ni validation, ni coordonnées, ni administration', () => {
    for (const id of ['mandataire_affreteur', 'mandataire_transporteur']) {
      for (const d of ['appariement.valider', 'coordonnees.lire', 'compte.lire', 'utilisateur.gerer', 'mandat.gerer', 'mandat.agir', 'avis.donner', 'dut.generer']) {
        assert.equal(porteeDe(id, d), PORTEE.AUCUNE, `${id} : ${d}`);
      }
    }
    assert.equal(porteeDe('mandataire_affreteur', 'appariement.repondre'), PORTEE.AUCUNE);
  });

  it('ne donne à l’intermédiaire aucun droit de marché en propre', () => {
    for (const d of ['declaration.creer', 'appariement.reserver', 'appariement.repondre', 'offre.publier', 'coordonnees.lire']) {
      assert.equal(porteeDe('intermediaire', d), PORTEE.AUCUNE, d);
    }
    assert.equal(porteeDe('collaborateur_intermediaire', 'utilisateur.gerer'), PORTEE.AUCUNE);
  });

  it('borne chaque droit de périmètre à un droit réellement détenu par le rôle délégué', () => {
    for (const [p, droits] of Object.entries(DROITS_PAR_PERIMETRE)) {
      const roleId = [PERIMETRE_MANDAT.DECLARER_FRET, PERIMETRE_MANDAT.GERER_RESERVATIONS].includes(p)
        ? 'mandataire_affreteur'
        : 'mandataire_transporteur';
      for (const d of droits) assert.notEqual(MATRICE[roleId][d], undefined, `${p} : ${d}`);
    }
  });
});

describe('Lot b2 — le mandat borne le contexte délégué', () => {
  const mandat = (perimetre, etat = ETAT_MANDAT.ACTIF, debut = jour(-1), fin = jour(30)) =>
    ({ etat, debuteLe: debut, finitLe: fin, perimetre });

  it('dérive le statut de la date et de l’état', () => {
    assert.equal(statutMandat(mandat([])), STATUT_MANDAT.EN_VIGUEUR);
    assert.equal(statutMandat(mandat([], ETAT_MANDAT.ACTIF, jour(2), jour(9))), STATUT_MANDAT.A_VENIR);
    assert.equal(statutMandat(mandat([], ETAT_MANDAT.ACTIF, jour(-9), jour(-2))), STATUT_MANDAT.ECHU);
    assert.equal(statutMandat(mandat([], ETAT_MANDAT.RETIRE)), STATUT_MANDAT.RETIRE);
  });

  it('refuse un acte hors périmètre, laisse les lectures', () => {
    const m = mandat([PERIMETRE_MANDAT.DECLARER_FRET]);
    assert.equal(refusMandat(m, 'declaration.creer'), null);
    assert.equal(refusMandat(m, 'declaration.lire'), null);
    assert.match(refusMandat(m, 'appariement.reserver'), /périmètre/);
  });

  it('refuse tout, lecture comprise, hors période ou après retrait', () => {
    assert.match(refusMandat(mandat([PERIMETRE_MANDAT.DECLARER_FRET], ETAT_MANDAT.RETIRE), 'declaration.lire'), /retiré/);
    assert.match(refusMandat(mandat([PERIMETRE_MANDAT.DECLARER_FRET], ETAT_MANDAT.ACTIF, jour(-9), jour(-2)), 'declaration.lire'), /échéance/);
  });

  it('contrôle la désignation : type, périmètre, dates', () => {
    const base = { typeMandant: 'affreteur', perimetre: [PERIMETRE_MANDAT.DECLARER_FRET], debuteLe: jour(0), finitLe: jour(30) };
    assert.deepEqual(controlerDesignation(base), []);
    assert.ok(controlerDesignation({ ...base, perimetre: [] }).length);
    assert.ok(controlerDesignation({ ...base, perimetre: [PERIMETRE_MANDAT.REPONDRE_RESERVATIONS] }).length);
    assert.ok(controlerDesignation({ ...base, typeMandant: 'intermediaire' }).length);
    assert.ok(controlerDesignation({ ...base, finitLe: jour(-1), debuteLe: jour(-5) }).length);
    assert.ok(controlerDesignation({ ...base, finitLe: jour(-40) }).length);
    assert.ok(controlerDesignation({ ...base, finitLe: jour(400) }).length);
  });
});

/* ================================================================== *
 * Utilisateurs de l'entreprise
 * ================================================================== */

describe('Lot b2 — l’administrateur gère les utilisateurs de son entreprise', () => {
  beforeEach(preparer);

  it('crée un compte, émet un code à usage unique jamais stocké en clair, journalise', async () => {
    const admin = ctxDe('u-aff-1');
    const r = await comptes.creerUtilisateur(admin, {
      prenom: 'Fanta', nom: 'KONÉ', email: 'Fanta.Kone@cacao-lagunes.invalid', roleId: 'auxiliaire_affreteur',
    });
    assert.equal(r.code, undefined, 'le code n’est pas rendu à l’administrateur');
    r.code = codeRecu(r.utilisateurId);
    assert.match(r.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(depot('message').brutOu((m) => m.modele === 'compte.code' && m.destinataireUtilisateurId === r.utilisateurId)[0].adresse, 'fanta.kone@cacao-lagunes.invalid');
    const u = depot('utilisateur').brutParId(r.utilisateurId);
    assert.equal(u.email, 'fanta.kone@cacao-lagunes.invalid');
    assert.equal(u.groupementId, 'grp-aff-1');
    assert.ok(!JSON.stringify(depot('utilisateur').brutTous()).includes(r.code.replace('-', '')));
    assert.ok(!JSON.stringify(depot('utilisateur').brutTous()).includes(r.code));
    const entree = audits(EVENEMENT_AUDIT.UTILISATEUR_CREE).at(-1);
    assert.equal(entree.auteurUtilisateurId, 'u-aff-1');
    assert.ok(!entree.details.includes('@'), 'le journal ne porte pas l’adresse');

    // Avant activation, aucun mot de passe connu n'ouvre le compte.
    await assert.rejects(() => auth.connecter('fanta.kone@cacao-lagunes.invalid', MOT_DE_PASSE_DEMO), /Identifiants incorrects/);
    await comptes.activerCompte({ email: 'fanta.kone@cacao-lagunes.invalid', code: r.code.toLowerCase(), motDePasse: 'Lagune2026', confirmation: 'Lagune2026' });
    const ctx = await auth.connecter('fanta.kone@cacao-lagunes.invalid', 'Lagune2026');
    assert.equal(ctx.roleId, 'auxiliaire_affreteur');
    // Usage unique.
    await assert.rejects(
      () => comptes.activerCompte({ email: 'fanta.kone@cacao-lagunes.invalid', code: r.code, motDePasse: 'Autre2026x', confirmation: 'Autre2026x' }),
      /Activation impossible/,
    );
    assert.equal(audits(EVENEMENT_AUDIT.COMPTE_ACTIVE).length, 1);
  });

  it('refuse un rôle OIC, un rôle d’un autre type d’entreprise, un rôle de délégation', async () => {
    const admin = ctxDe('u-aff-1');
    const saisie = { nom: 'TEST', email: 'test.role@demo.invalid' };
    for (const roleId of ['concessionnaire', 'super_admin', 'dgttc', 'transporteur', 'mandataire_affreteur', 'intermediaire']) {
      await assert.rejects(() => comptes.creerUtilisateur(admin, { ...saisie, roleId }), /ne peut pas être attribué/, roleId);
    }
    assert.throws(() => comptes.modifierUtilisateur(admin, 'u-aux-1', { nom: 'BAMBA', email: 'auxiliaire@demo.invalid', roleId: 'concessionnaire' }), /ne peut pas être attribué/);
  });

  it('refuse à un auxiliaire et à un collaborateur d’administrer les comptes', async () => {
    await assert.rejects(() => comptes.creerUtilisateur(ctxDe('u-aux-1'), { nom: 'X', email: 'x1@demo.invalid', roleId: 'auxiliaire_affreteur' }), /Accès refusé/);
    await assert.rejects(() => comptes.creerUtilisateur(ctxDe('u-int-2'), { nom: 'X', email: 'x2@demo.invalid', roleId: 'collaborateur_intermediaire' }), /Accès refusé/);
    assert.throws(() => comptes.desactiverUtilisateur(ctxDe('u-auxt-1'), 'u-tra-1'), /Accès refusé/);
  });

  it('ne touche jamais un compte d’une autre entreprise ni un compte institutionnel', async () => {
    const admin = ctxDe('u-aff-1');
    assert.throws(() => comptes.desactiverUtilisateur(admin, 'u-tra-1'), /autre entreprise/);
    assert.throws(() => comptes.modifierUtilisateur(admin, 'u-aff-2', { nom: 'SORO', email: 'affreteur2@demo.invalid', roleId: 'affreteur' }), /autre entreprise/);
    await assert.rejects(() => comptes.reinitialiserAcces(admin, 'u-tra-1'), /autre entreprise/);
    assert.throws(() => comptes.desactiverUtilisateur(admin, 'u-conc'), /institutionnel/);
    await assert.rejects(() => comptes.creerUtilisateur(admin, { nom: 'X', email: 'x3@demo.invalid', roleId: 'affreteur', groupementId: 'grp-tra-1' }), /autre entreprise/);
    assert.ok(comptes.utilisateursEntreprise(admin).every((u) => u.groupementId === 'grp-aff-1'));
  });

  it('interdit l’auto-administration et garde un administrateur actif', () => {
    const admin = ctxDe('u-aff-1');
    assert.throws(() => comptes.desactiverUtilisateur(admin, 'u-aff-1'), /propre compte/);
    assert.throws(() => comptes.modifierUtilisateur(admin, 'u-aff-1', { nom: 'KONAN', email: 'affreteur@demo.invalid', roleId: 'auxiliaire_affreteur' }), /propre rôle/);
    // Le second administrateur ne peut pas être rétrogradé s'il est le seul autre… ici l'auxiliaire est promu puis le dernier contrôle joue.
    comptes.modifierUtilisateur(admin, 'u-aux-1', { prenom: 'Sékou', nom: 'BAMBA', email: 'auxiliaire@demo.invalid', roleId: 'affreteur' });
    const promu = ctxDe('u-aux-1');
    comptes.desactiverUtilisateur(promu, 'u-aff-1', 'Départ');
    assert.throws(() => comptes.modifierUtilisateur(ctxDe('u-aux-1'), 'u-aux-1', { nom: 'BAMBA', email: 'auxiliaire@demo.invalid', roleId: 'auxiliaire_affreteur' }), /propre rôle/);
    comptes.reactiverUtilisateur(promu, 'u-aff-1');
    comptes.desactiverUtilisateur(ctxDe('u-aff-1'), 'u-aux-1');
    assert.equal(depot('utilisateur').brutParId('u-aux-1').etat, ETAT_COMPTE.SUSPENDU);
    assert.throws(() => comptes.desactiverUtilisateur(ctxDe('u-aff-1'), 'u-aux-1'), /déjà désactivé/);
  });

  it('désactive et réactive un compte, tracé au journal ; un compte désactivé n’agit plus', async () => {
    const admin = ctxDe('u-aff-1');
    comptes.desactiverUtilisateur(admin, 'u-aux-1', 'Fin de mission');
    // Après fusion avec le lot b5 : un compte désactivé ne se connecte plus du tout,
    // et une session déjà ouverte n'agit plus (refus du moteur de décision).
    await assert.rejects(() => auth.connecter('auxiliaire@demo.invalid', MOT_DE_PASSE_DEMO), /désactivé/);
    assert.equal(decider(ctxDe('u-aux-1'), 'declaration.lire').motif, MOTIF_REFUS.COMPTE_SUSPENDU);
    comptes.reactiverUtilisateur(admin, 'u-aux-1');
    assert.equal(ctxDe('u-aux-1').compteActif, true);
    assert.equal(audits(EVENEMENT_AUDIT.UTILISATEUR_DESACTIVE).length, 1);
    assert.equal(audits(EVENEMENT_AUDIT.UTILISATEUR_REACTIVE).length, 1);
    assert.match(audits(EVENEMENT_AUDIT.UTILISATEUR_DESACTIVE)[0].details, /Fin de mission/);
  });

  it('réinitialise un accès sans bloquer le compte, puis invalide le code après cinq erreurs', async () => {
    const admin = ctxDe('u-tra-1');
    await comptes.reinitialiserAcces(admin, 'u-auxt-1');
    const code = codeRecu('u-auxt-1');
    // L'ancien mot de passe reste valable tant que le nouveau n'est pas défini.
    await auth.connecter('auxtransport@demo.invalid', MOT_DE_PASSE_DEMO);
    assert.equal(audits(EVENEMENT_AUDIT.ACCES_REINITIALISE).length, 1);
    assert.ok(!audits(EVENEMENT_AUDIT.ACCES_REINITIALISE)[0].details.includes(code));
    // Règles du mot de passe contrôlées avant le code.
    await assert.rejects(() => comptes.activerCompte({ email: 'auxtransport@demo.invalid', code, motDePasse: 'court', confirmation: 'court' }), /8 caractères/);
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => comptes.activerCompte({ email: 'auxtransport@demo.invalid', code: 'AAAA-AAAA', motDePasse: 'Valable2026', confirmation: 'Valable2026' }), /Activation impossible/);
    }
    await assert.rejects(() => comptes.activerCompte({ email: 'auxtransport@demo.invalid', code, motDePasse: 'Valable2026', confirmation: 'Valable2026' }), /Activation impossible/);
    await auth.connecter('auxtransport@demo.invalid', MOT_DE_PASSE_DEMO);
  });

  it('refuse un code expiré avec le même message', async () => {
    const admin = ctxDe('u-tra-1');
    await comptes.reinitialiserAcces(admin, 'u-auxt-1');
    const code = codeRecu('u-auxt-1');
    const u = depot('utilisateur').brutParId('u-auxt-1');
    depot('utilisateur').modifier(u.id, { motDePasse: { ...u.motDePasse, activation: { ...u.motDePasse.activation, expireLe: new Date(Date.now() - 1000).toISOString() } } });
    await assert.rejects(() => comptes.activerCompte({ email: 'auxtransport@demo.invalid', code, motDePasse: 'Valable2026', confirmation: 'Valable2026' }), /Activation impossible/);
    await assert.rejects(() => comptes.activerCompte({ email: 'inconnu@demo.invalid', code, motDePasse: 'Valable2026', confirmation: 'Valable2026' }), /Activation impossible/);
  });

  it('refuse une adresse déjà utilisée sur la plateforme', async () => {
    await assert.rejects(() => comptes.creerUtilisateur(ctxDe('u-aff-1'), { nom: 'X', email: 'transporteur@demo.invalid', roleId: 'auxiliaire_affreteur' }), /déjà celle d’un compte/);
  });
});

/* ================================================================== *
 * Filiales
 * ================================================================== */

describe('Lot b2 — filiales : héritage des pièces vérifiées, activité consolidée', () => {
  beforeEach(preparer);

  const saisieFiliale = (n) => ({
    raisonSociale: `Agence de test ${n} DÉMO`,
    localiteId: 'loc-daloa',
    responsable: { prenom: 'Awa', nom: `RESPONSABLE ${n}`, email: `resp${n}@demo.invalid` },
  });

  it('crée une entité rattachée active, qui hérite des pièces, de la vérification et de l’abonnement', async () => {
    const r = await filiales.creerFiliale(ctxDe('u-tra-1'), saisieFiliale(1));
    assert.equal(r.active, true);
    const f = depot('groupement').brutParId(r.filialeId);
    const mere = depot('groupement').brutParId('grp-tra-1');
    assert.equal(f.parentId, 'grp-tra-1');
    assert.equal(f.rccm, mere.rccm);
    assert.equal(f.carteTransporteurNumero, mere.carteTransporteurNumero);
    assert.equal(verification.etatVerification(f.id), 'verifie');
    assert.equal(auth.abonnementDe(f.id).actif, true);
    const u = depot('utilisateur').brutParId(r.utilisateurId);
    assert.equal(u.roleId, 'transporteur');
    assert.equal(auth.contexteDe(u).compteActif, true);
    assert.equal(audits(EVENEMENT_AUDIT.FILIALE_CREEE).length, 1);
  });

  it('laisse inactive la filiale d’une entreprise non vérifiée, avec son motif', async () => {
    const r = await filiales.creerFiliale(ctxDe('u-tra-3'), saisieFiliale(2));
    assert.equal(r.active, false);
    const ctx = auth.contexteDe(depot('utilisateur').brutParId(r.utilisateurId));
    assert.equal(ctx.compteActif, false);
    const d = decider(ctx, 'offre.lire');
    assert.equal(d.motif, MOTIF_REFUS.COMPTE_SUSPENDU);
    assert.match(d.explication, /vérifié/);
  });

  it('retire la vérification à la filiale quand la mère la perd', async () => {
    const r = await filiales.creerFiliale(ctxDe('u-tra-1'), saisieFiliale(3));
    verification.refuserTransporteur(ctxDe('u-activ'), 'grp-tra-1', 'Assurance expirée');
    assert.equal(verification.etatVerification(r.filialeId), 'refuse');
    assert.equal(entiteOperationnelle(depot('groupement').brutParId(r.filialeId), depot('groupement').brutParId('grp-tra-1')), false);
  });

  it('refuse la création à un auxiliaire, à une entité rattachée, à un intermédiaire en délégation', async () => {
    await assert.rejects(() => filiales.creerFiliale(ctxDe('u-auxt-1'), saisieFiliale(4)), /Accès refusé/);
    await assert.rejects(() => filiales.creerFiliale(ctxDe('u-fil-1'), saisieFiliale(5)), /entité rattachée ne crée pas/);
    const delegue = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-2');
    await assert.rejects(() => filiales.creerFiliale(delegue, saisieFiliale(6)), /Accès refusé/);
    await assert.rejects(() => filiales.creerFiliale(ctxDe('u-tra-1'), { ...saisieFiliale(7), localiteId: 'inconnue' }), /localité/);
  });

  it('montre à la mère une activité consolidée, en agrégats', () => {
    const a = filiales.activiteConsolidee(ctxDe('u-tra-1'));
    assert.deepEqual(a.entites.map((e) => e.id), ['grp-tra-1', 'grp-fil-1']);
    assert.equal(a.totaux.entites, 2);
    assert.equal(a.entites[1].verificationHeritee, true);
    assert.throws(() => filiales.activiteConsolidee(ctxDe('u-auxt-1')), /Accès refusé/);
    // L'administrateur de la mère gère aussi les comptes de la filiale.
    assert.ok(comptes.utilisateursEntreprise(ctxDe('u-tra-1')).some((u) => u.id === 'u-fil-1'));
    assert.ok(!comptes.utilisateursEntreprise(ctxDe('u-fil-1')).some((u) => u.id === 'u-tra-1'));
  });
});

/* ================================================================== *
 * Mandats
 * ================================================================== */

describe('Lot b2 — désigner, retirer un intermédiaire', () => {
  beforeEach(preparer);

  it('dresse l’annuaire des intermédiaires actifs', () => {
    const annuaire = mandats.annuaireIntermediaires(ctxDe('u-tra-2'));
    assert.deepEqual(annuaire.map((i) => i.id), ['grp-int-1']);
    depot('groupement').modifier('grp-int-1', { etat: ETAT_COMPTE.SUSPENDU });
    assert.equal(mandats.annuaireIntermediaires(ctxDe('u-tra-2')).length, 0);
  });

  it('désigne avec un périmètre et une période ; l’intermédiaire est notifié', () => {
    const r = mandats.designerIntermediaire(ctxDe('u-tra-2'), {
      intermediaireId: 'grp-int-1', perimetre: [PERIMETRE_MANDAT.PROPOSER_VEHICULES], debuteLe: jour(0), finitLe: jour(60),
    });
    assert.match(r.reference, /^MD-\d{4}-\d{4}$/);
    assert.equal(audits(EVENEMENT_AUDIT.MANDAT_DESIGNE).length, 1);
    assert.ok(depot('notification').brutOu((n) => n.destinataireUtilisateurId === 'u-int-1' && n.message.code === 'mandat.designe').length);
    assert.ok(mandats.mesMandants(ctxDe('u-int-1')).some((m) => m.mandant === 'Routière du Centre DÉMO'));
  });

  it('refuse : auxiliaire, périmètre d’un autre type, intermédiaire inconnu, doublon', () => {
    const base = { intermediaireId: 'grp-int-1', perimetre: [PERIMETRE_MANDAT.DECLARER_FRET], debuteLe: jour(0), finitLe: jour(30) };
    assert.throws(() => mandats.designerIntermediaire(ctxDe('u-aux-1'), base), /Accès refusé/);
    assert.throws(() => mandats.designerIntermediaire(ctxDe('u-aff-1'), { ...base, perimetre: [PERIMETRE_MANDAT.REPONDRE_RESERVATIONS] }), /type d’entreprise/);
    assert.throws(() => mandats.designerIntermediaire(ctxDe('u-aff-1'), { ...base, intermediaireId: 'grp-tra-2' }), /annuaire/);
    assert.throws(() => mandats.designerIntermediaire(ctxDe('u-aff-1'), base), /déjà/);
    assert.throws(() => mandats.designerIntermediaire(ctxDe('u-int-1'), base), /Accès refusé/);
  });

  it('retire un mandat : définitif, tracé, et l’intermédiaire perd aussitôt l’accès', () => {
    const delegue = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-1');
    assert.equal(decider(delegue, 'declaration.creer').autorise, true);
    assert.throws(() => mandats.retirerMandat(ctxDe('u-tra-1'), 'mdt-demo-1'), /pas été confié par votre entreprise/);
    assert.throws(() => mandats.retirerMandat(ctxDe('u-aux-1'), 'mdt-demo-1'), /Accès refusé/);
    mandats.retirerMandat(ctxDe('u-aff-1'), 'mdt-demo-1', 'Fin de collaboration');
    // Le contexte déjà ouvert ne vaut plus rien : l'état est relu à chaque décision.
    assert.equal(decider(delegue, 'declaration.lire').motif, MOTIF_REFUS.HORS_MANDAT);
    assert.throws(() => mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-1'), /retiré/);
    assert.throws(() => mandats.retirerMandat(ctxDe('u-aff-1'), 'mdt-demo-1'), /déjà retiré/);
    assert.equal(audits(EVENEMENT_AUDIT.MANDAT_RETIRE).length, 1);
  });
});

describe('Lot b2 — l’intermédiaire agit au nom de ses mandants', () => {
  beforeEach(preparer);

  it('liste ses deux mandants et refuse d’agir sur le mandat d’un autre', () => {
    const liste = mandats.mesMandants(ctxDe('u-int-2'));
    assert.deepEqual(liste.map((m) => m.mandant).sort(), ['Cacao Lagunes Export DÉMO', 'Trans Lagunes DÉMO']);
    assert.ok(liste.every((m) => m.peutAgir));
    assert.throws(() => mandats.contexteDelegue(ctxDe('u-aff-1'), 'mdt-demo-1'), /ne dispose pas du droit|pas été confié/);
    assert.throws(() => mandats.mesMandants(ctxDe('u-aux-1')), /Accès refusé/);
  });

  it('déclare un fret au nom de l’affréteur, tracé au nom du mandant', () => {
    const delegue = mandats.agirPourMandant(ctxDe('u-int-1'), 'mdt-demo-1');
    assert.equal(delegue.roleId, 'mandataire_affreteur');
    assert.equal(delegue.groupementId, 'grp-aff-1');
    const { demande } = fret.publierFret(delegue, saisieFret());
    assert.equal(demande.groupementId, 'grp-aff-1');
    const trace = audits(EVENEMENT_AUDIT.DECLARATION_PUBLIEE).at(-1);
    assert.equal(trace.groupementId, 'grp-aff-1');
    assert.equal(trace.auteurUtilisateurId, 'u-int-1');
    assert.equal(trace.mandatId, 'mdt-demo-1');
    assert.equal(trace.intermediaireGroupementId, 'grp-int-1');
    assert.match(trace.details, /au nom du mandant \(mandat MD-2026-0001\)/);
    assert.equal(audits(EVENEMENT_AUDIT.MANDAT_OUVERT).length, 1);
    assert.ok(mandats.actionsAuNomDe(ctxDe('u-aff-1')).length >= 2);
  });

  it('réserve au nom de l’affréteur, ne valide jamais, ne voit ni identité ni coordonnées', () => {
    const delegue = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-1');
    const ap = matching.engager(delegue, { offreId: 'off-1', demandeId: 'dem-1' });
    assert.equal(ap.reserveParUtilisateurId, 'u-int-1');
    matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true });
    assert.equal(deciderSurAppariement(delegue, ACTION.VALIDER, depot('appariement').brutParId(ap.id)).autorise, false);
    const p0 = matching.preparerValidation(ctxDe('u-aff-1'), ap.id);
    assert.throws(() => matching.valider(delegue, ap.id, { attendu: p0.attendu }), /engage les finances|Accès refusé|revient/);
    // La validation finale reste au mandant.
    const affreteurCtx = ctxDe('u-aff-1');
    const p = matching.preparerValidation(affreteurCtx, ap.id);
    matching.valider(affreteurCtx, ap.id, { attendu: p.attendu });
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.VALIDER);
    // Même validée, la contrepartie reste masquée pour l'intermédiaire.
    const apres = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-1');
    assert.notEqual(nomDe(apres, 'grp-tra-1'), 'Trans Lagunes DÉMO');
    assert.equal(nomDe(ctxDe('u-aff-1'), 'grp-tra-1'), 'Trans Lagunes DÉMO');
    assert.equal(decider(apres, 'coordonnees.lire').autorise, false);
  });

  it('répond au nom du transporteur, dans le seul périmètre confié', () => {
    const ap = matching.engager(ctxDe('u-aff-1'), { offreId: 'off-1', demandeId: 'dem-1' });
    const delegue = mandats.contexteDelegue(ctxDe('u-int-2'), 'mdt-demo-2');
    matching.repondre(delegue, ap.id, { accepte: true });
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.ACCEPTER);
    assert.equal(audits(EVENEMENT_AUDIT.APPARIEMENT_ACCEPTE).at(-1).mandatId, 'mdt-demo-2');

    // Périmètre réduit aux propositions : la réponse est refusée, et dite.
    const m = depot('mandat').brutParId('mdt-demo-2');
    depot('mandat').modifier(m.id, { perimetre: [PERIMETRE_MANDAT.PROPOSER_VEHICULES] });
    const reduit = mandats.contexteDelegue(ctxDe('u-int-2'), 'mdt-demo-2');
    const d = decider(reduit, 'appariement.repondre', { groupementId: 'grp-tra-1' });
    assert.equal(d.motif, MOTIF_REFUS.HORS_MANDAT);
    assert.equal(decider(reduit, 'appariement.proposer', { groupementId: 'grp-tra-1' }).autorise, true);
  });

  it('refuse d’être juge et partie : pas de réponse à une réservation préparée par son entreprise', () => {
    const pourAffreteur = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-1');
    const ap = matching.engager(pourAffreteur, { offreId: 'off-1', demandeId: 'dem-1' });
    const pourTransporteur = mandats.contexteDelegue(ctxDe('u-int-2'), 'mdt-demo-2');
    assert.throws(() => matching.repondre(pourTransporteur, ap.id, { accepte: true }), /revient au transporteur lui-même/);
    matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true });
  });

  it('referme l’accès si l’abonnement du mandant a expiré', () => {
    const abo = depot('abonnement').brutOu((a) => a.groupementId === 'grp-aff-1')[0];
    depot('abonnement').modifier(abo.id, { finitLe: jour(-2) });
    const liste = mandats.mesMandants(ctxDe('u-int-1'));
    const m = liste.find((x) => x.id === 'mdt-demo-1');
    assert.equal(m.peutAgir, false);
    assert.match(m.motifRefus, /abonnement/);
  });

  it('bascule la session au nom du mandant, puis la ramène', async () => {
    const propre = await auth.connecter('intermediaire@demo.invalid', MOT_DE_PASSE_DEMO);
    mandats.agirPourMandant(propre, 'mdt-demo-2');
    assert.equal(auth.contexteCourant().groupementId, 'grp-tra-1');
    assert.equal(auth.contexteCourant().roleId, 'mandataire_transporteur');
    mandats.retirerMandat(ctxDe('u-tra-1'), 'mdt-demo-2');
    // Retrait entre deux écrans : la session retrouve son propre espace.
    assert.equal(auth.contexteCourant().groupementId, 'grp-int-1');
    mandats.agirPourMandant(auth.contexteCourant(), 'mdt-demo-1');
    assert.equal(auth.contexteCourant().roleId, 'mandataire_affreteur');
    mandats.revenirAMonEspace();
    assert.equal(auth.contexteCourant().roleId, 'intermediaire');
  });
});

/* ================================================================== *
 * Écrans
 * ================================================================== */

describe('Lot b2 — les écrans se construisent et ne fuient pas', () => {
  beforeEach(preparer);

  it('rend les écrans d’organisation de l’affréteur et du transporteur', () => {
    for (const id of ['u-aff-1', 'u-tra-1']) {
      const c = ctxDe(id);
      for (const vue of [vuesOrganisation.utilisateurs, vuesOrganisation.filialesEtEntites, vuesOrganisation.intermediaires]) {
        assert.ok(texteDe(vue(c)).length > 0);
      }
    }
    const texte = texteDe(vuesOrganisation.utilisateurs(ctxDe('u-aff-1')));
    assert.ok(texte.includes('Ajouter un utilisateur'));
    assert.ok(!texte.includes('transporteur@demo.invalid'), 'aucun compte d’une autre entreprise');
  });

  it('rend l’espace de l’intermédiaire', () => {
    const c = ctxDe('u-int-1');
    for (const vue of [vuesIntermediaire.dashboard, vuesIntermediaire.mandants, vuesIntermediaire.ficheEntreprise, vuesOrganisation.utilisateurs, vuesOrganisation.filialesEtEntites]) {
      assert.ok(texteDe(vue(c)).length > 0);
    }
    assert.ok(texteDe(vuesIntermediaire.mandants(c)).includes('Cacao Lagunes Export DÉMO'));
  });

  it('ouvre au contexte délégué les écrans du mandant, sans compte ni paramètres', () => {
    const pourAff = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-1');
    const zones = arborescenceDe(pourAff).map((z) => z.id);
    assert.ok(!zones.includes('parametres') && !zones.includes('organisation'));
    assert.ok(!arborescenceDe(pourAff).flatMap((z) => z.pages).some((p) => p.route === 'compte'));
    for (const vue of [affreteur.dashboard, affreteur.declarations, affreteur.nouvelleDeclaration, affreteur.demandes, affreteur.marche, affreteur.reservations, commun.suivi, commun.notifications, commun.abonnement]) {
      assert.ok(texteDe(vue(pourAff, {})).length > 0);
    }
    assert.ok(texteDe(affreteur.validation(pourAff, {})).length > 0);
    const pourTra = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-2');
    for (const vue of [transporteur.dashboard, transporteur.vehicules, transporteur.offres, transporteur.marche, transporteur.reservations, commun.suivi]) {
      assert.ok(texteDe(vue(pourTra, {})).length > 0);
    }
  });

  it('ne montre jamais le solde chiffré du mandant à l’intermédiaire', async () => {
    const { montant } = await import('../js/core/dom.js');
    const { soldeDe } = await import('../js/services/compte.service.js');
    const pourAff = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-1');
    const pourTra = mandats.contexteDelegue(ctxDe('u-int-1'), 'mdt-demo-2');
    assert.equal(decider(pourAff, 'compte.lire', { groupementId: 'grp-aff-1' }).autorise, false);
    assert.ok(!texteDe(affreteur.dashboard(pourAff, {})).includes(montant(soldeDe('grp-aff-1'))));
    assert.ok(!texteDe(transporteur.dashboard(pourTra, {})).includes(montant(soldeDe('grp-tra-1'))));
    // Le mandant, lui, voit toujours son solde.
    assert.ok(texteDe(affreteur.dashboard(ctxDe('u-aff-1'), {})).includes(montant(soldeDe('grp-aff-1'))));
  });

  it('n’ouvre à l’intermédiaire aucune page de marché dans son propre espace', () => {
    const pages = arborescenceDe(ctxDe('u-int-1')).flatMap((z) => z.pages.map((p) => p.route));
    for (const interdit of ['marche', 'reservations', 'validation', 'declarations']) assert.ok(!pages.includes(interdit), interdit);
    const collab = arborescenceDe(ctxDe('u-int-2')).flatMap((z) => z.pages.map((p) => p.route));
    assert.ok(!collab.includes('utilisateurs'));
  });
});
