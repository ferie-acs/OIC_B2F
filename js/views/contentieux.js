/**
 * Contentieux — enregistrement et suivi d'un litige jusqu'à sa clôture.
 *
 * Lot b4. Servi au service contentieux (`contentieux_paie`, qui instruit) et à
 * l'exploitant (`concessionnaire`, qui consulte). Les actions suivent la
 * matrice : pour qui n'a que la lecture, elles restent visibles avec leur motif.
 *
 * Les pièces ne sont décrites que par leurs **métadonnées** (nom, type, taille) :
 * le fichier choisi n'est ni lu ni conservé dans la démonstration, et l'écran le dit.
 *
 * @module views/contentieux
 */

import { date, dateHeure, el, montant } from '../core/dom.js';
import { bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau } from '../core/ui.js';
import { decider } from '../domain/access.js';
import {
  ETAPE_CONTENTIEUX,
  ISSUE_CONTENTIEUX,
  NATURE_CONTENTIEUX,
  etapeSuivanteContentieux,
  libelleFinance,
} from '../domain/finances.js';
import {
  ajouterPiece,
  avancerContentieux,
  cloreContentieux,
  listeContentieux,
  ouvrirContentieux,
  partiesPossibles,
} from '../services/contentieux.service.js';
import { nomUtilisateur } from './_donnees.js';
import { agir, pastille, recap, valeur } from './_finances-ui.js';

const options = (valeurs) => valeurs.map((v) => ({ valeur: v, libelle: libelleFinance(v) }));
const taille = (octets) =>
  typeof octets !== 'number' ? '—' : octets >= 1048576 ? `${(octets / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;

/** Filtre de la liste, conservé le temps de la session. */
let filtre = 'en_cours';

/** @param {any} ctx */
export function contentieux(ctx) {
  const gerer = decider(ctx, 'contentieux.gerer');
  const motif = gerer.autorise ? null : 'L’instruction des contentieux revient au service contentieux. Votre rôle les consulte.';
  const page = el('div.page.supervision-page', {});

  const rendre = () => {
    const tous = listeContentieux(ctx);
    const enCours = tous.filter((c) => c.etape !== ETAPE_CONTENTIEUX.CLOS);
    const visibles = filtre === 'en_cours' ? enCours : filtre === 'clos' ? tous.filter((c) => c.etape === ETAPE_CONTENTIEUX.CLOS) : tous;
    const selecteur = el(
      'select',
      { class: 'select b4-filtre', 'aria-label': 'Filtrer les contentieux', on: { change: (e) => { filtre = e.target.value; rendre(); } } },
      [['en_cours', 'Dossiers en cours'], ['clos', 'Dossiers clos'], ['tous', 'Tous les dossiers']].map(([v, t]) =>
        el('option', { value: v, text: t, selected: v === filtre || undefined }),
      ),
    );
    page.replaceChildren(
      ...[
      gerer.autorise
        ? null
        : bandeau({ ton: 'info', titre: 'Consultation', message: 'Vous suivez les contentieux ; leur instruction revient au service contentieux.' }),
      el('div.kpi-grid', {}, [
        kpi({ libelle: 'Dossiers en cours', valeur: enCours.length, icon: 'scale' }),
        kpi({ libelle: 'En instruction', valeur: enCours.filter((c) => c.etape === ETAPE_CONTENTIEUX.INSTRUCTION).length, icon: 'clock' }),
        kpi({ libelle: 'Montant en jeu', valeur: montant(enCours.reduce((n, c) => n + (c.montant ?? 0), 0)) }),
        kpi({ libelle: 'Montant réglé', valeur: montant(tous.reduce((n, c) => n + (c.montantRegle ?? 0), 0)), icon: 'check-circle' }),
      ]),
      carte({
        titre: 'Contentieux',
        sousTitre: 'Litiges et impayés, de l’ouverture à la clôture.',
        actions: [bouton({ libelle: 'Ouvrir un contentieux', variante: 'primary', icone: 'plus', motif, onClick: () => dialogueOuverture(ctx) })],
        corps: [
          el('div.declarations-toolbar', {}, [selecteur, el('p.declarations-count', { text: `${visibles.length} dossier(s)` })]),
          tableau({
            colonnes: ['Référence', 'Entreprise', 'Partie adverse', 'Nature', 'Montant en jeu', 'Réglé', 'Étape', 'Ouvert le', ''],
            lignes: visibles.map((c) => [
              c.reference,
              c.partie ?? '—',
              c.adverse ?? '—',
              libelleFinance(c.nature),
              montant(c.montant),
              montant(c.montantRegle ?? 0),
              pastille(c.etape),
              date(c.ouvertLe),
              bouton({ libelle: 'Voir le dossier', variante: 'ghost', icone: 'eye', onClick: () => dialogueDossier(ctx, c, motif) }),
            ]),
            vide: etatVide({ titre: 'Aucun dossier', message: 'Aucun contentieux ne correspond à ce filtre.' }),
          }),
        ],
      })
      ].filter(Boolean)
    );
  };
  rendre();
  return page;
}

/** Champ fichier : seules les métadonnées des pièces choisies sont retenues. */
function champPieces(id) {
  return el('div.field', {}, [
    el('label', { for: id }, [el('span', { text: 'Pièces du dossier' })]),
    el('input', { id, class: 'input', type: 'file', multiple: true }),
    el('small', { text: 'Seuls le nom, le type et la taille des fichiers sont enregistrés : le contenu n’est pas conservé dans cette démonstration.' }),
  ]);
}

const metadonnees = (id) =>
  [...(/** @type {HTMLInputElement|null} */ (document.getElementById(id))?.files ?? [])].map((f) => ({ nom: f.name, type: f.type, taille: f.size }));

function dialogueOuverture(ctx) {
  const { entreprises, relations } = partiesPossibles(ctx);
  const choixEntreprises = entreprises.map((g) => ({ valeur: g.id, libelle: g.nom }));
  const fermer = modale({
    titre: 'Ouvrir un contentieux',
    corps: [
      el('div.field-row', {}, [
        champ({ id: 'co-partie', label: 'Entreprise concernée', requis: true, options: choixEntreprises }),
        champ({ id: 'co-adverse', label: 'Partie adverse (facultatif)', options: choixEntreprises }),
      ]),
      el('div.field-row', {}, [
        champ({ id: 'co-nature', label: 'Nature', requis: true, options: options(Object.values(NATURE_CONTENTIEUX)) }),
        champ({ id: 'co-montant', label: 'Montant en jeu (F CFA)', type: 'number', requis: true, valeur: 0, attrs: { min: '0', step: '1' } }),
      ]),
      champ({
        id: 'co-relation',
        label: 'Mise en relation concernée (facultatif)',
        options: relations.map((r) => ({ valeur: r.id, libelle: r.reference })),
        aide: 'Elle doit concerner l’entreprise choisie.',
      }),
      champ({ id: 'co-objet', label: 'Objet du litige', type: 'textarea', requis: true, aide: 'Les faits, en quelques phrases.' }),
      champPieces('co-pieces'),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Ouvrir le dossier',
        variante: 'primary',
        onClick: () =>
          agir(
            () =>
              ouvrirContentieux(ctx, {
                groupementId: valeur('co-partie'),
                partieAdverseGroupementId: valeur('co-adverse'),
                appariementId: valeur('co-relation'),
                nature: valeur('co-nature'),
                objet: valeur('co-objet'),
                montant: Number(valeur('co-montant')),
                pieces: metadonnees('co-pieces'),
              }),
            'Contentieux ouvert et inscrit au journal.',
            fermer,
          ),
      }),
    ],
  });
}

function dialogueDossier(ctx, c, motif) {
  const suivante = etapeSuivanteContentieux(c.etape);
  const clos = c.etape === ETAPE_CONTENTIEUX.CLOS;
  const fermer = modale({
    titre: `Contentieux ${c.reference}`,
    corps: [
      recap([
        ['Entreprise', c.partie ?? '—'],
        ['Partie adverse', c.adverse ?? '—'],
        ['Nature', libelleFinance(c.nature)],
        ['Étape', pastille(c.etape)],
        ['Montant en jeu', montant(c.montant)],
        ['Reste dû', montant(c.restant)],
        c.issue ? ['Issue', libelleFinance(c.issue)] : null,
      ]),
      el('h3', { text: 'Objet' }),
      el('p', { text: c.objet ?? '—' }),
      el('h3', { text: 'Pièces' }),
      tableau({
        colonnes: ['Pièce', 'Type', 'Taille', 'Versée le'],
        lignes: (c.pieces ?? []).map((p) => [p.nom, p.type || '—', taille(p.taille), dateHeure(p.ajouteLe)]),
        vide: 'Aucune pièce versée au dossier.',
      }),
      el('h3', { text: 'Historique' }),
      el(
        'ul.timeline',
        {},
        (c.historique ?? []).map((h, i, l) =>
          el('li.timeline-item', {}, [
            el('span', { class: `timeline-dot${i < l.length - 1 || clos ? ' done' : ' current'}` }),
            el('div.timeline-content', {}, [
              el('strong', { text: `${libelleFinance(h.etape)} — ${h.commentaire ?? ''}` }),
              el('span.meta', { text: `${dateHeure(h.le)} · ${nomUtilisateur(h.parUtilisateurId)}` }),
            ]),
          ]),
        ),
      ),
      clos
        ? null
        : el('div.b4-formulaire', {}, [
            champ({ id: 'cd-commentaire', label: 'Commentaire', type: 'textarea', aide: 'Obligatoire pour faire avancer ou clore le dossier.' }),
            el('div.field-row', {}, [
              champ({ id: 'cd-issue', label: 'Issue (pour la clôture)', options: options(Object.values(ISSUE_CONTENTIEUX)) }),
              champPieces('cd-pieces'),
            ]),
          ]),
    ],
    actions: clos
      ? [bouton({ libelle: 'Fermer', variante: 'primary', onClick: () => fermer() })]
      : [
          bouton({
            libelle: 'Verser les pièces',
            motif,
            onClick: () => {
              const pieces = metadonnees('cd-pieces');
              agir(
                () => {
                  if (!pieces.length) throw new Error('Choisissez au moins un fichier à décrire.');
                  for (const p of pieces) ajouterPiece(ctx, c.id, p);
                },
                `${pieces.length} pièce(s) versée(s) au dossier.`,
                fermer,
              );
            },
          }),
          suivante
            ? bouton({
                libelle: `Passer en « ${libelleFinance(suivante).toLowerCase()} »`,
                motif,
                onClick: () => agir(() => avancerContentieux(ctx, c.id, { vers: suivante, commentaire: valeur('cd-commentaire') }), 'Étape enregistrée.', fermer),
              })
            : null,
          bouton({
            libelle: 'Clore le dossier',
            variante: 'primary',
            motif,
            onClick: () => agir(() => cloreContentieux(ctx, c.id, { issue: valeur('cd-issue'), commentaire: valeur('cd-commentaire') }), 'Contentieux clos.', fermer),
          }),
        ],
  });
}
