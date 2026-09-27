// Évaluation des feature flags pour les services. Refus par défaut : un flag inconnu, une erreur
// ou un fournisseur injoignable donnent « désactivé ».
import {
  OpenFeature,
  type Client,
  type EvaluationContext,
  type Provider,
  type ResolutionDetails,
} from '@openfeature/server-sdk';
import { CATALOGUE, type ContexteDrapeau, type NomDrapeau } from './catalogue.js';
import { FournisseurUnleash, type OptionsUnleash } from './fournisseur-unleash.js';

export interface Drapeaux {
  estActif(nom: NomDrapeau, contexte?: ContexteDrapeau): Promise<boolean>;
  fermer(): Promise<void>;
}

let compteur = 0;

async function creer(fournisseur: Provider): Promise<Drapeaux> {
  // Un domaine OpenFeature par instance : pas d'état global partagé entre services ou tests.
  compteur += 1;
  const domaine = `mbolo-${compteur}`;
  await OpenFeature.setProviderAndWait(domaine, fournisseur);
  const client: Client = OpenFeature.getClient(domaine);

  const evaluer = async (
    nom: NomDrapeau,
    contexte: EvaluationContext,
    vus: Set<NomDrapeau>,
  ): Promise<boolean> => {
    if (vus.has(nom)) return false; // dépendance circulaire : désactivé
    vus.add(nom);
    const definition = CATALOGUE[nom];
    for (const dependance of definition.dependances as readonly string[]) {
      if (!Object.hasOwn(CATALOGUE, dependance)) return false;
      if (!(await evaluer(dependance as NomDrapeau, contexte, vus))) return false;
    }
    return client.getBooleanValue(nom, false, contexte);
  };

  return {
    async estActif(nom, contexte = {}) {
      if (!Object.hasOwn(CATALOGUE, nom)) return false;
      const { sujet, ...proprietes } = contexte;
      const contexteOf: EvaluationContext = {
        ...(sujet ? { targetingKey: sujet } : {}),
        ...proprietes,
      };
      return evaluer(nom, contexteOf, new Set());
    },
    async fermer() {
      await fournisseur.onClose?.();
    },
  };
}

/** Flags servis par Unleash (recette, production). */
export function drapeauxUnleash(o: OptionsUnleash): Promise<Drapeaux> {
  return creer(new FournisseurUnleash(o));
}

/**
 * Flags fixés dans le code : tests unitaires, ou développement sans Unleash.
 * Tout flag non listé est désactivé.
 */
export function drapeauxFixes(
  actifs: Partial<Record<NomDrapeau, boolean>> = {},
): Promise<Drapeaux> {
  const resoudre = async <T>(cle: string, defaut: T): Promise<ResolutionDetails<T>> => {
    const v = (actifs as Record<string, boolean | undefined>)[cle];
    return typeof v === 'boolean' && typeof defaut === 'boolean'
      ? { value: v as T, reason: 'STATIC' }
      : { value: defaut, reason: 'DEFAULT' };
  };
  return creer({
    metadata: { name: 'mbolo-fixe' },
    runsOn: 'server',
    resolveBooleanEvaluation: resoudre,
    resolveStringEvaluation: resoudre,
    resolveNumberEvaluation: resoudre,
    resolveObjectEvaluation: resoudre,
  });
}
