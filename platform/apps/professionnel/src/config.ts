// Configuration publique (aucun secret : l'application est un client public, PKCE obligatoire).
// Le Gabon est le premier pays : tout ce qui dépend du pays (fuseau, langue) est paramétrable au
// déploiement, sans modifier le code (VITE_FUSEAU, VITE_LANGUE).
const env = import.meta.env;
const lire = (cle: string, defaut: string): string => (env[cle] as string | undefined) ?? defaut;

export const CONFIG = {
  emetteur: lire('VITE_KEYCLOAK_ISSUER', 'http://127.0.0.1:8081/realms/mbolo'),
  client: lire('VITE_KEYCLOAK_CLIENT', 'mbolo-app-pro'),
  api: '/api/teleconsultation',
  apiConsultation: '/api/consultation',
  /** Fuseau horaire du pays déployé (IANA). */
  fuseau: lire('VITE_FUSEAU', 'Africa/Libreville'),
  /** Langue et formats (BCP 47). */
  langue: lire('VITE_LANGUE', 'fr-FR'),
};
