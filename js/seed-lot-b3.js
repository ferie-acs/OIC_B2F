/**
 * Données de démonstration du lot b3 — marché, flotte, attestation, contrôle sur route.
 *
 * **Idempotent, sans remplacement** : chaque objet n'est ajouté que s'il manque,
 * et les fiches existantes ne sont complétées que sur les champs absents. Tout
 * est fictif et marqué DÉMO.
 *
 * Ce module installe :
 * - le compte de l'agent de contrôle sur route (`controle@demo.invalid`) ;
 * - les fiches d'identité des chauffeurs de démonstration, et un chauffeur parti ;
 * - une **proposition** d'un transporteur sur une demande de l'affréteur (sens B) ;
 * - une demande **expirée**, à republier ;
 * - une mise en relation **validée et payée**, en route, avec son **attestation**.
 *
 * @module seed-lot-b3
 */

import { hacher } from './core/crypto.js';
import { depot, stockageInterne } from './repositories/index.js';
import { MOT_DE_PASSE_DEMO } from './seed.js';

const dans = (jours) => new Date(Date.now() + jours * 86400000).toISOString();
const dansDate = (jours) => dans(jours).slice(0, 10);
const CONTROLE = Object.freeze({ verifieLe: dans(-30), verifieParUtilisateurId: 'u-activ' });

/** Fiches d'identité des chauffeurs du jeu historique. */
const FICHES = Object.freeze({
  'chf-1': { pieceType: 'cni', pieceNumero: 'CI-DEMO-0001', pieceDelivreeLe: dansDate(-900), pieceExpireLe: dansDate(1200), nationalite: 'Ivoirienne', dateNaissance: '1984-03-12', permisCategories: ['B', 'C', 'E'], cacrNumero: 'CACR-DEMO-0001', cacrDelivreLe: dansDate(-700), actif: true },
  // Catégories B et C seulement : il ne peut pas conduire un ensemble de quatre essieux.
  'chf-2': { pieceType: 'cni', pieceNumero: 'CI-DEMO-0002', pieceDelivreeLe: dansDate(-400), pieceExpireLe: dansDate(1500), nationalite: 'Ivoirienne', dateNaissance: '1990-07-04', permisCategories: ['B', 'C'], actif: true },
  'chf-3': { pieceType: 'passeport', pieceNumero: 'BF-DEMO-0003', pieceDelivreeLe: dansDate(-600), pieceExpireLe: dansDate(900), nationalite: 'Burkinabè', dateNaissance: '1979-11-23', permisCategories: ['B', 'C', 'E'], actif: true },
});

/**
 * Complète le jeu de démonstration pour le lot b3. Appelée à chaque démarrage :
 * chaque ajout vérifie d'abord sa présence, si bien qu'un second appel — ou un
 * appel après réinitialisation du jeu — ne crée aucun doublon.
 * @returns {Promise<void>}
 */
export async function completerLotB3() {
  if (!depot('utilisateur').brutParId('u-aff-1')?.demo) return;
  const empreinte = depot('utilisateur').brutParId('u-ctrl') ? null : await hacher(MOT_DE_PASSE_DEMO);
  const maintenant = new Date().toISOString();

  try {
    stockageInterne().transaction((tx) => {
      const ajouter = (collection, objet) => {
        const lignes = tx.lire(collection);
        if (!lignes.some((l) => l.id === objet.id)) tx.ecrire(collection, [...lignes, { demo: true, ...objet }]);
      };
      const completer = (collection, id, champs) => {
        tx.ecrire(collection, tx.lire(collection).map((l) => {
          if (l.id !== id) return l;
          const manquants = Object.fromEntries(Object.entries(champs).filter(([k]) => l[k] === undefined));
          return { ...l, ...manquants };
        }));
      };

      if (empreinte) {
        ajouter('users', {
          id: 'u-ctrl', email: 'controle@demo.invalid', nom: 'BAMBA', prenom: 'Issouf',
          roleId: 'agent_controle_route', groupementId: 'grp-dgttc', motDePasse: empreinte,
          etat: 'actif', creeLe: maintenant,
        });
      }
      for (const [id, champs] of Object.entries(FICHES)) completer('chauffeurs', id, champs);

      // Un chauffeur parti : retiré, historique conservé, plus proposé.
      ajouter('chauffeurs', {
        id: 'chf-b3-1', groupementId: 'grp-tra-1', nom: 'TOURÉ Ibrahim (DÉMO)', permisNumero: 'PC-DEMO-0031',
        permisEcheance: dansDate(200), telephone: '+225 00 31 31 31', vehiculeId: null,
        pieceType: 'cni', pieceNumero: 'CI-DEMO-0031', pieceDelivreeLe: dansDate(-1000), pieceExpireLe: dansDate(500),
        nationalite: 'Ivoirienne', dateNaissance: '1975-01-30', permisCategories: ['B', 'C'],
        ...CONTROLE, creeLe: dans(-400), actif: false, retireLe: dans(-20), dateDepart: dansDate(-21),
        motifRetrait: 'Fin de contrat (DÉMO)',
        mouvements: [{ id: 'mvt-b3-1', type: 'retrait', le: dans(-20), dateEffet: dansDate(-21), motif: 'Fin de contrat (DÉMO)', parUtilisateurId: 'u-tra-1' }],
      });

      // Deux camions contrôlés, dédiés aux scénarios du lot : les offres du parcours
      // historique (off-1, off-2) restent intactes.
      ajouter('vehicules', {
        id: 'veh-b3-1', groupementId: 'grp-tra-1', immatriculation: '2468 KL 01', carteGrise: 'CG-DEMO-2468',
        capaciteT: 25, ptacT: 38, carrosserieId: 'car-plateau', essieuxId: 'ess-3', carteTransportNumero: 'CT-VEH-B3-1',
        carteTransportEcheance: dansDate(280), prixKmT: 92, etat: 'disponible', ...CONTROLE, creeLe: dans(-90),
      });
      ajouter('vehicules', {
        id: 'veh-b3-2', groupementId: 'grp-tra-1', immatriculation: '1357 MN 01', carteGrise: 'CG-DEMO-1357',
        capaciteT: 25, ptacT: 38, carrosserieId: 'car-bache', essieuxId: 'ess-3', carteTransportNumero: 'CT-VEH-B3-2',
        carteTransportEcheance: dansDate(320), prixKmT: 88, etat: 'disponible', ...CONTROLE, creeLe: dans(-80),
      });

      const fret = (n, libelle, prov, dest, depart, etat = 'publiee') => {
        ajouter('declarations', {
          id: `dec-b3-${n}`, reference: `DF-B3-000${n}`, groupementId: 'grp-aff-1', libelle,
          provenanceId: prov, destinationId: dest, etat: 'active', creeeLe: dans(-10), publieeLe: dans(-10),
          creeeParUtilisateurId: 'u-aff-1',
        });
        ajouter('demandes', {
          id: `dem-b3-${n}`, reference: `DT-B3-000${n}`, declarationId: `dec-b3-${n}`, groupementId: 'grp-aff-1',
          departPrevu: dans(depart), arriveePrevue: dans(depart + 2), capaciteId: 'cap-25', carrosserieId: n === 1 ? 'car-bache' : 'car-plateau',
          essieuxId: 'ess-3', contraintes: 'Bâchage obligatoire (DÉMO).',
          lignes: [{ id: `lig-b3-${n}`, produitId: n === 3 ? 'sh-2523' : 'sh-1801', poidsT: 18, emballageId: 'emb-sac' }],
          etat, creeeLe: dans(-10), publieeLe: dans(-10), creeeParUtilisateurId: 'u-aff-1',
        });
      };
      fret(1, 'Cacao conditionné — Bouaké vers Abidjan (DÉMO)', 'loc-bouake', 'loc-abidjan', 5);
      // Date de départ dépassée : la demande est « expirée » et se republie.
      fret(2, 'Café vert — Man vers San-Pédro (DÉMO)', 'loc-man', 'loc-san-pedro', -3);
      // Mise en relation validée, transport en route : l'attestation est en vigueur.
      fret(3, 'Ciment en sacs — Abidjan vers Yamoussoukro (DÉMO)', 'loc-abidjan', 'loc-yamoussoukro', -1);

      ajouter('offres', {
        id: 'off-b3-1', reference: 'OV-B3-0001', groupementId: 'grp-tra-1', vehiculeId: 'veh-b3-2', chauffeurPressentiId: 'chf-1',
        localiteDepartId: 'loc-bouake', localiteArriveeId: 'loc-abidjan', disponibleDu: dans(2), disponibleAu: dans(14),
        prixKmT: 88, trajetRetour: false, trajetVide: false, etat: 'disponible', publieeLe: dans(-2), creeeParUtilisateurId: 'u-tra-1',
      });
      ajouter('offres', {
        id: 'off-b3-2', reference: 'OV-B3-0002', groupementId: 'grp-tra-1', vehiculeId: 'veh-b3-1', chauffeurPressentiId: 'chf-1',
        localiteDepartId: 'loc-abidjan', localiteArriveeId: 'loc-yamoussoukro', disponibleDu: dans(-4), disponibleAu: dans(10),
        prixKmT: 92, trajetRetour: false, trajetVide: false, etat: 'disponible', publieeLe: dans(-5), creeeParUtilisateurId: 'u-tra-1',
      });
    });

    await scenarios();

  } catch (e) {
    console.warn('[B2F] Jeu de démonstration du lot b3 incomplet :', e);
  }
}

/** Déroule les scénarios par les services : aucun état n'est écrit à la main. */
async function scenarios() {
  const { contexteDe } = await import('./services/auth.service.js');
  const matching = await import('./services/matching.service.js');
  const { avancer } = await import('./services/transport.service.js');
  const { emettreAttestation } = await import('./services/attestation.service.js');
  const ctx = (id) => contexteDe(depot('utilisateur').brutParId(id));

  // Sens B : le transporteur propose son camion sur la demande de l'affréteur.
  if (!depot('appariement').brutOu((a) => a.demandeId === 'dem-b3-1').length) {
    matching.engager(ctx('u-tra-1'), { offreId: 'off-b3-1', demandeId: 'dem-b3-1', sens: 'demande_vers_offre' });
  }

  // Mise en relation validée et payée, transport en route, attestation émise.
  let a = depot('appariement').brutOu((x) => x.demandeId === 'dem-b3-3')[0];
  if (!a) {
    a = matching.engager(ctx('u-aff-1'), { offreId: 'off-b3-2', demandeId: 'dem-b3-3' });
    matching.repondre(ctx('u-tra-1'), a.id, { accepte: true });
    const p = matching.preparerValidation(ctx('u-aff-1'), a.id);
    const { transport } = matching.valider(ctx('u-aff-1'), a.id, { attendu: p.attendu });
    for (let i = 0; i < 3; i += 1) avancer(ctx('u-tra-1'), transport.id);
  }
  if (!depot('attestation').brutOu((x) => x.appariementId === a.id).length) {
    emettreAttestation(ctx('u-tra-1'), a.id);
  }
}
