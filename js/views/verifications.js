/**
 * Écran de l'agent d'activation des inscriptions — correctif anti-fraude n° 3,
 * étendu par le lot b1 à toutes les entreprises inscrites.
 *
 * Deux niveaux :
 * - **la file** des dossiers des types que l'agent traite (affréteurs et
 *   intermédiaires de fret pour l'un, transporteurs pour l'autre) ;
 * - **le dossier** d'une entreprise : identité, pièces à déclarer conformes ou
 *   non conformes, complément, refus, activation, requalification, contact. Pour
 *   un transporteur, le contrôle de ses véhicules et chauffeurs reste ici.
 *
 * Les pièces sont servies par le service de vérification — ni téléphone, ni
 * courriel, ni solde : contrôler un dossier ne demande pas de pouvoir joindre
 * l'entreprise hors plateforme. Le contact passe par la messagerie, à l'adresse
 * enregistrée.
 *
 * @module views/verifications
 */

import { date, dateHeure, el, icone } from '../core/dom.js';
import { afficherErreur, badge, bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { segmentEspace } from '../core/nav.js';
import { decider } from '../domain/access.js';
import { CANAL_MESSAGE, ETAT_INSCRIPTION, ETAT_PIECE, ETAT_VERIFICATION, PIECE_DOSSIER, TYPE_GROUPEMENT, labelOf } from '../domain/enums.js';
import { CHAMPS_ENTREPRISE, TYPES_INSCRIPTION, typesTraitesPar } from '../domain/inscription.js';
import { refDe, nomUtilisateur } from './_donnees.js';
import { taille } from './dossier.js';
import * as verification from '../services/verification.service.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/**
 * @param {any} ctx
 * @param {Record<string, string>} [params] `id` : dossier ouvert.
 */
export function verifications(ctx, params = {}) {
  if (params.id) return ficheEntreprise(ctx, params.id);
  return file(ctx);
}

/* ================================================================== *
 * La file des dossiers
 * ================================================================== */

function file(ctx) {
  const dossiers = verification.dossiersInscription(ctx);
  const types = typesTraitesPar(ctx.roleId);
  const corps = el('div');
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });
  const recherche = el('input', { type: 'search', placeholder: 'Raison sociale, RCCM, code…', 'aria-label': 'Rechercher un dossier', on: { input: rendre } });
  const filtreType = el('select', { 'aria-label': 'Filtrer par type', on: { change: rendre } }, [
    el('option', { value: '', text: 'Tous les types' }),
    ...types.map((t) => el('option', { value: t, text: labelOf(t) })),
  ]);
  const filtreEtat = el('select', { 'aria-label': 'Filtrer par état', on: { change: rendre } }, [
    el('option', { value: 'a_traiter', text: 'À traiter' }),
    el('option', { value: '', text: 'Tous les dossiers' }),
    ...Object.values(ETAT_INSCRIPTION).map((e) => el('option', { value: e, text: labelOf(e) })),
  ]);

  function rendre() {
    const q = recherche.value.trim().toLocaleLowerCase('fr');
    const visibles = dossiers.filter((d) =>
      (!q || `${d.raisonSociale} ${d.rccm ?? ''} ${d.codeBfci ?? ''}`.toLocaleLowerCase('fr').includes(q))
      && (!filtreType.value || d.type === filtreType.value)
      && (filtreEtat.value === '' || (filtreEtat.value === 'a_traiter' ? d.aTraiter : d.etat === filtreEtat.value)));
    compteur.textContent = `${visibles.length} dossier(s)`;
    corps.replaceChildren(tableau({
      colonnes: ['Entreprise', 'Type', 'Inscrite le', 'État', 'Pièces conformes', 'À faire', ''],
      lignes: visibles.map((d) => [
        el('span.b1-cellule', {}, [el('strong', { text: d.raisonSociale }), el('small', { text: d.codeBfci ?? d.rccm ?? '—' })]),
        labelOf(d.type),
        date(d.inscritLe),
        badge(d.etat),
        `${d.piecesConformes} / ${d.piecesRequises}`,
        d.raison || '—',
        el('a.btn.btn-secondary', { href: `#/${segmentEspace(ctx)}/verifications/${d.id}` }, [icone('file', 16), el('span', { text: 'Ouvrir le dossier' })]),
      ]),
      vide: etatVide({ titre: 'Aucun dossier', message: filtreEtat.value === 'a_traiter' ? 'Aucun dossier n’attend votre contrôle.' : 'Aucun dossier ne correspond à ces critères.' }),
    }));
  }
  rendre();

  return el('div.page.supervision-page', {}, [
    bandeau({
      ton: 'info',
      titre: 'Aucune entreprise n’accède au marché sans contrôle',
      message:
        `Vous traitez les dossiers : ${types.map((t) => labelOf(t)).join(', ')}. Déclarez chaque pièce conforme ou ` +
        'non conforme, demandez un complément si besoin, puis faites activer le compte. La personne qui active ' +
        'n’est pas celle qui a déclaré les pièces conformes.',
    }),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Dossiers à traiter', valeur: dossiers.filter((d) => d.aTraiter).length, icon: 'inbox' }),
      kpi({ libelle: 'Compléments attendus', valeur: dossiers.filter((d) => d.etat === ETAT_INSCRIPTION.A_COMPLETER).length, icon: 'clock' }),
      kpi({ libelle: 'Entreprises activées', valeur: dossiers.filter((d) => d.etat === ETAT_INSCRIPTION.ACTIVEE).length, icon: 'check-circle' }),
    ]),
    carte({
      titre: 'Dossiers d’inscription',
      sousTitre: 'Les dossiers les plus anciens d’abord.',
      corps: [el('div.declarations-toolbar.b1-filtres', {}, [recherche, types.length > 1 ? filtreType : null, filtreEtat]), compteur, corps],
    }),
    decider(ctx, 'groupement.verifier').autorise ? moyensAControler(ctx) : null,
  ]);
}

/**
 * Véhicules et chauffeurs des transporteurs encore à contrôler — correctif
 * anti-fraude n° 3 : un moyen non contrôlé ne peut pas être proposé.
 */
function moyensAControler(ctx) {
  const transporteurs = verification.dossiersTransporteurs(ctx);
  const lignes = transporteurs.flatMap((t) => [
    ...t.vehicules.filter((v) => !v.verifieLe).map((v) => [
      t.raisonSociale, 'Véhicule', v.immatriculation,
      `Carte grise ${v.carteGrise ?? 'non renseignée'} · carte de transport ${v.carteTransportNumero}, échéance ${date(v.carteTransportEcheance)}`,
      bouton({ libelle: 'Attester le contrôle', variante: 'secondary', onClick: () => agir(() => verification.verifierVehicule(ctx, v.id), 'Véhicule contrôlé.') }),
    ]),
    ...t.chauffeurs.filter((c) => !c.verifieLe).map((c) => [
      t.raisonSociale, 'Chauffeur', c.nom,
      `Permis ${c.permisNumero}${c.permisEcheance ? `, valable jusqu’au ${date(c.permisEcheance)}` : ''}`,
      bouton({ libelle: 'Attester le contrôle', variante: 'secondary', onClick: () => agir(() => verification.verifierChauffeur(ctx, c.id), 'Chauffeur contrôlé.') }),
    ]),
  ]);
  return carte({
    titre: 'Véhicules et chauffeurs à contrôler',
    sousTitre: 'Carte grise et carte de transport de chaque véhicule, permis de chaque chauffeur.',
    corps: [tableau({
      colonnes: ['Transporteur', 'Moyen', 'Identification', 'Pièces', ''],
      lignes,
      vide: etatVide({ titre: 'Rien à contrôler', message: 'Tous les véhicules et chauffeurs déclarés ont été contrôlés.' }),
    })],
  });
}

/* ================================================================== *
 * Le dossier d'une entreprise
 * ================================================================== */

function ficheEntreprise(ctx, id) {
  const d = verification.dossierInscription(ctx, id);
  const g = d.groupement;
  const courantes = new Map(d.pieces.filter((p) => p.etat !== ETAT_PIECE.REMPLACEE).map((p) => [p.typePiece, p]));
  const enExamen = [ETAT_INSCRIPTION.EN_ATTENTE, ETAT_INSCRIPTION.A_COMPLETER].includes(d.etat);
  const activee = d.etat === ETAT_INSCRIPTION.ACTIVEE;
  const champs = [...CHAMPS_ENTREPRISE.filter((c) => c.identite), ...d.type.champs];

  return el('div.page.supervision-page', {}, [
    // Retour à la file, et les actions qui ne décident pas du dossier.
    el('div.b1-barre', {}, [
      el('a', { href: `#/${segmentEspace(ctx)}/verifications` }, [icone('arrow-left', 15), el('span', { text: ' Revenir à la file des dossiers' })]),
      el('div.table-toolbar', {}, [
        d.etat !== ETAT_INSCRIPTION.REFUSEE ? bouton({ libelle: 'Requalifier', variante: 'ghost', icone: 'refresh-cw', onClick: () => dialogueRequalification(ctx, d) }) : null,
        bouton({ libelle: 'Contacter l’entreprise', variante: 'secondary', icone: 'mail', onClick: () => dialogueContact(ctx, d) }),
      ]),
    ]),
    activee
      ? bandeau({ ton: 'ok', titre: 'Compte activé', message: `Activé le ${date(g.activeLe)} — code d’entreprise ${g.codeBfci}.` })
      : d.etat === ETAT_INSCRIPTION.REFUSEE
        ? bandeau({ ton: 'err', titre: 'Inscription refusée', message: g.inscriptionMotif ?? '' })
        : bandeau({
            ton: d.motifActivation ? 'warn' : 'ok',
            titre: d.motifActivation ? 'Activation pas encore possible' : 'Dossier prêt à activer',
            message: d.motifActivation ?? 'Chaque pièce obligatoire est conforme. Activez le compte : le code d’entreprise et la période d’abonnement initiale seront attribués.',
          }),
    carte({
      titre: g.raisonSociale,
      sousTitre: `${d.type.libelle} · inscrite le ${date(g.inscritLe ?? g.creeLe)} · ${d.utilisateurs} utilisateur(s)`,
      // Le bouton d'activation n'apparaît que lorsqu'elle est possible : sinon,
      // le bandeau ci-dessus en donne la raison, pièce par pièce.
      actions: [
        enExamen && !d.motifActivation
          ? bouton({ libelle: 'Activer le compte', variante: 'primary', icone: 'check-circle', onClick: () => dialogueActivation(ctx, d) })
          : null,
        d.etat === ETAT_INSCRIPTION.EN_ATTENTE
          ? bouton({ libelle: 'Demander un complément', icone: 'send', onClick: () => dialogueMotif(ctx, d, 'complement') })
          : null,
        enExamen ? bouton({ libelle: 'Refuser l’inscription', variante: 'ghost', onClick: () => dialogueMotif(ctx, d, 'refus') }) : null,
      ],
      corps: [
        el('div.recap-grid.b1-recap', {}, [
          el('div.recap-item', {}, [el('span', { text: 'État de l’inscription' }), el('strong', {}, [badge(d.etat)])]),
          ...champs.map((c) => el('div.recap-item', {}, [
            el('span', { text: c.libelle }),
            el('strong', { text: c.type === 'select' ? refDe(g[c.nom]) : c.type === 'date' ? (g[c.nom] ? date(g[c.nom]) : '—') : (g[c.nom] ?? '—') }),
          ])),
          el('div.recap-item', {}, [el('span', { text: 'Code d’entreprise' }), el('strong', { text: g.codeBfci ?? 'Attribué à l’activation' })]),
        ]),
      ],
    }),
    d.modificationProposee ? carteModification(ctx, d) : null,
    carte({
      titre: 'Pièces du dossier',
      sousTitre: `Pièces obligatoires conformes : ${d.bilan.conformes.length} / ${d.type.piecesRequises.length}. Seules les caractéristiques des fichiers sont enregistrées dans cette démonstration.`,
      corps: [tableau({
        colonnes: ['Pièce', 'Fichier', 'Numéro et validité', 'Contrôle', 'Motif', ''],
        lignes: d.attendues.map((a) => {
          const p = courantes.get(a.code);
          const decidable = p && p.etat !== ETAT_PIECE.REMPLACEE && d.etat !== ETAT_INSCRIPTION.REFUSEE
            && (!activee || p.etat === ETAT_PIECE.DEPOSEE);
          return [
            el('span.b1-cellule', {}, [el('strong', { text: a.libelle }), el('small', { text: a.requise ? 'Obligatoire' : 'Facultative' })]),
            p ? el('span.b1-cellule', {}, [el('span', { text: p.fichier?.nom ?? '—' }), el('small', { text: `${taille(p.fichier?.taille)} · déposée le ${date(p.deposeLe)}` })]) : 'Non déposée',
            p ? el('span.b1-cellule', {}, [el('span', { text: p.numero ?? '—' }), el('small', { text: p.expireLe ? `Valable jusqu’au ${date(p.expireLe)}` : 'Sans échéance' })]) : '—',
            p ? el('span.b1-cellule', {}, [badge(p.etat), p.decideParUtilisateurId ? el('small', { text: `par ${nomUtilisateur(p.decideParUtilisateurId)}` }) : null]) : el('span.badge.badge-neutral', { text: 'Attendue' }),
            p?.motif ?? '—',
            decidable
              ? el('div.table-toolbar', {}, [
                  p.etat !== ETAT_PIECE.CONFORME ? bouton({ libelle: 'Conforme', variante: 'secondary', icone: 'check', onClick: () => agir(() => verification.deciderPiece(ctx, p.id, { conforme: true }), 'Pièce déclarée conforme.') }) : null,
                  p.etat !== ETAT_PIECE.NON_CONFORME ? bouton({ libelle: 'Non conforme', variante: 'ghost', onClick: () => dialoguePieceNonConforme(ctx, p, a) }) : null,
                ])
              : el('span'),
          ];
        }),
      })],
    }),
    carte({
      titre: 'Échanges avec l’entreprise',
      corps: [d.echanges.length
        ? el('ul.b1-echanges', {}, d.echanges.map((x) => el('li', {}, [
            el('span.b1-cellule', {}, [el('strong', { text: x.auteur === 'oic' ? 'Agent d’activation' : 'Entreprise' }), el('small', { text: dateHeure(x.le) })]),
            el('p', { text: x.texte }),
          ])))
        : etatVide({ titre: 'Aucun échange', message: 'Les compléments demandés et les réponses de l’entreprise apparaîtront ici.' })],
    }),
    // Véhicules et chauffeurs : après l'activation, qui prononce la vérification du dossier.
    activee && g.type === TYPE_GROUPEMENT.TRANSPORTEUR && decider(ctx, 'groupement.verifier').autorise ? blocTransporteur(ctx, id) : null,
  ]);
}

function carteModification(ctx, d) {
  const m = d.modificationProposee;
  const champs = [...CHAMPS_ENTREPRISE, ...d.type.champs];
  const valeur = (c, v) => (c?.type === 'select' ? refDe(v) : c?.type === 'date' ? date(v) : v ?? '—');
  return carte({
    titre: 'Modification d’identité à contrôler',
    sousTitre: `Demandée le ${dateHeure(m.demandeeLe)} par ${nomUtilisateur(m.demandeeParUtilisateurId)}. Les valeurs vérifiées restent en vigueur jusqu’à votre décision.`,
    actions: [
      bouton({ libelle: 'Accepter et appliquer', variante: 'primary', icone: 'check', onClick: () => agir(() => verification.deciderModification(ctx, d.groupement.id, { accepter: true }), 'Modification appliquée.') }),
      bouton({ libelle: 'Refuser', variante: 'ghost', onClick: () => dialogueMotif(ctx, d, 'modification') }),
    ],
    corps: [tableau({
      colonnes: ['Donnée', 'Valeur vérifiée', 'Valeur demandée'],
      lignes: Object.entries(m.champs).map(([n, v]) => {
        const c = champs.find((x) => x.nom === n);
        return [c?.libelle ?? n, valeur(c, d.groupement[n]), valeur(c, v)];
      }),
    })],
  });
}

/* ------------------------------------------------------------------ *
 * Transporteur : vérification du dossier historique, véhicules, chauffeurs
 * (correctif anti-fraude n° 3, inchangé)
 * ------------------------------------------------------------------ */

function blocTransporteur(ctx, id) {
  const t = verification.dossiersTransporteurs(ctx).find((x) => x.id === id);
  if (!t) return null;
  return carte({
    titre: 'Vérification du transporteur, de ses véhicules et chauffeurs',
    sousTitre: 'Tant que son dossier n’est pas vérifié, un transporteur ne publie pas, ne propose pas et n’accepte pas.',
    actions: [
      t.etat !== ETAT_VERIFICATION.VERIFIE
        ? bouton({ libelle: 'Vérifier le dossier', variante: 'primary', icone: 'shield', onClick: () => dialogueVerification(ctx, t) })
        : null,
      bouton({ libelle: t.etat === ETAT_VERIFICATION.VERIFIE ? 'Retirer la vérification' : 'Refuser', variante: 'ghost', onClick: () => dialogueRefus(ctx, t) }),
    ],
    corps: [
      el('div.recap-grid', {}, [
        el('div.recap-item', {}, [el('span', { text: 'Vérification' }), el('strong', {}, [badge(t.etat)])]),
        el('div.recap-item', {}, [el('span', { text: 'Carte de transporteur' }), el('strong', { text: t.carteTransporteurNumero ? `${t.carteTransporteurNumero} — échéance ${date(t.carteTransporteurEcheance)}` : 'Non renseignée' })]),
        t.verifieLe ? el('div.recap-item', {}, [el('span', { text: 'Vérifié le' }), el('strong', { text: date(t.verifieLe) })]) : null,
        t.motif ? el('div.recap-item', {}, [el('span', { text: 'Motif du refus' }), el('strong', { text: t.motif })]) : null,
      ]),
      el('h3', {}, [icone('truck', 18), ' Véhicules — carte grise et carte de transport']),
      tableau({
        colonnes: ['Immatriculation', 'Carte grise', 'Carte de transport', 'Contrôle', ''],
        lignes: t.vehicules.map((v) => [
          v.immatriculation,
          v.carteGrise ?? 'Non renseignée',
          `${v.carteTransportNumero} — échéance ${date(v.carteTransportEcheance)}`,
          v.verifieLe ? el('span.badge.badge-success', { text: `Contrôlé le ${date(v.verifieLe)}` }) : el('span.badge.badge-warning', { text: 'À contrôler' }),
          v.verifieLe ? null : bouton({ libelle: 'Attester le contrôle', variante: 'secondary', onClick: () => agir(() => verification.verifierVehicule(ctx, v.id), 'Véhicule contrôlé.') }),
        ]),
        vide: etatVide({ titre: 'Aucun véhicule', message: 'Ce transporteur n’a pas encore déclaré de véhicule.' }),
      }),
      el('h3', {}, [icone('users', 18), ' Chauffeurs — permis de conduire']),
      tableau({
        colonnes: ['Nom', 'Permis', 'Validité', 'Contrôle', ''],
        lignes: t.chauffeurs.map((c) => [
          c.nom,
          c.permisNumero,
          c.permisEcheance ? date(c.permisEcheance) : '—',
          c.verifieLe ? el('span.badge.badge-success', { text: `Contrôlé le ${date(c.verifieLe)}` }) : el('span.badge.badge-warning', { text: 'À contrôler' }),
          c.verifieLe ? null : bouton({ libelle: 'Attester le contrôle', variante: 'secondary', onClick: () => agir(() => verification.verifierChauffeur(ctx, c.id), 'Chauffeur contrôlé.') }),
        ]),
        vide: etatVide({ titre: 'Aucun chauffeur', message: 'Ce transporteur n’a pas encore déclaré de chauffeur.' }),
      }),
    ],
  });
}

function dialogueVerification(ctx, d) {
  const pieces = Object.values(PIECE_DOSSIER);
  const fermer = modale({
    titre: `Vérifier le dossier — ${d.raisonSociale}`,
    corps: [
      el('p', { text: 'Cochez chaque pièce effectivement contrôlée. Les trois sont exigées : un contrôle partiel n’est pas un contrôle.' }),
      ...pieces.map((p) => el('label.checkbox-row', {}, [el('input', { type: 'checkbox', id: `vp-${p}` }), ` ${labelOf(p)}`])),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Prononcer la vérification',
        variante: 'primary',
        onClick: () => {
          const coches = pieces.filter((p) => document.getElementById(`vp-${p}`)?.checked === true);
          agir(() => verification.verifierTransporteur(ctx, d.id, { pieces: coches }), 'Dossier vérifié.', fermer);
        },
      }),
    ],
  });
}

function dialogueRefus(ctx, d) {
  const fermer = modale({
    titre: `${d.etat === ETAT_VERIFICATION.VERIFIE ? 'Retirer la vérification' : 'Refuser le dossier'} — ${d.raisonSociale}`,
    corps: [
      el('p', { text: 'Le transporteur ne pourra plus publier ni accepter, et ses offres quittent le marché. Le motif lui est communiqué.' }),
      champ({ id: 'vr-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Par exemple : attestation d’assurance expirée.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Confirmer',
        variante: 'primary',
        onClick: () => agir(() => verification.refuserTransporteur(ctx, d.id, document.getElementById('vr-motif')?.value), 'Décision enregistrée.', fermer),
      }),
    ],
  });
}

/* ------------------------------------------------------------------ *
 * Dialogues du lot b1
 * ------------------------------------------------------------------ */

function dialoguePieceNonConforme(ctx, p, attendue) {
  const fermer = modale({
    titre: `Pièce non conforme — ${attendue.libelle}`,
    corps: [
      el('p', { text: 'Le motif est communiqué à l’entreprise dans son dossier. Demandez ensuite un complément pour qu’elle dépose une pièce corrigée.' }),
      champ({ id: 'pnc-motif', label: 'Motif', type: 'textarea', requis: true, aide: 'Par exemple : document illisible, ou numéro différent de celui de la fiche.' }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Déclarer non conforme',
        variante: 'primary',
        onClick: () => agir(() => verification.deciderPiece(ctx, p.id, { conforme: false, motif: document.getElementById('pnc-motif')?.value }), 'Pièce déclarée non conforme.', fermer),
      }),
    ],
  });
}

function dialogueMotif(ctx, d, nature) {
  const textes = {
    complement: {
      titre: 'Demander un complément',
      intro: 'Le dossier revient à l’entreprise avec votre demande, qui lui est aussi envoyée par message.',
      bouton: 'Envoyer la demande',
      action: (m) => verification.demanderComplement(ctx, d.groupement.id, m),
      ok: 'Complément demandé à l’entreprise.',
    },
    refus: {
      titre: 'Refuser l’inscription',
      intro: 'L’entreprise ne pourra pas accéder au marché. Le motif lui est communiqué. Cette décision est journalisée.',
      bouton: 'Refuser l’inscription',
      action: (m) => verification.refuserInscription(ctx, d.groupement.id, m),
      ok: 'Inscription refusée.',
    },
    modification: {
      titre: 'Refuser la modification',
      intro: 'Les valeurs vérifiées restent en vigueur. Le motif est communiqué à l’entreprise.',
      bouton: 'Refuser la modification',
      action: (m) => verification.deciderModification(ctx, d.groupement.id, { accepter: false, motif: m }),
      ok: 'Modification refusée.',
    },
  }[nature];
  const fermer = modale({
    titre: `${textes.titre} — ${d.groupement.raisonSociale}`,
    corps: [el('p', { text: textes.intro }), champ({ id: 'dm-motif', label: 'Motif', type: 'textarea', requis: true, attrs: { maxlength: 500 } })],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({ libelle: textes.bouton, variante: 'primary', onClick: () => agir(() => textes.action(document.getElementById('dm-motif')?.value), textes.ok, fermer) }),
    ],
  });
}

function dialogueActivation(ctx, d) {
  const fermer = modale({
    titre: `Activer le compte — ${d.groupement.raisonSociale}`,
    corps: [
      el('p', { text: 'L’activation ouvre à l’entreprise l’ensemble des services de la plateforme. Elle attribue :' }),
      el('ul', {}, [
        el('li', { text: 'un code d’entreprise (code BFCI) ;' }),
        el('li', { text: 'une période d’abonnement initiale d’un an, au tarif du catalogue en vigueur ;' }),
        d.type.type === TYPE_GROUPEMENT.TRANSPORTEUR
          ? el('li', { text: 'la vérification du dossier transporteur (RCCM, carte de transporteur, assurance) ;' })
          : el('li', { text: 'la vérification de son dossier, dont héritent ses entités rattachées ;' }), // Intégration b1 / b2
        el('li', { text: 'un message d’activation par courriel et SMS (envoi simulé).' }),
      ]),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({ libelle: 'Activer le compte', variante: 'primary', icone: 'check-circle', onClick: () => agir(() => verification.activerEntreprise(ctx, d.groupement.id), 'Compte activé. Le message d’activation est parti.', fermer) }),
    ],
  });
}

function dialogueRequalification(ctx, d) {
  const autres = TYPES_INSCRIPTION.filter((t) => t.type !== d.type.type);
  const zoneChamps = el('div.field-row.form-grid');
  const choix = champ({
    id: 'rq-type', label: 'Nouveau type', requis: true,
    options: autres.map((t) => ({ valeur: t.type, libelle: t.libelle })),
  });
  const afficherChamps = () => {
    const t = autres.find((x) => x.type === choix.querySelector('select').value);
    zoneChamps.replaceChildren(...(t?.champs ?? []).map((c) => champ({
      id: `rq-${c.nom}`, label: c.libelle, type: c.type ?? 'text', requis: c.requis,
      valeur: c.type === 'date' ? String(d.groupement[c.nom] ?? '').slice(0, 10) : d.groupement[c.nom],
      attrs: { name: c.nom, maxlength: c.max },
    })));
  };
  choix.querySelector('select').addEventListener('change', afficherChamps);
  const fermer = modale({
    titre: `Requalifier — ${d.groupement.raisonSociale}`,
    corps: [
      el('p', { text: `Type actuel : ${d.type.libelle}. Les comptes de l’entreprise prennent les droits du nouveau type ; les pièces demandées changent en conséquence.` }),
      choix,
      zoneChamps,
      champ({ id: 'rq-motif', label: 'Motif', type: 'textarea', requis: true, attrs: { maxlength: 500 } }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Requalifier',
        variante: 'primary',
        icone: 'refresh-cw',
        onClick: () => {
          const type = choix.querySelector('select').value;
          const champs = Object.fromEntries([...zoneChamps.querySelectorAll('input')].map((i) => [i.name, i.value]));
          agir(() => verification.requalifierEntreprise(ctx, d.groupement.id, { type, motif: document.getElementById('rq-motif')?.value, champs }), 'Entreprise requalifiée.', fermer);
        },
      }),
    ],
  });
}

function dialogueContact(ctx, d) {
  const fermer = modale({
    titre: `Contacter — ${d.groupement.raisonSociale}`,
    corps: [
      el('p', { text: 'Le message part à l’adresse enregistrée de chaque utilisateur de l’entreprise. Vous ne voyez pas ses coordonnées. Envoi simulé.' }),
      el('label.checkbox-row', {}, [el('input', { type: 'checkbox', id: 'ct-sms' }), el('span.label-body', {}, [el('strong', { text: 'Envoyer aussi par SMS' }), el('span', { text: 'Au numéro mobile enregistré — texte abrégé.' })])]),
      champ({ id: 'ct-objet', label: 'Objet', requis: true, attrs: { maxlength: 160 } }),
      champ({ id: 'ct-corps', label: 'Message', type: 'textarea', requis: true, attrs: { maxlength: 2000, rows: 5 } }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Envoyer',
        variante: 'primary',
        icone: 'send',
        onClick: () => agir(() => verification.contacterEntreprise(ctx, d.groupement.id, {
          objet: document.getElementById('ct-objet')?.value,
          corps: document.getElementById('ct-corps')?.value,
          canaux: [CANAL_MESSAGE.COURRIEL, ...(document.getElementById('ct-sms')?.checked ? [CANAL_MESSAGE.SMS] : [])],
        }), 'Message envoyé (envoi simulé).', fermer),
      }),
    ],
  });
}

function agir(action, message, fermer = null) {
  try {
    action();
    fermer?.();
    toast(message);
    rafraichir();
  } catch (e) {
    afficherErreur(e);
  }
}
