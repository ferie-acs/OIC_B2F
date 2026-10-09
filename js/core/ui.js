/**
 * Composants d'interface communs.
 *
 * Tous bâtis sur `core/dom.js` : **aucune chaîne n'est interprétée comme du
 * HTML**. Les composants sont partagés entre les cinq espaces, ce qui est
 * précisément là où une faille se propagerait le plus vite si l'un d'eux
 * échappait à la règle (finding S13).
 *
 * @module core/ui
 */

import { el, fragment, icone, montant as fmtMontant, remplacer } from './dom.js';
import { LIBELLES, POV, labelOf } from '../domain/enums.js';

/**
 * Badge d'état.
 *
 * **La couleur ne porte jamais seule le sens** : chaque badge a une icône et un
 * libellé, pour qu'un daltonien lise « Acceptée ✓ » et non un rectangle vert
 * (`02-design-system-b2f.md` § 4).
 *
 * @param {string} valeur Valeur stockée.
 * @param {string} [pov] Point de vue du lecteur — le libellé en dépend (D34).
 * @returns {HTMLElement}
 */
export function badge(valeur, pov = POV.NEUTRE) {
  const tons = {
    publiee: 'info',
    disponible: 'info',
    reserver: 'warning',
    reservee: 'warning',
    accepter: 'signature',
    valider: 'success',
    validee: 'success',
    rejeter: 'error',
    annuler: 'neutral',
    annulee: 'neutral',
    engagee: 'signature',
    retiree: 'neutral',
    brouillon: 'neutral',
    active: 'info',
    cloturee: 'neutral',
    cloture: 'success',
    livre: 'success',
    a_quai: 'warning',
    charge: 'warning',
    en_route: 'info',
    actif: 'success',
    expire: 'error',
    suspendu: 'error',
  };
  const icones = {
    valider: 'check-circle',
    validee: 'check-circle',
    accepter: 'check',
    rejeter: 'x',
    annuler: 'x',
    annulee: 'x',
    reserver: 'clock',
    reservee: 'clock',
    expire: 'alert',
    suspendu: 'alert',
    cloture: 'check-circle',
    livre: 'check',
  };
  const ton = tons[valeur] ?? 'neutral';
  // `labelOf` lève si la valeur n'a pas de libellé : un statut brut à l'écran
  // est un défaut qu'on veut voir en développement, jamais en démonstration (D34).
  const libelle = labelOf(valeur, pov);

  return el('span', { class: `badge badge-${ton}` }, [
    icone(icones[valeur] ?? 'info', 13),
    el('span', { text: libelle }),
  ]);
}

/**
 * Indicateur chiffré.
 * @param {{libelle: string, valeur: string|number, note?: string, ton?: string, icon?: string}} p
 * @returns {HTMLElement}
 */
export function kpi({ libelle, valeur, note, ton, icon }) {
  // Les cas précis précèdent les familles : un délai de réservation reste
  // une durée, et une carte de transport expirée reste un document à renouveler.
  const symboles = [
    [/crédit|recharg/i, 'credits'],
    [/débit|frais/i, 'arrow-right'],
    [/solde|montant|recette|encours|compte/i, 'wallet'],
    [/délai|durée/i, 'clock'],
    [/expir|échue/i, 'calendar'],
    [/répondre|réponse/i, 'inbox'],
    [/taux.*acceptation/i, 'check-circle'],
    [/réservation/i, 'reservation'],
    [/relation/i, 'handshake'],
    [/groupement|entité/i, 'building'],
    [/utilisateur|membre|affréteur|transporteur/i, 'users'],
    [/véhicule|transport|offre/i, 'truck'],
    [/demande.*publi/i, 'published'],
    [/fret|demande|déclaration/i, 'package'],
  ];
  const symbole = icon ?? symboles.find(([motif]) => motif.test(libelle))?.[1] ?? 'activity';
  const texte = String(valeur);
  // Un compteur tient en deux caractères, un montant en treize : à taille égale,
  // « 120 000 F CFA » passait à la ligne et déformait toute la rangée. La valeur
  // longue prend une taille plus mesurée, le chiffre reste l'élément dominant.
  const longue = texte.length > 9;
  return el('div.kpi-card', {}, [
    el('span.kpi-label.kpi-label-icon', {}, [icone(symbole, 17), el('span', { text: libelle })]),
    el('strong', { class: `kpi-value${longue ? ' kpi-value-long' : ''}`, text: texte }),
    note ? el('span', { class: `kpi-trend${ton ? ` ${ton}` : ''}`, text: note }) : null,
    el('span.indicator-watermark', { 'aria-hidden':'true' }, [icone(symbole, 88)]),
  ]);
}

/**
 * Tableau. Les cellules acceptent une chaîne (posée en texte) ou un élément.
 *
 * @param {{colonnes: string[], lignes: Array<Array<Node|string|number|null>>, vide?: Node|string, aria?: string}} p
 * @returns {HTMLElement}
 */
export function tableau({ colonnes, lignes, vide, aria, titre }) {
  if (lignes.length === 0 && vide) {
    return typeof vide === 'string' ? etatVide({ message: vide }) : vide;
  }
  return el('div.table-wrap', {}, [
    // QA-M5 : un tableau sans nom accessible n'est pas situable au lecteur
    // d'écran. À défaut d'`aria`, on reprend le titre de la carte qui le porte.
    el('table', { class: 'data-table', 'aria-label': aria ?? titre ?? undefined }, [
      el('thead', {}, [
        el('tr', {}, colonnes.map((c) => el('th', { scope: 'col', text: c }))),
      ]),
      el(
        'tbody',
        {},
        lignes.map((ligne) =>
          el(
            'tr',
            {},
            ligne.map((cellule) =>
              el('td', {}, [
                cellule === null || cellule === undefined
                  ? '—'
                  : typeof cellule === 'object'
                    ? cellule
                    : String(cellule),
              ]),
            ),
          ),
        ),
      ),
    ]),
  ]);
}

/**
 * État vide **rédigé**, jamais un tableau vide (`01-parcours-et-navigation.md` § 4.3).
 * @param {{titre?: string, message: string, action?: {libelle: string, onClick: () => void}}} p
 * @returns {HTMLElement}
 */
export function etatVide({ titre, message, action }) {
  return el('div.empty-state', {}, [
    icone('inbox', 28),
    titre ? el('h3', { text: titre }) : null,
    el('p', { text: message }),
    action
      ? el('button.btn.btn-primary', {
          type: 'button',
          text: action.libelle,
          on: { click: action.onClick },
        })
      : null,
  ]);
}

/**
 * Bandeau d'information, d'alerte ou d'erreur.
 * @param {{ton?: 'info'|'ok'|'warn'|'err'|'signature', titre?: string, message: string|Node, actions?: HTMLElement[]}} p
 * @returns {HTMLElement}
 */
export function bandeau({ ton = 'info', titre, message, actions }) {
  const icones = { info: 'info', ok: 'check-circle', warn: 'alert', err: 'alert', signature: 'handshake' };
  const classes = { info: '', ok: 'success', warn: 'warning', err: 'error', signature: 'signature' };
  return el('div', {
    class: `alert-banner${classes[ton] ? ` ${classes[ton]}` : ''}`,
    role: ton === 'err' ? 'alert' : undefined,
  }, [
    icone(icones[ton], 18),
    el('div', {}, [
      titre ? el('strong', { text: titre }) : null,
      typeof message === 'string' ? el('p', { text: message }) : message,
      actions?.length ? el('div.table-toolbar', {}, actions) : null,
    ]),
  ]);
}

/**
 * Bouton. **Un bouton interdit est désactivé ET expliqué, jamais masqué**
 * (décision D32) : passer `motif` le désactive, pose un `title` et rend
 * l'explication disponible pour l'écran.
 *
 * @param {{libelle: string, onClick?: () => void, variante?: string, motif?: string|null, icone?: string, type?: string}} p
 * @returns {HTMLElement}
 */
export function bouton({ libelle, onClick, variante = 'secondary', motif, icone: ic, type = 'button' }) {
  const interdit = Boolean(motif);
  if (!interdit) {
    return el(
      'button',
      { type, class: `btn btn-${variante}`, on: onClick ? { click: onClick } : {} },
      [ic ? icone(ic, 16) : null, el('span', { text: libelle })],
    );
  }

  // Correctif QA-08. L'attribut `disabled` retirait le bouton de l'ordre de
  // tabulation : le motif, porté par `title`, n'existait plus que pour la
  // souris. La décision D32 — « désactivé ET expliqué » — n'était donc tenue
  // que pour les voyants qui pointent.
  //
  // `aria-disabled` seul conserve le focus ; le clic est neutralisé en
  // JavaScript ; et le motif est **écrit à l'écran**, lié par
  // `aria-describedby`. Un lecteur d'écran l'annonce, un clavier l'atteint.
  const idMotif = `motif-${Math.random().toString(36).slice(2, 9)}`;
  return el('span.action-refusee', {}, [
    el(
      'button',
      {
        type,
        class: `btn btn-${variante} is-refuse`,
        'aria-disabled': 'true',
        'aria-describedby': idMotif,
        on: {
          click: (e) => {
            e.preventDefault?.();
            e.stopPropagation?.();
          },
        },
      },
      [ic ? icone(ic, 16) : null, el('span', { text: libelle })],
    ),
    el('small', { id: idMotif, class: 'motif-refus', text: motif }),
  ]);
}

/**
 * Carte de contenu.
 * @param {{titre?: string, sousTitre?: string, actions?: HTMLElement[], corps: Array<Node|null>}} p
 * @returns {HTMLElement}
 */
export function carte({ titre, sousTitre, actions, corps }) {
  const section = el('section.card', {}, [
    titre || actions
      ? el('header.card-header', {}, [
          el('div', {}, [
            titre ? el('h3', { text: titre }) : null,
            sousTitre ? el('p.subtitle', { text: sousTitre }) : null,
          ]),
          actions?.length ? el('div.table-toolbar', {}, actions.filter(Boolean)) : null,
        ])
      : null,
    // Nommé : le style a besoin d'atteindre le corps d'une carte — un tableau
    // doit pouvoir aller bord à bord, ce qu'un `div` anonyme ne permet pas.
    el('div.card-body', {}, corps),
  ]);
  if (titre) nommerTableaux(section, titre);
  return section;
}

/**
 * Pose un nom accessible sur les tableaux d'une carte qui n'en portent pas.
 * @param {HTMLElement} noeud
 * @param {string} titre
 */
function nommerTableaux(noeud, titre) {
  for (const t of noeud.querySelectorAll?.('table') ?? []) {
    if (!t.getAttribute('aria-label')) t.setAttribute('aria-label', titre);
  }
}

/**
 * Champ de formulaire.
 * @param {{id: string, label: string, type?: string, valeur?: any, requis?: boolean, aide?: string, erreur?: string, options?: Array<{valeur: string, libelle: string}>, attrs?: Record<string, any>}} p
 * @returns {HTMLElement}
 */
export function champ({ id, label, type = 'text', valeur, requis, aide, erreur, options, attrs = {} }) {
  const idAide = aide ? `${id}-aide` : undefined;
  const idErreur = erreur ? `${id}-err` : undefined;
  const decrit = [idAide, idErreur].filter(Boolean).join(' ') || undefined;

  let controle;
  if (options) {
    controle = el(
      'select',
      {
        id,
        class: 'select',
        required: requis || undefined,
        'aria-invalid': erreur ? 'true' : undefined,
        'aria-describedby': decrit,
        ...attrs,
      },
      [
        el('option', { value: '', text: '— Choisir —' }),
        ...options.map((o) =>
          el('option', { value: o.valeur, text: o.libelle, selected: o.valeur === valeur || undefined }),
        ),
      ],
    );
  } else if (type === 'textarea') {
    controle = el('textarea', {
      id,
      class: 'input',
      rows: 3,
      required: requis || undefined,
      'aria-describedby': decrit,
      ...attrs,
    });
    if (valeur !== undefined && valeur !== null) controle.value = String(valeur);
  } else {
    controle = el('input', {
      id,
      class: 'input',
      type,
      value: valeur ?? '',
      required: requis || undefined,
      'aria-invalid': erreur ? 'true' : undefined,
      'aria-describedby': decrit,
      ...attrs,
    });
  }

  return el('div.field', {}, [
    el('label', { for: id }, [
      el('span', { text: label }),
      // L'astérisque est décorative : l'information passe par `required`.
      requis ? el('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null,
    ]),
    controle,
    aide ? el('small', { id: idAide, text: aide }) : null,
    erreur ? el('small', { id: idErreur, role: 'alert', text: erreur }) : null,
  ]);
}

/* ------------------------------------------------------------------ *
 * Modale — avec piège de focus, absent de la maquette et exigé au produit
 * ------------------------------------------------------------------ */

/** @type {HTMLElement|null} */
let modaleOuverte = null;
/** @type {Element|null} */
let declencheur = null;

/**
 * Ouvre une boîte de dialogue.
 *
 * Le focus est placé à l'ouverture, **piégé** dans la modale, et **rendu à
 * l'élément déclencheur** à la fermeture. La maquette ne l'implémente pas ;
 * le produit doit le faire (`02-design-system-b2f.md` § 4).
 *
 * @param {{titre: string, corps: Array<Node|null>, actions?: HTMLElement[], surFermeture?: () => void}} p
 * @returns {() => void} Fonction de fermeture.
 */
export function modale({ titre, corps, actions, surFermeture }) {
  fermerModale();
  declencheur = document.activeElement;

  const titreId = 'modale-titre';
  const boite = el('div.modal-card', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titreId }, [
    el('button.modal-close', {
      type: 'button',
      'aria-label': 'Fermer',
      on: { click: () => fermer() },
    }, [icone('x', 18)]),
    el('h3.modal-title', { id: titreId, text: titre }),
    el('div.modal-text', {}, corps),
    actions?.length ? el('footer.modal-footer', {}, actions.filter(Boolean)) : null,
  ]);

  const fond = el('div.modal-overlay', { on: { click: (e) => e.target === fond && fermer() } }, [boite]);
  document.body.append(fond);
  modaleOuverte = fond;

  const focusables = () =>
    [...boite.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.hasAttribute('disabled'));

  focusables()[0]?.focus();

  const auClavier = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fermer();
      return;
    }
    if (e.key !== 'Tab') return;
    const liste = focusables();
    if (liste.length === 0) return;
    const premier = liste[0];
    const dernier = liste[liste.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };
  fond.addEventListener('keydown', auClavier);

  function fermer() {
    fond.remove();
    modaleOuverte = null;
    if (declencheur instanceof HTMLElement) declencheur.focus();
    surFermeture?.();
  }
  return fermer;
}

/** Ferme la modale ouverte, s'il y en a une. */
export function fermerModale() {
  if (modaleOuverte) {
    modaleOuverte.remove();
    modaleOuverte = null;
  }
}

/* ------------------------------------------------------------------ *
 * Notifications éphémères
 * ------------------------------------------------------------------ */

/**
 * Message éphémère.
 * @param {string} message
 * @param {'ok'|'err'|'info'} [ton]
 */
export function toast(message, ton = 'ok') {
  let zone = document.getElementById('toasts');
  if (!zone) {
    zone = el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
    document.body.append(zone);
  }
  const t = el('div', { class: `toast toast-${ton}` }, [
    icone(ton === 'err' ? 'alert' : 'check-circle', 16),
    el('span', { text: message }),
  ]);
  zone.append(t);
  setTimeout(() => t.remove(), 5200);
}

/**
 * Affiche une erreur applicative **explicitement**, jamais en silence
 * (convention reprise du POC DUT).
 * @param {unknown} erreur
 */
export function afficherErreur(erreur) {
  const message =
    erreur instanceof Error ? erreur.message : 'Une erreur inattendue est survenue.';
  toast(message, 'err');
  console.error('[B2F]', erreur);
}

/**
 * Registre de débit — le composant pivot du POC.
 *
 * Montre **les deux débits, les deux soldes et le solde résultant avant
 * l'action** (décision D31). Aucune boîte « Êtes-vous sûr ? » ne masque les
 * montants : dans ce métier, valider *est* une transaction.
 *
 * @param {{lignes: Array<{partie: string, solde: number, frais: number, suffisant: boolean}>}} p
 * @returns {HTMLElement}
 */
export function registreDebit({ lignes, contrepartie }) {
  const total = lignes.reduce((n, l) => n + l.frais, 0) + (contrepartie?.frais ?? 0);

  return el('div.ledger', {}, [
    // Le compte de l'utilisateur : chiffré, avant et après.
    ...lignes.map((l) =>
      el('div.ledger-row', {}, [
        el('div.ledger-party', {}, [
          el('strong', { text: l.partie }),
          el('span', { text: `Solde avant : ${fmtMontant(l.solde)}` }),
        ]),
        el('div', { class: `ledger-amount${l.suffisant ? '' : ' insufficient'}` }, [
          el('strong', { text: `− ${fmtMontant(l.frais)}` }),
          el('span', {
            text: l.suffisant
              ? `Solde après : ${fmtMontant(l.solde - l.frais)}`
              : `Insuffisant — il manque ${fmtMontant(l.frais - l.solde)}`,
          }),
        ]),
      ]),
    ),

    // La contrepartie : le montant de CE dossier, jamais son solde (D60).
    // Sa capacité à régler est ce dont l'utilisateur a besoin ; sa trésorerie
    // ne le regarde pas.
    contrepartie
      ? el('div.ledger-row', {}, [
          el('div.ledger-party', {}, [
            el('strong', { text: contrepartie.partie }),
            el('span', {
              text: contrepartie.provisionnee
                ? 'Compte provisionné'
                : 'Compte non provisionné — la validation sera refusée',
            }),
          ]),
          el('div', {
            class: `ledger-amount${contrepartie.provisionnee ? '' : ' insufficient'}`,
          }, [
            el('strong', { text: `− ${fmtMontant(contrepartie.frais)}` }),
            el('span', { text: 'Débité au même instant' }),
          ]),
        ])
      : null,

    el('div.ledger-row.total', {}, [
      el('div.ledger-party', {}, [el('strong', { text: 'Total prélevé par la plateforme' })]),
      el('div.ledger-amount', {}, [el('strong', { text: fmtMontant(total) })]),
    ]),
  ]);
}

export { el, fragment, icone, remplacer };
