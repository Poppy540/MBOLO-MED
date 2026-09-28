// Prévenir l'autre participant d'une annulation ou d'un report (service notifications, ADR-0012).
// Une notification ne bloque jamais l'action : un échec est journalisé, jamais renvoyé.
import type { Journal } from '@mbolo/journal-securise';

export type EvenementRendezVous =
  'rendez-vous-annule' | 'rendez-vous-reporte' | 'rendez-vous-confirme' | 'reservation-expiree';

export interface Notificateur {
  prevenir(destinataire: string, evenement: EvenementRendezVous, instant: string): Promise<void>;
}

export const aucunNotificateur: Notificateur = { prevenir: async () => undefined };

export class NotificateurHttp implements Notificateur {
  constructor(
    private readonly o: {
      /** URL du service notifications, ex. http://127.0.0.1:3004 */
      url: string;
      /** Jeton de service (audience mbolo-notifications). */
      entetes: () => Promise<Record<string, string>>;
      journal: Journal;
      fetch?: typeof fetch;
    },
  ) {}

  async prevenir(destinataire: string, evenement: EvenementRendezVous, instant: string) {
    try {
      const r = await (this.o.fetch ?? fetch)(`${this.o.url}/notifications`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await this.o.entetes()) },
        body: JSON.stringify({ destinataire, gabarit: evenement, instant }),
        signal: AbortSignal.timeout(5_000),
      });
      if (r.status !== 202) {
        this.o.journal.avertissement('notification refusée', { evenement, statut: r.status });
      }
    } catch {
      this.o.journal.avertissement('service de notifications injoignable', { evenement });
    }
  }
}
