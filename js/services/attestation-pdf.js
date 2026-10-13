/**
 * Attestation de bourse de fret — gabarit PDF et tirage (lot b3).
 *
 * Le gabarit reprend la grammaire du DUT imprimable (`dut-pdf-gabarit.js`) :
 * en-tête institutionnel à armoiries, bandeau pleine largeur et bande
 * guillochée, numéro en chiffres monospacés, pastilles d'état, sections
 * numérotées en petites capitales, empreinte SHA-256 et micro-texte en pied de
 * page. Une différence, qui est l'objet du document : **un QR code réel**,
 * dessiné en vecteurs, qui ouvre la page publique de vérification.
 *
 * L'attestation dit son état comme le DUT : en vigueur, le bandeau est à
 * l'encre de l'Office ; annulée ou expirée, il passe à l'ardoise et un filigrane
 * le répète. Et comme tout le POC, elle porte la mention « Démonstration ».
 *
 * `construireAttestationPdf` est **pur** (ni stockage, ni DOM, ni réseau) : il se
 * rend sous Node dans les tests.
 *
 * @module services/attestation-pdf
 */

import { matriceQr } from '../core/qr.js';
import { empreinteSha256 } from '../core/crypto.js';
import { ETAT_ATTESTATION } from '../domain/enums.js';
import { canonique } from './dut-pdf.service.js';

const ENCRE = [19, 47, 85];
const ARDOISE = [90, 100, 118];
const GRIS = [108, 119, 135];
const FILET = [214, 221, 230];
const FOND = [245, 248, 251];
const BLANC = [255, 255, 255];
const G1 = 11;
const G2 = 199;
const COL = [11, 77, 141];
const LARGEUR = G2 - G1;

/** Helvetica intégré n'a ni espace fine, ni tiret long, ni flèche. */
const texte = (v) =>
  String(v ?? '')
    .replace(/[  ]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[’]/g, "'")
    .replace(/→/g, '>');
const ou = (v) => (v == null || v === '' ? '-' : texte(v));
const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '-');
const heure = (v) =>
  v ? new Date(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ') : '';

/** Habillage d'un état — la planche « Le document dit son état » du DUT. */
export function habillage(etat) {
  if (etat === ETAT_ATTESTATION.EN_VIGUEUR) {
    return { label: 'EN VIGUEUR', couleur: ENCRE, filigrane: 'DÉMONSTRATION', opacite: 0.18 };
  }
  return {
    label: etat === ETAT_ATTESTATION.ANNULEE ? 'ANNULÉE' : 'EXPIRÉE',
    couleur: ARDOISE,
    filigrane: etat === ETAT_ATTESTATION.ANNULEE ? 'ANNULÉE' : 'EXPIRÉE',
    opacite: 0.4,
  };
}

/**
 * Rend l'attestation sur une page A4.
 *
 * @param {Function} jsPDF Constructeur jsPDF.
 * @param {Record<string, any>} d `document` rendu par `attestationPourImpression()`.
 * @param {{url: string, code: string, empreinte: string, logo?: string, emblem?: string}} options
 * @returns {Object} Document jsPDF.
 */
export function construireAttestationPdf(jsPDF, d, { url, code, empreinte, logo, emblem }) {
  const etat = habillage(d.etat);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

  function put(valeur, x, y, o = {}) {
    const { taille = 9, gras = false, police = 'helvetica', italique = false, couleur = ENCRE, espace = 0, align, angle, interligne = 1.2 } = o;
    doc.setFont(police, gras && italique ? 'bolditalic' : gras ? 'bold' : italique ? 'italic' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
    doc.setCharSpace(espace);
    doc.text(Array.isArray(valeur) ? valeur.map(texte) : texte(valeur), x, y, {
      lineHeightFactor: interligne, ...(align ? { align } : {}), ...(angle ? { angle } : {}),
    });
    doc.setCharSpace(0);
  }
  function largeur(valeur, { taille = 9, gras = false, police = 'helvetica', espace = 0 } = {}) {
    const brut = texte(valeur);
    doc.setFont(police, gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    return doc.getTextWidth(brut) + espace * Math.max(0, brut.length - 1);
  }
  const putDroite = (v, x, y, o = {}) => put(v, x - largeur(v, o), y, o);
  const filet = (x1, y, x2, couleur = FILET, e = 0.2) => {
    doc.setDrawColor(...couleur);
    doc.setLineWidth(e);
    doc.line(x1, y, x2, y);
  };
  const rect = (x, y, w, h, fond = null, bord = FILET) => {
    if (fond) doc.setFillColor(...fond);
    doc.setDrawColor(...bord);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, h, fond ? 'FD' : 'D');
  };
  const decouper = (valeur, w, taille = 8.5) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(taille);
    return doc.splitTextToSize(texte(valeur ?? ''), w);
  };
  function pastille(libelle, x, y, { pleine = null, encre = ENCRE } = {}) {
    const w = largeur(libelle, { taille: 6.4, gras: true, espace: 0.3 }) + 6;
    if (pleine) doc.setFillColor(...pleine);
    doc.setDrawColor(...(pleine ?? FILET));
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, 5, 1.1, 1.1, pleine ? 'FD' : 'D');
    put(libelle, x + 3, y + 3.6, { taille: 6.4, gras: true, couleur: encre, espace: 0.3 });
    return w;
  }
  function champ(libelle, valeur, x, y, w, o = {}) {
    put(libelle.toUpperCase(), x, y, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
    put(decouper(ou(valeur), w, o.taille ?? 9).slice(0, 1), x, y + 4.4, { taille: o.taille ?? 9, gras: o.gras ?? true, police: o.police ?? 'helvetica' });
  }
  function section(n, titre, y) {
    doc.setFillColor(...ENCRE);
    doc.rect(G1, y - 2.6, 2.4, 2.4, 'F');
    const l = `${n} · ${titre}`;
    put(l, G1 + 4.6, y, { taille: 7.4, gras: true, espace: 0.55 });
    filet(G1 + 7.6 + largeur(l, { taille: 7.4, gras: true, espace: 0.55 }), y - 1, G2);
  }
  function guilloche(y) {
    doc.setDrawColor(...etat.couleur);
    doc.setLineWidth(0.9);
    for (let x = 0; x < 210; x += 3.2) doc.line(x, y + 0.5, x + 1.7, y + 0.5);
    doc.setDrawColor(130, 148, 172);
    doc.setLineWidth(0.35);
    for (let x = 1.6; x < 210; x += 3.2) doc.line(x, y + 1.3, x + 1, y + 1.3);
  }

  /* ------------------------------ en-tête ------------------------------ */
  if (emblem) doc.addImage(emblem, 'PNG', G1, 7, 12.5, 11.1);
  put("RÉPUBLIQUE DE CÔTE D'IVOIRE", 27, 12.4, { taille: 9.5, gras: true, espace: 0.55 });
  put('Union · Discipline · Travail', 27, 16.6, { taille: 7.2, italique: true, couleur: GRIS });
  if (logo) doc.addImage(logo, 'JPEG', 177, 4.5, 22, 22);
  doc.setFillColor(...etat.couleur);
  doc.rect(0, 26, 210, 13.8, 'F');
  put('Office Ivoirien des Chargeurs', G1, 31.6, { taille: 11.5, gras: true, police: 'times', couleur: BLANC });
  put('ATTESTATION DE BOURSE DE FRET', G1, 36.8, { taille: 7.6, gras: true, espace: 0.7, couleur: BLANC });
  const mention = 'BOURSE DE FRET · DÉMONSTRATION';
  const styleMention = { taille: 6.6, gras: true, espace: 0.5 };
  const lm = largeur(mention, styleMention) + 7;
  doc.setDrawColor(...BLANC);
  doc.setLineWidth(0.3);
  doc.roundedRect(G2 - lm, 28.4, lm, 5.4, 1.2, 1.2, 'D');
  put(mention, G2 - lm + 3.5, 32.1, { ...styleMention, couleur: BLANC });
  putDroite('Données fictives du POC · aucune valeur administrative', G2, 37.6, { taille: 5.8, couleur: [214, 222, 234] });
  guilloche(39.8);

  /* -------------------------- identification --------------------------- */
  put("N° DE L'ATTESTATION", G1, 48.6, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.5 });
  put(d.reference, G1, 57.6, { taille: 19, gras: true, police: 'courier', couleur: etat.couleur, espace: 0.3 });
  let x = G1;
  x += pastille(etat.label, x, 61.6, { pleine: etat.couleur, encre: BLANC }) + 2.5;
  x += pastille(`Émise le ${date(d.genereeLe)}`, x, 61.6) + 2.5;
  pastille(`Valable jusqu'au ${date(d.valableJusquau)}`, x, 61.6);
  champ('Mise en relation', d.appariementReference, COL[0], 72.4, 50, { police: 'courier', taille: 8.5 });
  champ('Validée le', d.valideLe ? `${date(d.valideLe)} à ${heure(d.valideLe)}` : '', 65, 72.4, 50, { taille: 8.5 });
  champ('Frais de mise en relation', 'Réglés par les deux parties', 119, 72.4, 46, { taille: 8.5 });

  // QR code : vecteurs, zone de silence comprise dans l'encadré blanc.
  const m = matriceQr(url);
  const boite = 29;
  rect(170, 47.6, boite, boite, BLANC);
  const module = (boite - 3) / m.length;
  doc.setFillColor(...ENCRE);
  m.forEach((ligne, yy) => ligne.forEach((sombre, xx) => {
    if (sombre) doc.rect(171.5 + xx * module, 49.1 + yy * module, module + 0.02, module + 0.02, 'F');
  }));
  put('VÉRIFICATION TERRAIN', 184.5, 80.4, { taille: 5.4, gras: true, couleur: GRIS, espace: 0.4, align: 'center' });
  const [c1, c2] = [code.slice(0, 14), code.slice(15)];
  put(c1, 184.5, 83.6, { taille: 6.4, gras: true, police: 'courier', align: 'center' });
  put(c2, 184.5, 86.6, { taille: 6.4, gras: true, police: 'courier', align: 'center' });

  put(
    decouper('Attestation produite par la démonstration du POC Bourse de fret. Elle atteste une mise en relation conclue sur la plateforme ; elle ne remplace pas les documents de bord du véhicule.', 150, 6.4).slice(0, 2),
    G1, 81.6, { taille: 6.4, gras: true, couleur: etat.couleur, interligne: 1.25 },
  );
  filet(G1, 90, G2);

  /* ------------------------------ sections ----------------------------- */
  section('1', 'PARTIES DE LA MISE EN RELATION', 97);
  champ('Transporteur', d.transporteur, COL[0], 102.4, 120);
  champ('Affréteur', d.affreteur, COL[2], 102.4, 56);

  section('2', 'VÉHICULE ET CONDUCTEUR', 116);
  champ('Immatriculation', d.immatriculation, COL[0], 121.4, 60, { police: 'courier' });
  champ('Carte de transport', d.carteTransportNumero, COL[1], 121.4, 56, { police: 'courier', taille: 8.5 });
  champ('Chauffeur prévu', d.chauffeur, COL[2], 121.4, 56);

  section('3', 'TRAJET', 135);
  rect(G1, 139, LARGEUR, 24, BLANC);
  put('CHARGEMENT', G1 + 4, 144.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
  put(ou(d.depart).toUpperCase(), G1 + 4, 150.4, { taille: 12, gras: true });
  put(`Départ prévu le ${date(d.departPrevu)} · ${heure(d.departPrevu) || '-'}`, G1 + 4, 157.4, { taille: 7.8, police: 'courier' });
  putDroite('DÉCHARGEMENT', G2 - 4, 144.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
  put(ou(d.arrivee).toUpperCase(), G2 - 4, 150.4, { taille: 12, gras: true, align: 'right' });
  put(`Arrivée prévue le ${date(d.arriveePrevue)} · ${heure(d.arriveePrevue) || '-'}`, G2 - 4, 157.4, { taille: 7.8, police: 'courier', align: 'right' });

  section('4', 'MARCHANDISE', 172);
  champ('Nature du fret', d.marchandise, COL[0], 177.4, 120);
  champ('Poids total', d.poidsT != null ? `${String(d.poidsT).replace('.', ',')} t` : '', COL[2], 177.4, 56);

  section('5', 'VÉRIFIER CETTE ATTESTATION', 191);
  rect(G1, 195, LARGEUR, 30, FOND);
  put(
    decouper(
      'Sur route, l’agent scanne le QR code ou saisit le code de vérification sur la page de contrôle. ' +
        'La page indique si l’attestation est authentique et si elle est en vigueur, expirée ou annulée, ' +
        'avec l’immatriculation, le trajet et les dates — jamais les coordonnées des parties. ' +
        'Chaque vérification est enregistrée.',
      LARGEUR - 8, 8,
    ),
    G1 + 4, 201, { taille: 8, interligne: 1.35 },
  );
  put('CODE DE VÉRIFICATION', G1 + 4, 216.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
  put(code, G1 + 4, 221.4, { taille: 10, gras: true, police: 'courier', espace: 0.2 });
  put('ADRESSE DE VÉRIFICATION', 107, 216.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
  put(decouper(url, 88, 6.4).slice(0, 2), 107, 220.4, { taille: 6.4, police: 'courier', interligne: 1.25 });

  /* ---------------------------- pied de page --------------------------- */
  filet(G1, 276, G2, ENCRE, 0.4);
  put("EMPREINTE D'INTÉGRITÉ SHA-256", G1, 280.4, { taille: 5.4, gras: true, couleur: GRIS, espace: 0.45 });
  put(empreinte.slice(0, 32), G1, 284, { taille: 6, police: 'courier' });
  put(empreinte.slice(32), G1, 287.4, { taille: 6, police: 'courier' });
  put('CONTRÔLE', 92, 280.4, { taille: 5.4, gras: true, couleur: GRIS, espace: 0.45 });
  put(
    decouper('L’authenticité se lit au QR code, pas à l’apparence du papier : une copie altérée renvoie un autre état.', 52, 6),
    92, 284, { taille: 6, interligne: 1.25, couleur: GRIS },
  );
  put(`Imprimée le ${date(new Date().toISOString())} à ${heure(new Date().toISOString())}`, G2, 280.4, { taille: 6, couleur: GRIS, align: 'right' });
  put('Page 1 / 1', G2, 284.6, { taille: 8, gras: true, align: 'right' });
  put('Exemplaire à conserver à bord', G2, 288.4, { taille: 6, couleur: GRIS, align: 'right' });
  put(`${`${d.reference} · OFFICEIVOIRIENDESCHARGEURS · BOURSEDEFRET · `.repeat(5)}`, G1, 292.4, { taille: 2.6, couleur: [168, 178, 192] });

  const styleFiligrane = { taille: 30, gras: true, couleur: [206, 211, 219], espace: 2 };
  doc.setGState(new doc.GState({ opacity: etat.opacite }));
  put(etat.filigrane, 105 - largeur(etat.filigrane, styleFiligrane) / 2, 175, { ...styleFiligrane, angle: 14 });
  doc.setGState(new doc.GState({ opacity: 1 }));

  doc.setProperties({
    title: `Attestation de bourse de fret ${d.reference}`,
    subject: `POC Bourse de fret - ${etat.label} - SHA-256 ${empreinte}`,
    author: 'Bourse de fret (B2F) - POC OIC',
    creator: 'Gabarit attestation de bourse de fret',
  });
  return doc;
}

/** Images d'en-tête, communes avec le DUT. */
const IMAGES = Object.freeze({ logo: 'assets/logo-oic.jpg', emblem: 'assets/armoiries-ci.png' });
let imagesPromise;

async function imageDataUrl(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`Une image du document est introuvable (${chemin}).`);
  const blob = await reponse.blob();
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(lecteur.result);
    lecteur.onerror = () => rejeter(new Error('Une image du document est illisible.'));
    lecteur.readAsDataURL(blob);
  });
}

/**
 * Adresse complète de vérification, sur le site qui sert la démonstration.
 * @param {string} chemin `#/verifier/<jeton>`.
 */
export function adresseVerification(chemin) {
  const { origin = '', pathname = '/' } = globalThis.location ?? {};
  return `${origin}${pathname}${chemin}`;
}

/**
 * Produit le PDF et le propose au téléchargement.
 * @param {ReturnType<import('./attestation.service.js').attestationPourImpression>} impression
 * @returns {Promise<{nomFichier: string, empreinte: string}>}
 */
export async function genererPdfAttestation(impression) {
  const jsPDF = globalThis.window?.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('La librairie PDF n’est pas chargée. Rechargez la page.');
  imagesPromise ||= Promise.all([imageDataUrl(IMAGES.logo), imageDataUrl(IMAGES.emblem)]).catch((e) => {
    imagesPromise = null;
    throw e;
  });
  const [logo, emblem] = await imagesPromise;
  const url = adresseVerification(impression.chemin);
  const empreinte = await empreinteSha256(canonique({ ...impression.document, url }));
  const doc = construireAttestationPdf(jsPDF, impression.document, { url, code: impression.code, empreinte, logo, emblem });
  const nomFichier = `${impression.document.reference}-attestation-bourse-de-fret.pdf`;
  doc.save(nomFichier);
  return { nomFichier, empreinte };
}
