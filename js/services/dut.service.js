/** Fiches DUT locales du POC : un instantané par mise en relation validée. */
import { decider, exiger, projeter } from '../domain/access.js';
import { ETAT_APPARIEMENT, EVENEMENT_AUDIT } from '../domain/enums.js';
import { PORTEE } from '../domain/permissions.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';

const ETATS_DOSSIER = new Set([ETAT_APPARIEMENT.ACCEPTER, ETAT_APPARIEMENT.VALIDER]);
const appartient = (ctx, a) => ctx.groupementId != null &&
  [a.groupementTransporteurId, a.groupementAffreteurId].includes(ctx.groupementId);
const projeterDut = (ctx, d, a) => projeter(ctx, 'dut', d, { proprietaireId: a.groupementTransporteurId });

/** Vérifie les liens avant de constituer l'instantané ; aucun lien arbitraire. */
function sourcesDe(a) {
  const offre = depot('offre').brutParId(a.offreId);
  const demande = depot('demande').brutParId(a.demandeId);
  const declaration = demande && depot('declaration').brutParId(demande.declarationId);
  const vehicule = offre && depot('vehicule').brutParId(offre.vehiculeId);
  const transporteur = depot('groupement').brutParId(a.groupementTransporteurId);
  const affreteur = depot('groupement').brutParId(a.groupementAffreteurId);
  const chauffeur = offre?.chauffeurPressentiId ? depot('chauffeur').brutParId(offre.chauffeurPressentiId) : null;
  if (!offre || !demande || !declaration || !vehicule || !transporteur || !affreteur) {
    return { motif: 'Le dossier est incomplet : vérifiez l’offre, le fret, le véhicule et les deux entreprises.' };
  }
  if (offre.groupementId !== a.groupementTransporteurId || vehicule.groupementId !== a.groupementTransporteurId ||
      demande.groupementId !== a.groupementAffreteurId || declaration.groupementId !== a.groupementAffreteurId) {
    return { motif: 'Les éléments de ce dossier ne correspondent pas aux parties de la mise en relation.' };
  }
  if (offre.chauffeurPressentiId && (!chauffeur || chauffeur.groupementId !== a.groupementTransporteurId)) {
    return { motif: 'Le chauffeur choisi pour ce trajet ne fait pas partie de l’équipe du transporteur.' };
  }
  return { offre, demande, declaration, vehicule, transporteur, affreteur, chauffeur, motif: null };
}

function motifGeneration(ctx, a) {
  const droit = decider(ctx, 'dut.generer', { groupementId: a.groupementTransporteurId });
  if (!droit.autorise) return droit.explication;
  if (ctx.groupementId !== a.groupementTransporteurId) return 'Seule l’équipe du transporteur concerné peut générer cette fiche.';
  if (a.etat !== ETAT_APPARIEMENT.VALIDER) return 'La mise en relation doit être validée par l’affréteur avant de générer le DUT.';
  return null;
}

/** L'aperçu ne possède ni référence officielle locale ni métadonnées de génération. */
function apercuDe(ctx, a, sources) {
  if (sources.motif) return null;
  const lire = nom => sources[nom] ? projeter(ctx, nom, sources[nom]) : null;
  const offre = lire('offre');
  const demande = lire('demande');
  const declaration = lire('declaration');
  const vehicule = lire('vehicule');
  const chauffeur = lire('chauffeur');
  const transporteur = projeter(ctx, 'groupement', sources.transporteur);
  const affreteur = projeter(ctx, 'groupement', sources.affreteur);
  const localite = id => depot('referentiel').brutParId(id)?.libelle || 'Non renseignée';
  const nomsMarchandises = [...new Set((demande.lignes || []).map(l => depot('referentiel').brutParId(l.produitId)?.libelle).filter(Boolean))];
  const donnees = {
    corridor: `${localite(declaration.provenanceId)} → ${localite(declaration.destinationId)}`,
    departPrevu: demande.departPrevu,
    arriveePrevue: demande.arriveePrevue,
    marchandise: declaration.libelle || nomsMarchandises.join(', '),
    poidsTotalT: (demande.lignes || []).reduce((total, l) => total + (Number(l.poidsT) || 0), 0),
    transporteurRaisonSociale: transporteur.raisonSociale,
    affreteurRaisonSociale: affreteur.raisonSociale,
    immatriculation: vehicule.immatriculation,
    carteTransportNumero: vehicule.carteTransportNumero,
    carteGrise: vehicule.carteGrise,
    chauffeurNom: chauffeur?.nom,
    chauffeurPermisNumero: chauffeur?.permisNumero,
    chauffeurTelephone: chauffeur?.telephone,
    transporteurTelephone: transporteur.contactTelephone,
    transporteurEmail: transporteur.contactEmail,
  };
  // Le même identifiant que l'appariement produit la clé libérée `dut:${a.id}`.
  return projeterDut(ctx, {
    id: a.id, reference: '', appariementId: a.id, offreId: offre.id,
    donnees: Object.fromEntries(Object.entries(donnees).filter(([, v]) => v != null)), demo: true,
  }, a);
}

/**
 * Les parties voient leurs dossiers acceptés/validés ; les lecteurs globaux ne
 * voient que les fiches déjà générées. La portée DUT ne donne aucun accès au
 * journal de transport lorsque le rôle ne possède pas `transport.lire`.
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<{appariement:Object,transport:Object|null,document:Object|null,apercu:Object|null,generable:boolean,motif:string|null}>}
 */
export function dossiersDut(ctx) {
  const { portee } = exiger(ctx, 'dut.lire');
  const documents = new Map(depot('dut').brutTous().map(d => [d.appariementId, d]));
  const transports = new Map(depot('transport').brutTous().map(t => [t.appariementId, t]));
  const lectureGlobale = portee === PORTEE.TOUT;
  return depot('appariement').brutTous()
    .filter(a => lectureGlobale ? documents.has(a.id) : appartient(ctx, a) && ETATS_DOSSIER.has(a.etat))
    .map(a => {
      const documentBrut = documents.get(a.id);
      const document = documentBrut ? projeterDut(ctx, documentBrut, a) : null;
      const sources = document ? null : sourcesDe(a);
      const motif = document ? 'Cette fiche a déjà été générée. Vous pouvez la consulter ou l’imprimer.'
        : motifGeneration(ctx, a) || sources.motif;
      const droitTransport = decider(ctx, 'transport.lire', { groupementId: appartient(ctx, a) ? ctx.groupementId : a.groupementTransporteurId });
      const t = droitTransport.autorise ? transports.get(a.id) : null;
      return {
        appariement: projeter(ctx, 'appariement', a, { proprietaireId: a.groupementTransporteurId }),
        transport: t ? projeter(ctx, 'transport', t, { proprietaireId: a.groupementTransporteurId }) : null,
        document,
        apercu: document || apercuDe(ctx, a, sources),
        generable: !document && !motif,
        motif,
      };
    })
    .sort((a, b) => new Date(b.document?.genereLe || b.appariement.valideLe || b.appariement.reserveLe)
      - new Date(a.document?.genereLe || a.appariement.valideLe || a.appariement.reserveLe));
}

/**
 * Génère une seule fiche locale et son audit, sans paiement ni appel externe.
 * Un second appel autorisé retourne l'instantané existant, jamais un duplicata.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @returns {Object} DUT projeté selon le rôle de l'appelant.
 */
export function genererDut(ctx, appariementId) {
  const a = depot('appariement').brutParId(appariementId);
  if (!a) throw new Error('Mise en relation introuvable.');
  exiger(ctx, 'dut.generer', { groupementId: a.groupementTransporteurId });
  const refus = motifGeneration(ctx, a);
  if (refus) throw new Error(refus);
  const existant = depot('dut').brutOu(d => d.appariementId === a.id)[0];
  if (existant) return projeterDut(ctx, existant, a);
  const sources = sourcesDe(a);
  if (sources.motif) throw new Error(sources.motif);
  const apercu = apercuDe(ctx, a, sources);
  return stockageInterne().transaction(tx => {
    const dejaCree = tx.lire('duts').find(d => d.appariementId === a.id);
    if (dejaCree) return projeterDut(ctx, dejaCree, a);
    const document = depot('dut').creer({
      ...apercu, reference: `DUT-${a.reference}`,
      genereLe: new Date().toISOString(), genereParUtilisateurId: ctx.utilisateurId,
    }, { tx });
    journaliser(ctx, EVENEMENT_AUDIT.DUT_GENERE, {
      cibleType: 'dut', cibleId: document.id,
      details: 'Fiche DUT générée depuis une mise en relation validée.', tx,
    });
    return projeterDut(ctx, document, a);
  });
}
