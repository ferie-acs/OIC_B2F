/**
 * Domaine des finances — lot b4 : abonnements, paiements, caisse, contentieux.
 *
 * **Module pur** : aucune entrée-sortie, aucun import de `core/`, `repositories/`
 * ni `services/`. Il porte les valeurs stockées (énumérations), leurs libellés,
 * et les règles de calcul qui doivent rester testables par table de vérité :
 * période de prolongation, tarif en vigueur à une date, numérotation des reçus,
 * transitions d'un contentieux, synthèses par mode de paiement, échappement CSV,
 * montant en toutes lettres.
 *
 * Les libellés vivent ici plutôt que dans `enums.js` pour ne pas élargir un
 * fichier partagé par plusieurs lots : `libelleFinance()` lève, comme `labelOf()`,
 * sur une valeur sans libellé (décision D34 : aucun statut affiché brut).
 *
 * @module domain/finances
 */

/* ================================================================== *
 * 1. Valeurs stockées
 * ================================================================== */

/** Ce que règle un paiement. @readonly @enum {string} */
export const OBJET_PAIEMENT = Object.freeze({
  ABONNEMENT: 'abonnement',
  RECHARGEMENT: 'rechargement',
  /** Règlement d'une somme due au titre d'un contentieux (inventaire, profil 13). */
  CONTENTIEUX: 'contentieux',
});

/** Où le paiement a été fait. @readonly @enum {string} */
export const CANAL_PAIEMENT = Object.freeze({
  /** Par l'entreprise elle-même, depuis son espace. La transaction fait foi. */
  EN_LIGNE: 'en_ligne',
  /** Au guichet de l'OIC : saisie par un agent, validation par un autre. */
  GUICHET: 'guichet',
});

/** Mode de règlement. @readonly @enum {string} */
export const MODE_PAIEMENT = Object.freeze({
  MOBILE_MONEY: 'mobile_money',
  CARTE: 'carte',
  /** Débit du compte prépayé — prévu par l'inventaire pour le réabonnement. */
  DEBIT_COMPTE: 'debit_compte',
  ESPECES: 'especes',
  CHEQUE: 'cheque',
  VIREMENT: 'virement',
});

/** Modes ouverts à chaque canal. */
export const MODES_PAR_CANAL = Object.freeze({
  [CANAL_PAIEMENT.EN_LIGNE]: Object.freeze([
    MODE_PAIEMENT.MOBILE_MONEY,
    MODE_PAIEMENT.CARTE,
    MODE_PAIEMENT.DEBIT_COMPTE,
  ]),
  [CANAL_PAIEMENT.GUICHET]: Object.freeze([
    MODE_PAIEMENT.ESPECES,
    MODE_PAIEMENT.CHEQUE,
    MODE_PAIEMENT.VIREMENT,
    MODE_PAIEMENT.MOBILE_MONEY,
  ]),
});

/** Opérateurs de mobile money proposés à la simulation. @readonly @enum {string} */
export const OPERATEUR_MOBILE = Object.freeze({
  ORANGE: 'orange_money',
  MTN: 'mtn_momo',
  MOOV: 'moov_money',
  WAVE: 'wave',
});

/** État d'un paiement. @readonly @enum {string} */
export const ETAT_PAIEMENT = Object.freeze({
  /** Saisi au guichet, en attente de la validation d'une autre personne. */
  EN_ATTENTE: 'en_attente',
  /** Encaissé : la transaction en ligne a abouti, ou la saisie a été validée. */
  ENCAISSE: 'encaisse',
  REJETE: 'rejete',
});

/** État d'une modification de tarif. @readonly @enum {string} */
export const ETAT_REVISION = Object.freeze({
  PROGRAMMEE: 'programmee',
  APPLIQUEE: 'appliquee',
  ANNULEE: 'annulee',
});

/** Étapes d'un contentieux, dans l'ordre. @readonly @enum {string} */
export const ETAPE_CONTENTIEUX = Object.freeze({
  OUVERT: 'ouvert',
  INSTRUCTION: 'instruction',
  CONCILIATION: 'conciliation',
  CLOS: 'clos',
});

/** Ordre des étapes : on n'en saute aucune, on ne revient pas en arrière. */
export const ORDRE_CONTENTIEUX = Object.freeze([
  ETAPE_CONTENTIEUX.OUVERT,
  ETAPE_CONTENTIEUX.INSTRUCTION,
  ETAPE_CONTENTIEUX.CONCILIATION,
  ETAPE_CONTENTIEUX.CLOS,
]);

/** Nature d'un contentieux. @readonly @enum {string} */
export const NATURE_CONTENTIEUX = Object.freeze({
  IMPAYE: 'impaye',
  LITIGE_TRANSPORT: 'litige_transport',
  LITIGE_MARCHANDISE: 'litige_marchandise',
  AUTRE: 'autre',
});

/** Issue d'un contentieux clos. @readonly @enum {string} */
export const ISSUE_CONTENTIEUX = Object.freeze({
  REGLE_AMIABLE: 'regle_amiable',
  RECOUVRE: 'recouvre',
  ABANDONNE: 'abandonne',
  TRANSMIS_JURIDIQUE: 'transmis_juridique',
});

/* ================================================================== *
 * 2. Libellés — aucun statut affiché brut (D34)
 * ================================================================== */

const LIBELLES_FINANCES = Object.freeze({
  [OBJET_PAIEMENT.ABONNEMENT]: 'Réabonnement',
  [OBJET_PAIEMENT.RECHARGEMENT]: 'Rechargement du compte',
  [OBJET_PAIEMENT.CONTENTIEUX]: 'Règlement de contentieux',
  [CANAL_PAIEMENT.EN_LIGNE]: 'En ligne',
  [CANAL_PAIEMENT.GUICHET]: 'Au guichet',
  [MODE_PAIEMENT.MOBILE_MONEY]: 'Mobile money',
  [MODE_PAIEMENT.CARTE]: 'Carte bancaire',
  [MODE_PAIEMENT.DEBIT_COMPTE]: 'Débit du compte prépayé',
  [MODE_PAIEMENT.ESPECES]: 'Espèces',
  [MODE_PAIEMENT.CHEQUE]: 'Chèque',
  [MODE_PAIEMENT.VIREMENT]: 'Virement',
  [OPERATEUR_MOBILE.ORANGE]: 'Orange Money',
  [OPERATEUR_MOBILE.MTN]: 'MTN Mobile Money',
  [OPERATEUR_MOBILE.MOOV]: 'Moov Money',
  [OPERATEUR_MOBILE.WAVE]: 'Wave',
  [ETAT_PAIEMENT.EN_ATTENTE]: 'En attente de validation',
  [ETAT_PAIEMENT.ENCAISSE]: 'Encaissé',
  [ETAT_PAIEMENT.REJETE]: 'Rejeté',
  [ETAT_REVISION.PROGRAMMEE]: 'Programmée',
  [ETAT_REVISION.APPLIQUEE]: 'En vigueur',
  [ETAT_REVISION.ANNULEE]: 'Annulée',
  [ETAPE_CONTENTIEUX.OUVERT]: 'Ouvert',
  [ETAPE_CONTENTIEUX.INSTRUCTION]: 'En instruction',
  [ETAPE_CONTENTIEUX.CONCILIATION]: 'En conciliation',
  [ETAPE_CONTENTIEUX.CLOS]: 'Clos',
  [NATURE_CONTENTIEUX.IMPAYE]: 'Impayé',
  [NATURE_CONTENTIEUX.LITIGE_TRANSPORT]: 'Litige sur un transport',
  [NATURE_CONTENTIEUX.LITIGE_MARCHANDISE]: 'Litige sur la marchandise',
  [NATURE_CONTENTIEUX.AUTRE]: 'Autre',
  [ISSUE_CONTENTIEUX.REGLE_AMIABLE]: 'Réglé à l’amiable',
  [ISSUE_CONTENTIEUX.RECOUVRE]: 'Somme recouvrée',
  [ISSUE_CONTENTIEUX.ABANDONNE]: 'Abandonné',
  [ISSUE_CONTENTIEUX.TRANSMIS_JURIDIQUE]: 'Transmis au service juridique',
});

/**
 * Libellé d'une valeur du domaine des finances.
 * @param {string} valeur
 * @returns {string}
 * @throws {Error} Si la valeur n'a pas de libellé.
 */
export function libelleFinance(valeur) {
  const l = LIBELLES_FINANCES[valeur];
  if (!l) {
    throw new Error(
      `Aucun libellé déclaré pour la valeur « ${valeur} » (js/domain/finances.js). ` +
        'Un statut ne doit jamais être affiché brut (décision D34).',
    );
  }
  return l;
}

/** Ton de badge d'un état (classes `badge-*` existantes). */
export function tonFinance(valeur) {
  return (
    {
      [ETAT_PAIEMENT.EN_ATTENTE]: 'warning',
      [ETAT_PAIEMENT.ENCAISSE]: 'success',
      [ETAT_PAIEMENT.REJETE]: 'error',
      [ETAT_REVISION.PROGRAMMEE]: 'warning',
      [ETAT_REVISION.APPLIQUEE]: 'success',
      [ETAT_REVISION.ANNULEE]: 'neutral',
      [ETAPE_CONTENTIEUX.OUVERT]: 'warning',
      [ETAPE_CONTENTIEUX.INSTRUCTION]: 'info',
      [ETAPE_CONTENTIEUX.CONCILIATION]: 'signature',
      [ETAPE_CONTENTIEUX.CLOS]: 'neutral',
    }[valeur] ?? 'neutral'
  );
}

/* ================================================================== *
 * 3. Dates et périodes d'abonnement
 * ================================================================== */

/** Date du jour au format `AAAA-MM-JJ` (fuseau d'Abidjan = UTC). */
export function aujourdhui(maintenant = new Date()) {
  return new Date(maintenant).toISOString().slice(0, 10);
}

/** Valide une date `AAAA-MM-JJ`. */
export function estDate(ymd) {
  return typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(Date.parse(`${ymd}T00:00:00Z`));
}

/**
 * Ajoute des jours à une date `AAAA-MM-JJ`.
 * @param {string} ymd
 * @param {number} jours
 * @returns {string}
 */
export function ajouterJours(ymd, jours) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/**
 * Ajoute des mois à une date, en ramenant au dernier jour du mois si besoin
 * (31 janvier + 1 mois = 28 ou 29 février, jamais 3 mars).
 * @param {string} ymd
 * @param {number} mois
 * @returns {string}
 */
export function ajouterMois(ymd, mois) {
  const [a, m, j] = ymd.split('-').map(Number);
  const total = a * 12 + (m - 1) + mois;
  const annee = Math.floor(total / 12);
  const moisCible = (total % 12) + 1;
  const dernier = new Date(Date.UTC(annee, moisCible, 0)).getUTCDate();
  const jour = Math.min(j, dernier);
  return `${annee}-${String(moisCible).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Période ouverte par une prolongation.
 *
 * Règle de l'inventaire (« prolongation selon abonnement en cours ou expiré ») :
 * un abonnement **en cours** est prolongé à partir du lendemain de son échéance —
 * l'entreprise qui renouvelle en avance ne perd aucun jour ; un abonnement
 * **expiré** (ou absent) repart du jour du paiement — on ne facture pas la
 * période pendant laquelle l'accès était fermé.
 *
 * @param {{finActuelle: string|null, dureeMois: number, jour?: string}} p
 * @returns {{debuteLe: string, finitLe: string, enAvance: boolean}}
 */
export function periodeProlongation({ finActuelle, dureeMois, jour = aujourdhui() }) {
  if (!(Number.isInteger(dureeMois) && dureeMois > 0)) {
    throw new Error('La durée d’une formule d’abonnement doit être un nombre entier de mois, au moins un.');
  }
  const enAvance = Boolean(finActuelle) && finActuelle >= jour;
  const debuteLe = enAvance ? ajouterJours(finActuelle, 1) : jour;
  const finitLe = ajouterJours(ajouterMois(debuteLe, dureeMois), -1);
  return { debuteLe, finitLe, enAvance };
}

/** Jours restants avant une échéance (négatif si dépassée). */
export function joursAvant(ymd, jour = aujourdhui()) {
  if (!ymd) return null;
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${jour}T00:00:00Z`)) / 86400000);
}

/* ================================================================== *
 * 4. Tarifs : prix en vigueur à une date
 * ================================================================== */

/**
 * Une modification de tarif est-elle échue à cette date ?
 * @param {{etat: string, effetLe: string}} r
 * @param {string} jour
 */
export function revisionEchue(r, jour = aujourdhui()) {
  return r.etat === ETAT_REVISION.PROGRAMMEE && r.effetLe <= jour;
}

/**
 * Valide une demande de modification de tarif. Rend la liste des défauts.
 * @param {{montant: number, dureeMois?: number|null, effetLe: string, motif: string}} m
 * @param {{estFormule: boolean, jour?: string}} contexte
 * @returns {string[]}
 */
export function defautsRevision(m, { estFormule, jour = aujourdhui() }) {
  const defauts = [];
  if (!(Number.isInteger(m.montant) && m.montant > 0)) {
    defauts.push('Le nouveau montant doit être un nombre entier de francs, strictement positif.');
  }
  if (estFormule && !(Number.isInteger(m.dureeMois) && m.dureeMois >= 1 && m.dureeMois <= 36)) {
    defauts.push('La durée d’une formule d’abonnement est comprise entre 1 et 36 mois.');
  }
  if (!estDate(m.effetLe)) defauts.push('Indiquez la date d’effet de la modification.');
  else if (m.effetLe < jour) {
    defauts.push('La date d’effet ne peut pas être antérieure à aujourd’hui : une modification n’est jamais rétroactive.');
  }
  if (!String(m.motif ?? '').trim()) defauts.push('Le motif de la modification est obligatoire : il figure à l’historique.');
  return defauts;
}

/* ================================================================== *
 * 5. Numérotation
 * ================================================================== */

/**
 * Prochain numéro d'une série annuelle `PRE-AAAA-NNNN`, **séquentiel sans trou**
 * dans l'année : le plus grand numéro existant plus un. Calculé dans la
 * transaction d'écriture, et l'unicité est portée par le schéma.
 *
 * @param {string} prefixe Deux ou trois lettres majuscules.
 * @param {string[]} existants Numéros déjà attribués.
 * @param {Date} [maintenant]
 * @returns {string}
 */
export function numeroSuivant(prefixe, existants, maintenant = new Date()) {
  const annee = new Date(maintenant).getUTCFullYear();
  const motif = new RegExp(`^${prefixe}-${annee}-(\\d{4,})$`);
  const max = existants.reduce((n, x) => {
    const m = motif.exec(String(x ?? ''));
    return m ? Math.max(n, Number(m[1])) : n;
  }, 0);
  return `${prefixe}-${annee}-${String(max + 1).padStart(4, '0')}`;
}

/* ================================================================== *
 * 6. Mobile money simulé
 * ================================================================== */

/** Numéro ivoirien à dix chiffres (01, 05, 07), avec ou sans indicatif. */
export function normaliserNumeroMobile(saisie) {
  const chiffres = String(saisie ?? '').replace(/[\s.\-]/g, '').replace(/^\+225/, '').replace(/^00225/, '');
  return /^0[157]\d{8}$/.test(chiffres) ? chiffres : null;
}

/** Numéro masqué pour un document : seuls les deux premiers et deux derniers chiffres restent. */
export function masquerNumero(numero) {
  const n = String(numero ?? '');
  if (n.length < 6) return '••';
  return `${n.slice(0, 2)} •• •• •• ${n.slice(-2)}`;
}

const PREFIXES_TRANSACTION = Object.freeze({
  [OPERATEUR_MOBILE.ORANGE]: 'OM',
  [OPERATEUR_MOBILE.MTN]: 'MOMO',
  [OPERATEUR_MOBILE.MOOV]: 'MOOV',
  [OPERATEUR_MOBILE.WAVE]: 'WAVE',
  [MODE_PAIEMENT.CARTE]: 'CB',
});

/**
 * Référence de transaction rendue par l'opérateur — **simulée**. Lettres et
 * chiffres, sans espace : elle ne doit ressembler ni à un montant ni à un numéro.
 * @param {string} source Opérateur ou `carte`.
 * @param {() => number} [hasard]
 * @param {Date} [maintenant]
 */
export function referenceTransactionSimulee(source, hasard = Math.random, maintenant = new Date()) {
  const prefixe = PREFIXES_TRANSACTION[source] ?? 'TX';
  const d = new Date(maintenant).toISOString().slice(2, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(hasard() * alphabet.length) % alphabet.length];
  return `${prefixe}${d}${code}`;
}

/** Référence comparée sans casse, accents ni séparateurs. */
export const normaliserReference = (r) =>
  String(r ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ================================================================== *
 * 7. Contentieux
 * ================================================================== */

/**
 * Le passage d'une étape à une autre est-il permis ?
 * Une étape à la fois, sans retour ; la clôture est possible depuis toute étape
 * ouverte (un litige peut se régler dès l'ouverture).
 * @param {string} depuis
 * @param {string} vers
 */
export function transitionContentieuxPermise(depuis, vers) {
  if (depuis === ETAPE_CONTENTIEUX.CLOS) return false;
  if (vers === ETAPE_CONTENTIEUX.CLOS) return true;
  const i = ORDRE_CONTENTIEUX.indexOf(depuis);
  return i !== -1 && ORDRE_CONTENTIEUX[i + 1] === vers;
}

/** Étape suivante hors clôture, ou `null`. */
export function etapeSuivanteContentieux(depuis) {
  const i = ORDRE_CONTENTIEUX.indexOf(depuis);
  const suivante = ORDRE_CONTENTIEUX[i + 1];
  return suivante && suivante !== ETAPE_CONTENTIEUX.CLOS ? suivante : null;
}

/* ================================================================== *
 * 8. Synthèses et exports
 * ================================================================== */

/**
 * Totaux d'une liste de paiements par une clé.
 * @param {Array<Record<string, any>>} paiements
 * @param {string} cle
 * @returns {Array<{valeur: string, nombre: number, montant: number}>}
 */
export function totauxPar(paiements, cle) {
  const parValeur = new Map();
  for (const p of paiements) {
    const v = p[cle] ?? '—';
    const t = parValeur.get(v) ?? { valeur: v, nombre: 0, montant: 0 };
    t.nombre += 1;
    t.montant += typeof p.montant === 'number' ? p.montant : 0;
    parValeur.set(v, t);
  }
  return [...parValeur.values()].sort((a, b) => b.montant - a.montant);
}

/**
 * Une cellule CSV sûre : guillemets doublés, et **neutralisation des formules**
 * — une raison sociale commençant par « = », « + », « - » ou « @ » serait
 * exécutée par un tableur à l'ouverture du fichier (injection CSV).
 * @param {unknown} valeur
 */
export function celluleCsv(valeur) {
  if (valeur === null || valeur === undefined) return '';
  let t = String(valeur);
  if (typeof valeur !== 'number' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * Document CSV : séparateur point-virgule (tableurs en français), fins de ligne
 * CRLF, marque d'ordre des octets pour que les accents s'ouvrent correctement.
 * @param {string[]} entetes
 * @param {Array<Array<unknown>>} lignes
 */
export function documentCsv(entetes, lignes) {
  return `﻿${[entetes, ...lignes].map((l) => l.map(celluleCsv).join(';')).join('\r\n')}\r\n`;
}

/* ================================================================== *
 * 9. Montant en toutes lettres (reçu)
 * ================================================================== */

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };

function moinsDeCent(n) {
  if (n <= 16) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d <= 6) {
    if (u === 0) return DIZAINES[d];
    if (u === 1) return `${DIZAINES[d]} et un`;
    return `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (d === 7) return u === 1 ? 'soixante et onze' : `soixante-${moinsDeCent(10 + u)}`;
  // 80 à 99
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${moinsDeCent(n - 80)}`;
}

function moinsDeMille(n, final) {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let t = '';
  if (c === 1) t = 'cent';
  else if (c > 1) t = `${UNITES[c]} cent${r === 0 && final ? 's' : ''}`;
  if (r > 0) t = t ? `${t} ${moinsDeCent(r)}` : moinsDeCent(r);
  // « quatre-vingts » ne prend son « s » qu'en fin de nombre.
  if (!final) t = t.replace(/quatre-vingts$/, 'quatre-vingt');
  return t;
}

/**
 * Écrit un entier positif en toutes lettres (orthographe traditionnelle).
 * @param {number} n
 * @returns {string}
 */
export function enLettres(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error('Montant en lettres : entier positif attendu.');
  if (n === 0) return 'zéro';
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1e3);
  const reste = n % 1e3;
  const parts = [];
  // « million » et « milliard » sont des noms : « cent » et « vingt » s'y accordent.
  if (milliards) parts.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) parts.push(`${moinsDeMille(millions, true)} million${millions > 1 ? 's' : ''}`);
  if (milliers) parts.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
  if (reste) parts.push(moinsDeMille(reste, true));
  return parts.join(' ');
}
