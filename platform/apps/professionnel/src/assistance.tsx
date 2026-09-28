// « Retirer les proches d'un patient » (ADR-0019), rôle assistance-patient (double authentification,
// jamais un agent IA). Le patient appelle l'équipe parce qu'il ne peut pas retirer ses proches
// lui-même. Trois étapes, dans l'ordre :
// 1. retrouver son dossier par son numéro (assurance maladie ou provisoire) ;
// 2. raccrocher et le rappeler au numéro du dossier, jamais à un numéro donné pendant l'appel ;
// 3. lui faire dire sa date de naissance : le service la compare, l'équipe ne la voit pas.
// Ensuite TOUS ses proches sont retirés, et le patient reçoit un SMS. Rien d'autre du dossier n'est
// affiché. Chargé à la demande.
import { useState } from 'preact/hooks';
import { CONFIG } from './config.js';

interface Fiche {
  patientId: string;
  telephone?: string;
  proches: number;
}

class ErreurAssistance extends Error {}

async function appeler<T>(jeton: string, chemin: string, corps: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${CONFIG.apiInvitations}${chemin}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new ErreurAssistance('Pas de réseau. Réessayez plus tard.');
  }
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurAssistance(e.erreur ?? 'Service indisponible. Réessayez plus tard.');
  }
  return (await r.json()) as T;
}

const champ = (f: HTMLFormElement, nom: string) =>
  (f.elements.namedItem(nom) as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? '';

export function Assistance(p: { jeton: string; signaler: (m?: string) => void }) {
  const [fiche, setFiche] = useState<Fiche>();
  const [rappele, setRappele] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const rechercher = async (e: Event) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    setEnvoi(true);
    try {
      setFiche(
        await appeler<Fiche>(p.jeton, '/assistance/recherche', {
          type: champ(f, 'type'),
          numero: champ(f, 'numero'),
        }),
      );
      setRappele(false);
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

  return (
    <section>
      <h2>
        <span aria-hidden="true">🛟</span> Retirer les proches d’un patient
      </h2>
      <p>
        À utiliser seulement quand le patient le demande et ne peut pas le faire dans son
        application. Chaque étape est enregistrée dans son dossier.
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
      {fiche && !fiche.telephone && (
        <p role="status">
          Aucun numéro dans ce dossier : impossible de rappeler le patient, donc pas de retrait par
          l’équipe.
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
        </div>
      )}
    </section>
  );
}
