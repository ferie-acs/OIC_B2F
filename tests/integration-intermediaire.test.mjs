/**
 * Intégration des lots b1 et b2 : l'intermédiaire de fret de bout en bout.
 *
 * Inscription en ligne (b1) → compte limité à son dossier → contrôle des pièces
 * et activation en quatre yeux (b1) → rôle `intermediaire` et annuaire (b2) →
 * désignation par un mandant → action au nom du mandant, tracée.
 * L'état de vérification écrit par b1 est celui que lisent les filiales (b2).
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

const { installerDom } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer, completerJeuAntiFraude } = await import('../js/seed.js');
const { amorcerLotB1 } = await import('../js/seed-lot-b1.js');
const { completerJeuLotB2 } = await import('../js/seed-lot-b2.js');
const { contexteDe, connecter } = await import('../js/services/auth.service.js');
const inscription = await import('../js/services/inscription.service.js');
const verification = await import('../js/services/verification.service.js');
const mandats = await import('../js/services/mandat.service.js');
const filiales = await import('../js/services/filiale.service.js');
const fret = await import('../js/services/fret.service.js');
const dgttc = await import('../js/services/dgttc.service.js');
const { decider, MOTIF_REFUS } = await import('../js/domain/access.js');
const { arborescenceDe, routeAccueil, localiser } = await import('../js/core/nav.js');
const dom = await import('../js/domain/inscription.js');
const { entrepriseVerifiee, entiteOperationnelle, mereVerifiee } = await import('../js/domain/organisation.js');
const { ETAT_INSCRIPTION, ETAT_VERIFICATION, PERIMETRE_MANDAT, EVENEMENT_AUDIT, TYPE_GROUPEMENT } = await import('../js/domain/enums.js');

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));
const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fichier = (nom) => ({ nom, type: 'application/pdf', taille: 120000 });

const SAISIE = {
  type: TYPE_GROUPEMENT.INTERMEDIAIRE,
  raisonSociale: 'Ébène Fret Conseil DÉMO',
  rccm: 'CI-INTEG-0001',
  compteContribuable: 'CC-INTEG-0001',
  pays: 'Côte d’Ivoire',
  localiteId: 'loc-abidjan',
  adresse: 'Plateau, Abidjan (DÉMO)',
  contactTelephone: '+225 00 00 09 09',
  contactEmail: 'contact@ebene-fret.invalid',
  agrementNumero: 'AG-INTEG-0001',
  agrementEcheance: jour(300),
  nom: 'Kassi',
  prenom: 'Aya',
  telephone: '+225 00 00 09 10',
  email: 'aya.kassi@ebene-fret.invalid',
  motDePasse: 'secret2026',
  confirmation: 'secret2026',
  attestation: true,
};

describe('Intégration b1 / b2 — l’intermédiaire de fret inscrit en ligne', () => {
  /** @type {{groupementId: string, utilisateurId: string}} */
  let inscrit;
  /** @type {string} */
  let mandatId;

  before(async () => {
    memoireSession.clear();
    initialiserPersistance({ backend: backendMemoire() });
    await amorcer();
    await completerJeuAntiFraude();
    await amorcerLotB1();
    await completerJeuLotB2();
    inscrit = await inscription.inscrire(SAISIE);
  });

  it('reçoit le rôle intermédiaire et un état de vérification « à vérifier »', () => {
    const u = depot('utilisateur').brutParId(inscrit.utilisateurId);
    const g = depot('groupement').brutParId(inscrit.groupementId);
    assert.equal(u.roleId, 'intermediaire');
    assert.equal(g.inscriptionEtat, ETAT_INSCRIPTION.EN_ATTENTE);
    assert.equal(g.verificationEtat, ETAT_VERIFICATION.A_VERIFIER);
    assert.equal(entrepriseVerifiee(g), false);
  });

  it('avant activation : seul « Mon compte » est ouvert, aucun mandat ne peut être exercé', () => {
    const ctx = ctxDe(inscrit.utilisateurId);
    assert.deepEqual(arborescenceDe(ctx).map((z) => z.id), ['moncompte']);
    assert.equal(routeAccueil(ctx), '#/intermediaire/dossier');
    assert.ok(localiser(ctx, 'profil') && localiser(ctx, 'messages'));
    const r = decider(ctx, 'mandat.agir', { groupementId: ctx.groupementId });
    assert.equal(r.autorise, false);
    assert.equal(r.motif, MOTIF_REFUS.INSCRIPTION_EN_ATTENTE);
  });

  it('n’apparaît pas dans l’annuaire et ne peut pas être désigné', () => {
    const annuaire = mandats.annuaireIntermediaires(ctxDe('u-aff-1')).map((i) => i.id);
    assert.ok(!annuaire.includes(inscrit.groupementId));
    assert.throws(() => mandats.designerIntermediaire(ctxDe('u-aff-1'), {
      intermediaireId: inscrit.groupementId, perimetre: [PERIMETRE_MANDAT.DECLARER_FRET], debuteLe: jour(0), finitLe: jour(30),
    }), /annuaire/);
  });

  it('s’active en quatre yeux : pièces conformes par un agent, activation par un autre', () => {
    const ctx = ctxDe(inscrit.utilisateurId);
    for (const p of dom.piecesDuType(TYPE_GROUPEMENT.INTERMEDIAIRE).filter((x) => x.requise)) {
      inscription.deposerPiece(ctx, { typePiece: p.code, numero: 'N-1', expireLe: p.echeance ? jour(300) : undefined, fichier: fichier(`${p.code}.pdf`) });
    }
    const agent = ctxDe('u-activ-aff');
    const courantes = dom.piecesCourantes(depot('piece').brutOu((p) => p.groupementId === inscrit.groupementId));
    for (const p of courantes.values()) verification.deciderPiece(agent, p.id, { conforme: true });
    assert.throws(() => verification.activerEntreprise(agent, inscrit.groupementId), /autre/);
    verification.activerEntreprise(ctxDe('u-activ-aff-2'), inscrit.groupementId);

    const g = depot('groupement').brutParId(inscrit.groupementId);
    assert.equal(g.inscriptionEtat, ETAT_INSCRIPTION.ACTIVEE);
    assert.equal(g.verificationEtat, ETAT_VERIFICATION.VERIFIE);
    assert.match(g.codeBfci, /^BFCI-\d{4}-\d{5}$/);
    assert.equal(depot('utilisateur').brutParId(inscrit.utilisateurId).roleId, 'intermediaire');
  });

  it('activé : espace Intermédiaire complet, présent dans l’annuaire', () => {
    const ctx = ctxDe(inscrit.utilisateurId);
    assert.equal(ctx.inscriptionActivee, true);
    assert.equal(ctx.abonnementActif, true);
    const zones = arborescenceDe(ctx).map((z) => z.id);
    for (const z of ['pilotage', 'mandants', 'compte', 'parametres', 'moncompte']) assert.ok(zones.includes(z), z);
    assert.ok(mandats.annuaireIntermediaires(ctxDe('u-aff-1')).some((i) => i.id === inscrit.groupementId));
  });

  it('désigné par un affréteur, il agit en son nom et chaque action est tracée', () => {
    const m = mandats.designerIntermediaire(ctxDe('u-aff-1'), {
      intermediaireId: inscrit.groupementId,
      perimetre: [PERIMETRE_MANDAT.DECLARER_FRET, PERIMETRE_MANDAT.GERER_RESERVATIONS],
      debuteLe: jour(0),
      finitLe: jour(60),
    });
    mandatId = m.id;
    const propre = ctxDe(inscrit.utilisateurId);
    const mesMandants = mandats.mesMandants(propre);
    assert.equal(mesMandants.length, 1);
    assert.equal(mesMandants[0].peutAgir, true);

    const delegue = mandats.agirPourMandant(propre, mandatId);
    assert.equal(delegue.groupementId, 'grp-aff-1');
    assert.equal(delegue.roleId, 'mandataire_affreteur');
    const { demande } = fret.publierFret(delegue, {
      fret: { libelle: 'Cacao — lot préparé par l’intermédiaire DÉMO', provenanceId: 'loc-abidjan', destinationId: 'loc-bouake' },
      besoin: {
        departPrevu: new Date(Date.now() + 2 * 86400000).toISOString(),
        arriveePrevue: new Date(Date.now() + 4 * 86400000).toISOString(),
        capaciteId: 'cap-25',
        carrosserieId: 'car-plateau',
      },
      lignes: [{ produitId: 'sh-1801', poidsT: 20 }],
    });
    assert.equal(demande.groupementId, 'grp-aff-1');
    const trace = depot('audit').brutOu((e) => e.mandatId === mandatId);
    assert.ok(trace.length >= 2, 'ouverture et déclaration tracées au nom du mandant');
    assert.ok(trace.every((e) => e.groupementId === 'grp-aff-1' && e.intermediaireGroupementId === inscrit.groupementId));
    assert.ok(trace.some((e) => e.evenement === EVENEMENT_AUDIT.MANDAT_OUVERT));
    // La validation reste au mandant.
    assert.equal(decider(delegue, 'appariement.valider', { groupementId: 'grp-aff-1' }).autorise, false);
    mandats.revenirAMonEspace();
  });

  it('la DGTTC voit l’intermédiaire et son mandant, sans coordonnée', () => {
    const lignes = dgttc.intermediaires(ctxDe('u-dgttc')).filter((l) => l.groupementId === inscrit.groupementId);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].role, 'Intermédiaire de fret');
    assert.ok(!JSON.stringify(lignes).includes('@'));
  });

  it('ses filiales lisent l’état écrit par l’agent d’activation', async () => {
    const ctx = ctxDe(inscrit.utilisateurId);
    const r = await filiales.creerFiliale(ctx, {
      raisonSociale: 'Ébène Fret Conseil, agence de Bouaké DÉMO',
      localiteId: 'loc-bouake',
      responsable: { nom: 'Koné', prenom: 'Issa', email: 'issa.kone@ebene-fret.invalid' },
    });
    assert.equal(r.active, true);
    const filialeId = r.filialeId;
    const filiale = depot('groupement').brutParId(filialeId);
    assert.ok(filiale, 'filiale créée');
    const mere = () => depot('groupement').brutParId(inscrit.groupementId);
    assert.equal(entiteOperationnelle(filiale, mere()), true);
    // L'agent retire la vérification : la filiale la perd aussitôt (héritage dynamique).
    depot('groupement').modifier(inscrit.groupementId, { verificationEtat: ETAT_VERIFICATION.REFUSE });
    assert.equal(mereVerifiee(mere()), false);
    assert.equal(entiteOperationnelle(filiale, mere()), false);
    assert.ok(!mandats.annuaireIntermediaires(ctxDe('u-aff-1')).some((i) => i.id === inscrit.groupementId));
    depot('groupement').modifier(inscrit.groupementId, { verificationEtat: ETAT_VERIFICATION.VERIFIE });
  });

  it('un état absent ne vaut « vérifié » que pour une entreprise antérieure à l’inscription en ligne', () => {
    assert.equal(entrepriseVerifiee({ type: 'affreteur' }), true);
    assert.equal(entrepriseVerifiee({ type: 'intermediaire' }), true);
    assert.equal(entrepriseVerifiee({ type: 'transporteur' }), false);
    assert.equal(entrepriseVerifiee({ type: 'affreteur', inscriptionEtat: ETAT_INSCRIPTION.EN_ATTENTE }), false);
    assert.equal(entrepriseVerifiee({ type: 'intermediaire', inscriptionEtat: ETAT_INSCRIPTION.ACTIVEE }), false);
  });

  it('un refus d’inscription écrit aussi le refus de vérification', async () => {
    const r = await inscription.inscrire({ ...SAISIE, raisonSociale: 'Refus Intermédiation DÉMO', rccm: 'CI-INTEG-0002', compteContribuable: 'CC-INTEG-0002', email: 'refus@ebene-fret.invalid' });
    verification.refuserInscription(ctxDe('u-activ-aff'), r.groupementId, 'Agrément illisible.');
    assert.equal(depot('groupement').brutParId(r.groupementId).verificationEtat, ETAT_VERIFICATION.REFUSE);
  });

  it('se connecte avec son mot de passe et retrouve son espace', async () => {
    const ctx = await connecter(SAISIE.email, SAISIE.motDePasse);
    assert.equal(ctx.roleId, 'intermediaire');
    assert.equal(routeAccueil(ctx), '#/intermediaire/dashboard');
  });
});
