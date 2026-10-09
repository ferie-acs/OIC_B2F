/**
 * Mouvements de l’accueil, pilotés par le défilement sans bloquer la navigation.
 *
 * ## La règle de sûreté : jamais de contenu masqué sans surveillance
 *
 * L’apparition au défilement masque du texte (`opacity:0`) en attendant qu’un
 * `IntersectionObserver` le révèle. Si cet observateur meurt avant d’avoir fait
 * son travail, le contenu reste **invisible pour toujours** — c’est arrivé : le
 * nettoyage était branché sur `hashchange`, et une simple navigation interne
 * vidait la page de son titre, de ses annonces et de son pied de page.
 *
 * D’où l’invariant, tenu par `armer()` et `desarmer()` : le masquage n’existe
 * que tant que `th-scroll-ready` est posée, et **`clean()` la retire toujours**.
 * Quelle que soit la raison de l’arrêt, la page redevient lisible. Le cycle de
 * vie suit l’attachement réel au document, pas un événement de navigation.
 *
 * @param {HTMLElement} root  Racine de la vue, déjà attachée au document.
 * @param {HTMLElement} button  Bascule « mettre les animations en pause ».
 * @returns {() => void} Nettoyage, idempotent.
 */
export function animerAccueil(root, button) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  const assembly = root.querySelector('.lp-assembly');
  const sticky = assembly?.querySelector('.lp-assembly-sticky');
  const process = root.querySelector('.th-process-grid');
  const photos = [...root.querySelectorAll('.th-hero-picture, .th-photo-frame')];
  const nodes = new Set();
  let paused = false, frame = 0, dead = false, veille = 0;
  const disabled = () => paused || reduced.matches;
  const clamp = value => Math.min(1, Math.max(0, value));
  const reveal = node => { node.classList.add('is-revealed'); observer?.unobserve(node); };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
  }, {threshold: .08, rootMargin: '0px 0px -24px 0px'}) : null;

  function register(node, index = 0, kind = 'rise') {
    if (nodes.has(node)) return;
    nodes.add(node);
    node.dataset.scrollReveal = kind;
    node.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 85}ms`);
    if (disabled() || !observer || node.contains(document.activeElement)) reveal(node);
    else observer.observe(node);
  }
  function group(selector, kind = 'rise') {
    root.querySelectorAll(selector).forEach((node, index) => register(node, index, kind));
  }
  root.querySelectorAll('.th-heading').forEach(heading => {
    [...heading.children].forEach((node, index) => register(node, index));
  });
  group('.th-hero-copy > .th-label, .th-hero-copy h1, .th-hero-intro');
  group('.th-actors > a');
  group('.th-image-note', 'soft');
  group('.th-map-workspace', 'soft');
  group('.th-photo-stack, .th-trust-photo', 'photo');
  ['.th-process-grid', '.th-about-points', '.th-trust-items', '.th-faq > div:last-child', '.th-cta-actions', '.th-footer-grid'].forEach(selector => {
    const parent = root.querySelector(selector);
    if (parent) [...parent.children].forEach((node, index) => register(node, index));
  });
  group('.th-cta .th-label, .th-cta h2');

  // Les cartes sont recréées quand les filtres ou la sélection changent.
  const list = root.querySelector('.th-map-list');
  function registerOffers() {
    nodes.forEach(node => {
      if (!root.contains(node)) { observer?.unobserve(node); nodes.delete(node); }
    });
    list?.querySelectorAll('.th-map-offer').forEach((node, index) => register(node, index, 'offer'));
  }
  registerOffers();
  const offersObserver = new MutationObserver(registerOffers);
  if (list) offersObserver.observe(list, {childList: true});

  function draw() {
    frame = 0;
    if (dead || disabled() || document.hidden) return;
    if (!root.isConnected) { clean(); return; }
    if (assembly && sticky) {
      const bounds = assembly.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(sticky).top) || 0;
      const travel = Math.max(1, assembly.offsetHeight - sticky.offsetHeight);
      assembly.style.setProperty('--assembly', clamp((top - bounds.top) / travel).toFixed(4));
    }
    if (process) {
      const bounds = process.getBoundingClientRect();
      process.style.setProperty('--route-progress', clamp((innerHeight * .85 - bounds.top) / (innerHeight * .55)).toFixed(4));
    }
    if (!mobile.matches) photos.forEach(photo => {
      const bounds = photo.getBoundingClientRect();
      if (bounds.bottom < -80 || bounds.top > innerHeight + 80) return;
      const progress = clamp((innerHeight - bounds.top) / (innerHeight + bounds.height));
      const amplitude = photo.classList.contains('th-hero-picture') ? 34 : 24;
      photo.style.setProperty('--photo-drift', `${((progress - .5) * 2 * amplitude).toFixed(1)}px`);
    });
  }
  function schedule() {
    if (!dead && !frame && !disabled()) frame = requestAnimationFrame(draw);
  }
  function resetPhotos() { photos.forEach(photo => photo.style.setProperty('--photo-drift', '0px')); }
  function apply() {
    root.classList.toggle('lp-motion-off', disabled());
    button.textContent = reduced.matches ? 'Animations réduites' : paused ? 'Relancer les animations' : 'Mettre les animations en pause';
    button.setAttribute('aria-pressed', String(disabled()));
    button.disabled = reduced.matches;
    if (disabled()) {
      cancelAnimationFrame(frame); frame = 0;
      resetPhotos(); assembly?.style.setProperty('--assembly', '1');
      process?.style.setProperty('--route-progress', '1');
      nodes.forEach(reveal);
    } else schedule();
  }
  function toggle() { paused = !paused; apply(); }
  function resize() { resetPhotos(); schedule(); }
  // Le clavier ne doit jamais atteindre un contrôle encore transparent.
  function focus(event) {
    const item = event.target.closest('[data-scroll-reveal]');
    if (item) reveal(item);
  }
  function clean() {
    if (dead) return;
    dead = true; cancelAnimationFrame(frame); clearInterval(veille); clearTimeout(controle);
    observer?.disconnect(); offersObserver.disconnect();
    detache?.disconnect();
    // Sans surveillance, plus de masquage : la page redevient lisible, même si
    // l'arrêt survient au milieu d'une apparition.
    desarmer();
    button.removeEventListener('click', toggle);
    root.removeEventListener('focusin', focus);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', schedule);
    document.removeEventListener('visibilitychange', filet);
    window.removeEventListener('scroll', filet);
    reduced.removeEventListener('change', apply);
    mobile.removeEventListener('change', resize);
  }

  /** Le masquage ne s'applique qu'une fois l'observateur en place. */
  function armer() { root.classList.add('lp-motion-ready', 'th-scroll-ready'); }

  /**
   * Filet : révèle ce qui est à l'écran sans attendre l'observateur.
   *
   * `IntersectionObserver` ne délivre rien tant que l'onglet est caché, et un
   * nœud placé dans un conteneur à défilement propre peut ne jamais produire
   * d'entrée. Plutôt que de laisser du texte transparent en espérant un rappel,
   * on vérifie périodiquement la géométrie réelle. Le filet s'arrête de lui-même
   * dès qu'il n'y a plus rien à révéler.
   */
  function filet() {
    if (dead) return;
    for (const node of nodes) {
      if (node.classList.contains('is-revealed')) continue;
      const bounds = node.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < innerHeight) reveal(node);
    }
    if ([...nodes].every(node => node.classList.contains('is-revealed'))) {
      clearInterval(veille); veille = 0;
    }
  }

  /** Retrait du masquage : les apparitions en cours se figent à l'état visible. */
  function desarmer() {
    root.classList.remove('th-scroll-ready');
    nodes.forEach(node => node.classList.add('is-revealed'));
  }
  armer();
  // Le routeur remplace le contenu de `#app` sans prévenir personne. On surveille
  // donc le détachement réel de la vue : c'est le seul signal qui ne ment pas.
  // Vérification différée : un re-rendu peut détacher puis rattacher la vue en
  // quelques millisecondes. On ne nettoie que si le détachement dure.
  let controle = 0;
  const detache = root.parentNode && 'MutationObserver' in window
    ? new MutationObserver(() => {
        clearTimeout(controle);
        controle = setTimeout(() => { if (!root.isConnected) clean(); }, 2000);
      })
    : null;
  if (detache && root.parentNode) detache.observe(root.parentNode, {childList: true});
  button.addEventListener('click', toggle);
  root.addEventListener('focusin', focus);
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', resize, {passive: true});
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('visibilitychange', filet);
  window.addEventListener('scroll', filet, {passive: true});
  veille = setInterval(filet, 1500);
  reduced.addEventListener('change', apply);
  mobile.addEventListener('change', resize);
  apply();
  return clean;
}
