/**
 * Lot b3 — marché, flotte, attestation et contrôle sur route.
 *
 * Chaque bloc pose le cas nominal et les refus : mauvais rôle, autre
 * entreprise, état invalide. Les services tournent sous Node, en mémoire, sur
 * le jeu de démonstration complété par `seed-lot-b3.js`.
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
const { amorcer } = await import('../js/seed.js');
const { completerLotB3 } = await import('../js/seed-lot-b3.js');
const { contexteDe } = await import('../js/services/auth.service.js');
const matching = await import('../js/services/matching.service.js');
const flotte = await import('../js/services/flotte.service.js');
const chauffeurs = await import('../js/services/chauffeur.service.js');
const demandes = await import('../js/services/demande.service.js');
const offres = await import('../js/services/offre-gestion.service.js');
const attestations = await import('../js/services/attestation.service.js');
const controle = await import('../js/services/controle-route.service.js');
const verification = await import('../js/services/verification.service.js');
const regles = await import('../js/domain/attestation.regles.js');
const { motifInaptitude, compatibilitePermis } = await import('../js/domain/chauffeur.regles.js');
const { matriceQr } = await import('../js/core/qr.js');
const { decider } = await import('../js/domain/access.js');
const { MATRICE } = await import('../js/domain/permissions.js');
const { entite, CLASSIFICATION } = await import('../js/domain/schema.js');
const {
  ETAT_APPARIEMENT,
  ETAT_ATTESTATION,
  ETAT_DEMANDE,
  EVENEMENT_AUDIT,
  MODE_CONTROLE,
  MOTIF_REJET,
  RESULTAT_CONTROLE,
  SENS_APPARIEMENT,
} = await import('../js/domain/enums.js');

const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));
const audits = (evt) => depot('audit').brutOu((e) => e.evenement === evt);
const dans = (jours) => new Date(Date.now() + jours * 86400000).toISOString();

async function installer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  await completerLotB3();
}

/** La proposition (sens B) installée par le jeu du lot. */
const proposition = () =>
  depot('appariement').brutOu((a) => a.demandeId === 'dem-b3-1' && a.sens === SENS_APPARIEMENT.DEMANDE_VERS_OFFRE)[0];

/** Jeton de l'attestation en vigueur du jeu. */
function jetonEnVigueur() {
  const att = depot('attestation').brutOu((a) => a.etat === ETAT_ATTESTATION.EN_VIGUEUR)[0];
  return attestations.attestationPourImpression(ctxDe('u-tra-1'), att.id);
}

/* ------------------------------------------------------------------ */

describe('Lot b3 — jeu de démonstration', () => {
  before(installer);

  it('est idempotent : un second passage ne crée aucun doublon', async () => {
    const compter = () => ['users', 'chauffeurs', 'offres', 'demandes', 'appariements', 'attestations']
      .map((c) => depot(c === 'users' ? 'utilisateur' : c === 'chauffeurs' ? 'chauffeur' : c === 'offres' ? 'offre'
        : c === 'demandes' ? 'demande' : c === 'appariements' ? 'appariement' : 'attestation').brutTous().length);
    const avant = compter();
    await completerLotB3();
    assert.deepEqual(compter(), avant);
  });

  it('installe une proposition en attente, une demande expirée et une attestation en vigueur', () => {
    assert.equal(proposition()?.etat, ETAT_APPARIEMENT.RESERVER);
    assert.ok(new Date(depot('demande').brutParId('dem-b3-2').departPrevu) < new Date());
    assert.equal(depot('attestation').brutOu((a) => a.etat === ETAT_ATTESTATION.EN_VIGUEUR).length, 1);
    assert.equal(depot('utilisateur').brutParId('u-ctrl')?.roleId, 'agent_controle_route');
  });
});

/* ------------------------------------------------------------------ */

describe('Lot b3 — l’affréteur répond aux propositions (sens B)', () => {
  beforeEach(installer);

  it('le transporteur ne répond pas à sa propre proposition', () => {
    assert.throws(() => matching.repondre(ctxDe('u-tra-1'), proposition().id, { accepte: true }));
  });

  it('l’auxiliaire de l’affréteur ne l’accepte pas, un autre affréteur non plus', () => {
    assert.throws(() => matching.repondre(ctxDe('u-aux-1'), proposition().id, { accepte: true }));
    assert.throws(() => matching.repondre(ctxDe('u-aff-2'), proposition().id, { accepte: true }));
    assert.equal(proposition().etat, ETAT_APPARIEMENT.RESERVER);
  });

  it('un refus exige un motif, et la précision refuse les coordonnées', () => {
    const id = proposition().id;
    assert.throws(() => matching.repondre(ctxDe('u-aff-1'), id, { accepte: false }));
    assert.throws(() => matching.repondre(ctxDe('u-aff-1'), id, {
      accepte: false, motif: MOTIF_REJET.PRIX_TROP_ELEVE, precision: 'Appelez-moi au 07 07 07 07 07',
    }));
    assert.equal(proposition().etat, ETAT_APPARIEMENT.RESERVER);
  });

  it('refuser libère l’offre et la demande, et prévient le transporteur', () => {
    const a = proposition();
    matching.repondre(ctxDe('u-aff-1'), a.id, { accepte: false, motif: MOTIF_REJET.VEHICULE_INADAPTE });
    assert.equal(depot('appariement').brutParId(a.id).etat, ETAT_APPARIEMENT.REJETER);
    assert.equal(depot('offre').brutParId(a.offreId).etat, 'disponible');
    assert.equal(depot('demande').brutParId(a.demandeId).etat, ETAT_DEMANDE.PUBLIEE);
    const destinataires = new Set(depot('utilisateur').brutOu((u) => u.groupementId === a.groupementTransporteurId).map((u) => u.id));
    const notif = depot('notification').brutOu((n) => n.message?.code === 'proposition.refusee');
    assert.ok(notif.length && notif.every((n) => destinataires.has(n.destinataireUtilisateurId)));
  });

  it('accepter passe par matching.service, puis la validation reste celle du sens A', () => {
    const a = proposition();
    matching.repondre(ctxDe('u-aff-1'), a.id, { accepte: true });
    assert.equal(depot('appariement').brutParId(a.id).etat, ETAT_APPARIEMENT.ACCEPTER);
    assert.ok(depot('notification').brutOu((n) => n.message?.code === 'proposition.acceptee').length);
    const p = matching.preparerValidation(ctxDe('u-aff-1'), a.id);
    assert.equal(p.possible, true, p.refus?.join(' '));
    matching.valider(ctxDe('u-aff-1'), a.id, { attendu: p.attendu });
    assert.equal(depot('appariement').brutParId(a.id).etat, ETAT_APPARIEMENT.VALIDER);
  });
});

/* ------------------------------------------------------------------ */

describe('Lot b3 — modifier et republier une demande', () => {
  beforeEach(installer);

  /** Demande publiée, sans réservation, au départ futur. */
  const libre = () => depot('demande').brutOu((d) =>
    d.groupementId === 'grp-aff-1' && d.etat === ETAT_DEMANDE.PUBLIEE && new Date(d.departPrevu) > new Date() &&
    !depot('appariement').brutOu((a) => a.demandeId === d.id).length &&
    depot('demande').brutOu((x) => x.declarationId === d.declarationId).length === 1)[0];

  const saisie = (d, modifs = {}) => ({
    besoin: {
      departPrevu: dans(6), arriveePrevue: dans(8), capaciteId: d.capaciteId, carrosserieId: d.carrosserieId,
      essieuxId: d.essieuxId, contraintes: d.contraintes, ...modifs,
    },
    lignes: d.lignes,
  });

  it('modifie une demande sans réservation, avec trace et journal', () => {
    const d = libre();
    const maj = demandes.modifierDemande(ctxDe('u-aff-1'), d.id, saisie(d));
    assert.equal(maj.historique.at(-1).action, 'modification');
    assert.match(maj.historique.at(-1).resume, /Champs modifiés/);
    assert.ok(audits(EVENEMENT_AUDIT.DEMANDE_MODIFIEE).some((e) => e.cibleId === d.id));
  });

  it('le filtre de coordonnées s’applique aux modifications', () => {
    const d = libre();
    assert.throws(() => demandes.modifierDemande(ctxDe('u-aff-1'), d.id, saisie(d, { contraintes: 'Joindre le 0707070707' })));
  });

  it('refuse une demande avec réservation engagée, d’une autre entreprise, ou un mauvais rôle', () => {
    const engagee = depot('demande').brutParId('dem-b3-1');
    assert.throws(() => demandes.modifierDemande(ctxDe('u-aff-1'), engagee.id, saisie(engagee)), /engagée/);
    const d = libre();
    assert.throws(() => demandes.modifierDemande(ctxDe('u-aff-2'), d.id, saisie(d)));
    assert.throws(() => demandes.modifierDemande(ctxDe('u-tra-1'), d.id, saisie(d)));
  });

  it('republie une demande expirée avec de nouvelles dates', () => {
    const maj = demandes.republierDemande(ctxDe('u-aff-1'), 'dem-b3-2', { departPrevu: dans(3), arriveePrevue: dans(5) });
    assert.equal(maj.etat, ETAT_DEMANDE.PUBLIEE);
    assert.ok(maj.republieeLe);
    assert.equal(maj.historique.at(-1).action, 'republication');
    assert.ok(audits(EVENEMENT_AUDIT.DEMANDE_REPUBLIEE).some((e) => e.cibleId === 'dem-b3-2'));
  });

  it('republie une demande annulée ; refuse une demande en cours ou d’autrui', () => {
    const d = libre();
    assert.throws(() => demandes.republierDemande(ctxDe('u-aff-1'), d.id, { departPrevu: dans(3), arriveePrevue: dans(5) }));
    assert.throws(() => demandes.republierDemande(ctxDe('u-aff-2'), 'dem-b3-2', { departPrevu: dans(3), arriveePrevue: dans(5) }));
    depot('demande').modifier(d.id, { etat: ETAT_DEMANDE.ANNULEE, annuleeLe: new Date().toISOString() });
    assert.equal(demandes.republierDemande(ctxDe('u-aff-1'), d.id, { departPrevu: dans(3), arriveePrevue: dans(5) }).etat, ETAT_DEMANDE.PUBLIEE);
  });
});

/* ------------------------------------------------------------------ */

describe('Lot b3 — modifier et dupliquer une offre', () => {
  beforeEach(installer);

  const saisieDe = (o, modifs = {}) => ({
    vehiculeId: o.vehiculeId, chauffeurPressentiId: o.chauffeurPressentiId, localiteDepartId: o.localiteDepartId,
    localiteArriveeId: o.localiteArriveeId, disponibleDu: dans(2), disponibleAu: dans(9), prixKmT: o.prixKmT, ...modifs,
  });

  /** Un véhicule libre du transporteur : la copie peut porter un autre camion. */
  const libre = () => flotte.mesVehicules(ctxDe('u-tra-1')).find((v) => v.publiable).id;

  it('duplique une offre : nouvelle référence, lien vers l’origine, journal', () => {
    const source = depot('offre').brutParId('off-b3-2');
    const copie = flotte.publierOffre(ctxDe('u-tra-1'), { ...saisieDe(source, { vehiculeId: libre() }), dupliqueeDeOffreId: source.id });
    assert.notEqual(copie.reference, source.reference);
    assert.equal(copie.dupliqueeDeOffreId, source.id);
    assert.ok(audits(EVENEMENT_AUDIT.OFFRE_DUPLIQUEE).some((e) => e.cibleId === copie.id));
  });

  it('refuse la copie de l’offre d’une autre entreprise', () => {
    const autre = depot('offre').brutOu((o) => o.groupementId !== 'grp-tra-1')[0];
    assert.throws(() => flotte.publierOffre(ctxDe('u-tra-1'), { ...saisieDe(depot('offre').brutParId('off-b3-2'), { vehiculeId: libre() }), dupliqueeDeOffreId: autre.id }), /groupement/);
  });

  it('modifie une offre disponible ; refuse une offre engagée, d’autrui, ou sans changement', () => {
    const copie = flotte.publierOffre(ctxDe('u-tra-1'), saisieDe(depot('offre').brutParId('off-b3-2'), { vehiculeId: libre() }));
    const maj = offres.modifierOffre(ctxDe('u-tra-1'), copie.id, saisieDe(copie, { prixKmT: 120 }));
    assert.equal(maj.prixKmT, 120);
    assert.ok(audits(EVENEMENT_AUDIT.OFFRE_MODIFIEE).some((e) => e.cibleId === copie.id));
    assert.throws(() => offres.modifierOffre(ctxDe('u-tra-1'), 'off-b3-2', saisieDe(depot('offre').brutParId('off-b3-2'))));
    assert.throws(() => offres.modifierOffre(ctxDe('u-tra-2'), copie.id, saisieDe(copie, { prixKmT: 130 })));
    assert.throws(() => offres.modifierOffre(ctxDe('u-tra-1'), copie.id, saisieDe(maj, {
      disponibleDu: maj.disponibleDu, disponibleAu: maj.disponibleAu,
    })), /Aucune modification/);
  });
});

/* ------------------------------------------------------------------ */

describe('Lot b3 — fiche, retrait et réactivation des chauffeurs', () => {
  beforeEach(installer);

  const fiche = (modifs = {}) => ({
    nom: 'YAO Serge (DÉMO)', permisNumero: 'PC-TEST-0100', permisEcheance: dans(400).slice(0, 10),
    telephone: '+225 00 00 01 00', pieceType: 'cni', pieceNumero: 'CI-TEST-0100',
    pieceDelivreeLe: dans(-300).slice(0, 10), pieceExpireLe: dans(900).slice(0, 10), nationalite: 'Ivoirienne',
    dateNaissance: '1988-05-01', permisCategories: ['B', 'C', 'E'], ...modifs,
  });

  it('les données d’identité sont classées IDENTITE au schéma', () => {
    const champs = entite('chauffeur').champs;
    for (const c of ['pieceType', 'pieceNumero', 'pieceDelivreeLe', 'pieceExpireLe', 'nationalite', 'dateNaissance', 'permisCategories', 'photo']) {
      assert.equal(champs[c].classification, CLASSIFICATION.IDENTITE, c);
    }
  });

  it('exige la fiche complète à la création, et la journalise', () => {
    assert.throws(() => chauffeurs.enregistrerChauffeur(ctxDe('u-tra-1'), fiche({ nationalite: '' })), /Fiche incomplète/);
    assert.throws(() => chauffeurs.enregistrerChauffeur(ctxDe('u-tra-1'), fiche({ permisCategories: ['Z'] })));
    assert.throws(() => chauffeurs.enregistrerChauffeur(ctxDe('u-tra-1'), fiche({ dateNaissance: dans(-365 * 10).slice(0, 10) })));
    const c = chauffeurs.enregistrerChauffeur(ctxDe('u-tra-1'), fiche());
    assert.equal(c.actif, true);
    assert.ok(audits(EVENEMENT_AUDIT.CHAUFFEUR_ENREGISTRE).some((e) => e.cibleId === c.id));
  });

  it('refuse un autre groupement et un rôle sans droit', () => {
    assert.throws(() => chauffeurs.enregistrerChauffeur(ctxDe('u-tra-2'), fiche(), 'chf-1'));
    assert.throws(() => chauffeurs.enregistrerChauffeur(ctxDe('u-aff-1'), fiche()));
  });

  it('une pièce d’identité modifiée après contrôle doit être contrôlée de nouveau', () => {
    assert.ok(depot('chauffeur').brutParId('chf-1').verifieLe);
    chauffeurs.enregistrerChauffeur(ctxDe('u-tra-1'), { ...fiche(), nom: 'KOUASSI Yao (DÉMO)', permisNumero: 'PC-DEMO-0001', pieceNumero: 'CI-DEMO-9999' }, 'chf-1');
    assert.equal(depot('chauffeur').brutParId('chf-1').verifieLe, null);
  });

  it('l’agent d’activation n’atteste pas une pièce expirée', () => {
    const c = chauffeurs.enregistrerChauffeur(ctxDe('u-tra-1'), fiche({ pieceDelivreeLe: dans(-3000).slice(0, 10), pieceExpireLe: dans(-2).slice(0, 10) }));
    assert.throws(() => verification.verifierChauffeur(ctxDe('u-activ'), c.id), /pièce d’identité/);
  });

  it('retrait : motif et date exigés, historique conservé, plus proposé, réactivable', () => {
    assert.throws(() => chauffeurs.retirerChauffeur(ctxDe('u-tra-1'), 'chf-2', { dateDepart: dans(-1).slice(0, 10) }), /motif/);
    assert.throws(() => chauffeurs.retirerChauffeur(ctxDe('u-tra-2'), 'chf-2', { dateDepart: dans(-1).slice(0, 10), motif: 'Départ' }));
    const apercu = chauffeurs.apercuRetrait(ctxDe('u-tra-1'), 'chf-2');
    assert.equal(apercu.retirable, true, apercu.motif);
    assert.deepEqual(apercu.disponibilites.length > 0, true, 'le retrait est annoncé avant d’être fait');
    const { chauffeur } = chauffeurs.retirerChauffeur(ctxDe('u-tra-1'), 'chf-2', { dateDepart: dans(-1).slice(0, 10), motif: 'Démission' });
    assert.equal(chauffeur.actif, false);
    assert.equal(chauffeur.mouvements.at(-1).type, 'retrait');
    assert.ok(audits(EVENEMENT_AUDIT.CHAUFFEUR_RETIRE).some((e) => e.cibleId === 'chf-2'));
    assert.ok(depot('chauffeur').brutParId('chf-2'), 'le chauffeur n’est jamais supprimé');
    assert.ok(!depot('offre').brutOu((o) => o.etat === 'disponible' && o.chauffeurPressentiId === 'chf-2').length);
    assert.throws(() => flotte.publierOffre(ctxDe('u-tra-1'), {
      vehiculeId: 'veh-1', chauffeurPressentiId: 'chf-2', localiteDepartId: 'loc-abidjan', localiteArriveeId: 'loc-bouake',
      disponibleDu: dans(2), disponibleAu: dans(9),
    }), /retiré|vérifi/);
    const r = chauffeurs.reactiverChauffeur(ctxDe('u-tra-1'), 'chf-2');
    assert.equal(r.actif, true);
    assert.deepEqual(r.mouvements.map((m) => m.type).slice(-2), ['retrait', 'reactivation']);
  });

  it('le chauffeur retiré du jeu n’est pas proposable ; un permis échu non plus', () => {
    const parti = depot('chauffeur').brutParId('chf-b3-1');
    assert.match(motifInaptitude(parti), /retiré/);
    assert.match(motifInaptitude({ ...parti, actif: true, permisEcheance: dans(-3).slice(0, 10) }), /échu/);
  });

  it('catégorie incompatible : C sans E ne conduit pas un ensemble de quatre essieux', () => {
    assert.equal(compatibilitePermis(['B', 'C'], { ptacT: 48 }, '4').compatible, false);
    assert.equal(compatibilitePermis(['C', 'E'], { ptacT: 48 }, '4').compatible, true);
    assert.equal(compatibilitePermis(['C'], { ptacT: 3 }, null).compatible, true, 'la catégorie C couvre la B');
    assert.match(motifInaptitude(depot('chauffeur').brutParId('chf-2'), { ptacT: 48 }, '4'), /ne couvre pas/);
  });
});

/* ------------------------------------------------------------------ */

describe('Lot b3 — attestation de bourse de fret', () => {
  beforeEach(installer);

  it('le jeton est non devinable et le chemin du QR n’expose que lui', () => {
    const imp = jetonEnVigueur();
    assert.equal(imp.jeton.length, regles.LONGUEUR_JETON);
    assert.ok(!imp.chemin.includes(imp.attestation.id));
    assert.ok(!imp.chemin.includes(imp.attestation.reference));
    assert.equal(regles.normaliserCode(`https://exemple.invalid/${imp.chemin}`), imp.jeton);
    assert.equal(regles.normaliserCode(imp.code.toLowerCase()), imp.jeton);
    assert.equal(entite('attestation').champs.jeton.classification, CLASSIFICATION.SYSTEME);
  });

  it('la liste du transporteur ne sert jamais le jeton', () => {
    const dossiers = attestations.dossiersAttestation(ctxDe('u-tra-1'));
    assert.ok(dossiers.some((d) => d.attestation));
    for (const d of dossiers) assert.equal(d.attestation?.jeton, undefined);
  });

  it('l’impression est réservée au transporteur titulaire', () => {
    const att = depot('attestation').brutTous()[0];
    assert.throws(() => attestations.attestationPourImpression(ctxDe('u-tra-2'), att.id));
    assert.throws(() => attestations.attestationPourImpression(ctxDe('u-aff-1'), att.id));
  });

  it('n’émet que pour une mise en relation validée, une seule en vigueur, par le transporteur', () => {
    const att = depot('attestation').brutTous()[0];
    assert.throws(() => attestations.emettreAttestation(ctxDe('u-tra-1'), att.appariementId), /déjà en vigueur/);
    assert.throws(() => attestations.emettreAttestation(ctxDe('u-aff-1'), att.appariementId));
    assert.throws(() => attestations.emettreAttestation(ctxDe('u-tra-1'), proposition().id), /validée/);
  });

  it('annuler exige un motif ; une nouvelle attestation porte un nouveau code', () => {
    const att = depot('attestation').brutTous()[0];
    assert.throws(() => attestations.annulerAttestation(ctxDe('u-tra-1'), att.id, ' '));
    assert.throws(() => attestations.annulerAttestation(ctxDe('u-tra-2'), att.id, 'Fraude'));
    attestations.annulerAttestation(ctxDe('u-tra-1'), att.id, 'Véhicule remplacé');
    assert.ok(audits(EVENEMENT_AUDIT.ATTESTATION_ANNULEE).some((e) => e.cibleId === att.id));
    const nouvelle = attestations.emettreAttestation(ctxDe('u-tra-1'), att.appariementId);
    assert.notEqual(depot('attestation').brutParId(nouvelle.id).jeton, att.jeton);
  });

  it('l’état se calcule à la lecture : l’échéance fait autorité', () => {
    const a = { etat: ETAT_ATTESTATION.EN_VIGUEUR, valableJusquau: dans(1) };
    assert.equal(regles.etatAttestation(a), ETAT_ATTESTATION.EN_VIGUEUR);
    assert.equal(regles.etatAttestation(a, new Date(Date.now() + 2 * 86400000)), ETAT_ATTESTATION.EXPIREE);
    assert.equal(regles.etatAttestation({ ...a, etat: ETAT_ATTESTATION.ANNULEE }), ETAT_ATTESTATION.ANNULEE);
  });

  it('le QR code est une matrice carrée de taille réglementaire', () => {
    const m = matriceQr(`http://localhost:8103/${jetonEnVigueur().chemin}`);
    assert.equal(m.length, m[0].length);
    assert.equal((m.length - 17) % 4, 0);
  });
});

/* ------------------------------------------------------------------ */

describe('Lot b3 — contrôle sur route', () => {
  beforeEach(installer);

  it('le rôle ne lit ni coordonnées, ni marché, ni finances', () => {
    const droits = Object.keys(MATRICE.agent_controle_route);
    assert.deepEqual(droits.sort(), ['controle.historique', 'controle.verifier']);
    assert.equal(decider(ctxDe('u-ctrl'), 'coordonnees.lire').autorise, false);
  });

  it('un acteur du marché ne contrôle pas', () => {
    assert.throws(() => controle.verifierAttestation(ctxDe('u-tra-1'), jetonEnVigueur().code));
    assert.throws(() => controle.verifierAttestation(ctxDe('u-aff-1'), jetonEnVigueur().code));
  });

  it('valide : verdict, strict nécessaire, journal et historique', () => {
    const { code } = jetonEnVigueur();
    const v = controle.verifierAttestation(ctxDe('u-ctrl'), code, { lieu: 'Poste nord' });
    assert.equal(v.resultat, RESULTAT_CONTROLE.VALIDE);
    assert.deepEqual(Object.keys(v.fiche).sort(), [
      'annuleeLe', 'arrivee', 'arriveePrevue', 'carteTransport', 'depart', 'departPrevu', 'genereeLe',
      'immatriculation', 'reference', 'valableJusquau',
    ]);
    assert.ok(audits(EVENEMENT_AUDIT.ATTESTATION_VERIFIEE).length >= 1);
    const mes = controle.mesControles(ctxDe('u-ctrl'));
    assert.equal(mes[0].id, v.controleId);
    assert.equal(mes[0].lieu, 'Poste nord');
  });

  it('un code inconnu est journalisé lui aussi', () => {
    const v = controle.verifierAttestation(ctxDe('u-ctrl'), 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ12');
    assert.equal(v.resultat, RESULTAT_CONTROLE.INCONNUE);
    assert.equal(v.fiche, null);
    assert.equal(depot('controle').brutParId(v.controleId).resultat, RESULTAT_CONTROLE.INCONNUE);
    assert.throws(() => controle.verifierAttestation(ctxDe('u-ctrl'), '   '));
  });

  it('une attestation annulée se lit annulée', () => {
    const imp = jetonEnVigueur();
    attestations.annulerAttestation(ctxDe('u-tra-1'), imp.attestation.id, 'Transport interrompu');
    assert.equal(controle.verifierAttestation(ctxDe('u-ctrl'), imp.code).resultat, RESULTAT_CONTROLE.ANNULEE);
  });

  it('page publique : journalisée sans agent, et sans coordonnées', () => {
    const { jeton } = jetonEnVigueur();
    const v = controle.verifierPublic(jeton, null);
    assert.equal(v.agent, false);
    const ligne = depot('controle').brutParId(v.controleId);
    assert.equal(ligne.mode, MODE_CONTROLE.PUBLIC);
    assert.equal(ligne.agentUtilisateurId, null);
    const texte = JSON.stringify(v);
    assert.ok(!/raisonSociale|telephone|email|DÉMO\b.*Export/.test(texte));
    // L'agent connecté qui ouvre le QR voit le contrôle imputé à son nom.
    assert.equal(controle.verifierPublic(jeton, ctxDe('u-ctrl')).agent, true);
  });

  it('l’agent ne retrouve que ses propres contrôles', () => {
    const { code, jeton } = jetonEnVigueur();
    controle.verifierPublic(jeton, null);
    controle.verifierAttestation(ctxDe('u-ctrl'), code);
    const mes = controle.mesControles(ctxDe('u-ctrl'));
    assert.equal(mes.length, 1);
    assert.throws(() => controle.mesControles(ctxDe('u-tra-1')));
  });
});
