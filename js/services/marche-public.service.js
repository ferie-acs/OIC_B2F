/** Catalogue anonyme : liste positive de champs, distincte des projections membres.
 * Aucun texte libre, identifiant de groupement, contact ou document n'en sort.
 * Les actions restent soumises aux droits métier et à l'abonnement existants.
 */
import { depot } from '../repositories/index.js';
import { publiabilite } from './flotte.service.js';
import { decider, exiger } from '../domain/access.js';
import { segmentEspace } from '../core/nav.js';

export function cataloguePublic(maintenant = new Date()) {
  const refs = new Map(depot('referentiel').brutTous().map(r => [r.id, r]));
  const nom = id => refs.get(id)?.libelle ?? 'Non précisé';
  const localite = id => refs.get(id)?.famille === 'localites' && refs.get(id)?.actif;
  const vehicules = new Map(depot('vehicule').brutTous().map(v => [v.id, v]));
  const declarations = new Map(depot('declaration').brutTous().map(d => [d.id, d]));
  const transports = depot('transport').brutTous();
  const appariements = depot('appariement').brutTous();
  // Un transport non terminé ne devient jamais une disponibilité automatique.
  const occupes = new Set(appariements.filter(a => a.etat === 'accepter' || (a.etat === 'valider' &&
    !transports.some(t => t.appariementId === a.id && ['livre', 'cloture'].includes(t.etape))))
    .map(a => depot('offre').brutParId(a.offreId)?.vehiculeId));
  const commun = (type, id, departId, arriveeId, du, au, publieeLe, carrosserieId, tonnes) => ({
    type, id, departId, arriveeId, depart: nom(departId), arrivee: nom(arriveeId),
    du, au, publieeLe, carrosserieId, carrosserie: nom(carrosserieId), tonnes,
    disponibilite: new Date(du) <= maintenant ? 'maintenant' : 'prochainement',
  });
  const camions = depot('offre').brutTous().filter(o => {
    const v = vehicules.get(o.vehiculeId);
    return o.etat === 'disponible' && new Date(o.disponibleAu) >= maintenant &&
      localite(o.localiteDepartId) && localite(o.localiteArriveeId) &&
      v && publiabilite(v).publiable && !occupes.has(v.id);
  }).map(o => {
    const v = vehicules.get(o.vehiculeId);
    return { ...commun('camions', o.id, o.localiteDepartId, o.localiteArriveeId,
      o.disponibleDu, o.disponibleAu, o.publieeLe, v.carrosserieId, v.capaciteT),
      titre: `${nom(v.carrosserieId)} · ${v.capaciteT} tonnes` };
  });
  const frets = depot('demande').brutTous().filter(d => {
    const dec = declarations.get(d.declarationId);
    return d.etat === 'publiee' && new Date(d.departPrevu) >= maintenant &&
      dec?.etat === 'active' && localite(dec.provenanceId) && localite(dec.destinationId);
  }).map(d => {
    const dec = declarations.get(d.declarationId);
    return { ...commun('frets', d.id, dec.provenanceId, dec.destinationId,
      d.departPrevu, d.arriveePrevue, d.publieeLe ?? d.creeeLe, d.carrosserieId,
      d.lignes.reduce((total, l) => total + l.poidsT, 0)),
      titre: [...new Set(d.lignes.map(l => nom(l.produitId)))].join(', ') };
  });
  return [...camions, ...frets].sort((a, b) => new Date(a.du) - new Date(b.du));
}

export function filtrerCatalogue(catalogue, filtres = {}) {
  return catalogue.filter(o => (!filtres.type || o.type === filtres.type) &&
    (!filtres.depart || o.departId === filtres.depart) &&
    (!filtres.arrivee || o.arriveeId === filtres.arrivee) &&
    (!filtres.carrosserie || o.carrosserieId === filtres.carrosserie) &&
    (!filtres.tonnes || (o.type === 'camions' ? o.tonnes >= Number(filtres.tonnes) : o.tonnes <= Number(filtres.tonnes))) &&
    (!filtres.disponibilite || o.disponibilite === filtres.disponibilite) &&
    (!filtres.date || (o.type === 'camions'
      ? o.du.slice(0, 10) <= filtres.date && o.au.slice(0, 10) >= filtres.date
      : o.du.slice(0, 10) === filtres.date)));
}

/** Construit uniquement des routes internes connues, jamais une URL fournie. */
export function routeActionPublique(ctx, type, id, retour) {
  if (!['frets', 'camions'].includes(type)) throw new Error('Type d’offre inconnu.');
  const offre = cataloguePublic().find(o => o.type === type && o.id === id);
  if (!offre) throw new Error('Cette annonce n’est plus disponible. Relancez votre recherche.');
  const droit = type === 'camions' ? 'appariement.reserver' : 'offre.publier';
  exiger(ctx, droit, { groupementId: ctx.groupementId });
  const source = depot(type === 'camions' ? 'offre' : 'demande').brutParId(id);
  if (source?.groupementId === ctx.groupementId) throw new Error('Cette annonce appartient à votre groupement. Retrouvez-la dans votre espace.');
  return `#/${segmentEspace(ctx)}/marche?selection=${encodeURIComponent(id)}` +
    (retour ? `&retour=${encodeURIComponent(retourPublic(retour))}` : '');
}

export function retourPublic(valeur) {
  return typeof valeur === 'string' && /^#\/explorer(?:\?|$)/.test(valeur)
    ? valeur : '#/explorer';
}

export function routePublication(ctx) {
  const cible = { groupementId: ctx.groupementId };
  if (decider(ctx, 'declaration.creer', cible).autorise) return `#/${segmentEspace(ctx)}/declarations/nouvelle`;
  exiger(ctx, 'offre.publier', cible);
  return `#/${segmentEspace(ctx)}/offres/nouvelle`;
}
