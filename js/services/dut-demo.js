/** Exemple DUT facultatif : ne s'exécute que sur demande dans les comptes DÉMO. */
import { decider } from '../domain/access.js';
import { CODE_TARIF } from '../domain/enums.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { contexteCourant, contexteDe } from './auth.service.js';
import * as matching from './matching.service.js';

const VERSION = 'dut-exemple-v1';
const IDS = Object.freeze({
  vehicule: 'veh-demo-dut-v1', chauffeur: 'chf-demo-dut-v1',
  declaration: 'dec-demo-dut-v1', demande: 'dem-demo-dut-v1', offre: 'off-demo-dut-v1',
});

/** Réservé au groupement transporteur initial du POC, sur un utilisateur DÉMO. */
export function exempleDutDisponible(ctx) {
  if (!ctx || ctx.groupementId !== 'grp-tra-1') return false;
  const utilisateur = depot('utilisateur').brutParId(ctx.utilisateurId);
  if (!utilisateur?.demo || utilisateur.groupementId !== 'grp-tra-1') return false;
  if (!decider(ctx, 'dut.generer', { groupementId: 'grp-tra-1' }).autorise) return false;
  return ['grp-tra-1', 'grp-aff-1'].every(id => depot('groupement').brutParId(id)?.demo === true)
    && [['u-tra-1', 'grp-tra-1'], ['u-aff-1', 'grp-aff-1']].every(([id, groupement]) => {
      const u = depot('utilisateur').brutParId(id);
      return u?.demo === true && u.groupementId === groupement;
    });
}

/**
 * Ajoute un exemple dédié sans DUT : l'utilisateur le génère depuis son écran.
 * Les IDs fixes rendent la création et la reprise après interruption idempotentes.
 * Chaque phase est transactionnelle ; les étapes métier passent par matching.
 * @param {import('../domain/access.js').Contexte} [ctx]
 * @returns {string} Identifiant de la mise en relation prête à générer.
 */
export function initialiserDutDemo(ctx = contexteCourant()) {
  if (!exempleDutDisponible(ctx)) throw new Error('Cet exemple est réservé au compte transporteur du jeu de démonstration initial.');
  const trouver = () => depot('appariement').brutOu(a => a.offreId === IDS.offre && a.demandeId === IDS.demande &&
    a.groupementTransporteurId === 'grp-tra-1' && a.groupementAffreteurId === 'grp-aff-1')[0];
  let a = trouver();
  if (a?.etat === 'valider') return a.id;
  if (a && !['reserver', 'accepter'].includes(a.etat)) {
    throw new Error('L’exemple a déjà été traité ou annulé. Ses données sont conservées sans recréer le dossier.');
  }
  const aff = contexteDe(depot('utilisateur').brutParId('u-aff-1'));
  const tra = contexteDe(depot('utilisateur').brutParId('u-tra-1'));
  for (const [contexte, droit] of [[aff, 'appariement.reserver'], [aff, 'appariement.valider'], [tra, 'appariement.repondre']]) {
    const decision = decider(contexte, droit, { groupementId: contexte.groupementId });
    if (!decision.autorise) throw new Error(`L’exemple ne peut pas être préparé : ${decision.explication}`);
  }
  const tarifs = [
    ['grp-aff-1', CODE_TARIF.FRAIS_AFFRETEUR, 'aff'],
    ['grp-tra-1', CODE_TARIF.FRAIS_TRANSPORTEUR, 'tra'],
  ].map(([groupementId, code, suffixe]) => {
    const tarif = depot('tarif').brutParId(code);
    if (!tarif?.actif || !(tarif.montant > 0)) throw new Error('Les tarifs de mise en relation doivent être actifs pour charger cet exemple.');
    return { groupementId, montant: tarif.montant, suffixe };
  });
  const maintenant = new Date().toISOString();
  const jour = n => new Date(Date.now() + n * 86400000).toISOString();
  stockageInterne().transaction(tx => {
    const ajouter = (entite, record) => {
      const existant = depot(entite).brutParId(record.id);
      if (existant) {
        if (existant.demo !== true || existant.seedVersion !== VERSION || existant.groupementId !== record.groupementId) {
          throw new Error('Un identifiant de l’exemple est déjà utilisé. Aucune donnée existante ne sera remplacée.');
        }
        return;
      }
      depot(entite).creer({ ...record, demo: true, seedVersion: VERSION }, { tx });
    };
    ajouter('vehicule', {
      id: IDS.vehicule, groupementId: 'grp-tra-1', immatriculation: 'DEMO DUT 001',
      carteGrise: 'CG-DEMO-DUT-001', capaciteT: 25, ptacT: 38,
      carrosserieId: 'car-plateau', essieuxId: 'ess-3', carteTransportNumero: 'CT-DEMO-DUT-001',
      carteTransportEcheance: jour(365).slice(0, 10), paysImmatriculation: 'Côte d’Ivoire',
      stationnementLocaliteId: 'loc-abidjan', stationnementMisAJourLe: maintenant,
      etat: 'disponible', creeLe: maintenant,
    });
    ajouter('chauffeur', {
      id: IDS.chauffeur, groupementId: 'grp-tra-1', nom: 'Chauffeur exemple DUT DÉMO',
      permisNumero: 'PC-DEMO-DUT-001', permisEcheance: jour(365).slice(0, 10),
      telephone: '+225 00 00 00 01', vehiculeId: null, creeLe: maintenant,
    });
    ajouter('declaration', {
      id: IDS.declaration, reference: 'DF-DEMO-DUT-001', groupementId: 'grp-aff-1',
      libelle: 'Cacao en fèves — exemple DUT DÉMO', provenanceId: 'loc-abidjan', destinationId: 'loc-bouake',
      etat: 'active', creeeLe: maintenant, publieeLe: maintenant, creeeParUtilisateurId: 'u-aff-1',
    });
    ajouter('demande', {
      id: IDS.demande, reference: 'DT-DEMO-DUT-001', declarationId: IDS.declaration, groupementId: 'grp-aff-1',
      departPrevu: jour(2), arriveePrevue: jour(3), capaciteId: 'cap-25', carrosserieId: 'car-plateau', essieuxId: 'ess-3',
      lignes: [{ id: 'lig-demo-dut-v1', produitId: 'sh-1801', poidsT: 22, volumeM3: 35, nombreColis: 440, emballageId: 'emb-sac' }],
      etat: 'publiee', creeeLe: maintenant, publieeLe: maintenant, creeeParUtilisateurId: 'u-aff-1',
    });
    ajouter('offre', {
      id: IDS.offre, reference: 'OV-DEMO-DUT-001', groupementId: 'grp-tra-1', vehiculeId: IDS.vehicule,
      chauffeurPressentiId: IDS.chauffeur, localiteDepartId: 'loc-abidjan', localiteArriveeId: 'loc-bouake',
      disponibleDu: jour(1), disponibleAu: jour(5), trajetRetour: false, trajetVide: false,
      etat: 'disponible', publieeLe: maintenant, creeeParUtilisateurId: 'u-tra-1',
    });
    // Provision fictive du seul manque éventuel, au plus une fois par partie.
    for (const { groupementId, montant, suffixe } of tarifs) {
      const operations = tx.lire('operations');
      const solde = operations.filter(o => o.groupementId === groupementId)
        .reduce((total, o) => total + (o.sens === 'credit' ? o.montant : -o.montant), 0);
      const id = `ope-demo-dut-provision-${suffixe}-v1`;
      if (solde >= montant || operations.some(o => o.id === id)) continue;
      depot('operation').creer({
        id, groupementId, montant: montant - solde, sens: 'credit', motif: 'rechargement',
        libelle: 'Provision fictive — exemple DUT DÉMO', referenceEncaissement: `DEMO-DUT-${suffixe.toUpperCase()}`,
        horodatage: maintenant, auteurUtilisateurId: 'u-conc', demo: true,
      }, { tx });
    }
  });
  a ||= matching.engager(aff, { offreId: IDS.offre, demandeId: IDS.demande });
  if (a.etat === 'reserver') a = matching.repondre(tra, a.id, { accepte: true });
  if (a.etat === 'accepter') {
    const preparation = matching.preparerValidation(aff, a.id);
    if (!preparation.possible) throw new Error(preparation.refus.join(' '));
    a = matching.valider(aff, a.id, { attendu: preparation.attendu }).appariement;
  }
  return a.id;
}
