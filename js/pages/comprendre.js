/* ==========================================================================
   B2F — page pédagogique. Vanilla JS, aucune dépendance réseau.
   ========================================================================== */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ic = (n, s = 18) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const fcfa = (n) => new Intl.NumberFormat('fr-FR').format(n) + ' F';

/* ==========================================================================
   Thème
   ========================================================================== */
const themeBtn = $('#theme-toggle');
const paintTheme = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeBtn.innerHTML = ic(dark ? 'moon' : 'sun', 18);
  themeBtn.setAttribute('aria-label', dark ? 'Activer le thème clair' : 'Activer le thème sombre');
};
themeBtn.addEventListener('click', () => {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  paintTheme();
});
paintTheme();

/* ==========================================================================
   Glossaire — mots du métier expliqués au clic
   ========================================================================== */
const GLOSSAIRE = {
  "fret": [
    "Le fret",
    "La marchandise à transporter : des sacs de cacao, des palettes de riz, du ciment ou du bois. Dans le guide, « chercher du fret » signifie chercher un chargement pour son camion."
  ],
  "affreteur": [
    "Affréteur",
    "Dans ce parcours, l’entreprise qui organise le transport de sa marchandise. Awa représente cet expéditeur, aussi appelé chargeur dans le guide. Elle réserve ou accepte une proposition, puis confirme la mise en relation."
  ],
  "transporteur": [
    "Transporteur",
    "L’entreprise qui exploite les camions et réalise le transport. Koffi représente cette entreprise : il publie ses disponibilités, examine les demandes et renseigne l’avancement du trajet."
  ],
  "auxiliaire": [
    "Auxiliaire",
    "Un collaborateur qui prépare les opérations pour son entreprise. Côté affréteur, il peut préparer le fret et réserver ; côté transporteur, il prépare les offres et le suivi. Dans le POC, il ne peut accepter ni réservation ni proposition, et ne peut pas confirmer une mise en relation."
  ],
  "concessionnaire": [
    "Concessionnaire",
    "L’exploitant du service. Il gère les entreprises, les abonnements, les tarifs et les comptes prépayés. Il ne réserve pas et ne confirme pas à la place des entreprises."
  ],
  "dgttc": [
    "DGTTC",
    "La Direction Générale des Transports Terrestres et de la Circulation. Son espace de contrôle dans le POC consulte les transports et les cartes de transport, sans accès aux soldes ni aux montants financiers."
  ],
  "double-validation": [
    "La double validation",
    "Un accord partagé, puis une confirmation finale par l’affréteur. Dans l’exemple d’Awa : elle réserve un camion, Koffi accepte et Awa confirme. Si Koffi propose son camion sur une demande de fret, Awa accepte cette proposition puis confirme."
  ],
  "compte-prepaye": [
    "Le compte prépayé",
    "Le solde disponible d’une entreprise pour les frais du service. À la confirmation, le POC vérifie que les deux soldes couvrent leurs frais respectifs. Sinon, il bloque la confirmation sans débiter aucun des deux comptes."
  ],
  "mise-en-relation": [
    "La mise en relation",
    "La rencontre enregistrée entre deux entreprises. Après confirmation par l’affréteur, leurs coordonnées deviennent accessibles pour organiser le transport. Les frais de ce service sont distincts du prix du transport."
  ],
  "dut": [
    "DUT",
    "Le Document Unique de Transport, associé au dossier de transport. Dans cette démonstration, sa génération produit une prévisualisation à partir des informations du dossier, pas un document officiel."
  ],
  "carrosserie": [
    "Carrosserie",
    "Le type de véhicule ou de remorque adapté au chargement : bâché, plateau, benne, citerne ou frigorifique. Dans notre exemple, Koffi propose un camion bâché pour transporter le cacao."
  ],
  "essieux": [
    "Essieux",
    "Les axes qui portent les roues du véhicule. Leur nombre fait partie des caractéristiques du camion, à consulter avec sa capacité et son PTAC pour choisir un véhicule adapté."
  ],
  "ptac": [
    "PTAC",
    "Poids Total Autorisé en Charge : le poids maximal autorisé du véhicule chargé, véhicule compris. Il ne faut pas le confondre avec la capacité de marchandise annoncée dans une offre."
  ]
};

let popup = null, popupOpener = null;
const closePopup = (restoreFocus = false) => {
  popup?.remove(); popup = null;
  popupOpener?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) popupOpener?.focus({preventScroll: true});
  popupOpener = null;
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.term');
  if (!btn) { if (!e.target.closest('.glossary-pop')) closePopup(); return; }
  const entry = GLOSSAIRE[btn.dataset.term];
  if (!entry) return;
  closePopup();
  popupOpener = btn;
  btn.setAttribute('aria-expanded', 'true');
  popup = document.createElement('div');
  popup.className = 'glossary-pop';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Définition : ' + entry[0]);
  popup.innerHTML = `<button type="button" class="close" aria-label="Fermer">${ic('x', 15)}</button>
                     <strong>${entry[0]}</strong>${entry[1]}`;
  document.body.appendChild(popup);

  const r = btn.getBoundingClientRect();
  const w = popup.offsetWidth, h = popup.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  let top = r.bottom + 10;
  if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.querySelector('.close').addEventListener('click', () => closePopup(true));
  popup.querySelector('.close').focus({preventScroll: true});
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(true); });
window.addEventListener('scroll', () => closePopup(), { passive: true });

/* ==========================================================================
   1. Deux scénarios, seize scènes : sans visibilité, puis avec la Bourse.
   Les états du diorama sont animés en CSS, avec navigation directe possible.
   ========================================================================== */
const REDUIT = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACTES = [
  {
    num: '01', scenario: 'sans', ton: '', short: 'Camion libre', phase: 'Un camion disponible',
    titre: 'Koffi : « Mon camion est libre. »',
    texte: 'À Abidjan, Koffi de Trans Lagunes prépare un départ pour Bouaké. Son camion bâché peut transporter 25 tonnes. Il lui manque un chargement.',
    awa: ['Mon cacao est prêt.', 'Je dois trouver un camion.'],
    koffi: ['Mon camion est libre.', '25 t · Abidjan → Bouaké']
  },
  {
    num: '02', scenario: 'sans', ton: '', short: 'Cacao prêt', phase: 'Une marchandise à expédier',
    titre: 'Awa : « Qui peut transporter mon cacao ? »',
    texte: 'Awa, chez Ivoire Cacao Export, a 24 tonnes de cacao prêtes dans son entrepôt à Abidjan. Elle cherche un transport vers Bouaké, sur le même trajet que Koffi.',
    awa: ['J’ai 24 t de cacao.', 'Il me faut un camion.'],
    koffi: ['25 t disponibles.', 'Qui a du fret pour Bouaké ?']
  },
  {
    num: '03', scenario: 'sans', ton: '', short: 'Awa appelle', phase: 'Des appels sans solution',
    titre: 'Awa appelle son carnet d’adresses',
    texte: 'Awa téléphone aux transporteurs qu’elle connaît. Dans cet exemple, leurs camions sont déjà pris. Elle ignore que le camion de Koffi est disponible à proximité.',
    awa: ['Un camion pour Bouaké ?', 'Mes contacts sont occupés…'],
    koffi: ['Mon camion attend.', 'Personne ne me trouve.']
  },
  {
    num: '04', scenario: 'sans', ton: '', short: 'Koffi cherche', phase: 'Chacun cherche de son côté',
    titre: 'Koffi cherche aussi, sans trouver Awa',
    texte: 'Koffi appelle ses propres contacts pour remplir son camion. Aucun ne lui propose le cacao d’Awa : leurs carnets d’adresses ne se croisent pas.',
    awa: ['Toujours pas de camion.', 'Mon cacao reste à quai.'],
    koffi: ['Du fret pour mon départ ?', 'Personne dans mes contacts.']
  },
  {
    num: '05', scenario: 'sans', ton: 'bad', short: 'Sans lien', phase: 'Des besoins qui restent invisibles',
    titre: 'Le bon camion et le bon fret ne se rencontrent pas',
    texte: 'Le trajet et la capacité correspondent pourtant : 24 tonnes à charger, 25 tonnes disponibles. Awa et Koffi ne se connaissent pas, et aucune annonce commune ne les rapproche.',
    awa: ['J’ai la marchandise.', 'Mais aucun camion en vue.'],
    koffi: ['J’ai le bon camion.', 'Mais aucun fret en vue.']
  },
  {
    num: '06', scenario: 'sans', ton: 'bad', short: 'Départ à vide', phase: 'Le camion part sans chargement',
    titre: 'Koffi finit par partir à vide',
    texte: 'L’heure de départ arrive. Faute d’avoir trouvé une marchandise, Koffi envoie son camion vers Bouaké sans chargement. Le cacao d’Awa reste à l’entrepôt.',
    awa: ['Le cacao attend encore.', 'Il me faut un autre camion.'],
    koffi: ['Je dois partir…', 'Mon camion est vide.']
  },
  {
    num: '07', scenario: 'sans', ton: 'bad', short: 'Le bilan', phase: 'Une occasion manquée des deux côtés',
    titre: 'Un trajet à vide, une marchandise qui attend',
    texte: 'Koffi supporte les frais du trajet sans revenu pour ce chargement. Awa perd du temps et doit continuer à chercher. Voyons maintenant les mêmes besoins avec une bourse de fret.',
    awa: ['Mon expédition est retardée.', '24 t toujours à l’entrepôt.'],
    koffi: ['J’ai roulé à vide.', 'Ce chargement m’a échappé.']
  },
  {
    num: '08', scenario: 'avec', ton: '', short: 'On reprend', phase: 'Les mêmes besoins, avec la Bourse',
    titre: 'Reprenons avant le départ, avec la Bourse',
    texte: 'Même camion, même cacao, même trajet Abidjan → Bouaké. Cette fois, Awa et Koffi disposent d’un espace commun pour publier et découvrir leurs offres.',
    awa: ['J’ai toujours 24 t à envoyer.', 'Cette fois, je publie.'],
    koffi: ['Mon camion est disponible.', 'Cette fois, je le rends visible.']
  },
  {
    num: '09', scenario: 'avec', ton: '', short: 'Awa publie', phase: 'Le besoin de transport devient visible',
    titre: 'Awa publie ses 24 tonnes de cacao',
    texte: 'Depuis son compte, Awa déclare son fret puis publie sa demande de transport d’Abidjan à Bouaké. Les transporteurs peuvent désormais découvrir son besoin sur le marché.',
    awa: ['Je publie mon besoin.', 'Cacao · 24 t · vers Bouaké'],
    koffi: ['Des besoins sont visibles.', 'Je peux chercher du fret.']
  },
  {
    num: '10', scenario: 'avec', ton: '', short: 'Koffi publie', phase: 'Le camion rejoint le marché',
    titre: 'Koffi annonce son camion de 25 tonnes',
    texte: 'Depuis son compte, Koffi publie la disponibilité de son camion bâché pour Abidjan → Bouaké. Le fret d’Awa et le camion de Koffi sont maintenant visibles au même endroit.',
    awa: ['Je peux voir les camions.', 'Lequel convient à mon cacao ?'],
    koffi: ['Je publie ma disponibilité.', 'Camion bâché · 25 t']
  },
  {
    num: '11', scenario: 'avec', ton: '', short: 'La découverte', phase: 'Awa repère une offre compatible',
    titre: 'Awa : « Ce camion correspond à mon besoin ! »',
    texte: 'Awa consulte les annonces et découvre celle de Koffi : même trajet, capacité suffisante. Cette recherche est accessible sans connexion ; aucun accord n’est encore engagé.',
    awa: ['J’ai trouvé un camion !', '25 t : assez pour mes 24 t.'],
    koffi: ['Mon offre est consultable.', 'J’attends une demande.']
  },
  {
    num: '12', scenario: 'avec', ton: '', short: 'La réservation', phase: 'Une demande, pas encore un accord',
    titre: 'Awa réserve le camion depuis son compte',
    texte: 'Awa se connecte et envoie sa réservation avec les droits requis. Un visiteur sans compte serait invité à s’inscrire. Koffi reçoit la demande, mais les coordonnées restent masquées.',
    awa: ['Je demande ce camion.', 'Ma réservation est envoyée.'],
    koffi: ['Awa demande mon camion.', 'Je dois examiner son besoin.']
  },
  {
    num: '13', scenario: 'avec', ton: '', short: 'L’acceptation', phase: 'Le transporteur donne son accord',
    titre: 'Koffi : « Oui, je peux transporter ce cacao. »',
    texte: 'Koffi vérifie le chargement et accepte la réservation. Awa reçoit son accord. Il lui reste à confirmer la mise en relation : l’acceptation seule ne révèle pas les contacts.',
    awa: ['Koffi a accepté !', 'À moi de confirmer.'],
    koffi: ['J’accepte la demande.', '24 t : mon camion convient.']
  },
  {
    num: '14', scenario: 'avec', ton: 'good', short: 'La confirmation', phase: 'La mise en relation est confirmée',
    titre: 'Awa confirme leur mise en relation',
    texte: 'Awa confirme après l’accord de Koffi. Le POC vérifie les deux soldes et simule les frais de mise en relation. Aucun paiement réel n’est effectué.',
    awa: ['Je confirme notre accord.', 'Les frais du POC sont simulés.'],
    koffi: ['La confirmation est reçue.', 'Notre mise en relation aboutit.']
  },
  {
    num: '15', scenario: 'avec', ton: 'good', short: 'Le deal validé', phase: 'Accord validé, coordonnées accessibles',
    titre: 'Le deal est validé : Awa et Koffi échangent',
    texte: 'La mise en relation est enregistrée et leurs coordonnées sont accessibles. Awa et Koffi peuvent se contacter, convenir des détails et organiser le chargement à Abidjan.',
    awa: ['J’ai les coordonnées de Koffi.', 'Organisons le chargement.'],
    koffi: ['Je peux joindre Awa.', 'Notre accord est validé.']
  },
  {
    num: '16', scenario: 'avec', ton: 'good', short: 'Départ chargé', phase: '24 tonnes prennent la route de Bouaké',
    titre: 'Cette fois, le camion part chargé',
    texte: 'Les 24 tonnes de cacao embarquent à Abidjan pour Bouaké. Awa a trouvé son transport et Koffi son chargement. La Bourse a organisé la rencontre ; Trans Lagunes réalise le transport.',
    awa: ['Mon cacao part pour Bouaké.', 'J’ai trouvé mon transport.'],
    koffi: ['24 tonnes à bord !', 'J’ai trouvé mon chargement.']
  }
];

let acte = 0;
const storyStage = $('.stage');
storyStage.style.setProperty('--story-tempo', '1');

function jouerActe(i, animer = true) {
  acte = Math.max(0, Math.min(i, ACTES.length - 1));
  const a = ACTES[acte];
  const animated = animer && !REDUIT;
  // Réinitialiser la même scène permet de rejouer son animation ponctuelle.
  if (animated && storyStage.dataset.scene === String(acte)) {
    storyStage.dataset.scene = '';
    void storyStage.offsetWidth;
  }
  storyStage.dataset.scene = String(acte);
  storyStage.dataset.scenario = a.scenario;
  storyStage.dataset.playing = 'true';
  storyStage.dataset.animate = String(animated);
  storyStage.style.setProperty('--story-progress', String(acte / (ACTES.length - 1)));

  const cap = $('#stage-caption');
  cap.className = 'stage-caption ' + a.ton;
  cap.setAttribute('aria-labelledby', 'stage-title');
  $('#stage-num').textContent = a.num;
  $('#stage-title').textContent = a.titre;
  $('#stage-text').textContent = a.texte;
  $('#stage-svg').setAttribute('aria-label', `Scène ${acte + 1} sur ${ACTES.length} : ${a.titre}`);
  $('.scene-phase', storyStage).textContent = a.phase;
  $('.stage-chapter-label', storyStage).textContent = a.scenario === 'sans'
    ? 'SCÉNARIO 1 · SANS LA BOURSE' : 'SCÉNARIO 2 · AVEC LA BOURSE';
  const voices = {
    'voice-awa-main': a.awa[0], 'voice-awa-sub': a.awa[1],
    'voice-koffi-main': a.koffi[0], 'voice-koffi-sub': a.koffi[1],
    'voice-awa-mobile': a.awa.join(' '), 'voice-koffi-mobile': a.koffi.join(' ')
  };
  Object.entries(voices).forEach(([id, value]) => {
    const node = $('#' + id);
    if (node) node.textContent = value;
  });

  $$('#stage-dots button').forEach((d, k) => {
    d.hidden = ACTES[k].scenario !== a.scenario;
    d.classList.toggle('active', k === acte);
    d.classList.toggle('done', k < acte);
    d.setAttribute('aria-selected', String(k === acte));
    d.tabIndex = k === acte ? 0 : -1;
  });
  $$('[data-story-scenario]', storyStage).forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.storyScenario === a.scenario));
  });
  $('#stage-prev').disabled = acte === 0;
  $('#stage-next').disabled = acte === ACTES.length - 1;
  $('#stage-next').innerHTML = acte === ACTES.length - 1
    ? `Scénarios terminés ${ic('check', 15)}`
    : `${acte === 6 ? 'Voir avec la Bourse' : 'Étape suivante'} ${ic('arrow-right', 15)}`;
  storyStage.dispatchEvent(new CustomEvent('b2f:storyscene', {detail: {index: acte, scenario: a.scenario}}));
}

$('#stage-dots').innerHTML = ACTES.map((a, i) =>
  `<button type="button" role="tab" id="stage-tab-${i}" data-scenario="${a.scenario}" aria-selected="false" aria-controls="stage-caption" aria-label="Étape ${i + 1} : ${a.titre}" title="${a.titre}"><b>${a.num}</b><span>${a.short}</span></button>`).join('');
$('#stage-caption').setAttribute('role', 'tabpanel');
$('#stage-caption').setAttribute('tabindex', '0');
$$('#stage-dots button').forEach((d, i) => d.addEventListener('click', () => jouerActe(i)));
$('#stage-dots').addEventListener('keydown', (e) => {
  const target = e.target.closest('button');
  if (!target) return;
  const visibleTabs = $$('#stage-dots button').filter(button => !button.hidden);
  let index = visibleTabs.indexOf(target);
  if (e.key === 'ArrowRight') index = (index + 1) % visibleTabs.length;
  else if (e.key === 'ArrowLeft') index = (index - 1 + visibleTabs.length) % visibleTabs.length;
  else if (e.key === 'Home') index = 0;
  else if (e.key === 'End') index = visibleTabs.length - 1;
  else return;
  e.preventDefault();
  visibleTabs[index].focus();
  visibleTabs[index].click();
});
$('#stage-next').addEventListener('click', () => jouerActe(acte + 1));
$('#stage-prev').addEventListener('click', () => jouerActe(acte - 1));
$('#stage-replay').addEventListener('click', () => jouerActe(0));
$$('[data-story-scenario]', storyStage).forEach(button => {
  button.addEventListener('click', () => jouerActe(button.dataset.storyScenario === 'avec' ? 7 : 0));
});

jouerActe(0, false);

/* Chiffres du bilan */
$('#stat-row').innerHTML = [
  ['Moins de vide', 'Trouver un chargement pour le prochain départ', 'var(--accent)'],
  ['Plus de visibilité', 'Des annonces regroupées, au-delà du carnet d’adresses', 'var(--warning)'],
  ['Un accord partagé', 'Chaque entreprise garde la main sur sa décision', 'var(--signature)'],
  ['Consultation libre', 'Un compte est requis pour agir sur une offre', 'var(--accent)']
].map(([v, l, c]) => `<div class="stat-box"><b style="color:${c}">${v}</b><span>${l}</span></div>`).join('');

/* ==========================================================================
   2. Les acteurs
   ========================================================================== */
const t = (mot, cle) => `<button class="term" data-term="${cle}">${mot}</button>`;

const ACTEURS = [
  {
    icon: 'package', titre: 'L’affréteur',
    intro: `Dans notre exemple, <strong>Awa représente Ivoire Cacao Export</strong>. Son entreprise a du ${t('fret', 'fret')} à expédier et cherche un camion adapté.`,
    fait: ['Déclare son fret et publie une demande de transport', 'Compare les offres et réserve un camion', 'Peut aussi accepter une proposition de transporteur', 'Confirme la mise en relation, puis clôture après livraison'],
    cle: 'Awa a la marchandise. La confirmation finale lui appartient.'
  },
  {
    icon: 'truck', titre: 'Le transporteur',
    intro: `<strong>Koffi représente Trans Lagunes</strong>. Il exploite les véhicules et réalise le transport. La ${t('carrosserie', 'carrosserie')}, les ${t('essieux', 'essieux')} et le ${t('PTAC', 'ptac')} font partie des caractéristiques du camion.`,
    fait: ['Publie ses camions disponibles et leurs trajets', 'Peut proposer un camion sur une demande de fret', 'Accepte ou refuse les réservations reçues', `Déclare le suivi et prévisualise le ${t('DUT', 'dut')} du dossier`],
    cle: 'Koffi a le camion. Il réalise le transport convenu avec Awa.'
  },
  {
    icon: 'users', titre: 'Les auxiliaires',
    intro: `Un ${t('auxiliaire', 'auxiliaire')} prépare les opérations pour son entreprise, selon sa délégation. <strong>Deux profils distincts</strong> existent dans le POC.`,
    fait: ['Côté affréteur : prépare le fret et peut réserver un camion', 'Côté transporteur : prépare les disponibilités et renseigne le suivi', 'Ne peut accepter ni réservation ni proposition', 'Ne peut pas confirmer la mise en relation'],
    cle: 'La préparation peut être déléguée ; les décisions engageant l’entreprise restent réservées aux comptes habilités.'
  },
  {
    icon: 'building', titre: 'Le concessionnaire',
    intro: `Le ${t('concessionnaire', 'concessionnaire')} est <strong>l’exploitant du service</strong>. Il accompagne les entreprises et gère leurs accès, leurs abonnements et leurs ${t('comptes prépayés', 'compte-prepaye')}.`,
    fait: ['Inscrit et suit les entreprises', 'Enregistre les crédits sur les comptes', 'Administre les tarifs et les abonnements', 'Ne réserve pas et ne confirme pas à la place des entreprises'],
    cle: 'Il exploite le service. Awa et Koffi restent responsables de leurs choix.'
  },
  {
    icon: 'shield', titre: 'La DGTTC',
    intro: `La ${t('DGTTC', 'dgttc')} dispose d’un <strong>espace de consultation et de contrôle</strong>, distinct de l’exploitation commerciale.`,
    fait: ['Consulte les déclarations, les véhicules et les transports', 'Vérifie les cartes de transport et leurs échéances', 'N’a pas accès aux montants ni aux soldes', 'Ne réserve, n’accepte et ne confirme aucune mise en relation'],
    cle: 'Le contrôle et les transactions restent séparés dans le POC.'
  },
  {
    icon: 'handshake', titre: 'La plateforme',
    intro: `Elle rend les annonces visibles et organise la ${t('mise en relation', 'mise-en-relation')}. <strong>Le transport reste réalisé par le transporteur.</strong>`,
    fait: ['Rassemble les demandes de fret et les disponibilités', 'Fait respecter les décisions de chaque entreprise', 'Simule les frais et ouvre les coordonnées à la confirmation', 'Conserve l’historique des actions déclarées'],
    cle: 'Un lieu de rencontre, avec un espace adapté aux droits de chacun.'
  }
];

/* ==========================================================================
   3. Simulation du parcours — 7 étapes
   ========================================================================== */
// Un seul exemple de frais pour le reçu et la section « Les frais ».
// Montants d’illustration ; les soldes ne sont pas ceux des comptes de démo.
const EXEMPLE = { soldeAffreteur: 420000, soldeTransporteur: 185000, fraisAffreteur: 15000, fraisTransporteur: 15000 };
const montantsExemple = {
  affreteur: EXEMPLE.fraisAffreteur,
  transporteur: EXEMPLE.fraisTransporteur,
  total: EXEMPLE.fraisAffreteur + EXEMPLE.fraisTransporteur
};
$$('[data-example-fee]').forEach(node => { node.textContent = fcfa(montantsExemple[node.dataset.exampleFee]); });

const ETAPES = [
  { titre: 'Awa publie sa demande de transport', court: 'Le fret' },
  { titre: 'Koffi publie son camion disponible', court: 'Le camion' },
  { titre: 'Awa réserve le camion', court: 'Réserver' },
  { titre: 'Koffi accepte la réservation', court: 'Accepter' },
  { titre: 'Awa confirme la mise en relation', court: 'Confirmer' },
  { titre: 'Les coordonnées deviennent accessibles', court: 'Échanger' },
  { titre: 'Koffi réalise le transport, Awa clôture le dossier', court: 'Livrer et clôturer' }
];

let etape = 0;

// Dialogues pédagogiques : les bulles représentent des actions, pas un chat privé.
const DIALOGUES = [
  [
    ['a', 'J’ai <strong>24 tonnes de cacao</strong> à transporter d’Abidjan à Bouaké. Depuis mon compte, je déclare mon fret puis publie ma demande de transport.'],
    ['system', 'La demande est visible sur le marché. Sa consultation est libre. <strong>Publier ne déclenche pas de frais de mise en relation</strong> ; les droits et l’abonnement de l’entreprise restent requis.']
  ],
  [
    ['b', 'Mon camion bâché peut transporter <strong>25 tonnes</strong> sur le trajet Abidjan → Bouaké. Je publie sa disponibilité pour la date convenue.'],
    ['system', 'Le fret et le camion sont visibles au même endroit. Chacun peut comparer les trajets, les dates et les capacités.'],
    ['a', 'J’ai repéré ce camion : il convient à mes 24 tonnes de cacao.']
  ],
  [
    ['a', 'Depuis mon compte, <strong>je réserve le camion</strong> pour ma demande de transport.'],
    ['system', 'Un visiteur serait invité à s’inscrire ou à se connecter avant cette action. La réservation est transmise à Koffi ; <strong>les coordonnées restent masquées.</strong>'],
    ['b', 'Je reçois la demande d’Awa. Je vérifie les dates, le trajet et le chargement avant de répondre.']
  ],
  [
    ['b', 'Le transport me convient. <strong>J’accepte la réservation.</strong>'],
    ['system', 'Koffi a accepté. Awa doit maintenant confirmer. Aucun frais de mise en relation n’a encore été prélevé.'],
    ['a', 'Je consulte les frais avant de confirmer mon choix.']
  ],
  [
    ['system', `Frais présentés avant confirmation : <strong>${fcfa(EXEMPLE.fraisAffreteur)} pour l’affréteur et ${fcfa(EXEMPLE.fraisTransporteur)} pour le transporteur.</strong> Ce sont les montants fictifs de la démonstration.`],
    ['a', 'J’ai pris connaissance des frais. <strong>Je confirme la mise en relation.</strong>'],
    ['receipt', `<strong>Confirmation réussie · frais simulés</strong><div class="chat-receipt-row"><span>Awa · −${fcfa(EXEMPLE.fraisAffreteur)}</span><b>${fcfa(EXEMPLE.soldeAffreteur - EXEMPLE.fraisAffreteur)} restants</b></div><div class="chat-receipt-row"><span>Koffi · −${fcfa(EXEMPLE.fraisTransporteur)}</span><b>${fcfa(EXEMPLE.soldeTransporteur - EXEMPLE.fraisTransporteur)} restants</b></div><small>Soldes fictifs de départ : ${fcfa(EXEMPLE.soldeAffreteur)} et ${fcfa(EXEMPLE.soldeTransporteur)}. Ils sont réunis ici pour expliquer le mécanisme ; dans son espace, chaque entreprise ne voit que son propre solde. Si l’un est insuffisant, la confirmation est refusée sans aucun débit. Aucun paiement réel.</small>`]
  ],
  [
    ['system', '<strong>L’accord est enregistré et les coordonnées deviennent accessibles.</strong> Les entreprises peuvent organiser le chargement.'],
    ['a', 'J’ai les contacts du transporteur et du chauffeur. Nous pouvons préciser le lieu et l’heure de chargement.'],
    ['b', 'Je peux joindre Awa pour préparer le départ. Le prix du transport se convient entre nos entreprises.']
  ],
  [
    ['b', 'Les 24 tonnes sont prises en charge. Je renseigne les étapes du transport : <strong>validé → à quai → chargé → en route → livré.</strong>'],
    ['system', 'Ce suivi repose sur les déclarations du transporteur. Il ne s’agit pas d’une position GPS en direct.'],
    ['a', 'Après la livraison, je vérifie le dossier et <strong>je le clôture</strong>.'],
    ['system', '<strong>Dossier clôturé.</strong> L’historique reste consultable. Koffi peut confirmer une nouvelle disponibilité pour son prochain trajet.']
  ]
];
let chatTimer, chatIndex = 0, chatAutomatic = false, chatPaused = false;
function chatBubble(message, animate = false) {
  const [who, body] = message;
  const labels = {a: 'Awa · Ivoire Cacao Export · Affréteur', b: 'Koffi · Trans Lagunes · Transporteur', system: 'La plateforme', receipt: 'La plateforme · Frais simulés'};
  const row = document.createElement('div');
  row.className = 'chat-row chat-' + who;
  row.innerHTML = `<div class="chat-bubble"><span class="chat-author">${labels[who]}</span><div>${body}</div></div>`;
  $('#chat-thread').append(row);
  if (animate && !REDUIT) row.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});
}
function chatScroll() { const thread = $('#chat-thread'); thread.scrollTop = thread.scrollHeight; }
function chatControls() {
  $('#chat-play').textContent = etape === ETAPES.length - 1 && chatIndex === DIALOGUES[etape].length ? 'Rejouer le parcours' : chatPaused ? 'Reprendre la lecture' : chatAutomatic ? 'Mettre en pause' : etape === 0 ? 'Lire le parcours' : 'Lire la suite';
  $('#chat-status').textContent = chatPaused ? 'Lecture en pause' : `Action ${etape + 1} / ${ETAPES.length} · ${chatIndex} / ${DIALOGUES[etape].length} messages`;
  $('#chat-reveal').disabled = chatIndex >= DIALOGUES[etape].length;
}
function nextChatMessage() {
  clearTimeout(chatTimer);
  if (chatPaused) return;
  const messages = DIALOGUES[etape];
  if (chatIndex < messages.length) chatBubble(messages[chatIndex++], true);
  if (REDUIT) {
    while (chatIndex < messages.length) chatBubble(messages[chatIndex++]);
  }
  chatScroll();
  const waiting = chatIndex < messages.length;
  $('#chat-typing').innerHTML = waiting ? '<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span> La suite arrive…' : '';
  if (!waiting && etape === ETAPES.length - 1) chatAutomatic = false;
  chatControls();
  if (waiting) chatTimer = setTimeout(nextChatMessage, 2200);
  else if (chatAutomatic && etape < ETAPES.length - 1) chatTimer = setTimeout(() => { etape++; paintSim(true); }, 3800);
  else if (etape === ETAPES.length - 1) $('#chat-status').textContent = 'Parcours terminé';
}
function paintSim(continueReading = false) {
  clearTimeout(chatTimer);
  if (!continueReading) chatAutomatic=false;
  chatPaused=false;chatIndex=0;
  $('#sim-label').textContent = `Action ${etape+1} sur ${ETAPES.length} — ${ETAPES[etape].titre}`;
  $('#sim-progress').setAttribute('aria-valuenow',String(etape+1));
  $('#sim-progress').setAttribute('aria-valuemax',String(ETAPES.length));
  $('#sim-progress').setAttribute('aria-valuetext',`${etape+1} sur ${ETAPES.length} : ${ETAPES[etape].titre}`);
  $('#sim-progress').innerHTML=ETAPES.map((_,i)=>`<i class="${i<etape?'done':i===etape?'current':''}"></i>`).join('');
  const thread=$('#chat-thread');thread.replaceChildren();
  for(let k=0;k<=etape;k++) {
    const label=document.createElement('div');label.className='chat-chapter';label.textContent=`${k+1} · ${ETAPES[k].titre}`;thread.append(label);
    if(k<etape) DIALOGUES[k].forEach(m=>chatBubble(m));
  }
  $('#sim-prev').disabled=etape===0;
  $('#sim-next').disabled=etape===ETAPES.length-1;
  $('#sim-next').innerHTML=etape===ETAPES.length-1?`Parcours terminé ${ic('check',17)}`:`Action suivante ${ic('arrow-right',17)}`;
  nextChatMessage();
  document.dispatchEvent(new Event('b2f:simulation'));
}
$('#chat-play').addEventListener('click',()=>{
  if(chatAutomatic&&!chatPaused){clearTimeout(chatTimer);chatPaused=true;$('#chat-typing').textContent='';chatControls();return;}
  chatAutomatic=true;chatPaused=false;
  if(etape===ETAPES.length-1&&chatIndex===DIALOGUES[etape].length){etape=0;paintSim(true);}else nextChatMessage();
});
$('#chat-reveal').addEventListener('click',()=>{
  clearTimeout(chatTimer);chatAutomatic=false;chatPaused=false;
  while(chatIndex<DIALOGUES[etape].length) chatBubble(DIALOGUES[etape][chatIndex++]);
  $('#chat-typing').textContent='';chatScroll();chatControls();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(chatTimer);chatPaused=true;$('#chat-typing').textContent='';chatControls();}});

$('#sim-next').addEventListener('click', () => { if (etape < ETAPES.length - 1) { etape++; paintSim(); } });
$('#sim-prev').addEventListener('click', () => { if (etape > 0) { etape--; paintSim(); } });
$('#sim-reset').addEventListener('click', () => { etape = 0; paintSim(); });
paintSim();

/* ==========================================================================
   4. Idées reçues
   ========================================================================== */
const IDEES = [
  ['Puis-je consulter les annonces sans compte ?',
   'Oui. Le marché public et la carte se consultent <strong>sans connexion</strong>. Pour sélectionner une offre ou publier, il faut s’inscrire ou se connecter, puis disposer des droits et de l’abonnement requis.'],
  ['Qui doit donner son accord ?',
   'Dans l’exemple, Awa réserve, Koffi accepte, puis Awa confirme. <strong>La confirmation finale appartient à l’affréteur.</strong> Si Koffi propose un camion sur une demande de fret, Awa accepte la proposition puis confirme.'],
  ['Que paie chaque entreprise ?',
   'Le POC distingue <strong>l’abonnement, les frais de mise en relation et le prix du transport</strong>. Les frais de mise en relation sont simulés à la confirmation. Le transport est convenu entre les entreprises. Les montants de cette démonstration ne sont pas des tarifs officiels.'],
  ['Un transporteur peut-il aussi choisir du fret ?',
   'Oui. Il peut consulter les demandes publiées et <strong>proposer un camion adapté</strong>. Le marché fonctionne dans les deux sens : chercher un camion ou chercher un chargement.'],
  ['La plateforme assure-t-elle le transport ?',
   'Le transporteur réalise le trajet selon les modalités convenues avec l’affréteur. La plateforme organise la rencontre et conserve les étapes déclarées. Elle ne remplace ni le transporteur ni l’assurance de la marchandise.'],
  ['Faut-il une grande flotte pour participer ?',
   'Le parcours permet de publier les disponibilités d’un véhicule comme de gérer une flotte. L’accès dépend des conditions d’inscription et des droits de l’entreprise. Les partenaires habituels peuvent continuer à travailler ensemble.']
];

$('#faq').innerHTML = IDEES.map(([q, r], i) => `
  <details>
    <summary><span class="tag">${i + 1}</span><span>${q}</span><span class="chev">${ic('chevron-right', 18)}</span></summary>
    <p class="answer">${r}</p>
  </details>`).join('');

/* ==========================================================================
   5. Quiz
   ========================================================================== */
const QUESTIONS = [
  {
    q: 'Qui est « l\'affréteur » ?',
    opts: ['Le chauffeur du camion', 'L\'entreprise qui a des marchandises à expédier', 'L\'entreprise qui possède les camions', 'L\'agent de contrôle de l\'État'],
    bonne: 1,
    expl: 'Dans notre exemple, Awa représente l’affréteur : elle organise le transport du cacao de son entreprise. Koffi représente le transporteur.'
  },
  {
    q: 'Quand les frais de mise en relation sont-ils simulés ?',
    opts: ['À l\'inscription sur la plateforme', 'Dès qu\'une annonce est publiée', 'Au moment où l\'expéditeur confirme, après l\'accord du transporteur', 'À la livraison de la marchandise'],
    bonne: 2,
    expl: 'Consulter le marché est libre. Les frais de mise en relation sont simulés à la confirmation et concernent les deux entreprises. L’abonnement est distinct.'
  },
  {
    q: 'Dans l’histoire, que se passe-t-il après la réservation d’Awa ?',
    opts: ['Le camion est automatiquement réservé et payé', 'Koffi accepte et les coordonnées sont immédiatement révélées', 'Koffi accepte, puis Awa confirme la mise en relation', 'La DGTTC doit autoriser leur accord'],
    bonne: 2,
    expl: 'Dans ce parcours, Koffi accepte puis Awa confirme la mise en relation. L’administration n’intervient pas dans leur accord.'
  },
  {
    q: 'Que peut faire la DGTTC sur la plateforme ?',
    opts: ['Consulter les transports et les cartes de transport, sans voir les montants', 'Valider les transports à la place des entreprises', 'Fixer les prix du transport', 'Créditer les comptes des entreprises'],
    bonne: 0,
    expl: 'Dans le POC, la DGTTC consulte les transports et les cartes de transport, sans montants ni soldes. Elle ne confirme aucune transaction.'
  },
  {
    q: 'Qu’est-ce qui devient accessible après la confirmation ?',
    opts: ['Une assurance sur sa marchandise', 'Une réduction sur le prix du transport', 'Les coordonnées du transporteur, du chauffeur et du camion retenus', 'Un abonnement d\'un an'],
    bonne: 2,
    expl: 'Les coordonnées nécessaires deviennent accessibles pour préparer le chargement. La confirmation ne paie pas le transport et ne constitue pas une assurance.'
  }
];

let qIdx = 0, score = 0, repondu = false;

function paintQuiz() {
  if (qIdx >= QUESTIONS.length) {
    const msg = score === 5 ? 'Sans faute. Vous avez compris les points essentiels du parcours.'
      : score >= 4 ? 'Très bon résultat. L\'essentiel est acquis.'
      : score >= 3 ? 'Correct. Une relecture de la simulation lèvera les derniers doutes.'
      : 'Le mécanisme mérite un second passage — reprenez la simulation étape par étape, c\'est là que tout se joue.';
    $('#quiz-box').innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="width:66px;height:66px;border-radius:50%;background:var(--signature-soft);color:var(--signature);display:grid;place-items:center;margin:0 auto 20px">
          ${ic('check', 32)}
        </div>
        <h3 style="font-size:24px">${score} bonnes réponses sur ${QUESTIONS.length}</h3>
        <p class="lede" style="margin:12px auto 26px">${msg}</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <button type="button" class="btn btn-secondary" id="quiz-again">${ic('refresh', 16)} Refaire le test</button>
          <a class="btn btn-primary" href="#parcours">Revoir la simulation</a>
        </div>
      </div>`;
    $('#quiz-again').addEventListener('click', () => { qIdx = 0; score = 0; repondu = false; paintQuiz(); });
    return;
  }

  const q = QUESTIONS[qIdx];
  repondu = false;
  $('#quiz-box').innerHTML = `
    <p class="quiz-score">Question ${qIdx + 1} sur ${QUESTIONS.length}</p>
    <p class="quiz-q">${q.q}</p>
    <div class="quiz-opts" id="quiz-opts">
      ${q.opts.map((o, i) => `
        <button type="button" class="quiz-opt" data-i="${i}">
          <span class="letter">${'ABCD'[i]}</span><span>${o}</span>
        </button>`).join('')}
    </div>
    <div id="quiz-fb" role="status"></div>
    <div class="quiz-foot">
      <span class="quiz-score" id="quiz-tally">${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} jusqu'ici</span>
      <button type="button" class="btn btn-primary" id="quiz-next" disabled>
        ${qIdx === QUESTIONS.length - 1 ? 'Voir mon résultat' : 'Question suivante'} ${ic('arrow-right', 17)}
      </button>
    </div>`;

  $$('#quiz-opts .quiz-opt').forEach((b) => {
    b.addEventListener('click', () => {
      if (repondu) return;
      repondu = true;
      const choisi = Number(b.dataset.i);
      const juste = choisi === q.bonne;
      if (juste) score++;
      $$('#quiz-opts .quiz-opt').forEach((x, i) => {
        x.disabled = true;
        if (i === q.bonne) x.classList.add('right');
        else if (i === choisi) x.classList.add('wrong');
      });
      $('#quiz-fb').innerHTML = `<div class="quiz-feedback">
        <strong>${juste ? 'Exact.' : 'Pas tout à fait.'}</strong> ${q.expl}</div>`;
      $('#quiz-next').disabled = false;
      $('#quiz-tally').textContent = `${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} jusqu'ici`;
    });
  });

  $('#quiz-next').addEventListener('click', () => { qIdx++; paintQuiz(); });
}
paintQuiz();

/* ==========================================================================
   6. Glossaire complet — généré depuis la même source que les infobulles,
   pour qu'aucun terme défini ne reste inaccessible.
   ========================================================================== */
$('#glossaire-liste').innerHTML = Object.values(GLOSSAIRE)
  .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  .map(([mot, def]) => `
    <div class="card">
      <h3 style="color:var(--accent)">${mot}</h3>
      <p class="note" style="margin-top:8px;font-size:15px">${def}</p>
    </div>`).join('');
