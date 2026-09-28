// « Mes partages et accès » (ADR-0009, principe n°3) : le patient partage son dossier avec le médecin
// d'un de ses rendez-vous (consentement C-PARTAGE-PRO), retire un partage à tout moment, et voit qui
// a demandé à lire son dossier. Chargé seulement à la demande (budget de l'ouverture).
// Le consentement est donné par le patient lui-même, jamais pré-coché ni groupé.
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';

/** Texte du partage avec un professionnel : BROUILLON, à valider par le juriste avant production. */
export const VERSION_PARTAGE_PRO = 'c-partage-pro-v0.1-brouillon';

interface Consentement {
  id: string;
  status: string;
  dateTime?: string;
  category?: { coding?: { code?: string }[] }[];
  provision?: { type?: string; actor?: { reference?: { reference?: string } }[] };
}

interface Acces {
  date: string;
  autorise: boolean;
  motif: string;
  roles: string[];
  urgence: boolean;
  justification?: string;
}

interface Partage {
  id: string;
  categorie: 'C-PARTAGE-PRO' | 'C-PROCHE';
  beneficiaire: string;
  depuis?: string;
}

class ErreurPartage extends Error {}

async function appeler<T>(jeton: string, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${jeton}`, ...init.headers },
    });
  } catch {
    throw new ErreurPartage('Pas de réseau. Réessayez plus tard.');
  }
  if (!r.ok) {
    const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurPartage(corps.erreur ?? 'Service indisponible. Réessayez plus tard.');
  }
  return (await r.json()) as T;
}

/** Partages en cours : consentements actifs, accordés, qui désignent quelqu'un. */
function partagesActifs(liste: Consentement[]): Partage[] {
  return liste.flatMap((c) => {
    const categorie = c.category?.[0]?.coding?.[0]?.code;
    const beneficiaire = c.provision?.actor?.[0]?.reference?.reference;
    if (c.status !== 'active' || c.provision?.type !== 'permit' || !beneficiaire) return [];
    if (categorie !== 'C-PARTAGE-PRO' && categorie !== 'C-PROCHE') return [];
    return [{ id: c.id, categorie, beneficiaire, ...(c.dateTime ? { depuis: c.dateTime } : {}) }];
  });
}

const date = (iso: string) =>
  new Intl.DateTimeFormat(CONFIG.langue, {
    timeZone: CONFIG.fuseau,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

/** Qui a demandé l'accès, en mots simples (le détail nominatif reste dans le dossier). */
function qui(a: Acces): string {
  if (a.roles.includes('patient')) return 'Vous-même';
  if (a.roles.includes('agent-ia')) return 'L’assistant Mbolo Santé (programme informatique)';
  if (a.roles.includes('proche')) return 'Votre proche';
  if (a.roles.includes('infirmier')) return 'Un infirmier';
  if (a.roles.includes('professionnel')) return 'Un professionnel de santé';
  return 'Une personne de l’équipe';
}

export function Partages(p: { jeton: string; patientId: string; retour: () => void }) {
  const [partages, setPartages] = useState<Partage[]>();
  const [medecins, setMedecins] = useState<{ id: string; nom: string }[]>([]);
  const [historique, setHistorique] = useState<Acces[]>([]);
  const [propose, setPropose] = useState<{ id: string; nom: string }>();
  const [message, setMessage] = useState<string>();
  const patient = encodeURIComponent(p.patientId);

  const charger = async () => {
    try {
      const [c, rdv, annuaire, acces] = await Promise.all([
        appeler<{ consentements: Consentement[] }>(
          p.jeton,
          `${CONFIG.apiIdentite}/patients/${patient}/consentements`,
        ),
        appeler<{ rendezVous: { praticienId: string; statut: string }[] }>(
          p.jeton,
          `${CONFIG.api}/rendez-vous`,
        ),
        appeler<{ praticiens: { id: string; nom: string }[] }>(p.jeton, `${CONFIG.api}/praticiens`),
        appeler<{ acces: Acces[] }>(p.jeton, `${CONFIG.apiIdentite}/patients/${patient}/acces`),
      ]);
      const noms = new Map(annuaire.praticiens.map((x) => [x.id, x.nom]));
      // Médecins de mes rendez-vous à venir : ceux avec qui partager a un sens.
      const ids = [
        ...new Set(rdv.rendezVous.filter((r) => r.statut !== 'annule').map((r) => r.praticienId)),
      ];
      setMedecins(ids.map((id) => ({ id, nom: noms.get(id) ?? 'Votre médecin' })));
      setPartages(partagesActifs(c.consentements));
      setHistorique([...acces.acces].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20));
    } catch (e) {
      setMessage(e instanceof ErreurPartage ? e.message : 'Service indisponible.');
    }
  };
  useEffect(() => void charger(), []);

  const nomDe = (reference: string) => {
    const id = reference.replace(/^Practitioner\//, '');
    return reference.startsWith('RelatedPerson/')
      ? 'Votre proche'
      : (medecins.find((m) => m.id === id)?.nom ?? 'Un professionnel de santé');
  };

  const partager = async (m: { id: string; nom: string }) => {
    setMessage(undefined);
    try {
      await appeler(p.jeton, `${CONFIG.apiIdentite}/patients/${patient}/consentements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categorie: 'C-PARTAGE-PRO',
          mode: 'texte',
          versionTexte: VERSION_PARTAGE_PRO,
          accepte: true,
          beneficiaire: `Practitioner/${m.id}`,
        }),
      });
      setPropose(undefined);
      setMessage(`Votre dossier est partagé avec ${m.nom}.`);
      await charger();
    } catch (e) {
      setMessage(e instanceof ErreurPartage ? e.message : 'Service indisponible.');
    }
  };

  const retirer = async (x: Partage) => {
    setMessage(undefined);
    try {
      await appeler(
        p.jeton,
        `${CONFIG.apiIdentite}/consentements/${encodeURIComponent(x.id)}/revocation`,
        {
          method: 'POST',
        },
      );
      setMessage('Partage retiré.');
      await charger();
    } catch (e) {
      setMessage(e instanceof ErreurPartage ? e.message : 'Service indisponible.');
    }
  };

  if (propose) {
    return (
      <section>
        <h2>
          <span aria-hidden="true">🔒</span> Partager mon dossier
        </h2>
        <p>
          J’accepte que <strong>{propose.nom}</strong> lise mon dossier médical Mbolo Santé, et y
          écrive le compte-rendu et l’ordonnance de mes consultations.
        </p>
        <p>
          Je peux retirer cet accord à tout moment, ici, dans « Mes partages et accès ». Chaque
          lecture de mon dossier est enregistrée et je peux la voir.
        </p>
        <p>
          <small>Texte de partage, version {VERSION_PARTAGE_PRO}.</small>
        </p>
        <button class="principal" onClick={() => void partager(propose)}>
          <span aria-hidden="true">✅</span> J’accepte
        </button>
        <button onClick={() => setPropose(undefined)}>Non, pas maintenant</button>
      </section>
    );
  }

  const aPartager = medecins.filter(
    (m) => !partages?.some((x) => x.beneficiaire === `Practitioner/${m.id}`),
  );
  return (
    <section>
      <h2>
        <span aria-hidden="true">🔒</span> Mes partages et accès
      </h2>
      {message && (
        <p class="message" role="status">
          {message}
        </p>
      )}
      {partages === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : (
        <>
          <h3>Qui peut lire mon dossier</h3>
          {partages.length === 0 ? (
            <p>Personne d’autre que vous.</p>
          ) : (
            <ul class="liste" aria-label="Partages en cours">
              {partages.map((x) => (
                <li key={x.id} data-partage={x.beneficiaire}>
                  <strong>{nomDe(x.beneficiaire)}</strong>
                  {x.depuis && <span> — depuis le {date(x.depuis)}</span>}
                  <div class="actions">
                    <button onClick={() => void retirer(x)}>Retirer ce partage</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {aPartager.map((m) => (
            <button key={m.id} data-partager={m.id} onClick={() => setPropose(m)}>
              <span aria-hidden="true">🤝</span> Partager mon dossier avec {m.nom}
            </button>
          ))}
          <h3>Qui a demandé à lire mon dossier</h3>
          {historique.length === 0 ? (
            <p>Personne pour le moment.</p>
          ) : (
            <ul class="liste" aria-label="Accès à mon dossier">
              {historique.map((a, i) => (
                <li key={i} data-acces={a.autorise ? 'accorde' : 'refuse'}>
                  <strong>{date(a.date)}</strong> — {qui(a)} :{' '}
                  {a.autorise ? 'accès accordé' : 'accès refusé'}
                  {a.urgence && (
                    <p>
                      <span aria-hidden="true">🚨</span> Accès en urgence
                      {a.justification ? ` : ${a.justification}` : ''}. Il sera vérifié par une
                      personne de l’équipe.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button onClick={p.retour}>Retour</button>
    </section>
  );
}
