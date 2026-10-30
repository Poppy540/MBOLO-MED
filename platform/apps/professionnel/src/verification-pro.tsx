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
/** Historique : décisions et suspensions (ADR-0026, étape 5). */
const HISTORIQUE = { ...RESULTATS, suspendu: 'resultat.suspendu' } as const;
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
/** Motifs de suspension (ADR-0026, étape 5, liste provisoire du service documents). */
const MOTIFS_SUSPENSION = {
  'signalement-ordre': 'motif.signalement-ordre',
  'plainte-confirmee': 'motif.plainte-confirmee',
  'incident-qualite-confirme': 'motif.incident-qualite-confirme',
} as const;
/** Historique : motifs de refus et de suspension. */
const MOTIFS_HISTORIQUE = { ...MOTIFS, ...MOTIFS_SUSPENSION } as const;
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

interface Verifie {
  practitionerId: string;
  finValidite: string;
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
  decisions: { resultat: keyof typeof HISTORIQUE; motif?: string; decideLe: string }[];
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
/** Date de fin de validité (AAAA-MM-JJ), avec l'année, dans la langue du pays. */
const jour = (date: string) =>
  new Intl.DateTimeFormat(CONFIG.langue, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
/** Échéance dans moins de 30 jours : rappel déjà envoyé par la plateforme (ADR-0026, 5c). */
const echeanceProche = (date: string) =>
  new Date(`${date}T00:00:00Z`).getTime() - Date.now() < 30 * 86_400_000;
/** Validité retenue d'un an au plus : on revérifie au moins chaque année (2026-10-29). */
const dansUnAn = () => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

export function VerificationPro(p: {
  jeton: string;
  quand: (iso: string) => string;
  signaler: (message?: string) => void;
}) {
  const [liste, setListe] = useState<EnAttente[]>();
  const [verifies, setVerifies] = useState<Verifie[]>();
  const [choisi, setChoisi] = useState<string>();
  useTitreAuFocus(choisi ?? 'liste');
  const charger = () =>
    Promise.all([
      appeler(p.jeton, '/a-verifier').then(async (r) =>
        setListe(((await r.json()) as { candidats: EnAttente[] }).candidats),
      ),
      appeler(p.jeton, '/verifies').then(async (r) =>
        setVerifies(((await r.json()) as { professionnels: Verifie[] }).professionnels),
      ),
    ]).catch((e: unknown) => p.signaler((e as Error).message));
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
      <Verifies
        jeton={p.jeton}
        verifies={verifies}
        signaler={p.signaler}
        suspendu={(message) => {
          p.signaler(message);
          void charger();
        }}
      />
    </section>
  );
}

/**
 * Professionnels vérifiés, l'échéance la plus proche d'abord (ADR-0026, étape 5) : suspension
 * avec un motif de la liste, préparée puis confirmée (deux clics). Une nouvelle vérification
 * complète, depuis la liste ci-dessus, la lèvera.
 */
function Verifies(p: {
  jeton: string;
  verifies: Verifie[] | undefined;
  signaler: (message?: string) => void;
  suspendu: (message: string) => void;
}) {
  const [aSuspendre, setASuspendre] = useState<string>();
  const [motif, setMotif] = useState<string>();
  const [envoi, setEnvoi] = useState(false);
  const annuler = () => {
    setASuspendre(undefined);
    setMotif(undefined);
  };
  const confirmer = async (practitionerId: string) => {
    setEnvoi(true);
    try {
      await appeler(p.jeton, `/${encodeURIComponent(practitionerId)}/suspension`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motif }),
      });
      annuler();
      p.suspendu(t('vpro.suspendu'));
    } catch (e) {
      p.signaler((e as Error).message);
      setMotif(undefined);
    } finally {
      setEnvoi(false);
    }
  };
  if (p.verifies === undefined) return null;
  return (
    <>
      <h3>{t('vpro.verifies')}</h3>
      {p.verifies.length === 0 ? (
        <p>{t('vpro.aucunVerifie')}</p>
      ) : (
        <ul class="liste" aria-label={t('vpro.verifies')}>
          {p.verifies.map((v) => (
            <li key={v.practitionerId} data-verifie={v.practitionerId}>
              {t('vpro.verifieJusquau', { fiche: v.practitionerId, date: jour(v.finValidite) })}
              {echeanceProche(v.finValidite) && <strong> — {t('vpro.echeanceProche')}</strong>}
              {aSuspendre !== v.practitionerId ? (
                <button type="button" onClick={() => setASuspendre(v.practitionerId)}>
                  {t('vpro.suspendre')}
                </button>
              ) : motif ? (
                <div class="actions">
                  <button
                    class="principal"
                    type="button"
                    disabled={envoi}
                    onClick={() => void confirmer(v.practitionerId)}
                  >
                    {t('vpro.confirmerSuspension')}
                  </button>
                  <button type="button" onClick={annuler}>
                    {t('vpro.annuler')}
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setMotif(String(new FormData(e.currentTarget).get('motif-suspension') ?? ''));
                  }}
                >
                  <label for={`motif-${v.practitionerId}`}>{t('vpro.motifSuspension')}</label>
                  <select id={`motif-${v.practitionerId}`} name="motif-suspension" required>
                    {cles(MOTIFS_SUSPENSION).map((m) => (
                      <option key={m} value={m}>
                        {t(MOTIFS_SUSPENSION[m])}
                      </option>
                    ))}
                  </select>
                  <div class="actions">
                    <button type="submit">{t('vpro.suspendre')}</button>
                    <button type="button" onClick={annuler}>
                      {t('vpro.annuler')}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
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
                {p.quand(x.decideLe)} — {t(HISTORIQUE[x.resultat])}
                {x.motif && x.motif in MOTIFS_HISTORIQUE
                  ? ` (${t(MOTIFS_HISTORIQUE[x.motif as keyof typeof MOTIFS_HISTORIQUE])})`
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
            <input id="fin" name="fin" type="date" required min={aujourdhui()} max={dansUnAn()} />
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
