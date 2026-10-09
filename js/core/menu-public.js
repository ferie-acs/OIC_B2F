import { el, icone } from './dom.js';

// Une seule navigation pour l’accueil et le guide, quel que soit leur dossier.
const base = new URL('../../', import.meta.url);
export function menuPublic(page = 'accueil') {
  const icon = (name, size) => {
    const node = icone(name, size);
    if (page === 'comprendre') node.querySelector('use').setAttribute('href', '#i-' + name);
    return node;
  };
  const url = path => new URL(path, base).href;
  const items = [
    ['Accueil', '#/accueil', 'accueil'],
    ['Le marché', '#/explorer', 'marche'],
    ['Les acteurs', 'comprendre.html#acteurs', 'acteurs'],
    ['Comprendre', 'comprendre.html', 'comprendre']
  ];
  return el('header.b2f-public-menu', {}, [
    el('a.b2f-public-brand', { href: url('#/accueil'), 'aria-label': 'Bourse de Fret — accueil' }, [
      icon('truck', 28), el('span', {}, [el('strong', {}, ['Bourse ', el('em', { text: 'de Fret' })]), el('small', { text: 'CÔTE D’IVOIRE · OIC' })])
    ]),
    el('nav', { 'aria-label': 'Navigation principale' }, items.map(([text, path, id]) => el('a', { href: url(path), text, 'aria-current': id === page ? 'page' : null }))),
    el('a.b2f-public-login', { href: url('#/connexion') }, ['Se connecter', icon('arrow-right', 18)])
  ]);
}
