/**
 * Messagerie sortante — journal et envois de l'administrateur OIC (lot b1).
 *
 * Le journal ne montre pas les adresses : l'exploitant ne reçoit pas les
 * coordonnées privées (classification `contact`). Il sait qui a reçu quoi, par
 * quel canal, quand, et si le message a pu être remis.
 *
 * @module views/messagerie
 */

import { dateHeure, el, icone } from '../core/dom.js';
import { badge, bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { CANAL_MESSAGE, STATUT_MESSAGE, labelOf } from '../domain/enums.js';
import { ROLES } from '../domain/roles.js';
import { depot } from '../repositories/index.js';
import { CATEGORIES, envoyerACategorie, envoyerAuGroupement, journalMessages } from '../services/messagerie.service.js';
import { nomDe, nomUtilisateur } from './_donnees.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/** @param {any} ctx */
export function messagerie(ctx) {
  const tous = journalMessages(ctx);
  const corpsTableau = el('div');
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });

  const canal = el('select', { 'aria-label': 'Filtrer par canal', on: { change: rendre } }, [
    el('option', { value: '', text: 'Tous les canaux' }),
    ...Object.values(CANAL_MESSAGE).map((c) => el('option', { value: c, text: labelOf(c) })),
  ]);
  const destinataire = el('input', { type: 'search', placeholder: 'Destinataire ou entreprise…', 'aria-label': 'Filtrer par destinataire', on: { input: rendre } });
  const depuis = el('input', { type: 'date', 'aria-label': 'Envoyés depuis le', title: 'Envoyés depuis le', on: { change: rendre } });
  const jusqua = el('input', { type: 'date', 'aria-label': 'Envoyés jusqu’au', title: 'Envoyés jusqu’au', on: { change: rendre } });

  function rendre() {
    const liste = journalMessages(ctx, {
      canal: canal.value, destinataire: destinataire.value, depuis: depuis.value, jusqua: jusqua.value,
    });
    compteur.textContent = `${liste.length} message(s)`;
    corpsTableau.replaceChildren(tableau({
      colonnes: ['Envoyé le', 'Canal', 'Destinataire', 'Objet', 'Expéditeur', 'Remise'],
      lignes: liste.slice(0, 200).map((m) => [
        dateHeure(m.envoyeLe),
        el('span.badge.badge-info', {}, [icone(m.canal === CANAL_MESSAGE.SMS ? 'phone' : 'mail', 13), el('span', { text: labelOf(m.canal) })]),
        el('span.b1-cellule', {}, [
          el('strong', { text: nomUtilisateur(m.destinataireUtilisateurId) }),
          el('small', { text: m.destinataireGroupementId ? nomDe(ctx, m.destinataireGroupementId) : '—' }),
        ]),
        el('span.b1-cellule', {}, [el('strong', { text: m.objet }), el('small.b1-apercu', { text: m.corps })]),
        m.expediteurUtilisateurId
          ? el('span.b1-cellule', {}, [el('span', { text: nomUtilisateur(m.expediteurUtilisateurId) }), el('small', { text: ROLES[m.expediteurRoleId]?.libelle ?? '' })])
          : 'Plateforme (automatique)',
        badge(m.statut),
      ]),
      vide: etatVide({ titre: 'Aucun message', message: 'Aucun message ne correspond à ces critères.' }),
    }));
  }
  rendre();

  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Courriels et SMS simulés',
      message:
        'Chaque message part à l’adresse ou au numéro enregistré sur le compte du destinataire. Dans cette ' +
        'démonstration, l’envoi est simulé. Les adresses ne vous sont pas affichées : l’exploitant ne lit pas ' +
        'les coordonnées privées des entreprises.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Messages envoyés', valeur: tous.length, icon: 'send' }),
      kpi({ libelle: 'Courriels', valeur: tous.filter((m) => m.canal === CANAL_MESSAGE.COURRIEL).length, icon: 'mail' }),
      kpi({ libelle: 'SMS', valeur: tous.filter((m) => m.canal === CANAL_MESSAGE.SMS).length, icon: 'phone' }),
      kpi({ libelle: 'Non remis', valeur: tous.filter((m) => m.statut === STATUT_MESSAGE.NON_REMIS).length, icon: 'alert' }),
    ]),
    carte({
      titre: 'Journal des messages',
      sousTitre: 'Filtrez par canal, par destinataire et par période.',
      actions: [bouton({ libelle: 'Envoyer un message', variante: 'primary', icone: 'send', onClick: () => dialogueEnvoi(ctx) })],
      corps: [el('div.declarations-toolbar.b1-filtres', {}, [destinataire, canal, depuis, jusqua]), compteur, corpsTableau],
    }),
  ]);
}

/** Envoi à une entreprise ou à une catégorie d'entreprises. */
function dialogueEnvoi(ctx) {
  const entreprises = depot('groupement').lisiblesPar(ctx, 'groupement.lire')
    .filter((g) => g.type !== 'institution')
    .sort((a, b) => String(a.raisonSociale).localeCompare(String(b.raisonSociale), 'fr'));
  const erreurs = el('div', { role: 'alert', 'aria-live': 'polite' });
  const mode = champ({
    id: 'env-mode', label: 'Destinataires', requis: true, valeur: 'entreprise',
    options: [{ valeur: 'entreprise', libelle: 'Une entreprise' }, { valeur: 'categorie', libelle: 'Une catégorie d’entreprises' }],
    attrs: { name: 'mode' },
  });
  const entreprise = champ({
    id: 'env-entreprise', label: 'Entreprise', requis: true,
    options: entreprises.map((g) => ({ valeur: g.id, libelle: g.raisonSociale })),
    attrs: { name: 'groupementId' },
  });
  const categorie = champ({
    id: 'env-categorie', label: 'Catégorie', requis: false,
    options: CATEGORIES.map((c) => ({ valeur: c.id, libelle: c.libelle })),
    attrs: { name: 'categorie' },
  });
  categorie.hidden = true;
  mode.querySelector('select').addEventListener('change', (e) => {
    const parCategorie = e.target.value === 'categorie';
    entreprise.hidden = parCategorie;
    categorie.hidden = !parCategorie;
    entreprise.querySelector('select').required = !parCategorie;
    categorie.querySelector('select').required = parCategorie;
  });

  const form = el('form', {}, [
    el('div.field-row.form-grid', {}, [mode, entreprise, categorie]),
    el('fieldset.b1-canaux', {}, [
      el('legend', { text: 'Canaux' }),
      ...Object.values(CANAL_MESSAGE).map((c) => el('label.checkbox-row', {}, [
        el('input', { type: 'checkbox', name: 'canal', value: c, checked: c === CANAL_MESSAGE.COURRIEL || undefined }),
        el('span.label-body', {}, [el('strong', { text: labelOf(c) }), el('span', { text: c === CANAL_MESSAGE.SMS ? 'Au numéro mobile enregistré — texte abrégé.' : 'À l’adresse électronique enregistrée.' })]),
      ])),
    ]),
    champ({ id: 'env-objet', label: 'Objet', requis: true, attrs: { name: 'objet', maxlength: 160 } }),
    champ({ id: 'env-corps', label: 'Message', type: 'textarea', requis: true, attrs: { name: 'corps', maxlength: 2000, rows: 5 } }),
    erreurs,
    el('footer.modal-footer', {}, [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({ libelle: 'Envoyer', variante: 'primary', icone: 'send', type: 'submit' }),
    ]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const saisie = { objet: fd.get('objet'), corps: fd.get('corps'), canaux: fd.getAll('canal') };
    try {
      const bilan = fd.get('mode') === 'categorie'
        ? envoyerACategorie(ctx, { ...saisie, categorie: fd.get('categorie') })
        : envoyerAuGroupement(ctx, String(fd.get('groupementId')), saisie);
      fermer();
      toast(`${bilan.envoyes} message(s) remis (envoi simulé)${bilan.nonRemis ? `, ${bilan.nonRemis} non remis faute de coordonnée` : ''}.`);
      rafraichir();
    } catch (err) {
      erreurs.replaceChildren(bandeau({ ton: 'err', message: err instanceof Error ? err.message : 'L’envoi a échoué.' }));
    }
  });
  const fermer = modale({ titre: 'Envoyer un message', corps: [el('p', { text: 'Le message part à chaque utilisateur actif des entreprises choisies. Envoi simulé.' }), form] });
  form.closest('.modal-card')?.classList.add('modal-lg');
}

