/**
 * « Mon profil » et « Mes messages » — ouverts à tout utilisateur connecté
 * (lot b1). Chacun n'y voit que ses propres données.
 *
 * @module views/profil
 */

import { date, dateHeure, el, icone } from '../core/dom.js';
import { afficherErreur, badge, bandeau, bouton, carte, champ, etatVide, toast } from '../core/ui.js';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '../domain/inscription.js';
import { changerMotDePasse, mettreAJourProfil, monProfil } from '../services/profil.service.js';
import { marquerMessageLu, mesMessages } from '../services/messagerie.service.js';

const rafraichir = () => globalThis.dispatchEvent(new HashChangeEvent('hashchange'));

/** @param {any} ctx */
export function profil(ctx) {
  const p = monProfil(ctx);

  const coordonnees = el('form', {}, [
    el('div.field-row.form-grid', {}, [
      champ({ id: 'prof-nom', label: 'Nom', requis: true, valeur: p.nom, attrs: { name: 'nom', maxlength: 80, autocomplete: 'family-name' } }),
      champ({ id: 'prof-prenom', label: 'Prénoms', valeur: p.prenom, attrs: { name: 'prenom', maxlength: 80, autocomplete: 'given-name' } }),
      champ({ id: 'prof-fonction', label: 'Fonction', valeur: p.fonction, attrs: { name: 'fonction', maxlength: 80 } }),
      champ({ id: 'prof-telephone', label: 'Téléphone mobile', type: 'tel', valeur: p.telephone, aide: 'Il reçoit les messages SMS de la plateforme.', attrs: { name: 'telephone', maxlength: 32, autocomplete: 'tel' } }),
      champ({ id: 'prof-email', label: 'Adresse électronique de connexion', type: 'email', valeur: p.email, aide: 'Elle reçoit vos codes de récupération : elle n’est pas modifiable depuis cet écran.', attrs: { readonly: true } }),
    ]),
    el('div.table-toolbar', {}, [bouton({ libelle: 'Enregistrer mes coordonnées', variante: 'primary', icone: 'check', type: 'submit' })]),
  ]);
  coordonnees.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!coordonnees.reportValidity()) return;
    try {
      mettreAJourProfil(ctx, Object.fromEntries(new FormData(coordonnees)));
      toast('Coordonnées mises à jour.');
      rafraichir();
    } catch (err) {
      afficherErreur(err);
    }
  });

  const erreursMdp = el('div', { role: 'alert', 'aria-live': 'polite' });
  const motDePasse = el('form', {}, [
    el('div.field-row.form-grid', {}, [
      champ({ id: 'prof-actuel', label: 'Mot de passe actuel', type: 'password', requis: true, attrs: { name: 'actuel', autocomplete: 'current-password' } }),
      champ({ id: 'prof-nouveau', label: 'Nouveau mot de passe', type: 'password', requis: true, aide: `Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères, dont une lettre et un chiffre.`, attrs: { name: 'motDePasse', autocomplete: 'new-password' } }),
      champ({ id: 'prof-confirmation', label: 'Confirmation', type: 'password', requis: true, attrs: { name: 'confirmation', autocomplete: 'new-password' } }),
    ]),
    erreursMdp,
    el('div.table-toolbar', {}, [bouton({ libelle: 'Changer mon mot de passe', variante: 'primary', icone: 'lock', type: 'submit' })]),
  ]);
  motDePasse.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!motDePasse.reportValidity()) return;
    try {
      await changerMotDePasse(ctx, Object.fromEntries(new FormData(motDePasse)));
      motDePasse.reset();
      erreursMdp.replaceChildren();
      toast('Mot de passe changé. Un message de confirmation vous a été envoyé.');
    } catch (err) {
      erreursMdp.replaceChildren(bandeau({ ton: 'err', message: err instanceof Error ? err.message : 'Changement refusé.' }));
    }
  });

  return el('div.page', {}, [
    carte({
      titre: 'Mon compte',
      corps: [el('div.recap-grid', {}, [
        el('div.recap-item', {}, [el('span', { text: 'Rôle' }), el('strong', { text: p.role })]),
        el('div.recap-item', {}, [el('span', { text: 'Entreprise' }), el('strong', { text: p.entreprise ?? '—' })]),
        el('div.recap-item', {}, [el('span', { text: 'Compte créé le' }), el('strong', { text: date(p.creeLe) })]),
        el('div.recap-item', {}, [el('span', { text: 'Dernière connexion' }), el('strong', { text: p.dernierAccesLe ? dateHeure(p.dernierAccesLe) : '—' })]),
      ])],
    }),
    carte({ titre: 'Coordonnées personnelles', corps: [coordonnees] }),
    carte({
      titre: 'Mot de passe',
      sousTitre: 'Le mot de passe actuel est exigé. Un message de confirmation part à votre adresse enregistrée.',
      corps: [motDePasse],
    }),
  ]);
}

/** @param {any} ctx */
export function messages(ctx) {
  const liste = mesMessages(ctx);
  return el('div.page', {}, [
    bandeau({
      ton: 'info',
      message:
        'Les courriels et SMS que la plateforme vous a adressés. Dans cette démonstration, leur envoi est ' +
        'simulé : rien ne quitte la plateforme.',
    }),
    carte({
      titre: 'Mes messages',
      sousTitre: `${liste.length} message(s)`,
      corps: [
        liste.length === 0
          ? etatVide({ titre: 'Aucun message', message: 'Les messages que la plateforme vous adresse apparaîtront ici.' })
          : el('div.card-grid', {}, liste.map((m) => el('li', { class: `notif${m.luLe ? '' : ' is-unread'}` }, [
              el('div', {}, [
                el('div.b1-boite-entete', {}, [
                  el('span.badge.badge-info', {}, [icone(m.canal === 'sms' ? 'phone' : 'mail', 13), el('span', { text: m.canal === 'sms' ? 'SMS' : 'Courriel' })]),
                  badge(m.statut),
                  el('small', { text: dateHeure(m.envoyeLe) }),
                ]),
                el('strong', { text: m.objet }),
                el('p.b1-texte-long', { text: m.corps }),
                m.adresse ? el('small', { text: `Envoyé à : ${m.adresse}` }) : null,
              ]),
              m.luLe ? null : bouton({ libelle: 'Marquer lu', variante: 'ghost', onClick: () => { marquerMessageLu(ctx, m.id); rafraichir(); } }),
            ]))),
      ],
    }),
  ]);
}
