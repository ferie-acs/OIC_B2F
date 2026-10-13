/**
 * Lot b5 : gestion des entreprises inscrites par l'exploitant OIC.
 *
 * Reprend la présentation de l'annuaire (cartes d'entreprise) et y ajoute la
 * modification avec motif, la suspension et la réactivation en quatre yeux, et
 * l'export CSV. Les règles sont dans `services/groupements-admin.service.js`.
 *
 * @module views/entreprises-admin
 */

import { date, dateHeure, el, icone } from '../core/dom.js';
import { badge, bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { ACTION_GROUPEMENT, ETAT_COMPTE, labelOf } from '../domain/enums.js';
import * as gestion from '../services/groupements-admin.service.js';
import { depot } from '../repositories/index.js';
import { nomDe, nomUtilisateur, refDe } from './_donnees.js';
import { agir, badgeEtat, telecharger, valeurDe } from './admin-outils.js';

const TYPES = { affreteur: 'AFFRÉTEUR', transporteur: 'TRANSPORTEUR', institution: 'INSTITUTION' };

/** @param {any} ctx */
export function entreprisesVue(ctx) {
  const liste = gestion.entreprises(ctx);
  const decisions = gestion.decisionsEntreprises(ctx);
  const enAttente = decisions.filter((d) => d.etat === 'en_attente');
  const droitSuspendre = decider(ctx, 'groupement.suspendre');
  const droitExport = decider(ctx, 'export.donnees');

  const grille = el('div.supervision-directory-grid');
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });
  const recherche = el('input', { type: 'search', placeholder: 'Rechercher une entreprise, une ville…', 'aria-label': 'Rechercher une entreprise', on: { input: () => rendre() } });
  const filtre = el('select', { 'aria-label': 'Filtrer les entreprises', on: { change: () => rendre() } },
    [['', 'Toutes les entreprises'], ['affreteur', 'Affréteurs'], ['transporteur', 'Transporteurs'], ['institution', 'Institutions'], ['suspendu', 'Entreprises suspendues']]
      .map(([value, text]) => el('option', { value, text })));

  function rendre() {
    const q = (recherche.value || '').trim().toLocaleLowerCase('fr');
    const visibles = liste.filter((g) =>
      `${g.raisonSociale ?? ''} ${g.rccm ?? ''} ${refDe(g.localiteId)}`.toLocaleLowerCase('fr').includes(q) &&
      (!filtre.value || (filtre.value === 'suspendu' ? g.etat === ETAT_COMPTE.SUSPENDU : g.type === filtre.value)));
    compteur.textContent = `${visibles.length} entreprise(s)`;
    grille.replaceChildren(...visibles.map(fiche));
    if (!visibles.length) grille.append(el('div.empty-state', {}, [icone('search', 30), el('h3', { text: 'Aucune entreprise trouvée' }), el('p', { text: 'Essayez un autre nom ou un autre filtre.' })]));
  }

  function fiche(g) {
    const institution = g.type === 'institution';
    const suspendu = g.etat === ETAT_COMPTE.SUSPENDU;
    const motifDecision = institution
      ? 'Une institution ne se suspend pas.'
      : g.decisionEnAttente
        ? 'Une décision attend déjà sa confirmation.'
        : droitSuspendre.autorise ? null : droitSuspendre.explication;
    return el('article.supervision-directory-card', {}, [
      el('div.supervision-directory-head', {}, [
        el('span.supervision-directory-symbol', {}, [icone(g.type === 'transporteur' ? 'truck' : g.type === 'affreteur' ? 'package' : 'building', 42)]),
        el('div', {}, [el('small', { text: TYPES[g.type] ?? '' }), el('h3', { text: g.raisonSociale })]),
      ]),
      el('p.supervision-locality', {}, [icone('map-pin', 17), refDe(g.localiteId)]),
      el('dl.supervision-directory-info', {}, [
        el('div', {}, [el('dt', { text: 'RCCM' }), el('dd', { text: g.rccm || 'Non renseigné' })]),
        el('div', {}, [el('dt', { text: 'État' }), el('dd', {}, [badgeEtat(g.etat, { actif: 'Active', inactif: 'Suspendue' })])]),
        g.type === 'transporteur' ? el('div', {}, [el('dt', { text: 'Vérification' }), el('dd', {}, [badge(g.verificationEtat || 'a_verifier')])]) : null,
        el('div', {}, [el('dt', { text: 'Utilisateurs · véhicules' }), el('dd', { text: `${g.utilisateurs} · ${g.vehicules}` })]),
        g.decisionEnAttente ? el('div', {}, [el('dt', { text: 'Décision en attente' }), el('dd', {}, [el('span.badge.badge-warning', { text: labelOf(g.decisionEnAttente.action) })])]) : null,
      ]),
      el('div.supervision-directory-foot', {}, [
        icone('calendar', 18),
        el('span', { text: institution ? 'Abonnement non requis' : `Inscrite le ${date(g.creeLe)} · ${g.abonnementActif ? 'abonnement actif' : 'abonnement expiré'}` }),
      ]),
      el('div.lot-b5-actions', {}, [
        bouton({ libelle: 'Modifier', variante: 'secondary', motif: decider(ctx, 'groupement.gerer').autorise ? null : decider(ctx, 'groupement.gerer').explication, onClick: () => dialogueModification(g) }),
        bouton({
          libelle: suspendu ? 'Demander la réactivation' : 'Demander la suspension',
          variante: 'ghost',
          motif: motifDecision,
          onClick: () => dialogueDemande(g, suspendu ? ACTION_GROUPEMENT.REACTIVER : ACTION_GROUPEMENT.SUSPENDRE),
        }),
      ]),
    ]);
  }

  function dialogueModification(g) {
    const localites = depot('referentiel').brutOu((r) => r.famille === 'localites' && (r.actif || r.id === g.localiteId))
      .map((r) => ({ valeur: r.id, libelle: r.libelle }));
    const transporteur = g.type === 'transporteur';
    const fermer = modale({
      titre: `Modifier la fiche — ${g.raisonSociale}`,
      corps: [
        transporteur && g.verificationEtat === 'verifie'
          ? bandeau({ ton: 'warn', message: 'Modifier la raison sociale, le RCCM ou la carte de transporteur fait perdre la vérification : le dossier repasse à l’agent d’activation.' })
          : null,
        el('div.field-row', {}, [
          champ({ id: 'en-raison', label: 'Raison sociale', requis: true, valeur: g.raisonSociale }),
          champ({ id: 'en-rccm', label: 'RCCM', valeur: g.rccm }),
        ]),
        el('div.field-row', {}, [
          champ({ id: 'en-cc', label: 'Compte contribuable', valeur: g.compteContribuable }),
          champ({ id: 'en-pays', label: 'Pays', requis: true, valeur: g.pays }),
        ]),
        champ({ id: 'en-loc', label: 'Localité', requis: true, valeur: g.localiteId, options: localites }),
        transporteur ? el('div.field-row', {}, [
          champ({ id: 'en-carte', label: 'Carte de transporteur', requis: true, valeur: g.carteTransporteurNumero }),
          champ({ id: 'en-echeance', label: 'Échéance de la carte', type: 'date', requis: true, valeur: g.carteTransporteurEcheance }),
        ]) : null,
        el('p', { text: 'Les coordonnées de contact ne sont pas modifiables ici : elles relèvent de l’entreprise.' }),
        champ({ id: 'en-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Par exemple : changement de dénomination attesté par un extrait RCCM.' }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({
          libelle: 'Enregistrer',
          variante: 'primary',
          onClick: async () => {
            const saisie = {
              raisonSociale: valeurDe('en-raison'), rccm: valeurDe('en-rccm'), compteContribuable: valeurDe('en-cc'),
              pays: valeurDe('en-pays'), localiteId: valeurDe('en-loc'),
              ...(transporteur ? { carteTransporteurNumero: valeurDe('en-carte'), carteTransporteurEcheance: valeurDe('en-echeance') } : {}),
            };
            const res = await agir(() => gestion.modifierEntreprise(ctx, g.id, saisie, valeurDe('en-motif')), 'Fiche modifiée.', fermer);
            if (res?.verificationRetiree) toast('Pièce contrôlée modifiée : le dossier est à vérifier de nouveau.', 'info');
          },
        }),
      ],
    });
  }

  function dialogueDemande(g, action) {
    const suspendre = action === ACTION_GROUPEMENT.SUSPENDRE;
    const fermer = modale({
      titre: `${suspendre ? 'Demander la suspension' : 'Demander la réactivation'} — ${g.raisonSociale}`,
      corps: [
        el('p', {
          text: suspendre
            ? 'Une fois confirmée par une autre personne, la suspension bloque toute nouvelle opération de l’entreprise : publication, réservation, réponse, validation. Ses annonces quittent le marché. Son historique reste intact et consultable.'
            : 'Une fois confirmée par une autre personne, l’entreprise retrouve ses opérations.',
        }),
        champ({ id: 'dg-motif', label: 'Motif', type: 'textarea', requis: true, aide: suspendre ? 'Par exemple : pièce du dossier frauduleuse, signalement en cours d’instruction.' : 'Par exemple : situation régularisée.' }),
      ],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({ libelle: 'Soumettre à confirmation', variante: 'primary', onClick: () => agir(() => gestion.demanderDecision(ctx, g.id, action, valeurDe('dg-motif')), 'Demande enregistrée. Elle attend la confirmation d’une autre personne.', fermer) }),
      ],
    });
  }

  function dialogueRejet(d) {
    const fermer = modale({
      titre: `Rejeter la demande — ${nomDe(ctx, d.groupementId)}`,
      corps: [el('p', { text: 'L’entreprise reste dans son état actuel.' }), champ({ id: 'dr-motif', label: 'Motif du rejet', type: 'textarea', requis: true })],
      actions: [
        bouton({ libelle: 'Annuler', onClick: () => fermer() }),
        bouton({ libelle: 'Rejeter', variante: 'primary', onClick: () => agir(() => gestion.rejeterDecision(ctx, d.id, valeurDe('dr-motif')), 'Demande rejetée.', fermer) }),
      ],
    });
  }

  function exporter() {
    try {
      const f = gestion.exporterEntreprises(ctx);
      telecharger(f.nom, f.contenu, 'text/csv;charset=utf-8');
      toast(`Export prêt : ${f.lignes} entreprise(s).`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export impossible.', 'err');
    }
  }

  rendre();
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Suspension en deux temps — principe des quatre yeux',
      message:
        'Une suspension ou une réactivation demandée par un agent ne prend effet qu’après confirmation ' +
        'par une autre personne. Une entreprise suspendue conserve son historique ; elle n’engage plus ' +
        'aucune nouvelle opération. Toute modification est motivée et inscrite au journal d’audit.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Entreprises inscrites', valeur: liste.filter((g) => g.type !== 'institution').length, icon: 'building' }),
      kpi({ libelle: 'Entreprises suspendues', valeur: liste.filter((g) => g.etat === ETAT_COMPTE.SUSPENDU).length, icon: 'alert' }),
      kpi({ libelle: 'Décisions à confirmer', valeur: enAttente.length, icon: 'clock' }),
    ]),
    carte({
      titre: 'Décisions à confirmer',
      sousTitre: 'Vous confirmez les décisions demandées par un autre agent.',
      corps: [tableau({
        colonnes: ['Entreprise', 'Décision', 'Motif', 'Demandée par', 'Le', ''],
        lignes: enAttente.map((d) => {
          const soi = d.demandeParUtilisateurId === ctx.utilisateurId ? gestion.MOTIF_QUATRE_YEUX : null;
          const motif = soi ?? (droitSuspendre.autorise ? null : droitSuspendre.explication);
          return [
            nomDe(ctx, d.groupementId), labelOf(d.action), d.motif, nomUtilisateur(d.demandeParUtilisateurId), dateHeure(d.demandeLe),
            el('div.table-toolbar', {}, [
              bouton({ libelle: 'Confirmer', variante: 'primary', motif, onClick: () => agir(() => gestion.confirmerDecision(ctx, d.id), d.action === 'suspendre' ? 'Entreprise suspendue.' : 'Entreprise réactivée.') }),
              bouton({ libelle: 'Rejeter', variante: 'ghost', motif, onClick: () => dialogueRejet(d) }),
            ]),
          ];
        }),
        vide: etatVide({ titre: 'Aucune décision en attente', message: 'Les demandes de suspension et de réactivation apparaîtront ici.' }),
      })],
    }),
    carte({
      titre: 'Annuaire des entreprises',
      sousTitre: 'Consultez, corrigez et, si nécessaire, suspendez une entreprise inscrite.',
      actions: [bouton({ libelle: 'Exporter la liste (CSV)', variante: 'secondary', icone: 'download', motif: droitExport.autorise ? null : droitExport.explication, onClick: exporter })],
      corps: [el('div.declarations-toolbar', {}, [recherche, filtre]), compteur, grille],
    }),
    decisions.some((d) => d.etat !== 'en_attente') ? carte({
      titre: 'Décisions traitées',
      corps: [tableau({
        colonnes: ['Entreprise', 'Décision', 'Demandée par', 'Traitée par', 'État', 'Motif'],
        lignes: decisions.filter((d) => d.etat !== 'en_attente').slice(0, 20).map((d) => [
          nomDe(ctx, d.groupementId), labelOf(d.action), nomUtilisateur(d.demandeParUtilisateurId), nomUtilisateur(d.traiteParUtilisateurId),
          badge(d.etat), d.motifRejet ? `${d.motif} — rejet : ${d.motifRejet}` : d.motif,
        ]),
      })],
    }) : null,
  ]);
}
