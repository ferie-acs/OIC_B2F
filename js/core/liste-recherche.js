/**
 * Recherche intégrée à toutes les listes de choix — lot b0.
 *
 * ## Exigence
 *
 * « Toute liste de choix, quel que soit son format, doit contenir un champ de
 * recherche. » Les vues de B2F construisent des `<select>` natifs (`champ()` de
 * `core/ui.js`, filtres du marché public, annuaire de supervision, DUT, accueil).
 * Plutôt que de réécrire chaque vue, ce module **améliore** tout `<select>` posé
 * dans le document, quel que soit l'écran qui l'a produit.
 *
 * ## Amélioration progressive
 *
 * - Le `<select>` natif **reste dans le document** : même `id`, même `name`,
 *   même `value`, mêmes écouteurs `change`, même `required`, même `<label for>`.
 *   Il est seulement masqué à l'œil et aux lecteurs d'écran. Le code existant,
 *   `FormData`, `reportValidity()` et les tests continuent de le lire.
 * - À côté, un **déclencheur** (bouton, rôle `combobox`) affiche le libellé
 *   choisi et un chevron Lucide. Il reprend les classes du `<select>` : il hérite
 *   donc de la charte du contexte (`.select`, formulaires métier, DUT…).
 * - Le **panneau** s'ouvre avec, en tête, un champ « Rechercher… », puis la
 *   liste filtrée (insensible à la casse et aux accents), groupes et options
 *   désactivées respectés. Il est monté hors du flux (dans `body`, ou dans la
 *   modale qui contient la liste) pour n'être rogné par aucune carte.
 * - Choisir une option écrit dans le `<select>` puis émet `input` et `change`,
 *   comme le ferait le navigateur : aucune vue n'a à changer de logique.
 *
 * ## Synchronisation
 *
 * - `select.value = …` et `select.selectedIndex = …` sont interceptés sur
 *   l'instance (le comportement natif est conservé) pour rafraîchir le libellé.
 * - Un `MutationObserver` par liste suit les options ajoutées, retirées ou
 *   renommées, et les attributs (`disabled`, `required`, `aria-invalid`…).
 * - `installerListesRecherche()` pose un observateur unique sur le document :
 *   tout `<select>` inséré (page, modale, filtre, page publique) est amélioré une
 *   fois et une seule (registre `WeakMap`).
 *
 * Aucun HTML n'est produit à partir d'une chaîne : tout passe par `el()`.
 *
 * @module core/liste-recherche
 */

import { el, icone } from './dom.js';

/** Texte indicatif du champ de recherche. */
export const TEXTE_RECHERCHE = 'Rechercher…';
/** Message affiché quand la recherche ne retient aucune option. */
export const TEXTE_AUCUN = 'Aucun résultat';

/** Gouttière minimale entre le panneau et le bord de l'écran (px). */
const MARGE = 16;
/** Écart entre le déclencheur et le panneau (px). */
const ECART = 6;
/** Hauteur maximale du panneau (px). */
const HAUTEUR_MAX = 360;
/** Largeur minimale du panneau (px), bornée par la largeur de l'écran. */
const LARGEUR_MIN = 240;

/* ------------------------------------------------------------------ *
 * Recherche — fonctions pures, testées sans navigateur
 * ------------------------------------------------------------------ */

/**
 * Forme canonique d'un texte pour la comparaison : sans accents, sans
 * distinction de casse, ligatures dépliées, apostrophes et espaces unifiés.
 * « Ébène », « EBENE » et « ébène » donnent tous « ebene ».
 * @param {unknown} texte
 * @returns {string}
 */
export function normaliser(texte) {
  return String(texte ?? '')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un libellé correspond-il à la recherche ? Chaque mot saisi doit apparaître
 * dans le libellé, dans n'importe quel ordre : « port abidjan » retrouve
 * « Abidjan — Port autonome ». Une recherche vide retient tout.
 * @param {string} libelle
 * @param {string} requete
 * @returns {boolean}
 */
export function correspond(libelle, requete) {
  const mots = normaliser(requete).split(' ').filter(Boolean);
  if (mots.length === 0) return true;
  const cible = normaliser(libelle);
  return mots.every((m) => cible.includes(m));
}

/**
 * @typedef {{type: 'option', option: any, valeur: string, libelle: string, desactive: boolean}} EntreeOption
 * @typedef {{type: 'groupe', libelle: string, desactive: boolean, options: EntreeOption[]}} EntreeGroupe
 */

/**
 * Filtre le modèle d'une liste. Un groupe dont le titre correspond garde toutes
 * ses options ; sinon il ne garde que celles qui correspondent, et disparaît
 * s'il n'en reste aucune.
 * @param {Array<EntreeOption|EntreeGroupe>} entrees
 * @param {string} requete
 * @returns {Array<EntreeOption|EntreeGroupe>}
 */
export function filtrerEntrees(entrees, requete) {
  /** @type {Array<EntreeOption|EntreeGroupe>} */
  const retenues = [];
  for (const e of entrees) {
    if (e.type === 'groupe') {
      const options = correspond(e.libelle, requete)
        ? e.options
        : e.options.filter((o) => correspond(o.libelle, requete));
      if (options.length) retenues.push({ ...e, options });
    } else if (correspond(e.libelle, requete)) {
      retenues.push(e);
    }
  }
  return retenues;
}

/**
 * Libellé affiché d'une option : son attribut `label`, sinon son texte.
 * @param {any} option
 * @returns {string}
 */
function libelleOption(option) {
  const brut = option.label ?? option.getAttribute?.('label') ?? option.textContent ?? '';
  return String(brut || option.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {any} noeud
 * @returns {string}
 */
const balise = (noeud) => String(noeud?.tagName ?? noeud?.nodeName ?? '').toLowerCase();

/**
 * Lit la structure d'un `<select>` : options et groupes (`optgroup`), dans
 * l'ordre du document. Les options `hidden` sont écartées, comme le fait le
 * navigateur ; une option d'un groupe désactivé est désactivée.
 * @param {any} select
 * @returns {Array<EntreeOption|EntreeGroupe>}
 */
export function lireEntrees(select) {
  /** @param {any} o @param {boolean} [groupeDesactive] @returns {EntreeOption} */
  const option = (o, groupeDesactive = false) => ({
    type: 'option',
    option: o,
    valeur: String(o.value ?? ''),
    libelle: libelleOption(o),
    desactive: Boolean(o.disabled || groupeDesactive),
  });
  /** @type {Array<EntreeOption|EntreeGroupe>} */
  const entrees = [];
  for (const enfant of [...(select.children ?? [])]) {
    const tag = balise(enfant);
    if (tag === 'option' && !enfant.hidden) entrees.push(option(enfant));
    if (tag === 'optgroup' && !enfant.hidden) {
      const desactive = Boolean(enfant.disabled);
      entrees.push({
        type: 'groupe',
        libelle: String(enfant.label ?? enfant.getAttribute?.('label') ?? ''),
        desactive,
        options: [...(enfant.children ?? [])]
          .filter((o) => balise(o) === 'option' && !o.hidden)
          .map((o) => option(o, desactive)),
      });
    }
  }
  return entrees;
}

/**
 * Toutes les options d'un `<select>`, groupes compris, dans l'ordre.
 * @param {any} select
 * @returns {any[]}
 */
function toutesOptions(select) {
  if (select.options) return [...select.options];
  return lireEntrees(select).flatMap((e) => (e.type === 'groupe' ? e.options : [e])).map((e) => e.option);
}

/**
 * Descripteur natif d'une propriété (`value`, `selectedIndex`), cherché le long
 * de la chaîne des prototypes.
 * @param {object} objet
 * @param {string} nom
 * @returns {PropertyDescriptor|undefined}
 */
function descripteurNatif(objet, nom) {
  for (let p = Object.getPrototypeOf(objet); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, nom);
    if (d) return d.get && d.set ? d : undefined;
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Composant
 * ------------------------------------------------------------------ */

/** @type {WeakMap<object, ListeRecherche>} */
const registre = new WeakMap();
/** @type {ListeRecherche|null} */
let ouverteCourante = null;
let compteur = 0;

/** Une liste de choix améliorée. */
export class ListeRecherche {
  /** @param {any} select */
  constructor(select) {
    this.select = select;
    this.id = `lr-${++compteur}`;
    this.ouverte = false;
    /** Index, dans `visibles`, de l'option mise en évidence. */
    this.actif = -1;
    /** @type {EntreeOption[]} Options affichées, à plat, dans l'ordre. */
    this.visibles = [];
    /** @type {HTMLElement[]} Nœuds `li` correspondant à `visibles`. */
    this.noeuds = [];

    this.surPointeurExterieur = this.surPointeurExterieur.bind(this);
    this.surDefilement = this.surDefilement.bind(this);
    this.surRedimensionnement = () => this.placer();

    this.construire();
    this.attacher();
    this.intercepterValeur();
    this.rafraichir();
    this.observer();
  }

  /** Construit le déclencheur et le panneau (le panneau n'est monté qu'ouvert). */
  construire() {
    this.valeur = el('span.lr-valeur');
    this.gabarit = el('span.lr-gabarit', { 'aria-hidden': 'true' });
    this.declencheur = el('button.lr-declencheur', {
      type: 'button',
      id: `${this.id}-declencheur`,
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      on: {
        click: () => (this.ouverte ? this.fermer(true) : this.ouvrir()),
        keydown: (e) => this.surClavierDeclencheur(e),
        // Ouvert, un clic sur le déclencheur ne doit pas sortir le focus du
        // champ de recherche : la fermeture passe par `click`.
        mousedown: (e) => { if (this.ouverte) e.preventDefault(); },
      },
    }, [
      el('span.lr-texte', {}, [this.valeur, this.gabarit]),
      el('span.lr-chevron', { 'aria-hidden': 'true' }, [icone('chevron-down', 16)]),
    ]);

    this.saisie = el('input.lr-saisie', {
      type: 'text',
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': 'true',
      'aria-controls': `${this.id}-liste`,
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
      placeholder: TEXTE_RECHERCHE,
      on: {
        input: () => this.rendreListe({ actif: 'premier' }),
        keydown: (e) => this.surClavierSaisie(e),
      },
    });
    this.liste = el('ul.lr-liste', {
      id: `${this.id}-liste`,
      role: 'listbox',
      on: {
        click: (e) => {
          const li = e.target?.closest?.('.lr-option');
          if (li) this.choisir(Number(li.dataset.index));
        },
        pointermove: (e) => {
          const li = e.target?.closest?.('.lr-option');
          if (li && li.getAttribute('aria-disabled') !== 'true') this.definirActif(Number(li.dataset.index), false);
        },
      },
    });
    this.vide = el('p.lr-vide', { hidden: true }, [icone('search', 18), el('span', { text: TEXTE_AUCUN })]);
    this.annonce = el('p.lr-annonce', { role: 'status', 'aria-live': 'polite' });
    this.panneau = el('div.lr-panneau', {
      id: `${this.id}-panneau`,
      on: {
        // Un clic dans le panneau (option, marge, titre de groupe) garde le
        // focus dans le champ de recherche ; seul le champ lui-même le reçoit.
        mousedown: (e) => { if (e.target !== this.saisie) e.preventDefault(); },
        focusout: (e) => {
          const vers = e.relatedTarget;
          if (this.ouverte && vers && !this.panneau.contains(vers) && vers !== this.declencheur) this.fermer(false);
        },
      },
    }, [
      el('div.lr-recherche', {}, [icone('search', 16), this.saisie]),
      this.liste,
      this.vide,
      this.annonce,
    ]);

    this.enveloppe = el('span.lr');
  }

  /** Place l'enveloppe à l'endroit du `<select>` et y range le `<select>` masqué. */
  attacher() {
    const s = this.select;
    const avaitFocus = typeof document !== 'undefined' && document.activeElement === s;
    s.classList.add('lr-natif');
    s.setAttribute('tabindex', '-1');
    s.setAttribute('aria-hidden', 'true');
    this.rattacher();
    this.enveloppe.append(this.declencheur);

    s.addEventListener('change', () => this.rafraichir());
    // Un clic sur l'étiquette, ou `reportValidity()`, donne le focus au select
    // masqué : on le rend au déclencheur visible.
    s.addEventListener('focus', () => { if (!s.disabled) this.declencheur.focus(); });
    s.addEventListener('invalid', () => this.declencheur.setAttribute('aria-invalid', 'true'));
    if (avaitFocus) this.declencheur.focus();
  }

  /** Remet le `<select>` dans son enveloppe s'il en a été sorti. */
  rattacher() {
    const s = this.select;
    if (s.parentNode === this.enveloppe) return;
    if (s.parentNode) s.parentNode.insertBefore(this.enveloppe, s);
    this.enveloppe.insertBefore(s, this.enveloppe.firstChild ?? null);
  }

  /**
   * Intercepte `value` et `selectedIndex` sur l'instance : le comportement
   * natif est appelé tel quel, puis le libellé est rafraîchi. Une affectation
   * par programme ne déclenche aucun événement ; sans cela, le déclencheur
   * afficherait une valeur périmée.
   */
  intercepterValeur() {
    for (const nom of ['value', 'selectedIndex']) {
      const natif = descripteurNatif(this.select, nom);
      if (!natif) continue;
      const instance = this;
      Object.defineProperty(this.select, nom, {
        configurable: true,
        enumerable: true,
        get() { return natif.get.call(this); },
        set(v) { natif.set.call(this, v); instance.rafraichir(); },
      });
    }
  }

  /** Suit les options et les attributs du `<select>`. */
  observer() {
    if (typeof MutationObserver === 'undefined') return;
    this.observateur = new MutationObserver(() => {
      this.rafraichir();
      if (this.ouverte) this.rendreListe({ actif: 'conserver' });
    });
    this.observateur.observe(this.select, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  /** Nom accessible de la liste, tel que l'étiquette le donne. */
  nom() {
    const s = this.select;
    const direct = s.getAttribute('aria-label');
    if (direct) return direct;
    const parId = s.getAttribute('aria-labelledby');
    if (parId && typeof document !== 'undefined') {
      const t = parId.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (t) return t.replace(/\s*\*$/, '');
    }
    const etiquette = s.labels?.[0];
    if (etiquette) {
      // Le texte de l'étiquette, sans celui de la liste qu'elle contient parfois.
      const morceaux = [...etiquette.childNodes]
        .filter((n) => n !== this.enveloppe && !(n.getAttribute?.('aria-hidden') === 'true'))
        .map((n) => n.textContent ?? '');
      const t = morceaux.join(' ').replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    return s.getAttribute('title') || s.getAttribute('name') || 'Liste de choix';
  }

  /** Reporte l'état du `<select>` sur le déclencheur. */
  rafraichir() {
    const s = this.select;
    const d = this.declencheur;
    const options = toutesOptions(s);
    const choisies = options.filter((o) => o.selected);

    let texte;
    if (s.multiple) {
      texte = choisies.length === 0
        ? 'Aucune sélection'
        : choisies.length === 1 ? libelleOption(choisies[0]) : `${choisies.length} éléments sélectionnés`;
    } else {
      texte = choisies[0] ? libelleOption(choisies[0]) : '';
    }
    this.valeur.textContent = texte;
    // Le gabarit invisible donne au déclencheur la largeur du plus long libellé,
    // comme un select natif : la largeur ne saute pas quand la valeur change.
    this.gabarit.textContent = [texte, ...options.map(libelleOption)]
      .reduce((a, b) => (b.length > a.length ? b : a), '');

    // Les classes du select habillent le déclencheur : la charte du contexte
    // (`.select`, champs métier, DUT) s'applique sans être recopiée.
    const classes = [...s.classList].filter((c) => c !== 'lr-natif');
    // `classList.add` réécrit l'attribut même si la classe est déjà là : sans
    // ce test, l'observateur du select se relancerait sans fin.
    if (!s.classList.contains('lr-natif')) s.classList.add('lr-natif');
    const habit = ['lr-declencheur', ...(classes.length ? classes : ['select'])].join(' ');
    if (d.className !== habit) d.className = habit;

    d.disabled = Boolean(s.disabled);
    d.setAttribute('aria-label', this.nom());
    for (const attr of ['aria-describedby', 'aria-invalid']) {
      const v = s.getAttribute(attr);
      if (v) d.setAttribute(attr, v); else d.removeAttribute(attr);
    }
    if (s.required) d.setAttribute('aria-required', 'true'); else d.removeAttribute('aria-required');
    this.enveloppe.hidden = Boolean(s.hidden);
    if (this.ouverte) this.majSelection();
    if (this.ouverte && s.disabled) this.fermer(false);
  }

  /* ------------------------------ Panneau ----------------------------- */

  /**
   * Ouvre le panneau.
   * @param {{actif?: 'selection'|'premier'|'dernier', texte?: string}} [p]
   */
  ouvrir({ actif = 'selection', texte = '' } = {}) {
    if (this.ouverte || this.select.disabled) return;
    if (ouverteCourante && ouverteCourante !== this) ouverteCourante.fermer(false);
    ouverteCourante = this;
    this.ouverte = true;

    const nom = this.nom();
    this.saisie.value = texte;
    this.saisie.setAttribute('aria-label', `Rechercher dans la liste « ${nom} »`);
    this.liste.setAttribute('aria-label', nom);
    if (this.select.multiple) this.liste.setAttribute('aria-multiselectable', 'true');
    else this.liste.removeAttribute('aria-multiselectable');

    // Monté hors de la carte qui contient la liste, pour n'être rogné par
    // aucun conteneur ; dans la modale s'il y en a une, pour rester dans son
    // empilement.
    const hote = this.select.closest?.('.modal-overlay') ?? document.body;
    hote.append(this.panneau);

    this.rendreListe({ actif: texte ? 'premier' : actif });
    this.declencheur.setAttribute('aria-expanded', 'true');
    this.declencheur.setAttribute('aria-controls', this.panneau.id);
    this.enveloppe.classList.add('est-ouverte');
    this.placer();
    this.saisie.focus({ preventScroll: true });
    if (texte) this.saisie.setSelectionRange?.(texte.length, texte.length);
    this.definirActif(this.actif, true);

    document.addEventListener('pointerdown', this.surPointeurExterieur, true);
    globalThis.addEventListener?.('scroll', this.surDefilement, true);
    globalThis.addEventListener?.('resize', this.surRedimensionnement);
  }

  /**
   * Ferme le panneau.
   * @param {boolean} rendreFocus Rendre le focus au déclencheur (Échap, choix).
   */
  fermer(rendreFocus) {
    if (!this.ouverte) return;
    this.ouverte = false;
    if (ouverteCourante === this) ouverteCourante = null;
    document.removeEventListener('pointerdown', this.surPointeurExterieur, true);
    globalThis.removeEventListener?.('scroll', this.surDefilement, true);
    globalThis.removeEventListener?.('resize', this.surRedimensionnement);
    this.declencheur.setAttribute('aria-expanded', 'false');
    this.declencheur.removeAttribute('aria-controls');
    this.enveloppe.classList.remove('est-ouverte');
    if (rendreFocus && this.enveloppe.isConnected !== false) this.declencheur.focus({ preventScroll: true });
    this.panneau.remove();
    this.saisie.value = '';
  }

  /**
   * Reconstruit la liste filtrée.
   * @param {{actif?: 'selection'|'premier'|'dernier'|'conserver'}} [p]
   */
  rendreListe({ actif = 'conserver' } = {}) {
    const ancien = this.visibles[this.actif]?.option;
    const requete = this.saisie.value;
    const entrees = filtrerEntrees(lireEntrees(this.select), requete);
    this.visibles = [];
    this.noeuds = [];

    const noeudOption = (o) => {
      const index = this.visibles.length;
      const li = el('li.lr-option', {
        id: `${this.id}-option-${index}`,
        role: 'option',
        'aria-selected': String(Boolean(o.option.selected)),
        'aria-disabled': o.desactive ? 'true' : undefined,
        dataset: { index },
      }, [
        el('span.lr-option-texte', { text: o.libelle || ' ' }),
        el('span.lr-coche', { 'aria-hidden': 'true' }, [icone('check', 16)]),
      ]);
      this.visibles.push(o);
      this.noeuds.push(li);
      return li;
    };

    this.liste.replaceChildren(...entrees.map((e, i) => {
      if (e.type !== 'groupe') return noeudOption(e);
      const idTitre = `${this.id}-groupe-${i}`;
      return el('li.lr-groupe', { role: 'group', 'aria-labelledby': idTitre }, [
        el('span.lr-groupe-titre', { id: idTitre, text: e.libelle }),
        el('ul.lr-sous-liste', { role: 'none' }, e.options.map(noeudOption)),
      ]);
    }));

    const n = this.visibles.length;
    this.vide.hidden = n > 0;
    this.liste.hidden = n === 0;
    this.annonce.textContent = requete.trim()
      ? (n === 0 ? TEXTE_AUCUN : `${n} résultat${n > 1 ? 's' : ''}`)
      : '';

    const activables = this.visibles.map((o, i) => (o.desactive ? -1 : i)).filter((i) => i >= 0);
    let cible = -1;
    if (actif === 'conserver') cible = this.visibles.findIndex((o) => o.option === ancien && !o.desactive);
    if (actif === 'selection' || (actif === 'conserver' && cible < 0)) {
      cible = this.visibles.findIndex((o) => o.option.selected && !o.desactive);
    }
    if (actif === 'dernier') cible = activables.at(-1) ?? -1;
    if (cible < 0) cible = activables[0] ?? -1;
    this.definirActif(cible, actif !== 'conserver');
    if (this.ouverte) this.placer();
  }

  /** Met à jour `aria-selected` sans reconstruire la liste. */
  majSelection() {
    this.visibles.forEach((o, i) => this.noeuds[i]?.setAttribute('aria-selected', String(Boolean(o.option.selected))));
  }

  /**
   * Met une option en évidence (navigation au clavier ou survol).
   * @param {number} index
   * @param {boolean} defiler Faire défiler la liste jusqu'à l'option.
   */
  definirActif(index, defiler) {
    this.noeuds[this.actif]?.classList.remove('est-active');
    this.actif = index;
    const li = this.noeuds[index];
    if (!li) {
      this.saisie.removeAttribute('aria-activedescendant');
      return;
    }
    li.classList.add('est-active');
    this.saisie.setAttribute('aria-activedescendant', li.id);
    if (!defiler) return;
    const l = this.liste;
    const haut = li.offsetTop;
    const bas = haut + li.offsetHeight;
    if (haut < l.scrollTop) l.scrollTop = Math.max(0, haut - 6);
    else if (bas > l.scrollTop + l.clientHeight) l.scrollTop = bas - l.clientHeight + 6;
  }

  /**
   * Déplace la mise en évidence, en sautant les options désactivées.
   * @param {number} pas
   */
  deplacer(pas) {
    const n = this.visibles.length;
    if (n === 0) return;
    const sens = Math.sign(pas) || 1;
    let i = this.actif < 0 ? (sens > 0 ? -1 : n) : this.actif;
    let restant = Math.abs(pas);
    let cible = this.actif;
    while (restant > 0) {
      i += sens;
      if (i < 0 || i >= n) break;
      if (!this.visibles[i].desactive) {
        cible = i;
        restant--;
      }
    }
    this.definirActif(cible, true);
  }

  /**
   * Choisit l'option affichée à l'index donné : écrit dans le select natif et
   * émet `input` puis `change`, comme le navigateur.
   * @param {number} index
   */
  choisir(index) {
    const o = this.visibles[index];
    if (!o || o.desactive || this.select.disabled) return;
    const s = this.select;
    if (s.multiple) {
      o.option.selected = !o.option.selected;
      this.rafraichir();
      this.notifier();
      this.definirActif(index, false);
      return;
    }
    const avant = s.selectedIndex;
    o.option.selected = true;
    this.rafraichir();
    const change = s.selectedIndex !== avant;
    this.fermer(true);
    if (change) this.notifier();
  }

  /** Émet les événements qu'aurait émis le navigateur. */
  notifier() {
    this.select.dispatchEvent(new Event('input', { bubbles: true }));
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Positionne le panneau sous le déclencheur (au-dessus s'il manque de place),
   * contenu dans l'écran avec une gouttière de 16 px.
   */
  placer() {
    if (!this.ouverte) return;
    const r = this.declencheur.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    const p = this.panneau.style;
    const largeur = Math.min(Math.max(r.width, LARGEUR_MIN), vw - 2 * MARGE);
    // Aligné sur le bord du déclencheur le plus proche du centre de l'écran
    // (gauche pour une liste à gauche, droit pour une liste à droite), puis
    // ramené dans l'écran.
    const versDroite = r.left + r.width / 2 > vw / 2;
    const gauche = Math.max(MARGE, Math.min(versDroite ? r.right - largeur : r.left, vw - MARGE - largeur));

    p.width = `${largeur}px`;
    p.maxHeight = '';
    p.left = '0px';
    p.top = '0px';
    p.bottom = '';
    // Le panneau est en `position: fixed`. Un ancêtre à filtre (modale)
    // devient son repère : on mesure l'écart pour le compenser.
    const origine = this.panneau.getBoundingClientRect();
    const naturelle = Math.min(this.panneau.scrollHeight, HAUTEUR_MAX);

    const dessous = vh - r.bottom - ECART - MARGE;
    const dessus = r.top - ECART - MARGE;
    const enBas = dessous >= Math.min(naturelle, 220) || dessous >= dessus;
    const dispo = Math.max(140, enBas ? dessous : dessus);
    const hauteur = Math.min(naturelle, dispo, HAUTEUR_MAX);

    p.maxHeight = `${Math.min(dispo, HAUTEUR_MAX)}px`;
    p.left = `${gauche - origine.left}px`;
    p.top = `${(enBas ? r.bottom + ECART : r.top - ECART - hauteur) - origine.top}px`;
    this.panneau.dataset.cote = enBas ? 'bas' : 'haut';
  }

  /* ------------------------------ Clavier ----------------------------- */

  /** @param {KeyboardEvent} e */
  surClavierDeclencheur(e) {
    if (this.select.disabled) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'F4') {
      e.preventDefault();
      this.ouvrir({ actif: 'selection' });
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      this.ouvrir({ actif: k === 'Home' ? 'premier' : 'dernier' });
    } else if (k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Saisie directe : la frappe ouvre la liste et commence la recherche.
      e.preventDefault();
      this.ouvrir({ texte: k });
    }
  }

  /** @param {KeyboardEvent} e */
  surClavierSaisie(e) {
    const k = e.key;
    const modif = e.ctrlKey || e.metaKey || e.shiftKey;
    if (k === 'ArrowDown' && !e.altKey) {
      e.preventDefault();
      this.deplacer(1);
    } else if (k === 'ArrowUp' && e.altKey) {
      e.preventDefault();
      this.fermer(true);
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      this.deplacer(-1);
    } else if (k === 'PageDown' || k === 'PageUp') {
      e.preventDefault();
      this.deplacer(k === 'PageDown' ? 10 : -10);
    } else if ((k === 'Home' || k === 'End') && !modif) {
      e.preventDefault();
      this.deplacer(k === 'Home' ? -this.visibles.length : this.visibles.length);
    } else if (k === 'Enter') {
      // Jamais de soumission implicite du formulaire depuis la recherche.
      e.preventDefault();
      if (this.actif >= 0) this.choisir(this.actif);
    } else if (k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.fermer(true);
    } else if (k === 'Tab') {
      // Le focus revient au déclencheur avant l'action par défaut : Tab
      // poursuit alors vers le champ suivant (Maj + Tab vers le précédent).
      this.fermer(true);
    }
  }

  /* ------------------------------ Contexte ---------------------------- */

  /** @param {Event} e */
  surPointeurExterieur(e) {
    const cible = e.target;
    if (this.panneau.contains(cible) || this.enveloppe.contains(cible)) return;
    this.fermer(false);
  }

  /** @param {Event} e */
  surDefilement(e) {
    if (e.target instanceof Node && this.panneau.contains(e.target)) return;
    this.placer();
  }

  /** Retire l'enveloppe quand le select a quitté le document. */
  detacher() {
    this.fermer(false);
    this.enveloppe.remove();
  }
}

/* ------------------------------------------------------------------ *
 * Application automatique
 * ------------------------------------------------------------------ */

/**
 * Améliore un `<select>`. Idempotent : un second appel rend la même instance,
 * et remet le select dans son enveloppe s'il en avait été sorti.
 * @param {any} select
 * @returns {ListeRecherche|null}
 */
export function ameliorer(select) {
  if (balise(select) !== 'select') return null;
  const existante = registre.get(select);
  if (existante) {
    existante.rattacher();
    existante.rafraichir();
    return existante;
  }
  const instance = new ListeRecherche(select);
  registre.set(select, instance);
  return instance;
}

/**
 * Instance associée à un select, s'il a été amélioré.
 * @param {any} select
 * @returns {ListeRecherche|undefined}
 */
export function instanceDe(select) {
  return registre.get(select);
}

/**
 * Améliore tous les `<select>` d'un sous-arbre.
 * @param {ParentNode} racine
 */
export function ameliorerTout(racine) {
  if (balise(racine) === 'select') ameliorer(racine);
  for (const s of racine.querySelectorAll?.('select') ?? []) ameliorer(s);
}

let installe = false;

/**
 * Pose l'observateur global, une seule fois : tout `<select>` présent ou
 * inséré plus tard dans le document reçoit sa recherche intégrée.
 * @param {ParentNode} [racine]
 */
export function installerListesRecherche(racine = document.body) {
  if (installe || typeof MutationObserver === 'undefined') return;
  installe = true;
  ameliorerTout(racine);

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) ameliorerTout(/** @type {Element} */ (n));
      }
      for (const n of m.removedNodes) {
        // Le select a été retiré de son enveloppe sans être réinséré ailleurs.
        const instance = registre.get(n);
        if (instance && !n.isConnected) instance.detacher();
      }
    }
    if (ouverteCourante && !ouverteCourante.enveloppe.isConnected) ouverteCourante.fermer(false);
  }).observe(racine, { childList: true, subtree: true });

  // Un formulaire remis à zéro ne déclenche pas `change`.
  document.addEventListener('reset', (e) => {
    const form = e.target;
    setTimeout(() => {
      for (const s of form?.querySelectorAll?.('select') ?? []) registre.get(s)?.rafraichir();
    });
  }, true);
}
