/**
 * Lot b5 : écran « Profils et habilitations » de l'exploitant.
 *
 * Consultation de la matrice par profil et par droit, paramétrage encadré des
 * droits déclarés paramétrables, historique des décisions. Les verrous sont
 * portés par le domaine (`controlerParametrage`) ; l'écran les explique.
 *
 * @module views/habilitations
 */

import { dateHeure, el } from '../core/dom.js';
import { bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { DROITS, PORTEE } from '../domain/permissions.js';
import { ROLES, role } from '../domain/roles.js';
import * as habilitations from '../services/habilitations.service.js';
import { nomUtilisateur } from './_donnees.js';
import { agir, valeurDe } from './admin-outils.js';

const PORTEES = Object.freeze({
  [PORTEE.AUCUNE]: 'Non accordé',
  [PORTEE.PROPRE]: 'Personnel',
  [PORTEE.GROUPEMENT]: 'Son organisation',
  [PORTEE.MARCHE]: 'Marché publié',
  [PORTEE.TOUT]: 'Toute la plateforme',
});

const NIVEAUX = { 1: 'Démontré', 2: 'Décliné', 3: 'Modélisé' };

/** État d'interface conservé entre deux rafraîchissements. */
const etat = { vue: 'profil', roleId: 'dgttc', droit: 'audit.lire', tous: false };

/** @param {any} ctx */
export function habilitationsVue(ctx) {
  const m = habilitations.matriceHabilitations(ctx);
  const droitParametrer = decider(ctx, 'habilitation.parametrer');
  const historique = habilitations.historiqueHabilitations(ctx);
  const conteneur = el('div');
  const ecarts = m.roles.flatMap((r) => m.droits.filter((d) => m.cellule(r.id, d.id).ecart)).length;

  const rendre = () => conteneur.replaceChildren(
    el('div.tabs-underline', {}, [onglet('Par profil', 'profil'), onglet('Par droit', 'droit'), onglet(`Historique (${historique.length})`, 'historique')]),
    etat.vue === 'profil' ? parProfil() : etat.vue === 'droit' ? parDroit() : vueHistorique(),
  );

  function onglet(libelle, valeur) {
    return el('button', {
      type: 'button', class: `tab-btn${etat.vue === valeur ? ' active' : ''}`, 'aria-pressed': String(etat.vue === valeur), text: libelle,
      on: { click: () => { etat.vue = valeur; rendre(); } },
    });
  }

  function cellulePortee(c) {
    return el('span.cell-2line', {}, [
      el('strong', { text: PORTEES[c.effective] }),
      c.ecart ? el('span', { text: `Conception : ${PORTEES[c.conception].toLowerCase()}` }) : null,
    ]);
  }

  function action(roleId, droitId) {
    const c = m.cellule(roleId, droitId);
    if (!c.parametrable) {
      return el('small.motif-refus', { text: c.verrouille ? 'Verrouillé — règle anti-fraude' : 'Fixé par la conception' });
    }
    const accorde = c.effective !== PORTEE.AUCUNE;
    return bouton({
      libelle: accorde ? 'Retirer' : 'Activer',
      variante: 'secondary',
      motif: droitParametrer.autorise ? null : droitParametrer.explication,
      onClick: () => dialogue(roleId, droitId, !accorde),
    });
  }

  function parProfil() {
    const r = ROLES[etat.roleId];
    const choix = champ({
      id: 'hab-role', label: 'Profil', valeur: etat.roleId,
      options: Object.values(ROLES).map((x) => ({ valeur: x.id, libelle: `${x.libelle} — ${NIVEAUX[x.niveau].toLowerCase()}` })),
    });
    choix.querySelector('select').addEventListener('change', (e) => { if (e.target.value) { etat.roleId = e.target.value; rendre(); } });
    const tous = el('label.checkbox-row', {}, [
      el('input', { type: 'checkbox', checked: etat.tous || undefined, on: { change: (e) => { etat.tous = e.target.checked; rendre(); } } }),
      ' Afficher tout le catalogue, droits non accordés compris',
    ]);
    const lignes = m.droits.filter((d) => {
      const c = m.cellule(r.id, d.id);
      return etat.tous || c.effective !== PORTEE.AUCUNE || c.parametrable;
    });
    const accordes = m.droits.filter((d) => m.cellule(r.id, d.id).effective !== PORTEE.AUCUNE).length;
    return carte({
      titre: r.libelle,
      sousTitre: `${NIVEAUX[r.niveau]} · espace ${r.espace} · ${accordes} droit(s) en vigueur`,
      corps: [
        el('div.field-row', {}, [choix]),
        tous,
        el('p.lot-b5-description', { text: r.description.replace(/\*\*/g, '') }),
        r.institutionnel && r.id !== 'super_admin'
          ? null
          : bandeau({ ton: 'info', message: m.cellule(r.id, 'audit.lire').explication || 'Les droits de ce profil sont fixés par la conception.' }),
        tableau({
          colonnes: ['Droit', 'Catégorie', 'En vigueur', 'Paramétrage'],
          lignes: lignes.map((d) => [
            el('span.cell-2line', {}, [el('strong', { text: d.libelle }), d.teste ? el('span', { text: 'Couvert par un test dédié' }) : null]),
            d.categorie,
            cellulePortee(m.cellule(r.id, d.id)),
            action(r.id, d.id),
          ]),
          vide: etatVide({ titre: 'Aucun droit', message: 'Ce profil ne détient aucun droit métier, délibérément.' }),
        }),
      ],
    });
  }

  function parDroit() {
    const d = DROITS[etat.droit];
    const choix = champ({
      id: 'hab-droit', label: 'Droit', valeur: etat.droit,
      options: Object.keys(DROITS).map((id) => ({ valeur: id, libelle: `${DROITS[id].categorie} — ${DROITS[id].libelle}` })),
    });
    choix.querySelector('select').addEventListener('change', (e) => { if (e.target.value) { etat.droit = e.target.value; rendre(); } });
    const desc = m.droits.find((x) => x.id === etat.droit);
    return carte({
      titre: d.libelle,
      sousTitre: desc.verrouille ? 'Verrouillé : porte une règle anti-fraude' : desc.parametrable ? 'Paramétrable pour les profils institutionnels' : 'Fixé par la conception',
      corps: [
        el('div.field-row', {}, [choix]),
        d.note ? el('p.lot-b5-description', { text: d.note.replace(/\*\*/g, '').replace(/`/g, '') }) : null,
        tableau({
          colonnes: ['Profil', 'Niveau', 'En vigueur', 'Paramétrage'],
          lignes: m.roles.map((r) => [r.libelle, NIVEAUX[r.niveau], cellulePortee(m.cellule(r.id, etat.droit)), action(r.id, etat.droit)]),
        }),
      ],
    });
  }

  function vueHistorique() {
    return carte({
      titre: 'Historique du paramétrage',
      sousTitre: 'En ajout seul : chaque décision reste lisible avec son auteur et son motif.',
      corps: [tableau({
        colonnes: ['Date', 'Profil', 'Droit', 'Décision', 'Motif', 'Auteur'],
        lignes: historique.map((h) => [
          dateHeure(h.horodatage), role(h.roleId).libelle, DROITS[h.droit]?.libelle ?? h.droit,
          h.accorde ? el('span.badge.badge-success', { text: 'Activé' }) : el('span.badge.badge-neutral', { text: 'Retiré' }),
          h.motif, nomUtilisateur(h.auteurUtilisateurId),
        ]),
        vide: etatVide({ titre: 'Aucun paramétrage', message: 'La matrice est celle de la conception : aucun droit n’a été activé ni retiré.' }),
      })],
    });
  }

  function dialogue(roleId, droitId, accorder) {
    const fermer = modale({
      titre: `${accorder ? 'Activer' : 'Retirer'} un droit — ${role(roleId).libelle}`,
      corps: [
        el('div.recap-grid', {}, [
          el('div.recap-item', {}, [el('span', { text: 'Droit' }), el('strong', { text: DROITS[droitId].libelle })]),
          el('div.recap-item', {}, [el('span', { text: 'Portée après décision' }), el('strong', { text: accorder ? PORTEES[PORTEE.TOUT] : PORTEES[PORTEE.AUCUNE] })]),
        ]),
        el('p', {
          text: accorder
            ? 'Le profil reçoit ce droit de consultation. Il ne voit que les données que sa classification lui ouvre : ni montant ni coordonnée de plus.'
            : 'Le profil perd ce droit : l’écran correspondant disparaît de son menu à sa prochaine action.',
        }),
        champ({ id: 'hab-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Par exemple : note de service, mission de contrôle ponctuelle.' }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: accorder ? 'Activer le droit' : 'Retirer le droit',
          variante: 'primary',
          onClick: () => agir(() => habilitations.modifierHabilitation(ctx, { roleId, droit: droitId, accorder, motif: valeurDe('hab-motif') }), 'Habilitation enregistrée.', fermer),
        }),
      ],
    });
  }

  rendre();
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: `${Object.keys(ROLES).length} profils, ${Object.keys(DROITS).length} droits au catalogue`,
      message:
        'La matrice des droits est fixée par la conception. Seuls les droits de consultation déclarés ' +
        'paramétrables peuvent être activés ou retirés, pour les profils institutionnels, avec un motif. ' +
        'Les droits de validation, de crédit, de vérification et d’activation sont verrouillés.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Profils', valeur: Object.keys(ROLES).length, icon: 'users' }),
      kpi({ libelle: 'Droits paramétrables', valeur: m.droits.filter((d) => d.parametrable).length, icon: 'settings' }),
      kpi({ libelle: 'Écarts en vigueur', valeur: ecarts, icon: 'shield' }),
    ]),
    conteneur,
  ]);
}
