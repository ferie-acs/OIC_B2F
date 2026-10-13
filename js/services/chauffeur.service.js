/**
 * Chauffeurs du transporteur — fiche complète, retrait d'un chauffeur parti,
 * réactivation (lot b3).
 *
 * ## Ce que ce service garantit
 *
 * - **La fiche d'identité est exigée à la création** : pièce (type, numéro, dates
 *   de délivrance et d'expiration), nationalité, date de naissance, catégories de
 *   permis. Une fiche antérieure reste modifiable champ par champ : un champ
 *   absent de la saisie n'est pas effacé.
 * - **Une pièce contrôlée qui change perd son contrôle** (correctif anti-fraude
 *   n° 3) : la liste des pièces surveillées est celle du service de vérification,
 *   étendue à la pièce d'identité.
 * - **Un chauffeur parti est retiré, jamais supprimé** : il garde ses missions
 *   passées, n'est plus proposé pour une nouvelle, et peut être réactivé. Le
 *   retrait porte une date et un motif, et s'inscrit au journal d'audit.
 *
 * @module services/chauffeur.service
 */

import { identifiant } from '../core/crypto.js';
import {
  CATEGORIE_PERMIS,
  ETAPE_TRANSPORT,
  ETAT_OFFRE,
  EVENEMENT_AUDIT,
  NATIONALITES,
  TYPE_PIECE_IDENTITE,
} from '../domain/enums.js';
import { exiger } from '../domain/access.js';
import { AGE_MINIMAL, ageA, finDeJour } from '../domain/chauffeur.regles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { pieceModifiee } from './verification.service.js';

/** Taille maximale d'une photo déclarée (métadonnées seulement). */
const PHOTO_TAILLE_MAX = 5 * 1024 * 1024;

const texte = (v) => String(v ?? '').trim();
const cle = (v) => texte(v).toLocaleUpperCase('fr').replace(/[\s-]+/g, '');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const present = (saisie, champ) => Object.prototype.hasOwnProperty.call(saisie, champ);

function dateValide(valeur, libelle, { facultative = false } = {}) {
  const v = texte(valeur);
  if (!v && facultative) return null;
  if (!Number.isFinite(finDeJour(v))) throw new Error(`${libelle} : saisissez une date valide.`);
  return v;
}

/**
 * Chauffeur de SON groupement, sous le droit de gestion.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string|null} id
 */
function chauffeurDuParc(ctx, id) {
  exiger(ctx, 'chauffeur.gerer', { groupementId: ctx.groupementId });
  if (!id) return null;
  const c = depot('chauffeur').brutParId(id);
  if (!c || c.groupementId !== ctx.groupementId) {
    throw new Error('Ce chauffeur ne fait pas partie de votre groupement.');
  }
  return c;
}

/**
 * Normalise et contrôle les champs d'identité saisis. Un champ absent de la
 * saisie reprend la valeur enregistrée.
 * @param {Record<string, any>} saisie
 * @param {Record<string, any>|null} actuel
 * @returns {Record<string, any>}
 */
function champsIdentite(saisie, actuel) {
  const sortie = {};
  const prendre = (champ, normaliser) => {
    sortie[champ] = present(saisie, champ) ? normaliser(saisie[champ]) : actuel?.[champ];
  };

  prendre('pieceType', (v) => {
    const t = texte(v);
    if (!t) return null;
    if (!Object.values(TYPE_PIECE_IDENTITE).includes(t)) {
      throw new Error('Type de pièce d’identité : choisissez une valeur de la liste.');
    }
    return t;
  });
  prendre('pieceNumero', (v) => texte(v).toLocaleUpperCase('fr') || null);
  prendre('pieceDelivreeLe', (v) => dateValide(v, 'Date de délivrance de la pièce', { facultative: true }));
  prendre('pieceExpireLe', (v) => dateValide(v, 'Date d’expiration de la pièce', { facultative: true }));
  prendre('nationalite', (v) => {
    const n = texte(v);
    if (!n) return null;
    if (!NATIONALITES.includes(n)) throw new Error('Nationalité : choisissez une valeur de la liste.');
    return n;
  });
  prendre('dateNaissance', (v) => dateValide(v, 'Date de naissance', { facultative: true }));
  prendre('permisCategories', (v) => {
    const liste = (Array.isArray(v) ? v : texte(v).split(/[\s,;]+/)).map(texte).filter(Boolean);
    const inconnues = liste.filter((c) => !Object.values(CATEGORIE_PERMIS).includes(c));
    if (inconnues.length) throw new Error('Catégories de permis : seules A, B, C, D et E sont admises.');
    return [...new Set(liste)].sort();
  });
  prendre('cacrNumero', (v) => texte(v).toLocaleUpperCase('fr') || null);
  prendre('cacrDelivreLe', (v) => dateValide(v, 'Date du CACR', { facultative: true }));
  prendre('photo', (v) => {
    if (!v || !texte(v.nom)) return null;
    const type = texte(v.type);
    const taille = Number(v.taille);
    if (!/^image\/(jpeg|png|webp)$/.test(type)) {
      throw new Error('Photo : choisissez une image JPEG, PNG ou WebP.');
    }
    if (!Number.isInteger(taille) || taille < 0 || taille > PHOTO_TAILLE_MAX) {
      throw new Error('Photo : l’image ne doit pas dépasser 5 Mo.');
    }
    return { nom: texte(v.nom).slice(0, 160), type, taille };
  });

  // Cohérence des dates.
  const auj = aujourdhui();
  if (sortie.pieceDelivreeLe && sortie.pieceDelivreeLe > auj && present(saisie, 'pieceDelivreeLe')) {
    throw new Error('La date de délivrance de la pièce ne peut pas être dans le futur.');
  }
  if (sortie.pieceDelivreeLe && sortie.pieceExpireLe && sortie.pieceExpireLe <= sortie.pieceDelivreeLe) {
    throw new Error('La date d’expiration de la pièce doit suivre sa date de délivrance.');
  }
  if (sortie.dateNaissance && present(saisie, 'dateNaissance')) {
    const age = ageA(sortie.dateNaissance);
    if (age < AGE_MINIMAL) throw new Error(`Le chauffeur doit avoir au moins ${AGE_MINIMAL} ans.`);
    if (age > 90) throw new Error('Date de naissance : vérifiez l’année saisie.');
  }
  if (sortie.cacrDelivreLe && sortie.cacrDelivreLe > auj && present(saisie, 'cacrDelivreLe')) {
    throw new Error('La date du CACR ne peut pas être dans le futur.');
  }
  return sortie;
}

/**
 * Ajoute ou modifie un chauffeur de l'équipe. Son choix se fait ensuite pour
 * chaque offre, parmi les chauffeurs actifs et aptes.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} saisie
 * @param {string|null} [chauffeurId]
 * @returns {Record<string, any>}
 */
export function enregistrerChauffeur(ctx, saisie, chauffeurId = null) {
  const actuel = chauffeurDuParc(ctx, chauffeurId);
  const nom = texte(saisie.nom);
  const permisNumero = texte(saisie.permisNumero).toLocaleUpperCase('fr');
  if (!nom || !permisNumero) throw new Error('Renseignez le nom du chauffeur et son numéro de permis.');

  const equipe = depot('chauffeur').brutOu((c) => c.groupementId === ctx.groupementId && c.id !== chauffeurId);
  if (equipe.some((c) => cle(c.permisNumero) === cle(permisNumero))) {
    throw new Error('Ce permis est déjà associé à un chauffeur de votre groupement.');
  }

  const identite = champsIdentite(saisie, actuel);
  if (identite.pieceNumero && equipe.some((c) => c.pieceType === identite.pieceType && cle(c.pieceNumero) === cle(identite.pieceNumero))) {
    throw new Error('Cette pièce d’identité est déjà associée à un chauffeur de votre groupement.');
  }

  const donnees = {
    nom,
    permisNumero,
    // Nettoie les anciennes affectations du POC sans accepter ce champ en saisie.
    vehiculeId: null,
    permisEcheance: present(saisie, 'permisEcheance')
      ? dateValide(saisie.permisEcheance, 'Validité du permis', { facultative: true })
      : actuel?.permisEcheance ?? null,
    telephone: present(saisie, 'telephone') ? texte(saisie.telephone) || null : actuel?.telephone ?? null,
    ...identite,
  };

  // La fiche complète est exigée à la création : un chauffeur nouveau arrive
  // avec son identité, ses catégories et l'échéance de son permis.
  if (!actuel) {
    const manquants = [
      ['permisEcheance', 'la validité du permis'],
      ['permisCategories', 'les catégories du permis'],
      ['pieceType', 'le type de pièce d’identité'],
      ['pieceNumero', 'le numéro de la pièce'],
      ['pieceDelivreeLe', 'sa date de délivrance'],
      ['pieceExpireLe', 'sa date d’expiration'],
      ['nationalite', 'la nationalité'],
      ['dateNaissance', 'la date de naissance'],
    ].filter(([champ]) => {
      const v = donnees[champ];
      return v == null || v === '' || (Array.isArray(v) && v.length === 0);
    });
    if (manquants.length) {
      throw new Error(`Fiche incomplète : renseignez ${manquants.map(([, l]) => l).join(', ')}.`);
    }
  }

  // Correctif anti-fraude n° 3 : une pièce contrôlée qui change perd son contrôle.
  const aRecontroler = Boolean(actuel) && pieceModifiee('chauffeur', actuel, donnees);
  if (aRecontroler) {
    donnees.verifieLe = null;
    donnees.verifieParUtilisateurId = null;
  }

  return stockageInterne().transaction((tx) => {
    const resultat = actuel
      ? depot('chauffeur').modifier(actuel.id, donnees, { tx })
      : depot('chauffeur').creer(
          {
            ...donnees,
            id: identifiant('chf'),
            groupementId: ctx.groupementId,
            actif: true,
            creeLe: new Date().toISOString(),
            demo: true,
          },
          { tx, roleAuteur: ctx.roleId },
        );
    // Le journal ne porte ni nom ni numéro : il est lisible par la DGTTC.
    journaliser(ctx, actuel ? EVENEMENT_AUDIT.CHAUFFEUR_MODIFIE : EVENEMENT_AUDIT.CHAUFFEUR_ENREGISTRE, {
      cibleType: 'chauffeur',
      cibleId: resultat.id,
      details: actuel
        ? `Fiche chauffeur modifiée.${aRecontroler ? ' Pièces à faire contrôler de nouveau.' : ''}`
        : 'Chauffeur ajouté à l’équipe, pièces à faire contrôler.',
      tx,
    });
    return resultat;
  });
}

/**
 * Missions qui empêchent le retrait, et disponibilités qui perdront leur chauffeur.
 * @param {string} chauffeurId
 * @returns {{bloquantes: Array<Record<string, any>>, adetacher: Array<Record<string, any>>}}
 */
function engagementsDe(chauffeurId) {
  const livres = new Set(
    depot('transport')
      .brutOu((t) => [ETAPE_TRANSPORT.LIVRE, ETAPE_TRANSPORT.CLOTURE].includes(t.etape))
      .map((t) => t.appariementId),
  );
  const valides = new Map(
    depot('appariement')
      .brutOu((a) => a.etat === 'valider')
      .map((a) => [a.offreId, a]),
  );
  const offres = depot('offre').brutOu((o) => o.chauffeurPressentiId === chauffeurId);
  const bloquantes = offres.filter((o) =>
    o.etat === ETAT_OFFRE.RESERVEE ||
    (o.etat === ETAT_OFFRE.ENGAGEE && valides.has(o.id) && !livres.has(valides.get(o.id).id)));
  const adetacher = offres.filter((o) => o.etat === ETAT_OFFRE.DISPONIBLE);
  return { bloquantes, adetacher };
}

/**
 * Ce que le retrait va produire, pour le dire **avant** (décision D31).
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} chauffeurId
 * @returns {{retirable: boolean, motif: string|null, disponibilites: string[]}}
 */
export function apercuRetrait(ctx, chauffeurId) {
  const c = chauffeurDuParc(ctx, chauffeurId);
  if (c.actif === false) return { retirable: false, motif: 'Ce chauffeur est déjà retiré.', disponibilites: [] };
  const { bloquantes, adetacher } = engagementsDe(chauffeurId);
  if (bloquantes.length) {
    return {
      retirable: false,
      motif:
        `Ce chauffeur est désigné sur un transport en cours ou réservé (${bloquantes.map((o) => o.reference).join(', ')}). ` +
        'Attendez la livraison, ou répondez à la réservation, avant de le retirer.',
      disponibilites: [],
    };
  }
  return { retirable: true, motif: null, disponibilites: adetacher.map((o) => o.reference) };
}

/**
 * Retire un chauffeur parti : désactivation motivée et datée, historique conservé.
 *
 * Les disponibilités encore ouvertes qui le désignaient sont conservées, sans
 * chauffeur pressenti — dans la même transaction.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} chauffeurId
 * @param {{dateDepart: string, motif: string}} saisie
 * @returns {{chauffeur: Record<string, any>, disponibilites: string[]}}
 */
export function retirerChauffeur(ctx, chauffeurId, { dateDepart, motif } = {}) {
  const c = chauffeurDuParc(ctx, chauffeurId);
  if (c.actif === false) throw new Error('Ce chauffeur est déjà retiré de votre équipe.');
  const date = dateValide(dateDepart, 'Date de départ');
  const raison = texte(motif);
  if (!raison) throw new Error('Indiquez le motif du départ : il reste dans l’historique du chauffeur.');
  if (raison.length > 300) throw new Error('Le motif ne doit pas dépasser 300 caractères.');

  const apercu = apercuRetrait(ctx, chauffeurId);
  if (!apercu.retirable) throw new Error(apercu.motif);
  const { adetacher } = engagementsDe(chauffeurId);
  const maintenant = new Date().toISOString();

  return stockageInterne().transaction((tx) => {
    for (const o of adetacher) {
      depot('offre').modifier(o.id, { chauffeurPressentiId: null, modifieeLe: maintenant, modifieeParUtilisateurId: ctx.utilisateurId }, { tx });
      journaliser(ctx, EVENEMENT_AUDIT.OFFRE_MODIFIEE, {
        cibleType: 'offre',
        cibleId: o.id,
        details: `Offre ${o.reference} : chauffeur pressenti retiré (départ du chauffeur).`,
        tx,
      });
    }
    const chauffeur = depot('chauffeur').modifier(
      c.id,
      {
        actif: false,
        retireLe: maintenant,
        dateDepart: date,
        motifRetrait: raison,
        mouvements: [
          ...(c.mouvements ?? []),
          { id: identifiant('mvt'), type: 'retrait', le: maintenant, dateEffet: date, motif: raison, parUtilisateurId: ctx.utilisateurId },
        ],
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.CHAUFFEUR_RETIRE, {
      cibleType: 'chauffeur',
      cibleId: c.id,
      details: `Chauffeur retiré de l’équipe. Disponibilités concernées : ${adetacher.length ? adetacher.map((o) => o.reference).join(', ') : 'aucune'}.`,
      tx,
    });
    return { chauffeur, disponibilites: adetacher.map((o) => o.reference) };
  });
}

/**
 * Réactive un chauffeur revenu dans l'équipe. Son historique est conservé ; ses
 * pièces restent soumises au contrôle de l'agent d'activation.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} chauffeurId
 * @returns {Record<string, any>}
 */
export function reactiverChauffeur(ctx, chauffeurId) {
  const c = chauffeurDuParc(ctx, chauffeurId);
  if (c.actif !== false) throw new Error('Ce chauffeur fait déjà partie de votre équipe.');
  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    const chauffeur = depot('chauffeur').modifier(
      c.id,
      {
        actif: true,
        retireLe: null,
        dateDepart: null,
        motifRetrait: null,
        mouvements: [
          ...(c.mouvements ?? []),
          { id: identifiant('mvt'), type: 'reactivation', le: maintenant, dateEffet: maintenant.slice(0, 10), parUtilisateurId: ctx.utilisateurId },
        ],
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.CHAUFFEUR_REACTIVE, {
      cibleType: 'chauffeur',
      cibleId: c.id,
      details: 'Chauffeur réactivé dans l’équipe.',
      tx,
    });
    return chauffeur;
  });
}
