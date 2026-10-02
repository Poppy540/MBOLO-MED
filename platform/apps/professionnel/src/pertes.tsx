// « Changements de numéro » (ADR-0023, téléphone perdu), rôle verification-identite (double
// authentification, jamais un agent IA) : le patient a confirmé un nouveau numéro par un code et
// envoyé de nouvelles photos. La personne habilitée les compare, à l'œil, à l'identité déclarée et
// aux photos de l'inscription encore conservées, puis accepte ou refuse (motif de la liste, jamais
// de texte libre). Le nouveau numéro n'est pas affiché : il reste chiffré jusqu'à la décision.
// Chaque consultation est tracée dans le dossier du patient. Chargé à la demande.
import { useTitreAuFocus } from '@mbolo/client-web';
import { useEffect, useState } from 'preact/hooks';
import { IdentiteDeclaree, MOTIFS, Photos, appeler, type Fiche } from './verifications.js';

interface Demande {
  patientId: string;
  depuis: string;
}

interface FichePerte extends Omit<Fiche, 'documents'> {
  depuis: string;
  nouvelles: Fiche['documents'];
  anciennes: Fiche['documents'];
}

export function Pertes(p: {
  jeton: string;
  quand: (iso: string) => string;
  signaler: (message: string) => void;
}) {
  const [liste, setListe] = useState<Demande[]>();
  const [choisi, setChoisi] = useState<string>();
  useTitreAuFocus(choisi ?? 'liste');
  const charger = () =>
    appeler(p.jeton, '/demandes-perte')
      .then(async (r) => setListe(((await r.json()) as { demandes: Demande[] }).demandes))
      .catch((e: unknown) => p.signaler((e as Error).message));
  useEffect(() => void charger(), []);

  if (choisi) {
    return (
      <FicheDemande
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
        <span aria-hidden="true">📱</span> Changements de numéro
      </h2>
      <p>Patients qui ont perdu leur téléphone et envoyé de nouvelles photos.</p>
      {liste === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : liste.length === 0 ? (
        <p>Aucune demande en attente.</p>
      ) : (
        <ul class="liste" aria-label="Demandes de changement de numéro">
          {liste.map((d) => (
            <li key={d.patientId}>
              <button data-patient={d.patientId} onClick={() => setChoisi(d.patientId)}>
                Dossier {d.patientId} — demande du {p.quand(d.depuis)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FicheDemande(p: {
  jeton: string;
  patientId: string;
  quand: (iso: string) => string;
  signaler: (message: string) => void;
  retour: (message?: string) => void;
}) {
  const [fiche, setFiche] = useState<FichePerte>();
  const [resultat, setResultat] = useState<'acceptee' | 'refusee'>();
  const [envoi, setEnvoi] = useState(false);
  const chemin = `/demandes-perte/${encodeURIComponent(p.patientId)}`;

  useEffect(() => {
    appeler(p.jeton, chemin)
      .then(async (r) => setFiche((await r.json()) as FichePerte))
      .catch((e: unknown) => p.signaler((e as Error).message));
  }, [p.patientId]);

  const decider = async (e: Event) => {
    e.preventDefault();
    const champs = new FormData(e.currentTarget as HTMLFormElement);
    const demande =
      resultat === 'refusee' ? { resultat, motif: String(champs.get('motif')) } : { resultat };
    setEnvoi(true);
    try {
      await appeler(p.jeton, `${chemin}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(demande),
      });
      p.retour(
        resultat === 'acceptee'
          ? 'Nouveau numéro enregistré. L’ancien numéro a été prévenu.'
          : 'Demande refusée. Le numéro ne change pas.',
      );
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
      <p>Demande du {p.quand(fiche.depuis)}.</p>
      <IdentiteDeclaree fiche={fiche} />
      <h3>Nouvelles photos</h3>
      <Photos
        jeton={p.jeton}
        patientId={p.patientId}
        documents={fiche.nouvelles}
        quand={p.quand}
        signaler={p.signaler}
      />
      <h3>Photos de l’inscription</h3>
      {fiche.anciennes.length === 0 ? (
        <p>Plus conservées : comparez avec l’identité déclarée.</p>
      ) : (
        <Photos
          jeton={p.jeton}
          patientId={p.patientId}
          documents={fiche.anciennes}
          quand={p.quand}
          signaler={p.signaler}
        />
      )}
      <form onSubmit={(e) => void decider(e)}>
        <fieldset>
          <legend>Décision</legend>
          {(
            [
              ['acceptee', 'Accepter le nouveau numéro'],
              ['refusee', 'Refuser'],
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
        {resultat === 'acceptee' && (
          <p>
            <small>
              L’ancien numéro sera prévenu par SMS, puis le patient attendra 24 heures avant de
              recevoir un code de connexion.
            </small>
          </p>
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
