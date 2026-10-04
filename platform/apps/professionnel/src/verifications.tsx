// « Vérifications à faire » (ADR-0015), rôle verification-identite (double authentification) :
// la personne habilitée compare les photos à l'identité déclarée, à l'œil (aucune reconnaissance
// automatique), puis décide. Chaque ouverture est tracée dans le dossier du patient, qui peut la
// voir. Les photos restent en mémoire le temps de l'écran, jamais sur le téléphone. Chargé à la demande.
import { appelReseau, creerTraducteur, useTitreAuFocus } from '@mbolo/client-web';
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';
import { frVerification, type CleVerification } from './textes-fr-verification.js';

/** Textes des écrans de vérification et de changement de numéro (catalogue chargé avec eux). */
export const t = creerTraducteur(frVerification, CONFIG.langue);

interface EnAttente {
  patientId: string;
  depuis: string;
}

export interface Fiche {
  patientId: string;
  statut: string;
  nom?: string;
  prenoms: string[];
  naissance?: string;
  identifiants: { type: string; valeur: string }[];
  documents: { id: string; type: string; deposeLe: string }[];
}

const LIBELLES_TYPE: readonly (readonly [string, CleVerification])[] = [
  ['piece-identite', 'type.pieceIdentite'],
  ['acte-naissance', 'type.acteNaissance'],
  ['visage', 'type.visage'],
];

/** Nom d'un type de document ; un type inconnu garde son code. */
const libelleType = (type: string): string => {
  const cle = LIBELLES_TYPE.find(([code]) => code === type)?.[1];
  return cle ? t(cle) : type;
};

/** Motifs de refus : liste fermée, identique à celle du service (aucun texte libre). */
export const MOTIFS: readonly (readonly [string, CleVerification])[] = [
  ['photo-illisible', 'motif.photoIllisible'],
  ['document-non-conforme', 'motif.documentNonConforme'],
  ['visage-different', 'motif.visageDifferent'],
  ['document-expire', 'motif.documentExpire'],
  ['autre-controle-en-personne', 'motif.controleEnPersonne'],
];

class ErreurVerif extends Error {}

export async function appeler(
  jeton: string,
  chemin: string,
  init: RequestInit = {},
): Promise<Response> {
  let r: Response;
  try {
    r = await appelReseau(`${CONFIG.apiDocuments}${chemin}`, {
      ...init,
      headers: { authorization: `Bearer ${jeton}`, ...init.headers },
      cache: 'no-store',
    });
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurVerif((e as Error).message);
  }
  if (!r.ok) {
    const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurVerif(corps.erreur ?? t('verif.indisponible'));
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
  useTitreAuFocus(choisi ?? 'liste');
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
        <span aria-hidden="true">🪪</span> {t('verif.titre')}
      </h2>
      {liste === undefined ? (
        <p aria-live="polite">{t('verif.chargement')}</p>
      ) : liste.length === 0 ? (
        <p>{t('verif.aucune')}</p>
      ) : (
        <ul class="liste" aria-label={t('verif.liste')}>
          {liste.map((v) => (
            <li key={v.patientId}>
              <button data-patient={v.patientId} onClick={() => setChoisi(v.patientId)}>
                {t('verif.dossier', { patient: v.patientId, date: p.quand(v.depuis) })}
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
  const [resultat, setResultat] = useState<'verifiee' | 'refusee' | 'a-refaire'>();
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    appeler(p.jeton, `/verifications/${encodeURIComponent(p.patientId)}`)
      .then(async (r) => setFiche((await r.json()) as Fiche))
      .catch((e: unknown) => p.signaler((e as Error).message));
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
      p.retour(t('verif.enregistree'));
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
      <IdentiteDeclaree fiche={fiche} />
      <h3>{t('verif.photos')}</h3>
      <Photos
        jeton={p.jeton}
        patientId={p.patientId}
        documents={fiche.documents}
        quand={p.quand}
        signaler={p.signaler}
      />
      <form onSubmit={(e) => void decider(e)}>
        <fieldset>
          <legend>{t('verif.decision')}</legend>
          {(
            [
              ['verifiee', 'verif.verifiee'],
              ['refusee', 'verif.refusee'],
              ['a-refaire', 'verif.aRefaire'],
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
        {resultat === 'verifiee' && (
          <fieldset>
            <legend>{t('verif.numeroPatient')}</legend>
            <label>
              <input type="radio" name="type-numero" value="assurance-maladie" defaultChecked />{' '}
              {t('verif.assurance', { assurance: CONFIG.assurance })}
            </label>
            <label>
              <input type="radio" name="type-numero" value="provisoire" /> {t('verif.provisoire')}
            </label>
            <label for="numero">{t('verif.numero')}</label>
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

export function IdentiteDeclaree(p: { fiche: Omit<Fiche, 'documents'> }) {
  const f = p.fiche;
  return (
    <>
      <h2>{t('verif.identiteDeclaree')}</h2>
      <dl class="identite">
        <dt>{t('verif.nom')}</dt>
        <dd>{f.nom ?? '—'}</dd>
        <dt>{t('verif.prenoms')}</dt>
        <dd>{f.prenoms.join(' ') || '—'}</dd>
        <dt>{t('verif.naissance')}</dt>
        <dd>{f.naissance ?? '—'}</dd>
        {f.identifiants.flatMap((i) => [
          <dt key={`t-${i.type}`}>
            {t(i.type === 'assurance-maladie' ? 'verif.assuranceMaladie' : 'verif.provisoire')}
          </dt>,
          <dd key={`v-${i.type}`}>{i.valeur}</dd>,
        ])}
      </dl>
    </>
  );
}

/** Photos déchiffrées par le service : chaque ouverture est tracée dans le dossier du patient. */
export function Photos(p: {
  jeton: string;
  patientId: string;
  documents: Fiche['documents'];
  quand: (iso: string) => string;
  signaler: (message: string) => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    const adresses: string[] = [];
    let fini = false;
    (async () => {
      for (const d of p.documents) {
        const chemin = `/verifications/${encodeURIComponent(p.patientId)}/documents/${d.id}`;
        const adresse = URL.createObjectURL(await (await appeler(p.jeton, chemin)).blob());
        adresses.push(adresse);
        if (fini) return URL.revokeObjectURL(adresse);
        setImages((x) => ({ ...x, [d.id]: adresse }));
      }
    })().catch((e: unknown) => p.signaler((e as Error).message));
    // Les photos quittent la mémoire avec l'écran.
    return () => {
      fini = true;
      adresses.forEach((a) => URL.revokeObjectURL(a));
    };
  }, [p.patientId]);
  return (
    <>
      <p>
        <small>{t('verif.tracage')}</small>
      </p>
      <div class="photos">
        {p.documents.map((d) => (
          <figure key={d.id}>
            {images[d.id] ? (
              <img src={images[d.id]} alt={t('verif.photo', { type: libelleType(d.type) })} />
            ) : (
              <p aria-live="polite">{t('verif.chargement')}</p>
            )}
            <figcaption>
              {t('verif.legende', { type: libelleType(d.type), date: p.quand(d.deposeLe) })}
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
