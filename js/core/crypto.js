/**
 * Empreintes de mot de passe — PBKDF2-SHA256 via Web Crypto.
 *
 * ## Ce qu'on démontre
 *
 * Un hachage lent, salé et paramétré, à la place d'un condensat rapide sans sel.
 * Le détail des pratiques du système à remplacer relève du cadrage, qui n'est pas
 * versionné ici : ce module ne porte que la cible.
 *
 * ## Ce que cela ne prouve PAS
 *
 * Les empreintes restent dans LocalStorage, donc lisibles par quiconque ouvre les
 * outils de développement. **Le POC ne démontre rien sur l'authentification.** Ce
 * que ce module démontre, c'est la pratique correcte et le format de stockage qui
 * permet de migrer.
 *
 * ## Le paramètre de coût est stocké avec l'empreinte
 *
 * `{ algo, iterations, sel, empreinte }` : un durcissement ultérieur du nombre
 * d'itérations reste possible sans réinitialiser les comptes — on revérifie avec
 * les paramètres d'origine, puis on réécrit avec les nouveaux. Un stockage qui ne
 * retient que l'empreinte ne peut pas migrer sans forcer une réinitialisation
 * générale.
 *
 * @module core/crypto
 */

/** Paramètres courants. Le coût est un compromis : la vérification se fait dans
 *  le navigateur de démonstration, sur des machines quelconques. */
export const PARAMETRES = Object.freeze({
  algo: 'PBKDF2-SHA256',
  iterations: 120000,
  longueurSelOctets: 16,
  longueurCleBits: 256,
});

/**
 * @typedef {object} Empreinte
 * @property {string} algo
 * @property {number} iterations
 * @property {string} sel        Base64.
 * @property {string} empreinte  Base64.
 */

/**
 * Accès à Web Crypto. Indisponible hors contexte sécurisé — `localhost` en est
 * un, une page servie en `http://` depuis une IP ne l'est pas.
 * @returns {SubtleCrypto}
 * @throws {Error} Message actionnable plutôt qu'un `undefined is not an object`.
 */
function subtle() {
  const c = globalThis.crypto?.subtle;
  if (!c) {
    throw new Error(
      "Web Crypto est indisponible : la page n'est pas servie dans un contexte " +
        'sécurisé. Ouvrez la démonstration sur http://localhost:8081 (ou en HTTPS). ' +
        'Le POC refuse de se rabattre sur un hachage plus faible.',
    );
  }
  return c;
}

/** @param {ArrayBuffer|Uint8Array} buf @returns {string} */
function versBase64(buf) {
  const octets = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

/** @param {string} b64 @returns {Uint8Array} */
function depuisBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Dérive une empreinte.
 * @param {string} motDePasse
 * @param {Uint8Array} sel
 * @param {number} iterations
 * @returns {Promise<string>} Empreinte en base64.
 */
async function deriver(motDePasse, sel, iterations) {
  const cle = await subtle().importKey(
    'raw',
    new TextEncoder().encode(motDePasse),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: sel, iterations, hash: 'SHA-256' },
    cle,
    PARAMETRES.longueurCleBits,
  );
  return versBase64(bits);
}

/**
 * Produit l'empreinte d'un mot de passe, avec un sel aléatoire par compte.
 * @param {string} motDePasse
 * @returns {Promise<Empreinte>}
 */
export async function hacher(motDePasse) {
  if (typeof motDePasse !== 'string' || motDePasse.length === 0) {
    throw new Error('Mot de passe vide : refusé.');
  }
  const sel = globalThis.crypto.getRandomValues(
    new Uint8Array(PARAMETRES.longueurSelOctets),
  );
  const empreinte = await deriver(motDePasse, sel, PARAMETRES.iterations);
  return {
    algo: PARAMETRES.algo,
    iterations: PARAMETRES.iterations,
    sel: versBase64(sel),
    empreinte,
  };
}

/**
 * Vérifie un mot de passe contre une empreinte stockée.
 *
 * La comparaison est à **temps constant**. Dans un POC sans réseau, l'attaque
 * temporelle est théorique ; l'écrire correctement coûte trois lignes et évite
 * qu'un portage recopie une comparaison naïve.
 *
 * @param {string} motDePasse
 * @param {Empreinte|null|undefined} stockee
 * @returns {Promise<boolean>}
 */
export async function verifier(motDePasse, stockee) {
  if (!stockee?.empreinte || !stockee?.sel) return false;
  if (stockee.algo !== PARAMETRES.algo) {
    throw new Error(
      `Empreinte produite par un algorithme non pris en charge (« ${stockee.algo} »). ` +
        'Une migration est nécessaire — elle est possible précisément parce que ' +
        "l'algorithme est stocké avec l'empreinte.",
    );
  }
  const candidate = await deriver(
    motDePasse,
    depuisBase64(stockee.sel),
    stockee.iterations ?? PARAMETRES.iterations,
  );
  return egalTempsConstant(candidate, stockee.empreinte);
}

/**
 * Indique si l'empreinte gagnerait à être recalculée avec les paramètres
 * courants. À appeler après une vérification réussie.
 * @param {Empreinte} stockee
 * @returns {boolean}
 */
export function aRehacher(stockee) {
  return (stockee?.iterations ?? 0) < PARAMETRES.iterations;
}

/**
 * Comparaison de chaînes à temps constant.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function egalTempsConstant(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Identifiant unique. `crypto.randomUUID` quand il existe, repli explicite sinon.
 * @param {string} [prefixe]
 * @returns {string}
 */
export function identifiant(prefixe = '') {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefixe ? `${prefixe}-${uuid.slice(0, 8)}` : uuid;
}

/**
 * Empreinte SHA-256 hexadécimale d'un texte.
 *
 * Sert au pied de page du PDF DUT : deux tirages des mêmes données donnent la
 * même empreinte, un champ modifié en donne une autre. **Ce n'est pas une
 * signature** — rien n'est authentifié ici, et quiconque dispose des données peut
 * recalculer la valeur. Elle détecte la divergence entre un papier et un
 * enregistrement, pas la falsification délibérée des deux.
 *
 * @param {string} texte
 * @returns {Promise<string>} 64 caractères hexadécimaux.
 * @throws {Error} Si Web Crypto est indisponible — hors contexte sécurisé
 *   (`file://`), l'absence doit être signalée, pas contournée par un repli faible.
 */
export async function empreinteSha256(texte) {
  const sousJacent = globalThis.crypto?.subtle;
  if (!sousJacent) {
    throw new Error(
      'Web Crypto est indisponible. Servez la démonstration depuis http://localhost ' +
        'plutôt que depuis un fichier local.',
    );
  }
  const octets = await sousJacent.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}
