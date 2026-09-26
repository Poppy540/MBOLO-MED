// Journal structuré (JSON, une ligne par événement), masqué par construction.
import { masquer, masquerTexte } from './masquer.js';

export type Niveau = 'debug' | 'info' | 'avertissement' | 'erreur';

export interface Evenement {
  horodatage: string;
  niveau: Niveau;
  service: string;
  message: string;
  contexte?: unknown;
}

export interface OptionsJournal {
  service: string;
  ecrire?: (ligne: string) => void;
  maintenant?: () => Date;
}

export interface Journal {
  debug(message: string, contexte?: Record<string, unknown>): void;
  info(message: string, contexte?: Record<string, unknown>): void;
  avertissement(message: string, contexte?: Record<string, unknown>): void;
  erreur(message: string, contexte?: Record<string, unknown>): void;
}

export function creerJournal(options: OptionsJournal): Journal {
  const ecrire = options.ecrire ?? ((ligne: string) => process.stdout.write(ligne + '\n'));
  const maintenant = options.maintenant ?? (() => new Date());

  const journaliser = (niveau: Niveau, message: string, contexte?: Record<string, unknown>) => {
    const evenement: Evenement = {
      horodatage: maintenant().toISOString(),
      niveau,
      service: options.service,
      message: masquerTexte(message),
    };
    if (contexte !== undefined) evenement.contexte = masquer(contexte);
    ecrire(JSON.stringify(evenement));
  };

  return {
    debug: (m, c) => journaliser('debug', m, c),
    info: (m, c) => journaliser('info', m, c),
    avertissement: (m, c) => journaliser('avertissement', m, c),
    erreur: (m, c) => journaliser('erreur', m, c),
  };
}
