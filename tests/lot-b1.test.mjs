/**
 * Lot b1 — entrée dans la plateforme : inscription, dossier, vérification et
 * activation, mot de passe, messages sortants.
 *
 * Chaque bloc éprouve le cas nominal ET les refus : mauvais rôle, autre
 * entreprise, état invalide, tentative de fraude.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
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
const { valider } = await import('../js/repositories/repository.js');
const { amorcer, completerJeuAntiFraude, MOT_DE_PASSE_DEMO } = await import('../js/seed.js');
const { amorcerLotB1, ENTREPRISES_LOT_B1 } = await import('../js/seed-lot-b1.js');
const { blocageAbonnement, connecter, contexteDe } = await import('../js/services/auth.service.js');
const inscription = await import('../js/services/inscription.service.js');
const verification = await import('../js/services/verification.service.js');
const profil = await import('../js/services/profil.service.js');
const messagerie = await import('../js/services/messagerie.service.js');
const { decider, MOTIF_REFUS } = await import('../js/domain/access.js');
const { arborescenceDe, localiser, routeAccueil } = await import('../js/core/nav.js');
const { MATRICE } = await import('../js/domain/permissions.js');
const dom = await import('../js/domain/inscription.js');
const {
  CANAL_MESSAGE,
  ETAT_INSCRIPTION,
  ETAT_PIECE,
  ETAT_VERIFICATION,
  STATUT_MESSAGE,
  TYPE_GROUPEMENT,
  labelOf,
} = await import('../js/domain/enums.js');
const vues = await import('../js/views/lot-b1.js');
const { verifications: vueVerifications } = await import('../js/views/verifications.js');

/* ------------------------------------------------------------------ */

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));

async function installer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  await completerJeuAntiFraude();
  await amorcerLotB1();
}

let compteur = 0;
/** Saisie d'inscription complète et unique. */
function saisie(type = TYPE_GROUPEMENT.AFFRETEUR, modifs = {}) {
  compteur += 1;
  const n = String(1000 + compteur);
  return {
    type,
    raisonSociale: `Entreprise Test ${n} DÉMO`,
    rccm: `CI-TEST-${n}`,
    compteContribuable: `CC-TEST-${n}`,
    pays: 'Côte d’Ivoire',
    localiteId: 'loc-abidjan',
    adresse: 'Plateau, Abidjan (DÉMO)',
    contactTelephone: '+225 00 00 00 00',
    contactEmail: `contact${n}@test.invalid`,
    carteChargeurNumero: `CC-${n}`,
    carteTransporteurNumero: `CT-${n}`,
    carteTransporteurEcheance: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10),
    agrementNumero: `AG-${n}`,
    agrementEcheance: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10),
    nom: 'Test',
    prenom: 'Awa',
    telephone: '+225 00 00 00 01',
    email: `responsable${n}@test.invalid`,
    motDePasse: 'secret2026',
    confirmation: 'secret2026',
    attestation: true,
    ...modifs,
  };
}

const fichier = (nom = 'piece.pdf', taille = 120000) => ({ nom, type: 'application/pdf', taille });
const dansJours = (j) => new Date(Date.now() + j * 86400000).toISOString().slice(0, 10);

/** Dépose toutes les pièces obligatoires d'un dossier. */
function deposerTout(ctx, type) {
  for (const p of dom.piecesDuType(type).filter((x) => x.requise)) {
    inscription.deposerPiece(ctx, { typePiece: p.code, numero: 'N-1', expireLe: p.echeance ? dansJours(300) : undefined, fichier: fichier(`${p.code}.pdf`) });
  }
}

/** Déclare conformes toutes les pièces courantes d'un dossier. */
function toutConforme(ctxAgent, groupementId) {
  const courantes = dom.piecesCourantes(depot('piece').brutOu((p) => p.groupementId === groupementId));
  for (const p of courantes.values()) verification.deciderPiece(ctxAgent, p.id, { conforme: true });
}

/* ================================================================== *
 * 1. Configuration pure
 * ================================================================== */

describe('Lot b1 — configuration de l’inscription (domaine pur)', () => {
  it('décrit trois types, dont l’intermédiaire de fret à la valeur convenue', () => {
    assert.deepEqual(dom.TYPES_INSCRIPTION.map((t) => t.type), ['affreteur', 'transporteur', 'intermediaire']);
    assert.equal(TYPE_GROUPEMENT.INTERMEDIAIRE, 'intermediaire');
    assert.equal(labelOf('intermediaire'), 'Intermédiaire de fret');
    assert.equal(dom.typeInscription('intermediaire').role, 'auxiliaire_affreteur');
  });

  it('reprend les pièces transporteur de la vérification existante', () => {
    assert.deepEqual(dom.typeInscription('transporteur').piecesRequises, ['rccm', 'carte_transporteur', 'assurance']);
    assert.ok(dom.piecesDuType('transporteur').some((p) => !p.requise), 'une pièce facultative au moins');
  });

  it('établit le bilan d’un dossier : seule la conformité de chaque pièce obligatoire le rend complet', () => {
    const p = (typePiece, etat) => ({ typePiece, etat, deposeLe: new Date().toISOString() });
    assert.equal(dom.bilanDossier('affreteur', []).complet, false);
    const b = dom.bilanDossier('affreteur', [p('rccm', ETAT_PIECE.CONFORME), p('attestation_fiscale', ETAT_PIECE.DEPOSEE), p('carte_chargeur', ETAT_PIECE.NON_CONFORME)]);
    assert.deepEqual([b.conformes, b.aControler, b.nonConformes], [['rccm'], ['attestation_fiscale'], ['carte_chargeur']]);
    assert.equal(dom.bilanDossier('affreteur', ['rccm', 'attestation_fiscale', 'carte_chargeur'].map((c) => p(c, ETAT_PIECE.CONFORME))).complet, true);
  });

  it('ignore une pièce remplacée dans le bilan', () => {
    const vieux = { typePiece: 'rccm', etat: ETAT_PIECE.REMPLACEE, deposeLe: '2026-01-01T00:00:00Z' };
    assert.equal(dom.piecesCourantes([vieux]).size, 0);
  });

  it('applique la règle de mot de passe (8 caractères, lettre et chiffre, confirmation)', () => {
    assert.match(dom.motifMotDePasse('court1'), /8 caractères/);
    assert.match(dom.motifMotDePasse('sanschiffre'), /lettre et un chiffre/);
    assert.match(dom.motifMotDePasse('secret2026', 'autre2026'), /confirmation/);
    assert.equal(dom.motifMotDePasse('secret2026', 'secret2026'), null);
  });

  it('forme le code d’entreprise et la période initiale d’un an', () => {
    assert.equal(dom.codeBfci(2026, 12), 'BFCI-2026-00012');
    assert.deepEqual(dom.periodeInitiale(new Date(2026, 9, 13)), { debuteLe: '2026-10-13', finitLe: '2027-10-12' });
  });

  it('répartit les types entre les deux agents d’activation', () => {
    assert.deepEqual(dom.typesTraitesPar('activation_inscription'), ['transporteur']);
    assert.deepEqual(dom.typesTraitesPar('activation_inscription_affreteur'), ['affreteur', 'intermediaire']);
    assert.equal(dom.agentTraiteType('activation_inscription', 'affreteur'), false);
  });

  it('requalifie les rôles : responsable → rôle principal, sous-compte → auxiliaire', () => {
    assert.equal(dom.roleApresRequalification('affreteur', 'affreteur', 'transporteur'), 'transporteur');
    assert.equal(dom.roleApresRequalification('auxiliaire_affreteur', 'affreteur', 'transporteur'), 'auxiliaire_transporteur');
    assert.equal(dom.roleApresRequalification('auxiliaire_affreteur', 'intermediaire', 'affreteur'), 'affreteur');
  });

  it('n’accorde l’activation qu’aux deux agents, et garde `groupement.verifier` au seul agent transporteur', () => {
    const titulaires = Object.entries(MATRICE).filter(([, d]) => 'inscription.activer' in d).map(([r]) => r);
    assert.deepEqual(titulaires.sort(), ['activation_inscription', 'activation_inscription_affreteur']);
    assert.equal('groupement.verifier' in MATRICE.activation_inscription_affreteur, false);
    assert.equal('message.journal' in MATRICE.concessionnaire, true);
    assert.equal('message.journal' in MATRICE.dgttc, false);
  });
});

/* ================================================================== *
 * 2. Données de démonstration
 * ================================================================== */

describe('Lot b1 — données de démonstration', () => {
  before(installer);

  it('sont conformes au schéma', () => {
    for (const [entite, test] of [
      ['groupement', (g) => g.id.startsWith('grp-b1-')],
      ['utilisateur', (u) => /^u-(b1|activ)/.test(u.id)],
      ['piece', () => true],
      ['message', () => true],
    ]) {
      for (const o of depot(entite).brutOu(test)) {
        assert.deepEqual(valider(entite, o), [], `${entite} ${o.id} non conforme`);
      }
    }
  });

  it('sont idempotentes : relancées, elles ne créent aucun doublon', async () => {
    const avant = ['groupement', 'utilisateur', 'piece', 'message'].map((e) => depot(e).brutTous().length);
    await amorcerLotB1();
    const apres = ['groupement', 'utilisateur', 'piece', 'message'].map((e) => depot(e).brutTous().length);
    assert.deepEqual(apres, avant);
  });

  it('marquent chaque raison sociale DÉMO et n’emploient que des adresses .invalid', () => {
    for (const e of ENTREPRISES_LOT_B1) {
      assert.match(e.groupement.raisonSociale, /DÉMO/);
      assert.ok(e.utilisateur[1].endsWith('.invalid'));
      assert.ok(e.groupement.contactEmail.endsWith('.invalid'));
    }
  });
});

/* ================================================================== *
 * 3. Inscription publique et contrôle anti-doublon
 * ================================================================== */

describe('Lot b1 — inscription publique', () => {
  before(installer);

  it('inscrit un affréteur : compte en attente, responsable au rôle du type, accusé de réception', async () => {
    const s = saisie('affreteur');
    const r = await inscription.inscrire(s);
    const g = depot('groupement').brutParId(r.groupementId);
    const u = depot('utilisateur').brutParId(r.utilisateurId);
    assert.equal(g.inscriptionEtat, ETAT_INSCRIPTION.EN_ATTENTE);
    assert.equal(g.type, 'affreteur');
    assert.equal(g.carteChargeurNumero, s.carteChargeurNumero);
    assert.equal(u.roleId, 'affreteur');
    assert.equal(u.email, s.email);
    assert.notEqual(JSON.stringify(u.motDePasse).includes('secret2026'), true, 'mot de passe stocké en clair');
    const msg = depot('message').brutOu((m) => m.destinataireUtilisateurId === u.id);
    assert.equal(msg.length, 1);
    assert.equal(msg[0].modele, 'inscription.recue');
    assert.ok(depot('audit').brutOu((a) => a.evenement === 'inscription_recue' && a.cibleId === g.id).length === 1);
    // Le compte se connecte.
    const ctx = await connecter(s.email, s.motDePasse);
    assert.equal(ctx.inscriptionActivee, false);
  });

  it('inscrit un intermédiaire de fret comme entreprise, au rôle auxiliaire d’affréteur', async () => {
    const r = await inscription.inscrire(saisie('intermediaire'));
    assert.equal(depot('groupement').brutParId(r.groupementId).type, 'intermediaire');
    assert.equal(depot('utilisateur').brutParId(r.utilisateurId).roleId, 'auxiliaire_affreteur');
  });

  it('inscrit un transporteur « à vérifier »', async () => {
    const r = await inscription.inscrire(saisie('transporteur'));
    assert.equal(depot('groupement').brutParId(r.groupementId).verificationEtat, ETAT_VERIFICATION.A_VERIFIER);
  });

  it('FRAUDE PAR DOUBLON — refuse une adresse, un RCCM ou un compte contribuable déjà connus', async () => {
    const base = saisie('affreteur');
    await inscription.inscrire(base);
    const tracesAvant = depot('audit').brutOu((a) => a.evenement === 'inscription_refusee').length;
    await assert.rejects(inscription.inscrire(saisie('affreteur', { email: base.email.toUpperCase() })), /adresse électronique est déjà utilisée/);
    await assert.rejects(inscription.inscrire(saisie('transporteur', { rccm: ` ${base.rccm.toLowerCase().replace(/-/g, ' ')} ` })), /numéro RCCM est déjà inscrite/);
    await assert.rejects(inscription.inscrire(saisie('affreteur', { compteContribuable: base.compteContribuable })), /compte contribuable est déjà inscrite/);
    await assert.rejects(inscription.inscrire(saisie('affreteur', { rccm: 'CI-DEMO-2020-A-0001' })), /RCCM/, 'RCCM d’une entreprise du jeu historique');
    assert.equal(depot('audit').brutOu((a) => a.evenement === 'inscription_refusee').length, tracesAvant + 4, 'chaque tentative est tracée');
  });

  it('refuse un type inconnu, un champ manquant, un mot de passe faible, une carte échue, une attestation absente', async () => {
    await assert.rejects(inscription.inscrire(saisie('institution')), /type de votre entreprise/);
    await assert.rejects(inscription.inscrire(saisie('affreteur', { carteChargeurNumero: '' })), /carte de chargeur/);
    await assert.rejects(inscription.inscrire(saisie('affreteur', { motDePasse: 'abc', confirmation: 'abc' })), /8 caractères/);
    await assert.rejects(inscription.inscrire(saisie('transporteur', { carteTransporteurEcheance: '2020-01-01' })), /date est dépassée/);
    await assert.rejects(inscription.inscrire(saisie('affreteur', { attestation: false })), /Attestez/);
  });
});

/* ================================================================== *
 * 4. Compte en attente : seul « Mon dossier » est ouvert
 * ================================================================== */

describe('Lot b1 — compte en attente d’activation', () => {
  before(installer);

  it('ne donne accès qu’au dossier : marché, compte et abonnement refusés avec leur motif', () => {
    const ctx = ctxDe('u-b1-aff');
    assert.equal(ctx.inscriptionActivee, false);
    for (const droit of ['marche.offres', 'declaration.creer', 'compte.lire', 'abonnement.lire', 'notification.lire']) {
      const d = decider(ctx, droit);
      assert.equal(d.autorise, false, droit);
      assert.equal(d.motif, MOTIF_REFUS.INSCRIPTION_EN_ATTENTE);
    }
    assert.equal(decider(ctx, 'inscription.lire', { groupementId: ctx.groupementId }).autorise, true);
    assert.equal(decider(ctx, 'inscription.deposer', { groupementId: 'grp-aff-1' }).autorise, false, 'autre entreprise');
  });

  it('n’affiche que la zone « Mon compte », ouvre sur le dossier, sans écran « abonnement expiré »', () => {
    const ctx = ctxDe('u-b1-aff');
    assert.deepEqual(arborescenceDe(ctx).map((z) => z.id), ['moncompte']);
    assert.equal(routeAccueil(ctx), '#/affreteur/dossier');
    assert.equal(blocageAbonnement(ctx).bloque, false);
    assert.ok(localiser(ctx, 'profil'), 'profil atteignable');
    assert.equal(localiser(ctx, 'marche'), null);
  });

  it('laisse un compte historique inchangé', () => {
    const ctx = ctxDe('u-aff-1');
    assert.equal(ctx.inscriptionActivee, true);
    assert.equal(decider(ctx, 'marche.offres').autorise, true);
    assert.ok(arborescenceDe(ctx).some((z) => z.id === 'marche'));
  });

  it('ouvre le profil, et non le dossier, aux rôles institutionnels et de niveau 3', () => {
    const caisse = ctxDe('u-caisse');
    assert.deepEqual(arborescenceDe(caisse).flatMap((z) => z.pages.map((p) => p.route)), ['dashboard']);
    assert.ok(localiser(caisse, 'profil'));
    assert.equal(localiser(caisse, 'dossier'), null);
  });
});

/* ================================================================== *
 * 5. Mon dossier : dépôt, retrait, fiche, complément
 * ================================================================== */

describe('Lot b1 — Mon dossier', () => {
  let ctx;
  let gid;
  before(async () => {
    await installer();
    const s = saisie('intermediaire');
    gid = (await inscription.inscrire(s)).groupementId;
    ctx = await connecter(s.email, s.motDePasse);
  });

  it('dépose une pièce : métadonnées seulement, état « à contrôler », journalisé', () => {
    const p = inscription.deposerPiece(ctx, { typePiece: 'rccm', numero: 'R-1', fichier: fichier('rccm.pdf') });
    assert.equal(p.etat, ETAT_PIECE.DEPOSEE);
    assert.deepEqual(Object.keys(p.fichier).sort(), ['nom', 'taille', 'type']);
    assert.ok(depot('audit').brutOu((a) => a.evenement === 'piece_deposee' && a.cibleId === p.id).length === 1);
  });

  it('remplace la pièce du même type, gardée à l’historique', () => {
    const p2 = inscription.deposerPiece(ctx, { typePiece: 'rccm', numero: 'R-2', fichier: fichier('rccm-v2.pdf') });
    const toutes = depot('piece').brutOu((p) => p.groupementId === gid && p.typePiece === 'rccm');
    assert.equal(toutes.length, 2);
    assert.equal(toutes.filter((p) => p.etat === ETAT_PIECE.REMPLACEE).length, 1);
    assert.equal(dom.piecesCourantes(toutes).get('rccm').id, p2.id);
  });

  it('refuse une pièce étrangère au type, échue, sans échéance, trop lourde ou d’un format non admis', () => {
    assert.throws(() => inscription.deposerPiece(ctx, { typePiece: 'carte_transporteur', fichier: fichier() }), /prévue pour votre type/);
    assert.throws(() => inscription.deposerPiece(ctx, { typePiece: 'agrement_intermediaire', expireLe: '2020-01-01', fichier: fichier() }), /échue/);
    assert.throws(() => inscription.deposerPiece(ctx, { typePiece: 'agrement_intermediaire', fichier: fichier() }), /fin de validité/);
    assert.throws(() => inscription.deposerPiece(ctx, { typePiece: 'rccm', fichier: fichier('gros.pdf', 6 * 1024 * 1024) }), /5 Mo/);
    assert.throws(() => inscription.deposerPiece(ctx, { typePiece: 'rccm', fichier: { nom: 'macro.docm', type: 'application/vnd.ms-word', taille: 10 } }), /PDF/);
  });

  it('retire une pièce non contrôlée, mais pas celle d’une autre entreprise ni une pièce contrôlée', () => {
    const p = inscription.deposerPiece(ctx, { typePiece: 'attestation_fiscale', fichier: fichier() });
    assert.throws(() => inscription.retirerPiece(ctxDe('u-b1-aff'), p.id), /Accès refusé/);
    inscription.retirerPiece(ctx, p.id);
    assert.equal(depot('piece').brutParId(p.id), undefined);
    assert.throws(() => inscription.retirerPiece(ctx, 'pce-b1-aff-1'), /Accès refusé/, 'pièce d’une autre entreprise');
    const controlee = depot('piece').brutOu((x) => x.groupementId === 'grp-b1-aff' && x.etat === ETAT_PIECE.CONFORME)[0];
    assert.throws(() => inscription.retirerPiece(ctxDe('u-b1-aff'), controlee.id), /déjà été contrôlée/);
  });

  it('corrige directement la fiche avant activation, sous contrôle anti-doublon', () => {
    const r = inscription.mettreAJourFiche(ctx, { raisonSociale: 'Transit Rectifié DÉMO', adresse: 'Nouvelle adresse (DÉMO)' });
    assert.deepEqual(r.soumis, []);
    assert.equal(depot('groupement').brutParId(gid).raisonSociale, 'Transit Rectifié DÉMO');
    assert.throws(() => inscription.mettreAJourFiche(ctx, { rccm: 'CI-DEMO-2020-A-0001' }), /RCCM/);
    assert.throws(() => inscription.mettreAJourFiche(ctx, { raisonSociale: '' }), /obligatoire/);
  });

  it('refuse la transmission d’un complément qui n’est pas demandé', () => {
    assert.throws(() => inscription.transmettreComplement(ctx, 'Voici'), /Aucun complément/);
  });

  it('ne sert pas le dossier d’un rôle sans entreprise', () => {
    assert.throws(() => inscription.monDossier(ctxDe('u-conc')), /Accès refusé/);
  });
});

/* ================================================================== *
 * 6. Agent d'activation : file, pièces, complément, refus, activation
 * ================================================================== */

describe('Lot b1 — vérification et activation', () => {
  before(installer);

  it('sert à chaque agent la file des seuls types qu’il traite, sans coordonnées', () => {
    const aff = verification.dossiersInscription(ctxDe('u-activ-aff'));
    assert.ok(aff.length > 0);
    assert.ok(aff.every((d) => ['affreteur', 'intermediaire'].includes(d.type)));
    const tra = verification.dossiersInscription(ctxDe('u-activ'));
    assert.ok(tra.every((d) => d.type === 'transporteur'));
    assert.ok(tra.some((d) => d.id === 'grp-tra-3' && d.aTraiter), 'le transporteur historique non vérifié reste dans la file');
    const texte = JSON.stringify(aff);
    assert.ok(!texte.includes('+225') && !texte.includes('@'), 'coordonnée servie à l’agent');
  });

  it('refuse le dossier à un autre agent, à l’exploitant, à l’entreprise', () => {
    assert.throws(() => verification.dossierInscription(ctxDe('u-activ'), 'grp-b1-aff'), /traités par un autre agent/);
    assert.throws(() => verification.dossierInscription(ctxDe('u-conc'), 'grp-b1-aff'), /Accès refusé/);
    assert.throws(() => verification.dossierInscription(ctxDe('u-b1-aff'), 'grp-b1-aff'), /Accès refusé/);
    assert.throws(() => verification.activerEntreprise(ctxDe('u-b1-aff'), 'grp-b1-aff'), /Accès refusé/);
  });

  it('le dossier de l’agent ne porte ni téléphone, ni courriel, ni adresse', () => {
    const d = verification.dossierInscription(ctxDe('u-activ-aff'), 'grp-b1-aff');
    for (const champ of ['contactTelephone', 'contactEmail', 'adresse', 'contactNom']) {
      assert.equal(champ in d.groupement, false, champ);
    }
  });

  it('exige un motif pour une pièce non conforme', () => {
    assert.throws(() => verification.deciderPiece(ctxDe('u-activ-aff'), 'pce-b1-aff-3', { conforme: false, motif: ' ' }), /motif/);
  });

  it('refuse l’activation tant qu’une pièce obligatoire n’est pas conforme', () => {
    const d = verification.dossierInscription(ctxDe('u-activ-aff-2'), 'grp-b1-aff');
    assert.match(d.motifActivation, /Carte de chargeur/);
    assert.throws(() => verification.activerEntreprise(ctxDe('u-activ-aff-2'), 'grp-b1-aff'), /Chaque pièce obligatoire/);
  });

  it('QUATRE YEUX — l’agent qui a déclaré les pièces conformes n’active pas', () => {
    verification.deciderPiece(ctxDe('u-activ-aff'), 'pce-b1-aff-3', { conforme: true });
    assert.throws(() => verification.activerEntreprise(ctxDe('u-activ-aff'), 'grp-b1-aff'), /quatre yeux/);
  });

  it('active : code d’entreprise, abonnement initial au tarif du catalogue, message, journal', () => {
    const g = verification.activerEntreprise(ctxDe('u-activ-aff-2'), 'grp-b1-aff');
    assert.equal(g.inscriptionEtat, ETAT_INSCRIPTION.ACTIVEE);
    assert.match(g.codeBfci, /^BFCI-\d{4}-\d{5}$/);
    const abo = depot('abonnement').brutOu((a) => a.groupementId === 'grp-b1-aff');
    assert.equal(abo.length, 1);
    assert.equal(abo[0].montant, depot('tarif').brutParId('abonnement_annuel').montant);
    const msgs = depot('message').brutOu((m) => m.destinataireGroupementId === 'grp-b1-aff' && m.modele === 'entreprise.activee');
    assert.deepEqual(msgs.map((m) => m.canal).sort(), [CANAL_MESSAGE.COURRIEL, CANAL_MESSAGE.SMS]);
    assert.ok(depot('audit').brutOu((a) => a.evenement === 'entreprise_activee' && a.cibleId === 'grp-b1-aff').length === 1);
    const ctx = ctxDe('u-b1-aff');
    assert.equal(ctx.inscriptionActivee, true);
    assert.equal(decider(ctx, 'marche.offres').autorise, true);
    assert.throws(() => verification.activerEntreprise(ctxDe('u-activ-aff-2'), 'grp-b1-aff'), /déjà activé/);
  });

  it('attribue des codes d’entreprise distincts', async () => {
    const s = saisie('affreteur');
    const { groupementId } = await inscription.inscrire(s);
    deposerTout(await connecter(s.email, s.motDePasse), 'affreteur');
    toutConforme(ctxDe('u-activ-aff'), groupementId);
    const g = verification.activerEntreprise(ctxDe('u-activ-aff-2'), groupementId);
    assert.notEqual(g.codeBfci, depot('groupement').brutParId('grp-b1-aff').codeBfci);
  });

  it('active un transporteur : son dossier est vérifié, il peut publier', async () => {
    const s = saisie('transporteur');
    const { groupementId } = await inscription.inscrire(s);
    deposerTout(await connecter(s.email, s.motDePasse), 'transporteur');
    toutConforme(ctxDe('u-activ'), groupementId);
    verification.activerEntreprise(ctxDe('u-activ-2'), groupementId);
    assert.equal(verification.transporteurVerifie(groupementId), true);
  });

  it('complément : le dossier revient à l’entreprise, puis lui est rendu', () => {
    const agent = ctxDe('u-activ-aff');
    assert.throws(() => verification.demanderComplement(agent, 'grp-b1-int', ''), /Précisez/);
    verification.demanderComplement(agent, 'grp-b1-int', 'Agrément illisible : déposez un scan net.');
    assert.equal(depot('groupement').brutParId('grp-b1-int').inscriptionEtat, ETAT_INSCRIPTION.A_COMPLETER);
    assert.throws(() => verification.activerEntreprise(ctxDe('u-activ-aff-2'), 'grp-b1-int'), /complément/i);
    const entreprise = ctxDe('u-b1-int');
    assert.throws(() => inscription.transmettreComplement(entreprise, 'Appelez-moi au 07 07 07 07 07'), /numéro de téléphone/);
    inscription.transmettreComplement(entreprise, 'Agrément redéposé.');
    const g = depot('groupement').brutParId('grp-b1-int');
    assert.equal(g.inscriptionEtat, ETAT_INSCRIPTION.EN_ATTENTE);
    assert.equal(g.inscriptionEchanges.at(-1).auteur, 'entreprise');
    assert.ok(depot('message').brutOu((m) => m.modele === 'complement.demande' && m.destinataireGroupementId === 'grp-b1-int').length >= 1);
  });

  it('requalifie avec motif et trace : type, rôles et pièces attendues suivent', () => {
    const agent = ctxDe('u-activ-aff');
    assert.throws(() => verification.requalifierEntreprise(agent, 'grp-b1-int', { type: 'affreteur', motif: '' }), /motif/);
    assert.throws(() => verification.requalifierEntreprise(agent, 'grp-b1-int', { type: 'affreteur', motif: 'Activité de chargeur' }), /carte de chargeur/);
    verification.requalifierEntreprise(agent, 'grp-b1-int', { type: 'affreteur', motif: 'Activité de chargeur', champs: { carteChargeurNumero: 'CC-REQ-1' } });
    assert.equal(depot('groupement').brutParId('grp-b1-int').type, 'affreteur');
    assert.equal(depot('utilisateur').brutParId('u-b1-int').roleId, 'affreteur');
    assert.ok(depot('audit').brutOu((a) => a.evenement === 'entreprise_requalifiee' && a.cibleId === 'grp-b1-int').length === 1);
    assert.deepEqual(verification.dossierInscription(agent, 'grp-b1-int').type.piecesRequises, ['rccm', 'attestation_fiscale', 'carte_chargeur']);
  });

  it('refus motivé : l’entreprise n’accède plus qu’en lecture à son dossier', () => {
    const agent = ctxDe('u-activ');
    assert.throws(() => verification.refuserInscription(agent, 'grp-b1-tra', ''), /motif/);
    verification.refuserInscription(agent, 'grp-b1-tra', 'Entreprise inconnue au registre du commerce.');
    assert.equal(depot('groupement').brutParId('grp-b1-tra').inscriptionEtat, ETAT_INSCRIPTION.REFUSEE);
    const ctx = ctxDe('u-b1-tra');
    assert.throws(() => inscription.deposerPiece(ctx, { typePiece: 'assurance', expireLe: dansJours(100), fichier: fichier() }), /refusée/);
    assert.equal(ctx.inscriptionActivee, false);
    assert.throws(() => verification.activerEntreprise(ctxDe('u-activ-2'), 'grp-b1-tra'), /refusée/);
  });

  it('contacte une entreprise depuis son dossier, à l’adresse enregistrée', () => {
    const r = verification.contacterEntreprise(ctxDe('u-activ-aff'), 'grp-b1-aff', { objet: 'Votre dossier', corps: 'Merci pour vos pièces.', canaux: [CANAL_MESSAGE.COURRIEL] });
    assert.equal(r.envoyes, 1);
    const m = depot('message').brutOu((x) => x.objet === 'Votre dossier')[0];
    assert.equal(m.adresse, 'inscrit.affreteur@demo.invalid');
    assert.throws(() => verification.contacterEntreprise(ctxDe('u-activ'), 'grp-b1-aff', { objet: 'Test', corps: 'Test', canaux: ['courriel'] }), /autre agent/);
  });
});

/* ================================================================== *
 * 7. Modification d'identité après activation
 * ================================================================== */

describe('Lot b1 — modification de la fiche après activation', () => {
  before(async () => {
    await installer();
    verification.deciderPiece(ctxDe('u-activ-aff'), 'pce-b1-aff-3', { conforme: true });
    verification.activerEntreprise(ctxDe('u-activ-aff-2'), 'grp-b1-aff');
  });

  it('applique les coordonnées, soumet l’identité au contrôle sans la changer', () => {
    const r = inscription.mettreAJourFiche(ctxDe('u-b1-aff'), { raisonSociale: 'Négoce Atlantique Renommé DÉMO', contactTelephone: '+225 00 99 99 99' });
    assert.deepEqual(r, { appliques: ['contactTelephone'], soumis: ['raisonSociale'] });
    const g = depot('groupement').brutParId('grp-b1-aff');
    assert.equal(g.raisonSociale, 'Négoce Atlantique DÉMO', 'identité vérifiée inchangée');
    assert.equal(g.contactTelephone, '+225 00 99 99 99');
    assert.equal(g.modificationProposee.champs.raisonSociale, 'Négoce Atlantique Renommé DÉMO');
    assert.ok(verification.dossiersInscription(ctxDe('u-activ-aff')).find((d) => d.id === 'grp-b1-aff').aTraiter);
  });

  it('l’agent accepte : la modification s’applique', () => {
    verification.deciderModification(ctxDe('u-activ-aff'), 'grp-b1-aff', { accepter: true });
    const g = depot('groupement').brutParId('grp-b1-aff');
    assert.equal(g.raisonSociale, 'Négoce Atlantique Renommé DÉMO');
    assert.equal(g.modificationProposee ?? null, null);
  });

  it('l’agent refuse avec motif ; un numéro d’une autre entreprise n’est jamais accepté', () => {
    inscription.mettreAJourFiche(ctxDe('u-b1-aff'), { rccm: 'CI-NOUVEAU-0001' });
    depot('groupement').modifier('grp-b1-aff', { modificationProposee: { champs: { rccm: 'CI-DEMO-2020-A-0001' }, demandeeLe: new Date().toISOString(), demandeeParUtilisateurId: 'u-b1-aff' } });
    assert.throws(() => verification.deciderModification(ctxDe('u-activ-aff'), 'grp-b1-aff', { accepter: true }), /autre entreprise/);
    assert.throws(() => verification.deciderModification(ctxDe('u-activ-aff'), 'grp-b1-aff', { accepter: false }), /motif/);
    verification.deciderModification(ctxDe('u-activ-aff'), 'grp-b1-aff', { accepter: false, motif: 'Numéro non justifié.' });
    assert.equal(depot('groupement').brutParId('grp-b1-aff').rccm, 'CI-DEMO-2026-A-0210');
  });
});

/* ================================================================== *
 * 8. Mot de passe : récupération et changement
 * ================================================================== */

describe('Lot b1 — récupération du mot de passe', () => {
  before(installer);
  const EMAIL = 'affreteur@demo.invalid';
  const codeEnvoye = () => depot('message').brutOu((m) => m.modele === 'motdepasse.code' && m.adresse === EMAIL)
    .sort((a, b) => new Date(b.envoyeLe) - new Date(a.envoyeLe))[0]?.code;

  it('répond la même chose que l’adresse existe ou non, et n’écrit qu’au compte existant', async () => {
    const avant = depot('message').brutTous().length;
    const r1 = await profil.demanderReinitialisation('inconnu@nulle-part.invalid');
    assert.equal(depot('message').brutTous().length, avant, 'aucun message pour une adresse inconnue');
    const r2 = await profil.demanderReinitialisation(`  ${EMAIL.toUpperCase()} `);
    assert.equal(r1, r2);
    const m = depot('message').brutTous().at(-1);
    assert.equal(m.adresse, EMAIL, 'envoyé à l’adresse ENREGISTRÉE');
    assert.equal(m.destinataireUtilisateurId, 'u-aff-1');
    assert.match(m.code, /^\d{6}$/);
  });

  it('ne conserve que l’empreinte du code, et ne bloque pas le compte', async () => {
    const r = depot('reinitialisation').brutOu((x) => x.utilisateurId === 'u-aff-1').at(-1);
    assert.ok(!JSON.stringify(r).includes(codeEnvoye()), 'code stocké en clair');
    const ctx = await connecter(EMAIL, MOT_DE_PASSE_DEMO);
    assert.equal(ctx.utilisateurId, 'u-aff-1', 'l’ancien mot de passe reste valable');
  });

  it('ne sert le code à personne par la projection — ni à l’exploitant, ni au destinataire', () => {
    const journal = messagerie.journalMessages(ctxDe('u-conc'));
    assert.ok(journal.every((m) => !('code' in m) && !('adresse' in m)));
    assert.ok(messagerie.mesMessages(ctxDe('u-aff-1')).every((m) => !('code' in m)));
  });

  it('refuse un mauvais code par un message unique, puis invalide le code après cinq essais', async () => {
    await profil.demanderReinitialisation(EMAIL);
    const bon = codeEnvoye();
    const faux = bon === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i += 1) {
      await assert.rejects(profil.reinitialiserMotDePasse({ adresse: EMAIL, code: faux, motDePasse: 'nouveau2026', confirmation: 'nouveau2026' }), /Code invalide ou expiré/);
    }
    await assert.rejects(profil.reinitialiserMotDePasse({ adresse: EMAIL, code: faux, motDePasse: 'nouveau2026', confirmation: 'nouveau2026' }), /Trop d’essais/);
    await assert.rejects(profil.reinitialiserMotDePasse({ adresse: EMAIL, code: bon, motDePasse: 'nouveau2026', confirmation: 'nouveau2026' }), /Code invalide/, 'code invalidé');
  });

  it('refuse un code expiré, et le même message pour un compte inconnu', async () => {
    await installer();
    await profil.demanderReinitialisation(EMAIL);
    const r = depot('reinitialisation').brutOu((x) => x.utilisateurId === 'u-aff-1').at(-1);
    depot('reinitialisation').modifier(r.id, { expireLe: new Date(Date.now() - 1000).toISOString() });
    await assert.rejects(profil.reinitialiserMotDePasse({ adresse: EMAIL, code: codeEnvoye(), motDePasse: 'nouveau2026', confirmation: 'nouveau2026' }), /Code invalide ou expiré/);
    await assert.rejects(profil.reinitialiserMotDePasse({ adresse: 'inconnu@x.invalid', code: '123456', motDePasse: 'nouveau2026', confirmation: 'nouveau2026' }), /Code invalide ou expiré/);
  });

  it('définit le nouveau mot de passe avec le bon code ; le code ne sert qu’une fois', async () => {
    await installer();
    await profil.demanderReinitialisation(EMAIL);
    const code = codeEnvoye();
    await profil.reinitialiserMotDePasse({ adresse: EMAIL, code, motDePasse: 'nouveau2026', confirmation: 'nouveau2026' });
    await assert.rejects(connecter(EMAIL, MOT_DE_PASSE_DEMO), /Identifiants incorrects/);
    assert.equal((await connecter(EMAIL, 'nouveau2026')).utilisateurId, 'u-aff-1');
    await assert.rejects(profil.reinitialiserMotDePasse({ adresse: EMAIL, code, motDePasse: 'autre2026x', confirmation: 'autre2026x' }), /Code invalide/);
    assert.ok(depot('message').brutOu((m) => m.modele === 'motdepasse.modifie' && m.destinataireUtilisateurId === 'u-aff-1').length === 1);
    assert.ok(depot('audit').brutOu((a) => a.evenement === 'mot_de_passe_reinitialise').length === 1);
  });

  it('limite les demandes en rafale sans changer la réponse', async () => {
    await installer();
    const reponses = [];
    for (let i = 0; i < 5; i += 1) reponses.push(await profil.demanderReinitialisation(EMAIL));
    assert.equal(new Set(reponses).size, 1);
    assert.equal(depot('message').brutOu((m) => m.modele === 'motdepasse.code' && m.adresse === EMAIL).length, 3);
  });
});

describe('Lot b1 — Mon profil', () => {
  before(installer);

  it('change le mot de passe en exigeant l’actuel', async () => {
    const ctx = ctxDe('u-tra-1');
    await assert.rejects(profil.changerMotDePasse(ctx, { actuel: 'faux', motDePasse: 'nouveau2026', confirmation: 'nouveau2026' }), /actuel est inexact/);
    await assert.rejects(profil.changerMotDePasse(ctx, { actuel: MOT_DE_PASSE_DEMO, motDePasse: MOT_DE_PASSE_DEMO, confirmation: MOT_DE_PASSE_DEMO }), /différent/);
    await profil.changerMotDePasse(ctx, { actuel: MOT_DE_PASSE_DEMO, motDePasse: 'nouveau2026', confirmation: 'nouveau2026' });
    assert.equal((await connecter('transporteur@demo.invalid', 'nouveau2026')).utilisateurId, 'u-tra-1');
  });

  it('met à jour les seules coordonnées personnelles, pas l’adresse de connexion', () => {
    const ctx = ctxDe('u-dgttc');
    profil.mettreAJourProfil(ctx, { nom: 'OUATTARA', prenom: 'Bakary', fonction: 'Contrôleur', telephone: '+225 00 10 10 10', email: 'pirate@x.invalid' });
    const u = depot('utilisateur').brutParId('u-dgttc');
    assert.equal(u.fonction, 'Contrôleur');
    assert.equal(u.email, 'dgttc@demo.invalid');
    assert.throws(() => profil.mettreAJourProfil(ctx, { nom: '' }), /nom est obligatoire/);
    assert.equal(profil.monProfil(ctx).telephone, '+225 00 10 10 10');
  });
});

/* ================================================================== *
 * 9. Messagerie sortante
 * ================================================================== */

describe('Lot b1 — messagerie sortante', () => {
  before(installer);

  it('réserve le journal à l’exploitant', () => {
    assert.ok(messagerie.journalMessages(ctxDe('u-conc')).length > 0);
    for (const id of ['u-dgttc', 'u-aff-1', 'u-activ']) {
      assert.throws(() => messagerie.journalMessages(ctxDe(id)), /Accès refusé/, id);
    }
  });

  it('filtre le journal par canal, destinataire et période', () => {
    const conc = ctxDe('u-conc');
    assert.ok(messagerie.journalMessages(conc, { canal: 'sms' }).every((m) => m.canal === 'sms'));
    const zadi = messagerie.journalMessages(conc, { destinataire: 'zadi' });
    assert.ok(zadi.length > 0 && zadi.every((m) => m.destinataireUtilisateurId === 'u-b1-int'));
    assert.equal(messagerie.journalMessages(conc, { depuis: '2999-01-01' }).length, 0);
  });

  it('envoie à une catégorie d’entreprises ; un SMS sans numéro est « non remis »', () => {
    const r = messagerie.envoyerACategorie(ctxDe('u-conc'), { categorie: 'type:transporteur', objet: 'Information', corps: 'Contrôles routiers renforcés.', canaux: ['courriel', 'sms'] });
    const transporteurs = depot('groupement').brutOu((g) => g.type === 'transporteur').length;
    assert.equal(r.entreprises, transporteurs);
    assert.ok(r.envoyes > 0);
    const sms = depot('message').brutOu((m) => m.objet === 'Information' && m.canal === 'sms');
    assert.ok(sms.some((m) => m.statut === STATUT_MESSAGE.NON_REMIS), 'un utilisateur du jeu n’a pas de téléphone');
    assert.ok(depot('audit').brutOu((a) => a.evenement === 'message_envoye').length >= 1);
  });

  it('refuse l’envoi groupé à l’agent, l’envoi à un acteur du marché, un message vide ou sans canal', () => {
    assert.throws(() => messagerie.envoyerACategorie(ctxDe('u-activ'), { categorie: 'toutes', objet: 'Objet', corps: 'Texte', canaux: ['courriel'] }), /Accès refusé/);
    assert.throws(() => messagerie.envoyerAuGroupement(ctxDe('u-aff-1'), 'grp-tra-1', { objet: 'Objet', corps: 'Texte', canaux: ['courriel'] }), /Accès refusé/);
    assert.throws(() => messagerie.envoyerAuGroupement(ctxDe('u-conc'), 'grp-tra-1', { objet: '', corps: 'Texte', canaux: ['courriel'] }), /objet/);
    assert.throws(() => messagerie.envoyerAuGroupement(ctxDe('u-conc'), 'grp-tra-1', { objet: 'Objet', corps: 'Texte', canaux: [] }), /canal/);
  });

  it('chacun ne retrouve que ses propres messages', () => {
    const miens = messagerie.mesMessages(ctxDe('u-b1-int'));
    assert.ok(miens.length > 0 && miens.every((m) => m.destinataireUtilisateurId === 'u-b1-int'));
    messagerie.marquerMessageLu(ctxDe('u-aff-1'), miens[0].id);
    assert.equal(depot('message').brutParId(miens[0].id).luLe, undefined, 'un tiers ne marque pas lu');
    messagerie.marquerMessageLu(ctxDe('u-b1-int'), miens[0].id);
    assert.ok(depot('message').brutParId(miens[0].id).luLe);
  });

  it('dépose dans la boîte simulée les seuls messages remis', () => {
    const boite = messagerie.boiteSimulee();
    assert.ok(boite.length > 0 && boite.every((m) => m.adresse));
  });
});

/* ================================================================== *
 * 10. Écrans
 * ================================================================== */

describe('Lot b1 — écrans', () => {
  before(installer);

  it('rend « Mon dossier » d’une entreprise en attente', () => {
    const t = texteDe(vues.dossier(ctxDe('u-b1-tra')));
    assert.ok(t.includes('Complément demandé par l’OIC'));
    assert.ok(t.includes('Attestation d’assurance des marchandises transportées'));
    assert.ok(t.includes('Transmettre mon dossier complété'));
  });

  it('rend la file et le dossier de l’agent, sans téléphone ni courriel', () => {
    const file = texteDe(vueVerifications(ctxDe('u-activ-aff')));
    assert.ok(file.includes('Négoce Atlantique DÉMO') && file.includes('Lagune Transit Services DÉMO'));
    assert.ok(!file.includes('Savane Express'), 'dossier transporteur servi à l’agent affréteur');
    const fiche = texteDe(vueVerifications(ctxDe('u-activ-aff'), { id: 'grp-b1-aff' }));
    assert.ok(fiche.includes('Carte de chargeur'));
    for (const interdit of ['+225 00 21 02 10', 'contact@negoce-atlantique.invalid', 'inscrit.affreteur@demo.invalid']) {
      assert.ok(!fiche.includes(interdit), interdit);
    }
  });

  it('n’offre le bouton d’activation que si elle est possible, et le contrôle des moyens qu’après activation', () => {
    const attente = texteDe(vueVerifications(ctxDe('u-activ-aff'), { id: 'grp-b1-aff' }));
    assert.ok(attente.includes('Activation pas encore possible'));
    assert.ok(!attente.includes('Activer le compte'), 'bouton d’activation offert sur un dossier incomplet');
    const tra = texteDe(vueVerifications(ctxDe('u-activ'), { id: 'grp-b1-tra' }));
    assert.ok(!tra.includes('Vérifier le dossier'), 'vérification séparée offerte avant activation');
  });

  it('donne à l’intermédiaire inscrit son type dans le contexte, sans le présenter comme sous-compte', () => {
    assert.equal(ctxDe('u-b1-int').groupementType, TYPE_GROUPEMENT.INTERMEDIAIRE);
    assert.equal(ctxDe('u-aux-1').groupementType, TYPE_GROUPEMENT.AFFRETEUR);
  });

  it('rend le journal des messages sans adresse', () => {
    const t = texteDe(vues.messagerie(ctxDe('u-conc')));
    assert.ok(t.includes('Journal des messages'));
    assert.ok(!t.includes('inscrit.affreteur@demo.invalid'));
  });

  it('rend le profil et les messages', () => {
    assert.ok(texteDe(vues.profil(ctxDe('u-caisse'))).includes('Agent de caisse'));
    assert.ok(texteDe(vues.messages(ctxDe('u-b1-aff'))).includes('Votre inscription à la Bourse de Fret est enregistrée'));
  });

  it('rend les pages publiques', () => {
    assert.ok(texteDe(vues.inscription()).includes('Intermédiaire de fret'));
    assert.ok(texteDe(vues.inscription({ type: 'transporteur' })).includes('Continuer'));
    assert.ok(texteDe(vues.motDePasseOublie()).includes('Recevoir un code'));
    assert.ok(texteDe(vues.boiteSimulee()).includes('simulés'));
  });
});
