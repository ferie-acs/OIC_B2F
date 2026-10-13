/** Ajout et mise à jour des véhicules et chauffeurs du groupement connecté. */
import { el } from '../core/dom.js';
import { bandeau, bouton, champ, modale, toast } from '../core/ui.js';
import { decider } from '../domain/access.js';
import { ETAT_VEHICULE, labelOf } from '../domain/enums.js';
import { champsRequisPour } from '../domain/permissions.js';
import { depot } from '../repositories/index.js';
import { enregistrerVehicule } from '../services/flotte.service.js';
import { ouvrirFicheChauffeur } from './chauffeur-formulaire.js';

function optionsDe(famille, selection) {
  return depot('referentiel').brutOu(r => r.famille === famille && (r.actif || r.id === selection))
    .map(r => ({ valeur: r.id, libelle: r.libelle + (r.actif ? '' : ' — archivé') }));
}

/** Un vrai formulaire : Entrée et validation native fonctionnent comme le bouton. */
function ouvrirFormulaire({ ctx, droit, titre, introduction, champs, sauvegarder, confirmation, apresChamps = null }) {
  const decision = decider(ctx, droit, { groupementId: ctx.groupementId });
  const erreurs = el('div', { role: 'alert', 'aria-live': 'polite', tabindex: '-1', hidden: true });
  const formulaire = el('form.flotte-formulaire', {}, [
    el('div.field-row.form-grid', {}, champs),
    apresChamps,
    erreurs,
  ]);
  let fermer;
  const annuler = bouton({ libelle: 'Annuler', onClick: () => fermer() });
  const enregistrer = bouton({
    libelle: 'Enregistrer', variante: 'primary', icone: 'check', type: 'submit',
    motif: decision.autorise ? null : decision.explication,
  });
  formulaire.append(el('footer.modal-footer', {}, [annuler, enregistrer]));
  formulaire.addEventListener('submit', e => {
    e.preventDefault();
    if (!decision.autorise || !formulaire.reportValidity()) return;
    try {
      sauvegarder(Object.fromEntries(new FormData(formulaire)));
      fermer();
      toast(confirmation);
      globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (erreur) {
      erreurs.hidden = false;
      erreurs.replaceChildren(bandeau({ ton: 'err', message: erreur.message || 'L’enregistrement a échoué.' }));
      erreurs.focus();
    }
  });
  fermer = modale({ titre, corps: [el('p', { text: introduction }), formulaire] });
  formulaire.closest('.modal-card')?.classList.add('modal-lg');
  return fermer;
}

export function ouvrirVehicule(ctx, vehicule = null) {
  const v = vehicule ?? {};
  const paysRequis = champsRequisPour(ctx.roleId, 'vehicule').includes('paysImmatriculation');
  const engage = v.etat === ETAT_VEHICULE.ENGAGE || v.engage;
  const etats = engage ? [v.etat] : [ETAT_VEHICULE.DISPONIBLE, ETAT_VEHICULE.HORS_SERVICE];
  const saisie = (nom, label, options = {}) => champ({
    id: `flotte-vehicule-${nom}`, label, valeur: v[nom], ...options,
    attrs: { name: nom, ...options.attrs },
  });
  return ouvrirFormulaire({
    ctx, droit: 'vehicule.gerer',
    titre: vehicule ? 'Modifier le véhicule' : 'Ajouter un véhicule',
    introduction: 'Enregistrez le véhicule dans votre parc. Vous pourrez ensuite publier sa disponibilité sur le marché.',
    champs: [
      saisie('immatriculation', 'Immatriculation', { requis: true, attrs: { maxlength: 24, placeholder: 'Ex. AB 123 CD', autocomplete: 'off' } }),
      saisie('paysImmatriculation', 'Pays d’immatriculation', {
        requis: paysRequis, valeur: v.paysImmatriculation ?? (paysRequis ? '' : 'Côte d’Ivoire'),
        attrs: { maxlength: 60 }, aide: paysRequis ? 'Obligatoire pour un transporteur étranger.' : undefined,
      }),
      saisie('capaciteT', 'Capacité utile (tonnes)', { requis: true, type: 'number', attrs: { min: 0.1, step: 'any' } }),
      saisie('ptacT', 'PTAC (tonnes)', { requis: true, type: 'number', attrs: { min: 0.1, step: 'any' }, aide: 'Poids maximal du véhicule chargé.' }),
      saisie('carrosserieId', 'Carrosserie', { requis: true, options: optionsDe('carrosseries', v.carrosserieId) }),
      saisie('essieuxId', 'Essieux', { requis: true, options: optionsDe('essieux', v.essieuxId) }),
      saisie('carteTransportNumero', 'N° de carte de transport', { requis: true, attrs: { maxlength: 80 } }),
      saisie('carteTransportEcheance', 'Carte de transport valable jusqu’au', { requis: true, type: 'date', valeur: v.carteTransportEcheance?.slice(0, 10) }),
      saisie('carteGrise', 'N° de carte grise', { attrs: { maxlength: 40 } }),
      saisie('prixKmT', 'Prix indicatif (F CFA / km·tonne)', { type: 'number', attrs: { min: 0, step: 'any' }, aide: 'Facultatif, sans effet sur les frais de la plateforme.' }),
      saisie('stationnementLocaliteId', 'Lieu de stationnement', {
        options: optionsDe('localites', v.stationnementLocaliteId),
        aide: 'Facultatif. Indiquez où le véhicule stationne ; ce lieu sera affiché sur la carte hors trajet en cours.',
      }),
      saisie('etat', 'État du véhicule', {
        requis: true, valeur: v.etat ?? ETAT_VEHICULE.DISPONIBLE,
        options: etats.map(etat => ({ valeur: etat, libelle: labelOf(etat) })),
        attrs: { disabled: engage },
        aide: engage ? 'L’état est lié au transport en cours. Les pièces restent modifiables.' : undefined,
      }),
    ],
    apresChamps: bandeau({ ton: 'info', message: 'Une carte de transport échue n’empêche pas l’enregistrement du véhicule. Renouvelez sa date de validité avant de publier une offre.' }),
    sauvegarder: donnees => enregistrerVehicule(ctx, { ...donnees, etat: engage ? v.etat : donnees.etat }, vehicule?.id),
    confirmation: vehicule ? 'Véhicule mis à jour.' : 'Véhicule ajouté à votre parc.',
  });
}

/*
 * Lot b3 : la fiche du chauffeur (identité, permis et catégories, photo, retrait)
 * vit dans `chauffeur-formulaire.js`. Ce point d'entrée historique y renvoie.
 */
export function ouvrirChauffeur(ctx, chauffeur = null) {
  return ouvrirFicheChauffeur(ctx, chauffeur);
}
