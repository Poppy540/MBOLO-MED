// Fournisseur OpenFeature pour Unleash (ADR-0007) : le code métier ne dépend que d'OpenFeature,
// l'outil peut changer sans réécrire les services.
import {
  ErrorCode,
  ServerProviderStatus,
  type EvaluationContext,
  type JsonValue,
  type Provider,
  type ResolutionDetails,
} from '@openfeature/server-sdk';
import { InMemStorageProvider, Unleash, type Context } from 'unleash-client';

export interface OptionsUnleash {
  /** URL de l'API Unleash, ex. https://flags.mbolo-sante.example/api */
  url: string;
  /** Jeton backend (évaluation seule), depuis le coffre-fort. */
  jeton: string;
  application: string;
  /** Intervalle de rafraîchissement en ms (défaut : 15 000). */
  rafraichissementMs?: number;
  /** Attente maximale de la première synchronisation en ms (défaut : 5 000). */
  attenteMaxMs?: number;
}

const erreurType = <T>(valeur: T): ResolutionDetails<T> => ({
  value: valeur,
  reason: 'ERROR',
  errorCode: ErrorCode.TYPE_MISMATCH,
});

export class FournisseurUnleash implements Provider {
  readonly metadata = { name: 'unleash-mbolo' } as const;
  readonly runsOn = 'server' as const;
  status = ServerProviderStatus.NOT_READY;
  private readonly client: Unleash;
  private readonly attenteMaxMs: number;

  constructor(o: OptionsUnleash) {
    this.attenteMaxMs = o.attenteMaxMs ?? 5_000;
    this.client = new Unleash({
      url: o.url,
      appName: o.application,
      customHeaders: { Authorization: o.jeton },
      refreshInterval: o.rafraichissementMs ?? 15_000,
      disableMetrics: true,
      // Aucune copie des flags sur disque.
      storageProvider: new InMemStorageProvider(),
      skipInstanceCountWarning: true,
    });
    // Unleash injoignable : on garde la dernière configuration connue, sinon « désactivé ».
    this.client.on('error', () => undefined);
  }

  async initialize(): Promise<void> {
    await new Promise<void>((resolve) => {
      const fin = () => {
        clearTimeout(minuterie);
        resolve();
      };
      // On n'attend pas indéfiniment : sans réponse, tout reste désactivé.
      const minuterie = setTimeout(fin, this.attenteMaxMs);
      this.client.once('synchronized', fin);
      this.client.once('ready', fin);
    });
    this.status = ServerProviderStatus.READY;
  }

  async onClose(): Promise<void> {
    this.client.destroy();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const proprietes: Record<string, string> = {};
    for (const cle of ['typeUtilisateur', 'ville', 'specialite', 'vague']) {
      const v = context[cle];
      if (typeof v === 'string') proprietes[cle] = v;
    }
    const contexte: Context = {
      ...(context.targetingKey ? { userId: context.targetingKey } : {}),
      properties: proprietes,
    };
    return {
      value: this.client.isEnabled(flagKey, contexte, defaultValue),
      reason: 'TARGETING_MATCH',
    };
  }

  async resolveStringEvaluation(_: string, d: string): Promise<ResolutionDetails<string>> {
    return erreurType(d);
  }

  async resolveNumberEvaluation(_: string, d: number): Promise<ResolutionDetails<number>> {
    return erreurType(d);
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    _: string,
    d: T,
  ): Promise<ResolutionDetails<T>> {
    return erreurType(d);
  }
}
