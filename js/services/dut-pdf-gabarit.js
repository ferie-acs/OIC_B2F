/**
 * Gabarit PDF du Document Unique de Transport — **version enrichie**.
 *
 * Reproduit les planches de référence du POC DUT :
 * `POC_OIC/DUT/docs/Après — recto enrichi.pdf`, `… verso enrichi.pdf`,
 * `Le document dit son état.pdf` et `Dispositif anti-falsification.pdf`.
 *
 * ## Ce que le gabarit reprend des planches
 *
 * 1. **En-tête institutionnel** : armoiries, devise, bandeau pleine largeur et
 *    bande guillochée — marque n° 1 du dispositif anti-falsification.
 * 2. **Bloc d'identification** : numéro en chiffres monospacés, pastille d'état,
 *    rang d'impression (marque n° 6), antenne, partenaire, plage d'attribution.
 * 3. **Dix sections numérotées**, titres capitalisés et filetés, libellés en
 *    petites capitales grises, valeurs en gras ou en chiffres monospacés.
 * 4. **Empreinte SHA-256 en pied de page** (marque n° 5) et **micro-texte de
 *    bord** reprenant le numéro (marque n° 7).
 * 5. **Mention d'exemplaire** nommée, jamais un PDF anonyme (marque n° 8).
 *
 * ## L'état du document, et ce qu'il vaut ici
 *
 * La planche « Le document dit son état » décrit quatre traitements : validé,
 * suspendu, retiré, et **épreuve de travail**. B2F ne connaît que le dernier :
 * aucune fiche n'est attribuée par l'Office, aucun jeton de vérification n'est
 * émis. Le document porte donc le bandeau ardoise « Épreuve de travail », la
 * mention « NON OFFICIEL », le filigrane « SANS VALEUR », un encadré pointillé
 * « Aucun QR » et un numéro grisé. **C'est le traitement prévu par la planche
 * pour ce cas, pas une approximation.**
 *
 * ## Donnée absente : la case reste vide
 *
 * B2F ne porte ni colis, ni volume, ni valeur, ni facturation, ni marchandise
 * dangereuse. Ces rubriques s'impriment « — », jamais `0` ni `NON` : un document
 * qui ressemble à un document officiel ne doit pas affirmer plus que ce qui est
 * connu. Les rubriques restent visibles, à remplir à la main.
 *
 * ## Ce module est pur
 *
 * Ni stockage, ni DOM, ni réseau : il reçoit une charge déjà constituée et rend
 * un document jsPDF. C'est ce qui permet de le rendre sous Node dans
 * `tests/dut-pdf.test.mjs`, sans navigateur.
 *
 * @module services/dut-pdf-gabarit
 */

/** Exemplaires nommés — marque n° 8 du dispositif anti-falsification. */
export const COPIES = Object.freeze({
  TRANSPORTEUR: 'Exemplaire transporteur',
  EXPEDITEUR: 'Exemplaire expéditeur',
  DESTINATAIRE: 'Exemplaire destinataire',
  OIC: 'Souche OIC',
});

/** États portés par une fiche B2F. */
export const ETAT_FICHE = Object.freeze({ APERCU: 'apercu', GENERE: 'genere' });

/**
 * Habillage d'un état, au sens de la planche « Le document dit son état ».
 * Les deux états de B2F relèvent de l'épreuve de travail.
 * @param {{etat?: string}} fiche
 */
export function etatImpression(fiche) {
  const commun = {
    officiel: false,
    bandeau: 'Office Ivoirien des Chargeurs · Épreuve de travail',
    mention: 'NON OFFICIEL',
    filigrane: 'SANS VALEUR',
    qr: 'Aucun QR',
  };
  if (fiche.etat === ETAT_FICHE.GENERE) {
    return {
      ...commun,
      label: 'DÉMONSTRATION',
      couleur: [90, 100, 118],
      avertissement:
        'Fiche produite par la démonstration du POC Bourse de fret. Le numéro n’est ' +
        'pas attribué par l’Office et rien n’est transmis au système officiel DUT.',
    };
  }
  return {
    ...commun,
    label: 'APERÇU',
    couleur: [90, 100, 118],
    avertissement:
      'Aperçu avant génération. Les informations ne sont pas encore enregistrées : ' +
      'ce tirage ne constitue aucun document.',
  };
}

/* ------------------------------------------------------------------ *
 * Totaux — l'absence de donnée se propage, elle ne devient pas zéro
 * ------------------------------------------------------------------ */

/**
 * Somme une colonne de marchandises. Rend `null` si **aucune** ligne ne porte la
 * donnée : additionner des cases vides donnerait un total inventé.
 * @param {Array<Record<string, unknown>>} lignes
 * @param {string} champ
 * @returns {number|null}
 */
function somme(lignes, champ) {
  const valeurs = (lignes || [])
    .map((l) => l[champ])
    .filter((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  return valeurs.length === 0 ? null : valeurs.reduce((t, v) => t + Number(v), 0);
}

/**
 * Totaux de la section 4.
 * @param {Array<Record<string, unknown>>} marchandises
 */
export function totauxMarchandises(marchandises) {
  return {
    quantite: somme(marchandises, 'quantite'),
    poidsTonnes: somme(marchandises, 'poidsTonnes'),
    volumeM3: somme(marchandises, 'volumeM3'),
    valeur: somme(marchandises, 'valeur'),
  };
}

/**
 * Totaux des sections 5 et 6. Un poste absent ne vaut pas zéro.
 * @param {{expediteur?: Record<string, unknown>, destinataire?: Record<string, unknown>}} [facturation]
 */
export function totauxFacturation(facturation = {}) {
  const POSTES = ['prixTransport', 'accessoires', 'complementaires', 'autres'];
  const partie = (source = {}) => {
    const postes = POSTES.map((p) => source[p]).filter(
      (v) => v != null && v !== '' && Number.isFinite(Number(v)),
    );
    const ht = postes.length === 0 ? null : postes.reduce((t, v) => t + Number(v), 0);
    const tauxTva = source.tvaRate == null ? null : Number(source.tvaRate);
    const tvaMontant = ht == null || tauxTva == null ? null : Math.round((ht * tauxTva) / 100);
    const timbre = source.timbre == null ? null : Number(source.timbre);
    const total =
      ht == null && tvaMontant == null && timbre == null
        ? null
        : (ht ?? 0) + (tvaMontant ?? 0) + (timbre ?? 0);
    return { ht, tauxTva, tvaMontant, timbre, total };
  };
  const expediteur = partie(facturation.expediteur);
  const destinataire = partie(facturation.destinataire);
  const cumul = (a, b) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
  return {
    expediteur,
    destinataire,
    totalExpediteur: expediteur.ht,
    totalDestinataire: destinataire.ht,
    tva: cumul(expediteur.tvaMontant, destinataire.tvaMontant),
    timbreTotal: cumul(expediteur.timbre, destinataire.timbre),
    totalAPercevoir: cumul(expediteur.total, destinataire.total),
  };
}

/* ------------------------------------------------------------------ *
 * Rendu
 * ------------------------------------------------------------------ */

/** Encre, gris de libellé, filets, fonds — relevés sur les planches. */
const ENCRE = [19, 47, 85];
const GRIS = [108, 119, 135];
const FILET = [214, 221, 230];
const FOND = [245, 248, 251];
const BLANC = [255, 255, 255];

/** Colonne de gauche, colonne de droite, et les trois colonnes de champs. */
const G1 = 11;
const G2 = 199;
const COL = [11, 77, 141];
const LARGEUR = G2 - G1;

/** Helvetica intégré n'a ni espace fine, ni tiret long, ni flèche. */
const texte = (valeur) =>
  String(valeur ?? '')
    .replace(/[  ]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[’]/g, "'")
    .replace(/→/g, '>');

/** Une donnée absente s'imprime `-`, jamais `0`. */
const nombre = (valeur) =>
  valeur == null || valeur === '' || !Number.isFinite(Number(valeur))
    ? '-'
    : texte(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(valeur)));

/** Un booléen non renseigné n'est pas `NON`. */
const triEtat = (valeur) => (valeur == null ? '-' : valeur ? 'OUI' : 'NON');

/** Valeur vide : le tiret cadratin des planches, qui montre que la case existe. */
const ou = (valeur) => (valeur == null || valeur === '' ? '-' : texte(valeur));

const date = (valeur) => (valeur ? new Date(valeur).toLocaleDateString('fr-FR') : '-');

/** Les planches écrivent les heures « 06 h 30 ». */
const heure = (valeur) =>
  valeur
    ? new Date(valeur)
        .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        .replace(':', ' h ')
    : '';

/**
 * Rend le DUT recto-verso au gabarit enrichi.
 *
 * @param {Function} jsPDF Constructeur jsPDF (global UMD en navigateur, `require` en test).
 * @param {Object} payload Charge canonique produite par `dut-pdf.service.js`.
 * @param {string} empreinte SHA-256 hexadécimal de la charge — imprimé en pied de page.
 * @param {{logo?: string, emblem?: string, qr?: string|null}} [images] Data-URL.
 * @returns {Object} Document jsPDF, à `save()` ou à sérialiser.
 */
export function construireDutPdf(jsPDF, payload, empreinte, { logo, emblem, qr } = {}) {
  const d = payload.document;
  const g = d.general;
  const a = d.annexes || {};
  const etat = etatImpression(d);
  const numero = d.dutNumber || 'NON ATTRIBUÉE';
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  /** Valeurs trop longues pour leur case : reportées en annexe, jamais tronquées. */
  const extras = [];

  /* ---------------------------- primitives ---------------------------- */

  /**
   * Pose du texte. `espace` est l'interlettrage des petites capitales, qui fait
   * l'essentiel de la tenue typographique des planches.
   */
  function put(valeur, x, y, options = {}) {
    const {
      taille = 9,
      gras = false,
      police = 'helvetica',
      italique = false,
      couleur = ENCRE,
      espace = 0,
      interligne = 1.2,
      align,
      angle,
    } = options;
    const style = gras && italique ? 'bolditalic' : gras ? 'bold' : italique ? 'italic' : 'normal';
    doc.setFont(police, style);
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
    doc.setCharSpace(espace);
    doc.text(
      Array.isArray(valeur) ? valeur.map(texte) : texte(valeur),
      x,
      y,
      { lineHeightFactor: interligne, ...(align ? { align } : {}), ...(angle ? { angle } : {}) },
    );
    doc.setCharSpace(0);
  }

  /**
   * Largeur réelle d'un texte, interlettrage compris.
   *
   * `getTextWidth()` mesure la police seule : l'interlettrage posé par
   * `setCharSpace()` n'y entre pas, et l'option `align:'right'` de jsPDF
   * l'ignore de la même façon. Sans cette correction les pastilles se
   * chevauchent et les filets de section barrent leur propre titre.
   */
  function largeur(valeur, { taille = 9, gras = false, police = 'helvetica', espace = 0 } = {}) {
    const brut = texte(valeur);
    doc.setFont(police, gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    return doc.getTextWidth(brut) + espace * Math.max(0, brut.length - 1);
  }

  /** Texte aligné à droite, interlettrage compris — jsPDF ne sait pas le faire. */
  const putDroite = (valeur, xDroite, y, options = {}) =>
    put(valeur, xDroite - largeur(valeur, options), y, options);

  const rect = (x, y, w, h, fond = null, bord = FILET, epaisseur = 0.2) => {
    if (fond) doc.setFillColor(...fond);
    doc.setDrawColor(...bord);
    doc.setLineWidth(epaisseur);
    doc.rect(x, y, w, h, fond ? (bord ? 'FD' : 'F') : 'D');
  };

  const filet = (x1, y, x2, couleur = FILET, epaisseur = 0.2) => {
    doc.setDrawColor(...couleur);
    doc.setLineWidth(epaisseur);
    doc.line(x1, y, x2, y);
  };

  const decouper = (valeur, largeur, taille = 8.5, police = 'helvetica', gras = false) => {
    doc.setFont(police, gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    return doc.splitTextToSize(texte(valeur ?? ''), largeur);
  };

  /**
   * Pastille à coins arrondis. `pleine` la remplit, sinon elle n'est que cernée —
   * les deux traitements figurent sur la planche d'état.
   */
  function pastille(libelle, x, y, options = {}) {
    const { pleine = null, bord = FILET, encre = ENCRE, taille = 6.4, espace = 0.3, h = 5 } = options;
    const w = largeur(libelle, { taille, gras: true, espace }) + 6;
    if (pleine) doc.setFillColor(...pleine);
    doc.setDrawColor(...bord);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 1.1, 1.1, pleine ? 'FD' : 'D');
    put(libelle, x + 3, y + h / 2 + 1.1, { taille, gras: true, couleur: encre, espace });
    return w;
  }

  /** Libellé en petites capitales grises, puis valeur — la maille des planches. */
  function champ(libelle, valeur, x, y, w, options = {}) {
    const { taille = 9, gras = true, police = 'helvetica', lignes = 1, couleur = ENCRE } = options;
    put(libelle.toUpperCase(), x, y, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
    const enroule = decouper(ou(valeur), w, taille, police, gras);
    if (enroule.length > lignes) extras.push({ label: libelle, valeur: texte(valeur) });
    put(enroule.slice(0, lignes), x, y + 4.4, { taille, gras, police, couleur, interligne: 1.25 });
    return y + 4.4 + enroule.slice(0, lignes).length * (taille * 0.42);
  }

  /** Titre de section : carré plein, capitales espacées, filet jusqu'à la marge. */
  function section(numeroSection, titre, y) {
    doc.setFillColor(...ENCRE);
    doc.rect(G1, y - 2.6, 2.4, 2.4, 'F');
    const libelle = `${numeroSection} · ${titre}`;
    put(libelle, G1 + 4.6, y, { taille: 7.4, gras: true, espace: 0.55 });
    filet(G1 + 7.6 + largeur(libelle, { taille: 7.4, gras: true, espace: 0.55 }), y - 1, G2);
  }

  /** Bande guillochée sous le bandeau — marque n° 1, décorative et assumée. */
  function guilloche(y) {
    doc.setDrawColor(...etat.couleur);
    doc.setLineWidth(0.9);
    for (let x = 0; x < 210; x += 3.2) doc.line(x, y + 0.5, x + 1.7, y + 0.5);
    doc.setDrawColor(130, 148, 172);
    doc.setLineWidth(0.35);
    for (let x = 1.6; x < 210; x += 3.2) doc.line(x, y + 1.3, x + 1, y + 1.3);
  }

  /** En-tête institutionnel. Pleine hauteur au recto, réduit au verso. */
  function entete(complet) {
    if (complet) {
      if (emblem) doc.addImage(emblem, 'PNG', G1, 7, 12.5, 11.1);
      put("RÉPUBLIQUE DE CÔTE D'IVOIRE", 27, 12.4, { taille: 9.5, gras: true, espace: 0.55 });
      put('Union · Discipline · Travail', 27, 16.6, { taille: 7.2, italique: true, couleur: GRIS });
      if (logo) doc.addImage(logo, 'JPEG', 177, 4.5, 22, 22);
      doc.setFillColor(...etat.couleur);
      doc.rect(0, 26, 210, 13.8, 'F');
      put('Office Ivoirien des Chargeurs', G1, 31.6, { taille: 11.5, gras: true, police: 'times', couleur: BLANC });
      put('DOCUMENT UNIQUE DE TRANSPORT', G1, 36.8, { taille: 7.6, gras: true, espace: 0.7, couleur: BLANC });
      // Marque n° 8 : l'exemplaire est nommé, et l'épreuve le dit.
      const mention = COPIES[payload.copy].toUpperCase();
      const style = { taille: 6.6, gras: true, espace: 0.5 };
      const largeurPastille = largeur(mention, style) + 7;
      doc.setDrawColor(...BLANC);
      doc.setLineWidth(0.3);
      doc.roundedRect(G2 - largeurPastille, 28.4, largeurPastille, 5.4, 1.2, 1.2, 'D');
      put(mention, G2 - largeurPastille + 3.5, 32.1, { ...style, couleur: BLANC });
      putDroite(`${etat.mention} · tirage local, hors application du décret`, G2, 37.6, {
        taille: 5.8, couleur: [214, 222, 234],
      });
      guilloche(39.8);
      return;
    }
    if (emblem) doc.addImage(emblem, 'PNG', G1, 6, 9, 8);
    put("RÉPUBLIQUE DE CÔTE D'IVOIRE", 23, 11.4, { taille: 7.6, gras: true, espace: 0.5 });
    doc.setFillColor(...etat.couleur);
    doc.rect(0, 17.5, 210, 10, 'F');
    put(etat.bandeau, G1, 23.9, { taille: 9, gras: true, police: 'times', couleur: BLANC });
    putDroite(numero, G2, 23.9, { taille: 9.5, gras: true, police: 'courier', couleur: BLANC });
    guilloche(27.5);
  }

  /** Filigrane diagonal — le document dit son état même photocopié. */
  function filigrane(centre, y, taille) {
    // `align:'center'` souffre du même défaut que l'alignement à droite : il ne
    // compte pas l'interlettrage, et le filigrane sortait de la page.
    const style = { taille, gras: true, couleur: [206, 211, 219], espace: 2 };
    // Posé en dernier pour passer par-dessus les cadres à fond blanc, donc en
    // transparence : un filigrane opaque effacerait la ligne qu'il croise.
    doc.setGState(new doc.GState({ opacity: 0.4 }));
    put(etat.filigrane, centre - largeur(etat.filigrane, style) / 2, y, { ...style, angle: 14 });
    doc.setGState(new doc.GState({ opacity: 1 }));
  }

  /* ------------------------------ recto ------------------------------ */

  entete(true);

  put('N° DU DOCUMENT UNIQUE DE TRANSPORT', G1, 48.6, {
    taille: 5.8, gras: true, couleur: GRIS, espace: 0.5,
  });
  // Marque n° 2 : le numéro n'existe qu'attribué. Ici il ne l'est pas, et sa
  // teinte grise le dit avant même qu'on lise la pastille.
  put(numero, G1, 57.6, { taille: 19, gras: true, police: 'courier', couleur: [120, 131, 148], espace: 0.3 });

  let xPastille = G1;
  xPastille += pastille(etat.label, xPastille, 61.6, { pleine: etat.couleur, bord: etat.couleur, encre: BLANC }) + 2.5;
  // Marque n° 6 : le rang d'impression est porté par le document.
  xPastille += pastille(`Impression n° ${payload.rank}`, xPastille, 61.6, { couleur: ENCRE }) + 2.5;
  pastille(
    d.general.dateEmission ? `Émis le ${date(g.dateEmission)}` : 'Non émis',
    xPastille,
    61.6,
    {},
  );

  champ('Antenne émettrice', d.antennaName, COL[0], 72.4, 50, { taille: 8.5 });
  champ('Partenaire agréé', d.partnerName, 65, 72.4, 50, { taille: 8.5 });
  champ("Plage d'attribution", payload.operation, 119, 72.4, 46, { taille: 8.5, police: 'courier' });

  // Marque n° 4 : aucun QR n'est fabriqué. L'encadré pointillé le signale au
  // lieu de laisser croire qu'il aurait été oublié à l'impression.
  if (qr) {
    rect(170, 47.6, 29, 29, BLANC);
    doc.addImage(qr, 'PNG', 171.5, 49.1, 26, 26);
  } else {
    doc.setLineDashPattern([1, 1], 0);
    rect(170, 47.6, 29, 29, FOND, [168, 178, 192]);
    doc.setLineDashPattern([], 0);
    put(etat.qr, 184.5, 63.4, { taille: 8, gras: true, couleur: GRIS, align: 'center' });
  }
  put('VÉRIFICATION TERRAIN', 184.5, 80.4, { taille: 5.4, gras: true, couleur: GRIS, espace: 0.4, align: 'center' });
  put('aucun jeton émis', 184.5, 83.6, { taille: 6, police: 'courier', couleur: GRIS, align: 'center' });

  const alerte = decouper(etat.avertissement, 150, 6.4);
  put(alerte.slice(0, 2), G1, 80.6, { taille: 6.4, gras: true, couleur: etat.couleur, interligne: 1.25 });

  filet(G1, 88, G2);

  section('1', 'TRANSPORTEUR, VÉHICULE ET CONDUCTEUR', 95);
  champ('Transporteur', g.transporterName, COL[0], 100.4, 60);
  champ('Immatriculation', g.immatriculation, COL[1], 100.4, 56, { police: 'courier' });
  champ('Conducteur', `${g.driverNom || ''} ${g.driverPrenoms || ''}`.trim(), COL[2], 100.4, 56);
  champ('Registre de commerce', payload.transporter.registre, COL[0], 110.6, 60, { taille: 8, gras: false, police: 'courier' });
  champ(
    'Type · capacité',
    payload.vehicle.type || payload.vehicle.capaciteTonnes != null
      ? `${payload.vehicle.type || '-'} · ${payload.vehicle.capaciteTonnes ?? '-'} t`
      : '',
    COL[1], 110.6, 56, { taille: 8, gras: false },
  );
  champ(
    "Permis · pièce d'identité",
    g.driverPermis || g.driverPiece ? `${g.driverPermis || '-'} · ${g.driverPiece || '-'}` : '',
    COL[2], 110.6, 56, { taille: 7.6, gras: false, police: 'courier' },
  );

  section('2', 'EXPÉDITEUR ET DESTINATAIRE', 124);
  for (const [partie, x, libelle] of [
    [d.expediteur, G1, 'Expéditeur'],
    [d.destinataire, 107, 'Destinataire'],
  ]) {
    put(libelle.toUpperCase(), x, 129.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
    put(decouper(ou(partie.raisonSociale).toUpperCase(), 88, 10, 'helvetica', true).slice(0, 1), x, 134.4, {
      taille: 10, gras: true,
    });
    put(`${ou(partie.adresse)} · ${ou(partie.contact)}`, x, 139.4, { taille: 8 });
    put(`RC ${ou(partie.registre)} · Réf. ${ou(partie.reference)}`, x, 144, {
      taille: 7.4, police: 'courier', couleur: GRIS,
    });
  }

  section('3', 'TRAJET', 152);
  const t = d.trajet;
  rect(G1, 156, LARGEUR, 24, BLANC);
  put('CHARGEMENT', G1 + 4, 161.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
  put(ou(t.chargement.ville).toUpperCase(), G1 + 4, 167.4, { taille: 12, gras: true });
  put(`${ou(t.chargement.lieu)} · ${ou(t.chargement.adresse)}`, G1 + 4, 172, { taille: 7.4, couleur: GRIS });
  put(`${date(t.dateDepart)} · ${t.heureDepart || '-'}`, G1 + 4, 176.4, { taille: 7.8, police: 'courier' });
  putDroite('DÉCHARGEMENT', G2 - 4, 161.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
  put(ou(t.dechargement.ville).toUpperCase(), G2 - 4, 167.4, { taille: 12, gras: true, align: 'right' });
  put(`${ou(t.dechargement.lieu)} · ${ou(t.dechargement.adresse)}`, G2 - 4, 172, {
    taille: 7.4, couleur: GRIS, align: 'right',
  });
  put(`${date(t.dateArrivee)} · ${t.heureArrivee || '-'}`, G2 - 4, 176.4, {
    taille: 7.8, police: 'courier', align: 'right',
  });
  // Flèche de liaison entre les deux villes.
  doc.setDrawColor(...ENCRE);
  doc.setLineWidth(0.4);
  doc.line(84, 165.6, 124, 165.6);
  doc.setFillColor(...ENCRE);
  doc.triangle(124, 165.6, 121.4, 164.4, 121.4, 166.8, 'F');
  let xChip = 84;
  xChip += pastille(ou(g.transportType).replaceAll('_', ' '), xChip, 169.4, { taille: 6, espace: 0.4 }) + 2.5;
  pastille(ou(g.compte).replaceAll('_', ' '), xChip, 169.4, { taille: 6, espace: 0.4 });

  section('4', 'MARCHANDISES TRANSPORTÉES', 187);
  const COLONNES = [
    { libelle: 'DÉSIGNATION', x: G1 + 2, largeur: 50 },
    { libelle: 'NATURE', x: 65, largeur: 34 },
    { libelle: 'COLIS', x: 123, largeur: 16, droite: true },
    { libelle: 'POIDS (T)', x: 145, largeur: 18, droite: true },
    { libelle: 'VOLUME (M³)', x: 172, largeur: 20, droite: true },
    { libelle: 'VALEUR (FCFA)', x: G2 - 2, largeur: 26, droite: true },
  ];
  function enteteTableau(y) {
    doc.setFillColor(...ENCRE);
    doc.rect(G1, y, LARGEUR, 6.6, 'F');
    for (const c of COLONNES) {
      const style = { taille: 5.8, gras: true, espace: 0.4, couleur: BLANC };
      if (c.droite) putDroite(c.libelle, c.x, y + 4.4, style);
      else put(c.libelle, c.x, y + 4.4, style);
    }
    return y + 6.6;
  }
  function ligneMarchandise(m, y) {
    const valeurs = [
      ou(m.designation || m.nature),
      ou(m.designation ? m.nature : ''),
      nombre(m.quantite),
      nombre(m.poidsTonnes),
      nombre(m.volumeM3),
      nombre(m.valeur),
    ];
    const blocs = valeurs.map((v, i) => decouper(v, COLONNES[i].largeur - 3, 8));
    const h = Math.max(...blocs.map((b) => b.length)) * 3.6 + 3.4;
    blocs.forEach((b, i) =>
      put(b, COLONNES[i].x, y + 4.6, {
        taille: 8,
        police: i >= 2 ? 'courier' : 'helvetica',
        interligne: 1.2,
        ...(COLONNES[i].droite ? { align: 'right' } : {}),
      }),
    );
    filet(G1, y + h, G2);
    return h;
  }
  let yTableau = enteteTableau(190.6);
  const debordement = [];
  for (const m of d.marchandises || []) {
    const blocs = [ou(m.designation || m.nature), ou(m.designation ? m.nature : '')].map((v, i) =>
      decouper(v, COLONNES[i].largeur - 3, 8),
    );
    const hauteur = Math.max(...blocs.map((b) => b.length)) * 3.6 + 3.4;
    if (yTableau + hauteur > 221 || debordement.length) debordement.push(m);
    else yTableau += ligneMarchandise(m, yTableau);
  }
  const totaux = totauxMarchandises(d.marchandises);
  doc.setFillColor(...FOND);
  doc.rect(G1, yTableau, LARGEUR, 7, 'F');
  put('TOTAL', COLONNES[0].x, yTableau + 4.6, { taille: 7, gras: true, espace: 0.4 });
  [totaux.quantite, totaux.poidsTonnes, totaux.volumeM3, totaux.valeur].forEach((valeur, i) =>
    put(nombre(valeur), COLONNES[i + 2].x, yTableau + 4.6, {
      taille: 8, gras: true, police: 'courier', align: 'right',
    }),
  );
  filet(G1, yTableau + 7, G2);
  let yApresTableau = yTableau + 11.4;
  if (debordement.length) {
    put(`${debordement.length} ligne(s) supplémentaire(s) : voir annexe marchandises.`, G1, yApresTableau, {
      taille: 6.4, gras: true, couleur: GRIS,
    });
    yApresTableau += 4.6;
  }
  let xMention = G1;
  xMention += pastille(`MARCHANDISE DANGEREUSE : ${triEtat(d.dangereuse)}`, xMention, yApresTableau - 3.4, {
    taille: 6, espace: 0.4,
  }) + 3;
  pastille(`TEMPÉRATURE DIRIGÉE : ${triEtat(d.temperatureControlee)}`, xMention, yApresTableau - 3.4, {
    taille: 6, espace: 0.4,
  });

  section('5', 'CONDITIONS FINANCIÈRES', 235);
  const f = totauxFacturation(d.facturation);
  put('RÉPARTITION DES FRAIS', G1, 240.4, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
  const repartition = [
    ["À la charge de l'expéditeur", f.totalExpediteur],
    ['À la charge du destinataire', f.totalDestinataire],
    ['Timbres fiscaux', f.timbreTotal],
  ];
  repartition.forEach(([libelle, valeur], i) => {
    const y = 246 + i * 5.4;
    put(libelle, G1, y, { taille: 8.4 });
    put(nombre(valeur), 100, y, { taille: 8.4, police: 'courier', align: 'right' });
  });
  put('Total hors taxes', 112, 246, { taille: 8.4 });
  put(nombre(f.totalExpediteur == null && f.totalDestinataire == null ? null : (f.totalExpediteur ?? 0) + (f.totalDestinataire ?? 0)), G2, 246, {
    taille: 8.4, police: 'courier', align: 'right',
  });
  put(`TVA${f.expediteur.tauxTva != null ? ` ${f.expediteur.tauxTva} %` : ''}`, 112, 251.4, { taille: 8.4 });
  put(nombre(f.tva), G2, 251.4, { taille: 8.4, police: 'courier', align: 'right' });
  doc.setFillColor(...ENCRE);
  doc.rect(112, 255.4, G2 - 112, 11, 'F');
  put('TOTAL À PERCEVOIR', 115, 261.4, { taille: 6.6, gras: true, espace: 0.5, couleur: BLANC });
  put(nombre(f.totalAPercevoir), G2 - 3, 262.4, {
    taille: 12, gras: true, police: 'courier', couleur: BLANC, align: 'right',
  });
  put('Francs CFA · aucun montant arrêté dans cette démonstration', G2, 269.4, {
    taille: 6, couleur: GRIS, align: 'right',
  });

  /* ------------------------------ verso ------------------------------ */

  doc.addPage();
  entete(false);

  section('6', 'DÉTAIL DES POSTES FACTURÉS', 38);
  doc.setFillColor(...FOND);
  doc.rect(G1, 41.4, LARGEUR, 6.6, 'F');
  put('POSTE', G1 + 3, 45.8, { taille: 5.8, gras: true, espace: 0.4 });
  putDroite('EXPÉDITEUR (FCFA)', 140, 45.8, { taille: 5.8, gras: true, espace: 0.4 });
  putDroite('DESTINATAIRE (FCFA)', G2 - 3, 45.8, { taille: 5.8, gras: true, espace: 0.4 });
  let yPoste = 48;
  for (const [libelle, cle] of [
    ['Prix du transport', 'prixTransport'],
    ['Frais accessoires', 'accessoires'],
    ['Frais complémentaires', 'complementaires'],
    ['Autres frais', 'autres'],
  ]) {
    put(libelle, G1 + 3, yPoste + 5, { taille: 8.4 });
    put(nombre(d.facturation?.expediteur?.[cle]), 140, yPoste + 5, { taille: 8.4, police: 'courier', align: 'right' });
    put(nombre(d.facturation?.destinataire?.[cle]), G2 - 3, yPoste + 5, {
      taille: 8.4, police: 'courier', align: 'right',
    });
    filet(G1, yPoste + 7.4, G2);
    yPoste += 7.4;
  }
  doc.setFillColor(...FOND);
  doc.rect(G1, yPoste, LARGEUR, 7.4, 'F');
  put('Sous-total', G1 + 3, yPoste + 5, { taille: 8.4, gras: true });
  put(nombre(f.totalExpediteur), 140, yPoste + 5, { taille: 8.4, gras: true, police: 'courier', align: 'right' });
  put(nombre(f.totalDestinataire), G2 - 3, yPoste + 5, {
    taille: 8.4, gras: true, police: 'courier', align: 'right',
  });

  section('7', 'ANNEXES ET INSTRUCTIONS', 96);
  champ('Emballages', a.emballages, G1, 101, 88, { taille: 8.4, gras: false, lignes: 2 });
  champ(
    'Pièces jointes',
    [...(a.pieces || []).map((p) => p.name), ...payload.files.map((p) => p.name)].join(', '),
    107, 101, 88, { taille: 8.4, gras: false, lignes: 2 },
  );
  champ(
    'Instructions particulières',
    [a.instructions, a.accessoires, a.complementaires].filter(Boolean).join(' '),
    G1, 113, LARGEUR, { taille: 8.4, gras: false, lignes: 3 },
  );

  section('8', 'RÉSERVES', 132);
  for (const [libelle, valeur, x] of [
    ['À la prise en charge', a.reservePriseEnCharge, G1],
    ['À la livraison', a.reserveLivraison, 107],
  ]) {
    rect(x, 136, 81, 20, BLANC);
    put(libelle.toUpperCase(), x + 3, 141, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
    if (valeur) put(decouper(valeur, 75, 7.6).slice(0, 2), x + 3, 146, { taille: 7.6, interligne: 1.3 });
    else for (let i = 0; i < 2; i += 1) filet(x + 3, 147 + i * 5, x + 78, [226, 232, 240]);
  }

  section('9', 'VISAS DE CONTRÔLE ROUTIER', 164);
  for (let i = 0; i < 4; i += 1) {
    const x = G1 + i * 47.5;
    rect(x, 168, 44.5, 24, BLANC);
    put(`CONTRÔLE ${i + 1}`, x + 3, 172.8, { taille: 5.8, gras: true, espace: 0.45 });
    put('Date · lieu', x + 3, 177.6, { taille: 6.4, couleur: GRIS });
    put('Agent · matricule', x + 3, 182.2, { taille: 6.4, couleur: GRIS });
    put('Cachet et visa', x + 3, 189.4, { taille: 6.4, couleur: GRIS });
  }
  put(
    'Ces cases se visent à la main : cette démonstration ne tient aucun journal de contrôle.',
    G1, 196.6, { taille: 6.4, couleur: GRIS },
  );

  section('10', 'SIGNATURES', 205);
  ['EXPÉDITEUR', 'TRANSPORTEUR / CONDUCTEUR', 'DESTINATAIRE'].forEach((libelle, i) => {
    const x = G1 + i * 63.5;
    rect(x, 209, 61, 26, BLANC);
    put(libelle, x + 3, 213.8, { taille: 5.8, gras: true, espace: 0.45 });
    put('Nom, qualité, date', x + 3, 218.4, { taille: 6.4, couleur: GRIS });
    filet(x + 3, 230, x + 58, [226, 232, 240]);
  });

  rect(G1, 243, LARGEUR, 25, FOND);
  put('MENTIONS', G1 + 4, 248.4, { taille: 5.8, gras: true, espace: 0.5 });
  put(
    decouper(
      'Ce document accompagne la marchandise pendant toute la durée du transport et doit être ' +
        'présenté à toute réquisition. Il est strictement personnel au voyage désigné. Toute rature, ' +
        'surcharge ou reproduction non autorisée le rend nul. Le présent tirage est une épreuve de ' +
        'travail : il n’a pas été attribué par l’Office Ivoirien des Chargeurs et ne peut en aucun cas ' +
        'être présenté comme un DUT valide.',
      LARGEUR - 8,
      7,
    ),
    G1 + 4, 253.4, { taille: 7, interligne: 1.35 },
  );

  /* ----------------------------- annexes ----------------------------- */

  // Les données B2F sans case au formulaire officiel (carte de transport, carte
  // grise, contacts, référence de mise en relation) sont reportées en annexe
  // plutôt que tues : l'empreinte les couvre, le lecteur doit pouvoir les voir.
  const LIBELLES_COMPLEMENTS = {
    appariementReference: 'Référence de la mise en relation',
    carteTransportNumero: 'Carte de transport du véhicule',
    carteGrise: 'Carte grise du véhicule',
    chauffeurTelephone: 'Téléphone du chauffeur',
    transporteurTelephone: 'Téléphone du transporteur',
    transporteurEmail: 'E-mail du transporteur',
  };
  for (const [cle, valeur] of Object.entries(d.complements || {})) {
    if (valeur) extras.push({ label: LIBELLES_COMPLEMENTS[cle] || cle, valeur });
  }

  if (debordement.length) {
    doc.addPage();
    entete(false);
    section('A', 'MARCHANDISES (SUITE DU RECTO)', 38);
    let y = enteteTableau(41.4);
    for (const m of debordement) {
      if (y > 260) {
        doc.addPage();
        entete(false);
        y = enteteTableau(38);
      }
      y += ligneMarchandise(m, y);
    }
  }

  if (extras.length) {
    doc.addPage();
    entete(false);
    section('B', 'MENTIONS COMPLÉMENTAIRES', 38);
    let y = 46;
    for (const item of extras) {
      if (y > 258) {
        doc.addPage();
        entete(false);
        y = 38;
      }
      put(item.label.toUpperCase(), G1, y, { taille: 5.8, gras: true, couleur: GRIS, espace: 0.45 });
      y += 4.4;
      for (const ligne of decouper(item.valeur, LARGEUR, 8.4)) {
        if (y > 270) {
          doc.addPage();
          entete(false);
          y = 38;
        }
        put(ligne, G1, y, { taille: 8.4 });
        y += 4.4;
      }
      y += 4;
    }
  }

  /* -------------------------- pieds de page -------------------------- */

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    filet(G1, 276, G2, ENCRE, 0.4);
    // Marque n° 5 : l'empreinte porte sur le couple document + rang d'impression.
    put("EMPREINTE D'INTÉGRITÉ SHA-256", G1, 280.4, {
      taille: 5.4, gras: true, couleur: GRIS, espace: 0.45,
    });
    put(empreinte.slice(0, 32), G1, 284, { taille: 6, police: 'courier' });
    put(empreinte.slice(32), G1, 287.4, { taille: 6, police: 'courier' });
    put('CONTRÔLE', 92, 280.4, { taille: 5.4, gras: true, couleur: GRIS, espace: 0.45 });
    put(
      decouper(
        'Cette empreinte se recalcule à partir des données du tirage. Elle ne vaut pas ' +
          'signature : aucune autorité ne la contresigne ici.',
        52,
        6,
      ),
      92, 284, { taille: 6, interligne: 1.25, couleur: GRIS },
    );
    put(`Généré le ${date(payload.generatedAt)} à ${heure(payload.generatedAt)}`, G2, 280.4, {
      taille: 6, couleur: GRIS, align: 'right',
    });
    put(`Page ${p} / ${pages}`, G2, 284.6, { taille: 8, gras: true, align: 'right' });
    put(`${COPIES[payload.copy]} · impression ${payload.rank}`, G2, 288.4, {
      taille: 6, couleur: GRIS, align: 'right',
    });
    // Marque n° 7 : micro-texte de bord reprenant le numéro.
    put(`${`${numero} · OFFICEIVOIRIENDESCHARGEURS · DOCUMENTUNIQUEDETRANSPORT · `.repeat(4)}`, G1, 292.4, {
      taille: 2.6, couleur: [168, 178, 192],
    });
    filigrane(p === 1 ? 100 : 105, p === 1 ? 70 : 150, p === 1 ? 22 : 30);
  }

  doc.setProperties({
    title: `DUT ${d.dutNumber || 'Aperçu'} - ${COPIES[payload.copy]}`,
    subject: `POC Bourse de fret - ${etat.label} - SHA-256 ${empreinte}`,
    author: 'Bourse de fret (B2F) - POC OIC',
    creator: 'Gabarit DUT recto-verso enrichi',
  });
  return doc;
}
