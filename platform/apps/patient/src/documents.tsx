// Mes comptes-rendus et mes ordonnances, en lecture seule. Chargé seulement à la demande (budget
// de l'ouverture). Le texte affiché est exactement celui écrit par le professionnel : aucune IA ne
// le résume ni ne le reformule (principe n°1). Rien n'est gardé sur le téléphone (souvent partagé) :
// sans réseau, l'écran le dit simplement. Chaque lecture est tracée dans le dossier par identite.
// Un proche désigné par le patient (C-PROCHE, flag documents.proche) voit le même écran, réduit aux
// ordonnances et à la rubrique « Ce qu'il faut faire » (filtré par le service, pas par l'écran).
import { useEffect, useState } from 'preact/hooks';
import { appelReseau, creerTraducteur, ErreurApi, quand, STATUT_RESEAU } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { frDocuments } from './textes-fr-documents.js';

const t = creerTraducteur(frDocuments, CONFIG.langue);
type Cle = keyof typeof frDocuments;

type Section = 'motif' | 'observations' | 'conclusion' | 'conduite-a-tenir';

interface CompteRendu {
  id: string;
  date: string;
  sections: Partial<Record<Section, string>>;
}

interface Ordonnance {
  numero: string;
  statut: 'active' | 'revoquee' | 'autre';
  prescriteLe: string;
  valableJusquau: string;
  lignes: {
    medicament: string;
    dose: string;
    frequence: { fois: number; periode: number; unite: string };
    dureeJours: number;
  }[];
}

interface MesDocuments {
  comptesRendus: CompteRendu[];
  ordonnances: Ordonnance[];
}

const TITRES: [Section, Cle][] = [
  ['motif', 'documents.motif'],
  ['observations', 'documents.observations'],
  ['conclusion', 'documents.conclusion'],
  ['conduite-a-tenir', 'documents.conduiteATenir'],
];

/** Fréquence par unité UCUM : « 1 fois par jour » si la période vaut 1, sinon « toutes les N jours ». */
const FREQUENCES: Partial<Record<string, readonly [Cle, Cle]>> = {
  h: ['documents.parHeure', 'documents.toutesHeures'],
  d: ['documents.parJour', 'documents.toutesJours'],
  wk: ['documents.parSemaine', 'documents.toutesSemaines'],
};

const date = (iso: string) =>
  new Intl.DateTimeFormat(CONFIG.langue, { timeZone: CONFIG.fuseau, dateStyle: 'long' }).format(
    new Date(iso),
  );

/** « 3 fois par jour », « 1 fois toutes les 4 heures »… (unités UCUM h, d, wk). */
function frequence(f: Ordonnance['lignes'][number]['frequence']): string {
  const cles = FREQUENCES[f.unite];
  if (!cles) return t('documents.fois', { fois: f.fois });
  return t(f.periode === 1 ? cles[0] : cles[1], { fois: f.fois, periode: f.periode });
}

export function Documents(p: { jeton: string; retour?: () => void; proche?: boolean }) {
  const [documents, setDocuments] = useState<MesDocuments>();
  const [erreur, setErreur] = useState<string>();

  useEffect(() => {
    appelReseau(`${CONFIG.apiConsultation}${p.proche ? '/proche/documents' : '/mes-documents'}`, {
      headers: { authorization: `Bearer ${p.jeton}` },
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = (await r.json().catch(() => ({}))) as { erreur?: string };
          throw new Error(e.erreur ?? t('documents.indisponible'));
        }
        setDocuments((await r.json()) as MesDocuments);
      })
      .catch((e: unknown) =>
        setErreur(
          // Rien n'est gardé sur le téléphone : sans réseau, rien à montrer.
          e instanceof ErreurApi && e.statut === STATUT_RESEAU
            ? t('documents.sansConnexion', { erreur: e.message })
            : e instanceof Error
              ? e.message
              : t('documents.indisponible'),
        ),
      );
  }, []);

  return (
    <section>
      <h2>
        <span aria-hidden="true">📄</span>{' '}
        {t(p.proche ? 'documents.titreProche' : 'documents.titre')}
      </h2>
      {p.proche && <p>{t('documents.partageProche')}</p>}
      {erreur ? (
        <p role="alert">{erreur}</p>
      ) : documents === undefined ? (
        <p aria-live="polite">{t('documents.chargement')}</p>
      ) : (
        <>
          <h3>
            <span aria-hidden="true">💊</span> {t('documents.ordonnances')}
          </h3>
          {documents.ordonnances.length === 0 ? (
            <p>{t('documents.aucuneOrdonnance')}</p>
          ) : (
            <ul class="liste" aria-label={t('documents.ordonnances')}>
              {documents.ordonnances.map((o) => (
                <li key={o.numero} data-ordonnance={o.numero} data-statut={o.statut}>
                  <strong>{t('documents.ordonnanceDu', { date: date(o.prescriteLe) })}</strong>
                  {o.statut === 'active' ? (
                    <p>{t('documents.valable', { date: date(o.valableJusquau) })}</p>
                  ) : (
                    <p>
                      <span aria-hidden="true">⛔</span>{' '}
                      <strong>
                        {t(
                          o.statut === 'revoquee'
                            ? 'documents.revoquee'
                            : 'documents.plusUtilisable',
                        )}
                      </strong>
                    </p>
                  )}
                  <ul>
                    {o.lignes.map((l, i) => (
                      <li key={i}>
                        <strong>{l.medicament}</strong> —{' '}
                        {t('documents.ligne', {
                          dose: l.dose,
                          frequence: frequence(l.frequence),
                          duree: t('documents.duree', { nombre: l.dureeJours }),
                        })}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <h3>
            <span aria-hidden="true">🩺</span>{' '}
            {t(p.proche ? 'documents.consignes' : 'documents.comptesRendus')}
          </h3>
          {documents.comptesRendus.length === 0 ? (
            <p>{t(p.proche ? 'documents.aucuneConsigne' : 'documents.aucunCompteRendu')}</p>
          ) : (
            <ul class="liste" aria-label={t('documents.comptesRendus')}>
              {documents.comptesRendus.map((c) => (
                <li key={c.id} data-compte-rendu={c.id}>
                  <strong>{quand(c.date, CONFIG.fuseau, CONFIG.langue)}</strong>
                  {TITRES.filter(([s]) => c.sections[s]).map(([s, titre]) => (
                    <p key={s}>
                      <em>{t('documents.rubrique', { titre: t(titre) })}</em> {c.sections[s]}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <p>
            {t('documents.prudence')} <strong>{t('documents.urgence')}</strong>
          </p>
        </>
      )}
      {p.retour && <button onClick={p.retour}>{t('documents.retour')}</button>}
    </section>
  );
}
