// « Vérifier mon identité » (ADR-0014, ADR-0015) : le patient lit la charte, l'accepte (ou la
// refuse), puis envoie deux photos, son document et son visage. Chargé seulement à la demande
// (budget de l'ouverture). Les photos sont réduites et recompressées sur le téléphone avant l'envoi
// (faible débit) ; elles ne sont jamais gardées dans le navigateur.
// Mode « perte » (ADR-0023) : téléphone perdu, la charte est déjà acceptée ; le patient envoie deux
// nouvelles photos pour sa demande de changement de numéro.
import {
  appelReseau,
  creerTraducteur,
  DELAI_ENVOI_FICHIER_MS,
  DELAI_REQUETE_MS,
  useTitreAuFocus,
} from '@mbolo/client-web';
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';
import { frVerification } from './textes-fr-verification.js';

const t = creerTraducteur(frVerification, CONFIG.langue);

type TypeDocument = 'piece-identite' | 'acte-naissance' | 'visage';

interface Etat {
  patientId: string;
  statut: 'a-verifier' | 'verifiee' | 'refusee' | 'inconnu';
  charte: { version: string; acceptee: boolean };
  documents: { type: TypeDocument; deposeLe: string }[];
}

class ErreurEnvoi extends Error {}

/** Côté long maximal et qualité JPEG : quelques centaines de Ko, lisibles par le vérificateur. */
const COTE_MAX = 1600;
const TAILLE_MAX = 2 * 1024 * 1024;

async function appeler<T>(jeton: string, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    // Une photo (jusqu'à 2 Mo) met longtemps à partir sur un réseau lent : délai plus long.
    const delai = init.body instanceof Blob ? DELAI_ENVOI_FICHIER_MS : DELAI_REQUETE_MS;
    r = await appelReseau(
      url,
      { ...init, headers: { authorization: `Bearer ${jeton}`, ...init.headers } },
      delai,
    );
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurEnvoi((e as Error).message);
  }
  if (!r.ok) {
    // Messages du service, déjà en phrases simples ; sinon un message général.
    const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurEnvoi(corps.erreur ?? t('verification.indisponible'));
  }
  return (await r.json()) as T;
}

/** Réduit et recompresse la photo en JPEG, sans métadonnées (ni lieu ni appareil). */
async function compresser(fichier: File): Promise<Blob> {
  const image = await createImageBitmap(fichier).catch(() => {
    throw new ErreurEnvoi(t('verification.imageIllisible'));
  });
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext('2d')?.drawImage(image, 0, 0, toile.width, toile.height);
  image.close();
  for (const qualite of [0.7, 0.5, 0.3]) {
    const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', qualite));
    if (blob && blob.size <= TAILLE_MAX) return blob;
  }
  throw new ErreurEnvoi(t('verification.photoTropLourde'));
}

export function Verification(p: { jeton: string; retour: () => void; perte?: boolean }) {
  const [etat, setEtat] = useState<Etat>();
  const [message, setMessage] = useState<string>();
  const [refus, setRefus] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [typeDocument, setTypeDocument] = useState<'piece-identite' | 'acte-naissance'>(
    'piece-identite',
  );
  useTitreAuFocus(refus ? 'refus' : etat?.charte.acceptee ? 'photos' : 'charte');

  const charger = () =>
    (p.perte
      ? appeler<{ ouverte: boolean; photos: Etat['documents'] }>(
          p.jeton,
          `${CONFIG.apiDocuments}/perte`,
        ).then((d): Etat => {
          if (!d.ouverte) throw new ErreurEnvoi(t('verification.aucunePerte'));
          return {
            patientId: '',
            statut: 'verifiee',
            charte: { version: '', acceptee: true },
            documents: d.photos,
          };
        })
      : appeler<Etat>(p.jeton, `${CONFIG.apiDocuments}/verification`)
    )
      .then(setEtat)
      .catch((e: unknown) => setMessage((e as Error).message));
  useEffect(() => void charger(), []);

  const signaler = (e: unknown) =>
    setMessage(e instanceof ErreurEnvoi ? e.message : t('verification.indisponible'));

  const decider = async (accepte: boolean) => {
    if (!etat) return;
    setMessage(undefined);
    try {
      await appeler(
        p.jeton,
        `${CONFIG.apiIdentite}/patients/${encodeURIComponent(etat.patientId)}/consentements`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            categorie: 'C-IDENTITE',
            mode: 'texte',
            versionTexte: etat.charte.version,
            accepte,
          }),
        },
      );
      if (accepte) await charger();
      else setRefus(true);
    } catch (e) {
      signaler(e);
    }
  };

  const envoyer = async (type: TypeDocument, champ: string) => {
    const fichier = (document.getElementById(champ) as HTMLInputElement | null)?.files?.[0];
    if (!fichier) {
      setMessage(t('verification.choisirPhoto'));
      return;
    }
    setMessage(undefined);
    setEnvoi(true);
    try {
      await appeler(p.jeton, `${CONFIG.apiDocuments}/verification/documents/${type}`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg' },
        body: await compresser(fichier),
      });
      await charger();
    } catch (e) {
      signaler(e);
    } finally {
      setEnvoi(false);
    }
  };

  const alerte = message && (
    <p class="message" role="alert">
      {message}
    </p>
  );

  if (refus) {
    return (
      <section>
        <h2>{t('verification.charteRefusee')}</h2>
        <p>{t('verification.refusExplication')}</p>
        <button onClick={p.retour}>{t('verification.retour')}</button>
      </section>
    );
  }
  if (!etat) {
    return (
      <section>
        {alerte ?? <p aria-live="polite">{t('verification.chargement')}</p>}
        <button onClick={p.retour}>{t('verification.retour')}</button>
      </section>
    );
  }
  if (!etat.charte.acceptee) {
    return <Charte version={etat.charte.version} decider={decider} alerte={alerte} />;
  }

  const envoyees = new Set(etat.documents.map((d) => d.type));
  const documentEnvoye = envoyees.has('piece-identite') || envoyees.has('acte-naissance');
  return (
    <section>
      <h2>
        <span aria-hidden="true">📷</span>{' '}
        {t(p.perte ? 'verification.deuxNouvellesPhotos' : 'verification.deuxPhotos')}
      </h2>
      {p.perte && <p>{t('verification.perteExplication')}</p>}
      {alerte}
      <ul class="liste" aria-label={t('verification.photosEnvoyees')}>
        <li>
          {documentEnvoye ? '✅' : '⬜'}{' '}
          {t(documentEnvoye ? 'verification.documentEnvoye' : 'verification.document')}
        </li>
        <li>
          {envoyees.has('visage') ? '✅' : '⬜'}{' '}
          {t(envoyees.has('visage') ? 'verification.visageEnvoye' : 'verification.visage')}
        </li>
      </ul>
      {documentEnvoye && envoyees.has('visage') ? (
        <p>{t(p.perte ? 'verification.merciPerte' : 'verification.merci')}</p>
      ) : (
        <>
          <fieldset>
            <legend>{t('verification.etapeDocument')}</legend>
            <label>
              <input
                type="radio"
                name="type-document"
                checked={typeDocument === 'piece-identite'}
                onChange={() => setTypeDocument('piece-identite')}
              />{' '}
              {t('verification.pieceIdentite', { assurance: CONFIG.assurance })}
            </label>
            <label>
              <input
                type="radio"
                name="type-document"
                checked={typeDocument === 'acte-naissance'}
                onChange={() => setTypeDocument('acte-naissance')}
              />{' '}
              {t('verification.acteNaissance')}
            </label>
            <label for="photo-document">{t('verification.photoDocument')}</label>
            <input id="photo-document" type="file" accept="image/*" capture="environment" />
            <button
              class="principal"
              disabled={envoi}
              onClick={() => void envoyer(typeDocument, 'photo-document')}
            >
              {t('verification.envoyerDocument')}
            </button>
          </fieldset>
          <fieldset>
            <legend>{t('verification.etapeVisage')}</legend>
            <label for="photo-visage">{t('verification.photoVisage')}</label>
            <input id="photo-visage" type="file" accept="image/*" capture="user" />
            <button
              class="principal"
              disabled={envoi}
              onClick={() => void envoyer('visage', 'photo-visage')}
            >
              {t('verification.envoyerVisage')}
            </button>
          </fieldset>
        </>
      )}
      <button onClick={p.retour}>{t('verification.retour')}</button>
    </section>
  );
}

/**
 * Texte présenté au patient : docs/securite/charte-verification-identite.md (partie « Texte
 * présenté au patient »). BROUILLON : le flag identite.photos reste désactivé tant que le texte n'est
 * pas validé par le porteur de projet et le juriste ; il sera alors repris ici mot pour mot.
 */
function Charte(p: {
  version: string;
  decider: (accepte: boolean) => Promise<void>;
  alerte: preact.ComponentChildren;
}) {
  return (
    <section>
      <h2>
        <span aria-hidden="true">📜</span> {t('charte.titre')}
      </h2>
      {p.alerte}
      <h3>{t('charte.pourquoiTitre')}</h3>
      <p>{t('charte.pourquoi')}</p>
      <h3>{t('charte.demandeTitre')}</h3>
      <p>{t('charte.demande', { assurance: CONFIG.assurance })}</p>
      <h3>{t('charte.quiTitre')}</h3>
      <p>{t('charte.qui')}</p>
      <h3>{t('charte.ouTitre')}</h3>
      <p>{t('charte.ou')}</p>
      <h3>{t('charte.droitsTitre')}</h3>
      <p>{t('charte.droits')}</p>
      <p>
        <small>{t('charte.version', { version: p.version })}</small>
      </p>
      <p>{t('charte.accord')}</p>
      <button class="principal" onClick={() => void p.decider(true)}>
        <span aria-hidden="true">✅</span> {t('charte.accepte')}
      </button>
      <button onClick={() => void p.decider(false)}>{t('charte.refuse')}</button>
    </section>
  );
}
