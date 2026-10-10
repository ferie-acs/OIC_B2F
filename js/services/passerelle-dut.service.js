/**
 * Passerelle Bourse de fret → plateforme DUT (lot A).
 *
 * Après la validation d'une mise en relation, chaque étape et chaque incident du
 * transport sont transmis à la plateforme DUT, qui alimente le suivi du DUT relié.
 * Conception : `docs/superpowers/specs/2026-10-10-passerelle-b2f-dut-design.md`
 * (dépôt DUT).
 *
 * Les deux POC gardent des origines séparées (B2F :8081, DUT :8080). Le transport
 * passe par `postMessage` vers une page relais du DUT chargée dans une iframe
 * invisible : message adressé à l'origine exacte du DUT, réponses acceptées de
 * cette seule origine. Hors navigateur (tests Node), la passerelle ne fait rien.
 *
 * Seuls les champs nécessaires au DUT partent ; téléphones et e-mails (classés
 * CONTACT) ne sont jamais transmis. Les messages non acquittés restent en file
 * et repartent au chargement suivant.
 *
 * Lot B : la Bourse de fret demande au DUT le statut du document relié à chaque
 * transport et le mémorise ; « en route » est refusé à l'écran tant que ce DUT
 * n'est pas validé (voir `exigenceDut`).
 *
 * @module services/passerelle-dut.service
 */

import { depot, stockageInterne } from '../repositories/index.js';
import { donneesMissionPourDut } from './dut.service.js';

const PORT_DUT = '8080';
const CLE_FILE = 'passerelle_dut_file';
const CLE_STATUTS = 'passerelle_dut_statuts';
const EVENEMENT_STATUT = 'passerelle-dut:statut';
const STATUTS_DUT = Object.freeze({
  EN_EDITION: 'en préparation',
  TERMINE: 'soumis, en attente de validation',
  VALIDE: 'validé',
  REJETE: 'rejeté',
  SUSPENDU: 'suspendu',
  RETIRE: 'retiré',
});
const TAILLE_FILE = 500;
const CHAMPS_MISSION = [
  'corridor', 'departPrevu', 'arriveePrevue', 'marchandise', 'poidsTotalT',
  'transporteurRaisonSociale', 'affreteurRaisonSociale', 'immatriculation', 'chauffeurNom',
];

let relais = null;
let pret = false;
const demandesStatut = new Set();

/** Origine de la plateforme DUT, déduite de la page : même hôte, port du DUT. */
function origineDut() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !globalThis.location) return null;
  return `${location.protocol}//${location.hostname}:${PORT_DUT}`;
}

const cleMessage = (m) => (m.type === 'b2f.mission' ? m.appariementId : m.id);
const lireFile = () => {
  const file = stockageInterne().lirePreference(CLE_FILE);
  return Array.isArray(file) ? file : [];
};
const ecrireFile = (file) => stockageInterne().ecrirePreference(CLE_FILE, file.slice(-TAILLE_FILE));

function vider() {
  if (!pret || !relais?.contentWindow) return;
  for (const message of lireFile()) relais.contentWindow.postMessage(message, origineDut());
  for (const appariementId of demandesStatut) {
    relais.contentWindow.postMessage({ v: 1, type: 'b2f.statut?', appariementId }, origineDut());
  }
  demandesStatut.clear();
}

const lireStatuts = () => {
  const statuts = stockageInterne().lirePreference(CLE_STATUTS);
  return statuts && typeof statuts === 'object' && !Array.isArray(statuts) ? statuts : {};
};

/** Réponse du DUT à une demande de statut : contrôlée, mémorisée, signalée si elle change. */
function memoriserStatut(reponse) {
  if (typeof reponse.appariementId !== 'string' || reponse.appariementId.length > 80) return;
  const dut = reponse.dut;
  const valide = dut === null || (dut && Object.hasOwn(STATUTS_DUT, dut.statut) &&
    (dut.numero === null || (typeof dut.numero === 'string' && dut.numero.length <= 40)));
  if (!valide) return;
  const statuts = lireStatuts();
  const avant = statuts[reponse.appariementId];
  const apres = dut ? { statut: dut.statut, numero: dut.numero } : { statut: null, numero: null };
  if (avant?.statut === apres.statut && avant?.numero === apres.numero) return;
  statuts[reponse.appariementId] = { ...apres, recuLe: new Date().toISOString() };
  stockageInterne().ecrirePreference(CLE_STATUTS, statuts);
  globalThis.dispatchEvent?.(new Event(EVENEMENT_STATUT));
}

function surReponse(event) {
  if (event.origin !== origineDut() || event.source !== relais?.contentWindow) return;
  const reponse = event.data;
  if (reponse?.v !== 1) return;
  if (reponse.type === 'dut.ready') { pret = true; vider(); return; }
  if (reponse.type === 'dut.statut') { memoriserStatut(reponse); return; }
  if (reponse.type !== 'dut.ack' || typeof reponse.id !== 'string') return;
  // Appliqué, en attente côté DUT ou doublon : le DUT le détient. Refusé : le renvoyer n'y changerait rien.
  ecrireFile(lireFile().filter((m) => cleMessage(m) !== reponse.id));
  if (reponse.statut === 'refusé') console.warn('[passerelle DUT] message refusé :', reponse.raison);
}

/** Charge le relais une fois ; renvoie la file en attente dès qu'il est prêt. */
export function demarrerPasserelle() {
  const origine = origineDut();
  if (!origine || relais) return;
  window.addEventListener('message', surReponse);
  relais = document.createElement('iframe');
  relais.src = `${origine}/bridge.html`;
  relais.title = 'Passerelle vers la plateforme DUT';
  relais.hidden = true;
  relais.setAttribute('aria-hidden', 'true');
  relais.setAttribute('tabindex', '-1');
  relais.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  relais.referrerPolicy = 'no-referrer';
  document.body.appendChild(relais);
}

/** Au démarrage : si des messages attendent, recharge le relais pour les renvoyer. */
export function reprendreFileDut() {
  if (origineDut() && lireFile().length) demarrerPasserelle();
}

function emettre(message) {
  if (!origineDut()) return;
  const file = lireFile();
  if (!file.some((m) => cleMessage(m) === cleMessage(message))) file.push(message);
  ecrireFile(file);
  if (relais) vider(); else demarrerPasserelle();
}

/** Mission validée : instantané minimal pour préremplir le DUT. */
export function transmettreMission(ctx, appariementId) {
  if (!origineDut()) return;
  const appariement = depot('appariement').brutParId(appariementId);
  const donnees = donneesMissionPourDut(ctx, appariementId);
  if (!appariement || !donnees) return;
  emettre({
    v: 1,
    type: 'b2f.mission',
    appariementId,
    reference: appariement.reference,
    donnees: Object.fromEntries(CHAMPS_MISSION.filter((c) => donnees[c] != null).map((c) => [c, donnees[c]])),
  });
}

/** Étape ou incident inscrit au journal du transport. */
export function transmettreEvenement(transport, entree) {
  if (!origineDut() || !entree) return;
  emettre({
    v: 1,
    type: 'b2f.event',
    id: entree.id,
    appariementId: transport.appariementId,
    categorie: entree.type,
    valeur: entree.valeur,
    observation: typeof entree.observation === 'string' ? entree.observation.slice(0, 2000) : '',
    horodatage: entree.horodatage,
  });
}

/** Demande au DUT le statut des documents reliés à ces transports ; la réponse arrive plus tard. */
export function demanderStatutsDut(appariementIds) {
  if (!origineDut()) return;
  for (const id of appariementIds) if (typeof id === 'string') demandesStatut.add(id);
  if (relais) vider(); else demarrerPasserelle();
}

/** Statut mémorisé du DUT relié : `{statut, numero, libelle}`, ou `null` si jamais reçu. */
export function statutDut(appariementId) {
  const connu = lireStatuts()[appariementId];
  if (!connu) return null;
  return { ...connu, libelle: connu.statut ? STATUTS_DUT[connu.statut] : 'aucun DUT créé' };
}

/** Nom de l'événement émis quand un statut de DUT change (pour rafraîchir l'écran). */
export const EVENEMENT_STATUT_DUT = EVENEMENT_STATUT;

/**
 * Motif du refus de départ selon le statut connu du DUT, ou `null` si le départ est permis.
 * Fonction pure : elle porte la règle, testée sans navigateur.
 * @param {{statut: string|null}|null} connu
 * @returns {string|null}
 */
export function motifDepartSansDut(connu) {
  if (connu?.statut === 'VALIDE') return null;
  if (!connu || !connu.statut) {
    return 'Aucun DUT validé n’est connu pour ce transport : créez-le dans la plateforme DUT et faites-le valider avant le départ.';
  }
  return `Le DUT de ce transport est ${STATUTS_DUT[connu.statut]} : un camion ne part pas sans DUT validé.`;
}

/**
 * Le départ (« en route ») exige-t-il un DUT validé, et l'est-il ?
 * La règle ne s'applique que lorsque la passerelle est active (navigateur) :
 * sous Node, sans plateforme DUT joignable, elle reste inactive.
 * @param {string} appariementId
 * @returns {{active: boolean, motif: string|null}}
 */
export function exigenceDut(appariementId) {
  if (!origineDut()) return { active: false, motif: null };
  return { active: true, motif: motifDepartSansDut(statutDut(appariementId)) };
}
