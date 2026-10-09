/** Stationnements initiaux fictifs des seuls véhicules du jeu DÉMO connu. */
import { stockageInterne } from '../repositories/index.js';

const vehiculeSeed = v => v.demo === true && (
  (/^veh-[1-3]$/.test(v.id) && v.groupementId === 'grp-tra-1') ||
  (/^veh-[45]$/.test(v.id) && v.groupementId === 'grp-tra-2') ||
  (/^veh-seed-v1-(?:[0-9]|[12][0-9]|3[0-5])$/.test(v.id) &&
    v.seedVersion === 'activite-v1' && /^grp-demo-[0-3]$/.test(v.groupementId))
);
const offreSeed = o => o.demo === true && (/^off-[1-4]$/.test(o.id) || /^off-seed-v1-(?:[0-9]|[12][0-9]|3[0-5])$/.test(o.id));

/**
 * Migration idempotente : ni les véhicules saisis, ni les lieux déjà renseignés
 * ou volontairement vidés ne sont remplacés. À appeler après les seeds.
 * @returns {number} Nombre de véhicules enrichis.
 */
export function initialiserStationnementDemo() {
  return stockageInterne().transaction(tx => {
    const offres = tx.lire('offres').filter(offreSeed);
    const groupes = new Map(tx.lire('groupements').filter(g => g.demo === true).map(g => [g.id, g]));
    const localites = new Set(tx.lire('referentiels').filter(r => r.famille === 'localites').map(r => r.id));
    let compteur = 0;
    const vehicules = tx.lire('vehicules').map(v => {
      if (!vehiculeSeed(v) || Object.prototype.hasOwnProperty.call(v, 'stationnementLocaliteId') || v.stationnementMisAJourLe) return v;
      const offre = offres.find(o => o.vehiculeId === v.id && o.groupementId === v.groupementId);
      const stationnementLocaliteId = offre?.localiteDepartId || groupes.get(v.groupementId)?.localiteId;
      if (!localites.has(stationnementLocaliteId) || !Number.isFinite(Date.parse(v.creeLe))) return v;
      compteur += 1;
      return { ...v, stationnementLocaliteId, stationnementMisAJourLe: v.creeLe };
    });
    if (compteur) tx.ecrire('vehicules', vehicules);
    return compteur;
  });
}
