// Mes comptes-rendus et mes ordonnances, en lecture seule. Chargé seulement à la demande (budget
// de l'ouverture). Le texte affiché est exactement celui écrit par le professionnel : aucune IA ne
// le résume ni ne le reformule (principe n°1). Rien n'est gardé sur le téléphone (souvent partagé) :
// sans réseau, l'écran le dit simplement. Chaque lecture est tracée dans le dossier par identite.
// Un proche désigné par le patient (C-PROCHE, flag documents.proche) voit le même écran, réduit aux
// ordonnances et à la rubrique « Ce qu'il faut faire » (filtré par le service, pas par l'écran).
import { useEffect, useState } from 'preact/hooks';
import { appelReseau, ErreurApi, quand, STATUT_RESEAU } from '@mbolo/client-web';
import { CONFIG } from './config.js';

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

const TITRES: [Section, string][] = [
  ['motif', 'Motif'],
  ['observations', 'Observations'],
  ['conclusion', 'Conclusion'],
  ['conduite-a-tenir', 'Ce qu’il faut faire'],
];

const date = (iso: string) =>
  new Intl.DateTimeFormat(CONFIG.langue, { timeZone: CONFIG.fuseau, dateStyle: 'long' }).format(
    new Date(iso),
  );

/** « 3 fois par jour », « 1 fois toutes les 4 heures »… (unités UCUM h, d, wk). */
function frequence(f: Ordonnance['lignes'][number]['frequence']): string {
  const unite = { h: ['heure', 'heures'], d: ['jour', 'jours'], wk: ['semaine', 'semaines'] }[
    f.unite
  ];
  if (!unite) return `${f.fois} fois`;
  return f.periode === 1
    ? `${f.fois} fois par ${unite[0]}`
    : `${f.fois} fois toutes les ${f.periode} ${unite[1]}`;
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
          throw new Error(e.erreur ?? 'Service indisponible. Réessayez plus tard.');
        }
        setDocuments((await r.json()) as MesDocuments);
      })
      .catch((e: unknown) =>
        setErreur(
          // Rien n'est gardé sur le téléphone : sans réseau, rien à montrer.
          e instanceof ErreurApi && e.statut === STATUT_RESEAU
            ? `${e.message} Vos documents s’affichent seulement avec une connexion.`
            : e instanceof Error
              ? e.message
              : 'Service indisponible. Réessayez plus tard.',
        ),
      );
  }, []);

  return (
    <section>
      <h2>
        <span aria-hidden="true">📄</span>{' '}
        {p.proche
          ? 'Ordonnances et consignes de votre proche'
          : 'Mes comptes-rendus et ordonnances'}
      </h2>
      {p.proche && (
        <p>
          Votre proche partage avec vous ses ordonnances et les consignes du médecin. Il peut
          retirer ce partage à tout moment.
        </p>
      )}
      {erreur ? (
        <p role="alert">{erreur}</p>
      ) : documents === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : (
        <>
          <h3>
            <span aria-hidden="true">💊</span> Ordonnances
          </h3>
          {documents.ordonnances.length === 0 ? (
            <p>Aucune ordonnance.</p>
          ) : (
            <ul class="liste" aria-label="Ordonnances">
              {documents.ordonnances.map((o) => (
                <li key={o.numero} data-ordonnance={o.numero} data-statut={o.statut}>
                  <strong>Ordonnance du {date(o.prescriteLe)}</strong>
                  {o.statut === 'active' ? (
                    <p>Valable jusqu’au {date(o.valableJusquau)}</p>
                  ) : (
                    <p>
                      <span aria-hidden="true">⛔</span>{' '}
                      <strong>
                        {o.statut === 'revoquee'
                          ? 'Annulée par le médecin : ne pas l’utiliser.'
                          : 'Ordonnance plus utilisable.'}
                      </strong>
                    </p>
                  )}
                  <ul>
                    {o.lignes.map((l, i) => (
                      <li key={i}>
                        <strong>{l.medicament}</strong> — {l.dose}, {frequence(l.frequence)},
                        pendant {l.dureeJours} jour{l.dureeJours > 1 ? 's' : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <h3>
            <span aria-hidden="true">🩺</span>{' '}
            {p.proche ? 'Consignes du médecin' : 'Comptes-rendus'}
          </h3>
          {documents.comptesRendus.length === 0 ? (
            <p>{p.proche ? 'Aucune consigne.' : 'Aucun compte-rendu.'}</p>
          ) : (
            <ul class="liste" aria-label="Comptes-rendus">
              {documents.comptesRendus.map((c) => (
                <li key={c.id} data-compte-rendu={c.id}>
                  <strong>{quand(c.date, CONFIG.fuseau, CONFIG.langue)}</strong>
                  {TITRES.filter(([s]) => c.sections[s]).map(([s, titre]) => (
                    <p key={s}>
                      <em>{titre} :</em> {c.sections[s]}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <p>
            Ne changez pas votre traitement sans l’avis d’un médecin.{' '}
            <strong>En cas d’urgence, appelez les secours.</strong>
          </p>
        </>
      )}
      {p.retour && <button onClick={p.retour}>Retour</button>}
    </section>
  );
}
