// Mes reçus et avoirs (ADR-0020, flag facturation.recus), en lecture seule. Chargé seulement à la
// demande (budget de l'ouverture). Rien n'est gardé sur le téléphone (souvent partagé) : sans réseau,
// l'écran le dit simplement. Chaque reçu s'affiche comme une fiche que le patient peut montrer ou
// imprimer ; tant que les mentions ne sont pas validées par le juriste et le comptable, il porte
// « sans valeur fiscale ». Aucune donnée de santé : libellé neutre, pas de professionnel.
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';

interface Recu {
  numero: string;
  type: 'recu' | 'avoir';
  libelle: string;
  montant: number;
  devise: string;
  emisLe: string;
  operateur?: string;
  recuAnnule?: string;
  emetteur: { nom: string; mentions: string };
  valeurFiscale: boolean;
}

const date = (iso: string) =>
  new Intl.DateTimeFormat(CONFIG.langue, { timeZone: CONFIG.fuseau, dateStyle: 'long' }).format(
    new Date(iso),
  );

const montant = (valeur: number, devise: string) =>
  new Intl.NumberFormat(CONFIG.langue, {
    style: 'currency',
    currency: devise,
    maximumFractionDigits: 0,
  }).format(valeur);

/** « airtel » → « Airtel » : nom de l'opérateur, jamais le numéro qui a payé. */
const operateur = (o: string) => o.charAt(0).toUpperCase() + o.slice(1);

export function Recus(p: { jeton: string; retour: () => void }) {
  const [recus, setRecus] = useState<Recu[]>();
  const [erreur, setErreur] = useState<string>();

  useEffect(() => {
    fetch(`${CONFIG.apiPaiement}/recus`, { headers: { authorization: `Bearer ${p.jeton}` } })
      .then(async (r) => {
        if (!r.ok) {
          const e = (await r.json().catch(() => ({}))) as { erreur?: string };
          throw new Error(e.erreur ?? 'Service indisponible. Réessayez plus tard.');
        }
        setRecus(((await r.json()) as { recus: Recu[] }).recus);
      })
      .catch((e: unknown) =>
        setErreur(
          e instanceof TypeError
            ? 'Pas de réseau. Vos reçus s’affichent seulement avec une connexion.'
            : e instanceof Error
              ? e.message
              : 'Service indisponible. Réessayez plus tard.',
        ),
      );
  }, []);

  return (
    <section>
      <h2>
        <span aria-hidden="true">🧾</span> Mes reçus
      </h2>
      {erreur ? (
        <p role="alert">{erreur}</p>
      ) : recus === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : recus.length === 0 ? (
        <p>Aucun reçu pour le moment. Vous en recevez un à chaque paiement.</p>
      ) : (
        <ul class="liste" aria-label="Reçus">
          {recus.map((r) => (
            <li key={r.numero} data-recu={r.numero} data-type={r.type}>
              <strong>
                {r.type === 'avoir' ? (
                  <>
                    <span aria-hidden="true">↩️</span> Remboursement
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">✅</span> Paiement reçu
                  </>
                )}{' '}
                — {montant(r.montant, r.devise)}
              </strong>
              <p>
                {r.libelle}
                <br />
                Le {date(r.emisLe)}
                {r.operateur && <> · {operateur(r.operateur)}</>}
                <br />
                <small>
                  N° {r.numero}
                  {r.recuAnnule && <> · annule le reçu n° {r.recuAnnule}</>}
                </small>
              </p>
              <p>
                <small>
                  {r.emetteur.nom}
                  {r.emetteur.mentions && <> — {r.emetteur.mentions}</>}
                  {!r.valeurFiscale && <> — Reçu sans valeur fiscale.</>}
                </small>
              </p>
            </li>
          ))}
        </ul>
      )}
      <button onClick={p.retour}>Retour</button>
    </section>
  );
}
