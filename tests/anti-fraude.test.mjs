/**
 * Les cinq correctifs anti-fraude du 13/10/2026, éprouvés un par un.
 *
 * 1. **Masquage de l'identité** avant validation — raison sociale, RCCM et
 *    immatriculation ne sont plus servis à la contrepartie, et les champs libres
 *    lus avant validation refusent les coordonnées.
 * 2. **Avis après clôture** — une note par partie et par transport clôturé ; le
 *    profil de confiance ne sert que des agrégats.
 * 3. **Vérification des transporteurs** — sans contrôle des pièces, ni
 *    publication, ni proposition, ni acceptation, ni validation.
 * 4. **Expiration** des appariements en attente au-delà de 48 h.
 * 5. **Quatre yeux** sur le crédit d'un compte : saisie et validation par deux
 *    personnes distinctes, après rapprochement.
 *
 * Chaque bloc pose le cas nominal ET la tentative de fraude, qui doit échouer.
 * Les services tournent sous Node, en mémoire ; les écrans sur le mini-DOM.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

// Web Crypto et sessionStorage, que le code attend du navigateur.
if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;
const memoireSession = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoireSession.has(k) ? memoireSession.get(k) : null),
  setItem: (k, v) => void memoireSession.set(k, v),
  removeItem: (k) => void memoireSession.delete(k),
};

// Le mini-DOM doit précéder le chargement des vues.
const { installerDom, texteDe } = await import('./helpers/mini-dom.mjs');
installerDom();

const { backendMemoire } = await import('../js/core/storage.js');
const { initialiserPersistance, depot } = await import('../js/repositories/index.js');
const { amorcer, MOT_DE_PASSE_DEMO } = await import('../js/seed.js');
const { connecter, contexteDe } = await import('../js/services/auth.service.js');
const matching = await import('../js/services/matching.service.js');
const compte = await import('../js/services/compte.service.js');
const flotte = await import('../js/services/flotte.service.js');
const fret = await import('../js/services/fret.service.js');
const transportSvc = await import('../js/services/transport.service.js');
const verification = await import('../js/services/verification.service.js');
const avisSvc = await import('../js/services/avis.service.js');
const { cataloguePublic } = await import('../js/services/marche-public.service.js');
const { CONTEXTE_PLATEFORME } = await import('../js/services/audit.service.js');
const { contientCoordonnees, refuserCoordonnees } = await import('../js/domain/texte.js');
const { identiteLiberee, decider, deciderSurAppariement } = await import('../js/domain/access.js');
const { MATRICE, peutLireClassification } = await import('../js/domain/permissions.js');
const { entite } = await import('../js/domain/schema.js');
const {
  ACTION,
  GARDES,
  PARTIE,
  delaiDepasse,
  echeanceDe,
  evaluerTransition,
  partieHabilitee,
} = await import('../js/domain/matching.state.js');
const {
  DELAIS_APPARIEMENT,
  ETAPE_TRANSPORT,
  ETAT_APPARIEMENT,
  ETAT_CREDIT,
  ETAT_VERIFICATION,
  MOTIF_CLOTURE,
  MOTIF_REJET,
  PIECE_DOSSIER,
  SENS_APPARIEMENT,
} = await import('../js/domain/enums.js');
const { nomDe, immatriculationDe } = await import('../js/views/_donnees.js');
const vueAffreteur = await import('../js/views/affreteur.js');
const vueTransporteur = await import('../js/views/transporteur.js');
const { verifications: vueVerifications } = await import('../js/views/verifications.js');

/* ------------------------------------------------------------------ *
 * Outillage
 * ------------------------------------------------------------------ */

const HEURE = 3600000;
const NOM_TRA_1 = 'Trans Lagunes DÉMO';
const PLAQUE_VEH_1 = '1234 AB 01';
const PLAQUE_VEH_2 = '5678 CD 01';
const NOM_AFF_1 = 'Cacao Lagunes Export DÉMO';
const NOM_TRA_3 = 'Nouvelle Route Transport DÉMO';
const TOUTES_PIECES = Object.values(PIECE_DOSSIER);

/** Horodatage ISO décalé de `h` heures par rapport à maintenant. */
const dansHeures = (h) => new Date(Date.now() + h * HEURE).toISOString();

/** Contexte d'un utilisateur du jeu, recalculé à chaque appel (objetsLiberes à jour). */
const ctxDe = (id) => contexteDe(depot('utilisateur').brutParId(id));

/** Installe un jeu de démonstration neuf, en mémoire. */
async function installer() {
  initialiserPersistance({ backend: backendMemoire() });
  await amorcer();
}

/** Réserve `off-1` pour `dem-1` (affréteur u-aff-1). */
const reserverOff1 = () =>
  matching.engager(ctxDe('u-aff-1'), { offreId: 'off-1', demandeId: 'dem-1' });

/** Réserve, fait accepter, valide `off-1`/`dem-1`. Retourne l'appariement et le transport. */
function validerOff1() {
  const ap = reserverOff1();
  matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true });
  const p = matching.preparerValidation(ctxDe('u-aff-1'), ap.id);
  assert.equal(p.possible, true, `validation impossible : ${p.refus.join(' ')}`);
  return matching.valider(ctxDe('u-aff-1'), ap.id, { attendu: p.attendu });
}

/** Saisie complète d'un véhicule existant, prête à être modifiée. */
function saisieVehicule(id, modifs = {}) {
  const v = depot('vehicule').brutParId(id);
  return {
    immatriculation: v.immatriculation,
    carteGrise: v.carteGrise,
    capaciteT: v.capaciteT,
    ptacT: v.ptacT,
    carrosserieId: v.carrosserieId,
    essieuxId: v.essieuxId,
    carteTransportNumero: v.carteTransportNumero,
    carteTransportEcheance: v.carteTransportEcheance,
    paysImmatriculation: v.paysImmatriculation ?? 'Côte d’Ivoire',
    prixKmT: v.prixKmT,
    ...modifs,
  };
}

/** Saisie complète d'un chauffeur existant, prête à être modifiée. */
function saisieChauffeur(id, modifs = {}) {
  const c = depot('chauffeur').brutParId(id);
  return {
    nom: c.nom,
    permisNumero: c.permisNumero,
    permisEcheance: c.permisEcheance,
    telephone: c.telephone,
    ...modifs,
  };
}

/** Saisie d'une offre sur le corridor Abidjan → Bouaké, compatible avec `dem-1`. */
const saisieOffre = (vehiculeId, chauffeurPressentiId = null) => ({
  vehiculeId,
  chauffeurPressentiId,
  localiteDepartId: 'loc-abidjan',
  localiteArriveeId: 'loc-bouake',
  disponibleDu: dansHeures(24),
  disponibleAu: dansHeures(12 * 24),
  prixKmT: 90,
});

/** Saisie minimale d'un fret publiable. */
const saisieFret = ({ libelle = 'Cacao en fèves — lot DÉMO', observation, contraintes } = {}) => ({
  fret: { libelle, observation, provenanceId: 'loc-san-pedro', destinationId: 'loc-abidjan' },
  besoin: {
    departPrevu: dansHeures(3 * 24),
    arriveePrevue: dansHeures(4 * 24),
    capaciteId: 'cap-25',
    carrosserieId: 'car-plateau',
    contraintes,
  },
  lignes: [{ produitId: 'sh-1801', poidsT: 20 }],
});

/** L'erreur levée par `fn`, pour inspecter ses motifs. */
function erreurDe(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  assert.fail('une erreur était attendue');
}

/** Identifiants des offres visibles par l'affréteur sur le marché. */
const offresAuMarche = () => flotte.chercherVehicules(ctxDe('u-aff-1')).map((o) => o.id);
/** Identifiants des camions du catalogue public. */
const offresAuCatalogue = () =>
  cataloguePublic().filter((x) => x.type === 'camions').map((x) => x.id);

/* ================================================================== *
 * N° 1 — Masquage de l'identité avant validation
 * ================================================================== */

describe('Anti-fraude n° 1 — l’identité n’est servie qu’après validation', () => {
  before(installer);

  it('la projection retire raison sociale et RCCM du transporteur à l’affréteur', () => {
    const g = depot('groupement').lire(ctxDe('u-aff-1'), 'grp-tra-1', { proprietaireId: 'grp-tra-1' });
    assert.equal('raisonSociale' in g, false, 'raison sociale servie avant validation');
    assert.equal('rccm' in g, false, 'RCCM servi avant validation');
    assert.equal('carteTransporteurNumero' in g, false);
    assert.equal(g.verificationEtat, ETAT_VERIFICATION.VERIFIE, 'le signal de vérification reste public');
  });

  it('la projection retire l’immatriculation du véhicule à l’affréteur', () => {
    const v = depot('vehicule').lire(ctxDe('u-aff-1'), 'veh-1');
    assert.equal('immatriculation' in v, false, 'plaque servie avant validation');
    assert.ok(v.capaciteT, 'la capacité reste un critère de choix');
  });

  it('le transporteur ne voit pas davantage le nom de l’affréteur', () => {
    const g = depot('groupement').lire(ctxDe('u-tra-1'), 'grp-aff-1', { proprietaireId: 'grp-aff-1' });
    assert.equal('raisonSociale' in g, false);
    assert.match(nomDe(ctxDe('u-tra-1'), 'grp-aff-1'), /^Affréteur A-[0-9A-Z]{4}$/);
  });

  it('le propriétaire lit sa propre identité', () => {
    const g = depot('groupement').lire(ctxDe('u-tra-1'), 'grp-tra-1', { proprietaireId: 'grp-tra-1' });
    assert.equal(g.raisonSociale, NOM_TRA_1);
    assert.equal(nomDe(ctxDe('u-tra-1'), 'grp-tra-1'), NOM_TRA_1);
    assert.equal(immatriculationDe(ctxDe('u-tra-1'), 'veh-1'), PLAQUE_VEH_1);
  });

  it('les rôles institutionnels (concessionnaire, DGTTC) conservent l’identité', () => {
    for (const id of ['u-conc', 'u-dgttc']) {
      const ctx = ctxDe(id);
      const g = depot('groupement').lire(ctx, 'grp-tra-1', { proprietaireId: 'grp-tra-1' });
      assert.equal(g.raisonSociale, NOM_TRA_1, `${id} doit lire la raison sociale`);
      assert.equal(nomDe(ctx, 'grp-tra-1'), NOM_TRA_1);
      assert.equal(immatriculationDe(ctx, 'veh-1'), PLAQUE_VEH_1);
      assert.equal(identiteLiberee(ctx, 'groupement:grp-tra-1', 'grp-tra-1'), true);
    }
  });

  it('nomDe rend un alias stable et non identifiant, distinct d’un transporteur à l’autre', () => {
    const ctx = ctxDe('u-aff-1');
    const alias1 = nomDe(ctx, 'grp-tra-1');
    const alias2 = nomDe(ctx, 'grp-tra-2');
    assert.match(alias1, /^Transporteur T-[0-9A-Z]{4}$/);
    assert.match(alias2, /^Transporteur T-[0-9A-Z]{4}$/);
    assert.equal(nomDe(ctx, 'grp-tra-1'), alias1, 'alias instable d’un appel à l’autre');
    assert.notEqual(alias1, alias2, 'deux transporteurs confondus sous le même alias');
    assert.ok(!alias1.includes('Lagunes') && !alias1.includes('grp-tra'));
    assert.equal(immatriculationDe(ctx, 'veh-1'), 'Communiquée à la validation');
    assert.equal(nomDe(ctx, 'grp-inexistant'), '—');
  });

  it('identiteLiberee refuse un propriétaire inconnu plutôt que de deviner', () => {
    const ctx = ctxDe('u-aff-1');
    assert.equal(identiteLiberee(ctx, 'groupement:grp-tra-1', null), false);
    assert.equal(identiteLiberee(ctx, 'groupement:grp-tra-1', undefined), false);
    assert.equal(identiteLiberee({ roleId: 'affreteur', groupementId: 'grp-aff-1' }, 'vehicule:veh-1', 'grp-tra-1'), false);
  });

  it('le marché sert la confiance à la place du nom — et rien qui identifie', () => {
    const resultats = flotte.chercherVehicules(ctxDe('u-aff-1'));
    assert.ok(resultats.length > 0, 'marché vide');
    for (const o of resultats) {
      assert.equal('raisonSociale' in o.groupement, false);
      assert.equal('rccm' in o.groupement, false);
      assert.equal('immatriculation' in o.vehicule, false);
      assert.deepEqual(
        Object.keys(o.confiance).sort(),
        ['membreDepuis', 'nombreAvis', 'note', 'transportsRealises', 'type', 'verifie'],
      );
    }
    const brut = JSON.stringify(resultats);
    for (const interdit of [NOM_TRA_1, 'Routière du Centre', PLAQUE_VEH_1, PLAQUE_VEH_2, 'CI-DEMO-2019-T-0042']) {
      assert.ok(!brut.includes(interdit), `« ${interdit} » servi sur le marché`);
    }
  });

  it('après validation, les deux parties lisent l’identité de la contrepartie — et d’elle seule', () => {
    validerOff1();
    const aff = ctxDe('u-aff-1'); // reconstruit : objetsLiberes à jour
    const tra = ctxDe('u-tra-1');
    assert.equal(nomDe(aff, 'grp-tra-1'), NOM_TRA_1);
    assert.equal(immatriculationDe(aff, 'veh-1'), PLAQUE_VEH_1);
    assert.equal(nomDe(tra, 'grp-aff-1'), NOM_AFF_1);
    // Un véhicule du même transporteur, hors de cette mise en relation, reste masqué.
    assert.equal(immatriculationDe(aff, 'veh-2'), 'Communiquée à la validation');
    // Un tiers reste masqué.
    assert.match(nomDe(aff, 'grp-tra-2'), /^Transporteur T-/);
    // Un autre affréteur ne profite pas de la libération.
    assert.match(nomDe(ctxDe('u-aff-2'), 'grp-tra-1'), /^Transporteur T-/);
  });
});

describe('Anti-fraude n° 1 — les champs libres refusent les coordonnées', () => {
  before(installer);

  const COORDONNEES = [
    'Appelez le 07 07 07 07 07',
    'Contact : +225 0707070707',
    'joindre au 07-07-07-07-07',
    'écrire à contact@exemple.ci',
    'wa.me/2250707070707',
    'Passez par WhatsApp',
    'https://t.me/transport',
    'voir www.exemple.ci',
  ];
  const TEXTES_SAINS = [
    'Départ le 2026-10-13, arrivée le 2026-10-14',
    'Livraison du 13/10/2026 au 20/10/2026',
    'Chargement le 13.10.2026',
    'Bâches obligatoires. Chargement à quai entre 7 h et 12 h.',
    '22 t, 440 sacs de 50 kg',
    'Poids total 24 000 kg',
    '',
    null,
    undefined,
  ];

  for (const t of COORDONNEES) {
    it(`détecte une coordonnée : « ${t} »`, () => {
      assert.equal(contientCoordonnees(t), true);
      assert.throws(() => refuserCoordonnees(t, 'Champ'), /« Champ » ne peut pas contenir/);
    });
  }

  for (const t of TEXTES_SAINS) {
    it(`laisse passer un texte sans coordonnée : ${JSON.stringify(t)}`, () => {
      assert.equal(contientCoordonnees(t), false);
      assert.doesNotThrow(() => refuserCoordonnees(t, 'Champ'));
    });
  }

  // Deux défauts relevés par la première version de cette suite, corrigés dans
  // `domain/texte.js` : années courtes prises pour des dates, références prises
  // pour des numéros.
  it('détecte un numéro écrit avec des points ou des barres obliques', () => {
    for (const t of ['Tél. 07.07.07.07.07', '+225 07.07.07.07.07', '07/07/07/07/07', '27.21.35.48.90']) {
      assert.equal(contientCoordonnees(t), true, `« ${t} » non détecté`);
    }
  });

  it('laisse passer une référence de la plateforme et les dates usuelles', () => {
    for (const t of [
      'Déjà engagé sur MR-2026-0004',
      'Voir la demande DT-2026-0001',
      'Départ 2026-10-13T08:00',
      'Livraison le 13-10-2026',
    ]) {
      assert.equal(contientCoordonnees(t), false, `« ${t} » refusé à tort`);
    }
  });

  it('refuse une référence d’encaissement déjà servie, quels que soient les séparateurs', () => {
    const conc = ctxDe('u-conc');
    for (const variante of ['ENC.DEMO.1004', 'enc_demo_1004', 'ENC/DEMO/1004', 'ENC–DEMO–1004']) {
      assert.throws(
        () => compte.saisirCredit(conc, { groupementId: 'grp-aff-1', montant: 1000, referenceEncaissement: variante }),
        /a déjà servi/,
        `« ${variante} » accepté comme nouvelle référence`,
      );
    }
  });

  it('publierFret refuse un numéro dans le libellé', () => {
    assert.throws(
      () => fret.publierFret(ctxDe('u-aff-1'), saisieFret({ libelle: 'Cacao — appelez le 07 07 07 07 07' })),
      /Libellé du fret/,
    );
  });

  it('publierFret refuse une adresse électronique dans l’observation', () => {
    assert.throws(
      () => fret.publierFret(ctxDe('u-aff-1'), saisieFret({ observation: 'Écrire à logistique@cacao.ci' })),
      /Observation/,
    );
  });

  it('publierFret refuse un lien de messagerie dans les contraintes', () => {
    assert.throws(
      () => fret.publierFret(ctxDe('u-aff-1'), saisieFret({ contraintes: 'Coordination par wa.me/22507' })),
      /Contraintes/,
    );
  });

  it('le refus vaut aussi pour un brouillon, et rien n’est créé', () => {
    const avant = depot('demande').brutTous().length;
    assert.throws(
      () =>
        fret.publierFret(ctxDe('u-aff-1'), saisieFret({ libelle: 'Lot 07 07 07 07 07' }), { brouillon: true }),
      /Libellé du fret/,
    );
    assert.equal(depot('demande').brutTous().length, avant, 'une demande a été créée malgré le refus');
  });

  it('publierFret accepte des contraintes datées au format ISO', () => {
    const { demande } = fret.publierFret(
      ctxDe('u-aff-1'),
      saisieFret({ contraintes: 'Quai disponible le 2026-10-13 de 7 h à 12 h.' }),
    );
    assert.equal(demande.etat, 'publiee');
  });

  it('repondre refuse une précision de rejet portant un numéro — et l’appariement reste en attente', () => {
    const ap = reserverOff1();
    const e = erreurDe(() =>
      matching.repondre(ctxDe('u-tra-1'), ap.id, {
        accepte: false,
        motif: MOTIF_REJET.DATES_INCOMPATIBLES,
        precision: 'Rappelez-moi au +225 07 07 07 07 07',
      }),
    );
    assert.equal(e.name, 'RefusMetier');
    assert.match(e.message, /Précision/);
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.RESERVER);
    assert.equal(depot('appariement').brutParId(ap.id).precisionRejet, undefined);
  });

  it('repondre accepte une précision sans coordonnée', () => {
    const ap = depot('appariement').brutOu((a) => a.etat === ETAT_APPARIEMENT.RESERVER)[0];
    const maj = matching.repondre(ctxDe('u-tra-1'), ap.id, {
      accepte: false,
      motif: MOTIF_REJET.DATES_INCOMPATIBLES,
      precision: 'Camion indisponible avant le 2026-10-20.',
    });
    assert.equal(maj.etat, ETAT_APPARIEMENT.REJETER);
  });
});

describe('Anti-fraude n° 1 — ce que les écrans affichent avant et après validation', () => {
  /** @type {string} */ let appariementId;

  before(async () => {
    await installer();
    const ap = reserverOff1();
    matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true });
    appariementId = ap.id;
  });

  it('le marché de l’affréteur n’affiche ni raison sociale ni plaque', () => {
    const t = texteDe(vueAffreteur.marche(ctxDe('u-aff-1')));
    for (const interdit of [NOM_TRA_1, PLAQUE_VEH_1, PLAQUE_VEH_2, 'Routière du Centre', '3456 GH 02']) {
      assert.ok(!t.includes(interdit), `« ${interdit} » affiché sur le marché avant validation`);
    }
    assert.ok(t.includes('Transporteur vérifié'), 'le signal de confiance doit remplacer le nom');
  });

  it('l’écran de validation n’affiche ni le nom ni la plaque du transporteur', () => {
    const t = texteDe(vueAffreteur.validation(ctxDe('u-aff-1'), { id: appariementId }));
    assert.ok(!t.includes(NOM_TRA_1), 'raison sociale affichée avant validation');
    assert.ok(!t.includes(PLAQUE_VEH_1), 'immatriculation affichée avant validation');
    assert.ok(t.includes('Communiquée à la validation'));
    assert.match(t, /Transporteur T-[0-9A-Z]{4}/);
    assert.ok(t.includes('Le débit'), 'l’écran de validation n’est pas rendu');
  });

  it('la liste « à valider » et les réservations de l’affréteur restent anonymes', () => {
    const t = [vueAffreteur.validation(ctxDe('u-aff-1'), {}), vueAffreteur.reservations(ctxDe('u-aff-1'))]
      .map(texteDe)
      .join(' ');
    assert.ok(!t.includes(NOM_TRA_1));
    assert.ok(!t.includes(PLAQUE_VEH_1));
  });

  it('les réservations reçues par le transporteur n’affichent pas le nom de l’affréteur', () => {
    const t = texteDe(vueTransporteur.reservations(ctxDe('u-tra-1')));
    assert.ok(!t.includes(NOM_AFF_1), 'raison sociale de l’affréteur affichée avant validation');
    assert.match(t, /Affréteur A-[0-9A-Z]{4}/);
  });

  it('le marché du transporteur et les tableaux de bord ne nomment aucun affréteur', () => {
    const t = [
      vueTransporteur.marche(ctxDe('u-tra-1')),
      vueTransporteur.dashboard(ctxDe('u-tra-1')),
      vueTransporteur.marche(ctxDe('u-tra-2')),
    ]
      .map(texteDe)
      .join(' ');
    for (const interdit of [NOM_AFF_1, 'Coton Nord Négoce DÉMO', 'CI-DEMO-2020-A-0001']) {
      assert.ok(!t.includes(interdit), `« ${interdit} » affiché à un transporteur avant validation`);
    }
  });

  it('après validation, la fiche de mise en relation affiche le nom et la plaque', () => {
    const p = matching.preparerValidation(ctxDe('u-aff-1'), appariementId);
    matching.valider(ctxDe('u-aff-1'), appariementId, { attendu: p.attendu });

    const aff = ctxDe('u-aff-1'); // contexte reconstruit après la validation
    const fiche = texteDe(vueAffreteur.relations(aff, { id: appariementId }));
    assert.ok(fiche.includes(NOM_TRA_1), 'raison sociale absente après validation');
    assert.ok(fiche.includes(PLAQUE_VEH_1), 'immatriculation absente après validation');
    assert.ok(fiche.includes('Mise en relation effective'));

    const liste = texteDe(vueAffreteur.relations(aff, {}));
    assert.ok(liste.includes(NOM_TRA_1), 'la liste des relations validées doit nommer la contrepartie');
  });
});

/* ================================================================== *
 * N° 2 — Avis après clôture et profil de confiance
 * ================================================================== */

describe('Anti-fraude n° 2 — avis après clôture', () => {
  /** @type {any} */ let ap;
  /** @type {any} */ let transport;

  before(async () => {
    await installer();
    ({ appariement: ap, transport } = validerOff1());
  });

  it('refuse de noter un transport validé mais pas encore clôturé', () => {
    const possible = avisSvc.avisPossible(ctxDe('u-aff-1'), ap.id);
    assert.equal(possible.possible, false);
    assert.match(possible.motif, /clôturé/);
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-aff-1'), ap.id, 5), /clôturé/);
    assert.equal(depot('avis').brutTous().length, 0);
  });

  it('refuse encore la note à l’étape « livré », avant la clôture par l’affréteur', () => {
    for (let i = 0; i < 4; i++) transportSvc.avancer(ctxDe('u-tra-1'), transport.id);
    assert.equal(depot('transport').brutParId(transport.id).etape, ETAPE_TRANSPORT.LIVRE);
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-tra-1'), ap.id, 4), /clôturé/);
  });

  it('refuse de noter une réservation qui n’a jamais abouti', () => {
    const autre = matching.engager(ctxDe('u-aff-1'), { offreId: 'off-2', demandeId: 'dem-2' });
    matching.annuler(ctxDe('u-aff-1'), autre.id);
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-aff-1'), autre.id, 1), /clôturé/);
  });

  it('après clôture, l’affréteur note le transporteur', () => {
    transportSvc.avancer(ctxDe('u-aff-1'), transport.id);
    assert.equal(depot('transport').brutParId(transport.id).etape, ETAPE_TRANSPORT.CLOTURE);
    const avis = avisSvc.donnerAvis(ctxDe('u-aff-1'), ap.id, 5);
    assert.equal(avis.cibleGroupementId, 'grp-tra-1');
    assert.equal(avis.auteurGroupementId, 'grp-aff-1');
    assert.equal(avis.note, 5);
  });

  it('refuse une seconde note du même groupement — y compris par un autre de ses membres', () => {
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-aff-1'), ap.id, 1), /déjà noté/);
    assert.equal(avisSvc.avisPossible(ctxDe('u-aux-1'), ap.id).possible, false);
    assert.equal(avisSvc.avisPossible(ctxDe('u-aff-1'), ap.id).dejaDonne, 5);
    assert.equal(depot('avis').brutOu((a) => a.auteurGroupementId === 'grp-aff-1').length, 1);
  });

  for (const note of [0, 6, -1, 4.5, '5', null, Number.NaN]) {
    it(`refuse une note hors de l’entier 1–5 : ${String(note)}`, () => {
      assert.throws(() => avisSvc.donnerAvis(ctxDe('u-tra-1'), ap.id, note), /entier de 1 à 5/);
    });
  }

  it('le transporteur note l’affréteur, une fois', () => {
    const avis = avisSvc.donnerAvis(ctxDe('u-tra-1'), ap.id, 4);
    assert.equal(avis.cibleGroupementId, 'grp-aff-1');
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-tra-1'), ap.id, 4), /déjà noté/);
  });

  it('un tiers ne peut pas noter un transport auquel il n’a pas pris part', () => {
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-tra-2'), ap.id, 1), /deux parties/);
  });

  it('un rôle institutionnel ne peut pas noter', () => {
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-dgttc'), ap.id, 1), /Accès refusé/);
    assert.throws(() => avisSvc.donnerAvis(ctxDe('u-conc'), ap.id, 1), /Accès refusé/);
  });

  it('le profil de confiance ne sert que des agrégats', () => {
    const p = avisSvc.profilConfiance('grp-tra-1');
    assert.deepEqual(
      Object.keys(p).sort(),
      ['membreDepuis', 'nombreAvis', 'note', 'transportsRealises', 'type', 'verifie'],
    );
    assert.equal(p.verifie, true);
    assert.equal(p.note, 5);
    assert.equal(p.nombreAvis, 1);
    assert.equal(p.transportsRealises, 1);
    assert.ok(p.membreDepuis);

    const brut = JSON.stringify(p);
    for (const interdit of [NOM_TRA_1, NOM_AFF_1, 'grp-aff-1', 'u-aff-1', 'CI-DEMO', ap.id]) {
      assert.ok(!brut.includes(interdit), `« ${interdit} » servi par le profil de confiance`);
    }
  });

  it('le profil d’un affréteur ne porte pas de vérification, et un groupement inconnu rien', () => {
    const p = avisSvc.profilConfiance('grp-aff-1');
    assert.equal(p.verifie, null);
    assert.equal(p.note, 4);
    assert.equal(p.nombreAvis, 1);
    assert.deepEqual(avisSvc.profilConfiance('grp-inexistant'), {
      type: null, verifie: null, transportsRealises: 0, note: null, nombreAvis: 0, membreDepuis: null,
    });
    assert.equal(avisSvc.profilConfiance('grp-tra-3').verifie, false, 'grp-tra-3 n’est pas vérifié');
  });

  it('le schéma interdit qu’un groupement se note lui-même', () => {
    const inv = entite('avis').invariants.find((i) => i.nom === 'avisEntreDeuxParties');
    assert.equal(inv.verifier({ auteurGroupementId: 'grp-a', cibleGroupementId: 'grp-a' }), false);
    assert.equal(inv.verifier({ auteurGroupementId: 'grp-a', cibleGroupementId: 'grp-b' }), true);
  });
});

/* ================================================================== *
 * N° 3 — Vérification des transporteurs
 * ================================================================== */

describe('Anti-fraude n° 3 — un transporteur non vérifié ne s’engage pas', () => {
  /** @type {string} */ let offreTra3;

  before(installer);

  it('le jeu porte un transporteur à vérifier, et seul l’agent d’activation a le droit', async () => {
    assert.equal(verification.etatVerification('grp-tra-3'), ETAT_VERIFICATION.A_VERIFIER);
    assert.equal(verification.transporteurVerifie('grp-tra-1'), true);
    assert.equal(verification.etatVerification(null), ETAT_VERIFICATION.A_VERIFIER, 'absent vaut à vérifier');

    const agent = await connecter('activation@demo.invalid', MOT_DE_PASSE_DEMO);
    assert.equal(agent.roleId, 'activation_inscription');
    assert.equal(agent.utilisateurId, 'u-activ');

    const titulaires = Object.entries(MATRICE)
      .filter(([, droits]) => 'groupement.verifier' in droits)
      .map(([r]) => r);
    assert.deepEqual(titulaires, ['activation_inscription']);
  });

  it('CAS DE FRAUDE — le transporteur non vérifié ne peut pas publier', () => {
    assert.equal(flotte.publiabilite(depot('vehicule').brutParId('veh-6')).publiable, false);
    assert.throws(
      () => flotte.publierOffre(ctxDe('u-tra-3'), saisieOffre('veh-6')),
      /n’a pas encore été vérifié/,
    );
    assert.equal(depot('offre').brutOu((o) => o.groupementId === 'grp-tra-3').length, 0);
  });

  it('aucun autre rôle ne vérifie un dossier — pas même le transporteur lui-même', () => {
    for (const id of ['u-tra-3', 'u-tra-1', 'u-conc', 'u-dgttc', 'u-aff-1']) {
      const ctx = ctxDe(id);
      assert.throws(
        () => verification.verifierTransporteur(ctx, 'grp-tra-3', { pieces: TOUTES_PIECES }),
        /Accès refusé/,
        `${id} a pu vérifier un dossier`,
      );
      assert.throws(() => verification.verifierVehicule(ctx, 'veh-6'), /Accès refusé/);
      assert.throws(() => verification.verifierChauffeur(ctx, 'chf-4'), /Accès refusé/);
      assert.throws(() => verification.dossiersTransporteurs(ctx), /Accès refusé/);
    }
    assert.equal(verification.etatVerification('grp-tra-3'), ETAT_VERIFICATION.A_VERIFIER);
  });

  it('les dossiers servis à l’agent ne portent ni coordonnées ni montants', () => {
    const dossiers = verification.dossiersTransporteurs(ctxDe('u-activ'));
    assert.equal(dossiers[0].id, 'grp-tra-3', 'les dossiers à vérifier viennent en premier');
    const brut = JSON.stringify(dossiers);
    for (const interdit of ['+225', '@', 'contactTelephone', 'contactEmail', 'adresse', 'solde', 'telephone']) {
      assert.ok(!brut.includes(interdit), `« ${interdit} » servi à l’agent d’activation`);
    }
    const d3 = dossiers.find((d) => d.id === 'grp-tra-3');
    assert.equal(d3.rccm, 'CI-DEMO-2026-T-0131');
    assert.deepEqual(d3.vehicules.map((v) => v.id), ['veh-6']);
    assert.deepEqual(d3.chauffeurs.map((c) => c.id), ['chf-4']);
  });

  it('CAS DE FRAUDE — un contrôle partiel ne vérifie pas le dossier', () => {
    const agent = ctxDe('u-activ');
    for (const pieces of [[], [PIECE_DOSSIER.RCCM], [PIECE_DOSSIER.RCCM, PIECE_DOSSIER.CARTE_TRANSPORTEUR], ['rccm', 'rccm', 'rccm'], ['autre']]) {
      assert.throws(
        () => verification.verifierTransporteur(agent, 'grp-tra-3', { pieces }),
        /trois pièces/,
        `vérifié avec ${JSON.stringify(pieces)}`,
      );
    }
    assert.equal(verification.etatVerification('grp-tra-3'), ETAT_VERIFICATION.A_VERIFIER);
  });

  it('refuse de vérifier un dossier dont la carte de transporteur est échue', () => {
    const g = depot('groupement').brutParId('grp-tra-3');
    depot('groupement').modifier('grp-tra-3', { carteTransporteurEcheance: '2020-01-01' });
    try {
      assert.throws(
        () => verification.verifierTransporteur(ctxDe('u-activ'), 'grp-tra-3', { pieces: TOUTES_PIECES }),
        /échue/,
      );
    } finally {
      depot('groupement').modifier('grp-tra-3', { carteTransporteurEcheance: g.carteTransporteurEcheance });
    }
  });

  it('refuse de « vérifier » un affréteur', () => {
    assert.throws(
      () => verification.verifierTransporteur(ctxDe('u-activ'), 'grp-aff-1', { pieces: TOUTES_PIECES }),
      /transporteurs/,
    );
  });

  it('l’agent vérifie le dossier complet : journal et notification suivent', () => {
    const g = verification.verifierTransporteur(ctxDe('u-activ'), 'grp-tra-3', { pieces: TOUTES_PIECES });
    assert.equal(g.verificationEtat, ETAT_VERIFICATION.VERIFIE);
    assert.deepEqual([...g.verificationPieces].sort(), [...TOUTES_PIECES].sort());
    assert.equal(g.verifieParUtilisateurId, 'u-activ');

    const audit = depot('audit').brutOu((e) => e.evenement === 'transporteur_verifie' && e.cibleId === 'grp-tra-3');
    assert.equal(audit.length, 1);
    assert.equal(audit[0].auteurUtilisateurId, 'u-activ');
    const notes = depot('notification').brutOu(
      (n) => n.destinataireUtilisateurId === 'u-tra-3' && n.message.code === 'transporteur.verifie',
    );
    assert.equal(notes.length, 1);
  });

  it('le dossier vérifié ne suffit pas : le véhicule doit être contrôlé', () => {
    assert.throws(
      () => flotte.publierOffre(ctxDe('u-tra-3'), saisieOffre('veh-6')),
      /carte grise et la carte de transport/,
    );
    const v = verification.verifierVehicule(ctxDe('u-activ'), 'veh-6');
    assert.ok(v.verifieLe);
  });

  it('CAS DE FRAUDE — un chauffeur pressenti non contrôlé bloque la publication', () => {
    assert.throws(
      () => flotte.publierOffre(ctxDe('u-tra-3'), saisieOffre('veh-6', 'chf-4')),
      /permis du chauffeur/,
    );
  });

  it('une fois le chauffeur contrôlé, l’offre est publiée et visible sur le marché et au catalogue', () => {
    verification.verifierChauffeur(ctxDe('u-activ'), 'chf-4');
    const offre = flotte.publierOffre(ctxDe('u-tra-3'), saisieOffre('veh-6', 'chf-4'));
    offreTra3 = offre.id;
    assert.equal(offre.etat, 'disponible');
    assert.ok(offresAuMarche().includes(offreTra3), 'offre absente du marché');
    assert.ok(offresAuCatalogue().includes(offreTra3), 'offre absente du catalogue public');
  });

  it('le transporteur vérifié peut proposer son véhicule sur une demande', () => {
    const ap = matching.engager(ctxDe('u-tra-3'), {
      offreId: offreTra3,
      demandeId: 'dem-1',
      sens: SENS_APPARIEMENT.DEMANDE_VERS_OFFRE,
    });
    assert.equal(ap.etat, ETAT_APPARIEMENT.RESERVER);
  });

  it('un refus exige un motif', () => {
    for (const motif of [undefined, null, '', '   ']) {
      assert.throws(
        () => verification.refuserTransporteur(ctxDe('u-activ'), 'grp-tra-3', motif),
        /motif/,
      );
    }
    assert.equal(verification.transporteurVerifie('grp-tra-3'), true);
  });

  it('CAS DE FRAUDE — le transporteur ne peut pas retirer lui-même… ni rétablir sa vérification', () => {
    assert.throws(() => verification.refuserTransporteur(ctxDe('u-tra-3'), 'grp-tra-3', 'x'), /Accès refusé/);
  });

  it('retirer la vérification retire ses offres du marché et du catalogue public', () => {
    const g = verification.refuserTransporteur(ctxDe('u-activ'), 'grp-tra-3', 'Attestation d’assurance expirée.');
    assert.equal(g.verificationEtat, ETAT_VERIFICATION.REFUSE);
    assert.equal(g.verificationMotif, 'Attestation d’assurance expirée.');
    assert.equal(g.verifieLe, null);
    assert.ok(!offresAuMarche().includes(offreTra3), 'offre encore proposée sur le marché');
    assert.ok(!offresAuCatalogue().includes(offreTra3), 'offre encore au catalogue public');
    assert.equal(avisSvc.profilConfiance('grp-tra-3').verifie, false);
    assert.equal(
      depot('notification').brutOu((n) => n.destinataireUtilisateurId === 'u-tra-3' && n.message.code === 'transporteur.refuse').length,
      1,
    );
  });

  it('CAS DE FRAUDE — l’affréteur ne peut pas accepter la proposition d’un transporteur dévérifié', () => {
    const ap = depot('appariement').brutOu((a) => a.offreId === offreTra3 && a.etat === ETAT_APPARIEMENT.RESERVER)[0];
    const e = erreurDe(() => matching.repondre(ctxDe('u-aff-1'), ap.id, { accepte: true }));
    assert.ok(e.motifs.some((m) => /n’est pas, ou plus, vérifié/.test(m)), e.message);
    assert.ok(!e.message.includes(NOM_TRA_3), 'le refus nomme le transporteur avant validation');
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.RESERVER);
    matching.annuler(ctxDe('u-aff-1'), ap.id);
  });

  it('CAS DE FRAUDE — le transporteur dévérifié ne peut plus proposer ni publier', () => {
    const e = erreurDe(() =>
      matching.engager(ctxDe('u-tra-3'), {
        offreId: offreTra3,
        demandeId: 'dem-1',
        sens: SENS_APPARIEMENT.DEMANDE_VERS_OFFRE,
      }),
    );
    assert.ok(e.motifs.some((m) => /Votre dossier de transporteur n’a pas été vérifié/.test(m)), e.message);
    assert.throws(() => flotte.publierOffre(ctxDe('u-tra-3'), saisieOffre('veh-6')), /refusée/);
  });

  it('les gardes sont strictes : une donnée absente fait échouer', () => {
    assert.equal(GARDES.transporteurVerifie.verifier({}), false);
    assert.equal(GARDES.moyensVerifies.verifier({}), false);
    assert.equal(GARDES.transporteurVerifie.verifier({ transporteurVerifie: 'oui' }), false);
    const ev = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.VALIDER, {
      offreDisponible: true,
      demandeOuverte: true,
      soldeAffreteur: 1e6,
      soldeTransporteur: 1e6,
      fraisAffreteur: 1,
      fraisTransporteur: 1,
      delaiDepasse: false,
    });
    assert.equal(ev.possible, false);
    assert.ok(ev.gardesEnEchec.includes('transporteurVerifie'));
    assert.ok(ev.gardesEnEchec.includes('moyensVerifies'));
  });
});

describe('Anti-fraude n° 3 — une validation ne passe pas sur un transporteur dévérifié', () => {
  /** @type {string} */ let apId;

  before(async () => {
    await installer();
    apId = reserverOff1().id;
  });

  it('CAS DE FRAUDE — le transporteur dont la vérification est retirée ne peut pas accepter', () => {
    verification.refuserTransporteur(ctxDe('u-activ'), 'grp-tra-1', 'RCCM radié — contrôle en cours.');
    const e = erreurDe(() => matching.repondre(ctxDe('u-tra-1'), apId, { accepte: true }));
    assert.ok(e.motifs.some((m) => /Votre dossier de transporteur n’a pas été vérifié/.test(m)), e.message);
    assert.equal(depot('appariement').brutParId(apId).etat, ETAT_APPARIEMENT.RESERVER);
  });

  it('rétabli, il accepte ; dévérifié à nouveau, la validation échoue sans aucun débit', () => {
    verification.verifierTransporteur(ctxDe('u-activ'), 'grp-tra-1', { pieces: TOUTES_PIECES });
    matching.repondre(ctxDe('u-tra-1'), apId, { accepte: true });
    verification.refuserTransporteur(ctxDe('u-activ'), 'grp-tra-1', 'Assurance résiliée.');

    const soldes = [compte.soldeDe('grp-aff-1'), compte.soldeDe('grp-tra-1')];
    const p = matching.preparerValidation(ctxDe('u-aff-1'), apId);
    assert.equal(p.possible, false);
    assert.ok(p.refus.some((m) => /n’est pas, ou plus, vérifié/.test(m)), p.refus.join(' '));
    assert.ok(!p.refus.join(' ').includes(NOM_TRA_1), 'le refus nomme le transporteur');
    assert.throws(() => matching.valider(ctxDe('u-aff-1'), apId, { attendu: p.attendu }), /vérifié/);
    assert.deepEqual([compte.soldeDe('grp-aff-1'), compte.soldeDe('grp-tra-1')], soldes, 'un débit a eu lieu');
    assert.equal(depot('appariement').brutParId(apId).etat, ETAT_APPARIEMENT.ACCEPTER);
  });
});

describe('Anti-fraude n° 3 — une pièce modifiée après contrôle perd sa vérification', () => {
  before(installer);

  it('modifier une donnée non contrôlée (prix) conserve la vérification du véhicule', () => {
    const avant = depot('vehicule').brutParId('veh-1').verifieLe;
    assert.ok(avant);
    const v = flotte.enregistrerVehicule(ctxDe('u-tra-1'), saisieVehicule('veh-1', { prixKmT: 99 }), 'veh-1');
    assert.equal(v.verifieLe, avant, 'une modification anodine a fait perdre le contrôle');
    assert.ok(offresAuMarche().includes('off-1'));
  });

  it('modifier le téléphone du chauffeur conserve sa vérification', () => {
    const avant = depot('chauffeur').brutParId('chf-1').verifieLe;
    const c = flotte.enregistrerChauffeur(ctxDe('u-tra-1'), saisieChauffeur('chf-1', { telephone: '+225 00 11 22 33' }), 'chf-1');
    assert.equal(c.verifieLe, avant);
  });

  for (const [champ, valeur] of [
    ['carteGrise', 'CG-DEMO-9999'],
    ['carteTransportNumero', 'CT-AUTRE-0001'],
    ['immatriculation', '9999 ZZ 01'],
  ]) {
    it(`CAS DE FRAUDE — changer « ${champ} » remet le contrôle du véhicule à vide`, async () => {
      await installer();
      const v = flotte.enregistrerVehicule(ctxDe('u-tra-1'), saisieVehicule('veh-1', { [champ]: valeur }), 'veh-1');
      assert.equal(v.verifieLe, null);
      assert.equal(v.verifieParUtilisateurId, null);
      assert.ok(!offresAuMarche().includes('off-1'), 'offre au véhicule non contrôlé encore au marché');
      assert.ok(!offresAuCatalogue().includes('off-1'), 'offre au véhicule non contrôlé encore au catalogue');
      const e = erreurDe(reserverOff1);
      assert.ok(e.motifs.some((m) => /n’a pas été contrôlé/.test(m)), e.message);
    });
  }

  for (const [champ, valeur] of [
    ['permisNumero', 'PC-AUTRE-0001'],
    ['nom', 'Prête-nom (DÉMO)'],
  ]) {
    it(`CAS DE FRAUDE — changer « ${champ} » du chauffeur remet son contrôle à vide`, async () => {
      await installer();
      const c = flotte.enregistrerChauffeur(ctxDe('u-tra-1'), saisieChauffeur('chf-1', { [champ]: valeur }), 'chf-1');
      assert.equal(c.verifieLe, null);
      assert.equal(verification.moyensVerifies(depot('offre').brutParId('off-1')), false);
      assert.ok(!offresAuMarche().includes('off-1'));
      assert.throws(reserverOff1, /n’a pas été contrôlé/);
    });
  }

  it('CAS DE FRAUDE — substituer une plaque après acceptation bloque la validation', async () => {
    await installer();
    const ap = reserverOff1();
    matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true });
    flotte.enregistrerVehicule(ctxDe('u-tra-1'), saisieVehicule('veh-1', { immatriculation: '0000 XX 01' }), 'veh-1');

    const p = matching.preparerValidation(ctxDe('u-aff-1'), ap.id);
    assert.equal(p.possible, false);
    assert.ok(p.refus.some((m) => /n’a pas été contrôlé/.test(m)), p.refus.join(' '));
    assert.throws(() => matching.valider(ctxDe('u-aff-1'), ap.id, { attendu: p.attendu }));
    assert.equal(compte.soldeDe('grp-aff-1'), 200000, 'l’affréteur a été débité');
  });

  it('pieceModifiee : un nouvel objet est toujours à contrôler', () => {
    assert.equal(verification.pieceModifiee('vehicule', null, {}), true);
    assert.equal(
      verification.pieceModifiee('vehicule', { immatriculation: 'A', prixKmT: 1 }, { immatriculation: 'A', prixKmT: 2 }),
      false,
    );
  });
});

/* ================================================================== *
 * N° 4 — Expiration des appariements en attente
 * ================================================================== */

describe('Anti-fraude n° 4 — fonctions pures d’échéance', () => {
  const t0 = '2026-10-13T08:00:00.000Z';
  const plus = (iso, h) => new Date(new Date(iso).getTime() + h * HEURE);

  it('les délais sont de 48 h pour répondre et 48 h pour valider', () => {
    assert.equal(DELAIS_APPARIEMENT.REPONSE_HEURES, 48);
    assert.equal(DELAIS_APPARIEMENT.VALIDATION_HEURES, 48);
  });

  it('échéance d’une réservation : reserveLe + 48 h', () => {
    assert.equal(echeanceDe({ etat: ETAT_APPARIEMENT.RESERVER, reserveLe: t0 }), '2026-10-15T08:00:00.000Z');
  });

  it('échéance d’une acceptation : reponduLe + 48 h, pas reserveLe', () => {
    const a = { etat: ETAT_APPARIEMENT.ACCEPTER, reserveLe: t0, reponduLe: '2026-10-14T08:00:00.000Z' };
    assert.equal(echeanceDe(a), '2026-10-16T08:00:00.000Z');
  });

  it('aucune échéance hors attente', () => {
    for (const etat of [ETAT_APPARIEMENT.VALIDER, ETAT_APPARIEMENT.ANNULER, ETAT_APPARIEMENT.REJETER]) {
      assert.equal(echeanceDe({ etat, reserveLe: t0 }), null);
      assert.equal(delaiDepasse({ etat, reserveLe: '2000-01-01T00:00:00Z' }), false);
    }
  });

  it('delaiDepasse bascule à l’échéance exacte', () => {
    const a = { etat: ETAT_APPARIEMENT.RESERVER, reserveLe: t0 };
    assert.equal(delaiDepasse(a, plus(t0, 47.99)), false);
    assert.equal(delaiDepasse(a, plus(t0, 48)), true);
    assert.equal(delaiDepasse(a, plus(t0, 49)), true);
  });

  it('une échéance incalculable sur un appariement en attente vaut dépassement', () => {
    assert.equal(delaiDepasse({ etat: ETAT_APPARIEMENT.RESERVER }), true);
    assert.equal(delaiDepasse({ etat: ETAT_APPARIEMENT.RESERVER, reserveLe: 'n’importe quoi' }), true);
  });

  it('EXPIRER revient à la seule plateforme, et aucun rôle n’en a le droit', () => {
    for (const sens of Object.values(SENS_APPARIEMENT)) {
      assert.equal(partieHabilitee(ACTION.EXPIRER, sens), PARTIE.SYSTEME);
    }
    for (const [roleId, droits] of Object.entries(MATRICE)) {
      assert.equal('appariement.expirer' in droits, false, `${roleId} détient appariement.expirer`);
    }
  });

  it('la garde delaiDepasse est stricte : EXPIRER sans dépassement constaté échoue', () => {
    assert.equal(evaluerTransition(ETAT_APPARIEMENT.RESERVER, ACTION.EXPIRER, {}).possible, false);
    assert.equal(evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.EXPIRER, { delaiDepasse: false }).possible, false);
    assert.equal(evaluerTransition(ETAT_APPARIEMENT.VALIDER, ACTION.EXPIRER, { delaiDepasse: true }).possible, false);
    const ok = evaluerTransition(ETAT_APPARIEMENT.ACCEPTER, ACTION.EXPIRER, { delaiDepasse: true });
    assert.equal(ok.possible, true);
    assert.equal(ok.vers, ETAT_APPARIEMENT.ANNULER);
  });
});

describe('Anti-fraude n° 4 — expiration d’une réservation sans réponse', () => {
  /** @type {any} */ let ap;
  /** @type {number[]} */ let soldes;

  before(async () => {
    await installer();
    soldes = [compte.soldeDe('grp-aff-1'), compte.soldeDe('grp-tra-1')];
    ap = reserverOff1();
  });

  it('CAS DE FRAUDE — aucune partie ne peut provoquer l’expiration', () => {
    for (const id of ['u-aff-1', 'u-tra-1', 'u-aux-1']) {
      const d = deciderSurAppariement(ctxDe(id), ACTION.EXPIRER, depot('appariement').brutParId(ap.id));
      assert.equal(d.autorise, false, `${id} a pu expirer`);
      assert.match(d.explication, /réservée à la plateforme/);
    }
    // Un tiers est arrêté plus tôt : il n'est pas partie.
    assert.equal(deciderSurAppariement(ctxDe('u-tra-2'), ACTION.EXPIRER, depot('appariement').brutParId(ap.id)).autorise, false);
  });

  it('rien n’expire avant 48 h', () => {
    assert.deepEqual(matching.expirerEchus(), []);
    assert.deepEqual(matching.expirerEchus(new Date(Date.now() + 47 * HEURE)), []);
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.RESERVER);
    assert.equal(depot('offre').brutParId('off-1').etat, 'reservee');
  });

  it('au-delà de 48 h, la plateforme annule : camion et demande reviennent au marché', () => {
    const maintenant = new Date(Date.now() + 49 * HEURE);
    const expires = matching.expirerEchus(maintenant);
    assert.deepEqual(expires.map((x) => x.id), [ap.id]);

    const a = depot('appariement').brutParId(ap.id);
    assert.equal(a.etat, ETAT_APPARIEMENT.ANNULER);
    assert.equal(a.motifCloture, MOTIF_CLOTURE.EXPIRATION);
    assert.equal(a.annuleParUtilisateurId, null, 'l’expiration est imputée à un utilisateur');
    assert.equal(a.annuleLe, maintenant.toISOString());
    assert.equal(depot('offre').brutParId('off-1').etat, 'disponible');
    assert.equal(depot('demande').brutParId('dem-1').etat, 'publiee');
  });

  it('l’expiration est journalisée au nom de la plateforme, sans utilisateur', () => {
    const entrees = depot('audit').brutOu((e) => e.evenement === 'appariement_expire' && e.cibleId === ap.id);
    assert.equal(entrees.length, 1);
    assert.equal(entrees[0].auteurRoleId, 'plateforme');
    assert.equal(entrees[0].auteurRoleId, CONTEXTE_PLATEFORME.roleId);
    assert.equal(entrees[0].auteurUtilisateurId, null);
    assert.equal(entrees[0].groupementId, null);
    assert.match(entrees[0].details, /réponse/);
  });

  it('les deux parties sont notifiées', () => {
    const notes = depot('notification').brutOu((n) => n.message.code === 'appariement.expire' && n.cibleId === ap.id);
    const destinataires = new Set(notes.map((n) => n.destinataireUtilisateurId));
    assert.ok(destinataires.has('u-aff-1'), 'affréteur non prévenu');
    assert.ok(destinataires.has('u-tra-1'), 'transporteur non prévenu');
    assert.ok(notes.every((n) => n.message.params.etape === 'réponse'));
  });

  it('rien n’est débité, et un second passage ne refait rien', () => {
    assert.deepEqual([compte.soldeDe('grp-aff-1'), compte.soldeDe('grp-tra-1')], soldes);
    assert.equal(depot('operation').brutOu((o) => o.appariementId === ap.id).length, 0);
    assert.deepEqual(matching.expirerEchus(new Date(Date.now() + 100 * HEURE)), []);
    assert.equal(
      depot('audit').brutOu((e) => e.evenement === 'appariement_expire' && e.cibleId === ap.id).length,
      1,
    );
  });

  it('le véhicule libéré peut être réservé de nouveau', () => {
    const nouveau = reserverOff1();
    assert.equal(nouveau.etat, ETAT_APPARIEMENT.RESERVER);
    assert.notEqual(nouveau.id, ap.id);
  });
});

describe('Anti-fraude n° 4 — expiration d’une acceptation non validée', () => {
  before(installer);

  it('le délai de validation court depuis l’acceptation, pas depuis la réservation', () => {
    const ap = reserverOff1();
    depot('appariement').modifier(ap.id, { reserveLe: dansHeures(-47) });
    matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true });
    // 49 h après la réservation, mais 2 h après l'acceptation : rien n'expire.
    assert.deepEqual(matching.expirerEchus(new Date(Date.now() + 2 * HEURE)), []);
    assert.deepEqual(matching.expirerEchus(new Date(Date.now() + 47 * HEURE)), []);

    const expires = matching.expirerEchus(new Date(Date.now() + 49 * HEURE));
    assert.deepEqual(expires.map((x) => x.id), [ap.id]);
    const a = depot('appariement').brutParId(ap.id);
    assert.equal(a.etat, ETAT_APPARIEMENT.ANNULER);
    assert.equal(a.motifCloture, MOTIF_CLOTURE.EXPIRATION);
    assert.equal(depot('offre').brutParId('off-1').etat, 'disponible');
    assert.equal(depot('demande').brutParId('dem-1').etat, 'publiee');
    const notes = depot('notification').brutOu((n) => n.message.code === 'appariement.expire' && n.cibleId === ap.id);
    assert.ok(notes.length >= 2);
    assert.ok(notes.every((n) => n.message.params.etape === 'validation'));
    assert.equal(compte.soldeDe('grp-aff-1'), 200000);
  });

  it('une validation tentée après expiration constatée est refusée', () => {
    const ap = depot('appariement').brutOu((a) => a.motifCloture === MOTIF_CLOTURE.EXPIRATION)[0];
    assert.throws(() => matching.valider(ctxDe('u-aff-1'), ap.id), /plus en attente de validation/);
  });
});

describe('Anti-fraude n° 4 — un délai dépassé bloque l’action même avant le constat', () => {
  before(installer);

  it('CAS DE FRAUDE — valider une acceptation échue (non encore close) est refusé par delaiTenu', () => {
    const ap = reserverOff1();
    matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true });
    // Échue mais pas encore close : personne n'a appelé expirerEchus.
    depot('appariement').modifier(ap.id, { reponduLe: dansHeures(-49) });
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.ACCEPTER);

    const p = matching.preparerValidation(ctxDe('u-aff-1'), ap.id);
    assert.equal(p.possible, false);
    assert.ok(p.refus.some((m) => /délai de cette mise en relation est dépassé/.test(m)), p.refus.join(' '));
    const e = erreurDe(() => matching.valider(ctxDe('u-aff-1'), ap.id, { attendu: p.attendu }));
    assert.match(e.message, /délai/);
    assert.equal(compte.soldeDe('grp-aff-1'), 200000, 'débit malgré l’expiration');
    assert.equal(depot('operation').brutOu((o) => o.appariementId === ap.id).length, 0);
    matching.expirerEchus();
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.ANNULER);
  });

  it('CAS DE FRAUDE — accepter une réservation échue est refusé', () => {
    const ap = reserverOff1();
    depot('appariement').modifier(ap.id, { reserveLe: dansHeures(-49) });
    const e = erreurDe(() => matching.repondre(ctxDe('u-tra-1'), ap.id, { accepte: true }));
    assert.ok(e.motifs.some((m) => /délai/.test(m)), e.message);
    assert.equal(depot('appariement').brutParId(ap.id).etat, ETAT_APPARIEMENT.RESERVER);
  });

  it('une nouvelle réservation constate d’abord les expirations : le camion n’est pas bloqué', () => {
    // La réservation échue du test précédent immobilise encore off-1.
    const nouveau = reserverOff1();
    assert.equal(nouveau.etat, ETAT_APPARIEMENT.RESERVER);
    const echue = depot('appariement').brutOu(
      (a) => a.offreId === 'off-1' && a.id !== nouveau.id && a.motifCloture === MOTIF_CLOTURE.EXPIRATION,
    );
    assert.ok(echue.length >= 1, 'la réservation échue n’a pas été close');
  });
});

/* ================================================================== *
 * N° 5 — Crédit de compte aux quatre yeux
 * ================================================================== */

describe('Anti-fraude n° 5 — saisie puis validation par une autre personne', () => {
  /** @type {any} */ let credit;

  before(installer);

  it('la saisie crée un crédit en attente SANS toucher au solde', () => {
    const solde = compte.soldeDe('grp-aff-1');
    const operations = depot('operation').brutTous().length;
    credit = compte.saisirCredit(ctxDe('u-conc'), {
      groupementId: 'grp-aff-1',
      montant: 25000,
      referenceEncaissement: 'ENC-TEST-0001',
    });
    assert.equal(credit.etat, ETAT_CREDIT.EN_ATTENTE);
    assert.equal(credit.saisiParUtilisateurId, 'u-conc');
    assert.match(credit.reference, /^CR-\d{4}-\d{4}$/);
    assert.equal(compte.soldeDe('grp-aff-1'), solde, 'la saisie a crédité le compte');
    assert.equal(depot('operation').brutTous().length, operations, 'la saisie a créé un mouvement');
  });

  it('CAS DE FRAUDE — l’auteur de la saisie ne peut ni la valider ni la rejeter', () => {
    assert.throws(
      () => compte.validerCredit(ctxDe('u-conc'), credit.id, { rapprochementConfirme: true }),
      /saisi ce crédit/,
    );
    assert.throws(() => compte.rejeterCredit(ctxDe('u-conc'), credit.id, 'Doublon'), /saisi ce crédit/);
    assert.equal(depot('credit').brutParId(credit.id).etat, ETAT_CREDIT.EN_ATTENTE);
  });

  it('sans rapprochement confirmé, rien n’est validé', () => {
    const solde = compte.soldeDe('grp-aff-1');
    for (const confirmation of [undefined, {}, { rapprochementConfirme: false }, { rapprochementConfirme: 'oui' }, { rapprochementConfirme: 1 }]) {
      assert.throws(
        () => compte.validerCredit(ctxDe('u-conc-2'), credit.id, confirmation),
        /rapproché/,
        `validé avec ${JSON.stringify(confirmation)}`,
      );
    }
    assert.equal(compte.soldeDe('grp-aff-1'), solde);
  });

  it('CAS DE FRAUDE — un rôle sans le droit ne valide pas', () => {
    for (const id of ['u-aff-1', 'u-tra-1', 'u-dgttc', 'u-caisse', 'u-activ']) {
      assert.throws(
        () => compte.validerCredit(ctxDe(id), credit.id, { rapprochementConfirme: true }),
        /Accès refusé/,
        `${id} a pu valider un crédit`,
      );
    }
  });

  it('une seconde personne valide après rapprochement : le solde augmente, une fois', async () => {
    const conc2 = await connecter('concessionnaire2@demo.invalid', MOT_DE_PASSE_DEMO);
    assert.equal(conc2.utilisateurId, 'u-conc-2');
    assert.equal(conc2.roleId, 'concessionnaire');

    const solde = compte.soldeDe('grp-aff-1');
    const { credit: valide, operation } = compte.validerCredit(conc2, credit.id, { rapprochementConfirme: true });
    assert.equal(valide.etat, ETAT_CREDIT.CREDITE);
    assert.equal(valide.valideParUtilisateurId, 'u-conc-2');
    assert.equal(valide.operationId, operation.id);
    assert.equal(operation.montant, 25000);
    assert.equal(operation.referenceEncaissement, 'ENC-TEST-0001');
    assert.equal(operation.auteurUtilisateurId, 'u-conc-2');
    assert.equal(compte.soldeDe('grp-aff-1'), solde + 25000);

    assert.throws(
      () => compte.validerCredit(conc2, credit.id, { rapprochementConfirme: true }),
      /déjà été traité/,
    );
    assert.equal(compte.soldeDe('grp-aff-1'), solde + 25000, 'crédit compté deux fois');
  });

  it('le groupement crédité est notifié, et le journal ne porte aucun montant', () => {
    const notes = depot('notification').brutOu(
      (n) => n.destinataireUtilisateurId === 'u-aff-1' && n.message.code === 'compte.credite',
    );
    assert.equal(notes.length, 1);
    const entrees = depot('audit').brutOu((e) => ['credit_saisi', 'compte_credite'].includes(e.evenement));
    assert.ok(entrees.length >= 2);
    for (const e of entrees) assert.doesNotMatch(e.details, /25[\s  ]?000|F\s?CFA/);
  });

  for (const variante of ['ENC-TEST-0001', 'enc-test-0001', ' ENC TEST 0001 ', 'ENCTEST0001', 'Enc--Test 0001']) {
    it(`CAS DE FRAUDE — une référence déjà créditée ne resert pas : « ${variante} »`, () => {
      assert.throws(
        () => compte.saisirCredit(ctxDe('u-conc-2'), { groupementId: 'grp-aff-1', montant: 25000, referenceEncaissement: variante }),
        /a déjà servi/,
      );
    });
  }

  it('CAS DE FRAUDE — une référence d’un mouvement existant (hors crédit saisi) ne resert pas', () => {
    assert.throws(
      () => compte.saisirCredit(ctxDe('u-conc'), { groupementId: 'grp-aff-2', montant: 1000, referenceEncaissement: 'enc demo 1004' }),
      /a déjà servi/,
    );
  });

  it('CAS DE FRAUDE — la référence d’un crédit encore en attente ne resert pas', () => {
    assert.throws(
      () => compte.saisirCredit(ctxDe('u-conc-2'), { groupementId: 'grp-tra-2', montant: 50000, referenceEncaissement: 'ENC-DEMO-2001' }),
      /a déjà servi/,
    );
  });

  for (const montant of [0, -5000, 12.5, '1000', Number.NaN, null]) {
    it(`refuse un montant invalide : ${String(montant)}`, () => {
      assert.throws(
        () => compte.saisirCredit(ctxDe('u-conc'), { groupementId: 'grp-aff-1', montant, referenceEncaissement: `ENC-M-${String(montant)}` }),
        /entier de francs/,
      );
    });
  }

  it('refuse une saisie sans référence, ou pour un groupement inconnu', () => {
    assert.throws(
      () => compte.saisirCredit(ctxDe('u-conc'), { groupementId: 'grp-aff-1', montant: 1000, referenceEncaissement: '   ' }),
      /référence d'encaissement est obligatoire/,
    );
    assert.throws(
      () => compte.saisirCredit(ctxDe('u-conc'), { groupementId: 'grp-x', montant: 1000, referenceEncaissement: 'ENC-X' }),
      /introuvable/,
    );
  });

  it('CAS DE FRAUDE — seul le concessionnaire saisit un crédit', () => {
    for (const id of ['u-aff-1', 'u-tra-1', 'u-dgttc', 'u-activ']) {
      assert.throws(
        () => compte.saisirCredit(ctxDe(id), { groupementId: 'grp-aff-1', montant: 1000, referenceEncaissement: `ENC-${id}` }),
        /Accès refusé/,
      );
    }
  });
});

describe('Anti-fraude n° 5 — rejet d’un crédit et symétrie des rôles', () => {
  before(installer);

  it('le crédit DÉMO est en attente, saisi par u-conc', () => {
    const c = depot('credit').brutParId('cre-demo-1');
    assert.equal(c.etat, ETAT_CREDIT.EN_ATTENTE);
    assert.equal(c.saisiParUtilisateurId, 'u-conc');
    assert.equal(compte.soldeDe('grp-tra-2'), 5000);
  });

  it('un rejet exige un motif', () => {
    for (const motif of [undefined, '', '   ']) {
      assert.throws(() => compte.rejeterCredit(ctxDe('u-conc-2'), 'cre-demo-1', motif), /motif/);
    }
  });

  it('le rejet laisse le solde intact et libère la référence', () => {
    const c = compte.rejeterCredit(ctxDe('u-conc-2'), 'cre-demo-1', 'Encaissement introuvable au relevé.');
    assert.equal(c.etat, ETAT_CREDIT.REJETE);
    assert.equal(c.motifRejet, 'Encaissement introuvable au relevé.');
    assert.equal(compte.soldeDe('grp-tra-2'), 5000);
    assert.throws(
      () => compte.validerCredit(ctxDe('u-conc'), 'cre-demo-1', { rapprochementConfirme: true }),
      /déjà été traité/,
    );
    const nouveau = compte.saisirCredit(ctxDe('u-conc-2'), {
      groupementId: 'grp-tra-2',
      montant: 50000,
      referenceEncaissement: 'enc-demo-2001',
    });
    assert.equal(nouveau.etat, ETAT_CREDIT.EN_ATTENTE);
  });

  it('les rôles sont symétriques : la saisie de u-conc-2 est validée par u-conc', () => {
    const c = depot('credit').brutOu((x) => x.saisiParUtilisateurId === 'u-conc-2' && x.etat === ETAT_CREDIT.EN_ATTENTE)[0];
    assert.throws(() => compte.validerCredit(ctxDe('u-conc-2'), c.id, { rapprochementConfirme: true }), /saisi ce crédit/);
    compte.validerCredit(ctxDe('u-conc'), c.id, { rapprochementConfirme: true });
    assert.equal(compte.soldeDe('grp-tra-2'), 55000);
  });

  it('le schéma porte l’invariant quatreYeux', () => {
    const inv = entite('credit').invariants.find((i) => i.nom === 'quatreYeux');
    assert.ok(inv, 'invariant quatreYeux absent du schéma');
    assert.equal(inv.verifier({ etat: ETAT_CREDIT.CREDITE, saisiParUtilisateurId: 'u-a', valideParUtilisateurId: 'u-a' }), false);
    assert.equal(inv.verifier({ etat: ETAT_CREDIT.CREDITE, saisiParUtilisateurId: 'u-a', valideParUtilisateurId: null }), false);
    assert.equal(inv.verifier({ etat: ETAT_CREDIT.CREDITE, saisiParUtilisateurId: 'u-a', valideParUtilisateurId: 'u-b' }), true);
    assert.equal(inv.verifier({ etat: ETAT_CREDIT.EN_ATTENTE, saisiParUtilisateurId: 'u-a' }), true);
  });

  it('CAS DE FRAUDE — une écriture directe contournant le service est refusée par le dépôt', () => {
    const c = compte.saisirCredit(ctxDe('u-conc'), { groupementId: 'grp-aff-1', montant: 1000, referenceEncaissement: 'ENC-DIRECT-1' });
    assert.throws(
      () =>
        depot('credit').modifier(c.id, {
          etat: ETAT_CREDIT.CREDITE,
          valideParUtilisateurId: 'u-conc',
          valideLe: new Date().toISOString(),
          operationId: 'ope-init-4',
        }),
      /autre personne/,
    );
    assert.equal(depot('credit').brutParId(c.id).etat, ETAT_CREDIT.EN_ATTENTE);
  });
});

describe('Anti-fraude n° 5 — la DGTTC ne lit pas les crédits', () => {
  before(installer);

  it('la DGTTC n’a ni compte.lire ni la classification financière', () => {
    const dgttc = ctxDe('u-dgttc');
    assert.equal(decider(dgttc, 'compte.lire', { groupementId: 'grp-tra-2' }).autorise, false);
    assert.equal(peutLireClassification('dgttc', 'financier'), false);
    assert.throws(() => compte.creditsSaisis(dgttc), /Accès refusé/);
  });

  it('même par lecture directe, aucun champ financier du crédit ne lui est servi', () => {
    const c = depot('credit').lire(ctxDe('u-dgttc'), 'cre-demo-1');
    for (const champ of ['montant', 'referenceEncaissement', 'groupementId', 'etat', 'saisiParUtilisateurId']) {
      assert.equal(champ in c, false, `« ${champ} » servi à la DGTTC`);
    }
  });

  it('le concessionnaire, lui, lit les crédits saisis', () => {
    const liste = compte.creditsSaisis(ctxDe('u-conc'));
    const c = liste.find((x) => x.id === 'cre-demo-1');
    assert.equal(c.montant, 50000);
    assert.equal(c.referenceEncaissement, 'ENC-DEMO-2001');
  });
});

/* ================================================================== *
 * Écran de l'agent d'activation (n° 3)
 * ================================================================== */

describe('Anti-fraude n° 3 — l’écran de vérification', () => {
  before(installer);

  it('montre les pièces à l’agent, sans téléphone ni courriel ni montant', () => {
    const t = texteDe(vueVerifications(ctxDe('u-activ')));
    assert.ok(t.includes(NOM_TRA_3));
    assert.ok(t.includes('CI-DEMO-2026-T-0131'));
    assert.ok(t.includes('2468 KL 03'));
    for (const interdit of ['+225 00 31 31 31', 'contact@nouvelle-route.invalid', '+225 00 13 57 91', 'F CFA']) {
      assert.ok(!t.includes(interdit), `« ${interdit} » affiché à l’agent d’activation`);
    }
  });

  it('n’est pas ouvert au concessionnaire', () => {
    assert.throws(() => vueVerifications(ctxDe('u-conc')), /Accès refusé/);
  });
});
