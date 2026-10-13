/**
 * Fiche du chauffeur : ajout, modification, retrait et réactivation (lot b3).
 *
 * Même gabarit que le formulaire de véhicule (`flotte-formulaires.js`) : un vrai
 * formulaire dans une grande modale, validation native, erreurs en bandeau.
 *
 * @module views/chauffeur-formulaire
 */

import { el, date } from '../core/dom.js';
import { bandeau, bouton, champ, modale, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { CATEGORIE_PERMIS, NATIONALITES, TYPE_PIECE_IDENTITE, labelOf } from '../domain/enums.js';
import { apercuRetrait, enregistrerChauffeur, reactiverChauffeur, retirerChauffeur } from '../services/chauffeur.service.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Bloc d'erreurs du formulaire, rendu visible et focalisé sur échec. */
function zoneErreur() {
  return el('div', { role: 'alert', 'aria-live': 'polite', tabindex: '-1', hidden: true });
}
function montrerErreur(zone, erreur) {
  zone.hidden = false;
  zone.replaceChildren(bandeau({ ton: 'err', message: erreur.message || 'L’enregistrement a échoué.' }));
  zone.focus();
}

/**
 * Ouvre la fiche d'un chauffeur.
 * @param {any} ctx
 * @param {Record<string, any>|null} [chauffeur] Chauffeur projeté, ou `null` pour un ajout.
 */
export function ouvrirFicheChauffeur(ctx, chauffeur = null) {
  const c = chauffeur ?? {};
  const decision = decider(ctx, 'chauffeur.gerer', { groupementId: ctx.groupementId });
  const saisie = (nom, label, options = {}) => champ({
    id: `chauffeur-${nom}`, label, valeur: c[nom], ...options,
    attrs: { name: nom, ...options.attrs },
  });
  const categories = new Set(c.permisCategories ?? []);
  const erreurs = zoneErreur();
  const photo = el('input', { id: 'chauffeur-photo', class: 'input', type: 'file', accept: 'image/jpeg,image/png,image/webp', name: 'photoFichier' });

  const formulaire = el('form.flotte-formulaire', {}, [
    el('h4.fiche-section-titre', { text: 'Identité' }),
    el('div.field-row.form-grid', {}, [
      saisie('nom', 'Nom et prénoms', { requis: true, attrs: { maxlength: 120, autocomplete: 'off' } }),
      saisie('telephone', 'Téléphone', { type: 'tel', attrs: { maxlength: 32, placeholder: '+225 …', autocomplete: 'off' } }),
      saisie('dateNaissance', 'Date de naissance', { requis: true, type: 'date', attrs: { max: aujourdhui() } }),
      saisie('nationalite', 'Nationalité', { requis: true, options: NATIONALITES.map((n) => ({ valeur: n, libelle: n })) }),
      saisie('pieceType', 'Pièce d’identité', { requis: true, options: Object.values(TYPE_PIECE_IDENTITE).map((t) => ({ valeur: t, libelle: labelOf(t) })) }),
      saisie('pieceNumero', 'Numéro de la pièce', { requis: true, attrs: { maxlength: 40, autocomplete: 'off' } }),
      saisie('pieceDelivreeLe', 'Délivrée le', { requis: true, type: 'date', attrs: { max: aujourdhui() } }),
      saisie('pieceExpireLe', 'Expire le', { requis: true, type: 'date', aide: 'Une pièce expirée empêche de confier une mission au chauffeur.' }),
    ]),
    el('h4.fiche-section-titre', { text: 'Permis de conduire' }),
    el('div.field-row.form-grid', {}, [
      saisie('permisNumero', 'Numéro de permis', { requis: true, attrs: { maxlength: 40, autocomplete: 'off' } }),
      saisie('permisEcheance', 'Permis valable jusqu’au', { requis: true, type: 'date', valeur: c.permisEcheance?.slice(0, 10), aide: 'Un permis échu empêche de confier une mission au chauffeur.' }),
      saisie('cacrNumero', 'Numéro du CACR', { attrs: { maxlength: 40 }, aide: 'Certificat d’aptitude à la conduite. Facultatif.' }),
      saisie('cacrDelivreLe', 'CACR délivré le', { type: 'date', attrs: { max: aujourdhui() } }),
    ]),
    el('fieldset.fiche-categories', {}, [
      el('legend', {}, [el('span', { text: 'Catégories du permis' }), el('span', { class: 'req', 'aria-hidden': 'true', text: ' *' })]),
      el('p.subtitle', { text: 'Un poids lourd demande la catégorie C ; un ensemble de quatre essieux ou plus, C et E.' }),
      el('div.fiche-categories-liste', {}, Object.values(CATEGORIE_PERMIS).map((cat) =>
        el('label.checkbox-row', {}, [
          el('input', { type: 'checkbox', name: 'permisCategories', value: cat, checked: categories.has(cat) || undefined }),
          el('span.label-body', {}, [el('strong', { text: `Catégorie ${cat}` }), el('span', { text: labelOf(cat).split('— ')[1] ?? '' })]),
        ]))),
    ]),
    el('h4.fiche-section-titre', { text: 'Photo (facultative)' }),
    el('div.field', {}, [
      el('label', { for: 'chauffeur-photo' }, [el('span', { text: 'Photo du chauffeur' })]),
      photo,
      el('small', { text: c.photo?.nom
        ? `Photo enregistrée : ${c.photo.nom}. Choisissez une image pour la remplacer.`
        : 'JPEG, PNG ou WebP, 5 Mo au plus. Seules ses références sont conservées dans cette démonstration.' }),
    ]),
    erreurs,
  ]);

  let fermer;
  formulaire.append(el('footer.modal-footer', {}, [
    bouton({ libelle: 'Annuler', onClick: () => fermer() }),
    bouton({ libelle: 'Enregistrer', variante: 'primary', icone: 'check', type: 'submit', motif: decision.autorise ? null : decision.explication }),
  ]));

  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!decision.autorise || !formulaire.reportValidity()) return;
    const donnees = new FormData(formulaire);
    const valeurs = Object.fromEntries([...donnees.entries()].filter(([k]) => !['permisCategories', 'photoFichier'].includes(k)));
    valeurs.permisCategories = donnees.getAll('permisCategories');
    if (!valeurs.permisCategories.length) {
      montrerErreur(erreurs, new Error('Cochez au moins une catégorie de permis.'));
      return;
    }
    const fichier = photo.files?.[0];
    if (fichier) valeurs.photo = { nom: fichier.name, type: fichier.type, taille: fichier.size };
    try {
      enregistrerChauffeur(ctx, valeurs, chauffeur?.id ?? null);
      fermer();
      toast(chauffeur ? 'Fiche du chauffeur mise à jour.' : 'Chauffeur ajouté à votre équipe.');
      rafraichir();
    } catch (erreur) {
      montrerErreur(erreurs, erreur);
    }
  });

  fermer = modale({
    titre: chauffeur ? `Fiche de ${c.nom}` : 'Ajouter un chauffeur',
    corps: [
      el('p', { text: 'La fiche complète est contrôlée par l’agent d’activation. Une pièce modifiée après contrôle devra l’être de nouveau. Les coordonnées du chauffeur ne sont transmises à l’affréteur qu’après validation de la mise en relation.' }),
      chauffeur?.actif === false ? bandeau({ ton: 'warn', message: 'Ce chauffeur est retiré de votre équipe. Sa fiche reste consultable et modifiable ; il ne sera proposé pour une mission qu’après réactivation.' }) : null,
      formulaire,
    ],
  });
  formulaire.closest?.('.modal-card')?.classList.add('modal-lg');
  return fermer;
}

/**
 * Retrait d'un chauffeur parti : date et motif, conséquences dites avant.
 * @param {any} ctx
 * @param {Record<string, any>} chauffeur
 */
export function ouvrirRetrait(ctx, chauffeur) {
  let apercu;
  try {
    apercu = apercuRetrait(ctx, chauffeur.id);
  } catch (e) {
    toast(e.message, 'err');
    return null;
  }
  const erreurs = zoneErreur();
  const formulaire = el('form.flotte-formulaire', {}, [
    el('div.field-row.form-grid', {}, [
      champ({ id: 'retrait-date', label: 'Date de départ', type: 'date', requis: true, valeur: aujourdhui(), attrs: { name: 'dateDepart' } }),
      champ({ id: 'retrait-motif', label: 'Motif du départ', type: 'textarea', requis: true, attrs: { name: 'motif', maxlength: 300 }, aide: 'Par exemple : fin de contrat, démission. Conservé dans l’historique du chauffeur.' }),
    ]),
    apercu.disponibilites.length
      ? bandeau({ ton: 'warn', message: `Ce chauffeur est prévu sur ${apercu.disponibilites.length} disponibilité(s) publiée(s) (${apercu.disponibilites.join(', ')}). Elles restent au marché, sans chauffeur pressenti.` })
      : null,
    erreurs,
  ]);
  let fermer;
  formulaire.append(el('footer.modal-footer', {}, [
    bouton({ libelle: 'Conserver', onClick: () => fermer() }),
    bouton({ libelle: 'Retirer le chauffeur', variante: 'primary', icone: 'user-x', type: 'submit', motif: apercu.retirable ? null : apercu.motif }),
  ]));
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!apercu.retirable || !formulaire.reportValidity()) return;
    const v = Object.fromEntries(new FormData(formulaire));
    try {
      retirerChauffeur(ctx, chauffeur.id, v);
      fermer();
      toast('Chauffeur retiré de l’équipe. Son historique est conservé.');
      rafraichir();
    } catch (erreur) {
      montrerErreur(erreurs, erreur);
    }
  });
  fermer = modale({
    titre: `Retirer ${chauffeur.nom}`,
    corps: [
      el('p', { text: 'Le chauffeur n’est pas supprimé : ses transports passés restent consultables et il pourra être réactivé. Il ne sera plus proposé pour une nouvelle mission.' }),
      formulaire,
    ],
  });
  return fermer;
}

/**
 * Réactivation d'un chauffeur revenu.
 * @param {any} ctx
 * @param {Record<string, any>} chauffeur
 */
export function ouvrirReactivation(ctx, chauffeur) {
  const fermer = modale({
    titre: `Réactiver ${chauffeur.nom}`,
    corps: [
      el('p', { text: `Retiré le ${date(chauffeur.retireLe)}${chauffeur.dateDepart ? ` (départ le ${date(chauffeur.dateDepart)})` : ''}. Il redeviendra sélectionnable pour une mission si son permis et sa pièce d’identité sont valides.` }),
    ],
    actions: [
      bouton({ libelle: 'Annuler', onClick: () => fermer() }),
      bouton({
        libelle: 'Réactiver', variante: 'primary', icone: 'rotate-ccw',
        onClick: () => {
          try {
            reactiverChauffeur(ctx, chauffeur.id);
            fermer();
            toast('Chauffeur réactivé dans votre équipe.');
            rafraichir();
          } catch (e) {
            toast(e.message, 'err');
          }
        },
      }),
    ],
  });
  return fermer;
}
