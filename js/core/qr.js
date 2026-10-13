/**
 * QR code — encodeur autonome (mode octet, correction d'erreur M, versions 1 à 10).
 *
 * ## Pourquoi un encodeur écrit ici
 *
 * Le POC ne charge aucune bibliothèque hors de l'inventaire (`js/vendor/` est
 * vérifié par test, écart E1) et aucune ressource réseau. L'attestation de
 * bourse de fret porte pourtant un QR réel, lisible par n'importe quel
 * téléphone : il est donc produit ici, d'après la norme ISO/IEC 18004.
 *
 * Le module est **pur** pour l'encodage (`matriceQr`) : une matrice de booléens,
 * testable sous Node. Deux rendus en découlent — un SVG pour l'écran, des
 * rectangles pour le PDF (dans le gabarit de l'attestation).
 *
 * @module core/qr
 */

/** Codewords de correction par bloc, niveau M, versions 0 à 10 (0 inutilisé). */
const ECC_PAR_BLOC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** Nombre de blocs de correction, niveau M. */
const NB_BLOCS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Bits de format du niveau M (00). */
const FORMAT_M = 0;
const VERSION_MAX = 10;

/** Nombre de modules de données bruts d'une version (fonctions exclues). */
function modulesBruts(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const nbAlign = Math.floor(version / 7) + 2;
    n -= (25 * nbAlign - 10) * nbAlign - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

/** Octets de données utiles d'une version au niveau M. */
function capaciteDonnees(version) {
  return Math.floor(modulesBruts(version) / 8) - ECC_PAR_BLOC[version] * NB_BLOCS[version];
}

/* ---------------------------- Reed-Solomon ---------------------------- */

function multiplier(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function diviseur(degre) {
  const r = new Array(degre).fill(0);
  r[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i += 1) {
    for (let j = 0; j < r.length; j += 1) {
      r[j] = multiplier(r[j], racine);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    racine = multiplier(racine, 0x02);
  }
  return r;
}

function reste(donnees, div) {
  const r = new Array(div.length).fill(0);
  for (const b of donnees) {
    const facteur = b ^ r.shift();
    r.push(0);
    div.forEach((coef, i) => {
      r[i] ^= multiplier(coef, facteur);
    });
  }
  return r;
}

/* ------------------------------ Encodage ------------------------------ */

/** Octets UTF-8 d'un texte. */
function octets(texte) {
  return [...new TextEncoder().encode(String(texte))];
}

/** Choisit la plus petite version capable de porter le texte. */
function versionPour(nbOctets) {
  for (let v = 1; v <= VERSION_MAX; v += 1) {
    const bitsCompte = v <= 9 ? 8 : 16;
    if (4 + bitsCompte + nbOctets * 8 <= capaciteDonnees(v) * 8) return v;
  }
  throw new Error('Texte trop long pour un QR code de vérification.');
}

/** Flux de codewords de données (mode, compte, données, terminaison, bourrage). */
function codewordsDonnees(donnees, version) {
  const bits = [];
  const ajouter = (valeur, longueur) => {
    for (let i = longueur - 1; i >= 0; i -= 1) bits.push((valeur >>> i) & 1);
  };
  ajouter(0b0100, 4);
  ajouter(donnees.length, version <= 9 ? 8 : 16);
  for (const b of donnees) ajouter(b, 8);
  const capacite = capaciteDonnees(version) * 8;
  ajouter(0, Math.min(4, capacite - bits.length));
  ajouter(0, (8 - (bits.length % 8)) % 8);
  const resultat = [];
  for (let i = 0; i < bits.length; i += 8) {
    resultat.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  }
  for (let pad = 0xec; resultat.length < capacite / 8; pad ^= 0xec ^ 0x11) resultat.push(pad);
  return resultat;
}

/** Ajoute la correction d'erreur et entrelace les blocs. */
function entrelacer(donnees, version) {
  const nbBlocs = NB_BLOCS[version];
  const eccLong = ECC_PAR_BLOC[version];
  const brut = Math.floor(modulesBruts(version) / 8);
  const nbCourts = nbBlocs - (brut % nbBlocs);
  const longCourt = Math.floor(brut / nbBlocs);
  const div = diviseur(eccLong);
  const blocs = [];
  for (let i = 0, k = 0; i < nbBlocs; i += 1) {
    const dat = donnees.slice(k, k + longCourt - eccLong + (i < nbCourts ? 0 : 1));
    k += dat.length;
    const ecc = reste(dat, div);
    if (i < nbCourts) dat.push(0);
    blocs.push(dat.concat(ecc));
  }
  const resultat = [];
  for (let i = 0; i < blocs[0].length; i += 1) {
    blocs.forEach((bloc, j) => {
      if (i !== longCourt - eccLong || j >= nbCourts) resultat.push(bloc[i]);
    });
  }
  return resultat;
}

/* ------------------------------- Dessin ------------------------------- */

function positionsAlignement(version, taille) {
  if (version === 1) return [];
  const nb = Math.floor(version / 7) + 2;
  const pas = Math.ceil((version * 4 + 4) / (nb * 2 - 2)) * 2;
  const positions = [6];
  for (let p = taille - 7; positions.length < nb; p -= pas) positions.splice(1, 0, p);
  return positions;
}

function construire(version, codewords, masque) {
  const taille = version * 4 + 17;
  const modules = Array.from({ length: taille }, () => new Array(taille).fill(false));
  const fonction = Array.from({ length: taille }, () => new Array(taille).fill(false));
  const poser = (x, y, sombre) => {
    modules[y][x] = sombre;
    fonction[y][x] = true;
  };

  for (let i = 0; i < taille; i += 1) {
    poser(6, i, i % 2 === 0);
    poser(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [taille - 4, 3], [3, taille - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= taille || y >= taille) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        poser(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const al = positionsAlignement(version, taille);
  const dernier = al.length - 1;
  al.forEach((ax, i) => {
    al.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === dernier) || (i === dernier && j === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          poser(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });

  const format = (m) => {
    const donnee = (FORMAT_M << 3) | m;
    let r = donnee;
    for (let i = 0; i < 10; i += 1) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((donnee << 10) | r) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i += 1) poser(8, i, bit(i));
    poser(8, 7, bit(6));
    poser(8, 8, bit(7));
    poser(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) poser(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) poser(taille - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) poser(8, taille - 15 + i, bit(i));
    poser(8, taille - 8, true);
  };
  format(masque);

  if (version >= 7) {
    let r = version;
    for (let i = 0; i < 12; i += 1) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (version << 12) | r;
    for (let i = 0; i < 18; i += 1) {
      const sombre = ((bits >>> i) & 1) !== 0;
      const a = taille - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poser(a, b, sombre);
      poser(b, a, sombre);
    }
  }

  let i = 0;
  for (let droite = taille - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let vert = 0; vert < taille; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = droite - j;
        const montant = ((droite + 1) & 2) === 0;
        const y = montant ? taille - 1 - vert : vert;
        if (!fonction[y][x] && i < codewords.length * 8) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i += 1;
        }
      }
    }
  }

  const MASQUES = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  for (let y = 0; y < taille; y += 1) {
    for (let x = 0; x < taille; x += 1) {
      if (!fonction[y][x] && MASQUES[masque](x, y)) modules[y][x] = !modules[y][x];
    }
  }
  return modules;
}

/** Pénalité de la norme : séries, blocs, motifs de repérage parasites, équilibre. */
function penalite(m) {
  const taille = m.length;
  let p = 0;
  const lignes = [];
  for (let y = 0; y < taille; y += 1) lignes.push(m[y].map((b) => (b ? '1' : '0')).join(''));
  for (let x = 0; x < taille; x += 1) lignes.push(m.map((r) => (r[x] ? '1' : '0')).join(''));
  for (const l of lignes) {
    for (const serie of l.match(/0{5,}|1{5,}/g) ?? []) p += 3 + serie.length - 5;
    for (const motif of ['10111010000', '00001011101']) {
      for (let k = l.indexOf(motif); k !== -1; k = l.indexOf(motif, k + 1)) p += 40;
    }
  }
  for (let y = 0; y < taille - 1; y += 1) {
    for (let x = 0; x < taille - 1; x += 1) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
  }
  const sombres = m.reduce((n, r) => n + r.filter(Boolean).length, 0);
  const total = taille * taille;
  p += (Math.ceil(Math.abs(sombres * 20 - total * 10) / total) - 1) * 10;
  return p;
}

/**
 * Matrice d'un QR code.
 * @param {string} texte
 * @returns {boolean[][]} `true` = module sombre. Ligne par ligne.
 */
export function matriceQr(texte) {
  const donnees = octets(texte);
  const version = versionPour(donnees.length);
  const codewords = entrelacer(codewordsDonnees(donnees, version), version);
  let meilleure = null;
  let score = Infinity;
  for (let masque = 0; masque < 8; masque += 1) {
    const m = construire(version, codewords, masque);
    const s = penalite(m);
    if (s < score) {
      score = s;
      meilleure = m;
    }
  }
  return meilleure;
}

/**
 * Rendu SVG d'un QR, avec sa zone de silence de quatre modules.
 * Construit par `createElementNS`, jamais à partir d'une chaîne (finding S13).
 * @param {string} texte
 * @param {{taille?: number, libelle?: string}} [options]
 * @returns {SVGElement}
 */
export function qrSvg(texte, { taille = 168, libelle = 'QR code de vérification' } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const m = matriceQr(texte);
  const cote = m.length + 8;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${cote} ${cote}`);
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', libelle);
  svg.setAttribute('class', 'qr-code');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const fond = document.createElementNS(NS, 'rect');
  fond.setAttribute('width', String(cote));
  fond.setAttribute('height', String(cote));
  fond.setAttribute('class', 'qr-fond');
  svg.append(fond);
  // Un seul chemin : des centaines de rectangles alourdiraient le DOM.
  let d = '';
  m.forEach((ligne, y) => {
    ligne.forEach((sombre, x) => {
      if (sombre) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    });
  });
  const chemin = document.createElementNS(NS, 'path');
  chemin.setAttribute('d', d);
  chemin.setAttribute('class', 'qr-modules');
  svg.append(chemin);
  return svg;
}
