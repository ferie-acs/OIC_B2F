/** La validité documentaire est indépendante de la disponibilité commerciale. */
export function etatCarteTransport(vehicule, maintenant = Date.now()) {
  const valeur = String(vehicule.carteTransportEcheance ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return 'inconnue';
  const date = new Date(`${valeur}T23:59:59.999`);
  const [annee, mois, jour] = valeur.split('-').map(Number);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== annee || date.getMonth() !== mois - 1 || date.getDate() !== jour) return 'inconnue';
  return date.getTime() < maintenant ? 'expiree' : 'valide';
}
