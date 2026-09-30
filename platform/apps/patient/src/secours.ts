// Numéros des secours du pays déployé (principe n°2 : en cas d'urgence, orientation immédiate).
// Aucun numéro n'est écrit dans le code : ils sont fournis au déploiement (VITE_NUMEROS_SECOURS) et
// doivent être validés par le comité médical pour chaque pays. Sans numéro valable, l'application
// affiche seulement « En cas d'urgence, appelez les secours ».

export interface NumeroSecours {
  /** Nom affiché (ex. « SAMU »). */
  nom: string;
  /** Numéro à composer : chiffres, avec « + » éventuel en tête. */
  numero: string;
}

/**
 * « Nom:numéro » séparés par des virgules → liste des numéros. Une entrée mal formée est ignorée
 * (jamais un lien d'appel vers un numéro douteux).
 */
export function numerosSecours(texte: string): NumeroSecours[] {
  return texte
    .split(',')
    .map((entree) => {
      const i = entree.lastIndexOf(':');
      const nom = entree.slice(0, i).trim();
      const numero = entree.slice(i + 1).replace(/[\s.-]/g, '');
      return { nom, numero };
    })
    .filter(
      ({ nom, numero }) => /^[\p{L}0-9' ]{1,30}$/u.test(nom) && /^\+?[0-9]{2,15}$/.test(numero),
    );
}
