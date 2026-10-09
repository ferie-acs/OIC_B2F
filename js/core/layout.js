/**
 * Shell applicatif : rail, barre latérale, barre supérieure.
 *
 * Navigation à **deux niveaux réels** (décision D30) : le rail porte les zones,
 * la barre latérale les pages de la zone active. Le rail est marine plein —
 * marqueur d'identité n°1 de B2F, confirmé par l'utilisateur (U1, décision D35).
 *
 * @module core/layout
 */

import { el, icone, remplacer } from './dom.js';
import { arborescenceDe, segmentEspace } from './nav.js';
import { role } from '../domain/roles.js';
import { nonLues } from '../services/notification.service.js';
import { profil } from '../services/auth.service.js';

/** Repères cohérents entre sous-menus et titres, sans modifier les droits. */
function iconePage(route, fallback = 'dashboard') {
  const page = (route ?? '').split('/')[0];
  return ({dashboard:'dashboard',notifications:'bell',declarations:'package',demandes:'package',
    marche:'market',reservations:'reservation',validation:'handshake',relations:'handshake',
    suivi:'truck',vehicules:'truck',offres:'truck',compte:'wallet',comptes:'wallet',
    tarifs:'wallet',abonnement:'wallet',abonnements:'wallet',groupement:'building',
    groupements:'building',utilisateurs:'users',roles:'users',chauffeurs:'users',
    dut:'file',duts:'file',audit:'history',etats:'shield',parametres:'settings'})[page] ?? fallback;
}

/** Clé du thème. **Jamais `dut_theme`** : une collision effacerait celui du DUT. */
const CLE_THEME = 'b2f_theme';

/** Applique le thème mémorisé. */
export function appliquerTheme() {
  let theme = 'light';
  try {
    theme = localStorage.getItem(CLE_THEME) ?? 'light';
  } catch {
    // Stockage indisponible : le thème clair reste un défaut acceptable.
  }
  document.documentElement.dataset.theme = theme;
}

/** Bascule clair / sombre. */
function basculerTheme() {
  const suivant = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = suivant;
  try {
    localStorage.setItem(CLE_THEME, suivant);
  } catch {
    /* sans persistance, la bascule reste valable pour la session */
  }
}

/**
 * Construit le shell autour d'un contenu.
 *
 * @param {object} p
 * @param {import('../domain/access.js').Contexte} p.ctx
 * @param {string} p.zoneActive
 * @param {string} p.pageActive
 * @param {string} p.titre
 * @param {Node} p.contenu
 * @param {() => void} p.surDeconnexion
 * @returns {HTMLElement}
 */
export function shell({ ctx, zoneActive, pageActive, titre, contenu, surDeconnexion }) {
  const zones = arborescenceDe(ctx);
  const espace = segmentEspace(ctx);
  const zone = zones.find((z) => z.id === zoneActive) ?? zones[0];
  const r = role(ctx.roleId);
  const moi = profil(ctx);
  const titrePresent = contenu.matches?.('h1') ? contenu : contenu.querySelector('h1');
  if (titrePresent && !titrePresent.querySelector('svg')) {
    titrePresent.classList.add('bo-title-with-icon');
    titrePresent.prepend(icone(iconePage(pageActive, zone?.icone), 28));
  }
  if (!titrePresent) {
    const enteteCarte = contenu.querySelector('.card-header');
    if (enteteCarte?.children.length === 1 && !enteteCarte.querySelector('.subtitle') &&
        enteteCarte.querySelector('h3')?.textContent.trim() === titre) {
      enteteCarte.classList.add('bo-repeated-heading');
    }
  }

  return el('div.app-shell.app-fresh', { dataset: { espace, zone: zone?.id ?? '', page: pageActive } }, [
    barreLaterale({ ctx, zones, zone, pageActive, espace, r, moi, surDeconnexion }),
    // Sous 960px la barre latérale est sortie de l'écran par la feuille de
    // style. Sans ces deux éléments, rien ne permettait de la rouvrir : la
    // navigation était simplement inaccessible sur mobile et sur tablette.
    el('div.sidebar-backdrop', {
      'aria-hidden': 'true',
      on: { click: () => basculerMenu(false) },
    }),
    barreSuperieure({ ctx, titre, zone, moi, r }),
    el('main.main-content', { id: 'contenu', tabindex: '-1' }, [
      bandeauDelegation(ctx),
      titrePresent ? null : entetePage({ titre, zone, r, pageActive }),
      contenu,
    ]),
    piedDePage(),
  ]);
}

/** Les vues sans titre principal partagent le même repère, hors de leur contenu
 *  dynamique pour que les filtres et les étapes de formulaire le conservent. */
function entetePage({ titre, zone, r, pageActive }) {
  return el('header.bo-page-heading', {}, [
    el('span.bo-page-symbol', { 'aria-hidden': 'true' }, [icone(iconePage(pageActive, zone?.icone), 23)]),
    el('div', {}, [
      el('p.bo-page-context', { text: [r.libelle, zone?.libelle].filter(Boolean).join(' · ') }),
      el('h1', { text: titre || 'Votre espace' }),
    ]),
  ]);
}

/**
 * Ouvre ou ferme la barre latérale sur petit écran.
 * @param {boolean} [ouvrir] Etat voulu ; absent, on bascule.
 */
function basculerMenu(ouvrir) {
  const barre = document.querySelector('.sidebar');
  const voile = document.querySelector('.sidebar-backdrop');
  const bouton = document.getElementById('btn-menu');
  if (!barre || !voile || !bouton) return;

  const etat = ouvrir ?? !barre.classList.contains('open');
  barre.classList.toggle('open', etat);
  voile.classList.toggle('open', etat);
  bouton.setAttribute('aria-expanded', String(etat));
  // Le focus suit l'ouverture, sinon la tabulation continue derrière le voile.
  if (etat) barre.querySelector('a, button')?.focus();
  else bouton.focus();
}

// Échap referme le menu. Posé une seule fois : le shell est remonté à chaque
// changement de route, un écouteur par montage s'accumulerait sans fin.
if (typeof document !== 'undefined' && !document.__b2fEchapMenu) {
  document.__b2fEchapMenu = true;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.sidebar.open')) basculerMenu(false);
  });
}

/** @param {any} p */
function barreLaterale({ ctx, zones, zone, pageActive, espace, r, moi, surDeconnexion }) {
  return el('nav.sidebar', { id: 'navigation-laterale', 'aria-label': 'Navigation' }, [
    el('div.app-rail', { role: 'navigation', 'aria-label': 'Zones' }, [
      el('a.rail-logo', { href: '#/accueil', title: 'Bourse de Fret' }, [icone('truck', 22)]),
      ...zones.map(z => el('a.rail-link', {
        class: z.id === zone?.id ? 'active' : '', href: `#/${espace}/${z.pages[0].route}`,
        title: z.libelle, 'aria-label': z.libelle, 'aria-current': z.id === zone?.id ? 'true' : undefined,
      }, [icone(z.icone, 21)])),
      el('a.rail-link.rail-bottom', { href: '#/explorer', title: 'Marché public', 'aria-label': 'Marché public' }, [icone('market', 21)]),
    ]),
    // --- Barre latérale : les PAGES de la zone active. ---------------
    el('div.sidebar-brand', {}, [
      el('a', {href:'#/accueil'}, [el('img.oic-logo', {src:'assets/oic.jpeg',alt:'OIC — Office Ivoirien des Chargeurs'})]),
      el('strong', { text: 'Bourse de Fret' }),
      el('span', { text: 'Office Ivoirien des Chargeurs' }),
      el('span.brand-tag', { text: r.libelle }),
    ]),
    el('div.sidebar-nav', {}, [
      ...zones.map((z) => el('details.sidebar-zone', { open: z.id === zone?.id || z.id === 'pilotage' }, [
        el('summary.sidebar-zone-title', {}, [icone(z.icone, 17), el('span', { text: z.libelle })]),
        el('div.sidebar-section', {}, z.pages.map((p) =>
          el('a', {
            class: `nav-link${p.route === pageActive ? ' active' : ''}`,
            href: `#/${espace}/${p.route}`,
            'aria-current': p.route === pageActive ? 'page' : undefined,
          }, [icone(iconePage(p.route, z.icone),18), el('span', { text: p.libelle })]),
        )),
      ])),
      aideContextuelle(r.id),
    ]),
    el('div.sidebar-footer', {}, [
      el('span.avatar-round', { text: initiales(moi, r) }),
      el('div.sidebar-user', {}, [
        el('strong', { text: moi ? `${moi.prenom ?? ''} ${moi.nom}`.trim() : 'Utilisateur' }),
        el('span', { text: r.libelle }),
      ]),
      el('button.icon-btn-ghost', {
        type: 'button',
        title: 'Déconnexion',
        'aria-label': 'Déconnexion',
        on: { click: surDeconnexion },
      }, [icone('logout', 17)]),
    ]),
  ]);
}

/** Initiales pour la pastille d'identité. */
function initiales(moi, r) {
  if (!moi) return r.libelle.slice(0, 2).toUpperCase();
  return `${(moi.prenom ?? '').charAt(0)}${(moi.nom ?? '').charAt(0)}`.toUpperCase() || 'B2';
}

/**
 * Encadré d'aide, propre au rôle. Pour les rôles de niveau 3, il dit
 * explicitement pourquoi l'espace est vide — l'audit (§ 6.5) demande que ce soit
 * énoncé et non masqué : masqué, le refus par défaut passerait pour un bug.
 * @param {string} roleId
 */
function aideContextuelle(roleId) {
  const textes = {
    affreteur:
      'Publier une demande ne coûte rien. Les frais de mise en relation ne sont ' +
      'débités qu’à la validation finale.',
    auxiliaire_affreteur:
      'Vous préparez les dossiers pour votre groupement. La validation, qui engage ' +
      'ses finances, revient à son responsable.',
    transporteur:
      'Accepter n’engage pas encore vos finances. Vérifiez néanmoins votre solde : ' +
      'une validation refusée de votre côté bloque la mise en relation.',
    auxiliaire_transporteur:
      'Vous préparez et publiez. Répondre à une réservation engage le compte de ' +
      'votre groupement : cela revient à son responsable.',
    dgttc: 'Le contrôleur ne transige pas sur ce qu’il contrôle.',
    concessionnaire:
      'Vous exploitez la plateforme : comptes, tarifs, abonnements. Vous ne publiez ' +
      'ni ne validez à la place d’un acteur du marché.',
  };
  const defaut =
    'Aucun droit métier n’est accordé à ce rôle dans ce POC : caisse, contentieux ' +
    'et comptabilité sont hors périmètre. Le rôle existe et reste administrable.';

  return el('aside.sidebar-note', {}, [
    icone('info', 15),
    el('strong', { text: 'À retenir' }),
    el('p', { text: textes[roleId] ?? defaut }),
  ]);
}

/** @param {any} p */
function barreSuperieure({ ctx, titre, zone, moi, r }) {
  const compte = nonLues(ctx);
  const resultats = el('div.nav-search-results', { id: 'navigation-recherche', hidden: true });
  const pages = arborescenceDe(ctx).flatMap(z => z.pages);
  const normaliser = texte => texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const recherche = el('input', {
    type: 'search', placeholder: 'Rechercher une page…', 'aria-label': 'Rechercher une page',
    'aria-controls': 'navigation-recherche', autocomplete: 'off',
    on: {
      input: e => {
        const query = normaliser(e.target.value.trim());
        resultats.hidden = !query;
        const trouves = pages.filter(p => normaliser(p.libelle).includes(query));
        remplacer(resultats, ...(trouves.length
          ? trouves.map(p => el('a', { href: `#/${segmentEspace(ctx)}/${p.route}`, text: p.libelle }))
          : [el('p', { text: 'Aucune page trouvée.' })]));
      },
      keydown: e => { if (e.key === 'Escape') { resultats.hidden = true; } },
    },
  });

  return el('header.topbar', {}, [
    el('button.icon-btn-ghost', {
      id: 'btn-menu',
      type: 'button',
      'aria-label': 'Ouvrir le menu de navigation',
      'aria-expanded': 'false',
      'aria-controls': 'navigation-laterale',
      on: { click: () => basculerMenu() },
    }, [icone('menu', 20)]),
    el('div.nav-search', {}, [icone('search', 17), recherche, resultats]),
    el('div.topbar-right', {}, [
      el('a.btn.btn-secondary', { href: '#/explorer', text: 'Explorer le marché' }),
      el('span.role-chip', { text: r.libelle }),
      el('button.icon-btn-ghost', {
        type: 'button',
        'aria-label': 'Basculer le thème clair ou sombre',
        title: 'Thème clair / sombre',
        on: { click: basculerTheme },
      }, [icone('sun', 18)]),
      el('a', {
        class: 'icon-btn-ghost',
        href: `#/${segmentEspace(ctx)}/notifications`,
        'aria-label': compte > 0 ? `${compte} notification(s) non lue(s)` : 'Notifications',
        title: compte > 0 ? `${compte} non lue(s)` : 'Notifications',
      }, [icone('bell', 18)]),
      el('div.topbar-profile', {}, [
        el('span.avatar-round', { text: initiales(moi, r) }),
        el('div', {}, [el('strong', { text: moi ? `${moi.prenom ?? ''} ${moi.nom}`.trim() : r.libelle }), el('small', { text: r.libelle })]),
      ]),
    ]),
  ]);
}

/**
 * Bandeau de délégation — affiché **sur tous les écrans** d'un auxiliaire
 * (spécification A.2).
 * @param {import('../domain/access.js').Contexte} ctx
 */
function bandeauDelegation(ctx) {
  if (!ctx.roleId.startsWith('auxiliaire_')) return null;
  return el('div.delegation-bar', {}, [
    icone('users', 16),
    el('strong', { text: 'Délégation' }),
    el('span', {
      text:
        'Vous agissez par délégation pour le compte de votre groupement. ' +
        'Les actions qui engagent ses finances ne vous sont pas accessibles.',
    }),
  ]);
}

function piedDePage() {
  return el('footer.app-footer', {}, [
    el('span', { text: 'Preuve de concept — Bourse de Fret, Office Ivoirien des Chargeurs.' }),
    el('span', { text: 'Toutes les données sont fictives et marquées DÉMO.' }),
  ]);
}

/**
 * Pose le shell dans la page.
 * @param {HTMLElement} noeud
 */
export function monter(noeud) {
  const app = document.getElementById('app');
  if (!app) throw new Error('Conteneur #app introuvable.');
  remplacer(app, noeud);
}
