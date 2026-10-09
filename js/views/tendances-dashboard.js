/** Évolution d’événements sur deux périodes glissantes de 30 jours. */
import { el, icone } from '../core/dom.js';

export function calculerTendance(dates, maintenant = Date.now()) {
  const jour = 86400000;
  const debut = maintenant - 30 * jour;
  const precedent = debut - 30 * jour;
  const instants = dates.filter(Boolean).map(d => new Date(d).getTime()).filter(Number.isFinite);
  const actuels = instants.filter(t => t >= debut && t <= maintenant);
  const avant = instants.filter(t => t >= precedent && t < debut).length;
  const serie = Array.from({ length: 6 }, (_, i) => actuels.filter(t => t >= debut + i * 5 * jour && (i === 5 ? t <= maintenant : t < debut + (i+1) * 5 * jour)).length);
  const variation = avant ? (actuels.length - avant) / avant * 100 : null;
  const ton = actuels.length > avant ? 'up' : actuels.length < avant ? 'down' : 'flat';
  const libelle = variation === null
    ? actuels.length ? 'Nouveau' : '—'
    : `${variation > 0 ? '+' : ''}${variation.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  return { serie, actuel: actuels.length, precedent: avant, variation, ton, libelle };
}

/** Courbe adoucie qui passe par les volumes réels de chaque intervalle. */
function courbe(serie) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 300 74');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'dash-sparkline');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Volumes par période de cinq jours, du plus ancien au plus récent : ${serie.join(', ')}.`);
  const max = Math.max(1, ...serie);
  const points = serie.map((n, i) => [i * 300 / (serie.length-1), 60 - n / max * 46]);
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i-1]; const [a, b] = points[i]; const milieu = (x+a)/2;
    d += ` C${milieu},${y} ${milieu},${b} ${a},${b}`;
  }
  const fond = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  fond.setAttribute('d', `${d} L300,74 L0,74 Z`); fond.setAttribute('class', 'dash-spark-area');
  const ligne = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ligne.setAttribute('d', d); ligne.setAttribute('class', 'dash-spark-line');
  svg.append(fond, ligne);
  return svg;
}

export function indicateurCourbe({ libelle, valeur, icon, href, dates, activite }) {
  const tendance = calculerTendance(dates);
  const comparaison = `${activite} : ${tendance.actuel} sur les 30 derniers jours, contre ${tendance.precedent} sur les 30 jours précédents.${tendance.variation === null ? ' Pourcentage non calculable sans base de comparaison.' : ''}`;
  return el('a.dash-kpi.dash-kpi-chart', { href, class: `trend-${tendance.ton}`, title: comparaison }, [
    el('div.dash-kpi-overview', {}, [
      el('span.indicator-watermark', { 'aria-hidden': 'true' }, [icone(icon, 88)]),
      el('div.dash-kpi-chart-head', {}, [el('span.kpi-label.kpi-label-icon', {}, [icone(icon, 19), el('span', { text: libelle })])]),
      el('div.dash-kpi-figures', {}, [el('strong.dash-kpi-number', { text: valeur }), el('span.dash-trend', { 'aria-label': comparaison }, [icone(tendance.ton === 'flat' ? 'activity' : 'arrow-right', 12), el('span', { text: tendance.libelle })])]),
      el('p.dash-kpi-context', { text: `${activite} · ${tendance.actuel} sur 30 j` }),
    ]),
    courbe(tendance.serie),
    el('div.dash-kpi-comparison', {}, [el('span', { text: 'vs les 30 jours précédents' }), icone('arrow-right', 13)]),
  ]);
}
