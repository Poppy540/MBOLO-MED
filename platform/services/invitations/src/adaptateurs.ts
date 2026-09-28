// Services appelés pour inviter un proche (ADR-0019) :
// - le dossier, via la passerelle, avec le compte de service mbolo-invitations-service
//   (system/RelatedPerson.cru : fiche du proche seulement) ;
// - identite, avec le jeton du patient, pour son consentement C-PROCHE ;
// - notifications, avec le compte de service, pour le SMS du code.
// Aucun contenu (prénom, numéro, code) n'est journalisé ici.
import type { AuditEvent, FhirResource, Patient, RelatedPerson } from 'fhir/r4.js';
import { ClientFhir, ErreurDepot, TYPE_FHIR, type FournisseurJeton } from '@mbolo/identite';
import type { ConsentementsAssistance, DossierAssistance } from './assistance.js';
import type { ConsentementsProche, DossierProches, SmsInvitation } from './proches.js';

export class DossierProchesFhir extends ClientFhir implements DossierProches {
  private static fiche(x: unknown): RelatedPerson {
    if ((x as FhirResource | null)?.resourceType !== 'RelatedPerson') {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    return x as RelatedPerson;
  }

  async creer(r: RelatedPerson): Promise<string> {
    const reponse = await this.appeler(`${this.base}/RelatedPerson`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=representation' },
      body: JSON.stringify(r),
    });
    if (reponse.status !== 201 && reponse.status !== 200) {
      throw ClientFhir.echec(reponse, 'Proche');
    }
    const id = DossierProchesFhir.fiche(await reponse.json()).id;
    if (!id) throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    return id;
  }

  async lire(id: string): Promise<RelatedPerson | undefined> {
    const r = await this.appeler(`${this.base}/RelatedPerson/${encodeURIComponent(id)}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Proche');
    return DossierProchesFhir.fiche(await r.json());
  }

  activer(id: string): Promise<void> {
    return this.changerActivation(id, true);
  }

  desactiver(id: string): Promise<void> {
    return this.changerActivation(id, false);
  }

  private async changerActivation(id: string, actif: boolean): Promise<void> {
    const fiche = await this.lire(id);
    if (!fiche) throw new ErreurDepot('Fiche du proche introuvable.', 409);
    if (fiche.active === actif) return;
    const version = fiche.meta?.versionId;
    const r = await this.appeler(`${this.base}/RelatedPerson/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPE_FHIR,
        ...(version ? { 'if-match': `W/"${version}"` } : {}),
      },
      body: JSON.stringify({ ...fiche, active: actif }),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Proche');
  }
}

/**
 * Assistance aux patients (ADR-0019) : recherche par numéro, lecture du numéro de téléphone et de la
 * date de naissance (seuls éléments permis au compte de service), fiches des proches, traces.
 */
export class DossierAssistanceFhir extends ClientFhir implements DossierAssistance {
  rechercherPatients(systeme: string, valeur: string): Promise<Patient[]> {
    return this.rechercher(
      `${this.base}/Patient?identifier=${encodeURIComponent(`${systeme}|${valeur}`)}&_count=20`,
      'Patient',
      (r): r is Patient => r.resourceType === 'Patient',
    );
  }

  async patient(patientId: string): Promise<Patient | undefined> {
    const r = await this.appeler(`${this.base}/Patient/${encodeURIComponent(patientId)}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Patient');
    const p = (await r.json()) as Patient;
    return p.resourceType === 'Patient' && p.id === patientId ? p : undefined;
  }

  prochesDuPatient(patientId: string): Promise<RelatedPerson[]> {
    // Toutes les pages : les fiches retirées restent dans le dossier (traçabilité).
    return this.rechercher(
      `${this.base}/RelatedPerson?patient=${encodeURIComponent(`Patient/${patientId}`)}&_count=100`,
      'Proche',
      (r): r is RelatedPerson =>
        r.resourceType === 'RelatedPerson' && r.patient.reference === `Patient/${patientId}`,
    );
  }

  async tracer(trace: AuditEvent): Promise<void> {
    const r = await this.appeler(`${this.base}/AuditEvent`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR },
      body: JSON.stringify(trace),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Trace');
  }
}

/** Erreur d'un service appelé : jamais de détail transmis au patient. */
export class ErreurServiceAppele extends Error {
  constructor(readonly statut: number) {
    super('Service momentanément indisponible.');
  }
}

export class ConsentementsIdentite implements ConsentementsProche, ConsentementsAssistance {
  constructor(
    private readonly url: string,
    private readonly appeler: typeof fetch = fetch,
  ) {}

  async accorder(o: {
    jetonPatient: string;
    patientId: string;
    relatedPersonId: string;
    versionTexte: string;
  }): Promise<void> {
    let r: Response;
    try {
      r = await this.appeler(
        `${this.url}/patients/${encodeURIComponent(o.patientId)}/consentements`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${o.jetonPatient}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            categorie: 'C-PROCHE',
            mode: 'texte',
            versionTexte: o.versionTexte,
            accepte: true,
            beneficiaire: `RelatedPerson/${o.relatedPersonId}`,
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch {
      throw new ErreurServiceAppele(503);
    }
    if (r.status !== 201) throw new ErreurServiceAppele(r.status === 403 ? 403 : 503);
  }

  async retirer(o: {
    jetonPatient: string;
    patientId: string;
    relatedPersonId: string;
  }): Promise<void> {
    const cible = `RelatedPerson/${o.relatedPersonId}`;
    const liste = await this.demander(
      `/patients/${encodeURIComponent(o.patientId)}/consentements`,
      o.jetonPatient,
    );
    const { consentements } = (await liste.json()) as {
      consentements?: {
        id?: string;
        status?: string;
        category?: { coding?: { code?: string }[] }[];
        provision?: { actor?: { reference?: { reference?: string } }[] };
      }[];
    };
    for (const c of consentements ?? []) {
      if (
        c.id &&
        c.status === 'active' &&
        c.category?.[0]?.coding?.[0]?.code === 'C-PROCHE' &&
        c.provision?.actor?.[0]?.reference?.reference === cible
      ) {
        await this.demander(
          `/consentements/${encodeURIComponent(c.id)}/revocation`,
          o.jetonPatient,
          'POST',
        );
      }
    }
  }

  /** Retrait par l'équipe d'assistance : identite ne révoque que les partages C-PROCHE. */
  async retirerTous(o: { jetonEquipe: string; patientId: string }): Promise<number> {
    const r = await this.demander(
      `/patients/${encodeURIComponent(o.patientId)}/proches/retrait-assistance`,
      o.jetonEquipe,
      'POST',
    );
    return ((await r.json()) as { revoques?: number }).revoques ?? 0;
  }

  private async demander(chemin: string, jeton: string, methode: 'GET' | 'POST' = 'GET') {
    let r: Response;
    try {
      r = await this.appeler(`${this.url}${chemin}`, {
        method: methode,
        headers: { authorization: `Bearer ${jeton}` },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ErreurServiceAppele(503);
    }
    if (!r.ok) throw new ErreurServiceAppele(r.status === 403 ? 403 : 503);
    return r;
  }
}

export class SmsNotifications implements SmsInvitation {
  constructor(
    private readonly url: string,
    private readonly entetes: FournisseurJeton,
    private readonly appeler: typeof fetch = fetch,
  ) {}

  async envoyer(o: {
    telephone: string;
    code: string;
    jours: number;
  }): Promise<'envoyee' | 'echec'> {
    try {
      const r = await this.appeler(`${this.url}/invitations-proche`, {
        method: 'POST',
        headers: { ...(await this.entetes()), 'content-type': 'application/json' },
        body: JSON.stringify(o),
        signal: AbortSignal.timeout(5_000),
      });
      if (r.status !== 202) return 'echec';
      const b = (await r.json()) as { resultat?: string };
      return b.resultat === 'envoyee' ? 'envoyee' : 'echec';
    } catch {
      return 'echec';
    }
  }

  async alerterPatient(
    patientId: string,
    alerte: 'proche-inscrit' | 'proches-retires',
  ): Promise<'envoyee' | 'echec'> {
    try {
      const r = await this.appeler(`${this.url}/alertes/${alerte}`, {
        method: 'POST',
        headers: { ...(await this.entetes()), 'content-type': 'application/json' },
        body: JSON.stringify({ patientId }),
        signal: AbortSignal.timeout(5_000),
      });
      if (r.status !== 202) return 'echec';
      const b = (await r.json()) as { resultat?: string };
      return b.resultat === 'envoyee' ? 'envoyee' : 'echec';
    } catch {
      return 'echec';
    }
  }
}
