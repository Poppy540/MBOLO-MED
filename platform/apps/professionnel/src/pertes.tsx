// « Changements de numéro » (ADR-0023, téléphone perdu), rôle verification-identite (double
// authentification, jamais un agent IA) : le patient a confirmé un nouveau numéro par un code et
// envoyé de nouvelles photos. La personne habilitée les compare, à l'œil, à l'identité déclarée et
// aux photos de l'inscription encore conservées, puis accepte ou refuse (motif de la liste, jamais
// de texte libre). Le nouveau numéro n'est pas affiché : il reste chiffré jusqu'à la décision.
// Chaque consultation est tracée dans le dossier du patient. Chargé à la demande.
import { useTitreAuFocus } from '@mbolo/client-web';
import { useEffect, useState } from 'preact/hooks';
import { IdentiteDeclaree, MOTIFS, Photos, appeler, t, type Fiche } from './verifications.js';

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
        <span aria-hidden="true">📱</span> {t('pertes.titre')}
      </h2>
      <p>{t('pertes.explication')}</p>
      {liste === undefined ? (
        <p aria-live="polite">{t('verif.chargement')}</p>
      ) : liste.length === 0 ? (
        <p>{t('pertes.aucune')}</p>
      ) : (
        <ul class="liste" aria-label={t('pertes.liste')}>
          {liste.map((d) => (
            <li key={d.patientId}>
              <button data-patient={d.patientId} onClick={() => setChoisi(d.patientId)}>
                {t('pertes.dossier', { patient: d.patientId, date: p.quand(d.depuis) })}
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
      p.retour(t(resultat === 'acceptee' ? 'pertes.acceptee' : 'pertes.refusee'));
    } catch (x) {
      p.signaler((x as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (!fiche) {
    return (
      <section>
        <p aria-live="polite">{t('verif.chargement')}</p>
        <button onClick={() => p.retour()}>{t('verif.retour')}</button>
      </section>
    );
  }
  return (
    <section>
      <p>{t('pertes.demandeDu', { date: p.quand(fiche.depuis) })}</p>
      <IdentiteDeclaree fiche={fiche} />
      <h3>{t('pertes.nouvellesPhotos')}</h3>
      <Photos
        jeton={p.jeton}
        patientId={p.patientId}
        documents={fiche.nouvelles}
        quand={p.quand}
        signaler={p.signaler}
      />
      <h3>{t('pertes.photosInscription')}</h3>
      {fiche.anciennes.length === 0 ? (
        <p>{t('pertes.plusConservees')}</p>
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
          <legend>{t('verif.decision')}</legend>
          {(
            [
              ['acceptee', 'pertes.accepter'],
              ['refusee', 'pertes.refuser'],
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
              {t(libelle)}
            </label>
          ))}
        </fieldset>
        {resultat === 'acceptee' && (
          <p>
            <small>{t('pertes.attente')}</small>
          </p>
        )}
        {resultat === 'refusee' && (
          <label>
            {t('verif.motifRefus')}
            <select name="motif" required>
              {MOTIFS.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {t(libelle)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button class="principal" type="submit" disabled={envoi || !resultat}>
          {t('verif.enregistrer')}
        </button>
      </form>
      <button onClick={() => p.retour()}>{t('verif.retour')}</button>
    </section>
  );
}
