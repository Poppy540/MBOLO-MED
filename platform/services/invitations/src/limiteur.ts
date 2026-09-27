// Limitation des essais de code par adresse (fenêtre fixe, en mémoire). Suffit pour une instance ;
// avec plusieurs instances, la limite est par instance (voir le README).
export class Limiteur {
  private readonly essais = new Map<string, { debut: number; nombre: number }>();

  constructor(
    private readonly maximum: number,
    private readonly fenetreMs: number,
  ) {}

  /** Compte un essai ; `false` si la limite est dépassée pour cette clé. */
  essayer(cle: string, maintenant: number = Date.now()): boolean {
    if (this.essais.size > 10_000) this.purger(maintenant);
    const e = this.essais.get(cle);
    if (!e || maintenant - e.debut >= this.fenetreMs) {
      this.essais.set(cle, { debut: maintenant, nombre: 1 });
      return true;
    }
    e.nombre++;
    return e.nombre <= this.maximum;
  }

  private purger(maintenant: number): void {
    for (const [cle, e] of this.essais) {
      if (maintenant - e.debut >= this.fenetreMs) this.essais.delete(cle);
    }
  }
}
