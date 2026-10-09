/**
 * Jeux de données de démonstration.
 *
 * **Aucune donnée n'est extraite du système existant** (décision D17, risque R9) :
 * il contient des données d'exploitation réelles. Tout ce qui suit est inventé —
 * raisons sociales, personnes, immatriculations, RCCM — et porte `demo: true`.
 *
 * Les noms d'entreprises sont volontairement génériques et suffixés « DÉMO » pour
 * qu'aucune confusion avec une société existante ne soit possible. Les numéros de
 * téléphone utilisent des préfixes non attribués ; les adresses électroniques le
 * domaine réservé `.invalid` (RFC 2606).
 *
 * @module seed
 */

import { hacher } from './core/crypto.js';
import {
  CODE_TARIF,
  ETAT_ABONNEMENT,
  ETAT_COMPTE,
  ETAT_DECLARATION,
  ETAT_DEMANDE,
  ETAT_OFFRE,
  ETAT_VEHICULE,
  MOTIF_OPERATION,
  SENS_OPERATION,
  TYPE_GROUPEMENT,
} from './domain/enums.js';
import { depot, stockageInterne } from './repositories/index.js';

/** Mot de passe unique des comptes de démonstration. Affiché à l'écran. */
export const MOT_DE_PASSE_DEMO = 'demo2026';

/** @param {number} jours @returns {string} ISO */
const dans = (jours) => new Date(Date.now() + jours * 86400000).toISOString();
/** @param {number} jours @returns {string} ISO date seule */
const dansDate = (jours) => dans(jours).slice(0, 10);

/* ------------------------------------------------------------------ *
 * Référentiels
 * ------------------------------------------------------------------ */

const LOCALITES = [
  ['abidjan', 'Abidjan'],
  ['bouake', 'Bouaké'],
  ['san-pedro', 'San-Pédro'],
  ['yamoussoukro', 'Yamoussoukro'],
  ['korhogo', 'Korhogo'],
  ['daloa', 'Daloa'],
  ['man', 'Man'],
  ['ouagadougou', 'Ouagadougou (BF)'],
];

const PRODUITS_SH = [
  ['1801', 'Cacao en fèves (SH 1801)'],
  ['0901', 'Café non torréfié (SH 0901)'],
  ['4001', 'Caoutchouc naturel (SH 4001)'],
  ['1511', 'Huile de palme (SH 1511)'],
  ['2523', 'Ciment (SH 2523)'],
  ['5201', 'Coton non cardé (SH 5201)'],
];

const CAPACITES = [
  ['10', '10 tonnes'],
  ['25', '25 tonnes'],
  ['40', '40 tonnes'],
];

const CARROSSERIES = [
  ['plateau', 'Plateau'],
  ['bache', 'Bâché'],
  ['citerne', 'Citerne'],
  ['frigo', 'Frigorifique'],
  ['benne', 'Benne'],
];

const ESSIEUX = [
  ['2', '2 essieux'],
  ['3', '3 essieux'],
  ['4', '4 essieux'],
];

const EMBALLAGES = [
  ['sac', 'Sacs'],
  ['vrac', 'Vrac'],
  ['palette', 'Palettes'],
  ['conteneur', 'Conteneur'],
];

/**
 * Construit les entrées de référentiel.
 * @returns {Array<Record<string, any>>}
 */
function referentiels() {
  /** @type {Array<Record<string, any>>} */
  const out = [];
  const ajouter = (famille, paires, prefixe) => {
    for (const [code, libelle] of paires) {
      out.push({ id: `${prefixe}-${code}`, famille, code, libelle, actif: true });
    }
  };
  ajouter('localites', LOCALITES, 'loc');
  ajouter('produits_sh', PRODUITS_SH, 'sh');
  ajouter('capacites', CAPACITES, 'cap');
  ajouter('carrosseries', CARROSSERIES, 'car');
  ajouter('essieux', ESSIEUX, 'ess');
  ajouter('emballages', EMBALLAGES, 'emb');
  return out;
}

/* ------------------------------------------------------------------ *
 * Acteurs
 * ------------------------------------------------------------------ */

const GROUPEMENTS = [
  {
    id: 'grp-aff-1',
    raisonSociale: 'Cacao Lagunes Export DÉMO',
    type: TYPE_GROUPEMENT.AFFRETEUR,
    rccm: 'CI-DEMO-2020-A-0001',
    compteContribuable: 'DEMO-CC-0001',
    pays: 'Côte d’Ivoire',
    localiteId: 'loc-abidjan',
    adresse: 'Zone portuaire, lot DÉMO 12, Abidjan',
    contactNom: 'Aya KONAN (DÉMO)',
    contactTelephone: '+225 00 11 22 33',
    contactEmail: 'contact@cacao-lagunes.invalid',
  },
  {
    id: 'grp-aff-2',
    raisonSociale: 'Coton Nord Négoce DÉMO',
    type: TYPE_GROUPEMENT.AFFRETEUR,
    rccm: 'CI-DEMO-2021-A-0007',
    compteContribuable: 'DEMO-CC-0007',
    pays: 'Côte d’Ivoire',
    localiteId: 'loc-korhogo',
    adresse: 'Route de Ferké, Korhogo (DÉMO)',
    contactNom: 'Ibrahim SORO (DÉMO)',
    contactTelephone: '+225 00 44 55 66',
    contactEmail: 'negoce@coton-nord.invalid',
  },
  {
    id: 'grp-tra-1',
    raisonSociale: 'Trans Lagunes DÉMO',
    type: TYPE_GROUPEMENT.TRANSPORTEUR,
    rccm: 'CI-DEMO-2019-T-0042',
    compteContribuable: 'DEMO-CC-0042',
    carteTransporteurNumero: 'CT-DEMO-0042',
    carteTransporteurEcheance: dansDate(300),
    pays: 'Côte d’Ivoire',
    localiteId: 'loc-abidjan',
    adresse: 'Yopougon, zone industrielle DÉMO, Abidjan',
    contactNom: 'Moussa DIABATÉ (DÉMO)',
    contactTelephone: '+225 00 77 88 99',
    contactEmail: 'exploitation@translagunes.invalid',
  },
  {
    id: 'grp-tra-2',
    raisonSociale: 'Routière du Centre DÉMO',
    type: TYPE_GROUPEMENT.TRANSPORTEUR,
    rccm: 'CI-DEMO-2022-T-0088',
    compteContribuable: 'DEMO-CC-0088',
    carteTransporteurNumero: 'CT-DEMO-0088',
    carteTransporteurEcheance: dansDate(120),
    pays: 'Côte d’Ivoire',
    localiteId: 'loc-bouake',
    adresse: 'Quartier Air France, Bouaké (DÉMO)',
    contactNom: 'Awa TRAORÉ (DÉMO)',
    contactTelephone: '+225 00 12 34 56',
    contactEmail: 'contact@routiere-centre.invalid',
  },
  {
    id: 'grp-oic',
    raisonSociale: 'Exploitant de la plateforme (DÉMO)',
    type: TYPE_GROUPEMENT.INSTITUTION,
    pays: 'Côte d’Ivoire',
    localiteId: 'loc-abidjan',
    contactNom: 'Service exploitation (DÉMO)',
    contactEmail: 'exploitation@plateforme.invalid',
  },
  {
    id: 'grp-dgttc',
    raisonSociale: 'DGTTC (DÉMO)',
    type: TYPE_GROUPEMENT.INSTITUTION,
    pays: 'Côte d’Ivoire',
    localiteId: 'loc-abidjan',
    contactNom: 'Cellule de contrôle (DÉMO)',
    contactEmail: 'controle@dgttc.invalid',
  },
];

const UTILISATEURS = [
  ['u-aff-1', 'affreteur@demo.invalid', 'KONAN', 'Aya', 'affreteur', 'grp-aff-1'],
  ['u-aux-1', 'auxiliaire@demo.invalid', 'BAMBA', 'Sékou', 'auxiliaire_affreteur', 'grp-aff-1'],
  ['u-aff-2', 'affreteur2@demo.invalid', 'SORO', 'Ibrahim', 'affreteur', 'grp-aff-2'],
  ['u-tra-1', 'transporteur@demo.invalid', 'DIABATÉ', 'Moussa', 'transporteur', 'grp-tra-1'],
  ['u-auxt-1', 'auxtransport@demo.invalid', 'YAO', 'Affoué', 'auxiliaire_transporteur', 'grp-tra-1'],
  ['u-tra-2', 'transporteur2@demo.invalid', 'TRAORÉ', 'Awa', 'transporteur', 'grp-tra-2'],
  ['u-conc', 'concessionnaire@demo.invalid', 'KOUAMÉ', 'Léa', 'concessionnaire', 'grp-oic'],
  ['u-dgttc', 'dgttc@demo.invalid', 'OUATTARA', 'Bakary', 'dgttc', 'grp-dgttc'],
  ['u-part', 'partenaire@demo.invalid', 'KOFFI', 'Danielle', 'partenaire', 'grp-tra-2'],
  ['u-caisse', 'caisse@demo.invalid', 'N’GUESSAN', 'Paul', 'agent_caisse', 'grp-oic'],
];

/** Comptes proposés sur l'écran de connexion (spécification A.1). */
export const COMPTES_DEMO = Object.freeze([
  { email: 'affreteur@demo.invalid', titre: 'Affréteur', sous: 'Cacao Lagunes Export — DÉMO' },
  { email: 'transporteur@demo.invalid', titre: 'Transporteur', sous: 'Trans Lagunes — DÉMO' },
  {
    email: 'auxiliaire@demo.invalid',
    titre: 'Auxiliaire',
    sous: 'Sous-compte de Cacao Lagunes — DÉMO',
  },
  {
    email: 'concessionnaire@demo.invalid',
    titre: 'Concessionnaire',
    sous: 'Exploitant de la plateforme — DÉMO',
  },
  {
    email: 'dgttc@demo.invalid',
    titre: 'DGTTC',
    sous: 'Autorité de contrôle — consultation seule — DÉMO',
  },
]);

const VEHICULES = [
  ['veh-1', 'grp-tra-1', '1234 AB 01', 'CG-DEMO-1234', 25, 38, 'car-plateau', 'ess-3', 300, 95],
  ['veh-2', 'grp-tra-1', '5678 CD 01', 'CG-DEMO-5678', 40, 48, 'car-bache', 'ess-4', 210, 110],
  // Carte de transport échue : démontre le cas « véhicule non publiable ».
  ['veh-3', 'grp-tra-1', '9012 EF 01', 'CG-DEMO-9012', 10, 16, 'car-benne', 'ess-2', -20, 80],
  ['veh-4', 'grp-tra-2', '3456 GH 02', 'CG-DEMO-3456', 25, 38, 'car-plateau', 'ess-3', 180, 88],
  ['veh-5', 'grp-tra-2', '7890 IJ 02', 'CG-DEMO-7890', 40, 48, 'car-citerne', 'ess-4', 400, 130],
];

const CHAUFFEURS = [
  ['chf-1', 'grp-tra-1', 'KOUASSI Yao (DÉMO)', 'PC-DEMO-0001', 400, '+225 00 21 43 65', 'veh-1'],
  ['chf-2', 'grp-tra-1', 'DIALLO Amadou (DÉMO)', 'PC-DEMO-0002', 150, '+225 00 65 43 21', 'veh-2'],
  ['chf-3', 'grp-tra-2', 'KONÉ Salif (DÉMO)', 'PC-DEMO-0003', 250, '+225 00 98 76 54', 'veh-4'],
];

/* ------------------------------------------------------------------ *
 * Amorçage
 * ------------------------------------------------------------------ */

/**
 * Le jeu de démonstration est-il déjà en place ?
 * @returns {boolean}
 */
export function dejaAmorce() {
  return depot('utilisateur').brutTous().length > 0;
}

/**
 * Déroule un second dossier complet, appartenant à un AUTRE groupement.
 *
 * Note de rétrospective de la campagne QA : le jeu ne portait qu'un seul
 * transport complet, ce qui **masquait les fuites d'agrégat et de locataire**.
 * Le KPI « Transports en route » comptait toute la plateforme (QA-03) sans que
 * cela se voie — il n'y avait qu'un seul groupement à compter. De même, aucun
 * test ne pouvait détecter qu'un tiers lisait les montants d'autrui (QA-01) :
 * il n'existait pas de dossier « d'autrui ».
 *
 * Ce second dossier lie `grp-aff-2` à `grp-tra-2` — deux acteurs étrangers au
 * premier. Toute fuite entre locataires a désormais de quoi se manifester.
 *
 * @returns {Promise<void>}
 */
async function secondDossier() {
  const { contexteDe } = await import('./services/auth.service.js');
  const matching = await import('./services/matching.service.js');
  const transport = await import('./services/transport.service.js');

  const ctx = (id) => contexteDe(depot('utilisateur').brutParId(id));
  const affreteur = ctx('u-aff-2');
  const transporteur = ctx('u-tra-2');

  // L'abonnement de grp-aff-2 est expiré par conception (il démontre M10.2) :
  // on le prolonge le temps de dérouler le dossier, puis on le laisse expiré.
  const abo = depot('abonnement').brutOu((a) => a.groupementId === 'grp-aff-2')[0];
  const finExpiree = abo.finitLe;
  depot('abonnement').modifier(abo.id, { finitLe: dansDate(200), etat: ETAT_ABONNEMENT.ACTIF });

  const actif = contexteDe(depot('utilisateur').brutParId('u-aff-2'));
  const ap = matching.engager(actif, { offreId: 'off-4', demandeId: 'dem-3' });
  matching.repondre(transporteur, ap.id, { accepte: true });
  const p = matching.preparerValidation(actif, ap.id);
  const { transport: t } = matching.valider(actif, ap.id, { attendu: p.attendu });

  // Transport en route : c'est lui qui aurait révélé le KPI non cloisonné.
  for (const _ of [0, 1, 2]) transport.avancer(transporteur, t.id);

  depot('abonnement').modifier(abo.id, { finitLe: finExpiree, etat: ETAT_ABONNEMENT.EXPIRE });
  void affreteur;
}

/**
 * Installe le jeu de démonstration.
 *
 * Tout est écrit dans **une seule transaction** : un amorçage à moitié appliqué
 * produirait des références brisées que les dépôts refuseraient ensuite, sans
 * qu'on comprenne pourquoi.
 *
 * @returns {Promise<void>}
 */
export async function amorcer() {
  const empreinte = await hacher(MOT_DE_PASSE_DEMO);
  const maintenant = new Date().toISOString();

  stockageInterne().transaction((tx) => {
    // --- Référentiels et tarifs -------------------------------------
    tx.ecrire('referentiels', referentiels());
    tx.ecrire('tarifs', [
      {
        id: CODE_TARIF.ABONNEMENT_ANNUEL,
        libelle: 'Abonnement annuel à la plateforme',
        montant: 150000,
        devise: 'XOF',
        actif: true,
        modifieLe: maintenant,
      },
      {
        id: CODE_TARIF.FRAIS_AFFRETEUR,
        libelle: 'Frais de mise en relation — affréteur',
        montant: 15000,
        devise: 'XOF',
        actif: true,
        modifieLe: maintenant,
      },
      {
        id: CODE_TARIF.FRAIS_TRANSPORTEUR,
        libelle: 'Frais de mise en relation — transporteur',
        montant: 15000,
        devise: 'XOF',
        actif: true,
        modifieLe: maintenant,
      },
    ]);

    // --- Groupements -------------------------------------------------
    tx.ecrire(
      'groupements',
      GROUPEMENTS.map((g) => ({
        ...g,
        etat: ETAT_COMPTE.ACTIF,
        creeLe: maintenant,
        demo: true,
      })),
    );

    // --- Utilisateurs ------------------------------------------------
    tx.ecrire(
      'users',
      UTILISATEURS.map(([id, email, nom, prenom, roleId, groupementId]) => ({
        id,
        email,
        nom,
        prenom,
        roleId,
        groupementId,
        motDePasse: empreinte,
        etat: ETAT_COMPTE.ACTIF,
        creeLe: maintenant,
        demo: true,
      })),
    );

    // --- Abonnements. Le second affréteur est EXPIRÉ : il démontre le
    //     blocage d'accès et la redirection vers le réabonnement (M10.2).
    tx.ecrire(
      'abonnements',
      [
        ['grp-aff-1', 240, ETAT_ABONNEMENT.ACTIF],
        ['grp-aff-2', -15, ETAT_ABONNEMENT.EXPIRE],
        ['grp-tra-1', 180, ETAT_ABONNEMENT.ACTIF],
        ['grp-tra-2', 300, ETAT_ABONNEMENT.ACTIF],
      ].map(([groupementId, joursRestants, etat]) => ({
        id: `abo-${groupementId}`,
        groupementId,
        montant: 150000,
        devise: 'XOF',
        debuteLe: dansDate(joursRestants - 365),
        finitLe: dansDate(joursRestants),
        etat,
        creeLe: maintenant,
        demo: true,
      })),
    );

    // --- Comptes prépayés --------------------------------------------
    //     Le transporteur 2 est volontairement à découvert : il démontre le
    //     refus de validation pour solde insuffisant de la contrepartie (M5.3).
    tx.ecrire(
      'operations',
      [
        ['grp-aff-1', 200000],
        ['grp-aff-2', 50000],
        ['grp-tra-1', 120000],
        ['grp-tra-2', 5000],
      ].map(([groupementId, montant], i) => ({
        id: `ope-init-${i}`,
        groupementId,
        sens: SENS_OPERATION.CREDIT,
        montant,
        motif: MOTIF_OPERATION.RECHARGEMENT,
        libelle: 'Rechargement initial (DÉMO)',
        referenceEncaissement: `ENC-DEMO-${1000 + i}`,
        horodatage: dans(-30),
        auteurUtilisateurId: 'u-conc',
        demo: true,
      })),
    );

    // --- Flotte -------------------------------------------------------
    tx.ecrire(
      'vehicules',
      VEHICULES.map(
        ([id, groupementId, immat, cg, cap, ptac, carr, ess, joursCarte, prix]) => ({
          id,
          groupementId,
          immatriculation: immat,
          carteGrise: cg,
          capaciteT: cap,
          ptacT: ptac,
          carrosserieId: carr,
          essieuxId: ess,
          carteTransportNumero: `CT-${id.toUpperCase()}`,
          carteTransportEcheance: dansDate(joursCarte),
          prixKmT: prix,
          etat: ETAT_VEHICULE.DISPONIBLE,
          creeLe: maintenant,
          demo: true,
        }),
      ),
    );

    tx.ecrire(
      'chauffeurs',
      CHAUFFEURS.map(([id, groupementId, nom, permis, joursPermis, tel, vehiculeId]) => ({
        id,
        groupementId,
        nom,
        permisNumero: permis,
        permisEcheance: dansDate(joursPermis),
        telephone: tel,
        vehiculeId,
        creeLe: maintenant,
        demo: true,
      })),
    );

    // --- Un fret déclaré, prêt à être apparié -------------------------
    tx.ecrire('declarations', [
      {
        id: 'dec-1',
        reference: 'DF-2026-0001',
        groupementId: 'grp-aff-1',
        libelle: 'Cacao en fèves — campagne principale',
        provenanceId: 'loc-abidjan',
        destinationId: 'loc-bouake',
        observation: 'Chargement au port. Prévoir bâches.',
        etat: ETAT_DECLARATION.ACTIVE,
        creeeLe: dans(-5),
        creeeParUtilisateurId: 'u-aff-1',
        publieeLe: dans(-5),
        demo: true,
      },
      {
        id: 'dec-2',
        reference: 'DF-2026-0002',
        groupementId: 'grp-aff-1',
        libelle: 'Café vert — lot export',
        provenanceId: 'loc-daloa',
        destinationId: 'loc-san-pedro',
        etat: ETAT_DECLARATION.ACTIVE,
        creeeLe: dans(-2),
        creeeParUtilisateurId: 'u-aff-1',
        publieeLe: dans(-2),
        demo: true,
      },
      {
        id: 'dec-3',
        reference: 'DF-2026-0003',
        groupementId: 'grp-aff-2',
        libelle: 'Coton égrené — campagne Nord',
        provenanceId: 'loc-abidjan',
        destinationId: 'loc-bouake',
        etat: ETAT_DECLARATION.ACTIVE,
        creeeLe: dans(-6),
        creeeParUtilisateurId: 'u-aff-2',
        publieeLe: dans(-6),
        demo: true,
      },
    ]);

    tx.ecrire('demandes', [
      {
        id: 'dem-1',
        reference: 'DT-2026-0001',
        declarationId: 'dec-1',
        groupementId: 'grp-aff-1',
        departPrevu: dans(4),
        arriveePrevue: dans(5),
        capaciteId: 'cap-25',
        carrosserieId: 'car-plateau',
        essieuxId: 'ess-3',
        contraintes: 'Bâches obligatoires. Chargement à quai entre 7 h et 12 h.',
        lignes: [
          {
            id: 'lig-1',
            produitId: 'sh-1801',
            poidsT: 22,
            volumeM3: 40,
            nombreColis: 440,
            emballageId: 'emb-sac',
          },
        ],
        etat: ETAT_DEMANDE.PUBLIEE,
        creeeLe: dans(-5),
        creeeParUtilisateurId: 'u-aff-1',
        publieeLe: dans(-5),
        demo: true,
      },
      {
        id: 'dem-2',
        reference: 'DT-2026-0002',
        declarationId: 'dec-2',
        groupementId: 'grp-aff-1',
        departPrevu: dans(9),
        arriveePrevue: dans(10),
        capaciteId: 'cap-40',
        carrosserieId: 'car-bache',
        essieuxId: 'ess-4',
        lignes: [
          {
            id: 'lig-2',
            produitId: 'sh-0901',
            poidsT: 35,
            volumeM3: 60,
            nombreColis: 700,
            emballageId: 'emb-sac',
          },
        ],
        etat: ETAT_DEMANDE.PUBLIEE,
        creeeLe: dans(-2),
        creeeParUtilisateurId: 'u-aff-1',
        publieeLe: dans(-2),
        demo: true,
      },
      {
        // Demande du SECOND affréteur : elle porte le second dossier complet.
        id: 'dem-3',
        reference: 'DT-2026-0003',
        declarationId: 'dec-3',
        groupementId: 'grp-aff-2',
        departPrevu: dans(3),
        arriveePrevue: dans(4),
        capaciteId: 'cap-25',
        carrosserieId: 'car-plateau',
        essieuxId: 'ess-3',
        lignes: [
          {
            id: 'lig-3',
            produitId: 'sh-5201',
            poidsT: 24,
            volumeM3: 48,
            nombreColis: 480,
            emballageId: 'emb-sac',
          },
        ],
        etat: ETAT_DEMANDE.PUBLIEE,
        creeeLe: dans(-6),
        creeeParUtilisateurId: 'u-aff-2',
        publieeLe: dans(-6),
        demo: true,
      },
    ]);

    // --- Des véhicules sur le marché ----------------------------------
    tx.ecrire('offres', [
      {
        id: 'off-1',
        reference: 'OV-2026-0001',
        groupementId: 'grp-tra-1',
        vehiculeId: 'veh-1',
        chauffeurPressentiId: 'chf-1',
        localiteDepartId: 'loc-abidjan',
        localiteArriveeId: 'loc-bouake',
        disponibleDu: dans(1),
        disponibleAu: dans(12),
        prixKmT: 95,
        etat: ETAT_OFFRE.DISPONIBLE,
        publieeLe: dans(-3),
        creeeParUtilisateurId: 'u-tra-1',
        demo: true,
      },
      {
        id: 'off-2',
        reference: 'OV-2026-0002',
        groupementId: 'grp-tra-1',
        vehiculeId: 'veh-2',
        chauffeurPressentiId: 'chf-2',
        localiteDepartId: 'loc-daloa',
        localiteArriveeId: 'loc-san-pedro',
        disponibleDu: dans(6),
        disponibleAu: dans(20),
        prixKmT: 110,
        etat: ETAT_OFFRE.DISPONIBLE,
        publieeLe: dans(-1),
        creeeParUtilisateurId: 'u-tra-1',
        demo: true,
      },
      {
        // Transporteur au solde insuffisant : la validation le refusera,
        // en nommant la partie en défaut sans chiffrer son compte (S6).
        id: 'off-3',
        reference: 'OV-2026-0003',
        groupementId: 'grp-tra-2',
        vehiculeId: 'veh-4',
        chauffeurPressentiId: 'chf-3',
        localiteDepartId: 'loc-abidjan',
        localiteArriveeId: 'loc-bouake',
        disponibleDu: dans(2),
        disponibleAu: dans(15),
        prixKmT: 88,
        etat: ETAT_OFFRE.DISPONIBLE,
        publieeLe: dans(-2),
        creeeParUtilisateurId: 'u-tra-2',
        demo: true,
      },
    ]);

    // Le second affréteur et le second transporteur sont provisionnés : sans
    // cela, le second dossier ne pourrait pas être validé.
    tx.ecrire('operations', [
      ...tx.lire('operations'),
      {
        id: 'ope-init-4',
        groupementId: 'grp-aff-2',
        sens: SENS_OPERATION.CREDIT,
        montant: 150000,
        motif: MOTIF_OPERATION.RECHARGEMENT,
        libelle: 'Rechargement initial (DÉMO)',
        referenceEncaissement: 'ENC-DEMO-1004',
        horodatage: dans(-28),
        auteurUtilisateurId: 'u-conc',
        demo: true,
      },
      {
        // Exactement de quoi régler UN dossier : après le second dossier, son
        // solde retombe à 5 000 et le cas d'échec « solde insuffisant de la
        // contrepartie » reste jouable sur l'offre `off-3`.
        id: 'ope-init-5',
        groupementId: 'grp-tra-2',
        sens: SENS_OPERATION.CREDIT,
        montant: 15000,
        motif: MOTIF_OPERATION.RECHARGEMENT,
        libelle: 'Rechargement complémentaire (DÉMO)',
        referenceEncaissement: 'ENC-DEMO-1005',
        horodatage: dans(-20),
        auteurUtilisateurId: 'u-conc',
        demo: true,
      },
    ]);

    tx.ecrire('offres', [
      ...tx.lire('offres'),
      {
        // Offre du second transporteur, dédiée au second dossier complet.
        id: 'off-4',
        reference: 'OV-2026-0004',
        groupementId: 'grp-tra-2',
        vehiculeId: 'veh-5',
        localiteDepartId: 'loc-abidjan',
        localiteArriveeId: 'loc-bouake',
        disponibleDu: dans(1),
        disponibleAu: dans(14),
        prixKmT: 130,
        etat: ETAT_OFFRE.DISPONIBLE,
        publieeLe: dans(-7),
        creeeParUtilisateurId: 'u-tra-2',
        demo: true,
      },
    ]);

    tx.ecrire('appariements', []);
    tx.ecrire('transports', []);
    tx.ecrire('notifications', []);
    tx.ecrire('duts', []);
    tx.ecrire('audit', []);
  });

  // Hors de la transaction d'amorçage : ce dossier passe par les services, donc
  // par leurs propres transactions. Il produit un second transport complet
  // appartenant à un autre groupement.
  await secondDossier();
}

/**
 * Réinstalle le jeu de démonstration à zéro.
 * @returns {Promise<void>}
 */
export async function reinitialiserDemo() {
  const { reinitialiser } = await import('./repositories/index.js');
  reinitialiser();
  await amorcer();
}
