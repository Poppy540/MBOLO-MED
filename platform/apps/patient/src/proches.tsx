// « Mes proches » (ADR-0019), dans « Mes partages et accès » : le patient invite un proche (prénom,
// lien, numéro au format international), après avoir lu le texte de partage C-PROCHE ; le code part
// par SMS et s'affiche aussi, en secours. Le patient retire un proche à tout moment.
// Le numéro n'est jamais gardé, ni ici ni sur le serveur.
import { useState } from 'preact/hooks';
import { appelReseau, creerTraducteur, MOTIF_NIVEAU_INSUFFISANT, Picto } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { frProches } from './textes-fr-proches.js';
import { numeroInternational } from './telephone.js';

const t = creerTraducteur(frProches, CONFIG.langue);

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

/** Liens proposés (codes v3-RoleCode du dossier) et leur libellé. */
export const LIENS: [string, keyof typeof frProches][] = [
  ['CHILD', 'proches.lienEnfant'],
  ['SPS', 'proches.lienConjoint'],
  ['SIB', 'proches.lienFrereSoeur'],
  ['PRN', 'proches.lienParent'],
  ['FAMMEMB', 'proches.lienFamille'],
  ['FRND', 'proches.lienAmi'],
];

const libelleLien = (code: string) => {
  const cle = LIENS.find(([c]) => c === code)?.[1];
  return cle ? t(cle) : undefined;
};

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
  /** Niveau 2 (code SMS de moins de 15 minutes), exigé pour inviter (ADR-0022). */
  niveauSuffisant: boolean;
  /** Redemande le code SMS, puis rouvre « Mes partages et accès ». */
  confirmer: () => void;
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
    if (!nom) return setErreur(t('proches.prenomManquant'));
    if (!telephone) {
      return setErreur(t('proches.numeroInternational', { indicatif: CONFIG.indicatif }));
    }
    setErreur(undefined);
    try {
      const r = await appelReseau(`${CONFIG.apiInvitations}/proches`, {
        method: 'POST',
        headers: { authorization: `Bearer ${p.jeton}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          prenom: nom,
          lien: String(donnees.get('lien') ?? ''),
          telephone,
          versionTexte: VERSION_PARTAGE_PROCHE,
        }),
      });
      const corps = (await r.json().catch(() => ({}))) as Partial<Invite> & {
        erreur?: string;
        motif?: string;
      };
      if (r.status === 401 && corps.motif === MOTIF_NIVEAU_INSUFFISANT) {
        f.reset();
        return p.confirmer();
      }
      if (!r.ok) return setErreur(corps.erreur ?? t('proches.indisponible'));
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
    } catch (e) {
      // Réseau coupé ou trop lent : message simple d'`appelReseau`.
      setErreur((e as Error).message);
    }
  };

  const retirer = async (x: Proche) => {
    setErreur(undefined);
    setInvite(undefined);
    try {
      const r = await appelReseau(
        `${CONFIG.apiInvitations}/proches/${encodeURIComponent(x.id)}/revocation`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${p.jeton}` },
        },
      );
      if (!r.ok) {
        const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
        return setErreur(corps.erreur ?? t('proches.indisponible'));
      }
      await p.recharger();
    } catch (e) {
      // Réseau coupé ou trop lent : message simple d'`appelReseau`.
      setErreur((e as Error).message);
    }
  };

  // Le prénom est en gras dans la phrase de l'accord, qui reste entière pour la traduction.
  const [avantPrenom = '', apresPrenom = ''] = t('proches.accord', { prenom: '\u0000' }).split(
    '\u0000',
  );

  return (
    <>
      <h3>
        <Picto nom="proche" /> {t('proches.titre')}
      </h3>
      <p>{t('proches.explication')}</p>
      {erreur && (
        <p class="message" role="alert">
          {erreur}
        </p>
      )}
      {invite && (
        <div class="message" data-code={invite.code}>
          <p>
            {invite.sms === 'envoyee'
              ? t('proches.smsEnvoye', { prenom: invite.prenom })
              : t('proches.smsEchec')}{' '}
            {t('proches.secours')}
          </p>
          <p>
            <strong>{invite.code}</strong>{' '}
            {t('proches.codeValable', { date: jour(invite.expireLe) })}
          </p>
        </div>
      )}
      {actifs.length > 0 && (
        <ul class="liste" aria-label={t('proches.liste')}>
          {actifs.map((x) => (
            <li key={x.id} data-proche={x.id} data-statut={x.statut}>
              <strong>{x.prenom}</strong>
              {x.lien && <span> — {libelleLien(x.lien)}</span>}
              <p>
                {x.statut === 'utilise'
                  ? t('proches.compteCree')
                  : t('proches.invitationEnvoyee', { date: jour(x.expireLe) })}
              </p>
              <div class="actions">
                <button onClick={() => void retirer(x)}>{t('proches.retirer')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {formulaire ? (
        <form onSubmit={(e) => void envoyer(e)} aria-label={t('proches.inviter')}>
          <label for="prenom-proche">{t('proches.prenom')}</label>
          <input
            id="prenom-proche"
            name="prenom"
            maxLength={60}
            autocomplete="off"
            onInput={(e) => setPrenom((e.target as HTMLInputElement).value.trim())}
          />
          <label for="lien-proche">{t('proches.quiEstCe')}</label>
          <select id="lien-proche" name="lien" defaultValue="CHILD">
            {LIENS.map(([code, libelle]) => (
              <option key={code} value={code}>
                {t(libelle)}
              </option>
            ))}
          </select>
          <label for="telephone-proche">{t('proches.telephone')}</label>
          <input
            id="telephone-proche"
            name="telephone"
            type="tel"
            inputMode="tel"
            autocomplete="off"
            placeholder={`+${CONFIG.indicatif} …`}
          />
          <p>
            {avantPrenom}
            <strong>{prenom || t('proches.monProche')}</strong>
            {apresPrenom}
          </p>
          <p>{t('proches.accordRetrait')}</p>
          <p>
            <small>{t('proches.version', { version: VERSION_PARTAGE_PROCHE })}</small>
          </p>
          <button class="principal" type="submit">
            <span aria-hidden="true">✅</span> {t('proches.accepterEtEnvoyer')}
          </button>
          <button type="button" onClick={() => setFormulaire(false)}>
            {t('proches.annuler')}
          </button>
        </form>
      ) : (
        actifs.length < PROCHES_MAX && (
          <button
            onClick={() => {
              if (!p.niveauSuffisant) return p.confirmer();
              setInvite(undefined);
              setErreur(undefined);
              setPrenom('');
              setFormulaire(true);
            }}
          >
            <span aria-hidden="true">➕</span> {t('proches.inviter')}
          </button>
        )
      )}
    </>
  );
}
