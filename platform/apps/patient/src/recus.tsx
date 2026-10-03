// Mes reçus et avoirs (ADR-0020, flag facturation.recus), en lecture seule. Chargé seulement à la
// demande (budget de l'ouverture). Rien n'est gardé sur le téléphone (souvent partagé) : sans réseau,
// l'écran le dit simplement. Chaque reçu s'affiche comme une fiche que le patient peut montrer ou
// imprimer ; tant que les mentions ne sont pas validées par le juriste et le comptable, il porte
// « sans valeur fiscale ». Aucune donnée de santé : libellé neutre, pas de professionnel.
import { useEffect, useState } from 'preact/hooks';
import { appelReseau, creerTraducteur, ErreurApi, STATUT_RESEAU } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { frRecus } from './textes-fr-recus.js';

const t = creerTraducteur(frRecus, CONFIG.langue);

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
    appelReseau(`${CONFIG.apiPaiement}/recus`, { headers: { authorization: `Bearer ${p.jeton}` } })
      .then(async (r) => {
        if (!r.ok) {
          const e = (await r.json().catch(() => ({}))) as { erreur?: string };
          throw new Error(e.erreur ?? t('recus.indisponible'));
        }
        setRecus(((await r.json()) as { recus: Recu[] }).recus);
      })
      .catch((e: unknown) =>
        setErreur(
          // Rien n'est gardé sur le téléphone : sans réseau, rien à montrer.
          e instanceof ErreurApi && e.statut === STATUT_RESEAU
            ? t('recus.sansConnexion', { erreur: e.message })
            : e instanceof Error
              ? e.message
              : t('recus.indisponible'),
        ),
      );
  }, []);

  return (
    <section>
      <h2>
        <span aria-hidden="true">🧾</span> {t('recus.titre')}
      </h2>
      {erreur ? (
        <p role="alert">{erreur}</p>
      ) : recus === undefined ? (
        <p aria-live="polite">{t('recus.chargement')}</p>
      ) : recus.length === 0 ? (
        <p>{t('recus.aucun')}</p>
      ) : (
        <ul class="liste" aria-label={t('recus.liste')}>
          {recus.map((r) => (
            <li key={r.numero} data-recu={r.numero} data-type={r.type}>
              <strong>
                {r.type === 'avoir' ? (
                  <>
                    <span aria-hidden="true">↩️</span> {t('recus.remboursement')}
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">✅</span> {t('recus.paiementRecu')}
                  </>
                )}{' '}
                — {montant(r.montant, r.devise)}
              </strong>
              <p>
                {r.libelle}
                <br />
                {t('recus.le', { date: date(r.emisLe) })}
                {r.operateur && <> · {operateur(r.operateur)}</>}
                <br />
                <small>
                  {t('recus.numero', { numero: r.numero })}
                  {r.recuAnnule && <> · {t('recus.annule', { numero: r.recuAnnule })}</>}
                </small>
              </p>
              <p>
                <small>
                  {r.emetteur.nom}
                  {r.emetteur.mentions && <> — {r.emetteur.mentions}</>}
                  {!r.valeurFiscale && <> — {t('recus.sansValeurFiscale')}</>}
                </small>
              </p>
            </li>
          ))}
        </ul>
      )}
      <button onClick={p.retour}>{t('recus.retour')}</button>
    </section>
  );
}
