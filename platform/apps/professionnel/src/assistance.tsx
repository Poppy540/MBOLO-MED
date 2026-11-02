// « Aider un patient qui appelle », rôle assistance-patient (double authentification, jamais un agent
// IA). Le patient appelle l'équipe parce qu'il ne peut pas agir lui-même dans son application. Étapes,
// dans l'ordre :
// 1. retrouver son dossier par son numéro (assurance maladie ou provisoire) ;
// 2. raccrocher et le rappeler au numéro du dossier, jamais à un numéro donné pendant l'appel ;
// 3. lui faire dire sa date de naissance : le service la compare, l'équipe ne la voit pas.
// Ensuite, selon sa demande :
// - retirer TOUS ses proches (ADR-0019), le patient reçoit un SMS ;
// - lui donner un code pour retrouver son compte (ADR-0021) : le patient lit aussi son numéro, que le
//   service compare ; le code est affiché une seule fois, pour être dicté pendant l'appel.
// Rien d'autre du dossier n'est affiché. Chargé à la demande.
// Rendez-vous à reprendre (ADR-0026, étape 5) : rendez-vous à venir chez un professionnel suspendu
// ou à revérifier ; l'équipe appelle chaque patient au numéro de son dossier (donné pour ce
// rendez-vous seulement, et tracé) pour lui proposer un autre médecin. Rien n'est annulé.
import { useEffect, useState } from 'preact/hooks';
import { appelReseau, creerTraducteur } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { frAssistance } from './textes-fr-assistance.js';

const t = creerTraducteur(frAssistance, CONFIG.langue);

interface Fiche {
  patientId: string;
  telephone?: string;
  proches: number;
  /** Type du numéro qui a servi à retrouver le dossier. */
  type: string;
}

type Demande = 'proches' | 'compte';

class ErreurAssistance extends Error {}

async function appeler<T>(jeton: string, chemin: string, corps: unknown): Promise<T> {
  let r: Response;
  try {
    r = await appelReseau(`${CONFIG.apiInvitations}${chemin}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurAssistance((e as Error).message);
  }
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurAssistance(e.erreur ?? t('assist.indisponible'));
  }
  return (await r.json()) as T;
}

interface AReprendre {
  rendezVousId: string;
  debut: string;
  statut: 'prevu' | 'a-payer';
}

async function lireAReprendre(jeton: string): Promise<AReprendre[]> {
  let r: Response;
  try {
    r = await appelReseau(`${CONFIG.api}/assistance/rendez-vous-a-reprendre`, {
      headers: { authorization: `Bearer ${jeton}` },
      cache: 'no-store',
    });
  } catch (e) {
    throw new ErreurAssistance((e as Error).message);
  }
  if (!r.ok) throw new ErreurAssistance(t('assist.indisponible'));
  return ((await r.json()) as { rendezVous: AReprendre[] }).rendezVous;
}

const champ = (f: HTMLFormElement, nom: string) =>
  (f.elements.namedItem(nom) as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? '';

const heure = (iso: string) =>
  new Date(iso).toLocaleString(CONFIG.langue, {
    timeZone: CONFIG.fuseau,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Assistance(p: { jeton: string; signaler: (m?: string) => void }) {
  const [fiche, setFiche] = useState<Fiche>();
  const [rappele, setRappele] = useState(false);
  const [demande, setDemande] = useState<Demande>('proches');
  const [code, setCode] = useState<{ code: string; expireLe: string }>();
  const [envoi, setEnvoi] = useState(false);

  const rechercher = async (e: Event) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const type = champ(f, 'type');
    setEnvoi(true);
    setCode(undefined);
    try {
      const trouve = await appeler<Omit<Fiche, 'type'>>(p.jeton, '/assistance/recherche', {
        type,
        numero: champ(f, 'numero'),
      });
      setFiche({ ...trouve, type });
      setRappele(false);
      setDemande('proches');
      p.signaler(undefined);
    } catch (x) {
      setFiche(undefined);
      p.signaler((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (e: Event) => {
    e.preventDefault();
    if (!fiche) return;
    const f = e.currentTarget as HTMLFormElement;
    setEnvoi(true);
    try {
      const r = await appeler<{ retires: number; sms: string }>(
        p.jeton,
        '/assistance/retrait-proches',
        { patientId: fiche.patientId, naissance: champ(f, 'naissance'), rappel: true },
      );
      p.signaler(
        `${r.retires === 0 ? t('assist.aucunRetire') : t('assist.retires', { nombre: r.retires })} ` +
          t(r.sms === 'envoyee' ? 'assist.smsEnvoye' : 'assist.smsEchec'),
      );
      setFiche(undefined);
    } catch (x) {
      p.signaler((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  const donnerCode = async (e: Event) => {
    e.preventDefault();
    if (!fiche) return;
    const f = e.currentTarget as HTMLFormElement;
    setEnvoi(true);
    try {
      const r = await appeler<{ code: string; expireLe: string }>(
        p.jeton,
        '/assistance/recuperation',
        {
          patientId: fiche.patientId,
          naissance: champ(f, 'naissance'),
          type: fiche.type,
          numero: champ(f, 'numero_lu'),
          rappel: true,
        },
      );
      // Le dossier n'est plus affiché : seul le code reste, le temps de le dicter.
      setFiche(undefined);
      setCode(r);
      p.signaler(undefined);
    } catch (x) {
      p.signaler((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section>
      <h2>
        <span aria-hidden="true">🛟</span> {t('assist.titre')}
      </h2>
      <p>{t('assist.explication')}</p>
      <form onSubmit={(e) => void rechercher(e)}>
        <label>
          {t('assist.typeNumero')}
          <select name="type">
            <option value="assurance-maladie">
              {t('assist.assurance', { assurance: CONFIG.assurance })}
            </option>
            <option value="provisoire">{t('assist.provisoire')}</option>
          </select>
        </label>
        <label>
          {t('assist.numeroDonne')}
          <input name="numero" required maxLength={64} autoComplete="off" />
        </label>
        <button type="submit" disabled={envoi}>
          {t('assist.retrouver')}
        </button>
      </form>
      {code && (
        <div role="status" data-code-recuperation>
          <p>{t('assist.dictez')}</p>
          <p>
            <strong class="code">{code.code}</strong>
          </p>
          <p>{t('assist.validite', { date: heure(code.expireLe) })}</p>
          <button type="button" onClick={() => setCode(undefined)}>
            {t('assist.dicte')}
          </button>
        </div>
      )}
      {fiche && !fiche.telephone && <p role="status">{t('assist.sansNumero')}</p>}
      {fiche?.telephone && (
        <div data-assistance={fiche.patientId}>
          <p>
            {t('assist.proches')} <strong>{fiche.proches}</strong>
          </p>
          <p>
            {t('assist.rappeler')}{' '}
            <a href={`tel:${fiche.telephone.replace(/\s/g, '')}`}>{fiche.telephone}</a>
          </p>
          <label>
            <input
              type="checkbox"
              checked={rappele}
              onChange={(e) => setRappele((e.currentTarget as HTMLInputElement).checked)}
            />{' '}
            {t('assist.rappele')}
          </label>
          {rappele && (
            <fieldset>
              <legend>{t('assist.demande')}</legend>
              <label>
                <input
                  type="radio"
                  name="demande"
                  checked={demande === 'proches'}
                  onChange={() => setDemande('proches')}
                />{' '}
                {t('assist.retirerProches')}
              </label>
              <label>
                <input
                  type="radio"
                  name="demande"
                  checked={demande === 'compte'}
                  onChange={() => setDemande('compte')}
                />{' '}
                {t('assist.retrouverCompte')}
              </label>
            </fieldset>
          )}
          {rappele && demande === 'proches' && (
            <form onSubmit={(e) => void retirer(e)}>
              <label>
                {t('assist.naissance')}
                <input name="naissance" type="date" required />
              </label>
              <button class="principal" type="submit" disabled={envoi}>
                {t('assist.retirerProches')}
              </button>
            </form>
          )}
          {rappele && demande === 'compte' && (
            <form onSubmit={(e) => void donnerCode(e)}>
              <label>
                {t('assist.naissance')}
                <input name="naissance" type="date" required />
              </label>
              <label>
                {t('assist.numeroLu')}
                <input name="numero_lu" required maxLength={64} autoComplete="off" />
              </label>
              <button class="principal" type="submit" disabled={envoi}>
                {t('assist.donnerCode')}
              </button>
            </form>
          )}
        </div>
      )}
      <RendezVousAReprendre jeton={p.jeton} signaler={p.signaler} />
    </section>
  );
}

function RendezVousAReprendre(p: { jeton: string; signaler: (m?: string) => void }) {
  const [liste, setListe] = useState<AReprendre[]>();
  const [rappel, setRappel] = useState<{ rendezVousId: string; telephone?: string }>();
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    lireAReprendre(p.jeton)
      .then(setListe)
      .catch((e: unknown) => p.signaler((e as Error).message));
  }, []);

  const rappeler = async (rendezVousId: string) => {
    setEnvoi(true);
    try {
      const r = await appeler<{ telephone?: string }>(p.jeton, '/assistance/rappel-rendez-vous', {
        rendezVousId,
      });
      setRappel({ rendezVousId, ...(r.telephone ? { telephone: r.telephone } : {}) });
    } catch (x) {
      p.signaler((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (liste === undefined) return null;
  return (
    <>
      <h3>{t('assist.reprendre.titre')}</h3>
      <p>{t('assist.reprendre.explication')}</p>
      {liste.length === 0 ? (
        <p>{t('assist.reprendre.aucun')}</p>
      ) : (
        <ul class="liste" aria-label={t('assist.reprendre.titre')}>
          {liste.map((r) => (
            <li key={r.rendezVousId} data-a-reprendre={r.rendezVousId}>
              {t('assist.reprendre.du', { date: heure(r.debut) })}
              {r.statut === 'a-payer' && ` ${t('assist.reprendre.aPayer')}`}
              {rappel?.rendezVousId !== r.rendezVousId ? (
                <button
                  type="button"
                  disabled={envoi}
                  onClick={() => void rappeler(r.rendezVousId)}
                >
                  {t('assist.reprendre.rappeler')}
                </button>
              ) : rappel.telephone ? (
                <p>
                  {t('assist.reprendre.numero')}{' '}
                  <a href={`tel:${rappel.telephone.replace(/\s/g, '')}`}>{rappel.telephone}</a>{' '}
                  <button type="button" onClick={() => setRappel(undefined)}>
                    {t('assist.reprendre.masquer')}
                  </button>
                </p>
              ) : (
                <p role="status">{t('assist.reprendre.sansNumero')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
