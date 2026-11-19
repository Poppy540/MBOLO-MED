// Comptes coupés par le responsable sécurité (plan d'incident, écart E5 de l'exercice sur table n°1).
// Un professionnel dont le compte a été volé reste « vérifié » : sa fiche ne change pas. Une marque
// `Flag` « compte coupé » dans le dossier le retire de l'annuaire, refuse les nouvelles réservations
// et met ses rendez-vous à venir dans « Rendez-vous à reprendre », jusqu'au rétablissement.
import type { Flag } from 'fhir/r4.js';
import {
  estCompteCoupe,
  leverCompteCoupe,
  marqueCompteCoupe,
  type Environnement,
} from '@mbolo/dossier-fhir';
import { ClientFhir, TYPE_FHIR, type OptionsDepotFhir, type Utilisateur } from '@mbolo/identite';
import type { Annuaire, Fiche } from './annuaire.js';
import { ErreurTeleconsultation, ROLE_SECURITE } from './rendez-vous.js';

export interface ComptesCoupes {
  /** Vrai si une marque « compte coupé » active porte sur ce professionnel (lue sans cache). */
  estCoupe(praticienId: string): Promise<boolean>;
  /** Pose la marque ; faux si elle était déjà active (rien n'est créé). */
  couper(praticienId: string, date: string): Promise<boolean>;
  /** Lève les marques actives ; faux s'il n'y en avait aucune. */
  retablir(praticienId: string, date: string): Promise<boolean>;
}

/** Développement et tests. */
export class ComptesCoupesMemoire implements ComptesCoupes {
  readonly marques: Flag[] = [];

  private actives(praticienId: string): Flag[] {
    return this.marques.filter(
      (f) => estCompteCoupe(f) && f.subject.reference === `Practitioner/${praticienId}`,
    );
  }

  async estCoupe(praticienId: string): Promise<boolean> {
    return this.actives(praticienId).length > 0;
  }

  async couper(praticienId: string, date: string): Promise<boolean> {
    if (await this.estCoupe(praticienId)) return false;
    this.marques.push({
      ...marqueCompteCoupe({ practitionerId: praticienId, date, env: 'dev' }),
      id: `marque-${this.marques.length + 1}`,
    });
    return true;
  }

  async retablir(praticienId: string, date: string): Promise<boolean> {
    const actives = this.actives(praticienId);
    for (const f of actives) this.marques[this.marques.indexOf(f)] = leverCompteCoupe(f, date);
    return actives.length > 0;
  }
}

/** Marques lues et écrites dans le dossier par la passerelle (`system/Flag.crus`). */
export class ComptesCoupesFhir extends ClientFhir implements ComptesCoupes {
  constructor(
    o: OptionsDepotFhir,
    private readonly env: Environnement,
  ) {
    super(o);
  }

  private async actives(praticienId: string): Promise<Flag[]> {
    // FHIR R4 ne cherche un Flag ni par code ni par statut (HAPI répond 400) : recherche par
    // sujet, puis filtre local sur le code et le statut.
    const sujet = encodeURIComponent(`Practitioner/${praticienId}`);
    return this.rechercher(
      `${this.base}/Flag?subject=${sujet}&_count=50`,
      'Marque de sécurité',
      (r): r is Flag =>
        r.resourceType === 'Flag' &&
        estCompteCoupe(r) &&
        r.subject.reference === `Practitioner/${praticienId}`,
    );
  }

  async estCoupe(praticienId: string): Promise<boolean> {
    return (await this.actives(praticienId)).length > 0;
  }

  async couper(praticienId: string, date: string): Promise<boolean> {
    if (await this.estCoupe(praticienId)) return false;
    const r = await this.appeler(`${this.base}/Flag`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=minimal' },
      body: JSON.stringify(marqueCompteCoupe({ practitionerId: praticienId, date, env: this.env })),
    });
    if (r.status !== 201 && r.status !== 200) throw ClientFhir.echec(r, 'Marque de sécurité');
    return true;
  }

  async retablir(praticienId: string, date: string): Promise<boolean> {
    const actives = await this.actives(praticienId);
    for (const f of actives) {
      if (!f.id) continue;
      const version = f.meta?.versionId;
      const r = await this.appeler(`${this.base}/Flag/${encodeURIComponent(f.id)}`, {
        method: 'PUT',
        headers: {
          'content-type': TYPE_FHIR,
          prefer: 'return=minimal',
          ...(version ? { 'if-match': `W/"${version}"` } : {}),
        },
        body: JSON.stringify(leverCompteCoupe(f, date)),
      });
      if (!r.ok) throw ClientFhir.echec(r, 'Marque de sécurité');
    }
    return actives.length > 0;
  }
}

/**
 * L'annuaire ne donne pas de fiche à un professionnel dont le compte est coupé : il disparaît de
 * l'annuaire, ne publie ni ne reçoit de réservation, et ses rendez-vous à venir sont à reprendre.
 */
export class AnnuaireSansComptesCoupes implements Annuaire {
  constructor(
    private readonly annuaire: Annuaire,
    private readonly coupes: ComptesCoupes,
  ) {}

  async fiche(praticienId: string, maintenant: Date): Promise<Fiche | undefined> {
    if (await this.coupes.estCoupe(praticienId)) return undefined;
    return this.annuaire.fiche(praticienId, maintenant);
  }
}

/** Couper et rétablir : une personne du rôle `responsable-securite`, jamais un agent IA. */
export class ServiceComptesCoupes {
  constructor(
    private readonly coupes: ComptesCoupes,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  private static exiger(u: Utilisateur): void {
    if (!u.roles.includes(ROLE_SECURITE) || u.agent || u.roles.includes('agent-ia')) {
      throw new ErreurTeleconsultation('Accès refusé.', 403);
    }
  }

  async couper(u: Utilisateur, praticienId: string): Promise<boolean> {
    ServiceComptesCoupes.exiger(u);
    return this.coupes.couper(praticienId, this.maintenant().toISOString());
  }

  async retablir(u: Utilisateur, praticienId: string): Promise<boolean> {
    ServiceComptesCoupes.exiger(u);
    return this.coupes.retablir(praticienId, this.maintenant().toISOString());
  }
}
