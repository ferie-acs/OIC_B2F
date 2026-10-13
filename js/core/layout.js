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
import { arborescenceDe, localiser, segmentEspace } from './nav.js';
import { role } from '../domain/roles.js';
import { nonLues } from '../services/notification.service.js';
import { profil } from '../services/auth.service.js';
// Lot b2 : organisation interne — contexte délégué d'un intermédiaire.
import { revenirAMonEspace } from '../services/mandat.service.js';
import { labelOf } from '../domain/enums.js';
import { ICONES_PAGES_LOT_B2 } from './nav-lot-b2.js';

/** Repères cohérents entre sous-menus et titres, sans modifier les droits. */
function iconePage(route, fallback = 'dashboard') {
  const page = (route ?? '').split('/')[0];
  return ({dashboard:'dashboard',notifications:'bell',declarations:'package',demandes:'package',
    marche:'market',reservations:'reservation',validation:'handshake',relations:'handshake',
    suivi:'truck',vehicules:'truck',offres:'truck',compte:'wallet',comptes:'wallet',
    tarifs:'wallet',abonnement:'wallet',abonnements:'wallet',groupement:'building',
    groupements:'building',utilisateurs:'users',roles:'users',chauffeurs:'users',
    dut:'file',duts:'file',audit:'history',etats:'shield',parametres:'settings',
    /* Lot b1 */ dossier:'file',profil:'user',messages:'mail',messagerie:'mail',verifications:'shield',
    /* Lot b4 */ paiements:'receipt',caisse:'receipt',encaissements:'banknote','etats-financiers':'file-spreadsheet',contentieux:'scale',
    /* Intégration : pages des lots b3 et b5 */ incidents:'alert',attestations:'qr-code',controle:'scan-line',controles:'history',
    agents:'user-check',referentiels:'list',flux:'rss',repartitions:'chart-pie',exports:'download'})[page]
    ?? ICONES_PAGES_LOT_B2[page] ?? fallback; // Lot b2
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
      aideContextuelle(r.id, ctx),
    ]),
    el('div.sidebar-footer', {}, [
      el('span.avatar-round', { text: initiales(moi, r) }),
      el('div.sidebar-user', {}, [
        el('strong', { text: nomAffiche(moi, 'Utilisateur') }),
        el('span', { text: r.libelle }),
      ]),
      // Lot b1 : profil, atteignable aussi sur petit écran.
      el('a.icon-btn-ghost', { href: `#/${espace}/profil`, title: 'Mon profil', 'aria-label': 'Mon profil' }, [icone('user', 17)]),
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
/**
 * Intégration : nom affiché de l'utilisateur. Un rôle qui ne lit pas l'identité
 * (projection sans nom) voyait « undefined » : on retombe sur un libellé.
 * @param {Record<string, any>|null} moi
 * @param {string} repli
 */
function nomAffiche(moi, repli) {
  return [moi?.prenom, moi?.nom].filter(Boolean).join(' ') || repli;
}

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
function aideContextuelle(roleId, ctx = null) {
  // Lot b1 : compte en attente d'activation. (Intégration : l'intermédiaire de
  // fret inscrit a désormais son rôle et son texte, ci-dessous.)
  const propre = ctx?.inscriptionActivee === false
    ? 'Votre compte est activé par l’OIC après le contrôle de chaque pièce obligatoire de votre ' +
      'dossier. Suivez ici l’avancement du contrôle et répondez aux demandes de complément.'
    : null;
  if (propre) {
    return el('aside.sidebar-note', {}, [icone('info', 15), el('strong', { text: 'À retenir' }), el('p', { text: propre })]);
  }
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
      'ni ne validez à la place d’un acteur du marché. Un crédit que vous saisissez ' +
      'est validé par une autre personne.',
    activation_inscription:
      'Aucun transporteur ne s’engage sur le marché sans votre contrôle : dossier, ' +
      'cartes grises, permis. Vous ne voyez ni soldes ni coordonnées de contact.',
    // Lot b1 : agent d'activation des affréteurs et intermédiaires de fret.
    activation_inscription_affreteur:
      'Vous contrôlez les dossiers des affréteurs et des intermédiaires de fret. ' +
      'L’activation revient à un autre agent que celui qui a déclaré les pièces conformes.',
    // Lot b2 : organisation interne
    intermediaire:
      'Vous agissez pour vos mandants dans le périmètre et la période que chacun vous a ' +
      'confiés. La validation, qui engage leurs frais, leur reste réservée.',
    collaborateur_intermediaire:
      'Vous agissez pour les mandants de votre entreprise, dans le périmètre de chaque ' +
      'mandat. La validation leur reste réservée.',
    mandataire_affreteur:
      'Vous préparez les dossiers de votre mandant. La validation, qui débite ses frais, ' +
      'lui revient ; les coordonnées des transporteurs ne sont transmises qu’à lui.',
    mandataire_transporteur:
      'Vous répondez pour votre mandant dans le périmètre confié. Les coordonnées des ' +
      'affréteurs ne sont transmises qu’à lui, après validation.',
    /* Lot b3 : contrôle sur route */
    agent_controle_route:
      'Chaque vérification est enregistrée à votre nom, quel qu’en soit le résultat. ' +
      'Vous voyez l’authenticité et l’état du document, jamais les coordonnées des entreprises.',
    /* Lot b4 : contentieux et supervision comptable */
    contentieux_paie:
      'Vous instruisez les litiges et les impayés, du dossier à sa clôture. Vous ' +
      'n’encaissez pas : un règlement passe par la caisse, puis par sa validation.',
    superviseur_comptabilite:
      'Vous lisez les montants, les reçus et les modes de paiement, jamais ' +
      'l’identité des entreprises. Chaque export est inscrit au journal.',
    // Intégration : le partenaire a des droits ; le texte par défaut disait le contraire.
    partenaire:
      'Vous consultez la flotte, les disponibilités et les transports de votre groupement. ' +
      'Publier, répondre et engager ses frais reviennent à son responsable.',
  };
  // Intégration : les transporteurs déclinés ont les droits du transporteur.
  textes.transporteur_prive = textes.transporteur;
  textes.transporteur_etranger = textes.transporteur;
  const defaut =
    // Lot b4 : caisse, contentieux et comptabilité ont désormais leurs écrans.
    'Aucun droit métier n’est accordé à ce rôle dans ce POC. Le rôle existe et ' +
    'reste administrable.';

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
      // Lot b1 : messages (courriels et SMS simulés) adressés à l'utilisateur.
      el('a', {
        class: 'icon-btn-ghost',
        href: `#/${segmentEspace(ctx)}/messages`,
        'aria-label': 'Mes messages',
        title: 'Mes messages',
      }, [icone('mail', 18)]),
      // Intégration : la cloche ne s'affiche que si l'écran des notifications
      // existe pour ce rôle (elle menait sinon à un refus).
      localiser(ctx, 'notifications')
        ? el('a', {
            class: 'icon-btn-ghost',
            href: `#/${segmentEspace(ctx)}/notifications`,
            'aria-label': compte > 0 ? `${compte} notification(s) non lue(s)` : 'Notifications',
            title: compte > 0 ? `${compte} non lue(s)` : 'Notifications',
          }, [icone('bell', 18)])
        : null,
      // Lot b1 : le bloc d'identité ouvre « Mon profil ».
      el('a.topbar-profile', { href: `#/${segmentEspace(ctx)}/profil`, title: 'Mon profil' }, [
        el('span.avatar-round', { text: initiales(moi, r) }),
        el('div', {}, [el('strong', { text: nomAffiche(moi, r.libelle) }), el('small', { text: r.libelle })]),
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
  if (ctx.mandat) return bandeauMandat(ctx); // Lot b2
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

/**
 * Lot b2 : bandeau d'un intermédiaire agissant au nom d'un mandant — sur tous
 * les écrans du contexte délégué, avec le retour à son propre espace.
 * @param {import('../domain/access.js').Contexte} ctx
 */
function bandeauMandat(ctx) {
  const m = ctx.mandat;
  const fin = new Date(`${m.finitLe}T00:00:00`).toLocaleDateString('fr-FR');
  return el('div.delegation-bar.mandat-bar', { role: 'status' }, [
    icone('briefcase', 16),
    el('strong', { text: `Au nom de ${m.mandantNom}` }),
    el('span', {
      text:
        `Mandat ${m.reference}, jusqu’au ${fin} : ${m.perimetre.map((p) => labelOf(p).toLowerCase()).join(', ')}. ` +
        'Chaque action est tracée au nom de votre mandant ; la validation et les coordonnées lui restent réservées.',
    }),
    el('button.btn.btn-secondary.mandat-bar-retour', {
      type: 'button',
      on: {
        click: () => {
          revenirAMonEspace();
          globalThis.location.hash = '#/intermediaire/mandants';
        },
      },
    }, [icone('undo-2', 16), el('span', { text: 'Revenir à mon espace' })]),
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
