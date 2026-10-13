/**
 * Lot b5 : données de démonstration de l'administration OIC et de l'espace DGTTC.
 *
 * Idempotent : relancé sur un navigateur déjà amorcé, il n'ajoute rien deux
 * fois. Toutes les données sont fictives et marquées `demo`.
 *
 * @module seed-lot-b5
 */

import { hacher } from './core/crypto.js';
import { ETAT_COMPTE, ETAT_INCIDENT_APP } from './domain/enums.js';
import { depot, stockageInterne } from './repositories/index.js';
import { MOT_DE_PASSE_DEMO } from './seed.js';

const il = (heures) => new Date(Date.now() - heures * 3600000).toISOString();

/** Comptes ajoutés par le lot b5. */
export const UTILISATEURS_LOT_B5 = Object.freeze([
  // Second agent DGTTC, non administrateur : il consulte, il ne gère pas les comptes.
  ['u-dgttc-2', 'dgttc2@demo.invalid', 'KOUADIO', 'Ange', 'dgttc', 'grp-dgttc', ETAT_COMPTE.ACTIF],
  // Agent OIC désactivé : démontre la réactivation par l'administrateur.
  ['u-oic-cpte', 'comptes.oic@demo.invalid', 'BROU', 'Rose', 'superviseur_cpte', 'grp-oic', ETAT_COMPTE.SUSPENDU],
]);

function incidentsDemo() {
  return [
    {
      id: 'inc-demo-1',
      reference: 'IA-2026-0001',
      categorie: 'affichage',
      gravite: 'majeure',
      etat: ETAT_INCIDENT_APP.NOUVEAU,
      titre: 'La carte du tableau de bord reste grise',
      description: 'Depuis ce matin, la carte des trajets ne se charge pas sur le tableau de bord. La liste des offres reste consultable.',
      ecran: 'Tableau de bord',
      capture: { nom: 'carte-grise.png', type: 'image/png', tailleKo: 214 },
      groupementId: 'grp-tra-1',
      declareParUtilisateurId: 'u-tra-1',
      declareParRoleId: 'transporteur',
      declareLe: il(5),
      suivi: [{ id: 'sui-demo-1', horodatage: il(5), auteurUtilisateurId: 'u-tra-1', etat: ETAT_INCIDENT_APP.NOUVEAU, commentaire: 'Signalement enregistré.' }],
      demo: true,
    },
    {
      id: 'inc-demo-2',
      reference: 'IA-2026-0002',
      categorie: 'donnees_erronees',
      gravite: 'mineure',
      etat: ETAT_INCIDENT_APP.EN_COURS,
      titre: 'Localité mal orthographiée dans la liste',
      description: 'La localité de San-Pédro apparaît sans accent dans un export. Les déclarations ne sont pas bloquées.',
      ecran: 'Déclarations de fret',
      groupementId: 'grp-aff-1',
      declareParUtilisateurId: 'u-aff-1',
      declareParRoleId: 'affreteur',
      declareLe: il(30),
      graviteRetenue: 'mineure',
      impact: 'Gêne d’affichage, sans effet sur les opérations.',
      qualifieParUtilisateurId: 'u-conc',
      qualifieLe: il(28),
      attribueAUtilisateurId: 'u-conc-2',
      attribueLe: il(27),
      suivi: [
        { id: 'sui-demo-2', horodatage: il(30), auteurUtilisateurId: 'u-aff-1', etat: ETAT_INCIDENT_APP.NOUVEAU, commentaire: 'Signalement enregistré.' },
        { id: 'sui-demo-3', horodatage: il(28), auteurUtilisateurId: 'u-conc', etat: ETAT_INCIDENT_APP.QUALIFIE, commentaire: 'Gravité retenue : mineure. Gêne d’affichage, sans effet sur les opérations.' },
        { id: 'sui-demo-4', horodatage: il(27), auteurUtilisateurId: 'u-conc', etat: ETAT_INCIDENT_APP.EN_COURS, commentaire: 'Attribué à Marc ASSI.' },
      ],
      demo: true,
    },
  ];
}

/**
 * Complète le jeu de démonstration. Sans effet sur un jeu non amorcé.
 * @returns {Promise<void>}
 */
export async function amorcerLotB5() {
  if (!depot('utilisateur').brutParId('u-dgttc')?.demo) return;
  const manquants = UTILISATEURS_LOT_B5.filter(([id]) => !depot('utilisateur').brutParId(id));
  const empreinte = manquants.length ? await hacher(MOT_DE_PASSE_DEMO) : null;
  const maintenant = new Date().toISOString();

  stockageInterne().transaction((tx) => {
    const ajouter = (collection, objet) => {
      const lignes = tx.lire(collection);
      if (!lignes.some((l) => l.id === objet.id)) tx.ecrire(collection, [...lignes, objet]);
    };
    // L'agent DGTTC historique est l'administrateur des comptes de son institution.
    const users = tx.lire('users');
    if (users.some((u) => u.id === 'u-dgttc' && u.administrateur === undefined)) {
      tx.ecrire('users', users.map((u) => (u.id === 'u-dgttc' ? { ...u, administrateur: true } : u)));
    }
    for (const [id, email, nom, prenom, roleId, groupementId, etat] of manquants) {
      ajouter('users', { id, email, nom, prenom, roleId, groupementId, motDePasse: empreinte, etat, administrateur: roleId === 'dgttc' ? false : undefined, creeLe: maintenant, demo: true });
    }
    const avecIncidents = tx.lire('users').some((u) => u.id === 'u-conc-2');
    if (avecIncidents) for (const i of incidentsDemo()) ajouter('incidents_applicatifs', i);
  });
}
