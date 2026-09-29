// Limitation des essais (fenêtre fixe) : vérification des codes d'invitation, contrôle de la date
// de naissance par l'assistance. En production, les compteurs sont dans PostgreSQL et valent pour
// toutes les instances (revue ASVS n°1, D3) ; en mémoire, seulement pour les tests.
import type { Sql } from '@mbolo/base-donnees';

export interface Limiteur {
  /** Compte un essai ; `false` si la limite est dépassée pour cette clé. */
  essayer(cle: string, maintenant?: number): Promise<boolean>;
}

/** Compteurs en mémoire, par instance : tests et développement. */
export class LimiteurMemoire implements Limiteur {
  private readonly essais = new Map<string, { debut: number; nombre: number }>();

  constructor(
    private readonly maximum: number,
    private readonly fenetreMs: number,
  ) {}

  async essayer(cle: string, maintenant: number = Date.now()): Promise<boolean> {
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

/**
 * Compteurs partagés dans PostgreSQL (table `invitations.essais`). Un seul `insert … on conflict`
 * compte l'essai et relit le total : deux instances ne peuvent pas dépasser la limite ensemble.
 * La clé n'est stockée que sous forme d'empreinte HMAC (jamais l'adresse ni le sujet en clair).
 */
export class LimiteurPostgres implements Limiteur {
  constructor(
    private readonly sql: Sql,
    private readonly o: {
      /** Nom du compteur, ex. `verification-code`, `assistance-naissance`. */
      portee: string;
      maximum: number;
      fenetreMs: number;
      empreinte: (valeur: string) => Buffer;
    },
  ) {}

  async essayer(cle: string, maintenant: number = Date.now()): Promise<boolean> {
    const debut = new Date(maintenant);
    const limite = new Date(maintenant - this.o.fenetreMs);
    const empreinte = this.o.empreinte(`${this.o.portee}:${cle}`);
    // Dans « set », les colonnes désignent la ligne avant modification : la fenêtre expirée repart
    // à 1, sinon le compteur augmente.
    const [r] = await this.sql<{ nombre: number }[]>`
      insert into invitations.essais (portee, cle, debut, nombre)
      values (${this.o.portee}, ${empreinte}, ${debut}, 1)
      on conflict (portee, cle) do update set
        debut = case when invitations.essais.debut <= ${limite} then excluded.debut
                     else invitations.essais.debut end,
        nombre = case when invitations.essais.debut <= ${limite} then 1
                      else least(invitations.essais.nombre + 1, 1000000) end
      returning nombre`;
    return (r?.nombre ?? Number.POSITIVE_INFINITY) <= this.o.maximum;
  }
}
