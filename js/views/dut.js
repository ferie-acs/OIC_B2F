/** Documents de transport : aperçu projeté, génération locale et impression. */
import { el, icone, date, dateHeure } from '../core/dom.js';
import { bouton, etatVide, kpi, toast } from '../core/ui.js';
import { segmentEspace } from '../core/nav.js';
import { decider } from '../domain/access.js';
import { ETAT_APPARIEMENT, labelOf } from '../domain/enums.js';
import { dossiersDut, genererDut } from '../services/dut.service.js';
import { exempleDutDisponible, initialiserDutDemo } from '../services/dut-demo.js';
import { COPIES, genererPdfDut } from '../services/dut-pdf.service.js';

const texte = valeur => valeur === null || valeur === undefined || valeur === '' ? 'Non renseigné' : String(valeur);
const statut = dossier => dossier.document ? ['Généré', 'ok'] : dossier.appariement?.etat === ETAT_APPARIEMENT.VALIDER ? ['À préparer', 'info'] : ['Validation attendue', 'warn'];
const etiquette = dossier => { const [libelle, ton] = statut(dossier); return el('span.dut-status', { class: `is-${ton}`, text: libelle }); };
const champ = (nom, valeur) => el('div', {}, [el('dt', { text: nom }), el('dd', { text: texte(valeur) })]);
const section = (numero, titre, champs) => el('section.dut-document-section', {}, [
  el('h3', {}, [el('span', { text: numero }), titre]), el('dl.dut-document-fields', {}, champs),
]);

function ficheDocument(dossier) {
  const documentDut = dossier.document || dossier.apercu;
  const d = documentDut?.donnees || {};
  return el('article.dut-sheet', { 'aria-label': dossier.document ? `Document ${documentDut.reference}` : 'Aperçu du document de transport' }, [
    el('div.dut-sheet-top', {}, [
      el('div', {}, [el('span.dut-sheet-brand', { text: 'BOURSE DE FRET' }), el('small', { text: 'CÔTE D’IVOIRE · OIC' })]),
      el('span.dut-demo-stamp', { text: 'DÉMONSTRATION' }),
    ]),
    el('header.dut-document-title', {}, [el('span', { text: 'DUT' }), el('div', {}, [el('h2', { text: 'Document Unique de Transport' }), el('p', { text: documentDut?.reference || 'Aperçu avant génération' })])]),
    el('div.dut-document-route', {}, [el('small', { text: 'ITINÉRAIRE DU TRANSPORT' }), el('strong', { text: d.corridor || 'Itinéraire non renseigné' }), el('span', { text: `${d.poidsTotalT ?? '—'} t · ${d.marchandise || 'Marchandise non renseignée'}` })]),
    section('01', 'Le transport', [
      champ('Mise en relation', dossier.appariement?.reference),
      champ('Départ prévu', d.departPrevu ? date(d.departPrevu) : null),
      champ('Arrivée prévue', d.arriveePrevue ? date(d.arriveePrevue) : null),
      champ('Poids total', d.poidsTotalT != null ? `${d.poidsTotalT} tonnes` : null),
    ]),
    section('02', 'Les parties', [champ('Affréteur', d.affreteurRaisonSociale), champ('Transporteur', d.transporteurRaisonSociale)]),
    section('03', 'Le véhicule', [champ('Immatriculation', d.immatriculation), champ('Carte de transport', d.carteTransportNumero), ...('carteGrise' in d ? [champ('Carte grise', d.carteGrise)] : [])]),
    'chauffeurNom' in d || 'transporteurTelephone' in d ? section('04', 'Contacts pour ce trajet', [
      ...('chauffeurNom' in d ? [champ('Chauffeur prévu', d.chauffeurNom), champ('Permis du chauffeur', d.chauffeurPermisNumero), champ('Téléphone du chauffeur', d.chauffeurTelephone)] : []),
      ...('transporteurTelephone' in d ? [champ('Téléphone du transporteur', d.transporteurTelephone)] : []),
      ...('transporteurEmail' in d ? [champ('E-mail du transporteur', d.transporteurEmail)] : []),
    ]) : null,
    el('footer.dut-document-footer', {}, [
      el('p', { text: dossier.document ? `Généré le ${dateHeure(documentDut.genereLe)} · Informations enregistrées à cette date.` : 'Les informations seront enregistrées au moment de la génération.' }),
      el('strong', { text: 'Fiche de démonstration · sans valeur administrative' }),
    ]),
  ]);
}

/** L'impression du navigateur permet aussi d'enregistrer la fiche en PDF. */
function imprimer(dossier) {
  const copie = ficheDocument(dossier);
  copie.classList.add('dut-print-sheet');
  document.body.append(copie);
  document.body.classList.add('dut-printing');
  const titre = document.title;
  document.title = dossier.document.reference;
  const nettoyer = () => { copie.remove(); document.body.classList.remove('dut-printing'); document.title = titre; window.removeEventListener('afterprint', nettoyer); };
  window.addEventListener('afterprint', nettoyer, { once: true });
  try { window.print(); } catch (erreur) { nettoyer(); toast('L’impression n’a pas pu être ouverte.', 'err'); }
}

/**
 * Choix de l'exemplaire et tirage du PDF au gabarit officiel.
 *
 * Le bouton reste focalisable pendant la génération — `aria-busy` plutôt que
 * `disabled`, correctif QA-08 — et un second clic est ignoré par le drapeau
 * plutôt que par le retrait du bouton de l'ordre de tabulation.
 * @param {Object} dossier Élément de `dossiersDut()`.
 * @returns {HTMLElement}
 */
function actionsTirage(dossier) {
  let exemplaire = 'TRANSPORTEUR';
  let enCours = false;
  const idSelecteur = `dut-exemplaire-${dossier.appariement.id}`;
  const selecteur = el('select.select', {
    id: idSelecteur,
    name: 'exemplaire',
    on: { change: e => { exemplaire = e.target.value; } },
  }, Object.entries(COPIES).map(([valeur, libelle]) =>
    el('option', { value: valeur, text: libelle, selected: valeur === exemplaire || undefined })));
  const btn = bouton({
    libelle: 'DUT officiel (PDF)', icone: 'download', variante: dossier.document ? 'primary' : 'secondary',
    onClick: async () => {
      if (enCours) return;
      enCours = true; btn.setAttribute('aria-busy', 'true');
      try {
        const { nomFichier } = await genererPdfDut(dossier, { copy: exemplaire });
        toast(`${nomFichier} téléchargé.`);
      } catch (erreur) {
        toast(erreur.message, 'err');
      } finally {
        enCours = false; btn.removeAttribute('aria-busy');
      }
    },
  });
  return el('div.dut-tirage', {}, [
    el('label.dut-tirage-copie', { for: idSelecteur }, [el('span', { text: 'Exemplaire' }), selecteur]),
    btn,
    el('p.dut-tirage-note', { text: dossier.document
      ? 'Formulaire recto-verso en 10 sections, au gabarit du POC DUT. Les rubriques sans donnée restent à remplir à la main.'
      : 'Tirage d’aperçu : filigrane SANS VALEUR, aucune référence attribuée.' }),
  ]);
}

export function documentsDut(ctx, params = {}) {
  let dossiers = dossiersDut(ctx);
  const selectionDemandee = params.selection || params.id;
  let selection = selectionDemandee ? dossiers.find(d => d.appariement?.id === selectionDemandee) : dossiers.find(d => d.generable) || dossiers[0];
  let filtre = 'tous', recherche = '';
  const espace = segmentEspace(ctx);
  const peutGenerer = decider(ctx, 'dut.generer', { groupementId: ctx.groupementId }).autorise;
  const page = el('div.page.dut-page');
  const indicateurs = el('div.dut-kpis');
  const compteur = el('span');
  const liste = el('div.dut-dossier-list', { 'aria-label': 'Dossiers de transport' });
  const onglets = el('div.dut-filters', { 'aria-label': 'État des documents' });
  const detail = el('section.dut-detail', { 'aria-label': 'Document sélectionné' });
  const compter = type => dossiers.filter(d => type === 'generes' ? d.document : type === 'preparer' ? !d.document && d.appariement?.etat === ETAT_APPARIEMENT.VALIDER : !d.document && d.appariement?.etat !== ETAT_APPARIEMENT.VALIDER).length;
  function statistiques() {
    compteur.textContent = String(dossiers.length);
    indicateurs.replaceChildren(
      kpi({ libelle: 'DUT générés', valeur: compter('generes'), icon: 'file', ton: 'ok', note: 'Disponibles à la consultation' }),
      kpi({ libelle: 'Dossiers validés à préparer', valeur: compter('preparer'), icon: 'check-circle', note: 'Mises en relation confirmées' }),
      kpi({ libelle: 'En attente de validation', valeur: compter('attente'), icon: 'clock', ton: 'warn', note: 'Génération après validation' }),
    );
  }
  function resultat() {
    const normaliser = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return dossiers.filter(d => {
      const v = (d.document || d.apercu)?.donnees || {};
      const correspond = normaliser([d.appariement?.reference, d.document?.reference, v.corridor, v.immatriculation, v.affreteurRaisonSociale, v.transporteurRaisonSociale].join(' ')).includes(normaliser(recherche));
      return correspond && (filtre === 'tous' || (filtre === 'generes' ? Boolean(d.document) : filtre === 'preparer' ? !d.document && d.appariement?.etat === ETAT_APPARIEMENT.VALIDER : !d.document && d.appariement?.etat !== ETAT_APPARIEMENT.VALIDER));
    });
  }
  function afficherListe() {
    onglets.replaceChildren(...[['tous', 'Tous'], ['preparer', 'À préparer'], ['generes', 'Générés'], ['attente', 'En attente']].map(([cle, libelle]) => el('button', { type: 'button', 'aria-pressed': String(filtre === cle), class: filtre === cle ? 'active' : '', on: { click: () => { filtre = cle; afficherListe(); onglets.querySelector('.active')?.focus({ preventScroll: true }); } } }, [libelle])));
    const resultats = resultat();
    liste.replaceChildren(...resultats.map(d => {
      const v = (d.document || d.apercu)?.donnees || {};
      return el('button.dut-dossier', { type: 'button', class: d.appariement.id === selection?.appariement.id ? 'selected' : '', 'aria-pressed': String(d.appariement.id === selection?.appariement.id), on: { click: () => { selection = d; history.replaceState(null, '', `#/${espace}/${espace === 'transporteur' ? 'dut' : 'duts'}?selection=${encodeURIComponent(d.appariement.id)}`); afficherListe(); afficherDetail(); liste.querySelector('.selected')?.focus({ preventScroll: true }); } } }, [
        el('span.dut-dossier-top', {}, [el('strong', { text: d.document?.reference || d.appariement.reference }), etiquette(d)]),
        el('strong.dut-dossier-route', { text: v.corridor || 'Transport à documenter' }),
        el('span.dut-dossier-meta', {}, [icone('truck', 22), v.immatriculation || 'Camion non renseigné', el('span', { text: `${v.poidsTotalT ?? '—'} t` })]),
        el('span.dut-dossier-bottom', {}, [icone('calendar', 14), v.departPrevu ? date(v.departPrevu) : 'Date à préciser', icone('chevron-right', 15)]),
      ]);
    }));
    if (!resultats.length) liste.append(etatVide({ titre: dossiers.length ? 'Aucun dossier trouvé' : 'Aucun dossier pour le moment', message: dossiers.length ? 'Essayez un autre filtre ou une autre recherche.' : 'Vos mises en relation acceptées ou validées apparaîtront ici.' }));
  }
  function afficherDetail() {
    if (!selection) {
      if (selectionDemandee) {
        detail.replaceChildren(etatVide({ titre: 'Dossier indisponible', message: 'Ce dossier n’existe pas dans votre périmètre ou n’est pas encore accepté. Choisissez un autre dossier dans la liste.' }));
        return;
      }
      detail.replaceChildren(el('div.dut-empty-panel', {}, [
        etatVide({ titre: 'Votre premier DUT commence par une rencontre', message: peutGenerer ? 'Une fois votre mise en relation validée, retrouvez ici sa fiche préremplie et générez le document.' : 'Les documents générés dans votre périmètre apparaîtront ici.' }),
        exempleDutDisponible(ctx) ? el('div.dut-demo-actions', {}, [
          bouton({ libelle: 'Charger un exemple DÉMO', icone: 'plus', variante: 'primary', onClick: () => {
            try {
              const id = initialiserDutDemo(ctx);
              dossiers = dossiersDut(ctx); selection = dossiers.find(d => d.appariement.id === id);
              statistiques(); afficherListe(); afficherDetail();
              toast('Exemple chargé : vous pouvez maintenant générer son DUT.');
            } catch (erreur) { toast(erreur.message, 'err'); }
          } }),
          el('p', { text: 'Ajoute un dossier fictif prêt à générer, sans modifier vos transports existants.' }),
        ]) : null,
      ]));
      return;
    }
    const d = selection;
    const valide = d.appariement?.etat === ETAT_APPARIEMENT.VALIDER;
    const sheet = ficheDocument(d);
    detail.replaceChildren(
      el('div.dut-detail-toolbar', {}, [
        el('div', {}, [el('span.dut-eyebrow', { text: d.document ? 'VOTRE DOCUMENT' : 'APERÇU DU DOSSIER' }), el('h2', { text: d.document?.reference || d.appariement.reference })]),
        el('div.dut-toolbar-actions', {}, [
          actionsTirage(d),
          d.document ? bouton({ libelle: 'Aperçu imprimable', icone: 'eye', onClick: () => imprimer(d) }) : bouton({ libelle: 'Générer le DUT', icone: 'file', variante: 'primary', motif: d.generable ? null : d.motif || 'La génération n’est pas disponible pour ce dossier.', onClick: () => {
          try {
            const produit = genererDut(ctx, d.appariement.id);
            dossiers = dossiersDut(ctx); selection = dossiers.find(x => x.appariement.id === d.appariement.id);
            statistiques(); afficherListe(); afficherDetail();
            toast(`${produit.reference} enregistré. Vous pouvez le consulter et l’imprimer.`);
            detail.querySelector('h2')?.setAttribute('tabindex', '-1'); detail.querySelector('h2')?.focus({ preventScroll: true });
          } catch (erreur) { toast(erreur.message, 'err'); }
        } }),
        ]),
      ]),
      el('ol.dut-steps', { 'aria-label': 'Préparation du DUT' }, [
        ['Dossier sélectionné', true], ['Mise en relation validée', valide], ['DUT généré', Boolean(d.document)],
      ].map(([titre, fait], i) => el('li', { class: fait ? 'done' : '' }, [el('span', {}, fait ? [icone('check', 14)] : [String(i + 1)]), titre]))),
      sheet,
      el('div.dut-related', {}, [
        d.transport ? el('span', {}, [icone('truck', 20), `Transport : ${labelOf(d.transport.etape)}`]) : null,
        decider(ctx, 'appariement.lire').autorise && ['transporteur', 'affreteur', 'concessionnaire'].includes(espace) ? el('a', { href: espace === 'concessionnaire' ? '#/concessionnaire/relations' : `#/${espace}/relations/${encodeURIComponent(d.appariement.id)}` }, [espace === 'concessionnaire' ? 'Voir les mises en relation' : 'Voir la mise en relation', icone('arrow-right', 15)]) : null,
      ]),
    );
  }
  page.append(
    el('header.dut-page-header', {}, [el('div', {}, [el('span.dash-eyebrow', { text: 'VOS DOCUMENTS DE TRANSPORT' }), el('h1', { text: peutGenerer ? 'Préparer un DUT' : 'Documents de transport' }), el('p', { text: peutGenerer ? 'Vos informations de transport, réunies dans une fiche prête à générer.' : 'Consultez les documents générés pour les transports de votre périmètre.' })]), el('span.dut-header-icon', { 'aria-hidden': 'true' }, [icone('file', 30)])]),
    indicateurs,
    el('div.dut-workspace', {}, [
      el('aside.dut-panel.dut-sidebar', {}, [el('div.dut-list-heading', {}, [el('h2', { text: 'Dossiers de transport' }), compteur]),
        el('label.dut-search', {}, [icone('search', 17), el('input', { type: 'search', placeholder: 'Référence, ville ou camion…', 'aria-label': 'Rechercher un dossier DUT', on: { input: e => { recherche = e.target.value; afficherListe(); } } })]), onglets, liste,
        el('p.dut-sidebar-note', {}, [icone('info', 17), 'Un document par mise en relation. Vous pouvez le retrouver ici après sa génération.']),
      ]), detail,
    ]),
    el('p.dut-poc-note', { text: 'POC · La fiche est conservée dans cette démonstration. Aucune transmission au système officiel DUT n’est effectuée.' }),
  );
  statistiques(); afficherListe(); afficherDetail();
  return page;
}
