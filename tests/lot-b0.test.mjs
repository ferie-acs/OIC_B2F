/**
 * Lot b0 — recherche intégrée à toutes les listes de choix.
 *
 * Deux garanties :
 * 1. le filtrage est insensible à la casse et aux accents, respecte les groupes
 *    et n'invente aucune option ;
 * 2. l'amélioration ne retire ni ne remplace le `<select>` natif : même id,
 *    même valeur, mêmes événements `change`, même étiquette. Le code des vues et
 *    les formulaires continuent de le lire.
 *
 * Le DOM de test (`helpers/mini-dom.mjs`) est complété ici, pour ce fichier
 * seulement, des quelques primitives qu'un `<select>` exige : options,
 * `selectedIndex`, `insertBefore`, `dispatchEvent`.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { installerDom, Noeud } from './helpers/mini-dom.mjs';

const { document: doc, racine, reinitialiser } = installerDom();

/* ------------------------------------------------------------------ *
 * Compléments du DOM de test (portée : ce fichier)
 * ------------------------------------------------------------------ */

Object.defineProperties(Noeud.prototype, {
  tagName: { get() { return this.tag.toUpperCase(); }, configurable: true },
  nodeType: { get() { return 1; }, configurable: true },
  parentNode: { get() { return this.parent; }, configurable: true },
  children: { get() { return this.enfants.filter((e) => e instanceof Noeud); }, configurable: true },
  firstChild: { get() { return this.enfants[0] ?? null; }, configurable: true },
  isConnected: {
    get() {
      let n = this;
      while (n.parent) n = n.parent;
      return n === doc.body;
    },
    configurable: true,
  },
  className: {
    get() { return this.classList.toString(); },
    set(v) {
      this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean));
    },
    configurable: true,
  },
});
Noeud.prototype.insertBefore = function insertBefore(n, ref) {
  if (n.parent) n.parent.enfants = n.parent.enfants.filter((e) => e !== n);
  n.parent = this;
  const i = ref ? this.enfants.indexOf(ref) : -1;
  if (i < 0) this.enfants.push(n);
  else this.enfants.splice(i, 0, n);
  return n;
};
Noeud.prototype.contains = function contains(n) {
  for (let x = n; x; x = x.parent) if (x === this) return true;
  return false;
};
Noeud.prototype.closest = function closest() { return null; };
Noeud.prototype.dispatchEvent = function dispatchEvent(evt) {
  for (const fn of this.ecouteurs[evt.type] ?? []) fn(evt);
  return true;
};
const Classes = new Noeud('div').classList.constructor;
Classes.prototype.remove = function remove(...noms) {
  for (const n of noms) this.set.delete(n);
};
Classes.prototype[Symbol.iterator] = function iterer() {
  return this.set[Symbol.iterator]();
};

/** `<option>` : `selected`, `disabled`, `label`, `value`. */
class OptionTest extends Noeud {
  constructor() {
    super('option');
    this._selected = false;
  }
  get selected() { return this._selected; }
  set selected(v) {
    if (v && this.parent) for (const o of selectDe(this)?.options ?? []) o._selected = false;
    this._selected = Boolean(v);
  }
  get disabled() { return this.hasAttribute('disabled'); }
  get hidden() { return this.hasAttribute('hidden'); }
  get label() { return this.getAttribute('label') ?? this.textContent; }
  setAttribute(nom, v) {
    super.setAttribute(nom, v);
    if (nom === 'selected') this.selected = true;
  }
}

/** `<optgroup>`. */
class GroupeTest extends Noeud {
  constructor() { super('optgroup'); }
  get label() { return this.getAttribute('label') ?? ''; }
  get disabled() { return this.hasAttribute('disabled'); }
  get hidden() { return false; }
}

/** `<select>` : `value` et `selectedIndex` sont des accesseurs, comme dans un navigateur. */
class SelectTest extends Noeud {
  constructor() { super('select'); }
  get options() { return [...this.descendants()].filter((n) => n instanceof OptionTest); }
  get value() {
    const o = this.options.find((x) => x.selected) ?? (this.multiple ? null : this.options[0]);
    return o ? (o.getAttribute('value') ?? o.textContent) : '';
  }
  set value(v) {
    for (const o of this.options) o._selected = (o.getAttribute('value') ?? o.textContent) === String(v);
  }
  get selectedIndex() {
    const i = this.options.findIndex((o) => o.selected);
    return i < 0 && !this.multiple && this.options.length ? 0 : i;
  }
  set selectedIndex(i) { this.options.forEach((o, k) => { o._selected = k === i; }); }
  get disabled() { return this.hasAttribute('disabled'); }
  get required() { return this.hasAttribute('required'); }
  get multiple() { return this.hasAttribute('multiple'); }
  get hidden() { return this.hasAttribute('hidden'); }
  get labels() { return []; }
}

/** @param {Noeud} option */
function selectDe(option) {
  for (let n = option.parent; n; n = n.parent) if (n instanceof SelectTest) return n;
  return null;
}

const creerNatif = doc.createElement;
doc.createElement = (tag) => {
  const t = String(tag).toLowerCase();
  if (t === 'select') return new SelectTest();
  if (t === 'option') return new OptionTest();
  if (t === 'optgroup') return new GroupeTest();
  return creerNatif(tag);
};
Object.defineProperty(OptionTest.prototype, 'value', {
  get() { return this.getAttribute('value') ?? this.textContent; },
  set(v) { this.attributs.value = String(v); },
  configurable: true,
});

const { el } = await import('../js/core/dom.js');
const { champ } = await import('../js/core/ui.js');
const {
  normaliser, correspond, filtrerEntrees, lireEntrees, ameliorer, instanceDe,
  TEXTE_RECHERCHE,
} = await import('../js/core/liste-recherche.js');

/** Un select de villes, monté dans le document. */
function villes({ valeur = 'bke' } = {}) {
  const s = el('select.select', { id: 'ville', name: 'ville' }, [
    el('option', { value: '', text: '— Choisir —' }),
    el('option', { value: 'abj', text: 'Abidjan' }),
    el('option', { value: 'bke', text: 'Bouaké', selected: valeur === 'bke' || undefined }),
    el('option', { value: 'spy', text: 'San-Pédro' }),
    el('option', { value: 'yam', text: 'Yamoussoukro', disabled: true }),
  ]);
  racine.append(s);
  return s;
}

/* ------------------------------------------------------------------ *
 * Filtrage
 * ------------------------------------------------------------------ */

describe('Lot b0 — filtrage insensible à la casse et aux accents', () => {
  it('normalise accents, casse, ligatures, apostrophes et espaces', () => {
    assert.equal(normaliser('Bouaké'), 'bouake');
    assert.equal(normaliser('  ÉBÈNE   Côte  '), 'ebene cote');
    assert.equal(normaliser('Cœur'), 'coeur');
    assert.equal(normaliser('Côte d’Ivoire'), normaliser("cote d'ivoire"));
    assert.equal(normaliser(null), '');
  });

  it('retrouve un libellé accentué par une saisie sans accent, et l’inverse', () => {
    assert.ok(correspond('Bouaké', 'bouake'));
    assert.ok(correspond('Bouake', 'BOUAKÉ'));
    assert.ok(correspond('San-Pédro', 'pedro'));
    assert.ok(correspond('Côte d’Ivoire', "cote d'iv"));
  });

  it('exige chaque mot saisi, dans n’importe quel ordre', () => {
    assert.ok(correspond('Abidjan — Port autonome', 'port abidjan'));
    assert.ok(!correspond('Abidjan — Port autonome', 'port bouake'));
  });

  it('retient tout pour une recherche vide et rien pour une recherche absente', () => {
    const entrees = [
      { type: 'option', libelle: 'Abidjan', valeur: 'a', desactive: false },
      { type: 'option', libelle: 'Bouaké', valeur: 'b', desactive: false },
    ];
    assert.equal(filtrerEntrees(entrees, '').length, 2);
    assert.equal(filtrerEntrees(entrees, '   ').length, 2);
    assert.deepEqual(filtrerEntrees(entrees, 'korhogo'), []);
  });

  it('respecte les groupes : titre qui correspond, options filtrées, groupe vide écarté', () => {
    const entrees = [
      { type: 'groupe', libelle: 'Région du Sud', desactive: false, options: [
        { type: 'option', libelle: 'Abidjan', valeur: 'a', desactive: false },
        { type: 'option', libelle: 'San-Pédro', valeur: 's', desactive: false },
      ] },
      { type: 'groupe', libelle: 'Région du Centre', desactive: false, options: [
        { type: 'option', libelle: 'Bouaké', valeur: 'b', desactive: false },
      ] },
    ];
    const sud = filtrerEntrees(entrees, 'sud');
    assert.equal(sud.length, 1);
    assert.equal(sud[0].options.length, 2, 'le titre du groupe retient toutes ses options');
    const pedro = filtrerEntrees(entrees, 'PEDRO');
    assert.deepEqual(pedro.map((g) => g.options.map((o) => o.valeur)), [['s']]);
    assert.ok(!entrees[0].options.every((o) => o.valeur === 's'), 'le modèle d’origine n’est pas modifié');
  });

  it('lit options, groupes, options désactivées et masquées d’un select', () => {
    const s = el('select', {}, [
      el('option', { value: '', text: 'Tous' }),
      el('optgroup', { label: 'Camions' }, [
        el('option', { value: 'b', text: 'Bâché' }),
        el('option', { value: 'c', text: 'Citerne', disabled: true }),
      ]),
      el('optgroup', { label: 'Fermé', disabled: true }, [el('option', { value: 'f', text: 'Frigorifique' })]),
      el('option', { value: 'h', text: 'Caché', hidden: true }),
    ]);
    const entrees = lireEntrees(s);
    assert.deepEqual(entrees.map((e) => e.type), ['option', 'groupe', 'groupe']);
    assert.equal(entrees[1].libelle, 'Camions');
    assert.deepEqual(entrees[1].options.map((o) => [o.valeur, o.desactive]), [['b', false], ['c', true]]);
    assert.equal(entrees[2].options[0].desactive, true, 'un groupe désactivé désactive ses options');
  });
});

/* ------------------------------------------------------------------ *
 * Conservation du select natif
 * ------------------------------------------------------------------ */

describe('Lot b0 — le select natif reste la source de vérité', () => {
  beforeEach(() => reinitialiser());

  it('garde le select dans le document, avec son id, son nom et sa valeur', () => {
    const s = villes();
    const instance = ameliorer(s);
    assert.ok(instance, 'le select est amélioré');
    assert.equal(doc.getElementById('ville'), s, 'même élément, même id');
    assert.equal(s.getAttribute('name'), 'ville');
    assert.equal(s.value, 'bke', 'la valeur est intacte');
    assert.ok(racine.contains(s), 'le select reste dans le document');
    assert.ok(s.classList.contains('lr-natif'), 'il est seulement masqué');
    assert.equal(s.parent, instance.enveloppe, 'il est rangé dans l’enveloppe, à la même place');
    assert.equal(instance.enveloppe.parent, racine);
  });

  it('affiche le libellé choisi sur le déclencheur, avec un rôle combobox', () => {
    const s = villes();
    const { declencheur, valeur } = ameliorer(s);
    assert.equal(valeur.textContent, 'Bouaké');
    assert.equal(declencheur.getAttribute('role'), 'combobox');
    assert.equal(declencheur.getAttribute('aria-expanded'), 'false');
    assert.ok(declencheur.classList.contains('select'), 'il reprend les classes du select');
  });

  it('écrit le choix dans le select et émet input puis change, une seule fois', () => {
    const s = villes();
    const recus = [];
    s.addEventListener('input', () => recus.push('input'));
    s.addEventListener('change', () => recus.push(`change:${s.value}`));
    const instance = ameliorer(s);
    instance.saisie.value = 'pedro';
    instance.rendreListe({ actif: 'premier' });
    assert.deepEqual(instance.visibles.map((o) => o.valeur), ['spy'], 'recherche sans accent');
    instance.choisir(0);
    assert.equal(s.value, 'spy');
    assert.deepEqual(recus, ['input', 'change:spy']);
    assert.equal(instance.valeur.textContent, 'San-Pédro');
  });

  it('refuse une option désactivée : la valeur ne change pas, aucun événement', () => {
    const s = villes();
    let changes = 0;
    s.addEventListener('change', () => changes++);
    const instance = ameliorer(s);
    instance.saisie.value = 'yamou';
    instance.rendreListe({ actif: 'premier' });
    assert.equal(instance.visibles.length, 1);
    assert.equal(instance.actif, -1, 'une option désactivée n’est jamais mise en évidence');
    instance.choisir(0);
    assert.equal(s.value, 'bke');
    assert.equal(changes, 0);
  });

  it('suit une valeur posée par programme', () => {
    const s = villes();
    const instance = ameliorer(s);
    s.value = 'abj';
    assert.equal(s.value, 'abj', 'le comportement natif est conservé');
    assert.equal(instance.valeur.textContent, 'Abidjan');
    s.selectedIndex = 3;
    assert.equal(instance.valeur.textContent, 'San-Pédro');
  });

  it('reporte l’état désactivé et obligatoire sur le déclencheur', () => {
    const s = villes();
    s.setAttribute('required', '');
    s.setAttribute('disabled', '');
    const { declencheur } = ameliorer(s);
    assert.equal(declencheur.disabled, true);
    assert.equal(declencheur.getAttribute('aria-required'), 'true');
  });

  it('est idempotent : une seule enveloppe, un seul déclencheur', () => {
    const s = villes();
    const a = ameliorer(s);
    const b = ameliorer(s);
    assert.equal(a, b);
    assert.equal(instanceDe(s), a);
    assert.equal(racine.querySelectorAll('.lr').length, 1);
    assert.equal(racine.querySelectorAll('.lr-declencheur').length, 1);
  });

  it('améliore un champ() existant sans changer son étiquette ni sa valeur', () => {
    const bloc = champ({
      id: 'decl-depart', label: 'Provenance', requis: true, valeur: 'b',
      options: [{ valeur: 'a', libelle: 'Abidjan' }, { valeur: 'b', libelle: 'Bouaké' }],
    });
    racine.append(bloc);
    const s = doc.getElementById('decl-depart');
    ameliorer(s);
    assert.equal(bloc.querySelector('label').getAttribute('for'), 'decl-depart', 'l’étiquette vise toujours le select');
    assert.equal(s.value, 'b');
    assert.equal(s.required, true);
    assert.equal(bloc.querySelector('.lr-valeur').textContent, 'Bouaké');
  });

  it('ignore ce qui n’est pas un select', () => {
    assert.equal(ameliorer(el('input')), null);
    assert.equal(ameliorer(null), null);
  });

  it('propose « Rechercher… » et ne produit aucun HTML par chaîne', () => {
    assert.equal(TEXTE_RECHERCHE, 'Rechercher…');
    const src = readFileSync(new URL('../js/core/liste-recherche.js', import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
  });
});

/* ------------------------------------------------------------------ *
 * Branchement et charte
 * ------------------------------------------------------------------ */

describe('Lot b0 — branchement et charte', () => {
  const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');

  it('pose l’observateur à l’amorçage et charge sa feuille de style', () => {
    assert.match(lire('js/app.js'), /installerListesRecherche\(\)/);
    assert.match(lire('index.html'), /href="css\/lot-b0\.css"/);
    assert.match(lire('index.html'), /id="ic-chevron-down"/, 'chevron Lucide présent dans le sprite');
  });

  it('n’emploie aucune couleur littérale, uniquement des jetons', () => {
    const css = lire('css/lot-b0.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css), 'couleur littérale dans lot-b0.css');
    assert.ok(!/border-left\s*:/.test(css), 'aucune bordure gauche');
  });
});
