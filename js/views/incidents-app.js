/**
 * Lot b5 : incidents applicatifs — signalement par tout utilisateur habilité,
 * qualification, attribution et suivi par l'OIC.
 *
 * @module views/incidents-app
 */

import { dateHeure, el } from '../core/dom.js';
import { arborescenceDe } from '../core/nav.js';
import { badge, bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { CATEGORIE_INCIDENT_APP, ETAT_INCIDENT_APP, GRAVITE_INCIDENT_APP, labelOf } from '../domain/enums.js';
import { ROLES } from '../domain/roles.js';
import * as incidents from '../services/incidents-app.service.js';
import { nomUtilisateur } from './_donnees.js';
import { agir, valeurDe } from './admin-outils.js';

const options = (source) => Object.values(source).map((v) => ({ valeur: v, libelle: labelOf(v) }));

/** Filtre d'état conservé entre deux rafraîchissements. */
let filtreEtat = '';

/** @param {any} ctx */
export function incidentsVue(ctx) {
  const traiter = decider(ctx, 'incident.traiter').autorise;
  const liste = incidents.incidentsVisibles(ctx);

  function formulaire(idPrefixe) {
    const pages = arborescenceDe(ctx).flatMap((z) => z.pages).map((p) => ({ valeur: p.libelle, libelle: p.libelle }));
    return [
      el('div.field-row', {}, [
        champ({ id: `${idPrefixe}-cat`, label: 'Nature du problème', requis: true, options: options(CATEGORIE_INCIDENT_APP) }),
        champ({ id: `${idPrefixe}-grav`, label: 'Gêne ressentie', requis: true, options: options(GRAVITE_INCIDENT_APP), aide: 'Bloquante : vous ne pouvez plus travailler.' }),
      ]),
      el('div.field-row', {}, [
        champ({ id: `${idPrefixe}-titre`, label: 'Titre', requis: true, attrs: { maxlength: '120', placeholder: 'En quelques mots' } }),
        champ({ id: `${idPrefixe}-ecran`, label: 'Écran concerné', options: [...pages, { valeur: 'Autre écran', libelle: 'Autre écran' }] }),
      ]),
      champ({ id: `${idPrefixe}-desc`, label: 'Description', type: 'textarea', requis: true, aide: 'Ce que vous faisiez, ce qui s’est passé, ce que vous attendiez. Sans numéro de téléphone ni adresse.' }),
      champ({ id: `${idPrefixe}-capture`, label: 'Capture d’écran', type: 'file', aide: 'Facultative. Démonstration : seuls le nom, le type et la taille du fichier sont conservés.', attrs: { accept: 'image/png,image/jpeg,image/webp,image/gif' } }),
    ];
  }

  function lireFormulaire(idPrefixe) {
    const fichier = document.getElementById(`${idPrefixe}-capture`)?.files?.[0];
    return {
      categorie: valeurDe(`${idPrefixe}-cat`),
      gravite: valeurDe(`${idPrefixe}-grav`),
      titre: valeurDe(`${idPrefixe}-titre`),
      ecran: valeurDe(`${idPrefixe}-ecran`),
      description: valeurDe(`${idPrefixe}-desc`),
      capture: fichier ? { nom: fichier.name, type: fichier.type, taille: fichier.size } : null,
    };
  }

  function dialogueSignalement() {
    const fermer = modale({
      titre: 'Signaler un incident sur la plateforme',
      corps: formulaire('si'),
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({ libelle: 'Envoyer le signalement', variante: 'primary', onClick: () => agir(() => incidents.declarerIncident(ctx, lireFormulaire('si')), 'Incident signalé. Vous suivrez son traitement ici.', fermer) }),
      ],
    });
  }

  function chronologie(i) {
    return el('div.timeline', {}, i.suivi.map((s, n) => el('div.timeline-item', {}, [
      el('span', { class: `timeline-dot ${n === i.suivi.length - 1 ? 'current' : 'done'}` }),
      el('div.timeline-content', {}, [
        el('strong', { text: labelOf(s.etat) }),
        el('div.meta', { text: `${dateHeure(s.horodatage)} · ${nomUtilisateur(s.auteurUtilisateurId)}` }),
        s.commentaire ? el('div.note', { text: s.commentaire }) : null,
      ]),
    ])));
  }

  function recapitulatif(i) {
    return el('div.recap-grid', {}, [
      el('div.recap-item', {}, [el('span', { text: 'Nature' }), el('strong', { text: labelOf(i.categorie) })]),
      el('div.recap-item', {}, [el('span', { text: 'Gêne déclarée' }), el('strong', { text: labelOf(i.gravite) })]),
      el('div.recap-item', {}, [el('span', { text: 'Gravité retenue' }), el('strong', { text: i.graviteRetenue ? labelOf(i.graviteRetenue) : 'À qualifier' })]),
      el('div.recap-item', {}, [el('span', { text: 'Écran' }), el('strong', { text: i.ecran ?? 'Non précisé' })]),
      el('div.recap-item', {}, [el('span', { text: 'Déclaré par' }), el('strong', { text: `${nomUtilisateur(i.declareParUtilisateurId)} · ${ROLES[i.declareParRoleId]?.libelle ?? ''}` })]),
      el('div.recap-item', {}, [el('span', { text: 'Attribué à' }), el('strong', { text: i.attribueAUtilisateurId ? nomUtilisateur(i.attribueAUtilisateurId) : 'Personne' })]),
      i.capture ? el('div.recap-item', {}, [el('span', { text: 'Capture jointe' }), el('strong', { text: `${i.capture.nom} · ${i.capture.tailleKo} Ko` })]) : null,
    ]);
  }

  function dialogueFiche(i) {
    const agents = incidents.agentsHabilites();
    const actions = [];
    const corps = [recapitulatif(i), el('p', { text: i.description }), i.impact ? el('p', { text: `Impact : ${i.impact}` }) : null,
      i.resolution ? el('p', { text: `Résolution : ${i.resolution}` }) : null, el('h3', { text: 'Suivi' }), chronologie(i)];
    let fermer = () => {};
    if (traiter && [ETAT_INCIDENT_APP.NOUVEAU, ETAT_INCIDENT_APP.QUALIFIE].includes(i.etat)) {
      corps.push(el('h3', { text: 'Qualifier' }), el('div.field-row', {}, [
        champ({ id: 'iq-grav', label: 'Gravité retenue', requis: true, valeur: i.graviteRetenue ?? i.gravite, options: options(GRAVITE_INCIDENT_APP) }),
      ]), champ({ id: 'iq-impact', label: 'Impact', type: 'textarea', requis: true, valeur: i.impact, aide: 'Qui est touché, ce qui est bloqué.' }));
      actions.push(bouton({ libelle: 'Enregistrer la qualification', variante: 'secondary', onClick: () => agir(() => incidents.qualifierIncident(ctx, i.id, { graviteRetenue: valeurDe('iq-grav'), impact: valeurDe('iq-impact') }), 'Incident qualifié.', fermer) }));
    }
    if (traiter && [ETAT_INCIDENT_APP.QUALIFIE, ETAT_INCIDENT_APP.EN_COURS].includes(i.etat)) {
      corps.push(el('h3', { text: 'Attribuer' }), champ({ id: 'ia-agent', label: 'Agent responsable', requis: true, valeur: i.attribueAUtilisateurId, options: agents.map((a) => ({ valeur: a.id, libelle: a.nom })) }));
      actions.push(bouton({ libelle: 'Attribuer', variante: 'primary', onClick: () => agir(() => incidents.attribuerIncident(ctx, i.id, valeurDe('ia-agent')), 'Incident attribué.', fermer) }));
    }
    if (traiter && i.etat === ETAT_INCIDENT_APP.EN_COURS) {
      corps.push(el('h3', { text: 'Suivre et résoudre' }), champ({ id: 'ir-texte', label: 'Note de suivi ou résolution', type: 'textarea', requis: true }));
      actions.push(
        bouton({ libelle: 'Ajouter une note', variante: 'ghost', onClick: () => agir(() => incidents.commenterIncident(ctx, i.id, valeurDe('ir-texte')), 'Note ajoutée.', fermer) }),
        bouton({ libelle: 'Déclarer résolu', variante: 'primary', onClick: () => agir(() => incidents.resoudreIncident(ctx, i.id, valeurDe('ir-texte')), 'Incident résolu.', fermer) }),
      );
    }
    if (traiter && i.etat === ETAT_INCIDENT_APP.RESOLU) {
      corps.push(champ({ id: 'ro-motif', label: 'Motif de réouverture', type: 'textarea', aide: 'Seulement si la correction ne tient pas.' }));
      actions.push(
        bouton({ libelle: 'Rouvrir', variante: 'ghost', onClick: () => agir(() => incidents.rouvrir(ctx, i.id, valeurDe('ro-motif')), 'Incident rouvert.', fermer) }),
        bouton({ libelle: 'Clore l’incident', variante: 'primary', onClick: () => agir(() => incidents.clore(ctx, i.id), 'Incident clos.', fermer) }),
      );
    }
    fermer = modale({ titre: `${i.reference} — ${i.titre}`, corps, actions: [bouton({ libelle: 'Fermer', onClick: () => fermer() }), ...actions] });
  }

  const visibles = liste.filter((i) => !filtreEtat || i.etat === filtreEtat);
  const onglets = el('div.declarations-tabs', { role: 'group', 'aria-label': 'Filtrer par état' },
    [['', 'Tous'], ...Object.values(ETAT_INCIDENT_APP).map((v) => [v, labelOf(v)])].map(([v, t]) => el('button', {
      type: 'button', 'aria-pressed': String(filtreEtat === v), text: `${t} (${v ? liste.filter((i) => i.etat === v).length : liste.length})`,
      on: { click: () => { filtreEtat = v; globalThis.dispatchEvent(new HashChangeEvent('hashchange')); } },
    })));

  const table = tableau({
    colonnes: traiter
      ? ['Référence', 'Titre', 'Déclarant', 'Gravité', 'État', 'Attribué à', '']
      : ['Référence', 'Titre', 'Nature', 'Signalé le', 'État', ''],
    lignes: visibles.map((i) => traiter
      ? [el('span.lot-b5-nowrap', { text: i.reference }), i.titre, `${nomUtilisateur(i.declareParUtilisateurId)} · ${ROLES[i.declareParRoleId]?.libelle ?? ''}`,
        labelOf(i.graviteRetenue ?? i.gravite), badge(i.etat), i.attribueAUtilisateurId ? nomUtilisateur(i.attribueAUtilisateurId) : '—',
        bouton({ libelle: 'Ouvrir', variante: 'secondary', onClick: () => dialogueFiche(i) })]
      : [el('span.lot-b5-nowrap', { text: i.reference }), i.titre, labelOf(i.categorie), dateHeure(i.declareLe), badge(i.etat),
        bouton({ libelle: 'Suivre', variante: 'secondary', onClick: () => dialogueFiche(i) })]),
    vide: etatVide({ titre: 'Aucun incident', message: traiter ? 'Aucun incident dans cet état.' : 'Vous n’avez signalé aucun incident.' }),
  });

  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Un incident de la plateforme, pas un incident de transport',
      message: traiter
        ? 'Qualifiez chaque signalement, attribuez-le à un agent habilité et suivez-le jusqu’à sa clôture. Le déclarant est notifié à chaque étape ; tout est inscrit au journal d’audit.'
        : 'Signalez ici un problème de la plateforme : accès, écran, données. Une panne, un retard ou un barrage se signalent dans le suivi du transport concerné.',
    }),
    traiter ? el('div.kpi-grid', {}, [
      kpi({ libelle: 'À qualifier', valeur: liste.filter((i) => i.etat === ETAT_INCIDENT_APP.NOUVEAU).length, icon: 'inbox' }),
      kpi({ libelle: 'En traitement', valeur: liste.filter((i) => [ETAT_INCIDENT_APP.QUALIFIE, ETAT_INCIDENT_APP.EN_COURS].includes(i.etat)).length, icon: 'clock' }),
      kpi({ libelle: 'Résolus ou clos', valeur: liste.filter((i) => [ETAT_INCIDENT_APP.RESOLU, ETAT_INCIDENT_APP.CLOS].includes(i.etat)).length, icon: 'check-circle' }),
      kpi({ libelle: 'Bloquants ouverts', valeur: liste.filter((i) => (i.graviteRetenue ?? i.gravite) === GRAVITE_INCIDENT_APP.BLOQUANTE && i.etat !== ETAT_INCIDENT_APP.CLOS).length, icon: 'alert' }),
    ]) : null,
    traiter ? null : carte({
      titre: 'Signaler un incident',
      corps: [...formulaire('ni'), el('div.table-toolbar', {}, [
        bouton({ libelle: 'Envoyer le signalement', variante: 'primary', onClick: () => agir(() => incidents.declarerIncident(ctx, lireFormulaire('ni')), 'Incident signalé. Vous suivrez son traitement ci-dessous.') }),
      ])],
    }),
    carte({
      titre: traiter ? 'Incidents signalés' : 'Mes signalements',
      actions: traiter ? [bouton({ libelle: 'Signaler un incident', variante: 'secondary', icone: 'plus', onClick: dialogueSignalement })] : [],
      corps: [traiter ? onglets : null, table],
    }),
  ]);
}
