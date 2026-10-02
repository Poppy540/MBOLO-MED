// « Vérifier mon identité » (ADR-0014, ADR-0015) : le patient lit la charte, l'accepte (ou la
// refuse), puis envoie deux photos, son document et son visage. Chargé seulement à la demande
// (budget de l'ouverture). Les photos sont réduites et recompressées sur le téléphone avant l'envoi
// (faible débit) ; elles ne sont jamais gardées dans le navigateur.
// Mode « perte » (ADR-0023) : téléphone perdu, la charte est déjà acceptée ; le patient envoie deux
// nouvelles photos pour sa demande de changement de numéro.
import {
  appelReseau,
  DELAI_ENVOI_FICHIER_MS,
  DELAI_REQUETE_MS,
  useTitreAuFocus,
} from '@mbolo/client-web';
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';

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
    throw new ErreurEnvoi(corps.erreur ?? 'Service indisponible. Réessayez plus tard.');
  }
  return (await r.json()) as T;
}

/** Réduit et recompresse la photo en JPEG, sans métadonnées (ni lieu ni appareil). */
async function compresser(fichier: File): Promise<Blob> {
  const image = await createImageBitmap(fichier).catch(() => {
    throw new ErreurEnvoi('Cette image ne peut pas être lue. Prenez une nouvelle photo.');
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
  throw new ErreurEnvoi('Photo trop lourde. Prenez une nouvelle photo.');
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
          if (!d.ouverte) throw new ErreurEnvoi('Aucune demande de changement de numéro en cours.');
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
    setMessage(e instanceof ErreurEnvoi ? e.message : 'Service indisponible. Réessayez plus tard.');

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
      setMessage('Choisissez ou prenez d’abord une photo.');
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
        <h2>Charte refusée</h2>
        <p>
          Vous avez refusé la charte. Vous gardez votre compte, mais vous ne pourrez pas consulter.
          Un professionnel de santé peut vous proposer une vérification en personne.
        </p>
        <button onClick={p.retour}>Retour</button>
      </section>
    );
  }
  if (!etat) {
    return (
      <section>
        {alerte ?? <p aria-live="polite">Chargement…</p>}
        <button onClick={p.retour}>Retour</button>
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
        {p.perte ? 'Vos deux nouvelles photos' : 'Vos deux photos'}
      </h2>
      {p.perte && (
        <p>
          Pour changer votre numéro sans votre ancien téléphone, une personne de l'équipe Mbolo
          Santé doit vérifier que c'est bien vous.
        </p>
      )}
      {alerte}
      <ul class="liste" aria-label="Photos envoyées">
        <li>
          {documentEnvoye ? '✅' : '⬜'} Votre document {documentEnvoye ? 'est envoyé' : ''}
        </li>
        <li>
          {envoyees.has('visage') ? '✅' : '⬜'} Votre visage{' '}
          {envoyees.has('visage') ? 'est envoyé' : ''}
        </li>
      </ul>
      {documentEnvoye && envoyees.has('visage') ? (
        <p>
          {p.perte
            ? 'Merci. Une personne de l’équipe Mbolo Santé va vérifier vos photos avant de changer votre numéro. Votre ancien numéro recevra un message.'
            : "Merci. Une personne de l'équipe Mbolo Santé va vérifier vos photos, puis vous pourrez consulter."}
        </p>
      ) : (
        <>
          <fieldset>
            <legend>1. Votre document</legend>
            <label>
              <input
                type="radio"
                name="type-document"
                checked={typeDocument === 'piece-identite'}
                onChange={() => setTypeDocument('piece-identite')}
              />{' '}
              Pièce d'identité (avec votre numéro {CONFIG.assurance})
            </label>
            <label>
              <input
                type="radio"
                name="type-document"
                checked={typeDocument === 'acte-naissance'}
                onChange={() => setTypeDocument('acte-naissance')}
              />{' '}
              Acte de naissance
            </label>
            <label for="photo-document">Photo de votre document</label>
            <input id="photo-document" type="file" accept="image/*" capture="environment" />
            <button
              class="principal"
              disabled={envoi}
              onClick={() => void envoyer(typeDocument, 'photo-document')}
            >
              Envoyer la photo du document
            </button>
          </fieldset>
          <fieldset>
            <legend>2. Votre visage</legend>
            <label for="photo-visage">Photo de votre visage</label>
            <input id="photo-visage" type="file" accept="image/*" capture="user" />
            <button
              class="principal"
              disabled={envoi}
              onClick={() => void envoyer('visage', 'photo-visage')}
            >
              Envoyer la photo du visage
            </button>
          </fieldset>
        </>
      )}
      <button onClick={p.retour}>Retour</button>
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
        <span aria-hidden="true">📜</span> Charte de vérification d'identité
      </h2>
      {p.alerte}
      <h3>Pourquoi nous vérifions votre identité</h3>
      <p>
        Un médecin doit savoir qui il soigne. Cela protège votre dossier médical : personne d'autre
        ne peut consulter à votre place.
      </p>
      <h3>Ce que nous vous demandons</h3>
      <p>
        Deux photos : votre document (pièce d'identité avec votre numéro {CONFIG.assurance}, ou acte
        de naissance), et votre visage.
      </p>
      <h3>Qui regarde vos photos</h3>
      <p>
        Seulement une personne de l'équipe Mbolo Santé, habilitée pour cela. Chaque consultation des
        photos est enregistrée. Aucun programme ni intelligence artificielle ne décide à sa place.
        Votre médecin ne voit pas vos photos.
      </p>
      <h3>Où et combien de temps</h3>
      <p>
        Vos photos sont gardées chiffrées, comme preuve de la vérification, puis supprimées. Nous
        gardons seulement le résultat.
      </p>
      <h3>Vos droits</h3>
      <p>
        Vous pouvez voir, faire corriger ou supprimer vos informations, et retirer votre accord.
        Sans identité vérifiée, vous ne pourrez pas consulter.
      </p>
      <p>
        <small>Charte de vérification d'identité, version {p.version}.</small>
      </p>
      <p>
        J'ai lu (ou on m'a lu) cette charte. J'accepte que Mbolo Santé garde une photo de mon
        document et de mon visage pour vérifier mon identité.
      </p>
      <button class="principal" onClick={() => void p.decider(true)}>
        <span aria-hidden="true">✅</span> J'accepte
      </button>
      <button onClick={() => void p.decider(false)}>Je refuse</button>
    </section>
  );
}
