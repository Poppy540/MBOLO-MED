// Dernière liste de rendez-vous connue, affichée sans réseau (lecture seule).
import { quand } from './format.js';
import { rendezVousRetenus, type Stockage } from './hors-ligne.js';
import { Picto } from './pictos.js';

export function RendezVousHorsLigne(p: { stockage: Stockage; fuseau: string; langue: string }) {
  const retenus = rendezVousRetenus(p.stockage);
  return (
    <section data-hors-ligne="">
      <p class="message" role="status">
        <Picto nom="sans-reseau" /> Pas de réseau.
        {retenus
          ? ` Rendez-vous connus au ${quand(retenus.date, p.fuseau, p.langue)} :`
          : ' Reconnectez-vous au réseau pour voir vos rendez-vous.'}
      </p>
      {retenus && retenus.liste.length > 0 && (
        <ul class="liste" aria-label="Rendez-vous connus">
          {retenus.liste
            .slice()
            .sort((a, b) => a.debut.localeCompare(b.debut))
            .map((r) => (
              <li key={r.id}>
                <strong>{quand(r.debut, p.fuseau, p.langue)}</strong> ({r.dureeMinutes} min)
              </li>
            ))}
        </ul>
      )}
      {retenus && retenus.liste.length === 0 && <p>Aucun rendez-vous prévu.</p>}
    </section>
  );
}
