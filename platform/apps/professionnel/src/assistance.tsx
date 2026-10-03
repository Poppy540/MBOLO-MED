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
import { useState } from 'preact/hooks';
import { appelReseau } from '@mbolo/client-web';
import { CONFIG } from './config.js';

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
    throw new ErreurAssistance(e.erreur ?? 'Service indisponible. Réessayez plus tard.');
  }
  return (await r.json()) as T;
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
        `${r.retires === 0 ? 'Aucun proche à retirer' : `${r.retires} proche(s) retiré(s)`}. ` +
          (r.sms === 'envoyee'
            ? 'Le patient a reçu un SMS de confirmation.'
            : 'Le SMS de confirmation n’a pas pu partir : prévenez le patient.'),
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
        <span aria-hidden="true">🛟</span> Aider un patient qui appelle
      </h2>
      <p>
        Pour un patient qui ne peut pas agir lui-même dans son application : retirer ses proches, ou
        lui donner un code pour retrouver son compte. Chaque étape est enregistrée dans son dossier.
      </p>
      <form onSubmit={(e) => void rechercher(e)}>
        <label>
          Type de numéro
          <select name="type">
            <option value="assurance-maladie">Assurance maladie ({CONFIG.assurance})</option>
            <option value="provisoire">Numéro provisoire</option>
          </select>
        </label>
        <label>
          Numéro donné par le patient
          <input name="numero" required maxLength={64} autoComplete="off" />
        </label>
        <button type="submit" disabled={envoi}>
          Retrouver le dossier
        </button>
      </form>
      {code && (
        <div role="status" data-code-recuperation>
          <p>
            Dictez ce code au patient (ou à son aidant, patient présent). Il ne sera plus affiché.
          </p>
          <p>
            <strong class="code">{code.code}</strong>
          </p>
          <p>
            Valable une seule fois, jusqu’au {heure(code.expireLe)}. Le patient le saisit dans « Mot
            de passe oublié ? », puis choisit un nouveau mot de passe.
          </p>
          <button type="button" onClick={() => setCode(undefined)}>
            J’ai dicté le code
          </button>
        </div>
      )}
      {fiche && !fiche.telephone && (
        <p role="status">
          Aucun numéro dans ce dossier : impossible de rappeler le patient, donc pas d’intervention
          de l’équipe.
        </p>
      )}
      {fiche?.telephone && (
        <div data-assistance={fiche.patientId}>
          <p>
            Proches avec un accès ou une invitation en cours : <strong>{fiche.proches}</strong>
          </p>
          <p>
            1. Raccrochez, puis rappelez le patient au numéro de son dossier :{' '}
            <a href={`tel:${fiche.telephone.replace(/\s/g, '')}`}>{fiche.telephone}</a>
          </p>
          <label>
            <input
              type="checkbox"
              checked={rappele}
              onChange={(e) => setRappele((e.currentTarget as HTMLInputElement).checked)}
            />{' '}
            J’ai rappelé le patient à ce numéro et il confirme sa demande
          </label>
          {rappele && (
            <fieldset>
              <legend>Sa demande</legend>
              <label>
                <input
                  type="radio"
                  name="demande"
                  checked={demande === 'proches'}
                  onChange={() => setDemande('proches')}
                />{' '}
                Retirer tous ses proches
              </label>
              <label>
                <input
                  type="radio"
                  name="demande"
                  checked={demande === 'compte'}
                  onChange={() => setDemande('compte')}
                />{' '}
                Retrouver son compte (mot de passe oublié)
              </label>
            </fieldset>
          )}
          {rappele && demande === 'proches' && (
            <form onSubmit={(e) => void retirer(e)}>
              <label>
                2. Date de naissance dite par le patient
                <input name="naissance" type="date" required />
              </label>
              <button class="principal" type="submit" disabled={envoi}>
                Retirer tous ses proches
              </button>
            </form>
          )}
          {rappele && demande === 'compte' && (
            <form onSubmit={(e) => void donnerCode(e)}>
              <label>
                2. Date de naissance dite par le patient
                <input name="naissance" type="date" required />
              </label>
              <label>
                3. Numéro lu par le patient sur sa carte
                <input name="numero_lu" required maxLength={64} autoComplete="off" />
              </label>
              <button class="principal" type="submit" disabled={envoi}>
                Donner un code
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
