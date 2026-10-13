/**
 * Lot b5 : flux public des offres (service web), généré et téléchargé depuis
 * l'administration. Aucun champ d'identité ni de contact.
 *
 * @module views/flux-offres
 */

import { date, el } from '../core/dom.js';
import { bandeau, bouton, carte, etatVide, kpi, tableau, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { CHAMPS_FLUX, VERSION_FLUX, construireFlux, genererFlux } from '../services/flux-offres.service.js';
import { telecharger } from './admin-outils.js';

const DESCRIPTIONS = {
  type: 'véhicule disponible ou fret à transporter', identifiant: 'code opaque de l’annonce', depart: 'localité de départ',
  arrivee: 'localité d’arrivée', debut: 'début de disponibilité', fin: 'fin de disponibilité', publieeLe: 'date de publication',
  carrosserie: 'type de carrosserie', tonnes: 'capacité ou poids', disponibilite: 'maintenant ou prochainement', description: 'marchandise ou véhicule, sans nom',
};
const JAMAIS = ['Raison sociale et RCCM', 'Téléphone, courriel, adresse', 'Nom du chauffeur', 'Immatriculation et carte grise', 'Identifiant interne de l’entreprise', 'Texte libre saisi par l’annonceur', 'Prix et montants'];

/** @param {any} ctx */
export function fluxOffresVue(ctx) {
  const droit = decider(ctx, 'flux.offres');
  const flux = construireFlux();
  const vehicules = flux.annonces.filter((a) => a.type === 'vehicule_disponible').length;

  const generer = () => {
    try {
      const f = genererFlux(ctx);
      telecharger(f.nom, f.contenu, 'application/json;charset=utf-8');
      toast(`Flux généré : ${f.flux.nombre} annonce(s), sans donnée d’identité.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Génération impossible.', 'err');
    }
  };

  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'warn',
      titre: 'La faille de l’application en service n’est pas reproduite',
      message:
        'Le flux public de l’application en service livrait les coordonnées complètes des annonceurs. ' +
        'Ce flux est construit par liste positive de champs : un champ qui n’y figure pas ne sort jamais, ' +
        'et la génération est refusée si une donnée d’identité connue de la plateforme y apparaissait.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Annonces publiées', valeur: flux.nombre, icon: 'published' }),
      kpi({ libelle: 'Véhicules disponibles', valeur: vehicules, icon: 'truck' }),
      kpi({ libelle: 'Frets à transporter', valeur: flux.nombre - vehicules, icon: 'package' }),
    ]),
    carte({
      titre: 'Contenu du flux',
      sousTitre: `Format JSON, version ${VERSION_FLUX}. Les données d’identité ne sont transmises qu’aux deux parties d’une mise en relation validée.`,
      corps: [tableau({
        colonnes: ['Champs publiés', 'Jamais publiés'],
        lignes: Array.from({ length: Math.max(CHAMPS_FLUX.length, JAMAIS.length) }, (_, i) => [
          CHAMPS_FLUX[i] ? `${CHAMPS_FLUX[i]} — ${DESCRIPTIONS[CHAMPS_FLUX[i]]}` : '',
          JAMAIS[i] ?? '',
        ]),
      })],
    }),
    carte({
      titre: 'Aperçu du flux',
      sousTitre: 'Démonstration sans serveur : le flux est généré à la demande et téléchargé. En service, il serait servi à une adresse publique.',
      actions: [bouton({ libelle: 'Générer et télécharger (JSON)', variante: 'primary', icone: 'download', motif: droit.autorise ? null : droit.explication, onClick: generer })],
      corps: [tableau({
        colonnes: ['Identifiant', 'Annonce', 'Départ', 'Arrivée', 'Période', 'Carrosserie', 'Tonnes'],
        lignes: flux.annonces.slice(0, 15).map((a) => [
          a.identifiant, a.type === 'vehicule_disponible' ? 'Véhicule disponible' : 'Fret à transporter', a.depart, a.arrivee,
          `${date(a.debut)} → ${date(a.fin)}`, a.carrosserie, String(a.tonnes),
        ]),
        vide: etatVide({ titre: 'Aucune annonce ouverte', message: 'Le flux est vide tant qu’aucune annonce n’est publiée.' }),
      }), flux.nombre > 15 ? el('p.declarations-count', { text: `Aperçu des 15 premières annonces sur ${flux.nombre}. Le fichier téléchargé les contient toutes.` }) : null],
    }),
  ]);
}
