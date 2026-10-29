// « Professionnels à vérifier » (ADR-0026, étape 4c), rôle verification-professionnels (double
// authentification, jamais un agent IA) : la personne habilitée ouvre le dossier d'un candidat,
// regarde ses pièces, contrôle chaque point à la source officielle, puis décide. Chaque ouverture est
// tracée dans le dossier avant d'être montrée ; le service refuse le dossier d'un candidat qu'elle a
// recruté. Listes fermées seulement, aucun texte libre. Les photos restent en mémoire le temps de
// l'écran, jamais sur le téléphone. Chargé à la demande.
import { appelReseau, creerTraducteur, useTitreAuFocus } from '@mbolo/client-web';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CONFIG } from './config.js';
import { frVerificationPro } from './textes-fr-verification-pro.js';

const t = creerTraducteur(frVerificationPro, CONFIG.langue);

/** Listes fermées du service documents, avec leur texte. */
const RESULTATS = {
  verifie: 'resultat.verifie',
  refuse: 'resultat.refuse',
  'a-completer': 'resultat.a-completer',
} as const;
type Resultat = keyof typeof RESULTATS;
const POINTS = {
  identite: 'point.identite',
  diplome: 'point.diplome',
  inscription: 'point.inscription',
  specialite: 'point.specialite',
} as const;
const SOURCES = {
  'registre-ordre': 'source.registre-ordre',
  'attestation-ordre': 'source.attestation-ordre',
  'document-original': 'source.document-original',
  'entretien-video': 'source.entretien-video',
} as const;
const MOTIFS = {
  'diplome-non-confirme': 'motif.diplome-non-confirme',
  'inscription-introuvable': 'motif.inscription-introuvable',
  'inscription-non-valable': 'motif.inscription-non-valable',
  'identite-non-confirmee': 'motif.identite-non-confirmee',
  'specialite-non-confirmee': 'motif.specialite-non-confirmee',
  'pieces-non-conformes': 'motif.pieces-non-conformes',
} as const;
const PIECES = {
  diplome: 'piece.diplome',
  'inscription-ordre': 'piece.inscription-ordre',
  'piece-identite': 'piece.piece-identite',
  'assurance-rcp': 'piece.assurance-rcp',
} as const;
const cles = <T extends object>(o: T) => Object.keys(o) as (keyof T)[];
const libellePiece = (type: string) =>
  type in PIECES ? t(PIECES[type as keyof typeof PIECES]) : type;

interface EnAttente {
  practitionerId: string;
  depuis: string;
}

interface Dossier {
  practitionerId: string;
  statut: string;
  nom?: string;
  prenoms: string[];
  declaration?: {
    specialiteLibelle: string;
    paysOrdre: string;
    numeroOrdre: string;
    langues: string[];
  };
  pieces: { id: string; type: string; deposeLe: string }[];
  decisions: { resultat: Resultat; motif?: string; decideLe: string }[];
}

class ErreurVerifPro extends Error {}

async function appeler(jeton: string, chemin: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    r = await appelReseau(`${CONFIG.apiDocuments}/professionnels${chemin}`, {
      ...init,
      headers: { authorization: `Bearer ${jeton}`, ...init.headers },
      cache: 'no-store',
    });
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurVerifPro((e as Error).message);
  }
  if (!r.ok) {
    const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurVerifPro(corps.erreur ?? t('vpro.indisponible'));
  }
  return r;
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function VerificationPro(p: {
  jeton: string;
  quand: (iso: string) => string;
  signaler: (message?: string) => void;
}) {
  const [liste, setListe] = useState<EnAttente[]>();
  const [choisi, setChoisi] = useState<string>();
  useTitreAuFocus(choisi ?? 'liste');
  const charger = () =>
    appeler(p.jeton, '/a-verifier')
      .then(async (r) => setListe(((await r.json()) as { candidats: EnAttente[] }).candidats))
      .catch((e: unknown) => p.signaler((e as Error).message));
  useEffect(() => void charger(), []);

  if (choisi) {
    return (
      <DossierCandidat
        jeton={p.jeton}
        practitionerId={choisi}
        quand={p.quand}
        signaler={p.signaler}
        retour={(message) => {
          setChoisi(undefined);
          p.signaler(message);
          void charger();
        }}
      />
    );
  }
  return (
    <section>
      <h2>{t('vpro.titre')}</h2>
      {liste === undefined ? (
        <p aria-live="polite">{t('vpro.chargement')}</p>
      ) : liste.length === 0 ? (
        <p>{t('vpro.aucun')}</p>
      ) : (
        <ul class="liste" aria-label={t('vpro.liste')}>
          {liste.map((c) => (
            <li key={c.practitionerId}>
              <button data-fiche={c.practitionerId} onClick={() => setChoisi(c.practitionerId)}>
                {t('vpro.dossierDe', { fiche: c.practitionerId, date: p.quand(c.depuis) })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DossierCandidat(p: {
  jeton: string;
  practitionerId: string;
  quand: (iso: string) => string;
  signaler: (message?: string) => void;
  retour: (message?: string) => void;
}) {
  const [dossier, setDossier] = useState<Dossier>();
  const [resultat, setResultat] = useState<Resultat>();
  // Deux temps : on prépare la décision, puis on la confirme (jamais de décision par erreur).
  const [demande, setDemande] = useState<object>();
  const [envoi, setEnvoi] = useState(false);
  const id = encodeURIComponent(p.practitionerId);

  useEffect(() => {
    appeler(p.jeton, `/${id}`)
      .then(async (r) => setDossier((await r.json()) as Dossier))
      .catch((e: unknown) => p.retour((e as Error).message));
  }, [p.practitionerId]);

  const preparer = (e: Event) => {
    e.preventDefault();
    if (!resultat) return;
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const champ = (nom: string) => String(f.get(nom) ?? '');
    setDemande({
      resultat,
      controles: cles(POINTS).map((point) => ({
        point,
        source: champ(`source-${point}`),
        consulteLe: champ(`date-${point}`),
        conforme: f.get(`conforme-${point}`) === 'oui',
      })),
      ...(resultat === 'verifie' ? { validite: { debut: champ('debut'), fin: champ('fin') } } : {}),
      ...(resultat === 'refuse' ? { motif: champ('motif') } : {}),
      ...(resultat === 'a-completer' ? { piecesARefaire: f.getAll('a-refaire').map(String) } : {}),
    });
  };

  const confirmer = async () => {
    setEnvoi(true);
    try {
      await appeler(p.jeton, `/${id}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(demande),
      });
      p.retour(
        resultat === 'verifie'
          ? `${t('vpro.enregistree')} ${t('vpro.verifieRappel')}`
          : t('vpro.enregistree'),
      );
    } catch (x) {
      p.signaler((x as Error).message);
      setDemande(undefined);
    } finally {
      setEnvoi(false);
    }
  };

  if (!dossier) {
    return (
      <section>
        <p aria-live="polite">{t('vpro.chargement')}</p>
        <button onClick={() => p.retour()}>{t('vpro.retour')}</button>
      </section>
    );
  }
  const d = dossier.declaration;
  return (
    <section>
      <h2>{t('vpro.candidat')}</h2>
      <dl class="identite">
        <dt>{t('vpro.nom')}</dt>
        <dd>{dossier.nom ?? '—'}</dd>
        <dt>{t('vpro.prenoms')}</dt>
        <dd>{dossier.prenoms.join(' ') || '—'}</dd>
      </dl>
      <h3>{t('vpro.declaration')}</h3>
      {d ? (
        <dl class="identite">
          <dt>{t('vpro.specialite')}</dt>
          <dd>{d.specialiteLibelle}</dd>
          <dt>{t('vpro.ordre')}</dt>
          <dd>{d.paysOrdre}</dd>
          <dt>{t('vpro.numero')}</dt>
          <dd>{d.numeroOrdre}</dd>
          <dt>{t('vpro.langues')}</dt>
          <dd>{d.langues.join(', ')}</dd>
        </dl>
      ) : (
        <p>{t('vpro.sansDeclaration')}</p>
      )}
      <h3>{t('vpro.pieces')}</h3>
      <Pieces
        jeton={p.jeton}
        id={id}
        pieces={dossier.pieces}
        quand={p.quand}
        signaler={p.signaler}
      />
      {dossier.decisions.length > 0 && (
        <>
          <h3>{t('vpro.decisionsPassees')}</h3>
          <ul>
            {dossier.decisions.map((x) => (
              <li key={x.decideLe}>
                {p.quand(x.decideLe)} — {t(RESULTATS[x.resultat])}
                {x.motif && x.motif in MOTIFS
                  ? ` (${t(MOTIFS[x.motif as keyof typeof MOTIFS])})`
                  : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      <form onSubmit={preparer}>
        <fieldset>
          <legend>{t('vpro.decision')}</legend>
          {cles(RESULTATS).map((r) => (
            <label key={r}>
              <input
                type="radio"
                name="resultat"
                value={r}
                required
                onChange={() => {
                  setResultat(r);
                  setDemande(undefined);
                }}
              />{' '}
              {t(RESULTATS[r])}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t('vpro.controles')}</legend>
          {cles(POINTS).map((point) => (
            <fieldset key={point} data-point={point}>
              <legend>{t(POINTS[point])}</legend>
              <label for={`source-${point}`}>{t('vpro.source')}</label>
              <select id={`source-${point}`} name={`source-${point}`}>
                {cles(SOURCES).map((s) => (
                  <option key={s} value={s}>
                    {t(SOURCES[s])}
                  </option>
                ))}
              </select>
              <label for={`date-${point}`}>{t('vpro.consulteLe')}</label>
              <input
                id={`date-${point}`}
                name={`date-${point}`}
                type="date"
                required
                max={aujourdhui()}
                defaultValue={aujourdhui()}
              />
              <label>
                <input type="checkbox" name={`conforme-${point}`} value="oui" />{' '}
                {t('vpro.conforme')}
              </label>
            </fieldset>
          ))}
        </fieldset>
        {resultat === 'verifie' && (
          <fieldset>
            <legend>{t('vpro.validite')}</legend>
            <label for="debut">{t('vpro.debut')}</label>
            <input id="debut" name="debut" type="date" required max={aujourdhui()} />
            <label for="fin">{t('vpro.fin')}</label>
            <input id="fin" name="fin" type="date" required min={aujourdhui()} />
          </fieldset>
        )}
        {resultat === 'refuse' && (
          <>
            <label for="motif">{t('vpro.motif')}</label>
            <select id="motif" name="motif" required>
              {cles(MOTIFS).map((m) => (
                <option key={m} value={m}>
                  {t(MOTIFS[m])}
                </option>
              ))}
            </select>
          </>
        )}
        {resultat === 'a-completer' && (
          <fieldset>
            <legend>{t('vpro.aRefaire')}</legend>
            {cles(PIECES).map((type) => (
              <label key={type}>
                <input type="checkbox" name="a-refaire" value={type} /> {t(PIECES[type])}
              </label>
            ))}
          </fieldset>
        )}
        {demande && resultat ? (
          <div class="actions">
            <button
              class="principal"
              type="button"
              disabled={envoi}
              onClick={() => void confirmer()}
            >
              {t('vpro.confirmer', { resultat: t(RESULTATS[resultat]) })}
            </button>
            <button type="button" onClick={() => setDemande(undefined)}>
              {t('vpro.annuler')}
            </button>
          </div>
        ) : (
          <button class="principal" type="submit" disabled={!resultat}>
            {t('vpro.enregistrer')}
          </button>
        )}
      </form>
      <button onClick={() => p.retour()}>{t('vpro.retour')}</button>
    </section>
  );
}

/** Pièces déchiffrées par le service, à la demande : chaque ouverture est tracée. */
function Pieces(p: {
  jeton: string;
  id: string;
  pieces: Dossier['pieces'];
  quand: (iso: string) => string;
  signaler: (message?: string) => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const adresses = useRef<string[]>([]);
  // Les photos quittent la mémoire avec l'écran.
  useEffect(() => () => adresses.current.forEach((a) => URL.revokeObjectURL(a)), []);
  const voir = async (pieceId: string) => {
    try {
      const r = await appeler(p.jeton, `/${p.id}/pieces/${pieceId}`);
      const adresse = URL.createObjectURL(await r.blob());
      adresses.current.push(adresse);
      setImages((x) => ({ ...x, [pieceId]: adresse }));
    } catch (e) {
      p.signaler((e as Error).message);
    }
  };
  return (
    <>
      <p>
        <small>{t('vpro.tracage')}</small>
      </p>
      <div class="photos">
        {p.pieces.map((x) => (
          <figure key={x.id} data-piece={x.type}>
            {images[x.id] ? (
              <img src={images[x.id]} alt={t('vpro.photo', { type: libellePiece(x.type) })} />
            ) : (
              <button type="button" onClick={() => void voir(x.id)}>
                {t('vpro.voir')}
              </button>
            )}
            <figcaption>
              {t('vpro.legende', { type: libellePiece(x.type), date: p.quand(x.deposeLe) })}
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
