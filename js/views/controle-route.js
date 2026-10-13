/**
 * Contrôle sur route (lot b3) : vérifier une attestation, retrouver ses contrôles,
 * et la page publique ouverte par le QR code.
 *
 * L'écran montre le verdict d'abord — authentique et valide, expirée, annulée,
 * ou code inconnu — puis le strict nécessaire au contrôle : référence,
 * immatriculation, trajet, dates, état de la carte de transport. **Aucune
 * coordonnée des parties** : le service ne les sert pas.
 *
 * @module views/controle-route
 */

import { dateHeure, date, el, icone } from '../core/dom.js';
import { bandeau, bouton, carte, champ, etatVide, kpi, modale, tableau, toast } from '../core/ui.js';
import { menuPublic } from '../core/menu-public.js';
import { segmentEspace } from '../core/nav.js';
import { MODE_CONTROLE, RESULTAT_CONTROLE, labelOf } from '../domain/enums.js';
import { mesControles, verifierAttestation, verifierPublic } from '../services/controle-route.service.js';

/** Présentation d'un verdict : ton du bandeau, icône, titre et explication. */
const VERDICTS = Object.freeze({
  [RESULTAT_CONTROLE.VALIDE]: {
    ton: 'ok', icone: 'shield-check', badge: 'success',
    titre: 'Attestation authentique et en vigueur',
    texte: 'Ce transport a été conclu sur la Bourse de fret. Vérifiez que l’immatriculation et le trajet correspondent au véhicule contrôlé.',
  },
  [RESULTAT_CONTROLE.EXPIREE]: {
    ton: 'warn', icone: 'shield-alert', badge: 'warning',
    titre: 'Attestation authentique mais expirée',
    texte: 'Le document a bien été émis par la plateforme, mais sa période de validité est terminée.',
  },
  [RESULTAT_CONTROLE.ANNULEE]: {
    ton: 'err', icone: 'shield-x', badge: 'error',
    titre: 'Attestation annulée',
    texte: 'Le document a été émis puis annulé par le transporteur : il ne couvre plus ce transport.',
  },
  [RESULTAT_CONTROLE.INCONNUE]: {
    ton: 'err', icone: 'shield-x', badge: 'error',
    titre: 'Code inconnu',
    texte: 'Aucune attestation ne porte ce code. Vérifiez la saisie ; si le code est exact, le document n’a pas été émis par la plateforme.',
  },
});

const CARTE_TRANSPORT = Object.freeze({ valide: 'En cours de validité', expiree: 'Expirée', inconnue: 'Non vérifiable' });

/** Badge d'un verdict. */
export function badgeResultat(resultat) {
  const v = VERDICTS[resultat] ?? VERDICTS[RESULTAT_CONTROLE.INCONNUE];
  return el('span', { class: `badge badge-${v.badge}` }, [icone(v.icone, 13), el('span', { text: labelOf(resultat) })]);
}

/** Bloc de résultat — partagé par l'écran de l'agent et la page publique. */
function resultat(verif) {
  const v = VERDICTS[verif.resultat];
  const f = verif.fiche;
  return el('div.controle-resultat', { 'aria-live': 'polite' }, [
    el('div', { class: `controle-verdict is-${v.badge}` }, [
      el('span.controle-verdict-icone', { 'aria-hidden': 'true' }, [icone(v.icone, 34)]),
      el('div', {}, [el('strong', { text: v.titre }), el('p', { text: verif.codeLisible || verif.resultat !== RESULTAT_CONTROLE.INCONNUE ? v.texte : 'Le code saisi n’a pas la forme attendue : six groupes de quatre caractères.' })]),
    ]),
    f ? el('dl.carrier-details.controle-fiche', {}, [
      ligne('file', 'Attestation', f.reference),
      ligne('truck', 'Immatriculation', f.immatriculation),
      ligne('map-pin', 'Trajet', `${f.depart} → ${f.arrivee}`),
      ligne('calendar', 'Départ prévu', dateHeure(f.departPrevu)),
      ligne('calendar', 'Arrivée prévue', dateHeure(f.arriveePrevue)),
      ligne('clock', 'Valable jusqu’au', dateHeure(f.valableJusquau)),
      f.annuleeLe ? ligne('x', 'Annulée le', dateHeure(f.annuleeLe)) : null,
      ligne('shield', 'Carte de transport du véhicule', CARTE_TRANSPORT[f.carteTransport] ?? CARTE_TRANSPORT.inconnue),
    ]) : null,
    el('p.subtitle', {}, [icone('history', 15), ` Vérification enregistrée le ${dateHeure(verif.horodatage)}.`]),
  ]);
}

function ligne(icon, libelle, valeur) {
  return el('div', {}, [el('dt', {}, [icone(icon, 18), libelle]), el('dd', { text: valeur || '—' })]);
}

/** Lecture du QR par la caméra, quand le navigateur sait la faire. */
const cameraDisponible = () =>
  typeof globalThis.BarcodeDetector === 'function' && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

async function scanner(surCode) {
  const detecteur = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
  const flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const video = el('video.controle-video', { playsinline: true, muted: true, 'aria-label': 'Image de la caméra' });
  video.srcObject = flux;
  let actif = true;
  const arreter = () => {
    actif = false;
    flux.getTracks().forEach((t) => t.stop());
  };
  const fermer = modale({
    titre: 'Scanner le QR code',
    corps: [el('p', { text: 'Placez le QR code de l’attestation dans le cadre. La vérification se lance dès qu’il est lu.' }), video],
    actions: [bouton({ libelle: 'Arrêter', onClick: () => fermer() })],
    surFermeture: arreter,
  });
  await video.play();
  const boucle = async () => {
    if (!actif) return;
    try {
      const codes = await detecteur.detect(video);
      if (codes[0]?.rawValue) {
        fermer();
        surCode(codes[0].rawValue);
        return;
      }
    } catch { /* image pas encore prête : on recommence */ }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
}

/**
 * Écran de l'agent : lire un code, voir le verdict.
 * @param {any} ctx
 */
export function controleRoute(ctx) {
  const zone = el('div.controle-zone');
  const formulaire = el('form.flotte-formulaire.controle-formulaire', {}, [
    champ({
      id: 'ctl-code', label: 'Code de vérification', requis: true,
      aide: 'Six groupes de quatre caractères, imprimés sous le QR code. Une douchette de lecture peut aussi remplir ce champ.',
      attrs: { name: 'code', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', maxlength: 400 },
    }),
    el('div.field-row', {}, [
      champ({ id: 'ctl-lieu', label: 'Lieu du contrôle', attrs: { name: 'lieu', maxlength: 120, placeholder: 'Ex. poste de Yamoussoukro nord' } }),
      champ({ id: 'ctl-observation', label: 'Observation', attrs: { name: 'observation', maxlength: 300 } }),
    ]),
    el('div.transport-form-actions', {}, [
      bouton({
        libelle: 'Scanner le QR code', icone: 'scan-line',
        motif: cameraDisponible() ? null : 'La lecture par la caméra n’est pas disponible sur cet appareil : saisissez le code.',
        onClick: () => scanner((brut) => lancer(brut, MODE_CONTROLE.QR)).catch((e) => toast(`Caméra indisponible : ${e.message}`, 'err')),
      }),
      bouton({ libelle: 'Vérifier', icone: 'shield-check', variante: 'primary', type: 'submit' }),
    ]),
  ]);

  function lancer(code, mode) {
    const v = Object.fromEntries(new FormData(formulaire));
    try {
      const verif = verifierAttestation(ctx, code, { mode, lieu: v.lieu, observation: v.observation });
      zone.replaceChildren(resultat(verif));
      zone.querySelector('.controle-verdict')?.setAttribute('tabindex', '-1');
      zone.querySelector('.controle-verdict')?.focus({ preventScroll: false });
    } catch (e) {
      zone.replaceChildren(bandeau({ ton: 'err', message: e.message }));
    }
  }

  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!formulaire.reportValidity()) return;
    lancer(new FormData(formulaire).get('code'), MODE_CONTROLE.SAISIE);
  });

  zone.append(etatVide({
    titre: 'Aucun contrôle en cours',
    message: 'Scannez le QR code de l’attestation ou saisissez son code : le verdict s’affiche ici, et la vérification est enregistrée dans votre historique.',
  }));

  return el('div.page.controle-page', {}, [
    el('div.market-page-heading', {}, [
      el('div', {}, [
        el('span.dash-eyebrow', { text: 'CONTRÔLE SUR ROUTE' }),
        el('h1', { text: 'Vérifier une attestation' }),
        el('p', { text: 'Authenticité, état et strict nécessaire au contrôle : immatriculation, trajet, dates. Les coordonnées des entreprises ne sont jamais affichées.' }),
      ]),
      el('a.btn.btn-secondary', { href: `#/${segmentEspace(ctx)}/controles` }, [icone('history', 17), 'Mes contrôles']),
    ]),
    el('div.controle-grille', {}, [
      carte({ titre: 'Lire le code', sousTitre: 'Chaque vérification est enregistrée, quel qu’en soit le résultat.', corps: [formulaire] }),
      carte({ titre: 'Résultat', corps: [zone] }),
    ]),
  ]);
}

/**
 * Historique des contrôles de l'agent connecté.
 * @param {any} ctx
 */
export function historiqueControles(ctx) {
  const tous = mesControles(ctx);
  let filtre = 'tous';
  const groupes = [
    ['tous', 'Tous', () => true],
    ['valides', 'Valides', (c) => c.resultat === RESULTAT_CONTROLE.VALIDE],
    ['anomalies', 'Anomalies', (c) => c.resultat !== RESULTAT_CONTROLE.VALIDE],
  ];
  const onglets = el('div.declarations-tabs', { role: 'group', 'aria-label': 'Filtrer les contrôles' });
  const corps = el('div');
  const compteur = el('p.declarations-count', { 'aria-live': 'polite' });

  function rendre() {
    onglets.replaceChildren(...groupes.map(([id, libelle, test]) => el('button', {
      type: 'button', 'aria-pressed': String(filtre === id), on: { click: () => { filtre = id; rendre(); } },
    }, [`${libelle} (${tous.filter(test).length})`])));
    const visibles = tous.filter(groupes.find(([id]) => id === filtre)[2]);
    compteur.textContent = `${visibles.length} contrôle${visibles.length > 1 ? 's' : ''}`;
    corps.replaceChildren(tableau({
      titre: 'Mes contrôles',
      colonnes: ['Date et heure', 'Résultat', 'Attestation', 'Immatriculation', 'Lecture', 'Lieu', 'Observation'],
      lignes: visibles.map((c) => [
        dateHeure(c.horodatage),
        badgeResultat(c.resultat),
        c.attestationReference ?? '—',
        c.immatriculation ?? '—',
        labelOf(c.mode),
        c.lieu ?? '—',
        c.observation ?? '—',
      ]),
      vide: etatVide({ titre: 'Aucun contrôle', message: tous.length ? 'Aucun contrôle dans cette catégorie.' : 'Vos vérifications apparaîtront ici, de la plus récente à la plus ancienne.' }),
    }));
  }
  rendre();

  const n = (r) => tous.filter((c) => c.resultat === r).length;
  return el('div.page.controle-page', {}, [
    el('div.market-page-heading', {}, [
      el('div', {}, [
        el('span.dash-eyebrow', { text: 'CONTRÔLE SUR ROUTE' }),
        el('h1', { text: 'Mes contrôles' }),
        el('p', { text: 'Toutes vos vérifications, journalisées une à une. Vous ne voyez que les vôtres.' }),
      ]),
      el('a.btn.btn-primary', { href: `#/${segmentEspace(ctx)}/controle` }, [icone('scan-line', 17), 'Nouveau contrôle']),
    ]),
    el('div.kpi-grid', {}, [
      kpi({ libelle: 'Contrôles effectués', valeur: tous.length, icon: 'history' }),
      kpi({ libelle: 'Attestations valides', valeur: n(RESULTAT_CONTROLE.VALIDE), icon: 'shield-check', ton: 'ok', note: 'Authentiques et en vigueur' }),
      kpi({ libelle: 'Expirées ou annulées', valeur: n(RESULTAT_CONTROLE.EXPIREE) + n(RESULTAT_CONTROLE.ANNULEE), icon: 'shield-alert', ton: 'warn', note: 'Authentiques, hors validité' }),
      kpi({ libelle: 'Codes inconnus', valeur: n(RESULTAT_CONTROLE.INCONNUE), icon: 'shield-x', ton: 'err', note: 'À signaler' }),
    ]),
    carte({ titre: 'Historique', corps: [el('div.declarations-toolbar', {}, [onglets, compteur]), corps] }),
  ]);
}

/**
 * Page publique ouverte par le QR code : hors de l'application, sans connexion.
 * @param {any|null} ctx Contexte s'il existe : un agent connecté voit le contrôle imputé à son nom.
 * @param {string} jeton
 */
export function verificationPublique(ctx, jeton) {
  let contenu;
  try {
    const verif = verifierPublic(jeton, ctx);
    contenu = [
      resultat(verif),
      verif.agent
        ? bandeau({ ton: 'info', message: 'Contrôle enregistré dans votre historique d’agent.' })
        : el('p.subtitle', { text: 'Cette page confirme l’authenticité du document et son état. Elle n’affiche aucune coordonnée des entreprises.' }),
    ];
  } catch (e) {
    contenu = [bandeau({ ton: 'err', message: e.message })];
  }
  return el('div.verification-publique', {}, [
    menuPublic('verifier'),
    el('main.verification-publique-corps', { id: 'contenu', tabindex: '-1' }, [
      el('div.market-page-heading', {}, [el('div', {}, [
        el('span.dash-eyebrow', { text: 'VÉRIFICATION D’UN DOCUMENT' }),
        el('h1', { text: 'Attestation de bourse de fret' }),
        el('p', { text: `Vérification du ${date(new Date().toISOString())}. Office Ivoirien des Chargeurs — démonstration, données fictives.` }),
      ])]),
      carte({ titre: 'Résultat de la vérification', corps: contenu }),
    ]),
  ]);
}
