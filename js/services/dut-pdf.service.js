/**
 * Génération du PDF DUT — constitution de la charge, empreinte, tirage.
 *
 * Le gabarit (`dut-pdf-gabarit.js`) attend la charge du POC DUT, dont le modèle
 * de données est plus large que celui de B2F. Ce module fait la traduction, et
 * **laisse vide ce que B2F ne connaît pas** : le formulaire officiel comporte
 * alors des cases à remplir à la main, comme son équivalent papier. Aucune valeur
 * n'est inventée, aucune section n'est supprimée.
 *
 * ## Ce que B2F ne porte pas
 *
 * L'instantané DUT de B2F (`dut.service.js`) retient le corridor, les dates
 * prévues, le poids total, le libellé de marchandise, les deux raisons sociales,
 * le véhicule et le chauffeur. Restent vides, faute de donnée : l'adresse et le
 * registre de commerce des parties, le destinataire, les colis, le volume, la
 * valeur, la facturation, le numéro officiel, l'antenne émettrice et le QR.
 *
 * ## L'empreinte est réelle
 *
 * Le SHA-256 du pied de page porte sur la sérialisation canonique de la charge :
 * deux tirages des mêmes données donnent la même empreinte, un champ modifié en
 * donne une autre. Elle ne vaut pas signature — rien ici n'est authentifié — mais
 * elle n'est pas décorative.
 *
 * @module services/dut-pdf.service
 */

import { empreinteSha256 } from '../core/crypto.js';
import { stockageInterne } from '../repositories/index.js';
import { COPIES, ETAT_FICHE, construireDutPdf } from './dut-pdf-gabarit.js';

export { COPIES } from './dut-pdf-gabarit.js';

/** Préférence portant le compteur d'impressions, par fiche. */
const PREFERENCE_IMPRESSIONS = 'dut_impressions';

/** Images d'en-tête du formulaire officiel, servies depuis le dépôt. */
const IMAGES = Object.freeze({ logo: 'assets/logo-oic.jpg', emblem: 'assets/armoiries-ci.png' });

/**
 * Sérialisation canonique : clés triées, `undefined` écarté. Sans elle, deux
 * charges identiques au champ près produiraient deux empreintes différentes
 * selon l'ordre d'insertion des propriétés.
 * @param {unknown} valeur
 * @returns {string}
 */
export function canonique(valeur) {
  if (Array.isArray(valeur)) return `[${valeur.map((v) => canonique(v ?? null)).join(',')}]`;
  if (valeur && typeof valeur === 'object') {
    return `{${Object.keys(valeur)
      .filter((k) => valeur[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonique(valeur[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valeur);
}

/**
 * Empreinte SHA-256 hexadécimale de la charge.
 * @param {Object} payload
 * @returns {Promise<string>} 64 caractères.
 */
export function empreinte(payload) {
  return empreinteSha256(canonique(payload));
}

/** Le corridor est stocké « Provenance > Destination » : une seule chaîne. */
function villes(corridor) {
  const [depart = '', arrivee = ''] = String(corridor || '')
    .split(/\s*(?:→|->|>)\s*/)
    .map((v) => v.trim());
  return { depart, arrivee };
}

/** Partie vide : les rubriques du formulaire restent visibles, sans valeur. */
const partieVide = (raisonSociale = '') => ({
  raisonSociale,
  adresse: '',
  contact: '',
  registre: '',
  reference: '',
});

/**
 * Traduit un dossier B2F en charge attendue par le gabarit.
 *
 * Fonction pure : aucune lecture de stockage, pour que le test la rende sous Node.
 *
 * @param {{appariement: Object, document: Object|null, apercu: Object|null}} dossier
 *   Élément rendu par `dossiersDut()`.
 * @param {{copy?: string, rank?: number, generatedAt?: string}} [options]
 * @returns {Object} Charge canonique.
 */
export function construirePayload(dossier, options = {}) {
  const { copy = 'TRANSPORTEUR', rank = 1, generatedAt = new Date().toISOString() } = options;
  if (!COPIES[copy]) throw new Error('Exemplaire inconnu.');
  const fiche = dossier.document || dossier.apercu;
  if (!fiche) throw new Error('Ce dossier ne porte aucune fiche à imprimer.');
  const d = fiche.donnees || {};
  const { depart, arrivee } = villes(d.corridor);
  return {
    schema: 'B2F-DUT-RECTO-VERSO-1',
    copy,
    rank,
    generatedAt,
    operation: '',
    transporter: { registre: '' },
    vehicle: { type: '', capaciteTonnes: null },
    files: [],
    document: {
      etat: dossier.document ? ETAT_FICHE.GENERE : ETAT_FICHE.APERCU,
      dutNumber: dossier.document ? fiche.reference || '' : '',
      antennaName: '',
      partnerName: '',
      general: {
        dateEmission: fiche.genereLe || '',
        transporterName: d.transporteurRaisonSociale || '',
        immatriculation: d.immatriculation || '',
        // B2F ne sépare pas nom et prénoms du chauffeur.
        driverNom: d.chauffeurNom || '',
        driverPrenoms: '',
        driverPermis: d.chauffeurPermisNumero || '',
        driverPiece: '',
        transportType: '',
        compte: '',
      },
      // L'affréteur publie le fret : c'est l'expéditeur au sens du formulaire.
      expediteur: partieVide(d.affreteurRaisonSociale || ''),
      destinataire: partieVide(),
      trajet: {
        chargement: { ville: depart, lieu: '', adresse: '' },
        dechargement: { ville: arrivee, lieu: '', adresse: '' },
        dateDepart: d.departPrevu || '',
        heureDepart: '',
        dateArrivee: d.arriveePrevue || '',
        heureArrivee: '',
      },
      // Une seule ligne : B2F agrège le fret en un libellé et un poids total.
      marchandises: [
        {
          designation: '',
          nature: d.marchandise || '',
          emballage: '',
          quantite: null,
          poidsTonnes: d.poidsTotalT ?? null,
          volumeM3: null,
          valeur: null,
          devise: 'FCFA',
        },
      ],
      dangereuse: null,
      temperatureControlee: null,
      facturation: {
        expediteur: { prixTransport: null, accessoires: null, complementaires: null, autres: null, tvaRate: null, timbre: null },
        destinataire: { prixTransport: null, accessoires: null, complementaires: null, autres: null, tvaRate: null, timbre: null },
      },
      annexes: {
        emballages: '',
        pieces: [],
        instructions: '',
        accessoires: '',
        complementaires: '',
        reservePriseEnCharge: '',
        reserveLivraison: '',
      },
      // La carte de transport et les contacts n'ont pas de case au formulaire
      // officiel. Le gabarit les reporte dans l'annexe « mentions
      // complémentaires » : ils restent lisibles et l'empreinte les couvre.
      complements: {
        carteTransportNumero: d.carteTransportNumero || '',
        carteGrise: d.carteGrise || '',
        chauffeurTelephone: d.chauffeurTelephone || '',
        transporteurTelephone: d.transporteurTelephone || '',
        transporteurEmail: d.transporteurEmail || '',
        appariementReference: dossier.appariement?.reference || '',
      },
    },
  };
}

/**
 * Rang de l'impression à venir, **compté dans ce navigateur**. Le POC DUT tient
 * un registre d'impressions ; B2F n'en a pas, et prétendre le contraire serait
 * faux. Le pied de page dit donc « impression n° X pour ce poste », pas « X-ième
 * tirage officiel ».
 * @param {string} ficheId
 * @returns {number}
 */
export function rangSuivant(ficheId) {
  const compteurs = stockageInterne().lirePreference(PREFERENCE_IMPRESSIONS) || {};
  return (Number(compteurs[ficheId]) || 0) + 1;
}

/** Enregistre le tirage une fois le PDF produit, jamais avant. */
function noterImpression(ficheId, rang) {
  const stockage = stockageInterne();
  const compteurs = stockage.lirePreference(PREFERENCE_IMPRESSIONS) || {};
  stockage.ecrirePreference(PREFERENCE_IMPRESSIONS, { ...compteurs, [ficheId]: rang });
}

/** Charge une image du dépôt en data-URL — jsPDF n'accepte pas un chemin. */
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

/** Les deux images d'en-tête ne sont lues qu'une fois par session. */
let imagesPromise;

/**
 * Produit le PDF du dossier et le propose au téléchargement.
 *
 * @param {{appariement: Object, document: Object|null, apercu: Object|null}} dossier
 * @param {{copy?: string, telecharger?: boolean}} [options]
 * @returns {Promise<{nomFichier: string, empreinte: string, rang: number}>}
 * @throws {Error} Si jsPDF n'est pas chargé ou si une image manque — les deux
 *   sont des défauts de déploiement, pas des cas nominaux à avaler.
 */
export async function genererPdfDut(dossier, { copy = 'TRANSPORTEUR', telecharger = true } = {}) {
  const jsPDF = globalThis.window?.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('La librairie PDF n’est pas chargée. Rechargez la page.');
  imagesPromise ||= Promise.all([imageDataUrl(IMAGES.logo), imageDataUrl(IMAGES.emblem)]).catch(
    (erreur) => {
      imagesPromise = null;
      throw erreur;
    },
  );
  const [logo, emblem] = await imagesPromise;
  const fiche = dossier.document || dossier.apercu;
  if (!fiche) throw new Error('Ce dossier ne porte aucune fiche à imprimer.');
  const rang = rangSuivant(fiche.id);
  const payload = construirePayload(dossier, { copy, rank: rang });
  const signature = await empreinte(payload);
  const doc = construireDutPdf(jsPDF, payload, signature, { logo, emblem, qr: null });
  const nomFichier = `${payload.document.dutNumber || 'DUT-apercu'}-${copy.toLowerCase()}-impression-${rang}.pdf`;
  if (telecharger) doc.save(nomFichier);
  noterImpression(fiche.id, rang);
  return { nomFichier, empreinte: signature, rang };
}
