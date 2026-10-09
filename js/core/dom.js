/**
 * Construction du DOM — **le seul moyen de produire de l'interface dans B2F**.
 *
 * ## Pourquoi ce module existe
 *
 * L'audit de sécurité (finding S13) a identifié la seule surface XSS réaliste
 * d'un POC sans backend : le domaine fabrique des chaînes mêlant message et
 * données saisies par des utilisateurs — raison sociale, observation, motif de
 * rejet. Rendues en `innerHTML`, une raison sociale valant
 * `<img src=x onerror=...>` s'exécuterait **dans le navigateur de la
 * contrepartie**. La fuite traverse les groupements.
 *
 * La parade retenue n'est pas une règle de revue — une règle qu'on peut oublier
 * n'en est pas une — mais un module qui **ne sait pas** produire du HTML à partir
 * d'une chaîne. Tout texte passe par `textContent`. Il n'existe ici aucune
 * fonction acceptant du balisage.
 *
 * La maquette de `docs/ux/maquettes/` écrit du HTML par gabarits littéraux non
 * échappés : c'est acceptable pour des données figées, **jamais dans le produit**
 * (`02-design-system-b2f.md` § 6).
 *
 * @module core/dom
 */

/**
 * Crée un élément.
 *
 * @param {string} tag Nom de balise, éventuellement suffixé de classes :
 *   `'div.card.card-lg'`.
 * @param {Record<string, any>} [attrs] Attributs. Conventions :
 *   - `class` / `className` : classes supplémentaires ;
 *   - `text` : contenu textuel, posé par `textContent` ;
 *   - `html` : **refusé**, lève — c'est le point de ce module ;
 *   - `dataset` : objet des `data-*` ;
 *   - `on` : objet `{ click: fn }` d'écouteurs ;
 *   - toute autre clé : attribut, ignoré si `null`/`undefined`/`false`.
 * @param {Array<Node|string|null|undefined|false>} [enfants]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, enfants = []) {
  const [nom, ...classes] = tag.split('.');
  const noeud = document.createElement(nom);
  if (classes.length) noeud.classList.add(...classes);

  for (const [cle, valeur] of Object.entries(attrs)) {
    if (valeur === null || valeur === undefined || valeur === false) continue;

    if (cle === 'html' || cle === 'innerHTML') {
      throw new Error(
        'Interdit : le HTML ne se construit pas à partir d’une chaîne dans B2F. ' +
          'Utilisez `text` pour du texte, ou composez des éléments. ' +
          'Voir le finding S13 de l’audit de sécurité.',
      );
    }
    if (cle === 'text') {
      noeud.textContent = String(valeur);
      continue;
    }
    if (cle === 'class' || cle === 'className') {
      noeud.classList.add(...String(valeur).split(/\s+/).filter(Boolean));
      continue;
    }
    if (cle === 'dataset') {
      for (const [d, v] of Object.entries(valeur)) {
        if (v !== null && v !== undefined) noeud.dataset[d] = String(v);
      }
      continue;
    }
    if (cle === 'on') {
      for (const [evt, fn] of Object.entries(valeur)) noeud.addEventListener(evt, fn);
      continue;
    }
    if (valeur === true) {
      noeud.setAttribute(cle, '');
      continue;
    }
    noeud.setAttribute(cle, String(valeur));
  }

  for (const enfant of enfants.flat()) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    noeud.append(typeof enfant === 'string' ? document.createTextNode(enfant) : enfant);
  }
  return noeud;
}

/**
 * Icône du sprite Lucide local. Aucune dépendance réseau (écart E1).
 * @param {string} nom Identifiant sans le préfixe `ic-`.
 * @param {number} [taille]
 * @returns {SVGElement}
 */
export function icone(nom, taille = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#ic-${nom}`);
  svg.append(use);
  return svg;
}

/**
 * Remplace le contenu d'un conteneur.
 * @param {HTMLElement} conteneur
 * @param {...(Node|string|null|undefined|false)} enfants
 */
export function remplacer(conteneur, ...enfants) {
  conteneur.replaceChildren();
  for (const e of enfants.flat()) {
    if (e === null || e === undefined || e === false) continue;
    conteneur.append(typeof e === 'string' ? document.createTextNode(e) : e);
  }
}

/**
 * Fragment, pour rendre une liste sans conteneur.
 * @param {Array<Node|string|null|undefined|false>} enfants
 * @returns {DocumentFragment}
 */
export function fragment(enfants) {
  const f = document.createDocumentFragment();
  for (const e of enfants.flat()) {
    if (e === null || e === undefined || e === false) continue;
    f.append(typeof e === 'string' ? document.createTextNode(e) : e);
  }
  return f;
}

/* ------------------------------------------------------------------ *
 * Formatage — un seul endroit, pour que les montants et les dates se
 * présentent partout de la même façon.
 * ------------------------------------------------------------------ */

/**
 * Montant en franc CFA, sans décimale.
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function montant(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('fr-FR')} F CFA`;
}

/**
 * Date seule, format ivoirien.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function date(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Date et heure.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function dateHeure(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Nombre de jours entiers écoulés depuis une date.
 * @param {string} iso
 * @returns {number}
 */
export function joursDepuis(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Nombre d'heures entières écoulées depuis une date.
 * Sert au signalement des 48 heures (question U4, décision D38) : le calcul se
 * fait **à l'affichage**, il n'existe aucune tâche planifiée ni expiration.
 * @param {string} iso
 * @returns {number}
 */
export function heuresDepuis(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
}
