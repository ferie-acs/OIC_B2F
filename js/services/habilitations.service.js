/**
 * Profils et habilitations : consultation de la matrice et paramétrage encadré.
 *
 * Le paramétrage ne porte que sur les droits que le catalogue déclare
 * paramétrables (`DROITS_PARAMETRABLES`), pour les seuls profils
 * institutionnels. Les droits porteurs des règles anti-fraude — validation,
 * crédit, vérification, activation, coordonnées — sont verrouillés par le
 * domaine lui-même (`controlerParametrage`) : aucun écran ne peut les donner.
 *
 * L'historique est en ajout seul (entité `habilitation`) ; le paramétrage en
 * vigueur s'en déduit et s'installe dans la matrice au démarrage.
 *
 * @module services/habilitations.service
 */

import { identifiant } from '../core/crypto.js';
import { exiger } from '../domain/access.js';
import { EVENEMENT_AUDIT } from '../domain/enums.js';
import {
  DROITS,
  DROITS_PARAMETRABLES,
  DROITS_VERROUILLES,
  PORTEE,
  appliquerParametrage,
  controlerParametrage,
  porteeDe,
  porteeDeConception,
} from '../domain/permissions.js';
import { NIVEAU, ROLES, role } from '../domain/roles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { RefusAdministration, maintenantIso, texteControle } from './admin-commun.js';

/** Décisions dans l'ordre chronologique. */
function historiqueBrut() {
  return depot('habilitation')
    .brutTous()
    .slice()
    .sort((a, b) => new Date(a.horodatage) - new Date(b.horodatage));
}

/**
 * Installe dans la matrice le paramétrage en vigueur. À appeler au démarrage
 * et après chaque décision. Une décision non conforme est ignorée.
 * @returns {number} Nombre de décisions écartées.
 */
export function chargerParametrage() {
  const ecartees = appliquerParametrage(historiqueBrut());
  if (ecartees.length) console.warn('[B2F] Paramétrage écarté (non conforme) :', ecartees.length);
  return ecartees.length;
}

/**
 * Lecture de la matrice pour l'écran « Profils et habilitations ».
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function matriceHabilitations(ctx) {
  exiger(ctx, 'role.lire');
  const roles = Object.values(ROLES);
  const droits = Object.keys(DROITS);
  const cellule = (roleId, droit) => {
    const conception = porteeDeConception(roleId, droit);
    const effective = porteeDe(roleId, droit);
    const controle = controlerParametrage(roleId, droit);
    return {
      conception,
      effective,
      ecart: conception !== effective,
      parametrable: controle.autorise,
      verrouille: Boolean(DROITS_VERROUILLES[droit]),
      explication: controle.explication,
    };
  };
  return {
    roles: roles.map((r) => ({ id: r.id, libelle: r.libelle, niveau: r.niveau, institutionnel: r.institutionnel, espace: r.espace })),
    droits: droits.map((d) => ({
      id: d,
      libelle: DROITS[d].libelle,
      categorie: DROITS[d].categorie,
      teste: DROITS[d].teste === true,
      parametrable: DROITS_PARAMETRABLES.includes(d),
      verrouille: Boolean(DROITS_VERROUILLES[d]),
    })),
    cellule,
  };
}

/**
 * Historique des décisions, du plus récent au plus ancien.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function historiqueHabilitations(ctx) {
  exiger(ctx, 'role.lire');
  return historiqueBrut().reverse();
}

/**
 * Active ou retire un droit paramétrable pour un profil, avec motif.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{roleId: string, droit: string, accorder: boolean, motif: string}} saisie
 */
export function modifierHabilitation(ctx, { roleId, droit, accorder, motif: motifSaisi }) {
  exiger(ctx, 'habilitation.parametrer', { groupementId: ctx.groupementId ?? null });
  if (!ROLES[roleId] || !DROITS[droit]) throw new RefusAdministration('Profil ou droit inconnu.');
  const controle = controlerParametrage(roleId, droit);
  if (!controle.autorise) throw new RefusAdministration(controle.explication);
  const motif = texteControle(motifSaisi, 'Motif', { min: 5, max: 400 });

  const actuelle = porteeDe(roleId, droit);
  const accorde = accorder === true;
  if (accorde === (actuelle !== PORTEE.AUCUNE)) {
    throw new RefusAdministration(accorde ? 'Ce droit est déjà accordé à ce profil.' : 'Ce droit n’est pas accordé à ce profil.');
  }
  const conception = porteeDeConception(roleId, droit);
  const retourConception = accorde === (conception !== PORTEE.AUCUNE);

  stockageInterne().transaction((tx) => {
    depot('habilitation').creer({
      id: identifiant('hab'),
      roleId,
      droit,
      accorde,
      motif,
      auteurUtilisateurId: ctx.utilisateurId,
      horodatage: maintenantIso(),
      demo: true,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.HABILITATION_MODIFIEE, {
      cibleType: 'role',
      cibleId: roleId,
      details:
        `Droit « ${DROITS[droit].libelle} » ${accorde ? 'activé' : 'retiré'} pour le profil ` +
        `« ${role(roleId).libelle} »${retourConception ? ' (retour à la conception)' : ''}. Motif : ${motif}`,
      tx,
    });
  });
  chargerParametrage();
}

/** Niveaux, pour les onglets de l'écran. */
export { NIVEAU };
