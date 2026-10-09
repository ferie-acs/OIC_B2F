/**
 * Suivi du transport — six étapes, sans saut ni retour en arrière.
 *
 * Question U2 tranchée (décision D36) : `valide → a_quai → charge → en_route →
 * livre → cloture`. Le système existant ne formalise pas ces étapes (`etat_dmde`
 * y est flou) : **c'est un apport du POC, à signaler en démonstration**.
 *
 * Un incident s'inscrit au journal **sans changer l'étape en cours**.
 *
 * @module services/transport.service
 */

import { identifiant } from '../core/crypto.js';
import {
  ETAPE_TRANSPORT,
  EVENEMENT_AUDIT,
  NATURE_INCIDENT,
  ORDRE_ETAPES,
  etapeSuivanteValide,
  labelOf,
} from '../domain/enums.js';
import { exiger, projeter } from '../domain/access.js';
import { PORTEE } from '../domain/permissions.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { journaliser } from './audit.service.js';
import { notifier } from './notification.service.js';

/**
 * Étape immédiatement suivante, ou `null` si le transport est clôturé.
 * @param {string} etape
 * @returns {string|null}
 */
export function etapeSuivante(etape) {
  const i = ORDRE_ETAPES.indexOf(etape);
  return i >= 0 && i < ORDRE_ETAPES.length - 1 ? ORDRE_ETAPES[i + 1] : null;
}

/**
 * L'utilisateur peut-il faire avancer ce transport, et vers quoi ?
 *
 * Rend toujours un motif, même en cas de refus : une action interdite se
 * désactive **et s'explique** (décision D32).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {Record<string, any>} transport
 * @param {Record<string, any>} appariement
 * @returns {{possible: boolean, vers: string|null, motif: string|null}}
 */
export function avancementPossible(ctx, transport, appariement) {
  const vers = etapeSuivante(transport.etape);
  if (!vers) {
    return { possible: false, vers: null, motif: 'Ce transport est clôturé.' };
  }

  const estTransporteur = ctx.groupementId === appariement.groupementTransporteurId;
  const estAffreteur = ctx.groupementId === appariement.groupementAffreteurId;

  if (vers === ETAPE_TRANSPORT.CLOTURE) {
    // La clôture appartient à l'affréteur, et seulement après « livré ».
    if (!estAffreteur) {
      return {
        possible: false,
        vers,
        motif: "La clôture appartient à l'affréteur, après réception de la marchandise.",
      };
    }
    if (transport.etape !== ETAPE_TRANSPORT.LIVRE) {
      return {
        possible: false,
        vers,
        motif: 'La clôture n’est possible qu’une fois le transport livré.',
      };
    }
    const d = decide(ctx, 'transport.cloturer');
    return d.autorise
      ? { possible: true, vers, motif: null }
      : { possible: false, vers, motif: d.explication };
  }

  if (!estTransporteur) {
    return {
      possible: false,
      vers,
      motif: 'Les étapes du transport sont déclarées par le transporteur. Vous les constatez.',
    };
  }
  const d = decide(ctx, 'transport.avancer');
  return d.autorise
    ? { possible: true, vers, motif: null }
    : { possible: false, vers, motif: d.explication };
}

/**
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} droit
 */
function decide(ctx, droit) {
  try {
    return exiger(ctx, droit, { groupementId: ctx.groupementId });
  } catch (e) {
    return { autorise: false, explication: String(e.message).replace(/^Accès refusé \(.*?\) : /, '') };
  }
}

/**
 * Fait avancer le transport d'une étape.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} transportId
 * @param {{observation?: string}} [options]
 * @returns {Record<string, any>}
 */
export function avancer(ctx, transportId, options = {}) {
  const t = depot('transport').brutParId(transportId);
  if (!t) throw new Error('Transport introuvable.');
  const a = depot('appariement').brutParId(t.appariementId);

  const { possible, vers, motif } = avancementPossible(ctx, t, a);
  if (!possible) throw new Error(motif ?? 'Avancement impossible.');
  if (!etapeSuivanteValide(t.etape, vers)) {
    throw new Error('Aucun saut d’étape n’est possible.');
  }

  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    const maj = depot('transport').modifier(
      transportId,
      {
        etape: vers,
        clotureLe: vers === ETAPE_TRANSPORT.CLOTURE ? maintenant : undefined,
        journal: [
          ...t.journal,
          {
            id: identifiant('evt'),
            type: 'etape',
            valeur: vers,
            observation: options.observation,
            auteurUtilisateurId: ctx.utilisateurId,
            auteurGroupementId: ctx.groupementId,
            horodatage: maintenant,
          },
        ],
      },
      { tx },
    );

    journaliser(ctx, EVENEMENT_AUDIT.TRANSPORT_ETAPE, {
      cibleType: 'transport',
      cibleId: transportId,
      details: `Transport ${a.reference} : étape « ${labelOf(vers)} ».`,
      tx,
    });

    const autre =
      ctx.groupementId === a.groupementAffreteurId
        ? a.groupementTransporteurId
        : a.groupementAffreteurId;
    notifier(autre, EVENEMENT_AUDIT.TRANSPORT_ETAPE, {
      code: 'transport.etape',
      params: { reference: a.reference, etape: labelOf(vers) },
      cibleType: 'transport',
      cibleId: transportId,
      tx,
    });

    return maj;
  });
}

/**
 * Signale un incident. **L'étape en cours ne change pas** (spécification C.8).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} transportId
 * @param {{nature: string, description: string}} incident
 * @returns {Record<string, any>}
 */
export function signalerIncident(ctx, transportId, { nature, description }) {
  const t = depot('transport').brutParId(transportId);
  if (!t) throw new Error('Transport introuvable.');
  const a = depot('appariement').brutParId(t.appariementId);

  exiger(ctx, 'transport.incident', { groupementId: ctx.groupementId });
  if (!Object.values(NATURE_INCIDENT).includes(nature)) {
    throw new Error('Nature d’incident non répertoriée.');
  }
  if (!description) throw new Error('Une description est obligatoire.');

  const maintenant = new Date().toISOString();
  return stockageInterne().transaction((tx) => {
    const maj = depot('transport').modifier(
      transportId,
      {
        journal: [
          ...t.journal,
          {
            id: identifiant('evt'),
            type: 'incident',
            valeur: nature,
            observation: description,
            auteurUtilisateurId: ctx.utilisateurId,
            auteurGroupementId: ctx.groupementId,
            horodatage: maintenant,
          },
        ],
      },
      { tx },
    );
    journaliser(ctx, EVENEMENT_AUDIT.TRANSPORT_INCIDENT, {
      cibleType: 'transport',
      cibleId: transportId,
      details: `Incident signalé sur le transport ${a.reference}.`,
      tx,
    });
    const autre =
      ctx.groupementId === a.groupementAffreteurId
        ? a.groupementTransporteurId
        : a.groupementAffreteurId;
    notifier(autre, EVENEMENT_AUDIT.TRANSPORT_INCIDENT, {
      code: 'transport.incident',
      params: { reference: a.reference },
      cibleType: 'transport',
      cibleId: transportId,
      tx,
    });
    return maj;
  });
}

/**
 * Transports visibles du contexte, enrichis de leur appariement projeté.
 *
 * Le journal est projeté **par événement** : l'observation d'une partie n'est pas
 * servie à qui n'a pas de mise en relation validée avec son auteur (finding S1).
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @returns {Array<Record<string, any>>}
 */
export function transportsVisibles(ctx) {
  const { portee: porteeTransport } = exiger(ctx, 'transport.lire', undefined);

  const appariements = new Map(depot('appariement').brutTous().map((a) => [a.id, a]));

  return depot('transport')
    .brutTous()
    .filter((t) => {
      const a = appariements.get(t.appariementId);
      if (!a) return false;
      // QA-INST. La condition portait sur `groupementId == null`, jamais vraie :
      // concessionnaire et DGTTC ONT un groupement (`grp-oic`, `grp-dgttc`).
      // Ces rôles recevaient donc zéro transport — sans effet visible tant
      // qu'aucun écran de suivi ne leur était routé, mais le piège se refermait
      // dès qu'on leur en ouvrait un en J4. C'est la portée du droit qui fait
      // foi, pas une heuristique sur le rattachement.
      if (porteeTransport === PORTEE.TOUT) return true;
      return (
        a.groupementAffreteurId === ctx.groupementId ||
        a.groupementTransporteurId === ctx.groupementId
      );
    })
    .map((t) => {
      const a = appariements.get(t.appariementId);
      const contrepartie =
        ctx.groupementId === a.groupementAffreteurId
          ? a.groupementTransporteurId
          : a.groupementAffreteurId;
      return {
        ...projeter(ctx, 'transport', t, { proprietaireId: contrepartie }),
        appariement: projeter(ctx, 'appariement', a, { proprietaireId: contrepartie }),
        avancement: avancementPossible(ctx, t, a),
      };
    })
    .sort((a, b) => new Date(b.demarreLe) - new Date(a.demarreLe));
}
