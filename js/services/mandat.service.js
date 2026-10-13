/**
 * Lot b2 : organisation interne — mandats d'intermédiaire de fret.
 *
 * ## Côté mandant (affréteur, transporteur)
 *
 * Il choisit un intermédiaire dans l'annuaire des intermédiaires actifs, lui
 * confie un périmètre pour une période, et peut retirer le mandat à tout moment.
 * Il voit les actions accomplies en son nom.
 *
 * ## Côté intermédiaire
 *
 * Il voit ses mandants et **agit au nom de l'un d'eux** : la session bascule
 * dans un contexte délégué (`contexteDelegue`) dont
 * - le groupement est celui du mandant — les écrans et les services existants
 *   s'appliquent tels quels, cloisonnement compris ;
 * - le rôle est `mandataire_affreteur` ou `mandataire_transporteur` — ni
 *   validation, ni coordonnées ;
 * - chaque droit est borné par le périmètre et la période du mandat
 *   (`domain/mandat.js`, appliqué par `access.js`) ;
 * - aucune identité ni coordonnée de contrepartie n'est libérée
 *   (`objetsLiberes` vide) : elles sont dues au mandant qui a payé ;
 * - chaque action est journalisée au nom du mandant (`audit.service.js`).
 *
 * Aucun état d'appariement ne change ici : l'intermédiaire passe par
 * `matching.service.js`, seul habilité, avec le contexte délégué.
 *
 * @module services/mandat.service
 */

import { identifiant } from '../core/crypto.js';
import { decider, exiger } from '../domain/access.js';
import {
  ETAT_APPARIEMENT,
  ETAT_COMPTE,
  ETAT_DEMANDE,
  ETAT_INSCRIPTION,
  ETAT_MANDAT,
  EVENEMENT_AUDIT,
  SENS_APPARIEMENT,
  STATUT_MANDAT,
  TYPE_GROUPEMENT,
  labelOf,
} from '../domain/enums.js';
import {
  PERIMETRES_PAR_TYPE,
  ROLE_MANDATAIRE,
  controlerDesignation,
  mandatEnVigueur,
  statutMandat,
} from '../domain/mandat.js';
import { entiteOperationnelle, entrepriseVerifiee } from '../domain/organisation.js';
import { etatInscription } from '../domain/inscription.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { abonnementDe, basculerMandat, enregistrerContexteDelegue } from './auth.service.js';
import { notifier } from './notification.service.js';
import { RefusOrganisation } from './utilisateurs-entreprise.service.js';

/* ------------------------------------------------------------------ *
 * Outils
 * ------------------------------------------------------------------ */

/** @param {string} id */
const groupement = (id) => depot('groupement').brutParId(id);

/** Entreprise opérationnelle, filiale comprise. */
function operationnelle(g) {
  if (!g || g.etat !== ETAT_COMPTE.ACTIF) return false;
  return entiteOperationnelle(g, g.parentId ? groupement(g.parentId) : null);
}

/**
 * Intermédiaire présent dans l'annuaire : actif, inscription activée, dossier
 * vérifié par l'agent d'activation (même règle que les filiales) et abonné.
 * @param {Record<string, any>|undefined} g
 */
function intermediaireActif(g) {
  return Boolean(
    g &&
      g.type === TYPE_GROUPEMENT.INTERMEDIAIRE &&
      operationnelle(g) &&
      etatInscription(g) === ETAT_INSCRIPTION.ACTIVEE &&
      entrepriseVerifiee(g) &&
      abonnementDe(g.id).actif,
  );
}

/** Référence lisible `MD-AAAA-NNNN`, unique. */
function referenceMandat() {
  const existantes = new Set(depot('mandat').brutTous().map((m) => m.reference));
  let n = existantes.size + 1;
  let ref;
  do {
    ref = `MD-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
    n += 1;
  } while (existantes.has(ref));
  return ref;
}

/** Libellés du périmètre, pour le journal et les écrans. */
export function libellesPerimetre(perimetre) {
  return (perimetre ?? []).map((p) => labelOf(p));
}

/**
 * Vue d'un mandat, commune aux deux parties.
 * @param {Record<string, any>} m
 */
function vueMandat(m) {
  return {
    id: m.id,
    reference: m.reference,
    typeMandant: m.typeMandant,
    perimetre: [...m.perimetre],
    debuteLe: m.debuteLe,
    finitLe: m.finitLe,
    statut: statutMandat(m),
    creeLe: m.creeLe,
    retireLe: m.retireLe ?? null,
    motifRetrait: m.motifRetrait ?? null,
    mandantGroupementId: m.mandantGroupementId,
    intermediaireGroupementId: m.intermediaireGroupementId,
  };
}

/* ------------------------------------------------------------------ *
 * Côté mandant
 * ------------------------------------------------------------------ */

/**
 * Annuaire des intermédiaires actifs, pour la désignation.
 *
 * L'intermédiaire est un prestataire qui se fait connaître : son nom est servi
 * aux mandants potentiels. Ni coordonnées, ni liste de ses mandants.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<{id: string, raisonSociale: string, localiteId: string|null, inscritLe: string}>}
 */
export function annuaireIntermediaires(ctx) {
  exiger(ctx, 'mandat.lire', { groupementId: ctx.groupementId });
  return depot('groupement')
    .brutOu((g) => intermediaireActif(g) && g.id !== ctx.groupementId)
    .map((g) => ({ id: g.id, raisonSociale: g.raisonSociale, localiteId: g.localiteId ?? null, inscritLe: g.creeLe }))
    .sort((a, b) => a.raisonSociale.localeCompare(b.raisonSociale, 'fr'));
}

/**
 * Périmètres qu'un mandant de ce contexte peut confier.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<{valeur: string, libelle: string}>}
 */
export function perimetresProposes(ctx) {
  const type = groupement(ctx.groupementId)?.type;
  return (PERIMETRES_PAR_TYPE[type] ?? []).map((p) => ({ valeur: p, libelle: labelOf(p) }));
}

/**
 * Mandats confiés par l'entreprise du contexte.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function mandatsDuMandant(ctx) {
  exiger(ctx, 'mandat.lire', { groupementId: ctx.groupementId });
  return depot('mandat')
    .brutOu((m) => m.mandantGroupementId === ctx.groupementId)
    .map((m) => ({
      ...vueMandat(m),
      intermediaire: groupement(m.intermediaireGroupementId)?.raisonSociale ?? '—',
    }))
    .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));
}

/**
 * Désigne un intermédiaire.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{intermediaireId: string, perimetre: string[], debuteLe: string, finitLe: string}} saisie
 * @returns {{id: string, reference: string}}
 */
export function designerIntermediaire(ctx, saisie) {
  if (ctx.mandat) throw new RefusOrganisation('Un intermédiaire ne désigne pas d’intermédiaire.');
  exiger(ctx, 'mandat.gerer', { groupementId: ctx.groupementId });
  const mandant = groupement(ctx.groupementId);
  const manquements = controlerDesignation({ ...saisie, typeMandant: mandant?.type });

  const intermediaire = groupement(saisie.intermediaireId);
  if (!intermediaireActif(intermediaire)) {
    manquements.push('Choisissez un intermédiaire dans l’annuaire des intermédiaires actifs.');
  } else if (intermediaire.id === mandant.id) {
    manquements.push('Une entreprise ne se désigne pas elle-même.');
  }
  if (manquements.length === 0) {
    // Contrôle des doublons (système existant) : pas deux mandats actifs qui se
    // recouvrent pour le même intermédiaire.
    const recouvre = depot('mandat').brutOu(
      (m) =>
        m.mandantGroupementId === mandant.id &&
        m.intermediaireGroupementId === intermediaire.id &&
        m.etat === ETAT_MANDAT.ACTIF &&
        m.debuteLe <= saisie.finitLe &&
        saisie.debuteLe <= m.finitLe,
    );
    if (recouvre.length) {
      manquements.push(
        `Un mandat actif lie déjà votre entreprise à cet intermédiaire sur cette période ` +
          `(${recouvre[0].reference}). Retirez-le avant d’en désigner un autre.`,
      );
    }
  }
  if (manquements.length) throw new RefusOrganisation(manquements);

  const mandat = {
    id: identifiant('mdt'),
    reference: referenceMandat(),
    mandantGroupementId: mandant.id,
    intermediaireGroupementId: intermediaire.id,
    typeMandant: mandant.type,
    perimetre: [...new Set(saisie.perimetre)],
    debuteLe: saisie.debuteLe,
    finitLe: saisie.finitLe,
    etat: ETAT_MANDAT.ACTIF,
    creeLe: new Date().toISOString(),
    creeParUtilisateurId: ctx.utilisateurId,
    demo: true,
  };

  stockageInterne().transaction((tx) => {
    depot('mandat').creer(mandat, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.MANDAT_DESIGNE, {
      cibleType: 'mandat',
      cibleId: mandat.id,
      details:
        `Mandat ${mandat.reference} confié à « ${intermediaire.raisonSociale} » du ` +
        `${mandat.debuteLe} au ${mandat.finitLe} : ${libellesPerimetre(mandat.perimetre).join(' ; ')}.`,
      tx,
    });
    notifier(intermediaire.id, EVENEMENT_AUDIT.MANDAT_DESIGNE, {
      code: 'mandat.designe',
      params: { reference: mandat.reference },
      cibleType: 'mandat',
      cibleId: mandat.id,
      tx,
    });
  });
  return { id: mandat.id, reference: mandat.reference };
}

/**
 * Retire un mandat. Définitif : un nouveau mandat se désigne.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} mandatId
 * @param {string} [motif]
 */
export function retirerMandat(ctx, mandatId, motif = '') {
  if (ctx.mandat) throw new RefusOrganisation('Un intermédiaire ne retire pas le mandat qu’il a reçu.');
  exiger(ctx, 'mandat.gerer', { groupementId: ctx.groupementId });
  const m = depot('mandat').brutParId(mandatId);
  if (!m || m.mandantGroupementId !== ctx.groupementId) {
    throw new RefusOrganisation('Ce mandat n’a pas été confié par votre entreprise.');
  }
  if (m.etat !== ETAT_MANDAT.ACTIF) throw new RefusOrganisation('Ce mandat est déjà retiré.');
  const raison = String(motif ?? '').trim();

  stockageInterne().transaction((tx) => {
    depot('mandat').modifier(
      m.id,
      {
        etat: ETAT_MANDAT.RETIRE,
        retireLe: new Date().toISOString(),
        retireParUtilisateurId: ctx.utilisateurId,
        motifRetrait: raison || undefined,
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.MANDAT_RETIRE, {
      cibleType: 'mandat',
      cibleId: m.id,
      details: `Mandat ${m.reference} retiré${raison ? ` — motif : ${raison}` : ''}.`,
      tx,
    });
    notifier(m.intermediaireGroupementId, EVENEMENT_AUDIT.MANDAT_RETIRE, {
      code: 'mandat.retire',
      params: { reference: m.reference },
      cibleType: 'mandat',
      cibleId: m.id,
      tx,
    });
  });
}

/**
 * Actions accomplies au nom de l'entreprise par ses intermédiaires, les plus
 * récentes d'abord.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<{horodatage: string, details: string, auteur: string, intermediaire: string, mandat: string}>}
 */
export function actionsAuNomDe(ctx) {
  exiger(ctx, 'mandat.lire', { groupementId: ctx.groupementId });
  const references = new Map(
    depot('mandat').brutOu((m) => m.mandantGroupementId === ctx.groupementId).map((m) => [m.id, m]),
  );
  return depot('audit')
    .brutOu((e) => e.groupementId === ctx.groupementId && e.mandatId && references.has(e.mandatId))
    .sort((a, b) => String(b.horodatage).localeCompare(String(a.horodatage)))
    .slice(0, 50)
    .map((e) => {
      const u = e.auteurUtilisateurId ? depot('utilisateur').brutParId(e.auteurUtilisateurId) : null;
      return {
        horodatage: e.horodatage,
        details: e.details,
        auteur: u ? `${u.prenom ?? ''} ${u.nom}`.trim() : '—',
        intermediaire: groupement(e.intermediaireGroupementId)?.raisonSociale ?? '—',
        mandat: references.get(e.mandatId)?.reference ?? '—',
      };
    });
}

/* ------------------------------------------------------------------ *
 * Côté intermédiaire
 * ------------------------------------------------------------------ */

/**
 * Peut-on ouvrir un contexte délégué sur ce mandat ? Rend `null` ou la raison.
 * @param {import('../domain/access.js').Contexte} ctx Contexte propre de l'intermédiaire.
 * @param {Record<string, any>|undefined} m
 * @returns {string|null}
 */
function motifRefusAgir(ctx, m) {
  const droit = decider(ctx, 'mandat.agir', { groupementId: ctx.groupementId });
  if (!droit.autorise) return droit.explication;
  if (!m || m.intermediaireGroupementId !== ctx.groupementId) {
    return 'Ce mandat n’a pas été confié à votre entreprise.';
  }
  const statut = statutMandat(m);
  if (statut === STATUT_MANDAT.RETIRE) return 'Ce mandat a été retiré par le mandant.';
  if (statut === STATUT_MANDAT.A_VENIR) return `Ce mandat commence le ${m.debuteLe}.`;
  if (statut === STATUT_MANDAT.ECHU) return 'Ce mandat est arrivé à échéance.';
  const mandant = groupement(m.mandantGroupementId);
  if (!operationnelle(mandant) || mandant.type !== m.typeMandant) {
    return 'Le compte de ce mandant n’est pas actif sur la plateforme.';
  }
  if (!abonnementDe(mandant.id).actif) {
    return 'L’abonnement de ce mandant a expiré : il doit le renouveler avant que vous agissiez pour lui.';
  }
  return null;
}

/**
 * Indicateurs de suivi d'un mandant, en agrégats sur ses propres dossiers.
 * @param {Record<string, any>} m
 */
function aTraiterPour(m) {
  const g = m.mandantGroupementId;
  const apps = depot('appariement').brutOu((a) => a.groupementAffreteurId === g || a.groupementTransporteurId === g);
  if (m.typeMandant === TYPE_GROUPEMENT.TRANSPORTEUR) {
    return {
      aRepondre: apps.filter((a) => a.groupementTransporteurId === g && a.etat === ETAT_APPARIEMENT.RESERVER && a.sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE).length,
      enCours: apps.filter((a) => [ETAT_APPARIEMENT.RESERVER, ETAT_APPARIEMENT.ACCEPTER].includes(a.etat)).length,
      aValider: 0,
      demandesOuvertes: 0,
    };
  }
  return {
    aRepondre: 0,
    enCours: apps.filter((a) => [ETAT_APPARIEMENT.RESERVER, ETAT_APPARIEMENT.ACCEPTER].includes(a.etat)).length,
    aValider: apps.filter((a) => a.groupementAffreteurId === g && a.etat === ETAT_APPARIEMENT.ACCEPTER).length,
    demandesOuvertes: depot('demande').brutOu((d) => d.groupementId === g && d.etat === ETAT_DEMANDE.PUBLIEE).length,
  };
}

/**
 * Mandants de l'entreprise intermédiaire, avec ce que chacun attend.
 *
 * Le nom du mandant est servi à l'intermédiaire : il agit pour lui, il doit
 * savoir pour qui. Ni coordonnées, ni solde.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function mesMandants(ctx) {
  if (ctx.mandat) throw new RefusOrganisation('Revenez à votre espace pour consulter vos mandants.');
  exiger(ctx, 'mandat.lire', { groupementId: ctx.groupementId });
  return depot('mandat')
    .brutOu((m) => m.intermediaireGroupementId === ctx.groupementId)
    .map((m) => {
      const motif = motifRefusAgir(ctx, m);
      return {
        ...vueMandat(m),
        mandant: groupement(m.mandantGroupementId)?.raisonSociale ?? '—',
        mandantLocaliteId: groupement(m.mandantGroupementId)?.localiteId ?? null,
        peutAgir: motif === null,
        motifRefus: motif,
        ...(mandatEnVigueur(m) ? aTraiterPour(m) : { aRepondre: 0, enCours: 0, aValider: 0, demandesOuvertes: 0 }),
      };
    })
    .sort((a, b) => Number(b.statut === STATUT_MANDAT.EN_VIGUEUR) - Number(a.statut === STATUT_MANDAT.EN_VIGUEUR)
      || a.mandant.localeCompare(b.mandant, 'fr'));
}

/**
 * Construit le contexte délégué d'un intermédiaire sur un mandat. Lève si le
 * mandat ne le permet pas (ou plus).
 *
 * @param {import('../domain/access.js').Contexte} base Contexte propre de l'intermédiaire.
 * @param {string} mandatId
 * @returns {import('../domain/access.js').Contexte}
 */
export function contexteDelegue(base, mandatId) {
  const m = depot('mandat').brutParId(mandatId);
  const motif = motifRefusAgir(base, m);
  if (motif) throw new RefusOrganisation(motif);
  const mandant = groupement(m.mandantGroupementId);
  return Object.freeze({
    utilisateurId: base.utilisateurId,
    roleId: ROLE_MANDATAIRE[m.typeMandant],
    groupementId: mandant.id,
    compteActif: base.compteActif,
    abonnementActif: base.abonnementActif && abonnementDe(mandant.id).actif,
    // Rien n'est libéré à l'intermédiaire : identité et coordonnées des
    // contreparties reviennent au mandant, qui a payé la mise en relation.
    objetsLiberes: new Set(),
    mandat: Object.freeze({
      id: m.id,
      reference: m.reference,
      // Lu à chaque décision, pas figé à l'ouverture : un retrait par le mandant
      // ferme l'accès même à un écran déjà affiché.
      get etat() {
        return depot('mandat').brutParId(m.id)?.etat ?? ETAT_MANDAT.RETIRE;
      },
      debuteLe: m.debuteLe,
      finitLe: m.finitLe,
      perimetre: Object.freeze([...m.perimetre]),
      typeMandant: m.typeMandant,
      mandantGroupementId: mandant.id,
      mandantNom: mandant.raisonSociale,
      intermediaireGroupementId: base.groupementId,
      intermediaireNom: groupement(base.groupementId)?.raisonSociale ?? '',
    }),
  });
}

// La session sait reconstruire le contexte délégué après un rechargement.
enregistrerContexteDelegue(contexteDelegue);

/**
 * Ouvre une session au nom d'un mandant. Tracé au journal, au nom du mandant.
 * @param {import('../domain/access.js').Contexte} ctx Contexte propre de l'intermédiaire.
 * @param {string} mandatId
 * @returns {import('../domain/access.js').Contexte} Le contexte délégué.
 */
export function agirPourMandant(ctx, mandatId) {
  if (ctx.mandat) throw new RefusOrganisation('Revenez d’abord à votre espace.');
  exiger(ctx, 'mandat.agir', { groupementId: ctx.groupementId });
  const delegue = contexteDelegue(ctx, mandatId);
  journaliser(delegue, EVENEMENT_AUDIT.MANDAT_OUVERT, {
    cibleType: 'mandat',
    cibleId: mandatId,
    details: `Ouverture d’une session au nom de « ${delegue.mandat.mandantNom} ».`,
  });
  basculerMandat(mandatId);
  return delegue;
}

/** Ramène la session à l'espace propre de l'intermédiaire. */
export function revenirAMonEspace() {
  return basculerMandat(null);
}
