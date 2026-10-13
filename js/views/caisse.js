/**
 * Caisse de l'exploitant et états financiers.
 *
 * Lot b4. Trois écrans :
 * - **Caisse** (`caisse.encaisser`) — encaissement au guichet d'un réabonnement,
 *   d'un rechargement ou du règlement d'un contentieux ; reçu imprimable ;
 * - **Encaissements à valider** (`caisse.valider`) — le second agent rapproche et
 *   valide, ou rejette avec motif ; on ne valide jamais sa propre saisie ;
 * - **États et exports** (`rapport.financier`) — paiements, abonnements et dépôts
 *   par période, mode, objet et canal ; export CSV et PDF. Partagé par
 *   l'exploitant et le superviseur comptabilité, qui reçoit les montants sans
 *   l'identité des entreprises.
 *
 * @module views/caisse
 */

import { date, dateHeure, el, montant } from '../core/dom.js';
import { afficherErreur, bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import {
  CANAL_PAIEMENT,
  ETAT_PAIEMENT,
  MODES_PAR_CANAL,
  MODE_PAIEMENT,
  OBJET_PAIEMENT,
  libelleFinance,
} from '../domain/finances.js';
import { segmentEspace } from '../core/nav.js';
import { formulesAbonnement } from '../services/abonnement.service.js';
import {
  clientsGuichet,
  contentieuxReglables,
  encaisser,
  encaissements as listeEncaissements,
  encaissementsEnAttente,
  rejeterEncaissement,
  syntheseDuJour,
  validerEncaissement,
} from '../services/caisse.service.js';
import { etatFinancier, exporterCsv, periodeParDefaut } from '../services/rapport-financier.service.js';
import { editerEtatPdf } from '../services/recu.service.js';
import { nomUtilisateur } from './_donnees.js';
import { agir, boutonRecu, pastille, rafraichir, recap, telechargerTexte, valeur } from './_finances-ui.js';

const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const options = (valeurs) => valeurs.map((v) => ({ valeur: v, libelle: libelleFinance(v) }));

/* ================================================================== *
 * Caisse — encaissement au guichet
 * ================================================================== */

/** @param {any} ctx */
export function caisse(ctx) {
  const jour = syntheseDuJour(ctx);
  const attente = encaissementsEnAttente(ctx);

  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Encaissement au guichet — principe des quatre yeux',
      message:
        'Votre saisie émet le reçu à remettre au client, mais ne produit encore aucun effet : le compte n’est ' +
        'crédité, l’abonnement prolongé ou le règlement imputé qu’après la validation d’un second agent, ' +
        'qui rapproche la saisie de la caisse ou du relevé. Le prix d’un réabonnement est celui du catalogue.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Encaissements du jour', valeur: jour.nombre, icon: 'receipt' }),
      kpi({ libelle: 'Montant saisi aujourd’hui', valeur: montant(jour.montantSaisi) }),
      kpi({ libelle: 'Montant validé aujourd’hui', valeur: montant(jour.montantValide), icon: 'check-circle' }),
      kpi({ libelle: 'En attente de validation', valeur: attente.length, icon: 'clock', ton: attente.length ? 'warn' : undefined }),
    ]),
    carte({
      titre: 'Nouvel encaissement',
      sousTitre: 'Client, objet, mode de règlement et pièce. Les espèces ne demandent pas de référence.',
      corps: [formulaireEncaissement(ctx)],
    }),
    carte({
      titre: 'Encaissements du jour',
      actions: decider(ctx, 'caisse.valider').autorise
        ? [el('a.btn.btn-secondary', { href: `#/${segmentEspace(ctx)}/encaissements`, text: 'Encaissements à valider' })]
        : [],
      corps: [
        tableau({
          colonnes: ['N° de reçu', 'Heure', 'Client', 'Objet', 'Mode', 'Montant', 'État', 'Saisi par', ''],
          lignes: jour.liste.map((p) => [
            p.numero,
            heure(p.saisiLe),
            p.client ?? '—',
            libelleFinance(p.objet),
            libelleFinance(p.mode),
            montant(p.montant),
            pastille(p.etat),
            nomUtilisateur(p.saisiParUtilisateurId),
            boutonRecu(ctx, p.id),
          ]),
          vide: etatVide({ titre: 'Aucun encaissement aujourd’hui', message: 'Les encaissements saisis au guichet apparaîtront ici avec leur reçu.' }),
        }),
      ],
    }),
  ]);
}

function formulaireEncaissement(ctx) {
  const clients = clientsGuichet(ctx);
  const formules = formulesAbonnement(ctx);
  const zone = el('div', {});
  const zonePiece = el('div', {});

  const champClient = champ({ id: 'enc-client', label: 'Client', requis: true, options: clients.map((c) => ({ valeur: c.id, libelle: c.nom })) });
  const champObjet = champ({ id: 'enc-objet', label: 'Objet', requis: true, options: options(Object.values(OBJET_PAIEMENT)) });
  const champMode = champ({ id: 'enc-mode', label: 'Mode de règlement', requis: true, options: options(MODES_PAR_CANAL[CANAL_PAIEMENT.GUICHET]) });

  const rendreObjet = () => {
    const objet = valeur('enc-objet');
    const client = valeur('enc-client');
    if (objet === OBJET_PAIEMENT.ABONNEMENT) {
      zone.replaceChildren(
        el('div.field-row', {}, [
          champ({
            id: 'enc-formule',
            label: 'Formule',
            requis: true,
            valeur: formules[0]?.id,
            options: formules.map((f) => ({ valeur: f.id, libelle: `${f.libelle} — ${f.dureeMois} mois — ${montant(f.montant)}` })),
            aide: 'Le montant est celui du catalogue : il ne se saisit pas.',
          }),
        ]),
      );
    } else if (objet === OBJET_PAIEMENT.CONTENTIEUX) {
      const dossiers = client ? contentieuxReglables(ctx, client) : [];
      zone.replaceChildren(
        el('div.field-row', {}, [
          champ({
            id: 'enc-contentieux',
            label: 'Contentieux réglé',
            requis: true,
            options: dossiers.map((c) => ({ valeur: c.id, libelle: `${c.reference} — reste dû ${montant(c.restant)}` })),
            aide: client ? (dossiers.length ? 'Seuls les dossiers en cours avec un reste dû sont proposés.' : 'Ce client n’a aucun contentieux en cours à régler.') : 'Choisissez d’abord le client.',
          }),
          champ({ id: 'enc-montant', label: 'Montant encaissé (F CFA)', type: 'number', requis: true, attrs: { min: '1', step: '1' } }),
        ]),
      );
    } else if (objet === OBJET_PAIEMENT.RECHARGEMENT) {
      zone.replaceChildren(
        el('div.field-row', {}, [
          champ({
            id: 'enc-montant',
            label: 'Montant encaissé (F CFA)',
            type: 'number',
            requis: true,
            attrs: { min: '1', step: '1' },
            aide: 'Le crédit est saisi en même temps ; il apparaît aussi dans « Crédits à valider ».',
          }),
        ]),
      );
    } else {
      zone.replaceChildren();
    }
  };
  const rendrePiece = () => {
    const mode = valeur('enc-mode');
    zonePiece.hidden = !mode || mode === MODE_PAIEMENT.ESPECES;
  };
  champClient.querySelector('select')?.addEventListener('change', rendreObjet);
  champObjet.querySelector('select')?.addEventListener('change', rendreObjet);
  champMode.querySelector('select')?.addEventListener('change', rendrePiece);
  zonePiece.append(
    champ({ id: 'enc-piece', label: 'Référence de la pièce', requis: true, aide: 'Numéro du chèque, du virement ou de la transaction mobile money.' }),
  );
  zonePiece.hidden = true;

  const enregistrer = () => {
    try {
      const objet = valeur('enc-objet');
      const p = encaisser(ctx, {
        groupementId: valeur('enc-client'),
        objet,
        mode: valeur('enc-mode'),
        tarifId: objet === OBJET_PAIEMENT.ABONNEMENT ? valeur('enc-formule') : undefined,
        contentieuxId: objet === OBJET_PAIEMENT.CONTENTIEUX ? valeur('enc-contentieux') : undefined,
        montant: objet === OBJET_PAIEMENT.ABONNEMENT ? undefined : Number(valeur('enc-montant')),
        referencePiece: valeur('enc-piece'),
        numeroPayeur: valeur('enc-payeur'),
      });
      const fermer = modale({
        titre: `Encaissement ${p.numero} enregistré`,
        corps: [
          bandeau({ ton: 'ok', message: 'Remettez le reçu au client. L’encaissement produira son effet après la validation d’un second agent.' }),
          recap([
            ['Reçu n°', p.numero],
            ['Objet', p.detail],
            ['Mode', libelleFinance(p.mode)],
            ['Montant', montant(p.montant)],
            ['État', pastille(p.etat)],
          ]),
        ],
        actions: [boutonRecu(ctx, p.id, 'Imprimer le reçu'), bouton({ libelle: 'Fermer', variante: 'primary', onClick: () => fermer() })],
        surFermeture: rafraichir,
      });
    } catch (e) {
      afficherErreur(e);
    }
  };

  return el('div.b4-formulaire', {}, [
    el('div.field-row', {}, [champClient, champObjet]),
    zone,
    el('div.field-row', {}, [
      champMode,
      champ({ id: 'enc-payeur', label: 'Téléphone du payeur (facultatif)', type: 'tel', attrs: { inputmode: 'tel', placeholder: '07 00 00 00 00' } }),
    ]),
    zonePiece,
    el('div.table-toolbar', {}, [bouton({ libelle: 'Enregistrer l’encaissement', variante: 'primary', icone: 'receipt', onClick: enregistrer })]),
  ]);
}

/* ================================================================== *
 * Encaissements à valider
 * ================================================================== */

const EFFETS = {
  [OBJET_PAIEMENT.ABONNEMENT]: (p) => `L’abonnement du client sera prolongé de ${p.dureeMois} mois, au prix de la saisie.`,
  [OBJET_PAIEMENT.RECHARGEMENT]: (p) => `Le compte du client sera crédité de ${montant(p.montant)}.`,
  [OBJET_PAIEMENT.CONTENTIEUX]: (p) => `Le règlement sera imputé au dossier : ${p.detail}.`,
};

/** @param {any} ctx */
export function encaissements(ctx) {
  const tous = listeEncaissements(ctx, { canal: CANAL_PAIEMENT.GUICHET });
  const enAttente = tous.filter((p) => p.etat === ETAT_PAIEMENT.EN_ATTENTE);
  const traites = tous.filter((p) => p.etat !== ETAT_PAIEMENT.EN_ATTENTE).slice(0, 20);
  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Principe des quatre yeux',
      message:
        'Vous validez les encaissements saisis par un autre agent, après les avoir rapprochés de la caisse, du ' +
        'chèque ou du relevé. Seule la validation crédite un compte, prolonge un abonnement ou impute un règlement.',
    }),
    carte({
      titre: 'Encaissements en attente de validation',
      corps: [
        tableau({
          colonnes: ['N° de reçu', 'Client', 'Objet', 'Mode et pièce', 'Montant', 'Saisi par', 'Saisi le', ''],
          lignes: enAttente.map((p) => {
            const soi = p.saisiParUtilisateurId === ctx.utilisateurId;
            const motif = soi ? 'Vous avez saisi cet encaissement : sa validation revient à une autre personne.' : null;
            return [
              p.numero,
              p.client ?? '—',
              p.detail,
              `${libelleFinance(p.mode)}${p.referenceTransaction ? ` · ${p.referenceTransaction}` : ''}`,
              montant(p.montant),
              nomUtilisateur(p.saisiParUtilisateurId),
              dateHeure(p.saisiLe),
              el('div.table-toolbar', {}, [
                bouton({ libelle: 'Valider', variante: 'primary', motif, onClick: () => dialogueValidation(ctx, p) }),
                // Le motif du refus est dit une fois, sous « Valider ».
                soi ? null : bouton({ libelle: 'Rejeter', variante: 'ghost', onClick: () => dialogueRejet(ctx, p) }),
              ]),
            ];
          }),
          vide: etatVide({ titre: 'Aucun encaissement en attente', message: 'Les saisies du guichet apparaîtront ici.' }),
        }),
      ],
    }),
    carte({
      titre: 'Derniers encaissements traités',
      corps: [
        tableau({
          colonnes: ['N° de reçu', 'Client', 'Objet', 'Montant', 'Saisi par', 'Traité par', 'État', ''],
          lignes: traites.map((p) => [
            p.numero,
            p.client ?? '—',
            libelleFinance(p.objet),
            montant(p.montant),
            nomUtilisateur(p.saisiParUtilisateurId),
            nomUtilisateur(p.valideParUtilisateurId),
            el('span', {}, [pastille(p.etat), p.motifRejet ? el('small', { text: ` ${p.motifRejet}` }) : null]),
            boutonRecu(ctx, p.id),
          ]),
          vide: etatVide({ titre: 'Aucun encaissement traité', message: 'L’historique des validations apparaîtra ici.' }),
        }),
      ],
    }),
  ]);
}

function dialogueValidation(ctx, p) {
  const fermer = modale({
    titre: `Valider l’encaissement ${p.numero}`,
    corps: [
      recap([
        ['Client', p.client ?? '—'],
        ['Objet', p.detail],
        ['Montant', montant(p.montant)],
        ['Mode', `${libelleFinance(p.mode)}${p.referenceTransaction ? ` · ${p.referenceTransaction}` : ''}`],
        ['Saisi par', nomUtilisateur(p.saisiParUtilisateurId)],
      ]),
      el('p', { text: EFFETS[p.objet](p) }),
      el('label.checkbox-row', {}, [
        el('input', { type: 'checkbox', id: 'ev-rappro' }),
        ' J’ai rapproché cet encaissement de la caisse ou du relevé : même montant, même pièce.',
      ]),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Valider l’encaissement',
        variante: 'primary',
        onClick: () =>
          agir(
            () => validerEncaissement(ctx, p.id, { rapprochementConfirme: document.getElementById('ev-rappro')?.checked === true }),
            'Encaissement validé : son effet est appliqué.',
            fermer,
          ),
      }),
    ],
  });
}

function dialogueRejet(ctx, p) {
  const fermer = modale({
    titre: `Rejeter l’encaissement ${p.numero}`,
    corps: [
      el('p', { text: 'Rien n’est crédité ni prolongé. Le client est prévenu que son encaissement n’a pas été validé.' }),
      champ({ id: 'er-motif', label: 'Motif du rejet', type: 'textarea', requis: true, aide: 'Par exemple : montant absent de la caisse, chèque sans provision.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({ libelle: 'Rejeter', variante: 'primary', onClick: () => agir(() => rejeterEncaissement(ctx, p.id, valeur('er-motif')), 'Encaissement rejeté.', fermer) }),
    ],
  });
}

/* ================================================================== *
 * États financiers et exports
 * ================================================================== */

/** Critères de l'état, conservés le temps de la session. */
let criteres = null;

/** @param {any} ctx */
export function etatsFinanciers(ctx) {
  criteres ??= { ...periodeParDefaut(), mode: '', objet: '', canal: '' };
  const page = el('div.page.supervision-page', {});

  const rendre = () => {
    let etat;
    try {
      etat = etatFinancier(ctx, criteres);
    } catch (e) {
      afficherErreur(e);
      criteres = { ...periodeParDefaut(), mode: '', objet: '', canal: '' };
      etat = etatFinancier(ctx, criteres);
    }
    const t = etat.totaux;
    page.replaceChildren(
      ...[
      etat.identiteVisible
        ? null
        : bandeau({
            ton: 'info',
            titre: 'Montants sans identité',
            message:
              'Votre profil reçoit les montants, les numéros de reçu et les modes de paiement, mais pas l’identité ' +
              'des entreprises : la colonne « Client » reste vide, y compris dans les exports.',
          }),
      carte({ titre: 'Période et critères', corps: [formulaireCriteres(ctx, etat, rendre)] }),
      el('div.kpi-grid', {}, [
        kpi({ libelle: 'Total encaissé', valeur: montant(t.encaisse) }),
        kpi({ libelle: 'Paiements encaissés', valeur: t.nombre, icon: 'receipt' }),
        kpi({ libelle: 'Abonnements', valeur: montant(t.abonnements), icon: 'calendar' }),
        kpi({ libelle: 'Dépôts (rechargements)', valeur: montant(t.depots) }),
        kpi({ libelle: 'Règlements de contentieux', valeur: montant(t.contentieux), icon: 'scale' }),
        kpi({ libelle: 'En attente de validation', valeur: montant(t.enAttente), icon: 'clock', note: `${t.nombreEnAttente} encaissement(s)` }),
      ]),
      el('div.b4-deux-colonnes', {}, [
        carte({
          titre: 'Par mode de paiement',
          corps: [
            tableau({
              colonnes: ['Mode', 'Nombre', 'Montant'],
              lignes: etat.parMode.map((m) => [libelleFinance(m.valeur), m.nombre, montant(m.montant)]),
              vide: 'Aucun paiement encaissé sur la période.',
            }),
          ],
        }),
        carte({
          titre: 'Par objet et par canal',
          corps: [
            tableau({
              colonnes: ['Répartition', 'Nombre', 'Montant'],
              lignes: [...etat.parObjet, ...etat.parCanal].map((m) => [libelleFinance(m.valeur), m.nombre, montant(m.montant)]),
              vide: 'Aucun paiement encaissé sur la période.',
            }),
          ],
        }),
      ]),
      carte({
        titre: 'Mouvements des comptes prépayés',
        sousTitre: 'Totaux de la période, toutes entreprises confondues.',
        corps: [
          recap([
            ['Crédits (rechargements)', montant(etat.comptes.credits)],
            ['Frais de mise en relation débités', montant(etat.comptes.fraisMiseEnRelation)],
            ['Abonnements débités du compte', montant(etat.comptes.abonnementsDebites)],
          ]),
        ],
      }),
      carte({
        titre: 'Détail des paiements',
        sousTitre: `${etat.lignes.length} paiement(s) du ${date(etat.filtres.du)} au ${date(etat.filtres.au)}`,
        corps: [
          tableau({
            colonnes: ['N° de reçu', 'Date', 'Client', 'Objet', 'Canal', 'Mode', 'Montant', 'État'],
            lignes: etat.lignes.map((l) => [
              l.numero,
              dateHeure(l.date),
              etat.identiteVisible ? (l.client ?? '—') : 'Non communiqué',
              libelleFinance(l.objet),
              libelleFinance(l.canal),
              libelleFinance(l.mode),
              montant(l.montant),
              pastille(l.etat),
            ]),
            vide: etatVide({ titre: 'Aucun paiement', message: 'Aucun paiement ne correspond à la période et aux critères choisis.' }),
          }),
        ],
      })
      ].filter(Boolean)
    );
  };
  rendre();
  return page;
}

function formulaireCriteres(ctx, etat, rendre) {
  const f = etat.filtres;
  const tous = (libelle, valeurs) => [{ valeur: '', libelle }, ...options(valeurs)];
  const choix = (id, label, liste, actuel) => {
    const c = champ({ id, label, options: liste.slice(1), valeur: actuel });
    // L'option vide de `champ()` devient « Tous » : un critère non choisi n'en est pas un.
    const vide = c.querySelector('option[value=""]');
    if (vide) vide.textContent = liste[0].libelle;
    return c;
  };
  const appliquer = () => {
    criteres = {
      du: valeur('ef-du'),
      au: valeur('ef-au'),
      mode: valeur('ef-mode'),
      objet: valeur('ef-objet'),
      canal: valeur('ef-canal'),
    };
    rendre();
  };
  const auteur = nomUtilisateur(ctx.utilisateurId);
  return el('div.b4-formulaire', {}, [
    el('div.field-row', {}, [
      champ({ id: 'ef-du', label: 'Du', type: 'date', valeur: f.du, requis: true }),
      champ({ id: 'ef-au', label: 'Au', type: 'date', valeur: f.au, requis: true }),
      choix('ef-mode', 'Mode de paiement', tous('Tous les modes', Object.values(MODE_PAIEMENT)), f.mode),
      choix('ef-objet', 'Objet', tous('Tous les objets', Object.values(OBJET_PAIEMENT)), f.objet),
      choix('ef-canal', 'Canal', tous('Tous les canaux', Object.values(CANAL_PAIEMENT)), f.canal),
    ]),
    el('div.table-toolbar', {}, [
      bouton({ libelle: 'Afficher l’état', variante: 'primary', icone: 'search', onClick: appliquer }),
      bouton({
        libelle: 'Exporter en CSV',
        icone: 'file-spreadsheet',
        onClick: () => {
          try {
            appliquer();
            const { nomFichier, contenu } = exporterCsv(ctx, criteres);
            telechargerTexte(nomFichier, contenu);
            toast('Export CSV téléchargé. Il est inscrit au journal d’audit.');
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
      bouton({
        libelle: 'Exporter en PDF',
        icone: 'download',
        onClick: async () => {
          try {
            appliquer();
            await editerEtatPdf(ctx, criteres, auteur);
            toast('État PDF téléchargé. Il est inscrit au journal d’audit.');
          } catch (e) {
            afficherErreur(e);
          }
        },
      }),
    ]),
  ]);
}

/* ================================================================== *
 * Accueil des profils de back-office ouverts par le lot b4
 * ================================================================== */

/**
 * Bandeau d'accueil d'un profil de niveau 3 auquel le lot b4 ouvre un écran,
 * ou `null`. Appelé par l'accueil minimal (`commun.accueilMinimal`).
 * @param {any} ctx
 */
export function bandeauAccueilFinances(ctx) {
  const espace = segmentEspace(ctx);
  if (decider(ctx, 'contentieux.gerer').autorise) {
    return bandeau({
      ton: 'info',
      titre: 'Votre espace contentieux',
      message:
        'Ouvrez un dossier de litige ou d’impayé, versez-y les pièces, faites-le avancer d’étape en étape jusqu’à sa ' +
        'clôture. Chaque pas est daté, signé et inscrit au journal d’audit. Les règlements passent par la caisse.',
      actions: [el('a.btn.btn-primary', { href: `#/${espace}/contentieux`, text: 'Ouvrir les contentieux' })],
    });
  }
  if (decider(ctx, 'rapport.financier').autorise) {
    return bandeau({
      ton: 'info',
      titre: 'Votre espace des états financiers',
      message:
        'Consultez les paiements, abonnements et dépôts par période et par mode de paiement, et exportez-les en CSV ' +
        'ou en PDF. Votre profil reçoit les montants, pas l’identité des entreprises.',
      actions: [el('a.btn.btn-primary', { href: `#/${espace}/etats-financiers`, text: 'Ouvrir les états' })],
    });
  }
  return null;
}
