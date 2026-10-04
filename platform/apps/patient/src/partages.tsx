// « Mes partages et accès » (ADR-0009, principe n°3) : le patient partage son dossier avec le médecin
// d'un de ses rendez-vous (consentement C-PARTAGE-PRO), retire un partage à tout moment, et voit qui
// a demandé à lire son dossier, et invite ou retire ses proches (ADR-0019, « Mes proches »). Chargé
// seulement à la demande (budget de l'ouverture).
// Le consentement est donné par le patient lui-même, jamais pré-coché ni groupé.
import { useEffect, useState } from 'preact/hooks';
import {
  appelReseau,
  creerTraducteur,
  MOTIF_NIVEAU_INSUFFISANT,
  niveauDuJeton,
  useTitreAuFocus,
} from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { MesProches, type Proche } from './proches.js';
import { frPartages } from './textes-fr-partages.js';

const t = creerTraducteur(frPartages, CONFIG.langue);

/** Texte du partage avec un professionnel : BROUILLON, à valider par le juriste avant production. */
export const VERSION_PARTAGE_PRO = 'c-partage-pro-v0.1-brouillon';

interface Consentement {
  id: string;
  status: string;
  dateTime?: string;
  category?: { coding?: { code?: string }[] }[];
  provision?: { type?: string; actor?: { reference?: { reference?: string } }[] };
}

interface Acces {
  date: string;
  autorise: boolean;
  motif: string;
  roles: string[];
  urgence: boolean;
  justification?: string;
}

interface Partage {
  id: string;
  categorie: 'C-PARTAGE-PRO' | 'C-PROCHE';
  beneficiaire: string;
  depuis?: string;
}

class ErreurPartage extends Error {
  /** Refus parce que le code SMS manque ou a plus de 15 minutes (ADR-0022). */
  niveauInsuffisant = false;
}

async function appeler<T>(jeton: string, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await appelReseau(url, {
      ...init,
      headers: { authorization: `Bearer ${jeton}`, ...init.headers },
    });
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurPartage((e as Error).message);
  }
  if (!r.ok) {
    const corps = (await r.json().catch(() => ({}))) as { erreur?: string; motif?: string };
    const e = new ErreurPartage(corps.erreur ?? t('partages.indisponible'));
    e.niveauInsuffisant = r.status === 401 && corps.motif === MOTIF_NIVEAU_INSUFFISANT;
    throw e;
  }
  return (await r.json()) as T;
}

/** Partages en cours : consentements actifs, accordés, qui désignent quelqu'un. */
function partagesActifs(liste: Consentement[]): Partage[] {
  return liste.flatMap((c) => {
    const categorie = c.category?.[0]?.coding?.[0]?.code;
    const beneficiaire = c.provision?.actor?.[0]?.reference?.reference;
    if (c.status !== 'active' || c.provision?.type !== 'permit' || !beneficiaire) return [];
    if (categorie !== 'C-PARTAGE-PRO' && categorie !== 'C-PROCHE') return [];
    return [{ id: c.id, categorie, beneficiaire, ...(c.dateTime ? { depuis: c.dateTime } : {}) }];
  });
}

const date = (iso: string) =>
  new Intl.DateTimeFormat(CONFIG.langue, {
    timeZone: CONFIG.fuseau,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

/** Qui a demandé l'accès, en mots simples (le détail nominatif reste dans le dossier). */
function qui(a: Acces): string {
  if (a.roles.includes('patient')) return t('partages.vousMeme');
  if (a.roles.includes('agent-ia')) return t('partages.assistant');
  if (a.roles.includes('proche')) return t('partages.votreProche');
  if (a.roles.includes('infirmier')) return t('partages.infirmier');
  if (a.roles.includes('professionnel')) return t('partages.unProfessionnel');
  return t('partages.equipe');
}

export function Partages(p: {
  jeton: string;
  patientId: string;
  retour: () => void;
  /** Redemande le code SMS, puis rouvre cet écran (ADR-0022). */
  confirmer: () => void;
}) {
  // Partager et inviter demandent le code SMS ; retirer un accès, jamais (ADR-0022).
  const niveauSuffisant = niveauDuJeton(p.jeton) >= 2;
  const [partages, setPartages] = useState<Partage[]>();
  const [medecins, setMedecins] = useState<{ id: string; nom: string }[]>([]);
  const [historique, setHistorique] = useState<Acces[]>([]);
  const [propose, setPropose] = useState<{ id: string; nom: string }>();
  /** `null` : invitation des proches non ouverte pour ce patient (ou service indisponible). */
  const [proches, setProches] = useState<Proche[] | null>(null);
  const [message, setMessage] = useState<string>();
  useTitreAuFocus(propose ? 'partager' : 'liste');
  const patient = encodeURIComponent(p.patientId);

  const charger = async () => {
    try {
      const [c, rdv, annuaire, acces] = await Promise.all([
        appeler<{ consentements: Consentement[] }>(
          p.jeton,
          `${CONFIG.apiIdentite}/patients/${patient}/consentements`,
        ),
        appeler<{ rendezVous: { praticienId: string; statut: string }[] }>(
          p.jeton,
          `${CONFIG.api}/rendez-vous`,
        ),
        appeler<{ praticiens: { id: string; nom: string }[] }>(p.jeton, `${CONFIG.api}/praticiens`),
        appeler<{ acces: Acces[] }>(p.jeton, `${CONFIG.apiIdentite}/patients/${patient}/acces`),
      ]);
      const noms = new Map(annuaire.praticiens.map((x) => [x.id, x.nom]));
      // Médecins de mes rendez-vous à venir : ceux avec qui partager a un sens.
      const ids = [
        ...new Set(rdv.rendezVous.filter((r) => r.statut !== 'annule').map((r) => r.praticienId)),
      ];
      setMedecins(ids.map((id) => ({ id, nom: noms.get(id) ?? t('partages.votreMedecin') })));
      setPartages(partagesActifs(c.consentements));
      setHistorique([...acces.acces].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20));
      // Fonction fermée (403) ou indisponible : la section « Mes proches » n'apparaît pas.
      setProches(
        await appeler<{ proches: Proche[] }>(p.jeton, `${CONFIG.apiInvitations}/proches`)
          .then((r) => r.proches)
          .catch(() => null),
      );
    } catch (e) {
      setMessage(e instanceof ErreurPartage ? e.message : t('partages.indisponibleCourt'));
    }
  };
  useEffect(() => void charger(), []);

  const nomDe = (reference: string) => {
    const id = reference.replace(/^Practitioner\//, '');
    if (reference.startsWith('RelatedPerson/')) {
      const fiche = reference.slice('RelatedPerson/'.length);
      const proche = proches?.find((x) => x.relatedPersonId === fiche)?.prenom;
      return proche ? t('partages.prenomProche', { prenom: proche }) : t('partages.votreProche');
    }
    return medecins.find((m) => m.id === id)?.nom ?? t('partages.unProfessionnel');
  };

  const partager = async (m: { id: string; nom: string }) => {
    setMessage(undefined);
    try {
      await appeler(p.jeton, `${CONFIG.apiIdentite}/patients/${patient}/consentements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categorie: 'C-PARTAGE-PRO',
          mode: 'texte',
          versionTexte: VERSION_PARTAGE_PRO,
          accepte: true,
          beneficiaire: `Practitioner/${m.id}`,
        }),
      });
      setPropose(undefined);
      setMessage(t('partages.partage', { nom: m.nom }));
      await charger();
    } catch (e) {
      if (e instanceof ErreurPartage && e.niveauInsuffisant) return p.confirmer();
      setMessage(e instanceof ErreurPartage ? e.message : t('partages.indisponibleCourt'));
    }
  };

  const retirer = async (x: Partage) => {
    setMessage(undefined);
    try {
      await appeler(
        p.jeton,
        `${CONFIG.apiIdentite}/consentements/${encodeURIComponent(x.id)}/revocation`,
        {
          method: 'POST',
        },
      );
      setMessage(t('partages.retire'));
      await charger();
    } catch (e) {
      setMessage(e instanceof ErreurPartage ? e.message : t('partages.indisponibleCourt'));
    }
  };

  if (propose) {
    // Le nom du médecin est en gras dans la phrase de l'accord, qui reste entière pour la traduction.
    const [avantNom = '', apresNom = ''] = t('partages.accord', { nom: '\u0000' }).split('\u0000');
    return (
      <section>
        <h2>
          <span aria-hidden="true">🔒</span> {t('partages.partagerTitre')}
        </h2>
        <p>
          {avantNom}
          <strong>{propose.nom}</strong>
          {apresNom}
        </p>
        <p>{t('partages.accordRetrait')}</p>
        <p>
          <small>{t('partages.version', { version: VERSION_PARTAGE_PRO })}</small>
        </p>
        <button class="principal" onClick={() => void partager(propose)}>
          <span aria-hidden="true">✅</span> {t('partages.jAccepte')}
        </button>
        <button onClick={() => setPropose(undefined)}>{t('partages.pasMaintenant')}</button>
      </section>
    );
  }

  const aPartager = medecins.filter(
    (m) => !partages?.some((x) => x.beneficiaire === `Practitioner/${m.id}`),
  );
  return (
    <section>
      <h2>
        <span aria-hidden="true">🔒</span> {t('partages.titre')}
      </h2>
      {message && (
        <p class="message" role="status">
          {message}
        </p>
      )}
      {partages === undefined ? (
        <p aria-live="polite">{t('partages.chargement')}</p>
      ) : (
        <>
          <h3>{t('partages.quiPeutLire')}</h3>
          {partages.length === 0 ? (
            <p>{t('partages.personne')}</p>
          ) : (
            <ul class="liste" aria-label={t('partages.enCours')}>
              {partages.map((x) => (
                <li key={x.id} data-partage={x.beneficiaire}>
                  <strong>{nomDe(x.beneficiaire)}</strong>
                  {x.depuis && <span> {t('partages.depuis', { date: date(x.depuis) })}</span>}
                  <div class="actions">
                    <button onClick={() => void retirer(x)}>{t('partages.retirer')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {aPartager.map((m) => (
            <button
              key={m.id}
              data-partager={m.id}
              onClick={() => (niveauSuffisant ? setPropose(m) : p.confirmer())}
            >
              <span aria-hidden="true">🤝</span> {t('partages.partagerAvec', { nom: m.nom })}
            </button>
          ))}
          <MesProches
            jeton={p.jeton}
            proches={proches}
            recharger={charger}
            niveauSuffisant={niveauSuffisant}
            confirmer={p.confirmer}
          />
          <h3>{t('partages.quiADemande')}</h3>
          {historique.length === 0 ? (
            <p>{t('partages.personnePourLeMoment')}</p>
          ) : (
            <ul class="liste" aria-label={t('partages.historique')}>
              {historique.map((a, i) => (
                <li key={i} data-acces={a.autorise ? 'accorde' : 'refuse'}>
                  <strong>{date(a.date)}</strong> {t('partages.ligneAcces', { qui: qui(a) })}{' '}
                  {t(a.autorise ? 'partages.accorde' : 'partages.refuse')}
                  {a.urgence && (
                    <p>
                      <span aria-hidden="true">🚨</span>{' '}
                      {a.justification
                        ? t('partages.urgenceMotif', { motif: a.justification })
                        : t('partages.urgence')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button onClick={p.retour}>{t('partages.retour')}</button>
    </section>
  );
}
