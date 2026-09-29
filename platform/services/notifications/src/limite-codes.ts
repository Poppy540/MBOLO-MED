// Limite des codes de double authentification par dossier (ADR-0022). L'extension Keycloak limite
// déjà les envois par session de connexion ; une nouvelle session remet ce compte à zéro. Cette
// limite, par dossier et toutes sessions confondues, empêche d'envoyer des SMS en boucle au patient.
// En mémoire, par instance du service : l'alerte `code-connexion`, comptée sur toutes les instances
// par la supervision, reste le garde-fou global.

export class LimiteCodes {
  private readonly envois = new Map<string, number[]>();

  constructor(
    readonly max = 10,
    readonly fenetreMs = 3_600_000,
    private readonly maintenant: () => number = () => Date.now(),
  ) {}

  /** Vrai si un code de plus est permis pour ce dossier ; il est alors compté. */
  accepter(patientId: string): boolean {
    const t = this.maintenant();
    // Les dossiers sans envoi récent sont oubliés : la mémoire reste bornée.
    for (const [id, dates] of this.envois) {
      const recentes = dates.filter((d) => t - d < this.fenetreMs);
      if (recentes.length === 0) this.envois.delete(id);
      else this.envois.set(id, recentes);
    }
    const dates = this.envois.get(patientId) ?? [];
    if (dates.length >= this.max) return false;
    this.envois.set(patientId, [...dates, t]);
    return true;
  }
}
