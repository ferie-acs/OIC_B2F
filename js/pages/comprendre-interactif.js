/* Interactions pédagogiques : aucune écriture dans les données du POC. */
'use strict';
const familles = ['Publier du fret', 'Proposer un camion', 'Préparer selon sa délégation', 'Exploiter le service', 'Contrôler les transports', 'Organiser la rencontre'];
const relations = [
  ['Le transporteur', 'truck', 'Publie son besoin · réserve · confirme'],
  ['L’affréteur', 'package', 'Propose un camion · accepte · transporte'],
  ['Leur entreprise', 'building', 'Préparent les opérations selon leur délégation'],
  ['Les entreprises', 'users', 'Accompagne les inscriptions et les comptes'],
  ['Les transports', 'truck', 'Consulte et contrôle, sans intervenir dans les transactions'],
  ['Les deux entreprises', 'handshake', 'Rend les annonces visibles et organise les accords']
];
const exemplesActeurs = [
  { libelle: 'Voir les actions d’Awa', cible: '#parcours', etape: 0 },
  { libelle: 'Voir les actions de Koffi', cible: '#parcours', etape: 1 },
  { libelle: 'Voir le parcours des entreprises', cible: '#parcours', etape: 0 },
  { libelle: 'Comprendre les frais et les comptes', cible: '#argent' },
  { libelle: 'Consulter les termes du transport', cible: '#glossaire' },
  { libelle: 'Voir la mise en relation', cible: '#parcours', etape: 5 }
];
$('#actors').innerHTML = `<div class="actor-menu" aria-label="Choisir un acteur">${ACTEURS.map((a,i)=>`<button class="actor-choice" type="button" data-choice="${i}" aria-pressed="false" aria-controls="actor-detail"><span class="actor-icon">${ic(a.icon,21)}</span><span><strong>${a.titre}</strong><small>${familles[i]}</small></span></button>`).join('')}<p class="actor-count">5 familles d’acteurs + la plateforme</p></div><div class="actor-detail" id="actor-detail" role="region" aria-label="Responsabilités de l’acteur"></div>`;
let actorAnimation;
function choisirActeur(i){
  const a=ACTEURS[i], r=relations[i], exemple=exemplesActeurs[i];
  $$('.actor-choice').forEach((b,k)=>b.setAttribute('aria-pressed',String(i===k)));
  const detail=$('#actor-detail');
  detail.innerHTML=`<div class="actor-network"><div class="actor-network-label"><span>Les échanges</span><span>0${i+1} / 06</span></div><div class="network-track"><div class="network-node">${ic(a.icon,28)}<strong>${a.titre}</strong></div><div class="network-pipe" aria-hidden="true"></div><div class="network-node">${ic(r[1],28)}<strong>${r[0]}</strong></div></div><p class="network-relation">${r[2]}</p></div><div class="actor-content"><span class="eyebrow">${familles[i]}</span><h3>${a.titre}</h3><p>${a.intro}</p><div class="actor-actions">${a.fait.map(f=>`<div class="actor-action">${ic('check',16)}<span>${f}</span></div>`).join('')}</div><div class="actor-key">${a.cle}</div><button class="btn btn-primary btn-sm" type="button" id="actor-example">${exemple.libelle} ${ic('arrow-right',15)}</button></div>`;
  actorAnimation?.cancel();
  if(!REDUIT) actorAnimation=detail.animate([{opacity:.45,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'ease-out'});
  $('#actor-example').addEventListener('click',()=>{
    if(exemple.etape !== undefined){etape=exemple.etape;paintSim();syncSteps();}
    const cible=$(exemple.cible);
    cible.scrollIntoView({behavior:REDUIT?'instant':'smooth'});
    const focus=exemple.etape !== undefined ? $('#sim-label') : $('h2',cible);
    focus.setAttribute('tabindex','-1');focus.focus({preventScroll:true});
  });
}
$$('.actor-choice').forEach((b,i)=>b.addEventListener('click',()=>choisirActeur(i)));
choisirActeur(0);

const tools = document.createElement('div');
tools.className = 'stage-tools';
tools.innerHTML = `<div class="stage-tools-group"><button type="button" class="btn btn-primary btn-sm" id="stage-play" aria-pressed="false" aria-controls="stage-svg">Lire les deux scénarios ${ic('arrow-right', 16)}</button><label for="stage-speed">Rythme</label><select id="stage-speed"><option value="1">Normal</option><option value="0.65">Rapide</option><option value="1.4">Prendre le temps</option></select></div><span class="stage-status" id="stage-status" role="status">Deux scénarios · ${ACTES.length} étapes à explorer</span>`;
storyStage.prepend(tools);
let storyTimer = null;
let storyPlaying = false;
let storyRemaining = 0;
let storyDeadline = 0;
let storyTempo = 1;
let storyStarted = false;

function paintStoryButton() {
  const label = acte === ACTES.length - 1 && storyRemaining <= 0
    ? 'Rejouer les deux scénarios'
    : storyStarted ? 'Reprendre la lecture'
      : acte === 0 ? 'Lire les deux scénarios'
        : acte === 7 ? 'Lire avec la Bourse' : 'Lire la suite';
  $('#stage-play').innerHTML = storyPlaying
    ? `Mettre en pause`
    : `${label} ${ic('arrow-right', 16)}`;
  $('#stage-play').setAttribute('aria-pressed', String(storyPlaying));
}

function storyPosition() {
  return `${acte + 1}/${ACTES.length} · ${ACTES[acte].scenario === 'sans' ? 'Sans la Bourse' : 'Avec la Bourse'}`;
}

function pauseStory() {
  if (storyPlaying) storyRemaining = Math.max(0, storyDeadline - performance.now());
  clearTimeout(storyTimer);
  storyPlaying = false;
  storyStage.dataset.playing = 'false';
  paintStoryButton();
  $('#stage-status').textContent = `En pause · ${storyPosition()}`;
}

function scheduleStory(remaining = 0) {
  clearTimeout(storyTimer);
  // Laisser le temps de lire les scènes les plus détaillées avant d’avancer.
  const duration = Math.max(8000, ACTES[acte].texte.split(/\s+/).length * 260 + 1600) * storyTempo;
  const delay = remaining > 0 ? remaining : duration;
  storyDeadline = performance.now() + delay;
  storyTimer = setTimeout(() => {
    if (!storyPlaying) return;
    storyRemaining = 0;
    if (acte === ACTES.length - 1) {
      storyPlaying = false;
      storyStage.dataset.playing = 'false';
      paintStoryButton();
      $('#stage-status').textContent = 'Lecture terminée · un accord, un départ chargé';
      return;
    }
    jouerActe(acte + 1);
    $('#stage-status').textContent = `Lecture · ${storyPosition()}`;
    scheduleStory();
  }, delay);
}

$('#stage-play').addEventListener('click', () => {
  if (storyPlaying) { pauseStory(); return; }
  if (acte === ACTES.length - 1 && storyRemaining <= 0) {
    storyRemaining = 0;
    jouerActe(0);
  } else if (!storyStarted) {
    jouerActe(acte);
  }
  storyStarted = true;
  storyPlaying = true;
  storyStage.dataset.playing = 'true';
  paintStoryButton();
  $('#stage-status').textContent = `Lecture · ${storyPosition()}`;
  scheduleStory(storyRemaining);
  storyRemaining = 0;
});

$('#stage-speed').addEventListener('change', () => {
  const nextTempo = Number($('#stage-speed').value);
  const remaining = storyPlaying ? Math.max(0, storyDeadline - performance.now()) : storyRemaining;
  storyRemaining = remaining * nextTempo / storyTempo;
  storyTempo = nextTempo;
  storyStage.style.setProperty('--story-tempo', String(storyTempo));
  if (storyPlaying) { scheduleStory(storyRemaining); storyRemaining = 0; }
});

storyStage.addEventListener('click', e => {
  if (!e.target.closest('.stage-controls button, [data-story-scenario]')) return;
  clearTimeout(storyTimer);
  storyPlaying = false;
  storyRemaining = 0;
  storyStarted = false;
  // Le choix manuel joue seulement la transition de la scène sélectionnée.
  storyStage.dataset.playing = 'true';
  paintStoryButton();
  $('#stage-status').textContent = `Exploration libre · ${storyPosition()}`;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseStory();
});

const steps=document.createElement('div');steps.className='step-picker';steps.setAttribute('aria-label','Étapes du parcours');
steps.innerHTML=ETAPES.map(({titre,court},i)=>`<button type="button" aria-pressed="false" title="${titre}"><b>0${i+1}</b>${court}</button>`).join('');$('.sim').prepend(steps);
document.addEventListener('b2f:simulation',()=>syncSteps());
function syncSteps(){[...steps.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===etape)));}
[...steps.children].forEach((b,i)=>b.addEventListener('click',()=>{etape=i;paintSim();syncSteps();}));
['sim-next','sim-prev','sim-reset'].forEach(id=>$('#'+id).addEventListener('click',syncSteps));syncSteps();

const progress=document.createElement('div');progress.className='read-progress';progress.setAttribute('aria-hidden','true');$('.topbar').append(progress);
function reading(){const total=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${total>0?scrollY/total:0})`;const sections=$$('main section[id]');let current=sections[0]?.id;sections.forEach(s=>{if(s.getBoundingClientRect().top<180)current=s.id;});$$('.topbar nav a').forEach(a=>{if(a.hash==='#'+current)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}
window.addEventListener('scroll',reading,{passive:true});reading();
