/**
 * Détection de coordonnées glissées dans un texte libre — pure, sans effet.
 *
 * **Complément du correctif anti-fraude n° 1 (13/10/2026).** Masquer la raison
 * sociale ne sert à rien si un champ libre visible de la contrepartie avant
 * validation — libellé du fret, contraintes de la demande, précision d'un
 * rejet — peut porter « appelez le 07 07 07 07 07 ». Ces champs refusent donc
 * un numéro de téléphone, une adresse électronique ou un lien de messagerie.
 *
 * **Limite assumée** : un numéro écrit en toutes lettres passera. Le filtre
 * ferme le contournement par réflexe, pas le contournement déterminé ; celui-ci
 * relève de la modération et de la réputation (avis, correctif n° 2).
 *
 * @module domain/texte
 */

/**
 * Dates usuelles, neutralisées avant le comptage des chiffres : ISO (y compris
 * suivie d'une heure) et jour-mois-année **à quatre chiffres**. L'année courte
 * n'est pas admise : « 07.07.07.07.07 » est un numéro ivoirien, pas une date.
 */
const DATES = /(?<![\d./-])(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})(?![\d./-]?\d)/g;

/** Références de la plateforme (MR-2026-0004, DT-2026-0001…) : publiques, pas des numéros. */
const REFERENCES = /\b[A-Z]{2,3}-\d{4}-\d{4}\b/g;

/** Suite de chiffres et de séparateurs courants d'un numéro. */
const SUITE_NUMERIQUE = /\+?\d[\d\s.\-()/]{6,}\d/g;

/** Nombre minimal de chiffres pour qu'une suite soit tenue pour un numéro. */
const CHIFFRES_NUMERO = 8;

const COURRIEL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const MESSAGERIE = /\b(?:https?:\/\/|www\.|wa\.me|whatsapp|telegram|t\.me)/i;

/**
 * Le texte contient-il une coordonnée ?
 * @param {unknown} texte
 * @returns {boolean}
 */
export function contientCoordonnees(texte) {
  if (texte == null) return false;
  const brut = String(texte);
  if (COURRIEL.test(brut) || MESSAGERIE.test(brut)) return true;
  const sansDates = brut.replace(REFERENCES, ' ').replace(DATES, ' ');
  return (sansDates.match(SUITE_NUMERIQUE) ?? []).some(
    (suite) => suite.replace(/\D/g, '').length >= CHIFFRES_NUMERO,
  );
}

/**
 * Lève si un champ libre contient une coordonnée.
 * @param {unknown} texte
 * @param {string} libelleChamp Nom du champ, pour le message.
 * @throws {Error}
 */
export function refuserCoordonnees(texte, libelleChamp) {
  if (contientCoordonnees(texte)) {
    throw new Error(
      `« ${libelleChamp} » ne peut pas contenir de numéro de téléphone, d’adresse ` +
        'électronique ni de lien de messagerie. Ce texte est lu par la contrepartie ' +
        'avant la validation : les coordonnées ne sont transmises qu’à la mise en ' +
        'relation, après règlement des frais.',
    );
  }
}
