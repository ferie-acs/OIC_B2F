/**
 * Flux public des offres ouvertes, au format JSON (service web).
 *
 * L'application en service exposait dans son flux public les coordonnées
 * complètes des annonceurs : nom, téléphone, adresse. **C'est la faille à ne
 * pas reproduire.** Ce flux est construit par **liste positive** de champs, à
 * partir du catalogue anonyme du marché public : aucune raison sociale, aucun
 * identifiant d'entreprise, aucune immatriculation, aucun texte libre, aucune
 * coordonnée. Une vérification finale refuse de rendre un flux qui contiendrait
 * une donnée d'identité connue de la plateforme.
 *
 * Sans serveur, le POC ne peut pas publier ce flux à une adresse : il est
 * généré à la demande et téléchargeable depuis l'écran d'administration.
 *
 * @module services/flux-offres.service
 */

import { exiger } from '../domain/access.js';
import { EVENEMENT_AUDIT } from '../domain/enums.js';
import { depot } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { cataloguePublic } from './marche-public.service.js';

/** Version du format, à incrémenter à tout changement de champ. */
export const VERSION_FLUX = '1.0';

/** Champs publiés, et eux seuls. */
export const CHAMPS_FLUX = Object.freeze([
  'type', 'identifiant', 'depart', 'arrivee', 'debut', 'fin', 'publieeLe',
  'carrosserie', 'tonnes', 'disponibilite', 'description',
]);

/**
 * Identifiant opaque et stable d'une annonce : ne révèle pas la clé interne.
 * @param {string} id
 */
function identifiantPublic(id) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return `ANN-${h.toString(36).toUpperCase().padStart(7, '0')}`;
}

/**
 * Valeurs d'identité et de contact connues de la plateforme, qui ne doivent
 * jamais apparaître dans le flux.
 */
function valeursInterdites() {
  const valeurs = [];
  for (const g of depot('groupement').brutTous()) {
    valeurs.push(g.raisonSociale, g.rccm, g.compteContribuable, g.contactNom, g.contactTelephone, g.contactEmail, g.adresse, g.id);
  }
  for (const v of depot('vehicule').brutTous()) valeurs.push(v.immatriculation, v.carteGrise, v.carteTransportNumero);
  for (const c of depot('chauffeur').brutTous()) valeurs.push(c.nom, c.telephone, c.permisNumero);
  for (const u of depot('utilisateur').brutTous()) valeurs.push(u.email, u.telephone);
  return valeurs.filter((v) => typeof v === 'string' && v.trim().length >= 4);
}

/**
 * Construit le flux, sans effet de bord. Exporté pour les tests.
 * @param {Date} [maintenant]
 */
export function construireFlux(maintenant = new Date()) {
  const annonces = cataloguePublic(maintenant).map((o) => ({
    type: o.type === 'camions' ? 'vehicule_disponible' : 'fret_a_transporter',
    identifiant: identifiantPublic(o.id),
    depart: o.depart,
    arrivee: o.arrivee,
    debut: o.du,
    fin: o.au,
    publieeLe: o.publieeLe ?? null,
    carrosserie: o.carrosserie,
    tonnes: o.tonnes,
    disponibilite: o.disponibilite,
    description: o.titre,
  }));
  const flux = {
    source: 'Bourse de Fret — Office Ivoirien des Chargeurs (démonstration)',
    version: VERSION_FLUX,
    genereLe: maintenant.toISOString(),
    avertissement:
      'Flux public des annonces ouvertes. Aucune donnée d’identité ni de contact : ' +
      'la mise en relation se fait sur la plateforme, après validation et règlement des frais.',
    nombre: annonces.length,
    annonces,
  };
  const texte = JSON.stringify(flux);
  const fuite = valeursInterdites().find((v) => texte.includes(v));
  if (fuite) throw new Error('Flux refusé : il contiendrait une donnée d’identité ou de contact.');
  return flux;
}

/**
 * Génère le flux pour l'administrateur et l'inscrit au journal.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {{flux: object, nom: string, contenu: string}}
 */
export function genererFlux(ctx) {
  exiger(ctx, 'flux.offres');
  const flux = construireFlux();
  journaliser(ctx, EVENEMENT_AUDIT.FLUX_OFFRES_GENERE, {
    cibleType: 'flux',
    details: `Flux public des offres généré (${flux.nombre} annonces, sans donnée d’identité).`,
  });
  return {
    flux,
    nom: `flux-offres-${flux.genereLe.slice(0, 10)}.json`,
    contenu: JSON.stringify(flux, null, 2),
  };
}
