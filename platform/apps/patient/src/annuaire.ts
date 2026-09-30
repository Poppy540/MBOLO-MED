// Annuaire des médecins : filtre par spécialité, calculé sur le téléphone à partir de la liste déjà
// reçue (aucun appel de plus, faible débit).
import type { Praticien } from './api.js';

/** Spécialités présentes dans l'annuaire, sans doublon, dans l'ordre alphabétique de la langue. */
export function specialites(liste: Praticien[], langue: string): string[] {
  const vues = new Set(liste.map((p) => p.specialite?.trim()).filter((s): s is string => !!s));
  return [...vues].sort((a, b) => a.localeCompare(b, langue));
}

/** Médecins de la spécialité choisie ; tous si aucune n'est choisie. */
export function filtrer(liste: Praticien[], specialite: string | undefined): Praticien[] {
  return specialite ? liste.filter((p) => p.specialite?.trim() === specialite) : liste;
}
