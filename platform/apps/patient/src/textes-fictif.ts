// Catalogue de DÉMONSTRATION, données FICTIVES (ADR-0025). Ce n'est pas une langue : chaque texte est
// du français marqué [FICTIF]. Il sert seulement à tester le choix de la langue (e2e) sans attendre les
// traducteurs ; il n'est proposé que si VITE_LANGUES le cite, jamais en production. Il est volontairement
// incomplet : un texte absent s'affiche en français, comme dans une vraie langue en cours de traduction.
import type { Traduction } from '@mbolo/client-web';
import type { fr } from './textes-fr.js';

export const fictif: Traduction<typeof fr> = {
  'accueil.presentation': '[FICTIF] Démonstration : consultez un médecin depuis votre téléphone.',
  'accueil.seConnecter': '[FICTIF] Se connecter',
  'langue.choisir': '[FICTIF] Langue',
};
