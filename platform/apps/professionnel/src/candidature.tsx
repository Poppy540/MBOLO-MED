// « Ma candidature » (ADR-0026), rôle d'attente professionnel-candidat : le candidat lit et accepte la
// charte C-VERIFICATION-PRO, déclare sa spécialité, son Ordre et ses langues (listes fermées du pays,
// jamais de texte libre), puis envoie la photo de chaque pièce. Il n'a accès à aucun patient : seule
// une personne habilitée (rôle verification-professionnels) décide, jamais un agent IA. Chargé à la
// demande ; les photos sont réduites sur l'appareil et n'y restent pas.
import {
  appelReseau,
  creerTraducteur,
  DELAI_ENVOI_FICHIER_MS,
  DELAI_REQUETE_MS,
  useTitreAuFocus,
} from '@mbolo/client-web';
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';
import { frCandidature } from './textes-fr-candidature.js';

const t = creerTraducteur(frCandidature, CONFIG.langue);

/** Pièces du dossier, dans l'ordre affiché (liste fermée du service documents). */
const PIECES = {
  diplome: 'pieces.diplome',
  'inscription-ordre': 'pieces.inscription-ordre',
  'piece-identite': 'pieces.piece-identite',
  'assurance-rcp': 'pieces.assurance-rcp',
} as const;
type TypePiece = keyof typeof PIECES;
const TYPES_PIECE = Object.keys(PIECES) as TypePiece[];

const STATUTS = {
  'a-verifier': 'cand.statut.a-verifier',
  verifie: 'cand.statut.verifie',
  refuse: 'cand.statut.refuse',
  suspendu: 'cand.statut.suspendu',
  inconnu: 'cand.statut.inconnu',
} as const;

interface Declaration {
  specialite: string;
  paysOrdre: string;
  numeroOrdre: string;
  langues: string[];
}

interface Etat {
  statut: keyof typeof STATUTS;
  charte: { version: string; acceptee: boolean };
  declaration?: Declaration;
  choix: { specialites: { code: string; libelle: string }[]; langues: string[] };
  pieces: { type: TypePiece; deposeLe: string }[];
}

class ErreurCandidature extends Error {}

/** Côté long maximal et poids : quelques centaines de Ko, lisibles par la personne qui vérifie. */
const COTE_MAX = 1600;
const TAILLE_MAX = 2 * 1024 * 1024;

async function appeler(jeton: string, chemin: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    // Une photo met longtemps à partir sur un réseau lent : délai plus long.
    const delai = init.body instanceof Blob ? DELAI_ENVOI_FICHIER_MS : DELAI_REQUETE_MS;
    r = await appelReseau(
      `${CONFIG.apiDocuments}/candidature${chemin}`,
      { ...init, headers: { authorization: `Bearer ${jeton}`, ...init.headers } },
      delai,
    );
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurCandidature((e as Error).message);
  }
  if (!r.ok) {
    const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurCandidature(corps.erreur ?? t('cand.indisponible'));
  }
  return r;
}

/** Réduit et recompresse la photo en JPEG, sans métadonnées (ni lieu ni appareil). */
async function compresser(fichier: File): Promise<Blob> {
  const image = await createImageBitmap(fichier).catch(() => {
    throw new ErreurCandidature(t('pieces.imageIllisible'));
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
  throw new ErreurCandidature(t('pieces.tropLourde'));
}

/** Nom de la langue dans la langue de l'interface (« fang »), sinon son code. */
function nomLangue(code: string): string {
  try {
    return new Intl.DisplayNames([CONFIG.langue], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function Candidature(p: { jeton: string; signaler: (m?: string) => void }) {
  const [etat, setEtat] = useState<Etat>();
  const [refus, setRefus] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const charteVisible = etat?.statut === 'a-verifier' && !etat.charte.acceptee;
  useTitreAuFocus(refus ? 'refus' : charteVisible ? 'charte' : 'dossier');

  const charger = () =>
    appeler(p.jeton, '')
      .then((r) => r.json() as Promise<Etat>)
      .then(setEtat)
      .catch((e: unknown) => p.signaler((e as Error).message));
  useEffect(() => void charger(), []);

  const signaler = (e: unknown) =>
    p.signaler(e instanceof ErreurCandidature ? e.message : t('cand.indisponible'));

  const deciderCharte = async (accepte: boolean) => {
    if (!etat) return;
    p.signaler(undefined);
    try {
      await appeler(p.jeton, '/charte', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: etat.charte.version, accepte }),
      });
      setRefus(!accepte);
      await charger();
    } catch (e) {
      signaler(e);
    }
  };

  const declarer = async (formulaire: HTMLFormElement) => {
    const donnees = new FormData(formulaire);
    const declaration: Declaration = {
      specialite: String(donnees.get('specialite') ?? ''),
      paysOrdre: String(donnees.get('paysOrdre') ?? '')
        .trim()
        .toUpperCase(),
      numeroOrdre: String(donnees.get('numeroOrdre') ?? '').trim(),
      langues: donnees.getAll('langues').map(String),
    };
    if (
      !declaration.specialite ||
      !declaration.paysOrdre ||
      !declaration.numeroOrdre ||
      declaration.langues.length === 0
    ) {
      p.signaler(t('decl.incomplete'));
      return;
    }
    try {
      await appeler(p.jeton, '/declaration', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(declaration),
      });
      p.signaler(t('decl.enregistree'));
      await charger();
    } catch (e) {
      signaler(e);
    }
  };

  const envoyer = async (type: TypePiece) => {
    const champ = document.getElementById(`piece-${type}`) as HTMLInputElement | null;
    const fichier = champ?.files?.[0];
    if (!fichier) {
      p.signaler(t('pieces.choisir'));
      return;
    }
    setEnvoi(true);
    p.signaler(undefined);
    try {
      const photo = await compresser(fichier);
      await appeler(p.jeton, `/pieces/${type}`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg' },
        body: photo,
      });
      if (champ) champ.value = '';
      p.signaler(t('pieces.envoyee'));
      await charger();
    } catch (e) {
      signaler(e);
    } finally {
      setEnvoi(false);
    }
  };

  if (!etat) return <p aria-live="polite">{t('cand.chargement')}</p>;
  if (refus) {
    return (
      <section>
        <h2>{t('charte.titre')}</h2>
        <p>{t('charte.refusee')}</p>
        <button class="principal" onClick={() => setRefus(false)}>
          {t('charte.titre')}
        </button>
      </section>
    );
  }
  if (charteVisible) return <Charte version={etat.charte.version} decider={deciderCharte} />;

  const statut = <p>{t(STATUTS[etat.statut])}</p>;
  if (etat.statut !== 'a-verifier') {
    return (
      <section>
        <h2>{t('cand.titre')}</h2>
        {statut}
      </section>
    );
  }
  const d = etat.declaration;
  return (
    <section>
      <h2>{t('cand.titre')}</h2>
      {statut}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void declarer(e.currentTarget);
        }}
      >
        <h3>{t('decl.titre')}</h3>
        <p>{t('decl.explication')}</p>
        <label for="specialite">{t('decl.specialite')}</label>
        {/* Champs non contrôlés : un rendu ne doit pas écraser la saisie. */}
        <select id="specialite" name="specialite" defaultValue={d?.specialite ?? ''}>
          <option value="">{t('decl.choisir')}</option>
          {etat.choix.specialites.map((s) => (
            <option key={s.code} value={s.code}>
              {s.libelle}
            </option>
          ))}
        </select>
        <label for="pays-ordre">{t('decl.paysOrdre')}</label>
        <input
          id="pays-ordre"
          name="paysOrdre"
          maxLength={2}
          autoCapitalize="characters"
          autoComplete="off"
          defaultValue={d?.paysOrdre ?? ''}
        />
        <label for="numero-ordre">{t('decl.numeroOrdre')}</label>
        <input
          id="numero-ordre"
          name="numeroOrdre"
          maxLength={32}
          autoComplete="off"
          defaultValue={d?.numeroOrdre ?? ''}
        />
        <fieldset>
          <legend>{t('decl.langues')}</legend>
          {etat.choix.langues.map((code) => (
            <label key={code}>
              <input
                type="checkbox"
                name="langues"
                value={code}
                defaultChecked={d?.langues.includes(code) ?? false}
              />{' '}
              {nomLangue(code)}
            </label>
          ))}
        </fieldset>
        <button class="principal" type="submit">
          {t('decl.enregistrer')}
        </button>
      </form>
      <h3>{t('pieces.titre')}</h3>
      <p>{t('pieces.explication')}</p>
      {TYPES_PIECE.map((type) => {
        const n = etat.pieces.filter((x) => x.type === type).length;
        return (
          <fieldset key={type} data-piece={type}>
            <legend>{t(PIECES[type])}</legend>
            <p>{n === 0 ? t('pieces.aucune') : t('pieces.deposees', { nombre: n })}</p>
            <label for={`piece-${type}`}>{t('pieces.photo', { piece: t(PIECES[type]) })}</label>
            <input id={`piece-${type}`} type="file" accept="image/*" capture="environment" />
            <button disabled={envoi} onClick={() => void envoyer(type)}>
              {t('pieces.envoyer')}
            </button>
          </fieldset>
        );
      })}
    </section>
  );
}

/**
 * Texte présenté au professionnel : docs/securite/charte-verification-professionnels.md. BROUILLON,
 * à reprendre mot pour mot une fois validé par le porteur de projet et le juriste.
 */
function Charte(p: { version: string; decider: (accepte: boolean) => Promise<void> }) {
  return (
    <section>
      <h2>{t('charte.titre')}</h2>
      <p>
        <small>{t('charte.brouillon')}</small>
      </p>
      <h3>{t('charte.pourquoiTitre')}</h3>
      <p>{t('charte.pourquoi')}</p>
      <h3>{t('charte.demandeTitre')}</h3>
      <p>{t('charte.demande')}</p>
      <h3>{t('charte.commentTitre')}</h3>
      <p>{t('charte.comment')}</p>
      <h3>{t('charte.ouTitre')}</h3>
      <p>{t('charte.ou')}</p>
      <h3>{t('charte.droitsTitre')}</h3>
      <p>{t('charte.droits')}</p>
      <p>
        <small>{t('charte.version', { version: p.version })}</small>
      </p>
      <p>{t('charte.accord')}</p>
      <button class="principal" onClick={() => void p.decider(true)}>
        {t('charte.accepte')}
      </button>
      <button onClick={() => void p.decider(false)}>{t('charte.refuse')}</button>
    </section>
  );
}
