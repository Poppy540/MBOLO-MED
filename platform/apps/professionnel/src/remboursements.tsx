// « Remboursements à valider » (ADR-0017), rôle validation-remboursement (double authentification) :
// la plateforme a préparé le remboursement d'un paiement reçu pour un rendez-vous annulé ; la
// personne habilitée valide ou refuse, selon les règles du porteur de projet. Aucun texte libre ;
// ni le patient ni le numéro ne sont affichés. Chargé à la demande.
import { useEffect, useState } from 'preact/hooks';
import { appelReseau } from '@mbolo/client-web';
import { CONFIG } from './config.js';

interface Remboursement {
  id: string;
  statut: string;
  montant: number;
  devise: string;
  prepareLe: string;
  operateur?: string;
}

class ErreurRemboursement extends Error {}

async function appeler<T>(
  jeton: string,
  methode: 'GET' | 'POST',
  chemin: string,
  corps?: unknown,
): Promise<T> {
  let r: Response;
  try {
    r = await appelReseau(`${CONFIG.apiPaiement}${chemin}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${jeton}`,
        ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    });
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurRemboursement((e as Error).message);
  }
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurRemboursement(e.erreur ?? 'Service indisponible. Réessayez plus tard.');
  }
  return (await r.json()) as T;
}

const montant = (valeur: number, devise: string) =>
  new Intl.NumberFormat(CONFIG.langue, {
    style: 'currency',
    currency: devise,
    maximumFractionDigits: 0,
  }).format(valeur);

export function Remboursements(p: {
  jeton: string;
  quand: (iso: string) => string;
  signaler: (m: string) => void;
}) {
  const [liste, setListe] = useState<Remboursement[]>();
  // Deux clics pour une décision : on choisit, puis on confirme (jamais de décision par erreur).
  const [choix, setChoix] = useState<{ id: string; decision: 'valide' | 'refuse' }>();

  const charger = () =>
    appeler<{ remboursements: Remboursement[] }>(p.jeton, 'GET', '/remboursements')
      .then((r) => setListe(r.remboursements))
      .catch((e: unknown) => p.signaler((e as Error).message));
  useEffect(() => void charger(), []);

  const decider = async () => {
    if (!choix) return;
    try {
      const r = await appeler<Remboursement>(
        p.jeton,
        'POST',
        `/remboursements/${choix.id}/decision`,
        { decision: choix.decision },
      );
      p.signaler(
        r.statut === 'effectue'
          ? 'Remboursement versé.'
          : r.statut === 'valide'
            ? 'Remboursement validé ; il sera versé dès que le prestataire répondra.'
            : 'Remboursement refusé.',
      );
    } catch (e) {
      p.signaler((e as Error).message);
    }
    setChoix(undefined);
    await charger();
  };

  return (
    <section>
      <h2>
        <span aria-hidden="true">↩️</span> Remboursements à valider
      </h2>
      <p>
        Paiements reçus pour des rendez-vous annulés. Décidez selon les règles de remboursement de
        Mbolo Santé ; l’argent revient au téléphone qui a payé.
      </p>
      {liste === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : liste.length === 0 ? (
        <p>Aucun remboursement à valider.</p>
      ) : (
        <ul class="liste" aria-label="Remboursements à valider">
          {liste.map((r) => (
            <li key={r.id} data-remboursement={r.id}>
              <strong>{montant(r.montant, r.devise)}</strong>
              {r.operateur && <span> — {r.operateur}</span>}
              <br />
              <small>Préparé le {p.quand(r.prepareLe)}</small>
              {choix?.id === r.id ? (
                <div class="actions">
                  <button class="principal" onClick={() => void decider()}>
                    {choix.decision === 'valide'
                      ? 'Confirmer le remboursement'
                      : 'Confirmer le refus'}
                  </button>
                  <button onClick={() => setChoix(undefined)}>Annuler</button>
                </div>
              ) : (
                <div class="actions">
                  <button onClick={() => setChoix({ id: r.id, decision: 'valide' })}>
                    Valider
                  </button>
                  <button onClick={() => setChoix({ id: r.id, decision: 'refuse' })}>
                    Refuser
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
