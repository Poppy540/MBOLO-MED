// Services appelés pour inviter un proche (ADR-0019) :
// - le dossier, via la passerelle, avec le compte de service mbolo-invitations-service
//   (system/RelatedPerson.cru : fiche du proche seulement) ;
// - identite, avec le jeton du patient, pour son consentement C-PROCHE ;
// - notifications, avec le compte de service, pour le SMS du code.
// Aucun contenu (prénom, numéro, code) n'est journalisé ici.
import type { FhirResource, RelatedPerson } from 'fhir/r4.js';
import { ClientFhir, ErreurDepot, TYPE_FHIR, type FournisseurJeton } from '@mbolo/identite';
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

  async activer(id: string): Promise<void> {
    const fiche = await this.lire(id);
    if (!fiche) throw new ErreurDepot('Fiche du proche introuvable.', 409);
    if (fiche.active) return;
    const version = fiche.meta?.versionId;
    const r = await this.appeler(`${this.base}/RelatedPerson/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPE_FHIR,
        ...(version ? { 'if-match': `W/"${version}"` } : {}),
      },
      body: JSON.stringify({ ...fiche, active: true }),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Proche');
  }
}

/** Erreur d'un service appelé : jamais de détail transmis au patient. */
export class ErreurServiceAppele extends Error {
  constructor(readonly statut: number) {
    super('Service momentanément indisponible.');
  }
}

export class ConsentementsIdentite implements ConsentementsProche {
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
}
