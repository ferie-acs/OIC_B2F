/**
 * Gabarits PDF du lot b4 — **reçu de paiement** et **état financier**.
 *
 * Même habillage que le DUT (`dut-pdf-gabarit.js`) : armoiries et devise,
 * bandeau pleine largeur « Office Ivoirien des Chargeurs », bande guillochée,
 * sections numérotées aux titres capitalisés, libellés en petites capitales
 * grises, numéros en chiffres monospacés, empreinte SHA-256 en pied de page.
 * Mêmes encres, reprises à l'identique.
 *
 * **Le document dit ce qu'il est.** Les paiements du POC sont simulés : le reçu
 * porte la mention « Paiement simulé », le filigrane « DÉMONSTRATION » et un
 * avertissement explicite. Le premier tirage est l'**original** ; les suivants
 * sont des **duplicatas numérotés** — un reçu qu'on peut réimprimer sans le dire
 * permet de remettre deux fois le même justificatif.
 *
 * Module pur : ni stockage, ni DOM, ni réseau. Il reçoit des données déjà
 * projetées pour le lecteur et rend un document jsPDF — rendu sous Node par
 * `tests/lot-b4.test.mjs`.
 *
 * @module services/recu-pdf-gabarit
 */

import { enLettres, libelleFinance } from '../domain/finances.js';

/* Encres du gabarit DUT, reprises à l'identique. */
const ENCRE = [19, 47, 85];
const GRIS = [108, 119, 135];
const FILET = [214, 221, 230];
const FOND = [245, 248, 251];
const BLANC = [255, 255, 255];
/** Ardoise de « l'épreuve de travail » : le traitement d'un document non officiel. */
const ARDOISE = [90, 100, 118];
const VERT = [32, 110, 72];
const ORANGE = [168, 98, 18];
const ROUGE = [170, 45, 45];

/** Helvetica intégré n'a ni espace fine, ni tiret long, ni puce. */
const texte = (v) =>
  String(v ?? '')
    .replace(/[  ]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[’]/g, "'")
    .replace(/•/g, '*')
    .replace(/→/g, '>');

const ou = (v) => (v == null || v === '' ? '-' : texte(v));
const montantPdf = (n) => (typeof n === 'number' ? `${texte(n.toLocaleString('fr-FR'))} F CFA` : '-');
const datePdf = (v) => (v ? new Date(v).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '-');
const dateHeurePdf = (v) =>
  v
    ? `${new Date(v).toLocaleDateString('fr-FR')} à ${new Date(v)
        .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        .replace(':', ' h ')}`
    : '-';

/** Teinte de la pastille d'état. */
const TEINTE_ETAT = { encaisse: VERT, en_attente: ORANGE, rejete: ROUGE };

/**
 * Primitives communes aux deux gabarits.
 * @param {any} doc Document jsPDF.
 */
function outils(doc) {
  function put(valeur, x, y, o = {}) {
    const { taille = 9, gras = false, italique = false, police = 'helvetica', couleur = ENCRE, espace = 0, align, angle } = o;
    doc.setFont(police, gras && italique ? 'bolditalic' : gras ? 'bold' : italique ? 'italic' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
    doc.setCharSpace(espace);
    doc.text(Array.isArray(valeur) ? valeur.map(texte) : texte(valeur), x, y, {
      ...(align ? { align } : {}),
      ...(angle ? { angle } : {}),
    });
    doc.setCharSpace(0);
  }
  function largeur(valeur, { taille = 9, gras = false, police = 'helvetica', espace = 0 } = {}) {
    const brut = texte(valeur);
    doc.setFont(police, gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    return doc.getTextWidth(brut) + espace * Math.max(0, brut.length - 1);
  }
  const putDroite = (valeur, xDroite, y, o = {}) => put(valeur, xDroite - largeur(valeur, o), y, o);
  const filet = (x1, y, x2, couleur = FILET, epaisseur = 0.2) => {
    doc.setDrawColor(...couleur);
    doc.setLineWidth(epaisseur);
    doc.line(x1, y, x2, y);
  };
  const decouper = (valeur, w, taille = 8.5, gras = false) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    return doc.splitTextToSize(texte(valeur ?? ''), w);
  };
  function pastille(libelle, x, y, { pleine = null, bord = FILET, encre = ENCRE, taille = 6.2, espace = 0.3, h = 5 } = {}) {
    const w = largeur(libelle, { taille, gras: true, espace }) + 6;
    if (pleine) doc.setFillColor(...pleine);
    doc.setDrawColor(...bord);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 1.1, 1.1, pleine ? 'FD' : 'D');
    put(libelle, x + 3, y + h / 2 + 1.1, { taille, gras: true, couleur: encre, espace });
    return w;
  }
  function section(numero, titre, x1, x2, y) {
    doc.setFillColor(...ENCRE);
    doc.rect(x1, y - 2.4, 2.2, 2.2, 'F');
    const libelle = `${numero} · ${titre}`;
    put(libelle, x1 + 4.2, y, { taille: 6.8, gras: true, espace: 0.5 });
    filet(x1 + 6.8 + largeur(libelle, { taille: 6.8, gras: true, espace: 0.5 }), y - 0.9, x2);
  }
  function champ(libelle, valeur, x, y, w, { taille = 8.6, gras = true, police = 'helvetica', lignes = 2 } = {}) {
    put(libelle.toUpperCase(), x, y, { taille: 5.4, gras: true, couleur: GRIS, espace: 0.4 });
    const l = decouper(ou(valeur), w, taille, gras).slice(0, lignes);
    put(l, x, y + 4, { taille, gras, police });
    return y + 4 + l.length * taille * 0.42;
  }
  function guilloche(y, l) {
    doc.setDrawColor(...ARDOISE);
    doc.setLineWidth(0.8);
    for (let x = 0; x < l; x += 3.2) doc.line(x, y + 0.5, x + 1.7, y + 0.5);
    doc.setDrawColor(130, 148, 172);
    doc.setLineWidth(0.3);
    for (let x = 1.6; x < l; x += 3.2) doc.line(x, y + 1.2, x + 1, y + 1.2);
  }
  function entete({ largeurPage, x1, x2, sousTitre, mention, logo, emblem }) {
    if (emblem) doc.addImage(emblem, 'PNG', x1, 5, 10.5, 9.3);
    put("RÉPUBLIQUE DE CÔTE D'IVOIRE", x1 + 13.5, 9.6, { taille: 7.6, gras: true, espace: 0.45 });
    put('Union · Discipline · Travail', x1 + 13.5, 13.2, { taille: 6, italique: true, couleur: GRIS });
    if (logo) doc.addImage(logo, 'JPEG', x2 - 17, 3.5, 17, 17);
    doc.setFillColor(...ARDOISE);
    doc.rect(0, 22, largeurPage, 12, 'F');
    put('Office Ivoirien des Chargeurs', x1, 27.4, { taille: 10.5, gras: true, police: 'times', couleur: BLANC });
    put(sousTitre, x1, 31.6, { taille: 6.4, gras: true, espace: 0.6, couleur: BLANC });
    const style = { taille: 6.2, gras: true, espace: 0.45 };
    const w = largeur(mention, style) + 7;
    doc.setDrawColor(...BLANC);
    doc.setLineWidth(0.3);
    doc.roundedRect(x2 - w, 24.6, w, 5.2, 1.1, 1.1, 'D');
    put(mention, x2 - w + 3.5, 28.1, { ...style, couleur: BLANC });
    guilloche(34, largeurPage);
  }
  function filigrane(libelle, cx, cy, taille) {
    const style = { taille, gras: true, couleur: [206, 211, 219], espace: 1.6 };
    doc.setGState(new doc.GState({ opacity: 0.35 }));
    put(libelle, cx - largeur(libelle, style) / 2, cy, { ...style, angle: 24 });
    doc.setGState(new doc.GState({ opacity: 1 }));
  }
  return { put, putDroite, largeur, filet, decouper, pastille, section, champ, entete, filigrane };
}

/* ================================================================== *
 * Reçu de paiement — A5 portrait
 * ================================================================== */

/**
 * @param {Function} jsPDF Constructeur jsPDF.
 * @param {Record<string, any>} recu Données projetées (`paiementDetaille`).
 * @param {{empreinte?: string, rang?: number, logo?: string, emblem?: string}} [options]
 * @returns {any} Document jsPDF.
 */
export function construireRecuPdf(jsPDF, recu, { empreinte = '', rang = 1, logo, emblem } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', compress: true });
  const L = 148;
  const X1 = 10;
  const X2 = 138;
  const W = X2 - X1;
  const o = outils(doc);
  const duplicata = rang > 1;

  o.entete({
    largeurPage: L,
    x1: X1,
    x2: X2,
    sousTitre: 'BOURSE DE FRET · REÇU DE PAIEMENT',
    mention: duplicata ? `DUPLICATA N° ${rang - 1}` : 'ORIGINAL',
    logo,
    emblem,
  });

  // Identification
  o.put('REÇU N°', X1, 43, { taille: 5.6, gras: true, couleur: GRIS, espace: 0.5 });
  o.put(recu.numero ?? '-', X1, 50, { taille: 15, gras: true, police: 'courier' });
  o.put('ÉMIS LE', 80, 43, { taille: 5.6, gras: true, couleur: GRIS, espace: 0.5 });
  o.put(dateHeurePdf(recu.saisiLe), 80, 48, { taille: 8.4, gras: true });
  const teinte = TEINTE_ETAT[recu.etat] ?? ARDOISE;
  o.pastille(libelleFinance(recu.etat).toUpperCase(), 80, 50.2, { pleine: FOND, bord: teinte, encre: teinte });

  // 1 · Client
  let y = 61;
  o.section('1', 'CLIENT', X1, X2, y);
  y += 5;
  o.champ('Raison sociale', recu.client?.raisonSociale ?? 'Non communiquée à ce profil', X1, y, W, { taille: 9.4 });
  y += 10;
  o.champ('Compte contribuable', recu.client?.compteContribuable, X1, y, 58);
  o.champ('RCCM', recu.client?.rccm, 74, y, 64);

  // 2 · Objet
  y += 13;
  o.section('2', 'OBJET DU PAIEMENT', X1, X2, y);
  y += 5;
  o.champ('Objet', recu.objet ? libelleFinance(recu.objet) : '-', X1, y, 58);
  o.champ('Canal', recu.canal ? libelleFinance(recu.canal) : '-', 74, y, 64);
  y += 10;
  o.champ('Détail', recu.detail, X1, y, W, { gras: false });
  if (recu.periode) {
    y += 10;
    o.champ('Période d’abonnement', `du ${datePdf(recu.periode.debuteLe)} au ${datePdf(recu.periode.finitLe)}`, X1, y, W);
  }
  if (recu.contentieuxReference) {
    y += 10;
    o.champ('Contentieux', recu.contentieuxReference, X1, y, W, { police: 'courier' });
  }

  // 3 · Règlement
  y += 13;
  o.section('3', 'RÈGLEMENT', X1, X2, y);
  y += 5;
  o.champ('Mode', recu.mode ? libelleFinance(recu.mode) : '-', X1, y, 40);
  o.champ('Opérateur', recu.operateur ? libelleFinance(recu.operateur) : '-', 52, y, 36);
  o.champ('Référence', recu.referenceTransaction, 90, y, 48, { police: 'courier', taille: 8 });
  y += 10;
  if (recu.numeroPayeurMasque) {
    o.champ('Numéro débité', recu.numeroPayeurMasque, X1, y, W, { police: 'courier', taille: 8 });
    y += 10;
  }
  doc.setFillColor(...FOND);
  doc.setDrawColor(...FILET);
  doc.setLineWidth(0.2);
  doc.roundedRect(X1, y - 3, W, 17, 1.5, 1.5, 'FD');
  o.put('MONTANT', X1 + 4, y + 1.6, { taille: 5.6, gras: true, couleur: GRIS, espace: 0.5 });
  o.putDroite(montantPdf(recu.montant), X2 - 4, y + 4.4, { taille: 15, gras: true });
  const lettres = typeof recu.montant === 'number' ? `${enLettres(recu.montant)} francs CFA` : '-';
  o.put(o.decouper(`Arrêté le présent reçu à la somme de : ${lettres}.`, W - 8, 7, false).slice(0, 2), X1 + 4, y + 9.6, {
    taille: 7,
    italique: true,
    couleur: GRIS,
  });

  // 4 · Encaissement
  y += 22;
  o.section('4', 'ENCAISSEMENT', X1, X2, y);
  y += 5;
  o.champ(recu.canal === 'guichet' ? 'Saisi au guichet par' : 'Payé en ligne par', recu.saisiPar, X1, y, 58);
  const validation =
    recu.etat === 'encaisse'
      ? recu.canal === 'guichet'
        ? `${recu.validePar ?? '-'}, le ${datePdf(recu.valideLe)}`
        : 'Transaction confirmée par l’opérateur'
      : recu.etat === 'rejete'
        ? `Rejeté : ${recu.motifRejet ?? 'motif non communiqué'}`
        : 'En attente de validation par un second agent';
  o.champ(recu.canal === 'guichet' ? 'Validé par' : 'Validation', validation, 74, y, 64, { lignes: 2 });

  // Avertissement et empreinte
  const yAv = 182;
  doc.setDrawColor(...ARDOISE);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1, 0.8], 0);
  doc.roundedRect(X1, yAv, W, 12.5, 1.2, 1.2, 'D');
  doc.setLineDashPattern([], 0);
  o.put('PAIEMENT SIMULÉ · DÉMONSTRATION', X1 + 3, yAv + 4, { taille: 6, gras: true, couleur: ARDOISE, espace: 0.4 });
  o.put(
    o.decouper(
      'Reçu produit par la démonstration du POC Bourse de Fret. Aucun opérateur de paiement n’a été appelé et aucune somme n’a circulé : ce document n’a aucune valeur comptable.',
      W - 6,
      6.2,
    ).slice(0, 2),
    X1 + 3,
    yAv + 7.4,
    { taille: 6.2, couleur: GRIS },
  );
  o.filet(X1, 199, X2);
  o.put(`Empreinte SHA-256 : ${empreinte || '-'}`, X1, 202.5, { taille: 4.6, police: 'courier', couleur: GRIS });
  o.put(`${recu.numero ?? ''} · ${duplicata ? `duplicata n° ${rang - 1}` : 'original'}`, X1, 206, { taille: 5, couleur: GRIS });
  o.putDroite('Office Ivoirien des Chargeurs · Bourse de Fret', X2, 206, { taille: 5, couleur: GRIS });

  o.filigrane('DÉMONSTRATION', L / 2, 128, 34);
  return doc;
}

/* ================================================================== *
 * État financier — A4 paysage
 * ================================================================== */

/**
 * @param {Function} jsPDF
 * @param {{titre: string, periode: string, identiteVisible: boolean, totaux: Record<string, number>,
 *   parMode: Array<{valeur: string, nombre: number, montant: number}>, colonnes: string[],
 *   lignes: Array<Array<unknown>>, auteur?: string}} etat Données projetées et mises en forme.
 * @param {{empreinte?: string, logo?: string, emblem?: string}} [options]
 */
export function construireEtatPdf(jsPDF, etat, { empreinte = '', logo, emblem } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const L = 297;
  const X1 = 12;
  const X2 = 285;
  const W = X2 - X1;
  const o = outils(doc);
  const largeurs = [24, 20, 54, 34, 20, 30, 37, 28, 26];
  const total = largeurs.reduce((n, x) => n + x, 0);
  const cols = largeurs.map((l) => (l * W) / total);

  const piedDePage = (page, pages) => {
    o.filet(X1, 199, X2);
    o.put(
      'Données de démonstration — paiements simulés. ' +
        (etat.identiteVisible ? '' : 'L’identité des entreprises n’est pas communiquée à ce profil.'),
      X1,
      203,
      { taille: 5.6, couleur: GRIS },
    );
    o.put(`Empreinte SHA-256 : ${empreinte || '-'}`, X1, 206.5, { taille: 4.6, police: 'courier', couleur: GRIS });
    o.putDroite(`Page ${page} / ${pages}`, X2, 203, { taille: 6, couleur: GRIS });
  };

  const entetePage = () =>
    o.entete({ largeurPage: L, x1: X1, x2: X2, sousTitre: 'BOURSE DE FRET · ÉTAT FINANCIER', mention: 'DÉMONSTRATION', logo, emblem });

  entetePage();
  o.put(etat.titre, X1, 46, { taille: 13, gras: true });
  o.put(etat.periode, X1, 51.5, { taille: 8.4, couleur: GRIS });
  if (etat.auteur) o.putDroite(`Édité par ${etat.auteur} le ${dateHeurePdf(new Date().toISOString())}`, X2, 51.5, { taille: 7, couleur: GRIS });

  // Totaux
  const cases = [
    ['Total encaissé', montantPdf(etat.totaux.encaisse)],
    ['Paiements encaissés', String(etat.totaux.nombre)],
    ['Abonnements', montantPdf(etat.totaux.abonnements)],
    ['Dépôts (rechargements)', montantPdf(etat.totaux.depots)],
    ['Contentieux', montantPdf(etat.totaux.contentieux)],
    ['En attente de validation', montantPdf(etat.totaux.enAttente)],
  ];
  const wc = W / cases.length;
  cases.forEach(([libelle, valeur], i) => {
    const x = X1 + i * wc;
    doc.setFillColor(...FOND);
    doc.setDrawColor(...FILET);
    doc.roundedRect(x + (i ? 1.5 : 0), 56, wc - 1.5, 15, 1.2, 1.2, 'FD');
    o.put(libelle.toUpperCase(), x + 4, 61, { taille: 5.2, gras: true, couleur: GRIS, espace: 0.35 });
    o.put(valeur, x + 4, 67.5, { taille: 10, gras: true });
  });

  // Par mode
  let y = 80;
  o.section('1', 'RÉPARTITION PAR MODE DE PAIEMENT', X1, X2, y);
  y += 6;
  o.put(
    etat.parMode.length
      ? etat.parMode.map((m) => `${libelleFinance(m.valeur)} : ${m.nombre} · ${montantPdf(m.montant)}`).join('    ')
      : 'Aucun paiement encaissé sur la période.',
    X1,
    y,
    { taille: 7.6 },
  );

  // Détail
  y += 10;
  o.section('2', 'DÉTAIL DES PAIEMENTS', X1, X2, y);
  y += 5;
  const entetesTableau = (yy) => {
    doc.setFillColor(...ENCRE);
    doc.rect(X1, yy, W, 6, 'F');
    let x = X1;
    etat.colonnes.forEach((c, i) => {
      o.put(c.toUpperCase(), x + 1.5, yy + 4, { taille: 5.2, gras: true, couleur: BLANC, espace: 0.2 });
      x += cols[i];
    });
    return yy + 6;
  };
  y = entetesTableau(y);
  for (const [i, ligne] of etat.lignes.entries()) {
    if (y > 192) {
      doc.addPage('a4', 'landscape');
      entetePage();
      y = entetesTableau(44);
    }
    if (i % 2 === 0) {
      doc.setFillColor(...FOND);
      doc.rect(X1, y, W, 5.6, 'F');
    }
    let x = X1;
    ligne.forEach((v, j) => {
      const contenu = o.decouper(ou(v === '' ? null : typeof v === 'number' ? texte(v.toLocaleString('fr-FR')) : v), cols[j] - 3, 6.6)[0];
      o.put(contenu, x + 1.5, y + 3.9, { taille: 6.6, police: j === 0 || j === 6 ? 'courier' : 'helvetica', gras: j === 7 });
      x += cols[j];
    });
    y += 5.6;
  }
  if (!etat.lignes.length) o.put('Aucun paiement sur la période et les critères choisis.', X1, y + 5, { taille: 7.6, italique: true, couleur: GRIS });

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p += 1) {
    doc.setPage(p);
    piedDePage(p, n);
  }
  return doc;
}
