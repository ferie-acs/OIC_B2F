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
import { EVENEMENT_AUDIT, STATUT_MANDAT, TYPE_GROUPEMENT, labelOf } from '../domain/enums.js';
import { statutMandat } from '../domain/mandat.js';
import { depot } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { dansPeriode, dateCsv, versCsv } from './export-csv.js';

/**
 * Qualité d'un intermédiaire selon le type de son mandant. Intégration b2 / b5 :
 * l'intermédiaire est une entreprise (`TYPE_GROUPEMENT.INTERMEDIAIRE`) désignée
 * par ses mandants ; les auxiliaires restent des utilisateurs internes d'un
 * groupement et ne sont plus comptés comme intermédiaires.
 */
const QUALITE_INTERMEDIAIRE = Object.freeze({
  [TYPE_GROUPEMENT.AFFRETEUR]: 'Intermédiaire de fret',
  [TYPE_GROUPEMENT.TRANSPORTEUR]: 'Intermédiaire de transport',
});

/** Libellés de référentiel, publics. */
function libelles() {
  const refs = new Map(depot('referentiel').brutTous().map((r) => [r.id, r.libelle]));
  return (id) => (id ? refs.get(id) ?? '' : '');
}

/**
 * Intermédiaires de fret inscrits et les entreprises pour le compte desquelles
 * ils agissent : une ligne par mandat en vigueur ou à venir, une ligne sans
 * mandant pour un intermédiaire qui n'en a pas. Identité seulement : ni courriel
 * ni téléphone, ni périmètre détaillé.
 * @param {import('../domain/access.js').Contexte} ctx
 */
export function intermediaires(ctx) {
  exiger(ctx, 'groupement.lire');
  const groupements = new Map(depot('groupement').lisiblesPar(ctx, 'groupement.lire').map((g) => [g.id, g]));
  const mandats = depot('mandat').brutOu((m) =>
    [STATUT_MANDAT.EN_VIGUEUR, STATUT_MANDAT.A_VENIR].includes(statutMandat(m)));
  /** @type {Array<Record<string, any>>} */
  const lignes = [];
  for (const g of groupements.values()) {
    if (g.type !== TYPE_GROUPEMENT.INTERMEDIAIRE) continue;
    const base = {
      groupementId: g.id,
      nom: g.raisonSociale || 'Identité non communiquée',
      localiteId: g.localiteId,
      etat: g.etat,
      creeLe: g.inscritLe ?? g.creeLe,
    };
    const siens = mandats.filter((m) => m.intermediaireGroupementId === g.id);
    if (siens.length === 0) {
      lignes.push({ ...base, id: g.id, role: 'Intermédiaire de fret', mandant: 'Aucun mandant en vigueur', mandantType: null });
    }
    for (const m of siens) {
      const mandant = groupements.get(m.mandantGroupementId);
      lignes.push({
        ...base,
        id: `${g.id}-${m.id}`,
        role: QUALITE_INTERMEDIAIRE[m.typeMandant] ?? 'Intermédiaire de fret',
        mandant: mandant?.raisonSociale || 'Entreprise non communiquée',
        mandantType: m.typeMandant,
      });
    }
  }
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.mandant.localeCompare(b.mandant, 'fr'));
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
  const vehicules = depot('vehicule').lisiblesPar(ctx, 'vehicule.lire').filter((v) => dans(v.creeLe));

  const parLocalite = new Map();
  const compter = (localiteId, cle) => {
    const nom = ref(localiteId) || 'Non renseignée';
    const ligne = parLocalite.get(nom) ?? { localite: nom, localiteId: localiteId || null, transporteurs: 0, affreteurs: 0, intermediaires: 0, vehicules: 0 };
    ligne[cle] += 1;
    parLocalite.set(nom, ligne);
  };
  // Intégration b2 / b5 : l'intermédiaire de fret est une entreprise, compté à part.
  const categorie = (g) => (g.type === TYPE_GROUPEMENT.TRANSPORTEUR ? 'transporteurs'
    : g.type === TYPE_GROUPEMENT.INTERMEDIAIRE ? 'intermediaires' : 'affreteurs');
  for (const g of acteurs) compter(g.localiteId, categorie(g));
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
      affreteurs: acteurs.filter((g) => categorie(g) === 'affreteurs').length,
      intermediaires: acteurs.filter((g) => categorie(g) === 'intermediaires').length,
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
