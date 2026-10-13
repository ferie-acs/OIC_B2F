/**
 * Données de démonstration du lot b1 — inscription, activation, messagerie.
 *
 * **Idempotent, sans remplacement** : chaque objet n'est ajouté que si son
 * identifiant est absent. Relancé, le module ne crée aucun doublon et ne
 * réécrit rien de ce qu'une démonstration a modifié.
 *
 * Tout est fictif : raisons sociales suffixées « DÉMO », adresses en `.invalid`,
 * numéros au préfixe non attribué `+225 00`.
 *
 * @module seed-lot-b1
 */

import { hacher } from './core/crypto.js';
import {
  CANAL_MESSAGE,
  ETAT_COMPTE,
  ETAT_INSCRIPTION,
  ETAT_PIECE,
  ETAT_VERIFICATION,
  STATUT_MESSAGE,
  TYPE_GROUPEMENT,
  labelOf,
} from './domain/enums.js';
import { MODELES } from './services/messagerie.service.js';
import { depot, stockageInterne } from './repositories/index.js';
import { MOT_DE_PASSE_DEMO } from './seed.js';

const jour = 86400000;
/** @param {number} j */
const il = (j) => new Date(Date.now() - j * jour).toISOString();
/** @param {number} j */
const dansDate = (j) => new Date(Date.now() + j * jour).toISOString().slice(0, 10);

/** Agents d'activation : deux par file, pour le principe des quatre yeux. */
export const AGENTS_LOT_B1 = Object.freeze([
  ['u-activ-2', 'activation2@demo.invalid', 'DOUMBIA', 'Fatou', 'activation_inscription', 'grp-oic'],
  ['u-activ-aff', 'activation.affreteur@demo.invalid', 'GNAGNE', 'Rose', 'activation_inscription_affreteur', 'grp-oic'],
  ['u-activ-aff-2', 'activation.affreteur2@demo.invalid', 'KOUADIO', 'Serge', 'activation_inscription_affreteur', 'grp-oic'],
]);

/** Entreprises inscrites en ligne, à différentes étapes du dossier. */
export const ENTREPRISES_LOT_B1 = Object.freeze([
  {
    groupement: {
      id: 'grp-b1-aff',
      raisonSociale: 'Négoce Atlantique DÉMO',
      type: TYPE_GROUPEMENT.AFFRETEUR,
      rccm: 'CI-DEMO-2026-A-0210',
      compteContribuable: 'DEMO-CC-0210',
      carteChargeurNumero: 'CC-DEMO-0210',
      pays: 'Côte d’Ivoire',
      localiteId: 'loc-abidjan',
      adresse: 'Treichville, rue DÉMO 4, Abidjan',
      contactNom: 'Clarisse ADJOUA',
      contactTelephone: '+225 00 21 02 10',
      contactEmail: 'contact@negoce-atlantique.invalid',
      inscriptionEtat: ETAT_INSCRIPTION.EN_ATTENTE,
      inscritLe: il(3),
    },
    utilisateur: ['u-b1-aff', 'inscrit.affreteur@demo.invalid', 'ADJOUA', 'Clarisse', 'affreteur', '+225 00 21 02 11', 'Directrice générale'],
    pieces: [
      ['pce-b1-aff-1', 'rccm', 'CI-DEMO-2026-A-0210', null, ETAT_PIECE.CONFORME, 'u-activ-aff', 'rccm-negoce-atlantique.pdf'],
      ['pce-b1-aff-2', 'attestation_fiscale', 'DEMO-CC-0210', null, ETAT_PIECE.CONFORME, 'u-activ-aff', 'dfe-negoce-atlantique.pdf'],
      ['pce-b1-aff-3', 'carte_chargeur', 'CC-DEMO-0210', dansDate(340), ETAT_PIECE.DEPOSEE, null, 'carte-chargeur.jpg'],
    ],
    echanges: [],
  },
  {
    groupement: {
      id: 'grp-b1-tra',
      raisonSociale: 'Savane Express Transport DÉMO',
      type: TYPE_GROUPEMENT.TRANSPORTEUR,
      rccm: 'CI-DEMO-2026-T-0222',
      compteContribuable: 'DEMO-CC-0222',
      carteTransporteurNumero: 'CT-DEMO-0222',
      carteTransporteurEcheance: dansDate(300),
      pays: 'Côte d’Ivoire',
      localiteId: 'loc-korhogo',
      adresse: 'Quartier Soba, Korhogo (DÉMO)',
      contactNom: 'Yacouba SILUÉ',
      contactTelephone: '+225 00 22 02 22',
      contactEmail: 'contact@savane-express.invalid',
      inscriptionEtat: ETAT_INSCRIPTION.A_COMPLETER,
      inscriptionMotif: 'L’attestation d’assurance déposée couvre l’exercice précédent. Déposez celle de l’année en cours.',
      inscritLe: il(6),
      verificationEtat: ETAT_VERIFICATION.A_VERIFIER,
    },
    utilisateur: ['u-b1-tra', 'inscrit.transporteur@demo.invalid', 'SILUÉ', 'Yacouba', 'transporteur', '+225 00 22 02 23', 'Gérant'],
    pieces: [
      ['pce-b1-tra-1', 'rccm', 'CI-DEMO-2026-T-0222', null, ETAT_PIECE.CONFORME, 'u-activ', 'rccm-savane.pdf'],
      ['pce-b1-tra-2', 'carte_transporteur', 'CT-DEMO-0222', dansDate(300), ETAT_PIECE.CONFORME, 'u-activ', 'carte-transporteur.pdf'],
      ['pce-b1-tra-3', 'assurance', 'ASS-DEMO-0222', dansDate(20), ETAT_PIECE.NON_CONFORME, 'u-activ', 'assurance-2025.pdf',
        'Attestation de l’exercice précédent : déposez celle de l’année en cours.'],
    ],
    echanges: [
      { le: il(2), auteur: 'oic', nature: 'complement', texte: 'L’attestation d’assurance déposée couvre l’exercice précédent. Déposez celle de l’année en cours.' },
    ],
  },
  {
    groupement: {
      id: 'grp-b1-int',
      raisonSociale: 'Lagune Transit Services DÉMO',
      type: TYPE_GROUPEMENT.INTERMEDIAIRE,
      rccm: 'CI-DEMO-2026-I-0233',
      compteContribuable: 'DEMO-CC-0233',
      agrementNumero: 'AG-DEMO-0233',
      agrementEcheance: dansDate(400),
      pays: 'Côte d’Ivoire',
      localiteId: 'loc-san-pedro',
      adresse: 'Zone portuaire, San-Pédro (DÉMO)',
      contactNom: 'Marius ZADI',
      contactTelephone: '+225 00 23 02 33',
      contactEmail: 'contact@lagune-transit.invalid',
      inscriptionEtat: ETAT_INSCRIPTION.EN_ATTENTE,
      inscritLe: il(1),
    },
    utilisateur: ['u-b1-int', 'inscrit.intermediaire@demo.invalid', 'ZADI', 'Marius', 'auxiliaire_affreteur', '+225 00 23 02 34', 'Responsable des opérations'],
    pieces: [
      ['pce-b1-int-1', 'rccm', 'CI-DEMO-2026-I-0233', null, ETAT_PIECE.DEPOSEE, null, 'rccm-lagune-transit.pdf'],
      ['pce-b1-int-2', 'attestation_fiscale', 'DEMO-CC-0233', null, ETAT_PIECE.DEPOSEE, null, 'dfe-lagune-transit.pdf'],
      ['pce-b1-int-3', 'agrement_intermediaire', 'AG-DEMO-0233', dansDate(400), ETAT_PIECE.DEPOSEE, null, 'agrement.pdf'],
    ],
    echanges: [],
  },
]);

/** Comptes de démonstration du lot, pour le guide. */
export const COMPTES_LOT_B1 = Object.freeze([
  ...ENTREPRISES_LOT_B1.map((e) => e.utilisateur[1]),
  ...AGENTS_LOT_B1.map((a) => a[1]),
]);

/**
 * Ajoute les données du lot b1 à un jeu de démonstration amorcé.
 * @returns {Promise<void>}
 */
export async function amorcerLotB1() {
  if (!depot('utilisateur').brutParId('u-aff-1')?.demo) return;
  const ids = new Set(depot('utilisateur').brutTous().map((u) => u.id));
  const aCreer = [...AGENTS_LOT_B1.map((a) => a[0]), ...ENTREPRISES_LOT_B1.map((e) => e.utilisateur[0])]
    .some((id) => !ids.has(id));
  const empreinte = aCreer ? await hacher(MOT_DE_PASSE_DEMO) : null;
  const maintenant = new Date().toISOString();

  stockageInterne().transaction((tx) => {
    const ajouter = (collection, objet) => {
      const lignes = tx.lire(collection);
      if (!lignes.some((l) => l.id === objet.id)) tx.ecrire(collection, [...lignes, objet]);
    };
    const utilisateur = ([id, email, nom, prenom, roleId, groupementId], extra = {}) => ({
      id, email, nom, prenom, roleId, groupementId, motDePasse: empreinte,
      etat: ETAT_COMPTE.ACTIF, creeLe: maintenant, demo: true, ...extra,
    });

    for (const a of AGENTS_LOT_B1) if (empreinte) ajouter('users', utilisateur(a));

    for (const e of ENTREPRISES_LOT_B1) {
      const g = e.groupement;
      ajouter('groupements', {
        ...g, etat: ETAT_COMPTE.ACTIF, creeLe: g.inscritLe, inscriptionEchanges: e.echanges, demo: true,
      });
      const [id, email, nom, prenom, roleId, telephone, fonction] = e.utilisateur;
      if (empreinte) ajouter('users', utilisateur([id, email, nom, prenom, roleId, g.id], { telephone, fonction, creeLe: g.inscritLe }));
      for (const [pid, typePiece, numero, expireLe, etat, decidePar, fichier, motif] of e.pieces) {
        ajouter('pieces_dossier', {
          id: pid, groupementId: g.id, typePiece, numero,
          ...(expireLe ? { expireLe } : {}),
          fichier: { nom: fichier, type: fichier.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', taille: 184320 },
          etat,
          ...(motif ? { motif } : {}),
          deposeLe: g.inscritLe,
          deposeParUtilisateurId: id,
          ...(decidePar ? { decideLe: il(2), decideParUtilisateurId: decidePar } : {}),
          demo: true,
        });
      }
      const accuse = MODELES['inscription.recue'];
      const params = { raisonSociale: g.raisonSociale, type: labelOf(g.type) };
      ajouter('messages', {
        id: `msg-b1-${g.id}`, canal: CANAL_MESSAGE.COURRIEL, statut: STATUT_MESSAGE.SIMULE,
        destinataireUtilisateurId: id, destinataireGroupementId: g.id, adresse: email,
        objet: accuse.objet(params), corps: accuse.corps(params), modele: 'inscription.recue',
        expediteurRoleId: 'plateforme', envoyeLe: g.inscritLe, demo: true,
      });
      if (g.inscriptionEtat === ETAT_INSCRIPTION.A_COMPLETER) {
        const m = MODELES['complement.demande'];
        const p = { raisonSociale: g.raisonSociale, motif: g.inscriptionMotif };
        ajouter('messages', {
          id: `msg-b1-${g.id}-complement`, canal: CANAL_MESSAGE.COURRIEL, statut: STATUT_MESSAGE.SIMULE,
          destinataireUtilisateurId: id, destinataireGroupementId: g.id, adresse: email,
          objet: m.objet(p), corps: m.corps(p), modele: 'complement.demande',
          expediteurUtilisateurId: 'u-activ', expediteurRoleId: 'activation_inscription', envoyeLe: il(2), demo: true,
        });
      }
    }
  });
}
