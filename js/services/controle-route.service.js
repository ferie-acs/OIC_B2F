/**
 * Contrôle sur route — vérification d'une attestation de bourse de fret (lot b3).
 *
 * ## Trois règles
 *
 * 1. **Chaque vérification est journalisée**, quel qu'en soit le verdict — un
 *    code inconnu aussi : une série de codes inconnus est précisément ce qu'une
 *    supervision doit voir. Une ligne dans `controles` (l'historique de l'agent)
 *    et une entrée au journal d'audit (la supervision de l'OIC et de la DGTTC).
 * 2. **Le strict nécessaire** : authenticité, état, référence, immatriculation,
 *    trajet, dates, et l'état de la carte de transport du véhicule (lu par le
 *    service de contrôle existant). Ni nom, ni téléphone, ni courriel des
 *    parties, ni montant.
 * 3. **Le code se lit de deux façons** — QR scanné, ou code saisi à la main ; la
 *    page publique du QR reste ouverte à tout porteur du document, comme dans le
 *    système existant, et ses vérifications sont journalisées elles aussi.
 *
 * @module services/controle-route.service
 */

import { identifiant } from '../core/crypto.js';
import { EVENEMENT_AUDIT, MODE_CONTROLE, labelOf } from '../domain/enums.js';
import { decider, exiger, projeter } from '../domain/access.js';
import { etatAttestation, normaliserCode, resultatDe } from '../domain/attestation.regles.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { CONTEXTE_PLATEFORME, journaliser } from './audit.service.js';
import { attestationParJeton } from './attestation.service.js';
import { etatCarteTransport } from './controle.service.js';

const libelle = (id) => depot('referentiel').brutParId(id)?.libelle ?? '—';
const borne = (v, max) => {
  const t = String(v ?? '').trim();
  if (t.length > max) throw new Error(`Ce champ ne doit pas dépasser ${max} caractères.`);
  return t || null;
};

/**
 * Fiche de contrôle : ce que l'agent a besoin de lire, et rien de plus.
 * @param {Record<string, any>} att Attestation brute.
 * @returns {Record<string, any>}
 */
function ficheControle(att) {
  const a = depot('appariement').brutParId(att.appariementId);
  const offre = a ? depot('offre').brutParId(a.offreId) : null;
  const vehicule = offre ? depot('vehicule').brutParId(offre.vehiculeId) : null;
  return {
    reference: att.reference,
    immatriculation: att.immatriculation,
    depart: libelle(att.localiteDepartId),
    arrivee: libelle(att.localiteArriveeId),
    departPrevu: att.departPrevu,
    arriveePrevue: att.arriveePrevue,
    genereeLe: att.genereeLe,
    valableJusquau: att.valableJusquau,
    annuleeLe: att.annuleeLe ?? null,
    // Service de contrôle existant : la carte de transport se juge à sa date.
    carteTransport: vehicule ? etatCarteTransport(vehicule) : 'inconnue',
  };
}

/**
 * Lit le code et constate le verdict, sans rien écrire.
 * @param {string} saisie
 */
function constater(saisie) {
  const jeton = normaliserCode(saisie);
  const att = attestationParJeton(jeton);
  const etat = att ? etatAttestation(att) : null;
  return { att, etat, resultat: resultatDe(etat), codeLisible: Boolean(jeton) };
}

/**
 * Enregistre la vérification (historique et journal), d'un bloc.
 * @param {any} auteur Contexte de l'agent, ou de la plateforme pour la page publique.
 * @param {{att: any, resultat: string}} constat
 * @param {{mode: string, lieu?: string|null, observation?: string|null}} options
 */
function journaliserControle(auteur, { att, resultat }, { mode, lieu = null, observation = null }) {
  const horodatage = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    const ligne = depot('controle').creer(
      {
        id: identifiant('ctl'),
        horodatage,
        agentUtilisateurId: auteur.utilisateurId ?? null,
        mode,
        resultat,
        attestationId: att?.id ?? null,
        attestationReference: att?.reference ?? null,
        immatriculation: att?.immatriculation ?? null,
        lieu,
        observation,
        demo: true,
      },
      { tx },
    );
    journaliser(auteur, EVENEMENT_AUDIT.ATTESTATION_VERIFIEE, {
      cibleType: 'attestation',
      cibleId: att?.id,
      details:
        `${mode === MODE_CONTROLE.PUBLIC ? 'Vérification depuis la page publique' : 'Vérification sur route'} : ` +
        `${labelOf(resultat).toLowerCase()}${att ? ` — ${att.reference}` : ''}.`,
      tx,
    });
    return ligne;
  });
}

/**
 * Vérifie une attestation, par un agent de contrôle.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} saisie Code saisi, ou contenu du QR (adresse complète acceptée).
 * @param {{mode?: string, lieu?: string, observation?: string}} [options]
 * @returns {{resultat: string, etat: string|null, controleId: string, horodatage: string,
 *   codeLisible: boolean, fiche: Record<string, any>|null}}
 */
export function verifierAttestation(ctx, saisie, options = {}) {
  exiger(ctx, 'controle.verifier', { groupementId: null });
  const mode = options.mode === MODE_CONTROLE.QR ? MODE_CONTROLE.QR : MODE_CONTROLE.SAISIE;
  const lieu = borne(options.lieu, 120);
  const observation = borne(options.observation, 300);
  if (!String(saisie ?? '').trim()) throw new Error('Saisissez le code de vérification imprimé sur l’attestation.');

  const constat = constater(saisie);
  const ligne = journaliserControle(ctx, constat, { mode, lieu, observation });
  return {
    resultat: constat.resultat,
    etat: constat.etat,
    controleId: ligne.id,
    horodatage: ligne.horodatage,
    codeLisible: constat.codeLisible,
    fiche: constat.att ? ficheControle(constat.att) : null,
  };
}

/**
 * Vérification depuis la page publique ouverte par le QR code.
 *
 * Un agent connecté qui scanne le QR avec son téléphone voit le contrôle imputé
 * à son nom ; sinon la vérification est journalisée comme publique.
 *
 * @param {string} jeton
 * @param {import('../domain/access.js').Contexte|null} [ctx]
 */
export function verifierPublic(jeton, ctx = null) {
  if (ctx && decider(ctx, 'controle.verifier').autorise) {
    return { ...verifierAttestation(ctx, jeton, { mode: MODE_CONTROLE.QR }), agent: true };
  }
  const constat = constater(jeton);
  const ligne = journaliserControle(CONTEXTE_PLATEFORME, constat, { mode: MODE_CONTROLE.PUBLIC });
  return {
    resultat: constat.resultat,
    etat: constat.etat,
    controleId: ligne.id,
    horodatage: ligne.horodatage,
    codeLisible: constat.codeLisible,
    fiche: constat.att ? ficheControle(constat.att) : null,
    agent: false,
  };
}

/**
 * Historique des contrôles **de l'agent connecté**, du plus récent au plus ancien.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function mesControles(ctx) {
  exiger(ctx, 'controle.historique', { utilisateurId: ctx.utilisateurId });
  return depot('controle')
    .brutOu((c) => c.agentUtilisateurId === ctx.utilisateurId)
    .filter((c) => decider(ctx, 'controle.historique', { utilisateurId: c.agentUtilisateurId }).autorise)
    .sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage))
    .map((c) => projeter(ctx, 'controle', c, { proprietaireId: null }));
}
