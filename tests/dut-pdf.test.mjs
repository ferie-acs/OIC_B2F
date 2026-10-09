/**
 * PDF DUT — gabarit officiel porté du POC DUT.
 *
 * Trois objets :
 * 1. **La charge traduit B2F sans rien inventer.** Ce que le POC ne connaît pas
 *    reste vide : c'est la décision « cases à remplir », et un zéro imprimé à la
 *    place d'une donnée absente serait une affirmation fausse sur un document
 *    qui ressemble à un document officiel.
 * 2. **Le document se rend réellement.** Le gabarit est exécuté sous jsPDF, pas
 *    inspecté : recto-verso, annexes de débordement, pagination.
 * 3. **L'empreinte est sensible aux données.** Deux charges identiques donnent la
 *    même valeur, un champ modifié en donne une autre.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

const require = createRequire(import.meta.url);
const { jsPDF } = require('../js/vendor/jspdf.umd.min.js');

const { installerDom } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer } = await import('../js/seed.js');
const { contexteDe } = await import('../js/services/auth.service.js');
const matching = await import('../js/services/matching.service.js');
const { dossiersDut, genererDut } = await import('../js/services/dut.service.js');
const {
  COPIES,
  ETAT_FICHE,
  construireDutPdf,
  etatImpression,
  totauxFacturation,
  totauxMarchandises,
} = await import('../js/services/dut-pdf-gabarit.js');
const { canonique, construirePayload, empreinte } = await import(
  '../js/services/dut-pdf.service.js'
);

/** Les deux images d'en-tête du formulaire, lues depuis le dépôt. */
const images = {
  logo: `data:image/jpeg;base64,${fs.readFileSync('assets/logo-oic.jpg').toString('base64')}`,
  emblem: `data:image/png;base64,${fs.readFileSync('assets/armoiries-ci.png').toString('base64')}`,
};

/** @type {{transporteur: any, affreteur: any}} */
let ctx;
/** @type {string} */
let appariementId;

/** Mène une mise en relation jusqu'à la validation : état minimal d'un DUT. */
async function preparer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
  const de = (id) => contexteDe(depot('utilisateur').brutParId(id));
  ctx = { affreteur: de('u-aff-1'), transporteur: de('u-tra-1') };
  const ap = matching.engager(ctx.affreteur, { offreId: 'off-1', demandeId: 'dem-1' });
  matching.repondre(ctx.transporteur, ap.id, { accepte: true });
  const p = matching.preparerValidation(ctx.affreteur, ap.id);
  matching.valider(ctx.affreteur, ap.id, { attendu: p.attendu });
  ctx.affreteur = de('u-aff-1');
  ctx.transporteur = de('u-tra-1');
  return ap.id;
}

const dossierDe = (id) =>
  dossiersDut(ctx.transporteur).find((d) => d.appariement.id === id);

describe('La charge PDF traduit B2F sans rien inventer', () => {
  before(async () => {
    appariementId = await preparer();
  });

  it('laisse vides les rubriques que B2F ne porte pas', () => {
    const payload = construirePayload(dossierDe(appariementId));
    const d = payload.document;
    assert.equal(d.destinataire.raisonSociale, '');
    assert.equal(d.expediteur.adresse, '');
    assert.equal(d.expediteur.registre, '');
    assert.equal(d.antennaName, '');
    assert.equal(payload.operation, '');
    assert.equal(d.general.driverPiece, '');
    for (const poste of ['prixTransport', 'accessoires', 'complementaires', 'autres']) {
      assert.equal(d.facturation.expediteur[poste], null, poste);
      assert.equal(d.facturation.destinataire[poste], null, poste);
    }
    assert.equal(d.marchandises[0].quantite, null);
    assert.equal(d.marchandises[0].volumeM3, null);
    assert.equal(d.marchandises[0].valeur, null);
    // Une marchandise dangereuse non déclarée n'est pas une marchandise sûre.
    assert.equal(d.dangereuse, null);
    assert.equal(d.temperatureControlee, null);
  });

  it('reprend ce que B2F porte réellement', () => {
    const dossier = dossierDe(appariementId);
    const payload = construirePayload(dossier);
    const source = (dossier.document || dossier.apercu).donnees;
    assert.equal(payload.document.general.transporterName, source.transporteurRaisonSociale);
    assert.equal(payload.document.general.immatriculation, source.immatriculation);
    assert.equal(payload.document.expediteur.raisonSociale, source.affreteurRaisonSociale);
    assert.equal(payload.document.marchandises[0].poidsTonnes, source.poidsTotalT);
    assert.equal(payload.document.trajet.dateDepart, source.departPrevu);
    // Le corridor « Provenance > Destination » alimente les deux villes.
    const [depart, arrivee] = source.corridor.split(/\s*→\s*/);
    assert.equal(payload.document.trajet.chargement.ville, depart);
    assert.equal(payload.document.trajet.dechargement.ville, arrivee);
  });

  it('distingue l’aperçu de la fiche générée', () => {
    const avant = construirePayload(dossierDe(appariementId));
    assert.equal(avant.document.etat, ETAT_FICHE.APERCU);
    assert.equal(avant.document.dutNumber, '');
    genererDut(ctx.transporteur, appariementId);
    const apres = construirePayload(dossierDe(appariementId));
    assert.equal(apres.document.etat, ETAT_FICHE.GENERE);
    assert.match(apres.document.dutNumber, /^DUT-/);
  });

  it('refuse un exemplaire inconnu', () => {
    const dossier = dossierDe(appariementId);
    assert.throws(() => construirePayload(dossier, { copy: 'SOUCHE_X' }), /Exemplaire inconnu/);
    assert.equal(Object.keys(COPIES).length, 4);
  });

  it('traite les deux états en épreuve de travail, jamais en document officiel', () => {
    for (const etat of [ETAT_FICHE.APERCU, ETAT_FICHE.GENERE]) {
      const habillage = etatImpression({ etat });
      assert.equal(habillage.officiel, false);
      assert.equal(habillage.filigrane, 'SANS VALEUR');
      assert.equal(habillage.mention, 'NON OFFICIEL');
      assert.equal(habillage.qr, 'Aucun QR');
      assert.match(habillage.bandeau, /Épreuve de travail$/);
      assert.ok(habillage.avertissement.length > 40);
    }
  });
});

describe('Le PDF ne contourne pas la projection par rôle', () => {
  before(async () => {
    appariementId = await preparer();
    genererDut(ctx.transporteur, appariementId);
  });

  it('n’imprime pas les coordonnées pour un lecteur global sans droit contact', () => {
    // Le concessionnaire lit tous les DUT générés, mais sa classification ne
    // couvre pas les coordonnées : le PDF ne doit pas les lui rendre.
    const lecteur = contexteDe(depot('utilisateur').brutParId('u-conc'));
    const dossier = dossiersDut(lecteur).find((d) => d.appariement.id === appariementId);
    assert.ok(dossier, 'Le concessionnaire doit voir la fiche générée.');
    const { complements, general } = construirePayload(dossier).document;
    // La charge est bâtie sur la fiche DÉJÀ projetée : ce que l'écran cache à ce
    // rôle ne peut pas réapparaître dans le PDF.
    assert.equal(complements.transporteurTelephone, '');
    assert.equal(complements.transporteurEmail, '');
    assert.equal(complements.chauffeurTelephone, '');
    assert.equal(general.driverPermis, '');
  });

  it('les imprime pour le transporteur, à qui elles appartiennent', () => {
    const dossier = dossierDe(appariementId);
    const { complements } = construirePayload(dossier).document;
    assert.ok(complements.transporteurTelephone.length > 0);
  });
});

describe('Les totaux ne fabriquent pas de zéro', () => {
  it('rend null quand aucune ligne ne porte la donnée', () => {
    const totaux = totauxMarchandises([{ poidsTonnes: 12, quantite: null, volumeM3: null }]);
    assert.equal(totaux.poidsTonnes, 12);
    assert.equal(totaux.quantite, null);
    assert.equal(totaux.volumeM3, null);
    const f = totauxFacturation({ expediteur: {}, destinataire: {} });
    assert.equal(f.totalExpediteur, null);
    assert.equal(f.totalAPercevoir, null);
    assert.equal(f.tva, null);
  });

  it('additionne et applique la TVA quand la donnée existe', () => {
    const f = totauxFacturation({
      expediteur: { prixTransport: 1000000, accessoires: 200000, tvaRate: 18, timbre: 500 },
      destinataire: { prixTransport: 300000 },
    });
    assert.equal(f.totalExpediteur, 1200000);
    assert.equal(f.expediteur.tvaMontant, 216000);
    assert.equal(f.expediteur.total, 1416500);
    assert.equal(f.destinataire.tvaMontant, null);
    assert.equal(f.totalAPercevoir, 1416500 + 300000);
  });
});

describe('Le document se rend réellement', () => {
  before(async () => {
    appariementId = await preparer();
    genererDut(ctx.transporteur, appariementId);
  });

  it('produit le recto, le verso et l’annexe des mentions', async () => {
    const payload = construirePayload(dossierDe(appariementId));
    const doc = construireDutPdf(jsPDF, payload, await empreinte(payload), {
      ...images,
      qr: null,
    });
    // Recto + verso, plus l'annexe qui porte les données sans case au formulaire
    // (carte de transport, contacts, référence de mise en relation).
    assert.equal(doc.getNumberOfPages(), 3);
    assert.ok(doc.output('arraybuffer').byteLength > 20000);
  });

  it('reporte les marchandises en annexe au lieu de les perdre', async () => {
    const payload = construirePayload(dossierDe(appariementId));
    payload.document.marchandises = Array.from({ length: 40 }, (_, i) => ({
      designation: `Lot détaillé numéro ${i} avec une désignation longue`,
      nature: 'Produit agricole',
      emballage: 'Sacs de jute consignés',
      quantite: 120,
      poidsTonnes: 3.5,
      volumeM3: 8,
      valeur: 4500000,
      devise: 'FCFA',
    }));
    const doc = construireDutPdf(jsPDF, payload, await empreinte(payload), {
      ...images,
      qr: null,
    });
    assert.ok(doc.getNumberOfPages() > 3, `pages : ${doc.getNumberOfPages()}`);
  });

  it('se rend aussi sur un aperçu, sans référence attribuée', async () => {
    const neuf = await preparer();
    const payload = construirePayload(dossierDe(neuf));
    const doc = construireDutPdf(jsPDF, payload, await empreinte(payload), {
      ...images,
      qr: null,
    });
    assert.equal(doc.getNumberOfPages(), 3);
  });
});

describe('L’empreinte est sensible aux données', () => {
  before(async () => {
    appariementId = await preparer();
    genererDut(ctx.transporteur, appariementId);
  });

  it('ignore l’ordre des clés', () => {
    assert.equal(canonique({ b: 2, a: 1 }), canonique({ a: 1, b: 2 }));
    assert.equal(canonique({ a: undefined, b: 1 }), canonique({ b: 1 }));
  });

  it('rend 64 caractères hexadécimaux, stables à charge égale', async () => {
    const payload = construirePayload(dossierDe(appariementId), {
      generatedAt: '2026-10-02T12:00:00.000Z',
    });
    const valeur = await empreinte(payload);
    assert.match(valeur, /^[a-f0-9]{64}$/);
    assert.equal(valeur, await empreinte(payload));
  });

  it('change dès qu’un champ change', async () => {
    const payload = construirePayload(dossierDe(appariementId), {
      generatedAt: '2026-10-02T12:00:00.000Z',
    });
    const reference = await empreinte(payload);
    const modifie = structuredClone(payload);
    modifie.document.general.immatriculation = 'MODIFIE-00';
    assert.notEqual(reference, await empreinte(modifie));
    const autreExemplaire = construirePayload(dossierDe(appariementId), {
      copy: 'OIC',
      generatedAt: '2026-10-02T12:00:00.000Z',
    });
    assert.notEqual(reference, await empreinte(autreExemplaire));
  });
});
