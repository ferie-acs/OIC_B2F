/**
 * Consultation et exports de l'autorité de contrôle (DGTTC).
 *
 * Tout passe par la projection du rôle : la DGTTC ne reçoit ni montant ni
 * coordonnée, et les exports sont construits par **liste positive** de
 * colonnes, sans prix ni solde — pas même le prix déclaratif au kilomètre.
 *
 * @module services/dgttc.service
 */

import { exiger, projeter } from '../domain/access.js';
import { EVENEMENT_AUDIT, TYPE_GROUPEMENT, labelOf } from '../domain/enums.js';
import { ROLES } from '../domain/roles.js';
import { depot } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { dansPeriode, dateCsv, versCsv } from './export-csv.js';

/** Rôles d'intermédiaire (auxiliaires) et leur libellé de contrôle. */
const INTERMEDIAIRES = Object.freeze({
  auxiliaire_affreteur: 'Intermédiaire de fret',
  auxiliaire_transporteur: 'Intermédiaire de transport',
});

/** Libellés de référentiel, publics. */
function libelles() {
  const refs = new Map(depot('referentiel').brutTous().map((r) => [r.id, r.libelle]));
  return (id) => (id ? refs.get(id) ?? '' : '');
}

/**
 * Intermédiaires (auxiliaires) et l'entreprise pour le compte de laquelle ils
 * agissent. Identité seulement : ni courriel ni téléphone.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function intermediaires(ctx) {
  exiger(ctx, 'groupement.lire');
  const groupements = new Map(depot('groupement').lisiblesPar(ctx, 'groupement.lire').map((g) => [g.id, g]));
  return depot('utilisateur')
    .brutOu((u) => INTERMEDIAIRES[u.roleId] && groupements.has(u.groupementId))
    .map((u) => {
      const vu = projeter(ctx, 'utilisateur', u, { proprietaireId: u.groupementId });
      const mandant = groupements.get(u.groupementId);
      return {
        id: u.id,
        nom: `${vu.prenom ?? ''} ${vu.nom ?? ''}`.trim() || 'Identité non communiquée',
        role: INTERMEDIAIRES[u.roleId],
        mandant: mandant?.raisonSociale ?? '—',
        mandantType: mandant?.type,
        localiteId: mandant?.localiteId,
        etat: u.etat,
        creeLe: u.creeLe,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Répartitions des acteurs et du parc, éventuellement sur une période
 * d'inscription.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{du?: string, au?: string}} [periode]
 */
export function repartitions(ctx, periode = {}) {
  exiger(ctx, 'groupement.lire');
  exiger(ctx, 'vehicule.lire');
  const dans = periode.du || periode.au ? dansPeriode(periode) : () => true;
  const ref = libelles();
  const acteurs = depot('groupement')
    .lisiblesPar(ctx, 'groupement.lire')
    .filter((g) => g.type !== TYPE_GROUPEMENT.INSTITUTION && dans(g.creeLe));
  const inters = intermediaires(ctx).filter((i) => dans(i.creeLe));
  const vehicules = depot('vehicule').lisiblesPar(ctx, 'vehicule.lire').filter((v) => dans(v.creeLe));

  const parLocalite = new Map();
  const compter = (localiteId, cle) => {
    const nom = ref(localiteId) || 'Non renseignée';
    const ligne = parLocalite.get(nom) ?? { localite: nom, localiteId: localiteId || null, transporteurs: 0, affreteurs: 0, intermediaires: 0, vehicules: 0 };
    ligne[cle] += 1;
    parLocalite.set(nom, ligne);
  };
  for (const g of acteurs) compter(g.localiteId, g.type === TYPE_GROUPEMENT.TRANSPORTEUR ? 'transporteurs' : 'affreteurs');
  for (const i of inters) compter(i.localiteId, 'intermediaires');
  const localiteDe = new Map(acteurs.map((g) => [g.id, g.localiteId]));
  for (const v of vehicules) compter(v.stationnementLocaliteId || localiteDe.get(v.groupementId), 'vehicules');

  const parCarrosserie = new Map();
  for (const v of vehicules) {
    const nom = ref(v.carrosserieId) || 'Non renseignée';
    parCarrosserie.set(nom, (parCarrosserie.get(nom) ?? 0) + 1);
  }
  const transporteurs = acteurs.filter((g) => g.type === TYPE_GROUPEMENT.TRANSPORTEUR);
  const parVerification = new Map();
  for (const g of transporteurs) {
    const libelle = labelOf(g.verificationEtat || 'a_verifier');
    parVerification.set(libelle, (parVerification.get(libelle) ?? 0) + 1);
  }
  const tailles = { 'Aucun véhicule': 0, '1 à 2 véhicules': 0, '3 à 9 véhicules': 0, '10 véhicules et plus': 0 };
  for (const g of transporteurs) {
    const n = vehicules.filter((v) => v.groupementId === g.id).length;
    tailles[n === 0 ? 'Aucun véhicule' : n <= 2 ? '1 à 2 véhicules' : n <= 9 ? '3 à 9 véhicules' : '10 véhicules et plus'] += 1;
  }

  return {
    totaux: {
      transporteurs: transporteurs.length,
      affreteurs: acteurs.length - transporteurs.length,
      intermediaires: inters.length,
      vehicules: vehicules.length,
    },
    parLocalite: [...parLocalite.values()].sort((a, b) =>
      (b.transporteurs + b.affreteurs + b.intermediaires) - (a.transporteurs + a.affreteurs + a.intermediaires) || a.localite.localeCompare(b.localite, 'fr')),
    parCarrosserie: [...parCarrosserie].map(([libelle, nombre]) => ({ libelle, nombre })).sort((a, b) => b.nombre - a.nombre),
    parVerification: [...parVerification].map(([libelle, nombre]) => ({ libelle, nombre })),
    parTailleDeParc: Object.entries(tailles).map(([libelle, nombre]) => ({ libelle, nombre })),
  };
}

/** Exports disponibles, avec le droit de lecture qu'ils exigent. */
export const EXPORTS = Object.freeze({
  offres: { libelle: 'Offres de transport', droit: 'offre.lire', date: 'publieeLe', libelleDate: 'date de publication' },
  declarations: { libelle: 'Déclarations de fret', droit: 'declaration.lire', date: 'creeeLe', libelleDate: 'date de déclaration' },
  demandes: { libelle: 'Demandes de transport', droit: 'demande.lire', date: 'creeeLe', libelleDate: 'date de création' },
  intermediaires: { libelle: 'Intermédiaires', droit: 'groupement.lire', date: 'creeLe', libelleDate: 'date d’inscription' },
});

/**
 * Lignes d'un export sur une période. Colonnes en liste positive : aucun
 * montant, aucun prix, aucune coordonnée.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} type Clé de `EXPORTS`.
 * @param {{du?: string, au?: string}} periode
 * @returns {{colonnes: string[], lignes: Array<Array<unknown>>}}
 */
export function donneesExport(ctx, type, periode = {}) {
  const def = EXPORTS[type];
  if (!def) throw new Error('Export inconnu.');
  exiger(ctx, 'export.donnees');
  exiger(ctx, def.droit);
  const dans = dansPeriode(periode);
  const ref = libelles();
  const nomGroupement = new Map(depot('groupement').lisiblesPar(ctx, 'groupement.lire').map((g) => [g.id, g.raisonSociale ?? '']));
  const nom = (id) => nomGroupement.get(id) ?? '';

  if (type === 'offres') {
    const vehicules = new Map(depot('vehicule').lisiblesPar(ctx, 'vehicule.lire').map((v) => [v.id, v]));
    return {
      colonnes: ['Référence', 'Transporteur', 'Départ', 'Arrivée', 'Disponible du', 'Disponible au', 'Carrosserie', 'Capacité (t)', 'Immatriculation', 'État', 'Publiée le'],
      lignes: depot('offre').lisiblesPar(ctx, 'offre.lire').filter((o) => dans(o.publieeLe)).map((o) => {
        const v = vehicules.get(o.vehiculeId);
        return [o.reference, nom(o.groupementId), ref(o.localiteDepartId), ref(o.localiteArriveeId), dateCsv(o.disponibleDu), dateCsv(o.disponibleAu),
          ref(v?.carrosserieId), v?.capaciteT ?? '', v?.immatriculation ?? '', o.etat ? labelOf(o.etat) : '', dateCsv(o.publieeLe)];
      }),
    };
  }
  if (type === 'declarations') {
    return {
      colonnes: ['Référence', 'Affréteur', 'Libellé', 'Provenance', 'Destination', 'État', 'Déclarée le', 'Publiée le'],
      lignes: depot('declaration').lisiblesPar(ctx, 'declaration.lire').filter((d) => dans(d.creeeLe)).map((d) => [
        d.reference, nom(d.groupementId), d.libelle, ref(d.provenanceId), ref(d.destinationId), d.etat ? labelOf(d.etat) : '', dateCsv(d.creeeLe), dateCsv(d.publieeLe),
      ]),
    };
  }
  if (type === 'demandes') {
    const declarations = new Map(depot('declaration').lisiblesPar(ctx, 'declaration.lire').map((d) => [d.id, d]));
    return {
      colonnes: ['Référence', 'Affréteur', 'Déclaration', 'Provenance', 'Destination', 'Départ prévu', 'Arrivée prévue', 'Carrosserie', 'Marchandises', 'Poids total (t)', 'État', 'Créée le'],
      lignes: depot('demande').lisiblesPar(ctx, 'demande.lire').filter((d) => dans(d.creeeLe)).map((d) => {
        const dec = declarations.get(d.declarationId);
        const lignes = Array.isArray(d.lignes) ? d.lignes : [];
        return [d.reference, nom(d.groupementId), dec?.reference ?? '', ref(dec?.provenanceId), ref(dec?.destinationId), dateCsv(d.departPrevu), dateCsv(d.arriveePrevue),
          ref(d.carrosserieId), [...new Set(lignes.map((l) => ref(l.produitId)).filter(Boolean))].join(', '),
          lignes.reduce((n, l) => n + (Number(l.poidsT) || 0), 0), d.etat ? labelOf(d.etat) : '', dateCsv(d.creeeLe)];
      }),
    };
  }
  return {
    colonnes: ['Nom', 'Qualité', 'Pour le compte de', 'Localité', 'État', 'Inscrit le'],
    lignes: intermediaires(ctx).filter((i) => dans(i.creeLe)).map((i) => [i.nom, i.role, i.mandant, ref(i.localiteId), labelOf(i.etat), dateCsv(i.creeLe)]),
  };
}

/**
 * Fichier CSV d'un export sur une période, inscrit au journal.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} type
 * @param {{du?: string, au?: string}} periode
 * @returns {{nom: string, contenu: string, lignes: number}}
 */
export function exporterCsv(ctx, type, periode = {}) {
  const { colonnes, lignes } = donneesExport(ctx, type, periode);
  const borne = (d) => d || 'ouverte';
  journaliser(ctx, EVENEMENT_AUDIT.EXPORT_CSV, {
    cibleType: type,
    details: `Export « ${EXPORTS[type].libelle} » du ${borne(periode.du)} au ${borne(periode.au)} (${lignes.length} lignes).`,
  });
  return {
    nom: `${type}-${periode.du || 'debut'}-${periode.au || 'aujourdhui'}.csv`,
    contenu: versCsv(colonnes, lignes),
    lignes: lignes.length,
  };
}
