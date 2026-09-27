// « Vérifications à faire » (ADR-0015), rôle verification-identite (double authentification) :
// la personne habilitée compare les photos à l'identité déclarée, à l'œil (aucune reconnaissance
// automatique), puis décide. Chaque ouverture est tracée dans le dossier du patient, qui peut la
// voir. Les photos restent en mémoire le temps de l'écran, jamais sur le téléphone. Chargé à la demande.
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';

interface EnAttente {
  patientId: string;
  depuis: string;
}

interface Fiche {
  patientId: string;
  statut: string;
  nom?: string;
  prenoms: string[];
  naissance?: string;
  identifiants: { type: string; valeur: string }[];
  documents: { id: string; type: string; deposeLe: string }[];
}

const LIBELLES_TYPE: Record<string, string> = {
  'piece-identite': "Pièce d'identité",
  'acte-naissance': 'Acte de naissance',
  visage: 'Visage',
};

/** Motifs de refus : liste fermée, identique à celle du service (aucun texte libre). */
const MOTIFS: [string, string][] = [
  ['photo-illisible', 'Photo illisible'],
  ['document-non-conforme', 'Document non conforme'],
  ['visage-different', 'Le visage ne correspond pas'],
  ['document-expire', 'Document expiré'],
  ['autre-controle-en-personne', 'Autre : contrôle en personne'],
];

class ErreurVerif extends Error {}

async function appeler(jeton: string, chemin: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${CONFIG.apiDocuments}${chemin}`, {
      ...init,
      headers: { authorization: `Bearer ${jeton}`, ...init.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ErreurVerif('Pas de réseau. Réessayez plus tard.');
  }
  if (!r.ok) {
    const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurVerif(corps.erreur ?? 'Service indisponible. Réessayez plus tard.');
  }
  return r;
}

export function Verifications(p: {
  jeton: string;
  quand: (iso: string) => string;
  signaler: (message: string) => void;
}) {
  const [liste, setListe] = useState<EnAttente[]>();
  const [choisi, setChoisi] = useState<string>();
  const charger = () =>
    appeler(p.jeton, '/verifications')
      .then(async (r) =>
        setListe(((await r.json()) as { verifications: EnAttente[] }).verifications),
      )
      .catch((e: unknown) => p.signaler((e as Error).message));
  useEffect(() => void charger(), []);

  if (choisi) {
    return (
      <FicheVerification
        jeton={p.jeton}
        patientId={choisi}
        quand={p.quand}
        signaler={p.signaler}
        retour={(message) => {
          setChoisi(undefined);
          if (message) p.signaler(message);
          void charger();
        }}
      />
    );
  }
  return (
    <section>
      <h2>
        <span aria-hidden="true">🪪</span> Vérifications à faire
      </h2>
      {liste === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : liste.length === 0 ? (
        <p>Aucune vérification en attente.</p>
      ) : (
        <ul class="liste" aria-label="Vérifications en attente">
          {liste.map((v) => (
            <li key={v.patientId}>
              <button data-patient={v.patientId} onClick={() => setChoisi(v.patientId)}>
                Dossier {v.patientId} — photos du {p.quand(v.depuis)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FicheVerification(p: {
  jeton: string;
  patientId: string;
  quand: (iso: string) => string;
  signaler: (message: string) => void;
  retour: (message?: string) => void;
}) {
  const [fiche, setFiche] = useState<Fiche>();
  const [images, setImages] = useState<Record<string, string>>({});
  const [resultat, setResultat] = useState<'verifiee' | 'refusee' | 'a-refaire'>();
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    const adresses: string[] = [];
    const chemin = `/verifications/${encodeURIComponent(p.patientId)}`;
    appeler(p.jeton, chemin)
      .then(async (r) => {
        const f = (await r.json()) as Fiche;
        setFiche(f);
        for (const d of f.documents) {
          const photo = await appeler(p.jeton, `${chemin}/documents/${d.id}`);
          const adresse = URL.createObjectURL(await photo.blob());
          adresses.push(adresse);
          setImages((x) => ({ ...x, [d.id]: adresse }));
        }
      })
      .catch((e: unknown) => p.signaler((e as Error).message));
    // Les photos quittent la mémoire avec l'écran.
    return () => adresses.forEach((a) => URL.revokeObjectURL(a));
  }, [p.patientId]);

  const decider = async (e: Event) => {
    e.preventDefault();
    const champs = new FormData(e.currentTarget as HTMLFormElement);
    const demande =
      resultat === 'verifiee'
        ? {
            resultat,
            identifiant: {
              type: String(champs.get('type-numero')),
              valeur: String(champs.get('numero') ?? '').trim(),
            },
          }
        : resultat === 'refusee'
          ? { resultat, motif: String(champs.get('motif')) }
          : { resultat };
    setEnvoi(true);
    try {
      await appeler(p.jeton, `/verifications/${encodeURIComponent(p.patientId)}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(demande),
      });
      p.retour('Décision enregistrée.');
    } catch (x) {
      p.signaler((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (!fiche) {
    return (
      <section>
        <p aria-live="polite">Chargement…</p>
        <button onClick={() => p.retour()}>Retour</button>
      </section>
    );
  }
  return (
    <section>
      <h2>Identité déclarée</h2>
      <dl class="identite">
        <dt>Nom</dt>
        <dd>{fiche.nom ?? '—'}</dd>
        <dt>Prénom(s)</dt>
        <dd>{fiche.prenoms.join(' ') || '—'}</dd>
        <dt>Date de naissance</dt>
        <dd>{fiche.naissance ?? '—'}</dd>
        {fiche.identifiants.flatMap((i) => [
          <dt key={`t-${i.type}`}>
            {i.type === 'assurance-maladie' ? 'Assurance maladie' : 'Numéro provisoire'}
          </dt>,
          <dd key={`v-${i.type}`}>{i.valeur}</dd>,
        ])}
      </dl>
      <h3>Photos</h3>
      <p>
        <small>Chaque ouverture est enregistrée dans le dossier du patient.</small>
      </p>
      <div class="photos">
        {fiche.documents.map((d) => (
          <figure key={d.id}>
            {images[d.id] ? (
              <img
                src={images[d.id]}
                alt={`Photo : ${LIBELLES_TYPE[d.type] ?? d.type}`}
                style="max-width:100%"
              />
            ) : (
              <p aria-live="polite">Chargement…</p>
            )}
            <figcaption>
              {LIBELLES_TYPE[d.type] ?? d.type} — {p.quand(d.deposeLe)}
            </figcaption>
          </figure>
        ))}
      </div>
      <form onSubmit={(e) => void decider(e)}>
        <fieldset>
          <legend>Décision</legend>
          {(
            [
              ['verifiee', 'Identité vérifiée'],
              ['refusee', 'Refusée'],
              ['a-refaire', 'Photos à refaire'],
            ] as const
          ).map(([valeur, libelle]) => (
            <label key={valeur}>
              <input
                type="radio"
                name="resultat"
                value={valeur}
                required
                onChange={() => setResultat(valeur)}
              />{' '}
              {libelle}
            </label>
          ))}
        </fieldset>
        {resultat === 'verifiee' && (
          <fieldset>
            <legend>Numéro du patient</legend>
            <label>
              <input type="radio" name="type-numero" value="assurance-maladie" defaultChecked />{' '}
              Assurance maladie ({CONFIG.assurance})
            </label>
            <label>
              <input type="radio" name="type-numero" value="provisoire" /> Numéro provisoire
            </label>
            <label for="numero">Numéro</label>
            <input
              id="numero"
              name="numero"
              required
              pattern="[A-Za-z0-9\-]{3,40}"
              autocomplete="off"
            />
          </fieldset>
        )}
        {resultat === 'refusee' && (
          <label>
            Motif du refus
            <select name="motif" required>
              {MOTIFS.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
          </label>
        )}
        <button class="principal" type="submit" disabled={envoi || !resultat}>
          Enregistrer la décision
        </button>
      </form>
      <button onClick={() => p.retour()}>Retour</button>
    </section>
  );
}
