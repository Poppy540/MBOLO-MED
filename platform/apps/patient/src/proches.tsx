// « Mes proches » (ADR-0019), dans « Mes partages et accès » : le patient invite un proche (prénom,
// lien, numéro au format international), après avoir lu le texte de partage C-PROCHE ; le code part
// par SMS et s'affiche aussi, en secours. Le patient retire un proche à tout moment.
// Le numéro n'est jamais gardé, ni ici ni sur le serveur.
import { useState } from 'preact/hooks';
import { CONFIG } from './config.js';
import { numeroInternational } from './telephone.js';

/** Texte du partage avec un proche : BROUILLON, à valider par le juriste avant production. */
export const VERSION_PARTAGE_PROCHE = 'c-proche-v0.1-brouillon';

/** Proches au plus (ADR-0019) ; le serveur fait foi. */
const PROCHES_MAX = 3;

export interface Proche {
  id: string;
  relatedPersonId?: string;
  prenom: string;
  lien?: string;
  statut: 'valide' | 'utilise' | 'revoque' | 'expire';
  expireLe: string;
}

/** Liens proposés (codes v3-RoleCode du dossier). */
export const LIENS: [string, string][] = [
  ['CHILD', 'Mon enfant'],
  ['SPS', 'Mon conjoint ou ma conjointe'],
  ['SIB', 'Mon frère ou ma sœur'],
  ['PRN', 'Mon parent'],
  ['FAMMEMB', 'Un autre membre de ma famille'],
  ['FRND', 'Un ami ou une amie'],
];

const jour = (iso: string) =>
  new Intl.DateTimeFormat(CONFIG.langue, { timeZone: CONFIG.fuseau, dateStyle: 'long' }).format(
    new Date(iso),
  );

interface Invite {
  code: string;
  expireLe: string;
  sms: 'envoyee' | 'echec';
  prenom: string;
}

export function MesProches(p: {
  jeton: string;
  /** `null` : fonction non ouverte pour ce patient (rien n'est affiché). */
  proches: Proche[] | null;
  recharger: () => Promise<void>;
}) {
  const [formulaire, setFormulaire] = useState(false);
  const [invite, setInvite] = useState<Invite>();
  const [erreur, setErreur] = useState<string>();
  const [prenom, setPrenom] = useState('');
  if (p.proches === null) return null;
  const actifs = p.proches.filter((x) => x.statut === 'valide' || x.statut === 'utilise');

  const envoyer = async (e: Event) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const donnees = new FormData(f);
    const telephone = numeroInternational(String(donnees.get('telephone') ?? ''));
    const nom = String(donnees.get('prenom') ?? '').trim();
    if (!nom) return setErreur('Indiquez le prénom de votre proche.');
    if (!telephone) {
      return setErreur(`Numéro au format international, par exemple +${CONFIG.indicatif} …`);
    }
    setErreur(undefined);
    try {
      const r = await fetch(`${CONFIG.apiInvitations}/proches`, {
        method: 'POST',
        headers: { authorization: `Bearer ${p.jeton}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          prenom: nom,
          lien: String(donnees.get('lien') ?? ''),
          telephone,
          versionTexte: VERSION_PARTAGE_PROCHE,
        }),
      });
      const corps = (await r.json().catch(() => ({}))) as Partial<Invite> & { erreur?: string };
      if (!r.ok) return setErreur(corps.erreur ?? 'Service indisponible. Réessayez plus tard.');
      // Le champ du numéro est vidé aussitôt : il n'est gardé nulle part.
      f.reset();
      setFormulaire(false);
      setInvite({
        code: corps.code ?? '',
        expireLe: corps.expireLe ?? '',
        sms: corps.sms ?? 'echec',
        prenom: nom,
      });
      await p.recharger();
    } catch {
      setErreur('Pas de réseau. Réessayez plus tard.');
    }
  };

  const retirer = async (x: Proche) => {
    setErreur(undefined);
    setInvite(undefined);
    try {
      const r = await fetch(
        `${CONFIG.apiInvitations}/proches/${encodeURIComponent(x.id)}/revocation`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${p.jeton}` },
        },
      );
      if (!r.ok) {
        const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
        return setErreur(corps.erreur ?? 'Service indisponible. Réessayez plus tard.');
      }
      await p.recharger();
    } catch {
      setErreur('Pas de réseau. Réessayez plus tard.');
    }
  };

  return (
    <>
      <h3>
        <span aria-hidden="true">👨‍👩‍👧</span> Mes proches
      </h3>
      <p>Un proche voit vos ordonnances et les consignes du médecin, jamais le reste du dossier.</p>
      {erreur && (
        <p class="message" role="alert">
          {erreur}
        </p>
      )}
      {invite && (
        <div class="message" data-code={invite.code}>
          <p>
            {invite.sms === 'envoyee'
              ? `Code envoyé par SMS à ${invite.prenom}.`
              : `Le SMS n’a pas pu partir.`}{' '}
            En secours, vous pouvez lui donner ce code vous-même :
          </p>
          <p>
            <strong>{invite.code}</strong> — valable jusqu’au {jour(invite.expireLe)}.
          </p>
        </div>
      )}
      {actifs.length > 0 && (
        <ul class="liste" aria-label="Mes proches">
          {actifs.map((x) => (
            <li key={x.id} data-proche={x.id} data-statut={x.statut}>
              <strong>{x.prenom}</strong>
              {x.lien && <span> — {LIENS.find(([c]) => c === x.lien)?.[1]}</span>}
              <p>
                {x.statut === 'utilise'
                  ? 'A créé son compte.'
                  : `Invitation envoyée, valable jusqu’au ${jour(x.expireLe)}.`}
              </p>
              <div class="actions">
                <button onClick={() => void retirer(x)}>Retirer ce proche</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {formulaire ? (
        <form onSubmit={(e) => void envoyer(e)} aria-label="Inviter un proche">
          <label for="prenom-proche">Prénom de votre proche</label>
          <input
            id="prenom-proche"
            name="prenom"
            maxLength={60}
            autocomplete="off"
            onInput={(e) => setPrenom((e.target as HTMLInputElement).value.trim())}
          />
          <label for="lien-proche">Qui est-ce ?</label>
          <select id="lien-proche" name="lien" defaultValue="CHILD">
            {LIENS.map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </select>
          <label for="telephone-proche">Son numéro de téléphone (avec l’indicatif du pays)</label>
          <input
            id="telephone-proche"
            name="telephone"
            type="tel"
            inputMode="tel"
            autocomplete="off"
            placeholder={`+${CONFIG.indicatif} …`}
          />
          <p>
            J’accepte que <strong>{prenom || 'mon proche'}</strong> voie mes ordonnances et les
            consignes de mon médecin (« Ce qu’il faut faire »), jamais le reste de mon dossier.
          </p>
          <p>
            Je peux retirer cet accord à tout moment, ici. Chaque lecture est enregistrée et je peux
            la voir. Mbolo Santé enverra un code à ce numéro par SMS ; le numéro n’est pas gardé.
          </p>
          <p>
            <small>Texte de partage, version {VERSION_PARTAGE_PROCHE}.</small>
          </p>
          <button class="principal" type="submit">
            <span aria-hidden="true">✅</span> J’accepte et j’envoie le code
          </button>
          <button type="button" onClick={() => setFormulaire(false)}>
            Annuler
          </button>
        </form>
      ) : (
        actifs.length < PROCHES_MAX && (
          <button
            onClick={() => {
              setInvite(undefined);
              setErreur(undefined);
              setPrenom('');
              setFormulaire(true);
            }}
          >
            <span aria-hidden="true">➕</span> Inviter un proche
          </button>
        )
      )}
    </>
  );
}
