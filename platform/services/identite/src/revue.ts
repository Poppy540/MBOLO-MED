// Revue humaine des bris de glace (ADR-0009) : un relecteur habilité (rôle revue-acces, MFA
// obligatoire, aucun accès clinique) voit les accès d'urgence à revoir, ceux en retard, et
// enregistre sa conclusion. Qui relit, et sous quel délai, est décidé par le porteur de projet.
import {
  CONCLUSIONS_REVUE,
  revueBrisDeGlace,
  type ConclusionRevue,
  type Environnement,
} from '@mbolo/dossier-fhir';
import type { AuditEvent } from 'fhir/r4.js';
import { ErreurAcces } from './consentements.js';
import type { JournalAcces } from './journal-acces.js';
import type { Utilisateur } from './roles.js';

export { CONCLUSIONS_REVUE };

export class ErreurRevue extends Error {
  constructor(
    message: string,
    readonly statut: 404 | 409,
  ) {
    super(message);
    this.name = 'ErreurRevue';
  }
}

export interface BrisDeGlaceARevoir {
  traceId: string;
  date: string;
  patientId: string;
  /** Identifiant technique du professionnel qui a demandé l'accès. */
  demandeur: string;
  roles: string[];
  justification: string;
  /** Délai de revue dépassé sans revue. */
  enRetard: boolean;
  revue?: { conclusion: string; date: string; commentaire?: string };
}

const sujetDe = (e: AuditEvent): string => e.agent[0]?.who?.identifier?.value ?? '';

export class ServiceRevue {
  constructor(
    private readonly journal: JournalAcces,
    private readonly env: Environnement,
    /** Délai de revue en heures (proposition : 24 h, à valider par le porteur de projet). */
    private readonly delaiHeures: number,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  private static exiger(u: Utilisateur): void {
    if (!u.roles.includes('revue-acces')) throw new ErreurAcces('Accès refusé.');
  }

  async lister(u: Utilisateur, statut: 'a-revoir' | 'toutes'): Promise<BrisDeGlaceARevoir[]> {
    ServiceRevue.exiger(u);
    const [accesUrgence, revues] = await Promise.all([
      this.journal.parSousType('bris-de-glace'),
      this.journal.parSousType('revue-bris-de-glace'),
    ]);
    const revueDe = new Map<string, AuditEvent>();
    for (const r of revues) {
      const cible = r.entity?.[0]?.what?.reference?.replace('AuditEvent/', '');
      if (cible && !revueDe.has(cible)) revueDe.set(cible, r);
    }
    const limite = this.maintenant().getTime() - this.delaiHeures * 3_600_000;
    const liste = accesUrgence
      // Seuls les accès effectivement accordés sont à revoir.
      .filter((e) => e.id && e.outcome === '0')
      .map((e): BrisDeGlaceARevoir => {
        const r = revueDe.get(e.id ?? '');
        const commentaire = r?.entity?.[0]?.detail?.find(
          (d) => d.type === 'commentaire-revue',
        )?.valueString;
        return {
          traceId: e.id ?? '',
          date: e.recorded,
          patientId: e.entity?.[0]?.what?.reference?.replace('Patient/', '') ?? '',
          demandeur: sujetDe(e),
          roles: (e.agent[0]?.role ?? []).flatMap((x) => (x.coding ?? []).map((c) => c.code ?? '')),
          justification:
            e.entity?.[0]?.detail?.find((d) => d.type === 'justification-bris-de-glace')
              ?.valueString ?? '',
          enRetard: !r && new Date(e.recorded).getTime() < limite,
          ...(r
            ? {
                revue: {
                  conclusion: r.outcomeDesc ?? '',
                  date: r.recorded,
                  ...(commentaire ? { commentaire } : {}),
                },
              }
            : {}),
        };
      });
    return statut === 'toutes' ? liste : liste.filter((x) => !x.revue);
  }

  async revoir(
    u: Utilisateur,
    traceId: string,
    conclusion: ConclusionRevue,
    commentaire?: string,
  ): Promise<void> {
    ServiceRevue.exiger(u);
    const cible = (await this.lister(u, 'toutes')).find((x) => x.traceId === traceId);
    if (!cible) throw new ErreurRevue('Bris de glace introuvable.', 404);
    if (cible.revue) throw new ErreurRevue('Ce bris de glace a déjà été revu.', 409);
    // Séparation des tâches : on ne revoit jamais son propre accès d'urgence.
    if (cible.demandeur === u.sujet) throw new ErreurAcces('Accès refusé.');
    await this.journal.consigner(
      revueBrisDeGlace({
        traceId,
        sujet: u.sujet,
        conclusion,
        ...(commentaire ? { commentaire } : {}),
        date: this.maintenant().toISOString(),
        env: this.env,
      }),
    );
  }
}
