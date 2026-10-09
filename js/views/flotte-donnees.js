/**
 * Données projetées de la vue flotte. Un itinéraire annoncé n'est pas une
 * position GPS : ce module ne déduit aucune télémétrie des étapes du transport.
 */

import { ETAT_APPARIEMENT, ETAT_OFFRE, ETAT_VEHICULE, SENS_APPARIEMENT, labelOf } from '../domain/enums.js';
import { mesVehicules, mesChauffeurs, mesOffres } from '../services/flotte.service.js';
import { mesAppariements } from '../services/matching.service.js';
import { transportsVisibles } from '../services/transport.service.js';
import { refDe } from './_donnees.js';

const TERMINEES = new Set(['livre', 'cloture']);
const instant = valeur => Number.isFinite(Date.parse(valeur)) ? Date.parse(valeur) : 0;
const recente = (a, b) => instant(b.valideLe || b.reponduLe || b.reserveLe || b.publieeLe)
  - instant(a.valideLe || a.reponduLe || a.reserveLe || a.publieeLe);

function etatPiece(date, maintenant) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'manquante';
  const fin = new Date(`${date}T23:59:59.999`);
  const [annee, mois, jour] = date.split('-').map(Number);
  if (!Number.isFinite(fin.getTime()) || fin.getFullYear() !== annee || fin.getMonth() !== mois - 1 || fin.getDate() !== jour) return 'manquante';
  return fin.getTime() < maintenant ? 'echue' : 'valide';
}

/** Une mission en cours prime sur une annonce ; une mission livrée est historique. */
function prioriteAppariement(a, transports) {
  const t = transports.get(a.id);
  if (a.etat === ETAT_APPARIEMENT.VALIDER && !TERMINEES.has(t?.etape)) return 6;
  if (a.etat === ETAT_APPARIEMENT.ACCEPTER) return 5;
  if (a.etat === ETAT_APPARIEMENT.RESERVER) return 4;
  return 0;
}

function historiqueDe(vehicule, offre, appariement, transport) {
  const evenements = [];
  const ajouter = (libelle, date, detail = '') => {
    if (date) evenements.push({ libelle, date, detail });
  };
  ajouter('Véhicule ajouté au parc', vehicule.creeLe, vehicule.immatriculation);
  if (offre) {
    ajouter('Disponibilité publiée', offre.publieeLe, offre.reference);
    ajouter('Disponibilité retirée', offre.retireeLe, offre.reference);
  }
  if (appariement) {
    ajouter(appariement.sens === SENS_APPARIEMENT.DEMANDE_VERS_OFFRE ? 'Proposition envoyée' : 'Réservation reçue', appariement.reserveLe, appariement.reference);
    if (appariement.reponduLe) {
      ajouter(appariement.etat === ETAT_APPARIEMENT.REJETER ? 'Réservation refusée' : 'Réservation acceptée', appariement.reponduLe,
        appariement.motifRejet ? labelOf(appariement.motifRejet) : appariement.reference);
    }
    ajouter('Mise en relation annulée', appariement.annuleLe, appariement.reference);
    if (!(transport?.journal || []).some(e => e.type === 'etape' && e.valeur === 'valide')) {
      ajouter('Mise en relation validée', appariement.valideLe, appariement.reference);
    }
  }
  for (const e of transport?.journal || []) {
    ajouter(e.type === 'incident' ? `Incident : ${labelOf(e.valeur)}` : `Transport · ${labelOf(e.valeur)}`,
      e.horodatage, e.observation || '');
  }
  return evenements.sort((a, b) => instant(b.date) - instant(a.date));
}

/**
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<{
 *   vehicule: Object, chauffeur: Object|null, offre: Object|null,
 *   appariement: Object|null, transport: Object|null,
 *   departId: string|null, arriveeId: string|null, depart: string, arrivee: string,
 *   enRoute: boolean, stationnementId: string|null, stationnement: string,
 *   stationnementSource: 'livraison'|'vehicule'|null,
 *   statut: 'disponible'|'engage'|'indisponible'|'a_verifier', libelle: string,
 *   ton: 'ok'|'info'|'warn'|'err', offresActives: number,
 *   historique: Array<{libelle: string, date: string, detail: string}>,
 *   alertes: Array<{libelle: string, detail: string}>
 * }>}
 */
export function donneesFlotte(ctx) {
  if (!ctx.groupementId) return [];
  const maintenant = Date.now();
  // Le cloisonnement est explicite, même si un futur rôle possède un droit global.
  const vehicules = mesVehicules(ctx).filter(v => v.groupementId === ctx.groupementId);
  const chauffeurs = mesChauffeurs(ctx).filter(c => c.groupementId === ctx.groupementId);
  const offres = mesOffres(ctx).filter(o => o.groupementId === ctx.groupementId);
  const appariements = mesAppariements(ctx, a => a.groupementTransporteurId === ctx.groupementId);
  const transports = new Map(transportsVisibles(ctx)
    .filter(t => t.appariement?.groupementTransporteurId === ctx.groupementId)
    .map(t => [t.appariementId, t]));
  const chauffeursParId = new Map(chauffeurs.map(c => [c.id, c]));
  const parOffre = new Map();
  for (const a of appariements) {
    const liste = parOffre.get(a.offreId) || [];
    liste.push(a);
    parOffre.set(a.offreId, liste);
  }
  for (const liste of parOffre.values()) {
    liste.sort((a, b) => prioriteAppariement(b, transports) - prioriteAppariement(a, transports) || recente(a, b));
  }
  const prioriteOffre = o => {
    const a = parOffre.get(o.id)?.[0];
    if (a && prioriteAppariement(a, transports)) return prioriteAppariement(a, transports);
    if (o.etat === ETAT_OFFRE.DISPONIBLE && instant(o.disponibleAu) >= maintenant) return 3;
    // Un état engagé déjà livré ne doit pas cacher une prochaine disponibilité.
    if (!a && [ETAT_OFFRE.RESERVEE, ETAT_OFFRE.ENGAGEE].includes(o.etat)) return 2;
    return 0;
  };

  return vehicules.map(vehicule => {
    const annonces = offres.filter(o => o.vehiculeId === vehicule.id)
      .sort((a, b) => prioriteOffre(b) - prioriteOffre(a) || recente(a, b));
    const offre = annonces[0] || null;
    const appariement = offre ? parOffre.get(offre.id)?.[0] || null : null;
    const transport = appariement ? transports.get(appariement.id) || null : null;
    // Le chauffeur est choisi pour cette offre/ce trajet, jamais pour le camion.
    const chauffeur = chauffeursParId.get(offre?.chauffeurPressentiId) || null;
    const departId = offre?.localiteDepartId || null;
    const arriveeId = offre?.localiteArriveeId || null;
    const enRoute = transport?.etape === 'en_route';
    let stationnementId = vehicule.stationnementLocaliteId || null;
    let stationnementSource = stationnementId ? 'vehicule' : null;
    // Le véhicule peut déjà avoir une prochaine annonce : on conserve la dernière
    // livraison constatée dans ses transports, pas le départ de cette annonce.
    const missions = annonces.flatMap(o => (parOffre.get(o.id) || []).map(a => ({
      offre: o, transport: transports.get(a.id),
    }))).filter(m => m.transport).sort((a, b) => {
      const dateMission = m => Math.max(instant(m.transport.demarreLe),
        ...(m.transport.journal || []).map(e => instant(e.horodatage)));
      return dateMission(b) - dateMission(a);
    });
    const derniereMission = missions[0];
    const livraison = derniereMission?.transport.journal?.find(e => e.type === 'etape' && e.valeur === 'livre');
    const dateStationnement = instant(vehicule.stationnementMisAJourLe);
    const dateLivraison = instant(livraison?.horodatage);
    if (!vehicule.engage && vehicule.etat !== ETAT_VEHICULE.ENGAGE &&
        TERMINEES.has(derniereMission?.transport.etape) && livraison &&
        dateLivraison > 0 && dateLivraison <= maintenant &&
        (dateStationnement ? dateLivraison > dateStationnement : !stationnementId)) {
      stationnementId = derniereMission.offre.localiteArriveeId || stationnementId;
      stationnementSource = derniereMission.offre.localiteArriveeId ? 'livraison' : stationnementSource;
    }
    const alertes = [];
    const carte = etatPiece(vehicule.carteTransportEcheance, maintenant);
    if (carte === 'echue') alertes.push({ libelle: 'Carte de transport échue', detail: 'Renouvelez la carte avant de publier une nouvelle disponibilité.' });
    if (carte === 'manquante') alertes.push({ libelle: 'Carte de transport à compléter', detail: 'Renseignez une date de validité correcte dans la fiche du véhicule.' });
    if (chauffeur?.permisEchu) alertes.push({ libelle: 'Permis du chauffeur échu', detail: `Vérifiez le permis de ${chauffeur.nom}.` });

    let statut = 'disponible';
    let libelle = labelOf(ETAT_VEHICULE.DISPONIBLE);
    let ton = 'ok';
    if (vehicule.etat === ETAT_VEHICULE.HORS_SERVICE) {
      statut = 'indisponible'; libelle = labelOf(ETAT_VEHICULE.HORS_SERVICE); ton = 'err';
    } else if (vehicule.engage || vehicule.etat === ETAT_VEHICULE.ENGAGE || (transport && !TERMINEES.has(transport.etape))) {
      statut = 'engage'; libelle = transport && !TERMINEES.has(transport.etape) ? labelOf(transport.etape) : labelOf(ETAT_VEHICULE.ENGAGE); ton = 'info';
    } else if (alertes.length || !vehicule.publiable) {
      statut = 'a_verifier'; libelle = 'À vérifier'; ton = 'warn';
    } else if (appariement?.etat === ETAT_APPARIEMENT.RESERVER) {
      statut = 'engage'; libelle = appariement.sens === SENS_APPARIEMENT.DEMANDE_VERS_OFFRE ? 'Proposition en attente' : 'Réservation en attente'; ton = 'warn';
    }
    return {
      vehicule, chauffeur, offre, appariement, transport,
      departId, arriveeId, depart: refDe(departId), arrivee: refDe(arriveeId),
      enRoute, stationnementId, stationnement: refDe(stationnementId), stationnementSource,
      statut, libelle, ton, alertes,
      offresActives: annonces.filter(o => prioriteOffre(o) > 0).length,
      historique: historiqueDe(vehicule, offre, appariement, transport),
    };
  });
}
