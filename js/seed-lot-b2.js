/**
 * Lot b2 : organisation interne — jeu de démonstration.
 *
 * **Idempotent, sans remplacement** : chaque objet n'est ajouté que s'il manque,
 * et rien de ce qui existe n'est réécrit. Appelé à chaque démarrage, après
 * l'amorçage et la mise à niveau anti-fraude. Toutes les données sont fictives
 * (raisons sociales « DÉMO », adresses en `.invalid`, numéros en `+225 00`).
 *
 * Contenu :
 * - une entreprise intermédiaire active, « Fret Conseil Intermédiation DÉMO »,
 *   son responsable (`intermediaire@demo.invalid`) et un collaborateur ;
 * - deux mandants : l'affréteur Cacao Lagunes Export (déclarer du fret,
 *   réserver) et le transporteur Trans Lagunes (proposer, répondre) ;
 * - une entité rattachée de Trans Lagunes, qui hérite de sa vérification.
 *
 * Le mot de passe de démonstration est celui de tous les comptes (`demo2026`).
 *
 * @module seed-lot-b2
 */

import { hacher } from './core/crypto.js';
import { ETAT_ABONNEMENT, ETAT_COMPTE, ETAT_MANDAT, PERIMETRE_MANDAT, TYPE_GROUPEMENT } from './domain/enums.js';
import { depot, stockageInterne } from './repositories/index.js';
import { MOT_DE_PASSE_DEMO } from './seed.js';

const jour = (n) => new Date(Date.now() + n * 86400000).toISOString();
const date = (n) => jour(n).slice(0, 10);

/** Comptes de démonstration du lot, pour le guide et les tests. */
export const COMPTES_LOT_B2 = Object.freeze({
  intermediaire: 'intermediaire@demo.invalid',
  collaborateur: 'collaborateur.intermediaire@demo.invalid',
  filiale: 'agence.sanpedro@demo.invalid',
});

/**
 * Complète le jeu de démonstration. Sans effet si le jeu de base n'est pas en
 * place, ou si tout est déjà présent.
 * @returns {Promise<void>}
 */
export async function completerJeuLotB2() {
  if (!depot('utilisateur').brutParId('u-aff-1')?.demo) return;
  if (!depot('groupement').brutParId('grp-tra-1')) return;

  const maintenant = new Date().toISOString();
  const transLagunes = depot('groupement').brutParId('grp-tra-1');
  const utilisateursAttendus = ['u-int-1', 'u-int-2', 'u-fil-1'];
  const empreinte = utilisateursAttendus.every((id) => depot('utilisateur').brutParId(id))
    ? null
    : await hacher(MOT_DE_PASSE_DEMO);

  stockageInterne().transaction((tx) => {
    /** Ajoute un objet validé par le schéma, s'il manque. */
    const ajouter = (entite, objet) => {
      const d = depot(entite);
      if (tx.lire(d.collection).some((o) => o.id === objet.id)) return;
      d.creer({ demo: true, ...objet }, { tx });
    };

    // --- L'entreprise intermédiaire --------------------------------------
    ajouter('groupement', {
      id: 'grp-int-1',
      raisonSociale: 'Fret Conseil Intermédiation DÉMO',
      type: TYPE_GROUPEMENT.INTERMEDIAIRE,
      rccm: 'CI-DEMO-2023-I-0011',
      compteContribuable: 'DEMO-CC-0011',
      pays: 'Côte d’Ivoire',
      localiteId: 'loc-abidjan',
      adresse: 'Plateau, immeuble DÉMO, Abidjan',
      contactNom: 'Serge KOUADIO (DÉMO)',
      contactTelephone: '+225 00 31 41 59',
      contactEmail: 'contact@fret-conseil.invalid',
      etat: ETAT_COMPTE.ACTIF,
      creeLe: jour(-120),
    });
    ajouter('abonnement', {
      id: 'abo-grp-int-1',
      groupementId: 'grp-int-1',
      montant: 150000,
      devise: 'XOF',
      debuteLe: date(-65),
      finitLe: date(300),
      etat: ETAT_ABONNEMENT.ACTIF,
      creeLe: maintenant,
    });

    // --- L'entité rattachée de Trans Lagunes -----------------------------
    if (transLagunes) {
      ajouter('groupement', {
        id: 'grp-fil-1',
        raisonSociale: 'Trans Lagunes — agence de San-Pédro DÉMO',
        type: TYPE_GROUPEMENT.TRANSPORTEUR,
        rccm: transLagunes.rccm,
        compteContribuable: transLagunes.compteContribuable,
        carteTransporteurNumero: transLagunes.carteTransporteurNumero,
        carteTransporteurEcheance: transLagunes.carteTransporteurEcheance,
        pays: transLagunes.pays,
        localiteId: 'loc-san-pedro',
        adresse: 'Zone portuaire, San-Pédro (DÉMO)',
        contactNom: 'Rokia COULIBALY (DÉMO)',
        contactTelephone: '+225 00 27 18 28',
        contactEmail: 'sanpedro@translagunes.invalid',
        etat: ETAT_COMPTE.ACTIF,
        parentId: 'grp-tra-1',
        creeParUtilisateurId: 'u-tra-1',
        creeLe: jour(-30),
      });
    }

    // --- Les comptes ------------------------------------------------------
    if (empreinte) {
      const compte = (id, email, nom, prenom, roleId, groupementId, creePar) => ajouter('utilisateur', {
        id, email, nom, prenom, roleId, groupementId,
        creeParUtilisateurId: creePar,
        motDePasse: empreinte,
        etat: ETAT_COMPTE.ACTIF,
        creeLe: maintenant,
      });
      compte('u-int-1', COMPTES_LOT_B2.intermediaire, 'KOUADIO', 'Serge', 'intermediaire', 'grp-int-1', undefined);
      compte('u-int-2', COMPTES_LOT_B2.collaborateur, 'BROU', 'Nadia', 'collaborateur_intermediaire', 'grp-int-1', 'u-int-1');
      if (transLagunes) {
        compte('u-fil-1', COMPTES_LOT_B2.filiale, 'COULIBALY', 'Rokia', 'transporteur', 'grp-fil-1', 'u-tra-1');
      }
    }

    // --- Deux mandants ----------------------------------------------------
    ajouter('mandat', {
      id: 'mdt-demo-1',
      reference: 'MD-2026-0001',
      mandantGroupementId: 'grp-aff-1',
      intermediaireGroupementId: 'grp-int-1',
      typeMandant: TYPE_GROUPEMENT.AFFRETEUR,
      perimetre: [PERIMETRE_MANDAT.DECLARER_FRET, PERIMETRE_MANDAT.GERER_RESERVATIONS],
      debuteLe: date(-20),
      finitLe: date(160),
      etat: ETAT_MANDAT.ACTIF,
      creeLe: jour(-20),
      creeParUtilisateurId: 'u-aff-1',
    });
    if (transLagunes) {
      ajouter('mandat', {
        id: 'mdt-demo-2',
        reference: 'MD-2026-0002',
        mandantGroupementId: 'grp-tra-1',
        intermediaireGroupementId: 'grp-int-1',
        typeMandant: TYPE_GROUPEMENT.TRANSPORTEUR,
        perimetre: [PERIMETRE_MANDAT.PROPOSER_VEHICULES, PERIMETRE_MANDAT.REPONDRE_RESERVATIONS],
        debuteLe: date(-10),
        finitLe: date(110),
        etat: ETAT_MANDAT.ACTIF,
        creeLe: jour(-10),
        creeParUtilisateurId: 'u-tra-1',
      });
    }
  });
}
