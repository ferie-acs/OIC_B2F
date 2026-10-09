/**
 * Conformité aux règles non négociables du plan de suivi (§ 5, Definition of Done).
 *
 * Ces règles se vérifient d'habitude « en revue », c'est-à-dire par la vigilance
 * de quelqu'un. Les vérifier par le code les rend opposables : une infraction
 * fait rougir la suite, elle n'attend pas d'être remarquée.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname;

/**
 * Bibliothèques tierces vendorisées. Elles sont **exclues des règles de style**
 * — minifiées, écrites ailleurs, on ne les réécrit pas — mais pas de toute
 * règle : l'inventaire ci-dessous interdit que ce dossier grossisse en silence.
 */
const VENDOR = new Set(['jspdf.umd.min.js', 'maplibre-gl.mjs', 'maplibre-gl-worker.mjs']);

/** @param {string} dossier @returns {string[]} */
function fichiers(dossier, ext = ['.js', '.mjs']) {
  const base = join(RACINE, dossier);
  /** @type {string[]} */
  const out = [];
  const parcourir = (d) => {
    for (const e of readdirSync(d)) {
      const chemin = join(d, e);
      if (e === 'vendor') continue; // code tiers : voir VENDOR
      // `js/pages/` porte les pages statiques servies hors application : elles
      // ont leur propre document HTML, ne passent pas par le routeur ni par
      // `core/dom.js`, et ne touchent ni au stockage ni aux entités. Les règles
      // ci-dessous décrivent l'architecture de l'APPLICATION ; les y soumettre
      // n'aurait pas de sens. Leur contenu reste couvert par le garde-fou de
      // publication et par la politique de sécurité du contenu.
      if (e === 'pages') continue;
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (ext.some((x) => e.endsWith(x))) out.push(chemin);
    }
  };
  parcourir(base);
  return out;
}

const SOURCES = fichiers('js');
const lire = (f) => readFileSync(f, 'utf8');
const relatif = (f) => f.replace(RACINE, '');

describe('Architecture — VUE → SERVICE → REPOSITORY → LOCALSTORAGE', () => {
  it('ne touche LocalStorage que dans core/storage.js et pour le thème', () => {
    const permis = ['js/core/storage.js', 'js/core/layout.js', 'js/views/affreteur.js'];
    for (const f of SOURCES) {
      if (permis.some((p) => f.endsWith(p))) continue;
      assert.ok(
        !/\blocalStorage\b/.test(lire(f)),
        `${relatif(f)} touche LocalStorage hors de la couche de persistance.`,
      );
    }
  });

  it('n’utilise le préfixe b2f_ qu’en un seul point de fabrication', () => {
    const fabrique = lire(join(RACINE, 'js/core/storage.js'));
    assert.ok(fabrique.includes("export const PREFIXE = 'b2f_'"));

    // Ailleurs, `b2f_` ne doit apparaître que dans des commentaires ou pour des
    // clés hors schéma (thème, préférences de recherche), jamais pour fabriquer
    // une clé de collection.
    for (const f of SOURCES) {
      if (f.endsWith('js/core/storage.js')) continue;
      for (const ligne of lire(f).split('\n')) {
        if (!ligne.includes('b2f_')) continue;
        const commentaire = /^\s*(\*|\/\/|\/\*)/.test(ligne);
        const cleTechnique = /b2f_(theme|search_prefs|session)/.test(ligne);
        assert.ok(
          commentaire || cleTechnique,
          `${relatif(f)} fabrique une clé b2f_ hors de storage.js : ${ligne.trim()}`,
        );
      }
    }
  });

  it('interdit à une vue de lire en BRUT une entité portant des champs classés', () => {
    // Constat transversal de la campagne QA : « le domaine est rigoureux, les
    // vues le contournent ». Corriger les trois cas trouvés (QA-01, QA-02,
    // QA-03) laissait la porte ouverte au prochain écran. Les vues passent
    // désormais par `views/_donnees.js`, qui ne rend que du projeté ou des
    // libellés — et ce test empêche d'y revenir.
    const sensibles = ['utilisateur', 'chauffeur', 'operation', 'appariement', 'groupement'];
    for (const f of fichiers('js/views')) {
      if (f.endsWith('_donnees.js')) continue; // c'est lui, l'accès contrôlé
      const src = lire(f);
      for (const entite of sensibles) {
        const motif = new RegExp(`depot\\('${entite}'\\)\\.brut`);
        assert.ok(
          !motif.test(src),
          `${relatif(f)} lit « ${entite} » en brut : passez par views/_donnees.js.`,
        );
      }
    }
  });

  it('interdit à une vue d’écrire une route d’un autre espace en dur', () => {
    // QA-02bis : « Suivre le transport » renvoyait le transporteur sur un
    // écran de refus. La fiche est partagée entre deux espaces : le segment se
    // dérive de `segmentEspace(ctx)`, jamais d'une chaîne ni d'un `includes`.
    for (const f of fichiers('js/views')) {
      const src = lire(f);
      for (const [i, ligne] of src.split('\n').entries()) {
        if (/^\s*(\*|\/\/)/.test(ligne)) continue;
        const m = ligne.match(/href:\s*[`'"]#\/(affreteur|transporteur|concessionnaire|dgttc)\//);
        if (!m) continue;
        // Une vue peut nommer SON espace ; le fichier du même nom en a le droit.
        const propre = f.includes(`/${m[1]}.js`);
        assert.ok(
          propre,
          `${relatif(f)}:${i + 1} code en dur la route « ${m[1]} » : ` +
            'utilisez segmentEspace(ctx).',
        );
      }
      assert.ok(
        !/roleId\.includes\(/.test(src),
        `${relatif(f)} déduit l'espace par sous-chaîne du rôle : un « partenaire » ` +
          "serait envoyé vers l'espace affréteur.",
      );
    }
  });

  it('interdit à une vue d’appeler le stockage directement', () => {
    for (const f of fichiers('js/views')) {
      const src = lire(f);
      assert.ok(
        !src.includes('stockageInterne'),
        `${relatif(f)} ouvre une transaction : cela revient aux services.`,
      );
    }
  });
});

describe('Rendu — aucune chaîne interprétée comme du HTML (finding S13)', () => {
  const INTERDITS = [
    ['innerHTML', /\.innerHTML\s*=/],
    ['outerHTML', /\.outerHTML\s*=/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['document.write', /document\.write/],
    ['eval', /\beval\(/],
    ['new Function', /new Function\(/],
  ];

  for (const [nom, motif] of INTERDITS) {
    it(`n’emploie jamais ${nom}`, () => {
      for (const f of SOURCES) {
        const src = lire(f);
        // `core/dom.js` nomme `innerHTML` pour le REFUSER : c'est son objet.
        if (f.endsWith('js/core/dom.js') && nom === 'innerHTML') continue;
        assert.ok(!motif.test(src), `${relatif(f)} emploie ${nom}.`);
      }
    });
  }

  it('n’attache aucun gestionnaire en ligne dans le HTML', () => {
    const html = lire(join(RACINE, 'index.html'));
    assert.ok(!/\son[a-z]+\s*=/i.test(html), 'index.html porte un gestionnaire en ligne.');
  });

  it('n’écrit aucun style en ligne dans les vues', () => {
    for (const f of fichiers('js/views')) {
      assert.ok(
        !/style:\s*['"`]/.test(lire(f)),
        `${relatif(f)} pose un style en ligne (Definition of Done, point 6).`,
      );
    }
  });
});

describe('Dépendances — aucune ressource réseau (écart E1)', () => {
  it('ne charge aucun CDN depuis index.html', () => {
    const html = lire(join(RACINE, 'index.html'));
    const externes = html.match(/(src|href)\s*=\s*["']https?:\/\/[^"']+/gi) ?? [];
    assert.deepEqual(externes, [], `index.html charge des ressources externes : ${externes}`);
  });

  it('ne référence aucune URL distante dans le code', () => {
    for (const f of SOURCES) {
      for (const ligne of lire(f).split('\n')) {
        const m = ligne.match(/["'`]https?:\/\/[^"'`]+/);
        if (!m) continue;
        const commentaire = /^\s*(\*|\/\/)/.test(ligne);
        const xmlns = ligne.includes('www.w3.org');
        assert.ok(commentaire || xmlns, `${relatif(f)} référence ${m[0]}`);
      }
    }
  });

  it('ne vendorise que les bibliothèques inventoriées', () => {
    const presents = readdirSync(join(RACINE, 'js/vendor'));
    assert.deepEqual(
      presents.filter((f) => !f.startsWith('.')).sort(),
      [...VENDOR].sort(),
      'Le dossier js/vendor a changé : toute bibliothèque ajoutée doit être ' +
        'inventoriée ici, avec sa version et sa justification au README.',
    );
  });

  it('vendorise une version de MapLibre exempte des avis connus', () => {
    // MapLibre GL JS est touché jusqu'à 6.4.1 exclue par CVE-2026-85061 (score
    // 10) : l'assainissement du DOM saute un attribut dangereux adjacent, et un
    // script peut s'exécuter depuis une attribution de style. La branche 6.13
    // le corrige. Elle ne publie plus que des modules ES, d'où l'import
    // dynamique dans `carte-relief.js`.
    const entete = lire(join(RACINE, 'js/vendor/maplibre-gl.mjs')).slice(0, 400);
    const version = entete.match(/maplibre-gl-js\/blob\/v(\d+)\.(\d+)\.(\d+)/);
    assert.ok(version, 'La version de MapLibre vendorisée n’est pas lisible.');
    const [majeure, mineure] = [Number(version[1]), Number(version[2])];
    assert.ok(
      majeure > 6 || (majeure === 6 && mineure >= 4),
      `MapLibre ${version[1]}.${version[2]}.${version[3]} précède 6.4.1 : ` +
        'CVE-2026-85061 non corrigée.',
    );
  });

  it('vendorise une version de jsPDF exempte des avis connus', () => {
    // jsPDF 2.5.1, vendorisé par le POC DUT, cumule 15 avis dont trois
    // critiques (CVE-2026-31938, CVE-2025-68428, CVE-2026-25940). Le gabarit
    // DUT a été porté sur 4.2.1, la première version qui les corrige tous.
    const entete = lire(join(RACINE, 'js/vendor/jspdf.umd.min.js')).slice(0, 400);
    const version = entete.match(/Version\s+(\d+)\.(\d+)\.(\d+)/);
    assert.ok(version, 'La version de jsPDF n’est pas lisible dans l’en-tête du fichier.');
    const [, majeure, mineure, correctif] = version.map(Number);
    const rang = majeure * 10000 + mineure * 100 + correctif;
    assert.ok(rang >= 40201, `jsPDF ${version[1]}.${version[2]}.${version[3]} est vulnérable.`);
  });

  it('n’a aucune dépendance déclarée', () => {
    const racine = readdirSync(RACINE);
    assert.ok(!racine.includes('package.json'), 'Un package.json est apparu.');
    assert.ok(!racine.includes('node_modules'), 'Un node_modules est apparu.');
  });
});

describe('Cascade CSS — un seul fichier déclare les jetons (D33)', () => {
  it('ne redéfinit `:root` que dans tokens.css', () => {
    for (const f of fichiers('css', ['.css'])) {
      if (f.endsWith('tokens.css')) continue;
      const declarations = (lire(f).match(/^:root\s*\{/gm) ?? []).length;
      assert.equal(
        declarations,
        0,
        `${relatif(f)} redéfinit :root — c'est le défaut du POC DUT qu'on ne reproduit pas.`,
      );
    }
  });

  it('déclare la police une seule fois', () => {
    const polices = fichiers('css', ['.css'])
      .flatMap((f) => (lire(f).match(/--font\s*:/g) ?? []).map(() => relatif(f)));
    assert.equal(polices.length, 1, `--font déclarée dans : ${polices.join(', ')}`);
  });
});

describe('Démonstration — aucune donnée réelle (risque R9)', () => {
  const seed = lire(join(RACINE, 'js/seed.js'));

  it('n’utilise que des adresses en .invalid', () => {
    const adresses = seed.match(/[\w.-]+@[\w.-]+\.\w+/g) ?? [];
    for (const a of adresses) {
      assert.ok(a.endsWith('.invalid'), `Adresse hors domaine réservé : ${a}`);
    }
    assert.ok(adresses.length > 0, 'aucune adresse trouvée — le test ne vérifie rien');
  });

  it('marque chaque raison sociale « DÉMO »', () => {
    const raisons = [...seed.matchAll(/raisonSociale:\s*'([^']+)'/g)].map((m) => m[1]);
    assert.ok(raisons.length >= 4);
    for (const r of raisons) {
      assert.ok(/DÉMO/.test(r), `Raison sociale non marquée : ${r}`);
    }
  });

  it('n’emploie aucun préfixe téléphonique attribué', () => {
    const numeros = seed.match(/\+225 \d{2}/g) ?? [];
    for (const n of numeros) {
      assert.ok(n.endsWith('00'), `Préfixe potentiellement réel : ${n}`);
    }
  });
});

describe('Journal d’audit — en ajout seul', () => {
  it('ne développe aucune modification ni suppression d’entrée', () => {
    const service = lire(join(RACINE, 'js/services/audit.service.js'));
    assert.ok(!/depot\('audit'\)\.(modifier|supprimer)/.test(service));
    for (const f of SOURCES) {
      assert.ok(
        !/depot\('audit'\)\.(modifier|supprimer)/.test(lire(f)),
        `${relatif(f)} modifie le journal d'audit.`,
      );
    }
  });
});

describe('Appariement — un seul mécanisme (écart délibéré n° 1)', () => {
  it('ne modifie l’état d’un appariement que dans matching.service.js', () => {
    for (const f of SOURCES) {
      if (f.endsWith('js/services/matching.service.js')) continue;
      const src = lire(f);
      assert.ok(
        !/depot\('appariement'\)\.modifier/.test(src),
        `${relatif(f)} modifie un appariement hors du service dédié (M4.5).`,
      );
    }
  });

  it('n’écrit aucun montant en dur dans les vues ni les services', () => {
    for (const f of [...fichiers('js/views'), ...fichiers('js/services')]) {
      const src = lire(f);
      // Les tarifs viennent du catalogue (`03-specifications-ecrans.md` § H.2).
      assert.ok(
        !/montant:\s*1?5000\b/.test(src),
        `${relatif(f)} code un tarif en dur.`,
      );
    }
  });
});

describe('Accueil — aucune apparition ne peut laisser du contenu masqué', () => {
  const MOTION = lire(join(RACINE, 'js/core/accueil-motion.js'));
  const CSS = lire(join(RACINE, 'css/accueil-motion.css'));

  // Régression vécue : `clean()` était branché sur `hashchange`. Dans une
  // application routée par le fragment d'URL, toute navigation interne tuait
  // l'IntersectionObserver, et tout ce qui n'avait pas encore été révélé restait
  // à `opacity:0` — titre du hero, annonces, questions, pied de page.
  it('ne lie pas le nettoyage des animations au changement de fragment', () => {
    assert.ok(
      !/addEventListener\('hashchange'/.test(MOTION),
      'accueil-motion.js réagit à « hashchange » : une navigation interne ' +
        'masquerait définitivement le contenu non encore révélé.',
    );
  });

  it('rend le contenu visible quand la surveillance s’arrête', () => {
    assert.match(
      MOTION,
      /classList\.remove\('th-scroll-ready'\)/,
      'Le nettoyage doit retirer « th-scroll-ready » : sans observateur, plus ' +
        'rien ne viendrait révéler le contenu masqué.',
    );
  });

  it('ne masque le contenu que lorsque la surveillance est armée', () => {
    // Une règle CSS peut tenir sur plusieurs lignes : on découpe sur les
    // accolades fermantes, pas sur les retours à la ligne.
    for (const regle of CSS.split('}').filter((r) => /opacity:\s*0\b/.test(r))) {
      assert.ok(
        regle.includes('th-scroll-ready'),
        `Une règle masque du contenu hors « th-scroll-ready » : ${regle.trim().slice(0, 90)}`,
      );
    }
  });
});
