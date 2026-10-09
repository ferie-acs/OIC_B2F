/**
 * Accès au stockage — **seul module autorisé à toucher LocalStorage**.
 *
 * Règle d'architecture non négociable, reprise du POC DUT :
 * `VUE → SERVICE → REPOSITORY → LOCALSTORAGE`. Aucune vue, aucun service ne lit
 * ni n'écrit le stockage directement. Toute infraction est un rejet en revue.
 *
 * ## Le préfixe, en un seul point
 *
 * Toutes les clés sont préfixées `b2f_`. Le POC DUT s'exécute sur la même origine
 * et utilise des clés non préfixées : sans cette séparation, B2F écraserait les
 * données d'un POC déjà livré (risque R5, criticité 9). Le préfixe est appliqué
 * **ici et nulle part ailleurs**, ce qui rend la parade vérifiable en lisant une
 * seule fonction plutôt qu'en fouillant le dépôt.
 *
 * ## L'atomicité, qu'il faut fabriquer
 *
 * LocalStorage n'a pas de transaction. Il garantit en revanche l'atomicité **par
 * clé** : un `setItem` aboutit ou échoue, jamais à moitié. On s'appuie sur cette
 * seule garantie pour en construire une plus large :
 *
 * 1. avant d'appliquer un lot d'écritures, on enregistre en **une seule clé** un
 *    journal d'annulation contenant l'état antérieur des clés touchées ;
 * 2. on applique les écritures ;
 * 3. on efface le journal.
 *
 * Une interruption entre 2 et 3 laisse le journal en place : au démarrage suivant,
 * `restaurerSiInterrompu()` remet les clés dans leur état antérieur. Une
 * interruption pendant 1 ne laisse rien — la clé du journal est atomique.
 *
 * Ce mécanisme existe pour une raison précise : **le double débit de la validation
 * doit être tout ou rien**. Sans contrainte d'intégrité, un débit isolé passerait
 * inaperçu. C'est l'écart délibéré n° 4 — « intégrité des données explicite ».
 *
 * ## L'isolation, qu'il faut fabriquer aussi
 *
 * L'atomicité seule ne protège pas un solde. Le cycle « je lis le solde, je
 * vérifie la garde, j'écris le débit » est un TOCTOU classique dès que deux
 * exécutions s'entrelacent : l'audit de sécurité a reproduit deux validations
 * concurrentes aboutissant à un solde de 5 000 au lieu d'un refus, **un débit
 * ayant purement disparu** (finding S4).
 *
 * La parade est un **contrôle de concurrence optimiste** : le registre de
 * versions porte un compteur par **clé logique**, relevé avant la décision et
 * revérifié juste avant l'écriture. Une divergence signifie qu'un autre onglet a
 * écrit entre-temps : la transaction est refusée, pas appliquée par-dessus.
 *
 * **Le grain de la clé est celui du conflit réel** (QA-07). Une clé peut être
 * une collection (`'operations'`) ou un objet (`'operations:grp-aff-1'`,
 * `'appariements:app-12'`). Le premier jet versionnait la collection entière :
 * valider deux dossiers **indépendants** depuis deux onglets faisait échouer le
 * second, alors que rien dont dépendait sa décision n'avait bougé. Un verrou qui
 * refuse ce qu'il devrait laisser passer finit par être désactivé.
 *
 * Une version antérieure de ce commentaire annonçait « un jeton de session,
 * décrit plus bas ». **Ce jeton n'existait pas.** C'était le seul endroit de la
 * livraison où la documentation affirmait davantage que le code, et il portait
 * sur le mécanisme financier. Le voici, réellement implémenté.
 *
 * ## Ce que ce module ne prétend toujours pas faire
 *
 * Il ne sécurise rien : LocalStorage est lisible et modifiable par quiconque
 * ouvre les outils de développement. Le contrôle de version détecte l'écriture
 * concurrente honnête, pas la falsification délibérée.
 *
 * @module core/storage
 */

/** Préfixe obligatoire de toutes les clés. Décision D4. */
export const PREFIXE = 'b2f_';

/** Clé du journal d'annulation. Préfixée comme les autres. */
const CLE_JOURNAL = `${PREFIXE}tx_journal`;

/** Clé du registre de versions — support de l'isolation (finding S4). */
const CLE_VERSIONS = `${PREFIXE}versions`;

/**
 * Fabrique la clé de stockage d'une collection.
 * @param {string} collection Nom sans préfixe, tel que déclaré dans `schema.js`.
 * @returns {string}
 */
export function cleDe(collection) {
  if (!collection || /^b2f_/.test(collection)) {
    throw new Error(
      `Nom de collection invalide : « ${collection} ». Le préfixe est ajouté ici, ` +
        'jamais par l’appelant.',
    );
  }
  return `${PREFIXE}${collection}`;
}

/**
 * Backend minimal attendu — l'interface de `Storage`, réduite à ce qu'on utilise.
 * Injectable pour que les tests s'exécutent sous Node sans navigateur.
 * @typedef {object} Backend
 * @property {(cle: string) => string|null} getItem
 * @property {(cle: string, valeur: string) => void} setItem
 * @property {(cle: string) => void} removeItem
 */

/**
 * Backend en mémoire. Sert aux tests, et de repli si le navigateur refuse
 * LocalStorage (navigation privée verrouillée, stockage désactivé).
 * @returns {Backend}
 */
export function backendMemoire() {
  const m = new Map();
  return {
    getItem: (c) => (m.has(c) ? m.get(c) : null),
    setItem: (c, v) => void m.set(c, v),
    removeItem: (c) => void m.delete(c),
  };
}

/**
 * Erreur de stockage. Distincte d'une erreur métier : elle signale que la
 * persistance a échoué, ce qui n'est jamais un cas nominal à avaler.
 */
export class ErreurStockage extends Error {
  /**
   * @param {string} message
   * @param {{cause?: unknown, collection?: string}} [options]
   */
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'ErreurStockage';
    this.collection = options.collection;
  }
}

/**
 * Crée un accès au stockage.
 *
 * @param {Backend} [backend] Par défaut `localStorage`, ou la mémoire s'il est
 *   indisponible — un POC qui refuse de démarrer en navigation privée serait une
 *   mauvaise démonstration, mais la dégradation doit être signalée, pas tue.
 * @param {{onDegradation?: (raison: string) => void}} [options]
 */
export function creerStockage(backend = undefined, options = {}) {
  let socle = backend;
  if (!socle) {
    try {
      const test = `${PREFIXE}__probe`;
      globalThis.localStorage.setItem(test, '1');
      globalThis.localStorage.removeItem(test);
      socle = globalThis.localStorage;
    } catch (cause) {
      socle = backendMemoire();
      options.onDegradation?.(
        'LocalStorage est indisponible. Les données de démonstration ne survivront ' +
          'pas au rechargement de la page.',
      );
    }
  }

  /**
   * Lit une collection. Une collection absente vaut liste vide : c'est un état
   * normal au premier démarrage, pas une erreur.
   *
   * @param {string} collection
   * @returns {Array<Record<string, unknown>>}
   * @throws {ErreurStockage} Si le contenu stocké est illisible. On ne renvoie
   *   pas une liste vide dans ce cas : masquer une corruption ferait croire à une
   *   perte de données silencieuse.
   */
  function lire(collection) {
    const brut = socle.getItem(cleDe(collection));
    if (brut == null) return [];
    try {
      const valeur = JSON.parse(brut);
      if (!Array.isArray(valeur)) {
        throw new ErreurStockage(
          `La collection « ${collection} » ne contient pas une liste.`,
          { collection },
        );
      }
      return valeur;
    } catch (cause) {
      if (cause instanceof ErreurStockage) throw cause;
      throw new ErreurStockage(
        `La collection « ${collection} » est illisible et n’a pas été interprétée.`,
        { cause, collection },
      );
    }
  }

  /**
   * Écrit une collection, hors transaction. À réserver aux écritures isolées :
   * toute opération touchant plusieurs collections passe par `transaction()`.
   *
   * @param {string} collection
   * @param {Array<Record<string, unknown>>} valeur
   */
  function ecrire(collection, valeur) {
    if (!Array.isArray(valeur)) {
      throw new ErreurStockage(
        `Écriture refusée : « ${collection} » attend une liste.`,
        { collection },
      );
    }
    try {
      socle.setItem(cleDe(collection), JSON.stringify(valeur));
    } catch (cause) {
      throw new ErreurStockage(
        `L’écriture de « ${collection} » a échoué. Le stockage du navigateur est ` +
          'probablement saturé.',
        { cause, collection },
      );
    }
  }

  /**
   * Exécute un lot d'écritures en tout ou rien.
   *
   * Le travail reçoit un contexte de transaction : ses lectures voient les
   * écritures déjà posées dans le même lot, ce qui permet d'enchaîner
   * « je lis les mouvements, j'en ajoute deux, je relis le solde » sans surprise.
   *
   * @template T
   * @param {(tx: {lire: (c: string) => Array<Record<string, unknown>>, ecrire: (c: string, v: Array<Record<string, unknown>>) => void}) => T} travail
   * @param {{attendu?: Record<string, number>}} [options]
   *   `attendu` : instantané de versions obtenu par {@link versions} **avant** la
   *   décision que cette transaction applique — typiquement au moment où l'écran
   *   de validation a été construit. Si une de ces collections a changé depuis,
   *   la transaction est refusée : la décision reposait sur un état périmé.
   *   **À fournir sur tout chemin financier.** Sans lui, seules les lectures
   *   faites à l'intérieur de la transaction sont protégées.
   * @returns {T} Ce que rend `travail`.
   * @throws {ErreurStockage|Error} L'erreur d'origine, après restauration complète.
   */
  function transaction(travail, options = {}) {
    // Finding S5 : un journal préexistant signale une transaction antérieure dont
    // la restauration a échoué. L'écraser détruirait la seule trace permettant de
    // rattraper l'incohérence — et la promesse « elles seront rétablies au
    // prochain démarrage » deviendrait fausse. Un mécanisme de récupération que
    // l'usage normal peut détruire n'en est pas un.
    if (socle.getItem(CLE_JOURNAL) != null) {
      throw new ErreurStockage(
        "Une opération précédente n'a pas pu être annulée entièrement. Rechargez " +
          "la page pour que l'état antérieur soit rétabli avant toute nouvelle " +
          'écriture. Aucune donnée ne sera perdue.',
      );
    }

    /** @type {Map<string, Array<Record<string, unknown>>>} */
    const enAttente = new Map();
    /** @type {Map<string, number>} Versions sur lesquelles la décision repose. */
    const versionsLues = new Map();
    /** @type {Set<string>} Clés fines que cette transaction déclare modifier. */
    const cleFines = new Set();
    const versionsInitiales = lireVersions();

    // L'appelant peut fournir l'instantané pris AVANT d'afficher son écran.
    // C'est le cas qui compte : le TOCTOU réel n'est pas à l'intérieur d'une
    // transaction synchrone — JavaScript est mono-thread — mais entre le moment
    // où le service lit le solde pour l'afficher et celui où l'utilisateur
    // clique « Valider ». Entre les deux, un autre onglet a eu tout le loisir
    // d'écrire.
    if (options.attendu) {
      for (const [c, v] of Object.entries(options.attendu)) versionsLues.set(c, v);
    }

    /** @param {string} c */
    const noter = (c) => {
      if (!versionsLues.has(c)) versionsLues.set(c, versionsInitiales[c] ?? 0);
    };

    const tx = {
      /** @param {string} c */
      lire: (c) => {
        noter(c);
        return enAttente.has(c) ? enAttente.get(c) : lire(c);
      },
      /** @param {string} c @param {Array<Record<string, unknown>>} v */
      ecrire: (c, v) => {
        if (!Array.isArray(v)) {
          throw new ErreurStockage(`Écriture refusée : « ${c} » attend une liste.`, {
            collection: c,
          });
        }
        noter(c);
        enAttente.set(c, v);
      },
      /**
       * Déclare qu'une clé fine est modifiée par cette transaction.
       *
       * À utiliser sur tout chemin financier : c'est ce qui permet à deux
       * dossiers indépendants d'être validés en parallèle, tout en faisant
       * échouer deux validations du **même** dossier ou deux débits sur le
       * **même** compte.
       *
       * @param {...string} cles Forme `collection:identifiant`.
       */
      marquer: (...cles) => {
        for (const c of cles) cleFines.add(c);
      },
    };

    const resultat = travail(tx); // une exception ici n'a rien écrit : rien à défaire
    if (enAttente.size === 0) return resultat;

    // Isolation — finding S4. Entre la lecture et ce point, un autre onglet a-t-il
    // écrit ? Si oui, les décisions prises par `travail` reposent sur un état
    // périmé : appliquer par-dessus écraserait son écriture au lieu de la voir.
    const versionsCourantes = lireVersions();
    const conflits = [...versionsLues.entries()]
      .filter(([c, v]) => (versionsCourantes[c] ?? 0) !== v)
      .map(([c]) => c);

    if (conflits.length > 0) {
      throw new ErreurStockage(
        `L'opération a été refusée : les données de ${conflits.join(', ')} ont été ` +
          "modifiées ailleurs pendant votre saisie (un autre onglet, ou une double " +
          'soumission). Rien n’a été écrit. Rechargez la page et recommencez.',
      );
    }

    // Le registre de versions est écrit dans le même lot que les données : il
    // est donc couvert par le journal d'annulation, et un rollback le ramène
    // avec elles. Une version incrémentée sur des données restaurées ferait
    // échouer toutes les transactions suivantes sans raison.
    /** @type {Record<string, number>} */
    const versionsApres = { ...versionsCourantes };
    for (const c of enAttente.keys()) versionsApres[c] = (versionsApres[c] ?? 0) + 1;
    // Les clés fines sont incrémentées en plus des collections : un appelant qui
    // surveille `operations:grp-aff-1` voit passer ce débit, un autre qui
    // surveille `operations:grp-aff-2` ne le voit pas.
    for (const c of cleFines) versionsApres[c] = (versionsApres[c] ?? 0) + 1;

    // 1. Journal d'annulation — état antérieur des seules clés touchées.
    //    Indexé par **clé complète** : le registre de versions en fait partie et
    //    n'est pas une collection, il ne passe donc pas par `cleDe()`.
    /** @type {Record<string, string|null>} */
    const avant = {};
    for (const collection of enAttente.keys()) {
      avant[cleDe(collection)] = socle.getItem(cleDe(collection));
    }
    avant[CLE_VERSIONS] = socle.getItem(CLE_VERSIONS);

    try {
      socle.setItem(CLE_JOURNAL, JSON.stringify({ horodatage: Date.now(), avant }));
    } catch (cause) {
      throw new ErreurStockage(
        "L'opération a été abandonnée : le journal d'annulation n'a pas pu être " +
          "écrit, et sans lui l'intégrité des écritures ne peut pas être garantie.",
        { cause },
      );
    }

    // 2. Application. On retient ce qui a effectivement été écrit : en cas
    //    d'échec, restaurer une clé jamais touchée est une opération inutile qui
    //    peut elle-même échouer et masquer l'erreur d'origine.
    /** @type {string[]} Clés complètes effectivement écrites. */
    const appliquees = [];
    try {
      for (const [collection, valeur] of enAttente) {
        socle.setItem(cleDe(collection), JSON.stringify(valeur));
        appliquees.push(cleDe(collection));
      }
      // Le registre de versions n'est incrémenté qu'une fois les données posées :
      // publier une version nouvelle sur des données anciennes ferait passer un
      // état périmé pour un état à jour auprès des autres onglets.
      socle.setItem(CLE_VERSIONS, JSON.stringify(versionsApres));
      appliquees.push(CLE_VERSIONS);
    } catch (cause) {
      const echecs = restaurer(avant, appliquees);

      if (echecs.length > 0) {
        // La restauration elle-même a échoué. **Le journal reste en place** :
        // c'est la seule trace permettant de rattraper l'incohérence au
        // prochain démarrage. L'effacer ici rendrait la corruption définitive
        // et silencieuse — précisément le défaut qu'on refuse de reproduire.
        throw new ErreurStockage(
          "Une écriture a échoué et l'annulation n'a pas pu être menée à son terme " +
            `(${echecs.join(', ')}). Les données sont peut-être incohérentes ; ` +
            'elles seront rétablies au prochain démarrage. Ne poursuivez pas cette opération.',
          { cause },
        );
      }

      socle.removeItem(CLE_JOURNAL);
      throw new ErreurStockage(
        "L'opération a été annulée intégralement : une écriture a échoué et " +
          "l'état antérieur a été rétabli. Aucune écriture partielle n'a été conservée.",
        { cause },
      );
    }

    // 3. Le journal n'a plus de raison d'être.
    socle.removeItem(CLE_JOURNAL);
    return resultat;
  }

  /**
   * Lit le registre de versions. Un registre absent ou illisible vaut « tout à
   * zéro » : au premier démarrage c'est l'état normal, et sur un registre corrompu
   * c'est le choix prudent — toutes les transactions en cours seront refusées
   * pour conflit plutôt qu'appliquées à l'aveugle.
   *
   * @returns {Record<string, number>}
   */
  function lireVersions() {
    const brut = socle.getItem(CLE_VERSIONS);
    if (brut == null) return {};
    try {
      const v = JSON.parse(brut);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }

  /**
   * Rétablit l'état antérieur des clés indiquées.
   *
   * Ne s'arrête pas à la première difficulté : une clé récalcitrante ne doit pas
   * empêcher de rétablir les autres. Les échecs sont rendus à l'appelant, à qui
   * il revient de décider — jamais avalés.
   *
   * @param {Record<string, string|null>} avant Indexé par clé complète.
   * @param {string[]} [seulement] Clés à rétablir. Par défaut, toutes.
   * @returns {string[]} Clés qui n'ont pas pu être rétablies.
   */
  function restaurer(avant, seulement = undefined) {
    const cibles = seulement ?? Object.keys(avant);
    /** @type {string[]} */
    const echecs = [];
    for (const cle of cibles) {
      const brut = avant[cle];
      try {
        if (brut == null) socle.removeItem(cle);
        else socle.setItem(cle, brut);
      } catch {
        echecs.push(cle);
      }
    }
    return echecs;
  }

  /**
   * Défait une transaction interrompue. **À appeler au démarrage, avant toute
   * lecture métier.** Une interruption entre l'application et l'effacement du
   * journal laisserait sinon des écritures partielles — exactement ce que le
   * mécanisme existe pour empêcher.
   *
   * @returns {{restauree: boolean, collections: string[]}} `collections` porte
   *   les clés complètes rétablies, registre de versions compris.
   */
  function restaurerSiInterrompu() {
    const brut = socle.getItem(CLE_JOURNAL);
    if (brut == null) return { restauree: false, collections: [] };

    try {
      const { avant } = JSON.parse(brut);
      if (avant == null || typeof avant !== 'object' || Array.isArray(avant)) {
        // Finding S15 : le rejeu est une primitive d'écriture. On ne peut pas en
        // faire un mécanisme authentifié sans backend, mais on peut au moins
        // refuser d'appliquer un journal qui n'a pas la forme attendue.
        throw new ErreurStockage(
          "Le journal d'annulation trouvé au démarrage n'a pas une forme exploitable. " +
            'Aucune restauration n’a été tentée. Réinitialisez la démonstration.',
        );
      }
      const malforme = Object.entries(avant).find(
        ([cle, val]) => !cle.startsWith(PREFIXE) || (val !== null && typeof val !== 'string'),
      );
      if (malforme) {
        throw new ErreurStockage(
          `Le journal d'annulation vise une clé inattendue (« ${malforme[0]} »). ` +
            'Aucune restauration n’a été tentée. Réinitialisez la démonstration.',
        );
      }

      const echecs = restaurer(avant);
      if (echecs.length > 0) {
        // Le journal est conservé pour une nouvelle tentative au démarrage suivant.
        throw new ErreurStockage(
          `Le rétablissement des clés ${echecs.join(', ')} a échoué. ` +
            'Les données sont peut-être incohérentes. Réinitialisez la démonstration.',
        );
      }
      socle.removeItem(CLE_JOURNAL);
      return { restauree: true, collections: Object.keys(avant) };
    } catch (cause) {
      if (cause instanceof ErreurStockage) throw cause;
      // Le journal lui-même est illisible. On ne le supprime pas en silence :
      // détruire la seule trace d'une écriture partielle serait le pire choix.
      throw new ErreurStockage(
        "Un journal d'annulation illisible a été trouvé au démarrage. Les données " +
          'peuvent être incohérentes. Réinitialisez la démonstration.',
        { cause },
      );
    }
  }

  /**
   * Efface toutes les collections du POC. **Ne touche qu'aux clés préfixées
   * `b2f_`** : la réinitialisation de la démonstration ne doit pas emporter les
   * données du POC DUT servi depuis la même origine.
   *
   * @param {string[]} collections Collections déclarées au schéma.
   */
  function reinitialiser(collections, preferences = []) {
    for (const c of collections) socle.removeItem(cleDe(c));
    for (const p of preferences) socle.removeItem(`${PREFIXE}pref_${p}`);
    socle.removeItem(CLE_JOURNAL);
    socle.removeItem(CLE_VERSIONS);
  }

  /**
   * Lit une préférence d'affichage.
   *
   * Les préférences ne sont pas des collections : ce sont des paires clé-valeur
   * par utilisateur (critères de recherche conservés, `M3.6`). Elles passent
   * néanmoins par ce module — correctif QA-09 — pour trois raisons : le préfixe
   * reste fabriqué en un seul point, la réinitialisation de la démonstration les
   * emporte, et une vue ne touche plus LocalStorage.
   *
   * @param {string} cle
   * @returns {unknown}
   */
  function lirePreference(cle) {
    const brut = socle.getItem(`${PREFIXE}pref_${cle}`);
    if (brut == null) return null;
    try {
      return JSON.parse(brut);
    } catch {
      return null; // une préférence illisible n'est pas une corruption de données
    }
  }

  /**
   * Écrit une préférence d'affichage. Une écriture impossible n'interrompt rien :
   * perdre un critère de recherche n'est pas une erreur métier.
   * @param {string} cle
   * @param {unknown} valeur
   */
  function ecrirePreference(cle, valeur) {
    try {
      socle.setItem(`${PREFIXE}pref_${cle}`, JSON.stringify(valeur));
    } catch {
      /* sans persistance, la préférence vaut pour la session */
    }
  }

  /**
   * Un journal d'annulation traîne-t-il ? Le bootstrap J2 le vérifie **avant
   * toute lecture métier** et refuse de démarrer sans avoir rejoué (finding S14 :
   * le commentaire l'exigeait, rien ne l'imposait).
   * @returns {boolean}
   */
  function aUnJournalEnAttente() {
    return socle.getItem(CLE_JOURNAL) != null;
  }

  /**
   * Instantané des versions courantes, à capturer **avant** de prendre une
   * décision qu'une transaction appliquera plus tard, puis à repasser en
   * `options.attendu`. C'est le jeton que l'en-tête de ce module annonçait sans
   * qu'il existe (finding S4).
   *
   * @param {string[]} [cles] Clés à relever — une collection (`'operations'`) ou
   *   un objet (`'operations:grp-aff-1'`). Par défaut, tout le registre.
   * @returns {Record<string, number>}
   */
  function versions(cles = undefined) {
    const v = lireVersions();
    if (!cles) return v;
    /** @type {Record<string, number>} */
    const extrait = {};
    for (const c of cles) extrait[c] = v[c] ?? 0;
    return extrait;
  }

  return Object.freeze({
    lire,
    ecrire,
    transaction,
    versions,
    lirePreference,
    ecrirePreference,
    restaurerSiInterrompu,
    aUnJournalEnAttente,
    reinitialiser,
  });
}
