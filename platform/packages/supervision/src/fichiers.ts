import { REGLES_LOKI, REGLES_PROMETHEUS } from './regles.js';
import { EN_TETE, versYaml } from './yaml.js';

/** Contenu attendu de chaque fichier de règles (chemin relatif au paquet). */
export function fichiersRegles(): Record<string, string> {
  return {
    'regles/loki.yaml': `${EN_TETE}${versYaml(REGLES_LOKI as never)}\n`,
    'regles/prometheus.yaml': `${EN_TETE}${versYaml(REGLES_PROMETHEUS as never)}\n`,
  };
}
