/**
 * Édition des documents imprimables du lot b4 : reçu de paiement, état financier.
 *
 * Même chaîne que le DUT (`dut-pdf.service.js`) : données projetées pour le
 * lecteur → empreinte SHA-256 de leur sérialisation canonique → gabarit jsPDF →
 * téléchargement. L'édition d'un reçu est **comptée et journalisée** : la
 * deuxième porte « Duplicata n° 1 ».
 *
 * @module services/recu.service
 */

import { empreinteSha256 } from '../core/crypto.js';
import { masquerNumero } from '../domain/finances.js';
import { canonique } from './dut-pdf.service.js';
import { noterEditionRecu, paiementDetaille, rangEditionSuivante } from './paiement.service.js';
import { construireEtatPdf, construireRecuPdf } from './recu-pdf-gabarit.js';
import { COLONNES_EXPORT, etatFinancier, journaliserExport, libellePeriode, lignesExport } from './rapport-financier.service.js';

const IMAGES = Object.freeze({ logo: 'assets/logo-oic.jpg', emblem: 'assets/armoiries-ci.png' });

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

let imagesPromise;
function images() {
  imagesPromise ||= Promise.all([imageDataUrl(IMAGES.logo), imageDataUrl(IMAGES.emblem)]).catch((e) => {
    imagesPromise = null;
    throw e;
  });
  return imagesPromise;
}

function constructeur() {
  const jsPDF = globalThis.window?.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('La librairie PDF n’est pas chargée. Rechargez la page.');
  return jsPDF;
}

/**
 * Données d'un reçu, projetées pour le lecteur — le numéro du payeur, s'il lui
 * est servi, n'apparaît que masqué.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} paiementId
 */
export function donneesRecu(ctx, paiementId) {
  const d = paiementDetaille(ctx, paiementId);
  const { numeroPayeur, ...reste } = d;
  return { ...reste, numeroPayeurMasque: numeroPayeur ? masquerNumero(numeroPayeur) : null };
}

/**
 * Produit le reçu PDF et le propose au téléchargement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} paiementId
 * @returns {Promise<{nomFichier: string, rang: number}>}
 */
export async function editerRecu(ctx, paiementId) {
  const jsPDF = constructeur();
  const recu = donneesRecu(ctx, paiementId);
  const rang = rangEditionSuivante(paiementId);
  const [logo, emblem] = await images();
  const empreinte = await empreinteSha256(canonique({ ...recu, rang }));
  const doc = construireRecuPdf(jsPDF, recu, { empreinte, rang, logo, emblem });
  const nomFichier = `${recu.numero}${rang > 1 ? `-duplicata-${rang - 1}` : ''}.pdf`;
  doc.save(nomFichier);
  // Comptée une fois le document produit, jamais avant.
  noterEditionRecu(ctx, paiementId);
  return { nomFichier, rang };
}

/**
 * Produit l'état financier PDF de la période et le propose au téléchargement.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} filtres
 * @param {string} [auteur]
 */
export async function editerEtatPdf(ctx, filtres, auteur) {
  const jsPDF = constructeur();
  const etat = etatFinancier(ctx, filtres);
  const charge = {
    titre: 'État des paiements, abonnements et dépôts',
    periode: `Période ${libellePeriode(etat.filtres)}`,
    identiteVisible: etat.identiteVisible,
    totaux: etat.totaux,
    parMode: etat.parMode,
    colonnes: [...COLONNES_EXPORT],
    lignes: lignesExport(etat),
    auteur,
  };
  const [logo, emblem] = await images();
  const empreinte = await empreinteSha256(canonique(charge));
  const doc = construireEtatPdf(jsPDF, charge, { empreinte, logo, emblem });
  const nomFichier = `etat-financier-${etat.filtres.du}-${etat.filtres.au}.pdf`;
  doc.save(nomFichier);
  journaliserExport(ctx, etat, 'PDF');
  return { nomFichier };
}
