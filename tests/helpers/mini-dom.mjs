/**
 * DOM minimal pour tester le rendu des vues sous Node, sans dépendance.
 *
 * Couvre exactement ce que `core/dom.js` et les vues utilisent. Volontairement
 * petit : ce n'est pas un navigateur, c'est un harnais qui prouve que les vues
 * **se construisent sans erreur** et permet d'inspecter l'arbre produit.
 *
 * Il rend aussi vérifiable une garantie qu'aucune relecture ne peut assurer :
 * `innerHTML` n'existe pas ici. Une vue qui l'utiliserait échouerait au test.
 */

class Classes {
  constructor(noeud) {
    this.noeud = noeud;
    this.set = new Set();
  }
  add(...noms) {
    for (const n of noms) if (n) this.set.add(n);
  }
  contains(n) {
    return this.set.has(n);
  }
  toString() {
    return [...this.set].join(' ');
  }
}

class Noeud {
  constructor(tag) {
    this.tag = String(tag).toLowerCase();
    this.enfants = [];
    this.attributs = {};
    this.ecouteurs = {};
    this.dataset = {};
    this.classList = new Classes(this);
    this.parent = null;
    this._texte = '';
    this.value = '';
  }

  get textContent() {
    if (this.enfants.length === 0) return this._texte;
    return this.enfants.map((e) => (typeof e === 'string' ? e : e.textContent)).join('');
  }
  set textContent(v) {
    this.enfants = [];
    this._texte = String(v);
  }

  // Volontairement absent : innerHTML, outerHTML, insertAdjacentHTML.

  setAttribute(nom, valeur) {
    this.attributs[nom] = String(valeur);
    if (nom === 'value') this.value = String(valeur);
    if (nom === 'id') registre.set(String(valeur), this);
  }
  getAttribute(nom) {
    return this.attributs[nom] ?? null;
  }
  hasAttribute(nom) {
    return nom in this.attributs;
  }
  removeAttribute(nom) {
    delete this.attributs[nom];
  }
  addEventListener(evt, fn) {
    (this.ecouteurs[evt] ??= []).push(fn);
  }
  removeEventListener() {}
  focus() {}
  remove() {
    if (this.parent) this.parent.enfants = this.parent.enfants.filter((e) => e !== this);
  }

  append(...noeuds) {
    for (const n of noeuds.flat()) {
      if (n === null || n === undefined) continue;
      if (n instanceof Fragment) {
        this.append(...n.enfants);
        continue;
      }
      if (n instanceof Noeud) n.parent = this;
      this.enfants.push(n);
    }
  }
  replaceChildren(...noeuds) {
    this.enfants = [];
    this._texte = '';
    this.append(...noeuds);
  }

  /** Parcours en profondeur, texte compris. */
  *descendants() {
    for (const e of this.enfants) {
      if (e instanceof Noeud) {
        yield e;
        yield* e.descendants();
      }
    }
  }

  /** Sélecteur très réduit : `tag`, `.classe`, `[attr]`, listes séparées par virgule. */
  querySelectorAll(selecteur) {
    const criteres = selecteur.split(',').map((s) => s.trim());
    const correspond = (n) =>
      criteres.some((c) => {
        if (c.startsWith('.')) return n.classList.contains(c.slice(1));
        if (c.startsWith('[')) {
          const attr = c.slice(1, -1).split('=')[0].replace(/:not.*$/, '');
          return attr in n.attributs;
        }
        return n.tag === c.toLowerCase();
      });
    return [...this.descendants()].filter(correspond);
  }
  querySelector(s) {
    return this.querySelectorAll(s)[0] ?? null;
  }

  /** Déclenche un événement, pour simuler un clic dans un test. */
  declencher(evt, detail = {}) {
    for (const fn of this.ecouteurs[evt] ?? []) fn({ preventDefault() {}, target: this, ...detail });
  }
}

class Fragment {
  constructor() {
    this.enfants = [];
  }
  append(...noeuds) {
    for (const n of noeuds.flat()) if (n !== null && n !== undefined) this.enfants.push(n);
  }
}

/** Registre des identifiants, pour `getElementById`. */
const registre = new Map();

/**
 * Installe le DOM minimal dans les globales.
 * @returns {{document: any, racine: Noeud, reinitialiser: () => void}}
 */
export function installerDom() {
  const racine = new Noeud('div');
  racine.setAttribute('id', 'app');

  const corps = new Noeud('body');
  corps.append(racine);

  const documentFactice = {
    body: corps,
    documentElement: new Noeud('html'),
    activeElement: null,
    createElement: (tag) => new Noeud(tag),
    createElementNS: (_ns, tag) => new Noeud(tag),
    createTextNode: (t) => String(t),
    createDocumentFragment: () => new Fragment(),
    getElementById: (id) => registre.get(id) ?? null,
    querySelectorAll: (s) => corps.querySelectorAll(s),
    querySelector: (s) => corps.querySelector(s),
    addEventListener: () => {},
  };
  documentFactice.documentElement.dataset = {};

  globalThis.document = documentFactice;
  globalThis.HTMLElement = Noeud;
  globalThis.HashChangeEvent = class {
    constructor(type) {
      this.type = type;
    }
  };
  globalThis.localStorage ??= {
    _m: new Map(),
    getItem(k) {
      return this._m.has(k) ? this._m.get(k) : null;
    },
    setItem(k, v) {
      this._m.set(k, String(v));
    },
    removeItem(k) {
      this._m.delete(k);
    },
  };
  globalThis.sessionStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.location ??= { hash: '' };
  globalThis.setTimeout ??= (fn) => fn();

  return {
    document: documentFactice,
    racine,
    reinitialiser: () => {
      registre.clear();
      racine.replaceChildren();
      corps.replaceChildren(racine);
    },
  };
}

/**
 * Texte intégral d'un arbre rendu.
 * @param {Noeud} noeud
 * @returns {string}
 */
export function texteDe(noeud) {
  return noeud.textContent;
}

/**
 * Tous les nœuds d'un arbre portant une classe.
 * @param {Noeud} noeud
 * @param {string} classe
 */
export function parClasse(noeud, classe) {
  return [...noeud.descendants()].filter((n) => n.classList.contains(classe));
}

export { Noeud, Fragment };
