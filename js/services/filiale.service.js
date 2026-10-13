/**
 * Lot b2 : organisation interne — filiales et entités rattachées.
 *
 * Une entreprise crée une entité rattachée (agence, filiale). L'entité :
 * - **hérite** des pièces déjà vérifiées de sa mère — RCCM, compte contribuable,
 *   carte de transporteur — et de leur vérification, dynamiquement
 *   (`verification.service.js`, `etatVerification`) ;
 * - est couverte par l'abonnement de sa mère (`auth.service.js`, `abonnementDe`) ;
 * - tient **son propre compte** : ses frais de mise en relation lui sont débités ;
 * - n'est **active que si la mère est vérifiée** (`domain/organisation.js`) ;
 * - fait contrôler ses propres véhicules et chauffeurs : l'héritage porte sur
 *   les pièces de l'entreprise, jamais sur ses moyens.
 *
 * La mère voit l'activité consolidée : des **agrégats** par entité, jamais
 * l'identité des contreparties de ses filiales.
 *
 * @module services/filiale.service
 */

import { identifiant } from '../core/crypto.js';
import { exiger } from '../domain/access.js';
import {
  ETAPE_TRANSPORT,
  ETAT_APPARIEMENT,
  ETAT_COMPTE,
  ETAT_DEMANDE,
  ETAT_OFFRE,
  EVENEMENT_AUDIT,
  TYPE_GROUPEMENT,
} from '../domain/enums.js';
import { entiteOperationnelle, motifInactivite } from '../domain/organisation.js';
import { mandatEnVigueur } from '../domain/mandat.js';
import { role, rolesAttribuables } from '../domain/roles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { adresseMasquee } from './admin-commun.js';
import { soldeDe } from './compte.service.js';
import { etatVerification } from './verification.service.js';
import { RefusOrganisation, envoyerCodeActivation, preparerCompte } from './utilisateurs-entreprise.service.js';

/** Types d'entreprise qui peuvent se doter d'entités rattachées. */
const TYPES_AVEC_FILIALES = Object.freeze([
  TYPE_GROUPEMENT.AFFRETEUR,
  TYPE_GROUPEMENT.TRANSPORTEUR,
  TYPE_GROUPEMENT.INTERMEDIAIRE,
]);

/**
 * L'entreprise d'un contexte, si elle peut porter des filiales.
 * @param {import('../domain/access.js').Contexte} ctx
 */
function entrepriseMere(ctx) {
  if (ctx.mandat) throw new RefusOrganisation('Un intermédiaire n’organise pas l’entreprise de son mandant.');
  const mere = depot('groupement').brutParId(ctx.groupementId);
  if (!mere || !TYPES_AVEC_FILIALES.includes(mere.type)) {
    throw new RefusOrganisation('Seule une entreprise du marché se dote d’entités rattachées.');
  }
  return mere;
}

/* ------------------------------------------------------------------ *
 * Activité consolidée
 * ------------------------------------------------------------------ */

/**
 * Activité d'une entité, en agrégats. Aucun nom de contrepartie.
 * @param {Record<string, any>} g
 */
function activiteDe(g) {
  const appariements = depot('appariement').brutOu(
    (a) => a.groupementAffreteurId === g.id || a.groupementTransporteurId === g.id,
  );
  const enCours = appariements.filter((a) => [ETAT_APPARIEMENT.RESERVER, ETAT_APPARIEMENT.ACCEPTER].includes(a.etat));
  const validees = appariements.filter((a) => a.etat === ETAT_APPARIEMENT.VALIDER);
  const idsValides = new Set(validees.map((a) => a.id));
  const transportsEnCours = depot('transport').brutOu(
    (t) => idsValides.has(t.appariementId) && ![ETAPE_TRANSPORT.LIVRE, ETAPE_TRANSPORT.CLOTURE].includes(t.etape),
  ).length;

  /** Le volume propre au métier de l'entité. */
  let publications = 0;
  if (g.type === TYPE_GROUPEMENT.AFFRETEUR) {
    publications = depot('demande').brutOu(
      (d) => d.groupementId === g.id && [ETAT_DEMANDE.PUBLIEE, ETAT_DEMANDE.RESERVEE].includes(d.etat),
    ).length;
  } else if (g.type === TYPE_GROUPEMENT.TRANSPORTEUR) {
    publications = depot('offre').brutOu(
      (o) => o.groupementId === g.id && [ETAT_OFFRE.DISPONIBLE, ETAT_OFFRE.RESERVEE].includes(o.etat),
    ).length;
  } else if (g.type === TYPE_GROUPEMENT.INTERMEDIAIRE) {
    publications = depot('mandat').brutOu(
      (m) => m.intermediaireGroupementId === g.id && mandatEnVigueur(m),
    ).length;
  }

  return {
    publications,
    enCours: enCours.length,
    validees: validees.length,
    transportsEnCours,
    utilisateursActifs: depot('utilisateur').brutOu((u) => u.groupementId === g.id && u.etat === ETAT_COMPTE.ACTIF).length,
    solde: soldeDe(g.id),
  };
}

/**
 * L'entreprise et ses entités rattachées, avec leur activité et leur état.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {{mere: Record<string, any>, entites: Array<Record<string, any>>, totaux: Record<string, number>, estFiliale: boolean, rattacheeA: string|null}}
 */
export function activiteConsolidee(ctx) {
  exiger(ctx, 'filiale.lire', { groupementId: ctx.groupementId });
  const mere = entrepriseMere(ctx);
  const filiales = depot('groupement').brutOu((g) => g.parentId === mere.id);
  const grandMere = mere.parentId ? depot('groupement').brutParId(mere.parentId) : null;

  const vue = (g, parent) => ({
    id: g.id,
    raisonSociale: g.raisonSociale,
    type: g.type,
    localiteId: g.localiteId ?? null,
    estMere: g.id === mere.id,
    creeLe: g.creeLe,
    active: entiteOperationnelle(g, parent),
    motifInactivite: motifInactivite(g, parent),
    verification: g.type === TYPE_GROUPEMENT.TRANSPORTEUR ? etatVerification(g.id) : null,
    verificationHeritee: Boolean(g.parentId) && g.verificationEtat == null,
    ...activiteDe(g),
  });

  const entites = [vue(mere, grandMere), ...filiales.map((f) => vue(f, mere))];
  const somme = (cle) => entites.reduce((n, e) => n + (e[cle] ?? 0), 0);
  return {
    mere: entites[0],
    entites,
    estFiliale: Boolean(mere.parentId),
    // Une entité rattachée connaît le nom de sa mère : c'est son entreprise.
    rattacheeA: grandMere?.raisonSociale ?? null,
    totaux: {
      entites: entites.length,
      publications: somme('publications'),
      enCours: somme('enCours'),
      validees: somme('validees'),
      transportsEnCours: somme('transportsEnCours'),
      solde: somme('solde'),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Création
 * ------------------------------------------------------------------ */

/**
 * Crée une entité rattachée et ouvre le compte de son responsable, dans une
 * seule transaction. Rend le code d'activation du responsable, à afficher une
 * seule fois.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{raisonSociale: string, localiteId: string, adresse?: string,
 *   contactTelephone?: string, contactEmail?: string,
 *   responsable: {nom: string, prenom?: string, email: string, telephone?: string}}} saisie
 * @returns {Promise<{filialeId: string, utilisateurId: string, active: boolean, motifInactivite: string|null, code: string, expireLe: string}>}
 */
export async function creerFiliale(ctx, saisie) {
  exiger(ctx, 'filiale.creer', { groupementId: ctx.groupementId });
  const mere = entrepriseMere(ctx);
  if (mere.parentId) {
    throw new RefusOrganisation(
      'Une entité rattachée ne crée pas elle-même d’entité : adressez-vous à l’entreprise mère.',
    );
  }

  /** @type {string[]} */
  const manquements = [];
  const raisonSociale = String(saisie.raisonSociale ?? '').trim();
  if (raisonSociale.length < 3) manquements.push('Indiquez le nom de l’entité (au moins 3 caractères).');
  if (raisonSociale.length > 160) manquements.push('Le nom de l’entité compte au plus 160 caractères.');
  if (depot('groupement').brutOu((g) => g.raisonSociale.toLowerCase() === raisonSociale.toLowerCase()).length) {
    manquements.push('Une entreprise porte déjà ce nom sur la plateforme.');
  }
  const localite = depot('referentiel').brutParId(saisie.localiteId);
  if (!localite || localite.famille !== 'localites') manquements.push('Choisissez la localité de l’entité.');
  if (manquements.length) throw new RefusOrganisation(manquements);

  const maintenant = new Date().toISOString();
  const filiale = {
    id: identifiant('grp'),
    raisonSociale,
    type: mere.type,
    // Pièces héritées de la mère (système existant : « hérite RCCM/CC et
    // abonnement du parent » ; côté DUT : « RC, carte transporteur et documents »).
    rccm: mere.rccm,
    compteContribuable: mere.compteContribuable,
    carteTransporteurNumero: mere.carteTransporteurNumero,
    carteTransporteurEcheance: mere.carteTransporteurEcheance,
    pays: mere.pays,
    localiteId: localite.id,
    adresse: String(saisie.adresse ?? '').trim() || undefined,
    contactNom: `${saisie.responsable?.prenom ?? ''} ${saisie.responsable?.nom ?? ''}`.trim() || undefined,
    contactTelephone: String(saisie.contactTelephone ?? '').trim() || undefined,
    contactEmail: String(saisie.contactEmail ?? '').trim().toLowerCase() || undefined,
    etat: ETAT_COMPTE.ACTIF,
    parentId: mere.id,
    creeParUtilisateurId: ctx.utilisateurId,
    creeLe: maintenant,
    demo: true,
  };

  const rolePlein = rolesAttribuables(mere.type, ctx.roleId)[0];
  const { compte, code, expireLe } = await preparerCompte(
    ctx,
    { ...saisie.responsable, roleId: rolePlein },
    { groupementNouveau: filiale },
  );

  stockageInterne().transaction((tx) => {
    depot('groupement').creer(filiale, { tx });
    depot('utilisateur').creer(compte, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.FILIALE_CREEE, {
      cibleType: 'groupement',
      cibleId: filiale.id,
      details:
        `Entité rattachée « ${raisonSociale} » créée ; elle hérite des pièces et de la ` +
        'vérification de l’entreprise mère.',
      tx,
    });
    journaliser(ctx, EVENEMENT_AUDIT.UTILISATEUR_CREE, {
      cibleType: 'utilisateur',
      cibleId: compte.id,
      details:
        `Compte ${`${compte.prenom ?? ''} ${compte.nom}`.trim()} créé — rôle ${role(rolePlein).libelle}, ` +
        `responsable de « ${raisonSociale} ». Code d’activation à usage unique émis.`,
      tx,
    });
    // Intégration : le code part à l'adresse enregistrée du responsable (messagerie unique).
    envoyerCodeActivation(ctx, compte, code, { entreprise: raisonSociale, tx });
  });

  return {
    filialeId: filiale.id,
    utilisateurId: compte.id,
    active: entiteOperationnelle(filiale, mere),
    motifInactivite: motifInactivite(filiale, mere),
    destinataire: adresseMasquee(compte.email),
    expireLe,
  };
}
