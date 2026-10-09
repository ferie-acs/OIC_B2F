/* ==========================================================================
   B2F — maquette interactive. Vanilla JS, aucune dépendance.
   Ce fichier n'est PAS le code du POC : c'est une maquette cliquable destinée
   à valider parcours, hiérarchie et rendu avant implémentation.
   L'implémentation réelle suivra VUE → SERVICE → REPOSITORY → LOCALSTORAGE.
   ========================================================================== */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

const ic = (name, size = 18) =>
  `<svg width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="#ic-${name}"/></svg>`;

const money = (n) => new Intl.NumberFormat('fr-FR').format(n) + ' F CFA';

/* ==========================================================================
   1. Rôles démontrés (niveau 1 du plan de suivi § 1.4)
   ========================================================================== */
const ROLES = {
  affreteur: {
    label: 'Affréteur',
    user: 'Aya KOUASSI',
    org: 'Ivoire Cacao Export — DÉMO',
    note: {
      title: 'Déclarez, comparez, validez',
      text: 'Votre fret trouve un véhicule et la mise en relation reste tracée de bout en bout.'
    },
    zones: [
      { id: 'pilotage', icon: 'dashboard', label: 'Pilotage', sections: [
        { label: 'Pilotage', items: [
          { id: 'aff-dashboard', icon: 'dashboard', label: 'Tableau de bord' },
          { id: 'aff-notifications', icon: 'bell', label: 'Notifications', pill: '3', jalon: 'J5' }
        ] }
      ] },
      { id: 'fret', icon: 'package', label: 'Mon fret', sections: [
        { label: 'Mon fret', items: [
          { id: 'aff-declarations', icon: 'file', label: 'Déclarations de fret' },
          { id: 'aff-wizard', icon: 'plus', label: 'Nouvelle déclaration' },
          { id: 'aff-demandes', icon: 'inbox', label: 'Demandes de transport' }
        ] }
      ] },
      { id: 'marche', icon: 'search', label: 'Marché', sections: [
        { label: 'Marché', items: [
          { id: 'aff-recherche', icon: 'search', label: 'Rechercher un véhicule' },
          { id: 'aff-reservations', icon: 'clock', label: 'Mes réservations', pill: '2' }
        ] }
      ] },
      { id: 'relations', icon: 'handshake', label: 'Mises en relation', sections: [
        { label: 'Mises en relation', items: [
          { id: 'aff-validation', icon: 'check-circle', label: 'À valider', pill: '1' },
          { id: 'aff-relation', icon: 'link', label: 'Mises en relation validées' },
          { id: 'aff-suivi', icon: 'truck', label: 'Suivi des transports' }
        ] }
      ] },
      { id: 'compte', icon: 'wallet', label: 'Compte', sections: [
        { label: 'Compte du groupement', items: [
          { id: 'aff-solde', icon: 'wallet', label: 'Solde et mouvements' },
          { id: 'aff-abonnement', icon: 'shield', label: 'Abonnement', jalon: 'J5' }
        ] }
      ] },
      { id: 'param', icon: 'settings', label: 'Paramètres', sections: [
        { label: 'Mon groupement', items: [
          { id: 'aff-groupement', icon: 'building', label: 'Fiche du groupement' },
          { id: 'aff-utilisateurs', icon: 'users', label: 'Utilisateurs et auxiliaires' }
        ] }
      ] }
    ]
  },

  transporteur: {
    label: 'Transporteur',
    user: 'Moussa DIABATÉ',
    org: 'Trans Lagunes — DÉMO',
    note: {
      title: 'Votre flotte, visible',
      text: 'Publiez vos disponibilités et répondez aux demandes de fret publiées sur le marché.'
    },
    zones: [
      { id: 'pilotage', icon: 'dashboard', label: 'Pilotage', sections: [
        { label: 'Pilotage', items: [
          { id: 'tra-dashboard', icon: 'dashboard', label: 'Tableau de bord' },
          { id: 'aff-notifications', icon: 'bell', label: 'Notifications', pill: '2', jalon: 'J5' }
        ] }
      ] },
      { id: 'flotte', icon: 'truck', label: 'Ma flotte', sections: [
        { label: 'Ma flotte', items: [
          { id: 'tra-vehicules', icon: 'truck', label: 'Véhicules' },
          { id: 'tra-chauffeurs', icon: 'users', label: 'Chauffeurs' },
          { id: 'tra-offres', icon: 'file', label: 'Mes offres publiées' },
          { id: 'tra-publier', icon: 'plus', label: 'Publier une offre' }
        ] }
      ] },
      { id: 'marche', icon: 'search', label: 'Marché', sections: [
        { label: 'Marché', items: [
          { id: 'tra-demandes', icon: 'search', label: 'Demandes de transport' },
          { id: 'tra-reservations', icon: 'inbox', label: 'Réservations reçues', pill: '2' }
        ] }
      ] },
      { id: 'relations', icon: 'handshake', label: 'Mises en relation', sections: [
        { label: 'Mises en relation', items: [
          { id: 'tra-relation', icon: 'link', label: 'Mises en relation validées' },
          { id: 'tra-suivi', icon: 'truck', label: 'Suivi des transports' },
          { id: 'tra-dut', icon: 'file', label: 'Générer un DUT', jalon: 'J5' }
        ] }
      ] },
      { id: 'compte', icon: 'wallet', label: 'Compte', sections: [
        { label: 'Compte du groupement', items: [
          { id: 'aff-solde', icon: 'wallet', label: 'Solde et mouvements' },
          { id: 'aff-abonnement', icon: 'shield', label: 'Abonnement', jalon: 'J5' }
        ] }
      ] },
      { id: 'param', icon: 'settings', label: 'Paramètres', sections: [
        { label: 'Mon groupement', items: [
          { id: 'aff-groupement', icon: 'building', label: 'Fiche du groupement' },
          { id: 'aff-utilisateurs', icon: 'users', label: 'Utilisateurs et auxiliaires' }
        ] }
      ] }
    ]
  },

  auxiliaire: {
    label: 'Auxiliaire',
    user: 'Bintou TRAORÉ',
    org: 'pour Ivoire Cacao Export — DÉMO',
    delegation: 'Ivoire Cacao Export',
    note: {
      title: 'Vous agissez par délégation',
      text: 'Vous préparez et suivez les dossiers. La validation financière reste au compte parent.'
    },
    zones: [
      { id: 'pilotage', icon: 'dashboard', label: 'Pilotage', sections: [
        { label: 'Pilotage', items: [
          { id: 'aux-dashboard', icon: 'dashboard', label: 'Tableau de bord' }
        ] }
      ] },
      { id: 'fret', icon: 'package', label: 'Mon fret', sections: [
        { label: 'Fret du parent', items: [
          { id: 'aff-declarations', icon: 'file', label: 'Déclarations de fret' },
          { id: 'aff-wizard', icon: 'plus', label: 'Nouvelle déclaration' },
          { id: 'aff-demandes', icon: 'inbox', label: 'Demandes de transport' }
        ] }
      ] },
      { id: 'marche', icon: 'search', label: 'Marché', sections: [
        { label: 'Marché', items: [
          { id: 'aff-recherche', icon: 'search', label: 'Rechercher un véhicule' },
          { id: 'aff-reservations', icon: 'clock', label: 'Réservations' }
        ] }
      ] },
      { id: 'relations', icon: 'handshake', label: 'Mises en relation', sections: [
        { label: 'Mises en relation', items: [
          { id: 'aux-validation', icon: 'check-circle', label: 'À valider', pill: '1' },
          { id: 'aff-suivi', icon: 'truck', label: 'Suivi des transports' }
        ] }
      ] },
      { id: 'compte', icon: 'wallet', label: 'Compte', sections: [
        { label: 'Compte du parent', items: [
          { id: 'aff-solde', icon: 'wallet', label: 'Solde et mouvements' }
        ] }
      ] }
    ]
  },

  concessionnaire: {
    label: 'Concessionnaire',
    user: 'Serge N\'GUESSAN',
    org: 'Exploitant de la plateforme — DÉMO',
    note: {
      title: 'Exploitation de la plateforme',
      text: 'Vous administrez les acteurs et les comptes. Vous ne publiez ni ne validez à leur place.'
    },
    zones: [
      { id: 'pilotage', icon: 'dashboard', label: 'Pilotage', sections: [
        { label: 'Pilotage', items: [
          { id: 'con-dashboard', icon: 'dashboard', label: 'Tableau de bord' }
        ] }
      ] },
      { id: 'acteurs', icon: 'building', label: 'Acteurs', sections: [
        { label: 'Acteurs', items: [
          { id: 'con-groupements', icon: 'building', label: 'Groupements' },
          { id: 'con-roles', icon: 'users', label: 'Utilisateurs et rôles' }
        ] }
      ] },
      { id: 'finances', icon: 'wallet', label: 'Finances', sections: [
        { label: 'Finances', items: [
          { id: 'con-comptes', icon: 'wallet', label: 'Comptes et soldes' },
          { id: 'con-tarifs', icon: 'scale', label: 'Catalogue de tarifs' },
          { id: 'con-abonnements', icon: 'shield', label: 'Abonnements', jalon: 'J5' }
        ] }
      ] },
      { id: 'marche', icon: 'search', label: 'Marché', sections: [
        { label: 'Supervision du marché', items: [
          { id: 'dgt-etats', icon: 'activity', label: 'Déclarations et offres' },
          { id: 'con-relations', icon: 'handshake', label: 'Mises en relation' }
        ] }
      ] },
      { id: 'journal', icon: 'history', label: 'Journal', sections: [
        { label: 'Traçabilité', items: [
          { id: 'con-audit', icon: 'history', label: 'Journal d\'audit' }
        ] }
      ] }
    ]
  },

  dgttc: {
    label: 'DGTTC',
    user: 'Colonel Adama FOFANA',
    org: 'Direction Générale des Transports Terrestres — DÉMO',
    note: {
      title: 'Contrôle, pas transaction',
      text: 'Votre espace est en consultation. Aucune action sur le marché ne vous est accessible.'
    },
    zones: [
      { id: 'pilotage', icon: 'dashboard', label: 'Pilotage', sections: [
        { label: 'Pilotage', items: [
          { id: 'dgt-dashboard', icon: 'dashboard', label: 'Tableau de bord national' }
        ] }
      ] },
      { id: 'etats', icon: 'activity', label: 'États de contrôle', sections: [
        { label: 'États de contrôle', items: [
          { id: 'dgt-etats', icon: 'activity', label: 'Déclarations et offres' },
          { id: 'dgt-relations', icon: 'handshake', label: 'Mises en relation' }
        ] }
      ] },
      { id: 'acteurs', icon: 'building', label: 'Acteurs', sections: [
        { label: 'Acteurs et parc', items: [
          { id: 'dgt-acteurs', icon: 'building', label: 'Transporteurs et affréteurs' },
          { id: 'dgt-parc', icon: 'truck', label: 'Parc de véhicules' }
        ] }
      ] },
      { id: 'journal', icon: 'history', label: 'Journal', sections: [
        { label: 'Traçabilité', items: [
          { id: 'con-audit', icon: 'history', label: 'Journal d\'audit' }
        ] }
      ] }
    ]
  }
};

/* ==========================================================================
   2. État de la maquette
   ========================================================================== */
const state = {
  role: 'affreteur',
  screen: 'aff-dashboard',
  zone: 'pilotage',
  theme: 'light'
};

const initials = (name) =>
  name.split(/[\s']+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function allItems(role) {
  return ROLES[role].zones.flatMap((z) => z.sections.flatMap((s) => s.items.map((i) => ({ ...i, zone: z.id }))));
}

function findItem(role, screenId) {
  return allItems(role).find((i) => i.id === screenId);
}

/* ==========================================================================
   3. Shell applicatif — rail (zones) + sidebar (pages de la zone) + topbar
   Navigation à deux niveaux, reprise du POC DUT et corrigée : le rail porte
   des ZONES, pas une copie de chaque lien de la sidebar.
   ========================================================================== */
function renderShell(body, crumbs) {
  const role = ROLES[state.role];
  const zone = role.zones.find((z) => z.id === state.zone) || role.zones[0];

  const rail = role.zones.map((z) => `
    <button type="button" class="rail-link ${z.id === zone.id ? 'active' : ''}"
            data-zone="${z.id}" title="${z.label}" aria-label="${z.label}"
            aria-current="${z.id === zone.id ? 'true' : 'false'}">${ic(z.icon, 22)}</button>
  `).join('');

  const nav = zone.sections.map((section) => `
    <div class="sidebar-section">
      <div class="sidebar-section-label">${section.label}</div>
      ${section.items.map((item) => `
        <button type="button" class="nav-link ${item.id === state.screen ? 'active' : ''}" data-screen="${item.id}"
                ${item.id === state.screen ? 'aria-current="page"' : ''}>
          ${ic(item.icon, 19)}<span>${item.label}</span>
          ${item.pill ? `<span class="pill">${item.pill}</span>` : ''}
          ${item.jalon ? `<span class="pill" style="background:var(--surface-sunken);color:var(--text-muted)">${item.jalon}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `).join('');

  app.innerHTML = `
    <div class="app-shell">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <aside class="sidebar" id="sidebar">
        <nav class="app-rail" aria-label="Zones de l'application">
          <span class="rail-logo">B2F</span>
          ${rail}
          <span class="rail-bottom rail-link" title="Bourse de Fret — Office Ivoirien des Chargeurs">${ic('handshake', 22)}</span>
        </nav>
        <div class="sidebar-brand">
          <strong>Bourse de Fret</strong>
          <span>Office Ivoirien des Chargeurs</span>
          <span class="brand-tag">${ic('handshake', 12)} Mise en relation</span>
        </div>
        <nav class="sidebar-nav" aria-label="Navigation principale">${nav}</nav>
        <div class="sidebar-note">
          ${ic('shield', 22)}
          <strong>${role.note.title}</strong>
          <p>${role.note.text}</p>
          <span class="badge badge-warning" style="margin-top:12px">Espace de démonstration</span>
        </div>
        <div class="sidebar-footer">
          <span class="avatar-round">${initials(role.user)}</span>
          <div class="sidebar-user">
            <strong>${role.user}</strong>
            <span>${role.label}</span>
          </div>
          <button type="button" class="icon-btn-ghost" id="btn-logout" aria-label="Se déconnecter" title="Se déconnecter">${ic('logout', 17)}</button>
        </div>
      </aside>

      <header class="topbar">
        <div class="row gap-2">
          <button type="button" class="icon-btn-ghost" id="btn-menu" aria-label="Ouvrir le menu" aria-expanded="false" style="display:none">${ic('menu', 20)}</button>
          <nav class="breadcrumb" aria-label="Fil d'Ariane">
            ${crumbs.map((c, i) => `${i ? `<span aria-hidden="true">${ic('chevron-right', 13)}</span>` : ''}<span class="${i === crumbs.length - 1 ? 'crumb-current' : ''}">${c}</span>`).join('')}
          </nav>
        </div>
        <div class="header-search">
          ${ic('search', 17)}
          <label for="global-search" class="sr-only">Rechercher une déclaration, une offre ou un véhicule</label>
          <input id="global-search" placeholder="Rechercher une déclaration, une offre…" autocomplete="off">
          <kbd>/</kbd>
        </div>
        <div class="topbar-right">
          <span class="role-chip">${role.label}</span>
          <button type="button" class="icon-btn-ghost" id="theme-toggle" aria-label="Changer le thème" title="Thème clair / sombre">${ic(state.theme === 'dark' ? 'moon' : 'sun', 21)}</button>
          <button type="button" class="icon-btn-ghost" aria-label="Notifications" title="Notifications">${ic('bell', 21)}</button>
          <div class="topbar-profile">
            <div><strong>${role.user}</strong><small>${role.org}</small></div>
            <span class="avatar-round">${initials(role.user)}</span>
          </div>
        </div>
      </header>

      <main class="main-content" id="main-content" tabindex="-1">
        ${role.delegation ? `
        <div class="delegation-bar">
          ${ic('users', 18)}
          <span>Vous agissez pour le compte de <strong>${role.delegation}</strong>. Vos actions sont enregistrées à votre nom.</span>
        </div>` : ''}
        ${body}
      </main>

      <footer class="app-footer">
        <span>Bourse de Fret — Preuve de concept · Office Ivoirien des Chargeurs</span>
        <span>Données fictives · aucune donnée d'exploitation</span>
      </footer>
    </div>
  `;
  bindShell();
}

function bindShell() {
  app.querySelectorAll('[data-zone]').forEach((el) => {
    el.addEventListener('click', () => {
      const role = ROLES[state.role];
      const zone = role.zones.find((z) => z.id === el.dataset.zone);
      state.zone = zone.id;
      state.screen = zone.sections[0].items[0].id;
      render();
    });
  });
  app.querySelectorAll('[data-screen]').forEach((el) => {
    el.addEventListener('click', () => go(el.dataset.screen));
  });
  $('#theme-toggle', app).addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    render();
  });
  $('#btn-logout', app).addEventListener('click', () => renderLogin());

  const sidebar = $('#sidebar', app);
  const backdrop = $('#sidebar-backdrop', app);
  const menuBtn = $('#btn-menu', app);
  const toggle = (open) => {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => toggle(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => toggle(false));
  if (window.matchMedia('(max-width: 960px)').matches) menuBtn.style.display = 'flex';
}

function go(screenId) {
  const item = findItem(state.role, screenId);
  if (item) { state.screen = item.id; state.zone = item.zone; }
  else state.screen = screenId;
  render();
  $('#main-content', app)?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}
window.b2fGo = go;

/* ==========================================================================
   4. Modale (confirmations, rejets, crédit)
   ========================================================================== */
function modal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
    <button type="button" class="modal-close" aria-label="Fermer">${ic('x', 18)}</button>${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.modal-close').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  wrap.querySelector('.modal-card').focus?.();
  return { el: wrap, close };
}
window.b2fModal = modal;

/* ==========================================================================
   5. Fragments réutilisables
   ========================================================================== */
const pageHeader = (overline, title, subtitle, actions = '') => `
  <div class="page-header">
    <div>
      <span class="overline">${overline}</span>
      <h1>${title}</h1>
      ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
    </div>
    ${actions ? `<div class="row gap-2 wrap">${actions}</div>` : ''}
  </div>
  <div class="page-header-rule"></div>`;

const kpi = (label, value, iconName, tone, trend) => `
  <div class="kpi-card">
    <div class="kpi-label">
      <span>${label}</span>
      <span class="kpi-icon" style="background:var(--sq-${tone}-bg);color:var(--sq-${tone}-fg)">${ic(iconName, 16)}</span>
    </div>
    <div class="kpi-value mono-num">${value}</div>
    ${trend ? `<div class="kpi-trend ${trend.dir}">${trend.text}</div>` : ''}
  </div>`;

const corridor = (from, to, pct, n) => `
  <div class="corridor">
    <div class="corridor-label"><span>${from} → ${to}</span><strong>${n}</strong></div>
    <div class="corridor-track"><div class="corridor-fill" style="width:${pct}%"></div></div>
  </div>`;

const emptyState = (title, text, action = '') => `
  <div class="empty-state">
    ${ic('inbox', 44)}
    <h3>${title}</h3>
    <p>${text}</p>
    ${action}
  </div>`;

const jalonNote = (jalon, texte) => `
  <div class="alert-banner">
    ${ic('info', 19)}
    <div><strong>Prévu au jalon ${jalon}</strong>${texte}</div>
  </div>`;

/* ==========================================================================
   6. ÉCRANS — Affréteur
   ========================================================================== */
const SCREENS = {};

SCREENS['aff-dashboard'] = () => ({
  crumbs: ['Pilotage', 'Tableau de bord'],
  body: `
    ${pageHeader('Affréteur', 'Tableau de bord', 'Votre fret, vos réservations et l\'état de votre compte.',
      `<button class="btn btn-primary" onclick="b2fGo('aff-wizard')">${ic('plus', 16)} Déclarer un fret</button>`)}

    <div class="alert-banner signature">
      ${ic('handshake', 19)}
      <div><strong>Une mise en relation attend votre validation</strong>
      Trans Lagunes a accepté votre réservation pour la demande DT-2026-0148.
      <button class="link-action" onclick="b2fGo('aff-validation')" style="margin-left:6px">Valider maintenant</button></div>
    </div>

    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Déclarations actives', '7', 'package', 'blue')}
      ${kpi('Demandes publiées', '4', 'inbox', 'blue', { dir: 'up', text: '+2 cette semaine' })}
      ${kpi('Réservations en cours', '2', 'clock', 'amber')}
      ${kpi('Transports en route', '3', 'truck', 'teal')}
      ${kpi('Solde du compte', '420 000', 'wallet', 'green', { dir: '', text: 'F CFA — suffisant' })}
    </div>

    <div class="ops-grid">
      <section class="card">
        <div class="card-header">
          <div><h3>Mes demandes de transport</h3><p class="subtitle">État d'avancement des demandes publiées.</p></div>
          <button class="link-action" onclick="b2fGo('aff-demandes')">Tout voir</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Référence</th><th>Corridor</th><th>Départ</th><th>Marchandise</th><th>État</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td class="cell-2line"><strong>DT-2026-0148</strong><span>DF-2026-0092</span></td>
                <td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Bouaké</div></td>
                <td class="mono-num">02/10/2026</td>
                <td class="cell-2line"><strong>Fèves de cacao</strong><span>24 t · 60 m³</span></td>
                <td><span class="badge status-accepter">${ic('check', 12)} Acceptée</span></td>
                <td class="text-right"><button class="link-action" onclick="b2fGo('aff-validation')">Valider</button></td>
              </tr>
              <tr>
                <td class="cell-2line"><strong>DT-2026-0151</strong><span>DF-2026-0094</span></td>
                <td><div class="corridor-cell">San-Pédro ${ic('arrow-right', 15)} Abidjan</div></td>
                <td class="mono-num">05/10/2026</td>
                <td class="cell-2line"><strong>Bois scié</strong><span>18 t · 42 m³</span></td>
                <td><span class="badge status-reserver">${ic('clock', 12)} Réservée</span></td>
                <td class="text-right"><button class="link-action" onclick="b2fGo('aff-reservations')">Suivre</button></td>
              </tr>
              <tr>
                <td class="cell-2line"><strong>DT-2026-0153</strong><span>DF-2026-0095</span></td>
                <td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Korhogo</div></td>
                <td class="mono-num">08/10/2026</td>
                <td class="cell-2line"><strong>Engrais NPK</strong><span>30 t · 35 m³</span></td>
                <td><span class="badge status-publiee">${ic('activity', 12)} Publiée</span></td>
                <td class="text-right"><button class="link-action" onclick="b2fGo('aff-recherche')">Chercher</button></td>
              </tr>
              <tr>
                <td class="cell-2line"><strong>DT-2026-0139</strong><span>DF-2026-0088</span></td>
                <td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Man</div></td>
                <td class="mono-num">28/09/2026</td>
                <td class="cell-2line"><strong>Ciment</strong><span>28 t · 20 m³</span></td>
                <td><span class="badge status-valider">${ic('check-circle', 12)} Validée</span></td>
                <td class="text-right"><button class="link-action" onclick="b2fGo('aff-suivi')">Suivi</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h3>Vos corridors</h3><p class="subtitle">Demandes des 90 derniers jours.</p></div></div>
        ${corridor('Abidjan', 'Bouaké', 100, 14)}
        ${corridor('Abidjan', 'Korhogo', 72, 10)}
        ${corridor('San-Pédro', 'Abidjan', 51, 7)}
        ${corridor('Abidjan', 'Man', 30, 4)}
        <div class="row-between" style="border-top:1px solid var(--border);padding-top:15px;margin-top:20px;font-size:13px;color:var(--text-secondary)">
          <span>Taux d'appariement</span><strong>78 %</strong>
        </div>
      </section>
    </div>`
});

SCREENS['aff-declarations'] = () => ({
  crumbs: ['Mon fret', 'Déclarations de fret'],
  body: `
    ${pageHeader('Mon fret', 'Déclarations de fret', 'Le fret que vous avez déclaré. Une déclaration porte une ou plusieurs demandes de transport.',
      `<button class="btn btn-primary" onclick="b2fGo('aff-wizard')">${ic('plus', 16)} Nouvelle déclaration</button>`)}
    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">Toutes <span class="count">12</span></button>
          <button class="tab-btn">Actives <span class="count">7</span></button>
          <button class="tab-btn">Clôturées <span class="count">5</span></button>
        </div>
        <div class="row gap-2">
          <button class="btn btn-sm btn-secondary">${ic('download', 15)} Exporter</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Référence</th><th>Libellé</th><th>Provenance</th><th>Destination</th><th>Demandes</th><th>État</th><th></th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">DF-2026-0095</td><td>Engrais NPK — campagne Nord</td><td>Abidjan — Port</td><td>Korhogo</td><td class="mono-num">1</td><td><span class="badge status-publiee">Publiée</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="mono-num fw-bold">DF-2026-0094</td><td>Bois scié — lot B</td><td>San-Pédro</td><td>Abidjan — Zone 4</td><td class="mono-num">1</td><td><span class="badge status-publiee">Publiée</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="mono-num fw-bold">DF-2026-0092</td><td>Fèves de cacao — récolte principale</td><td>Abidjan — Vridi</td><td>Bouaké</td><td class="mono-num">2</td><td><span class="badge status-publiee">Publiée</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="mono-num fw-bold">DF-2026-0088</td><td>Ciment — chantier Man</td><td>Abidjan — Akouédo</td><td>Man</td><td class="mono-num">1</td><td><span class="badge status-valider">Validée</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="mono-num fw-bold">DF-2026-0081</td><td>Anacarde — export</td><td>Bouaké</td><td>Abidjan — Port</td><td class="mono-num">1</td><td><span class="badge status-brouillon">Brouillon</span></td><td class="text-right"><button class="link-action">Reprendre</button></td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>5 déclarations sur 12</span>
        <div class="pagination-pages"><button class="active">1</button><button>2</button><button>3</button></div>
      </div>
    </section>`
});

SCREENS['aff-wizard'] = () => ({
  crumbs: ['Mon fret', 'Nouvelle déclaration'],
  body: `
    ${pageHeader('Mon fret', 'Déclarer un fret', 'Trois étapes : le fret, le besoin de transport, puis les marchandises.')}
    <div class="stepper-h">
      <div class="stepper-h-step done"><span class="dot">${ic('check', 13)}</span><span class="label">1. Le fret</span></div>
      <div class="stepper-h-connector done"></div>
      <div class="stepper-h-step current"><span class="dot">2</span><span class="label">2. Le besoin de transport</span></div>
      <div class="stepper-h-connector"></div>
      <div class="stepper-h-step"><span class="dot">3</span><span class="label">3. Les marchandises</span></div>
    </div>

    <div class="wizard">
      <section class="card">
        <div class="wizard-section-label">Fenêtre de transport</div>
        <div class="field-row">
          <div class="field">
            <label for="w-dep">Date et heure de départ <span class="req" aria-hidden="true">*</span></label>
            <input class="input" id="w-dep" type="datetime-local" value="2026-10-02T08:00" required>
          </div>
          <div class="field">
            <label for="w-arr">Date et heure d'arrivée souhaitée <span class="req" aria-hidden="true">*</span></label>
            <input class="input" id="w-arr" type="datetime-local" value="2026-10-03T16:00" required>
          </div>
        </div>
        <div class="field has-error">
          <label for="w-arr2">Date d'arrivée — exemple d'erreur bloquante</label>
          <input class="input" id="w-arr2" type="datetime-local" value="2026-10-01T16:00" aria-describedby="w-err" aria-invalid="true">
          <p class="error-msg" id="w-err">${ic('alert', 13)} L'arrivée doit être postérieure au départ. Corrigez la date pour continuer.</p>
        </div>

        <div class="wizard-section-label">Caractéristiques du véhicule attendu</div>
        <div class="field-row">
          <div class="field">
            <label for="w-cap">Capacité <span class="req" aria-hidden="true">*</span></label>
            <select class="select" id="w-cap"><option>De 20 à 30 tonnes</option><option>Moins de 10 tonnes</option><option>De 10 à 20 tonnes</option><option>Plus de 30 tonnes</option></select>
          </div>
          <div class="field">
            <label for="w-car">Carrosserie <span class="req" aria-hidden="true">*</span></label>
            <select class="select" id="w-car"><option>Bâchée</option><option>Plateau</option><option>Benne</option><option>Citerne</option><option>Frigorifique</option><option>Porte-conteneur</option></select>
          </div>
          <div class="field">
            <label for="w-ess">Nombre d'essieux</label>
            <select class="select" id="w-ess"><option>3 essieux</option><option>2 essieux</option><option>4 essieux</option><option>5 essieux et plus</option></select>
          </div>
        </div>

        <div class="field">
          <label for="w-note">Contraintes particulières</label>
          <textarea class="textarea" id="w-note" placeholder="Chargement en hauteur, bâche obligatoire, accès restreint…"></textarea>
          <p class="hint">Visible par les transporteurs consultant votre demande.</p>
        </div>

        <div class="wizard-footer">
          <button class="btn btn-secondary">${ic('arrow-left', 16)} Étape précédente</button>
          <div class="row gap-2">
            <button class="btn btn-ghost">Enregistrer en brouillon</button>
            <button class="btn btn-primary">Étape suivante ${ic('arrow-right', 16)}</button>
          </div>
        </div>
      </section>

      <aside class="card live-recap" aria-label="Récapitulatif de la saisie">
        <div class="card-header"><div><h3>Récapitulatif</h3><p class="subtitle">Mis à jour en continu.</p></div></div>
        <div class="live-recap-item"><span>Libellé du fret</span><strong>Fèves de cacao</strong></div>
        <div class="live-recap-item"><span>Provenance</span><strong>Abidjan — Vridi</strong></div>
        <div class="live-recap-item"><span>Destination</span><strong>Bouaké</strong></div>
        <div class="live-recap-item"><span>Départ</span><strong>02/10/2026 08:00</strong></div>
        <div class="live-recap-item"><span>Arrivée</span><strong>03/10/2026 16:00</strong></div>
        <div class="live-recap-item"><span>Capacité</span><strong>20 à 30 t</strong></div>
        <div class="live-recap-item"><span>Carrosserie</span><strong>Bâchée</strong></div>
        <div class="live-recap-item"><span>Marchandises</span><strong class="text-muted">À l'étape 3</strong></div>
        <div class="alert-banner" style="margin:18px 0 0">
          ${ic('info', 19)}
          <div>Publier une demande ne coûte rien. Les frais de mise en relation ne sont débités qu'à la validation finale.</div>
        </div>
      </aside>
    </div>`
});

SCREENS['aff-demandes'] = () => ({
  crumbs: ['Mon fret', 'Demandes de transport'],
  body: `
    ${pageHeader('Mon fret', 'Demandes de transport', 'Le besoin exprimé pour un fret déclaré : dates, capacité, carrosserie, marchandises.')}
    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">Toutes <span class="count">9</span></button>
          <button class="tab-btn">Publiées <span class="count">4</span></button>
          <button class="tab-btn">Réservées <span class="count">2</span></button>
          <button class="tab-btn">Validées <span class="count">2</span></button>
          <button class="tab-btn">Annulées <span class="count">1</span></button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Référence</th><th>Corridor</th><th>Fenêtre</th><th>Capacité</th><th>Carrosserie</th><th>État</th><th></th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">DT-2026-0148</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Bouaké</div></td><td class="mono-num">02 → 03/10</td><td>20–30 t</td><td>Bâchée</td><td><span class="badge status-accepter">Acceptée</span></td><td class="text-right"><button class="link-action" onclick="b2fGo('aff-validation')">Valider</button></td></tr>
            <tr><td class="mono-num fw-bold">DT-2026-0151</td><td><div class="corridor-cell">San-Pédro ${ic('arrow-right', 15)} Abidjan</div></td><td class="mono-num">05 → 06/10</td><td>10–20 t</td><td>Plateau</td><td><span class="badge status-reserver">Réservée</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="mono-num fw-bold">DT-2026-0153</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Korhogo</div></td><td class="mono-num">08 → 09/10</td><td>+30 t</td><td>Benne</td><td><span class="badge status-publiee">Publiée</span></td><td class="text-right"><button class="link-action" onclick="b2fGo('aff-recherche')">Chercher</button></td></tr>
            <tr><td class="mono-num fw-bold">DT-2026-0139</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Man</div></td><td class="mono-num">28 → 29/09</td><td>20–30 t</td><td>Bâchée</td><td><span class="badge status-valider">Validée</span></td><td class="text-right"><button class="link-action" onclick="b2fGo('aff-relation')">Coordonnées</button></td></tr>
            <tr><td class="mono-num fw-bold">DT-2026-0131</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Daloa</div></td><td class="mono-num">20 → 21/09</td><td>10–20 t</td><td>Bâchée</td><td><span class="badge status-annuler">Annulée</span></td><td class="text-right"><span class="text-muted" style="font-size:13px">Clôturée</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['aff-recherche'] = () => ({
  crumbs: ['Marché', 'Rechercher un véhicule'],
  body: `
    ${pageHeader('Marché', 'Véhicules disponibles', 'Les offres publiées par les transporteurs. Réservez celle qui correspond à votre demande.')}

    <section class="card" style="margin-bottom:22px">
      <div class="field-row" style="margin-bottom:0">
        <div class="field" style="margin-bottom:0"><label for="f-dep">Localité de départ</label><select class="select" id="f-dep"><option>Abidjan</option><option>Toutes</option><option>San-Pédro</option><option>Bouaké</option></select></div>
        <div class="field" style="margin-bottom:0"><label for="f-arr">Destination</label><select class="select" id="f-arr"><option>Bouaké</option><option>Toutes</option><option>Korhogo</option><option>Man</option></select></div>
        <div class="field" style="margin-bottom:0"><label for="f-per">À partir du</label><input class="input" id="f-per" type="date" value="2026-10-02"></div>
        <div class="field" style="margin-bottom:0"><label for="f-cap">Capacité</label><select class="select" id="f-cap"><option>20 à 30 t</option><option>Toutes</option></select></div>
        <div class="field" style="margin-bottom:0"><label for="f-car">Carrosserie</label><select class="select" id="f-car"><option>Bâchée</option><option>Toutes</option></select></div>
      </div>
      <div class="row-between wrap gap-2" style="margin-top:16px">
        <span class="text-muted" style="font-size:13px">Vos critères sont conservés d'une session à l'autre.</span>
        <div class="row gap-2">
          <button class="btn btn-sm btn-ghost">Réinitialiser</button>
          <button class="btn btn-sm btn-primary">${ic('search', 15)} Rechercher</button>
        </div>
      </div>
    </section>

    <div class="row-between wrap gap-2" style="margin-bottom:16px">
      <h2>3 véhicules correspondent</h2>
      <div class="row gap-2">
        <label for="tri" class="text-muted" style="font-size:13px">Trier par</label>
        <select class="select" id="tri" style="width:auto"><option>Date de disponibilité</option><option>Prix au km/tonne</option><option>Capacité</option></select>
      </div>
    </div>

    <div class="card-grid grid-3">
      ${[
        { org: 'Trans Lagunes — DÉMO', imm: 'AA-4521-CI', cap: '25 t', car: 'Bâchée', ess: '3 essieux', prix: 38, du: '02/10', au: '04/10', best: true },
        { org: 'Sahel Fret CI — DÉMO', imm: 'BB-1907-CI', cap: '28 t', car: 'Bâchée', ess: '3 essieux', prix: 42, du: '03/10', au: '05/10' },
        { org: 'Groupage Bandama — DÉMO', imm: 'CC-3388-CI', cap: '22 t', car: 'Bâchée', ess: '2 essieux', prix: 35, du: '02/10', au: '03/10' }
      ].map((o) => `
      <article class="offer-card">
        <div class="offer-head">
          <div>
            <p class="offer-title">${o.org}</p>
            <p class="text-muted" style="font-size:13px;margin-top:3px">Véhicule ${o.imm}</p>
          </div>
          ${o.best ? '<span class="badge badge-signature">Recommandé</span>' : '<span class="badge status-disponible">Disponible</span>'}
        </div>
        <div class="corridor-cell" style="font-weight:650">Abidjan ${ic('arrow-right', 15)} Bouaké</div>
        <div class="offer-meta">
          <div><span>Disponible</span><strong class="mono-num">${o.du} → ${o.au}</strong></div>
          <div><span>Capacité</span><strong>${o.cap}</strong></div>
          <div><span>Carrosserie</span><strong>${o.car}</strong></div>
          <div><span>Essieux</span><strong>${o.ess}</strong></div>
        </div>
        <div class="offer-foot">
          <div>
            <span class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">Prix indicatif</span>
            <strong style="display:block;font-size:15px" class="mono-num">${o.prix} F / km·t</strong>
          </div>
          <button class="btn btn-primary btn-sm" data-reserve="${o.org}">${ic('handshake', 15)} Réserver</button>
        </div>
      </article>`).join('')}
    </div>

    <div class="alert-banner" style="margin-top:22px">
      ${ic('info', 19)}
      <div><strong>Le prix au km/tonne est indicatif</strong>
      Il est déclaré par le transporteur et ne sert à aucune facturation. Seuls les frais de mise en relation de la plateforme sont débités.</div>
    </div>`
});

SCREENS['aff-reservations'] = () => ({
  crumbs: ['Marché', 'Mes réservations'],
  body: `
    ${pageHeader('Marché', 'Mes réservations', 'Les véhicules que vous avez réservés. Le transporteur doit accepter avant que vous puissiez valider.')}
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Demande</th><th>Transporteur</th><th>Véhicule</th><th>Réservée le</th><th>Réponse du transporteur</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td class="cell-2line"><strong>DT-2026-0148</strong><span>Abidjan → Bouaké</span></td>
              <td>Trans Lagunes — DÉMO</td>
              <td class="mono-num">AA-4521-CI</td>
              <td class="mono-num">26/09 · 14:12</td>
              <td><span class="badge status-accepter">${ic('check', 12)} Acceptée le 26/09 · 17:40</span></td>
              <td class="text-right"><button class="btn btn-sm btn-primary" onclick="b2fGo('aff-validation')">Valider</button></td>
            </tr>
            <tr>
              <td class="cell-2line"><strong>DT-2026-0151</strong><span>San-Pédro → Abidjan</span></td>
              <td>Sahel Fret CI — DÉMO</td>
              <td class="mono-num">BB-1907-CI</td>
              <td class="mono-num">27/09 · 09:05</td>
              <td><span class="badge status-reserver">${ic('clock', 12)} En attente de réponse</span></td>
              <td class="text-right"><button class="link-action" data-cancel>Annuler la réservation</button></td>
            </tr>
            <tr>
              <td class="cell-2line"><strong>DT-2026-0144</strong><span>Abidjan → Daloa</span></td>
              <td>Groupage Bandama — DÉMO</td>
              <td class="mono-num">CC-3388-CI</td>
              <td class="mono-num">22/09 · 11:30</td>
              <td><span class="badge status-rejeter">${ic('x', 12)} Rejetée — véhicule déjà engagé</span></td>
              <td class="text-right"><button class="link-action" onclick="b2fGo('aff-recherche')">Chercher un autre</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>`
});

/* --------------------------------------------------------------------------
   L'ÉCRAN PIVOT. La validation n'est pas un clic de confirmation : c'est une
   transaction qui débite les DEUX parties. L'écran le dit avant d'agir.
   -------------------------------------------------------------------------- */
function validationScreen({ auxiliaire = false, insuffisant = false } = {}) {
  const soldeAff = insuffisant ? 8000 : 420000;
  const fraisAff = 15000;
  const fraisTra = 12000;

  return {
    crumbs: ['Mises en relation', 'À valider'],
    body: `
      ${pageHeader('Mises en relation', 'Valider la mise en relation',
        'Le transporteur a accepté. La validation débite les frais de mise en relation aux deux parties, puis vous transmet ses coordonnées.')}

      ${auxiliaire ? `
      <div class="alert-banner error">
        ${ic('shield', 19)}
        <div><strong>Vous ne pouvez pas valider cette mise en relation</strong>
        La validation engage les finances du groupement. En tant qu'auxiliaire, vous préparez le dossier ;
        seul un utilisateur d'<strong>Ivoire Cacao Export</strong> peut le valider.
        Le dossier est prêt : prévenez votre responsable.</div>
      </div>` : ''}

      ${insuffisant ? `
      <div class="alert-banner error">
        ${ic('alert', 19)}
        <div><strong>Validation impossible — solde insuffisant</strong>
        Le compte d'<strong>Ivoire Cacao Export</strong> affiche ${money(soldeAff)} et les frais s'élèvent à ${money(fraisAff)}.
        Il manque <strong>${money(fraisAff - soldeAff)}</strong>. Faites créditer le compte auprès du concessionnaire, puis revenez valider.
        La réservation reste acquise jusqu'au ${'02/10/2026'}.</div>
      </div>` : ''}

      <div class="ops-grid">
        <section class="card">
          <div class="card-header"><div><h3>Ce que vous validez</h3><p class="subtitle">Demande DT-2026-0148 · offre OV-2026-0311.</p></div></div>

          <div class="recap-section">
            <h3>Le transport</h3>
            <div class="recap-grid">
              <div class="recap-item"><span>Corridor</span><strong>Abidjan — Vridi → Bouaké</strong></div>
              <div class="recap-item"><span>Départ</span><strong class="mono-num">02/10/2026 · 08:00</strong></div>
              <div class="recap-item"><span>Arrivée prévue</span><strong class="mono-num">03/10/2026 · 16:00</strong></div>
              <div class="recap-item"><span>Marchandise</span><strong>Fèves de cacao · 24 t · 60 m³</strong></div>
            </div>
          </div>

          <div class="recap-section">
            <h3>Le véhicule retenu</h3>
            <div class="recap-grid">
              <div class="recap-item"><span>Transporteur</span><strong>Trans Lagunes — DÉMO</strong></div>
              <div class="recap-item"><span>Immatriculation</span><strong class="mono-num">AA-4521-CI</strong></div>
              <div class="recap-item"><span>Capacité · carrosserie</span><strong>25 t · Bâchée · 3 essieux</strong></div>
              <div class="recap-item"><span>Prix déclaré</span><strong class="mono-num">38 F / km·t <span class="text-muted" style="font-weight:500">(indicatif)</span></strong></div>
            </div>
          </div>

          <div class="recap-section">
            <h3>Le débit</h3>
            <p class="text-secondary" style="font-size:14px;margin-bottom:14px">
              Deux écritures distinctes, une par partie. Les montants proviennent du catalogue de tarifs de la plateforme.
            </p>
            <div class="ledger">
              <div class="ledger-row">
                <div class="ledger-party">
                  <span class="avatar-round">IC</span>
                  <div><strong>Ivoire Cacao Export</strong><span>Vous — affréteur</span></div>
                </div>
                <div class="ledger-amount ${insuffisant ? 'insufficient' : ''}">
                  <strong>− ${money(fraisAff)}</strong>
                  <span>Solde : ${money(soldeAff)}${insuffisant ? ' — insuffisant' : ' → ' + money(soldeAff - fraisAff)}</span>
                </div>
              </div>
              <div class="ledger-row">
                <div class="ledger-party">
                  <span class="avatar-round">TL</span>
                  <div><strong>Trans Lagunes</strong><span>Transporteur</span></div>
                </div>
                <div class="ledger-amount">
                  <strong>− ${money(fraisTra)}</strong>
                  <span>Solde suffisant</span>
                </div>
              </div>
              <div class="ledger-row total">
                <span>Total prélevé par la plateforme</span>
                <span class="mono-num">${money(fraisAff + fraisTra)}</span>
              </div>
            </div>
          </div>

          <div class="wizard-footer">
            <button class="btn btn-secondary" data-annuler>Annuler la réservation</button>
            <div class="row gap-2">
              ${insuffisant
                ? `<button class="btn btn-primary" disabled title="Solde insuffisant">${ic('check-circle', 16)} Valider et débiter</button>`
                : auxiliaire
                  ? `<button class="btn btn-primary" disabled title="Action réservée au compte parent">${ic('shield', 16)} Validation non autorisée</button>`
                  : `<button class="btn btn-primary btn-lg" data-valider>${ic('check-circle', 16)} Valider et débiter les deux comptes</button>`}
            </div>
          </div>
        </section>

        <aside class="stack gap-3">
          <section class="card">
            <div class="card-header"><div><h3>Ce qui se passe ensuite</h3></div></div>
            <div class="timeline">
              <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Réservation</strong><p class="meta">26/09 · 14:12 · Aya KOUASSI</p></div></div>
              <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Acceptation du transporteur</strong><p class="meta">26/09 · 17:40 · Moussa DIABATÉ</p></div></div>
              <div class="timeline-item"><span class="timeline-dot current"></span><div class="timeline-content"><strong>Validation et double débit</strong><p class="meta">En attente de votre action</p></div></div>
              <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-content"><strong>Transmission des coordonnées</strong><p class="note">Véhicule, chauffeur et contacts vous sont communiqués. C'est la mise en relation effective.</p></div></div>
              <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-content"><strong>Suivi du transport</strong><p class="note">Le transporteur fait avancer les étapes ; vous clôturez après livraison.</p></div></div>
            </div>
          </section>
          <section class="card">
            <div class="card-header"><div><h3>Essayer les cas limites</h3><p class="subtitle">Maquette uniquement.</p></div></div>
            <div class="stack gap-2">
              <button class="btn btn-sm btn-secondary" onclick="b2fGo('aff-validation')">Cas nominal</button>
              <button class="btn btn-sm btn-secondary" onclick="b2fGo('aff-validation-solde')">Solde insuffisant</button>
              <button class="btn btn-sm btn-secondary" onclick="b2fGo('aux-validation')">Auxiliaire — refus de droit</button>
            </div>
          </section>
        </aside>
      </div>`
  };
}

SCREENS['aff-validation'] = () => validationScreen();
SCREENS['aff-validation-solde'] = () => validationScreen({ insuffisant: true });
SCREENS['aux-validation'] = () => validationScreen({ auxiliaire: true });

SCREENS['aff-relation'] = () => ({
  crumbs: ['Mises en relation', 'Mises en relation validées'],
  body: `
    ${pageHeader('Mises en relation', 'Mise en relation MR-2026-0071',
      'Validée le 27/09/2026 à 09:14. Les deux comptes ont été débités.')}

    <div class="alert-banner success">
      ${ic('check-circle', 19)}
      <div><strong>Mise en relation effective</strong>
      Les coordonnées ci-dessous vous sont transmises parce que la validation a été enregistrée et les frais réglés de part et d'autre.</div>
    </div>

    <div class="ops-grid">
      <section class="contact-reveal">
        <h3 style="margin-bottom:16px">${ic('link', 18)} Coordonnées du transporteur retenu</h3>
        <div class="recap-section" style="border-color:var(--signature-soft-border)">
          <div class="recap-grid">
            <div class="recap-item"><span>Groupement</span><strong>Trans Lagunes — DÉMO</strong></div>
            <div class="recap-item"><span>Contact</span><strong>Moussa DIABATÉ</strong></div>
            <div class="recap-item"><span>Téléphone</span><strong class="mono-num">+225 07 00 00 00</strong></div>
            <div class="recap-item"><span>Courriel</span><strong>contact@translagunes.demo</strong></div>
          </div>
        </div>
        <div class="recap-section" style="border:0">
          <div class="recap-grid">
            <div class="recap-item"><span>Véhicule</span><strong class="mono-num">AA-4521-CI</strong></div>
            <div class="recap-item"><span>Carte grise</span><strong class="mono-num">CG-884512</strong></div>
            <div class="recap-item"><span>Chauffeur</span><strong>Koffi YAO</strong></div>
            <div class="recap-item"><span>Permis</span><strong class="mono-num">P-2019-44781</strong></div>
            <div class="recap-item"><span>Téléphone chauffeur</span><strong class="mono-num">+225 05 00 00 00</strong></div>
            <div class="recap-item"><span>PTAC</span><strong>32 t</strong></div>
          </div>
        </div>
        <div class="row gap-2 wrap" style="margin-top:8px">
          <button class="btn btn-primary" onclick="b2fGo('aff-suivi')">${ic('truck', 16)} Suivre le transport</button>
          <button class="btn btn-secondary">${ic('download', 16)} Exporter la fiche</button>
        </div>
      </section>

      <aside class="stack gap-3">
        <section class="card">
          <div class="card-header"><div><h3>Écritures comptables</h3></div></div>
          <div class="ledger">
            <div class="ledger-row"><div class="ledger-party"><div><strong>Ivoire Cacao Export</strong><span>Frais affréteur</span></div></div><div class="ledger-amount"><strong>− ${money(15000)}</strong><span class="mono-num">27/09 · 09:14</span></div></div>
            <div class="ledger-row"><div class="ledger-party"><div><strong>Trans Lagunes</strong><span>Frais transporteur</span></div></div><div class="ledger-amount"><strong>− ${money(12000)}</strong><span class="mono-num">27/09 · 09:14</span></div></div>
          </div>
          <p class="text-muted" style="font-size:12.5px;margin-top:12px">Deux écritures distinctes, inscrites au journal d'audit.</p>
        </section>
        <section class="card">
          <div class="card-header"><div><h3>Document Unique de Transport</h3></div></div>
          ${jalonNote('J5', ' — depuis cette mise en relation, une fiche DUT pré-remplie pourra être générée, reproduisant le rattachement réel DUT ↔ offre de véhicule.')}
        </section>
      </aside>
    </div>`
});

SCREENS['aff-suivi'] = () => ({
  crumbs: ['Mises en relation', 'Suivi des transports'],
  body: `
    ${pageHeader('Mises en relation', 'Suivi du transport', 'Chaque étape porte un auteur et une date. Aucune étape ne peut être sautée.')}

    <div class="ops-grid">
      <section class="card">
        <div class="card-header">
          <div><h3>MR-2026-0071 · Abidjan → Bouaké</h3><p class="subtitle">Trans Lagunes — véhicule AA-4521-CI — chauffeur Koffi YAO.</p></div>
          <span class="badge status-accepter">En route</span>
        </div>
        <div class="timeline">
          <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Mise en relation validée</strong><p class="meta">27/09 · 09:14 · Aya KOUASSI (affréteur)</p></div></div>
          <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Véhicule à quai</strong><p class="meta">02/10 · 07:35 · Moussa DIABATÉ (transporteur)</p></div></div>
          <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Chargement terminé</strong><p class="meta">02/10 · 09:50 · Moussa DIABATÉ</p><p class="note">24 t chargées, bâche posée et scellée.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot current"></span><div class="timeline-content"><strong>En route</strong><p class="meta">02/10 · 10:05 · Moussa DIABATÉ</p></div></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-content"><strong>Livré</strong><p class="note">Déclaré par le transporteur à l'arrivée.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-content"><strong>Clôturé</strong><p class="note">Clôture par l'affréteur — impossible avant la livraison.</p></div></div>
        </div>
        <div class="wizard-footer">
          <span class="text-muted" style="font-size:13px;align-self:center">En tant qu'affréteur, vous constatez l'avancement.</span>
          <button class="btn btn-primary" disabled title="Clôture impossible avant la livraison">${ic('check-circle', 16)} Clôturer le transport</button>
        </div>
      </section>

      <aside class="card">
        <div class="card-header"><div><h3>Transports en cours</h3></div></div>
        <div class="stack">
          ${[
            ['MR-2026-0071', 'Abidjan → Bouaké', 'En route', 'status-accepter'],
            ['MR-2026-0068', 'Abidjan → Man', 'Livré', 'status-valider'],
            ['MR-2026-0065', 'San-Pédro → Abidjan', 'En chargement', 'status-reserver']
          ].map(([ref, cor, etat, cls]) => `
            <div class="row-between" style="padding:13px 0;border-bottom:1px solid var(--border-hairline)">
              <div><strong style="font-size:14px">${ref}</strong><p class="text-muted" style="font-size:12.5px">${cor}</p></div>
              <span class="badge ${cls}">${etat}</span>
            </div>`).join('')}
        </div>
      </aside>
    </div>`
});

SCREENS['aff-solde'] = () => ({
  crumbs: ['Compte', 'Solde et mouvements'],
  body: `
    ${pageHeader('Compte du groupement', 'Solde et mouvements', 'Le solde est la somme des crédits moins la somme des débits. Il conditionne la validation des mises en relation.')}

    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Solde disponible', '420 000', 'wallet', 'green', { dir: '', text: 'F CFA' })}
      ${kpi('Crédits cumulés', '1 200 000', 'plus', 'blue')}
      ${kpi('Débits cumulés', '780 000', 'scale', 'amber')}
      ${kpi('Mises en relation payées', '52', 'handshake', 'teal')}
    </div>

    <div class="alert-banner">
      ${ic('info', 19)}
      <div><strong>Comment créditer votre compte&nbsp;?</strong>
      Dans le POC, le crédit est saisi par le concessionnaire. L'intégration d'un paiement mobile est hors périmètre : la démonstration montre le solde et le débit, pas l'encaissement.</div>
    </div>

    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">Tous les mouvements <span class="count">52</span></button>
          <button class="tab-btn">Crédits <span class="count">9</span></button>
          <button class="tab-btn">Débits <span class="count">43</span></button>
        </div>
        <button class="btn btn-sm btn-secondary">${ic('download', 15)} Exporter en CSV</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Libellé</th><th>Référence</th><th class="text-right">Crédit</th><th class="text-right">Débit</th><th class="text-right">Solde</th></tr></thead>
          <tbody>
            <tr><td class="mono-num">27/09 · 09:14</td><td>Frais de mise en relation — affréteur</td><td class="mono-num">MR-2026-0071</td><td></td><td class="text-right mono-num text-error">15 000</td><td class="text-right mono-num">420 000</td></tr>
            <tr><td class="mono-num">24/09 · 11:02</td><td>Crédit manuel — concessionnaire</td><td class="mono-num">OP-2026-0410</td><td class="text-right mono-num text-success">300 000</td><td></td><td class="text-right mono-num">435 000</td></tr>
            <tr><td class="mono-num">21/09 · 16:47</td><td>Frais de mise en relation — affréteur</td><td class="mono-num">MR-2026-0068</td><td></td><td class="text-right mono-num text-error">15 000</td><td class="text-right mono-num">135 000</td></tr>
            <tr><td class="mono-num">18/09 · 08:20</td><td>Abonnement annuel</td><td class="mono-num">AB-2026-0033</td><td></td><td class="text-right mono-num text-error">120 000</td><td class="text-right mono-num">150 000</td></tr>
            <tr><td class="mono-num">15/09 · 10:11</td><td>Crédit manuel — concessionnaire</td><td class="mono-num">OP-2026-0388</td><td class="text-right mono-num text-success">200 000</td><td></td><td class="text-right mono-num">270 000</td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

/* ==========================================================================
   7. ÉCRANS — Transporteur
   ========================================================================== */
SCREENS['tra-dashboard'] = () => ({
  crumbs: ['Pilotage', 'Tableau de bord'],
  body: `
    ${pageHeader('Transporteur', 'Tableau de bord', 'Votre flotte, vos offres publiées et les réservations à traiter.',
      `<button class="btn btn-primary" onclick="b2fGo('tra-publier')">${ic('plus', 16)} Publier une offre</button>`)}

    <div class="alert-banner warning">
      ${ic('clock', 19)}
      <div><strong>2 réservations attendent votre réponse</strong>
      Une réservation sans réponse bloque l'affréteur : il ne peut pas valider tant que vous n'avez pas accepté.
      <button class="link-action" onclick="b2fGo('tra-reservations')" style="margin-left:6px">Répondre</button></div>
    </div>

    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Véhicules', '12', 'truck', 'blue')}
      ${kpi('Offres publiées', '5', 'file', 'blue', { dir: 'up', text: '+1 aujourd\'hui' })}
      ${kpi('Réservations à traiter', '2', 'inbox', 'amber')}
      ${kpi('Transports en cours', '4', 'activity', 'teal')}
      ${kpi('Solde du compte', '185 000', 'wallet', 'green', { dir: '', text: 'F CFA — suffisant' })}
    </div>

    <div class="ops-grid">
      <section class="card">
        <div class="card-header"><div><h3>Activité de mise en relation</h3><p class="subtitle">Validées par mois.</p></div></div>
        <div class="volume-chart">
          ${[38, 52, 44, 61, 58, 72].map((h) => `<div class="volume-col"><b>${h}</b><div class="bar" style="height:${h}%"></div></div>`).join('')}
        </div>
        <div class="volume-labels">${['Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept'].map((m) => `<span>${m}</span>`).join('')}</div>
        <div class="row-between" style="border-top:1px solid var(--border);padding-top:15px;margin-top:20px;font-size:13px;color:var(--text-secondary)">
          <span>Taux d'acceptation de vos offres</span><strong>64 %</strong>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h3>Demandes à saisir</h3><p class="subtitle">Publiées sur vos corridors.</p></div>
          <button class="link-action" onclick="b2fGo('tra-demandes')">Tout voir</button></div>
        <div class="stack">
          ${[
            ['DT-2026-0153', 'Abidjan → Korhogo', '08/10 · 30 t · Benne'],
            ['DT-2026-0155', 'Abidjan → Bouaké', '09/10 · 22 t · Bâchée'],
            ['DT-2026-0156', 'Bouaké → San-Pédro', '11/10 · 18 t · Plateau']
          ].map(([ref, cor, det]) => `
            <div class="row-between gap-2" style="padding:13px 0;border-bottom:1px solid var(--border-hairline)">
              <div><strong style="font-size:14px">${ref}</strong><p class="text-muted" style="font-size:12.5px">${cor} · ${det}</p></div>
              <button class="btn btn-sm btn-secondary" onclick="b2fGo('tra-demandes')">Répondre</button>
            </div>`).join('')}
        </div>
      </section>
    </div>`
});

SCREENS['tra-vehicules'] = () => ({
  crumbs: ['Ma flotte', 'Véhicules'],
  body: `
    ${pageHeader('Ma flotte', 'Véhicules', 'Le parc rattaché à votre groupement. Un véhicule doit exister avant de pouvoir être proposé sur le marché.',
      `<button class="btn btn-primary">${ic('plus', 16)} Ajouter un véhicule</button>`)}
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Immatriculation</th><th>Carte grise</th><th>Capacité / PTAC</th><th>Carrosserie</th><th>Essieux</th><th>Carte de transport</th><th>État</th><th></th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">AA-4521-CI</td><td class="mono-num">CG-884512</td><td>25 t / 32 t</td><td>Bâchée</td><td>3</td><td class="mono-num">CT-2026-0912</td><td><span class="badge status-reserver">Engagé</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="mono-num fw-bold">AA-4522-CI</td><td class="mono-num">CG-884513</td><td>28 t / 35 t</td><td>Plateau</td><td>3</td><td class="mono-num">CT-2026-0913</td><td><span class="badge status-disponible">Disponible</span></td><td class="text-right"><button class="link-action" onclick="b2fGo('tra-publier')">Publier</button></td></tr>
            <tr><td class="mono-num fw-bold">AA-4530-CI</td><td class="mono-num">CG-884520</td><td>18 t / 24 t</td><td>Benne</td><td>2</td><td class="mono-num">CT-2026-0918</td><td><span class="badge status-disponible">Disponible</span></td><td class="text-right"><button class="link-action" onclick="b2fGo('tra-publier')">Publier</button></td></tr>
            <tr><td class="mono-num fw-bold">AA-4541-CI</td><td class="mono-num">CG-884531</td><td>32 t / 40 t</td><td>Citerne</td><td>4</td><td class="mono-num text-error">Expirée</td><td><span class="badge status-expire">Non publiable</span></td><td class="text-right"><button class="link-action">Régulariser</button></td></tr>
          </tbody>
        </table>
      </div>
      <div class="alert-banner warning" style="margin:16px 0 0">
        ${ic('alert', 19)}
        <div><strong>Un véhicule sans carte de transport valide ne peut pas être publié</strong>
        Le contrôle est fait à la publication, pas après. AA-4541-CI reste dans votre parc mais n'apparaît pas sur le marché.</div>
      </div>
    </section>`
});

SCREENS['tra-chauffeurs'] = () => ({
  crumbs: ['Ma flotte', 'Chauffeurs'],
  body: `
    ${pageHeader('Ma flotte', 'Chauffeurs', 'Les chauffeurs de votre groupement.',
      `<button class="btn btn-primary">${ic('plus', 16)} Ajouter un chauffeur</button>`)}
    <div class="alert-banner">
      ${ic('info', 19)}
      <div><strong>Un chauffeur n'est pas un utilisateur de la plateforme</strong>
      C'est une donnée de votre groupement. Ses coordonnées sont transmises à l'affréteur au moment de la mise en relation, jamais avant.</div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Nom</th><th>Permis</th><th>Validité</th><th>Téléphone</th><th>Affectation</th><th></th></tr></thead>
          <tbody>
            <tr><td class="fw-bold">Koffi YAO</td><td class="mono-num">P-2019-44781</td><td class="mono-num">31/12/2027</td><td class="mono-num">+225 05 00 00 00</td><td class="mono-num">AA-4521-CI</td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="fw-bold">Ibrahim SANOGO</td><td class="mono-num">P-2021-10233</td><td class="mono-num">30/06/2028</td><td class="mono-num">+225 05 00 00 01</td><td class="text-muted">Non affecté</td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="fw-bold">Aboubacar CISSÉ</td><td class="mono-num">P-2018-77210</td><td class="mono-num text-error">14/08/2026</td><td class="mono-num">+225 05 00 00 02</td><td class="text-muted">Non affecté</td><td class="text-right"><button class="link-action">Régulariser</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['tra-publier'] = () => ({
  crumbs: ['Ma flotte', 'Publier une offre'],
  body: `
    ${pageHeader('Ma flotte', 'Publier une offre de véhicule', 'Annoncez la disponibilité d\'un véhicule sur un corridor et une fenêtre de dates.')}
    <div class="wizard">
      <section class="card">
        <div class="wizard-section-label">Le véhicule</div>
        <div class="field">
          <label for="p-veh">Véhicule <span class="req" aria-hidden="true">*</span></label>
          <select class="select" id="p-veh">
            <option>AA-4522-CI — Plateau · 28 t · 3 essieux</option>
            <option>AA-4530-CI — Benne · 18 t · 2 essieux</option>
          </select>
          <p class="hint">Seuls les véhicules disponibles et à jour de carte de transport sont proposés.</p>
        </div>
        <div class="field">
          <label for="p-chauf">Chauffeur pressenti</label>
          <select class="select" id="p-chauf"><option>Ibrahim SANOGO</option><option>À désigner plus tard</option></select>
          <p class="hint">Transmis à l'affréteur seulement après validation de la mise en relation.</p>
        </div>

        <div class="wizard-section-label">Le trajet proposé</div>
        <div class="field-row">
          <div class="field"><label for="p-dep">Localité de départ <span class="req" aria-hidden="true">*</span></label><select class="select" id="p-dep"><option>Abidjan</option><option>Bouaké</option><option>San-Pédro</option></select></div>
          <div class="field"><label for="p-arr">Localité d'arrivée <span class="req" aria-hidden="true">*</span></label><select class="select" id="p-arr"><option>Bouaké</option><option>Korhogo</option><option>Man</option></select></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="p-du">Disponible à partir du <span class="req" aria-hidden="true">*</span></label><input class="input" id="p-du" type="date" value="2026-10-02"></div>
          <div class="field"><label for="p-au">Jusqu'au <span class="req" aria-hidden="true">*</span></label><input class="input" id="p-au" type="date" value="2026-10-04"></div>
        </div>

        <div class="wizard-section-label">Prix indicatif</div>
        <div class="field" style="max-width:280px">
          <label for="p-prix">Prix au kilomètre-tonne</label>
          <input class="input mono-num" id="p-prix" type="number" value="38" inputmode="numeric">
          <p class="hint">Information de marché affichée aux affréteurs. Aucune facturation n'en découle.</p>
        </div>

        <div class="wizard-footer">
          <button class="btn btn-ghost">Annuler</button>
          <button class="btn btn-primary">${ic('check', 16)} Publier l'offre</button>
        </div>
      </section>

      <aside class="card live-recap">
        <div class="card-header"><div><h3>Aperçu côté affréteur</h3><p class="subtitle">Ce que verront les affréteurs.</p></div></div>
        <article class="offer-card" style="box-shadow:none">
          <div class="offer-head">
            <div><p class="offer-title">Trans Lagunes — DÉMO</p><p class="text-muted" style="font-size:13px;margin-top:3px">Véhicule AA-4522-CI</p></div>
            <span class="badge status-disponible">Disponible</span>
          </div>
          <div class="corridor-cell" style="font-weight:650">Abidjan ${ic('arrow-right', 15)} Bouaké</div>
          <div class="offer-meta">
            <div><span>Disponible</span><strong class="mono-num">02/10 → 04/10</strong></div>
            <div><span>Capacité</span><strong>28 t</strong></div>
            <div><span>Carrosserie</span><strong>Plateau</strong></div>
            <div><span>Essieux</span><strong>3 essieux</strong></div>
          </div>
        </article>
        <div class="alert-banner" style="margin:18px 0 0">
          ${ic('info', 19)}
          <div>Publier est gratuit. Les frais ne sont débités qu'à la validation d'une mise en relation.</div>
        </div>
      </aside>
    </div>`
});

SCREENS['tra-offres'] = () => ({
  crumbs: ['Ma flotte', 'Mes offres publiées'],
  body: `
    ${pageHeader('Ma flotte', 'Mes offres publiées', 'Retirer une offre est impossible dès qu\'une réservation a été acceptée.',
      `<button class="btn btn-primary" onclick="b2fGo('tra-publier')">${ic('plus', 16)} Publier une offre</button>`)}
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Référence</th><th>Véhicule</th><th>Corridor</th><th>Disponibilité</th><th>Prix km·t</th><th>État</th><th></th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">OV-2026-0311</td><td class="mono-num">AA-4521-CI</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Bouaké</div></td><td class="mono-num">02 → 04/10</td><td class="mono-num">38</td><td><span class="badge status-accepter">Réservation acceptée</span></td><td class="text-right"><button class="link-action" disabled style="color:var(--text-muted);cursor:not-allowed" title="Retrait impossible après acceptation">Retirer</button></td></tr>
            <tr><td class="mono-num fw-bold">OV-2026-0315</td><td class="mono-num">AA-4522-CI</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Korhogo</div></td><td class="mono-num">05 → 08/10</td><td class="mono-num">41</td><td><span class="badge status-reserver">Réservation en attente</span></td><td class="text-right"><button class="link-action" onclick="b2fGo('tra-reservations')">Répondre</button></td></tr>
            <tr><td class="mono-num fw-bold">OV-2026-0318</td><td class="mono-num">AA-4530-CI</td><td><div class="corridor-cell">Bouaké ${ic('arrow-right', 15)} San-Pédro</div></td><td class="mono-num">09 → 12/10</td><td class="mono-num">36</td><td><span class="badge status-disponible">Disponible</span></td><td class="text-right"><button class="link-action" data-retirer>Retirer</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['tra-demandes'] = () => ({
  crumbs: ['Marché', 'Demandes de transport'],
  body: `
    ${pageHeader('Marché', 'Demandes de transport publiées', 'Le second sens du flux : l\'affréteur publie son besoin, vous y répondez avec un véhicule.')}
    <section class="card" style="margin-bottom:22px">
      <div class="field-row" style="margin-bottom:0">
        <div class="field" style="margin-bottom:0"><label for="d-dep">Départ</label><select class="select" id="d-dep"><option>Abidjan</option><option>Toutes</option></select></div>
        <div class="field" style="margin-bottom:0"><label for="d-arr">Destination</label><select class="select" id="d-arr"><option>Toutes</option><option>Bouaké</option></select></div>
        <div class="field" style="margin-bottom:0"><label for="d-per">À partir du</label><input class="input" id="d-per" type="date" value="2026-10-01"></div>
        <div class="field" style="margin-bottom:0"><label for="d-car">Carrosserie</label><select class="select" id="d-car"><option>Toutes</option><option>Bâchée</option></select></div>
      </div>
    </section>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Référence</th><th>Affréteur</th><th>Corridor</th><th>Fenêtre</th><th>Besoin</th><th>Marchandise</th><th></th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">DT-2026-0153</td><td>Ivoire Cacao Export — DÉMO</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Korhogo</div></td><td class="mono-num">08 → 09/10</td><td>+30 t · Benne · 4 ess.</td><td class="cell-2line"><strong>Engrais NPK</strong><span>30 t · 35 m³</span></td><td class="text-right"><button class="btn btn-sm btn-primary" data-proposer>Proposer un véhicule</button></td></tr>
            <tr><td class="mono-num fw-bold">DT-2026-0155</td><td>Comptoir du Bandama — DÉMO</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Bouaké</div></td><td class="mono-num">09 → 10/10</td><td>20–30 t · Bâchée</td><td class="cell-2line"><strong>Riz conditionné</strong><span>22 t · 48 m³</span></td><td class="text-right"><button class="btn btn-sm btn-primary" data-proposer>Proposer un véhicule</button></td></tr>
            <tr><td class="mono-num fw-bold">DT-2026-0156</td><td>Bois du Sud — DÉMO</td><td><div class="corridor-cell">Bouaké ${ic('arrow-right', 15)} San-Pédro</div></td><td class="mono-num">11 → 12/10</td><td>10–20 t · Plateau</td><td class="cell-2line"><strong>Bois scié</strong><span>18 t · 40 m³</span></td><td class="text-right"><button class="btn btn-sm btn-primary" data-proposer>Proposer un véhicule</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['tra-reservations'] = () => ({
  crumbs: ['Marché', 'Réservations reçues'],
  body: `
    ${pageHeader('Marché', 'Réservations reçues', 'Un affréteur a réservé l\'un de vos véhicules. Acceptez ou rejetez — le rejet exige un motif.')}
    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">À traiter <span class="count">2</span></button>
          <button class="tab-btn">Acceptées <span class="count">6</span></button>
          <button class="tab-btn">Rejetées <span class="count">3</span></button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Affréteur</th><th>Demande</th><th>Votre offre</th><th>Fenêtre</th><th>Reçue</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td class="cell-2line"><strong>Ivoire Cacao Export — DÉMO</strong><span>Abidjan → Bouaké</span></td>
              <td class="mono-num">DT-2026-0148</td>
              <td class="mono-num">OV-2026-0311 · AA-4521-CI</td>
              <td class="mono-num">02 → 03/10</td>
              <td class="mono-num">26/09 · 14:12</td>
              <td class="text-right"><div class="row gap-2" style="justify-content:flex-end">
                <button class="btn btn-sm btn-secondary" data-rejeter>Rejeter</button>
                <button class="btn btn-sm btn-success" data-accepter>${ic('check', 15)} Accepter</button>
              </div></td>
            </tr>
            <tr>
              <td class="cell-2line"><strong>Comptoir du Bandama — DÉMO</strong><span>Abidjan → Korhogo</span></td>
              <td class="mono-num">DT-2026-0150</td>
              <td class="mono-num">OV-2026-0315 · AA-4522-CI</td>
              <td class="mono-num">05 → 06/10</td>
              <td class="mono-num">27/09 · 08:41</td>
              <td class="text-right"><div class="row gap-2" style="justify-content:flex-end">
                <button class="btn btn-sm btn-secondary" data-rejeter>Rejeter</button>
                <button class="btn btn-sm btn-success" data-accepter>${ic('check', 15)} Accepter</button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="alert-banner" style="margin:16px 0 0">
        ${ic('info', 19)}
        <div><strong>Accepter n'engage pas encore vos finances</strong>
        Les frais ne sont débités qu'au moment où l'affréteur valide définitivement. Vérifiez néanmoins votre solde : une validation refusée pour solde insuffisant de votre côté bloque la mise en relation.</div>
      </div>
    </section>`
});

SCREENS['tra-relation'] = () => ({
  crumbs: ['Mises en relation', 'Validées'],
  body: `
    ${pageHeader('Mises en relation', 'Mises en relation validées', 'Les affréteurs avec lesquels vous êtes engagé.')}
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Référence</th><th>Affréteur</th><th>Contact</th><th>Corridor</th><th>Véhicule</th><th>Frais débités</th><th></th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">MR-2026-0071</td><td>Ivoire Cacao Export — DÉMO</td><td class="cell-2line"><strong>Aya KOUASSI</strong><span class="mono-num">+225 01 00 00 00</span></td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Bouaké</div></td><td class="mono-num">AA-4521-CI</td><td class="mono-num">12 000</td><td class="text-right"><button class="link-action" onclick="b2fGo('tra-suivi')">Suivi</button></td></tr>
            <tr><td class="mono-num fw-bold">MR-2026-0068</td><td>Ivoire Cacao Export — DÉMO</td><td class="cell-2line"><strong>Aya KOUASSI</strong><span class="mono-num">+225 01 00 00 00</span></td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Man</div></td><td class="mono-num">AA-4530-CI</td><td class="mono-num">12 000</td><td class="text-right"><button class="link-action" onclick="b2fGo('tra-suivi')">Suivi</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['tra-suivi'] = () => ({
  crumbs: ['Mises en relation', 'Suivi des transports'],
  body: `
    ${pageHeader('Mises en relation', 'Suivi du transport', 'Vous faites avancer les étapes. Chaque changement est horodaté et vous est attribué.')}
    <div class="ops-grid">
      <section class="card">
        <div class="card-header">
          <div><h3>MR-2026-0071 · Abidjan → Bouaké</h3><p class="subtitle">Ivoire Cacao Export — véhicule AA-4521-CI — chauffeur Koffi YAO.</p></div>
          <span class="badge status-accepter">En route</span>
        </div>
        <div class="timeline">
          <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Mise en relation validée</strong><p class="meta">27/09 · 09:14 · Aya KOUASSI (affréteur)</p></div></div>
          <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Véhicule à quai</strong><p class="meta">02/10 · 07:35 · vous</p></div></div>
          <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Chargement terminé</strong><p class="meta">02/10 · 09:50 · vous</p></div></div>
          <div class="timeline-item"><span class="timeline-dot current"></span><div class="timeline-content"><strong>En route</strong><p class="meta">02/10 · 10:05 · vous</p></div></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-content"><strong>Livré</strong><p class="note">Prochaine étape — à déclarer à l'arrivée.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-content"><strong>Clôturé</strong><p class="note">Réservé à l'affréteur, après livraison.</p></div></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" data-incident>Signaler un incident</button>
          <button class="btn btn-primary" data-avancer>${ic('arrow-right', 16)} Déclarer la livraison</button>
        </div>
      </section>
      <aside class="card">
        <div class="card-header"><div><h3>Règle d'avancement</h3></div></div>
        <p class="text-secondary" style="font-size:14px;line-height:1.7">
          Les étapes se franchissent dans l'ordre : <strong>à quai</strong>, <strong>chargé</strong>,
          <strong>en route</strong>, <strong>livré</strong>, puis <strong>clôturé</strong>.
          Aucun saut d'étape n'est possible, et aucune étape ne peut être revenue en arrière : le journal est chronologique et non modifiable.
        </p>
        ${jalonNote('J5', ' — la génération de la fiche DUT depuis cette mise en relation.')}
      </aside>
    </div>`
});

SCREENS['aux-dashboard'] = () => ({
  crumbs: ['Pilotage', 'Tableau de bord'],
  body: `
    ${pageHeader('Auxiliaire', 'Tableau de bord', 'Vous préparez et suivez les dossiers d\'Ivoire Cacao Export.')}
    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Déclarations préparées', '5', 'package', 'blue')}
      ${kpi('Demandes publiées', '3', 'inbox', 'blue')}
      ${kpi('En attente de validation', '1', 'shield', 'amber')}
      ${kpi('Solde du parent', '420 000', 'wallet', 'green', { dir: '', text: 'F CFA — consultation' })}
    </div>
    <div class="ops-grid">
      <section class="card">
        <div class="card-header"><div><h3>Ce que vous pouvez faire</h3><p class="subtitle">Périmètre de la délégation.</p></div></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Action</th><th>Autorisé</th></tr></thead>
            <tbody>
              <tr><td>Déclarer un fret, créer une demande</td><td><span class="badge badge-success">${ic('check', 12)} Oui</span></td></tr>
              <tr><td>Rechercher et réserver un véhicule</td><td><span class="badge badge-success">${ic('check', 12)} Oui</span></td></tr>
              <tr><td>Annuler une réservation avant validation</td><td><span class="badge badge-success">${ic('check', 12)} Oui</span></td></tr>
              <tr><td>Consulter le solde du parent</td><td><span class="badge badge-success">${ic('check', 12)} Oui</span></td></tr>
              <tr><td><strong>Valider une mise en relation</strong></td><td><span class="badge badge-error">${ic('x', 12)} Non — engage les finances du parent</span></td></tr>
              <tr><td>Créditer un compte</td><td><span class="badge badge-error">${ic('x', 12)} Non</span></td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <aside class="card">
        <div class="card-header"><div><h3>Pourquoi cette limite&nbsp;?</h3></div></div>
        <p class="text-secondary" style="font-size:14px;line-height:1.7">
          Un sous-compte agit pour le compte d'un tiers mais n'engage pas ses finances.
          C'est une <strong>proposition du POC</strong> : le système existant ne pose pas cette limite.
          Elle est signalée comme un écart délibéré, et reste révocable.
        </p>
        <button class="btn btn-secondary btn-block" style="margin-top:14px" onclick="b2fGo('aux-validation')">Voir le message de refus</button>
      </aside>
    </div>`
});

/* ==========================================================================
   8. ÉCRANS — Concessionnaire (exploitant) · jalon J4
   ========================================================================== */
SCREENS['con-dashboard'] = () => ({
  crumbs: ['Pilotage', 'Tableau de bord'],
  body: `
    ${pageHeader('Concessionnaire · exploitant', 'Activité de la Bourse de Fret',
      'Vous supervisez l\'exploitation : acteurs, comptes, abonnements. Vous ne publiez ni ne validez à la place des acteurs du marché.')}

    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Groupements actifs', '48', 'building', 'blue', { dir: 'up', text: '+3 ce mois' })}
      ${kpi('Déclarations du mois', '214', 'package', 'blue')}
      ${kpi('Offres publiées', '167', 'truck', 'teal')}
      ${kpi('Mises en relation', '132', 'handshake', 'green', { dir: 'up', text: '+18 %' })}
      ${kpi('Encours des comptes', '18,4 M', 'wallet', 'amber', { dir: '', text: 'F CFA' })}
      ${kpi('Abonnements expirés', '5', 'shield', 'rose', { dir: 'down', text: 'à relancer' })}
    </div>

    <div class="ops-grid">
      <section class="card">
        <div class="card-header"><div><h3>Volume de mises en relation</h3><p class="subtitle">Validées par mois.</p></div></div>
        <div class="volume-chart">
          ${[45, 58, 51, 67, 74, 88].map((h) => `<div class="volume-col"><b>${h}</b><div class="bar" style="height:${h}%"></div></div>`).join('')}
        </div>
        <div class="volume-labels">${['Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept'].map((m) => `<span>${m}</span>`).join('')}</div>
        <div class="row-between" style="border-top:1px solid var(--border);padding-top:15px;margin-top:20px;font-size:13px;color:var(--text-secondary)">
          <span>Délai moyen réservation → validation</span><strong>1 j 4 h</strong>
        </div>
      </section>
      <section class="card">
        <div class="card-header"><div><h3>Corridors les plus actifs</h3></div></div>
        ${corridor('Abidjan', 'Bouaké', 100, 41)}
        ${corridor('Abidjan', 'Korhogo', 78, 32)}
        ${corridor('San-Pédro', 'Abidjan', 56, 23)}
        ${corridor('Abidjan', 'Man', 41, 17)}
        <div class="row-between" style="border-top:1px solid var(--border);padding-top:15px;margin-top:20px;font-size:13px;color:var(--text-secondary)">
          <span>Taux d'appariement global</span><strong>62 %</strong>
        </div>
      </section>
    </div>`
});

SCREENS['con-groupements'] = () => ({
  crumbs: ['Acteurs', 'Groupements'],
  body: `
    ${pageHeader('Acteurs', 'Groupements inscrits', 'L\'entité pivot : elle porte le compte, l\'abonnement, les véhicules et les utilisateurs.')}
    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">Tous <span class="count">48</span></button>
          <button class="tab-btn">Affréteurs <span class="count">21</span></button>
          <button class="tab-btn">Transporteurs <span class="count">24</span></button>
          <button class="tab-btn">Suspendus <span class="count">3</span></button>
        </div>
        <button class="btn btn-sm btn-secondary">${ic('download', 15)} Exporter</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Raison sociale</th><th>Type</th><th>RCCM</th><th>Localité</th><th class="text-right">Solde</th><th>Abonnement</th><th>État</th><th></th></tr></thead>
          <tbody>
            <tr><td class="fw-bold">Ivoire Cacao Export — DÉMO</td><td>Affréteur</td><td class="mono-num">CI-ABJ-2019-B-1042</td><td>Abidjan</td><td class="text-right mono-num">420 000</td><td><span class="badge badge-success">Valide → 18/09/2027</span></td><td><span class="badge status-valider">Actif</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="fw-bold">Trans Lagunes — DÉMO</td><td>Transporteur</td><td class="mono-num">CI-ABJ-2017-B-0881</td><td>Abidjan</td><td class="text-right mono-num">185 000</td><td><span class="badge badge-success">Valide → 02/03/2027</span></td><td><span class="badge status-valider">Actif</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="fw-bold">Sahel Fret CI — DÉMO</td><td>Transporteur</td><td class="mono-num">CI-BKE-2020-B-0233</td><td>Bouaké</td><td class="text-right mono-num">62 000</td><td><span class="badge badge-warning">Expire dans 12 j</span></td><td><span class="badge status-valider">Actif</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="fw-bold">Comptoir du Bandama — DÉMO</td><td>Affréteur</td><td class="mono-num">CI-BKE-2021-B-0417</td><td>Bouaké</td><td class="text-right mono-num">0</td><td><span class="badge badge-error">Expiré le 01/09/2026</span></td><td><span class="badge status-expire">Accès bloqué</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
            <tr><td class="fw-bold">Bois du Sud — DÉMO</td><td>Affréteur</td><td class="mono-num">CI-SPD-2022-B-0109</td><td>San-Pédro</td><td class="text-right mono-num">340 000</td><td><span class="badge badge-success">Valide → 11/11/2026</span></td><td><span class="badge status-valider">Actif</span></td><td class="text-right"><button class="link-action">Ouvrir</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['con-comptes'] = () => ({
  crumbs: ['Finances', 'Comptes et soldes'],
  body: `
    ${pageHeader('Finances', 'Comptes et soldes', 'Le crédit manuel remplace l\'intégration de paiement, hors périmètre du POC. Chaque crédit est tracé au journal d\'audit.')}
    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Encours total', '18,4 M', 'wallet', 'blue', { dir: '', text: 'F CFA' })}
      ${kpi('Comptes à zéro', '4', 'alert', 'rose')}
      ${kpi('Crédits du mois', '6,2 M', 'plus', 'green')}
      ${kpi('Frais perçus', '3,1 M', 'scale', 'amber')}
    </div>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Groupement</th><th>Type</th><th class="text-right">Crédits</th><th class="text-right">Débits</th><th class="text-right">Solde</th><th>Dernier mouvement</th><th></th></tr></thead>
          <tbody>
            <tr><td class="fw-bold">Ivoire Cacao Export — DÉMO</td><td>Affréteur</td><td class="text-right mono-num">1 200 000</td><td class="text-right mono-num">780 000</td><td class="text-right mono-num fw-bold">420 000</td><td class="mono-num">27/09</td><td class="text-right"><button class="btn btn-sm btn-primary" data-crediter>Créditer</button></td></tr>
            <tr><td class="fw-bold">Trans Lagunes — DÉMO</td><td>Transporteur</td><td class="text-right mono-num">900 000</td><td class="text-right mono-num">715 000</td><td class="text-right mono-num fw-bold">185 000</td><td class="mono-num">27/09</td><td class="text-right"><button class="btn btn-sm btn-primary" data-crediter>Créditer</button></td></tr>
            <tr><td class="fw-bold">Comptoir du Bandama — DÉMO</td><td>Affréteur</td><td class="text-right mono-num">450 000</td><td class="text-right mono-num">450 000</td><td class="text-right mono-num fw-bold text-error">0</td><td class="mono-num">01/09</td><td class="text-right"><button class="btn btn-sm btn-primary" data-crediter>Créditer</button></td></tr>
            <tr><td class="fw-bold">Sahel Fret CI — DÉMO</td><td>Transporteur</td><td class="text-right mono-num">500 000</td><td class="text-right mono-num">438 000</td><td class="text-right mono-num fw-bold">62 000</td><td class="mono-num">25/09</td><td class="text-right"><button class="btn btn-sm btn-primary" data-crediter>Créditer</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['con-tarifs'] = () => ({
  crumbs: ['Finances', 'Catalogue de tarifs'],
  body: `
    ${pageHeader('Finances', 'Catalogue de tarifs', 'Les prix du service de la plateforme.')}
    <div class="alert-banner warning">
      ${ic('alert', 19)}
      <div><strong>Ce catalogue n'est pas une grille tarifaire du fret</strong>
      Il fixe le prix des services de la plateforme : abonnement et frais de mise en relation.
      Le prix du transport lui-même se négocie hors plateforme ; le prix au km·tonne affiché sur les offres est purement indicatif.</div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Service</th><th>Redevable</th><th class="text-right">Prix unitaire</th><th>État</th><th></th></tr></thead>
          <tbody>
            <tr><td class="fw-bold">Abonnement annuel</td><td>Tout groupement</td><td class="text-right mono-num">120 000 F CFA</td><td><span class="badge badge-success">Actif</span></td><td class="text-right"><button class="link-action">Modifier</button></td></tr>
            <tr><td class="fw-bold">Frais de mise en relation — affréteur</td><td>Affréteur</td><td class="text-right mono-num">15 000 F CFA</td><td><span class="badge badge-success">Actif</span></td><td class="text-right"><button class="link-action">Modifier</button></td></tr>
            <tr><td class="fw-bold">Frais de mise en relation — transporteur</td><td>Transporteur</td><td class="text-right mono-num">12 000 F CFA</td><td><span class="badge badge-success">Actif</span></td><td class="text-right"><button class="link-action">Modifier</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['con-roles'] = () => ({
  crumbs: ['Acteurs', 'Utilisateurs et rôles'],
  body: `
    ${pageHeader('Acteurs', 'Matrice des droits', 'Les 22 rôles du système sont déclarés ici, et nulle part ailleurs. Aucun droit n\'est codé dans une vue.')}
    <div class="alert-banner">
      ${ic('shield', 19)}
      <div><strong>Écart délibéré au système existant</strong>
      Le système actuel disperse ses contrôles d'accès dans le routage et les écrans.
      Le POC les centralise dans cette matrice unique, administrable et vérifiable.</div>
    </div>
    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">Niveau 1 — démontrés <span class="count">5</span></button>
          <button class="tab-btn">Niveau 2 — déclinés <span class="count">3</span></button>
          <button class="tab-btn">Niveau 3 — modélisés <span class="count">14</span></button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table matrix-table">
          <thead><tr><th>Action</th><th>Affréteur</th><th>Transporteur</th><th>Auxiliaire</th><th>Concessionnaire</th><th>DGTTC</th></tr></thead>
          <tbody>
            ${[
              ['Déclarer du fret, créer une demande', 'yes|Les siennes', 'no|—', 'cond|Délégation', 'no|—', 'no|—'],
              ['Publier un véhicule disponible', 'no|—', 'yes|Les siens', 'cond|Délégation', 'no|—', 'no|—'],
              ['Rechercher des véhicules', 'yes|Oui', 'no|—', 'cond|Délégation', 'yes|Tous', 'yes|Consultation'],
              ['Rechercher des demandes', 'no|—', 'yes|Oui', 'cond|Délégation', 'yes|Toutes', 'yes|Consultation'],
              ['Réserver un véhicule', 'yes|Oui', 'no|—', 'cond|Délégation', 'no|—', 'no|—'],
              ['Accepter ou rejeter une réservation', 'no|—', 'yes|Ses offres', 'cond|Délégation', 'no|—', 'no|—'],
              ['<strong>Valider (déclenche le double débit)</strong>', 'yes|Oui', 'no|—', 'no|<strong>Non</strong>', 'no|—', 'no|—'],
              ['Faire avancer le suivi', 'cond|Constater', 'yes|Ses transports', 'cond|Délégation', 'no|—', 'no|—'],
              ['Consulter le solde', 'yes|Le sien', 'yes|Le sien', 'cond|Du parent', 'yes|<strong>Tous</strong>', 'no|—'],
              ['Créditer manuellement un compte', 'no|—', 'no|—', 'no|—', 'yes|<strong>Oui</strong>', 'no|—'],
              ['Générer un DUT', 'no|—', 'yes|Oui', 'cond|Délégation', 'no|—', 'no|—'],
              ['Consulter les états de contrôle', 'no|—', 'no|—', 'no|—', 'no|—', 'yes|<strong>Oui</strong>'],
              ['Consulter le journal d\'audit', 'no|—', 'no|—', 'no|—', 'yes|Oui', 'yes|Oui']
            ].map((row) => `<tr><td>${row[0]}</td>${row.slice(1).map((c) => {
              const [cls, txt] = c.split('|');
              return `<td class="${cls}">${txt}</td>`;
            }).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="text-muted" style="font-size:13px;margin-top:16px">
        Quatre lignes font l'objet d'un test automatisé dédié : l'accès sans abonnement actif,
        l'auxiliaire qui ne valide pas, la DGTTC qui ne transige pas, le concessionnaire qui ne transige pas non plus.
      </p>
    </section>`
});

SCREENS['con-audit'] = () => ({
  crumbs: ['Journal', 'Journal d\'audit'],
  body: `
    ${pageHeader('Traçabilité', 'Journal d\'audit', 'Chronologique, non modifiable, en ajout seul. Aucune fonction d\'édition ni de suppression n\'existe.')}
    <div class="alert-banner">
      ${ic('info', 19)}
      <div><strong>Ajout du POC</strong>
      Le système existant ne dispose d'aucune piste d'audit unifiée. Ce journal est une proposition, pas une reproduction.</div>
    </div>
    <section class="card">
      <div class="table-toolbar">
        <div class="row gap-2 wrap">
          <select class="select" style="width:auto"><option>Tous les types d'événement</option><option>Appariement</option><option>Compte</option><option>Accès</option></select>
          <input class="input" type="date" style="width:auto" value="2026-09-27">
        </div>
        <button class="btn btn-sm btn-secondary">${ic('download', 15)} Exporter en CSV</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Horodatage</th><th>Auteur</th><th>Groupement</th><th>Événement</th><th>Objet</th></tr></thead>
          <tbody>
            <tr><td class="mono-num">27/09 · 09:14:07</td><td>Aya KOUASSI</td><td>Ivoire Cacao Export</td><td><span class="badge badge-success">Mise en relation validée</span></td><td class="mono-num">MR-2026-0071</td></tr>
            <tr><td class="mono-num">27/09 · 09:14:07</td><td>système</td><td>Ivoire Cacao Export</td><td><span class="badge badge-warning">Débit — frais affréteur</span></td><td class="mono-num">15 000 F CFA</td></tr>
            <tr><td class="mono-num">27/09 · 09:14:07</td><td>système</td><td>Trans Lagunes</td><td><span class="badge badge-warning">Débit — frais transporteur</span></td><td class="mono-num">12 000 F CFA</td></tr>
            <tr><td class="mono-num">26/09 · 17:40:52</td><td>Moussa DIABATÉ</td><td>Trans Lagunes</td><td><span class="badge badge-accent">Réservation acceptée</span></td><td class="mono-num">OV-2026-0311</td></tr>
            <tr><td class="mono-num">26/09 · 14:12:31</td><td>Aya KOUASSI</td><td>Ivoire Cacao Export</td><td><span class="badge badge-accent">Véhicule réservé</span></td><td class="mono-num">DT-2026-0148</td></tr>
            <tr><td class="mono-num">26/09 · 11:03:18</td><td>Bintou TRAORÉ</td><td>Ivoire Cacao Export</td><td><span class="badge badge-error">Validation refusée — droit insuffisant</span></td><td class="mono-num">DT-2026-0148</td></tr>
            <tr><td class="mono-num">24/09 · 11:02:44</td><td>Serge N'GUESSAN</td><td>Ivoire Cacao Export</td><td><span class="badge badge-signature">Crédit manuel</span></td><td class="mono-num">300 000 F CFA</td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

SCREENS['con-relations'] = () => ({
  crumbs: ['Marché', 'Mises en relation'],
  body: `
    ${pageHeader('Supervision du marché', 'Mises en relation', 'Toutes les mises en relation de la plateforme, en consultation.')}
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Référence</th><th>Affréteur</th><th>Transporteur</th><th>Corridor</th><th>Validée le</th><th class="text-right">Frais perçus</th><th>Transport</th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">MR-2026-0071</td><td>Ivoire Cacao Export</td><td>Trans Lagunes</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Bouaké</div></td><td class="mono-num">27/09</td><td class="text-right mono-num">27 000</td><td><span class="badge status-accepter">En route</span></td></tr>
            <tr><td class="mono-num fw-bold">MR-2026-0070</td><td>Bois du Sud</td><td>Sahel Fret CI</td><td><div class="corridor-cell">San-Pédro ${ic('arrow-right', 15)} Abidjan</div></td><td class="mono-num">26/09</td><td class="text-right mono-num">27 000</td><td><span class="badge status-valider">Clôturé</span></td></tr>
            <tr><td class="mono-num fw-bold">MR-2026-0068</td><td>Ivoire Cacao Export</td><td>Trans Lagunes</td><td><div class="corridor-cell">Abidjan ${ic('arrow-right', 15)} Man</div></td><td class="mono-num">21/09</td><td class="text-right mono-num">27 000</td><td><span class="badge status-valider">Livré</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

/* ==========================================================================
   9. ÉCRANS — DGTTC (contrôle) · jalon J4
   ========================================================================== */
SCREENS['dgt-dashboard'] = () => ({
  crumbs: ['Pilotage', 'Tableau de bord national'],
  body: `
    ${pageHeader('DGTTC · autorité de contrôle', 'Tableau de bord national',
      'Consultation des états de la Bourse de Fret. Aucune action transactionnelle ne vous est accessible.')}

    <div class="alert-banner">
      ${ic('shield', 19)}
      <div><strong>Espace en consultation seule</strong>
      Le contrôleur ne transige pas sur ce qu'il contrôle : aucun accès aux soldes, aucune publication, aucune validation.
      Cette séparation est structurelle, pas un simple masquage de boutons.</div>
    </div>

    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Transporteurs enregistrés', '24', 'building', 'blue')}
      ${kpi('Véhicules au parc', '187', 'truck', 'blue')}
      ${kpi('Cartes de transport expirées', '9', 'alert', 'rose', { dir: '', text: 'à contrôler' })}
      ${kpi('Déclarations du mois', '214', 'package', 'teal')}
      ${kpi('Mises en relation', '132', 'handshake', 'green')}
      ${kpi('Transports en cours', '37', 'activity', 'amber')}
    </div>

    <div class="ops-grid">
      <section class="card">
        <div class="card-header"><div><h3>Flux déclarés par corridor</h3><p class="subtitle">Septembre 2026.</p></div></div>
        ${corridor('Abidjan', 'Bouaké', 100, 41)}
        ${corridor('Abidjan', 'Korhogo', 78, 32)}
        ${corridor('San-Pédro', 'Abidjan', 56, 23)}
        ${corridor('Abidjan', 'Man', 41, 17)}
      </section>
      <section class="card">
        <div class="card-header"><div><h3>Points d'attention</h3></div></div>
        <div class="stack">
          ${[
            ['9 cartes de transport expirées', 'Véhicules non publiables sur le marché', 'warning'],
            ['3 groupements suspendus', 'Abonnement expiré — accès bloqué', 'error'],
            ['2 chauffeurs à permis échu', 'Signalés dans les fiches de flotte', 'warning']
          ].map(([t, s, tone]) => `
            <div class="row gap-3" style="padding:13px 0;border-bottom:1px solid var(--border-hairline)">
              <span class="kpi-icon" style="background:var(--${tone}-soft);color:var(--${tone})">${ic('alert', 16)}</span>
              <div><strong style="font-size:14px">${t}</strong><p class="text-muted" style="font-size:12.5px">${s}</p></div>
            </div>`).join('')}
        </div>
      </section>
    </div>`
});

SCREENS['dgt-etats'] = () => ({
  crumbs: ['États de contrôle', 'Déclarations et offres'],
  body: `
    ${pageHeader('États de contrôle', 'Déclarations et offres', 'État consolidé du marché. Consultation et export.')}
    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">Déclarations de fret <span class="count">214</span></button>
          <button class="tab-btn">Offres de véhicule <span class="count">167</span></button>
        </div>
        <button class="btn btn-sm btn-secondary">${ic('download', 15)} Exporter en CSV</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Référence</th><th>Affréteur</th><th>Provenance</th><th>Destination</th><th>Marchandise</th><th>Déposée</th><th>État</th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">DF-2026-0095</td><td>Ivoire Cacao Export</td><td>Abidjan — Port</td><td>Korhogo</td><td>Engrais NPK · 30 t</td><td class="mono-num">25/09</td><td><span class="badge status-publiee">Publiée</span></td></tr>
            <tr><td class="mono-num fw-bold">DF-2026-0094</td><td>Bois du Sud</td><td>San-Pédro</td><td>Abidjan</td><td>Bois scié · 18 t</td><td class="mono-num">24/09</td><td><span class="badge status-publiee">Publiée</span></td></tr>
            <tr><td class="mono-num fw-bold">DF-2026-0092</td><td>Ivoire Cacao Export</td><td>Abidjan — Vridi</td><td>Bouaké</td><td>Fèves de cacao · 24 t</td><td class="mono-num">22/09</td><td><span class="badge status-valider">Appariée</span></td></tr>
            <tr><td class="mono-num fw-bold">DF-2026-0088</td><td>Comptoir du Bandama</td><td>Abidjan</td><td>Man</td><td>Ciment · 28 t</td><td class="mono-num">18/09</td><td><span class="badge status-valider">Appariée</span></td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>4 lignes sur 214</span>
        <div class="pagination-pages"><button class="active">1</button><button>2</button><button>3</button><button>…</button></div>
      </div>
    </section>`
});

SCREENS['dgt-relations'] = () => SCREENS['con-relations']();

SCREENS['dgt-acteurs'] = () => ({
  crumbs: ['Acteurs', 'Transporteurs et affréteurs'],
  body: `
    ${pageHeader('Acteurs et parc', 'Transporteurs et affréteurs', 'Liste des acteurs du marché. Aucune donnée financière n\'est accessible depuis cet espace.')}
    <section class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Raison sociale</th><th>Type</th><th>RCCM</th><th>Carte de transporteur</th><th>Localité</th><th>Véhicules</th><th>État</th></tr></thead>
          <tbody>
            <tr><td class="fw-bold">Trans Lagunes — DÉMO</td><td>Transporteur</td><td class="mono-num">CI-ABJ-2017-B-0881</td><td class="mono-num">CT-2026-0912</td><td>Abidjan</td><td class="mono-num">12</td><td><span class="badge status-valider">En règle</span></td></tr>
            <tr><td class="fw-bold">Sahel Fret CI — DÉMO</td><td>Transporteur</td><td class="mono-num">CI-BKE-2020-B-0233</td><td class="mono-num">CT-2025-0477</td><td>Bouaké</td><td class="mono-num">8</td><td><span class="badge status-reserver">1 carte échue</span></td></tr>
            <tr><td class="fw-bold">Ivoire Cacao Export — DÉMO</td><td>Affréteur</td><td class="mono-num">CI-ABJ-2019-B-1042</td><td class="text-muted">Sans objet</td><td>Abidjan</td><td class="text-muted">—</td><td><span class="badge status-valider">En règle</span></td></tr>
            <tr><td class="fw-bold">Comptoir du Bandama — DÉMO</td><td>Affréteur</td><td class="mono-num">CI-BKE-2021-B-0417</td><td class="text-muted">Sans objet</td><td>Bouaké</td><td class="text-muted">—</td><td><span class="badge status-expire">Suspendu</span></td></tr>
          </tbody>
        </table>
      </div>
      <p class="text-muted" style="font-size:13px;margin-top:16px">
        La colonne « solde » n'existe pas dans cet espace. Ce n'est pas un masquage d'affichage : la donnée n'est pas servie au rôle DGTTC.
      </p>
    </section>`
});

SCREENS['dgt-parc'] = () => ({
  crumbs: ['Acteurs', 'Parc de véhicules'],
  body: `
    ${pageHeader('Acteurs et parc', 'Parc de véhicules', 'Le parc déclaré par les transporteurs et l\'état de leurs pièces.')}
    <section class="card">
      <div class="table-toolbar">
        <div class="tabs-underline">
          <button class="tab-btn active">Tous <span class="count">187</span></button>
          <button class="tab-btn">Carte échue <span class="count">9</span></button>
        </div>
        <button class="btn btn-sm btn-secondary">${ic('download', 15)} Exporter</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Immatriculation</th><th>Transporteur</th><th>Carrosserie</th><th>PTAC</th><th>Essieux</th><th>Carte de transport</th><th>État</th></tr></thead>
          <tbody>
            <tr><td class="mono-num fw-bold">AA-4521-CI</td><td>Trans Lagunes</td><td>Bâchée</td><td>32 t</td><td>3</td><td class="mono-num">CT-2026-0912 · 31/12/2027</td><td><span class="badge status-valider">En règle</span></td></tr>
            <tr><td class="mono-num fw-bold">AA-4541-CI</td><td>Trans Lagunes</td><td>Citerne</td><td>40 t</td><td>4</td><td class="mono-num text-error">Expirée le 30/06/2026</td><td><span class="badge status-expire">Non conforme</span></td></tr>
            <tr><td class="mono-num fw-bold">BB-1907-CI</td><td>Sahel Fret CI</td><td>Bâchée</td><td>35 t</td><td>3</td><td class="mono-num">CT-2026-0733 · 14/05/2027</td><td><span class="badge status-valider">En règle</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>`
});

/* ==========================================================================
   10. Écrans de second incrément — esquissés, non détaillés
   ========================================================================== */
const LATER = {
  'aff-notifications': ['J5', 'Centre de notifications', 'Les événements réels du système existant : réservation, acceptation, rejet, annulation, validation, retrait d\'offre. Dans l\'application uniquement — ni SMS ni courriel, qui exigeraient un serveur.'],
  'aff-abonnement': ['J5', 'Abonnement du groupement', 'Période de validité, montant, échéance, et blocage d\'accès à l\'expiration avec redirection vers le réabonnement. Sans intégration de paiement.'],
  'aff-groupement': ['J2', 'Fiche du groupement', 'Raison sociale, RCCM, compte contribuable, carte de transporteur, pays, localité. Entité pivot : elle porte le compte, l\'abonnement et les véhicules.'],
  'aff-utilisateurs': ['J2', 'Utilisateurs et auxiliaires', 'Gestion des comptes du groupement et création de sous-comptes auxiliaires, identifiés comme tels à l\'écran.'],
  'tra-dut': ['J5', 'Génération du DUT', 'Depuis une mise en relation validée, une fiche DUT pré-remplie reproduisant le rattachement réel entre le DUT et l\'offre de véhicule.'],
  'con-abonnements': ['J5', 'Abonnements', 'Suivi des échéances et prolongation manuelle, en remplacement du paiement en ligne. Tracé au journal d\'audit.']
};

Object.entries(LATER).forEach(([id, [jalon, titre, texte]]) => {
  SCREENS[id] = () => ({
    crumbs: [titre],
    body: `
      ${pageHeader('Second incrément', titre, texte)}
      ${jalonNote(jalon, ' — cet écran est cadré mais volontairement non maquetté : la priorité de conception va au cœur transactionnel (jalons J2 et J3).')}
      ${emptyState('Écran à concevoir au jalon ' + jalon,
        'Le parcours et les règles sont décrits dans la spécification d\'écrans. La maquette sera produite lorsque le noyau sera validé.',
        `<button class="btn btn-secondary" onclick="b2fGo('${state.role === 'transporteur' ? 'tra-dashboard' : state.role === 'concessionnaire' ? 'con-dashboard' : 'aff-dashboard'}')">Revenir au tableau de bord</button>`)}`
  });
});

/* ==========================================================================
   11. Rendu et amorçage
   ========================================================================== */
function render() {
  const screen = (SCREENS[state.screen] || SCREENS['aff-dashboard'])();
  renderShell(screen.body, [ROLES[state.role].label, ...screen.crumbs]);
  bindActions();
  syncDemoBar();
}

function bindActions() {
  app.querySelectorAll('[data-reserve]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Réserver ce véhicule</p>
      <p class="modal-text">Choisissez la demande de transport à rattacher. Le transporteur devra accepter avant que vous puissiez valider.</p>
      <div class="field">
        <label for="m-dt">Demande de transport</label>
        <select class="select" id="m-dt">
          <option>DT-2026-0153 — Abidjan → Korhogo · 08/10</option>
          <option>DT-2026-0148 — Abidjan → Bouaké · 02/10</option>
        </select>
      </div>
      <div class="alert-banner"><svg width="19" height="19"><use href="#ic-info"/></svg>
        <div>Réserver est gratuit. Aucun montant n'est débité tant que la mise en relation n'est pas validée.</div></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Annuler</button>
        <button class="btn btn-primary" data-close onclick="b2fGo('aff-reservations')">Confirmer la réservation</button>
      </div>`);
  }));

  app.querySelectorAll('[data-rejeter]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Rejeter la réservation</p>
      <p class="modal-text">Le motif est obligatoire : il est transmis à l'affréteur et inscrit au journal.</p>
      <div class="field">
        <label>Motif</label>
        <div class="chip-select">
          <button class="chip-btn active">Véhicule déjà engagé</button>
          <button class="chip-btn">Dates incompatibles</button>
          <button class="chip-btn">Marchandise non transportable</button>
          <button class="chip-btn">Destination non desservie</button>
        </div>
      </div>
      <div class="field">
        <label for="m-motif">Précision</label>
        <textarea class="textarea" id="m-motif" placeholder="Facultatif"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Annuler</button>
        <button class="btn btn-danger" data-close>Rejeter la réservation</button>
      </div>`);
  }));

  app.querySelectorAll('[data-accepter]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Accepter la réservation</p>
      <p class="modal-text">Vous vous engagez à mettre ce véhicule à disposition. L'offre ne pourra plus être retirée.</p>
      <div class="ledger" style="margin-bottom:18px">
        <div class="ledger-row"><div class="ledger-party"><div><strong>Votre solde</strong><span>Trans Lagunes</span></div></div>
          <div class="ledger-amount"><strong>${money(185000)}</strong><span>Frais à venir : ${money(12000)}</span></div></div>
      </div>
      <div class="alert-banner"><svg width="19" height="19"><use href="#ic-info"/></svg>
        <div>Le débit n'interviendra qu'à la validation de l'affréteur.</div></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Annuler</button>
        <button class="btn btn-success" data-close>Accepter</button>
      </div>`);
  }));

  app.querySelectorAll('[data-valider]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Confirmer la validation</p>
      <p class="modal-text">Cette action est irréversible. Deux comptes vont être débités et la mise en relation deviendra effective.</p>
      <div class="ledger" style="margin-bottom:18px">
        <div class="ledger-row"><div class="ledger-party"><div><strong>Ivoire Cacao Export</strong><span>Vous</span></div></div>
          <div class="ledger-amount"><strong>− ${money(15000)}</strong></div></div>
        <div class="ledger-row"><div class="ledger-party"><div><strong>Trans Lagunes</strong><span>Transporteur</span></div></div>
          <div class="ledger-amount"><strong>− ${money(12000)}</strong></div></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Revenir</button>
        <button class="btn btn-primary" data-close onclick="b2fGo('aff-relation')">Valider et débiter</button>
      </div>`);
  }));

  app.querySelectorAll('[data-crediter]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Créditer un compte</p>
      <p class="modal-text">Le crédit manuel remplace l'encaissement, hors périmètre du POC. L'opération est inscrite au journal d'audit avec votre nom.</p>
      <div class="field"><label for="c-mt">Montant en F CFA</label><input class="input mono-num" id="c-mt" type="number" value="100000"></div>
      <div class="field"><label for="c-ref">Référence de l'encaissement</label><input class="input" id="c-ref" placeholder="Numéro de reçu ou de virement"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Annuler</button>
        <button class="btn btn-primary" data-close>Créditer le compte</button>
      </div>`);
  }));

  app.querySelectorAll('[data-cancel],[data-retirer],[data-annuler]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Confirmer l'annulation</p>
      <p class="modal-text">L'autre partie sera notifiée. Cette action est impossible après validation de la mise en relation.</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Revenir</button>
        <button class="btn btn-danger" data-close>Annuler</button>
      </div>`);
  }));

  app.querySelectorAll('[data-proposer]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Proposer un véhicule</p>
      <p class="modal-text">Vous répondez à une demande publiée. L'affréteur devra ensuite réserver puis valider.</p>
      <div class="field"><label for="pp-v">Véhicule</label><select class="select" id="pp-v"><option>AA-4522-CI — Plateau · 28 t</option><option>AA-4530-CI — Benne · 18 t</option></select></div>
      <div class="field"><label for="pp-p">Prix indicatif au km·tonne</label><input class="input mono-num" id="pp-p" type="number" value="40"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Annuler</button>
        <button class="btn btn-primary" data-close>Envoyer la proposition</button>
      </div>`);
  }));

  app.querySelectorAll('[data-avancer]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Déclarer la livraison</p>
      <p class="modal-text">L'étape « Livré » sera horodatée et vous sera attribuée. Elle ne pourra pas être annulée.</p>
      <div class="field"><label for="a-note">Observation</label><textarea class="textarea" id="a-note" placeholder="Réserves éventuelles à la livraison"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Annuler</button>
        <button class="btn btn-primary" data-close>Déclarer la livraison</button>
      </div>`);
  }));

  app.querySelectorAll('[data-incident]').forEach((b) => b.addEventListener('click', () => {
    modal(`
      <p class="modal-title">Signaler un incident</p>
      <p class="modal-text">L'incident est ajouté au journal du transport et visible par l'affréteur. Il ne change pas l'étape en cours.</p>
      <div class="field"><label for="i-t">Nature</label><select class="select" id="i-t"><option>Panne du véhicule</option><option>Retard</option><option>Barrage ou route impraticable</option><option>Litige au chargement</option></select></div>
      <div class="field"><label for="i-n">Description</label><textarea class="textarea" id="i-n"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Annuler</button>
        <button class="btn btn-primary" data-close>Signaler</button>
      </div>`);
  }));
}

/* --- Connexion --- */
function renderLogin() {
  app.innerHTML = document.getElementById('tpl-login').innerHTML;
  app.querySelectorAll('.demo-account-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.role = b.dataset.role;
      const first = ROLES[state.role].zones[0];
      state.zone = first.id;
      state.screen = first.sections[0].items[0].id;
      render();
    });
  });
}

/* --- Barre de pilotage de la maquette --- */
function syncDemoBar() {
  const roleSel = $('#demo-role');
  const screenSel = $('#demo-screen');
  roleSel.value = state.role;
  const extra = { affreteur: ['aff-validation-solde'], auxiliaire: [], transporteur: [], concessionnaire: [], dgttc: [] };
  const items = allItems(state.role);
  screenSel.innerHTML = items.map((i) => `<option value="${i.id}">${i.label}</option>`).join('')
    + (extra[state.role].length ? `<option value="aff-validation-solde">À valider — cas solde insuffisant</option>` : '');
  screenSel.value = state.screen;
}

$('#demo-role').addEventListener('change', (e) => {
  state.role = e.target.value;
  const first = ROLES[state.role].zones[0];
  state.zone = first.id;
  state.screen = first.sections[0].items[0].id;
  render();
});
$('#demo-screen').addEventListener('change', (e) => go(e.target.value));
$('#demo-login').addEventListener('click', () => renderLogin());

document.documentElement.dataset.theme = state.theme;
render();
