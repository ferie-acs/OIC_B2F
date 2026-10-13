/**
 * Données de démonstration du lot b4 — abonnements, paiements, caisse, finances.
 *
 * Appelé à chaque démarrage par **une seule ligne** de l'amorçage (`app.js`).
 * **Idempotent, sans remplacement** : rien de ce qui existe n'est réécrit, et une
 * seconde exécution n'ajoute rien. Les soldes des comptes ne sont pas touchés —
 * d'autres démonstrations reposent sur eux (le transporteur 2 à découvert, M5.3).
 *
 * Ce qu'il ajoute :
 * - deux comptes de back-office : contentieux et supervision comptable ;
 * - la durée (12 mois) de la formule d'abonnement annuel ;
 * - le paiement au guichet de chaque abonnement initial (reçus de l'historique) ;
 * - un réabonnement saisi au guichet par l'agent n° 1, **en attente de validation**
 *   par l'agent n° 2 (quatre yeux) ;
 * - deux contentieux, l'un en instruction, l'autre ouvert.
 *
 * Toutes les données sont fictives et marquées `demo`.
 *
 * @module seed-lot-b4
 */

import { hacher } from './core/crypto.js';
import { CODE_TARIF, ETAT_COMPTE } from './domain/enums.js';
import {
  CANAL_PAIEMENT,
  ETAPE_CONTENTIEUX,
  ETAT_PAIEMENT,
  MODE_PAIEMENT,
  NATURE_CONTENTIEUX,
  OBJET_PAIEMENT,
  numeroSuivant,
} from './domain/finances.js';
import { depot, stockageInterne } from './repositories/index.js';
import { MOT_DE_PASSE_DEMO } from './seed.js';
import { appliquerRevisionsEchues } from './services/tarif.service.js';

/** Comptes de démonstration du lot. */
export const UTILISATEURS_LOT_B4 = Object.freeze([
  ['u-cont', 'contentieux@demo.invalid', 'DIOMANDÉ', 'Fatou', 'contentieux_paie', 'grp-oic'],
  ['u-compta', 'comptabilite@demo.invalid', 'TANOH', 'Serge', 'superviseur_comptabilite', 'grp-oic'],
]);

/** Règlement de chaque abonnement initial : mode et pièce. */
const REGLEMENTS_INITIAUX = Object.freeze([
  ['abo-grp-aff-1', MODE_PAIEMENT.CHEQUE, 'CHQ-DEMO-0101'],
  ['abo-grp-aff-2', MODE_PAIEMENT.ESPECES, null],
  ['abo-grp-tra-1', MODE_PAIEMENT.VIREMENT, 'VIR-DEMO-0102'],
  ['abo-grp-tra-2', MODE_PAIEMENT.ESPECES, null],
  ['abo-grp-tra-3', MODE_PAIEMENT.MOBILE_MONEY, 'OM-DEMO-0103'],
]);

const ilYa = (jours, heure = 9) => {
  const d = new Date(Date.now() - jours * 86400000);
  d.setUTCHours(heure, 15, 0, 0);
  return d.toISOString();
};

/**
 * Installe ou complète les données du lot.
 * @returns {Promise<void>}
 */
export async function amorcerLotB4() {
  if (!depot('utilisateur').brutParId('u-aff-1')?.demo) return;
  const manquants = UTILISATEURS_LOT_B4.filter(([id]) => !depot('utilisateur').brutParId(id));
  const empreinte = manquants.length ? await hacher(MOT_DE_PASSE_DEMO) : null;
  const maintenant = new Date().toISOString();

  stockageInterne().transaction((tx) => {
    const ajouter = (collection, objet) => {
      const lignes = tx.lire(collection);
      if (!lignes.some((l) => l.id === objet.id)) tx.ecrire(collection, [...lignes, objet]);
    };
    const completer = (collection, id, champs) => {
      const lignes = tx.lire(collection);
      const i = lignes.findIndex((l) => l.id === id);
      if (i === -1) return;
      const absents = Object.fromEntries(Object.entries(champs).filter(([k]) => lignes[i][k] === undefined));
      if (Object.keys(absents).length === 0) return;
      const suite = [...lignes];
      suite[i] = { ...lignes[i], ...absents };
      tx.ecrire(collection, suite);
    };

    // --- Comptes de back-office -------------------------------------
    for (const [id, email, nom, prenom, roleId, groupementId] of manquants) {
      ajouter('users', { id, email, nom, prenom, roleId, groupementId, motDePasse: empreinte, etat: ETAT_COMPTE.ACTIF, creeLe: maintenant, demo: true });
    }

    // --- Formule d'abonnement : sa durée ------------------------------
    completer('tarifs', CODE_TARIF.ABONNEMENT_ANNUEL, { dureeMois: 12 });

    // --- Reçus de l'historique : chaque abonnement initial a été payé ---
    const caissiere = 'u-conc';
    const controleur = 'u-conc-2';
    const initiaux = REGLEMENTS_INITIAUX
      .map(([aboId, mode, piece]) => [tx.lire('abonnements').find((a) => a.id === aboId), mode, piece])
      .filter(([a]) => a)
      .sort(([a], [b]) => a.debuteLe.localeCompare(b.debuteLe));
    for (const [a, mode, piece] of initiaux) {
      completer('abonnements', a.id, { tarifId: CODE_TARIF.ABONNEMENT_ANNUEL, dureeMois: 12, prolongeParUtilisateurId: controleur });
      const id = `pai-demo-${a.id}`;
      if (tx.lire('paiements').some((p) => p.id === id)) continue;
      const saisiLe = `${a.debuteLe}T09:15:00.000Z`;
      ajouter('paiements', {
        id,
        numero: numeroSuivant('RC', tx.lire('paiements').map((p) => p.numero), new Date(saisiLe)),
        groupementId: a.groupementId,
        objet: OBJET_PAIEMENT.ABONNEMENT,
        canal: CANAL_PAIEMENT.GUICHET,
        mode,
        ...(piece ? { referenceTransaction: piece } : {}),
        montant: a.montant,
        devise: a.devise,
        detail: 'Abonnement annuel à la plateforme — 12 mois',
        tarifId: CODE_TARIF.ABONNEMENT_ANNUEL,
        dureeMois: 12,
        abonnementId: a.id,
        etat: ETAT_PAIEMENT.ENCAISSE,
        saisiLe,
        saisiParUtilisateurId: caissiere,
        valideLe: `${a.debuteLe}T11:40:00.000Z`,
        valideParUtilisateurId: controleur,
        impressions: 1,
        demo: true,
      });
    }

    // --- Un réabonnement saisi au guichet, en attente du second agent ---
    const tarif = tx.lire('tarifs').find((t) => t.id === CODE_TARIF.ABONNEMENT_ANNUEL);
    if (tarif && !tx.lire('paiements').some((p) => p.id === 'pai-demo-attente')) {
      const saisiLe = new Date(Date.now() - 3600000).toISOString();
      ajouter('paiements', {
        id: 'pai-demo-attente',
        numero: numeroSuivant('RC', tx.lire('paiements').map((p) => p.numero), new Date(saisiLe)),
        groupementId: 'grp-tra-2',
        objet: OBJET_PAIEMENT.ABONNEMENT,
        canal: CANAL_PAIEMENT.GUICHET,
        mode: MODE_PAIEMENT.ESPECES,
        montant: tarif.montant,
        devise: tarif.devise,
        detail: `${tarif.libelle} — 12 mois`,
        tarifId: tarif.id,
        dureeMois: 12,
        etat: ETAT_PAIEMENT.EN_ATTENTE,
        saisiLe,
        saisiParUtilisateurId: caissiere,
        impressions: 1,
        demo: true,
      });
    }

    // --- Contentieux --------------------------------------------------
    const contentieux = [
      {
        id: 'ctx-demo-1',
        groupementId: 'grp-aff-2',
        nature: NATURE_CONTENTIEUX.IMPAYE,
        objet: 'Chèque remis au guichet pour un rechargement, revenu impayé de la banque (DÉMO).',
        montant: 50000,
        etape: ETAPE_CONTENTIEUX.INSTRUCTION,
        ouvert: 20,
        historique: [
          [ETAPE_CONTENTIEUX.OUVERT, 20, 'Ouverture du dossier sur avis de rejet bancaire.'],
          [ETAPE_CONTENTIEUX.INSTRUCTION, 12, 'Relance écrite adressée à l’entreprise ; dossier en instruction.'],
        ],
        pieces: [{ nom: 'Avis de rejet bancaire (DÉMO).pdf', type: 'application/pdf', taille: 184320 }],
      },
      {
        id: 'ctx-demo-2',
        groupementId: 'grp-tra-2',
        partieAdverseGroupementId: 'grp-aff-1',
        nature: NATURE_CONTENTIEUX.LITIGE_MARCHANDISE,
        objet: 'Avarie déclarée à la livraison : sacs de cacao mouillés, réserves portées par le destinataire (DÉMO).',
        montant: 120000,
        etape: ETAPE_CONTENTIEUX.OUVERT,
        ouvert: 3,
        historique: [[ETAPE_CONTENTIEUX.OUVERT, 3, 'Ouverture du dossier à la demande de l’affréteur.']],
        pieces: [
          { nom: 'Lettre de voiture avec réserves (DÉMO).pdf', type: 'application/pdf', taille: 96512 },
          { nom: 'Photographies de la marchandise (DÉMO).zip', type: 'application/zip', taille: 2457600 },
        ],
      },
    ];
    for (const c of contentieux) {
      if (tx.lire('contentieux').some((x) => x.id === c.id)) continue;
      const ouvertLe = ilYa(c.ouvert);
      ajouter('contentieux', {
        id: c.id,
        reference: numeroSuivant('CT', tx.lire('contentieux').map((x) => x.reference), new Date(ouvertLe)),
        groupementId: c.groupementId,
        ...(c.partieAdverseGroupementId ? { partieAdverseGroupementId: c.partieAdverseGroupementId } : {}),
        nature: c.nature,
        objet: c.objet,
        montant: c.montant,
        montantRegle: 0,
        etape: c.etape,
        pieces: c.pieces.map((p) => ({ ...p, ajouteLe: ouvertLe, ajouteParUtilisateurId: 'u-cont' })),
        historique: c.historique.map(([etape, jours, commentaire]) => ({ etape, le: ilYa(jours), parUtilisateurId: 'u-cont', commentaire })),
        ouvertLe,
        ouvertParUtilisateurId: 'u-cont',
        demo: true,
      });
    }
  });

  // Sans tâche planifiée : les modifications de tarif échues s'appliquent ici.
  appliquerRevisionsEchues();
}
