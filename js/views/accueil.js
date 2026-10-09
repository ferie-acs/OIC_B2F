import { menuPublic } from '../core/menu-public.js?v=20261009-carte-2';
import { offresAccueil } from '../core/accueil-offres.js?v=20261009-carte-2';
import { ecosystemeAccueil } from '../core/accueil-ecosysteme.js';
import { animerAccueil } from '../core/accueil-motion.js?v=20261009-carte-2';
import { el, icone } from '../core/dom.js';
import { cataloguePublic } from '../services/marche-public.service.js';

export function accueil(ctx) {
  const root=el('main.oic-landing.th-home',{id:'contenu',tabindex:'-1'});
  const link=(text,href,cls='th-button')=>el('a',{href,class:cls},[text,icone('arrow-right',18)]);
  const label=text=>el('span.th-label',{text});
  const title=(eyebrow,heading,description)=>el('div.th-heading',{},[label(eyebrow),el('h2',{text:heading}),...(description?[el('p',{text:description})]:[])]);
  const actor=(icon,kicker,heading,body,href)=>el('a.th-actor',{href},[el('span.th-actor-icon',{},[icone(icon,26)]),el('div',{},[el('small',{text:kicker}),el('strong',{text:heading}),el('p',{text:body})]),el('span.th-arrow',{},[icone('arrow-right',20)])]);
  const motionButton=el('button.th-motion',{type:'button','aria-pressed':'false',text:'Mettre les animations en pause'});
  root.append(el('section.th-opening',{},[
    menuPublic('accueil'),
    el('div.th-hero',{},[
      el('div.th-hero-copy',{},[label('LA BOURSE DE FRET DE CÔTE D’IVOIRE'),el('h1',{},['Votre fret.',el('br'),'Votre camion.',el('br'),el('span',{text:'La bonne rencontre.'})]),el('p.th-hero-intro',{text:'Rapprochons les marchandises à transporter et les camions disponibles. Votre prochain trajet commence ici.'}),
        el('div.th-actors',{},[
          actor('package','AFFRÉTEUR · CHARGEUR','Je cherche un camion','Trouvez un véhicule pour vos marchandises.','#/explorer?type=camions'),
          actor('truck','TRANSPORTEUR','Je cherche du fret','Trouvez un chargement pour votre camion.','#/explorer?type=frets')
        ]),el('p.th-free',{},[icone('check',16),'Consultez les annonces librement, sans connexion.'])]),
      el('div.th-hero-picture',{},[el('img',{src:'assets/bourse-fret-originale.png',alt:'Marchandises et camion reliés par un trajet dans un décor inspiré d’Abidjan',width:'1536',height:'1024',fetchpriority:'high'}),el('div.th-image-note',{},[el('span.th-status-dot'),el('div',{},[el('strong',{text:'Deux besoins. Une plateforme.'}),el('small',{text:'Des opportunités à chaque départ.'})])])])
    ]),
    el('div.th-hero-bottom',{},[el('span',{text:'ABIDJAN  /  BOUAKÉ  /  SAN-PÉDRO  /  YAMOUSSOUKRO'}),motionButton])
  ]));
  root.append(offresAccueil(cataloguePublic(),ctx));
  root.append(el('section.th-section.th-about.lp-reveal',{id:'th-about'},[
    el('div.th-photo-stack',{},[el('div.th-photo-frame',{},[el('img',{src:'assets/port-abidjan.png',alt:'Terminal à conteneurs du Port autonome d’Abidjan',loading:'lazy',width:'900',height:'603'})]),el('div.th-photo-caption',{},[icone('building',27),el('strong',{text:'Ancrée en Côte d’Ivoire.'}),el('span',{text:'Au service des échanges.'})])]),
    el('div',{},[title('UNE PLATEFORME, DES RENCONTRES UTILES','Le lien entre vos marchandises et la route.','La Bourse de Fret de l’Office Ivoirien des Chargeurs rassemble les besoins d’expédition et les disponibilités de transport. Chaque entreprise garde la main sur ses choix.'),el('div.th-about-points',{},[['search','Un marché accessible','Explorez les annonces avant de créer un compte.'],['handshake','Un accord partagé','Réservez, échangez votre accord et confirmez.']].map(([i,t,d])=>el('div',{},[icone(i,25),el('strong',{text:t}),el('p',{text:d})]))),link('Découvrir le fonctionnement','comprendre.html')])
  ]));
  root.append(ecosystemeAccueil());
  // Une seule section pour le parcours : « ce que vous pouvez faire » répétait
  // les mêmes trois étapes, avec la même numérotation et les mêmes icônes.
  // Chaque étape porte désormais son action, au lieu de la renvoyer plus bas.
  const etapes=[
    ['01','search','Trouvez votre opportunité','Parcourez les frets et les camions disponibles. Affinez votre recherche par trajet et capacité.',[['Voir les camions','#/explorer?type=camions'],['Voir les frets','#/explorer?type=frets']]],
    ['02','handshake','Confirmez votre accord','Connectez-vous pour réserver, accepter et confirmer. Les frais sont présentés avant validation.',[['Accéder à mon espace','#/connexion']]],
    ['03','truck','Préparez le transport','Après validation, accédez aux coordonnées et suivez les étapes déclarées avec votre partenaire.',[['Voir le parcours en détail','comprendre.html#parcours']]]
  ];
  root.append(el('section.th-section.th-process',{id:'th-process'},[title('COMMENT ÇA MARCHE','Trois étapes. Un prochain départ.','Du premier besoin à l’organisation du transport, avancez avec un parcours lisible.'),el('div.th-process-grid',{},etapes.map(([n,i,t,d,actions])=>el('article.lp-reveal',{},[el('div.th-process-icon',{},[icone(i,34),el('span',{text:n})]),el('h3',{text:t}),el('p',{text:d}),el('div.th-process-links',{},actions.map(([libelle,href])=>link(libelle,href,'th-text-link')))]))),link('Voir le parcours animé','comprendre.html#parcours','th-button th-button-dark')]));
  root.append(el('section.th-trust',{},[el('div.th-section.th-trust-grid',{},[
    el('div.th-trust-photo',{},[el('div.th-photo-frame',{},[el('img',{src:'assets/abidjan-plateau.png',alt:'Le Plateau et la lagune à Abidjan',loading:'lazy'})]),el('span',{text:'LE PLATEAU · ABIDJAN'})]),
    el('div',{},[title('UNE INFORMATION QUI RAPPROCHE','Plus de visibilité. Des décisions qui vous appartiennent.','La plateforme facilite la mise en relation. Le transport reste assuré par le transporteur, selon les modalités convenues entre les entreprises.'),el('div.th-trust-items',{},[['shield','Des contacts protégés','Les coordonnées sont accessibles après validation.'],['users','Un espace pour votre métier','Affréteurs, transporteurs et gestionnaires disposent de vues adaptées.'],['truck','Le prochain chargement','Après livraison, le transporteur confirme une nouvelle disponibilité.']].map(([i,t,d])=>el('div',{},[icone(i,24),el('div',{},[el('h3',{text:t}),el('p',{text:d})])]))),link('Découvrir les espaces démo','#/connexion')])
  ])]));
  const faqs=[['Faut-il se connecter pour consulter le marché ?','Non. Les annonces et la carte sont accessibles librement. La connexion intervient pour publier ou agir sur une annonce, selon les droits de votre compte.'],['Qui peut utiliser la Bourse de Fret ?','Les entreprises qui recherchent un camion, les transporteurs qui recherchent du fret et les acteurs habilités à accompagner ou administrer les opérations.'],['La plateforme assure-t-elle le transport ?','Non. Elle rapproche les acteurs et accompagne leurs accords. Le transporteur réalise le transport selon les conditions convenues entre les entreprises.'],['Les données et paiements sont-ils réels ?','Cette version est un POC avec des données fictives. Aucun paiement réel n’est effectué. Les tarifs officiels restent à confirmer auprès de l’OIC.']];
  root.append(el('section.th-section.th-faq',{id:'th-faq'},[title('VOS QUESTIONS','L’essentiel avant de prendre la route.','Le marché est ouvert. Découvrez son fonctionnement en quelques réponses.'),el('div',{},faqs.map(([q,a])=>el('details',{},[el('summary',{text:q}),el('p',{text:a})])))]));
  root.append(el('section.th-cta',{},[el('div.th-section',{},[el('div',{},[label('VOTRE PROCHAIN TRAJET COMMENCE ICI'),el('h2',{text:'Un camion à trouver ? Un fret à transporter ?'})]),el('div.th-cta-actions',{},[link('Je cherche un camion','#/explorer?type=camions'),link('Je cherche du fret','#/explorer?type=frets','th-button th-button-white')])])]));
  root.append(el('footer.th-footer',{},[el('div.th-section.th-footer-grid',{},[
    el('div',{},[el('strong.th-footer-brand',{text:'Bourse de Fret'}),el('p',{text:'Office Ivoirien des Chargeurs'}),el('p',{text:'La rencontre du fret et du camion, en Côte d’Ivoire.'})]),
    el('div',{},[el('h3',{text:'Le marché'}),el('a',{href:'#/explorer?type=camions',text:'Camions disponibles'}),el('a',{href:'#/explorer?type=frets',text:'Frets à transporter'}),el('a',{href:'#/explorer',text:'Carte des annonces'})]),
    el('div',{},[el('h3',{text:'La plateforme'}),el('a',{href:'comprendre.html',text:'Comprendre la Bourse de Fret'}),el('a',{href:'comprendre.html#acteurs',text:'Les acteurs'}),el('a',{href:'#/connexion',text:'Accéder à mon espace'})])
  ]),el('div.th-footer-bottom',{},[el('span',{text:'B2F · Côte d’Ivoire · Preuve de concept · Données fictives'}),el('a',{href:'#/accueil',text:'Retour en haut ↑',on:{click:()=>root.scrollIntoView({behavior:'smooth'})}})])]));
  root.append(el('details.th-credits',{},[el('summary',{text:'Crédits des visuels'}),el('p',{},['Port : Autorité PAA — ',el('a',{href:"https://commons.wikimedia.org/wiki/File:Port_d%27ABIDJAN.png",text:'Wikimedia Commons'}),' · CC BY-SA 4.0. Cadrage à l’affichage.']),el('p',{},['Plateau : ព្រះមហាក្សត្ររាជ — ',el('a',{href:'https://commons.wikimedia.org/wiki/File:Abidjan_Plateau.png',text:'Wikimedia Commons'}),' · CC0.']),el('p',{text:'Illustration du hero générée pour ce POC. Composition inspirée du template TransHub, contenu adapté à la Bourse de Fret.'})]));
  // Le routeur insère la vue après son retour : au moment où l'on arrive ici,
  // `root` n'est pas encore dans le document. On réessaie donc jusqu'au montage.
  //
  // Volontairement `setTimeout` et non `requestAnimationFrame` : dans un onglet
  // ouvert en arrière-plan, les frames sont gelées et l'accueil restait sans
  // aucune animation — ni apparitions, ni section écosystème, ni ligne de
  // progression. Les délais, eux, continuent de s'écouler.
  let essais=0;
  (function armerQuandMonte(){
    if(root.isConnected){animerAccueil(root,motionButton);return;}
    if(++essais>120)return;
    setTimeout(armerQuandMonte,16);
  })();
  return root;
}
