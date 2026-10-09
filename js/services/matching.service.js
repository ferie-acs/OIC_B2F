/**
 * Service d'appariement — **le seul endroit où un état d'appariement change**.
 *
 * Exigence `M4.5` : aucune vue, aucun autre service ne modifie `appariement.etat`.
 * Vérifié en revue d'architecture.
 *
 * ## Partage avec `domain/matching.state.js`
 *
 * | `matching.state.js` (pur)   | Ici (orchestration)                      |
 * |-----------------------------|------------------------------------------|
 * | Transitions autorisées      | Lecture des soldes et des tarifs         |
 * | Gardes et motifs de refus   | Écriture des deux mouvements             |
 * | Qui a le droit d'agir       | Atomicité et isolation du commit         |
 * | Aucun effet de bord         | Journal d'audit, notifications, transport|
 *
 * ## Ce que la validation fait réellement
 *
 * Elle n'est pas une confirmation : **c'est une transaction financière**. Elle
 * vérifie les deux soldes, débite les deux comptes, crée le transport et libère
 * les coordonnées. Cinq collections sont écrites — tout ou rien.
 *
 * @module services/matching.service
 */

import { identifiant } from '../core/crypto.js';
import {
  ETAT_APPARIEMENT,
  ETAT_DEMANDE,
  ETAT_OFFRE,
  ETAPE_TRANSPORT,
  EVENEMENT_AUDIT,
  MOTIF_OPERATION,
  SENS_APPARIEMENT,
  SENS_OPERATION,
  CODE_TARIF,
} from '../domain/enums.js';
import { deciderSurAppariement, exiger, projeter } from '../domain/access.js';
import {
  ACTION,
  droitPourEngager,
  evaluerTransition,
} from '../domain/matching.state.js';
import { depot, stockageInterne } from '../repositories/index.js';
import { soldeDe } from './compte.service.js';
import { journaliser } from './audit.service.js';
import { notifier } from './notification.service.js';

/**
 * Erreur métier destinée à l'écran. Porte les motifs tels que la machine à états
 * les a formulés : ils sont rédigés pour être lus par l'utilisateur.
 */
export class RefusMetier extends Error {
  /** @param {string[]} motifs */
  constructor(motifs) {
    super(motifs.join(' '));
    this.name = 'RefusMetier';
    this.motifs = motifs;
  }
}

/**
 * Tarif en vigueur pour un code, lu au catalogue. **Jamais codé en dur**
 * (`03-specifications-ecrans.md` § H.2).
 * @param {string} code
 * @returns {number}
 */
function tarif(code) {
  const t = depot('tarif').brutParId(code);
  if (!t || !t.actif) {
    throw new Error(
      `Tarif « ${code} » absent du catalogue ou inactif. Le concessionnaire doit ` +
        'le renseigner avant qu\'une mise en relation puisse être validée.',
    );
  }
  return t.montant;
}

/**
 * Les deux fenêtres se recouvrent-elles ?
 * @param {Record<string, any>} offre
 * @param {Record<string, any>} demande
 * @returns {boolean}
 */
export function fenetresSeRecouvrent(offre, demande) {
  // QA-M4 : levait un TypeError sur une entrée absente. Une fenêtre qu'on ne
  // peut pas comparer ne recouvre rien — le refus est la réponse sûre.
  if (!offre?.disponibleDu || !demande?.departPrevu) return false;
  const od = new Date(offre.disponibleDu).getTime();
  const oa = new Date(offre.disponibleAu).getTime();
  const dd = new Date(demande.departPrevu).getTime();
  return od <= dd && dd <= oa;
}

/**
 * Contexte métier passé aux gardes de la machine à états.
 * @param {Record<string, any>} offre
 * @param {Record<string, any>} demande
 * @param {{destinataire?: string}} [options]
 */
function contexteMetier(offre, demande, options = {}) {
  const fa = tarif(CODE_TARIF.FRAIS_AFFRETEUR);
  const ft = tarif(CODE_TARIF.FRAIS_TRANSPORTEUR);
  const gAff = depot('groupement').brutParId(demande.groupementId);
  const gTra = depot('groupement').brutParId(offre.groupementId);

  return {
    offreDisponible:
      offre.etat === ETAT_OFFRE.DISPONIBLE || offre.etat === ETAT_OFFRE.RESERVEE,
    demandeOuverte:
      demande.etat === ETAT_DEMANDE.PUBLIEE || demande.etat === ETAT_DEMANDE.RESERVEE,
    fenetreRecouvrante: fenetresSeRecouvrent(offre, demande),
    soldeAffreteur: soldeDe(demande.groupementId),
    soldeTransporteur: soldeDe(offre.groupementId),
    fraisAffreteur: fa,
    fraisTransporteur: ft,
    nomAffreteur: gAff?.raisonSociale,
    nomTransporteur: gTra?.raisonSociale,
    destinataire: options.destinataire,
    ...options,
  };
}

/**
 * Ouvre un appariement entre une offre et une demande.
 *
 * Sens A : l'affréteur réserve une offre publiée. Sens B : le transporteur
 * propose un véhicule sur une demande publiée. Une seule machine, deux droits.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {{offreId: string, demandeId: string, sens?: string}} entree
 * @returns {Record<string, any>} L'appariement créé.
 */
export function engager(ctx, { offreId, demandeId, sens = SENS_APPARIEMENT.OFFRE_VERS_DEMANDE }) {
  const offre = depot('offre').brutParId(offreId);
  const demande = depot('demande').brutParId(demandeId);
  if (!offre || !demande) throw new RefusMetier(['Offre ou demande introuvable.']);

  exiger(ctx, droitPourEngager(sens), { groupementId: ctx.groupementId });

  // L'initiateur doit être partie prenante de l'objet qu'il engage.
  const attendu =
    sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE ? demande.groupementId : offre.groupementId;
  if (attendu !== ctx.groupementId) {
    throw new RefusMetier(["Vous ne pouvez engager que vos propres demandes ou offres."]);
  }

  // Invariant croisé `unSeulAppariementActifParOffre`.
  const actifs = depot('appariement').brutOu(
    (a) =>
      a.offreId === offreId &&
      (a.etat === ETAT_APPARIEMENT.RESERVER || a.etat === ETAT_APPARIEMENT.ACCEPTER),
  );
  if (actifs.length > 0) {
    throw new RefusMetier([
      'Ce véhicule fait déjà l’objet d’une réservation en cours. ' +
        'Il redeviendra disponible si elle est rejetée ou annulée.',
    ]);
  }

  const evaluation = evaluerTransition(null, ACTION.ENGAGER, contexteMetier(offre, demande));
  if (!evaluation.possible) throw new RefusMetier(evaluation.refus);

  const maintenant = new Date().toISOString();
  const stockage = stockageInterne();

  return stockage.transaction((tx) => {
    const appariement = depot('appariement').creer(
      {
        id: identifiant('app'),
        reference: reference('MR'),
        offreId,
        demandeId,
        groupementAffreteurId: demande.groupementId,
        groupementTransporteurId: offre.groupementId,
        sens,
        etat: ETAT_APPARIEMENT.RESERVER,
        reserveLe: maintenant,
        reserveParUtilisateurId: ctx.utilisateurId,
        demo: true,
      },
      { tx },
    );

    depot('offre').modifier(offreId, { etat: ETAT_OFFRE.RESERVEE }, { tx });
    depot('demande').modifier(demandeId, { etat: ETAT_DEMANDE.RESERVEE }, { tx });

    journaliser(ctx, EVENEMENT_AUDIT.APPARIEMENT_RESERVE, {
      cibleType: 'appariement',
      cibleId: appariement.id,
      details: `Mise en relation ${appariement.reference} ouverte.`,
      tx,
    });

    const destinataire =
      sens === SENS_APPARIEMENT.OFFRE_VERS_DEMANDE ? offre.groupementId : demande.groupementId;
    notifier(destinataire, EVENEMENT_AUDIT.APPARIEMENT_RESERVE, {
      code: 'appariement.reserve',
      params: { reference: appariement.reference },
      cibleType: 'appariement',
      cibleId: appariement.id,
      tx,
    });

    return appariement;
  });
}

/**
 * Répond à une réservation : acceptation ou rejet motivé.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @param {{accepte: boolean, motif?: string, precision?: string}} reponse
 * @returns {Record<string, any>}
 */
export function repondre(ctx, appariementId, { accepte, motif, precision }) {
  const a = charger(appariementId);
  const action = accepte ? ACTION.ACCEPTER : ACTION.REJETER;

  const decision = deciderSurAppariement(ctx, action, a);
  if (!decision.autorise) throw new RefusMetier([decision.explication]);

  const offre = depot('offre').brutParId(a.offreId);
  const demande = depot('demande').brutParId(a.demandeId);
  const evaluation = evaluerTransition(
    a.etat,
    action,
    contexteMetier(offre, demande, { motifRejet: motif }),
  );
  if (!evaluation.possible) throw new RefusMetier(evaluation.refus);

  const maintenant = new Date().toISOString();
  const stockage = stockageInterne();

  return stockage.transaction((tx) => {
    const maj = depot('appariement').modifier(
      appariementId,
      {
        etat: evaluation.vers,
        reponduLe: maintenant,
        reponduParUtilisateurId: ctx.utilisateurId,
        ...(accepte ? {} : { motifRejet: motif, precisionRejet: precision }),
      },
      { tx },
    );

    if (!accepte) {
      // L'offre et la demande redeviennent disponibles : un rejet ne doit pas
      // immobiliser un véhicule. C'est ce que la structure en colonnes du
      // système existant ne savait pas faire proprement.
      depot('offre').modifier(a.offreId, { etat: ETAT_OFFRE.DISPONIBLE }, { tx });
      depot('demande').modifier(a.demandeId, { etat: ETAT_DEMANDE.PUBLIEE }, { tx });
    }

    const evt = accepte
      ? EVENEMENT_AUDIT.APPARIEMENT_ACCEPTE
      : EVENEMENT_AUDIT.APPARIEMENT_REJETE;
    journaliser(ctx, evt, {
      cibleType: 'appariement',
      cibleId: appariementId,
      details: `Mise en relation ${a.reference} : ${accepte ? 'acceptée' : 'rejetée'}.`,
      tx,
    });
    notifier(a.groupementAffreteurId, evt, {
      code: accepte ? 'appariement.accepte' : 'appariement.rejete',
      params: { reference: a.reference, motif: motif ?? '' },
      cibleType: 'appariement',
      cibleId: appariementId,
      tx,
    });

    return maj;
  });
}

/**
 * Annule un appariement avant validation.
 *
 * Ouvert aux deux parties, et **aux auxiliaires** : l'annulation n'engage aucune
 * dépense (question U3, décision D37). Impossible après validation, pour tous.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @returns {Record<string, any>}
 */
export function annuler(ctx, appariementId) {
  const a = charger(appariementId);
  const decision = deciderSurAppariement(ctx, ACTION.ANNULER, a);
  if (!decision.autorise) throw new RefusMetier([decision.explication]);

  const evaluation = evaluerTransition(a.etat, ACTION.ANNULER, {});
  if (!evaluation.possible) throw new RefusMetier(evaluation.refus);

  const stockage = stockageInterne();
  return stockage.transaction((tx) => {
    const maj = depot('appariement').modifier(
      appariementId,
      {
        etat: ETAT_APPARIEMENT.ANNULER,
        annuleLe: new Date().toISOString(),
        annuleParUtilisateurId: ctx.utilisateurId,
      },
      { tx },
    );
    depot('offre').modifier(a.offreId, { etat: ETAT_OFFRE.DISPONIBLE }, { tx });
    depot('demande').modifier(a.demandeId, { etat: ETAT_DEMANDE.PUBLIEE }, { tx });

    journaliser(ctx, EVENEMENT_AUDIT.APPARIEMENT_ANNULE, {
      cibleType: 'appariement',
      cibleId: appariementId,
      details: `Mise en relation ${a.reference} annulée.`,
      tx,
    });
    const autre =
      ctx.groupementId === a.groupementAffreteurId
        ? a.groupementTransporteurId
        : a.groupementAffreteurId;
    notifier(autre, EVENEMENT_AUDIT.APPARIEMENT_ANNULE, {
      code: 'appariement.annule',
      params: { reference: a.reference },
      cibleType: 'appariement',
      cibleId: appariementId,
      tx,
    });
    return maj;
  });
}

/**
 * Clôt les réservations en attente sur une offre retirée du marché.
 *
 * **Ce service est le seul à modifier un état d'appariement** (exigence M4.5).
 * Le correctif QA-04 avait d'abord été écrit dans `flotte.service.js` — le
 * défaut y était — mais cela faisait de la règle d'appariement un mécanisme à
 * deux endroits, ce qui est exactement le défaut du système existant que le POC
 * corrige. La cause était dans le service de flotte, la règle appartient à
 * celui-ci.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} offreId
 * @param {any} tx Transaction ouverte par l'appelant : la clôture et le retrait
 *   de l'offre doivent être tout ou rien.
 * @returns {Array<Record<string, any>>} Les appariements clos.
 */
export function cloreSurRetraitOffre(ctx, offreId, tx) {
  const maintenant = new Date().toISOString();
  const enAttente = depot('appariement').brutOu(
    (a) => a.offreId === offreId && a.etat === ETAT_APPARIEMENT.RESERVER,
  );

  for (const a of enAttente) {
    tx.marquer(`appariements:${a.id}`);
    depot('appariement').modifier(
      a.id,
      {
        etat: ETAT_APPARIEMENT.ANNULER,
        annuleLe: maintenant,
        annuleParUtilisateurId: ctx.utilisateurId,
      },
      { tx },
    );
    // La demande retourne au marché : elle ne doit pas rester immobilisée.
    depot('demande').modifier(a.demandeId, { etat: ETAT_DEMANDE.PUBLIEE }, { tx });

    journaliser(ctx, EVENEMENT_AUDIT.APPARIEMENT_ANNULE, {
      cibleType: 'appariement',
      cibleId: a.id,
      details: `Mise en relation ${a.reference} close : l’offre a été retirée du marché.`,
      tx,
    });
    notifier(a.groupementAffreteurId, EVENEMENT_AUDIT.OFFRE_RETIREE, {
      code: 'offre.retiree.reservation',
      params: { reference: a.reference },
      cibleType: 'appariement',
      cibleId: a.id,
      tx,
    });
  }
  return enAttente;
}

/**
 * Prépare l'écran de validation : les deux soldes, les deux frais, le verdict.
 *
 * Ne modifie rien. Sert à afficher le registre de débit **avant** l'action
 * (décision D31 : aucune boîte « Êtes-vous sûr ? » masquant les montants), et à
 * capturer l'instantané de versions que `valider()` revérifiera.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @returns {{appariement: Record<string, any>, fraisAffreteur: number,
 *   fraisTransporteur: number, soldeUtilisateur: number, montantUtilisateur: number,
 *   soldeApresUtilisateur: number, utilisateurProvisionne: boolean,
 *   contrepartieProvisionnee: boolean, estTransporteur: boolean, possible: boolean,
 *   refus: string[], decision: import('../domain/access.js').Decision,
 *   attendu: Record<string, number>}}
 *   **Aucun solde de la contrepartie n'y figure** — décision D60.
 */
export function preparerValidation(ctx, appariementId) {
  const a = charger(appariementId);
  const offre = depot('offre').brutParId(a.offreId);
  const demande = depot('demande').brutParId(a.demandeId);

  const estTransporteur = ctx.groupementId === a.groupementTransporteurId;
  const destinataire = estTransporteur ? 'transporteur' : 'affreteur';
  const metier = contexteMetier(offre, demande, { destinataire });
  const evaluation = evaluerTransition(a.etat, ACTION.VALIDER, metier);
  const decision = deciderSurAppariement(ctx, ACTION.VALIDER, a);

  // Arbitrage QA-02 / décision D60. L'exigence UX D31 — « montrer les deux
  // débits avant d'agir » — et la matrice, qui refuse `compte.lire` sur le
  // compte d'autrui, se contredisaient : l'écran chiffrait à l'affréteur la
  // trésorerie exacte du transporteur.
  //
  // Ce qui est servi désormais :
  //   • les DEUX montants de CE dossier — ce sont les frais de cette
  //     transaction, pas des soldes de compte : D31 est tenue ;
  //   • le solde du compte de L'UTILISATEUR CONNECTÉ, et de lui seul ;
  //   • pour la contrepartie, un indicateur binaire « provisionnée ou non ».
  //
  // L'affréteur a besoin de savoir si la validation aboutira, pas de connaître
  // la trésorerie d'un partenaire — qui est souvent son fournisseur, et
  // parfois le fournisseur d'un concurrent.
  const soldeUtilisateur = estTransporteur ? metier.soldeTransporteur : metier.soldeAffreteur;
  const montantUtilisateur = estTransporteur ? metier.fraisTransporteur : metier.fraisAffreteur;
  const contrepartieProvisionnee = estTransporteur
    ? metier.soldeAffreteur >= metier.fraisAffreteur
    : metier.soldeTransporteur >= metier.fraisTransporteur;

  return {
    appariement: a,
    // Montants de la transaction — publics entre les deux parties.
    fraisAffreteur: metier.fraisAffreteur,
    fraisTransporteur: metier.fraisTransporteur,
    // Compte de l'utilisateur connecté, et de lui seul.
    soldeUtilisateur,
    montantUtilisateur,
    soldeApresUtilisateur: soldeUtilisateur - montantUtilisateur,
    utilisateurProvisionne: soldeUtilisateur >= montantUtilisateur,
    // Contrepartie : un état, jamais un chiffre.
    contrepartieProvisionnee,
    nomAffreteur: metier.nomAffreteur,
    nomTransporteur: metier.nomTransporteur,
    estTransporteur,
    possible: evaluation.possible && decision.autorise,
    refus: decision.autorise ? evaluation.refus : [decision.explication],
    decision,
    // Instantané **au grain de l'objet** (QA-07).
    //
    // Ce qui est surveillé, et pourquoi si peu : le versionnage répond à « une
    // donnée a-t-elle bougé ? », la garde répond à « ce qui a bougé rend-il ma
    // décision fausse ? ». Sur un solde, seule la seconde question compte.
    //
    //   • `appariements:<id>` — deux validations du MÊME dossier doivent entrer
    //     en conflit. C'est le scénario des deux onglets, éprouvé par la QA.
    //   • `tarifs` — si le catalogue change, le montant affiché à l'utilisateur
    //     n'est plus celui qui sera débité : sa décision porte sur autre chose.
    //
    // Le solde des comptes n'y figure **pas**, délibérément. Le surveiller
    // faisait échouer la validation de deux dossiers indépendants du même
    // affréteur (QA-07) alors que son compte couvrait largement les deux. La
    // protection contre le débit qui mettrait à découvert est ailleurs, et elle
    // est plus juste : `valider()` relit l'état DANS la transaction et
    // réévalue `soldeAffreteurSuffisant` sur le solde courant. Un verrou qui
    // refuse ce qu'il devrait laisser passer finit par être désactivé.
    attendu: stockageInterne().versions([`appariements:${appariementId}`, 'tarifs']),
  };
}

/**
 * **L'acte pivot du POC.** Valide la mise en relation : double débit, création
 * du transport, transmission des coordonnées.
 *
 * Tout ou rien : cinq collections sont écrites dans une transaction unique, et
 * l'instantané de versions garantit qu'aucune écriture concurrente n'a rendu la
 * décision périmée.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @param {{attendu?: Record<string, number>}} [options] Instantané rendu par
 *   `preparerValidation()`. **À fournir** : sans lui, seules les lectures faites
 *   dans la transaction sont protégées.
 * @returns {{appariement: Record<string, any>, transport: Record<string, any>}}
 */
export function valider(ctx, appariementId, options = {}) {
  const a = charger(appariementId);

  const decision = deciderSurAppariement(ctx, ACTION.VALIDER, a);
  if (!decision.autorise) throw new RefusMetier([decision.explication]);

  const stockage = stockageInterne();
  const maintenant = new Date().toISOString();

  return stockage.transaction(
    (tx) => {
      // Ce que cette transaction modifie réellement — au grain de l'objet, pour
      // que deux dossiers indépendants ne se bloquent pas (QA-07).
      tx.marquer(
        `appariements:${appariementId}`,
        `operations:${a.groupementAffreteurId}`,
        `operations:${a.groupementTransporteurId}`,
      );

      // Relecture DANS la transaction : l'état passé par l'appelant peut être
      // périmé (correctif S4, point 2 de l'audit).
      const frais = tx.lire('appariements').find((x) => x.id === appariementId);
      if (!frais || frais.etat !== ETAT_APPARIEMENT.ACCEPTER) {
        throw new RefusMetier([
          'Cette mise en relation n’est plus en attente de validation. ' +
            'Rechargez la page pour voir son état réel.',
        ]);
      }

      const offre = depot('offre').brutParId(a.offreId);
      const demande = depot('demande').brutParId(a.demandeId);
      const metier = contexteMetier(offre, demande, { destinataire: 'affreteur' });
      const evaluation = evaluerTransition(frais.etat, ACTION.VALIDER, metier);
      if (!evaluation.possible) throw new RefusMetier(evaluation.refus);

      // --- Les deux débits. Deux écritures, ou aucune. -------------------
      const opAffreteur = depot('operation').creer(
        {
          id: identifiant('ope'),
          groupementId: a.groupementAffreteurId,
          sens: SENS_OPERATION.DEBIT,
          montant: metier.fraisAffreteur,
          motif: MOTIF_OPERATION.FRAIS_MISE_EN_RELATION_AFFRETEUR,
          appariementId,
          libelle: `Frais de mise en relation — ${a.reference}`,
          horodatage: maintenant,
          auteurUtilisateurId: ctx.utilisateurId,
          demo: true,
        },
        { tx },
      );
      const opTransporteur = depot('operation').creer(
        {
          id: identifiant('ope'),
          groupementId: a.groupementTransporteurId,
          sens: SENS_OPERATION.DEBIT,
          montant: metier.fraisTransporteur,
          motif: MOTIF_OPERATION.FRAIS_MISE_EN_RELATION_TRANSPORTEUR,
          appariementId,
          libelle: `Frais de mise en relation — ${a.reference}`,
          horodatage: maintenant,
          auteurUtilisateurId: ctx.utilisateurId,
          demo: true,
        },
        { tx },
      );

      // --- L'appariement. Les montants sont FIGÉS ici (D45). ------------
      const appariement = depot('appariement').modifier(
        appariementId,
        {
          etat: ETAT_APPARIEMENT.VALIDER,
          valideLe: maintenant,
          valideParUtilisateurId: ctx.utilisateurId,
          fraisAffreteur: metier.fraisAffreteur,
          fraisTransporteur: metier.fraisTransporteur,
          operationAffreteurId: opAffreteur.id,
          operationTransporteurId: opTransporteur.id,
        },
        { tx },
      );

      depot('offre').modifier(a.offreId, { etat: ETAT_OFFRE.ENGAGEE }, { tx });
      depot('demande').modifier(a.demandeId, { etat: ETAT_DEMANDE.VALIDEE }, { tx });

      // --- Le transport. Il n'y a pas de transport sans mise en relation. -
      const transport = depot('transport').creer(
        {
          id: identifiant('tra'),
          appariementId,
          etape: ETAPE_TRANSPORT.VALIDE,
          journal: [
            {
              id: identifiant('evt'),
              type: 'etape',
              valeur: ETAPE_TRANSPORT.VALIDE,
              auteurUtilisateurId: ctx.utilisateurId,
              auteurGroupementId: ctx.groupementId,
              horodatage: maintenant,
            },
          ],
          demarreLe: maintenant,
          demo: true,
        },
        { tx },
      );

      journaliser(ctx, EVENEMENT_AUDIT.APPARIEMENT_VALIDE, {
        cibleType: 'appariement',
        cibleId: appariementId,
        // Aucun montant ici : le journal est lisible par la DGTTC, à qui la
        // classification financière est fermée.
        details: `Mise en relation ${a.reference} validée. Deux débits enregistrés.`,
        tx,
      });
      journaliser(ctx, EVENEMENT_AUDIT.COORDONNEES_TRANSMISES, {
        cibleType: 'appariement',
        cibleId: appariementId,
        details: `Coordonnées transmises aux deux parties — ${a.reference}.`,
        tx,
      });

      for (const g of [a.groupementAffreteurId, a.groupementTransporteurId]) {
        notifier(g, EVENEMENT_AUDIT.APPARIEMENT_VALIDE, {
          code: 'appariement.valide',
          params: { reference: a.reference },
          cibleType: 'appariement',
          cibleId: appariementId,
          tx,
        });
      }

      return { appariement, transport };
    },
    { attendu: options.attendu },
  );
}


/**
 * Fiche d'une mise en relation, **vérifiée et projetée**.
 *
 * Correctif QA-01. La vue lisait l'appariement en brut : un transporteur
 * étranger au dossier, en devinant son identifiant dans la barre d'adresse,
 * lisait les montants d'une transaction entre deux de ses concurrents. Les
 * coordonnées étaient bien closes — la projection les gouverne — mais les
 * montants, lus hors du verrou, échappaient à la classification `financier`.
 *
 * Le contrôle de partie prenante vit donc **ici**, dans le service, et la vue ne
 * reçoit plus que des objets projetés. C'est la réponse au point de contrôle
 * n° 1 de l'audit de sécurité : une lecture de dépôt passe par `decider()` puis
 * `projeter()`, jamais par un objet brut.
 *
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {string} appariementId
 * @returns {{autorise: false, motif: string} |
 *   {autorise: true, appariement: Record<string, any>, contrepartie: Record<string, any>|null,
 *    vehicule: Record<string, any>|null, chauffeur: Record<string, any>|null,
 *    coordonneesTransmises: boolean, etat: string}}
 */
export function ficheRelation(ctx, appariementId) {
  const a = depot('appariement').brutParId(appariementId);
  if (!a) return { autorise: false, motif: 'Mise en relation introuvable.' };

  const estAffreteur = a.groupementAffreteurId === ctx.groupementId;
  const estTransporteur = a.groupementTransporteurId === ctx.groupementId;
  if (!estAffreteur && !estTransporteur) {
    return {
      autorise: false,
      motif:
        'Cette mise en relation ne concerne pas votre groupement. Seules les deux ' +
        'parties y ont accès — montants compris.',
    };
  }

  const contrepartieId = estAffreteur ? a.groupementTransporteurId : a.groupementAffreteurId;
  const offre = depot('offre').brutParId(a.offreId);

  return {
    autorise: true,
    etat: a.etat,
    // Projeté : les montants ne sortent que pour un rôle dont la
    // classification `financier` est ouverte.
    appariement: projeter(ctx, 'appariement', a, { proprietaireId: ctx.groupementId }),
    contrepartie: depot('groupement').lire(ctx, contrepartieId, {
      proprietaireId: contrepartieId,
    }),
    vehicule: offre ? depot('vehicule').lire(ctx, offre.vehiculeId) : null,
    chauffeur: offre?.chauffeurPressentiId
      ? depot('chauffeur').lire(ctx, offre.chauffeurPressentiId)
      : null,
    coordonneesTransmises: a.etat === ETAT_APPARIEMENT.VALIDER,
  };
}

/**
 * Mises en relation visibles du contexte, projetées.
 * @param {import('../domain/access.js').Contexte} ctx
 * @param {(a: Record<string, any>) => boolean} [filtre]
 * @returns {Array<Record<string, any>>}
 */
export function mesAppariements(ctx, filtre = () => true) {
  exiger(ctx, 'appariement.lire', undefined);
  return depot('appariement')
    .brutOu(
      (a) =>
        (a.groupementAffreteurId === ctx.groupementId ||
          a.groupementTransporteurId === ctx.groupementId) &&
        filtre(a),
    )
    .map((a) => projeter(ctx, 'appariement', a, { proprietaireId: ctx.groupementId }))
    .sort((x, y) => new Date(y.reserveLe) - new Date(x.reserveLe));
}

/* ------------------------------------------------------------------ *
 * Utilitaires
 * ------------------------------------------------------------------ */

/**
 * @param {string} id
 * @returns {Record<string, any>}
 */
function charger(id) {
  const a = depot('appariement').brutParId(id);
  if (!a) throw new RefusMetier(['Mise en relation introuvable.']);
  return a;
}

/**
 * Référence lisible, du type `MR-2026-0007`.
 * @param {string} prefixe
 * @returns {string}
 */
export function reference(prefixe) {
  const collections = { MR: 'appariement', DF: 'declaration', DT: 'demande', OV: 'offre' };
  const n = depot(collections[prefixe]).brutTous().length + 1;
  return `${prefixe}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}
